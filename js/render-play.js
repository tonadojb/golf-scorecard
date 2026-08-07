var holeStrip = document.getElementById('holeStrip');
var holeTitle = document.getElementById('holeTitle');
var parSelect = document.getElementById('parSelect');
var holeNote = document.getElementById('holeNote');
var scoreInputList = document.getElementById('scoreInputList');

function renderPlay(){
  holeStrip.innerHTML = '';
  for(var i=1;i<=state.holeCount;i++){
    var chip = document.createElement('button');
    chip.className = 'hole-chip' + (i===currentHole ? ' active' : '');
    chip.dataset.hole = i;
    chip.textContent = i;
    holeStrip.appendChild(chip);
  }
  renderHoleInfo();
  renderScoreList();
}

function renderHoleInfo(){
  var hole = state.holes[currentHole-1];
  holeTitle.textContent = t('holeLabel', currentHole);
  var pars = [3,4,5,6];
  parSelect.innerHTML = pars.map(function(p){
    return '<button data-par="'+p+'" class="'+(hole.par===p?'active':'')+'">'+p+'</button>';
  }).join('');
  holeNote.value = hole.note || '';
}

holeStrip.addEventListener('click', function(e){
  var chip = e.target.closest('.hole-chip');
  if(!chip) return;
  currentHole = parseInt(chip.dataset.hole,10);
  save();
  renderPlay();
});

parSelect.addEventListener('click', function(e){
  var btn = e.target.closest('button[data-par]');
  if(!btn) return;
  state.holes[currentHole-1].par = parseInt(btn.dataset.par,10);
  save();
  renderHoleInfo();
  renderScoreList();
});

holeNote.addEventListener('input', function(){
  state.holes[currentHole-1].note = holeNote.value;
  save();
});

function renderScoreList(){
  var rows = '';
  state.teams.forEach(function(team){
    team.players.forEach(function(pname, pi){
      var score = team.scores[pi][currentHole-1] || 0;
      var label = signedLabel(score);
      var cls = score > 0 ? 'plus' : (score < 0 ? 'minus' : 'even');
      rows += '<div class="score-row">' +
        '<span class="score-player-label">' + escapeHtml(pname||t('playerPlaceholder',pi+1)) + '<small>' + escapeHtml(team.name) + '</small></span>' +
        '<div class="counter">' +
        '<button class="minus" data-team-id="'+team.id+'" data-player-idx="'+pi+'">−</button>' +
        '<span class="count-display '+cls+'">' + label + '</span>' +
        '<button class="plus" data-team-id="'+team.id+'" data-player-idx="'+pi+'">+</button>' +
        '</div></div>';
    });
  });
  scoreInputList.innerHTML = rows;
}

scoreInputList.addEventListener('click', function(e){
  var btn = e.target.closest('button.plus, button.minus');
  if(!btn) return;
  var teamId = parseInt(btn.dataset.teamId,10);
  var pi = parseInt(btn.dataset.playerIdx,10);
  var team = state.teams.find(function(t){ return t.id === teamId; });
  if(!team) return;
  var cur = team.scores[pi][currentHole-1] || 0;
  if(btn.classList.contains('plus')){
    cur = Math.min(cur+1, SCORE_MAX);
  } else {
    cur = Math.max(cur-1, SCORE_MIN);
  }
  team.scores[pi][currentHole-1] = cur;
  team.entered[pi][currentHole-1] = true;
  save();
  renderScoreList();
});

document.getElementById('prevHoleBtn').addEventListener('click', function(){
  if(currentHole>1){ currentHole--; save(); renderPlay(); }
});
document.getElementById('nextHoleBtn').addEventListener('click', function(){
  if(currentHole<state.holeCount){ currentHole++; save(); renderPlay(); }
});


