const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, email, role, teamIds }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// RBAC: pass the roles allowed to hit this route.
// Example: requireRole('Administrator', 'Statistician')
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Role '${req.user.role}' is not permitted to perform this action` });
    }
    next();
  };
}

// Real team-scoped authorization -- previously nothing anywhere checked
// this, meaning any authenticated user of the right role could reach any
// team's data through the API regardless of which team(s) they actually
// belong to. paramName is the route param holding the team id being
// accessed (e.g. 'teamId' for /teams/:teamId/...). Administrators bypass
// this check entirely (full access by design).
function requireTeamAccess(paramName = 'teamId') {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (req.user.role === 'Administrator') {
      return next();
    }
    const requestedTeamId = req.params[paramName] || req.body[paramName] || req.query[paramName];
    const accessibleTeamIds = req.user.teamIds || [];
    if (!requestedTeamId || !accessibleTeamIds.includes(requestedTeamId)) {
      return res.status(403).json({ error: 'You do not have access to this team' });
    }
    next();
  };
}

// The real, current list of teams a user can access, enriched with
// institution and gender info for the frontend switcher. Administrators
// see every team in the system; everyone else sees only teams they have a
// row for in user_teams (which users.team_id is backfilled into on
// migration -- see schema.sql).
async function getUserTeams(user) {
  if (user.role === 'Administrator') {
    const rows = await db.prepare(`
      SELECT t.id, t.name, t.gender_category, t.color_primary, t.color_secondary,
             t.institution_id, i.name AS institution_name
      FROM teams t
      LEFT JOIN institutions i ON i.id = t.institution_id
      ORDER BY i.name, t.gender_category, t.name
    `).all();
    return rows;
  }
  const rows = await db.prepare(`
    SELECT t.id, t.name, t.gender_category, t.color_primary, t.color_secondary,
           t.institution_id, i.name AS institution_name
    FROM user_teams ut
    JOIN teams t ON t.id = ut.team_id
    LEFT JOIN institutions i ON i.id = t.institution_id
    WHERE ut.user_id = ?
    ORDER BY i.name, t.gender_category, t.name
  `).all(user.id);
  return rows;
}

function signToken(user, teamIds = []) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, teamIds },
    JWT_SECRET,
    { expiresIn: '12h' },
  );
}

module.exports = { requireAuth, requireRole, requireTeamAccess, getUserTeams, signToken, JWT_SECRET };