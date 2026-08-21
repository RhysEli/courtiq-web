const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Real league/competition CRUD against the `leagues` table (schema.sql),
// which existed but was only ever reachable through
// backend/src/db/seed.js's one hardcoded row -- there was no route to
// create/list/remove a league directly. League config was otherwise
// localStorage-only (src/pages/leagues-management.jsx wrote to
// 'courtiq-leagues' and never touched the backend), same as roster
// assignment and season config before the players.js/seasons.js fixes.
//
// Unlike `seasons` (TEXT PK, client-supplied id), `leagues.id` is a
// SERIAL surrogate key -- the caller never supplies it.

// List every real league.
router.get('/', async (req, res) => {
  try {
    const leagues = await db.prepare('SELECT id, name, category, season, description FROM leagues ORDER BY name').all();
    res.json(leagues);
  } catch (err) {
    console.error('list leagues failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create a league. Only `name` is NOT NULL on the real table --
// category/season/description are all nullable, so only `name` is
// required here. Statistician-only, no Team Manager fallback -- same
// reasoning as seasons.js.
router.post('/', requireRole('Statistician'), async (req, res) => {
  try {
    const { name, category, season, description } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const league = await db.prepare(`
      INSERT INTO leagues (name, category, season, description)
      VALUES (?, ?, ?, ?)
      RETURNING id, name, category, season, description
    `).get(name.trim(), category || null, season || null, description || null);

    res.status(201).json(league);
  } catch (err) {
    console.error('create league failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Remove a league -- blocked if any real game still references it, so a
// delete can never silently orphan or cascade-wipe real game records.
router.delete('/:id', requireRole('Statistician'), async (req, res) => {
  try {
    const { id } = req.params;

    const referencingGames = await db.prepare('SELECT COUNT(*) AS count FROM games WHERE league_id = ?').get(id);
    if (Number(referencingGames.count) > 0) {
      return res.status(409).json({ error: `Cannot delete league: ${referencingGames.count} real game(s) reference it` });
    }

    const result = await db.prepare('DELETE FROM leagues WHERE id = ?').run(id);
    if (!result.changes) {
      return res.status(404).json({ error: 'League not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('remove league failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
