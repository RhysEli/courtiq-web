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

-- ---------------------------------------------------------------------
-- Extended report tables: Quarter, Player Plus/Minus Summary, Lineup
-- Analysis, Rotations Summary, Play by Play, Score Sheet. Same pattern
-- as player_game_stats above: dedicated columns for anything worth
-- querying directly, JSON-blob columns for nested structures (5-player
-- lineups) that are always read/written as a unit.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS game_quarter_player_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  team_side TEXT NOT NULL,             -- 'home' | 'opponent'
  jersey_number INTEGER,
  player_name TEXT NOT NULL,
  points_total INTEGER,
  points_q1 INTEGER,
  points_q2 INTEGER,
  points_q3 INTEGER,
  points_q4 INTEGER
);
CREATE INDEX IF NOT EXISTS idx_gqps_game ON game_quarter_player_stats(game_id);

CREATE TABLE IF NOT EXISTS game_quarter_team_totals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  team_side TEXT NOT NULL,
  team_name TEXT,
  final_score INTEGER,
  q1 INTEGER, q2 INTEGER, q3 INTEGER, q4 INTEGER,
  cumulative_score_json TEXT           -- e.g. "[26,43,61,83]"
);
CREATE INDEX IF NOT EXISTS idx_gqtt_game ON game_quarter_team_totals(game_id);

CREATE TABLE IF NOT EXISTS game_plus_minus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  team_side TEXT NOT NULL,
  jersey_number INTEGER,
  player_name TEXT NOT NULL,
  minutes_on TEXT,
  minutes_off TEXT,
  score_while_on TEXT,
  score_while_off TEXT,
  points_diff_on INTEGER,
  points_diff_off INTEGER,
  points_per_min_on REAL,
  points_per_min_off REAL,
  assists_on INTEGER, assists_off INTEGER,
  rebounds_on INTEGER, rebounds_off INTEGER,
  steals_on INTEGER, steals_off INTEGER,
  turnovers_on INTEGER, turnovers_off INTEGER
);
CREATE INDEX IF NOT EXISTS idx_gpm_game ON game_plus_minus(game_id);

CREATE TABLE IF NOT EXISTS game_lineup_analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  team_side TEXT NOT NULL,
  team_name TEXT,
  players_json TEXT NOT NULL,          -- [{jersey_number,surname,initial}, x5]
  time_on_court TEXT,
  score TEXT,
  score_diff INTEGER,
  points_per_min REAL,
  rebounds INTEGER,
  steals INTEGER,
  turnovers INTEGER,
  assists INTEGER
);
CREATE INDEX IF NOT EXISTS idx_gla_game ON game_lineup_analysis(game_id);

CREATE TABLE IF NOT EXISTS game_rotation_stints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  team_side TEXT NOT NULL,
  team_name TEXT,
  players_json TEXT NOT NULL,
  quarter_on INTEGER,
  time_on TEXT,
  quarter_off INTEGER,
  time_off TEXT,
  time_on_court TEXT,
  score TEXT,
  score_diff INTEGER,
  rebounds INTEGER,
  steals INTEGER,
  turnovers INTEGER,
  assists INTEGER
);
CREATE INDEX IF NOT EXISTS idx_grs_game ON game_rotation_stints(game_id);

-- One row per play-by-play event (~500-600 rows/game). The only one of
-- these six worth real columns throughout, since it's the most likely
-- to be filtered/queried directly (by quarter, by team, by player).
CREATE TABLE IF NOT EXISTS game_play_by_play (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  sequence INTEGER NOT NULL,           -- 0-based order within the game; "time"
                                        -- alone isn't unique/sortable across
                                        -- quarters or same-timestamp events
  quarter INTEGER,
  game_time TEXT,
  team_side TEXT,                      -- may be NULL (team rebounds, timeouts)
  jersey_number INTEGER,
  player_surname TEXT,
  player_initial TEXT,
  action_text TEXT NOT NULL,
  score_home INTEGER,                  -- NULL if this event didn't change score
  score_opponent INTEGER,
  score_diff INTEGER
);
CREATE INDEX IF NOT EXISTS idx_gpbp_game ON game_play_by_play(game_id);
CREATE INDEX IF NOT EXISTS idx_gpbp_game_seq ON game_play_by_play(game_id, sequence);

-- Minimal: most of this report is non-text vector graphics (fouls grid,
-- running score column) -- see extractScoreSheet's own note about that.
CREATE TABLE IF NOT EXISTS game_score_sheet (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id) UNIQUE,
  game_ended_at TEXT,
  winning_team TEXT,
  final_score_team_a INTEGER,
  final_score_team_b INTEGER
);