const db = require('./index');

// One-time backfill for existing player_game_stats rows, run once after
// the player_id column was added (schema.sql) and both ingestion paths
// (bulkImport.js, reports.js) started writing it on every new insert.
// This is a LOOKUP against decisions backfillPlayerIdentity.js (or live
// ingestion) already made -- every distinct (team, player_name) that has
// ever appeared in player_game_stats should already have a matching
// player_name_aliases row from that earlier backfill. This script does
// NOT re-run resolvePlayerName()'s fuzzy-matching logic; it only joins
// player_game_stats to the alias each row's (team, name) already
// resolved to, exactly once.
//
// team_id isn't a column on player_game_stats itself -- derived the same
// way every other consumer in this codebase derives it: join to games and
// check team_side against home_team_id/opponent_team_id.
//
// Any row whose (team_id, player_name) has no matching alias is NOT
// silently skipped -- it's collected and reported at the end, since that
// would mean backfillPlayerIdentity.js missed something real.

async function backfill() {
  await db.migrate();

  const rows = await db.prepare(`
    SELECT
      pgs.id,
      CASE WHEN pgs.team_side = 'home' THEN g.home_team_id ELSE g.opponent_team_id END AS team_id,
      pgs.player_name
    FROM player_game_stats pgs
    JOIN games g ON g.id = pgs.game_id
    WHERE pgs.player_id IS NULL
  `).all();

  console.log(`Backfilling player_id for ${rows.length} existing player_game_stats row(s)...\n`);

  let resolved = 0;
  const pendingReview = [];
  const trulyUnresolved = [];

  for (const row of rows) {
    const alias = await db.prepare(
      'SELECT player_id FROM player_name_aliases WHERE team_id = ? AND alias_text = ?',
    ).get(row.team_id, row.player_name);

    if (alias) {
      await db.prepare('UPDATE player_game_stats SET player_id = ? WHERE id = ?').run(alias.player_id, row.id);
      resolved += 1;
      continue;
    }

    // No alias yet -- expected and correct if this exact (team, name) is
    // still sitting in the review queue (confirmReview/rejectReview will
    // backfill it once a human resolves it); anything else here means
    // backfillPlayerIdentity.js missed something real and needs looking at.
    const pending = await db.prepare(
      `SELECT id FROM player_identity_review WHERE team_id = ? AND candidate_text = ? AND status = 'pending'`,
    ).get(row.team_id, row.player_name);

    if (pending) {
      pendingReview.push({ ...row, reviewId: pending.id });
    } else {
      trulyUnresolved.push(row);
    }
  }

  console.log(`Resolved: ${resolved}`);
  console.log(`Awaiting review (expected -- will backfill on confirm/reject): ${pendingReview.length}`);
  if (pendingReview.length > 0) {
    for (const r of pendingReview) {
      console.log(`  player_game_stats.id=${r.id} team_id=${r.team_id} player_name="${r.player_name}" review #${r.reviewId}`);
    }
  }
  console.log(`Truly unresolved (no alias, no pending review -- reported, not skipped): ${trulyUnresolved.length}`);
  if (trulyUnresolved.length > 0) {
    console.log('\n--- truly unresolved rows ---');
    for (const r of trulyUnresolved) {
      console.log(`  player_game_stats.id=${r.id} team_id=${r.team_id} player_name="${r.player_name}"`);
    }
  }
}

backfill()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
