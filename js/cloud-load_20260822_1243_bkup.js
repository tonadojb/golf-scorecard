(function(){
  function sj(id){ return document.getElementById(id); }
  var LIST_URL = "https://asia-northeast3-skyjang-golfscore.cloudfunctions.net/listRounds";
  var cachedRounds = [];

  function tt(key, fallback){
    return (typeof t === "function") ? t(key) : fallback;
  }

  function extractYear(roundDate){
    if(!roundDate) return null;
    var m = String(roundDate).match(/^(\d{4})/);
    return m ? m[1] : null;
  }

  function populateYearFilter(){
    var sel = sj("sjLoadYearFilter");
    if(!sel) return;
    var years = [];
    cachedRounds.forEach(function(r){
      var y = extractYear(r.roundDate);
      if(y && years.indexOf(y) === -1) years.push(y);
    });
    years.sort().reverse();
    var prev = sel.value;
    sel.innerHTML = '<option value="">' + tt("loadYearAll", "전체 연도") + '</option>' +
      years.map(function(y){ return '<option value="'+y+'">'+y+'</option>'; }).join("");
    if(years.indexOf(prev) !== -1){ sel.value = prev; }
  }

  /* Returns [{r, idx}] -- idx is the index into cachedRounds so a click on
     a filtered row can still resolve back to the original round object. */
  function getFilteredEntries(){
    var courseQuery = ((sj("sjLoadCourseFilter") && sj("sjLoadCourseFilter").value) || "").trim().toLowerCase();
    var yearQuery = (sj("sjLoadYearFilter") && sj("sjLoadYearFilter").value) || "";
    return cachedRounds.map(function(r, idx){ return { r: r, idx: idx }; }).filter(function(entry){
      var r = entry.r;
      if(courseQuery){
        var name = (r.courseName || "").toLowerCase();
        if(name.indexOf(courseQuery) === -1) return false;
      }
      if(yearQuery){
        if(extractYear(r.roundDate) !== yearQuery) return false;
      }
      return true;
    });
  }

  function renderList(){
    var listEl = sj("sjLoadList");
    var statusEl = sj("sjLoadStatus");
    if(!listEl) return;
    if(!cachedRounds.length){
      listEl.innerHTML = "";
      if(statusEl){
        statusEl.className = "sj-status";
        statusEl.textContent = tt("loadEmpty", "저장된 라운드가 없습니다");
      }
      return;
    }
    var entries = getFilteredEntries();
    if(!entries.length){
      listEl.innerHTML = "";
      if(statusEl){
        statusEl.className = "sj-status";
        statusEl.textContent = tt("loadNoMatch", "검색 결과가 없습니다");
      }
      return;
    }
    if(statusEl){ statusEl.textContent = ""; }
    listEl.innerHTML = entries.map(function(entry){
      var r = entry.r;
      var course = r.courseName ? escapeHtml(r.courseName) : tt("loadNoCourseName", "골프장 미입력");
      if(r.courseSub){ course += " (" + escapeHtml(r.courseSub) + ")"; }
      var date = r.roundDate ? escapeHtml(r.roundDate) : tt("loadNoDate", "날짜 미입력");
      var toPar = signedLabel(r.scoreToPar);
      return '<div class="sj-load-item" data-idx="'+entry.idx+'" style="border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer;">' +
        '<div style="font-weight:600;font-size:14px;color:#1f2b24;">' + course + '</div>' +
        '<div style="font-size:12px;color:#666;margin-top:2px;">' + date + '</div>' +
        '<div style="font-size:13px;color:#1b6b3c;margin-top:4px;font-weight:600;">' + r.totalScore + ' (' + toPar + ')</div>' +
        '</div>';
    }).join("");
  }

  /* Applies a saved round directly onto the live scorecard (team 0) --
     reuses the same merge logic OCR results go through, since the shape
     (courseName/courseSub/roundDate/teeOffTime/pars/players[]) matches.
     Self player's name isn't stored server-side (only companions are), so
     it's passed as null and hydrateFromOCR leaves whatever name is
     already there untouched. */
  function applyRoundToState(r){
    if(typeof state === "undefined" || !state || !window.__golfScorecardAPI) return;
    if(r.holeCount === 9 || r.holeCount === 18){
      state.holeCount = r.holeCount;
      if(typeof normalize === "function") normalize();
    }
    var players = [{ name: null, isSelf: true, holeScores: r.holeScores || [] }]
      .concat((r.companions || []).map(function(name){ return { name: name, isSelf: false, holeScores: [] }; }));
    var data = {
      courseName: r.courseName || null,
      courseSub: r.courseSub || null,
      roundDate: r.roundDate || null,
      teeOffTime: r.teeOffTime || null,
      pars: (r.pars && r.pars.length) ? r.pars : null,
      players: players
    };
    window.__golfScorecardAPI.hydrateFromOCR(data, 0);
  }

  function bindListClick(){
    var listEl = sj("sjLoadList");
    if(!listEl) return;
    listEl.addEventListener("click", function(e){
      var item = e.target.closest(".sj-load-item");
      if(!item) return;
      var idx = parseInt(item.dataset.idx, 10);
      var r = cachedRounds[idx];
      if(!r) return;
      applyRoundToState(r);
      var resultTabBtn = sj("tabResultBtn");
      if(resultTabBtn) resultTabBtn.click();
      var modal = sj("sjLoadModal");
      if(modal) modal.classList.remove("open");
      if(typeof toast === "function"){ toast(tt("loadApplied", "라운드를 불러왔습니다")); }
    });
  }

  function bindFilters(){
    var courseInput = sj("sjLoadCourseFilter");
    var yearSelect = sj("sjLoadYearFilter");
    if(courseInput){ courseInput.addEventListener("input", renderList); }
    if(yearSelect){ yearSelect.addEventListener("change", renderList); }
  }

  function onOpen(){
    var statusEl = sj("sjLoadStatus");
    var listEl = sj("sjLoadList");
    var courseInput = sj("sjLoadCourseFilter");
    var yearSelect = sj("sjLoadYearFilter");
    if(courseInput) courseInput.value = "";
    if(yearSelect) yearSelect.value = "";
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
        populateYearFilter();
        renderList();
      })
      .catch(function(e){
        if(statusEl){
          statusEl.className = "sj-status error";
          statusEl.textContent = tt("loadFetchFail", "불러오기 실패") + ": " + (e && e.message ? e.message : e);
        }
      });
  }

  bindListClick();
  bindFilters();
  window.__sjCloudLoad = { onOpen: onOpen };
})();
