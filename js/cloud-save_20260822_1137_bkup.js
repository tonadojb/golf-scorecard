(function(){
  function sj(id){ return document.getElementById(id); }

  var COMMIT_URL = "https://commit-round-162951012751.asia-northeast3.run.app";

  function populatePlayerSelect(){
    var state = window.__golfScorecardAPI.getState();
    var sel = sj("sjMyPlayerSelect");
    sel.innerHTML = "";
    state.teams.forEach(function(team, ti){
      team.players.forEach(function(name, pi){
        var opt = document.createElement("option");
        opt.value = ti + "_" + pi;
        opt.textContent = (team.name || ("Team" + (ti + 1))) + " - " + name;
        sel.appendChild(opt);
      });
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
      var parts = sj("sjMyPlayerSelect").value.split("_");
      var ti = Number(parts[0]);
      var pi = Number(parts[1]);
      var team = state.teams[ti];
      var myScores = team.scores[pi] || [];
      var holes = state.holes || [];
      var totalScore = 0;
      var scoreToPar = 0;
      var breakdown = { eagle: 0, birdie: 0, par: 0, bogey: 0, doubleOrWorse: 0 };
      for(var h=0; h<state.holeCount; h++){
        var sc = myScores[h];
        if(typeof sc !== "number"){ continue; }
        var par = (holes[h] && holes[h].par) || 4;
        totalScore += sc;
        var diff = sc - par;
        scoreToPar += diff;
        if(diff <= -2){ breakdown.eagle++; }
        else if(diff === -1){ breakdown.birdie++; }
        else if(diff === 0){ breakdown.par++; }
        else if(diff === 1){ breakdown.bogey++; }
        else { breakdown.doubleOrWorse++; }
      }
      var companions = [];
      state.teams.forEach(function(t2, ti2){
        t2.players.forEach(function(name, pi2){
          if(!(ti2 === ti && pi2 === pi)){ companions.push(name); }
        });
      });
      status.className = "sj-status";
      status.textContent = "저장 중...";
      currentUser.getIdToken().then(function(idToken){
        return fetch(COMMIT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
          body: JSON.stringify({
            courseName: state.courseName || "",
            companions: companions,
            roundDate: state.playDate || null,
            holeCount: state.holeCount,
            totalScore: totalScore,
            scoreToPar: scoreToPar,
            scoreBreakdown: breakdown,
            inputMethod: (window.__sjOcr && window.__sjOcr.wasLastInputFromOcr && window.__sjOcr.wasLastInputFromOcr()) ? "photo" : "manual",
            photoUrl: ""
          })
        });
      }).then(function(res){ return res.json(); })
        .then(function(data){
          if(data && data.error){ throw new Error(data.error); }
          status.textContent = "저장 완료! 통계에 반영됩니다.";
          if(window.__sjOcr && window.__sjOcr.resetLastInputFlag){ window.__sjOcr.resetLastInputFlag(); }
          setTimeout(function(){ sj("sjSaveModal").classList.remove("open"); }, 1200);
        })
        .catch(function(e){
          status.className = "sj-status error";
          status.textContent = "저장 실패: " + (e && e.message ? e.message : e);
        });
    });
  }

  bindConfirmSave();
  window.__sjCloudSave = { populatePlayerSelect: populatePlayerSelect };
})();
