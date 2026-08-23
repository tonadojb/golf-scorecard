var STORAGE_KEY = 'golfScorecardState_v1';
var state = null;
var currentHole = 1;

/* ---------------- i18n ---------------- */


/* SCORE_MIN / SCORE_MAX: score is stored RELATIVE TO PAR.
   0 = par, -1 = birdie, -2 = eagle, -3 = albatross, +1 = bogey, etc. */
var SCORE_MIN = -5;
var SCORE_MAX = 20;

function defaultHoles(count){
  var arr = [];
  for(var i=0;i<count;i++) arr.push({par:4, note:''});
  return arr;
}

function defaultPlayers(){
  return [t('playerPlaceholder',1), t('playerPlaceholder',2), t('playerPlaceholder',3), t('playerPlaceholder',4)];
}

function defaultState(){
  return {
    lang:'ko',
    courseName:'',
    courseSub:'',
    playDate:new Date().toISOString().slice(0,10),
    teeOffTime:'',
    holeCount:18,
    holes:defaultHoles(18),
    teams:[
      {id:1, name:'Team 1', players:['플레이어1','플레이어2','플레이어3','플레이어4'], scores:[[],[],[],[]], entered:[[],[],[],[]], anonymize:[false,false,false,false], selfIndex:0}
    ],
    nextTeamId:2,
    currentHole:1,
    resultSortMode:'team'
  };
}

function load(){
  try{
    var raw = localStorage.getItem(STORAGE_KEY);
    if(raw){ state = JSON.parse(raw); } else { state = defaultState(); }
  }catch(e){ state = defaultState(); }
  normalize();
}

function normalize(){
  if(!state.lang) state.lang = 'ko';
  if(state.courseSub === undefined) state.courseSub = '';
  if(state.teeOffTime === undefined) state.teeOffTime = '';
  if(state.resultSortMode !== 'team' && state.resultSortMode !== 'rank') state.resultSortMode = 'team';
  if(!state.holeCount) state.holeCount = 18;
  if(!state.holes) state.holes = defaultHoles(state.holeCount);
  while(state.holes.length < state.holeCount) state.holes.push({par:4, note:''});
  state.holes.length = state.holeCount;
  if(!state.teams || !state.teams.length) state.teams = defaultState().teams;
  state.teams.forEach(function(team){
    if(!team.players) team.players = ['플레이어1','플레이어2','플레이어3','플레이어4'];
    if(!team.scores) team.scores = [[],[],[],[]];
    var hadEntered = !!team.entered;
    if(!team.entered) team.entered = [[],[],[],[]];
    if(!team.anonymize) team.anonymize = [false,false,false,false];
    if(typeof team.selfIndex !== 'number' || team.selfIndex < 0 || team.selfIndex > 3) team.selfIndex = 0;
    for(var i=0;i<4;i++){
      if(!team.scores[i]) team.scores[i] = [];
      while(team.scores[i].length < state.holeCount) team.scores[i].push(0);
      team.scores[i].length = state.holeCount;
      if(!team.entered[i]) team.entered[i] = [];
      if(!hadEntered){
        for(var h=0; h<state.holeCount; h++){
          if(team.entered[i][h] === undefined) team.entered[i][h] = (team.scores[i][h] || 0) !== 0;
        }
      }
      while(team.entered[i].length < state.holeCount) team.entered[i].push(false);
      team.entered[i].length = state.holeCount;
      if(team.anonymize[i] === undefined) team.anonymize[i] = false;
    }
  });
  if(!state.nextTeamId) state.nextTeamId = state.teams.length+1;
  currentHole = state.currentHole || 1;
  if(currentHole > state.holeCount) currentHole = 1;
}

function save(){
  state.currentHole = currentHole;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(str){
  return String(str==null?'':str).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

function toast(msg){
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(function(){ el.classList.remove('show'); }, 2200);
}

/* signed display helper for relative-to-par values: 0 -> "0", +n -> "+n", -n -> "-n" */
function signedLabel(v){
  if(v === 0) return '0';
  return v > 0 ? ('+'+v) : String(v);
}

/* Mask a name for anonymized sharing: keep first character, replace the rest with * */
function maskName(name){
  var str = String(name == null ? '' : name);
  if(str.length <= 1) return str;
  return str.charAt(0) + '*'.repeat(str.length - 1);
}

/* Standard competition ranking (golf-style): equal scores share the same rank,
   and the next distinct score jumps to (position + 1), e.g. 1,2,3,3,3,6,7 */
