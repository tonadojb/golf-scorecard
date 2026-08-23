(function(){
  function sj(id){ return document.getElementById(id); }

  var LIST_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/adminListUsers";
  var FORCE_LOGOUT_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/adminForceLogout";
  var SET_BAN_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/adminSetBan";
  var GET_CONFIG_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/adminGetConfig";
  var SET_GLOBAL_BLOCK_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/adminSetGlobalBlock";

  function escapeHtmlLocal(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtTime(iso){
    if(!iso) return "-";
    try {
      var d = new Date(iso);
      return d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch(e){ return iso; }
  }

  function withIdToken(cb){
    var currentUser = window.__sjAuth && window.__sjAuth.getCurrentUser();
    if(!currentUser){ return Promise.reject(new Error("로그인이 필요합니다.")); }
    return currentUser.getIdToken().then(cb);
  }

  function authedFetch(url, idToken, body){
    var opts = { headers: { "Authorization": "Bearer " + idToken } };
    if(body){
      opts.method = "POST";
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    } else {
      opts.method = "GET";
    }
    return fetch(url, opts).then(function(res){ return res.json(); }).then(function(data){
      if(data && data.error){ throw new Error(data.error); }
      return data;
    });
  }

  function userRowHtml(u){
    var name = u.displayName || u.email || u.uid;
    var onlineDot = '<span class="sj-admin-dot ' + (u.online ? "on" : "off") + '" title="' + (u.online ? "접속중" : "오프라인") + '"></span>';
    var badge = u.isAdmin ? '<span class="sj-admin-badge admin">관리자</span>' : "";
    var bannedBadge = u.banned ? '<span class="sj-admin-badge banned">접속금지됨</span>' : "";
    var actions = u.isAdmin ? "" :
      '<div class="sj-admin-user-actions">' +
        '<button type="button" class="sj-admin-logout-btn" data-uid="' + escapeHtmlLocal(u.uid) + '">강제 로그아웃</button>' +
        '<button type="button" class="' + (u.banned ? "sj-admin-unban-btn" : "sj-admin-ban-btn") + '" data-uid="' + escapeHtmlLocal(u.uid) + '" data-banned="' + (u.banned ? "1" : "0") + '">' +
          (u.banned ? "접속가능으로 전환" : "접속금지") +
        '</button>' +
      '</div>';
    var scanCount = u.scanCount || 0;
    var saveCount = u.saveCount || 0;
    var usageCount = scanCount + saveCount;
    // 클릭하면 펼쳐지는 사용자별 이용 통계 -- .sj-admin-user-row.open일 때만 보임 (CSS).
    var detail = '<div class="sj-admin-user-detail">' +
        '<div class="sj-admin-user-stat"><span>이용 횟수</span><b>' + usageCount + '</b></div>' +
        '<div class="sj-admin-user-stat"><span>스캔 건수</span><b>' + scanCount + '</b></div>' +
        '<div class="sj-admin-user-stat"><span>저장 건수</span><b>' + saveCount + '</b></div>' +
      '</div>';
    return '<div class="sj-admin-user-row" data-uid="' + escapeHtmlLocal(u.uid) + '">' +
      '<div class="sj-admin-user-top">' + onlineDot +
        '<span class="sj-admin-user-name">' + escapeHtmlLocal(name) + '</span>' + badge + bannedBadge +
      '</div>' +
      '<div class="sj-admin-user-meta">' + escapeHtmlLocal(u.email || "-") + ' · ' + escapeHtmlLocal(u.provider || "-") +
        ' · 최근 접속 ' + fmtTime(u.lastSeenAt) + ' · 위반 ' + (u.violationCount || 0) + '회' +
      '</div>' +
      detail +
      actions +
    '</div>';
  }

  function renderStatsBar(stats){
    var bar = sj("sjAdminStatsBar");
    if(!bar) return;
    if(!stats){ bar.innerHTML = ""; return; }
    bar.innerHTML =
      '<div class="sj-admin-stat-tile"><div class="sj-admin-stat-label">총 로그인 사용자</div><div class="sj-admin-stat-value">' + stats.totalUsers + '</div></div>' +
      '<div class="sj-admin-stat-tile"><div class="sj-admin-stat-label">현재 접속중</div><div class="sj-admin-stat-value">' + stats.onlineUsers + '</div></div>' +
      '<div class="sj-admin-stat-tile"><div class="sj-admin-stat-label">오프라인</div><div class="sj-admin-stat-value">' + stats.offlineUsers + '</div></div>' +
      '<div class="sj-admin-stat-tile"><div class="sj-admin-stat-label">총 스캔 건수</div><div class="sj-admin-stat-value">' + stats.totalScans + '</div></div>' +
      '<div class="sj-admin-stat-tile"><div class="sj-admin-stat-label">총 저장 건수</div><div class="sj-admin-stat-value">' + stats.totalSaves + '</div></div>';
  }

  function renderUserList(users){
    var container = sj("sjAdminUserList");
    if(!container) return;
    if(!users || !users.length){
      container.innerHTML = '<div class="sj-admin-empty">로그인한 사용자가 없습니다.</div>';
      return;
    }
    container.innerHTML = users.map(userRowHtml).join("");
  }

  function loadUsers(){
    var status = sj("sjAdminStatus");
    if(status){ status.className = "sj-status"; status.textContent = "불러오는 중..."; }
    return withIdToken(function(idToken){
      return authedFetch(LIST_URL, idToken);
    }).then(function(data){
      renderStatsBar(data && data.stats);
      renderUserList((data && data.users) || []);
      if(status){ status.textContent = ""; }
    }).catch(function(e){
      if(status){ status.className = "sj-status error"; status.textContent = "불러오기 실패: " + (e && e.message ? e.message : e); }
    });
  }

  function loadConfig(){
    return withIdToken(function(idToken){
      return authedFetch(GET_CONFIG_URL, idToken);
    }).then(function(data){
      var toggle = sj("sjAdminGlobalBlockToggle");
      var msg = sj("sjAdminBlockMessage");
      var maxViolationsEl = sj("sjAdminMaxViolations");
      if(toggle) toggle.checked = !!(data && data.globalBlock);
      if(msg) msg.value = (data && data.blockMessage) || "";
      if(maxViolationsEl) maxViolationsEl.value = (data && data.maxViolations) || 3;
    }).catch(function(e){
      var status = sj("sjAdminGlobalStatus");
      if(status){ status.className = "sj-status error"; status.textContent = "설정 불러오기 실패: " + (e && e.message ? e.message : e); }
    });
  }

  function bindUserListEvents(){
    var container = sj("sjAdminUserList");
    if(!container) return;
    container.addEventListener("click", function(e){
      var logoutBtn = e.target.closest(".sj-admin-logout-btn");
      if(logoutBtn){
        var targetUid = logoutBtn.dataset.uid;
        logoutBtn.disabled = true;
        withIdToken(function(idToken){
          return authedFetch(FORCE_LOGOUT_URL, idToken, { uid: targetUid });
        }).then(function(){
          if(typeof toast === "function"){ toast("강제 로그아웃 처리되었습니다"); }
          // 로그아웃 직후 "접속중" 표시가 바로 갱신되도록 목록을 새로 불러온다
          // (버튼 재활성화는 이 새로고침이 끝난 뒤 이어지는 .then에서 처리됨).
          return loadUsers();
        }).catch(function(err){
          alert("실패: " + (err && err.message ? err.message : err));
        }).then(function(){ logoutBtn.disabled = false; });
        return;
      }
      var banBtn = e.target.closest(".sj-admin-ban-btn, .sj-admin-unban-btn");
      if(banBtn){
        var targetUid2 = banBtn.dataset.uid;
        var nextBanned = banBtn.dataset.banned !== "1";
        var reason = "";
        if(nextBanned){
          reason = prompt("접속금지 사유 (선택 입력, 비워도 됩니다):", "") || "";
        }
        banBtn.disabled = true;
        withIdToken(function(idToken){
          return authedFetch(SET_BAN_URL, idToken, { uid: targetUid2, banned: nextBanned, banReason: reason });
        }).then(function(){
          if(typeof toast === "function"){ toast(nextBanned ? "접속을 금지했습니다" : "접속을 허용했습니다"); }
          loadUsers();
        }).catch(function(err){
          alert("실패: " + (err && err.message ? err.message : err));
          banBtn.disabled = false;
        });
        return;
      }
      // 사용자 행을 클릭하면(버튼이 아닌 곳) 이용횟수/스캔건수/저장건수 상세를 펼쳐서 보여준다.
      var row = e.target.closest(".sj-admin-user-row");
      if(row){ row.classList.toggle("open"); }
    });
  }

  function bindGlobalBlockSave(){
    var btn = sj("sjAdminSaveGlobalBlockBtn");
    if(!btn) return;
    btn.addEventListener("click", function(){
      var status = sj("sjAdminGlobalStatus");
      var toggle = sj("sjAdminGlobalBlockToggle");
      var msgEl = sj("sjAdminBlockMessage");
      var maxViolationsEl = sj("sjAdminMaxViolations");
      var globalBlock = !!(toggle && toggle.checked);
      var blockMessage = (msgEl && msgEl.value) ? msgEl.value.trim() : "";
      // 1~20 사이 정수만 허용 (서버에서도 다시 한 번 검증/보정함). 비어있거나
      // 범위를 벗어나면 기본값 3으로 되돌려서 사용자에게 바로 보여준다.
      var maxViolationsRaw = maxViolationsEl ? parseInt(maxViolationsEl.value, 10) : 3;
      var maxViolations = (maxViolationsRaw >= 1 && maxViolationsRaw <= 20) ? maxViolationsRaw : 3;
      if(maxViolationsEl) maxViolationsEl.value = maxViolations;
      if(globalBlock && !confirm("관리자를 제외한 모든 사용자의 접속을 즉시 차단합니다. 계속할까요?")){
        return;
      }
      btn.disabled = true;
      if(status){ status.className = "sj-status"; status.textContent = "저장 중..."; }
      withIdToken(function(idToken){
        return authedFetch(SET_GLOBAL_BLOCK_URL, idToken, { globalBlock: globalBlock, blockMessage: blockMessage, maxViolations: maxViolations });
      }).then(function(){
        if(status){ status.textContent = "저장되었습니다" + (globalBlock ? " (관리자 제외 전원 강제 로그아웃 처리됨)" : ""); }
        if(typeof toast === "function"){ toast("설정이 저장되었습니다"); }
      }).catch(function(e){
        if(status){ status.className = "sj-status error"; status.textContent = "저장 실패: " + (e && e.message ? e.message : e); }
      }).then(function(){ btn.disabled = false; });
    });
  }

  function bindRefresh(){
    var btn = sj("sjAdminRefreshBtn");
    if(!btn) return;
    btn.addEventListener("click", function(){ loadUsers(); });
  }

  function onOpen(){
    loadConfig();
    loadUsers();
  }

  bindUserListEvents();
  bindGlobalBlockSave();
  bindRefresh();

  window.__sjAdmin = { onOpen: onOpen };
})();
