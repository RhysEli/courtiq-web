// ONE-TIME, ALREADY-EXECUTED backfill (Step 45 Phase 1). Record of what
// was run against production, not a re-runnable migration -- do not
// re-run blindly (though it IS idempotent: every UPDATE only touches rows
// that are currently NULL, so a second run would just re-confirm zero
// rows change).
//
// shot_zone: classified from action_text, which Step 44 confirmed is
// already 100% covered for real 2pt FG attempts ("in the paint" /
// "outside the paint", exactly one or the other, every real row checked)
// and reliably identifiable for 3pt FG attempts via the "3pt FG" prefix
// itself (a three is definitionally beyond the arc, so the source PDF
// never tags a location for it). Anything else (rebounds, fouls,
// substitutions, turnovers, etc.) has no zone at all -- left NULL, not
// guessed.
//
// player_id: game_play_by_play never had identity resolution run on it --
// only raw team_code/surname/initial. Backfilled by joining
// (team_side, surname) against player_game_stats.player_id for the SAME
// game, which already went through real resolvePlayerName resolution at
// ingestion. team_code cannot be assumed to relate to the real team name
// (confirmed real: game 7 uses "UTS" for USIU TIGERS, every other real
// game checked uses "USIU") -- team_code->team_side is instead resolved
// by data-driven majority vote: whichever side's player_game_stats names
// contain more of that code's real surnames.
//
// PRE-FLIGHT / REAL RESULTS (run twice -- see below -- idempotent both
// times, only NULL rows are ever touched):
// - Confirmed fresh against the real DB, matching Step 44's baseline
//   exactly before any write: game 2 75/75 2pt tagged, game 5 69/69,
//   game 6 120/120, game 7 64/64 (see console output below).
// - team_code->side mapping resolved unambiguously (no ties, no code
//   mapping to both sides) for all 4 games.
// - shot_zone final coverage (unchanged between the two runs): game 2
//   paint=60 mid_range=15 three=49; game 5 paint=50 mid_range=19 three=54;
//   game 6 paint=109 mid_range=11 three=96; game 7 paint=50 mid_range=14
//   three=71 -- exactly matching Step 44's real per-game baseline in every
//   game.
// - FIRST RUN used (team_code, surname) only (no initial) to both match
//   and UPDATE. Matched 22/22 (game 2), 21/23 (game 5), 20/24 (game 6),
//   17/19 (game 7) via primary join. Game 7's OCHIENG combo came back
//   ambiguous (3 distinct already-resolved player_ids: 66, 72, 75) and was
//   correctly left NULL by the pre-existing ambiguity check -- investigated
//   and confirmed these are 3 genuinely different real players sharing one
//   surname (Brian/Thomas/Wesley Ochieng, same team), distinguishable only
//   by first-name initial. Confirmed no misattribution occurred: this was
//   the only (team_code, surname) combo across all 4 games with more than
//   one distinct resolved player_id, and it had already been caught, not
//   silently applied to the wrong rows.
// - SELF-CAUGHT BUG, FIXED before the second run: the original query
//   discarded the table's own `initial` column entirely, both when
//   matching and when scoping the final UPDATE -- had any single-surname
//   ambiguity existed where the match query returned exactly 1 result but
//   that result belonged to only one of several same-surname players (not
//   OCHIENG's case, but a real latent risk), every play-by-play row
//   sharing just the surname would have been UPDATE'd, misattributing
//   events. Fixed: match query now scopes by initial (LIKE UPPER(initial)
//   || '%', same "first-initial + surname" shape rosterMap already uses
//   elsewhere) when present, and the final UPDATE scopes by
//   `initial IS NOT DISTINCT FROM $5` (NULL-safe, not plain `=`).
// - SECOND RUN (after the fix, still idempotent -- only touched rows still
//   NULL after run 1): games 2/5/6 had zero remaining player_id combos
//   beyond the already-known pending-review misses (0 additional resolved
//   in all three -- confirms the bug never actually affected them). Game 7
//   now resolves OCHIENG correctly: 3 additional primary-join matches (one
//   per initial: B->66, T->72, W->75), raising game 7's real player_id
//   coverage from 409/508 to 501/508.
// - REAL FINAL player_id coverage (of rows with a real surname): game 2
//   520/520 (100%), game 5 496/556 (89.2%), game 6 632/723 (87.4%), game 7
//   501/508 (98.6%).
// - Every real remaining miss was investigated, not just counted: each is
//   a surname that already has a real, pre-existing, still-PENDING
//   player_identity_review row (DARLIGNTON KISIVULI / JACKSON WAWERU in
//   game 5; AHMED/HANNS/HASSAN/OLUK in game 6; MORANGI in game 7) -- not a
//   case the join failed to find, a case where no confirmed identity
//   exists ANYWHERE in the system yet. Confirmed directly: 0 real surnames
//   across all 4 games were unfindable in player_game_stats.player_name at
//   all.
// - Fallback (real, read-only findCandidate -- only ever acting on an
//   'exact' result, never 'fuzzy', matching this project's own
//   never-auto-confirm-a-fuzzy-match rule) was run both times and found,
//   as predicted from the above, 0 additional real matches -- the
//   pending-review names are pending specifically because they're NOT
//   exact matches. Left NULL, correctly, same as the rest of the system
//   already treats them.
const db = require('../src/db');
const { findCandidate } = require('../src/services/playerIdentity');

const GAME_IDS = [2, 5, 6, 7]; // real games with stored play-by-play, confirmed Step 44

function classifyShotZone(actionText) {
  if (!actionText) return null;
  if (/^3pt FG/i.test(actionText)) return 'three';
  if (/in the paint/i.test(actionText)) return 'paint';
  if (/outside the paint/i.test(actionText)) return 'mid_range';
  return null;
}

async function determineTeamCodeSideMap(gameId, teamCodes) {
  const surnamesByCode = {};
  for (const code of teamCodes) {
    const rows = await db.prepare(
      'SELECT DISTINCT surname FROM game_play_by_play WHERE game_id = ? AND team_code = ? AND surname IS NOT NULL',
    ).all(gameId, code);
    surnamesByCode[code] = rows.map((r) => r.surname);
  }
  const sideMap = {};
  const voteCounts = {};
  for (const code of teamCodes) {
    const counts = { home: 0, opponent: 0 };
    for (const side of ['home', 'opponent']) {
      for (const surname of surnamesByCode[code]) {
        const hit = await db.prepare(`
          SELECT 1 FROM player_game_stats
          WHERE game_id = ? AND team_side = ?
          AND UPPER(player_name) LIKE '%' || UPPER(?) || '%'
          LIMIT 1
        `).get(gameId, side, surname);
        if (hit) counts[side] += 1;
      }
    }
    voteCounts[code] = counts;
    sideMap[code] = counts.home > counts.opponent ? 'home' : 'opponent';
  }
  const sides = Object.values(sideMap);
  if (sides[0] === sides[1]) {
    throw new Error(`Game ${gameId}: both team codes (${teamCodes.join(', ')}) mapped to the same side (${sides[0]}) -- ambiguous, real votes: ${JSON.stringify(voteCounts)}. Aborting rather than guessing.`);
  }
  return sideMap;
}

async function main() {
  console.log('=== PRE-FLIGHT: real shot-tag coverage, re-confirmed fresh against the live DB ===');
  for (const gameId of GAME_IDS) {
    const twoPt = await db.prepare("SELECT COUNT(*) as n FROM game_play_by_play WHERE game_id = ? AND action_text ILIKE '2pt FG%'").get(gameId);
    const tagged = await db.prepare(`
      SELECT COUNT(*) as n FROM game_play_by_play
      WHERE game_id = ? AND action_text ILIKE '2pt FG%'
      AND ((action_text ILIKE '%in the paint%')::int + (action_text ILIKE '%outside the paint%')::int) = 1
    `).get(gameId);
    console.log(`game ${gameId}: 2pt FG total ${twoPt.n}, exactly-one-tag ${tagged.n}`);
    if (Number(twoPt.n) !== Number(tagged.n)) {
      throw new Error(`Game ${gameId}: real coverage (${tagged.n}/${twoPt.n}) no longer matches Step 44's 100% baseline -- aborting, re-investigate before re-running.`);
    }
  }
  console.log('Pre-flight OK: matches Step 44 exactly for all 4 games.\n');

  const client = await db.pool.connect();
  const results = {};
  try {
    await client.query('BEGIN');

    for (const gameId of GAME_IDS) {
      console.log(`\n=== game ${gameId}: shot_zone backfill ===`);
      const rows = await client.query('SELECT id, action_text FROM game_play_by_play WHERE game_id = $1 AND shot_zone IS NULL', [gameId]);
      let paint = 0; let midRange = 0; let three = 0; let unclassified = 0;
      const unclassifiedSamples = [];
      for (const row of rows.rows) {
        const zone = classifyShotZone(row.action_text);
        if (zone) {
          await client.query('UPDATE game_play_by_play SET shot_zone = $1 WHERE id = $2', [zone, row.id]);
          if (zone === 'paint') paint += 1;
          else if (zone === 'mid_range') midRange += 1;
          else three += 1;
        } else {
          unclassified += 1;
          if (unclassifiedSamples.length < 5) unclassifiedSamples.push(row.action_text);
        }
      }
      console.log(`  classified: paint=${paint} mid_range=${midRange} three=${three} | left NULL (no shot in this event): ${unclassified}`);
      console.log(`  sample of unclassified action_text (should be non-shot events, e.g. rebounds/fouls/subs): ${JSON.stringify(unclassifiedSamples)}`);

      console.log(`=== game ${gameId}: player_id backfill ===`);
      const game = await client.query('SELECT home_team_id, opponent_team_id FROM games WHERE id = $1', [gameId]);
      const { home_team_id: homeTeamId, opponent_team_id: opponentTeamId } = game.rows[0];
      const codeRows = await client.query('SELECT DISTINCT team_code FROM game_play_by_play WHERE game_id = $1 AND team_code IS NOT NULL', [gameId]);
      const teamCodes = codeRows.rows.map((r) => r.team_code);
      const sideMap = await determineTeamCodeSideMap(gameId, teamCodes);
      console.log(`  real team_code -> side map: ${JSON.stringify(sideMap)} (home=${homeTeamId}, opponent=${opponentTeamId})`);

      const combos = await client.query(
        'SELECT DISTINCT team_code, surname, initial FROM game_play_by_play WHERE game_id = $1 AND player_id IS NULL AND surname IS NOT NULL',
        [gameId],
      );

      let primaryResolved = 0; let fallbackResolved = 0; let leftNull = 0;
      const leftNullDetail = [];
      for (const { team_code: code, surname, initial } of combos.rows) {
        const side = sideMap[code];
        const teamId = side === 'home' ? homeTeamId : opponentTeamId;

        // Real, found finding this round: surname alone is not always
        // enough -- game 7 has 3 genuinely different real players sharing
        // the surname OCHIENG on the same team (Brian/Thomas/Wesley).
        // initial (already a real column on this table, previously
        // unused here) disambiguates them correctly when present, same
        // "first-name-initial + surname" shape rosterMap already uses
        // elsewhere in this codebase.
        const matchRows = initial
          ? await client.query(
            `SELECT DISTINCT player_id FROM player_game_stats
             WHERE game_id = $1 AND team_side = $2 AND player_id IS NOT NULL
             AND UPPER(player_name) LIKE UPPER($3) || '%' AND UPPER(player_name) LIKE '%' || UPPER($4) || '%'`,
            [gameId, side, initial, surname],
          )
          : await client.query(
            `SELECT DISTINCT player_id FROM player_game_stats
             WHERE game_id = $1 AND team_side = $2 AND player_id IS NOT NULL
             AND UPPER(player_name) LIKE '%' || UPPER($3) || '%'`,
            [gameId, side, surname],
          );

        let playerId = null;
        let via = null;
        if (matchRows.rows.length === 1) {
          playerId = matchRows.rows[0].player_id;
          via = 'primary-join';
        } else if (matchRows.rows.length > 1) {
          leftNull += 1;
          leftNullDetail.push({ code, surname, initial, reason: 'ambiguous: multiple distinct resolved player_ids matched even with initial', candidates: matchRows.rows.map((r) => r.player_id) });
          continue;
        } else {
          // No already-resolved player_game_stats row -- try the real,
          // read-only fuzzy/exact matcher, but ONLY act on 'exact'. Never
          // auto-link a 'fuzzy' result -- that would silently bypass this
          // project's own never-auto-confirm-a-fuzzy-match rule.
          const candidate = await findCandidate(teamId, surname);
          if (candidate.type === 'exact') {
            playerId = candidate.playerId;
            via = 'fallback-findCandidate-exact';
          } else {
            leftNull += 1;
            leftNullDetail.push({ code, surname, initial, reason: `findCandidate returned '${candidate.type}' -- not acted on` });
            continue;
          }
        }

        // initial IS NOT DISTINCT FROM $5 (not "= $5"): a NULL initial on
        // this specific combo must only update rows that ALSO have a NULL
        // initial, not silently match every initial via SQL's normal NULL
        // semantics (NULL = NULL is never true, IS NOT DISTINCT FROM
        // treats two NULLs as equal, which is what "same combo" means
        // here).
        await client.query(
          'UPDATE game_play_by_play SET player_id = $1 WHERE game_id = $2 AND team_code = $3 AND surname = $4 AND initial IS NOT DISTINCT FROM $5 AND player_id IS NULL',
          [playerId, gameId, code, surname, initial],
        );
        if (via === 'primary-join') primaryResolved += 1;
        else fallbackResolved += 1;
      }

      console.log(`  ${combos.rows.length} distinct (team_code, surname) combos needed resolving`);
      console.log(`  resolved via primary join: ${primaryResolved} | via fallback exact match: ${fallbackResolved} | left NULL: ${leftNull}`);
      if (leftNullDetail.length) console.log(`  left-NULL detail: ${JSON.stringify(leftNullDetail)}`);

      results[gameId] = { primaryResolved, fallbackResolved, leftNull, totalCombos: combos.rows.length };
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log('\n=== AFTER: real final coverage, verified against the live DB ===');
  for (const gameId of GAME_IDS) {
    const zoneCounts = await db.prepare(
      "SELECT shot_zone, COUNT(*) as n FROM game_play_by_play WHERE game_id = ? GROUP BY shot_zone ORDER BY shot_zone NULLS LAST",
    ).all(gameId);
    const playerIdCoverage = await db.prepare(
      'SELECT COUNT(*) as total, COUNT(player_id) as with_player_id FROM game_play_by_play WHERE game_id = ? AND surname IS NOT NULL',
    ).get(gameId);
    console.log(`game ${gameId}: shot_zone breakdown ${JSON.stringify(zoneCounts)} | player_id coverage (of rows with a real surname): ${playerIdCoverage.with_player_id}/${playerIdCoverage.total}`);
  }

  await db.pool.end();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('backfill-play-by-play-shot-zones failed:', err.message);
    process.exit(1);
  });
