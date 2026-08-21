const db = require('../db');

// Player identity resolution: given a raw name string extracted for a
// team, decide whether it's an existing player (by exact match, after
// normalization), a likely-but-unconfirmed existing player (fuzzy match,
// never auto-linked -- see resolvePlayerName below), or a genuinely new
// person. Jersey number plays no role anywhere in this file -- real data
// (schema.sql's own comment on player_name_aliases) shows it drifting
// game-to-game under a name that's otherwise a confirmed match, so it
// can't be trusted even as a secondary signal here.

function normalizeName(name) {
  return (name || '')
    .replace(/\s*\(C\)\s*$/i, '') // strip trailing captain marker
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

// Same three heuristics the investigation round's ad-hoc script used
// (close overall edit distance; same surname with a close/prefix first
// name -- nicknames and abbreviations; near-reversed two-token order,
// tolerating a typo in either token). Returns a human-readable reason for
// player_identity_review.match_reason, or null if no heuristic fires.
function fuzzyMatchReason(a, b) {
  if (a === b) return null; // exact match is handled separately, before this is ever called
  const aTok = a.split(' ');
  const bTok = b.split(' ');
  const maxLen = Math.max(a.length, b.length);
  const dist = levenshtein(a, b);
  if (dist <= 3 && dist / maxLen < 0.25) {
    return `close overall spelling (edit distance ${dist})`;
  }
  if (aTok.length && bTok.length && aTok[aTok.length - 1] === bTok[bTok.length - 1]) {
    const f1 = aTok[0];
    const f2 = bTok[0];
    if (f1 !== f2 && (f1.startsWith(f2) || f2.startsWith(f1) || levenshtein(f1, f2) <= 2)) {
      return 'same surname, first name looks like a nickname/abbreviation';
    }
  }
  if (aTok.length === 2 && bTok.length === 2) {
    const reorderedDist = levenshtein(aTok[0], bTok[1]) + levenshtein(aTok[1], bTok[0]);
    if (reorderedDist <= 2) {
      return 'looks like the same two name tokens in reversed order';
    }
  }
  return null;
}

// Exact match (post-normalization) against any alias already on this
// team, else the closest fuzzy candidate, else none. Team-scoped -- the
// same raw string on a different team is never compared against this
// team's aliases (see schema.sql's UNIQUE (team_id, alias_text)).
async function findCandidate(teamId, rawName) {
  const normalized = normalizeName(rawName);
  const aliases = await db.prepare(
    'SELECT player_id, alias_text FROM player_name_aliases WHERE team_id = ?',
  ).all(teamId);

  for (const alias of aliases) {
    if (normalizeName(alias.alias_text) === normalized) {
      return { type: 'exact', playerId: alias.player_id };
    }
  }
  for (const alias of aliases) {
    const reason = fuzzyMatchReason(normalized, normalizeName(alias.alias_text));
    if (reason) {
      return { type: 'fuzzy', candidatePlayerId: alias.player_id, reason };
    }
  }
  return { type: 'none' };
}

// The single entry point every insertion site calls. gameId/reportType
// are provenance only (player_name_aliases.first_seen_game_id / _report_type,
// player_identity_review.first_seen_game_id / _report_type) -- never used
// in the matching decision itself. Returns:
//   { status: 'linked', playerId }        -- exact match, alias recorded
//   { status: 'pending_review', reviewId } -- fuzzy match, awaiting a human
//   { status: 'created', playerId }        -- no match, new canonical player
//   { status: 'skipped' }                  -- blank name, nothing to do
async function resolvePlayerName({ teamId, name, gameId = null, reportType = null }) {
  if (!name || !name.trim()) {
    return { status: 'skipped' };
  }

  const candidate = await findCandidate(teamId, name);

  if (candidate.type === 'exact') {
    // Records this exact raw string as its own alias row too, if it isn't
    // already stored verbatim -- covers e.g. a new "(C)" suffix variant
    // that normalizes the same as an existing alias but isn't byte-
    // identical to it, so future exact-string lookups stay fast without
    // re-normalizing every alias every time.
    await db.prepare(`
      INSERT INTO player_name_aliases (player_id, team_id, alias_text, first_seen_game_id, first_seen_report_type)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (team_id, alias_text) DO NOTHING
    `).run(candidate.playerId, teamId, name, gameId, reportType);
    return { status: 'linked', playerId: candidate.playerId };
  }

  if (candidate.type === 'fuzzy') {
    // The partial unique index (player_identity_review_pending_unique)
    // would also catch this at the DB level, but checking first avoids a
    // thrown/caught constraint violation on the (very common) case of the
    // same name repeating across several games before anyone reviews it.
    const existingPending = await db.prepare(`
      SELECT id FROM player_identity_review WHERE team_id = ? AND candidate_text = ? AND status = 'pending'
    `).get(teamId, name);
    if (existingPending) {
      return { status: 'pending_review', reviewId: existingPending.id };
    }
    const inserted = await db.prepare(`
      INSERT INTO player_identity_review (team_id, candidate_text, candidate_player_id, match_reason, first_seen_game_id, first_seen_report_type)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id
    `).get(teamId, name, candidate.candidatePlayerId, candidate.reason, gameId, reportType);
    return { status: 'pending_review', reviewId: inserted.id };
  }

  const newPlayer = await db.prepare(
    'INSERT INTO players (team_id, full_name) VALUES (?, ?) RETURNING id',
  ).get(teamId, name.trim());
  await db.prepare(`
    INSERT INTO player_name_aliases (player_id, team_id, alias_text, first_seen_game_id, first_seen_report_type)
    VALUES (?, ?, ?, ?, ?)
  `).run(newPlayer.id, teamId, name, gameId, reportType);
  return { status: 'created', playerId: newPlayer.id };
}

// Confirm: the pending candidate really is candidate_player_id, under a
// new spelling -- link it as an alias, same effect an exact match would
// have had. Reject: they're not the same person -- create candidate_text
// as its own new canonical player, identical to what a no-match would
// have done at ingestion time. Both no-op (return null) on an already-
// resolved or nonexistent review, so a double-click can't double-process.
async function confirmReview(reviewId, reviewedByUserId) {
  const review = await db.prepare(
    `SELECT * FROM player_identity_review WHERE id = ? AND status = 'pending'`,
  ).get(reviewId);
  if (!review) return null;

  await db.prepare(`
    INSERT INTO player_name_aliases (player_id, team_id, alias_text, first_seen_game_id, first_seen_report_type)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (team_id, alias_text) DO NOTHING
  `).run(review.candidate_player_id, review.team_id, review.candidate_text, review.first_seen_game_id, review.first_seen_report_type);
  await db.prepare(
    `UPDATE player_identity_review SET status = 'confirmed', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
  ).run(reviewedByUserId, reviewId);

  return { playerId: review.candidate_player_id };
}

async function rejectReview(reviewId, reviewedByUserId) {
  const review = await db.prepare(
    `SELECT * FROM player_identity_review WHERE id = ? AND status = 'pending'`,
  ).get(reviewId);
  if (!review) return null;

  const newPlayer = await db.prepare(
    'INSERT INTO players (team_id, full_name) VALUES (?, ?) RETURNING id',
  ).get(review.team_id, review.candidate_text.trim());
  await db.prepare(`
    INSERT INTO player_name_aliases (player_id, team_id, alias_text, first_seen_game_id, first_seen_report_type)
    VALUES (?, ?, ?, ?, ?)
  `).run(newPlayer.id, review.team_id, review.candidate_text, review.first_seen_game_id, review.first_seen_report_type);
  await db.prepare(
    `UPDATE player_identity_review SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
  ).run(reviewedByUserId, reviewId);

  return { playerId: newPlayer.id };
}

module.exports = { normalizeName, resolvePlayerName, confirmReview, rejectReview, findCandidate };
