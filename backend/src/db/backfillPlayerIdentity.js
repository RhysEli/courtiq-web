const db = require('./index');
const { resolvePlayerName } = require('../services/playerIdentity');

// One-time backfill: every distinct (team, player_name) string that
// already exists in real bulk-imported data (player_game_stats, the only
// table with real production player names -- the `players` roster table
// itself is empty) gets run through the same resolvePlayerName() live
// ingestion uses. Processed in chronological first-seen order per team --
// not insertion order, since game_id isn't reliably chronological (a game
// entered late can have an earlier game_date) -- so the earliest real
// occurrence of a name becomes the seed/canonical player, and later
// variants get compared against what's already been seen, the same way
// this would unfold if these games had come in one at a time via a real
// bulk-import over the actual season instead of all at once here.
//
// No special-casing: a fuzzy match goes into the review queue exactly
// like a live one would, not auto-resolved by this script. This is
// deliberately also the first real exercise of that queue.

async function backfill() {
  await db.migrate();

  const rows = await db.prepare(`
    SELECT DISTINCT ON (team_id, player_name) team_id, player_name, game_id, game_date
    FROM (
      SELECT
        CASE WHEN pgs.team_side = 'home' THEN g.home_team_id ELSE g.opponent_team_id END AS team_id,
        pgs.player_name, g.id AS game_id, g.game_date
      FROM player_game_stats pgs
      JOIN games g ON g.id = pgs.game_id
    ) x
    ORDER BY team_id, player_name, game_date ASC, game_id ASC
  `).all();

  // Re-sort by (team, first-seen date) -- DISTINCT ON's own ORDER BY was
  // only needed to pick which row wins per (team_id, player_name); this
  // second sort is what actually determines processing order.
  rows.sort((a, b) => {
    if (a.team_id !== b.team_id) return a.team_id < b.team_id ? -1 : 1;
    if (a.game_date !== b.game_date) return a.game_date < b.game_date ? -1 : 1;
    return a.game_id - b.game_id;
  });

  console.log(`Backfilling player identity for ${rows.length} distinct (team, name) strings...\n`);

  const totals = { created: 0, linked: 0, pendingReview: 0 };
  const byTeam = {};

  for (const row of rows) {
    const resolution = await resolvePlayerName({
      teamId: row.team_id, name: row.player_name, gameId: row.game_id, reportType: 'Box Score (backfill)',
    });
    const teamTotals = (byTeam[row.team_id] ||= { created: 0, linked: 0, pendingReview: 0 });

    if (resolution.status === 'created') {
      totals.created += 1; teamTotals.created += 1;
    } else if (resolution.status === 'linked') {
      totals.linked += 1; teamTotals.linked += 1;
      console.log(`  [${row.team_id}] LINKED "${row.player_name}" -> player #${resolution.playerId}`);
    } else if (resolution.status === 'pending_review') {
      totals.pendingReview += 1; teamTotals.pendingReview += 1;
      console.log(`  [${row.team_id}] PENDING REVIEW "${row.player_name}" (review #${resolution.reviewId})`);
    }
  }

  console.log('\n--- per team ---');
  for (const [teamId, t] of Object.entries(byTeam)) {
    console.log(`${teamId}: ${t.created} created, ${t.linked} linked, ${t.pendingReview} pending review`);
  }
  console.log('\n--- totals ---');
  console.log(`${totals.created} canonical players created, ${totals.linked} exact-match links, ${totals.pendingReview} pending review`);
}

backfill()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
