/* ---------------- 프로모션 쿠폰 등록 (사용자용, 2026-09-26 추가) ----------------
   관리자가 관리 페이지에서 발급한 쿠폰 코드를 로그인 후 등록하면 베이직/프로를
   관리자가 정한 기간만큼 무료로 받는다. 실제 검증/지급은 전부 서버
   (firebase-backend/functions/coupon.js의 redeemCoupon)에서 하고, 여기서는
   입력값을 보내고 결과 메시지만 보여준다. */
(function(){
  function sj(id){ return document.getElementById(id); }
  var BASE = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net";
  var REDEEM_URL = BASE + "/redeemCoupon";

  function getCurrentUser(){ return window.__sjAuth && window.__sjAuth.getCurrentUser(); }

  function fmtDate(iso){
    if(!iso) return "";
    try {
      var d = new Date(iso);
      return d.toLocaleDateString();
    } catch(e){ return iso; }
  }

  function redeem(){
    var input = sj("sjCouponCodeInput");
    var btn = sj("sjCouponSubmitBtn");
    var statusEl = sj("sjCouponStatus");
    var code = input && input.value ? input.value.trim() : "";
    if(!code){
      if(statusEl){ statusEl.className = "sj-status error"; statusEl.textContent = t("couponEmptyCode"); }
      return;
    }
    var user = getCurrentUser();
    if(!user){
      if(statusEl){ statusEl.className = "sj-status error"; statusEl.textContent = t("couponLoginRequired"); }
      return;
    }
    if(btn) btn.disabled = true;
    if(statusEl){ statusEl.className = "sj-status"; statusEl.textContent = t("couponRedeeming"); }
    user.getIdToken().then(function(idToken){
      return fetch(REDEEM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
        body: JSON.stringify({ code: code })
      });
    }).then(function(res){ return res.json(); })
      .then(function(data){
        if(data && data.error){ throw new Error(data.error); }
        if(statusEl){
          statusEl.className = "sj-status";
          statusEl.textContent = t("couponSuccess", data.planLabel || data.plan, fmtDate(data.expiresAt));
        }
        if(input) input.value = "";
        // 배너("무료 X/20 남음" 등)에 새 구독 상태가 바로 반영되도록 새로고침.
        if(window.__sjSubscription && window.__sjSubscription.refreshBanner){ window.__sjSubscription.refreshBanner(); }
      })
      .catch(function(e){
        console.error("쿠폰 등록 실패", e);
        if(statusEl){ statusEl.className = "sj-status error"; statusEl.textContent = t("couponFail", (e && e.message) || e); }
      })
      .then(function(){ if(btn) btn.disabled = false; });
  }

  function onOpen(){
    var statusEl = sj("sjCouponStatus");
    var input = sj("sjCouponCodeInput");
    if(statusEl){ statusEl.className = "sj-status"; statusEl.textContent = ""; }
    if(input) input.value = "";
  }

  var submitBtnEl = sj("sjCouponSubmitBtn");
  if(submitBtnEl){ submitBtnEl.addEventListener("click", redeem); }
  var codeInputEl = sj("sjCouponCodeInput");
  if(codeInputEl){
    codeInputEl.addEventListener("keydown", function(e){
      if(e.key === "Enter"){ redeem(); }
    });
  }

  window.__sjCoupon = { onOpen: onOpen };
})();
