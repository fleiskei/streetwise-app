-- Streetwise: accounts and synced learning state (M4).
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

-- Append-only answer log; progress is derived by replaying it (packages/core replay()).
CREATE TABLE answers (
  id TEXT PRIMARY KEY,            -- client-generated UUID (idempotent upload)
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  street_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  correct INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX answers_user_city_at ON answers(user_id, city, at);

-- City map ("Stadtkarte"): one row per street with a find or a pending hint.
CREATE TABLE city_map (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  street_id TEXT NOT NULL,
  found_at INTEGER,               -- null = only hinted so far
  hinted INTEGER NOT NULL DEFAULT 0,
  hint_at INTEGER,
  PRIMARY KEY (user_id, city, street_id)
);

CREATE TABLE city_map_meta (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  reset_at INTEGER,
  PRIMARY KEY (user_id, city)
);

CREATE TABLE settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
