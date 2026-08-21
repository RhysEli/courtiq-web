const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, requireGameAccess } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// FR-09: coach annotations on a game record. The `annotations` table
// already existed in schema.sql (game_id, author_id, body, created_at)
// but nothing read or wrote to it -- this wires it up for real.

router.get('/', requireGameAccess('gameId'), async (req, res) => {
  const { gameId } = req.query;
  if (!gameId) return res.status(400).json({ error: 'gameId is required' });
  try {
    const rows = await db.prepare(`
      SELECT a.id, a.body, a.created_at, u.name AS author_name
      FROM annotations a
      LEFT JOIN users u ON u.id = a.author_id
      WHERE a.game_id = ?
      ORDER BY a.created_at DESC
    `).all(gameId);
    res.json(rows);
  } catch (err) {
    console.error('list annotations failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Only Coaches may add annotations, per the proposal's stated RBAC design
// (FR-09). This is enforced here on the backend, not just hidden in the UI.
router.post('/', requireRole('Coach'), requireGameAccess('gameId'), async (req, res) => {
  const { gameId, body } = req.body;
  if (!gameId || !body?.trim()) {
    return res.status(400).json({ error: 'gameId and body are required' });
  }
  try {
    const result = await db.prepare(`
      INSERT INTO annotations (game_id, author_id, body)
      VALUES (?, ?, ?)
      RETURNING id
    `).run(gameId, req.user.id, body.trim());
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error('create annotation failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;