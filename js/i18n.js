var I18N = {
  ko:{
    title:"⛳ 골프 스코어카드",
    courseNamePlaceholder:"코스명을 입력하세요",
    langBtn:"🌐 Language",
    tabSetup:"👥 팀 설정",
    tabPlay:"🏌️ 스코어 입력",
    tabResult:"📋 결과",
    holeCountLabel:"홀 수 선택",
    hole9:"9홀",
    hole18:"18홀",
    addTeam:"+ 팀 추가 (최대 20팀)",
    resetAll:"전체 초기화",
    teamNamePlaceholder:"팀 이름",
    playerPlaceholder:function(n){ return "플레이어"+n; },
    removeTeam:"✕ 삭제",
    holeNotePlaceholder:"이 홀의 특징을 적어보세요 (도그렉, 벙커, OB, 그린 경사 등)",
    prevHole:"◀ 이전 홀",
    nextHole:"다음 홀 ▶",
    holeLabel:function(n){ return n+"번 홀"; },
    courseNameEmpty:"코스명 미입력",
    holesSuffix:"홀",
    tableCategory:"구분",
    tableTotal:"합계",
    outLabel:"전반",
    inLabel:"후반",
    copyResult:"📋 결과 복사하기 (SNS 공유)",
    shareModalTitle:"공유 방식을 선택하세요",
    shareAsText:"📝 텍스트로 복사",
    shareAsImage:"🖼️ 이미지로 복사",
    shareCancel:"취소",
    toastImageCopied:"이미지가 복사되었습니다! SNS에 붙여넣기 하세요",
    toastImageSaved:"이미지가 저장되었습니다. 갤러리에서 공유해보세요",
    toastImageFail:"이미지 생성에 실패했습니다",
    anonymizeLabel:"🙈 SNS 공유 시 이름 가리기",
    sortTeamView:"팀별 보기",
    sortRankView:"🏆 순위별 보기",
    rankColumnHeader:"순위",
    footer:"Field Golf Scorecard · 데이터는 이 기기에만 저장됩니다",
    toastMaxTeams:"팀은 최대 20개까지 만들 수 있어요",
    toastReset:"초기화되었습니다",
    toastCopied:"결과가 복사되었습니다! SNS에 붙여넣기 하세요",
    toastCopyFail:"복사에 실패했습니다",
    confirmRemoveTeam:function(name){ return '"'+name+'" 팀을 삭제할까요?'; },
    confirmReset:"모든 팀, 스코어, 홀 정보를 초기화할까요? 이 작업은 되돌릴 수 없습니다.",
    copyDatePrefix:"📅",
    copyTotalLabel:"합계",
    copyFooter:"- Field Golf Scorecard -"
  },
  en:{
    title:"⛳ Golf Scorecard",
    courseNamePlaceholder:"Enter course name",
    langBtn:"🌐 Language",
    tabSetup:"👥 Teams",
    tabPlay:"🏌️ Enter Score",
    tabResult:"📋 Results",
    holeCountLabel:"Number of Holes",
    hole9:"9 Holes",
    hole18:"18 Holes",
    addTeam:"+ Add Team (max 20)",
    resetAll:"Reset All",
    teamNamePlaceholder:"Team name",
    playerPlaceholder:function(n){ return "Player "+n; },
    removeTeam:"✕ Remove",
    holeNotePlaceholder:"Notes about this hole (dogleg, bunker, OB, green slope, etc.)",
    prevHole:"◀ Prev Hole",
    nextHole:"Next Hole ▶",
    holeLabel:function(n){ return "Hole "+n; },
    courseNameEmpty:"No course name",
    holesSuffix:"holes",
    tableCategory:"Player",
    tableTotal:"Total",
    outLabel:"OUT",
    inLabel:"IN",
    copyResult:"📋 Copy Results (Share)",
    shareModalTitle:"Choose how to share",
    shareAsText:"📝 Copy as Text",
    shareAsImage:"🖼️ Copy as Image",
    shareCancel:"Cancel",
    toastImageCopied:"Image copied! Paste it on social media",
    toastImageSaved:"Image saved. Share it from your gallery",
    toastImageFail:"Failed to create image",
    anonymizeLabel:"🙈 Hide names when sharing",
    sortTeamView:"By Team",
    sortRankView:"🏆 By Ranking",
    rankColumnHeader:"Rank",
    footer:"Field Golf Scorecard · Data is stored only on this device",
    toastMaxTeams:"You can create up to 20 teams",
    toastReset:"Reset complete",
    toastCopied:"Result copied! Paste it on social media",
    toastCopyFail:"Copy failed",
    confirmRemoveTeam:function(name){ return 'Remove team "'+name+'"?'; },
    confirmReset:"Reset all teams, scores, and hole info? This cannot be undone.",
    copyDatePrefix:"📅",
    copyTotalLabel:"Total",
    copyFooter:"- Field Golf Scorecard -"
  },
  ja:{
    title:"⛳ ゴルフスコアカード",
    courseNamePlaceholder:"コース名を入力してください",
    langBtn:"🌐 Language",
    tabSetup:"👥 チーム設定",
    tabPlay:"🏌️ スコア入力",
    tabResult:"📋 結果",
    holeCountLabel:"ホール数選択",
    hole9:"9ホール",
    hole18:"18ホール",
    addTeam:"+ チーム追加 (最大20チーム)",
    resetAll:"全体初期化",
    teamNamePlaceholder:"チーム名",
    playerPlaceholder:function(n){ return "プレイヤー"+n; },
    removeTeam:"✕ 削除",
    holeNotePlaceholder:"このホールの特徴を入力(ドッグレッグ、バンカー、OB、グリーンの傾斜など)",
    prevHole:"◀ 前のホール",
    nextHole:"次のホール ▶",
    holeLabel:function(n){ return n+"番ホール"; },
    courseNameEmpty:"コース名未入力",
    holesSuffix:"ホール",
    tableCategory:"区分",
    tableTotal:"合計",
    outLabel:"アウト",
    inLabel:"イン",
    copyResult:"📋 結果をコピー(SNS共有)",
    shareModalTitle:"共有方法を選択してください",
    shareAsText:"📝 テキストでコピー",
    shareAsImage:"🖼️ 画像でコピー",
    shareCancel:"キャンセル",
    toastImageCopied:"画像がコピーされました!SNSに貼り付けてください",
    toastImageSaved:"画像を保存しました。ギャラリーから共有してください",
    toastImageFail:"画像の作成に失敗しました",
    anonymizeLabel:"🙈 共有時に名前を隠す",
    sortTeamView:"チーム別表示",
    sortRankView:"🏆 順位別表示",
    rankColumnHeader:"順位",
    footer:"Field Golf Scorecard · データはこの端末にのみ保存されます",
    toastMaxTeams:"チームは最大20個まで作成できます",
    toastReset:"初期化されました",
    toastCopied:"結果がコピーされました!SNSに貼り付けてください",
    toastCopyFail:"コピーに失敗しました",
    confirmRemoveTeam:function(name){ return '"'+name+'"チームを削除しますか?'; },
    confirmReset:"すべてのチーム、スコア、ホール情報を初期化しますか?この操作は元に戻せません。",
    copyDatePrefix:"📅",
    copyTotalLabel:"合計",
    copyFooter:"- Field Golf Scorecard -"
  },
  zh:{
    title:"⛳ 高尔夫记分卡",
    courseNamePlaceholder:"请输入球场名称",
    langBtn:"🌐 Language",
    tabSetup:"👥 队伍设置",
    tabPlay:"🏌️ 输入成绩",
    tabResult:"📋 结果",
    holeCountLabel:"选择洞数",
    hole9:"9洞",
    hole18:"18洞",
    addTeam:"+ 添加队伍(最多20队)",
    resetAll:"全部重置",
    teamNamePlaceholder:"队伍名称",
    playerPlaceholder:function(n){ return "球员"+n; },
    removeTeam:"✕ 删除",
    holeNotePlaceholder:"记录本洞特点(狗腿、沙坑、OB、果岭坡度等)",
    prevHole:"◀ 上一洞",
    nextHole:"下一洞 ▶",
    holeLabel:function(n){ return "第"+n+"洞"; },
    courseNameEmpty:"未输入球场名称",
    holesSuffix:"洞",
    tableCategory:"项目",
    tableTotal:"总计",
    outLabel:"前九",
    inLabel:"后九",
    copyResult:"📋 复制结果(社交分享)",
    shareModalTitle:"请选择分享方式",
    shareAsText:"📝 复制为文本",
    shareAsImage:"🖼️ 复制为图片",
    shareCancel:"取消",
    toastImageCopied:"图片已复制!请粘贴到社交媒体",
    toastImageSaved:"图片已保存,请从相册分享",
    toastImageFail:"图片生成失败",
    anonymizeLabel:"🙈 分享时隐藏姓名",
    sortTeamView:"按队伍显示",
    sortRankView:"🏆 按排名显示",
    rankColumnHeader:"排名",
    footer:"Field Golf Scorecard · 数据仅保存在本设备",
    toastMaxTeams:"最多可以创建20支队伍",
    toastReset:"已重置",
    toastCopied:"结果已复制!请粘贴到社交媒体",
    toastCopyFail:"复制失败",
    confirmRemoveTeam:function(name){ return '要删除队伍"'+name+'"吗?'; },
    confirmReset:"要重置所有队伍、成绩和球洞信息吗?此操作无法撤销。",
    copyDatePrefix:"📅",
    copyTotalLabel:"总计",
    copyFooter:"- Field Golf Scorecard -"
  }
};

function t(key){
  var dict = I18N[(state && state.lang) || 'ko'];
  var v = dict[key];
  if(typeof v === 'function'){
    var args = Array.prototype.slice.call(arguments, 1);
    return v.apply(null, args);
  }
  return v;
}


/* ---------------- Language switcher ---------------- */
var langBtn = document.getElementById('langBtn');
var langDropdown = document.getElementById('langDropdown');

langBtn.addEventListener('click', function(e){
  e.stopPropagation();
  langDropdown.classList.toggle('show');
});
document.addEventListener('click', function(){
  langDropdown.classList.remove('show');
});
langDropdown.addEventListener('click', function(e){
  var btn = e.target.closest('button[data-lang]');
  if(!btn) return;
  e.stopPropagation();
  state.lang = btn.dataset.lang;
  relocalizeDefaultPlayerNames();
  save();
  langDropdown.classList.remove('show');
  applyStaticTranslations();
  renderAll();
});

/* True if this name is still one of the auto-generated default names (in any supported language),
   i.e. the user never customized it, so it's safe to translate. */
function isDefaultPlayerName(name, idx){
  return Object.keys(I18N).some(function(lang){
    return I18N[lang].playerPlaceholder(idx+1) === name;
  });
}

function relocalizeDefaultPlayerNames(){
  state.teams.forEach(function(team){
    team.players.forEach(function(pname, pi){
      if(isDefaultPlayerName(pname, pi)){
        team.players[pi] = t('playerPlaceholder', pi+1);
      }
    });
  });
}

function applyStaticTranslations(){
  document.documentElement.lang = state.lang;
  document.title = t('title');
  document.getElementById('appTitle').textContent = t('title');
  document.getElementById('courseName').placeholder = t('courseNamePlaceholder');
  document.getElementById('tabSetupBtn').textContent = t('tabSetup');
  document.getElementById('tabPlayBtn').textContent = t('tabPlay');
  document.getElementById('tabResultBtn').textContent = t('tabResult');
  document.getElementById('holeCountLabel').textContent = t('holeCountLabel');
  document.getElementById('hole9Btn').textContent = t('hole9');
  document.getElementById('hole18Btn').textContent = t('hole18');
  document.getElementById('addTeamBtn').textContent = t('addTeam');
  document.getElementById('resetBtn').textContent = t('resetAll');
  document.getElementById('holeNote').placeholder = t('holeNotePlaceholder');
  document.getElementById('prevHoleBtn').textContent = t('prevHole');
  document.getElementById('nextHoleBtn').textContent = t('nextHole');
  document.getElementById('copyBtn').textContent = t('copyResult');
  document.getElementById('shareModalTitle').textContent = t('shareModalTitle');
  document.getElementById('shareAsTextBtn').textContent = t('shareAsText');
  document.getElementById('shareAsImageBtn').textContent = t('shareAsImage');
  document.getElementById('shareCancelBtn').textContent = t('shareCancel');
  document.getElementById('anonymizeLabel').textContent = t('anonymizeLabel');
  document.getElementById('sortTeamBtn').textContent = t('sortTeamView');
  document.getElementById('sortRankBtn').textContent = t('sortRankView');
  document.getElementById('footerText').textContent = t('footer');
  Array.prototype.forEach.call(langDropdown.querySelectorAll('button[data-lang]'), function(b){
    b.classList.toggle('active', b.dataset.lang === state.lang);
  });
}


