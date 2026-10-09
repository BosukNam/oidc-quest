# OIDC 퀘스트

마을을 돌아다니며 OIDC 로그인 흐름과 공격을 직접 겪어 보는 2D 탑뷰 어드벤처 게임입니다.

**플레이: https://bosuknam.github.io/oidc-quest/**

플레이어는 사내 포털의 백엔드 개발자입니다. 브라우저 광장, 백엔드 관제실, 레디스 금고, DB 서고, SSO 탑을 오가며 state, code, ID 토큰을 나르고, 각 지점에서 올바른 판단을 고릅니다.

| 장 | 내용 |
| --- | --- |
| 1장. 첫 로그인 | Authorization Code + PKCE 전체 흐름: state/nonce/verifier, Redis TTL, GETDEL, 토큰 교환, JWKS kid 매칭, 클레임 검증, iss+sub, 세션 |
| 2장. 말로리의 골목 | 로그인 CSRF, payload 위조, alg=none / HS256 혼동, jku 로 공격자 키 유도 |
| 3장. 키 교체의 날 | 모르는 kid 에서 jwks_uri 재조회, JWKS 캐시 정책과 재조회 제한 |
| 4장. 누구냐, 무엇을 하냐 | 401 과 403, 로그아웃 후 세션, 인증과 인가의 경계 |

## 조작

- 클릭 · 탭: 그 자리로 걸어감 (사람이나 게시판을 누르면 다가가서 대화)
- 방향키 · WASD: 한 칸 이동, Space · Enter: 대화 / 대사 넘기기, 1~4: 선택지
- 노란 `!` 와 화면 가장자리 화살표가 다음 목적지를 알려 줍니다

## 구조

빌드 도구 없이 정적 파일만 씁니다.

- `index.html`, `style.css`: 화면과 HUD
- `game.js`: 타일맵 생성, BFS 길찾기, 고정 60Hz 루프, 대화와 선택지 엔진
- `quests.js`: 장·단계·대사·선택지 데이터. 새 시나리오는 여기에 단계를 추가하면 됩니다

로컬 실행: `python3 -m http.server` 후 http://localhost:8000
