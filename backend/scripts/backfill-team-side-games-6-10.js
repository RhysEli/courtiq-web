// ONE-TIME, ALREADY-EXECUTED cleanup (Step 31). This is a record of what
// was run against production, not a re-runnable migration -- do not add
// this to schema.sql, and do not re-run this blindly.
//
// game_lineup_analysis and game_rotation_stints are cleanly inverted for
// games 6 and 10 (both real USIU TIGERS vs EAGLES games) -- every row's
// own team_name maps to exactly the wrong team_side, confirmed directly
// by querying the persisted team_name column (Step 30 investigation).
// game_quarter_team is correct for these same games with the identical
// homeTeamName input, and game_plus_minus is unaffected (confirmed by
// cross-referencing against player_game_stats via player identity, since
// it has no team_name column to check directly) -- isolated to these 2
// tables x 2 games, not systemic. The extractors' own team-name-capture
// defect that caused this (extractLineupAnalysis / extractRotationsSummary,
// services/reportExtractors.js) is NOT fixed by this script -- the
// original source PDFs for these two games are no longer on disk, so the
// actual malformed capture couldn't be diagnosed; fixing the regex blind
// would risk papering over the symptom rather than the real defect. This
// script only corrects the two already-known-bad row-groups.
//
// Fresh pre-flight check performed immediately before running this (not
// trusted from the earlier investigation report) -- see PRE-FLIGHT
// RESULTS below.
//
// PRE-FLIGHT RESULTS (from the actual run): both tables, both games,
// showed the exact same inversion the investigation found (team_side=
// 'home' -> team_name='EAGLES', the wrong team) -- nothing had changed.
const db = require('../src/db');

const GAME_IDS = [6, 10];
const TABLES = ['game_lineup_analysis', 'game_rotation_stints'];

async function getMapping(table, gameId) {
  return db.prepare(`SELECT team_side, team_name FROM ${table} WHERE game_id = ? GROUP BY team_side, team_name ORDER BY team_side`).all(gameId);
}

async function main() {
  const homeTeamIds = {};
  for (const gameId of GAME_IDS) {
    const game = await db.prepare('SELECT home_team_id, opponent_team_id FROM games WHERE id = ?').get(gameId);
    if (!game) {
      throw new Error(`Game ${gameId} not found. Aborting.`);
    }
    homeTeamIds[gameId] = game.home_team_id;
  }

  // --- Pre-flight: re-confirm the exact inversion still holds, right now ---
  console.log('=== Pre-flight: current team_side -> team_name mapping ===');
  for (const table of TABLES) {
    for (const gameId of GAME_IDS) {
      const mapping = await getMapping(table, gameId);
      console.log(`${table} game ${gameId}:`, JSON.stringify(mapping));
      const homeRow = mapping.find((r) => r.team_side === 'home');
      if (!homeRow) {
        throw new Error(`${table} game ${gameId}: no 'home' rows found. Aborting.`);
      }
      if (homeRow.team_name === homeTeamIds[gameId]) {
        throw new Error(
          `${table} game ${gameId}: team_side='home' already maps to team_name='${homeRow.team_name}', `
          + `the real home team -- this is no longer inverted. The investigation's finding doesn't hold `
          + 'right now. Aborting; re-investigate before re-running.',
        );
      }
    }
  }
  console.log('Pre-flight OK: both tables, both games, still show the exact inversion. Proceeding.');

  // --- The swap itself, in a transaction ---
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    for (const table of TABLES) {
      await client.query(
        `UPDATE ${table} SET team_side = CASE WHEN team_side = 'home' THEN 'opponent' ELSE 'home' END WHERE game_id = ANY($1::int[])`,
        [GAME_IDS],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // --- After mapping, as real evidence in the script's own output ---
  console.log('');
  console.log('=== After: team_side -> team_name mapping ===');
  for (const table of TABLES) {
    for (const gameId of GAME_IDS) {
      const mapping = await getMapping(table, gameId);
      const homeRow = mapping.find((r) => r.team_side === 'home');
      const correct = homeRow && homeRow.team_name === homeTeamIds[gameId];
      console.log(`${table} game ${gameId}:`, JSON.stringify(mapping), '| correct:', correct);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('backfill-team-side-games-6-10 failed:', err.message);
    process.exit(1);
  });
