CREATE TABLE IF NOT EXISTS sounds (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  author TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  audio_blob BLOB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'published', 'rejected')),
  plays INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sounds_status_created ON sounds(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sounds_category ON sounds(category, status);

CREATE TABLE IF NOT EXISTS upload_limits (
  ip_hash TEXT NOT NULL,
  uploaded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_upload_limits_hash_time ON upload_limits(ip_hash, uploaded_at);
