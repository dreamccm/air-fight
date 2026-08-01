# 공유 순위표 서버 (Cloudflare Worker)

가족이 각자 기기에서 플레이해도 **하나의 순위표**를 보도록 기록을 모아주는 작은 API입니다.
무료 플랜으로 충분하고 카드 등록도 필요 없습니다.

## 배포하기 (약 5분)

> 아래 명령은 **Node.js가 설치된 PC의 터미널**에서 실행합니다. 휴대폰이나
> GitHub 웹페이지에서는 할 수 없습니다.

1. [dash.cloudflare.com](https://dash.cloudflare.com) 에서 무료 계정을 만듭니다.

2. 저장소를 PC에 내려받고 **`air-fight/worker` 폴더**로 들어갑니다.

   ```bash
   git clone https://github.com/dreamccm/air-fight.git
   cd air-fight/worker
   ```

3. KV 저장소를 만듭니다.

   ```bash
   npx wrangler login          # 브라우저가 열리면 로그인 허용
   npx wrangler kv namespace create SCORES
   ```

   출력에 나오는 `id = "..."` 값을 복사해 `wrangler.toml` 의
   `id = "여기에_KV_네임스페이스_ID"` 자리에 붙여넣습니다.

4. 배포합니다.

   ```bash
   npx wrangler deploy
   ```

   `https://air-fight-scores.<계정이름>.workers.dev` 같은 주소가 출력됩니다.

5. 저장소 루트의 `config.js` 를 열어 그 주소를 넣고 커밋 & 푸시하면 끝입니다.

   ```js
   window.AIR_FIGHT_API = "https://air-fight-scores.내계정.workers.dev";
   ```

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/scores` | 상위 20개 기록을 `{ scores: [...] }` 로 반환 |
| `POST` | `/scores` | `{ name, score, level }` 등록 후 갱신된 목록과 `rank` 반환 |

기록 형식은 `{ n: 이름, s: 점수, lv: 레벨, t: 등록시각 }` 입니다.

## 코드를 고친 뒤에는

`worker/` 안을 수정했다면 **`npx wrangler deploy` 를 다시 실행해야** 반영됩니다.
GitHub에 푸시하는 것만으로는 서버가 바뀌지 않습니다 (Pages는 게임 화면만 배포합니다).

## 접근 제한 (CORS)

`src/index.js` 의 `ALLOWED_ORIGINS` 에 적힌 주소에서 온 요청에만 CORS를 허용합니다.

```js
const ALLOWED_ORIGINS = [
  "https://dreamccm.github.io",
  "http://localhost:8000",
  ...
];
```

다른 웹사이트가 방문자의 브라우저를 통해 순위표를 조작하는 것은 막지만,
브라우저를 거치지 않는 요청(curl 등)까지 막지는 못합니다. 게임을 다른 주소에
올리면 그 주소를 목록에 추가한 뒤 다시 배포하세요.

## 알아둘 점

- 이름은 6자로 잘리고 제어문자는 제거되며, 점수는 0 이상 1,000만 이하만 받습니다.
- **이름당 최고 기록 하나만** 저장합니다. 같은 이름으로 더 낮은 점수를 올리면
  기존 기록이 유지되고 응답의 `stored` 가 `false` 로 옵니다.
- 서버에는 인증이 없습니다. 주소를 아는 사람은 누구나 점수를 올릴 수 있으니,
  가족·친구끼리 쓰는 용도로만 사용하세요.
- Workers KV는 최종 일관성이라, 한 기기에서 올린 기록이 다른 기기에 보이기까지
  최대 1분쯤 걸릴 수 있습니다. 고장이 아닙니다.
- 정확히 같은 순간에 두 명이 등록하면 뒤에 쓴 쪽이 이깁니다(KV 특성).
  가족 단위 사용에서는 사실상 발생하지 않습니다.
- 기록을 전부 지우려면:

  ```bash
  npx wrangler kv key delete --binding SCORES scores
  ```
