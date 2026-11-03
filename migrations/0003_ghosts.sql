-- Each player's best ride of the day, replayed for other players as a ghost scooter.
CREATE TABLE ghosts (
  player_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  name TEXT,
  km REAL NOT NULL,
  score INTEGER NOT NULL,
  path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, day)
);
CREATE INDEX idx_ghosts_day_km ON ghosts (day, km);
