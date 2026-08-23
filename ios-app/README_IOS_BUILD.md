# 골프 스코어카드 iOS 앱 — 빌드 & 제출 가이드

이 폴더(`ios-app/`)는 지금 서비스 중인 `golf-scorecard` 웹앱을 **Capacitor**로 감싼
iOS 프로젝트입니다. Mac이 없으신 상태라, 실제 빌드(컴파일)·서명·App Store 업로드는
**Codemagic**(클라우드 Mac 빌드 서비스)을 통해 Mac 없이 진행하는 것을 전제로
구성했습니다.

## 지금까지 되어 있는 것

- Capacitor 프로젝트 뼈대 (`package.json`, `capacitor.config.json`, `ios/` 네이티브 프로젝트)
- 앱 이름: **골프 스코어카드** / 번들 ID(고유 식별자): **com.skyjang.golfscorecard**
  (원하시면 다른 값으로 바꿔도 됩니다 — 아래 "번들 ID를 바꾸고 싶다면" 참고)
- 임시 앱 아이콘 + 스플래시 화면 (초록 배경 + 골프 깃발, `resources/icon.png`로 교체 후
  `npx capacitor-assets generate --ios` 재실행하면 원하는 디자인으로 바꿀 수 있습니다)
- `Info.plist`에 카메라/사진 접근 권한 안내 문구, `ITSAppUsesNonExemptEncryption` 설정 추가
  (스코어카드 사진 업로드 기능에 필요 — 없으면 심사 반려/앱 크래시 위험)
- 웹 파일(`../index.html`, `../styles.css`, `../js/`)을 `www/`로 복사하는 스크립트
  (`npm run sync`) — GitHub Pages로 서비스 중인 원본 웹사이트 파일은 전혀 건드리지 않습니다
- Mac 없이 빌드하기 위한 `codemagic.yaml` (저장소 루트, 즉 `golf-scorecard/codemagic.yaml`에
  같이 넣어드렸습니다)

## ⚠ 아직 검증되지 않은 부분 — 꼭 읽어주세요

**Google 로그인**: 지금 웹사이트는 `signInWithPopup`(팝업 창)으로 Google 로그인을 하는데,
이 방식은 앱 안(웹뷰)에서는 Google이 아예 차단합니다. 그래서 앱 안에서 실행 중일 때만
`signInWithRedirect`(전체 화면 이동 방식)로 자동 전환되도록 `auth.js`를 수정해뒀습니다.
**다만 이 코드는 제가 실제 iOS 기기에서 테스트해볼 방법이 없어서, 앱을 처음 빌드하고 나면
가장 먼저 Google 로그인부터 직접 눌러보고 확인해주셔야 합니다.** 만약 로그인이 안 되면,
아래 "로그인이 안 될 때" 항목을 참고해주세요.

**카카오 / 네이버 로그인**: 네이버는 원래도 팝업이 아니라 전체 화면 이동 방식이라 앱
안에서도 될 가능성이 높습니다. 카카오는 자체 팝업 SDK를 쓰고 있어서 Google과 비슷한
문제가 있을 수 있는데, 이번 1차 작업에서는 손대지 않았습니다 — 실기기 테스트 후 문제가
있으면 알려주시면 그때 고치겠습니다.

## Mac 없이 빌드하는 전체 순서 (Codemagic 사용)

1. **GitHub에 두 가지를 커밋 & 푸시**
   - `golf-scorecard/ios-app/` 폴더 전체 (지금 압축 풀어드린 것)
   - `golf-scorecard/codemagic.yaml` (저장소 최상위, `index.html`과 같은 위치)

2. **Codemagic 가입**: https://codemagic.io 에서 GitHub 계정으로 가입 → 이 저장소
   (`tonadojb/golf-scorecard`) 연결. 무료 요금제로도 한 달에 몇 번은 빌드해볼 수 있습니다.

3. **App Store Connect API 키 발급** (자동 서명·자동 업로드에 필요):
   - https://appstoreconnect.apple.com/access/integrations/api 접속
   - "+" 눌러 새 키 생성, 역할은 **App Manager** 선택
   - 발급된 `.p8` 파일 다운로드 (한 번만 다운로드 가능하니 잘 보관), Key ID / Issuer ID 기록

4. **Codemagic에 App Store Connect 연동**:
   - Codemagic 앱 설정 → Integrations → App Store Connect
   - 위에서 만든 API 키(.p8, Key ID, Issuer ID) 입력, 연동 이름을 `codemagic`으로 지정
     (yaml 파일의 `integrations.app_store_connect: codemagic`과 이름이 같아야 합니다)

5. **App Store Connect에 앱 신규 등록**:
   - https://appstoreconnect.apple.com/apps → "+" → 신규 앱
   - 번들 ID: `com.skyjang.golfscorecard` (Apple Developer 계정의 Identifiers에서
     먼저 이 번들 ID를 등록해야 목록에 나타납니다 — Certificates, Identifiers & Profiles
     → Identifiers → "+"에서 등록)
   - 앱 이름, 카테고리(스포츠), **개인정보처리방침 URL**은 필수입니다 (없으시면 간단한
     페이지를 만들어드릴 수 있으니 말씀해주세요)

6. **Codemagic에서 빌드 실행**: 저장소를 연결하면 `codemagic.yaml`을 자동으로 읽어서
   `ios-golf-scorecard` 워크플로우가 보입니다. "Start new build" 클릭하면
   npm install → 웹파일 동기화 → CocoaPods 설치 → 자동 서명 → 빌드 → TestFlight 업로드까지
   전부 자동으로 진행됩니다 (15~25분 정도 소요).

7. **TestFlight로 먼저 테스트**: 빌드가 성공하면 App Store Connect의 TestFlight 탭에
   빌드가 올라갑니다. 본인 iPhone에 TestFlight 앱을 설치하고 초대 링크로 실제 앱을 설치해서
   로그인 3종(Google/카카오/네이버), 사진 인식, 저장/불러오기가 실제로 되는지 확인해주세요.

8. **문제없이 확인되면 App Store 심사 제출**: App Store Connect에서 스크린샷(6.7인치,
   6.5인치 등 필수 사이즈), 앱 설명, 심사용 로그인 정보(테스트 계정)를 채운 뒤 "심사 제출".

## 로그인이 안 될 때

- Google: Firebase 콘솔 → Authentication → Sign-in method → Google → 승인된 도메인에
  문제가 없는지 확인. 그래도 안 되면 `@capacitor-firebase/authentication` 플러그인으로
  네이티브 Google 로그인을 붙이는 방법으로 다시 요청해주세요 (지금 버전보다 확실하지만
  Mac에서 GoogleService-Info.plist 추가 등 설정이 좀 더 필요합니다).
- 카카오: 카카오 디벨로퍼스 콘솔에서 "iOS" 플랫폼을 추가하고 번들 ID(`com.skyjang.golfscorecard`)를
  등록해야 카카오 SDK 자체가 정상 동작합니다 (https://developers.kakao.com → 내 애플리케이션 →
  플랫폼 설정).
- 네이버: 네이버 디벨로퍼스에서도 마찬가지로 "iOS" 앱 정보(번들 ID)를 등록해야 합니다
  (https://developers.naver.com/apps).

## 번들 ID를 바꾸고 싶다면

`com.skyjang.golfscorecard` 대신 다른 값을 쓰고 싶으시면 `capacitor.config.json`의
`appId`와 `codemagic.yaml`의 `bundle_identifier` 두 곳을 같은 값으로 바꾸고,
Xcode 프로젝트도 다시 `npx cap sync ios`로 갱신해야 합니다 (Codemagic 빌드 중에 자동으로
됩니다).

## DUNS 관련 참고

Apple Developer Program은 **개인(Individual)** 자격으로 등록하면 원래 DUNS 번호가
필요 없습니다 (DUNS는 회사/기관 명의로 **Organization** 자격 등록할 때만 요구됩니다).
지금 캡처해주신 화면에 "등록 유형: 개인"으로 나와 있어서, DUNS 신청 결과를 굳이
기다리지 않으셔도 지금 이대로 앱 등록/제출을 진행하실 수 있습니다. 이미 신청하신 건
그대로 두셔도 문제는 없습니다.

## 나중에 더 다듬으면 좋은 것들

- 앱 아이콘/스플래시를 실제 브랜드 디자인으로 교체
- 카메라로 바로 촬영하는 네이티브 UI(현재는 웹의 기본 파일 선택창을 그대로 씁니다)
- "결과 복사하기"를 네이티브 공유 시트(`@capacitor/share`)로 연결 (지금은 웹의 클립보드
  복사 방식 그대로입니다)
