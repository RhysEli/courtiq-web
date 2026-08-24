const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { resolveCanonicalTeamId, getGroupedTeamIds } = require('../services/teamIdentityGroups');

const router = express.Router();
router.use(requireAuth);

// Step 14 Phase B: additive "these team ids are the same real team"
// grouping -- infrastructure only. No frontend in this round; verified
// here directly. Same role-gate reasoning as team-identity-review
// (routes/teamIdentityReview.js): this only touches `teams`/
// `team_identity_groups`, the same category of action the three shared
// find-or-create routes already cover.

// List every real grouping.
router.get('/', requireRole('Statistician', 'Team Manager'), async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT tig.team_id, t1.name AS team_name, tig.canonical_team_id, t2.name AS canonical_team_name, tig.created_at
      FROM team_identity_groups tig
      JOIN teams t1 ON t1.id = tig.team_id
      JOIN teams t2 ON t2.id = tig.canonical_team_id
      ORDER BY tig.canonical_team_id, tig.team_id
    `).all();
    res.json(rows);
  } catch (err) {
    console.error('list team identity groups failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// What's the canonical identity for teamId, and every id that shares it --
// the one primitive an analysis/comparison query would actually need.
router.get('/:teamId/canonical', requireRole('Statistician', 'Team Manager'), async (req, res) => {
  try {
    const { teamId } = req.params;
    const team = await db.prepare('SELECT id FROM teams WHERE id = ?').get(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const canonicalTeamId = await resolveCanonicalTeamId(teamId);
    const groupedTeamIds = await getGroupedTeamIds(teamId);
    res.json({ teamId, canonicalTeamId, groupedTeamIds });
  } catch (err) {
    console.error('resolve team identity group failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Record that teamId is the same real team as canonicalTeamId. Chains are
// rejected rather than resolved -- canonicalTeamId must itself not already
// be grouped under a further id -- keeps resolution always a single hop,
// no recursive lookup ever needed.
router.post('/', requireRole('Statistician', 'Team Manager'), async (req, res) => {
  try {
    const { teamId, canonicalTeamId } = req.body;
    if (!teamId || !canonicalTeamId) {
      return res.status(400).json({ error: 'teamId and canonicalTeamId are required' });
    }
    if (teamId === canonicalTeamId) {
      return res.status(400).json({ error: 'teamId and canonicalTeamId must be different teams' });
    }

    const team = await db.prepare('SELECT id FROM teams WHERE id = ?').get(teamId);
    if (!team) return res.status(400).json({ error: 'teamId does not match a real team' });
    const canonicalTeam = await db.prepare('SELECT id FROM teams WHERE id = ?').get(canonicalTeamId);
    if (!canonicalTeam) return res.status(400).json({ error: 'canonicalTeamId does not match a real team' });

    const canonicalIsItselfGrouped = await db.prepare(
      'SELECT canonical_team_id FROM team_identity_groups WHERE team_id = ?',
    ).get(canonicalTeamId);
    if (canonicalIsItselfGrouped) {
      return res.status(409).json({
        error: `'${canonicalTeamId}' is itself grouped under '${canonicalIsItselfGrouped.canonical_team_id}' -- group teamId under that id directly instead of chaining`,
      });
    }

    const existing = await db.prepare('SELECT canonical_team_id FROM team_identity_groups WHERE team_id = ?').get(teamId);
    if (existing) {
      return res.status(409).json({ error: `'${teamId}' is already grouped under '${existing.canonical_team_id}'` });
    }

    const row = await db.prepare(`
      INSERT INTO team_identity_groups (team_id, canonical_team_id, created_by)
      VALUES (?, ?, ?)
      RETURNING team_id, canonical_team_id, created_at
    `).get(teamId, canonicalTeamId, req.user.id);

    res.status(201).json(row);
  } catch (err) {
    console.error('create team identity group failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Remove a grouping -- teamId goes back to being its own canonical
// identity. Doesn't touch any of the underlying games/players/stats;
// this table was never referenced by them in the first place.
router.delete('/:teamId', requireRole('Statistician', 'Team Manager'), async (req, res) => {
  try {
    const { teamId } = req.params;
    const result = await db.prepare('DELETE FROM team_identity_groups WHERE team_id = ?').run(teamId);
    if (!result.changes) {
      return res.status(404).json({ error: 'No grouping found for this team' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('remove team identity group failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
