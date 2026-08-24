const db = require('../db');

// Team identity resolution: given a raw team-name string (a PDF header,
// or something staff typed), decide whether it's an existing team (exact
// match, after normalization), a likely-but-unconfirmed existing team
// (fuzzy match, never auto-linked -- see resolveTeamName below), or a
// genuinely new team. Same three-way shape as playerIdentity.js, but
// unscoped -- see schema.sql's comment on team_name_aliases for why
// matching here isn't (and can't cleanly be) scoped the way player names
// are scoped by team_id.
//
// No first_seen_game_id/first_seen_report_type, unlike player_name_aliases/
// player_identity_review: a player's identity is resolved AFTER the game
// row already exists (it just needs stats attached), but a team has to
// exist BEFORE the game row referencing it can be inserted at all -- by
// the time team resolution runs, there is no game id yet to record.
// Rather than a column that can never actually be populated, it's simply
// not here.

function normalizeTeamName(name) {
  return (name || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

// Close overall spelling (same heuristic playerIdentity.js uses), plus one
// team-specific case player names don't have: a club-suffix pattern, e.g.
// "EAGLES" vs "EAGLES FC" / "EAGLES BASKETBALL CLUB" -- one name fully
// contained in the other. Length-gated so this doesn't fire on short,
// generic fragments.
function fuzzyMatchReason(a, b) {
  if (a === b) return null; // exact match is handled separately, before this is ever called
  const maxLen = Math.max(a.length, b.length);
  const dist = levenshtein(a, b);
  if (dist <= 3 && dist / maxLen < 0.25) {
    return `close overall spelling (edit distance ${dist})`;
  }
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) {
    return 'one name is contained within the other (e.g. a club suffix)';
  }
  return null;
}

// Exact match (post-normalization) against any known alias, else the
// closest fuzzy candidate, else none. Unscoped -- every alias in the
// system is compared, not just one team's own (see schema.sql).
async function findCandidate(rawName) {
  const normalized = normalizeTeamName(rawName);
  const aliases = await db.prepare('SELECT team_id, alias_text FROM team_name_aliases').all();

  for (const alias of aliases) {
    if (normalizeTeamName(alias.alias_text) === normalized) {
      return { type: 'exact', teamId: alias.team_id };
    }
  }
  for (const alias of aliases) {
    const reason = fuzzyMatchReason(normalized, normalizeTeamName(alias.alias_text));
    if (reason) {
      return { type: 'fuzzy', candidateTeamId: alias.team_id, reason };
    }
  }
  return { type: 'none' };
}

// Shared by resolveTeamName below and teams.js's manual create route --
// queues a fuzzy candidate for review, or returns the id of one already
// pending for this exact text (same repeat-import tolerance as
// playerIdentity.js's own pending-review dedupe).
async function queuePendingReview(name, candidate) {
  const existingPending = await db.prepare(
    `SELECT id FROM team_identity_review WHERE candidate_text = ? AND status = 'pending'`,
  ).get(name);
  if (existingPending) return existingPending.id;

  const inserted = await db.prepare(`
    INSERT INTO team_identity_review (candidate_text, candidate_team_id, match_reason)
    VALUES (?, ?, ?)
    RETURNING id
  `).get(name, candidate.candidateTeamId, candidate.reason);
  return inserted.id;
}

// The entry point bulkImport.js and games.js call in place of the old
// raw INSERT INTO teams ... ON CONFLICT (id) DO NOTHING. Returns:
//   { status: 'linked', teamId }          -- exact match, alias recorded
//   { status: 'pending_review', reviewId } -- fuzzy match, awaiting a human
//   { status: 'created', teamId }          -- no match, new team (id IS
//                                              the name, verbatim -- same
//                                              convention find-or-create
//                                              already used)
//   { status: 'skipped' }                  -- blank name, nothing to do
async function resolveTeamName({ name }) {
  if (!name || !name.trim()) {
    return { status: 'skipped' };
  }
  const trimmed = name.trim();
  const candidate = await findCandidate(trimmed);

  if (candidate.type === 'exact') {
    await db.prepare(`
      INSERT INTO team_name_aliases (team_id, alias_text) VALUES (?, ?)
      ON CONFLICT (alias_text) DO NOTHING
    `).run(candidate.teamId, trimmed);
    return { status: 'linked', teamId: candidate.teamId };
  }

  if (candidate.type === 'fuzzy') {
    const reviewId = await queuePendingReview(trimmed, candidate);
    return { status: 'pending_review', reviewId };
  }

  const id = trimmed;
  await db.prepare('INSERT INTO teams (id, name) VALUES (?, ?) ON CONFLICT (id) DO NOTHING').run(id, id);
  await db.prepare(`
    INSERT INTO team_name_aliases (team_id, alias_text) VALUES (?, ?)
    ON CONFLICT (alias_text) DO NOTHING
  `).run(id, trimmed);
  return { status: 'created', teamId: id };
}

// Confirm: candidate_text really is candidate_team_id under a new
// spelling -- links it as an alias, same effect an exact match would
// have had from here on. Reject: they're not the same team -- create
// candidate_text as its own new team, identical to what a no-match would
// have done at ingestion time. Both no-op (return null) on an already-
// resolved or nonexistent review, so a double-click can't double-process.
async function confirmReview(reviewId, reviewedByUserId) {
  const review = await db.prepare(
    `SELECT * FROM team_identity_review WHERE id = ? AND status = 'pending'`,
  ).get(reviewId);
  if (!review) return null;

  await db.prepare(`
    INSERT INTO team_name_aliases (team_id, alias_text) VALUES (?, ?)
    ON CONFLICT (alias_text) DO NOTHING
  `).run(review.candidate_team_id, review.candidate_text);
  await db.prepare(
    `UPDATE team_identity_review SET status = 'confirmed', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
  ).run(reviewedByUserId, reviewId);

  return { teamId: review.candidate_team_id };
}

async function rejectReview(reviewId, reviewedByUserId) {
  const review = await db.prepare(
    `SELECT * FROM team_identity_review WHERE id = ? AND status = 'pending'`,
  ).get(reviewId);
  if (!review) return null;

  const id = review.candidate_text.trim();
  await db.prepare('INSERT INTO teams (id, name) VALUES (?, ?) ON CONFLICT (id) DO NOTHING').run(id, id);
  await db.prepare(`
    INSERT INTO team_name_aliases (team_id, alias_text) VALUES (?, ?)
    ON CONFLICT (alias_text) DO NOTHING
  `).run(id, review.candidate_text);
  await db.prepare(
    `UPDATE team_identity_review SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
  ).run(reviewedByUserId, reviewId);

  return { teamId: id };
}

module.exports = {
  normalizeTeamName, findCandidate, queuePendingReview, resolveTeamName, confirmReview, rejectReview,
};
