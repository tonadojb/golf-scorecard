(function(){
  function sj(id){ return document.getElementById(id); }
  var ANALYZE_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/analyzeScorecard";
  var lastOcrUsed = false;

  function fileToBase64(file){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(){ resolve(reader.result.split(",")[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* Team-mapping: when more than one team exists, show a team picker inside
     the OCR modal so recognized scores land on the right team instead of
     always team 0. selectedIdx (optional) forces that option to be selected
     after the list is rebuilt (used right after adding a new team here). */
  function populateOcrTeamSelect(selectedIdx){
    var section = sj("sjOcrTeamSection");
    var select = sj("sjOcrTeamSelect");
    if(!section || !select) return;
    if(typeof state === "undefined" || !state || !state.teams || state.teams.length <= 1){
      section.style.display = "none";
      return;
    }
    var prevValue = (typeof selectedIdx === "number") ? selectedIdx : parseInt(select.value, 10);
    section.style.display = "";
    select.innerHTML = state.teams.map(function(team, ti){
      return '<option value="'+ti+'">' + escapeHtml(team.name || ("Team "+(ti+1))) + '</option>';
    }).join("");
    if(!isNaN(prevValue) && prevValue >= 0 && prevValue < state.teams.length){
      select.value = String(prevValue);
    }
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
        anonymize: [false,false,false,false]
      });
      if(typeof normalize === "function") normalize();
      if(typeof save === "function") save();
      if(typeof renderSetup === "function") renderSetup();
      populateOcrTeamSelect(state.teams.length - 1);
    });
  }

  function getSelectedTeamIndex(){
    var section = sj("sjOcrTeamSection");
    var select = sj("sjOcrTeamSelect");
    if(!section || !select || section.style.display === "none") return 0;
    var v = parseInt(select.value, 10);
    return isNaN(v) ? 0 : v;
  }

  function bindAnalyze(){
    var btn = sj("sjAnalyzeBtn");
    if(!btn) return;
    btn.addEventListener("click", function(){
      var status = sj("sjOcrStatus");
      var fileInput = sj("sjPhotoInput");
      if(!fileInput.files || !fileInput.files[0]){
        status.className = "sj-status error";
        status.textContent = "사진을 선택해주세요.";
        return;
      }
      var currentUser = window.__sjAuth && window.__sjAuth.getCurrentUser();
      if(!currentUser){
        status.className = "sj-status error";
        status.textContent = "먼저 로그인해주세요.";
        return;
      }
      status.className = "sj-status";
      status.textContent = "인식 중입니다... (최대 60초 소요, 검산 때문에 조금 더 걸릴 수 있어요)";
      var file = fileInput.files[0];
      var targetTeamIdx = getSelectedTeamIndex();
      fileToBase64(file).then(function(base64){
        return currentUser.getIdToken().then(function(idToken){
          return fetch(ANALYZE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
            body: JSON.stringify({ imageBase64: base64 })
          });
        });
      }).then(function(res){ return res.json(); })
        .then(function(data){
          if(data && data.error){ throw new Error(data.error); }
          if(window.__golfScorecardAPI){ window.__golfScorecardAPI.hydrateFromOCR(data, targetTeamIdx); }
          lastOcrUsed = true;
          status.textContent = "인식 완료! 화면에서 내용을 확인하고 필요하면 수정해주세요.";
          setTimeout(function(){ sj("sjOcrModal").classList.remove("open"); }, 1200);
        })
        .catch(function(e){
          status.className = "sj-status error";
          status.textContent = "인식 실패: " + (e && e.message ? e.message : e);
        });
    });
  }

  bindAnalyze();
  bindOcrAddTeam();
  window.__sjOcr = {
    wasLastInputFromOcr: function(){ return lastOcrUsed; },
    resetLastInputFlag: function(){ lastOcrUsed = false; },
    onOpen: function(){ populateOcrTeamSelect(); }
  };
})();
