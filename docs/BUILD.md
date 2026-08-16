# 개발과 빌드

## 준비

```bash
cd chronopop
npm install
```

필요한 것은 Node 18+ 뿐이다. 게임 자체는 런타임 의존성이 없다.

## 명령

| 명령                   | 하는 일                                            |
| ---------------------- | -------------------------------------------------- |
| `npm run dev`          | 개발 서버 (LAN 공개 — 폰에서 바로 접속 가능)       |
| `npm run build`        | 타입 검사 + `dist/` 생성                           |
| `npm run preview`      | 빌드 결과를 그대로 서빙                            |
| `npm run build:single` | `dist/chronopop-single.html` 파일 하나로 합치기    |
| `npm run icons`        | 앱 아이콘 PNG 재생성 (PWA + 안드로이드 런처)       |
| `npm run sim`          | 밸런스 시뮬레이션 (봇 30판 × 4단계 실력)           |
| `npm run android:sync` | 빌드 후 안드로이드 프로젝트에 웹 자산 반영         |
| `npm run android:apk`  | 디버그 APK 빌드 → `build/chronopop.apk`            |

## 폰에서 개발 중인 화면 보기

```bash
npm run dev
ipconfig getifaddr en0     # Mac IP 확인
```

폰 브라우저에서 `http://<IP>:5173` 접속. 저장하면 바로 반영된다.

## 밸런스 튜닝

숫자는 전부 `src/game/config.ts` 에 모여 있다. 고친 뒤

```bash
npm run sim
```

를 돌려 [GAME_DESIGN.md](./GAME_DESIGN.md) 의 표와 비교한다.
렌더링 없이 엔진만 돌리므로 30판 × 4단계가 몇 초 만에 끝난다.

## 안드로이드 빌드 환경

Android Studio는 필요 없다. 명령줄 도구만 있으면 된다.

```bash
# JDK 21 이상 (Capacitor 8 요구사항)
brew install openjdk@21

# Android SDK
brew install --cask android-commandlinetools
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
yes | sdkmanager --sdk_root="$ANDROID_HOME" --licenses
sdkmanager --sdk_root="$ANDROID_HOME" "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

이후 `npm run android:apk` 만 실행하면 된다.
`scripts/build-apk.mjs` 가 SDK와 JDK 위치를 알아서 찾아 `local.properties` 를 써준다.

첫 빌드는 Gradle이 의존성을 받느라 몇 분 걸리고, 이후에는 수십 초면 끝난다.

### 안드로이드 앱 정보 바꾸기

- 앱 이름: `android/app/src/main/res/values/strings.xml`
- 패키지 ID: `capacitor.config.ts` 의 `appId` (바꾼 뒤 `npx cap sync android`)
- 아이콘: `npm run icons` 가 `android/app/src/main/res/mipmap-*` 를 덮어쓴다

### 릴리스 APK가 필요하다면

디버그 APK로도 설치·플레이에 문제가 없다. 서명된 릴리스가 필요하면:

```bash
cd android
./gradlew assembleRelease     # 서명 설정을 먼저 넣어야 한다
```

## 웹 화면 확인 (헤드리스)

Chrome이 설치돼 있으면 서버를 띄운 뒤 스크린샷을 찍을 수 있다.

```bash
npm run preview
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --hide-scrollbars \
  --window-size=500,900 --virtual-time-budget=3000 \
  --screenshot=shot.png "http://localhost:4173/?autostart&bot"
```

`?autostart&bot` 은 카운트다운 없이 시작해 봇이 자동으로 두는 모드다.
헤드리스 크롬은 창을 500×900보다 작게 만들지 못하므로, 그보다 작은
`--window-size` 를 주면 화면이 잘린 것처럼 보인다. 레이아웃 버그가 아니다.

## 웹에 배포하기

```bash
npm run deploy
```

`npm run build` 로 만든 `dist` 를 `gh-pages` 브랜치에 올리고 GitHub Pages 가
그걸 서비스한다. 30초~1분 뒤 https://devidiot.github.io/game-chronopop/ 에 반영된다.

소스는 `main`, 배포본은 `gh-pages` 로 나눠 둬서 `main` 의 커밋 이력에는
빌드 산출물이 섞이지 않는다. `gh-pages` 는 "지금 dist 의 모습"만 있으면 되는
브랜치라 매번 커밋 하나로 갈아치운다.

### GitHub Actions 로 자동화하려면

`.github/workflows/pages.yml` 을 미리 써 뒀지만 저장소에는 없다. 저장된
Personal Access Token 에 `workflow` 스코프가 없어 푸시가 거부되기 때문이다.

github.com → Settings → Developer settings → Personal access tokens 에서 해당
토큰에 **workflow** 를 체크하면(클래식 토큰은 스코프만 추가해도 토큰 값이
그대로라 재로그인이 필요 없다) 아래처럼 올릴 수 있다.

```bash
git add .github/workflows/pages.yml
git commit -m "ci: Pages 자동 배포"
git push
```

그 뒤 저장소 Settings → Pages → Source 를 **GitHub Actions** 로 바꾼다.
그때부터는 `main` 에 커밋만 하면 자동으로 빌드·배포된다.
