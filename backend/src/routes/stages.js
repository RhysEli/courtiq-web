const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, requireTeamAccess } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Stage CRUD, nested under a team's own competition-season membership
// (backend/src/routes/teamCompetitionSeasons.js), same URL-nesting shape
// that resource already uses under /api/teams. See schema.sql's comment
// on the `stages` table for why this is scoped here rather than to
// (competition, season) directly.
//
// Role gate deliberately does NOT inherit team_competition_seasons'
// Statistician-only gate -- checked explicitly, not assumed. That gate
// fits a one-time-per-season structural fact ("we play in this
// competition, this season"), set once and rarely touched again. Stages
// are the opposite: added ad-hoc, repeatedly, as games actually get
// played through a season -- the same ongoing, day-to-day nature as game
// creation itself (games.js's POST /, Statistician + Team Manager
// shared, no fallback distinction). Gating stage creation to
// Statistician-only would block a team with no Statistician from tagging
// the very games they're otherwise fully able to create -- a real
// workflow bottleneck this codebase's existing fallback machinery exists
// specifically to avoid elsewhere. So: shared, same as game creation and
// general team config, not inherited from the parent resource.

// Confirms :tcsId is real AND actually belongs to :teamId -- requireTeamAccess
// only checks the caller has access to :teamId, not that the nested
// :tcsId in the URL really is that team's own row (someone with access to
// Team A could otherwise pass a :tcsId belonging to Team B and still have
// it resolve). Returns the row, or null if it doesn't check out.
async function loadOwnTeamCompetitionSeason(teamId, tcsId) {
  return db.prepare(
    'SELECT id, team_id, competition_id, season_id FROM team_competition_seasons WHERE id = ? AND team_id = ?',
  ).get(tcsId, teamId);
}

// List a team's stages for one of its own competition-season memberships.
// No requireRole -- matches GET /:teamId/competition-seasons's own "any
// team member can view" pattern.
router.get('/:teamId/competition-seasons/:tcsId/stages', requireTeamAccess('teamId'), async (req, res) => {
  try {
    const { teamId, tcsId } = req.params;
    const tcs = await loadOwnTeamCompetitionSeason(teamId, tcsId);
    if (!tcs) {
      return res.status(404).json({ error: 'No such competition-season membership for this team' });
    }
    const stages = await db.prepare(
      'SELECT id, name, created_at FROM stages WHERE team_competition_season_id = ? ORDER BY id',
    ).all(tcsId);
    res.json(stages);
  } catch (err) {
    console.error('list stages failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add a stage. Free text, no fixed enum, no required count -- staff type
// whatever the competition actually calls this stage as the season
// unfolds ("Round 1", "First Half", "Playoffs", anything).
router.post('/:teamId/competition-seasons/:tcsId/stages', requireRole('Statistician', 'Team Manager'), requireTeamAccess('teamId'), async (req, res) => {
  try {
    const { teamId, tcsId } = req.params;
    const { name } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const tcs = await loadOwnTeamCompetitionSeason(teamId, tcsId);
    if (!tcs) {
      return res.status(404).json({ error: 'No such competition-season membership for this team' });
    }

    const stage = await db.prepare(`
      INSERT INTO stages (team_competition_season_id, name)
      VALUES (?, ?)
      RETURNING id, name, created_at
    `).get(tcsId, name.trim());

    res.status(201).json(stage);
  } catch (err) {
    console.error('create stage failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Remove a mistaken stage -- blocked if any real game already carries it,
// same orphan-prevention discipline as seasons.js/competitions.js's own
// deletes.
router.delete('/:teamId/competition-seasons/:tcsId/stages/:stageId', requireRole('Statistician', 'Team Manager'), requireTeamAccess('teamId'), async (req, res) => {
  try {
    const { teamId, tcsId, stageId } = req.params;
    const tcs = await loadOwnTeamCompetitionSeason(teamId, tcsId);
    if (!tcs) {
      return res.status(404).json({ error: 'No such competition-season membership for this team' });
    }

    const referencingGames = await db.prepare('SELECT COUNT(*) AS count FROM games WHERE stage_id = ?').get(stageId);
    if (Number(referencingGames.count) > 0) {
      return res.status(409).json({ error: `Cannot delete stage: ${referencingGames.count} real game(s) reference it` });
    }

    const result = await db.prepare(
      'DELETE FROM stages WHERE id = ? AND team_competition_season_id = ?',
    ).run(stageId, tcsId);
    if (!result.changes) {
      return res.status(404).json({ error: 'Stage not found for this competition-season membership' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('remove stage failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
