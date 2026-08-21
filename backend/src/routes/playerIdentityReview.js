const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, requireTeamAccess } = require('../middleware/auth');
const { confirmReview, rejectReview } = require('../services/playerIdentity');

const router = express.Router();
router.use(requireAuth);

// Player identity review queue -- fuzzy name matches from bulk-import,
// report upload, or manual roster-add (playerIdentity.js) that need a
// human decision before they're linked to an existing player or treated
// as someone new. Gated the same as players.js's roster routes
// (requireRole('Statistician', 'Team Manager') for write, requireTeamAccess
// alone for read) -- deliberately NOT the technical/Statistician-primary-
// with-Team-Manager-fallback pattern report upload/bulk-import use. This
// queue only ever touches `players`/`player_name_aliases`, the exact same
// tables and scope players.js already covers, and Step 6 explicitly
// confirmed roster management is shared between both roles and was never
// part of that technical/managing split -- extending that split to this
// queue (even though its candidates often originate from ingestion) would
// contradict that explicit, recent decision rather than follow it.

// List pending review candidates for a team, enriched with the existing
// player's current name so a reviewer sees who the candidate is being
// compared against, not just an id. No requireRole -- matches
// GET /:teamId/players's own "any team member can view" pattern.
router.get('/:teamId/player-identity-review', requireTeamAccess('teamId'), async (req, res) => {
  try {
    const { teamId } = req.params;
    const rows = await db.prepare(`
      SELECT pir.id, pir.candidate_text, pir.candidate_player_id, pir.match_reason,
             pir.first_seen_game_id, pir.first_seen_report_type, pir.created_at,
             p.full_name AS candidate_player_name, p.jersey_number AS candidate_player_jersey_number
      FROM player_identity_review pir
      JOIN players p ON p.id = pir.candidate_player_id
      WHERE pir.team_id = ? AND pir.status = 'pending'
      ORDER BY pir.created_at
    `).all(teamId);
    // candidate_player_jersey_number is read-only display context for the
    // reviewer (e.g. "this existing player wears #8") -- never fed into
    // the match itself, which already ran before this row existed.
    res.json(rows);
  } catch (err) {
    console.error('list player identity review failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Confirm: candidate_text really is the same person as candidate_player_id,
// under a new spelling -- links it as an alias.
router.post('/:teamId/player-identity-review/:reviewId/confirm', requireRole('Statistician', 'Team Manager'), requireTeamAccess('teamId'), async (req, res) => {
  try {
    const { teamId, reviewId } = req.params;
    const review = await db.prepare('SELECT team_id FROM player_identity_review WHERE id = ?').get(reviewId);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    if (review.team_id !== teamId) return res.status(404).json({ error: 'Review not found for this team' });

    const result = await confirmReview(reviewId, req.user.id);
    if (!result) return res.status(409).json({ error: 'This review has already been resolved' });

    res.json({ status: 'confirmed', playerId: result.playerId });
  } catch (err) {
    console.error('confirm player identity review failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Reject: candidate_text is NOT the same person -- creates it as its own
// new canonical player, same as a no-match at ingestion time would have.
router.post('/:teamId/player-identity-review/:reviewId/reject', requireRole('Statistician', 'Team Manager'), requireTeamAccess('teamId'), async (req, res) => {
  try {
    const { teamId, reviewId } = req.params;
    const review = await db.prepare('SELECT team_id FROM player_identity_review WHERE id = ?').get(reviewId);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    if (review.team_id !== teamId) return res.status(404).json({ error: 'Review not found for this team' });

    const result = await rejectReview(reviewId, req.user.id);
    if (!result) return res.status(409).json({ error: 'This review has already been resolved' });

    res.json({ status: 'rejected', playerId: result.playerId });
  } catch (err) {
    console.error('reject player identity review failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
