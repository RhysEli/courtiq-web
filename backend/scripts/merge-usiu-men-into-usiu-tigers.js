// ONE-TIME, ALREADY-EXECUTED cleanup (Step 14 Phase C). This is a record
// of what was run against production, not a re-runnable migration -- do
// not add this to schema.sql, and do not re-run this blindly (it will
// no-op harmlessly if 'usiu-men' is already gone, but it's not idempotent
// in the "safe to leave running forever" sense schema.sql's statements
// are).
//
// Why a targeted one-off rather than the general team-identity-groups
// machinery (Step 14 Phase B): 'usiu-men' (the original Step 5 seed row,
// institution_id='usiu', gender_category='Men') and 'USIU TIGERS' (bulk-
// import-created, no institution/gender set) are the same real team under
// two ids. Unlike a hypothetical future duplicate, this one's blast
// radius was confirmed near-zero before acting: zero games, zero players,
// zero team_competition_seasons rows on 'usiu-men' -- all real USIU
// activity already lived on 'USIU TIGERS'. That makes a direct,
// permanent reassignment safe on its own terms, without needing the
// general merge-conflict machinery Step 14's investigation explicitly
// deferred (see schema.sql's comment on team_identity_groups).
//
// Fresh pre-flight check performed immediately before running this (not
// trusted from the earlier investigation): confirmed none of usiu-men's
// 3 real user_teams members (stats@courtiq.dev, coach@courtiq.dev,
// manager@courtiq.dev) were already also members of USIU TIGERS -- which
// would have collided with user_teams' composite PRIMARY KEY (user_id,
// team_id) on reassignment. Also found (not caught by the earlier
// investigation, which didn't check this table) one `invites` row
// referencing usiu-men -- a revoked, clearly-test invite
// (test-invite-sandbox-check@example.com) from an earlier round, not a
// real pending invite -- reassigned for FK consistency rather than left
// dangling.
const db = require('../src/db');

async function main() {
  const usersBefore = await db.prepare("SELECT user_id FROM user_teams WHERE team_id = 'usiu-men'").all();
  for (const u of usersBefore) {
    const collision = await db.prepare(
      "SELECT 1 FROM user_teams WHERE user_id = ? AND team_id = 'USIU TIGERS'",
    ).get(u.user_id);
    if (collision) {
      throw new Error(`user ${u.user_id} is already on USIU TIGERS -- reassigning would collide with the composite PK. Aborting.`);
    }
  }

  const games = await db.prepare("SELECT COUNT(*) c FROM games WHERE home_team_id = 'usiu-men' OR opponent_team_id = 'usiu-men'").get();
  const players = await db.prepare("SELECT COUNT(*) c FROM players WHERE team_id = 'usiu-men'").get();
  const tcs = await db.prepare("SELECT COUNT(*) c FROM team_competition_seasons WHERE team_id = 'usiu-men'").get();
  if (Number(games.c) > 0 || Number(players.c) > 0 || Number(tcs.c) > 0) {
    throw new Error(`usiu-men is not empty (games=${games.c}, players=${players.c}, team_competition_seasons=${tcs.c}) -- this script assumes near-zero entanglement. Aborting.`);
  }

  await db.prepare("UPDATE user_teams SET team_id = 'USIU TIGERS' WHERE team_id = 'usiu-men'").run();
  await db.prepare("UPDATE users SET team_id = 'USIU TIGERS' WHERE team_id = 'usiu-men'").run();
  await db.prepare("UPDATE invites SET team_id = 'USIU TIGERS' WHERE team_id = 'usiu-men'").run();
  await db.prepare("DELETE FROM team_name_aliases WHERE team_id = 'usiu-men'").run();
  const result = await db.prepare("DELETE FROM teams WHERE id = 'usiu-men'").run();

  console.log(`Reassigned ${usersBefore.length} user_teams row(s) to USIU TIGERS, removed usiu-men (deleted rows: ${result.changes}).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('merge-usiu-men-into-usiu-tigers failed:', err.message);
    process.exit(1);
  });
