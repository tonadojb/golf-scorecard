var shareModalOverlay = document.getElementById('shareModalOverlay');

document.getElementById('copyBtn').addEventListener('click', function(){
  shareModalOverlay.classList.add('show');
});
document.getElementById('shareCancelBtn').addEventListener('click', function(){
  shareModalOverlay.classList.remove('show');
});
shareModalOverlay.addEventListener('click', function(e){
  if(e.target === shareModalOverlay) shareModalOverlay.classList.remove('show');
});
document.getElementById('shareAsTextBtn').addEventListener('click', function(){
  shareModalOverlay.classList.remove('show');
  copyResultAsText();
});
document.getElementById('shareAsImageBtn').addEventListener('click', function(){
  shareModalOverlay.classList.remove('show');
  copyResultAsImage();
});

function buildResultText(){
  var n = state.holeCount;
  var showSplit = (n === 18);
  var rankMode = (state.resultSortMode === 'rank');
  var lines = [];
  lines.push('⛳ ' + (state.courseName || t('title')));
  lines.push(t('copyDatePrefix') + ' ' + (state.playDate || '') + ' · ' + n + t('holesSuffix'));
  lines.push('');

  var rows = [];
  state.teams.forEach(function(team){
    team.players.forEach(function(pname, pi){
      var outTotal = 0, inTotal = 0;
      var scoresStr = [];
      for(var h=0; h<n; h++){
        var rel = team.scores[pi][h] || 0;
        var played = !!team.entered[pi][h];
        scoresStr.push(signedLabel(rel));
        if(played){
          if(h < 9) outTotal += rel; else inTotal += rel;
        }
      }
      var grandTotal = outTotal + inTotal;
      var totalStr = showSplit
        ? (t('outLabel')+' '+signedLabel(outTotal)+' / '+t('inLabel')+' '+signedLabel(inTotal)+' / '+t('copyTotalLabel')+' '+signedLabel(grandTotal))
        : (t('copyTotalLabel')+' '+signedLabel(grandTotal));
      var isAnon = team.anonymize && team.anonymize[pi];
      var baseName = pname || t('playerPlaceholder', pi+1);
      var displayName = isAnon ? maskName(baseName) : baseName;
      rows.push({team:team, displayName:displayName, scoresStr:scoresStr, totalStr:totalStr, grandTotal:grandTotal});
    });
  });

  if(rankMode){
    var sorted = rows.slice().sort(function(a,b){ return a.grandTotal - b.grandTotal; });
    assignCompetitionRanks(sorted);
    sorted.forEach(function(row){
      lines.push(row.rankLabel+'. '+row.displayName+' ('+row.team.name+'): '+row.scoresStr.join(',')+' ('+row.totalStr+')');
    });
  } else {
    state.teams.forEach(function(team){
      lines.push('[' + team.name + ']');
      rows.filter(function(r){ return r.team.id === team.id; }).forEach(function(row){
        lines.push(row.displayName + ': ' + row.scoresStr.join(',') + ' (' + row.totalStr + ')');
      });
      lines.push('');
    });
  }

  lines.push(t('copyFooter'));
  return lines.join('\n');
}

function copyResultAsText(){
  var text = buildResultText();
  function done(){ toast(t('toastCopied')); }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done).catch(function(){ fallbackCopy(text, done); });
  } else {
    fallbackCopy(text, done);
  }
}

function copyResultAsImage(){
  if(typeof html2canvas !== 'function'){
    toast(t('toastImageFail'));
    return;
  }
  var original = document.getElementById('resultCaptureArea');
  var clone = original.cloneNode(true);
  clone.style.position = 'fixed';
  clone.style.left = '-99999px';
  clone.style.top = '0';
  clone.style.width = 'max-content';
  clone.style.background = '#ffffff';
  clone.style.padding = '16px';
  var wrap = clone.querySelector('.table-wrap');
  if(wrap){ wrap.style.overflow = 'visible'; }

  Array.prototype.forEach.call(clone.querySelectorAll('.player-name-cell'), function(cell){
    var teamId = parseInt(cell.dataset.teamId,10);
    var pi = parseInt(cell.dataset.playerIdx,10);
    var team = state.teams.find(function(tm){ return tm.id === teamId; });
    if(team && team.anonymize && team.anonymize[pi]){
      cell.textContent = maskName(cell.textContent);
    }
  });

  document.body.appendChild(clone);

  html2canvas(clone, {backgroundColor:'#ffffff', scale:2}).then(function(canvas){
    document.body.removeChild(clone);
    canvas.toBlob(function(blob){
      if(!blob){ toast(t('toastImageFail')); return; }
      if(navigator.clipboard && window.ClipboardItem){
        navigator.clipboard.write([new ClipboardItem({'image/png': blob})]).then(function(){
          toast(t('toastImageCopied'));
        }).catch(function(){
          downloadImageBlob(blob);
        });
      } else {
        downloadImageBlob(blob);
      }
    }, 'image/png');
  }).catch(function(){
    if(clone.parentNode) document.body.removeChild(clone);
    toast(t('toastImageFail'));
  });
}

function downloadImageBlob(blob){
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  var fname = (state.courseName || 'scorecard').replace(/[^a-zA-Z0-9가-힣_-]/g,'_');
  a.download = fname + '_' + (state.playDate || '') + '.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(t('toastImageSaved'));
}

function fallbackCopy(text, cb){
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try{ document.execCommand('copy'); cb(); }catch(e){ toast(t('toastCopyFail')); }
  document.body.removeChild(ta);
}


