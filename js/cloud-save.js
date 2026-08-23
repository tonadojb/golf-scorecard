(function(){
  function sj(id){ return document.getElementById(id); }

  var COMMIT_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/saveRound";

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
      status.className = "sj-status";
      status.textContent = "저장 중...";
      currentUser.getIdToken().then(function(idToken){
        return fetch(COMMIT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
          body: JSON.stringify({
            courseName: state.courseName || "",
            courseSub: state.courseSub || null,
            teeOffTime: state.teeOffTime || null,
            roundDate: state.playDate || null,
            holeCount: state.holeCount,
            holes: holes,
            teamName: team.name || "",
            players: players
          })
        });
      }).then(function(res){ return res.json(); })
        .then(function(data){
          if(data && data.error){ throw new Error(data.error); }
          status.textContent = "저장 완료! (본인 + 동반자 전체 스코어가 저장되었습니다)";
          if(window.__sjOcr && window.__sjOcr.resetLastInputFlag){ window.__sjOcr.resetLastInputFlag(); }
          setTimeout(function(){ sj("sjSaveModal").classList.remove("open"); }, 1400);
        })
        .catch(function(e){
          status.className = "sj-status error";
          status.textContent = "저장 실패: " + (e && e.message ? e.message : e);
        });
    });
  }

  bindConfirmSave();
  window.__sjCloudSave = { populateTeamSelect: populateTeamSelect };
})();
