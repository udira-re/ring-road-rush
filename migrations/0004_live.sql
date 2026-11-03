-- Riders on the road right now. Entries expire after a few seconds without an update.
CREATE TABLE live (
  player_id TEXT PRIMARY KEY,
  name TEXT,
  d INTEGER NOT NULL,
  x INTEGER NOT NULL,
  v INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_live_updated ON live (updated_at);
