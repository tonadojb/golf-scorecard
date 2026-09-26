/* ---------------- 친구 관리 (이름/연락처/은행/계좌번호/메모) ----------------
   내기 정산(js/settlement.js) 결과 화면에서 정산 상대방 이름이 여기 등록된
   친구 이름과 일치하면, 저장해둔 계좌번호를 바로 복사할 수 있는 버튼을
   보여줍니다. 이 앱이 직접 송금/이체를 처리하지는 않고, 계좌번호를 클립보드에
   복사해주는 것까지만 지원합니다(사용자가 본인 은행 앱을 열어 직접 이체). */
(function(){
  function sj(id){ return document.getElementById(id); }
  var BASE = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net";
  var LIST_URL = BASE + "/listFriends";
  var SAVE_URL = BASE + "/saveFriend";
  var UPDATE_URL = BASE + "/updateFriend";
  var DELETE_URL = BASE + "/deleteFriend";

  function getCurrentUser(){ return window.__sjAuth && window.__sjAuth.getCurrentUser(); }
  function withIdToken(){
    var u = getCurrentUser();
    if(!u) return Promise.reject(new Error(t("paywallLoginRequired")));
    return u.getIdToken();
  }

  var friendsCache = [];
  var editingId = null;

  var listEl = sj("sjFriendsList");
  var statusEl = sj("sjFriendsStatus");
  var nameInput = sj("sjFriendName");
  var phoneInput = sj("sjFriendPhone");
  var bankInput = sj("sjFriendBank");
  var accountInput = sj("sjFriendAccount");
  var memoInput = sj("sjFriendMemo");
  var submitBtn = sj("sjFriendsSubmitBtn");
  var cancelEditBtn = sj("sjFriendsCancelEditBtn");
  var importBtn = sj("sjFriendsImportBtn");

  function setStatus(text, isError){
    if(!statusEl) return;
    statusEl.className = "sj-status" + (isError ? " error" : "");
    statusEl.textContent = text || "";
  }

  function clearForm(){
    editingId = null;
    if(nameInput) nameInput.value = "";
    if(phoneInput) phoneInput.value = "";
    if(bankInput) bankInput.value = "";
    if(accountInput) accountInput.value = "";
    if(memoInput) memoInput.value = "";
    if(submitBtn) submitBtn.textContent = t("friendsAddBtn");
    if(cancelEditBtn) cancelEditBtn.style.display = "none";
  }

  function renderFriendsList(){
    if(!listEl) return;
    if(!friendsCache.length){
      listEl.innerHTML = '<p class="settlement-empty">' + escapeHtml(t("friendsEmptyList")) + '</p>';
      return;
    }
    listEl.innerHTML = friendsCache.map(function(f){
      var sub = [f.phone, [f.bank, f.account].filter(Boolean).join(" "), f.memo].filter(Boolean).map(escapeHtml).join(" · ");
      return '<div class="sj-friend-row" data-id="' + f.id + '">' +
        '<div class="sj-friend-row-main">' +
          '<strong>' + escapeHtml(f.name) + '</strong>' +
          (sub ? '<div class="sj-friend-row-sub">' + sub + '</div>' : '') +
        '</div>' +
        '<div class="sj-friend-row-actions">' +
          '<button type="button" class="sj-friend-edit-btn" data-id="' + f.id + '">' + escapeHtml(t("friendsEditBtn")) + '</button>' +
          '<button type="button" class="sj-friend-delete-btn" data-id="' + f.id + '">' + escapeHtml(t("friendsDeleteBtn")) + '</button>' +
        '</div>' +
      '</div>';
    }).join("");
  }

  function refreshFriendsList(){
    return withIdToken().then(function(idToken){
      return fetch(LIST_URL, { headers: { "Authorization": "Bearer " + idToken } });
    }).then(function(res){ return res.json(); })
      .then(function(data){
        friendsCache = (data && data.friends) || [];
        renderFriendsList();
        return friendsCache;
      })
      .catch(function(e){
        console.error("친구 목록 조회 실패", e);
        if(listEl) listEl.innerHTML = '<p class="settlement-empty">' + escapeHtml(t("friendsLoadFail")) + '</p>';
        return [];
      });
  }

  function submitFriendForm(){
    var name = (nameInput && nameInput.value || "").trim();
    if(!name){
      setStatus(t("friendsNameRequired"), true);
      if(nameInput) nameInput.focus();
      return;
    }
    var body = {
      name: name,
      phone: (phoneInput && phoneInput.value || "").trim(),
      bank: (bankInput && bankInput.value || "").trim(),
      account: (accountInput && accountInput.value || "").trim(),
      memo: (memoInput && memoInput.value || "").trim()
    };
    var url = editingId ? UPDATE_URL : SAVE_URL;
    if(editingId) body.id = editingId;

    setStatus("...");
    withIdToken().then(function(idToken){
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
        body: JSON.stringify(body)
      });
    }).then(function(res){ return res.json(); })
      .then(function(data){
        if(data && data.error){ throw new Error(data.error); }
        setStatus("");
        clearForm();
        return refreshFriendsList();
      }).catch(function(e){
        console.error("친구 저장 실패", e);
        setStatus(t("friendsSaveFail", (e && e.message) || e), true);
      });
  }

  function startEditFriend(id){
    var f = friendsCache.filter(function(x){ return x.id === id; })[0];
    if(!f) return;
    editingId = id;
    if(nameInput) nameInput.value = f.name || "";
    if(phoneInput) phoneInput.value = f.phone || "";
    if(bankInput) bankInput.value = f.bank || "";
    if(accountInput) accountInput.value = f.account || "";
    if(memoInput) memoInput.value = f.memo || "";
    if(submitBtn) submitBtn.textContent = t("friendsSaveEditBtn");
    if(cancelEditBtn) cancelEditBtn.style.display = "";
    if(nameInput) nameInput.focus();
  }

  function deleteFriendById(id){
    var f = friendsCache.filter(function(x){ return x.id === id; })[0];
    if(!f) return;
    if(!confirm(t("friendsDeleteConfirm", f.name))) return;
    setStatus("...");
    withIdToken().then(function(idToken){
      return fetch(DELETE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
        body: JSON.stringify({ id: id })
      });
    }).then(function(res){ return res.json(); })
      .then(function(data){
        if(data && data.error){ throw new Error(data.error); }
        setStatus("");
        if(editingId === id) clearForm();
        return refreshFriendsList();
      }).catch(function(e){
        console.error("친구 삭제 실패", e);
        setStatus(t("friendsDeleteFail", (e && e.message) || e), true);
      });
  }

  /* ---------------- 스마트폰 연락처에서 이름/전화번호 가져오기 ----------------
     @capacitor-community/contacts 플러그인. iOS 네이티브 앱에서만 동작하고
     (Info.plist에 NSContactsUsageDescription 권한 문구 필요), PC 브라우저나
     앱을 새로 빌드하기 전에는 window.Capacitor.Plugins.Contacts 자체가 없으므로
     이때는 "스마트폰 앱에서만 사용할 수 있어요" 안내만 보여준다. */
  function isNativeApp(){
    return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform());
  }
  function getContactsPlugin(){
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Contacts;
  }

  /* 연락처 앱에 저장된 전화번호는 "010 1234 5678", "+82 10-1234-5678",
     "01012345678" 등 사람마다 형식이 제각각이라, 숫자만 뽑아서 국내 휴대폰
     번호(010/011 등, 총 10~11자리) 형태면 보기 좋게 하이픈을 넣어준다.
     패턴에 안 맞으면(국제전화 등) 원래 값을 그대로 둔다. */
  function normalizeImportedPhone(raw){
    var s = (raw || "").trim();
    if(!s) return "";
    var digits = s.replace(/[^0-9+]/g, "");
    if(digits.indexOf("+82") === 0){ digits = "0" + digits.slice(3); }
    digits = digits.replace(/\+/g, "");
    if(/^0\d{9,10}$/.test(digits)){
      if(digits.length === 11) return digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
      if(digits.length === 10) return digits.replace(/(\d{2,3})(\d{3,4})(\d{4})/, "$1-$2-$3");
    }
    return s;
  }

  function importFromDeviceContacts(){
    if(!isNativeApp()){
      setStatus(t("friendsImportNativeOnly"), true);
      return;
    }
    var Contacts = getContactsPlugin();
    if(!Contacts){
      setStatus(t("friendsImportNativeOnly"), true);
      return;
    }
    setStatus("...");
    Contacts.pickContact({ projection: { name: true, phones: true } }).then(function(result){
      var contact = result && result.contact;
      if(!contact) return;
      var name = contact.name && contact.name.display;
      if(!name && contact.name){
        name = [contact.name.family, contact.name.given].filter(Boolean).join(" ").trim();
      }
      var phone = (contact.phones && contact.phones.length) ? contact.phones[0].number : "";
      if(name && nameInput) nameInput.value = name;
      if(phone && phoneInput) phoneInput.value = normalizeImportedPhone(phone);
      setStatus(t("toastContactImported"));
    }).catch(function(e){
      // 사용자가 연락처 선택을 취소한 경우에도 이 catch로 오는데, 이때는 에러
      // 안내를 띄우지 않는다(취소는 실패가 아니므로).
      var msg = (e && e.message) || String(e || "");
      if(/cancel/i.test(msg)) { setStatus(""); return; }
      console.error("연락처 가져오기 실패", e);
      setStatus(t("friendsImportFail", msg), true);
    });
  }

  if(submitBtn){
    submitBtn.addEventListener("click", submitFriendForm);
  }
  if(cancelEditBtn){
    cancelEditBtn.addEventListener("click", clearForm);
  }
  if(importBtn){
    importBtn.addEventListener("click", importFromDeviceContacts);
  }
  if(listEl){
    listEl.addEventListener("click", function(e){
      var editBtn = e.target.closest(".sj-friend-edit-btn");
      if(editBtn){ startEditFriend(editBtn.dataset.id); return; }
      var delBtn = e.target.closest(".sj-friend-delete-btn");
      if(delBtn){ deleteFriendById(delBtn.dataset.id); return; }
    });
  }

  /* 이름 문자열로 등록된 친구를 찾는다(공백 제거 후 대소문자 구분 없이 비교).
     정산 결과의 선수 이름은 자유 입력/OCR 인식 텍스트라 완전히 같은 문자열일
     때만 매칭됩니다. */
  function findFriendByName(name){
    var all = findAllFriendsByName(name);
    return all.length ? all[0] : null;
  }

  /* 동명이인이 여러 명 등록돼 있을 수 있으므로, 이름이 같은 친구를 전부(등록
     순서 그대로) 배열로 반환한다. 어떤 계좌를 쓸지는 호출하는 쪽(정산 화면)이
     메모/연락처 등으로 구분해서 사용자가 고르게 한다. */
  function findAllFriendsByName(name){
    if(!name) return [];
    var key = String(name).trim().toLowerCase();
    if(!key) return [];
    return friendsCache.filter(function(f){
      return (f.name || "").trim().toLowerCase() === key;
    });
  }

  window.__sjFriends = {
    onOpen: function(){
      setStatus("");
      clearForm();
      listEl.innerHTML = '<p class="settlement-empty">...</p>';
      refreshFriendsList();
    },
    findByName: findFriendByName,
    findAllByName: findAllFriendsByName,
    getCached: function(){ return friendsCache; },
    /* 로그인 직후(또는 앱 시작 시 이미 로그인 상태) 정산 화면에서 바로 매칭될
       수 있도록, 모달을 열지 않아도 백그라운드로 한 번 불러와 캐시를 채운다. */
    preload: function(){
      if(!getCurrentUser()) return;
      refreshFriendsList();
    }
  };
})();
