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
     이 값을 실연동 채널의 Store ID로 반드시 교체해야 합니다. */
  var PORTONE_STORE_ID = "store-4a0faef7-5c25-4689-a9cc-fd61002a795c";

  /* 2026-09-22(2차) 추가: 카카오페이/네이버페이(결제형)를 추가하면서 카드 전용
     단일 채널 키를 결제수단별 맵으로 바꿨다. 포트원은 결제수단(정확히는 PG
     계약)마다 별도의 "채널"이라 채널 키가 서로 다르고, 빌링키 발급 시 쓴 채널과
     실제 청구(재청구 포함) 시 채널이 반드시 같아야 한다. 카카오페이/네이버페이는
     아직 포트원 콘솔에서 실채널 심사가 끝나지 않아 아래 두 값은 플레이스홀더다 --
     콘솔에서 채널을 만들면 나오는 (심사 전이면 테스트) Channel Key로 교체해야
     실제로 결제가 된다. firebase-backend/functions/webBilling.js의
     PORTONE_CHANNEL_KEYS와 정확히 같은 값이어야 한다. */
  var PORTONE_CHANNEL_KEY_CARD = "channel-key-9b1249e8-88bd-45d3-bb0f-ea684410cd9f";
  var PORTONE_CHANNEL_KEY_KAKAOPAY = "channel-key-KAKAOPAY_PLACEHOLDER";
  var PORTONE_CHANNEL_KEY_NAVERPAY = "channel-key-NAVERPAY_PLACEHOLDER";

  // 결제수단별 { 채널 키, requestIssueBillingKey에 넘길 billingKeyMethod }.
  // 카카오페이/네이버페이는 포트원 문서상 간편결제(EASY_PAY) 방식으로 빌링키를
  // 발급받는다. PLACEHOLDER가 남아있는 동안은 purchaseWeb()이 결제를 막고
  // 안내 메시지를 띄운다.
  var PAY_METHOD_CHANNELS = {
    CARD: { channelKey: PORTONE_CHANNEL_KEY_CARD, billingKeyMethod: "CARD", label: "카드" },
    KAKAOPAY: { channelKey: PORTONE_CHANNEL_KEY_KAKAOPAY, billingKeyMethod: "EASY_PAY", label: "카카오페이" },
    NAVERPAY: { channelKey: PORTONE_CHANNEL_KEY_NAVERPAY, billingKeyMethod: "EASY_PAY", label: "네이버페이" }
  };

  // App Store Connect에 등록한(그리고 RevenueCat에 연결해둔) 실제 상품 ID의 일부입니다.
  // firebase-backend/functions/subscription.js의 IOS_PRODUCT_PLAN과 반드시 맞춰주세요.
  // 2026-09-22: 장기(1년/2년) 요금제를 웹/iOS 양쪽에서 전부 제거했고, 뒤이어
  // 추가했던 프로 1/2/3개월 단건결제(웹 전용) 옵션도 다시 없앴습니다. 이제
  // 웹/iOS 모두 basic/pro 월간 자동갱신 구독 두 가지만 남습니다.
  var IOS_PRODUCT_IDS = { basic: "com.skyjang.golfscorecard.basic.monthly", pro: "com.skyjang.golfscorecard.pro.monthly" };

  // 결제창(카드 등록) 및 주문명에 쓰는 요금제별 표시 이름.
  // firebase-backend/functions/subscription.js의 PLAN_DEFS.label과 맞춰둘 것.
  var PLAN_LABELS = { basic: "베이직 월간", pro: "프로 월간" };

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

  /* 2026-09-22(2차) 추가: lastStatus는 메모리 변수라 "페이지를 새로고침한
     직후 곧바로 OCR 아이콘을 누르는" 가장 흔한 테스트 상황에서는 아무 도움이
     안 됐다 -- 새로고침하면 lastStatus가 다시 null로 초기화되고, 로그인 직후
     preloadStatus()가 네트워크(토큰 갱신 + 클라우드 함수 호출)를 끝내기 전에
     사용자가 먼저 클릭해버리면 예전과 똑같이 기다리게 된다. 그래서 마지막으로
     받은 값을 uid별로 localStorage에도 저장해두고, 새로고침 직후에는 네트워크
     응답을 기다리지 않고 이 캐시로 먼저 배너를 그린다(값이 사실과 다를 가능성은
     매우 낮고, 실제 최신 값은 바로 이어서 백그라운드로 다시 받아와 조용히
     덮어쓴다). */
  function cacheKey(uid){ return "sj_quota_status_v1_" + uid; }
  function loadCachedStatus(uid){
    try{
      var raw = window.localStorage && localStorage.getItem(cacheKey(uid));
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  }
  function saveCachedStatus(uid, data){
    try{ if(window.localStorage){ localStorage.setItem(cacheKey(uid), JSON.stringify(data)); } }catch(e){}
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
        saveCachedStatus(u.uid, data);
        return data;
      })
      .catch(function(e){ console.error("구독 상태 조회 실패", e); return null; });
  }

  /* 로그인 상태가 확인되는 즉시(auth.js) 동기적으로 호출된다. localStorage
     읽기는 네트워크를 타지 않으므로 즉시 끝나고, 캐시가 있으면 그 자리에서
     바로 배너를 그린다 -- 새로고침 직후 첫 클릭에도 지연이 없다. */
  function hydrateFromCache(uid){
    if(lastStatus) return; // 이미 이번 세션에서 최신 값을 받은 상태라면 캐시로 덮어쓸 필요 없음
    var cached = loadCachedStatus(uid);
    if(cached){ lastStatus = cached; renderQuotaBanner(cached); }
  }

  /* 2026-09-22 추가: OCR 모달을 열 때마다 refreshStatus()를 새로 호출하면
     ID 토큰 갱신 + 클라우드 함수 호출(네트워크 왕복 두 번)이 끝날 때까지
     배너가 비어있어서 체감 지연이 있었다. 직전에 조회해둔(또는 캐시로
     읽어들인) lastStatus가 있으면 그걸로 먼저 즉시 배너를 그리고(값이
     바뀌었을 가능성은 낮으니 대부분 그대로 맞다), 최신 값은 이 함수가 그대로
     내부적으로 호출하는 refreshStatus()가 백그라운드에서 가져와 조용히 다시
     그린다 -- 화면 깜빡임 없이 지연만 없어진다. ui-modals.js가 모달을 열 때마다
     이 함수를 부른다(과거의 refreshBanner를 대체). */
  function refreshBannerFast(){
    if(lastStatus){ renderQuotaBanner(lastStatus); }
    return refreshStatus();
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

    // 2026-09-22(2차) 추가: 결제창의 결제수단 라디오 버튼(name="sjPayMethod")에서
    // 선택된 값을 읽는다. 라디오가 아직 안 그려졌거나(구버전 캐시 등) 선택된 값이
    // 없으면 기존과 동일하게 카드로 취급한다.
    var payMethodEl = document.querySelector('input[name="sjPayMethod"]:checked');
    var payMethod = (payMethodEl && PAY_METHOD_CHANNELS[payMethodEl.value]) ? payMethodEl.value : "CARD";
    var channelConf = PAY_METHOD_CHANNELS[payMethod];
    if(/PLACEHOLDER/.test(channelConf.channelKey)){
      setStatus(statusEl, channelConf.label + " 결제는 아직 채널 심사가 끝나지 않아 준비 중입니다. 카드로 결제해주세요.", true);
      return;
    }
    setStatus(statusEl, channelConf.label + " 등록 창을 여는 중...");
    window.PortOne.requestIssueBillingKey({
      storeId: PORTONE_STORE_ID,
      channelKey: channelConf.channelKey,
      billingKeyMethod: channelConf.billingKeyMethod,
      issueId: "issue-" + u.uid + "-" + Date.now(),
      issueName: "골프 스코어카드 " + (PLAN_LABELS[plan] || "구독") + " 구독",
      customer: { customerId: u.uid, fullName: fullName, phoneNumber: phoneNumber, email: email }
    }).then(function(result){
      if(!result || result.code){
        setStatus(statusEl, channelConf.label + " 등록에 실패했습니다: " + ((result && result.message) || "알 수 없는 오류"), true);
        return;
      }
      setStatus(statusEl, "결제를 진행하는 중...");
      return withIdToken().then(function(idToken){
        return fetch(WEB_SUBSCRIBE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
          body: JSON.stringify({ plan: plan, billingKey: result.billingKey, payMethod: payMethod })
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
    refreshBanner: refreshBannerFast,
    // 2026-09-22 추가: 로그인 직후(auth.js의 renderAuthUI)에 미리 한 번
    // 조회해서 lastStatus를 채워두는 용도 -- 이렇게 하면 사용자가 실제로
    // OCR 모달을 열 때는 이미 캐시가 준비되어 있어 refreshBannerFast()가
    // 항상 즉시 그릴 수 있다. 배너를 직접 그리지 않는 "조용한" 버전이라
    // refreshStatus를 그대로 노출한다.
    preloadStatus: refreshStatus,
    hydrateFromCache: hydrateFromCache,
    getLastStatus: function(){ return lastStatus; }
  };
})();
