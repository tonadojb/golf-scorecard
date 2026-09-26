(function(){
  function sj(id){ return document.getElementById(id); }

  var COMMIT_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/saveRound";
  var UPDATE_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/updateRound";

  /* Save always captures the WHOLE selected team's data -- every
     player's name and full hole-by-hole scores, not just one "my
     player" -- so 불러오기 can restore the exact same scorecard later. */
  function populateTeamSelect(){
    var state = window.__golfScorecardAPI.getState();
    var sel = sj("sjSaveTeamSelect");
    if(!sel) return;
    sel.innerHTML = "";
    state.teams.forEach(function(team, ti){
      var opt = document.createElement("option");
      opt.value = String(ti);
      opt.textContent = team.name || ("Team " + (ti + 1));
      sel.appendChild(opt);
    });
    updateModeNote(state);
  }

  /* 불러온 라운드(state.cloudRoundId)가 있으면 "이 라운드를 수정합니다"라는
     안내와 "새 라운드로 별도 저장" 체크박스를 보여준다. 이전에는 저장 버튼을
     누르면 무조건 새 문서를 만들어서, 불러온 라운드의 동반자 이름을 고쳐도
     원본은 그대로 남고 엉뚱한 중복 라운드만 늘어나는 문제가 있었다. */
  function updateModeNote(state){
    var noteEl = sj("sjSaveUpdateNote");
    var wrapEl = sj("sjSaveAsNewWrap");
    if(!noteEl || !wrapEl) return;
    if(state.cloudRoundId){
      var label = (state.courseName || "골프장 미입력") + (state.playDate ? " · " + state.playDate : "");
      noteEl.style.display = "";
      noteEl.textContent = "☁ 불러온 라운드(" + label + ")를 수정합니다";
      wrapEl.style.display = "flex";
    } else {
      noteEl.style.display = "none";
      wrapEl.style.display = "none";
      var cb = sj("sjSaveAsNewCheckbox");
      if(cb) cb.checked = false;
    }
  }

  function bindConfirmSave(){
    var btn = sj("sjConfirmSave");
    if(!btn) return;
    btn.addEventListener("click", function(){
      var status = sj("sjSaveStatus");
      var currentUser = window.__sjAuth && window.__sjAuth.getCurrentUser();
      if(!currentUser){
        status.className = "sj-status error";
        status.textContent = "로그인이 필요합니다.";
        return;
      }
      var state = window.__golfScorecardAPI.getState();
      var sel = sj("sjSaveTeamSelect");
      var ti = sel ? parseInt(sel.value, 10) : 0;
      if(isNaN(ti) || !state.teams[ti]){ ti = 0; }
      var team = state.teams[ti];
      if(!team){
        status.className = "sj-status error";
        status.textContent = "저장할 팀이 없습니다.";
        return;
      }
      var holes = (state.holes || []).slice(0, state.holeCount).map(function(h){
        return { par: h.par, note: h.note || "" };
      });
      var selfIdx = (typeof team.selfIndex === "number") ? team.selfIndex : 0;
      var players = team.players.map(function(name, pi){
        return {
          name: name,
          isSelf: pi === selfIdx,
          holeScores: (team.scores[pi] || []).slice(0, state.holeCount),
          entered: (team.entered[pi] || []).slice(0, state.holeCount)
        };
      });
      var body = {
        courseName: state.courseName || "",
        courseSub: state.courseSub || null,
        teeOffTime: state.teeOffTime || null,
        roundDate: state.playDate || null,
        holeCount: state.holeCount,
        holes: holes,
        teamName: team.name || "",
        players: players
      };

      var asNewCb = sj("sjSaveAsNewCheckbox");
      var forceNew = !!(asNewCb && asNewCb.checked);
      var updateId = (!forceNew && state.cloudRoundId) ? state.cloudRoundId : null;

      status.className = "sj-status";
      status.textContent = "저장 중...";

      function createNew(idToken){
        return fetch(COMMIT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
          body: JSON.stringify(body)
        }).then(function(res){ return res.json(); }).then(function(data){
          if(data && data.blocked){
            if(window.__sjAuth && window.__sjAuth.handleBlocked){ window.__sjAuth.handleBlocked(data.error); }
            throw new Error(data.error || "접속이 제한되었습니다.");
          }
          if(data && data.error){ throw new Error(data.error); }
          /* 새로 만든 문서를 이제부터 "불러온 라운드"로 취급 -- 바로 이어서
             다시 저장을 눌러도 중복 생성되지 않고 이 문서가 수정되도록 한다. */
          if(data && data.id){ state.cloudRoundId = data.id; if(typeof save === "function") save(); }
          status.textContent = "저장 완료! (본인 + 동반자 전체 스코어가 저장되었습니다)";
        });
      }

      currentUser.getIdToken().then(function(idToken){
        if(updateId){
          return fetch(UPDATE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
            body: JSON.stringify(Object.assign({ id: updateId }, body))
          }).then(function(res){ return res.json(); }).then(function(data){
            if(data && data.blocked){
              if(window.__sjAuth && window.__sjAuth.handleBlocked){ window.__sjAuth.handleBlocked(data.error); }
              throw new Error(data.error || "접속이 제한되었습니다.");
            }
            /* 불러온 라운드가 그 사이 삭제된 경우(404) 등은 수정할 대상이
               없으므로, 사용자가 입력을 잃지 않도록 새 라운드로 저장한다. */
            if(data && data.error){
              return currentUser.getIdToken().then(createNew);
            }
            status.textContent = "수정 완료! (불러온 라운드가 새 내용으로 갱신되었습니다)";
          });
        }
        return createNew(idToken);
      }).then(function(){
        if(window.__sjOcr && window.__sjOcr.resetLastInputFlag){ window.__sjOcr.resetLastInputFlag(); }
        setTimeout(function(){ sj("sjSaveModal").classList.remove("open"); }, 1400);
      }).catch(function(e){
        status.className = "sj-status error";
        status.textContent = "저장 실패: " + (e && e.message ? e.message : e);
      });
    });
  }

  bindConfirmSave();
  window.__sjCloudSave = { populateTeamSelect: populateTeamSelect };
})();
