const express = require('express');
const db = require('../db');
const { hashPassword } = require('../utils/passwords');

const router = express.Router();

// Public (no auth) -- the account holder sets a new password here, after
// a staff member triggered the reset (POST /users/:userId/reset-password
// in users.js). Structurally similar to invites/:token/accept, but on
// its own table: that endpoint explicitly rejects when an account
// already exists, which is exactly the case here (a reset is always for
// an EXISTING account) -- it can't be reused as-is.
router.post('/:token', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'password is required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const record = await db.prepare('SELECT * FROM password_reset_tokens WHERE token = ?').get(req.params.token);
    if (!record) {
      return res.status(404).json({ error: 'Reset link not found' });
    }
    if (record.consumed_at) {
      return res.status(410).json({ error: 'This reset link has already been used' });
    }
    if (new Date(record.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This reset link has expired' });
    }

    const passwordHash = hashPassword(password);
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, record.user_id);
    // Marks THIS token consumed -- a still-unused OLDER token for the same
    // user can't exist alongside it anyway, since the trigger endpoint
    // already deletes any previous unused token before creating a new one.
    await db.prepare('UPDATE password_reset_tokens SET consumed_at = NOW() WHERE id = ?').run(record.id);

    res.json({ ok: true });
  } catch (err) {
    console.error('reset password failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
