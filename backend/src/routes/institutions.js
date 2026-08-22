const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Real institution CRUD against the `institutions` table (schema.sql),
// which existed but was only ever reachable through the one seed row
// ('usiu') -- institutions.jsx was 100% localStorage
// (managementService.js's INSTITUTION_STORAGE_KEY), including a
// "Teams (comma separated)" free-text field that was never a real
// relationship to anything. That field is dropped entirely here: a
// team's institution membership is real now (teams.institution_id, a
// real FK -- see the extended PATCH /api/teams/:teamId), so an
// institution's team list is derived by filtering the existing
// GET /api/teams response, not stored or edited here. See
// src/pages/institutions.jsx for where that filtering happens.
//
// Statistician-only, no Team Manager fallback -- same reasoning as
// seasons.js/competitions.js/teamCompetitionSeasons.js: this is
// organizational structure, not technical work tied to a team a Team
// Manager already belongs to (the actual condition
// requireStatisticianOrFallback/middleware's teamHasActiveStatistician
// checks). An institution isn't owned by any single team the way a game
// or a roster is -- there's no principled "does this institution have a
// Statistician" fallback check to hinge on, so it gets the same
// no-fallback treatment as every other structural/administrative entity
// in this codebase.

function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'institution';
}

// List every real institution.
router.get('/', async (req, res) => {
  try {
    const institutions = await db.prepare('SELECT id, name, location FROM institutions ORDER BY name').all();
    res.json(institutions);
  } catch (err) {
    console.error('list institutions failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create an institution. `id` is server-derived from `name` (slugified,
// deduped on conflict) rather than client-supplied -- unlike seasons.js
// (where the id IS the human-meaningful label, e.g. "2026/27"), an
// institution's id was never something a user typed; the old mock's
// createInstitution() just stamped `institution-${Date.now()}`. Slugging
// the real name keeps ids readable (matches the existing 'usiu' seed row)
// without asking the form for one more field.
router.post('/', requireRole('Statistician'), async (req, res) => {
  try {
    const { name, location } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    let id = slugify(name);
    let suffix = 2;
    while (await db.prepare('SELECT id FROM institutions WHERE id = ?').get(id)) {
      id = `${slugify(name)}-${suffix}`;
      suffix += 1;
    }

    const institution = await db.prepare(`
      INSERT INTO institutions (id, name, location)
      VALUES (?, ?, ?)
      RETURNING id, name, location
    `).get(id, name.trim(), location?.trim() || null);

    res.status(201).json(institution);
  } catch (err) {
    console.error('create institution failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Remove an institution -- blocked if any real team still points to it
// (teams.institution_id), so a delete can never silently orphan a real
// team's institution reference. No frontend delete action wired up yet
// (the old mock UI never had one either), but built for CRUD parity with
// seasons.js/competitions.js.
router.delete('/:id', requireRole('Statistician'), async (req, res) => {
  try {
    const { id } = req.params;

    const referencingTeams = await db.prepare('SELECT COUNT(*) AS count FROM teams WHERE institution_id = ?').get(id);
    if (Number(referencingTeams.count) > 0) {
      return res.status(409).json({ error: `Cannot delete institution: ${referencingTeams.count} real team(s) reference it` });
    }

    const result = await db.prepare('DELETE FROM institutions WHERE id = ?').run(id);
    if (!result.changes) {
      return res.status(404).json({ error: 'Institution not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('remove institution failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
