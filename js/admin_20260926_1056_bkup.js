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
  var SUB_STATS_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/adminGetSubscriptionStats";
  // 2026-09-26 추가: 관리자 무료 기간 부여 + 친구추천 이벤트 관리.
  var GRANT_FREE_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/adminGrantFreeSubscription";
  var GET_REF_EVENT_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/adminGetReferralEvent";
  var SET_REF_EVENT_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/adminSetReferralEvent";

  // 2026-09-21 추가: 구독 현황(요금제별 구독자 수 / 월별 결제 그래프)에 쓰는 고정
  // 팔레트 -- dataviz 스킬의 카테고리 팔레트 1~2번 슬롯을 그대로 썼다(인접 쌍
  // CVD 검증 통과된 순서라 임의로 바꾸지 말 것). 요금제 키 순서와 색이 항상
  // 고정으로 짝지어져야 어느 그래프에서도 "베이직=파랑"처럼 색이 흔들리지 않는다.
  // (2026-09-22: 한때 프로 단건결제 1/2/3개월 옵션이 있어 카테고리가 5개까지
  // 늘었었지만, 그 옵션 자체를 없애면서 베이직/프로 두 카테고리로 되돌렸다.)
  var PLAN_KEYS_ORDER = ["basic", "pro"];
  var PLAN_COLORS = { basic: "#2a78d6", pro: "#eb6834" };
  var PLAN_SHORT_LABELS = { basic: "베이직", pro: "프로 월간" };
  // 2026-09-26 추가: 사용자 목록에서 유료 구독자가 어떤 경로로 그 구독을 갖게
  // 됐는지(웹 결제/iOS 결제/관리자 지급/이벤트 당첨) 바로 알 수 있게 라벨링.
  var SUB_SOURCE_LABELS = { web: "웹 결제", ios: "iOS 결제", admin_grant: "관리자 지급", event_roulette: "이벤트 당첨" };
  var lastSubStats = null; // { subscriberCounts, currentMRR, monthlyRevenue, planLabels } -- 연도 셀렉트 바뀔 때 재요청 없이 필터링만 새로 하려고 캐싱.

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
    // 2026-09-26 추가: 지금 유료 구독 중이면 어떤 요금제인지 이름 옆에 바로 보이게.
    var planBadge = (u.plan === "basic" || u.plan === "pro")
      ? '<span class="sj-admin-badge plan-' + u.plan + '">' + escapeHtmlLocal(u.planLabel || PLAN_SHORT_LABELS[u.plan]) + '</span>'
      : "";
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
    // 2026-09-26 추가: 결제 없이 베이직/프로를 지정 기간만큼 무료로 부여하는
    // 미니 폼. 관리자 본인 계정에는 의미가 없으므로 숨긴다.
    var grantForm = u.isAdmin ? "" : '<div class="sj-admin-grant-free">' +
        '<span>무료 기간 부여</span>' +
        '<select class="sj-admin-grant-plan" data-uid="' + escapeHtmlLocal(u.uid) + '">' +
          '<option value="basic">베이직</option>' +
          '<option value="pro">프로</option>' +
        '</select>' +
        '<input type="number" class="sj-admin-grant-days" min="1" max="3650" value="30" data-uid="' + escapeHtmlLocal(u.uid) + '"> 일' +
        '<button type="button" class="sj-admin-grant-btn" data-uid="' + escapeHtmlLocal(u.uid) + '">부여</button>' +
      '</div>';
    var detail = '<div class="sj-admin-user-detail">' +
        '<div class="sj-admin-user-stats-row">' +
          '<div class="sj-admin-user-stat"><span>이용 횟수</span><b>' + loginCount + '</b></div>' +
          '<div class="sj-admin-user-stat"><span>스캔 건수</span><b>' + scanCount + '</b></div>' +
          '<div class="sj-admin-user-stat"><span>저장 건수</span><b>' + saveCount + '</b></div>' +
        '</div>' +
      grantForm +
      violationEdit +
      '</div>';
    // 2026-09-26 추가: 구독 중이면 "베이직 · 웹 결제 · ~09/26 만료(해지예약)"처럼
    // 어떤 경로로 언제까지인지 한 줄로. 무료면 그냥 "무료"만 보여준다.
    var subMetaText = "무료";
    if(u.plan === "basic" || u.plan === "pro"){
      var parts = [u.planLabel || PLAN_SHORT_LABELS[u.plan]];
      if(u.subSource && SUB_SOURCE_LABELS[u.subSource]) parts.push(SUB_SOURCE_LABELS[u.subSource]);
      if(u.subExpiresAt) parts.push((u.subCancelAtPeriodEnd ? "해지예약 · " : "") + "~" + fmtTime(u.subExpiresAt) + " 만료");
      subMetaText = parts.join(" · ");
    }
    return '<div class="sj-admin-user-row" data-uid="' + escapeHtmlLocal(u.uid) + '">' +
      '<div class="sj-admin-user-top">' + onlineDot +
        '<span class="sj-admin-user-name">' + escapeHtmlLocal(name) + '</span>' + badge + planBadge + bannedBadge +
      '</div>' +
      '<div class="sj-admin-user-meta">' + escapeHtmlLocal(u.email || "-") + ' · ' + escapeHtmlLocal(u.provider || "-") +
        ' · 최근 접속 ' + fmtTime(u.lastSeenAt) + ' · 위반 ' + (u.violationCount || 0) + '회' +
      '</div>' +
      '<div class="sj-admin-user-meta sj-admin-user-sub-meta">구독: ' + escapeHtmlLocal(subMetaText) + '</div>' +
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
      var grantBtn = e.target.closest(".sj-admin-grant-btn");
      if(grantBtn){
        var gUid = grantBtn.dataset.uid;
        var planSelect = container.querySelector('.sj-admin-grant-plan[data-uid="' + gUid + '"]');
        var daysInput = container.querySelector('.sj-admin-grant-days[data-uid="' + gUid + '"]');
        var planKey = planSelect ? planSelect.value : "basic";
        var days = daysInput ? parseInt(daysInput.value, 10) : NaN;
        if(!daysInput || isNaN(days) || days < 1 || days > 3650){
          alert("부여 기간(일)은 1~3650 사이의 숫자로 입력해주세요.");
          return;
        }
        if(!confirm((planKey === "pro" ? "프로" : "베이직") + " " + days + "일을 결제 없이 무료로 부여할까요?")) return;
        grantBtn.disabled = true;
        withIdToken(function(idToken){
          return authedFetch(GRANT_FREE_URL, idToken, { uid: gUid, planKey: planKey, days: days });
        }).then(function(){
          if(typeof toast === "function"){ toast("무료 기간을 부여했습니다"); }
        }).catch(function(err){
          alert("부여 실패: " + (err && err.message ? err.message : err));
        }).then(function(){ grantBtn.disabled = false; });
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
    btn.addEventListener("click", function(){ loadUsers(); loadSubscriptionStats(); });
  }

  /* ---------------- 구독 현황 (2026-09-21 추가) ----------------
     요금제별 구독자 수 막대그래프 + 연도 선택 가능한 월별 결제 합계 누적
     막대그래프. 외부 차트 라이브러리 없이 인라인 SVG로 직접 그린다 -- 이
     앱에는 이미 html2canvas 말고는 별도 시각화 라이브러리가 없어서, 이거
     하나만을 위해 새 스크립트를 추가하기보다 가볍게 직접 구현했다. */

  function fmtKRW(n){
    var v = Math.round(n || 0);
    return v.toLocaleString("ko-KR") + "원";
  }

  // 0을 포함해 4개의 "깔끔한" 눈금값을 만든다 (예: 최대값 27 -> [0,10,20,30]).
  function niceAxisMax(maxVal){
    if(!maxVal || maxVal <= 0) return 4;
    var rough = maxVal / 4;
    var mag = Math.pow(10, Math.floor(Math.log(rough) / Math.LN10));
    var norm = rough / mag;
    var step;
    if(norm <= 1) step = 1 * mag;
    else if(norm <= 2) step = 2 * mag;
    else if(norm <= 5) step = 5 * mag;
    else step = 10 * mag;
    return step * 4;
  }

  function svgEl(tag, attrs){
    var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for(var k in attrs){ el.setAttribute(k, attrs[k]); }
    return el;
  }

  // 위쪽 두 모서리만 둥근(r=4, 스펙의 "4px rounded data-end, square at baseline")
  // 막대 path를 만든다. h가 반지름보다 작으면(막대가 아주 낮으면) 사각형으로 대체.
  function roundedTopRectPath(x, y, w, h, r){
    if(h <= 0) return "";
    var rr = Math.min(r, w / 2, h);
    if(rr <= 0.5){
      return "M" + x + "," + (y + h) + " L" + x + "," + y + " L" + (x + w) + "," + y + " L" + (x + w) + "," + (y + h) + " Z";
    }
    return "M" + x + "," + (y + h) +
      " L" + x + "," + (y + rr) +
      " Q" + x + "," + y + " " + (x + rr) + "," + y +
      " L" + (x + w - rr) + "," + y +
      " Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + rr) +
      " L" + (x + w) + "," + (y + h) + " Z";
  }

  // 차트 전용 툴팁 하나를 재사용한다 (마크마다 새로 안 만듦).
  var vizTooltipEl = null;
  function getVizTooltip(){
    if(vizTooltipEl) return vizTooltipEl;
    vizTooltipEl = document.createElement("div");
    vizTooltipEl.className = "sj-viz-tooltip";
    document.body.appendChild(vizTooltipEl);
    return vizTooltipEl;
  }
  function showVizTooltip(evt, valueText, labelText){
    var tip = getVizTooltip();
    tip.innerHTML = "";
    var strong = document.createElement("span");
    strong.className = "sj-viz-tooltip-value";
    strong.textContent = valueText; // 값이 먼저, 굵게 (untrusted 텍스트라 textContent만 사용)
    var sub = document.createElement("span");
    sub.className = "sj-viz-tooltip-label";
    sub.textContent = labelText;
    tip.appendChild(strong);
    tip.appendChild(sub);
    tip.style.left = (evt.clientX + 12) + "px";
    tip.style.top = (evt.clientY + 12) + "px";
    tip.style.display = "flex";
  }
  function hideVizTooltip(){
    if(vizTooltipEl) vizTooltipEl.style.display = "none";
  }

  function renderSubStatsBar(stats){
    var bar = sj("sjAdminSubStatsBar");
    if(!bar) return;
    if(!stats){ bar.innerHTML = ""; return; }
    var totalPaid = PLAN_KEYS_ORDER.reduce(function(sum, k){ return sum + (stats.subscriberCounts[k] || 0); }, 0);
    bar.innerHTML =
      '<div class="sj-admin-stat-tile"><div class="sj-admin-stat-label">유료 구독자 수</div><div class="sj-admin-stat-value">' + totalPaid + '</div></div>' +
      '<div class="sj-admin-stat-tile"><div class="sj-admin-stat-label">현재 예상 월 정기 수익</div><div class="sj-admin-stat-value">' + fmtKRW(stats.currentMRR) + '</div></div>';
  }

  // 요금제별 구독자 수 -- 단일 시리즈 막대그래프(카테고리별 색만 다름, 범례는
  // 필요 없음 -- x축 라벨 자체가 정체성 채널). 값 라벨을 막대 위에 직접 표기.
  function renderPlanChart(counts){
    var host = sj("sjAdminPlanChart");
    if(!host) return;
    host.innerHTML = "";
    var width = Math.max(240, host.clientWidth || 280);
    var height = 160, padTop = 22, padBottom = 24, padSide = 12;
    var plotH = height - padTop - padBottom;
    var maxVal = niceAxisMax(Math.max.apply(null, PLAN_KEYS_ORDER.map(function(k){ return counts[k] || 0; })));
    var svg = svgEl("svg", { viewBox: "0 0 " + width + " " + height, width: "100%", height: height, role: "img", "aria-label": "요금제별 구독자 수" });

    // 눈금선(hairline) 4단
    for(var g = 0; g <= 4; g++){
      var gy = padTop + plotH - (plotH * g / 4);
      svg.appendChild(svgEl("line", { x1: padSide, x2: width - padSide, y1: gy, y2: gy, class: "sj-viz-gridline" }));
    }

    var slotW = (width - padSide * 2) / PLAN_KEYS_ORDER.length;
    var barW = Math.min(24, slotW * 0.5);
    PLAN_KEYS_ORDER.forEach(function(key, i){
      var val = counts[key] || 0;
      var cx = padSide + slotW * i + slotW / 2;
      var barH = maxVal > 0 ? (val / maxVal) * plotH : 0;
      var barY = padTop + plotH - barH;
      var path = svgEl("path", {
        d: roundedTopRectPath(cx - barW / 2, barY, barW, barH, 4),
        fill: PLAN_COLORS[key], class: "sj-viz-bar"
      });
      var hit = svgEl("rect", { x: cx - slotW / 2, y: padTop, width: slotW, height: plotH, fill: "transparent", style: "cursor:pointer;" });
      hit.addEventListener("pointermove", function(k, v){ return function(e){ showVizTooltip(e, v + "명", PLAN_SHORT_LABELS[k]); }; }(key, val));
      hit.addEventListener("pointerleave", hideVizTooltip);
      svg.appendChild(path);
      svg.appendChild(hit);
      var valueLabel = svgEl("text", { x: cx, y: barY - 6, class: "sj-viz-value-label", "text-anchor": "middle" });
      valueLabel.textContent = String(val);
      svg.appendChild(valueLabel);
      var catLabel = svgEl("text", { x: cx, y: height - 6, class: "sj-viz-axis-label", "text-anchor": "middle" });
      catLabel.textContent = PLAN_SHORT_LABELS[key];
      svg.appendChild(catLabel);
    });
    host.appendChild(svg);
  }

  function monthsForYear(monthlyRevenue, year){
    var byYm = {};
    (monthlyRevenue || []).forEach(function(m){ byYm[m.yearMonth] = m; });
    var out = [];
    for(var mo = 1; mo <= 12; mo++){
      var ym = year + "-" + String(mo).padStart(2, "0");
      out.push(byYm[ym] || { yearMonth: ym, totalKRW: 0, byPlan: {} });
    }
    return out;
  }

  function renderRevenueLegend(planLabels){
    var el = sj("sjAdminRevenueLegend");
    if(!el) return;
    el.innerHTML = "";
    PLAN_KEYS_ORDER.forEach(function(key){
      var item = document.createElement("span");
      item.className = "sj-viz-legend-item";
      var swatch = document.createElement("span");
      swatch.className = "sj-viz-legend-swatch";
      swatch.style.background = PLAN_COLORS[key];
      var label = document.createElement("span");
      label.textContent = (planLabels && planLabels[key]) || PLAN_SHORT_LABELS[key];
      item.appendChild(swatch);
      item.appendChild(label);
      el.appendChild(item);
    });
  }

  // 월별 결제 합계 -- 요금제별로 쌓은 스택 막대그래프. 세그먼트 사이 2px
  // 여백(surface gap)은 각 세그먼트를 그린 뒤 이음매에 배경색 얇은 선을
  // 덧그려서 표현한다. 맨 위 세그먼트만 위쪽이 둥글고(전체 막대 기준),
  // 바닥은 각지게 -- marks-and-anatomy 스펙 그대로.
  function renderRevenueChart(months){
    var host = sj("sjAdminRevenueChart");
    if(!host) return;
    host.innerHTML = "";
    var width = Math.max(320, host.clientWidth || 480);
    var height = 200, padTop = 28, padBottom = 22, padSide = 10;
    var plotH = height - padTop - padBottom;
    var totals = months.map(function(m){ return m.totalKRW || 0; });
    var maxVal = niceAxisMax(Math.max.apply(null, totals));
    var svg = svgEl("svg", { viewBox: "0 0 " + width + " " + height, width: "100%", height: height, role: "img", "aria-label": "월별 결제 합계" });

    for(var g = 0; g <= 4; g++){
      var gy = padTop + plotH - (plotH * g / 4);
      svg.appendChild(svgEl("line", { x1: padSide, x2: width - padSide, y1: gy, y2: gy, class: "sj-viz-gridline" }));
    }

    var slotW = (width - padSide * 2) / 12;
    var barW = Math.min(24, slotW * 0.6);
    months.forEach(function(m, i){
      var cx = padSide + slotW * i + slotW / 2;
      var total = m.totalKRW || 0;
      var stackH = maxVal > 0 ? (total / maxVal) * plotH : 0;
      var barTop = padTop + plotH - stackH;
      var clipId = "sjRevClip" + i;
      var clip = svgEl("clipPath", { id: clipId });
      clip.appendChild(svgEl("path", { d: roundedTopRectPath(cx - barW / 2, barTop, barW, stackH, 4) }));
      svg.appendChild(clip);

      var group = svgEl("g", { "clip-path": "url(#" + clipId + ")" });
      var cursorY = padTop + plotH; // 바닥부터 쌓아 올라간다
      PLAN_KEYS_ORDER.forEach(function(key){
        var amt = (m.byPlan && m.byPlan[key]) || 0;
        if(amt <= 0) return;
        var segH = (amt / maxVal) * plotH;
        var segY = cursorY - segH;
        var rect = svgEl("rect", { x: cx - barW / 2, y: segY, width: barW, height: segH, fill: PLAN_COLORS[key] });
        group.appendChild(rect);
        // 세그먼트 사이 2px 여백(다음 세그먼트와의 경계에 표면색 얇은 선).
        group.appendChild(svgEl("rect", { x: cx - barW / 2, y: segY, width: barW, height: 2, class: "sj-viz-seg-gap" }));
        cursorY = segY;
      });
      svg.appendChild(group);

      var hit = svgEl("rect", { x: cx - slotW / 2, y: padTop, width: slotW, height: plotH, fill: "transparent", style: "cursor:pointer;" });
      hit.addEventListener("pointermove", function(mm){ return function(e){
        var lines = PLAN_KEYS_ORDER.filter(function(k){ return (mm.byPlan && mm.byPlan[k]); })
          .map(function(k){ return PLAN_SHORT_LABELS[k] + " " + fmtKRW(mm.byPlan[k]); }).join(" · ");
        showVizTooltip(e, fmtKRW(mm.totalKRW || 0), lines || "결제 내역 없음");
      }; }(m));
      hit.addEventListener("pointerleave", hideVizTooltip);
      svg.appendChild(hit);

      if(total > 0){
        var valueLabel = svgEl("text", { x: cx, y: barTop - 6, class: "sj-viz-value-label", "text-anchor": "middle" });
        valueLabel.textContent = total.toLocaleString("ko-KR");
        svg.appendChild(valueLabel);
      }
      var moLabel = svgEl("text", { x: cx, y: height - 4, class: "sj-viz-axis-label", "text-anchor": "middle" });
      moLabel.textContent = (i + 1) + "월";
      svg.appendChild(moLabel);
    });
    host.appendChild(svg);
  }

  function renderRevenueTable(months, planLabels){
    var el = sj("sjAdminRevenueTable");
    if(!el) return;
    var head = "<tr><th>월</th>" + PLAN_KEYS_ORDER.map(function(k){ return "<th>" + escapeHtmlLocal((planLabels && planLabels[k]) || PLAN_SHORT_LABELS[k]) + "</th>"; }).join("") + "<th>합계</th></tr>";
    var rows = months.map(function(m, i){
      var cells = PLAN_KEYS_ORDER.map(function(k){ return "<td>" + fmtKRW((m.byPlan && m.byPlan[k]) || 0) + "</td>"; }).join("");
      return "<tr><td>" + (i + 1) + "월</td>" + cells + "<td><b>" + fmtKRW(m.totalKRW || 0) + "</b></td></tr>";
    }).join("");
    el.innerHTML = "<table>" + head + rows + "</table>";
  }

  function renderRevenueForYear(year){
    if(!lastSubStats) return;
    var months = monthsForYear(lastSubStats.monthlyRevenue, year);
    renderRevenueChart(months);
    renderRevenueLegend(lastSubStats.planLabels);
    renderRevenueTable(months, lastSubStats.planLabels);
    var yearTotal = months.reduce(function(sum, m){ return sum + (m.totalKRW || 0); }, 0);
    var totalEl = sj("sjAdminRevenueYearTotal");
    if(totalEl) totalEl.textContent = year + "년 총 결제액: " + fmtKRW(yearTotal);
  }

  function populateYearSelect(monthlyRevenue){
    var select = sj("sjAdminRevenueYearSelect");
    if(!select) return;
    var years = {};
    (monthlyRevenue || []).forEach(function(m){ years[m.yearMonth.slice(0, 4)] = true; });
    var thisYear = new Date().getFullYear();
    years[String(thisYear)] = true; // 결제 이력이 아직 없어도 올해는 항상 선택 가능하게.
    var yearList = Object.keys(years).sort().reverse();
    var prevValue = select.value;
    select.innerHTML = yearList.map(function(y){ return '<option value="' + y + '">' + y + '년</option>'; }).join("");
    select.value = yearList.indexOf(prevValue) !== -1 ? prevValue : String(thisYear);
  }

  function loadSubscriptionStats(){
    return withIdToken(function(idToken){
      return authedFetch(SUB_STATS_URL, idToken);
    }).then(function(data){
      lastSubStats = data;
      renderSubStatsBar(data);
      renderPlanChart(data.subscriberCounts || {});
      populateYearSelect(data.monthlyRevenue || []);
      var select = sj("sjAdminRevenueYearSelect");
      renderRevenueForYear(select ? select.value : String(new Date().getFullYear()));
    }).catch(function(e){
      var bar = sj("sjAdminSubStatsBar");
      if(bar){ bar.innerHTML = '<div class="sj-status error">구독 통계 불러오기 실패: ' + escapeHtmlLocal(e && e.message ? e.message : e) + '</div>'; }
    });
  }

  function bindRevenueControls(){
    var select = sj("sjAdminRevenueYearSelect");
    if(select){ select.addEventListener("change", function(){ renderRevenueForYear(select.value); }); }
    var toggleBtn = sj("sjAdminRevenueTableToggle");
    var tableEl = sj("sjAdminRevenueTable");
    if(toggleBtn && tableEl){
      toggleBtn.addEventListener("click", function(){
        var showing = tableEl.style.display !== "none";
        tableEl.style.display = showing ? "none" : "";
        toggleBtn.textContent = showing ? "표로 보기" : "그래프로 보기";
      });
    }
  }

  /* ---------------- 친구추천 이벤트 관리 (2026-09-26 추가) ----------------
     enabled 토글 / 기간 / 경품표(경품명·요금제·일수·확률가중치)를 한 화면에서
     관리한다. 기간을 바꾸지 않는 한(그냥 켰다 끄거나 경품표만 수정) 그동안
     쌓인 사용자별 추천/스핀 진행 상황은 서버(referral.js)가 그대로 보존한다. */

  var PLAN_LABELS_FOR_PRIZE = { basic: "베이직", pro: "프로" };

  function prizeRowHtml(p, idx){
    p = p || {};
    return '<div class="sj-admin-prize-row" data-idx="' + idx + '">' +
      '<input type="text" class="sj-admin-prize-label" placeholder="경품명 (예: 베이직 무료 1개월)" value="' + escapeHtmlLocal(p.label || "") + '">' +
      '<select class="sj-admin-prize-plan">' +
        '<option value="basic"' + (p.planKey === "pro" ? "" : " selected") + '>베이직</option>' +
        '<option value="pro"' + (p.planKey === "pro" ? " selected" : "") + '>프로</option>' +
      '</select>' +
      '<input type="number" class="sj-admin-prize-days" min="1" max="3650" placeholder="일수" value="' + (p.days || 30) + '"> 일' +
      '<input type="number" class="sj-admin-prize-weight" min="0.01" max="100000" step="0.01" placeholder="확률 가중치" value="' + (p.weight != null ? p.weight : 10) + '"> %' +
      '<button type="button" class="sj-admin-prize-remove-btn">✕</button>' +
    '</div>';
  }

  function renderPrizeRows(prizes){
    var host = sj("sjAdminRefPrizeRows");
    if(!host) return;
    var list = (prizes && prizes.length) ? prizes : [
      { label: "베이직 무료 1개월", planKey: "basic", days: 30, weight: 80 },
      { label: "베이직 무료 2개월", planKey: "basic", days: 60, weight: 10 },
      { label: "베이직 무료 3개월", planKey: "basic", days: 90, weight: 9 },
      { label: "프로 무료 3개월", planKey: "pro", days: 90, weight: 1 }
    ];
    host.innerHTML = list.map(prizeRowHtml).join("");
  }

  function bindPrizeRowsEvents(){
    var host = sj("sjAdminRefPrizeRows");
    if(!host) return;
    host.addEventListener("click", function(e){
      var removeBtn = e.target.closest(".sj-admin-prize-remove-btn");
      if(removeBtn){
        var row = removeBtn.closest(".sj-admin-prize-row");
        if(row) row.remove();
      }
    });
    var addBtn = sj("sjAdminRefAddPrizeBtn");
    if(addBtn){
      addBtn.addEventListener("click", function(){
        host.insertAdjacentHTML("beforeend", prizeRowHtml({ label: "", planKey: "basic", days: 30, weight: 10 }, host.children.length));
      });
    }
  }

  function collectPrizesFromForm(){
    var host = sj("sjAdminRefPrizeRows");
    if(!host) return [];
    return Array.prototype.map.call(host.querySelectorAll(".sj-admin-prize-row"), function(row){
      var label = row.querySelector(".sj-admin-prize-label").value.trim();
      var planKey = row.querySelector(".sj-admin-prize-plan").value;
      var days = parseInt(row.querySelector(".sj-admin-prize-days").value, 10);
      var weight = parseFloat(row.querySelector(".sj-admin-prize-weight").value);
      return { label: label, planKey: planKey, days: days, weight: weight };
    }).filter(function(p){
      return p.label && (p.planKey === "basic" || p.planKey === "pro") &&
        Number.isFinite(p.days) && p.days > 0 && Number.isFinite(p.weight) && p.weight > 0;
    });
  }

  // datetime-local 입력칸은 "YYYY-MM-DDTHH:mm"을 로컬 시간대 기준으로 주고받는다
  // (new Date()도 이 형식을 로컬 시간으로 해석하므로 따로 시간대 변환이 필요 없다).
  function isoToLocalInputValue(iso){
    if(!iso) return "";
    var d = new Date(iso);
    if(isNaN(d.getTime())) return "";
    var pad = function(n){ return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function loadReferralEvent(){
    return withIdToken(function(idToken){
      return authedFetch(GET_REF_EVENT_URL, idToken);
    }).then(function(data){
      var enabledEl = sj("sjAdminRefEventEnabled");
      var startEl = sj("sjAdminRefEventStart");
      var endEl = sj("sjAdminRefEventEnd");
      var badgeEl = sj("sjAdminRefEventLiveBadge");
      if(enabledEl) enabledEl.checked = !!(data && data.enabled);
      if(startEl) startEl.value = isoToLocalInputValue(data && data.startAt);
      if(endEl) endEl.value = isoToLocalInputValue(data && data.endAt);
      if(badgeEl) badgeEl.textContent = (data && data.live) ? "🟢 현재 진행중" : "⚪ 진행중 아님";
      renderPrizeRows(data && data.prizes);
    }).catch(function(e){
      var status = sj("sjAdminRefStatus");
      if(status){ status.className = "sj-status error"; status.textContent = "이벤트 정보 불러오기 실패: " + (e && e.message ? e.message : e); }
    });
  }

  function bindReferralEventSave(){
    var btn = sj("sjAdminRefSaveBtn");
    if(!btn) return;
    btn.addEventListener("click", function(){
      var status = sj("sjAdminRefStatus");
      var enabledEl = sj("sjAdminRefEventEnabled");
      var startEl = sj("sjAdminRefEventStart");
      var endEl = sj("sjAdminRefEventEnd");
      var enabled = !!(enabledEl && enabledEl.checked);
      var startVal = startEl && startEl.value;
      var endVal = endEl && endEl.value;
      if(!startVal || !endVal){
        alert("시작일시와 종료일시를 모두 입력해주세요.");
        return;
      }
      var startIso = new Date(startVal).toISOString();
      var endIso = new Date(endVal).toISOString();
      if(new Date(endIso).getTime() <= new Date(startIso).getTime()){
        alert("종료일시는 시작일시보다 나중이어야 합니다.");
        return;
      }
      var prizes = collectPrizesFromForm();
      if(!prizes.length){
        alert("유효한 경품을 1개 이상 입력해주세요 (경품명/일수/확률 가중치 모두 필요).");
        return;
      }
      btn.disabled = true;
      if(status){ status.className = "sj-status"; status.textContent = "저장 중..."; }
      withIdToken(function(idToken){
        return authedFetch(SET_REF_EVENT_URL, idToken, { enabled: enabled, startAt: startIso, endAt: endIso, prizes: prizes });
      }).then(function(data){
        if(status){ status.className = "sj-status"; status.textContent = "저장되었습니다" + (data && data.live ? " (현재 진행중)" : ""); }
        if(typeof toast === "function"){ toast("친구추천 이벤트 설정이 저장되었습니다"); }
        var badgeEl = sj("sjAdminRefEventLiveBadge");
        if(badgeEl) badgeEl.textContent = (data && data.live) ? "🟢 현재 진행중" : "⚪ 진행중 아님";
      }).catch(function(e){
        if(status){ status.className = "sj-status error"; status.textContent = "저장 실패: " + (e && e.message ? e.message : e); }
      }).then(function(){ btn.disabled = false; });
    });
  }

  function onOpen(){
    loadConfig();
    loadUsers();
    loadSubscriptionStats();
    loadReferralEvent();
  }

  bindUserListEvents();
  bindGlobalBlockSave();
  bindRefresh();
  bindRevenueControls();
  bindPrizeRowsEvents();
  bindReferralEventSave();

  window.__sjAdmin = { onOpen: onOpen };
})();
