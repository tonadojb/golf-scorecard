document.querySelectorAll('.tabbtn').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('.tabbtn').forEach(function(b){ b.classList.remove('active'); });
    document.querySelectorAll('.panel').forEach(function(p){ p.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById('panel-'+btn.dataset.tab).classList.add('active');
    if(btn.dataset.tab === 'play') renderPlay();
    if(btn.dataset.tab === 'result') renderResult();
  });
});



function renderAll(){
  applyStaticTranslations();
  renderHeader();
  renderSetup();
  renderPlay();
  renderResult();
}

load();
renderAll();
  window.__golfScorecardAPI = {
    getState: function(){ return state; },
    hydrateFromOCR: function(data){
      if(data.courseName){ state.courseName = data.courseName; }
      if(data.roundDate){ state.playDate = data.roundDate; }
      if(data.companions && data.companions.length){
        var t0 = state.teams[0];
        for(var ci=0; ci<data.companions.length && ci<3; ci++){
          t0.players[ci+1] = data.companions[ci];
        }
      }
      if(data.holeScores && data.holeScores.length){
        var t1 = state.teams[0];
        var arr = t1.scores[0] || [];
        var ent = t1.entered[0] || [];
        for(var hi=0; hi<data.holeScores.length && hi<state.holeCount; hi++){
        arr[hi] = data.holeScores[hi];
          ent[hi] = true;
        }
        t1.scores[0] = arr;
        t1.entered[0] = ent;
      }
      save();
      renderAll();
    },
    refresh: function(){ renderAll(); }
  };
