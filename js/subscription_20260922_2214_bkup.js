(function(){
  function sj(id){ return document.getElementById(id); }
  var BASE = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net";
  var STATUS_URL = BASE + "/getMySubscription";
  var WEB_SUBSCRIBE_URL = BASE + "/webBillingSubscribe";
  var WEB_CANCEL_URL = BASE + "/webBillingCancel";

  /* RevenueCat 공개(Public) API 키 -- 비밀값이 아니라 앱에 그대로 담겨 배포되는 값입니다.
     RevenueCat 대시보드 > Project settings > API keys 에서 "Apple App Store" 플랫폼용
     Public API key를 발급받아 아래에 붙여넣어주세요. (아직 안 채우면 iOS 구독하기 버튼을
     눌렀을 때 "구독 준비 중" 메시지만 뜨고 실제 결제는 진행되지 않습니다.) */
  var REVENUECAT_IOS_API_KEY = "appl_XXXXXXXXXXXXXXXXXXXXXXXXXXXX";

  /* 포트원(PortOne) 콘솔(https://admin.portone.io/integration-v2/manage/channel)의
     "연동 정보"에서 확인 가능한 값들 -- 역시 비밀이 아니라 브라우저에 그대로 노출되는
     공개 식별자입니다. firebase-backend/functions/webBilling.js의 같은 이름 상수와
     반드시 정확히 같은 값이어야 합니다. */
  /* 2026-09-20: 포트원 테스트 채널("KG이니시스 테스트") 값으로 채움. 실연동 전환 시
     이 두 값을 실연동 채널의 Store ID/Channel Key로 반드시 교체해야 합니다. */
  var PORTONE_STORE_ID = "store-4a0faef7-5c25-4689-a9cc-fd61002a795c";
  var PORTONE_CHANNEL_KEY = "channel-key-9b1249e8-88bd-45d3-bb0f-ea684410cd9f";

  // App Store Connect에 등록한(그리고 RevenueCat에 연결해둔) 실제 상품 ID의 일부입니다.
  // firebase-backend/functions/subscription.js의 IOS_PRODUCT_PLAN과 반드시 맞춰주세요.
  // 2026-09-20: 애플은 자동갱신 구독 기간을 최대 1년까지만 허용합니다. pro_year1(1년)은
  // 애플도 지원하는 기간이라 여기 자동갱신 상품으로 등록해뒀지만, 아래
  // "com.skyjang.golfscorecard.pro.yearly"는 아직 실제로 App Store Connect에 만들지
  // 않은 자리표시자(placeholder)입니다 -- 상품을 만들고 RevenueCat에 연결한 뒤 실제
  // product ID로 바꿔주세요(그 전까지는 눌러도 "구독 준비 중" 메시지만 뜹니다, basic/pro와
  // 동일). pro_year2/pro_year3(2년/3년)는 애플 자동갱신 구독으로 만들 수 없어서(최대 1년
  // 제한) 여기 목록에 없고, 항상 웹(포트원) 결제 전용입니다.
  var IOS_PRODUCT_IDS = { basic: "com.skyjang.golfscorecard.basic.monthly", pro: "com.skyjang.golfscorecard.pro.monthly", pro_year1: "com.skyjang.golfscorecard.pro.yearly" };

  // 결제창(카드 등록) 및 주문명에 쓰는 요금제별 표시 이름.
  // firebase-backend/functions/subscription.js의 PLAN_DEFS.label과 맞춰둘 것.
  var PLAN_LABELS = { basic: "베이직 월간", pro: "프로 월간", pro_year1: "프로 1년", pro_year2: "프로 2년", pro_year3: "프로 3년" };

  var isNative = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform());
  var rcConfiguredForUid = null; // 마지막으로 configure()에 성공한 uid -- 로그인 계정이 바뀌면 다시 설정
  var lastStatus = null;
  var pendingReasonMessage = "";

  function getCurrentUser(){ return window.__sjAuth && window.__sjAuth.getCurrentUser(); }

  function withIdToken(){
    var u = getCurrentUser();
    if(!u) return Promise.reject(new Error("먼저 로그인해주세요."));
    return u.getIdToken();
  }

  function setStatus(el, text, isError){
    if(!el) return;
    el.className = "sj-status" + (isError ? " error" : "");
    el.textContent = text || "";
  }

  /* ---------------- 사용량 배너 (무료 12/20 남음 등) ---------------- */

  function renderQuotaBanner(status){
    var el = sj("sjQuotaBanner");
    if(!el) return;
    if(!status){ el.style.display = "none"; return; }
    var text;
    if(status.unlimited){
      text = (status.plan === "pro") ? "✅ 프로 구독 중 · 무제한 스캔" : "✅ 관리자 계정 · 무제한";
    } else if(status.plan === "basic"){
      var left = Math.max(0, (status.periodScansLimit || 0) - (status.periodScansUsed || 0));
      text = "💳 베이직 구독 중 · 이번 달 스캔 " + (status.periodScansUsed || 0) + "/" + status.periodScansLimit + "회 (남음 " + left + "회)";
    } else {
      var freeLeft = Math.max(0, (status.freeScansLimit || 0) - (status.freeScansUsed || 0));
      text = "🆓 무료 스캔 " + (status.freeScansUsed || 0) + "/" + status.freeScansLimit + "회 사용 (남음 " + freeLeft + "회)";
    }
    if(status.cancelAtPeriodEnd && status.expiresAt){
      text += " · 해지 예약됨 (" + status.expiresAt.slice(0, 10) + "까지 이용 가능)";
    }
    el.innerHTML = text + ' &nbsp;<button type="button" id="sjQuotaManageBtn" style="border:none;background:none;color:#2563eb;text-decoration:underline;cursor:pointer;font-size:inherit;padding:0;">구독 관리</button>';
    el.style.display = "";
    var manageBtn = sj("sjQuotaManageBtn");
    if(manageBtn){ manageBtn.addEventListener("click", function(){ openPaywall(""); }); }
  }

  function refreshStatus(){
    var u = getCurrentUser();
    if(!u){ lastStatus = null; renderQuotaBanner(null); return Promise.resolve(null); }
    return u.getIdToken().then(function(idToken){
      return fetch(STATUS_URL, { headers: { "Authorization": "Bearer " + idToken } });
    }).then(function(res){ return res.json(); })
      .then(function(data){
        lastStatus = data;
        renderQuotaBanner(data);
        return data;
      })
      .catch(function(e){ console.error("구독 상태 조회 실패", e); return null; });
  }

  /* ---------------- 결제창(모달) ---------------- */

  function openPaywall(reasonMessage){
    pendingReasonMessage = reasonMessage || "";
    var modal = sj("sjPaywallModal");
    var reasonEl = sj("sjPaywallReason");
    var statusEl = sj("sjPaywallStatus");
    if(reasonEl) reasonEl.textContent = pendingReasonMessage || "구독하면 계속 스캔할 수 있어요.";
    setStatus(statusEl, "");
    if(!modal) return;
    // 로그인 계정에 이름/이메일이 있으면 미리 채워준다 (카카오/네이버 로그인은
    // 이메일이 없는 경우가 많아 빈 채로 두고 사용자가 직접 입력하게 한다).
    var u0 = getCurrentUser();
    var nameEl0 = sj("sjPaywallName");
    var emailEl0 = sj("sjPaywallEmail");
    if(u0 && nameEl0 && !nameEl0.value){ nameEl0.value = u0.displayName || ""; }
    if(u0 && emailEl0 && !emailEl0.value){ emailEl0.value = u0.email || ""; }
    // 2년/3년 프로 장기구독은 웹(포트원) 전용이라 iOS 앱에서는 숨긴다
    // (애플은 자동갱신 구독 기간을 최대 1년까지만 허용).
    var webOnlyEls = document.querySelectorAll("[data-web-only]");
    Array.prototype.forEach.call(webOnlyEls, function(el){ el.style.display = isNative ? "none" : ""; });
    modal.classList.add("open");
    refreshStatus().then(function(status){
      var cancelBtn = sj("sjPaywallCancelBtn");
      var restoreBtn = sj("sjPaywallRestoreBtn");
      if(cancelBtn){ cancelBtn.style.display = (status && status.plan !== "free" && status.plan !== "admin" && !status.cancelAtPeriodEnd) ? "" : "none"; }
      if(restoreBtn){ restoreBtn.style.display = isNative ? "" : "none"; }
    });
  }

  function closePaywall(){
    var modal = sj("sjPaywallModal");
    if(modal) modal.classList.remove("open");
  }

  /* ---------------- iOS: RevenueCat ---------------- */

  function getRCPlugin(){
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases;
  }

  function ensureRevenueCatConfigured(uid){
    var Purchases = getRCPlugin();
    if(!isNative || !Purchases || !uid) return Promise.resolve(null);
    if(rcConfiguredForUid === uid) return Promise.resolve(Purchases);
    return Purchases.configure({ apiKey: REVENUECAT_IOS_API_KEY, appUserID: uid }).then(function(){
      rcConfiguredForUid = uid;
      return Purchases;
    }).catch(function(e){
      console.error("RevenueCat configure 실패", e);
      return null;
    });
  }

  function findIOSPackage(offerings, plan){
    var productId = IOS_PRODUCT_IDS[plan];
    if(!offerings || !offerings.current || !offerings.current.availablePackages) return null;
    var pkgs = offerings.current.availablePackages;
    for(var i=0; i<pkgs.length; i++){
      if(pkgs[i].product && pkgs[i].product.identifier === productId) return pkgs[i];
    }
    return null;
  }

  function purchaseIOS(plan, statusEl){
    var u = getCurrentUser();
    if(!u){ setStatus(statusEl, "먼저 로그인해주세요.", true); return; }
    setStatus(statusEl, "처리 중...");
    ensureRevenueCatConfigured(u.uid).then(function(Purchases){
      if(!Purchases){
        setStatus(statusEl, "구독 기능 준비 중입니다. 잠시 후 다시 시도해주세요.", true);
        return;
      }
      Purchases.getOfferings().then(function(offerings){
        var pkg = findIOSPackage(offerings, plan);
        if(!pkg){
          setStatus(statusEl, "상품 정보를 불러오지 못했습니다. 앱스토어 연결을 확인해주세요.", true);
          return;
        }
        return Purchases.purchasePackage({ aPackage: pkg }).then(function(){
          setStatus(statusEl, "구독이 완료되었습니다!");
          return refreshStatus();
        }).then(function(){ setTimeout(closePaywall, 900); });
      }).catch(function(e){
        if(e && e.userCancelled){ setStatus(statusEl, ""); return; }
        console.error("iOS 구독 실패", e);
        setStatus(statusEl, "구독에 실패했습니다: " + ((e && e.message) || e), true);
      });
    });
  }

  function restoreIOS(statusEl){
    var u = getCurrentUser();
    if(!u){ setStatus(statusEl, "먼저 로그인해주세요.", true); return; }
    setStatus(statusEl, "복원 중...");
    ensureRevenueCatConfigured(u.uid).then(function(Purchases){
      if(!Purchases){ setStatus(statusEl, "구독 기능 준비 중입니다.", true); return; }
      return Purchases.restorePurchases().then(function(){
        setStatus(statusEl, "구매 내역을 복원했습니다.");
        return refreshStatus();
      });
    }).catch(function(e){
      console.error("구매 복원 실패", e);
      setStatus(statusEl, "복원에 실패했습니다: " + ((e && e.message) || e), true);
    });
  }

  /* ---------------- 웹(브라우저): 포트원(PortOne) ---------------- */

  function purchaseWeb(plan, statusEl){
    var u = getCurrentUser();
    if(!u){ setStatus(statusEl, "먼저 로그인해주세요.", true); return; }
    if(!window.PortOne || typeof window.PortOne.requestIssueBillingKey !== "function"){
      setStatus(statusEl, "결제 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.", true);
      return;
    }
    // 2026-09-21: KG이니시스(카드 등록/PC)는 이름·연락처·이메일을 필수로 요구합니다
    // (누락 시 "issueId violates the rule REQUIRED" 등으로 실패). 카카오/네이버
    // 로그인 계정은 auth.js가 이메일을 저장하지 않아 u.email이 비어있는 경우가
    // 흔하므로, 로그인 계정 값 대신 결제창 입력칸(sjPaywallEmail) 값을 그대로 쓴다
    // (openPaywall()이 계정에 이메일이 있으면 미리 채워주고, 없으면 직접 입력받는다).
    var nameEl = sj("sjPaywallName");
    var phoneEl = sj("sjPaywallPhone");
    var emailEl = sj("sjPaywallEmail");
    var fullName = nameEl && nameEl.value ? nameEl.value.trim() : "";
    var phoneNumber = phoneEl && phoneEl.value ? phoneEl.value.trim() : "";
    var email = emailEl && emailEl.value ? emailEl.value.trim() : (u.email || "");
    if(!fullName){ setStatus(statusEl, "이름을 입력해주세요.", true); return; }
    if(!phoneNumber){ setStatus(statusEl, "연락처를 입력해주세요.", true); return; }
    if(!email){ setStatus(statusEl, "이메일을 입력해주세요.", true); return; }
    setStatus(statusEl, "카드 등록 창을 여는 중...");
    window.PortOne.requestIssueBillingKey({
      storeId: PORTONE_STORE_ID,
      channelKey: PORTONE_CHANNEL_KEY,
      billingKeyMethod: "CARD",
      issueId: "issue-" + u.uid + "-" + Date.now(),
      issueName: "골프 스코어카드 " + (PLAN_LABELS[plan] || "구독") + " 구독",
      customer: { customerId: u.uid, fullName: fullName, phoneNumber: phoneNumber, email: email }
    }).then(function(result){
      if(!result || result.code){
        setStatus(statusEl, "카드 등록에 실패했습니다: " + ((result && result.message) || "알 수 없는 오류"), true);
        return;
      }
      setStatus(statusEl, "결제를 진행하는 중...");
      return withIdToken().then(function(idToken){
        return fetch(WEB_SUBSCRIBE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
          body: JSON.stringify({ plan: plan, billingKey: result.billingKey })
        });
      }).then(function(res){ return res.json(); })
        .then(function(data){
          if(data && data.error){ throw new Error(data.error); }
          setStatus(statusEl, "구독이 완료되었습니다!");
          return refreshStatus();
        }).then(function(){ setTimeout(closePaywall, 900); });
    }).catch(function(e){
      console.error("웹 구독 실패", e);
      setStatus(statusEl, "구독에 실패했습니다: " + ((e && e.message) || e), true);
    });
  }

  function cancelWeb(statusEl){
    setStatus(statusEl, "해지 처리 중...");
    withIdToken().then(function(idToken){
      return fetch(WEB_CANCEL_URL, { method: "POST", headers: { "Authorization": "Bearer " + idToken } });
    }).then(function(res){ return res.json(); })
      .then(function(){
        setStatus(statusEl, "해지가 예약되었습니다. 남은 기간까지는 계속 이용할 수 있습니다.");
        return refreshStatus();
      })
      .catch(function(e){
        console.error("구독 해지 실패", e);
        setStatus(statusEl, "해지에 실패했습니다: " + ((e && e.message) || e), true);
      });
  }

  /* ---------------- 버튼 바인딩 ---------------- */

  function bindPaywallButtons(){
    var buyBtns = document.querySelectorAll(".sj-paywall-buy-btn");
    Array.prototype.forEach.call(buyBtns, function(btn){
      btn.addEventListener("click", function(){
        var plan = btn.dataset.plan;
        var statusEl = sj("sjPaywallStatus");
        if(isNative){ purchaseIOS(plan, statusEl); } else { purchaseWeb(plan, statusEl); }
      });
    });
    var restoreBtn = sj("sjPaywallRestoreBtn");
    if(restoreBtn){ restoreBtn.addEventListener("click", function(){ restoreIOS(sj("sjPaywallStatus")); }); }
    var cancelBtn = sj("sjPaywallCancelBtn");
    if(cancelBtn){ cancelBtn.addEventListener("click", function(){
      if(isNative){
        setStatus(sj("sjPaywallStatus"), "iOS 구독 해지는 iPhone의 설정 > Apple ID > 구독 화면에서 해주세요.", false);
        return;
      }
      cancelWeb(sj("sjPaywallStatus"));
    }); }
  }

  bindPaywallButtons();

  window.__sjSubscription = {
    openPaywall: openPaywall,
    closePaywall: closePaywall,
    refreshBanner: refreshStatus,
    getLastStatus: function(){ return lastStatus; }
  };
})();
