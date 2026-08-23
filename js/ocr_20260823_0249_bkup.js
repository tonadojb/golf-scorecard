(function(){
  function sj(id){ return document.getElementById(id); }
  var ANALYZE_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/analyzeScorecard";
  var lastOcrUsed = false;

  /* Cache of the last-uploaded photo per team (teamId -> base64), kept for
     the page session so "선택 재검토" can resend the same photo without
     asking the user to re-upload. Not persisted anywhere -- lost on
     page reload, since photos aren't stored server-side. */
  var teamPhotoCache = {};

  function fileToBase64(file){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(){ resolve(reader.result.split(",")[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* Same "self first, then the rest in table order" convention
     analyzeScorecard's response always follows -- reused here so a
     re-review response's players[] can be matched back to the same
     team.players/scores index positions as the original analysis. */
  function reorderPlayers(players){
    players = players || [];
    var selfPlayer = null;
    for(var i=0; i<players.length; i++){ if(players[i].isSelf){ selfPlayer = players[i]; break; } }
    if(!selfPlayer) selfPlayer = players[0];
    var ordered = selfPlayer ? [selfPlayer] : [];
    for(var j=0; j<players.length; j++){ if(players[j] !== selfPlayer) ordered.push(players[j]); }
    return ordered.slice(0, 4);
  }

  function teamRowHtml(team){
    var removeBtn = (state.teams.length > 1)
      ? '<button type="button" class="sj-ocr-remove-team" data-team-id="'+team.id+'" title="팀 삭제" ' +
        'style="width:32px;flex:none;border:none;border-radius:8px;background:#fee2e2;color:#b91c1c;font-size:16px;cursor:pointer;">−</button>'
      : '';
    return '<div class="sj-ocr-team-row" data-team-id="'+team.id+'" style="border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px;margin-bottom:8px;">' +
      '<div style="display:flex;gap:6px;align-items:center;">' +
        '<input type="text" class="sj-ocr-team-name" data-team-id="'+team.id+'" value="'+escapeHtml(team.name)+'" ' +
          'style="flex:1;padding:7px 8px;font-size:13px;border:1px solid #ccc;border-radius:8px;box-sizing:border-box;">' +
        removeBtn +
      '</div>' +
      '<input type="file" accept="image/*" class="sj-ocr-team-file" data-team-id="'+team.id+'" style="width:100%;font-size:12px;margin-top:6px;">' +
      '<div class="sj-ocr-team-filename" data-team-id="'+team.id+'" style="font-size:11px;color:#888;margin-top:2px;"></div>' +
    '</div>';
  }

  function refreshRemoveButtonsVisibility(){
    var container = sj("sjOcrTeamList");
    if(!container) return;
    var rows = container.querySelectorAll(".sj-ocr-team-row");
    Array.prototype.forEach.call(rows, function(row){
      var existingBtn = row.querySelector(".sj-ocr-remove-team");
      if(state.teams.length <= 1){
        if(existingBtn) existingBtn.remove();
      } else if(!existingBtn){
        var id = row.dataset.teamId;
        var headerRow = row.querySelector("div");
        if(headerRow){
          headerRow.insertAdjacentHTML("beforeend",
            '<button type="button" class="sj-ocr-remove-team" data-team-id="'+id+'" title="팀 삭제" ' +
            'style="width:32px;flex:none;border:none;border-radius:8px;background:#fee2e2;color:#b91c1c;font-size:16px;cursor:pointer;">−</button>');
        }
      }
    });
  }

  /* Full re-render -- only used on modal open, when there are no
     in-progress file selections to lose. Add/remove team while the
     modal stays open instead patch the DOM directly (see below) so
     other teams' already-chosen photos aren't wiped out. */
  function renderOcrTeamList(){
    var container = sj("sjOcrTeamList");
    if(!container || typeof state === "undefined" || !state) return;
    container.innerHTML = state.teams.map(teamRowHtml).join("");
  }

  function computePlayerTotal(team, pi){
    var scores = team.scores[pi] || [];
    var total = 0, toPar = 0;
    for(var h=0; h<state.holeCount; h++){
      var rel = (typeof scores[h] === "number") ? scores[h] : 0;
      var par = (state.holes[h] && state.holes[h].par) || 4;
      total += par + rel;
      toPar += rel;
    }
    return { total: total, toPar: toPar };
  }

  function renderOcrReviewSection(){
    var section = sj("sjOcrReviewSection");
    var list = sj("sjOcrReviewList");
    if(!section || !list) return;
    var teamIds = Object.keys(teamPhotoCache).map(function(k){ return parseInt(k, 10); })
      .filter(function(id){ return state.teams.some(function(tm){ return tm.id === id; }); });
    if(!teamIds.length){
      section.style.display = "none";
      list.innerHTML = "";
      return;
    }
    section.style.display = "";
    list.innerHTML = teamIds.map(function(teamId){
      var team = state.teams.filter(function(tm){ return tm.id === teamId; })[0];
      if(!team) return "";
      var selfIdx = (typeof team.selfIndex === "number") ? team.selfIndex : 0;
      var rows = team.players.map(function(name, pi){
        var stat = computePlayerTotal(team, pi);
        return '<div class="sj-ocr-review-row">' +
          '<label class="sj-ocr-self-label" title="본인(My)으로 표시">' +
            '<input type="radio" name="sj-ocr-self-'+teamId+'" class="sj-ocr-self-player" data-team-id="'+teamId+'" data-player-idx="'+pi+'"'+(pi===selfIdx?' checked':'')+'>' +
            '<span>My</span>' +
          '</label>' +
          '<label class="sj-ocr-review-label">' +
            '<input type="checkbox" class="sj-ocr-review-player" data-team-id="'+teamId+'" data-player-idx="'+pi+'">' +
            '<span>' + escapeHtml(name) + ' — ' + stat.total + ' (' + signedLabel(stat.toPar) + ')</span>' +
          '</label>' +
        '</div>';
      }).join("");
      return '<div style="margin-bottom:8px;">' +
        '<div style="font-weight:600;font-size:13px;color:#1f2b24;">' + escapeHtml(team.name) + '</div>' +
        rows +
      '</div>';
    }).join("");
  }

  /* "My" radio inside the review list -- lets the user correct which
     player is "본인" when the first-row assumption (used as the default
     both here and by hydrateFromOCR's self-first ordering) doesn't match
     reality, e.g. a companion's card got scanned instead. Persisted on
     team.selfIndex so cloud-save can tag the right player as isSelf for
     later stats aggregation. */
  function bindOcrReviewListEvents(){
    var list = sj("sjOcrReviewList");
    if(!list) return;
    list.addEventListener("change", function(e){
      var el = e.target;
      if(el.classList.contains("sj-ocr-self-player")){
        var teamId = parseInt(el.dataset.teamId, 10);
        var pi = parseInt(el.dataset.playerIdx, 10);
        var team = state.teams.filter(function(tm){ return tm.id === teamId; })[0];
        if(team){
          team.selfIndex = pi;
          if(typeof save === "function") save();
        }
      }
    });
  }

  function bindOcrTeamListEvents(){
    var container = sj("sjOcrTeamList");
    if(!container) return;

    container.addEventListener("input", function(e){
      var el = e.target;
      if(el.classList.contains("sj-ocr-team-name")){
        var id = parseInt(el.dataset.teamId, 10);
        var team = state.teams.filter(function(tm){ return tm.id === id; })[0];
        if(team){
          team.name = el.value;
          if(typeof save === "function") save();
          if(typeof renderSetup === "function") renderSetup();
        }
      }
    });

    container.addEventListener("change", function(e){
      var el = e.target;
      if(el.classList.contains("sj-ocr-team-file")){
        var id = el.dataset.teamId;
        var label = container.querySelector('.sj-ocr-team-filename[data-team-id="'+id+'"]');
        if(label){ label.textContent = (el.files && el.files[0]) ? el.files[0].name : ""; }
      }
    });

    container.addEventListener("click", function(e){
      var btn = e.target.closest(".sj-ocr-remove-team");
      if(!btn) return;
      if(state.teams.length <= 1) return;
      var id = parseInt(btn.dataset.teamId, 10);
      var idx = -1;
      for(var i=0; i<state.teams.length; i++){ if(state.teams[i].id === id){ idx = i; break; } }
      if(idx === -1) return;
      state.teams.splice(idx, 1);
      delete teamPhotoCache[id];
      if(typeof save === "function") save();
      if(typeof renderSetup === "function") renderSetup();
      var row = container.querySelector('.sj-ocr-team-row[data-team-id="'+id+'"]');
      if(row) row.parentNode.removeChild(row);
      refreshRemoveButtonsVisibility();
      renderOcrReviewSection();
    });
  }

  function bindOcrAddTeam(){
    var btn = sj("sjOcrAddTeamBtn");
    if(!btn) return;
    btn.addEventListener("click", function(){
      if(typeof state === "undefined" || !state) return;
      if(state.teams.length >= 20){
        if(typeof toast === "function" && typeof t === "function"){ toast(t("toastMaxTeams")); }
        return;
      }
      var n = state.teams.length + 1;
      state.teams.push({
        id: state.nextTeamId++,
        name: "Team " + n,
        players: (typeof defaultPlayers === "function") ? defaultPlayers() : ["플레이어1","플레이어2","플레이어3","플레이어4"],
        scores: [[],[],[],[]],
        entered: [[],[],[],[]],
        anonymize: [false,false,false,false],
        selfIndex: 0
      });
      if(typeof normalize === "function") normalize();
      if(typeof save === "function") save();
      if(typeof renderSetup === "function") renderSetup();
      var container = sj("sjOcrTeamList");
      if(container){
        container.insertAdjacentHTML("beforeend", teamRowHtml(state.teams[state.teams.length - 1]));
      }
      refreshRemoveButtonsVisibility();
    });
  }

  function bindAnalyze(){
    var btn = sj("sjAnalyzeBtn");
    if(!btn) return;
    btn.addEventListener("click", function(){
      var status = sj("sjOcrStatus");
      var currentUser = window.__sjAuth && window.__sjAuth.getCurrentUser();
      if(!currentUser){
        status.className = "sj-status error";
        status.textContent = "먼저 로그인해주세요.";
        return;
      }
      var container = sj("sjOcrTeamList");
      var fileInputs = container ? Array.prototype.slice.call(container.querySelectorAll(".sj-ocr-team-file")) : [];
      var jobs = fileInputs.map(function(fi){
        var file = fi.files && fi.files[0];
        var teamId = parseInt(fi.dataset.teamId, 10);
        return file ? { file: file, teamId: teamId } : null;
      }).filter(Boolean);

      if(!jobs.length){
        status.className = "sj-status error";
        status.textContent = "팀별로 사진을 최소 1장 선택해주세요.";
        return;
      }

      btn.disabled = true;
      status.className = "sj-status";
      var total = jobs.length;
      var done = 0;
      var failures = [];
      status.textContent = "인식 중입니다 (0/" + total + ")... (팀당 최대 60초 소요될 수 있어요)";

      currentUser.getIdToken().then(function(idToken){
        var chain = Promise.resolve();
        jobs.forEach(function(job){
          chain = chain.then(function(){
            return fileToBase64(job.file).then(function(base64){
              teamPhotoCache[job.teamId] = base64;
              return fetch(ANALYZE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
                body: JSON.stringify({ imageBase64: base64 })
              });
            }).then(function(res){ return res.json(); })
              .then(function(data){
                if(data && data.error){ throw new Error(data.error); }
                var teamIdx = -1;
                for(var i=0; i<state.teams.length; i++){ if(state.teams[i].id === job.teamId){ teamIdx = i; break; } }
                if(teamIdx !== -1 && window.__golfScorecardAPI){
                  window.__golfScorecardAPI.hydrateFromOCR(data, teamIdx);
                }
                lastOcrUsed = true;
              })
              .catch(function(e){
                var teamObj = state.teams.filter(function(tm){ return tm.id === job.teamId; })[0];
                failures.push((teamObj ? teamObj.name : ("팀 " + job.teamId)) + ": " + (e && e.message ? e.message : e));
              })
              .then(function(){
                done++;
                status.textContent = "인식 중입니다 (" + done + "/" + total + ")...";
              });
          });
        });
        return chain;
      }).then(function(){
        btn.disabled = false;
        renderOcrReviewSection();
        if(failures.length){
          status.className = "sj-status error";
          status.textContent = "일부 인식 실패: " + failures.join(" / ");
        } else {
          status.className = "sj-status";
          status.textContent = "인식 완료! 화면에서 내용을 확인하고, 이상한 선수가 있으면 아래에서 선택 후 재검토해주세요.";
        }
      });
    });
  }

  function bindReviewBtn(){
    var btn = sj("sjOcrReviewBtn");
    if(!btn) return;
    btn.addEventListener("click", function(){
      var status = sj("sjOcrReviewStatus");
      var currentUser = window.__sjAuth && window.__sjAuth.getCurrentUser();
      if(!currentUser){
        status.className = "sj-status error";
        status.textContent = "먼저 로그인해주세요.";
        return;
      }
      var checked = Array.prototype.slice.call(document.querySelectorAll(".sj-ocr-review-player:checked"));
      if(!checked.length){
        status.className = "sj-status error";
        status.textContent = "재검토할 선수를 선택해주세요.";
        return;
      }
      var byTeam = {};
      checked.forEach(function(cb){
        var teamId = parseInt(cb.dataset.teamId, 10);
        var pi = parseInt(cb.dataset.playerIdx, 10);
        if(!byTeam[teamId]) byTeam[teamId] = [];
        byTeam[teamId].push(pi);
      });
      var teamIds = Object.keys(byTeam);

      btn.disabled = true;
      status.className = "sj-status";
      var total = teamIds.length;
      var done = 0;
      var hadError = false;
      status.textContent = "재검토 중입니다 (0/" + total + ")...";

      currentUser.getIdToken().then(function(idToken){
        var chain = Promise.resolve();
        teamIds.forEach(function(teamIdStr){
          var teamId = parseInt(teamIdStr, 10);
          var indices = byTeam[teamId];
          chain = chain.then(function(){
            var base64 = teamPhotoCache[teamId];
            var team = state.teams.filter(function(tm){ return tm.id === teamId; })[0];
            if(!base64 || !team){
              hadError = true;
              status.className = "sj-status error";
              status.textContent = "원본 사진이 없어 재검토할 수 없습니다. 다시 업로드 후 인식해주세요.";
              done++;
              return;
            }
            var focusNames = indices.map(function(pi){ return team.players[pi]; }).filter(Boolean);
            return fetch(ANALYZE_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
              body: JSON.stringify({ imageBase64: base64, focusPlayers: focusNames })
            }).then(function(res){ return res.json(); })
              .then(function(data){
                if(data && data.error){ throw new Error(data.error); }
                var ordered = reorderPlayers(data.players);
                indices.forEach(function(pi){
                  var p = ordered[pi];
                  if(p && p.holeScores && p.holeScores.length){
                    var arr = team.scores[pi] || [];
                    var ent = team.entered[pi] || [];
                    for(var hi=0; hi<p.holeScores.length && hi<state.holeCount; hi++){
                      arr[hi] = p.holeScores[hi];
                      ent[hi] = true;
                    }
                    team.scores[pi] = arr;
                    team.entered[pi] = ent;
                  }
                });
                if(typeof save === "function") save();
                if(typeof renderAll === "function") renderAll();
              })
              .catch(function(e){
                hadError = true;
                status.className = "sj-status error";
                status.textContent = "재검토 실패(" + team.name + "): " + (e && e.message ? e.message : e);
              })
              .then(function(){
                done++;
                if(!hadError){ status.textContent = "재검토 중입니다 (" + done + "/" + total + ")..."; }
              });
          });
        });
        return chain;
      }).then(function(){
        btn.disabled = false;
        if(!hadError){
          status.className = "sj-status";
          status.textContent = "재검토 완료! 결과를 확인해주세요.";
        }
        renderOcrReviewSection();
      });
    });
  }

  /* "재검토 Pass" -- lets the user close the modal right after recognition
     without running a re-review, since the OCR results are already applied
     to the live scorecard the moment "인식 시작" finishes (see bindAnalyze
     below); this button is purely a "I'm satisfied, close this" affordance. */
  function bindSkipReviewBtn(){
    var btn = sj("sjOcrSkipReviewBtn");
    if(!btn) return;
    btn.addEventListener("click", function(){
      var modal = sj("sjOcrModal");
      if(modal) modal.classList.remove("open");
      if(typeof toast === "function"){ toast("저장되었습니다"); }
    });
  }

  bindOcrTeamListEvents();
  bindOcrReviewListEvents();
  bindOcrAddTeam();
  bindAnalyze();
  bindReviewBtn();
  bindSkipReviewBtn();

  window.__sjOcr = {
    wasLastInputFromOcr: function(){ return lastOcrUsed; },
    resetLastInputFlag: function(){ lastOcrUsed = false; },
    onOpen: function(){
      renderOcrTeamList();
      refreshRemoveButtonsVisibility();
      renderOcrReviewSection();
    }
  };
})();
