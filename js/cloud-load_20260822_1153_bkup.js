(function(){
  function sj(id){ return document.getElementById(id); }
  var LIST_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/listRounds";
  var cachedRounds = [];

  function tt(key, fallback){
    return (typeof t === "function") ? t(key) : fallback;
  }

  function renderList(rounds){
    var listEl = sj("sjLoadList");
    var statusEl = sj("sjLoadStatus");
    if(!listEl) return;
    if(!rounds || !rounds.length){
      listEl.innerHTML = "";
      if(statusEl){
        statusEl.className = "sj-status";
        statusEl.textContent = tt("loadEmpty", "저장된 라운드가 없습니다");
      }
      return;
    }
    if(statusEl){ statusEl.textContent = ""; }
    listEl.innerHTML = rounds.map(function(r, idx){
      var course = r.courseName ? escapeHtml(r.courseName) : tt("loadNoCourseName", "골프장 미입력");
      if(r.courseSub){ course += " (" + escapeHtml(r.courseSub) + ")"; }
      var date = r.roundDate ? escapeHtml(r.roundDate) : tt("loadNoDate", "날짜 미입력");
      var toPar = signedLabel(r.scoreToPar);
      return '<div class="sj-load-item" data-idx="'+idx+'" style="border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer;">' +
        '<div style="font-weight:600;font-size:14px;color:#1f2b24;">' + course + '</div>' +
        '<div style="font-size:12px;color:#666;margin-top:2px;">' + date + '</div>' +
        '<div style="font-size:13px;color:#1b6b3c;margin-top:4px;font-weight:600;">' + r.totalScore + ' (' + toPar + ')</div>' +
        '</div>';
    }).join("");
  }

  function renderDetail(r){
    var content = sj("sjLoadDetailContent");
    if(!content) return;
    var course = r.courseName ? escapeHtml(r.courseName) : tt("loadNoCourseName", "골프장 미입력");
    if(r.courseSub){ course += " (" + escapeHtml(r.courseSub) + ")"; }
    var date = r.roundDate ? escapeHtml(r.roundDate) : tt("loadNoDate", "날짜 미입력");
    if(r.teeOffTime){ date += " " + escapeHtml(r.teeOffTime); }
    var companionsLabel = tt("loadCompanionsLabel", "동반자");
    var companions = (r.companions && r.companions.length) ? r.companions.map(escapeHtml).join(", ") : "-";
    var totalLabel = tt("loadTotalLabel", "합계");
    var toPar = signedLabel(r.scoreToPar);
    var holeLabel = tt("loadHoleLabel", "홀");
    var parLabel = tt("loadParLabel", "파");
    var scoreLabel = tt("loadScoreLabel", "스코어");

    var pars = r.pars || [];
    var scores = r.holeScores || [];
    var n = Math.max(pars.length, scores.length);
    var rows = "";
    for(var i=0; i<n; i++){
      var par = pars[i];
      var rel = scores[i];
      var abs = (typeof par === "number" && typeof rel === "number") ? (par + rel) : null;
      rows += '<tr>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #f1f1f1;">' + (i+1) + '</td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #f1f1f1;">' + (typeof par === "number" ? par : "-") + '</td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #f1f1f1;">' +
          (abs !== null ? abs : "-") + (typeof rel === "number" ? ' (' + signedLabel(rel) + ')' : '') +
        '</td></tr>';
    }

    content.innerHTML =
      '<div style="font-weight:600;font-size:15px;color:#1f2b24;">' + course + '</div>' +
      '<div style="font-size:13px;color:#666;margin-top:2px;">' + date + '</div>' +
      '<div style="font-size:13px;color:#444;margin-top:6px;">' + companionsLabel + ': ' + companions + '</div>' +
      '<div style="font-size:15px;color:#1b6b3c;font-weight:700;margin-top:8px;">' + totalLabel + ': ' + r.totalScore + ' (' + toPar + ')</div>' +
      (n ? (
        '<table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:13px;">' +
        '<thead><tr>' +
        '<th style="text-align:left;padding:4px 6px;border-bottom:1px solid #ccc;">' + holeLabel + '</th>' +
        '<th style="text-align:left;padding:4px 6px;border-bottom:1px solid #ccc;">' + parLabel + '</th>' +
        '<th style="text-align:left;padding:4px 6px;border-bottom:1px solid #ccc;">' + scoreLabel + '</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>'
      ) : '');
  }

  function showList(){
    var listView = sj("sjLoadListView");
    var detailView = sj("sjLoadDetailView");
    if(listView) listView.style.display = "";
    if(detailView) detailView.style.display = "none";
  }

  function showDetail(idx){
    var r = cachedRounds[idx];
    if(!r) return;
    renderDetail(r);
    var listView = sj("sjLoadListView");
    var detailView = sj("sjLoadDetailView");
    if(listView) listView.style.display = "none";
    if(detailView) detailView.style.display = "";
  }

  function bindListClick(){
    var listEl = sj("sjLoadList");
    if(!listEl) return;
    listEl.addEventListener("click", function(e){
      var item = e.target.closest(".sj-load-item");
      if(!item) return;
      showDetail(parseInt(item.dataset.idx, 10));
    });
  }

  function bindBack(){
    var btn = sj("sjLoadBackBtn");
    if(!btn) return;
    btn.addEventListener("click", function(){ showList(); });
  }

  function onOpen(){
    showList();
    var statusEl = sj("sjLoadStatus");
    var listEl = sj("sjLoadList");
    if(listEl) listEl.innerHTML = "";
    if(statusEl){ statusEl.className = "sj-status"; statusEl.textContent = "불러오는 중..."; }
    var currentUser = window.__sjAuth && window.__sjAuth.getCurrentUser();
    if(!currentUser){
      if(statusEl){ statusEl.className = "sj-status error"; statusEl.textContent = "로그인이 필요합니다."; }
      return;
    }
    currentUser.getIdToken().then(function(idToken){
      return fetch(LIST_URL, {
        method: "GET",
        headers: { "Authorization": "Bearer " + idToken }
      });
    }).then(function(res){ return res.json(); })
      .then(function(data){
        if(data && data.error){ throw new Error(data.error); }
        cachedRounds = (data && data.rounds) || [];
        renderList(cachedRounds);
      })
      .catch(function(e){
        if(statusEl){
          statusEl.className = "sj-status error";
          statusEl.textContent = tt("loadFetchFail", "불러오기 실패") + ": " + (e && e.message ? e.message : e);
        }
      });
  }

  bindListClick();
  bindBack();
  window.__sjCloudLoad = { onOpen: onOpen };
})();
