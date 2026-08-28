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
//
// cache is an optional object, keyed by team_id, that resolvePlayerName
// callers can share across many calls in the same request/loop (see its
// caller for the write-through side of this). When present, the alias
// list for a team is fetched at most once and reused; when absent,
// behavior is unchanged from before caching existed -- fetch every call.
async function findCandidate(teamId, rawName, cache) {
  const normalized = normalizeName(rawName);
  let aliases;
  if (cache) {
    if (!cache[teamId]) {
      const fetched = await db.prepare(
        'SELECT player_id, alias_text FROM player_name_aliases WHERE team_id = ?',
      ).all(teamId);
      cache[teamId] = { aliases: fetched, aliasTexts: new Set(fetched.map((a) => a.alias_text)) };
    }
    aliases = cache[teamId].aliases;
  } else {
    aliases = await db.prepare(
      'SELECT player_id, alias_text FROM player_name_aliases WHERE team_id = ?',
    ).all(teamId);
  }

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
//
// jerseyNumber/position are optional and only ever come from a manual
// roster-add (players.js) -- bulk-import/report-upload never pass them.
// They're stored on the review row itself so a fuzzy match doesn't lose
// them while it's pending; see rejectReview below for where they're
// actually applied.
//
// cache (optional) is the same per-team object findCandidate accepts.
// When a caller shares one cache object across many resolvePlayerName
// calls (e.g. all players in one bulk-import request), every alias
// insert this function performs is mirrored into the cache in the same
// call, so the very next call sees it -- matching the real sequential
// dependency (an earlier name in a loop can create an alias a later name
// in the same loop then needs to match against). The fuzzy/pending-review
// path never touches player_name_aliases, so it never touches the cache
// either -- a pending fuzzy match must never be treated as already-known.
async function resolvePlayerName({
  teamId, name, gameId = null, reportType = null, jerseyNumber = null, position = null, cache = null,
}) {
  if (!name || !name.trim()) {
    return { status: 'skipped' };
  }

  const candidate = await findCandidate(teamId, name, cache);

  if (candidate.type === 'exact') {
    // Records this exact raw string as its own alias row too, if it isn't
    // already stored verbatim -- covers e.g. a new "(C)" suffix variant
    // that normalizes the same as an existing alias but isn't byte-
    // identical to it, so future exact-string lookups stay fast without
    // re-normalizing every alias every time.
    //
    // When cache is present, cache[teamId] is guaranteed to already exist
    // here (findCandidate above always populates it before returning).
    // The insert is skipped only when this exact raw string is already in
    // the cached set -- byte-identical, matching ON CONFLICT (team_id,
    // alias_text) DO NOTHING's real uniqueness semantics exactly, not an
    // approximation of them.
    const alreadyKnownVerbatim = cache && cache[teamId].aliasTexts.has(name);
    if (!alreadyKnownVerbatim) {
      await db.prepare(`
        INSERT INTO player_name_aliases (player_id, team_id, alias_text, first_seen_game_id, first_seen_report_type)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (team_id, alias_text) DO NOTHING
      `).run(candidate.playerId, teamId, name, gameId, reportType);
      if (cache) {
        cache[teamId].aliases.push({ player_id: candidate.playerId, alias_text: name });
        cache[teamId].aliasTexts.add(name);
      }
    }
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
      // Backfills jersey_number/position onto an already-queued review if
      // it doesn't have them yet (e.g. bulk-import queued this candidate
      // first with neither, then a manual add for the same name followed)
      // -- fills a gap, never overwrites a value another submission
      // already supplied.
      if (jerseyNumber !== null || position !== null) {
        await db.prepare(`
          UPDATE player_identity_review SET jersey_number = COALESCE(jersey_number, ?), position = COALESCE(position, ?)
          WHERE id = ?
        `).run(jerseyNumber, position, existingPending.id);
      }
      return { status: 'pending_review', reviewId: existingPending.id };
    }
    const inserted = await db.prepare(`
      INSERT INTO player_identity_review (team_id, candidate_text, candidate_player_id, match_reason, first_seen_game_id, first_seen_report_type, jersey_number, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `).get(teamId, name, candidate.candidatePlayerId, candidate.reason, gameId, reportType, jerseyNumber, position);
    return { status: 'pending_review', reviewId: inserted.id };
  }

  const newPlayer = await db.prepare(
    'INSERT INTO players (team_id, full_name) VALUES (?, ?) RETURNING id',
  ).get(teamId, name.trim());
  await db.prepare(`
    INSERT INTO player_name_aliases (player_id, team_id, alias_text, first_seen_game_id, first_seen_report_type)
    VALUES (?, ?, ?, ?, ?)
  `).run(newPlayer.id, teamId, name, gameId, reportType);
  if (cache) {
    cache[teamId].aliases.push({ player_id: newPlayer.id, alias_text: name });
    cache[teamId].aliasTexts.add(name);
  }
  return { status: 'created', playerId: newPlayer.id };
}

// Confirm: the pending candidate really is candidate_player_id, under a
// new spelling -- link it as an alias, same effect an exact match would
// have had. Deliberately does NOT touch the existing player's own
// jersey_number/position, even if this review has some stored (from a
// manual add) -- that player's record may already have real data
// contributed by other imports, and one new submission's values
// shouldn't overwrite it. Reject: they're not the same person -- create
// candidate_text as its own new canonical player, identical to what a
// no-match would have done at ingestion time, but WITH this review's
// stored jersey_number/position applied (there's no existing record to
// protect here -- it's brand new). Both no-op (return null) on an
// already-resolved or nonexistent review, so a double-click can't
// double-process.
// Backfills player_id onto every player_game_stats row this review's
// candidate_text was left NULL on at insert time (bulkImport.js/
// reports.js both insert with player_id = NULL while a fuzzy match is
// pending -- see schema.sql's comment on player_game_stats.player_id).
// player_game_stats has no team_id column of its own, so team_id is
// derived the same way every other consumer in this codebase derives it:
// join to games and check team_side against home_team_id/opponent_team_id.
// Scoped to player_id IS NULL so this never overwrites a row some other,
// already-resolved candidate legitimately linked.
async function backfillPlayerIdOntoStats(teamId, candidateText, resolvedPlayerId) {
  await db.prepare(`
    UPDATE player_game_stats pgs
    SET player_id = ?
    FROM games g
    WHERE pgs.game_id = g.id
      AND pgs.player_id IS NULL
      AND pgs.player_name = ?
      AND ((pgs.team_side = 'home' AND g.home_team_id = ?) OR (pgs.team_side = 'opponent' AND g.opponent_team_id = ?))
  `).run(resolvedPlayerId, candidateText, teamId, teamId);
}

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
  await backfillPlayerIdOntoStats(review.team_id, review.candidate_text, review.candidate_player_id);

  return { playerId: review.candidate_player_id };
}

async function rejectReview(reviewId, reviewedByUserId) {
  const review = await db.prepare(
    `SELECT * FROM player_identity_review WHERE id = ? AND status = 'pending'`,
  ).get(reviewId);
  if (!review) return null;

  const newPlayer = await db.prepare(
    'INSERT INTO players (team_id, full_name, jersey_number, position) VALUES (?, ?, ?, ?) RETURNING id',
  ).get(review.team_id, review.candidate_text.trim(), review.jersey_number, review.position);
  await db.prepare(`
    INSERT INTO player_name_aliases (player_id, team_id, alias_text, first_seen_game_id, first_seen_report_type)
    VALUES (?, ?, ?, ?, ?)
  `).run(newPlayer.id, review.team_id, review.candidate_text, review.first_seen_game_id, review.first_seen_report_type);
  await db.prepare(
    `UPDATE player_identity_review SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
  ).run(reviewedByUserId, reviewId);
  await backfillPlayerIdOntoStats(review.team_id, review.candidate_text, newPlayer.id);

  return { playerId: newPlayer.id };
}

module.exports = { normalizeName, resolvePlayerName, confirmReview, rejectReview, findCandidate };
