const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { confirmReview, rejectReview } = require('../services/teamIdentity');

const router = express.Router();
router.use(requireAuth);

// Team identity review queue -- fuzzy team-name matches from bulk-import,
// manual game creation, or manual team creation (services/teamIdentity.js)
// that need a human decision before they're linked to an existing team or
// treated as a genuinely new one.
//
// Gated requireRole('Statistician', 'Team Manager') for write, same as
// playerIdentityReview.js -- and for the same reason stated there: this
// queue only ever touches `teams`/`team_name_aliases`, the exact tables
// and scope the three find-or-create call sites (already Statistician +
// Team Manager shared: bulkImport.js, games.js's POST /, teams.js's POST /)
// already cover. A candidate here exists only because one of those
// already-shared actions produced it, so gating its resolution any
// tighter would contradict that existing split rather than follow it --
// same reasoning Step 7 used, now confirmed to apply here too.
//
// Unlike playerIdentityReview.js's GET (no role gate, since that queue is
// naturally scoped per-team via requireTeamAccess -- any member of THAT
// team can see THEIR team's own queue), this queue's GET is gated too.
// Team-name matching is unscoped/global (schema.sql), so there's no
// per-team boundary to hang an "any team member" read rule on, and a
// global list of cross-team possible-duplicate suggestions isn't
// information a Coach or Athlete account has any real use for.

// List pending review candidates, enriched with the existing team's name
// so a reviewer sees who the candidate is being compared against.
router.get('/', requireRole('Statistician', 'Team Manager'), async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT tir.id, tir.candidate_text, tir.candidate_team_id, tir.match_reason, tir.created_at,
             t.name AS candidate_team_name
      FROM team_identity_review tir
      JOIN teams t ON t.id = tir.candidate_team_id
      WHERE tir.status = 'pending'
      ORDER BY tir.created_at
    `).all();
    res.json(rows);
  } catch (err) {
    console.error('list team identity review failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Confirm: candidate_text really is candidate_team_id, under a new
// spelling -- links it as an alias.
router.post('/:reviewId/confirm', requireRole('Statistician', 'Team Manager'), async (req, res) => {
  try {
    const result = await confirmReview(req.params.reviewId, req.user.id);
    if (!result) return res.status(409).json({ error: 'This review has already been resolved' });
    res.json({ status: 'confirmed', teamId: result.teamId });
  } catch (err) {
    console.error('confirm team identity review failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Reject: candidate_text is NOT the same team -- creates it as its own
// new team, same as a no-match at ingestion time would have.
router.post('/:reviewId/reject', requireRole('Statistician', 'Team Manager'), async (req, res) => {
  try {
    const result = await rejectReview(req.params.reviewId, req.user.id);
    if (!result) return res.status(409).json({ error: 'This review has already been resolved' });
    res.json({ status: 'rejected', teamId: result.teamId });
  } catch (err) {
    console.error('reject team identity review failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
