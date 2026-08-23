(function(){
  function sj(id){ return document.getElementById(id); }
  var LIST_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/listRounds";
  var DELETE_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/deleteRound";
  var cachedRounds = [];

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
      return '<div class="sj-load-item" data-idx="'+entry.idx+'" style="position:relative;border:1px solid #e5e7eb;border-radius:10px;padding:10px 40px 10px 12px;margin-bottom:8px;cursor:pointer;">' +
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

    if(typeof save === "function") save();
    if(typeof renderAll === "function") renderAll();
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
  window.__sjCloudLoad = { onOpen: onOpen };
})();
