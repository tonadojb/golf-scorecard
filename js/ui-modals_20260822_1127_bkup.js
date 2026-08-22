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
  sj("sjOcrFab").addEventListener("click", function(){ sjOpen("sjOcrModal"); });
  sj("sjSaveFab").addEventListener("click", function(){
    var currentUser = window.__sjAuth && window.__sjAuth.getCurrentUser();
    if(!currentUser){
      alert("먼저 로그인해주세요.");
      sjOpen("sjAuthModal");
      return;
    }
    if(window.__sjCloudSave){ window.__sjCloudSave.populatePlayerSelect(); }
    sjOpen("sjSaveModal");
  });
})();
