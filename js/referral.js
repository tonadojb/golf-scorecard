/* ---------------- 친구추천 이벤트 + 룰렛 (2026-09-26 추가) ----------------
   - 내 uid 자체가 추천 코드다. 공유 링크는 "이 사이트 주소?ref=<내 uid>".
   - 친구가 이 링크로 들어와 로그인하면(onLogin) 서버에 추천인을 등록해두고,
     그 친구가 실제로 라운드를 1회 이상 저장해야 "확정 추천"으로 카운트된다
     (firebase-backend/functions/referral.js의 confirmReferralIfPending).
   - 확정 추천 3명마다 룰렛 1회, 무제한 반복.
   - 실제 당첨 추첨은 전부 서버(spinRoulette)에서 하고, 여기서는 서버가 돌려준
     결과에 맞춰 바퀴를 돌리는 애니메이션만 재생한다(조작 방지). */
(function(){
  function sj(id){ return document.getElementById(id); }
  var BASE = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net";
  var STATUS_URL = BASE + "/getReferralStatus";
  var APPLY_URL = BASE + "/applyReferral";
  var SPIN_URL = BASE + "/spinRoulette";

  var REF_STORAGE_KEY = "sj_referral_pending_ref_v1";

  function getCurrentUser(){ return window.__sjAuth && window.__sjAuth.getCurrentUser(); }
  function withIdToken(){
    var u = getCurrentUser();
    if(!u) return Promise.reject(new Error(t("referralLoginRequired")));
    return u.getIdToken();
  }

  /* ---------------- 추천 링크로 들어온 방문 캡처 ---------------- */

  // 이 스크립트가 로드되는(=페이지가 처음 열리는) 시점의 주소에 ?ref=<uid>가
  // 있으면 우선 sessionStorage에 저장해둔다. 카카오/네이버 로그인은 로그인
  // 서버를 거쳐 페이지 전체가 이동했다 돌아오는 방식이라, 돌아온 뒤의 주소에는
  // 이 쿼리가 남아있지 않을 수 있다 -- auth.js가 nativeLogin 값을 sessionStorage로
  // 넘기는 것과 동일한 이유/방식이다.
  (function captureRefParam(){
    try {
      var params = new URLSearchParams(window.location.search);
      var ref = params.get("ref");
      if(ref){ sessionStorage.setItem(REF_STORAGE_KEY, ref); }
    } catch(e) { /* 무시 -- 세션스토리지를 못 쓰는 환경이면 그냥 추천 등록을 건너뜀 */ }
  })();

  function getPendingRef(){
    try { return sessionStorage.getItem(REF_STORAGE_KEY) || null; } catch(e) { return null; }
  }
  function clearPendingRef(){
    try { sessionStorage.removeItem(REF_STORAGE_KEY); } catch(e) { /* 무시 */ }
  }

  // 로그인이 확인될 때마다(auth.js의 renderAuthUI) 호출된다. 대기 중인 추천
  // 코드가 있고, 본인 코드가 아니면 서버에 한 번 등록을 시도한다 -- 서버가
  // 이미 등록됐다고 답하든(ok:false) 새로 등록하든(ok:true) 어차피 재시도할
  // 필요가 없으므로 결과와 상관없이 캡처값을 지운다.
  function onLogin(user){
    var ref = getPendingRef();
    if(!ref || !user || ref === user.uid) return;
    user.getIdToken().then(function(idToken){
      return fetch(APPLY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
        body: JSON.stringify({ refUid: ref })
      });
    }).then(function(res){ return res.json(); })
      .catch(function(e){ console.error("추천 코드 등록 실패", e); })
      .then(function(){ clearPendingRef(); });
  }

  /* ---------------- 상태 조회 / 렌더 ---------------- */

  var lastEvent = null; // 마지막으로 받아온 event 뷰(경품표 포함) -- 스핀 애니메이션 계산에 재사용

  function referralLink(uid){
    return window.location.origin + window.location.pathname + "?ref=" + encodeURIComponent(uid);
  }

  function fmtDate(iso){
    if(!iso) return "";
    try {
      var d = new Date(iso);
      return d.toLocaleString();
    } catch(e){ return iso; }
  }

  function renderWheel(prizes){
    var host = sj("sjReferralWheel");
    if(!host) return;
    if(!prizes || !prizes.length){ host.innerHTML = ""; return; }
    var total = prizes.reduce(function(sum, p){ return sum + p.weight; }, 0) || 1;
    var colors = ["#4338ca", "#2a78d6", "#0d9488", "#eb6834", "#c026d3", "#ca8a04"];
    var gradientParts = [];
    var acc = 0;
    prizes.forEach(function(p, i){
      var start = (acc / total) * 360;
      acc += p.weight;
      var end = (acc / total) * 360;
      gradientParts.push(colors[i % colors.length] + " " + start.toFixed(2) + "deg " + end.toFixed(2) + "deg");
    });
    host.innerHTML =
      '<div class="sj-roulette-pointer">▼</div>' +
      '<div class="sj-roulette-wheel" id="sjRouletteWheelDisc" style="background:conic-gradient(' + gradientParts.join(",") + ');"></div>';
    // 경품 이름은 원판 안에 다 넣기보다(작은 화면에서 깨지기 쉬움) 아래 범례 목록으로 보여준다.
    var legend = sj("sjReferralPrizeList");
    if(legend){
      legend.innerHTML = '<div class="sj-referral-prize-title">' + escapeHtml(t("referralPrizeListTitle")) + '</div>' +
        prizes.map(function(p, i){
          var pct = Math.round((p.weight / total) * 1000) / 10;
          return '<div class="sj-referral-prize-row">' +
            '<span class="sj-referral-prize-swatch" style="background:' + colors[i % colors.length] + ';"></span>' +
            '<span>' + escapeHtml(p.label) + '</span><span class="sj-referral-prize-pct">' + pct + '%</span>' +
          '</div>';
        }).join("");
    }
  }

  function renderStatus(data){
    var noEventEl = sj("sjReferralNoEvent");
    var bodyEl = sj("sjReferralBody");
    if(!data || !data.event || !data.event.live){
      if(noEventEl) noEventEl.style.display = "";
      if(bodyEl) bodyEl.style.display = "none";
      return;
    }
    lastEvent = data.event;
    if(noEventEl) noEventEl.style.display = "none";
    if(bodyEl) bodyEl.style.display = "";

    var linkInput = sj("sjReferralLinkInput");
    if(linkInput) linkInput.value = referralLink(data.myReferralCode);

    var howEl = sj("sjReferralHow");
    if(howEl) howEl.textContent = t("referralHowItWorks", 3);

    var p = data.participant || { confirmedReferrals: 0, spinsAvailable: 0, referralsUntilNextSpin: 3 };
    var progressEl = sj("sjReferralProgress");
    if(progressEl) progressEl.textContent = t("referralProgressLabel", p.confirmedReferrals, p.referralsUntilNextSpin);
    var spinsEl = sj("sjReferralSpinsAvailable");
    if(spinsEl) spinsEl.textContent = t("referralSpinsAvailable", p.spinsAvailable);

    var endsEl = sj("sjReferralEndsAt");
    if(endsEl) endsEl.textContent = data.event.endAt ? t("referralEventEndsAt", fmtDate(data.event.endAt)) : "";

    var spinBtn = sj("sjReferralSpinBtn");
    if(spinBtn) spinBtn.disabled = !(p.spinsAvailable > 0);

    renderWheel(data.event.prizes);
  }

  function refreshStatus(){
    var u = getCurrentUser();
    if(!u){
      var noEventEl = sj("sjReferralNoEvent");
      var bodyEl = sj("sjReferralBody");
      if(noEventEl){ noEventEl.style.display = ""; noEventEl.textContent = t("referralLoginRequired"); }
      if(bodyEl) bodyEl.style.display = "none";
      return Promise.resolve(null);
    }
    return u.getIdToken().then(function(idToken){
      return fetch(STATUS_URL, { headers: { "Authorization": "Bearer " + idToken } });
    }).then(function(res){ return res.json(); })
      .then(function(data){
        var noEventEl = sj("sjReferralNoEvent");
        if(noEventEl) noEventEl.textContent = t("referralNoEventMsg");
        renderStatus(data);
        return data;
      })
      .catch(function(e){
        console.error("추천 이벤트 상태 조회 실패", e);
        return null;
      });
  }

  /* ---------------- 룰렛 스핀 애니메이션 ---------------- */

  function spin(){
    var btn = sj("sjReferralSpinBtn");
    var statusEl = sj("sjReferralSpinStatus");
    if(btn) btn.disabled = true;
    if(statusEl){ statusEl.className = "sj-status"; statusEl.textContent = t("referralSpinning"); }
    withIdToken().then(function(idToken){
      return fetch(SPIN_URL, { method: "POST", headers: { "Authorization": "Bearer " + idToken } });
    }).then(function(res){ return res.json(); })
      .then(function(data){
        if(data && data.error){ throw new Error(data.error); }
        animateWheelTo(data.prize);
        if(statusEl){ statusEl.className = "sj-status"; statusEl.textContent = t("referralSpinResult", data.prize.label); }
        return refreshStatus();
      })
      .catch(function(e){
        console.error("룰렛 스핀 실패", e);
        if(statusEl){ statusEl.className = "sj-status error"; statusEl.textContent = t("referralSpinFail", (e && e.message) || e); }
        if(btn) btn.disabled = false;
      });
  }

  // 당첨된 경품의 원판 구간 한가운데로 포인터가 오도록 회전각을 계산하고,
  // 몇 바퀴 더 돌려서(최소 4바퀴) 회전감을 준다. 실제 확률/당첨 여부는 이미
  // 서버 응답(data.prize)으로 결정된 뒤이므로, 여기서는 순수 연출일 뿐이다.
  function animateWheelTo(prize){
    var disc = sj("sjRouletteWheelDisc");
    if(!disc || !lastEvent || !lastEvent.prizes || !lastEvent.prizes.length){ return; }
    var prizes = lastEvent.prizes;
    var total = prizes.reduce(function(sum, p){ return sum + p.weight; }, 0) || 1;
    var acc = 0;
    var targetStart = 0, targetEnd = 0;
    for(var i = 0; i < prizes.length; i++){
      var start = (acc / total) * 360;
      acc += prizes[i].weight;
      var end = (acc / total) * 360;
      if(prizes[i].key === prize.key){ targetStart = start; targetEnd = end; break; }
    }
    var targetMid = (targetStart + targetEnd) / 2;
    // 포인터는 항상 위쪽(0deg, 12시 방향)을 가리키므로, 원판을 (360 - targetMid)만큼
    // 돌려야 그 구간이 포인터 밑으로 온다. 여기에 4바퀴를 더해 회전감을 준다.
    var rotation = 360 * 4 + (360 - targetMid);
    disc.style.transition = "none";
    disc.style.transform = "rotate(0deg)";
    // 강제 리플로우로 위 초기화를 실제로 적용시킨 뒤 애니메이션을 시작한다.
    void disc.offsetWidth;
    disc.style.transition = "transform 3.2s cubic-bezier(0.17,0.67,0.32,1.02)";
    disc.style.transform = "rotate(" + rotation + "deg)";
  }

  /* ---------------- 링크 복사 ---------------- */

  function copyReferralLink(){
    var input = sj("sjReferralLinkInput");
    if(!input || !input.value) return;
    var statusEl = sj("sjReferralCopyStatus");
    var done = function(ok){
      if(!statusEl) return;
      statusEl.className = "sj-status" + (ok ? "" : " error");
      statusEl.textContent = ok ? t("referralCopied") : t("referralCopyFail");
    };
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(input.value).then(function(){ done(true); }).catch(function(){ done(false); });
      return;
    }
    try {
      input.select();
      document.execCommand("copy");
      done(true);
    } catch(e){ done(false); }
  }

  function onOpen(){
    var statusEl = sj("sjReferralSpinStatus");
    var copyStatusEl = sj("sjReferralCopyStatus");
    if(statusEl){ statusEl.className = "sj-status"; statusEl.textContent = ""; }
    if(copyStatusEl){ copyStatusEl.className = "sj-status"; copyStatusEl.textContent = ""; }
    refreshStatus();
  }

  var spinBtnEl = sj("sjReferralSpinBtn");
  if(spinBtnEl){ spinBtnEl.addEventListener("click", spin); }
  var copyBtnEl = sj("sjReferralCopyBtn");
  if(copyBtnEl){ copyBtnEl.addEventListener("click", copyReferralLink); }

  window.__sjReferral = {
    onOpen: onOpen,
    onLogin: onLogin
  };
})();
