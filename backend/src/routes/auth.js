const express = require('express');
const db = require('../db');
const { verifyPassword } = require('../utils/passwords');
const { signToken, getUserTeams } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  // No such account, wrong password, and a deactivated account all
  // collapse into the exact same check and the exact same message --
  // deliberately. Splitting "wrong password" from "deactivated account"
  // (or from "no such account") would let someone probe which emails
  // belong to real, or specifically deactivated, accounts. This only
  // blocks the NEXT login attempt -- an already-issued JWT keeps working
  // until its normal 12h expiry (requireAuth only checks the token's
  // signature/expiry, not a live is_active lookup on every request) --
  // accepted tradeoff, not an oversight; see PATCH /users/:userId for
  // where is_active actually gets toggled.
  if (!user || !verifyPassword(password, user.password_hash) || !user.is_active) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const teams = await getUserTeams(user);
  const teamIds = teams.map((t) => t.id);
  const token = signToken(user, teamIds);
  res.json({
    token,
    // themeMode/accentOverride: visual overhaul step 2's personal
    // preference layer, already on `user` since the SELECT above is `*`.
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role, teams,
      themeMode: user.theme_mode, accentOverride: user.accent_override,
      // Staff-curated (see PATCH /users/:userId/photo) -- never set by
      // the user themselves, but read back here the same as any other
      // profile field so avatars everywhere can show it.
      photoUrl: user.photo_url,
    },
  });
});

module.exports = router;