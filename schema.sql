-- 柳川レビュー論文 文献スクリーニング用 D1スキーマ
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  decision TEXT NOT NULL,      -- 'include' | 'exclude' | 'maybe'
  category TEXT,               -- 除外理由タグ（除外/要確認のとき）
  comment TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(paper_id, reviewer)
);

CREATE INDEX IF NOT EXISTS idx_reviews_paper ON reviews(paper_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON reviews(reviewer);
