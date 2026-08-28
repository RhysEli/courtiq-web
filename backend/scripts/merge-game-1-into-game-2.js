// ONE-TIME, ALREADY-EXECUTED cleanup (Step 29). This is a record of what
// was run against production, not a re-runnable migration -- do not add
// this to schema.sql, and do not re-run this blindly.
//
// games id=1 and id=2 are the same real USIU TIGERS vs CONGO NETS game
// (26 July), split across two rows by a now-fixed date-parsing bug
// (Step 27/27a) plus a now-closed gap in the manual create-game route.
// Confirmed by direct investigation (Step 27, re-confirmed Step 29):
// every content table the two rows share -- player_game_stats,
// game_quarter_team, game_quarter_player, game_plus_minus,
// game_lineup_analysis, game_rotation_stints, game_play_by_play,
// game_metrics, game_score_sheet -- is byte-identical between the two
// rows, so keeping only game 2's copies loses nothing real. game 2's
// game_date (2026-07-26) is the one the now-fixed extractBoxScore
// computes from the real source PDF; game 1's (2026-07-25) is the
// pre-fix artifact. game 2 also holds the one asset that ISN'T
// duplicated anywhere: a real AI narrative (game_narratives, generated
// 2026-08-20) that cost real API credits and had already failed twice
// in production before succeeding -- not something to regenerate if
// avoidable.
//
// reports (real upload history, not duplicated content) and the two
// first_seen_game_id provenance FKs (player_name_aliases,
// player_identity_review) get repointed to game 2 rather than dropped.
//
// Fresh pre-flight checks run immediately before the merge (not trusted
// from the earlier investigation report):
//
// PRE-FLIGHT RESULTS (from the actual run): the very first run aborted --
// game_metrics failed the byte-identical check even though the
// investigation had confirmed it identical days earlier. Not a real
// change in the data: metrics_json and insight_tags_json (the actual
// content) were still identical; the comparison was catching
// computed_at, an expected-to-differ recomputation timestamp (same
// category as games.created_at, which Pre-flight 3 below already
// excludes) that the byte-identical check hadn't been excluding. Fixed
// the comparison (stripIds now also strips computed_at) and re-ran --
// every pre-flight passed clean on the second run, which is the one
// that actually executed the merge. Real bug in this script's own
// check, caught by running it fresh rather than trusting the
// investigation blindly -- exactly what the fresh-pre-flight discipline
// is for. Every other pre-flight (the 8 remaining identical-content
// tables, game_narratives' 0/1 split, the games rows' field-by-field
// match) passed on the first attempt with no changes needed.
const db = require('../src/db');

const DROP_ID = 1;
const KEEP_ID = 2;

// Every table confirmed (Step 27 investigation, re-confirmed here fresh)
// to hold byte-identical content between game 1 and game 2 -- game 1's
// copies are deleted outright, not repointed, since game 2 already has
// the same data.
const IDENTICAL_TABLES = [
  'player_game_stats',
  'game_quarter_team',
  'game_quarter_player',
  'game_plus_minus',
  'game_lineup_analysis',
  'game_rotation_stints',
  'game_play_by_play',
  'game_metrics',
  'game_score_sheet',
];

// computed_at (game_metrics) is an expected-to-differ recomputation
// timestamp -- same category as games.created_at, which Pre-flight 3
// below already excludes from its own must-match field list -- not real
// content, so it's stripped here alongside id/game_id rather than
// treated as a content disagreement.
function stripIds(row) {
  const {
    id, game_id, computed_at, ...rest
  } = row;
  return rest;
}

// Order-independent content equality: both sides' rows, stringified and
// sorted, compared as sets -- correct for confirming "identical or not"
// (the pre-flight's actual question), not a diff report.
async function fetchSortedContent(table, gameId) {
  const rows = await db.prepare(`SELECT * FROM ${table} WHERE game_id = ?`).all(gameId);
  return rows.map(stripIds).map((r) => JSON.stringify(r)).sort();
}

async function main() {
  // --- Pre-flight 1: every "byte-identical" table really still is ---
  for (const table of IDENTICAL_TABLES) {
    const dropContent = await fetchSortedContent(table, DROP_ID);
    const keepContent = await fetchSortedContent(table, KEEP_ID);
    if (JSON.stringify(dropContent) !== JSON.stringify(keepContent)) {
      throw new Error(
        `${table}: game ${DROP_ID} and game ${KEEP_ID} are NOT byte-identical right now `
        + `(drop has ${dropContent.length} rows, keep has ${keepContent.length}) -- `
        + 'the investigation\'s finding no longer holds. Aborting; re-investigate before re-running.',
      );
    }
    console.log(`Pre-flight OK: ${table} is byte-identical (${dropContent.length} row(s) each side).`);
  }

  // --- Pre-flight 2: game_narratives is still exactly 0 on drop, 1 on keep ---
  const narrDrop = await db.prepare('SELECT COUNT(*) c FROM game_narratives WHERE game_id = ?').get(DROP_ID);
  const narrKeep = await db.prepare('SELECT COUNT(*) c FROM game_narratives WHERE game_id = ?').get(KEEP_ID);
  if (Number(narrDrop.c) !== 0 || Number(narrKeep.c) !== 1) {
    throw new Error(
      `game_narratives: expected 0 row(s) on game ${DROP_ID} and 1 on game ${KEEP_ID}, `
      + `found ${narrDrop.c}/${narrKeep.c} -- something changed since the investigation. Aborting.`,
    );
  }
  console.log(`Pre-flight OK: game_narratives is 0 (game ${DROP_ID}) / 1 (game ${KEEP_ID}), as expected.`);

  // --- Pre-flight 3: the two games rows still only differ on game_date/created_at/id ---
  const g1 = await db.prepare('SELECT * FROM games WHERE id = ?').get(DROP_ID);
  const g2 = await db.prepare('SELECT * FROM games WHERE id = ?').get(KEEP_ID);
  if (!g1 || !g2) {
    throw new Error(`Expected both game ${DROP_ID} and game ${KEEP_ID} to exist -- found drop=${Boolean(g1)}, keep=${Boolean(g2)}. Aborting.`);
  }
  const fieldsMustMatch = ['season_id', 'competition_id', 'home_team_id', 'opponent_team_id', 'status', 'created_by', 'venue', 'stage_id'];
  for (const field of fieldsMustMatch) {
    if (JSON.stringify(g1[field]) !== JSON.stringify(g2[field])) {
      throw new Error(
        `games.${field} differs between game ${DROP_ID} (${JSON.stringify(g1[field])}) and game ${KEEP_ID} `
        + `(${JSON.stringify(g2[field])}) -- one of them has picked up real metadata the other lacks since the `
        + 'investigation. This needs a real decision, not an automatic merge. Aborting.',
      );
    }
  }
  console.log(`Pre-flight OK: games rows for ${DROP_ID}/${KEEP_ID} only differ on game_date/created_at/id, as expected.`);

  // --- Before counts, for the final report ---
  const before = {};
  for (const table of [...IDENTICAL_TABLES, 'reports', 'player_name_aliases', 'player_identity_review', 'game_narratives']) {
    const dropCount = await db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE game_id = ?`).get(DROP_ID).catch(() => null);
    const keepCount = await db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE game_id = ?`).get(KEEP_ID).catch(() => null);
    before[table] = { drop: dropCount ? Number(dropCount.c) : null, keep: keepCount ? Number(keepCount.c) : null };
  }
  const aliasesBefore = await db.prepare('SELECT COUNT(*) c FROM player_name_aliases WHERE first_seen_game_id = ?').get(DROP_ID);
  const reviewBefore = await db.prepare('SELECT COUNT(*) c FROM player_identity_review WHERE first_seen_game_id = ?').get(DROP_ID);

  // --- The merge itself, in a single transaction: ~10 tables touched, ---
  // --- a partial failure here would leave a real mess, unlike the      ---
  // --- precedent script's single-table reassignment.                  ---
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('UPDATE reports SET game_id = $1 WHERE game_id = $2', [KEEP_ID, DROP_ID]);
    await client.query('UPDATE player_name_aliases SET first_seen_game_id = $1 WHERE first_seen_game_id = $2', [KEEP_ID, DROP_ID]);
    await client.query('UPDATE player_identity_review SET first_seen_game_id = $1 WHERE first_seen_game_id = $2', [KEEP_ID, DROP_ID]);

    for (const table of IDENTICAL_TABLES) {
      await client.query(`DELETE FROM ${table} WHERE game_id = $1`, [DROP_ID]);
    }

    await client.query('DELETE FROM games WHERE id = $1', [DROP_ID]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // --- After counts + real evidence in the script's own output ---
  console.log('');
  console.log('=== Merge complete. Before/after counts ===');
  for (const table of [...IDENTICAL_TABLES, 'reports', 'game_narratives']) {
    const keepAfter = await db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE game_id = ?`).get(KEEP_ID);
    console.log(`${table}: game ${DROP_ID} before=${before[table].drop}, game ${KEEP_ID} before=${before[table].keep} -> game ${KEEP_ID} after=${keepAfter.c}`);
  }
  const aliasesAfterDrop = await db.prepare('SELECT COUNT(*) c FROM player_name_aliases WHERE first_seen_game_id = ?').get(DROP_ID);
  const aliasesAfterKeep = await db.prepare('SELECT COUNT(*) c FROM player_name_aliases WHERE first_seen_game_id = ?').get(KEEP_ID);
  console.log(`player_name_aliases.first_seen_game_id: game ${DROP_ID} before=${aliasesBefore.c} -> after=${aliasesAfterDrop.c}; game ${KEEP_ID} after=${aliasesAfterKeep.c}`);
  const reviewAfterDrop = await db.prepare('SELECT COUNT(*) c FROM player_identity_review WHERE first_seen_game_id = ?').get(DROP_ID);
  console.log(`player_identity_review.first_seen_game_id: game ${DROP_ID} before=${reviewBefore.c} -> after=${reviewAfterDrop.c}`);

  const gameStillExists = await db.prepare('SELECT id FROM games WHERE id = ?').get(DROP_ID);
  console.log(`games id=${DROP_ID} still exists: ${Boolean(gameStillExists)} (expected: false)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('merge-game-1-into-game-2 failed:', err.message);
    process.exit(1);
  });
