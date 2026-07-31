CREATE TABLE IF NOT EXISTS pageviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  minute_bucket INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pageviews_unique_minute
  ON pageviews(page, visitor_id, minute_bucket);

CREATE INDEX IF NOT EXISTS idx_pageviews_created_at_page
  ON pageviews(created_at, page);
