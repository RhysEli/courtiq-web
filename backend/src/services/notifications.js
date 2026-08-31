const db = require('../db');

// Step 58: real per-user notifications, generated inline at the point each
// real event happens -- same real "inline, not a background process"
// approach auditLog.js's logAction already uses in this codebase (Step 56
// investigation's own recommendation, confirmed Step 57). A failure to
// WRITE a notification must never break the real action that triggered it
// (a coach shouldn't lose a real game narrative because a notification
// insert hit a fluke), so every failure here is swallowed and just logged
// to the console, exactly matching logAction's own resilience contract.
async function createNotification({
  recipientUserId, type, message, gameId = null, reportId = null, playerIdentityReviewId = null,
}) {
  try {
    await db.prepare(`
      INSERT INTO notifications (recipient_user_id, type, message, game_id, report_id, player_identity_review_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(recipientUserId, type, message, gameId, reportId, playerIdentityReviewId);
  } catch (err) {
    console.error('notification write failed:', err);
  }
}

// Shared real-recipient resolution, reused by every trigger rather than
// each one re-deriving "who's on this team" independently. teamIds may
// include duplicates (e.g. a game's home and opponent team could resolve
// to overlapping staff on a multi-team account) -- DISTINCT ON user_id
// below de-dupes so nobody gets two rows for the same real event.
//
// roles is optional: omitted (or empty) returns every real member of the
// given team(s), matching the "notify everyone on the team" shape the
// game-analyzed trigger needs; passed, it narrows to just those real
// roles, matching the "Statistician/Team Manager only" shape the
// player-identity-review trigger needs -- the exact same real gating its
// own confirm/reject routes already enforce (requireRole('Statistician',
// 'Team Manager')), not a new access rule invented for notifications.
//
// excludeUserId drops the real actor who caused the event, when there is
// one -- the game-analyzed trigger has a real req.user.id to exclude
// (they already know they just ran it); the player-identity-review
// trigger has no single reliable "acting user" (resolvePlayerName is
// called from bulk import, single-report upload, manual roster add,
// invite acceptance, and a one-time backfill script -- several of those
// have no real req.user at all), so it's called with no excludeUserId.
//
// Same resilience contract as createNotification above -- a real caller
// (analysis.js's /narrative route, resolvePlayerName) must never fail
// because notification RESOLUTION broke, any more than because the
// notification WRITE broke. Swallowed here too, returning [] rather than
// throwing, so nothing downstream needs its own try/catch around this.
async function resolveTeamRecipients(teamIds, { excludeUserId = null, roles = null } = {}) {
  const ids = [...new Set((teamIds || []).filter(Boolean))];
  if (ids.length === 0) return [];

  try {
    let sql = `
      SELECT DISTINCT u.id
      FROM user_teams ut
      JOIN users u ON u.id = ut.user_id
      WHERE ut.team_id = ANY(?)
    `;
    const params = [ids];

    if (roles && roles.length > 0) {
      sql += ' AND u.role = ANY(?)';
      params.push(roles);
    }
    if (excludeUserId != null) {
      sql += ' AND u.id != ?';
      params.push(excludeUserId);
    }

    const rows = await db.prepare(sql).all(...params);
    return rows.map((r) => r.id);
  } catch (err) {
    console.error('notification recipient resolution failed:', err);
    return [];
  }
}

module.exports = { createNotification, resolveTeamRecipients };
