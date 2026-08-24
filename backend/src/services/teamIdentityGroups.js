const db = require('../db');

// Additive team-identity grouping (Step 14 Phase B) -- see schema.sql's
// comment on team_identity_groups for why this exists instead of a
// physical FK merge. Infrastructure only: what queries actually consume
// this to compare/aggregate two grouped teams' stats is later work, not
// built here.

// A team with no row here is simply its own canonical identity -- the
// common case needs no query beyond noticing there's no row.
async function resolveCanonicalTeamId(teamId) {
  const row = await db.prepare(
    'SELECT canonical_team_id FROM team_identity_groups WHERE team_id = ?',
  ).get(teamId);
  return row ? row.canonical_team_id : teamId;
}

// Every id that resolves to the same canonical identity as teamId,
// including teamId/the canonical id itself -- what a comparison query
// would actually want to filter games/stats by.
async function getGroupedTeamIds(teamId) {
  const canonicalId = await resolveCanonicalTeamId(teamId);
  const rows = await db.prepare(
    'SELECT team_id FROM team_identity_groups WHERE canonical_team_id = ?',
  ).all(canonicalId);
  return [canonicalId, ...rows.map((r) => r.team_id)];
}

module.exports = { resolveCanonicalTeamId, getGroupedTeamIds };
