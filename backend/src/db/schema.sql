-- CourtIQ schema. Written to be portable to PostgreSQL (per proposal's tech
-- stack). Column types deliberately avoid SQLite-only shorthand.
-- AUTOINCREMENT -> in Postgres use SERIAL/IDENTITY instead of INTEGER PRIMARY KEY.

CREATE TABLE IF NOT EXISTS institutions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  institution_id TEXT REFERENCES institutions(id),
  name TEXT NOT NULL,
  gender_category TEXT, -- Men | Women | Mixed
  color_primary TEXT,
  color_secondary TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Administrator','Statistician','Coach','Athlete','Team Manager')),
  team_id TEXT REFERENCES teams(id),
  player_id INTEGER REFERENCES players(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT REFERENCES teams(id),
  full_name TEXT NOT NULL,
  jersey_number INTEGER,
  position TEXT
);

CREATE TABLE IF NOT EXISTS leagues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,
  season TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS seasons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id TEXT REFERENCES seasons(id),
  league_id INTEGER REFERENCES leagues(id),
  home_team_id TEXT REFERENCES teams(id),
  opponent_team_id TEXT REFERENCES teams(id),
  game_date TEXT,
  status TEXT DEFAULT 'awaiting_reports', -- awaiting_reports | extracted | analyzed
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- One row per uploaded FIBA LiveStats report file for a game.
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  report_type TEXT NOT NULL, -- Box Score | Play-by-Play | Player Evaluation | Plus Minus Summary |
                              -- Quarter Scoring | Rotation Summary | Lineup Analysis | Shot Areas |
                              -- Shot Charts | Score Sheet
  original_filename TEXT,
  storage_path TEXT NOT NULL,
  extraction_status TEXT DEFAULT 'pending', -- pending | extracted | failed
  extraction_error TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TEXT DEFAULT (datetime('now'))
);

-- Structured data pulled out of a Box Score report: one row per player per game.
CREATE TABLE IF NOT EXISTS player_game_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  player_name TEXT NOT NULL, -- matched to players.full_name where possible
  team_side TEXT NOT NULL,   -- 'home' | 'opponent'
  minutes REAL,
  points INTEGER,
  fgm INTEGER, fga INTEGER,
  three_pm INTEGER, three_pa INTEGER,
  ftm INTEGER, fta INTEGER,
  oreb INTEGER, dreb INTEGER, reb INTEGER,
  assists INTEGER, steals INTEGER, blocks INTEGER,
  turnovers INTEGER, fouls INTEGER,
  plus_minus INTEGER,
  raw_extraction TEXT -- JSON blob of the raw parsed row, for audit/debug
);

-- Team-level totals per game, derived from player_game_stats or parsed directly.
CREATE TABLE IF NOT EXISTS team_game_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  team_side TEXT NOT NULL, -- 'home' | 'opponent'
  points INTEGER, fgm INTEGER, fga INTEGER,
  three_pm INTEGER, three_pa INTEGER,
  ftm INTEGER, fta INTEGER,
  oreb INTEGER, dreb INTEGER, reb INTEGER,
  assists INTEGER, steals INTEGER, blocks INTEGER,
  turnovers INTEGER, fouls INTEGER
);

-- Output of the rule-based analytical engine (Sprint III), per game.
CREATE TABLE IF NOT EXISTS game_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL UNIQUE REFERENCES games(id),
  metrics_json TEXT NOT NULL,   -- TS%, eFG%, PPP, TOV rate, ORB%, FT rate, Four Factors, per team + per player
  insight_tags_json TEXT,       -- e.g. ["Turnover Destruction", "3-Point Collapse"]
  computed_at TEXT DEFAULT (datetime('now'))
);

-- AI-generated narrative summary (Sprint III), one per game.
CREATE TABLE IF NOT EXISTS game_narratives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL UNIQUE REFERENCES games(id),
  narrative_text TEXT NOT NULL,
  model TEXT,
  generated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  author_id INTEGER REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
