/* ---------------- 내기 골프 정산 (스킨스/타수 정산) ----------------
   같은 팀(함께 라운드를 도는 그룹) 안에서 스코어 입력이 끝난 뒤 "정산" 버튼을
   누르면, 사용자가 입력한 타당 금액을 기준으로 두 명씩 짝지어 홀마다 타수
   차이만큼 주고받을 금액을 계산합니다.

   더블판 조건 (해당 홀 전체 정산 금액이 자동으로 2배가 됨, 여러 조건이 겹쳐도
   2배까지만 자동 적용 -- 그 이상은 아래 "수동 조정"으로 직접 지정):
   - 모든 파: 참가자 중 한 명이라도 버디 이상(버디/이글/알바트로스/홀인원)
   - 파4·파5: 참가자 중 한 명이라도 트리플보기 이상
   - 파3: 참가자 중 한 명이라도 더블보기 이상

   실제 라운드에서는 구두로 "이번 홀은 ×4로 하자" 처럼 자동 판정과 다르게
   정하거나, 특정 홀만 타당 금액을 올리는 경우가 흔해서, 정산 결과 화면에서
   홀별로 배수와 타당 금액을 직접 눌러서 수정할 수 있게 했습니다
   (settlementHoleOverrides). 수정하면 그 자리에서 바로 다시 계산됩니다.

   클라우드 DB에는 저장하지 않고, 화면에서 계산 후 바로 보여주기만 합니다.
   "정산하기"를 다시 누르면(재계산) 홀별 수동 조정 내역은 초기화됩니다. */

var settlementTeamSelectWrap = document.getElementById('settlementTeamSelectWrap');
var settlementTeamSelect = document.getElementById('settlementTeamSelect');
var settlementStakeInput = document.getElementById('settlementStakeInput');
var settlementCalcBtn = document.getElementById('settlementCalcBtn');
var settlementResultEl = document.getElementById('settlementResult');
var settlementShareImageBtn = document.getElementById('settlementShareImageBtn');

/* 마지막으로 계산한 팀 / 기본 타당 금액 / 홀별 수동 조정값을 기억해뒀다가,
   홀별 배수·타당 금액을 수정할 때마다 이 값들을 기준으로 다시 계산합니다. */
var settlementCurrentTeam = null;
var settlementCurrentGlobalStake = null;
var settlementHoleOverrides = {}; // { [holeIdx]: {multiplier:number|null, stake:number|null} }

function settlementGetOverride(h){
  if(!settlementHoleOverrides[h]) settlementHoleOverrides[h] = { multiplier: null, stake: null };
  return settlementHoleOverrides[h];
}

/* 부호(+/-)가 있는 합계 표시용 (예: "+15,000" / "-5,000" / "0") -- 단위(원)는
   표시하지 않고 숫자만 보여줍니다. */
function settlementFormatSigned(n){
  var v = Math.round(n);
  var abs = Math.abs(v).toLocaleString();
  if(v > 0) return '+' + abs;
  if(v < 0) return '-' + abs;
  return '0';
}

/* 부호 없는 금액 표시용 (예: "15,000") — 이미 누가 누구에게 주는지 문맥이 있는 경우.
   단위(원)는 표시하지 않고 숫자만 보여줍니다. */
function settlementFormatPlain(n){
  return Math.abs(Math.round(n)).toLocaleString();
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

/* 규칙에 따른 "자동" 배수 (수동으로 덮어쓰지 않았을 때 기본으로 쓰이는 값) */
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

function computeSettlement(team, globalStake){
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
    var autoMult = settlementHoleMultiplier(h, team, activeIdxs);
    var ov = settlementGetOverride(h);
    var mult = (ov.multiplier != null && ov.multiplier > 0) ? ov.multiplier : autoMult;
    var stakeForHole = (ov.stake != null && ov.stake >= 0) ? ov.stake : globalStake;

    var amounts = [];
    for(var ai = 0; ai < activeIdxs.length; ai++){
      for(var bi = ai + 1; bi < activeIdxs.length; bi++){
        var a = activeIdxs[ai], b = activeIdxs[bi];
        if(!team.entered[a][h] || !team.entered[b][h]) continue;
        var scoreA = team.scores[a][h] || 0;
        var scoreB = team.scores[b][h] || 0;
        var diff = scoreB - scoreA; // 양수면 b가 더 많이 침(못 침) -> b가 a에게 지불
        if(diff === 0) continue;
        var amount = Math.abs(diff) * stakeForHole * mult;
        if(!amount) continue;
        var payer = diff > 0 ? b : a;
        var payee = diff > 0 ? a : b;
        amounts.push({ payer: payer, payee: payee, amount: amount });
        pairNet[a + '-' + b] += (diff > 0 ? amount : -amount);
      }
    }
    holeResults.push({
      hole: h + 1,
      holeIdx: h,
      par: state.holes[h].par,
      autoMultiplier: autoMult,
      effectiveMultiplier: mult,
      effectiveStake: stakeForHole,
      overridden: (ov.multiplier != null || ov.stake != null),
      amounts: amounts
    });
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

/* 화면에 보여줄 배수 프리셋 버튼 (연속 더블/따당 관행까지 고려해서 ×8까지) */
var SETTLEMENT_MULT_PRESETS = [1, 2, 4, 8];

function renderSettlementHoleCard(team, hr){
  var btnsHtml = SETTLEMENT_MULT_PRESETS.map(function(m){
    var active = (hr.effectiveMultiplier === m) ? ' active' : '';
    return '<button type="button" class="settlement-mult-btn' + active + '" data-hole="' + hr.holeIdx + '" data-mult="' + m + '">×' + m + '</button>';
  }).join('');

  var amountsText = hr.amounts.length ?
    hr.amounts.map(function(am){
      return settlementPlayerLabel(team, am.payer) + ' → ' + settlementPlayerLabel(team, am.payee) + ' : ' + settlementFormatPlain(am.amount);
    }).join('<br>') :
    '<span class="settlement-empty">' + escapeHtml(t('settlementHoleEven')) + '</span>';

  return '<div class="settlement-hole-card">' +
    '<div class="settlement-hole-card-head">' +
      '<strong>' + hr.hole + escapeHtml(t('holesSuffix')) + ' <small>P' + hr.par + '</small></strong>' +
      (hr.overridden ? '<button type="button" class="settlement-hole-reset" data-hole="' + hr.holeIdx + '">↺ ' + escapeHtml(t('settlementResetHole')) + '</button>' : '') +
    '</div>' +
    '<div class="settlement-hole-controls">' +
      '<div class="settlement-mult-seg">' + btnsHtml + '</div>' +
      '<input type="number" class="settlement-mult-custom" data-hole="' + hr.holeIdx + '" min="1" step="1" value="' + hr.effectiveMultiplier + '" title="' + escapeHtml(t('settlementCustomMultTitle')) + '">' +
      '<div class="settlement-hole-stake-wrap">' +
        '<input type="number" class="settlement-hole-stake-input" data-hole="' + hr.holeIdx + '" min="0" step="1000" value="' + hr.effectiveStake + '">' +
        '<span class="settlement-hole-stake-label">' + escapeHtml(t('settlementUnit')) + '</span>' +
      '</div>' +
    '</div>' +
    (hr.overridden ? '<div class="settlement-auto-note">' + escapeHtml(t('settlementAutoNote')) + ' ×' + hr.autoMultiplier + '</div>' : '') +
    '<div class="settlement-hole-amounts">' + amountsText + '</div>' +
  '</div>';
}

function renderSettlementResult(team, data){
  if(!data){
    settlementResultEl.innerHTML = '<p class="settlement-empty">' + escapeHtml(t('settlementNeedTwoPlayers')) + '</p>';
    if(settlementShareImageBtn) settlementShareImageBtn.style.display = 'none';
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

  var holesHtml = data.holeResults.map(function(hr){ return renderSettlementHoleCard(team, hr); }).join('');

  settlementResultEl.innerHTML =
    '<h4 class="settlement-subtitle">' + escapeHtml(t('settlementTotalsTitle')) + '</h4>' +
    '<table class="settlement-table"><tbody>' + totalsRows + '</tbody></table>' +
    '<h4 class="settlement-subtitle">' + escapeHtml(t('settlementFinalTitle')) + '</h4>' +
    finalPairsHtml +
    '<h4 class="settlement-subtitle">' + escapeHtml(t('settlementHolesTitle')) + '</h4>' +
    '<div class="settlement-hole-cards">' + holesHtml + '</div>';

  if(settlementShareImageBtn) settlementShareImageBtn.style.display = '';
}

function recalcAndRenderSettlement(){
  if(!settlementCurrentTeam) return;
  var data = computeSettlement(settlementCurrentTeam, settlementCurrentGlobalStake);
  renderSettlementResult(settlementCurrentTeam, data);
  /* "정산하기"를 누르면 그 직전에 타당 금액 입력창(settlementStakeInput)에서
     포커스가 빠져나가는데, 이 시점에 iOS가 확대된 화면을 안 풀어주는 경우가
     보고되어 여기서도 명시적으로 한 번 더 정리합니다 (js/app.js의 전역
     안전망과 별개로, 실제 증상이 보고된 지점을 직접 겨냥한 이중 안전장치). */
  if(typeof sjResetIOSZoom === 'function') sjResetIOSZoom();
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
    settlementHoleOverrides = {}; // 새로 정산할 때마다 홀별 수동 조정 내역 초기화
    settlementCurrentTeam = team;
    settlementCurrentGlobalStake = stake;
    recalcAndRenderSettlement();
  });
}

/* 홀별 배수 프리셋 버튼 클릭 / 초기화 버튼 클릭 */
settlementResultEl.addEventListener('click', function(e){
  var multBtn = e.target.closest('.settlement-mult-btn');
  if(multBtn){
    var h = parseInt(multBtn.dataset.hole, 10);
    var m = parseInt(multBtn.dataset.mult, 10);
    settlementGetOverride(h).multiplier = m;
    recalcAndRenderSettlement();
    return;
  }
  var resetBtn = e.target.closest('.settlement-hole-reset');
  if(resetBtn){
    var h2 = parseInt(resetBtn.dataset.hole, 10);
    settlementHoleOverrides[h2] = { multiplier: null, stake: null };
    recalcAndRenderSettlement();
    return;
  }
});

/* 홀별 배수 직접입력 / 타당 금액 직접입력 (다 입력하고 포커스를 벗어날 때
   반영 -- 입력 중간에 매번 다시 그리면 입력창 포커스가 끊겨서 타이핑이
   불편해지기 때문에 input이 아니라 change 이벤트를 씁니다). */
settlementResultEl.addEventListener('change', function(e){
  var el = e.target;
  if(el.classList.contains('settlement-mult-custom')){
    var h = parseInt(el.dataset.hole, 10);
    var v = parseFloat(el.value);
    settlementGetOverride(h).multiplier = (v && v > 0) ? v : null;
    recalcAndRenderSettlement();
    return;
  }
  if(el.classList.contains('settlement-hole-stake-input')){
    var h2 = parseInt(el.dataset.hole, 10);
    var v2 = parseFloat(el.value);
    settlementGetOverride(h2).stake = (!isNaN(v2) && v2 >= 0) ? v2 : null;
    recalcAndRenderSettlement();
    return;
  }
});

var settlementTeamSelectEl = document.getElementById('settlementTeamSelect');
if(settlementTeamSelectEl){
  settlementTeamSelectEl.addEventListener('change', function(){
    settlementHoleOverrides = {};
    settlementCurrentTeam = null;
    settlementCurrentGlobalStake = null;
    settlementResultEl.innerHTML = '';
    if(settlementShareImageBtn) settlementShareImageBtn.style.display = 'none';
  });
}

var tabResultBtnForSettlement = document.getElementById('tabResultBtn');
if(tabResultBtnForSettlement){
  tabResultBtnForSettlement.addEventListener('click', function(){
    populateSettlementTeamSelect();
  });
}

/* ---------------- 정산 결과를 이미지로 만들어 SNS 공유 ----------------
   기존 스코어 결과의 "이미지로 복사" 기능(js/share.js)과 같은 방식(html2canvas
   + 클립보드 ClipboardItem)을 쓰되, 화면에 있는 입력창/버튼이 그대로 찍히면
   보기 좋지 않으니 공유용으로 깔끔한 텍스트 레이아웃을 별도로 만들어서
   화면 밖(-99999px)에 잠깐 그렸다가 캡처하고 바로 지웁니다. */
function buildSettlementCaptureHtml(team, data, globalStake){
  var totalsRows = data.activeIdxs.map(function(pi){
    var v = data.totals[pi];
    var color = v > 0 ? '#1a5fb4' : (v < 0 ? '#c0392b' : '#232336');
    return '<tr><td style="padding:6px 8px;text-align:left;border-bottom:1px solid #eee;color:#232336;">' + settlementPlayerLabel(team, pi) + '</td>' +
      '<td style="padding:6px 8px;text-align:right;border-bottom:1px solid #eee;color:' + color + ';font-weight:700;">' + settlementFormatSigned(v) + '</td></tr>';
  }).join('');

  var finalHtml = data.finalPairs.length ?
    data.finalPairs.map(function(fp){
      return '<div style="padding:6px 0;border-bottom:1px solid #eee;font-size:13px;">' +
        '<span style="color:#c0392b;font-weight:700;">' + settlementPlayerLabel(team, fp.payer) + '</span> → ' +
        '<span style="color:#1a5fb4;font-weight:700;">' + settlementPlayerLabel(team, fp.payee) + '</span> : <strong style="color:#232336;">' + settlementFormatPlain(fp.amount) + '</strong>' +
        '</div>';
    }).join('') :
    '<div style="color:#6b6f8a;font-size:12px;">' + escapeHtml(t('settlementAllEven')) + '</div>';

  var holesHtml = data.holeResults.map(function(hr){
    var amountsText = hr.amounts.length ?
      hr.amounts.map(function(am){
        return settlementPlayerLabel(team, am.payer) + '→' + settlementPlayerLabel(team, am.payee) + ' ' + settlementFormatPlain(am.amount);
      }).join(', ') :
      t('settlementHoleEven');
    var multNote = hr.effectiveMultiplier > 1 ? (' ×' + hr.effectiveMultiplier) : '';
    return '<div style="padding:4px 0;border-bottom:1px solid #f0f0f5;font-size:11px;color:#232336;">' +
      '<strong>' + hr.hole + '</strong>(P' + hr.par + multNote + ') ' + amountsText +
      '</div>';
  }).join('');

  return '' +
    '<div style="font-weight:700;font-size:16px;color:#312e81;margin-bottom:2px;">💰 ' + escapeHtml(team.name) + '</div>' +
    '<div style="font-size:12px;color:#6b6f8a;margin-bottom:6px;">' + escapeHtml(state.courseName || t('courseNameEmpty')) + ' · ' + escapeHtml(state.playDate || '') + '</div>' +
    '<div style="font-size:11px;color:#9295ac;margin-bottom:12px;">' + escapeHtml(t('settlementBaseStakeLabel')) + ' ' + Math.round(globalStake).toLocaleString() + '</div>' +
    '<div style="font-weight:700;font-size:13px;color:#312e81;margin-bottom:4px;">' + escapeHtml(t('settlementTotalsTitle')) + '</div>' +
    '<table style="width:100%;border-collapse:collapse;margin-bottom:14px;">' + totalsRows + '</table>' +
    '<div style="font-weight:700;font-size:13px;color:#312e81;margin-bottom:4px;">' + escapeHtml(t('settlementFinalTitle')) + '</div>' +
    '<div style="margin-bottom:14px;">' + finalHtml + '</div>' +
    '<div style="font-weight:700;font-size:13px;color:#312e81;margin-bottom:4px;">' + escapeHtml(t('settlementHolesTitle')) + '</div>' +
    '<div>' + holesHtml + '</div>';
}

function buildSettlementImageBlob(){
  var team = settlementCurrentTeam;
  var data = computeSettlement(team, settlementCurrentGlobalStake);
  if(!data) return Promise.reject(new Error('no settlement data'));

  var wrap = document.createElement('div');
  wrap.style.position = 'fixed';
  wrap.style.left = '-99999px';
  wrap.style.top = '0';
  wrap.style.width = '360px';
  wrap.style.background = '#ffffff';
  wrap.style.padding = '18px';
  wrap.innerHTML = buildSettlementCaptureHtml(team, data, settlementCurrentGlobalStake);
  document.body.appendChild(wrap);

  return html2canvas(wrap, { backgroundColor: '#ffffff', scale: 2 }).then(function(canvas){
    document.body.removeChild(wrap);
    return new Promise(function(resolve, reject){
      canvas.toBlob(function(blob){
        if(blob) resolve(blob); else reject(new Error('toBlob returned null'));
      }, 'image/png');
    });
  }).catch(function(err){
    if(wrap.parentNode) document.body.removeChild(wrap);
    throw err;
  });
}

function downloadSettlementImageBlob(blob){
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  var fname = (state.courseName || 'settlement').replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
  a.download = fname + '_정산_' + (state.playDate || '') + '.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(t('toastImageSaved'));
}

function copySettlementResultAsImage(){
  if(typeof html2canvas !== 'function'){
    toast(t('toastImageFail'));
    return;
  }
  if(!settlementCurrentTeam){
    toast(t('settlementNeedTwoPlayers'));
    return;
  }
  var blobPromise = buildSettlementImageBlob();

  /* Android Chrome은 클릭의 "user activation"이 살아있는 동안만
     navigator.clipboard.write()를 허용합니다. html2canvas 렌더링이 그
     시간을 넘기는 경우가 흔해서, resolve된 blob이 아니라 pending
     Promise 자체를 ClipboardItem에 바로 넘겨서 write()를 지금 즉시
     호출합니다 (기존 js/share.js의 이미지 복사 로직과 동일한 방식). */
  if(navigator.clipboard && window.ClipboardItem){
    var writePromise = null;
    try{
      writePromise = navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blobPromise })
      ]);
    } catch(e){
      writePromise = null;
    }
    if(writePromise){
      writePromise.then(function(){
        toast(t('toastImageCopied'));
      }).catch(function(){
        blobPromise.then(function(blob){
          navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(function(){
            toast(t('toastImageCopied'));
          }).catch(function(){ downloadSettlementImageBlob(blob); });
        }).catch(function(){ toast(t('toastImageFail')); });
      });
      return;
    }
  }

  blobPromise.then(function(blob){
    downloadSettlementImageBlob(blob);
  }).catch(function(){
    toast(t('toastImageFail'));
  });
}

if(settlementShareImageBtn){
  settlementShareImageBtn.addEventListener('click', function(){
    copySettlementResultAsImage();
  });
}

/* "불러오기"로 다른 라운드를 불러왔을 때, 직전에 계산해둔 정산 결과가 화면에
   그대로 남아있으면 마치 저장/자동 계산된 것처럼 보여 혼란을 줄 수 있습니다.
   실제로는 저장되지 않으며(위 주석 참고), 그냥 마지막 계산 결과가 지워지지
   않고 남아있던 것뿐이라 -- 다른 라운드를 불러오면 이 화면을 초기화해서
   "정산하기"를 다시 눌러야 새 라운드 기준으로 계산되도록 합니다. */
function resetSettlementOnRoundChange(){
  settlementHoleOverrides = {};
  settlementCurrentTeam = null;
  settlementCurrentGlobalStake = null;
  if(settlementResultEl) settlementResultEl.innerHTML = '';
  if(settlementShareImageBtn) settlementShareImageBtn.style.display = 'none';
  if(settlementStakeInput) settlementStakeInput.value = '';
  if(typeof populateSettlementTeamSelect === 'function') populateSettlementTeamSelect();
}
window.__sjSettlement = { resetOnRoundChange: resetSettlementOnRoundChange };
