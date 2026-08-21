const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Real season CRUD against the `seasons` table (schema.sql), which
// existed but was only ever reachable through backend/src/db/seed.js's
// hardcoded rows and bulkImport.js's find-or-create-on-import path --
// there was no route to create/list/remove a season directly. Season
// config was otherwise localStorage-only (src/pages/seasons-management.jsx
// wrote to 'courtiq-seasons' and never touched the backend), same as
// roster assignment before the players.js fix.

// List every real season.
router.get('/', async (req, res) => {
  try {
    const seasons = await db.prepare('SELECT id, name, active FROM seasons ORDER BY id').all();
    res.json(seasons);
  } catch (err) {
    console.error('list seasons failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create a season. `id` is client-supplied (seasons are TEXT-PK'd by a
// human-readable label like "2026/27", matching the convention already
// used by seed.js and bulkImport.js's find-or-create path), not a
// generated surrogate key. Statistician-only, no Team Manager fallback --
// season/league administration is grouped with the rest of the
// analysis-pipeline-adjacent technical work, not Team Manager's roster/
// brand "managing" scope.
router.post('/', requireRole('Statistician'), async (req, res) => {
  try {
    const { id, name, active } = req.body;
    if (!id?.trim() || !name?.trim()) {
      return res.status(400).json({ error: 'id and name are required' });
    }

    const existing = await db.prepare('SELECT id FROM seasons WHERE id = ?').get(id.trim());
    if (existing) {
      return res.status(409).json({ error: `A season with id '${id.trim()}' already exists` });
    }

    const season = await db.prepare(`
      INSERT INTO seasons (id, name, active)
      VALUES (?, ?, ?)
      RETURNING id, name, active
    `).get(id.trim(), name.trim(), active ? 1 : 0);

    res.status(201).json(season);
  } catch (err) {
    console.error('create season failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Remove a season -- blocked if any real game still references it, so a
// delete can never silently orphan or cascade-wipe real game records.
router.delete('/:id', requireRole('Statistician'), async (req, res) => {
  try {
    const { id } = req.params;

    const referencingGames = await db.prepare('SELECT COUNT(*) AS count FROM games WHERE season_id = ?').get(id);
    if (Number(referencingGames.count) > 0) {
      return res.status(409).json({ error: `Cannot delete season: ${referencingGames.count} real game(s) reference it` });
    }

    const result = await db.prepare('DELETE FROM seasons WHERE id = ?').run(id);
    if (!result.changes) {
      return res.status(404).json({ error: 'Season not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('remove season failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
