const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, requireTeamAccess } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// FR-11: "The system shall allow Team Managers to create accounts,
// assign player rosters, and configure season/competition parameters."
// Real roster CRUD against the `players` table (schema.sql), which
// existed but was completely unused before this -- roster assignment was
// previously localStorage-only (src/pages/players-management.jsx wrote
// to 'courtiq-players' and never touched the backend).
//
// requireTeamAccess added to all three routes below -- previously only
// requireAuth (read) or requireRole (write) applied, with no check that
// the caller actually belongs to :teamId. Confirmed exploitable: logged
// in as a real Team Manager account, successfully read another team's
// real roster, added a fake player to it, and deleted a real player from
// it, all via their own valid token. See the fix commit message for the
// full repro.

// List the real roster for a team. Any team member (any role) can view
// it -- requireTeamAccess alone, no requireRole, matches how "which
// teams am I on" already works elsewhere (getUserTeams).
router.get('/:teamId/players', requireTeamAccess('teamId'), async (req, res) => {
  try {
    const { teamId } = req.params;
    const players = await db.prepare(
      'SELECT id, team_id, full_name, jersey_number, position FROM players WHERE team_id = ? ORDER BY jersey_number NULLS LAST, full_name',
    ).all(teamId);
    res.json(players);
  } catch (err) {
    console.error('list players failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add a player to a team's roster.
router.post('/:teamId/players', requireRole('Statistician', 'Team Manager'), requireTeamAccess('teamId'), async (req, res) => {
  try {
    const { teamId } = req.params;
    const { fullName, jerseyNumber, position } = req.body;
    if (!fullName?.trim()) {
      return res.status(400).json({ error: 'fullName is required' });
    }

    const player = await db.prepare(`
      INSERT INTO players (team_id, full_name, jersey_number, position)
      VALUES (?, ?, ?, ?)
      RETURNING id, team_id, full_name, jersey_number, position
    `).get(teamId, fullName.trim(), jerseyNumber || null, position || null);

    res.status(201).json(player);
  } catch (err) {
    console.error('add player failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Remove a player from a team's roster.
router.delete('/:teamId/players/:playerId', requireRole('Statistician', 'Team Manager'), requireTeamAccess('teamId'), async (req, res) => {
  try {
    const { teamId, playerId } = req.params;
    const result = await db.prepare('DELETE FROM players WHERE id = ? AND team_id = ?').run(playerId, teamId);
    if (!result.changes) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('remove player failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
