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

  if(submitBtn){
    submitBtn.addEventListener("click", submitFriendForm);
  }
  if(cancelEditBtn){
    cancelEditBtn.addEventListener("click", clearForm);
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
    if(!name) return null;
    var key = String(name).trim().toLowerCase();
    if(!key) return null;
    for(var i = 0; i < friendsCache.length; i++){
      if((friendsCache[i].name || "").trim().toLowerCase() === key) return friendsCache[i];
    }
    return null;
  }

  window.__sjFriends = {
    onOpen: function(){
      setStatus("");
      clearForm();
      listEl.innerHTML = '<p class="settlement-empty">...</p>';
      refreshFriendsList();
    },
    findByName: findFriendByName,
    getCached: function(){ return friendsCache; },
    /* 로그인 직후(또는 앱 시작 시 이미 로그인 상태) 정산 화면에서 바로 매칭될
       수 있도록, 모달을 열지 않아도 백그라운드로 한 번 불러와 캐시를 채운다. */
    preload: function(){
      if(!getCurrentUser()) return;
      refreshFriendsList();
    }
  };
})();
