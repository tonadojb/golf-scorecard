import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithCustomToken, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

var KAKAO_JS_KEY = "e73a39b4f944bc251c449f0535d5f39b";
var NAVER_CLIENT_ID = "jdkW2uYK23DCwxrCeVWu";

// 관리자 페이지(🛠)는 이 이메일로 로그인했을 때만 노출됩니다. 실제 접근 제어는
// 서버(firebase-backend/functions/access.js의 ADMIN_EMAIL)에서 한 번 더
// 검증하므로, 이 값은 어디까지나 화면 표시용 UI 편의 체크입니다.
var ADMIN_EMAIL = "tonadojb@gmail.com";

var app = initializeApp(firebaseConfig);
var auth = getAuth(app);
var db = getFirestore(app);
var currentUser = null;

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
var googleBtn = sj("sjGoogleLogin");
if(googleBtn){
  googleBtn.addEventListener("click", function(){
    setStatus("Google 로그인 중...");
    var provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).then(function(result){
      return saveUserProfile(result.user, { displayName: result.user.displayName || "", provider: "google" });
    }).then(function(){
      setStatus("로그인 성공!");
      closeAuthModal();
    }).catch(function(e){
      setStatus("오류: " + (e && e.message ? e.message : e), true);
    });
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
        setStatus("카카오 로그인 실패: " + JSON.stringify(err), true);
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
var naverLoginInstance = null;
if(window.naver && window.naver.LoginWithNaverId){
  naverLoginInstance = new window.naver.LoginWithNaverId({
    clientId: NAVER_CLIENT_ID,
    callbackUrl: window.location.origin + window.location.pathname,
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
    });
  });
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
  getDb: function(){ return db; },
  handleBlocked: handleBlocked
};
