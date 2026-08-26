const db = require('../db');
const { resolvePlayerName } = require('./playerIdentity');

// ---------------------------------------------------------------------
// Prepared statements. Grouped by report type, each with its own
// DELETE (for the replace-not-accumulate pattern already used by
// player_game_stats in bulkImport.js) and INSERT.
// ---------------------------------------------------------------------

const del = {
  quarterPlayers: db.prepare('DELETE FROM game_quarter_player WHERE game_id = ?'),
  quarterTeams: db.prepare('DELETE FROM game_quarter_team WHERE game_id = ?'),
  plusMinus: db.prepare('DELETE FROM game_plus_minus WHERE game_id = ?'),
  lineupAnalysis: db.prepare('DELETE FROM game_lineup_analysis WHERE game_id = ?'),
  rotationStints: db.prepare('DELETE FROM game_rotation_stints WHERE game_id = ?'),
  playByPlay: db.prepare('DELETE FROM game_play_by_play WHERE game_id = ?'),
  scoreSheet: db.prepare('DELETE FROM game_score_sheet WHERE game_id = ?'),
};

const insert = {
  quarterPlayer: db.prepare(`
    INSERT INTO game_quarter_player
      (game_id, team_side, jersey_number, player_name, points_total, points_q1, points_q2, points_q3, points_q4)
    VALUES (?,?,?,?,?,?,?,?,?)
  `),
  quarterTeam: db.prepare(`
    INSERT INTO game_quarter_team
      (game_id, team_side, team_name, final_score, q1, q2, q3, q4, cumulative_score_json)
    VALUES (?,?,?,?,?,?,?,?,?)
  `),
  plusMinus: db.prepare(`
    INSERT INTO game_plus_minus
      (game_id, team_side, jersey_number, player_name, minutes_on, minutes_off,
       score_while_on, score_while_off, points_diff_on, points_diff_off,
       points_per_min_on, points_per_min_off, assists_on, assists_off,
       rebounds_on, rebounds_off, steals_on, steals_off, turnovers_on, turnovers_off)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `),
  lineupAnalysis: db.prepare(`
    INSERT INTO game_lineup_analysis
      (game_id, team_side, team_name, players_json, time_on_court, score,
       score_diff, points_per_min, rebounds, steals, turnovers, assists)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `),
  rotationStint: db.prepare(`
    INSERT INTO game_rotation_stints
      (game_id, team_side, team_name, players_json, quarter_on, time_on, quarter_off,
       time_off, time_on_court, score, score_diff, rebounds, steals, turnovers, assists)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `),
  // Column names here match the real schema (game_id, sequence_index, quarter,
  // event_time, team_code, jersey_number, surname, initial, action_text, score,
  // raw_text) -- these previously did not match (sequence/game_time/team_side/
  // player_surname/player_initial/score_home/score_opponent/score_diff), none
  // of which exist as columns on game_play_by_play, so every insert here would
  // have failed once the missing-await bug (fixed separately) stopped
  // silently swallowing the error.
  playByPlayEvent: db.prepare(`
    INSERT INTO game_play_by_play
      (game_id, sequence_index, quarter, event_time, team_code, jersey_number,
       surname, initial, action_text, score, raw_text)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `),
  scoreSheet: db.prepare(`
    INSERT INTO game_score_sheet (game_id, game_ended_at, winning_team, final_score_team_a, final_score_team_b)
    VALUES (?,?,?,?,?)
  `),
};

// ---------------------------------------------------------------------
// Per-report persist functions.
//
// POSTGRES AWAIT FIX (see backend/src/db/index.js's shim comment): every
// db.prepare(...).run()/.get()/.all() call is a real async Postgres query
// under the hood and MUST be awaited, or it silently fires-and-forgets --
// the caller moves on immediately with a pending Promise it never checks,
// so failures are lost and later reads can race the still-in-flight write.
// This file previously awaited nothing anywhere. Every function below is
// now `async`, every `.run()` call is `await`ed, and `forEach` (which does
// not wait for async callbacks) is replaced with `for...of` so each insert
// genuinely completes before the next one starts.
//
// Each function stays defensive about its input shape (e.g. skips silently
// if that extractor failed and the entry is an { error, code } object
// instead of real data), so one report type's extraction failure can't
// crash persistence for the others.
// ---------------------------------------------------------------------

// teamIdBySide: { home: teamId, opponent: teamId } -- resolved once by
// persistAdditionalReports below and threaded through, so player identity
// resolution (playerIdentity.js) here is team-scoped the same way
// bulkImport.js's primary Box Score resolution is. Reuses whatever that
// primary pass already aliased/queued for this game (same exact-alias
// fast path), rather than deciding independently -- a name repeated
// across report types for the same game just re-hits the alias just
// created, it doesn't re-trigger its own review.
// Phase 2 of the round-trip batching fix (see db/index.js's batchInsert
// comment and persistPlayByPlay's Phase 1 comment). resolvePlayerName()
// stays a per-player sequential await, unbatched -- it's identity
// resolution, not a row insert, and each call's exact/fuzzy decision
// depends on aliases already created earlier in this SAME loop (a repeat
// name later in the same file re-hitting an alias just created moments
// before). Only the actual game_quarter_team/game_quarter_player row
// inserts are collected and batched, after identity resolution for every
// player has already run.
async function persistQuarter(gameId, quarterResult, teamIdBySide) {
  await del.quarterPlayers.run(gameId);
  await del.quarterTeams.run(gameId);
  if (!quarterResult || !quarterResult.teams) return { teamRows: 0, playerRows: 0 };

  const teamRows = [];
  const playerRows = [];
  for (const team of quarterResult.teams) {
    teamRows.push([
      gameId, team.team_side, team.team_name, team.final_score,
      team.quarterTotals ? team.quarterTotals.q1 : null,
      team.quarterTotals ? team.quarterTotals.q2 : null,
      team.quarterTotals ? team.quarterTotals.q3 : null,
      team.quarterTotals ? team.quarterTotals.q4 : null,
      team.cumulativeScore ? JSON.stringify(team.cumulativeScore) : null,
    ]);
    for (const p of (team.players || [])) {
      playerRows.push([
        gameId, team.team_side, p.jersey_number, p.player_name,
        p.points_total, p.points_q1, p.points_q2, p.points_q3, p.points_q4,
      ]);
      if (teamIdBySide && teamIdBySide[team.team_side]) {
        await resolvePlayerName({
          teamId: teamIdBySide[team.team_side], name: p.player_name, gameId, reportType: 'Quarter Scoring',
        });
      }
    }
  }

  await db.batchInsert(
    'game_quarter_team',
    ['game_id', 'team_side', 'team_name', 'final_score', 'q1', 'q2', 'q3', 'q4', 'cumulative_score_json'],
    teamRows,
  );
  await db.batchInsert(
    'game_quarter_player',
    ['game_id', 'team_side', 'jersey_number', 'player_name', 'points_total', 'points_q1', 'points_q2', 'points_q3', 'points_q4'],
    playerRows,
  );

  return { teamRows: teamRows.length, playerRows: playerRows.length };
}

async function persistPlusMinus(gameId, plusMinusResult, teamIdBySide) {
  await del.plusMinus.run(gameId);
  if (!plusMinusResult || !plusMinusResult.teams) return 0;

  const rows = [];
  for (const team of plusMinusResult.teams) {
    for (const p of (team.players || [])) {
      rows.push([
        gameId, team.team_side, p.jersey_number, p.player_name,
        p.minutes_on, p.minutes_off, p.score_while_on, p.score_while_off,
        p.points_diff_on, p.points_diff_off, p.points_per_min_on, p.points_per_min_off,
        p.assists_on, p.assists_off, p.rebounds_on, p.rebounds_off,
        p.steals_on, p.steals_off, p.turnovers_on, p.turnovers_off,
      ]);
      if (teamIdBySide && teamIdBySide[team.team_side]) {
        await resolvePlayerName({
          teamId: teamIdBySide[team.team_side], name: p.player_name, gameId, reportType: 'Plus Minus Summary',
        });
      }
    }
  }

  return db.batchInsert(
    'game_plus_minus',
    ['game_id', 'team_side', 'jersey_number', 'player_name', 'minutes_on', 'minutes_off',
      'score_while_on', 'score_while_off', 'points_diff_on', 'points_diff_off',
      'points_per_min_on', 'points_per_min_off', 'assists_on', 'assists_off',
      'rebounds_on', 'rebounds_off', 'steals_on', 'steals_off', 'turnovers_on', 'turnovers_off'],
    rows,
  );
}

async function persistLineupAnalysis(gameId, lineupResult) {
  await del.lineupAnalysis.run(gameId);
  if (!lineupResult || !lineupResult.teams) return 0;

  const rows = [];
  for (const team of lineupResult.teams) {
    for (const l of (team.lineups || [])) {
      rows.push([
        gameId, team.team_side, team.team_name, JSON.stringify(l.players),
        l.time_on_court, l.score, l.score_diff, l.points_per_min,
        l.rebounds, l.steals, l.turnovers, l.assists,
      ]);
    }
  }

  return db.batchInsert(
    'game_lineup_analysis',
    ['game_id', 'team_side', 'team_name', 'players_json', 'time_on_court', 'score',
      'score_diff', 'points_per_min', 'rebounds', 'steals', 'turnovers', 'assists'],
    rows,
  );
}

async function persistRotationsSummary(gameId, rotationsResult) {
  await del.rotationStints.run(gameId);
  if (!rotationsResult || !rotationsResult.teams) return 0;

  const rows = [];
  for (const team of rotationsResult.teams) {
    for (const s of (team.stints || [])) {
      rows.push([
        gameId, team.team_side, team.team_name, JSON.stringify(s.players),
        s.quarter_on, s.time_on, s.quarter_off, s.time_off, s.time_on_court,
        s.score, s.score_diff, s.rebounds, s.steals, s.turnovers, s.assists,
      ]);
    }
  }

  return db.batchInsert(
    'game_rotation_stints',
    ['game_id', 'team_side', 'team_name', 'players_json', 'quarter_on', 'time_on', 'quarter_off',
      'time_off', 'time_on_court', 'score', 'score_diff', 'rebounds', 'steals', 'turnovers', 'assists'],
    rows,
  );
}

// Phase 1 of the round-trip batching fix (see db/index.js's batchInsert
// comment for the measured root cause): this was 540 individually-
// awaited single-row INSERTs, confirmed directly to cost ~144.6s for a
// real Play-by-Play report at this project's real remote-DB latency --
// by far the dominant case, since Play-by-Play routinely has 500-750+
// rows per game (531-747 measured across real production games) versus
// 20-40 for every other report type here. Batched first, in isolation,
// specifically for the clearest before/after signal.
async function persistPlayByPlay(gameId, playByPlayResult) {
  await del.playByPlay.run(gameId);
  if (!playByPlayResult || !playByPlayResult.events) return 0;

  const rows = playByPlayResult.events.map((e, idx) => [
    gameId, idx, e.quarter, e.time, e.team, e.jersey_number,
    e.player_surname, e.player_initial, e.action_text,
    e.score ? JSON.stringify(e.score) : null,
    null, // raw_text: not returned by extractPlayByPlay today
  ]);

  return db.batchInsert(
    'game_play_by_play',
    ['game_id', 'sequence_index', 'quarter', 'event_time', 'team_code', 'jersey_number', 'surname', 'initial', 'action_text', 'score', 'raw_text'],
    rows,
  );
}

// Checked, not silently skipped: this only ever inserts exactly one row
// per game (a Score Sheet reports one final result, never a list), so
// there is nothing to batch here -- a "batch" of 1 row is the same
// single round trip this already is. Left as an individual INSERT
// deliberately.
async function persistScoreSheet(gameId, scoreSheetResult) {
  await del.scoreSheet.run(gameId);
  if (!scoreSheetResult || scoreSheetResult.error) return 0;

  await insert.scoreSheet.run(
    gameId, scoreSheetResult.gameEndedAt, scoreSheetResult.winningTeam,
    scoreSheetResult.finalScoreTeamA, scoreSheetResult.finalScoreTeamB,
  );
  return 1;
}

// ---------------------------------------------------------------------
// Single entry point: pass the gameId and the whole additionalReports
// object as returned by the extractor loop in bulkImport.js (each entry
// is either real extracted data, or an { error, code } object if that
// extractor itself failed). Returns a { key: { status, rows } | { status:
// 'failed', error, code } } summary -- the shape src/pages/bulk-import.jsx
// has always expected, but which bulkImport.js was never actually
// producing (it was passing the raw extractor output straight through
// instead), which is why every report chip rendered without a row count.
// ---------------------------------------------------------------------
async function persistAdditionalReports(gameId, additionalReports) {
  if (!additionalReports) return {};

  const summary = {};

  // Resolved once per game, not per report type -- player identity
  // resolution (playerIdentity.js, wired into persistQuarter/
  // persistPlusMinus below) needs the real team id behind 'home'/
  // 'opponent', not the label itself.
  const game = await db.prepare('SELECT home_team_id, opponent_team_id FROM games WHERE id = ?').get(gameId);
  const teamIdBySide = game ? { home: game.home_team_id, opponent: game.opponent_team_id } : null;

  const persistOne = async (key, persistFn, result) => {
    if (result && result.error) {
      summary[key] = { status: 'failed', error: result.error, code: result.code };
      return;
    }
    try {
      const rows = await persistFn(gameId, result, teamIdBySide);
      summary[key] = { status: 'stored', rows };
    } catch (err) {
      summary[key] = { status: 'failed', error: err.message, code: err.code };
    }
  };

  await persistOne('quarter', persistQuarter, additionalReports.quarter);
  await persistOne('plusMinus', persistPlusMinus, additionalReports.plusMinus);
  await persistOne('lineupAnalysis', persistLineupAnalysis, additionalReports.lineupAnalysis);
  await persistOne('rotationsSummary', persistRotationsSummary, additionalReports.rotationsSummary);
  await persistOne('playByPlay', persistPlayByPlay, additionalReports.playByPlay);
  await persistOne('scoreSheet', persistScoreSheet, additionalReports.scoreSheet);

  return summary;
}

// Individual per-type functions exported too (not just the bulk-import-
// shaped persistAdditionalReports wrapper above): each one unconditionally
// deletes ONLY its own table's rows for gameId before inserting, so
// calling persistAdditionalReports with just one key populated -- as
// reports.js's single-report route would need to, uploading one report
// type per request -- would silently wipe the other five tables' already-
// persisted data for that game on every subsequent upload (confirmed
// directly: uploaded 6 different report types to the same disposable game
// one at a time, only the last type survived). reports.js calls these
// directly instead, one at a time, touching only the table for the type
// actually being persisted. persistAdditionalReports itself is unchanged
// and still the right choice for bulk-import's own use, where all 6 are
// genuinely being persisted together in one pass for one uploaded PDF.
module.exports = {
  persistAdditionalReports,
  persistQuarter,
  persistPlusMinus,
  persistLineupAnalysis,
  persistRotationsSummary,
  persistPlayByPlay,
  persistScoreSheet,
};