const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

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
