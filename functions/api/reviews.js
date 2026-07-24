// /api/reviews
// GET    -> 全レビューを返す（件数が小さいのでページングせず一括返却）
// POST   -> 1件のレビューをupsert（paper_id + reviewer で一意）
// DELETE -> 1件のレビューを削除（?paper_id=&reviewer=）

export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare(
    "SELECT paper_id, reviewer, decision, category, comment, updated_at FROM reviews ORDER BY updated_at DESC"
  ).all();
  return Response.json(results);
}

export async function onRequestPost(context) {
  const { env, request } = context;
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { paper_id, reviewer, decision, category, comment } = body || {};

  if (!paper_id || !reviewer || !decision) {
    return Response.json(
      { error: "paper_id, reviewer, decision は必須です" },
      { status: 400 }
    );
  }
  if (!["include", "exclude", "maybe"].includes(decision)) {
    return Response.json({ error: "decision の値が不正です" }, { status: 400 });
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

  return Response.json({ ok: true, paper_id, reviewer, decision, category, comment, updated_at });
}

export async function onRequestDelete(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const paper_id = url.searchParams.get("paper_id");
  const reviewer = url.searchParams.get("reviewer");

  if (!paper_id || !reviewer) {
    return Response.json(
      { error: "paper_id, reviewer をクエリパラメータで指定してください" },
      { status: 400 }
    );
  }

  await env.DB.prepare(
    "DELETE FROM reviews WHERE paper_id = ?1 AND reviewer = ?2"
  )
    .bind(paper_id, reviewer)
    .run();

  return Response.json({ ok: true });
}
