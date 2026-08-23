(function(){
  function sj(id){ return document.getElementById(id); }
  var LIST_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/listRounds";
  var DELETE_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/deleteRound";
  var UPDATE_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/updateRound";
  var cachedRounds = [];
  var editState = null;

  function tt(key, fallback){
    return (typeof t === "function") ? t(key) : fallback;
  }

  function extractYear(roundDate){
    if(!roundDate) return null;
    var m = String(roundDate).match(/^(\d{4})/);
    return m ? m[1] : null;
  }

  function populateYearFilter(){
    var sel = sj("sjLoadYearFilter");
    if(!sel) return;
    var years = [];
    cachedRounds.forEach(function(r){
      var y = extractYear(r.roundDate);
      if(y && years.indexOf(y) === -1) years.push(y);
    });
    years.sort().reverse();
    var prev = sel.value;
    sel.innerHTML = '<option value="">' + tt("loadYearAll", "전체 연도") + '</option>' +
      years.map(function(y){ return '<option value="'+y+'">'+y+'</option>'; }).join("");
    if(years.indexOf(prev) !== -1){ sel.value = prev; }
  }

  /* Returns [{r, idx}] -- idx is the index into cachedRounds so a click on
     a filtered row can still resolve back to the original round object. */
  function getFilteredEntries(){
    var courseQuery = ((sj("sjLoadCourseFilter") && sj("sjLoadCourseFilter").value) || "").trim().toLowerCase();
    var yearQuery = (sj("sjLoadYearFilter") && sj("sjLoadYearFilter").value) || "";
    return cachedRounds.map(function(r, idx){ return { r: r, idx: idx }; }).filter(function(entry){
      var r = entry.r;
      if(courseQuery){
        var name = (r.courseName || "").toLowerCase();
        if(name.indexOf(courseQuery) === -1) return false;
      }
      if(yearQuery){
        if(extractYear(r.roundDate) !== yearQuery) return false;
      }
      return true;
    });
  }

  function renderList(){
    var listEl = sj("sjLoadList");
    var statusEl = sj("sjLoadStatus");
    if(!listEl) return;
    if(!cachedRounds.length){
      listEl.innerHTML = "";
      if(statusEl){
        statusEl.className = "sj-status";
        statusEl.textContent = tt("loadEmpty", "저장된 라운드가 없습니다");
      }
      return;
    }
    var entries = getFilteredEntries();
    if(!entries.length){
      listEl.innerHTML = "";
      if(statusEl){
        statusEl.className = "sj-status";
        statusEl.textContent = tt("loadNoMatch", "검색 결과가 없습니다");
      }
      return;
    }
    if(statusEl){ statusEl.textContent = ""; }
    listEl.innerHTML = entries.map(function(entry){
      var r = entry.r;
      var course = r.courseName ? escapeHtml(r.courseName) : tt("loadNoCourseName", "골프장 미입력");
      if(r.courseSub){ course += " (" + escapeHtml(r.courseSub) + ")"; }
      var titleLine = course + (r.teamName ? ' · ' + escapeHtml(r.teamName) : '');
      var date = r.roundDate ? escapeHtml(r.roundDate) : tt("loadNoDate", "날짜 미입력");
      var playersLine = (r.players || []).map(function(p){
        return escapeHtml(p.name || "") + " " + p.totalScore + "(" + signedLabel(p.scoreToPar) + ")";
      }).join(" · ");
      return '<div class="sj-load-item" data-idx="'+entry.idx+'" style="position:relative;border:1px solid #e5e7eb;border-radius:10px;padding:10px 76px 10px 12px;margin-bottom:8px;cursor:pointer;">' +
        '<button type="button" class="sj-load-edit" data-idx="'+entry.idx+'" title="수정" ' +
          'style="position:absolute;top:8px;right:40px;width:26px;height:26px;line-height:1;border:none;border-radius:8px;background:#e6f2ea;color:#1b6b3c;font-size:13px;cursor:pointer;">✏</button>' +
        '<button type="button" class="sj-load-delete" data-idx="'+entry.idx+'" title="삭제" ' +
          'style="position:absolute;top:8px;right:8px;width:26px;height:26px;line-height:1;border:none;border-radius:8px;background:#fee2e2;color:#b91c1c;font-size:14px;cursor:pointer;">×</button>' +
        '<div style="font-weight:600;font-size:14px;color:#1f2b24;">' + titleLine + '</div>' +
        '<div style="font-size:12px;color:#666;margin-top:2px;">' + date + '</div>' +
        (playersLine ? '<div style="font-size:12px;color:#1b6b3c;margin-top:4px;">' + playersLine + '</div>' : '') +
        '</div>';
    }).join("");
  }

  /* Restores a saved round's FULL data (course/hole setup + every
     player's name and complete hole-by-hole scores) back onto team 0,
     exactly as it was at save time -- not a partial/summary merge.
     Writes directly to the shared `state` global (same one state.js /
     app.js use) rather than going through hydrateFromOCR, since OCR's
     merge-only-if-present semantics don't fit a full restore. */
  function applyRoundToState(r){
    if(typeof state === "undefined" || !state) return;
    if(r.holeCount === 9 || r.holeCount === 18){
      state.holeCount = r.holeCount;
      if(typeof normalize === "function") normalize();
    }
    state.courseName = r.courseName || "";
    state.courseSub = r.courseSub || "";
    if(r.roundDate) state.playDate = r.roundDate;
    state.teeOffTime = r.teeOffTime || "";

    var holesIn = r.holes || [];
    for(var hi = 0; hi < state.holeCount; hi++){
      if(holesIn[hi]){
        if(typeof holesIn[hi].par === "number"){ state.holes[hi].par = holesIn[hi].par; }
        state.holes[hi].note = holesIn[hi].note || "";
      }
    }

    if(!state.teams[0]){
      state.teams[0] = { id: state.nextTeamId++, name: "Team 1", players: [], scores: [], entered: [], anonymize: [] };
      if(typeof normalize === "function") normalize();
    }
    var team = state.teams[0];
    team.name = r.teamName || team.name;
    var playersIn = r.players || [];
    for(var pi = 0; pi < team.players.length; pi++){
      var p = playersIn[pi];
      if(!p) continue;
      team.players[pi] = p.name || team.players[pi];
      var scArr = [], entArr = [];
      for(var h = 0; h < state.holeCount; h++){
        var sc = (p.holeScores && p.holeScores[h]);
        scArr.push(typeof sc === "number" ? sc : 0);
        entArr.push(!!(p.entered && p.entered[h]));
      }
      team.scores[pi] = scArr;
      team.entered[pi] = entArr;
    }
    var selfIdx = playersIn.findIndex(function(p){ return p && p.isSelf; });
    team.selfIndex = (selfIdx !== -1) ? selfIdx : 0;

    if(typeof save === "function") save();
    if(typeof renderAll === "function") renderAll();
  }

  /* ---------------- 저장된 라운드 수정 (스코어 + My) ---------------- */

  function computeEditTotals(pi){
    var p = editState.players[pi];
    var total = 0, toPar = 0;
    for(var hi = 0; hi < editState.holeCount; hi++){
      var rel = p.holeScores[hi] || 0;
      var par = (editState.holes[hi] && editState.holes[hi].par) || 4;
      total += par + rel;
      toPar += rel;
    }
    return { total: total, toPar: toPar };
  }

  function renderEditBody(){
    var container = sj("sjEditRoundBody");
    if(!container || !editState) return;
    var courseLine = (editState.courseName || tt("loadNoCourseName", "골프장 미입력")) +
      (editState.courseSub ? " (" + escapeHtml(editState.courseSub) + ")" : "");
    var dateLine = editState.roundDate || tt("loadNoDate", "날짜 미입력");
    var html = '<div class="sj-edit-meta">' + escapeHtml(courseLine) + " · " + escapeHtml(dateLine) + "</div>";
    html += '<p class="sj-edit-hint">My를 눌러 본인 스코어를 지정하고, 홀별 +/- 버튼으로 스코어를 수정한 뒤 아래 "수정 저장"을 눌러주세요.</p>';
    editState.players.forEach(function(p, pi){
      var totals = computeEditTotals(pi);
      html += '<div class="sj-edit-player">';
      html += '<div class="sj-edit-player-head">';
      html += '<label class="sj-edit-my-label"><input type="radio" name="sjEditSelf" class="sj-edit-self-radio" data-player="' + pi + '"' + (p.isSelf ? " checked" : "") + '> <span>My</span></label>';
      html += '<span class="sj-edit-player-name">' + escapeHtml(p.name || ("Player" + (pi + 1))) + '</span>';
      html += '<span class="sj-edit-player-total" id="sjEditTotal_' + pi + '">' + totals.total + " (" + signedLabel(totals.toPar) + ")</span>";
      html += '</div>';
      html += '<div class="sj-edit-holes-wrap"><div class="sj-edit-holes">';
      for(var hi = 0; hi < editState.holeCount; hi++){
        var par = (editState.holes[hi] && editState.holes[hi].par) || 4;
        var rel = p.holeScores[hi] || 0;
        html += '<div class="sj-edit-hole-cell">';
        html += '<div class="sj-edit-hole-label">' + (hi + 1) + "H<br>P" + par + "</div>";
        html += '<div class="sj-edit-counter">';
        html += '<button type="button" class="sj-edit-step" data-action="minus" data-player="' + pi + '" data-hole="' + hi + '">−</button>';
        html += '<span class="sj-edit-val" id="sjEditVal_' + pi + "_" + hi + '">' + signedLabel(rel) + "</span>";
        html += '<button type="button" class="sj-edit-step" data-action="plus" data-player="' + pi + '" data-hole="' + hi + '">+</button>';
        html += '</div></div>';
      }
      html += '</div></div>';
      html += '</div>';
    });
    container.innerHTML = html;
  }

  function openEditModal(idx){
    var r = cachedRounds[idx];
    if(!r) return;
    editState = {
      idx: idx,
      roundId: r.id,
      courseName: r.courseName || "",
      courseSub: r.courseSub || "",
      teeOffTime: r.teeOffTime || "",
      roundDate: r.roundDate || "",
      teamName: r.teamName || "",
      holeCount: (r.holeCount === 9 || r.holeCount === 18) ? r.holeCount : 18,
      holes: (r.holes || []).map(function(h){ return { par: h.par, note: h.note || "" }; }),
      players: (r.players || []).map(function(p){
        return {
          name: p.name || "",
          isSelf: !!p.isSelf,
          holeScores: (p.holeScores || []).slice(),
          entered: (p.entered || []).slice()
        };
      })
    };
    /* 레거시 데이터(모두 isSelf 없음) 보정: 첫 번째 플레이어를 기본 My로 */
    if(editState.players.length && !editState.players.some(function(p){ return p.isSelf; })){
      editState.players[0].isSelf = true;
    }
    var status = sj("sjEditRoundStatus");
    if(status){ status.className = "sj-status"; status.textContent = ""; }
    renderEditBody();
    var modal = sj("sjEditRoundModal");
    if(modal) modal.classList.add("open");
  }

  function bindEditBodyEvents(){
    var container = sj("sjEditRoundBody");
    if(!container) return;
    container.addEventListener("click", function(e){
      var btn = e.target.closest(".sj-edit-step");
      if(!btn || !editState) return;
      var pi = parseInt(btn.dataset.player, 10);
      var hi = parseInt(btn.dataset.hole, 10);
      var p = editState.players[pi];
      if(!p) return;
      var delta = (btn.dataset.action === "plus") ? 1 : -1;
      var cur = p.holeScores[hi] || 0;
      var next = Math.max(-10, Math.min(20, cur + delta));
      p.holeScores[hi] = next;
      p.entered[hi] = true;
      var valEl = sj("sjEditVal_" + pi + "_" + hi);
      if(valEl){ valEl.textContent = signedLabel(next); }
      var totals = computeEditTotals(pi);
      var totalEl = sj("sjEditTotal_" + pi);
      if(totalEl){ totalEl.textContent = totals.total + " (" + signedLabel(totals.toPar) + ")"; }
    });
    container.addEventListener("change", function(e){
      var el = e.target;
      if(el.classList.contains("sj-edit-self-radio") && editState){
        var pi = parseInt(el.dataset.player, 10);
        editState.players.forEach(function(p, i){ p.isSelf = (i === pi); });
      }
    });
  }

  function bindEditSave(){
    var btn = sj("sjEditRoundSaveBtn");
    if(!btn) return;
    btn.addEventListener("click", function(){
      if(!editState) return;
      var status = sj("sjEditRoundStatus");
      var currentUser = window.__sjAuth && window.__sjAuth.getCurrentUser();
      if(!currentUser){
        if(status){ status.className = "sj-status error"; status.textContent = "로그인이 필요합니다."; }
        return;
      }
      if(status){ status.className = "sj-status"; status.textContent = "저장 중..."; }
      var holes = editState.holes.slice(0, editState.holeCount).map(function(h){
        return { par: h.par, note: h.note || "" };
      });
      var players = editState.players.map(function(p){
        return {
          name: p.name,
          isSelf: !!p.isSelf,
          holeScores: (p.holeScores || []).slice(0, editState.holeCount),
          entered: (p.entered || []).slice(0, editState.holeCount)
        };
      });
      currentUser.getIdToken().then(function(idToken){
        return fetch(UPDATE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
          body: JSON.stringify({
            id: editState.roundId,
            courseName: editState.courseName || "",
            courseSub: editState.courseSub || null,
            teeOffTime: editState.teeOffTime || null,
            roundDate: editState.roundDate || null,
            holeCount: editState.holeCount,
            holes: holes,
            teamName: editState.teamName || "",
            players: players
          })
        });
      }).then(function(res){ return res.json(); })
        .then(function(data){
          if(data && data.error){ throw new Error(data.error); }
          if(status){ status.textContent = "수정 완료되었습니다"; }
          if(typeof toast === "function"){ toast("수정되었습니다"); }
          var modal = sj("sjEditRoundModal");
          if(modal) modal.classList.remove("open");
          editState = null;
          /* 목록/통계 전체를 서버 기준으로 다시 불러와서, 통계 패널을 다시 열었을 때
             수정된 스코어가 정확히 반영되도록 한다. */
          onOpen();
        })
        .catch(function(e){
          if(status){ status.className = "sj-status error"; status.textContent = "수정 실패: " + (e && e.message ? e.message : e); }
        });
    });
  }

  /* ---------------- 내 스코어 통계 ---------------- */

  /* Which saved player counts as "me" for a round. Prefers the explicit
     isSelf flag (set via the OCR review 화면's My radio, or defaulted to
     player 0 at save time) -- but rounds saved before that flag existed
     have no isSelf on ANY player, so fall back to treating the first
     player as me, per an explicit product decision: legacy data should
     never just be silently excluded from the stats. */
  function getMyPlayer(round){
    var players = round.players || [];
    var mine = players.filter(function(p){ return p && p.isSelf; })[0];
    if(!mine) mine = players[0];
    return mine || null;
  }

  var STATS_SEGMENTS = [
    { key: "under", label: "버디 이상", color: "#0e7490" },
    { key: "par", label: "파", color: "#1b6b3c" },
    { key: "bogey", label: "보기", color: "#e8a33d" },
    { key: "double", label: "더블보기 이상", color: "#c0392b" }
  ];

  function buildDonut(counts){
    var total = STATS_SEGMENTS.reduce(function(sum, seg){ return sum + (counts[seg.key] || 0); }, 0);
    if(!total){
      return { gradient: "#e5e7eb", segments: STATS_SEGMENTS.map(function(seg){
        return { label: seg.label, color: seg.color, count: 0, pct: 0 };
      }) };
    }
    var acc = 0;
    var stops = STATS_SEGMENTS.map(function(seg){
      var v = counts[seg.key] || 0;
      var start = (acc / total) * 360;
      acc += v;
      var end = (acc / total) * 360;
      return seg.color + " " + start.toFixed(1) + "deg " + end.toFixed(1) + "deg";
    });
    var segments = STATS_SEGMENTS.map(function(seg){
      var v = counts[seg.key] || 0;
      return { label: seg.label, color: seg.color, count: v, pct: Math.round((v / total) * 100) };
    });
    return { gradient: "conic-gradient(" + stops.join(",") + ")", segments: segments };
  }

  var currentStatsRange = 10;

  function renderStatsPanel(range){
    if(range !== undefined) currentStatsRange = range;
    var panel = sj("sjMyStatsPanel");
    if(!panel) return;

    var withMe = cachedRounds.map(function(r){ return { r: r, p: getMyPlayer(r) }; })
      .filter(function(x){ return x.p; });

    if(!withMe.length){
      panel.innerHTML = '<div class="sj-stats-empty">통계를 낼 저장된 라운드가 없습니다.</div>';
      return;
    }

    var pool = (currentStatsRange === "all") ? withMe : withMe.slice(0, currentStatsRange);
    var scores = pool.map(function(x){ return x.p.totalScore; }).filter(function(v){ return typeof v === "number"; });
    var toPars = pool.map(function(x){ return x.p.scoreToPar; }).filter(function(v){ return typeof v === "number"; });
    var avgScore = scores.length ? (scores.reduce(function(a,b){ return a+b; },0) / scores.length) : 0;
    var bestScore = scores.length ? Math.min.apply(null, scores) : 0;
    var avgToPar = toPars.length ? (toPars.reduce(function(a,b){ return a+b; },0) / toPars.length) : 0;
    var recent = withMe[0].p;

    var counts = { under: 0, par: 0, bogey: 0, double: 0 };
    pool.forEach(function(x){
      var bd = x.p.scoreBreakdown || {};
      counts.under += (bd.eagle || 0) + (bd.birdie || 0);
      counts.par += bd.par || 0;
      counts.bogey += bd.bogey || 0;
      counts.double += bd.doubleOrWorse || 0;
    });
    var donut = buildDonut(counts);

    var tabs = ["10", "20", "all"].map(function(r){
      var label = (r === "all") ? "전체" : ("최근 " + r + "회");
      var active = (String(currentStatsRange) === r) ? " active" : "";
      return '<button type="button" data-range="' + r + '" class="' + active.trim() + '">' + label + "</button>";
    }).join("");

    panel.innerHTML =
      '<div class="sj-stats-tabs">' + tabs + "</div>" +
      '<div class="sj-stats-tiles">' +
        '<div class="sj-stat-tile"><div class="sj-stat-label">총 라운드</div><div class="sj-stat-value">' + withMe.length + "</div></div>" +
        '<div class="sj-stat-tile"><div class="sj-stat-label">최근 스코어</div><div class="sj-stat-value">' + recent.totalScore + "</div></div>" +
        '<div class="sj-stat-tile"><div class="sj-stat-label">평균 스코어</div><div class="sj-stat-value">' + avgScore.toFixed(1) + "</div></div>" +
        '<div class="sj-stat-tile"><div class="sj-stat-label">베스트 스코어</div><div class="sj-stat-value">' + bestScore + "</div></div>" +
        '<div class="sj-stat-tile" style="grid-column:1 / -1;"><div class="sj-stat-label">평균 오버파</div><div class="sj-stat-value">' + signedLabel(Math.round(avgToPar * 10) / 10) + "</div></div>" +
      "</div>" +
      '<div class="sj-stats-donut-wrap">' +
        '<div class="sj-stats-donut" style="background:' + donut.gradient + ';"></div>' +
        '<div class="sj-stats-legend">' +
          donut.segments.map(function(seg){
            return '<div class="sj-stats-legend-row"><span class="sj-stats-legend-dot" style="background:' + seg.color + ';"></span>' +
              seg.label + " " + seg.pct + "% (" + seg.count + ")</div>";
          }).join("") +
        "</div>" +
      "</div>";

    Array.prototype.forEach.call(panel.querySelectorAll(".sj-stats-tabs button"), function(btn){
      btn.addEventListener("click", function(){
        var r = (btn.dataset.range === "all") ? "all" : parseInt(btn.dataset.range, 10);
        renderStatsPanel(r);
      });
    });
  }

  function bindStatsBtn(){
    var btn = sj("sjMyStatsBtn");
    var panel = sj("sjMyStatsPanel");
    if(!btn || !panel) return;
    btn.addEventListener("click", function(){
      var showing = panel.style.display !== "none";
      if(showing){
        panel.style.display = "none";
      } else {
        renderStatsPanel();
        panel.style.display = "";
      }
    });
  }

  function handleDelete(idx){
    var r = cachedRounds[idx];
    if(!r) return;
    var label = (r.courseName ? r.courseName : tt("loadNoCourseName", "골프장 미입력")) +
      (r.roundDate ? " (" + r.roundDate + ")" : "");
    if(!confirm('"' + label + '" 라운드를 삭제할까요? 되돌릴 수 없습니다.')) return;
    var currentUser = window.__sjAuth && window.__sjAuth.getCurrentUser();
    if(!currentUser){
      alert("로그인이 필요합니다.");
      return;
    }
    currentUser.getIdToken().then(function(idToken){
      return fetch(DELETE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
        body: JSON.stringify({ id: r.id })
      });
    }).then(function(res){ return res.json(); })
      .then(function(data){
        if(data && data.error){ throw new Error(data.error); }
        cachedRounds.splice(idx, 1);
        populateYearFilter();
        renderList();
        if(typeof toast === "function"){ toast("삭제되었습니다"); }
      })
      .catch(function(e){
        alert("삭제 실패: " + (e && e.message ? e.message : e));
      });
  }

  function bindListClick(){
    var listEl = sj("sjLoadList");
    if(!listEl) return;
    listEl.addEventListener("click", function(e){
      var delBtn = e.target.closest(".sj-load-delete");
      if(delBtn){
        handleDelete(parseInt(delBtn.dataset.idx, 10));
        return;
      }
      var editBtn = e.target.closest(".sj-load-edit");
      if(editBtn){
        openEditModal(parseInt(editBtn.dataset.idx, 10));
        return;
      }
      var item = e.target.closest(".sj-load-item");
      if(!item) return;
      var idx = parseInt(item.dataset.idx, 10);
      var r = cachedRounds[idx];
      if(!r) return;
      applyRoundToState(r);
      var resultTabBtn = sj("tabResultBtn");
      if(resultTabBtn) resultTabBtn.click();
      var modal = sj("sjLoadModal");
      if(modal) modal.classList.remove("open");
      if(typeof toast === "function"){ toast(tt("loadApplied", "라운드를 불러왔습니다")); }
    });
  }

  function bindFilters(){
    var courseInput = sj("sjLoadCourseFilter");
    var yearSelect = sj("sjLoadYearFilter");
    if(courseInput){ courseInput.addEventListener("input", renderList); }
    if(yearSelect){ yearSelect.addEventListener("change", renderList); }
  }

  function onOpen(){
    var statusEl = sj("sjLoadStatus");
    var listEl = sj("sjLoadList");
    var courseInput = sj("sjLoadCourseFilter");
    var yearSelect = sj("sjLoadYearFilter");
    var statsPanel = sj("sjMyStatsPanel");
    if(statsPanel){ statsPanel.style.display = "none"; statsPanel.innerHTML = ""; }
    if(courseInput) courseInput.value = "";
    if(yearSelect) yearSelect.value = "";
    if(listEl) listEl.innerHTML = "";
    if(statusEl){ statusEl.className = "sj-status"; statusEl.textContent = "불러오는 중..."; }
    var currentUser = window.__sjAuth && window.__sjAuth.getCurrentUser();
    if(!currentUser){
      if(statusEl){ statusEl.className = "sj-status error"; statusEl.textContent = "로그인이 필요합니다."; }
      return;
    }
    currentUser.getIdToken().then(function(idToken){
      return fetch(LIST_URL, {
        method: "GET",
        headers: { "Authorization": "Bearer " + idToken }
      });
    }).then(function(res){ return res.json(); })
      .then(function(data){
        if(data && data.error){ throw new Error(data.error); }
        cachedRounds = (data && data.rounds) || [];
        populateYearFilter();
        renderList();
      })
      .catch(function(e){
        if(statusEl){
          statusEl.className = "sj-status error";
          statusEl.textContent = tt("loadFetchFail", "불러오기 실패") + ": " + (e && e.message ? e.message : e);
        }
      });
  }

  bindListClick();
  bindFilters();
  bindStatsBtn();
  bindEditBodyEvents();
  bindEditSave();
  window.__sjCloudLoad = { onOpen: onOpen };
})();
