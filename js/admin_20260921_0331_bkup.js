(function(){
  function sj(id){ return document.getElementById(id); }

  var LIST_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/adminListUsers";
  var FORCE_LOGOUT_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/adminForceLogout";
  var SET_BAN_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/adminSetBan";
  var GET_CONFIG_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/adminGetConfig";
  var SET_GLOBAL_BLOCK_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/adminSetGlobalBlock";
  var SET_VIOLATION_COUNT_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/adminSetViolationCount";
  var GET_USER_VIOLATIONS_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/adminGetUserViolations";
  var GET_VIOLATION_PHOTO_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/adminGetViolationPhoto";
  var DELETE_VIOLATION_PHOTO_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/adminDeleteViolationPhoto";

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
    var loginCount = u.loginCount || 0;
    var scanCount = u.scanCount || 0;
    var saveCount = u.saveCount || 0;
    // 클릭하면 펼쳐지는 사용자별 이용 통계 -- .sj-admin-user-row.open일 때만 보임 (CSS).
    // "이용 횟수"는 실제 로그인 횟수(loginCount)를 보여준다 -- 예전엔
    // scanCount+saveCount 합계였는데, 로그인만 하고 스캔/저장은 안 한
    // 사용자가 계속 0으로 보이는 문제가 있어서 실제 로그인 횟수로 바꿨다.
    var violationCount = u.violationCount || 0;
    // 경고 누적 횟수를 관리자가 직접 조정(예: 3->1로 낮춰서 재기회 부여)할
    // 수 있는 입력창 + 저장 버튼, 그리고 그 경고를 유발한 사진들을 눌러서
    // 볼 수 있는 목록(펼치기 전까진 불러오지 않음 -- 지연 로딩).
    var violationEdit = '<div class="sj-admin-violation-edit">' +
        '<span>경고 누적</span>' +
        '<input type="number" class="sj-admin-violation-input" min="0" max="999" value="' + violationCount + '" data-uid="' + escapeHtmlLocal(u.uid) + '">' +
        '<button type="button" class="sj-admin-violation-save-btn" data-uid="' + escapeHtmlLocal(u.uid) + '">저장</button>' +
        '<button type="button" class="sj-admin-violation-photos-btn" data-uid="' + escapeHtmlLocal(u.uid) + '">위반 사진 보기</button>' +
      '</div>' +
      '<div class="sj-admin-violation-photos" data-uid="' + escapeHtmlLocal(u.uid) + '" style="display:none;"></div>';
    var detail = '<div class="sj-admin-user-detail">' +
        '<div class="sj-admin-user-stats-row">' +
          '<div class="sj-admin-user-stat"><span>이용 횟수</span><b>' + loginCount + '</b></div>' +
          '<div class="sj-admin-user-stat"><span>스캔 건수</span><b>' + scanCount + '</b></div>' +
          '<div class="sj-admin-user-stat"><span>저장 건수</span><b>' + saveCount + '</b></div>' +
        '</div>' +
      violationEdit +
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

  function renderViolationPhotoList(panel, items){
    if(!items || !items.length){
      panel.innerHTML = '<div class="sj-admin-violation-empty">저장된 위반 사진이 없습니다.</div>';
      return;
    }
    panel.innerHTML = items.map(function(it){
      return '<div class="sj-admin-violation-photo-item" data-violation-id="' + escapeHtmlLocal(it.id) + '">' +
          '<span class="sj-admin-violation-photo-date">' + fmtTime(it.createdAt) +
            (it.violationCountAtTime ? ' · 경고 ' + it.violationCountAtTime + '회차' : '') + '</span>' +
          '<button type="button" class="sj-admin-violation-view-btn" data-violation-id="' + escapeHtmlLocal(it.id) + '">사진 보기</button>' +
          '<button type="button" class="sj-admin-violation-delete-btn" data-violation-id="' + escapeHtmlLocal(it.id) + '">삭제</button>' +
          '<div class="sj-admin-violation-photo-img" data-violation-id="' + escapeHtmlLocal(it.id) + '"></div>' +
        '</div>';
    }).join("");
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
      var saveViolationBtn = e.target.closest(".sj-admin-violation-save-btn");
      if(saveViolationBtn){
        var vUid = saveViolationBtn.dataset.uid;
        var vInput = container.querySelector('.sj-admin-violation-input[data-uid="' + vUid + '"]');
        var newCount = vInput ? parseInt(vInput.value, 10) : NaN;
        if(!vInput || isNaN(newCount) || newCount < 0 || newCount > 999){
          alert("경고 횟수는 0~999 사이의 숫자로 입력해주세요.");
          return;
        }
        saveViolationBtn.disabled = true;
        withIdToken(function(idToken){
          return authedFetch(SET_VIOLATION_COUNT_URL, idToken, { uid: vUid, violationCount: newCount });
        }).then(function(){
          if(typeof toast === "function"){ toast("경고 누적 횟수를 수정했습니다"); }
          // 목록을 새로고침해야 상단 메타 줄("위반 N회")에도 반영된다 -- 다른
          // 관리자 액션들과 동일하게, 새로고침되면 펼쳐진 패널은 다시 접힌다.
          return loadUsers();
        }).catch(function(err){
          alert("실패: " + (err && err.message ? err.message : err));
        }).then(function(){ saveViolationBtn.disabled = false; });
        return;
      }
      var photosBtn = e.target.closest(".sj-admin-violation-photos-btn");
      if(photosBtn){
        var pUid = photosBtn.dataset.uid;
        var panel = container.querySelector('.sj-admin-violation-photos[data-uid="' + pUid + '"]');
        if(!panel) return;
        var isHidden = !panel.style.display || panel.style.display === "none";
        if(isHidden){
          panel.style.display = "";
          photosBtn.textContent = "위반 사진 숨기기";
          if(!panel.dataset.loaded){
            panel.innerHTML = '<div class="sj-admin-violation-loading">불러오는 중...</div>';
            withIdToken(function(idToken){
              return authedFetch(GET_USER_VIOLATIONS_URL + "?uid=" + encodeURIComponent(pUid), idToken);
            }).then(function(data){
              panel.dataset.loaded = "1";
              renderViolationPhotoList(panel, (data && data.items) || []);
            }).catch(function(err){
              panel.innerHTML = '<div class="sj-admin-violation-loading">불러오기 실패: ' +
                escapeHtmlLocal(err && err.message ? err.message : err) + '</div>';
            });
          }
        } else {
          panel.style.display = "none";
          photosBtn.textContent = "위반 사진 보기";
        }
        return;
      }
      var viewBtn = e.target.closest(".sj-admin-violation-view-btn");
      if(viewBtn){
        var vid = viewBtn.dataset.violationId;
        var imgHolder = container.querySelector('.sj-admin-violation-photo-img[data-violation-id="' + vid + '"]');
        if(!imgHolder) return;
        if(imgHolder.dataset.loaded){
          var nowHidden = imgHolder.style.display === "none";
          imgHolder.style.display = nowHidden ? "" : "none";
          viewBtn.textContent = nowHidden ? "사진 숨기기" : "사진 보기";
          return;
        }
        viewBtn.disabled = true;
        withIdToken(function(idToken){
          return authedFetch(GET_VIOLATION_PHOTO_URL + "?id=" + encodeURIComponent(vid), idToken);
        }).then(function(data){
          if(data && data.imageBase64){
            var img = document.createElement("img");
            img.src = "data:" + (data.contentType || "image/jpeg") + ";base64," + data.imageBase64;
            img.className = "sj-admin-violation-photo-full";
            imgHolder.innerHTML = "";
            imgHolder.appendChild(img);
            imgHolder.dataset.loaded = "1";
            viewBtn.textContent = "사진 숨기기";
          }
        }).catch(function(err){
          alert("사진 불러오기 실패: " + (err && err.message ? err.message : err));
        }).then(function(){ viewBtn.disabled = false; });
        return;
      }
      var deleteBtn = e.target.closest(".sj-admin-violation-delete-btn");
      if(deleteBtn){
        var did = deleteBtn.dataset.violationId;
        if(!confirm("이 위반 사진을 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.")) return;
        deleteBtn.disabled = true;
        withIdToken(function(idToken){
          return authedFetch(DELETE_VIOLATION_PHOTO_URL, idToken, { id: did });
        }).then(function(){
          if(typeof toast === "function"){ toast("위반 사진을 삭제했습니다"); }
          var item = container.querySelector('.sj-admin-violation-photo-item[data-violation-id="' + did + '"]');
          if(item) item.remove();
        }).catch(function(err){
          alert("삭제 실패: " + (err && err.message ? err.message : err));
          deleteBtn.disabled = false;
        });
        return;
      }
      // 상세 패널(입력창/버튼/사진목록) 안쪽 클릭은 위 버튼 처리에서 이미
      // return 했거나, 여기 걸리면 그냥 아무것도 안 하고 끝낸다 -- 이게 없으면
      // 예: 경고횟수 입력창을 클릭하는 순간 바로 아래 행-토글 로직이 실행돼서
      // 패널이 즉시 접혀버린다.
      var detailArea = e.target.closest(".sj-admin-user-detail");
      if(detailArea){ return; }
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
