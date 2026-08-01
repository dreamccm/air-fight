/**
 * 슈퍼 전투기 대작전 — 공유 순위표 API
 *
 *   GET  /scores  → 상위 기록 목록
 *   POST /scores  → { name, score, level } 등록 후 갱신된 목록 반환
 *
 * 기록은 Workers KV에 단일 키(scores)로 저장한다. 가족 단위의 소규모 사용을
 * 전제로 하므로, 같은 순간에 두 명이 등록하면 뒤에 쓴 쪽이 이긴다.
 */

const KEY = "scores";
const KEEP = 20;          // 저장할 최대 기록 수
const NAME_MAX = 6;
const SCORE_MAX = 10_000_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS },
  });

/** 제어문자를 걷어내고 길이를 제한한다. */
function cleanName(v) {
  const s = typeof v === "string" ? v : "";
  const t = s.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  return t || "무명";
}

async function readScores(env) {
  const raw = await env.SCORES.get(KEY, "json");
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(r => r && typeof r.s === "number" && Number.isFinite(r.s))
    .map(r => ({ n: cleanName(r.n), s: Math.trunc(r.s), lv: Math.trunc(r.lv) || 1, t: Math.trunc(r.t) || 0 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, KEEP);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname !== "/scores") return json({ error: "not_found" }, 404);

    if (!env.SCORES) return json({ error: "kv_not_bound" }, 500);

    if (request.method === "GET") {
      return json({ scores: await readScores(env) });
    }

    if (request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ error: "invalid_json" }, 400);
      }

      const score = Number(body?.score);
      if (!Number.isFinite(score) || score < 0 || score > SCORE_MAX) {
        return json({ error: "invalid_score" }, 400);
      }

      const entry = {
        n: cleanName(body?.name),
        s: Math.trunc(score),
        lv: Math.min(999, Math.max(1, Math.trunc(Number(body?.level)) || 1)),
        t: Date.now(),
      };

      const list = await readScores(env);
      list.push(entry);
      list.sort((a, b) => b.s - a.s);
      const kept = list.slice(0, KEEP);
      await env.SCORES.put(KEY, JSON.stringify(kept));

      return json({ scores: kept, rank: kept.indexOf(entry) });
    }

    return json({ error: "method_not_allowed" }, 405);
  },
};
