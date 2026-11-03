-- One row per ride started or finished. Holds a random browser ID, no personal data.
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('start', 'end')),
  day INTEGER NOT NULL,          -- days since 1970 in Nepal time, set by the server
  road INTEGER NOT NULL,
  device TEXT NOT NULL,
  km REAL,
  score INTEGER,
  momos INTEGER,
  cause TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_events_day_type ON events (day, type);
CREATE INDEX idx_events_player ON events (player_id);
