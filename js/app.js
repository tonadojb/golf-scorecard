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
    var t0 = state.teams[0];
    if(data.players && data.players.length){
      var selfPlayer = null;
      for(var pi=0; pi<data.players.length; pi++){ if(data.players[pi].isSelf){ selfPlayer = data.players[pi]; break; } }
      if(!selfPlayer) selfPlayer = data.players[0];
      var ordered = [selfPlayer];
      for(var oi=0; oi<data.players.length; oi++){ if(data.players[oi] !== selfPlayer) ordered.push(data.players[oi]); }
      ordered = ordered.slice(0, 4);
      for(var idx=0; idx<ordered.length; idx++){
        var p = ordered[idx];
        if(p.name){ t0.players[idx] = p.name; }
        if(p.holeScores && p.holeScores.length){
          var arr = t0.scores[idx] || [];
          var ent = t0.entered[idx] || [];
          for(var hi=0; hi<p.holeScores.length && hi<state.holeCount; hi++){
            var v = p.holeScores[hi];
            if(v !== null && v !== undefined && !isNaN(v)){
              arr[hi] = v;
              ent[hi] = true;
            }
          }
          t0.scores[idx] = arr;
          t0.entered[idx] = ent;
        }
      }
    } else {
      if(data.companions && data.companions.length){
        for(var ci=0; ci<data.companions.length && ci<3; ci++){
          t0.players[ci+1] = data.companions[ci];
        }
      }
      if(data.holeScores && data.holeScores.length){
        var arr2 = t0.scores[0] || [];
        var ent2 = t0.entered[0] || [];
        for(var hi2=0; hi2<data.holeScores.length && hi2<state.holeCount; hi2++){
          arr2[hi2] = data.holeScores[hi2];
          ent2[hi2] = true;
        }
        t0.scores[0] = arr2;
        t0.entered[0] = ent2;
      }
    }
    save();
    renderAll();
  },
  refresh: function(){ renderAll(); }
};
