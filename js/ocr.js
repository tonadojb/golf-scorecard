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
      status.textContent = "인식 중입니다... (최대 30초 소요)";
      var file = fileInput.files[0];
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
          if(window.__golfScorecardAPI){ window.__golfScorecardAPI.hydrateFromOCR(data); }
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
  window.__sjOcr = {
    wasLastInputFromOcr: function(){ return lastOcrUsed; },
    resetLastInputFlag: function(){ lastOcrUsed = false; }
  };
})();
