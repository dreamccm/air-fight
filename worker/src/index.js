/**
 * 슈퍼 전투기 대작전 — 공유 순위표 API
 *
 *   GET  /scores  → 상위 기록 목록
 *   POST /scores  → { name, score, level } 등록 후 갱신된 목록 반환
 *
 * 기록은 Workers KV에 단일 키(scores)로 저장한다. 이름 하나당 최고 기록 한 줄만
 * 남기므로, 한 사람이 여러 판을 잘해도 순위표를 독식하지 않는다.
 * 가족 단위의 소규모 사용을 전제로 하므로, 같은 순간에 두 명이 등록하면
 * 뒤에 쓴 쪽이 이긴다.
 */

const KEY = "scores";
const KEEP = 20;          // 저장할 최대 기록 수 (이름 기준)
const NAME_MAX = 6;
const SCORE_MAX = 10_000_000;

// 이 주소에서 온 요청에만 CORS를 허용한다. 브라우저 밖(curl 등)은 막지 못하지만,
// 다른 웹사이트가 방문자의 브라우저로 순위표를 건드리는 것은 차단된다.
const ALLOWED_ORIGINS = [
  "https://dreamccm.github.io",
  "http://localhost:8000",
  "http://localhost:8765",
  "http://127.0.0.1:8000",
];

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const h = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

const json = (data, status, request) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(request),
    },
  });

/** 제어문자를 걷어내고 길이를 제한한다. */
function cleanName(v) {
  const s = typeof v === "string" ? v : "";
  const t = s.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  return t || "무명";
}

/** 이름당 최고 기록 하나만 남기고 점수 내림차순으로 정렬한다. */
function bestPerName(list) {
  const byName = new Map();
  for (const r of list) {
    const prev = byName.get(r.n);
    if (!prev || r.s > prev.s) byName.set(r.n, r);
  }
  return [...byName.values()].sort((a, b) => b.s - a.s);
}

async function readScores(env) {
  const raw = await env.SCORES.get(KEY, "json");
  if (!Array.isArray(raw)) return [];
  const cleaned = raw
    .filter(r => r && typeof r.s === "number" && Number.isFinite(r.s))
    .map(r => ({ n: cleanName(r.n), s: Math.trunc(r.s), lv: Math.trunc(r.lv) || 1, t: Math.trunc(r.t) || 0 }));
  return bestPerName(cleaned).slice(0, KEEP);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (url.pathname !== "/scores") return json({ error: "not_found" }, 404, request);
    if (!env.SCORES) return json({ error: "kv_not_bound" }, 500, request);

    if (request.method === "GET") {
      return json({ scores: await readScores(env) }, 200, request);
    }

    if (request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ error: "invalid_json" }, 400, request);
      }

      const score = Number(body?.score);
      if (!Number.isFinite(score) || score < 0 || score > SCORE_MAX) {
        return json({ error: "invalid_score" }, 400, request);
      }

      const entry = {
        n: cleanName(body?.name),
        s: Math.trunc(score),
        lv: Math.min(999, Math.max(1, Math.trunc(Number(body?.level)) || 1)),
        t: Date.now(),
      };

      const list = await readScores(env);
      list.push(entry);
      const kept = bestPerName(list).slice(0, KEEP);

      // 같은 이름의 기존 기록이 더 높으면 저장할 내용이 바뀌지 않는다.
      const changed = kept.includes(entry);
      if (changed) await env.SCORES.put(KEY, JSON.stringify(kept));

      return json({ scores: kept, rank: kept.indexOf(entry), stored: changed }, 200, request);
    }

    return json({ error: "method_not_allowed" }, 405, request);
  },
};
