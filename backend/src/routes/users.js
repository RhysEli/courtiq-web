const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { imageUpload, uploadImage } = require('../services/imageUpload');

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

// Matches the (previously mock-only) Users page's own role dropdown --
// never offers 'Administrator' as an assignable role here, even though
// the users.role CHECK constraint's superset technically allows it. That
// restriction already existed in the mock UI; carried forward as-is
// rather than deciding to newly allow staff to grant Administrator.
const ASSIGNABLE_ROLES = ['Team Manager', 'Statistician', 'Coach', 'Athlete'];

// Real staff-facing user directory -- users.jsx was entirely localStorage
// ('courtiq-users') before this, never touching the real `users` table at
// all. Same "still on the old mock" gap teams.jsx/players-management.jsx
// had before their own earlier real-backend passes; this closes it for
// Users so staff-curated player/user photos (a separate, later change)
// have real rows to attach to.
router.get('/', requireRole('Statistician', 'Team Manager'), async (req, res) => {
  try {
    const users = await db.prepare(`
      SELECT id, name, email, role, photo_url, created_at
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

    res.json(users.map((u) => ({ ...u, teams: teamsByUser[u.id] || [] })));
  } catch (err) {
    console.error('list users failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Edit an existing user's role and/or team -- staff-only, same two roles
// as every other "manage roster/team config" action in this app
// (players.js POST/DELETE, teams.js PATCH). Partial update: role and
// teamId are independently optional.
//
// Team reassignment REPLACES this user's user_teams membership with the
// one selected team, rather than an add/remove-multiple-teams flow --
// matches the (mock) page's own single "Team" field UX. A user covering
// multiple teams (schema.sql's own example: a Statistician on both the
// Men's and Women's side) would need real multi-team management UI to
// set up correctly here -- a bigger feature than this migration covers,
// flagged rather than half-built.
router.patch('/:userId', requireRole('Statistician', 'Team Manager'), async (req, res) => {
  try {
    const { userId } = req.params;
    const existing = await db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId);
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { role = existing.role, teamId } = req.body;
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${ASSIGNABLE_ROLES.join(', ')}` });
    }
    if (teamId !== undefined) {
      const team = await db.prepare('SELECT id FROM teams WHERE id = ?').get(teamId);
      if (!team) {
        return res.status(400).json({ error: 'teamId does not match a real team' });
      }
    }

    await db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);

    if (teamId !== undefined) {
      await db.prepare('DELETE FROM user_teams WHERE user_id = ?').run(userId);
      await db.prepare('INSERT INTO user_teams (user_id, team_id) VALUES (?, ?) ON CONFLICT DO NOTHING').run(userId, teamId);
      // users.team_id is legacy (see schema.sql -- user_teams is the real
      // source of truth), but kept in sync here rather than left to
      // silently diverge from user_teams forever.
      await db.prepare('UPDATE users SET team_id = ? WHERE id = ?').run(teamId, userId);
    }

    const updated = await db.prepare('SELECT id, name, email, role, photo_url FROM users WHERE id = ?').get(userId);
    const teams = await db.prepare(`
      SELECT t.id, t.name FROM user_teams ut JOIN teams t ON t.id = ut.team_id WHERE ut.user_id = ?
    `).all(userId);

    res.json({ ...updated, teams });
  } catch (err) {
    console.error('update user failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Staff-curated user photo -- same two roles as every other staff-only
// action here, and deliberately NOT scoped to "my own team's users":
// GET/PATCH /users above already let staff manage any user system-wide
// (no requireTeamAccess), so this matches that existing gating rather
// than introducing a narrower rule just for photos. Applies to every
// role, including the uploader's own row -- there is no separate "upload
// my own photo" self-service path anywhere (profile.jsx doesn't get one),
// by design: staff curate every photo, including their own.
router.patch('/:userId/photo', requireRole('Statistician', 'Team Manager'), imageUpload.single('photo'), async (req, res) => {
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
