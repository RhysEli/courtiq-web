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
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const teams = await getUserTeams(user);
  const teamIds = teams.map((t) => t.id);
  const token = signToken(user, teamIds);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, teams },
  });
});

module.exports = router;