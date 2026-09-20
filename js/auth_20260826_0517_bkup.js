import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, initializeAuth, indexedDBLocalPersistence, GoogleAuthProvider, signInWithPopup, signInWithCredential, signInWithCustomToken, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

var firebaseConfig = {
  apiKey: "AIzaSyAMbBZIdxDYom7fWpsTrmhgdhNau6xtRHU",
  authDomain: "skyjang-golfscore.firebaseapp.com",
  projectId: "skyjang-golfscore",
  storageBucket: "skyjang-golfscore.firebasestorage.app",
  messagingSenderId: "162951012751",
  appId: "1:162951012751:web:f16dd3320ee74fc9a02bfa",
  measurementId: "G-DE6K44EJ9M"
};

// 카카오 로그인은 firebase-backend/functions/kakaoAuth.js 로 연결되어 있습니다.
// 그 함수가 전달받은 액세스 토큰을 카카오 서버에 검증한 뒤,
// admin.auth().createCustomToken(uid) 로 발급한 Firebase 커스텀 토큰을
// { customToken, displayName, photoURL } 형태의 JSON으로 응답합니다.
var KAKAO_AUTH_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/kakaoAuth";
// 네이버 로그인은 firebase-backend/functions/naverAuth.js 로 연결되어 있습니다.
// 그 함수가 전달받은 액세스 토큰을 네이버 서버(/v1/nid/me)에 검증한 뒤,
// admin.auth().createCustomToken(uid) 로 발급한 Firebase 커스텀 토큰을
// { customToken, displayName, photoURL } 형태의 JSON으로 응답합니다.
var NAVER_AUTH_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/naverAuth";
// 로그인 직후 및 로그인 유지 중 주기적으로 호출해서 관리자 페이지의
// "접속중"/최근 접속 표시(lastSeenAt 기반)를 갱신하는 용도입니다.
var PING_PRESENCE_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/pingPresence";
// 사용자가 직접 "로그아웃" 버튼을 눌렀을 때 lastSeenAt을 즉시 지우는 용도입니다
// (그냥 로컬에서 signOut만 하면 서버는 그 사실을 몰라서, 관리자 페이지에는
// 마지막 하트비트 이후 5분(ONLINE_WINDOW_MS)이 지나야 오프라인으로 보였습니다).
var CLEAR_PRESENCE_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/clearPresence";
// 로그인 버튼을 눌러 실제로 로그인에 성공했을 때 한 번 호출해서 관리자
// 페이지의 "이용 횟수"(로그인 횟수)를 늘리는 용도입니다. pingPresence와
// 달리 세션 유지 중에는 다시 부르지 않습니다 -- 로그인 자체를 세는 값이지
// 접속 여부를 세는 값이 아니기 때문입니다.
var RECORD_LOGIN_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/recordLogin";

var KAKAO_JS_KEY = "e73a39b4f944bc251c449f0535d5f39b";
var NAVER_CLIENT_ID = "jdkW2uYK23DCwxrCeVWu";

// 관리자 페이지(🛠)는 이 이메일로 로그인했을 때만 노출됩니다. 실제 접근 제어는
// 서버(firebase-backend/functions/access.js의 ADMIN_EMAIL)에서 한 번 더
// 검증하므로, 이 값은 어디까지나 화면 표시용 UI 편의 체크입니다.
var ADMIN_EMAIL = "tonadojb@gmail.com";

var app = initializeApp(firebaseConfig);
// 네이티브(Capacitor iOS) 앱 안에서는 Firebase Auth의 기본 지속성(persistence)
// 방식이 WKWebView 안에서 signInWithCredential() 같은 호출을 응답 없이 무한
// 대기하게 만드는 경우가 있습니다 (구글 로그인 화면이 뜨고 닫힌 뒤 "로그인
// 중..."에서 멈추던 문제의 실제 원인으로 보입니다). @capacitor-firebase/
// authentication 공식 문서에서도 네이티브 플랫폼에서는 이렇게 indexedDBLocalPersistence를
// 명시적으로 지정하라고 안내하고 있어서, 아래에서 웹(GitHub Pages)과 네이티브 앱을
// 구분해서 다르게 초기화합니다. window.Capacitor는 네이티브 앱 안에서만 주입되므로
// 웹사이트에서는 항상 기존과 동일하게 getAuth(app)를 그대로 씁니다.
var __sjIsNativeApp = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform());
var auth = __sjIsNativeApp ? initializeAuth(app, { persistence: indexedDBLocalPersistence }) : getAuth(app);
var db = getFirestore(app);
var currentUser = null;

/* iOS(Capacitor) 앱 안에서 실행 중인지 판별합니다. Capacitor 런타임이 앱 안에서
   자동으로 window.Capacitor를 주입해주므로, 웹사이트(GitHub Pages)에서는 항상
   false -- 아래 네이티브 전용 분기들은 웹 동작에 전혀 영향을 주지 않습니다. */
function isNativeApp(){
  return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform());
}

function sj(id){ return document.getElementById(id); }

function setStatus(msg, isError){
  var status = sj("sjAuthStatus");
  if(!status) return;
  status.className = isError ? "sj-status error" : "sj-status";
  status.textContent = msg;
}

function saveUserProfile(user, extra){
  var data = Object.assign({
    subscriptionTier: "free",
    subscriptionExpiresAt: null,
    updatedAt: serverTimestamp()
  }, extra || {});
  return setDoc(doc(db, "users", user.uid), data, { merge: true });
}

/* 로그인 흐름을 막지 않도록 결과를 기다리지 않고(best-effort) 호출합니다 --
   실패해도 로그인 자체는 정상 진행되어야 합니다. */
function recordLoginPing(user){
  if(!user) return;
  user.getIdToken().then(function(idToken){
    return fetch(RECORD_LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken }
    });
  }).catch(function(){ /* best-effort -- 실패해도 무시 */ });
}

function closeAuthModal(){
  var m = sj("sjAuthModal");
  if(m) m.classList.remove("open");
}

/* 로그인 자체(saveUserProfile)는 클라이언트 Firestore SDK로 직접 쓰기 때문에
   관리자 페이지가 보는 lastSeenAt을 건드리지 않습니다 -- 그래서 로그인만 하고
   스캔/저장/불러오기를 하지 않으면 관리자 목록에 전혀 반영되지 않았습니다.
   pingPresence()가 그 lastSeenAt을 직접 갱신해서 이 간극을 메웁니다. */
var presenceIntervalId = null;

function pingPresence(){
  if(!currentUser) return;
  currentUser.getIdToken().then(function(idToken){
    return fetch(PING_PRESENCE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken }
    });
  }).then(function(res){ return res.json(); })
    .then(function(data){
      if(data && data.blocked){ handleBlocked(data.error); }
    })
    .catch(function(){ /* best-effort presence ping -- 실패해도 무시 */ });
}

// 5분짜리 "접속중" 판정 창(ONLINE_WINDOW_MS, 서버)보다 여유 있게 4분마다
// 갱신해서, 다른 활동이 없어도 로그인 유지 중에는 계속 접속중으로 보이게 합니다.
function startPresenceHeartbeat(){
  stopPresenceHeartbeat();
  pingPresence();
  presenceIntervalId = setInterval(pingPresence, 4 * 60 * 1000);
}
function stopPresenceHeartbeat(){
  if(presenceIntervalId){ clearInterval(presenceIntervalId); presenceIntervalId = null; }
}

// ---- Google 로그인 ----
// signInWithRedirect도 실제로는 동작하지 않았습니다 (앱 안에서는 "Google
// 로그인 중..."에서 멈춘 채로 반응이 없었음) -- 구글이 임베디드 웹뷰에서의
// 로그인 자체를 정책적으로 차단하기 때문에, 팝업이든 리다이렉트든 웹뷰 안에서
// 하는 방식은 애초에 통하지 않습니다. 그래서 앱 안에서는
// @capacitor-firebase/authentication 플러그인으로 iOS 네이티브 구글 로그인
// 화면(웹뷰가 아닌 진짜 시스템 로그인 창)을 띄우고, 거기서 받은 idToken을
// Firebase 웹 SDK의 signInWithCredential에 그대로 넘겨서 로그인합니다
// (capacitor.config.json의 skipNativeAuth:true 설정 덕분에 네이티브 Firebase
// Auth 레이어는 건드리지 않고, 지금 쓰고 있는 웹 SDK의 auth 객체 하나로만
// 로그인 상태가 관리됩니다). 웹사이트(GitHub Pages)에는 이 네이티브 플러그인이
// 없으므로 기존 signInWithPopup 방식을 그대로 씁니다.
// 네이티브 로그인 호출이 응답 없이 무한 대기하는 상황(이번에 겪었던 "로그인
// 중..."에서 멈추는 문제)을 대비한 안전장치입니다. 정해진 시간 안에 응답이
// 없으면 그냥 무한정 멈춰있는 대신 구체적인 오류 메시지를 보여줘서, 다음에
// 비슷한 문제가 생기더라도 어느 단계에서 멈췄는지 바로 알 수 있게 합니다.
function withTimeout(promise, ms, label){
  return new Promise(function(resolve, reject){
    var settled = false;
    var timer = setTimeout(function(){
      if(settled) return;
      settled = true;
      reject(new Error((label || "작업") + "이(가) " + Math.round(ms/1000) + "초 안에 응답하지 않았습니다 (시간 초과)."));
    }, ms);
    promise.then(function(v){
      if(settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    }, function(e){
      if(settled) return;
      settled = true;
      clearTimeout(timer);
      reject(e);
    });
  });
}

function finishGoogleLogin(userPromise){
  userPromise.then(function(result){
    recordLoginPing(result.user);
    return saveUserProfile(result.user, { displayName: result.user.displayName || "", provider: "google" });
  }).then(function(){
    setStatus("로그인 성공!");
    closeAuthModal();
  }).catch(function(e){
    setStatus("오류: " + (e && e.message ? e.message : e), true);
  });
}

var googleBtn = sj("sjGoogleLogin");
if(googleBtn){
  googleBtn.addEventListener("click", function(){
    setStatus("Google 로그인 중...");
    if(isNativeApp()){
      var FirebaseAuthentication = window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseAuthentication;
      if(!FirebaseAuthentication){
        setStatus("오류: 네이티브 구글 로그인 플러그인을 찾을 수 없습니다.", true);
        return;
      }
      finishGoogleLogin(
        withTimeout(FirebaseAuthentication.signInWithGoogle(), 25000, "네이티브 구글 로그인").then(function(nativeResult){
          var idToken = nativeResult && nativeResult.credential && nativeResult.credential.idToken;
          if(!idToken){ throw new Error("구글 로그인 토큰을 가져오지 못했습니다."); }
          var credential = GoogleAuthProvider.credential(idToken);
          return withTimeout(signInWithCredential(auth, credential), 15000, "Firebase 로그인 연결");
        })
      );
      return;
    }
    var provider = new GoogleAuthProvider();
    finishGoogleLogin(signInWithPopup(auth, provider));
  });
}

// ---- 카카오 로그인 ----
function ensureKakaoInit(){
  if(window.Kakao && !window.Kakao.isInitialized()){
    window.Kakao.init(KAKAO_JS_KEY);
  }
}
var kakaoBtn = sj("sjKakaoLogin");
if(kakaoBtn){
  kakaoBtn.addEventListener("click", function(){
    if(!window.Kakao){
      setStatus("카카오 SDK를 불러오지 못했습니다.", true);
      return;
    }
    ensureKakaoInit();
    setStatus("카카오 로그인 중...");
    window.Kakao.Auth.login({
      success: function(authObj){
        fetch(KAKAO_AUTH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken: authObj.access_token })
        }).then(function(res){ return res.json(); })
          .then(function(data){
            if(data && data.error){ throw new Error(data.error); }
            return signInWithCustomToken(auth, data.customToken).then(function(result){
              return { result: result, displayName: data.displayName, photoURL: data.photoURL };
            });
          }).then(function(o){
            // custom-token sign-ins don't carry a profile, unlike Google's
            // popup flow -- fill it in from what kakaoAuth looked up.
            recordLoginPing(o.result.user);
            var profileUpdate = {};
            if(o.displayName) profileUpdate.displayName = o.displayName;
            if(o.photoURL) profileUpdate.photoURL = o.photoURL;
            var p = Object.keys(profileUpdate).length ? updateProfile(o.result.user, profileUpdate) : Promise.resolve();
            return p.then(function(){
              return saveUserProfile(o.result.user, { provider: "kakao", displayName: o.displayName || "" });
            });
          }).then(function(){
            // updateProfile이 끝난 뒤에도 onAuthStateChanged가 다시 안 불려서
            // 직접 한 번 더 화면을 갱신해줍니다 (auth.currentUser는 이 시점엔
            // updateProfile 결과가 반영된 최신 상태).
            renderAuthUI(auth.currentUser);
            setStatus("로그인 성공!");
            closeAuthModal();
          }).catch(function(e){
            setStatus("오류: " + (e && e.message ? e.message : e), true);
          });
      },
      fail: function(err){
        // (임시 진단용) 실제로 이 페이지가 어떤 주소(origin)에서 실행 중인지
        // 함께 보여줍니다 -- 카카오 개발자센터에 등록한 도메인과 정확히
        // 같은 값인지 확인하기 위한 것으로, 문제 해결 후 제거해도 됩니다.
        setStatus("카카오 로그인 실패: " + JSON.stringify(err) + " / origin: " + window.location.origin, true);
      }
    });
  });
}

// ---- 네이버 로그인 ----
// 예전 코드는 팝업(isPopup:true) 방식이었는데, 네이버가 처음 보는 기기/브라우저에서
// 로그인할 때 보안을 위해 이메일로 "본인 확인"을 요청하는 경우가 있고, 그 인증 링크를
// (아이폰 메일 앱 등) 별도의 탭/앱에서 열면 원래 로그인 팝업 창이 완료 신호를 못 받아
// 로그인이 중간에 끊기는 문제가 있었습니다. 그래서 페이지 전체를 네이버 로그인 화면으로
// 이동시키는 방식(isPopup:false)으로 바꿨습니다 -- 이러면 이메일 인증을 포함한 모든 과정이
// 하나의 탭 안에서 끝나고, 완료되면 네이버가 다시 이 페이지로 돌려보내 줍니다.
//
// 또한 예전 코드는 window.__sjHandleNaverToken 이라는 함수를 만들어두기만 했을 뿐 그
// 함수를 실제로 호출하는 코드가 어디에도 없었습니다 (SDK가 자동으로 불러주는 함수가
// 아니었음) -- 그래서 로그인 자체는 네이버 쪽에서 성공해도 우리 페이지가 그 결과를 전혀
// 받아오지 못하고 아무 반응이 없었던 것입니다. 아래 코드는 로그인 후 이 페이지로 돌아왔을
// 때 getLoginStatus()로 로그인 여부를 직접 확인하고, 액세스 토큰을 꺼내 처리합니다.
// 네이버 콜백 URL은 네이버 개발자센터에 등록해둔 값과 정확히 일치해야 합니다.
// 네이티브 앱 안에서는 아래 capacitor.config.json의 iosScheme:"https" 설정 덕분에
// 항상 "https://localhost/" 로 고정되므로(페이지 경로가 무엇이든), 매번 같은
// 값이 나오도록 origin + "/" 로 고정해서 씁니다. 웹사이트(GitHub Pages)에서는
// 기존처럼 실제 주소(origin + pathname)를 그대로 씁니다.
var naverLoginInstance = null;
if(window.naver && window.naver.LoginWithNaverId){
  naverLoginInstance = new window.naver.LoginWithNaverId({
    clientId: NAVER_CLIENT_ID,
    callbackUrl: isNativeApp() ? (window.location.origin + "/") : (window.location.origin + window.location.pathname),
    isPopup: false,
    callbackHandle: true
  });
  naverLoginInstance.init();
}

function extractNaverAccessToken(){
  // SDK 인스턴스에 실려오는 값을 우선 시도하고, 혹시 못 찾으면 주소창의
  // "#access_token=..." 해시에서 직접 꺼내는 것으로 한 번 더 확인합니다.
  if(naverLoginInstance && naverLoginInstance.accessToken && naverLoginInstance.accessToken.accessToken){
    return naverLoginInstance.accessToken.accessToken;
  }
  var hash = window.location.hash || "";
  if(hash.indexOf("access_token=") !== -1){
    var params = new URLSearchParams(hash.replace(/^#/, ""));
    return params.get("access_token");
  }
  return null;
}

function handleNaverLoginSuccess(){
  var accessToken = extractNaverAccessToken();
  if(!accessToken){
    setStatus("네이버 로그인 토큰을 확인하지 못했습니다.", true);
    return;
  }
  setStatus("네이버 로그인 처리 중...");
  fetch(NAVER_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken: accessToken })
  }).then(function(res){ return res.json(); })
    .then(function(data){
      if(data && data.error){ throw new Error(data.error); }
      return signInWithCustomToken(auth, data.customToken).then(function(result){
        return { result: result, displayName: data.displayName, photoURL: data.photoURL };
      });
    }).then(function(o){
      // custom-token sign-ins don't carry a profile, unlike Google's
      // popup flow -- fill it in from what naverAuth looked up.
      recordLoginPing(o.result.user);
      var profileUpdate = {};
      if(o.displayName) profileUpdate.displayName = o.displayName;
      if(o.photoURL) profileUpdate.photoURL = o.photoURL;
      var p = Object.keys(profileUpdate).length ? updateProfile(o.result.user, profileUpdate) : Promise.resolve();
      return p.then(function(){
        return saveUserProfile(o.result.user, { provider: "naver", displayName: o.displayName || "" });
      });
    }).then(function(){
      // updateProfile이 끝난 뒤에도 onAuthStateChanged가 다시 안 불려서
      // 직접 한 번 더 화면을 갱신해줍니다.
      renderAuthUI(auth.currentUser);
      setStatus("로그인 성공!");
      closeAuthModal();
      // 주소창에 남은 토큰 해시를 지워서 새로고침해도 다시 로그인 처리가
      // 반복되지 않도록 정리합니다.
      if(window.history && window.history.replaceState){
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }).catch(function(e){
      setStatus("오류: " + (e && e.message ? e.message : e), true);
    });
}

// 네이버 로그인 후 이 페이지로 돌아왔을 때(=주소 뒤에 "#access_token=..."이 실제로
// 붙어있을 때)만 로그인 처리를 이어갑니다.
//
// 처음엔 naverLoginInstance.getLoginStatus()로 확인했는데, 이 함수는 "네이버 쪽에
// 로그인 세션이 지금 남아있냐"를 확인하는 것이라서, 우리 앱에서 로그아웃(Firebase
// signOut)해도 네이버 자체 세션은 그대로 남아있어 페이지를 새로고침할 때마다 계속
// "로그인됨"으로 판단되어 자동으로 다시 로그인되어버리는 문제가 있었습니다
// (로그아웃해도 로그인 상태가 유지되는 것처럼 보였던 원인). 방금 리다이렉트되어
// 돌아온 순간에만 정확히 반응하도록 조건을 바꿨습니다.
if(window.location.hash && window.location.hash.indexOf("access_token=") !== -1){
  handleNaverLoginSuccess();
}

var naverBtn = sj("sjNaverLogin");
if(naverBtn){
  naverBtn.addEventListener("click", function(){
    if(!naverLoginInstance){
      setStatus("네이버 SDK를 불러오지 못했습니다.", true);
      return;
    }
    // (임시 진단용) 네이버 페이지로 넘어가기 직전, 실제로 사용될 콜백
    // 주소를 화면에 보여줍니다 -- 네이버 개발자센터에 등록한 Callback URL과
    // 정확히 같은 값인지 확인하기 위한 것으로, 문제 해결 후 제거해도 됩니다.
    var naverDebugCallback = isNativeApp() ? (window.location.origin + "/") : (window.location.origin + window.location.pathname);
    alert("디버그 정보\norigin: " + window.location.origin + "\ncallbackUrl: " + naverDebugCallback);
    naverLoginInstance.authorize();
  });
}

// ---- 로그아웃 ----
var logoutBtn = sj("sjLogout");
if(logoutBtn){
  logoutBtn.addEventListener("click", function(){
    // signOut()이 끝나면 currentUser가 사라져서 토큰을 못 얻으니, 먼저
    // 토큰을 가져와 서버의 lastSeenAt을 지운 뒤에(실패해도 무시하고) signOut
    // 합니다 -- 이래야 관리자 페이지에 로그아웃이 즉시 반영됩니다.
    var userBeforeLogout = currentUser;
    var clearPresence = userBeforeLogout
      ? userBeforeLogout.getIdToken().then(function(idToken){
          return fetch(CLEAR_PRESENCE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken }
          });
        }).catch(function(){ /* best-effort -- 실패해도 로그아웃은 진행 */ })
      : Promise.resolve();
    clearPresence.then(function(){
      return signOut(auth);
    }).then(function(){
      // "로그인 성공!" 같은 이전 상태 문구가 로그아웃 후에도 남아있지 않도록 지워줍니다.
      setStatus("");
      // 네이버 SDK 쪽 로그인 세션도 같이 끊어줍니다 (Firebase 로그아웃만 하면 네이버
      // 자체 세션은 남아있어서, 나중에 "네이버로 로그인"을 다시 누르면 확인 절차 없이
      // 바로 이전 계정으로 재로그인될 수 있습니다).
      if(naverLoginInstance && typeof naverLoginInstance.logout === "function"){
        naverLoginInstance.logout();
      }
      // 다음에 (같은 계정이든 다른 계정이든) 다시 로그인했을 때 기본 언어
      // 적용이 확실히 다시 시도되도록 초기화합니다.
      appliedLangForUid = null;
    });
  });
}

// ---- 기본 언어(계정별) ----
// 로그인 상태에서 언어를 바꾸면(js/i18n.js의 langDropdown 클릭 핸들러가
// window.__sjAuth.savePreferredLanguage를 호출합니다) 그 값을 이 계정의
// Firestore 프로필(users/{uid}.preferredLanguage)에 저장해두고, 이후
// 어느 기기/브라우저에서 이 계정으로 로그인하더라도 아래 applyPreferredLanguage가
// 로그인 직후 자동으로 그 언어를 적용합니다. 로그인하지 않은 상태에서 언어를
// 바꾸는 경우는 기존처럼 이 기기의 localStorage에만 저장됩니다(js/state.js의
// save()).
var appliedLangForUid = null;

function savePreferredLanguage(lang){
  if(!currentUser || !lang) return;
  setDoc(doc(db, "users", currentUser.uid), { preferredLanguage: lang, updatedAt: serverTimestamp() }, { merge: true })
    .catch(function(){ /* best-effort -- 실패해도 화면의 언어 변경 자체는 이미 적용된 상태 */ });
}

function applyPreferredLanguage(user){
  if(!user || appliedLangForUid === user.uid) return;
  appliedLangForUid = user.uid;
  getDoc(doc(db, "users", user.uid)).then(function(snap){
    var data = snap.exists() ? snap.data() : null;
    var lang = data && data.preferredLanguage;
    // I18N은 js/i18n.js가 전역으로 만들어두는 { ko:{...}, en:{...}, ... } 사전입니다.
    // 거기 없는 값이면(예전에 지원하다 뺀 언어 등) 무시하고 현재 화면 언어를 유지합니다.
    if(lang && window.I18N && window.I18N[lang] && lang !== state.lang){
      state.lang = lang;
      save();
      relocalizeDefaultPlayerNames();
      applyStaticTranslations();
      renderAll();
    }
  }).catch(function(){ /* best-effort -- 실패해도 현재 화면 언어 그대로 둠 */ });
}

// onAuthStateChanged만으로는 화면에 이름이 안 뜨는 문제가 있었습니다: 카카오/네이버는
// signInWithCustomToken 직후에는 프로필이 비어있고, 그 다음 줄에서 updateProfile()로
// 이름/사진을 나중에 채워넣는데, updateProfile()은 onAuthStateChanged를 다시 실행시키지
// 않습니다. 그래서 로그인 직후 "이름 없음" 상태로 딱 한 번 렌더링된 화면이 그대로 굳어서
// kakao:숫자 같은 uid가 계속 남아있었던 것입니다. renderAuthUI를 따로 빼내서
// updateProfile이 끝난 뒤에도 한 번 더 직접 호출해 화면을 갱신합니다.
function renderAuthUI(user){
  currentUser = user;
  var loggedOut = sj("sjAuthLoggedOut");
  var loggedIn = sj("sjAuthLoggedIn");
  var adminFab = sj("sjAdminFab");
  if(user){
    if(loggedOut) loggedOut.style.display = "none";
    if(loggedIn) loggedIn.style.display = "block";
    var nameEl = sj("sjMyName");
    if(nameEl) nameEl.textContent = user.displayName || user.email || user.uid;
    if(adminFab) adminFab.style.display = (user.email === ADMIN_EMAIL) ? "" : "none";
    startPresenceHeartbeat();
    applyPreferredLanguage(user);
  } else {
    if(loggedOut) loggedOut.style.display = "block";
    if(loggedIn) loggedIn.style.display = "none";
    if(adminFab) adminFab.style.display = "none";
    stopPresenceHeartbeat();
  }
}

/* Called when the server tells us this account/session is blocked
   (banned, or a global 접속금지 is in effect): signs the user out and
   shows a full-screen overlay with the admin-configured message (or the
   "점검중입니다." default) so they can't keep working with stale local
   state. */
function handleBlocked(message){
  var overlay = sj("sjBlockOverlay");
  var msgEl = sj("sjBlockMessage");
  if(msgEl) msgEl.textContent = message || "점검중입니다.";
  if(overlay) overlay.style.display = "flex";
  signOut(auth).catch(function(){});
}

onAuthStateChanged(auth, renderAuthUI);

window.__sjAuth = {
  getCurrentUser: function(){ return currentUser; },
  getAuth: function(){ return auth; },
  savePreferredLanguage: savePreferredLanguage,
  getDb: function(){ return db; },
  handleBlocked: handleBlocked
};
