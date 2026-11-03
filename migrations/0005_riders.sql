-- One row per rider, so names can be looked up directly.
CREATE TABLE riders (
  player_id TEXT PRIMARY KEY,
  name TEXT,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
INSERT INTO riders (player_id, name, first_seen, last_seen)
  SELECT player_id,
    (SELECT n.name FROM events n WHERE n.player_id = e.player_id AND n.name IS NOT NULL ORDER BY n.id DESC LIMIT 1),
    MIN(created_at), MAX(created_at)
  FROM events e GROUP BY player_id;
