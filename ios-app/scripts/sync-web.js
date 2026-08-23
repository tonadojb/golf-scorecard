/* golf-scorecard 웹앱(../index.html, ../js/*, ../styles.css)을 이 Capacitor
 * 프로젝트의 www/ 폴더로 복사합니다.
 *
 * 왜 원본을 직접 webDir로 지정하지 않았는가: golf-scorecard 폴더 자체가
 * GitHub Pages로 배포되는 실제 웹사이트 루트라서, 그 안에 ios-app/ 같은
 * 네이티브 프로젝트 관련 파일(ios/, node_modules/ 등)이 섞여 들어가면
 * 실제 서비스에 영향을 줄 위험이 있습니다. 그래서 이 스크립트가 필요한
 * 웹 파일만 골라 www/ 로 복사하고, Capacitor는 이 www/ 폴더만 봅니다.
 * (Xcode에서 빌드하기 전, 또는 CI에서 매번 이 스크립트를 먼저 실행합니다.)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..'); // golf-scorecard 폴더
const OUT = path.resolve(__dirname, '..', 'www');

function copyFile(rel) {
  const src = path.join(ROOT, rel);
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('copied', rel);
}

function copyDir(rel) {
  const src = path.join(ROOT, rel);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const childRel = path.join(rel, entry.name);
    if (entry.isDirectory()) {
      copyDir(childRel);
    } else {
      copyFile(childRel);
    }
  }
}

if (fs.existsSync(OUT)) {
  fs.rmSync(OUT, { recursive: true, force: true });
}
fs.mkdirSync(OUT, { recursive: true });

copyFile('index.html');
copyFile('styles.css');
copyDir('js');

console.log('www/ 폴더 갱신 완료 ->', OUT);
