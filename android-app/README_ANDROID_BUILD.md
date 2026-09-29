# Android 빌드 준비 (다음에 직접 실행할 명령어)

이 폴더(`android-app`)는 iOS의 `ios-app`과 똑같은 구조로 만든 뼈대(scaffold)입니다.
`package.json`, `capacitor.config.json`, `.gitignore`, `scripts/sync-web.js`,
`resources/icon.png`, `resources/splash.png`는 미리 준비해뒀지만,
**실제 Android 네이티브 프로젝트(`android/` 폴더)는 아직 없습니다** —
이건 npm/npx 명령이 필요해서 원격에서는 만들 수 없고, PC에서 직접 실행해야 합니다.

## 사전 준비물
- Node.js (이미 ios-app 빌드에 써봤으니 설치되어 있을 것)
- Android Studio (Android SDK를 위해 필요 — 없으면 https://developer.android.com/studio 에서 설치)

## PowerShell에서 순서대로 실행

```powershell
cd "C:\1-1.클루드 작업\Golf-Scorecard\golf-scorecard\android-app"

# 1) 이 폴더에 정의된 패키지 설치 (Capacitor core, android 플랫폼 등)
npm install

# 2) 웹 파일(index.html, js/, styles.css)을 www/ 로 복사 + 실제 android/ 네이티브 프로젝트 생성
npm run sync-web
npx cap add android

# 3) 이후로는 웹 코드 수정할 때마다 이 명령 하나로 android 쪽에 반영
npm run sync

# 4) 앱 아이콘/스플래시 이미지를 android/ 프로젝트의 각 해상도별 리소스로 자동 생성
npx capacitor-assets generate --android
```

`npx cap add android`를 실행하면 `android/` 폴더가 새로 생기고, 그 안에
Gradle 프로젝트(Android Studio로 열 수 있는 실제 네이티브 프로젝트)가 만들어집니다.
이후 Android Studio에서 `android-app/android` 폴더를 열면 iOS의 Xcode 프로젝트처럼
빌드/서명/에뮬레이터 실행이 가능해집니다.

## 참고
- `appId`는 iOS와 동일하게 `com.skyjang.golfscorecard`로 맞춰뒀습니다 (Play Console에도 이 값으로 등록).
- `appName`도 iOS와 동일하게 `Tonado_GolfScoreCard`로 맞춰뒀습니다.
- 웹 코드(js/, index.html, styles.css)는 iOS와 완전히 공유합니다 — 앞으로 기능 수정은
  `golf-scorecard` 루트에서 한 번만 하면 `ios-app`과 `android-app` 양쪽에 똑같이 반영됩니다
  (`npm run sync`를 각 폴더에서 한 번씩 실행).
- 구글 플레이 콘솔 조직 계정 생성, RevenueCat Android 연동, 14일 비공개 테스트 등
  나머지 출시 절차는 프로젝트에 저장된 `android-launch-checklist.md` 참고.
