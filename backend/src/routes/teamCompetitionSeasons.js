const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, requireTeamAccess } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// The real fact a team's promotion/relegation trajectory needs: which
// competition a team played in during a given season (schema.sql's own
// comment on team_competition_seasons explains why this is its own table
// rather than inferred from games.competition_id). Populated by explicit
// staff action, not derived.
//
// Statistician-only, no Team Manager fallback -- this is squarely
// competition/season *structure*, the same category seasons.js/
// competitions.js already gate this way, not roster data (players.js,
// shared) that Step 6/7 explicitly kept unsplit. A membership row never
// touches a player or a roster table at all; it's who's-in-which-
// competition-this-season, which is exactly what season/competition
// administration already means in this codebase.

// List a team's competition-season history. No requireRole -- matches
// GET /:teamId/players's own "any team member can view" pattern; this is
// the same read shape a later trajectory view would reuse.
router.get('/:teamId/competition-seasons', requireTeamAccess('teamId'), async (req, res) => {
  try {
    const { teamId } = req.params;
    const rows = await db.prepare(`
      SELECT tcs.id, tcs.season_id, s.name AS season_name,
             tcs.competition_id, c.name AS competition_name, c.type AS competition_type
      FROM team_competition_seasons tcs
      JOIN seasons s ON s.id = tcs.season_id
      JOIN competitions c ON c.id = tcs.competition_id
      WHERE tcs.team_id = ?
      ORDER BY s.id
    `).all(teamId);
    res.json(rows);
  } catch (err) {
    console.error('list team competition seasons failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Record a team's membership in a competition for a season.
router.post('/:teamId/competition-seasons', requireRole('Statistician'), requireTeamAccess('teamId'), async (req, res) => {
  try {
    const { teamId } = req.params;
    const { competitionId, seasonId } = req.body;
    if (!competitionId || !seasonId) {
      return res.status(400).json({ error: 'competitionId and seasonId are required' });
    }

    const competition = await db.prepare('SELECT id FROM competitions WHERE id = ?').get(competitionId);
    if (!competition) {
      return res.status(400).json({ error: 'competitionId does not match a real competition' });
    }
    const season = await db.prepare('SELECT id FROM seasons WHERE id = ?').get(seasonId);
    if (!season) {
      return res.status(400).json({ error: 'seasonId does not match a real season' });
    }

    const existing = await db.prepare(
      'SELECT id FROM team_competition_seasons WHERE team_id = ? AND competition_id = ? AND season_id = ?',
    ).get(teamId, competitionId, seasonId);
    if (existing) {
      return res.status(409).json({ error: 'This team is already recorded in this competition for this season' });
    }

    const membership = await db.prepare(`
      INSERT INTO team_competition_seasons (team_id, competition_id, season_id)
      VALUES (?, ?, ?)
      RETURNING id, team_id, competition_id, season_id
    `).get(teamId, competitionId, seasonId);

    res.status(201).json(membership);
  } catch (err) {
    console.error('create team competition season failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Remove a mistaken membership record.
router.delete('/:teamId/competition-seasons/:id', requireRole('Statistician'), requireTeamAccess('teamId'), async (req, res) => {
  try {
    const { teamId, id } = req.params;
    const result = await db.prepare(
      'DELETE FROM team_competition_seasons WHERE id = ? AND team_id = ?',
    ).run(id, teamId);
    if (!result.changes) {
      return res.status(404).json({ error: 'Membership not found for this team' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('remove team competition season failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
