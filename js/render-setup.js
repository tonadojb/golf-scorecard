var courseNameInput = document.getElementById('courseName');
var playDateInput = document.getElementById('playDate');
courseNameInput.addEventListener('input', function(){ state.courseName = courseNameInput.value; save(); });
playDateInput.addEventListener('input', function(){ state.playDate = playDateInput.value; save(); });

function renderHeader(){
  courseNameInput.value = state.courseName || '';
  playDateInput.value = state.playDate || '';
}

var holeCountSeg = document.getElementById('holeCountSeg');
holeCountSeg.addEventListener('click', function(e){
  var btn = e.target.closest('button[data-holecount]');
  if(!btn) return;
  var n = parseInt(btn.dataset.holecount, 10);
  if(n === state.holeCount) return;
  state.holeCount = n;
  normalize();
  if(currentHole > n) currentHole = n;
  save();
  renderSetup();
  renderPlay();
  renderResult();
});

var teamsContainer = document.getElementById('teamsContainer');



function renderSetup(){
  Array.prototype.forEach.call(holeCountSeg.children, function(b){
    b.classList.toggle('active', parseInt(b.dataset.holecount,10) === state.holeCount);
  });
  teamsContainer.innerHTML = state.teams.map(function(team, ti){
    return '<div class="team-card"><div class="team-card-header">' +
      '<input class="team-name-input" data-team-idx="'+ti+'" value="'+escapeHtml(team.name)+'" placeholder="'+escapeHtml(t('teamNamePlaceholder'))+'">' +
      (state.teams.length > 1 ? '<button class="btn-remove-team" data-team-idx="'+ti+'">'+escapeHtml(t('removeTeam'))+'</button>' : '') +
      '</div><div class="players-grid">' +
      team.players.map(function(p, pi){
        return '<input class="player-name-input" data-team-idx="'+ti+'" data-player-idx="'+pi+'" value="'+escapeHtml(p)+'" placeholder="'+escapeHtml(t('playerPlaceholder', pi+1))+'">';
      }).join('') +
      '</div></div>';
  }).join('');
}

teamsContainer.addEventListener('input', function(e){
  var el = e.target;
  if(el.classList.contains('team-name-input')){
    var ti = parseInt(el.dataset.teamIdx,10);
    state.teams[ti].name = el.value;
    save();
  } else if(el.classList.contains('player-name-input')){
    var ti2 = parseInt(el.dataset.teamIdx,10);
    var pi = parseInt(el.dataset.playerIdx,10);
    state.teams[ti2].players[pi] = el.value;
    save();
  }
});

teamsContainer.addEventListener('click', function(e){
  var btn = e.target.closest('.btn-remove-team');
  if(!btn) return;
  var ti = parseInt(btn.dataset.teamIdx,10);
  if(!confirm(t('confirmRemoveTeam', state.teams[ti].name))) return;
  state.teams.splice(ti,1);
  save();
  renderSetup();
});

document.getElementById('addTeamBtn').addEventListener('click', function(){
  if(state.teams.length >= 20){
    toast(t('toastMaxTeams'));
    return;
  }
  var n = state.teams.length + 1;
  state.teams.push({
    id: state.nextTeamId++,
    name: 'Team ' + n,
    players: defaultPlayers(),
    scores: [[],[],[],[]],
    entered: [[],[],[],[]],
    anonymize: [false,false,false,false]
  });
  normalize();
  save();
  renderSetup();
});

document.getElementById('resetBtn').addEventListener('click', function(){
  if(!confirm(t('confirmReset'))) return;
  var keepLang = state.lang;
  state = defaultState();
  state.lang = keepLang;
  state.teams[0].players = defaultPlayers();
  currentHole = 1;
  save();
  renderAll();
  toast(t('toastReset'));
});


