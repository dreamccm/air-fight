# 인수인계 문서 (HANDOFF)

다른 작업 창(또는 다른 사람/다른 AI)이 이 게임을 이어받아 **변형·확장**할 때 읽는 문서입니다.
게임을 플레이하는 방법은 [README.md](README.md), 서버 배포는 [worker/README.md](worker/README.md) 를 보세요.

---

## 1. 한 줄 요약

초등 저학년 아이와 즐기는 모바일 웹 종스크롤 슈팅 게임.
**의존성·빌드·번들러가 전혀 없고**, `index.html` 하나에 게임 전체가 들어 있습니다.

## 2. 파일 구조

| 파일 | 줄 수 | 역할 |
|---|---:|---|
| `index.html` | ~1,370 | 게임 전체 (HTML + CSS + JS 단일 파일) |
| `config.js` | 8 | 공유 순위표 서버 주소 한 줄. 비우면 기기별 순위표로 동작 |
| `worker/src/index.js` | ~120 | Cloudflare Worker 순위표 API (선택 사항) |
| `worker/wrangler.toml` | 8 | Worker 배포 설정 (KV 네임스페이스 id) |
| `.github/workflows/pages.yml` | — | main 푸시 시 GitHub Pages 자동 배포 |

**게임만 가져갈 거라면 `index.html` + `config.js` 두 개면 충분합니다.**
서버를 안 쓸 거면 `config.js` 의 주소를 `""` 로 비우세요 (순위표가 기기별 저장으로 동작).

## 3. `index.html` 안의 구조

JS는 전부 하나의 IIFE 안에 있고, 주석 배너로 구획이 나뉩니다.

| 구획 | 대략 위치 | 내용 |
|---|---:|---|
| 캔버스 설정 | 165 | DPR 대응 리사이즈 |
| 사운드 | 187 | Web Audio 합성 엔진, 효과음 테이블, BGM 시퀀서 |
| 게임 상태 | 386 | `STATE`, `game`, `player`, `resetGame()` |
| 조작 | 420 | 터치·마우스 드래그, 키보드, 폭탄 버튼 히트박스 |
| 파티클 | 480 | `burst()` |
| 적 생성 | 491 | `ENEMY_TYPES`, `spawnEnemy()`, `spawnBoss()` |
| 발사 | 526 | `playerShoot()`, `useBomb()` |
| 아이템 | 552 | `ITEM_KIND`, `maybeDropItem()`, `pickItem()` |
| 피격 | 572 | `damagePlayer()` |
| 업데이트 | 594 | `update(dt)` — 게임 로직 전부 |
| 그리기 | 814 | `drawShip/drawEnemy/drawBoss/drawHUD/render` |
| 루프 | 1047 | `requestAnimationFrame` 루프 |
| 화면 전환 | 1058 | 시작/일시정지/게임오버 화면 |
| 순위표 | 1064 | 로컬 저장 + 서버 연동 |

### 핵심 데이터

```js
const STATE  = { START, PLAY, PAUSE, OVER };   // 화면 상태
const game   = { score, level, time, bullets[], enemies[], ebullets[],
                 items[], particles[], stars[], boss, shake, ... };
const player = { x, y, r, hp, maxHp, power, shield, bombs, fireCd, inv, alive };
```

모든 객체는 **평범한 배열 + 원형 충돌 판정**입니다. 클래스도, 엔진도 없습니다.
`update(dt)` 가 모든 배열을 역순으로 순회하며 이동 → 충돌 → 제거를 처리합니다.

## 4. 자주 손대는 지점 (확장 포인트)

### 적 추가
`ENEMY_TYPES` 에 항목을 더하고, `spawnEnemy()` 의 타입 선택 분기와
`drawEnemy()` 의 그리기 분기를 추가합니다. 이동 패턴은 `update()` 의 적 루프에서 처리.

### 아이템 추가
`ITEM_KIND` 배열 + `ITEM_STYLE`(색·라벨) + `pickItem()` 의 분기, 세 곳만 건드리면 됩니다.

### 무기 변경
`playerShoot()` 가 `player.power`(1~4) 에 따라 총알을 쏩니다. 발사 간격은 `player.fireCd`.

### 보스 패턴
`spawnBoss()` 가 체력·속도를 정하고, `update()` 안 보스 블록의 `boss.pattern`
(0=부채꼴, 1=원형)이 6초마다 전환됩니다. 패턴을 늘리려면 여기에 분기를 추가.

### 난이도 상수 (한 줄씩 바꿔 체감 조절)

| 값 | 위치 | 의미 |
|---|---|---|
| `maxHp: 5` | `player` | 시작 체력 |
| `bombs: 2` | `player` | 시작 폭탄 |
| `1 + Math.floor(game.score / 800)` | `update()` | 레벨 상승 간격 |
| `Math.max(0.25, 1.0 - game.level * 0.06)` | `update()` | 적 생성 간격 |
| `game.bossTimer > 32` | `update()` | 보스 등장 주기(초) |
| `Math.random() > 0.16` | `maybeDropItem()` | 아이템 드롭 확률 |

### 소리
- 효과음은 `SFX` 객체에 이름 → 함수로 등록하고 `sfx("이름")` 으로 호출합니다.
- BGM은 `MUSIC`(코드 진행·BPM) + `scheduleStep()`(베이스/아르페지오/드럼)으로 만듭니다.
- 새 곡을 넣으려면 `MUSIC` 에 모드를 추가하고 `setMusicMode("이름")` 으로 전환.

## 5. 반드시 지켜야 할 제약

이 제약들이 설계를 결정했습니다. 바꾸려면 의식적으로 바꾸세요.

1. **빌드 없음 / 의존성 없음.** 파일을 브라우저로 열면 그냥 돌아갑니다. npm·번들러를 들이면
   "아이와 바로 켜서 한다"는 전제가 깨집니다.
2. **음원·이미지 파일 없음.** 그래픽은 Canvas 도형, 소리는 Web Audio 합성.
   로딩이 없고 저작권 문제도 없습니다.
3. **모바일 세로 화면 우선.** 조작은 드래그 + 자동 발사(아이가 두 손가락을 못 씁니다).
   버튼은 44px 이상, `touch-action:none`, 안전영역(`env(safe-area-inset-*)`) 고려.
4. **소리는 사용자 조작 이후.** 브라우저 자동재생 정책 때문에 「게임 시작」 이후 `resumeAudio()`.
5. **사용자 입력은 `textContent` 로만 출력.** 순위표 이름에 `innerHTML` 을 쓰면 XSS가 열립니다.
6. **localStorage 접근은 전부 try/catch.** 사생활 보호 모드에서 예외가 납니다.
7. **서버는 선택 사항.** 서버가 죽어도 게임은 기기 기록으로 계속 동작해야 합니다.

## 6. 순위표 동작 (서버를 쓸 때)

```
게임 오버 → 서버에서 목록 새로 받기 → 순위 안에 들면 이름 입력창
         → 등록 시 POST → 응답 목록으로 화면 갱신 (동시에 기기에도 저장)
서버 실패 → 기기 기록 + "서버에 연결하지 못해…" 안내로 자동 전환
```

- 이름당 **최고 기록 한 줄만** 남습니다 (서버·클라이언트 양쪽에서 정리).
- 서버 API는 `GET /scores`, `POST /scores {name, score, level}` 둘뿐입니다.
- 인증이 없습니다. 주소를 아는 사람은 점수를 올릴 수 있습니다 (가족용 전제).
- `worker/` 를 고치면 **`npx wrangler deploy` 를 다시 해야** 반영됩니다. 푸시만으로는 안 됩니다.

## 7. 확인 방법 (테스트 레시피)

자동화 테스트는 없지만, 아래 두 가지로 충분히 검증해 왔습니다.

```bash
# 1) 로컬 실행
python3 -m http.server 8000     # http://localhost:8000

# 2) Worker 로직만 따로 (가짜 KV를 물려 모듈 직접 호출)
#    worker/src/index.js 를 import 해서 fetch(Request, env) 를 호출하면
#    브라우저·Cloudflare 없이 순위표 규칙을 검증할 수 있습니다.
```

브라우저 자동화(Playwright)로 검증할 때 유용했던 지점:
- 게임 오버까지 가려면 화면 위쪽으로 드래그해 적과 부딪히면 됩니다.
- `?api=http://localhost:포트` 로 순위표 서버를 바꿔 끼울 수 있습니다.
- `AudioContext` 를 감싸 오실레이터 생성 수를 세면 소리 동작을 눈 없이 확인할 수 있습니다.

## 8. 아직 안 한 것 / 발전 아이디어

**손보면 좋은 것**
- 적 탄막이 레벨과 무관하게 비슷해 후반이 단조로움
- 보스가 한 종류뿐 (패턴 2개)
- 터치 조작만 있고 기울기(자이로) 조작은 없음
- 자동화 테스트 없음

**아이가 좋아할 만한 확장**
- 기체 선택 (속도형/화력형/체력형)
- 스테이지/웨이브 구조와 중간 보스
- 연속 격추 콤보 점수, 격추 수 통계
- 2인 협동(한 화면 두 기체) 또는 같은 기기 번갈아 하기
- 업그레이드 상점 (점수로 시작 체력·폭탄 구매)
- 적 종류별 도감, 획득 배지

---

## 부록: 다른 작업 창에 붙여넣을 프롬프트

아래를 그대로 복사해 새 Claude Code 창에 붙여넣으면 됩니다.
저장소가 공개라 코드를 통째로 붙여넣지 않아도 읽어올 수 있습니다.

```text
아이와 함께 만든 모바일 웹 슈팅 게임을 이어받아 발전시키려고 해.

소스: https://github.com/dreamccm/air-fight (공개 저장소)
핵심 파일만 보면 돼:
- https://raw.githubusercontent.com/dreamccm/air-fight/main/index.html  (게임 전체, 단일 파일)
- https://raw.githubusercontent.com/dreamccm/air-fight/main/HANDOFF.md   (구조·확장 포인트·제약)
- https://raw.githubusercontent.com/dreamccm/air-fight/main/worker/src/index.js (순위표 서버, 선택)

먼저 HANDOFF.md 와 index.html 을 읽고 구조를 파악한 다음,
"반드시 지켜야 할 제약" 7가지를 지키면서 작업해줘.
특히: 빌드·의존성 없이 단일 HTML 유지, 음원/이미지 파일 없이 Canvas·Web Audio로 합성,
모바일 세로 드래그 조작 + 자동 발사 유지.

대상은 초등 3학년이야. 어려우면 금방 그만두니 난이도는 항상 관대하게.

하고 싶은 것: (여기에 원하는 변형을 적으세요)
```
