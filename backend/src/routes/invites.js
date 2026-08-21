const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, requireTeamAccess } = require('../middleware/auth');
const { hashPassword } = require('../utils/passwords');
const { sendMail } = require('../services/mailer');

const router = express.Router();

const INVITE_EXPIRY_DAYS = 7;
const ROLES_THAT_CAN_INVITE = ['Statistician', 'Team Manager'];

function buildInviteEmail({ appUrl, token, role, teamName, institutionName }) {
  const acceptUrl = `${appUrl}/accept-invite/${token}`;
  const subject = 'You have been invited to CourtIQ';
  const html = `
    <p>You've been invited to join <strong>${teamName || 'a team'}</strong>${institutionName ? ` at ${institutionName}` : ''} on CourtIQ as a <strong>${role}</strong>.</p>
    <p><a href="${acceptUrl}">Click here to accept and set up your account</a></p>
    <p>This link expires in ${INVITE_EXPIRY_DAYS} days. If you weren't expecting this, you can ignore this email.</p>
  `;
  const text = `You've been invited to join ${teamName || 'a team'} on CourtIQ as a ${role}. Accept here: ${acceptUrl} (expires in ${INVITE_EXPIRY_DAYS} days.)`;
  return { subject, html, text };
}

// Create a real invite record and send a real email. Role-gated: only
// Statisticians and Team Managers can invite people -- matches the roles
// that make sense to be adding Coaches/Athletes/other Statisticians to a
// team.
// NOTE: requireTeamAccess is deliberately NOT applied here yet. Every real
// backend request currently authenticates as one shared service account
// (see src/api/client.js's documented "two auth systems" gap) rather than
// the real logged-in person, so a team-access check here would enforce
// against that fixed shared account's team, not the actual user's -- pure
// noise, not real protection. Re-add requireTeamAccess('teamId') once the
// frontend sends the real user's own token instead of the shared one.
router.post('/send', requireAuth, requireRole(...ROLES_THAT_CAN_INVITE), async (req, res) => {
  try {
    const { toEmail, role, teamId, appUrl } = req.body;
    // teamId is mandatory -- a user should never come into existence with
    // no team (see schema.sql's mandatory invites.team_id, which this
    // guarantees an invite always has before it can ever be accepted).
    // The frontend's own invite form already disables "Create invite" on
    // this exact condition (users.jsx); this is the real, unbypassable
    // enforcement.
    if (!toEmail || !role || !teamId) {
      return res.status(400).json({ error: 'toEmail, role, and teamId are required' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const insertResult = await db.prepare(`
      INSERT INTO invites (email, role, team_id, token, invited_by, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id
    `).run(toEmail, role, teamId || null, token, req.user.id, expiresAt);

    let teamName = null;
    let institutionName = null;
    if (teamId) {
      const team = await db.prepare(`
        SELECT t.name, i.name AS institution_name FROM teams t
        LEFT JOIN institutions i ON i.id = t.institution_id
        WHERE t.id = ?
      `).get(teamId);
      teamName = team?.name || null;
      institutionName = team?.institution_name || null;
    }

    const { subject, html, text } = buildInviteEmail({
      appUrl: appUrl || 'https://courtiq-web-1.onrender.com',
      token, role, teamName, institutionName,
    });

    try {
      await sendMail({ to: toEmail, subject, html, text });
    } catch (mailErr) {
      // The invite row still exists even if the email failed -- return
      // 201 with a warning so the frontend can show "created, but email
      // failed" and the token is still usable as a shareable link.
      return res.status(201).json({
        id: insertResult.lastInsertRowid, token, email: toEmail, role, teamId: teamId || null,
        emailSent: false, emailError: mailErr.message,
      });
    }

    res.status(201).json({
      id: insertResult.lastInsertRowid, token, email: toEmail, role, teamId: teamId || null, emailSent: true,
    });
  } catch (err) {
    console.error('send invite failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// List real pending invites (previously this was entirely localStorage on
// the frontend and never reflected anything actually sent).
router.get('/', requireAuth, requireRole(...ROLES_THAT_CAN_INVITE), async (req, res) => {
  try {
    const invites = await db.prepare(`
      SELECT inv.id, inv.email, inv.role, inv.status, inv.created_at, inv.expires_at, inv.token,
             t.name AS team_name, i.name AS institution_name
      FROM invites inv
      LEFT JOIN teams t ON t.id = inv.team_id
      LEFT JOIN institutions i ON i.id = t.institution_id
      ORDER BY inv.created_at DESC
    `).all();
    res.json(invites);
  } catch (err) {
    console.error('list invites failed:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:token/revoke', requireAuth, requireRole(...ROLES_THAT_CAN_INVITE), async (req, res) => {
  try {
    await db.prepare(`UPDATE invites SET status = 'revoked' WHERE token = ? AND status = 'pending'`).run(req.params.token);
    res.json({ ok: true });
  } catch (err) {
    console.error('revoke invite failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Public (no auth) -- lets the invited person check the invite is real
// before showing them a signup form.
router.get('/:token', async (req, res) => {
  try {
    const invite = await db.prepare(`
      SELECT inv.email, inv.role, inv.status, inv.expires_at, t.name AS team_name, t.id AS team_id,
             i.name AS institution_name
      FROM invites inv
      LEFT JOIN teams t ON t.id = inv.team_id
      LEFT JOIN institutions i ON i.id = t.institution_id
      WHERE inv.token = ?
    `).get(req.params.token);

    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.status !== 'pending') return res.status(410).json({ error: `Invite already ${invite.status}` });
    if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'Invite expired' });

    res.json(invite);
  } catch (err) {
    console.error('get invite failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Public (no auth) -- the invited person sets their name/password here.
// Creates a REAL users row and links it to the invited team via
// user_teams, so the invite is actually usable end-to-end, not just an
// email that goes nowhere.
router.post('/:token/accept', async (req, res) => {
  try {
    const { name, password } = req.body;
    if (!name || !password) {
      return res.status(400).json({ error: 'name and password are required' });
    }

    const invite = await db.prepare('SELECT * FROM invites WHERE token = ?').get(req.params.token);
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.status !== 'pending') return res.status(410).json({ error: `Invite already ${invite.status}` });
    if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'Invite expired' });

    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(invite.email);
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    const passwordHash = hashPassword(password);
    const insertUser = await db.prepare(`
      INSERT INTO users (name, email, password_hash, role, team_id)
      VALUES (?, ?, ?, ?, ?)
      RETURNING id
    `).run(name, invite.email, passwordHash, invite.role, invite.team_id);

    const userId = insertUser.lastInsertRowid;
    if (invite.team_id) {
      await db.prepare(`
        INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)
        ON CONFLICT (user_id, team_id) DO NOTHING
      `).run(userId, invite.team_id);
    }

    await db.prepare(`UPDATE invites SET status = 'accepted', accepted_at = NOW() WHERE token = ?`).run(req.params.token);

    res.status(201).json({ ok: true, userId });
  } catch (err) {
    console.error('accept invite failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;