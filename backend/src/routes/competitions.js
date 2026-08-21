const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Real competition CRUD against the `competitions` table (schema.sql),
// renamed from `leagues` -- the old name was actively wrong once this
// entity also covers Friendlies and Tournaments, which are not leagues.
// A competition is a persistent, reusable entity now (a season links
// into one via team_competition_seasons, rather than a competition
// belonging to exactly one season by construction) -- `type` is the
// fixed small set this project actually distinguishes (league_tier,
// custom_recurring, friendly, tournament); `recurring` is primarily
// meaningful for custom_recurring (a custom-named competition marked as
// one that comes back). `category` (e.g. "Men") is a different axis from
// `type` and is unchanged by this rename. `name` stays free text, not a
// constrained enum -- "Premier Division"/"Division One"/"Division Two"
// are UI-offered presets for the league_tier type (see PRESET_NAMES),
// not a hardcoded restriction on what any competition can be named.
const TYPES = ['league_tier', 'custom_recurring', 'friendly', 'tournament'];

// Quick-select convenience for the league_tier type only -- typing any
// other name is still fully supported (see the "not a constrained enum"
// note above). Exported so the frontend doesn't need to hardcode its own
// copy of this list.
const PRESET_NAMES = ['Premier Division', 'Division One', 'Division Two'];

router.get('/presets', (req, res) => {
  res.json({ types: TYPES, leagueTierNames: PRESET_NAMES });
});

// List every real competition.
router.get('/', async (req, res) => {
  try {
    const competitions = await db.prepare(
      'SELECT id, name, category, type, recurring, description FROM competitions ORDER BY name',
    ).all();
    res.json(competitions);
  } catch (err) {
    console.error('list competitions failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create a competition. Only `name` and `type` are required -- category/
// description are optional, recurring defaults to false. Statistician-
// only, no Team Manager fallback -- same reasoning as seasons.js:
// competition/season administration is grouped with the rest of the
// analysis-pipeline-adjacent technical work, not roster (players.js,
// shared) or team brand (teams.js, Team Manager only).
router.post('/', requireRole('Statistician'), async (req, res) => {
  try {
    const { name, category, type, recurring, description } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${TYPES.join(', ')}` });
    }

    const competition = await db.prepare(`
      INSERT INTO competitions (name, category, type, recurring, description)
      VALUES (?, ?, ?, ?, ?)
      RETURNING id, name, category, type, recurring, description
    `).get(name.trim(), category || null, type, Boolean(recurring), description || null);

    res.status(201).json(competition);
  } catch (err) {
    console.error('create competition failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Remove a competition -- blocked if any real game or team-competition-
// season membership still references it, so a delete can never silently
// orphan a real game record or a real trajectory fact
// (team_competition_seasons, backend/src/routes/teamCompetitionSeasons.js).
router.delete('/:id', requireRole('Statistician'), async (req, res) => {
  try {
    const { id } = req.params;

    const referencingGames = await db.prepare('SELECT COUNT(*) AS count FROM games WHERE competition_id = ?').get(id);
    if (Number(referencingGames.count) > 0) {
      return res.status(409).json({ error: `Cannot delete competition: ${referencingGames.count} real game(s) reference it` });
    }
    const referencingMemberships = await db.prepare('SELECT COUNT(*) AS count FROM team_competition_seasons WHERE competition_id = ?').get(id);
    if (Number(referencingMemberships.count) > 0) {
      return res.status(409).json({ error: `Cannot delete competition: ${referencingMemberships.count} team-season membership(s) reference it` });
    }

    const result = await db.prepare('DELETE FROM competitions WHERE id = ?').run(id);
    if (!result.changes) {
      return res.status(404).json({ error: 'Competition not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('remove competition failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
