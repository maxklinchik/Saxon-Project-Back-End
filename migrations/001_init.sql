CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'player',
  password TEXT,
  coach_code TEXT,
  team TEXT,
  prefs TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  location_id INTEGER,
  date TEXT,
  players TEXT,
  created_by INTEGER
);

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER,
  date TEXT,
  location_id INTEGER,
  level TEXT,
  opponent TEXT,
  scores TEXT,
  avg INTEGER,
  totalWood INTEGER,
  spares INTEGER,
  strikes INTEGER,
  substitute_for INTEGER,
  created_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
