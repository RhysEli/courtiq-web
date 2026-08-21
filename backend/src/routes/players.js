const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, requireTeamAccess } = require('../middleware/auth');
const { imageUpload, uploadImage } = require('../services/imageUpload');
const { resolvePlayerName } = require('../services/playerIdentity');

const router = express.Router();
router.use(requireAuth);

// Real roster CRUD against the `players` table (schema.sql), which
// existed but was completely unused before this -- roster assignment was
// previously localStorage-only (src/pages/players-management.jsx wrote
// to 'courtiq-players' and never touched the backend). Shared between
// Statistician and Team Manager (requireRole below) -- roster management
// was never part of the Statistician/Team Manager technical-vs-managing
// split (see users.js/seasons.js for what that split actually covers);
// both roles keep full access here, unchanged.
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
      'SELECT id, team_id, full_name, jersey_number, position, photo_url FROM players WHERE team_id = ? ORDER BY jersey_number NULLS LAST, full_name',
    ).all(teamId);
    res.json(players);
  } catch (err) {
    console.error('list players failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add a player to a team's roster. Runs the same identity resolution as
// bulk-import (playerIdentity.js) instead of an unconditional INSERT --
// previously this created a duplicate players row every time, even for an
// exact repeat of an existing name. Three outcomes:
//   - exact match to an existing player: 200, links this add-attempt as
//     just another alias, no new row. jersey_number/position only fill in
//     gaps (COALESCE) -- never overwrite an existing player's already-
//     curated values with whatever this particular attempt typed in.
//   - fuzzy match: 202, nothing created yet -- a Statistician/Team Manager
//     has to confirm or reject the candidate (see playerIdentityReview.js)
//     before this becomes a real roster entry. jersey_number/position are
//     carried on the review row itself (resolvePlayerName) so they aren't
//     lost across that gap -- applied if the review is later rejected
//     (a genuinely new player, nothing to protect), left unused if
//     confirmed (an existing player's own data is never overwritten by
//     one new submission).
//   - no match: 201, a genuinely new player, with this submission's
//     jersey_number/position applied.
router.post('/:teamId/players', requireRole('Statistician', 'Team Manager'), requireTeamAccess('teamId'), async (req, res) => {
  try {
    const { teamId } = req.params;
    const { fullName, jerseyNumber, position } = req.body;
    if (!fullName?.trim()) {
      return res.status(400).json({ error: 'fullName is required' });
    }

    const resolution = await resolvePlayerName({
      teamId, name: fullName.trim(), reportType: 'manual-roster-add',
      jerseyNumber: jerseyNumber || null, position: position || null,
    });

    if (resolution.status === 'pending_review') {
      return res.status(202).json({
        status: 'pending_review',
        reviewId: resolution.reviewId,
        message: `"${fullName.trim()}" looks like it might already be on this roster under a different spelling. A Statistician or Team Manager needs to confirm or reject the match before this player is added.`,
      });
    }

    if (resolution.status === 'linked') {
      const player = await db.prepare(`
        UPDATE players SET jersey_number = COALESCE(jersey_number, ?), position = COALESCE(position, ?)
        WHERE id = ?
        RETURNING id, team_id, full_name, jersey_number, position, photo_url
      `).get(jerseyNumber || null, position || null, resolution.playerId);
      return res.status(200).json({ status: 'linked', player });
    }

    const player = await db.prepare(`
      UPDATE players SET jersey_number = ?, position = ?
      WHERE id = ?
      RETURNING id, team_id, full_name, jersey_number, position, photo_url
    `).get(jerseyNumber || null, position || null, resolution.playerId);

    res.status(201).json({ status: 'created', player });
  } catch (err) {
    console.error('add player failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Staff-curated player photo -- Statistician/Team Manager only (same
// gating as add/remove above), never self-service: players don't have
// accounts that log into this app, so there's no self-service path to
// even offer. Editable anytime, not just at creation -- calling this
// again on an existing player simply replaces their photo.
router.patch('/:teamId/players/:playerId/photo', requireRole('Statistician', 'Team Manager'), requireTeamAccess('teamId'), imageUpload.single('photo'), async (req, res) => {
  try {
    const { teamId, playerId } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: 'No photo file uploaded (expected multipart field "photo")' });
    }

    const existing = await db.prepare('SELECT id FROM players WHERE id = ? AND team_id = ?').get(playerId, teamId);
    if (!existing) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const photoUrl = await uploadImage({
      entityType: 'player-photos',
      entityId: playerId,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
    });

    const player = await db.prepare(
      'UPDATE players SET photo_url = ? WHERE id = ? RETURNING id, team_id, full_name, jersey_number, position, photo_url',
    ).get(photoUrl, playerId);

    res.json(player);
  } catch (err) {
    console.error('player photo upload failed:', err);
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
