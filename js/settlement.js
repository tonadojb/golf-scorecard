/* ---------------- 내기 골프 정산 (스킨스/타수 정산) ----------------
   같은 팀(함께 라운드를 도는 그룹) 안에서 스코어 입력이 끝난 뒤 "정산" 버튼을
   누르면, 사용자가 입력한 타당 금액을 기준으로 두 명씩 짝지어 홀마다 타수
   차이만큼 주고받을 금액을 계산합니다.

   더블판 조건 (해당 홀 전체 정산 금액이 2배가 됨, 여러 조건이 겹쳐도 2배만 적용):
   - 모든 파: 참가자 중 한 명이라도 버디 이상(버디/이글/알바트로스/홀인원)
   - 파4·파5: 참가자 중 한 명이라도 트리플보기 이상
   - 파3: 참가자 중 한 명이라도 더블보기 이상

   클라우드 DB에는 저장하지 않고, 화면에서 계산 후 바로 보여주기만 합니다. */

var settlementTeamSelectWrap = document.getElementById('settlementTeamSelectWrap');
var settlementTeamSelect = document.getElementById('settlementTeamSelect');
var settlementStakeInput = document.getElementById('settlementStakeInput');
var settlementCalcBtn = document.getElementById('settlementCalcBtn');
var settlementResultEl = document.getElementById('settlementResult');

/* 부호(+/-)가 있는 합계 표시용 (예: "+15,000원" / "-5,000원" / "0원") */
function settlementFormatSigned(n){
  var v = Math.round(n);
  var abs = Math.abs(v).toLocaleString();
  if(v > 0) return '+' + abs + t('settlementUnit');
  if(v < 0) return '-' + abs + t('settlementUnit');
  return '0' + t('settlementUnit');
}

/* 부호 없는 금액 표시용 (예: "15,000원") — 이미 누가 누구에게 주는지 문맥이 있는 경우 */
function settlementFormatPlain(n){
  return Math.abs(Math.round(n)).toLocaleString() + t('settlementUnit');
}

function populateSettlementTeamSelect(){
  if(!settlementTeamSelect || !state || !state.teams) return;
  var prev = settlementTeamSelect.value;
  settlementTeamSelect.innerHTML = state.teams.map(function(team){
    return '<option value="' + team.id + '">' + escapeHtml(team.name) + '</option>';
  }).join('');
  if(state.teams.length > 1){
    settlementTeamSelectWrap.style.display = '';
  } else {
    settlementTeamSelectWrap.style.display = 'none';
  }
  var stillExists = state.teams.some(function(tm){ return String(tm.id) === prev; });
  settlementTeamSelect.value = stillExists ? prev : String(state.teams[0].id);
}

function getSettlementTeam(){
  if(settlementTeamSelect && settlementTeamSelect.value){
    var found = state.teams.find(function(tm){ return String(tm.id) === settlementTeamSelect.value; });
    if(found) return found;
  }
  return state.teams[0];
}

/* 실제로 스코어를 한 번이라도 입력한 참가자 인덱스만 정산 대상으로 삼는다
   (2명/3명/4명 어떤 인원이라도 자동으로 지원됨). */
function settlementActivePlayers(team){
  var idxs = [];
  for(var pi = 0; pi < 4; pi++){
    var hasAny = (team.entered[pi] || []).some(function(e){ return e; });
    if(hasAny) idxs.push(pi);
  }
  return idxs;
}

function settlementHoleMultiplier(holeIdx, team, activeIdxs){
  var par = state.holes[holeIdx].par;
  var doubled = false;
  activeIdxs.forEach(function(pi){
    if(!team.entered[pi][holeIdx]) return;
    var rel = team.scores[pi][holeIdx] || 0;
    if(rel <= -1) doubled = true;                              // 버디/이글/알바트로스/홀인원
    if((par === 4 || par === 5) && rel >= 3) doubled = true;    // 파4·5: 트리플보기 이상
    if(par === 3 && rel >= 2) doubled = true;                  // 파3: 더블보기 이상
  });
  return doubled ? 2 : 1;
}

function computeSettlement(team, stake){
  var activeIdxs = settlementActivePlayers(team);
  if(activeIdxs.length < 2) return null;

  var n = state.holeCount;
  /* pairNet["a-b"] (a<b): a가 b에게서 받는 누적 순금액. 음수면 반대로 b가 a에게서 받는 것. */
  var pairNet = {};
  activeIdxs.forEach(function(a){
    activeIdxs.forEach(function(b){
      if(a < b) pairNet[a + '-' + b] = 0;
    });
  });

  var holeResults = [];
  for(var h = 0; h < n; h++){
    var mult = settlementHoleMultiplier(h, team, activeIdxs);
    var amounts = [];
    for(var ai = 0; ai < activeIdxs.length; ai++){
      for(var bi = ai + 1; bi < activeIdxs.length; bi++){
        var a = activeIdxs[ai], b = activeIdxs[bi];
        if(!team.entered[a][h] || !team.entered[b][h]) continue;
        var scoreA = team.scores[a][h] || 0;
        var scoreB = team.scores[b][h] || 0;
        var diff = scoreB - scoreA; // 양수면 b가 더 많이 침(못 침) -> b가 a에게 지불
        if(diff === 0) continue;
        var amount = Math.abs(diff) * stake * mult;
        if(!amount) continue;
        var payer = diff > 0 ? b : a;
        var payee = diff > 0 ? a : b;
        amounts.push({ payer: payer, payee: payee, amount: amount });
        pairNet[a + '-' + b] += (diff > 0 ? amount : -amount);
      }
    }
    holeResults.push({ hole: h + 1, par: state.holes[h].par, doubled: (mult === 2), amounts: amounts });
  }

  var totals = {};
  activeIdxs.forEach(function(pi){ totals[pi] = 0; });
  Object.keys(pairNet).forEach(function(key){
    var parts = key.split('-');
    var a = parseInt(parts[0], 10), b = parseInt(parts[1], 10);
    var net = pairNet[key];
    totals[a] += net;
    totals[b] -= net;
  });

  var finalPairs = [];
  Object.keys(pairNet).forEach(function(key){
    var parts = key.split('-');
    var a = parseInt(parts[0], 10), b = parseInt(parts[1], 10);
    var net = pairNet[key];
    if(net === 0) return;
    if(net > 0) finalPairs.push({ payer: b, payee: a, amount: net });
    else finalPairs.push({ payer: a, payee: b, amount: -net });
  });
  finalPairs.sort(function(x, y){ return y.amount - x.amount; });

  return { activeIdxs: activeIdxs, holeResults: holeResults, totals: totals, finalPairs: finalPairs };
}

function settlementPlayerLabel(team, pi){
  return escapeHtml(team.players[pi] || t('playerPlaceholder', pi + 1));
}

function renderSettlementResult(team, data){
  if(!data){
    settlementResultEl.innerHTML = '<p class="settlement-empty">' + escapeHtml(t('settlementNeedTwoPlayers')) + '</p>';
    return;
  }

  var totalsRows = data.activeIdxs.map(function(pi){
    var v = data.totals[pi];
    var cls = v > 0 ? 'plus' : (v < 0 ? 'minus' : 'even');
    return '<tr><td style="text-align:left;">' + settlementPlayerLabel(team, pi) + '</td><td class="' + cls + '">' + settlementFormatSigned(v) + '</td></tr>';
  }).join('');

  var finalPairsHtml = data.finalPairs.length ?
    '<ul class="settlement-final-list">' + data.finalPairs.map(function(fp){
      return '<li><span class="settlement-payer">' + settlementPlayerLabel(team, fp.payer) + '</span> → <span class="settlement-payee">' + settlementPlayerLabel(team, fp.payee) + '</span> : <strong>' + settlementFormatPlain(fp.amount) + '</strong></li>';
    }).join('') + '</ul>' :
    '<p class="settlement-empty">' + escapeHtml(t('settlementAllEven')) + '</p>';

  var holesHtml = data.holeResults.map(function(hr){
    var amountsText = hr.amounts.length ?
      hr.amounts.map(function(am){
        return settlementPlayerLabel(team, am.payer) + ' → ' + settlementPlayerLabel(team, am.payee) + ' : ' + settlementFormatPlain(am.amount);
      }).join('<br>') :
      '<span class="settlement-empty">' + escapeHtml(t('settlementHoleEven')) + '</span>';
    return '<tr>' +
      '<td>' + hr.hole + '<br><small>P' + hr.par + '</small></td>' +
      '<td>' + (hr.doubled ? '<span class="settlement-double-badge">' + escapeHtml(t('settlementDoubleBadge')) + '</span>' : '') + '</td>' +
      '<td style="text-align:left;">' + amountsText + '</td>' +
      '</tr>';
  }).join('');

  settlementResultEl.innerHTML =
    '<h4 class="settlement-subtitle">' + escapeHtml(t('settlementTotalsTitle')) + '</h4>' +
    '<table class="settlement-table"><tbody>' + totalsRows + '</tbody></table>' +
    '<h4 class="settlement-subtitle">' + escapeHtml(t('settlementFinalTitle')) + '</h4>' +
    finalPairsHtml +
    '<h4 class="settlement-subtitle">' + escapeHtml(t('settlementHolesTitle')) + '</h4>' +
    '<div class="table-wrap"><table class="settlement-table settlement-holes-table"><thead><tr><th>' + escapeHtml(t('settlementHoleCol')) + '</th><th>' + escapeHtml(t('settlementDoubleCol')) + '</th><th style="text-align:left;">' + escapeHtml(t('settlementAmountCol')) + '</th></tr></thead><tbody>' + holesHtml + '</tbody></table></div>';
}

if(settlementCalcBtn){
  settlementCalcBtn.addEventListener('click', function(){
    var stake = parseFloat(settlementStakeInput.value);
    if(!stake || stake <= 0){
      toast(t('settlementStakeRequired'));
      settlementStakeInput.focus();
      return;
    }
    var team = getSettlementTeam();
    if(!team){
      settlementResultEl.innerHTML = '<p class="settlement-empty">' + escapeHtml(t('settlementNeedTwoPlayers')) + '</p>';
      return;
    }
    var data = computeSettlement(team, stake);
    renderSettlementResult(team, data);
  });
}

var settlementTeamSelectEl = document.getElementById('settlementTeamSelect');
if(settlementTeamSelectEl){
  settlementTeamSelectEl.addEventListener('change', function(){
    settlementResultEl.innerHTML = '';
  });
}

var tabResultBtnForSettlement = document.getElementById('tabResultBtn');
if(tabResultBtnForSettlement){
  tabResultBtnForSettlement.addEventListener('click', function(){
    populateSettlementTeamSelect();
  });
}
