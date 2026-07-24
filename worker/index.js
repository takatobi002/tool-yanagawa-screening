// 柳川文献スクリーニングツール — 単一Workerスクリプト
// /api/reviews 以下はこのスクリプトが処理し、それ以外は静的アセット（public/）にフォールバックする。

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json; charset=utf-8", ...(init && init.headers) },
  });
}

async function handleGetReviews(env) {
  const { results } = await env.DB.prepare(
    "SELECT paper_id, reviewer, decision, category, comment, updated_at FROM reviews ORDER BY updated_at DESC"
  ).all();
  return json(results);
}

async function handlePostReview(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { paper_id, reviewer, decision, category, comment } = body || {};

  if (!paper_id || !reviewer || !decision) {
    return json({ error: "paper_id, reviewer, decision は必須です" }, { status: 400 });
  }
  if (!["include", "exclude", "maybe"].includes(decision)) {
    return json({ error: "decision の値が不正です" }, { status: 400 });
  }

  const updated_at = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO reviews (paper_id, reviewer, decision, category, comment, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(paper_id, reviewer)
     DO UPDATE SET decision=excluded.decision,
                   category=excluded.category,
                   comment=excluded.comment,
                   updated_at=excluded.updated_at`
  )
    .bind(paper_id, reviewer, decision, category || null, comment || null, updated_at)
    .run();

  return json({ ok: true, paper_id, reviewer, decision, category, comment, updated_at });
}

async function handleDeleteReview(request, env) {
  const url = new URL(request.url);
  const paper_id = url.searchParams.get("paper_id");
  const reviewer = url.searchParams.get("reviewer");

  if (!paper_id || !reviewer) {
    return json({ error: "paper_id, reviewer をクエリパラメータで指定してください" }, { status: 400 });
  }

  await env.DB.prepare("DELETE FROM reviews WHERE paper_id = ?1 AND reviewer = ?2")
    .bind(paper_id, reviewer)
    .run();

  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/reviews") {
      if (request.method === "GET") return handleGetReviews(env);
      if (request.method === "POST") return handlePostReview(request, env);
      if (request.method === "DELETE") return handleDeleteReview(request, env);
      return json({ error: "method not allowed" }, { status: 405 });
    }

    // それ以外のリクエストは静的アセット（public/ 以下）にフォールバック
    return env.ASSETS.fetch(request);
  },
};
