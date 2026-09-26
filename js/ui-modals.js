(function(){
  function sj(id){ return document.getElementById(id); }
  function sjOpen(id){ sj(id).classList.add("open"); }
  function sjClose(id){ sj(id).classList.remove("open"); }

  Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function(btn){
    btn.addEventListener("click", function(){
      btn.closest(".sj-modal-overlay").classList.remove("open");
    });
  });

  sj("sjAuthFab").addEventListener("click", function(){ sjOpen("sjAuthModal"); });
  var sjManualBtnEl = sj("sjManualBtn");
  if(sjManualBtnEl){ sjManualBtnEl.addEventListener("click", function(){ sjOpen("sjManualModal"); }); }
  sj("sjOcrFab").addEventListener("click", function(){
    if(window.__sjOcr && window.__sjOcr.onOpen){ window.__sjOcr.onOpen(); }
    // 2026-09-20: sjOcrModal을 열 때마다 무료/구독 사용량 배너(및 "구독 관리" 버튼)를
    // 다시 그려준다. 이 호출이 빠져 있으면 로그인 상태에서도 배너가 절대 채워지지
    // 않아서 "구독 모달"로 들어갈 방법이 화면 어디에도 없게 된다.
    if(window.__sjSubscription && window.__sjSubscription.refreshBanner){ window.__sjSubscription.refreshBanner(); }
    sjOpen("sjOcrModal");
  });
  sj("sjSaveFab").addEventListener("click", function(){
    var currentUser = window.__sjAuth && window.__sjAuth.getCurrentUser();
    if(!currentUser){
      alert("먼저 로그인해주세요.");
      sjOpen("sjAuthModal");
      return;
    }
    if(window.__sjCloudSave){ window.__sjCloudSave.populateTeamSelect(); }
    sjOpen("sjSaveModal");
  });
  sj("sjLoadFab").addEventListener("click", function(){
    var currentUser = window.__sjAuth && window.__sjAuth.getCurrentUser();
    if(!currentUser){
      alert("먼저 로그인해주세요.");
      sjOpen("sjAuthModal");
      return;
    }
    if(window.__sjCloudLoad){ window.__sjCloudLoad.onOpen(); }
    sjOpen("sjLoadModal");
  });
  var sjFriendsFabEl = sj("sjFriendsFab");
  if(sjFriendsFabEl){
    sjFriendsFabEl.addEventListener("click", function(){
      var currentUser = window.__sjAuth && window.__sjAuth.getCurrentUser();
      if(!currentUser){
        alert("먼저 로그인해주세요.");
        sjOpen("sjAuthModal");
        return;
      }
      if(window.__sjFriends && window.__sjFriends.onOpen){ window.__sjFriends.onOpen(); }
      sjOpen("sjFriendsModal");
    });
  }
  var sjRouletteFabEl = sj("sjRouletteFab");
  if(sjRouletteFabEl){
    sjRouletteFabEl.addEventListener("click", function(){
      var currentUser = window.__sjAuth && window.__sjAuth.getCurrentUser();
      if(!currentUser){
        alert("먼저 로그인해주세요.");
        sjOpen("sjAuthModal");
        return;
      }
      if(window.__sjReferral && window.__sjReferral.onOpen){ window.__sjReferral.onOpen(); }
      sjOpen("sjReferralModal");
    });
  }
  var sjAdminFabEl = sj("sjAdminFab");
  if(sjAdminFabEl){
    sjAdminFabEl.addEventListener("click", function(){
      if(window.__sjAdmin && window.__sjAdmin.onOpen){ window.__sjAdmin.onOpen(); }
      sjOpen("sjAdminModal");
    });
  }
})();
