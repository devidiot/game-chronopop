# Crush Pang

터뜨려서 시간을 버는 1분 아케이드 매치3.

가로세로로 3개 이상 맞추면 터지고, **4개·5개 대형 매치와 연쇄(체인)를 만들수록
점수와 함께 남은 시간이 늘어난다.** 다만 점수가 쌓일수록 시간 보상이 줄어들어
(그리고 90초 상한이 있어) 아무리 잘해도 언젠가는 끝난다.

잘하면 1분이 1분 20초가 되고, 그 사이에 점수를 얼마나 모았는지가 기록으로 남는다.

직접 하기 귀찮으면 타이틀의 **게임 구경**으로 컴퓨터가 대신 두는 걸 볼 수 있다.
손가락이 판 위를 돌아다니며 젬을 짚고 끌어당긴다. 초보·중수·고수 셋 중에
고르는데, 규칙은 똑같고 **큰 매치를 알아보는 눈**과 **손이 빠른 정도**만 다르다.

## 바로 해보기

```bash
npm install
npm run dev
```

Mac IP로 폰에서 접속하면 그대로 플레이된다 (`ipconfig getifaddr en0`).

## 폰에 설치하기

- **iPhone**: Safari로 열어 공유 → 홈 화면에 추가 (PWA)
- **Android**: `npm run android:apk` → `build/chronopop.apk` 설치

자세한 절차는 [docs/INSTALL.md](docs/INSTALL.md) 참고.

## 문서

| 문서                                       | 내용                                  |
| ------------------------------------------ | ------------------------------------- |
| [GAME_DESIGN.md](docs/GAME_DESIGN.md)      | 규칙, 점수·시간 공식, 밸런스 검증 결과 |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)    | 코드 구조, 상태 기계, 렌더링 메모     |
| [INSTALL.md](docs/INSTALL.md)              | 아이폰·안드로이드에 올리고 지우기     |
| [BUILD.md](docs/BUILD.md)                  | 개발·빌드 명령, 안드로이드 빌드 환경  |

## 기술

의존성 없는 TypeScript + Canvas 2D. 빌드 결과 JS 25KB(gzip 9KB).
효과음은 오디오 파일 없이 WebAudio로 합성하고, 아이콘 PNG도
외부 라이브러리 없이 스크립트로 직접 생성한다.
