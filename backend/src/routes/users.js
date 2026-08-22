const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, requireSharedTeamWithUser } = require('../middleware/auth');
const { imageUpload, uploadImage } = require('../services/imageUpload');
const { sendMail } = require('../services/mailer');

const RESET_TOKEN_EXPIRY_HOURS = 1;

// Adapts invites.js's buildInviteEmail wording rather than sharing a
// forced abstraction with it -- the two emails' actual content differs
// enough (team/role/institution vs. none of that) that a shared builder
// would mostly just be optional-parameter plumbing, not real
// de-duplication. Same terse structure/tone instead.
function buildPasswordResetEmail({ appUrl, token, name }) {
  const resetUrl = `${appUrl}/reset-password/${token}`;
  const subject = 'Reset your CourtIQ password';
  const html = `
    <p>Hi ${name},</p>
    <p>A staff member has triggered a password reset for your CourtIQ account.</p>
    <p><a href="${resetUrl}">Click here to set a new password</a></p>
    <p>This link expires in ${RESET_TOKEN_EXPIRY_HOURS} hour${RESET_TOKEN_EXPIRY_HOURS === 1 ? '' : 's'}. If you weren't expecting this, you can ignore this email -- your password won't change unless you open the link and set a new one.</p>
  `;
  const text = `A staff member has triggered a password reset for your CourtIQ account. Set a new password here: ${resetUrl} (expires in ${RESET_TOKEN_EXPIRY_HOURS} hour${RESET_TOKEN_EXPIRY_HOURS === 1 ? '' : 's'}.)`;
  return { subject, html, text };
}

const router = express.Router();
router.use(requireAuth);

// Visual overhaul step 2: personal preference (theme_mode/accent_override
// on `users`). Deliberately no requireRole here -- unlike team-brand
// config (Team Manager only) or a future photo-upload feature, ANY
// authenticated user manages their own preferences. Scoped to req.user.id
// from the JWT (not a route param), so there's no cross-user surface to
// even gate -- a user can only ever read/write their own row.

// accent_override is personal-only (never overrides team brand for anyone
// else, see src/theme/applyTheme.js), so unlike team brand colors it isn't
// enum-constrained -- just format-validated as a #rrggbb hex string,
// matching schema.sql's CHECK constraint on the column (also deliberately
// case-insensitive there, same reasoning as the /i flag here).
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
const THEME_MODES = ['light', 'dark', 'auto'];

// Matches the Users page's own role dropdown.
const ASSIGNABLE_ROLES = ['Team Manager', 'Statistician', 'Coach', 'Athlete'];

// Access-granting stays shared between Statistician and Team Manager --
// inviting, role/team assignment, activate/deactivate, password reset.
// Matches invites.js's ROLES_THAT_CAN_INVITE.
const STAFF_ROLES = ['Statistician', 'Team Manager'];

// Real staff-facing user directory -- users.jsx was entirely localStorage
// ('courtiq-users') before this, never touching the real `users` table at
// all. Same "still on the old mock" gap teams.jsx/players-management.jsx
// had before their own earlier real-backend passes; this closes it for
// Users so staff-curated player/user photos (a separate, later change)
// have real rows to attach to.
//
// Team-scoped, same as roster management: a Statistician/Team Manager
// only sees users who share at least one real team with them (not "all
// teams" -- see requireSharedTeamWithUser), not every user in the
// system. There's no single :teamId param on this route to hand
// requireTeamAccess (this lists across teams, not within one), so the
// filter happens here instead, after loading each user's real teams.
router.get('/', requireRole(...STAFF_ROLES), async (req, res) => {
  try {
    const users = await db.prepare(`
      SELECT id, name, email, role, photo_url, is_active, created_at
      FROM users
      ORDER BY name
    `).all();

    const teamRows = await db.prepare(`
      SELECT ut.user_id, t.id AS team_id, t.name AS team_name
      FROM user_teams ut
      JOIN teams t ON t.id = ut.team_id
    `).all();
    const teamsByUser = {};
    for (const row of teamRows) {
      (teamsByUser[row.user_id] ||= []).push({ id: row.team_id, name: row.team_name });
    }

    const myTeamIds = req.user.teamIds || [];
    const visibleUsers = users.filter((u) => (teamsByUser[u.id] || []).some((t) => myTeamIds.includes(t.id)));

    res.json(visibleUsers.map((u) => ({ ...u, teams: teamsByUser[u.id] || [] })));
  } catch (err) {
    console.error('list users failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Edit an existing user's role/team/active-status -- staff-only
// (STAFF_ROLES, see above), team-scoped via requireSharedTeamWithUser:
// the caller must share at least one real team with the TARGET user,
// matching how player/roster management is already scoped by
// requireTeamAccess. Partial update: role, teamId, and isActive are all
// independently optional.
//
// Team reassignment REPLACES this user's user_teams membership with the
// one selected team, rather than an add/remove-multiple-teams flow --
// matches the (mock) page's own single "Team" field UX. A user covering
// multiple teams (schema.sql's own example: a Statistician on both the
// Men's and Women's side) would need real multi-team management UI to
// set up correctly here -- a bigger feature than this migration covers,
// flagged rather than half-built.
router.patch('/:userId', requireRole(...STAFF_ROLES), requireSharedTeamWithUser('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const existing = await db.prepare('SELECT id, role, is_active FROM users WHERE id = ?').get(userId);
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { role = existing.role, teamId, isActive = existing.is_active } = req.body;
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${ASSIGNABLE_ROLES.join(', ')}` });
    }
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean' });
    }
    if (teamId !== undefined) {
      const team = await db.prepare('SELECT id FROM teams WHERE id = ?').get(teamId);
      if (!team) {
        return res.status(400).json({ error: 'teamId does not match a real team' });
      }
      // requireSharedTeamWithUser above only checked the target's CURRENT
      // team(s) -- without this, a Statistician/Team Manager could move a
      // user they do share a team with onto a team they have no
      // relationship to at all, reaching outside their own scope via the
      // destination rather than the target.
      if (!(req.user.teamIds || []).includes(teamId)) {
        return res.status(403).json({ error: 'You do not have access to that team' });
      }
    }

    await db.prepare('UPDATE users SET role = ?, is_active = ? WHERE id = ?').run(role, isActive, userId);

    if (teamId !== undefined) {
      await db.prepare('DELETE FROM user_teams WHERE user_id = ?').run(userId);
      await db.prepare('INSERT INTO user_teams (user_id, team_id) VALUES (?, ?) ON CONFLICT DO NOTHING').run(userId, teamId);
      // users.team_id is legacy (see schema.sql -- user_teams is the real
      // source of truth), but kept in sync here rather than left to
      // silently diverge from user_teams forever.
      await db.prepare('UPDATE users SET team_id = ? WHERE id = ?').run(teamId, userId);
    }

    const updated = await db.prepare('SELECT id, name, email, role, photo_url, is_active FROM users WHERE id = ?').get(userId);
    const teams = await db.prepare(`
      SELECT t.id, t.name FROM user_teams ut JOIN teams t ON t.id = ut.team_id WHERE ut.user_id = ?
    `).all(userId);

    res.json({ ...updated, teams });
  } catch (err) {
    console.error('update user failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add a team membership without touching any existing ones -- unlike
// PATCH /:userId's own teamId field just above, which REPLACES a user's
// entire team list (delete-then-insert-one, matching users.jsx's
// single-select "Team" column), this is additive. Flagged back in Step 6
// as a real gap: a Statistician genuinely covering several teams had no
// way to be granted a second one without raw SQL -- PATCH /:userId's
// replace semantics would just swap one team for another, never add.
// Kept as a separate endpoint rather than reworked into PATCH /:userId
// itself: that route's teamId field is real, in-use UI (the Team column
// dropdown) with REPLACE semantics staff already expect from it --
// changing what selecting a team there does, or overloading the same
// field with two different meanings, would be a worse outcome than one
// more small, single-purpose route. Same dual check as PATCH /:userId's
// destination-team logic: requireSharedTeamWithUser (below) covers the
// target's current team(s); accessibleTeamIds covers the team being
// granted.
router.post('/:userId/teams', requireRole(...STAFF_ROLES), requireSharedTeamWithUser('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { teamId } = req.body;
    if (!teamId) {
      return res.status(400).json({ error: 'teamId is required' });
    }

    const team = await db.prepare('SELECT id FROM teams WHERE id = ?').get(teamId);
    if (!team) {
      return res.status(400).json({ error: 'teamId does not match a real team' });
    }
    if (!(req.user.teamIds || []).includes(teamId)) {
      return res.status(403).json({ error: 'You do not have access to that team' });
    }

    const alreadyOnTeam = await db.prepare('SELECT 1 FROM user_teams WHERE user_id = ? AND team_id = ?').get(userId, teamId);
    if (alreadyOnTeam) {
      return res.status(409).json({ error: 'This user is already on that team' });
    }

    await db.prepare('INSERT INTO user_teams (user_id, team_id) VALUES (?, ?) ON CONFLICT DO NOTHING').run(userId, teamId);

    const teams = await db.prepare(`
      SELECT t.id, t.name FROM user_teams ut JOIN teams t ON t.id = ut.team_id WHERE ut.user_id = ?
    `).all(userId);
    res.status(201).json({ userId: Number(userId), teams });
  } catch (err) {
    console.error('add user team failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Remove one specific team membership, leaving any others untouched --
// the symmetric counterpart to POST /:userId/teams above (e.g. revoking
// access to just one of a Statistician's several teams). Blocked if this
// would leave the user with zero teams: Step 6 made "every user has at
// least one team" a real, DB-enforced guarantee (users.team_id NOT NULL)
// specifically so a teamless user can't exist -- user_teams itself has
// no such constraint directly, so it's enforced here instead. Keeps the
// legacy users.team_id column pointed at a real remaining membership if
// the removed team happened to be the one it referenced -- that column
// is write-only today (nothing reads it back, confirmed by grep), but
// leaving it pointing at a team the user is no longer actually on would
// still be a stale lie sitting in the data for no reason.
router.delete('/:userId/teams/:teamId', requireRole(...STAFF_ROLES), requireSharedTeamWithUser('userId'), async (req, res) => {
  try {
    const { userId, teamId } = req.params;

    const memberships = await db.prepare('SELECT team_id FROM user_teams WHERE user_id = ?').all(userId);
    if (!memberships.some((m) => m.team_id === teamId)) {
      return res.status(404).json({ error: 'Membership not found' });
    }
    if (memberships.length <= 1) {
      return res.status(409).json({ error: "Cannot remove a user's only team -- every user must have at least one" });
    }

    await db.prepare('DELETE FROM user_teams WHERE user_id = ? AND team_id = ?').run(userId, teamId);

    const legacyTeamId = await db.prepare('SELECT team_id FROM users WHERE id = ?').get(userId);
    if (legacyTeamId.team_id === teamId) {
      const remaining = await db.prepare('SELECT team_id FROM user_teams WHERE user_id = ? LIMIT 1').get(userId);
      await db.prepare('UPDATE users SET team_id = ? WHERE id = ?').run(remaining.team_id, userId);
    }

    const teams = await db.prepare(`
      SELECT t.id, t.name FROM user_teams ut JOIN teams t ON t.id = ut.team_id WHERE ut.user_id = ?
    `).all(userId);
    res.json({ userId: Number(userId), teams });
  } catch (err) {
    console.error('remove user team failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Staff-curated user photo -- same STAFF_ROLES gating and same team
// scoping (requireSharedTeamWithUser) as the role/team PATCH above: a
// Statistician/Team Manager can only upload a photo for a user they
// share a real team with. Applies to every role, including the
// uploader's own row (if they happen to share a team with themselves,
// which they always do) -- there is no separate "upload my own photo"
// self-service path anywhere (profile.jsx doesn't get one), by design:
// staff curate every photo, including their own.
router.patch('/:userId/photo', requireRole(...STAFF_ROLES), requireSharedTeamWithUser('userId'), imageUpload.single('photo'), async (req, res) => {
  try {
    const { userId } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: 'No photo file uploaded (expected multipart field "photo")' });
    }

    const existing = await db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const photoUrl = await uploadImage({
      entityType: 'user-photos',
      entityId: userId,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
    });

    const user = await db.prepare(
      'UPDATE users SET photo_url = ? WHERE id = ? RETURNING id, name, email, role, photo_url',
    ).get(photoUrl, userId);

    res.json(user);
  } catch (err) {
    console.error('user photo upload failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Staff-triggered password reset -- same STAFF_ROLES gating and same
// team scoping (requireSharedTeamWithUser) as every other user route
// above. Generates a token, invalidates (deletes) any previous unused
// token for this user first so there's never more than one live reset
// link, emails it via the same sendMail() invites.js already uses. Does
// NOT touch the account's password itself -- that only happens when the
// link is actually followed, see the public POST /reset-password/:token
// below (backend/src/routes/passwordReset.js).
router.post('/:userId/reset-password', requireRole(...STAFF_ROLES), requireSharedTeamWithUser('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { appUrl } = req.body;
    const user = await db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? AND consumed_at IS NULL').run(userId);

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
    await db.prepare(`
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES (?, ?, ?)
    `).run(userId, token, expiresAt);

    const { subject, html, text } = buildPasswordResetEmail({
      appUrl: appUrl || 'https://courtiq-web-1.onrender.com',
      token, name: user.name,
    });

    try {
      await sendMail({ to: user.email, subject, html, text });
    } catch (mailErr) {
      // Same fallback shape as invites.js's /send -- the token still
      // exists and is still usable even if the email itself failed, so
      // the frontend can offer a "copy link" fallback.
      return res.status(201).json({ ok: true, token, emailSent: false, emailError: mailErr.message });
    }

    res.status(201).json({ ok: true, token, emailSent: true });
  } catch (err) {
    console.error('trigger password reset failed:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/me/preferences', async (req, res) => {
  try {
    const user = await db.prepare('SELECT theme_mode, accent_override FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('get my preferences failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Partial update: a field omitted from the body keeps its current value.
// accentOverride: null explicitly clears the override (falls back to the
// team's brand_accent) -- distinct from omitting the field entirely.
router.patch('/me/preferences', async (req, res) => {
  try {
    const existing = await db.prepare('SELECT theme_mode, accent_override FROM users WHERE id = ?').get(req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const {
      themeMode = existing.theme_mode,
      accentOverride = existing.accent_override,
    } = req.body;

    if (!THEME_MODES.includes(themeMode)) {
      return res.status(400).json({ error: `themeMode must be one of: ${THEME_MODES.join(', ')}` });
    }
    if (accentOverride !== null && !HEX_COLOR_RE.test(accentOverride)) {
      return res.status(400).json({ error: 'accentOverride must be a #rrggbb hex color, or null' });
    }

    const updated = await db.prepare(`
      UPDATE users SET theme_mode = ?, accent_override = ? WHERE id = ?
      RETURNING theme_mode, accent_override
    `).get(themeMode, accentOverride, req.user.id);

    res.json(updated);
  } catch (err) {
    console.error('update my preferences failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
