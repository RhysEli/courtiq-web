-- CourtIQ schema -- PostgreSQL (Supabase), per the project proposal's
-- Table 6/7 tech stack. Converted from the original SQLite-compatible
-- version: INTEGER PRIMARY KEY AUTOINCREMENT -> SERIAL PRIMARY KEY,
-- datetime('now') -> NOW() (returns a real timestamptz, not a string --
-- the node-postgres driver hands these back as JS Date objects).

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

CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  team_id TEXT REFERENCES teams(id),
  full_name TEXT NOT NULL,
  jersey_number INTEGER,
  position TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Administrator','Statistician','Coach','Athlete','Team Manager')),
  team_id TEXT REFERENCES teams(id),
  player_id INTEGER REFERENCES players(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Visual overhaul step 2: personal preference layer on top of team brand
-- (see the teams.color_primary/color_secondary/brand_accent columns
-- below). theme_mode is independent of brand colors entirely -- it's
-- resolved client-side ('auto' checks prefers-color-scheme). Defaults to
-- 'auto' (not a hardcoded 'dark') so a brand-new account follows the
-- device's own light/dark setting until they explicitly choose otherwise.
-- accent_override is deliberately constrained to a fixed 6-color palette
-- via CHECK, not free text -- keep this exact list in sync with
-- ACCENT_OPTIONS in src/theme/userPreference.js and the validation in
-- backend/src/routes/users.js. NULL means "no override, use the team's
-- brand_accent" -- see src/theme/applyTheme.js for the resolution order.
-- ADD COLUMN IF NOT EXISTS skips the whole clause (including the inline
-- CHECK/DEFAULT) once the column already exists -- confirmed empirically:
-- changing the DEFAULT here alone did NOT change the live column's actual
-- default (information_schema still showed 'dark'::text). The separate
-- ALTER COLUMN ... SET DEFAULT below is what actually takes effect on an
-- existing column, and unlike a backfill UPDATE, safely reruns forever
-- (setting the same default repeatedly is a no-op). See the one-time
-- (not schema.sql-tracked) backfill note below for how already-existing
-- ROWS were handled when this default changed from 'dark' to 'auto' --
-- that part can't be a rerunning statement here.
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_mode TEXT NOT NULL DEFAULT 'auto' CHECK (theme_mode IN ('light', 'dark', 'auto'));
ALTER TABLE users ALTER COLUMN theme_mode SET DEFAULT 'auto';
ALTER TABLE users ADD COLUMN IF NOT EXISTS accent_override TEXT CHECK (accent_override IS NULL OR accent_override IN ('#f43f5e', '#f59e0b', '#22c55e', '#0ea5e9', '#8b5cf6', '#ec4899'));

-- One-time backfill note (deliberately NOT a statement below, since this
-- file re-runs in full on every server startup -- an UPDATE here would
-- keep re-firing forever and silently overwrite a real future user's
-- deliberate choice of 'dark' back to 'auto' on every redeploy). At the
-- time theme_mode's default changed from 'dark' to 'auto', every existing
-- row was already 'dark' -- purely as a side effect of the ADD COLUMN
-- DEFAULT above, not any real choice (the settings UI to choose
-- theme_mode didn't exist before this same change), so those rows were
-- moved to 'auto' with a single manual UPDATE run once, outside this
-- file, rather than left inconsistent with new accounts going forward.

-- A user can belong to more than one team (e.g. a Statistician covering
-- both the Men's and Women's side of one institution). users.team_id above
-- is kept for backward compatibility but is no longer the source of truth
-- for access -- user_teams is. See the backfill insert below.
CREATE TABLE IF NOT EXISTS user_teams (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, team_id)
);

-- Idempotent: only inserts rows that don't already exist, so this is safe
-- to leave running on every startup (schema.sql runs in full each time).
INSERT INTO user_teams (user_id, team_id)
SELECT id, team_id FROM users WHERE team_id IS NOT NULL
ON CONFLICT (user_id, team_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS invites (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Administrator','Statistician','Coach','Athlete','Team Manager')),
  team_id TEXT REFERENCES teams(id),
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  invited_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS leagues (
  id SERIAL PRIMARY KEY,
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
  id SERIAL PRIMARY KEY,
  season_id TEXT REFERENCES seasons(id),
  league_id INTEGER REFERENCES leagues(id),
  home_team_id TEXT REFERENCES teams(id),
  opponent_team_id TEXT REFERENCES teams(id),
  game_date TEXT,
  status TEXT DEFAULT 'awaiting_reports', -- awaiting_reports | extracted | analyzed
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- FR-02: game records should capture a venue. Added as a separate ALTER
-- since CREATE TABLE IF NOT EXISTS is a no-op on an already-existing
-- table -- this runs every migration but is itself idempotent.
ALTER TABLE games ADD COLUMN IF NOT EXISTS venue TEXT;

-- FR-11: team configuration (coach/manager/statistician assignment,
-- colours, logo) needs somewhere real to live -- same idempotent-ALTER
-- pattern as `venue` above. logo_url is a URL string, not a file upload:
-- this project has no file storage anywhere, so a URL field is the
-- honest scope here rather than building an upload pipeline.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS coach_name TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS manager_name TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS statistician_name TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Visual overhaul step 1: team-level brand colors. color_primary and
-- color_secondary already existed above (FR-11); brand_accent is the one
-- genuinely new color -- a team's palette is color_primary/color_secondary/
-- brand_accent (mixed naming is intentional: the first two keep their
-- original column names rather than being renamed to brand_primary/
-- brand_secondary, so existing code that already reads/writes them
-- --backend/src/routes/teams.js's PATCH, src/pages/teams.jsx,
-- src/pages/teams-management.jsx -- doesn't need to change).
ALTER TABLE teams ADD COLUMN IF NOT EXISTS brand_accent TEXT;

-- Backfill any team that has never been configured (still NULL) with
-- CourtIQ's own default brand palette -- the "Classic Orange" identity
-- already used elsewhere in the app (TEAM_PRESETS.classic in
-- src/theme/themeConfig.js; the same orange is also the login page's
-- hardcoded icon/button color) -- rather than leaving real teams with no
-- color and pushing an empty-default problem onto the frontend. Only
-- touches NULL rows, so safe to leave running on every startup.
UPDATE teams SET color_primary = '#ff7a1a' WHERE color_primary IS NULL;
UPDATE teams SET color_secondary = '#38bdf8' WHERE color_secondary IS NULL;
UPDATE teams SET brand_accent = '#f8fafc' WHERE brand_accent IS NULL;

-- One row per uploaded FIBA LiveStats report file for a game.
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id),
  report_type TEXT NOT NULL, -- Box Score | Play-by-Play | Player Evaluation | Plus Minus Summary |
                              -- Quarter Scoring | Rotation Summary | Lineup Analysis | Shot Areas |
                              -- Shot Charts | Score Sheet
  original_filename TEXT,
  storage_path TEXT NOT NULL,
  extraction_status TEXT DEFAULT 'pending', -- pending | extracted | failed
  extraction_error TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Structured data pulled out of a Box Score report: one row per player per game.
CREATE TABLE IF NOT EXISTS player_game_stats (
  id SERIAL PRIMARY KEY,
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
  id SERIAL PRIMARY KEY,
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
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL UNIQUE REFERENCES games(id),
  metrics_json TEXT NOT NULL,   -- TS%, eFG%, PPP, TOV rate, ORB%, FT rate, Four Factors, per team + per player
  insight_tags_json TEXT,       -- e.g. ["Turnover Destruction", "3-Point Collapse"]
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI-generated narrative summary (Sprint III), one per game.
CREATE TABLE IF NOT EXISTS game_narratives (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL UNIQUE REFERENCES games(id),
  narrative_text TEXT NOT NULL,
  model TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-team, per-quarter scoring breakdown, from the Quarter report.
CREATE TABLE IF NOT EXISTS game_quarter_team (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id),
  team_side TEXT NOT NULL,   -- 'home' | 'opponent'
  team_name TEXT,
  final_score INTEGER,
  q1 INTEGER, q2 INTEGER, q3 INTEGER, q4 INTEGER,
  cumulative_score_json TEXT -- running total after each quarter, e.g. [26,43,61,83]
);

-- Per-player, per-quarter scoring breakdown, from the Quarter report.
CREATE TABLE IF NOT EXISTS game_quarter_player (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id),
  team_side TEXT NOT NULL,
  jersey_number INTEGER,
  player_name TEXT NOT NULL,
  points_total INTEGER,
  points_q1 INTEGER, points_q2 INTEGER, points_q3 INTEGER, points_q4 INTEGER
);

-- On/off-court splits per player, from the Plus/Minus Summary report.
CREATE TABLE IF NOT EXISTS game_plus_minus (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id),
  team_side TEXT NOT NULL,
  jersey_number INTEGER,
  player_name TEXT NOT NULL,
  minutes_on TEXT, minutes_off TEXT,
  score_while_on TEXT, score_while_off TEXT,
  points_diff_on INTEGER, points_diff_off INTEGER,
  points_per_min_on REAL, points_per_min_off REAL,
  assists_on INTEGER, assists_off INTEGER,
  rebounds_on INTEGER, rebounds_off INTEGER,
  steals_on INTEGER, steals_off INTEGER,
  turnovers_on INTEGER, turnovers_off INTEGER
);

-- Every 5-man lineup combination that saw court time, from Lineup Analysis.
CREATE TABLE IF NOT EXISTS game_lineup_analysis (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id),
  team_side TEXT NOT NULL,
  team_name TEXT,
  players_json TEXT NOT NULL, -- array of player names/jerseys in this lineup
  time_on_court TEXT,
  score TEXT, score_diff INTEGER,
  points_per_min REAL,
  rebounds INTEGER, steals INTEGER, turnovers INTEGER, assists INTEGER
);

-- Chronological lineup stints (when each 5-man unit entered/left), from Rotations Summary.
CREATE TABLE IF NOT EXISTS game_rotation_stints (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id),
  team_side TEXT NOT NULL,
  team_name TEXT,
  players_json TEXT NOT NULL,
  quarter_on INTEGER, time_on TEXT,
  quarter_off INTEGER, time_off TEXT,
  time_on_court TEXT,
  score TEXT, score_diff INTEGER,
  rebounds INTEGER, steals INTEGER, turnovers INTEGER, assists INTEGER
);

-- Every possession/event, in order, from Play-by-Play.
CREATE TABLE IF NOT EXISTS game_play_by_play (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id),
  sequence_index INTEGER NOT NULL, -- order within the game, 0-based
  quarter INTEGER,
  event_time TEXT,
  team_code TEXT,
  jersey_number INTEGER,
  surname TEXT,
  initial TEXT,
  action_text TEXT,
  score TEXT,
  raw_text TEXT
);

-- The one genuinely new fact from the Score Sheet report that isn't a
-- duplicate of Box Score/Quarter data: what time the game ended. Everything
-- else on that page (fouls grid, running-score grid, timeouts) is a
-- checkbox/vector graphic, not text, and cannot be extracted -- see
-- parseScoreSheet.js for the full explanation.
CREATE TABLE IF NOT EXISTS game_score_sheet (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL UNIQUE REFERENCES games(id),
  game_ended_at TEXT,
  winning_team TEXT,
  final_score_team_a INTEGER,
  final_score_team_b INTEGER
);

CREATE TABLE IF NOT EXISTS annotations (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id),
  author_id INTEGER REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- FR-14: "The system shall maintain an audit log recording all data
-- upload events, metric computation runs, and report generation actions
-- with timestamps and the identity of the initiating user." Written via
-- backend/src/services/auditLog.js from bulkImport.js, reports.js, and
-- analysis.js -- covers both successful and failed attempts, not just
-- successes (see logAction call sites).
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action_type TEXT NOT NULL, -- 'upload' | 'compute' | 'narrative'
  details TEXT, -- short human-readable summary, e.g. filename or game id
  success BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);