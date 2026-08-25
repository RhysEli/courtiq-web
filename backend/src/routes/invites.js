const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, requireTeamAccess } = require('../middleware/auth');
const { hashPassword } = require('../utils/passwords');
const { sendMail } = require('../services/mailer');
const { resolvePlayerName } = require('../services/playerIdentity');

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
// team. requireTeamAccess('teamId') added here -- previously absent
// (see git history for the now-resolved gap this left: any Statistician/
// Team Manager could invite someone, including one linking a real player
// row, to a team they had no membership on). That omission rested on
// every real backend request authenticating as one shared service
// account (src/api/client.js's old "two auth systems" note); confirmed
// during the player_id investigation round that a real per-user token
// has flowed correctly for every invite-accepted account well before
// this fix, so the check below enforces against the real caller's own
// teams, not a fixed shared account. Reads teamId off req.body via
// requireTeamAccess's existing params/body/query fallback -- the same
// shape requireGameAccess already uses for annotations.js's own
// body-keyed routes, no middleware changes needed.
router.post('/send', requireAuth, requireRole(...ROLES_THAT_CAN_INVITE), requireTeamAccess('teamId'), async (req, res) => {
  try {
    const { toEmail, role, teamId, appUrl, playerName } = req.body;
    // teamId is mandatory -- a user should never come into existence with
    // no team (see schema.sql's mandatory invites.team_id, which this
    // guarantees an invite always has before it can ever be accepted).
    // The frontend's own invite form already disables "Create invite" on
    // this exact condition (users.jsx); this is the real, unbypassable
    // enforcement.
    if (!toEmail || !role || !teamId) {
      return res.status(400).json({ error: 'toEmail, role, and teamId are required' });
    }

    // Links this Athlete invite to the real roster row they represent --
    // optional (a player row doesn't always exist yet at invite time; see
    // schema.sql's comment on invites.player_id), and only meaningful for
    // role='Athlete' (silently ignored otherwise, same as a stray field
    // any other route wouldn't act on). Same resolvePlayerName() exact/
    // fuzzy/new resolution players.js's roster-add already uses, not a
    // plain dropdown -- a fuzzy match doesn't block the invite from going
    // out, it just leaves player_id NULL for now (the same non-blocking
    // precedent roster-add already established for this exact case), and
    // the review can be confirmed/rejected later from Player Management
    // like any other pending candidate.
    let playerLink = null;
    let playerId = null;
    if (role === 'Athlete' && playerName?.trim()) {
      const resolution = await resolvePlayerName({ teamId, name: playerName.trim(), reportType: 'invite' });
      if (resolution.status === 'linked') {
        playerId = resolution.playerId;
        const player = await db.prepare('SELECT full_name FROM players WHERE id = ?').get(playerId);
        playerLink = { status: 'linked', playerId, playerName: player?.full_name };
      } else if (resolution.status === 'created') {
        playerId = resolution.playerId;
        playerLink = { status: 'created', playerId, playerName: playerName.trim() };
      } else if (resolution.status === 'pending_review') {
        playerLink = {
          status: 'pending_review',
          message: `"${playerName.trim()}" looks like it might already be on this roster under a different spelling. The invite will still be sent, but this account won't be linked to a player profile until a Statistician or Team Manager confirms or rejects the match in Player Management.`,
        };
      }
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const insertResult = await db.prepare(`
      INSERT INTO invites (email, role, team_id, token, invited_by, expires_at, player_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `).run(toEmail, role, teamId || null, token, req.user.id, expiresAt, playerId);

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
        emailSent: false, emailError: mailErr.message, playerLink,
      });
    }

    res.status(201).json({
      id: insertResult.lastInsertRowid, token, email: toEmail, role, teamId: teamId || null, emailSent: true, playerLink,
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
      INSERT INTO users (name, email, password_hash, role, team_id, player_id)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id
    `).run(name, invite.email, passwordHash, invite.role, invite.team_id, invite.player_id);

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