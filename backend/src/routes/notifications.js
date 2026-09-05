const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Step 58 (Phase 1) built the real `notifications` table + the two
// highest-value triggers. This is Phase 2's real consumer side -- read/
// mutate routes for the real rows those triggers already write. Every
// route below is scoped to req.user.id (from the verified JWT payload,
// never a client-supplied userId) -- a user can only ever see or mutate
// their own real notifications, the same "never trust a client-supplied
// id for who you are" posture every other req.user.id-scoped route in
// this codebase already takes.

router.get('/unread-count', async (req, res) => {
  try {
    const row = await db.prepare(
      'SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id = ? AND read_at IS NULL',
    ).get(req.user.id);
    res.json({ count: Number(row.n) });
  } catch (err) {
    console.error('notifications unread-count failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// auditLog.js's own real GET / (the only other "list of real system-
// generated rows" route in this codebase) has no LIMIT at all -- checked
// directly, not assumed. Deliberately NOT matched here: that route feeds
// a full-page table (audit-log.jsx), this one feeds a small bell dropdown
// where an unbounded list is a real usability problem, not a hypothetical
// one. LIMIT 20 is a disclosed divergence for that reason, not blind
// invention -- same real ORDER BY created_at DESC shape either way.
router.get('/', async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT id, type, message, game_id, report_id, player_identity_review_id, read_at, created_at
      FROM notifications
      WHERE recipient_user_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(req.user.id);
    res.json(rows);
  } catch (err) {
    console.error('list notifications failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Scoped to recipient_user_id = req.user.id in the WHERE clause itself
// (not just a pre-check) -- attempting to mark someone else's real
// notification read matches zero rows, not one, so this 404s rather than
// silently no-op-succeeding on a row that was never touched.
router.post('/:id/read', async (req, res) => {
  try {
    const updated = await db.prepare(`
      UPDATE notifications SET read_at = NOW()
      WHERE id = ? AND recipient_user_id = ?
      RETURNING id
    `).get(req.params.id, req.user.id);
    if (!updated) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json({ id: updated.id });
  } catch (err) {
    console.error('mark notification read failed:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/read-all', async (req, res) => {
  try {
    const updated = await db.prepare(`
      UPDATE notifications SET read_at = NOW()
      WHERE recipient_user_id = ? AND read_at IS NULL
      RETURNING id
    `).all(req.user.id);
    res.json({ count: updated.length });
  } catch (err) {
    console.error('mark all notifications read failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
