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

/* ---------------- iOS 확대 화면 고정 방지 (안전망) ----------------
   iOS의 WKWebView(네이티브 앱)는 입력창(input/select/textarea)에 포커스가
   갈 때 그 요소의 글자 크기가 16px보다 작으면 화면을 자동으로 확대하고,
   포커스를 벗어나도 확대가 저절로 풀리지 않는 경우가 있습니다. 모든 입력창
   글자 크기를 16px 이상으로 맞춰 놓았지만(styles.css), 캐시 등 다른 이유로
   같은 증상이 다시 나타날 수 있으므로 앱 전체에 적용되는 안전망을 하나 더
   둡니다: 어떤 입력창이든 포커스를 벗어나면(blur) 뷰포트를 아주 잠깐
   maximum-scale=1.0으로 바꿨다가 원래 설정으로 되돌려서, 확대되어 있던
   화면을 1.0배로 강제로 정리합니다. 확대/축소(핀치 줌) 자체를 막는 것이
   아니라 "확대된 채 고정되는" 상태만 풀어주는 것이라 접근성에는 영향이
   없습니다. */
function sjResetIOSZoom(){
  var vp = document.querySelector('meta[name="viewport"]');
  if(!vp) return;
  var original = vp.getAttribute('content');
  if(!original) return;
  vp.setAttribute('content', original + ', maximum-scale=1.0');
  setTimeout(function(){
    vp.setAttribute('content', original);
  }, 350);
}
document.addEventListener('blur', function(e){
  var tag = e.target && e.target.tagName;
  if(tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'){
    sjResetIOSZoom();
  }
}, true);

function renderAll(){
  applyStaticTranslations();
  renderHeader();
  renderSetup();
  renderPlay();
  renderResult();
}

load();
renderAll();

/* "2026.06.13" / "2026/06/13" -> "2026-06-13" (HTML date input needs ISO format).
   Passes through already-ISO strings unchanged. */
function normalizeRoundDate(v){
  if(!v) return '';
  var s = String(v).trim();
  var m = s.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if(!m) return '';
  var y = m[1], mo = ('0'+m[2]).slice(-2), d = ('0'+m[3]).slice(-2);
  return y+'-'+mo+'-'+d;
}

/* Accepts "18:59", "8:13", "AM 8:13", or an Excel time-serial fraction (0-1)
   and returns "HH:MM" 24h for the <input type=time>. */
function normalizeTeeOffTime(v){
  if(v === null || v === undefined || v === '') return '';
  if(typeof v === 'number'){
    if(v < 0 || v >= 1) return '';
    var totalMin = Math.round(v * 24 * 60);
    var hh = Math.floor(totalMin/60) % 24, mm = totalMin % 60;
    return ('0'+hh).slice(-2)+':'+('0'+mm).slice(-2);
  }
  var s = String(v).trim();
  var m = s.match(/(\d{1,2})[:.](\d{2})/);
  if(!m) return '';
  var h = parseInt(m[1],10);
  if(/pm/i.test(s) && h < 12) h += 12;
  if(/am/i.test(s) && h === 12) h = 0;
  if(h < 0 || h > 23) return '';
  return ('0'+h).slice(-2)+':'+m[2];
}

/* Reads a per-hole par value that may arrive as a number (4), a numeric
   string ("4"), or the xlsx-style label ("P4"). Returns 3-6 or null. */
function parsePar(v){
  if(v === null || v === undefined || v === '') return null;
  var m = String(v).match(/\d+/);
  if(!m) return null;
  var n = parseInt(m[0],10);
  return (n>=3 && n<=6) ? n : null;
}

window.__golfScorecardAPI = {
  getState: function(){ return state; },
  hydrateFromOCR: function(data, teamIndex){
    if(data.courseName){ state.courseName = data.courseName; }
    if(data.courseSub){ state.courseSub = data.courseSub; }
    if(data.roundDate){
      var nd = normalizeRoundDate(data.roundDate);
      if(nd) state.playDate = nd;
    }
    if(data.teeOffTime){
      var nt = normalizeTeeOffTime(data.teeOffTime);
      if(nt) state.teeOffTime = nt;
    }
    var parsList = null;
    if(data.pars && data.pars.length){
      parsList = data.pars;
    } else if((data.parFront && data.parFront.length) || (data.parBack && data.parBack.length)){
      parsList = (data.parFront || []).concat(data.parBack || []);
    }
    if(parsList){
      for(var hpi=0; hpi<parsList.length && hpi<state.holeCount; hpi++){
        var pv = parsePar(parsList[hpi]);
        if(pv){ state.holes[hpi].par = pv; }
      }
    }
    /* Which team this OCR result should be applied to. Defaults to the first
       team (team 0) so behavior is unchanged when only one team exists or
       no target was specified (e.g. older callers). */
    var ti = (typeof teamIndex === 'number' && state.teams[teamIndex]) ? teamIndex : 0;
    var t0 = state.teams[ti];
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
