const db = require('../db');
const { resolvePlayerName, findCandidate } = require('./playerIdentity');
const { normalizeTeamName } = require('./teamSide');

// Step 45: real, coarse "shot selection zone" classification from
// action_text -- confirmed against real data (Step 44/45): every real
// 2pt FG event carries exactly one of "in the paint"/"outside the paint",
// every real 3pt FG event is its own implicit zone (a three is beyond the
// arc by definition, so the source PDF never tags a location for it).
// Deliberately NOT a shot chart -- no x/y, no fine-grained zones, just
// paint / mid_range / three per attempt. Anything else (rebounds, fouls,
// substitutions, turnovers, etc.) has no zone at all -- returns null, not
// guessed. Exported so the one-time historical backfill
// (scripts/backfill-play-by-play-shot-zones.js) uses this exact same
// logic rather than its own copy.
function classifyShotZone(actionText) {
  if (!actionText) return null;
  if (/^3pt FG/i.test(actionText)) return 'three';
  if (/in the paint/i.test(actionText)) return 'paint';
  if (/outside the paint/i.test(actionText)) return 'mid_range';
  return null;
}

// Step 45: resolve one play-by-play event's real player_id. Primary: an
// already-resolved player_game_stats row for the same game+side whose
// player_name starts with this event's initial and contains its surname
// (same "first-name-initial + surname" shape reportExtractors.js's own
// rosterMap already uses) -- confirmed necessary, not just tidy: game 7
// has 3 real different players surnamed OCHIENG on one team, only
// distinguishable by initial. Falls back to the real, read-only
// findCandidate, but only ever acts on an 'exact' result, never 'fuzzy'
// -- a fuzzy candidate here would silently auto-confirm a review a human
// hasn't seen yet, bypassing this project's own never-auto-confirm rule.
// Returns null (not guessed) when ambiguous or unresolved either way.
async function resolvePlayByPlayPlayerId(gameId, teamId, side, surname, initial, cache) {
  if (!surname) return null;
  const matchRows = initial
    ? await db.prepare(`
        SELECT DISTINCT player_id FROM player_game_stats
        WHERE game_id = ? AND team_side = ? AND player_id IS NOT NULL
        AND UPPER(player_name) LIKE UPPER(?) || '%' AND UPPER(player_name) LIKE '%' || UPPER(?) || '%'
      `).all(gameId, side, initial, surname)
    : await db.prepare(`
        SELECT DISTINCT player_id FROM player_game_stats
        WHERE game_id = ? AND team_side = ? AND player_id IS NOT NULL
        AND UPPER(player_name) LIKE '%' || UPPER(?) || '%'
      `).all(gameId, side, surname);

  if (matchRows.length === 1) return matchRows[0].player_id;
  if (matchRows.length > 1) return null;

  const candidate = await findCandidate(teamId, surname, cache);
  return candidate.type === 'exact' ? candidate.playerId : null;
}

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
async function persistQuarter(gameId, quarterResult, teamIdBySide, cache) {
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
      team.team_side_unconfirmed || false,
    ]);
    for (const p of (team.players || [])) {
      playerRows.push([
        gameId, team.team_side, p.jersey_number, p.player_name,
        p.points_total, p.points_q1, p.points_q2, p.points_q3, p.points_q4,
      ]);
      if (teamIdBySide && teamIdBySide[team.team_side]) {
        await resolvePlayerName({
          teamId: teamIdBySide[team.team_side], name: p.player_name, gameId, reportType: 'Quarter Scoring', cache,
        });
      }
    }
  }

  await db.batchInsert(
    'game_quarter_team',
    ['game_id', 'team_side', 'team_name', 'final_score', 'q1', 'q2', 'q3', 'q4', 'cumulative_score_json', 'team_side_unconfirmed'],
    teamRows,
  );
  await db.batchInsert(
    'game_quarter_player',
    ['game_id', 'team_side', 'jersey_number', 'player_name', 'points_total', 'points_q1', 'points_q2', 'points_q3', 'points_q4'],
    playerRows,
  );

  return { teamRows: teamRows.length, playerRows: playerRows.length };
}

async function persistPlusMinus(gameId, plusMinusResult, teamIdBySide, cache) {
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
        team.team_side_unconfirmed || false,
      ]);
      if (teamIdBySide && teamIdBySide[team.team_side]) {
        await resolvePlayerName({
          teamId: teamIdBySide[team.team_side], name: p.player_name, gameId, reportType: 'Plus Minus Summary', cache,
        });
      }
    }
  }

  return db.batchInsert(
    'game_plus_minus',
    ['game_id', 'team_side', 'jersey_number', 'player_name', 'minutes_on', 'minutes_off',
      'score_while_on', 'score_while_off', 'points_diff_on', 'points_diff_off',
      'points_per_min_on', 'points_per_min_off', 'assists_on', 'assists_off',
      'rebounds_on', 'rebounds_off', 'steals_on', 'steals_off', 'turnovers_on', 'turnovers_off',
      'team_side_unconfirmed'],
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
        team.team_side_unconfirmed || false,
      ]);
    }
  }

  return db.batchInsert(
    'game_lineup_analysis',
    ['game_id', 'team_side', 'team_name', 'players_json', 'time_on_court', 'score',
      'score_diff', 'points_per_min', 'rebounds', 'steals', 'turnovers', 'assists',
      'team_side_unconfirmed'],
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
        team.team_side_unconfirmed || false,
      ]);
    }
  }

  return db.batchInsert(
    'game_rotation_stints',
    ['game_id', 'team_side', 'team_name', 'players_json', 'quarter_on', 'time_on', 'quarter_off',
      'time_off', 'time_on_court', 'score', 'score_diff', 'rebounds', 'steals', 'turnovers', 'assists',
      'team_side_unconfirmed'],
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
async function persistPlayByPlay(gameId, playByPlayResult, teamIdBySide, cache) {
  await del.playByPlay.run(gameId);
  if (!playByPlayResult || !playByPlayResult.events) return 0;

  // Step 45 Phase 2: resolve each real team_code (from the PDF's own
  // header, via reportExtractors.js's teamCodeMap) to a real home/opponent
  // side, the same normalized-substring approach assignTeamSides
  // (services/teamSide.js) already uses for every other report type --
  // team_code is NOT assumed to relate predictably to the real team name
  // (confirmed real, Step 45: game 7 uses "UTS" for USIU TIGERS while
  // every other real game checked uses "USIU"). Only attempted when both
  // real team ids and a real 2-entry teamCodeMap are available, and only
  // used when both codes resolve to two DIFFERENT sides -- anything else
  // leaves player_id unresolved for this import rather than guessing,
  // same "never guess" standard the historical backfill script's own
  // ambiguity guard already applies.
  let teamCodeSideMap = null;
  if (teamIdBySide && teamIdBySide.home && teamIdBySide.opponent && playByPlayResult.teamCodeMap && playByPlayResult.teamCodeMap.length === 2) {
    const homeTeam = await db.prepare('SELECT name FROM teams WHERE id = ?').get(teamIdBySide.home);
    const opponentTeam = await db.prepare('SELECT name FROM teams WHERE id = ?').get(teamIdBySide.opponent);
    const homeName = normalizeTeamName(homeTeam && homeTeam.name);
    const opponentName = normalizeTeamName(opponentTeam && opponentTeam.name);
    const map = {};
    for (const { teamCode, teamFullName } of playByPlayResult.teamCodeMap) {
      const n = normalizeTeamName(teamFullName);
      if (n && homeName && (n.includes(homeName) || homeName.includes(n))) map[teamCode] = 'home';
      else if (n && opponentName && (n.includes(opponentName) || opponentName.includes(n))) map[teamCode] = 'opponent';
    }
    const sides = Object.values(map);
    if (Object.keys(map).length === 2 && sides[0] !== sides[1]) {
      teamCodeSideMap = map;
    }
  }

  // Per-(team_code, surname, initial) cache for this one import: the
  // dominant redundancy here is the SAME player appearing in many events
  // (a game routinely has 500-750+ play-by-play rows across ~20-25
  // distinct players), not distinct players -- avoids re-querying
  // player_game_stats for every event, only once per distinct combo. The
  // read-only findCandidate fallback inside resolvePlayByPlayPlayerId
  // still reuses the shared per-import `cache` (Step 32a) for its own
  // alias lookups.
  const resolvedByCombo = {};
  const rows = [];
  for (let idx = 0; idx < playByPlayResult.events.length; idx += 1) {
    const e = playByPlayResult.events[idx];
    const shotZone = classifyShotZone(e.action_text);

    let playerId = null;
    if (teamCodeSideMap && e.team && teamCodeSideMap[e.team] && e.player_surname) {
      const side = teamCodeSideMap[e.team];
      const teamId = teamIdBySide[side];
      const comboKey = `${e.team}|${e.player_surname}|${e.player_initial || ''}`;
      if (comboKey in resolvedByCombo) {
        playerId = resolvedByCombo[comboKey];
      } else {
        playerId = await resolvePlayByPlayPlayerId(gameId, teamId, side, e.player_surname, e.player_initial, cache);
        resolvedByCombo[comboKey] = playerId;
      }
    }

    rows.push([
      gameId, idx, e.quarter, e.time, e.team, e.jersey_number,
      e.player_surname, e.player_initial, e.action_text,
      e.score ? JSON.stringify(e.score) : null,
      null, // raw_text: not returned by extractPlayByPlay today
      shotZone, playerId,
    ]);
  }

  return db.batchInsert(
    'game_play_by_play',
    ['game_id', 'sequence_index', 'quarter', 'event_time', 'team_code', 'jersey_number', 'surname', 'initial', 'action_text', 'score', 'raw_text', 'shot_zone', 'player_id'],
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
// cache (optional): the same per-team object playerIdentity.js's
// findCandidate/resolvePlayerName accept -- passed straight through to
// persistQuarter/persistPlusMinus below (the only two of the six that
// resolve player identity). Harmless to pass to the other four; none of
// them accept a cache argument, so it's simply unused there, same as
// teamIdBySide already is. bulkImport.js creates one cache per upload
// request and passes it in here; callers that don't pass one (there are
// none left after this change, but the parameter stays optional) get
// today's uncached behavior automatically, since findCandidate/
// resolvePlayerName both already treat an absent cache as "fetch every
// call."
async function persistAdditionalReports(gameId, additionalReports, cache) {
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
      const rows = await persistFn(gameId, result, teamIdBySide, cache);
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