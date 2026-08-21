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

-- Staff-curated player photo (Statistician/Team Manager only, never
-- self-service -- players don't log in and edit their own row here).
-- Real Supabase Storage URL, same shape as teams.logo_url -- see
-- backend/src/services/imageUpload.js and the PATCH .../photo route in
-- players.js.
ALTER TABLE players ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Player identity: `players` above is the canonical entity (one real
-- person = one row), but the same person shows up as different raw text
-- across seasons/report types -- full name in one, first+middle in
-- another, a typo, a captain marker suffix, etc. (confirmed against real
-- data: "DARLIGNTON KISIVULI" / "DARLINGTON KISIVULI", "GLEN MORANGI" /
-- "GLENN MORANGI", among others). Every raw string ever resolved to a
-- player -- including the string that first created them -- gets an alias
-- row here, so lookups always go through one path (aliases), never a
-- special case for "the original spelling."
--
-- Scoped by team_id (denormalized off players.team_id, not just joined)
-- so an exact-match lookup is a single indexed query without a join, and
-- so the same raw string can independently belong to different people on
-- different teams -- names aren't globally unique, only unique within a
-- team's own alias set (UNIQUE below). first_seen_game_id/report_type are
-- provenance only (which import first produced this exact string), not
-- used by matching itself.
CREATE TABLE IF NOT EXISTS player_name_aliases (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id),
  alias_text TEXT NOT NULL,
  first_seen_game_id INTEGER REFERENCES games(id),
  first_seen_report_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (team_id, alias_text)
);

-- A newly-seen name that fuzzy-matched an existing player closely enough
-- to be worth a human's attention, but not closely enough to auto-link
-- (see backend/src/services/playerIdentity.js for the exact-vs-fuzzy-vs-
-- none decision). Never auto-resolved -- confirm links candidate_text as
-- a new alias of candidate_player_id; reject creates candidate_text as
-- its own new canonical player instead (identical to what a no-match
-- would have done). match_reason is informational context for the
-- reviewer (which heuristic fired), not used again once a decision is
-- made. UNIQUE partial index (below) means a candidate string already
-- awaiting review for a team is never queued twice, even if the same
-- name string is re-extracted from several games before anyone reviews
-- the first one.
CREATE TABLE IF NOT EXISTS player_identity_review (
  id SERIAL PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  candidate_text TEXT NOT NULL,
  candidate_player_id INTEGER NOT NULL REFERENCES players(id),
  match_reason TEXT,
  first_seen_game_id INTEGER REFERENCES games(id),
  first_seen_report_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Carries a manual roster-add's jersey_number/position across the gap
-- between "submitted" and "reviewed" -- previously dropped entirely if a
-- submission landed in review, since no player row existed yet to put
-- them on. Only ever read on reject (a genuinely new player is created
-- then, same as a no-match auto-create already does): confirm links the
-- candidate as an alias of an EXISTING player and deliberately leaves
-- that player's own jersey_number/position untouched, since other
-- imports may have already contributed real data there -- one new
-- submission's values shouldn't overwrite it. NULL for any review that
-- originated from bulk-import/report-upload rather than a manual add.
ALTER TABLE player_identity_review ADD COLUMN IF NOT EXISTS jersey_number INTEGER;
ALTER TABLE player_identity_review ADD COLUMN IF NOT EXISTS position TEXT;

-- Partial unique index (not a table-wide UNIQUE constraint) -- status
-- moves on to 'confirmed'/'rejected' after review, and a *later* new
-- occurrence of the same candidate string should be able to queue a
-- fresh review again if needed; only ever one row may be pending at a
-- time for a given (team, candidate string).
CREATE UNIQUE INDEX IF NOT EXISTS player_identity_review_pending_unique
  ON player_identity_review (team_id, candidate_text)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Statistician','Coach','Athlete','Team Manager')),
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
-- accent_override was originally constrained to a fixed 6-color palette
-- via CHECK, matching the team-brand caution around free-text color data.
-- That caution doesn't apply here -- accent_override is purely personal
-- (see src/theme/applyTheme.js's resolution order: it never overrides
-- team brand for anyone else), so the rich picker added afterward (full
-- saturation/value + hue + RGB + eyedropper, src/components/
-- FullColorPicker.jsx) needed the constraint relaxed to any valid hex
-- color rather than the original 6-swatch enum. Still rejects garbage --
-- just format-validated (#rrggbb), not enum-limited. NULL still means "no
-- override, use the team's brand_accent".
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
ALTER TABLE users ADD COLUMN IF NOT EXISTS accent_override TEXT;
-- A CHECK constraint has no ADD CONSTRAINT IF NOT EXISTS in Postgres, so
-- (like the theme_mode default above) redefining one on a column that may
-- already exist needs an explicit DROP + re-ADD pair -- safe to rerun on
-- every startup, same reasoning as the ALTER COLUMN SET DEFAULT above.
-- ~* (not ~) is deliberate -- case-INsensitive, matching CSS's own
-- treatment of hex colors and backend/src/routes/users.js's /i-flagged
-- regex. The picker itself only ever emits lowercase (RGB->hex always goes
-- through Number.toString(16), which is lowercase), so this never actually
-- sees an uppercase value in practice -- but a client isn't the only way a
-- row gets written, so the constraint doesn't rely on that.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_accent_override_check;
ALTER TABLE users ADD CONSTRAINT users_accent_override_check CHECK (accent_override IS NULL OR accent_override ~* '^#[0-9a-f]{6}$');

-- No Administrator role: four roles only (Statistician, Coach, Athlete,
-- Team Manager). Same DROP + re-ADD pattern as accent_override above --
-- CREATE TABLE IF NOT EXISTS's inline CHECK never re-runs on an
-- already-existing table, so this is what actually narrows the live
-- constraint. Safe to rerun every startup. The one pre-existing
-- Administrator row (admin@courtiq.dev, a synthetic seed account with no
-- real team and zero rows referencing it anywhere -- confirmed empty
-- across invites/games/reports/annotations/audit_log/password_reset_tokens/
-- user_teams before this went in) was deleted manually ahead of this
-- constraint change landing, since ADD CONSTRAINT validates existing rows
-- and would otherwise fail startup on any environment that still had it.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('Statistician','Coach','Athlete','Team Manager'));

-- Phase 2: a user should never be able to exist with no team -- this is
-- what makes the Administrator escape hatch above safe to have removed
-- entirely (no teamless user, no gap needing a bypass). Enforced at the
-- real creation boundary too (invites.js's POST /send now requires
-- teamId), but that alone is an application-level promise a future code
-- path could accidentally violate; this is the actual backstop. Safe to
-- rerun -- confirmed zero existing NULL team_id rows before this went in
-- (the only one, admin@courtiq.dev, was deleted above).
ALTER TABLE users ALTER COLUMN team_id SET NOT NULL;

-- Staff-curated profile photo -- Statistician/Team Manager only, applies
-- to every role including the uploader's own row; never self-service (no
-- upload control on profile.jsx, only on the staff-facing Users page).
-- Same real Supabase Storage URL shape as teams.logo_url/players.photo_url.
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Real Status (active/inactive) -- users.jsx's old mock "Deactivate"
-- button had no real column behind it at all (not even in the mock's own
-- login check). A real BOOLEAN, not the older seasons.active INTEGER
-- flag pattern -- Postgres has a native boolean type, no reason to
-- follow the legacy convention here. Enforcement is login-blocking only
-- (POST /auth/login), not live mid-session revocation -- an already-
-- issued JWT keeps working until its normal 12h expiry; see auth.js for
-- why that's an accepted tradeoff, not an oversight.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

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
  role TEXT NOT NULL CHECK (role IN ('Statistician','Coach','Athlete','Team Manager')),
  team_id TEXT REFERENCES teams(id),
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  invited_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ
);

-- No Administrator role -- same DROP + re-ADD as users_role_check above.
-- No existing invites.role='Administrator' rows to worry about (checked
-- before this went in), so no data cleanup needed here.
ALTER TABLE invites DROP CONSTRAINT IF EXISTS invites_role_check;
ALTER TABLE invites ADD CONSTRAINT invites_role_check CHECK (role IN ('Statistician','Coach','Athlete','Team Manager'));

-- Phase 2: same "no teamless user, ever" backstop as users.team_id above
-- -- an invite with no team would otherwise be able to create exactly the
-- account this is meant to prevent. Zero existing NULL rows confirmed
-- before this went in.
ALTER TABLE invites ALTER COLUMN team_id SET NOT NULL;

-- Staff-initiated password reset -- separate from `invites`, deliberately
-- not reusing that table: invites/:token/accept explicitly rejects when
-- an account already exists (see invites.js), which is exactly the case
-- here (a reset is always for an EXISTING account), so the same table/
-- endpoint shape can't be reused as-is. Structurally similar otherwise:
-- a random token (crypto.randomBytes(24).toString('hex'), same entropy
-- as invites.token), an expiry, tied to a real user_id via a real FK.
-- expires_at is 1 hour, not invites' 7 days -- a much shorter window is
-- appropriate for a link that can change an existing account's password,
-- versus one that only creates a brand-new account. consumed_at (not a
-- text `status` enum like invites) is enough to track "used" -- there's
-- no revoke/expire lifecycle to distinguish here, just used-or-not, so a
-- single nullable timestamp is simpler than a status column would be.
-- This is staff-triggered only (POST /users/:userId/reset-password) --
-- deliberately no general self-service "forgot password" (request-your-
-- own-reset) endpoint, matching this feature's staff-curated model. The
-- schema doesn't rule that out later though: a future self-service
-- endpoint would just insert into this same table the same way, keyed
-- off a real email lookup instead of a staff action, and reuse the exact
-- same POST /reset-password/:token consumption endpoint unchanged.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
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