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
// TODO: 네이버 앱 등록 후 firebase-backend/functions/naverAuth.js 를 추가하고 여기를 교체하세요.
var NAVER_AUTH_URL = "https://YOUR_CLOUD_FUNCTION_URL/naverAuth";

var KAKAO_JS_KEY = "e73a39b4f944bc251c449f0535d5f39b";
// TODO: 네이버 개발자센터에서 발급받은 Client ID로 교체하세요.
var NAVER_CLIENT_ID = "YOUR_NAVER_CLIENT_ID";

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
var naverBtn = sj("sjNaverLogin");
if(naverBtn){
  naverBtn.addEventListener("click", function(){
    if(!window.naver || !window.naver.LoginWithNaverId){
      setStatus("네이버 SDK를 불러오지 못했습니다.", true);
      return;
    }
    setStatus("네이버 로그인 창을 확인해주세요.");
    window.__sjHandleNaverToken = function(accessToken){
      fetch(NAVER_AUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: accessToken })
      }).then(function(res){ return res.json(); })
        .then(function(data){
          if(data && data.error){ throw new Error(data.error); }
          return signInWithCustomToken(auth, data.customToken);
        }).then(function(result){
          return saveUserProfile(result.user, { provider: "naver" });
        }).then(function(){
          setStatus("로그인 성공!");
          closeAuthModal();
        }).catch(function(e){
          setStatus("오류: " + (e && e.message ? e.message : e), true);
        });
    };
    var naverLogin = new window.naver.LoginWithNaverId({
      clientId: NAVER_CLIENT_ID,
      callbackUrl: window.location.href,
      isPopup: true,
      callbackHandle: true
    });
    naverLogin.init();
    if(naverLogin.authorize){ naverLogin.authorize(); }
  });
}

// ---- 로그아웃 ----
var logoutBtn = sj("sjLogout");
if(logoutBtn){
  logoutBtn.addEventListener("click", function(){
    signOut(auth);
  });
}

onAuthStateChanged(auth, function(user){
  currentUser = user;
  var loggedOut = sj("sjAuthLoggedOut");
  var loggedIn = sj("sjAuthLoggedIn");
  if(user){
    if(loggedOut) loggedOut.style.display = "none";
    if(loggedIn) loggedIn.style.display = "block";
    var nameEl = sj("sjMyName");
    if(nameEl) nameEl.textContent = user.displayName || user.email || user.uid;
  } else {
    if(loggedOut) loggedOut.style.display = "block";
    if(loggedIn) loggedIn.style.display = "none";
  }
});

window.__sjAuth = {
  getCurrentUser: function(){ return currentUser; },
  getAuth: function(){ return auth; },
  getDb: function(){ return db; }
};
