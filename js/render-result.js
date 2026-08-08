function assignCompetitionRanks(sortedRows){
  for(var i=0; i<sortedRows.length; i++){
    if(i > 0 && sortedRows[i].grandTotal === sortedRows[i-1].grandTotal){
      sortedRows[i].rank = sortedRows[i-1].rank;
    } else {
      sortedRows[i].rank = i+1;
    }
  }
  var counts = {};
  sortedRows.forEach(function(r){ counts[r.rank] = (counts[r.rank]||0) + 1; });
  sortedRows.forEach(function(r){ r.rankLabel = (counts[r.rank] > 1 ? 'T' : '') + r.rank; });
  return sortedRows;
}

var sortToggle = document.getElementById('sortToggle');
sortToggle.addEventListener('click', function(e){
  var btn = e.target.closest('button[data-sort]');
  if(!btn) return;
  var mode = btn.dataset.sort;
  if(mode === state.resultSortMode) return;
  state.resultSortMode = mode;
  save();
  Array.prototype.forEach.call(sortToggle.children, function(b){
    b.classList.toggle('active', b.dataset.sort === mode);
  });
  renderResult();
});



var resultSummary = document.getElementById('resultSummary');
var resultTable = document.getElementById('resultTable');

function renderResult(){
  var n = state.holeCount;
  var showSplit = (n === 18);
  var rankMode = (state.resultSortMode === 'rank');

  Array.prototype.forEach.call(sortToggle.children, function(b){
    b.classList.toggle('active', b.dataset.sort === state.resultSortMode);
  });

  resultSummary.innerHTML =
    '<strong>' + escapeHtml(state.courseName || t('courseNameEmpty')) + '</strong> · ' +
    escapeHtml(state.playDate || '') + ' · ' + n + t('holesSuffix');

  var extraCols = showSplit ? 3 : 1; // OUT, IN, TOTAL  vs just TOTAL
  var head = '<tr>';
  if(rankMode) head += '<th>'+escapeHtml(t('rankColumnHeader'))+'</th>';
  head += '<th>'+escapeHtml(t('tableCategory'))+'</th>';
  for(var h=1; h<=n; h++){
    head += '<th>'+h+'<br><small style="font-weight:400;">P'+state.holes[h-1].par+'</small></th>';
    if(showSplit && h === 9){
      head += '<th>'+escapeHtml(t('outLabel'))+'</th>';
    }
  }
  if(showSplit) head += '<th>'+escapeHtml(t('inLabel'))+'</th>';
  head += '<th>'+escapeHtml(t('tableTotal'))+'</th></tr>';

  /* Build one row-data entry per player, independent of grouping/sorting */
  var rows = [];
  state.teams.forEach(function(team){
    team.players.forEach(function(pname, pi){
      var outTotal = 0, inTotal = 0;
      var cells = '';
      for(var h2=0; h2<n; h2++){
        var rel = team.scores[pi][h2] || 0;
        var played = !!team.entered[pi][h2];
        var label = signedLabel(rel);
        var cls = rel > 0 ? 'plus' : (rel < 0 ? 'minus' : 'even');
        cells += '<td class="'+cls+'">' + label + '</td>';
        if(played){
          if(h2 < 9) outTotal += rel; else inTotal += rel;
        }
        if(showSplit && h2 === 8){
          cells += '<td class="'+(outTotal>0?'plus':(outTotal<0?'minus':'even'))+'">'+signedLabel(outTotal)+'</td>';
        }
      }
      var grandTotal = outTotal + inTotal;
      if(showSplit) cells += '<td class="'+(inTotal>0?'plus':(inTotal<0?'minus':'even'))+'">'+signedLabel(inTotal)+'</td>';
      cells += '<td class="'+(grandTotal>0?'plus':(grandTotal<0?'minus':'even'))+'">'+signedLabel(grandTotal)+'</td>';
      rows.push({team:team, pname:pname, pi:pi, cells:cells, grandTotal:grandTotal});
    });
  });

  var body = '';
  if(rankMode){
    var sorted = rows.slice().sort(function(a,b){ return a.grandTotal - b.grandTotal; });
    assignCompetitionRanks(sorted);
    sorted.forEach(function(row){
      var nameCell = '<td class="player-name-cell" data-team-id="'+row.team.id+'" data-player-idx="'+row.pi+'" style="text-align:left;">' +
        escapeHtml(row.pname||t('playerPlaceholder',row.pi+1)) +
        ' <small style="color:var(--muted);">('+escapeHtml(row.team.name)+')</small></td>';
      body += '<tr><td>'+row.rankLabel+'</td>' + nameCell + row.cells + '</tr>';
    });
  } else {
    state.teams.forEach(function(team){
      body += '<tr><td class="team-row" colspan="'+(n+1+extraCols)+'">'+escapeHtml(team.name)+'</td></tr>';
      rows.filter(function(r){ return r.team.id === team.id; }).forEach(function(row){
        body += '<tr><td class="player-name-cell" data-team-id="'+row.team.id+'" data-player-idx="'+row.pi+'" style="text-align:left;">'+escapeHtml(row.pname||t('playerPlaceholder',row.pi+1))+'</td>' + row.cells + '</tr>';
      });
    });
  }

  resultTable.innerHTML = '<thead>'+head+'</thead><tbody>'+body+'</tbody>';
  renderAnonymizeList();
}

var anonymizeListEl = document.getElementById('anonymizeList');

function renderAnonymizeList(){
  var html = '';
  state.teams.forEach(function(team){
    team.players.forEach(function(pname, pi){
      var checked = team.anonymize && team.anonymize[pi];
      html += '<label class="anon-row">' +
        '<input type="checkbox" data-team-id="'+team.id+'" data-player-idx="'+pi+'"'+(checked?' checked':'')+'>' +
        '<span>'+escapeHtml(pname||t('playerPlaceholder',pi+1))+'</span>' +
        '<span class="anon-team">('+escapeHtml(team.name)+')</span>' +
        '</label>';
    });
  });
  anonymizeListEl.innerHTML = html;
}

anonymizeListEl.addEventListener('change', function(e){
  var cb = e.target.closest('input[type="checkbox"]');
  if(!cb) return;
  var teamId = parseInt(cb.dataset.teamId,10);
  var pi = parseInt(cb.dataset.playerIdx,10);
  var team = state.teams.find(function(tm){ return tm.id === teamId; });
  if(!team) return;
  if(!team.anonymize) team.anonymize = [false,false,false,false];
  team.anonymize[pi] = cb.checked;
  save();
});


