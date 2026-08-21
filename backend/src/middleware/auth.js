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
// Example: requireRole('Statistician', 'Coach')
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
// accessed (e.g. 'teamId' for /teams/:teamId/...). No role bypasses this --
// every user is required to have at least one real team (see invites.js's
// mandatory teamId), so there's no "unmanageable teamless user" case this
// would need to exist for.
function requireTeamAccess(paramName = 'teamId') {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const requestedTeamId = req.params[paramName] || req.body[paramName] || req.query[paramName];
    const accessibleTeamIds = req.user.teamIds || [];
    if (!requestedTeamId || !accessibleTeamIds.includes(requestedTeamId)) {
      return res.status(403).json({ error: 'You do not have access to this team' });
    }
    next();
  };
}

// Team-scoped authorization for routes keyed by a TARGET USER, not a
// :teamId param -- users.js's list/edit/photo endpoints operate on
// another user's row (e.g. /users/:userId), so there's no team id in the
// URL for requireTeamAccess to check directly. Instead: look up the
// target user's own real team(s) via user_teams, and require that the
// caller shares AT LEAST ONE team with them (not all of them) --
// matches how a Statistician covering both a team's Men's and Women's
// side, per schema.sql's own example, would expect to manage users on
// either side, not need overlap on every team both people happen to be
// on. No role bypass -- every user is guaranteed at least one real team
// (see invites.js), so there's no teamless-user case that would need one.
function requireSharedTeamWithUser(paramName = 'userId') {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const targetUserId = req.params[paramName];
      const targetTeams = await db.prepare('SELECT team_id FROM user_teams WHERE user_id = ?').all(targetUserId);
      const targetTeamIds = targetTeams.map((row) => row.team_id);
      const accessibleTeamIds = req.user.teamIds || [];
      const sharesATeam = targetTeamIds.some((id) => accessibleTeamIds.includes(id));
      if (!sharesATeam) {
        return res.status(403).json({ error: 'You do not share a team with this user' });
      }
      next();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
}

// Team-scoped authorization for routes keyed by a game id, not a :teamId
// param -- a game has TWO teams (home_team_id/opponent_team_id), and
// there's no single team id in the URL for requireTeamAccess to check
// directly. "Has access to this game" is deliberately defined as sharing
// a team with EITHER side, not just the side that happens to be listed as
// home, and not just whoever created the row: bulk-import's find-or-
// match-by-name-and-date logic means the same real matchup can already be
// represented by one shared game row regardless of which team's staff
// uploaded it first (see bulkImport.js) -- a team listed as `opponent` on
// a game their own staff didn't happen to create first should still see
// it, the same as the team listed as `home`. Confirmed via Opponent
// Analysis's actual data dependency (GET /teams + GET /teams/:id/
// season-stats only, both already deliberately unscoped for scouting)
// that this game-level access model doesn't need to be looser than "my
// team was one of the two sides" to keep that feature working. Same
// req.user.teamIds shape as requireTeamAccess/requireSharedTeamWithUser
// above -- only the lookup target (a game's two team ids, not one) is new.
function requireGameAccess(paramName = 'id') {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      // Same params/body/query fallback as requireTeamAccess -- gameId
      // isn't always a route param (annotations.js's GET / reads it off
      // ?gameId=, its POST / off the JSON body). req.body is only ever
      // undefined here (a GET with no JSON content-type never gets one
      // from express.json()), unlike req.params/req.query which express
      // always populates -- every existing requireTeamAccess call site
      // happens to pass a route param, so req.body[paramName] there is
      // short-circuited away by the || chain before it can matter; this
      // is the first game-access call site keyed by query/body instead.
      const gameId = req.params[paramName] || req.body?.[paramName] || req.query[paramName];
      const game = await db.prepare('SELECT home_team_id, opponent_team_id FROM games WHERE id = ?').get(gameId);
      if (!game) {
        return res.status(404).json({ error: 'Game not found' });
      }
      const accessibleTeamIds = req.user.teamIds || [];
      const hasAccess = accessibleTeamIds.includes(game.home_team_id) || accessibleTeamIds.includes(game.opponent_team_id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'You do not have access to this game' });
      }
      next();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
}

// Whether `teamId` currently has an active (is_active) Statistician on its
// roster -- the actual condition the "Team Manager can do technical work
// if their team has no Statistician" fallback rule hinges on. A single
// indexed EXISTS lookup; cheap enough per-request at this app's scale that
// no caching is warranted (same reasoning as requireGameAccess's own
// per-request game lookup just above).
async function teamHasActiveStatistician(teamId) {
  const row = await db.prepare(`
    SELECT EXISTS (
      SELECT 1 FROM user_teams ut
      JOIN users u ON u.id = ut.user_id
      WHERE ut.team_id = ? AND u.role = 'Statistician' AND u.is_active = true
    ) AS has_statistician
  `).get(teamId);
  return Boolean(row.has_statistician);
}

// Narrows a game-scoped technical route (report upload, compute) down from
// requireRole('Statistician', 'Team Manager') + requireGameAccess: a
// Statistician always proceeds; a Team Manager only proceeds if AT LEAST
// ONE of their own team(s) involved in this specific game currently has no
// Statistician -- if their team already has one, that Statistician (not
// the Team Manager) is who this work should go through. Deliberately
// re-queries the game row rather than trusting requireGameAccess ran first
// (same small-independent-middleware shape as every other check here, not
// request-scoped caching). Expects requireRole('Statistician',
// 'Team Manager') to already have run, so any other role never reaches
// here at all.
function requireStatisticianOrFallback(paramName = 'gameId') {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (req.user.role === 'Statistician') {
      return next();
    }
    try {
      const gameId = req.params[paramName] || req.body?.[paramName] || req.query[paramName];
      const game = await db.prepare('SELECT home_team_id, opponent_team_id FROM games WHERE id = ?').get(gameId);
      if (!game) {
        return res.status(404).json({ error: 'Game not found' });
      }
      const myTeamIds = req.user.teamIds || [];
      const myTeamsInThisGame = [game.home_team_id, game.opponent_team_id].filter((id) => myTeamIds.includes(id));
      for (const teamId of myTeamsInThisGame) {
        if (!(await teamHasActiveStatistician(teamId))) {
          return next();
        }
      }
      return res.status(403).json({ error: 'Your team already has a Statistician -- this goes through them.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
}

// The real, current list of teams a user can access, enriched with
// institution and gender info for the frontend switcher -- every user sees
// only teams they have a row for in user_teams (which users.team_id is
// backfilled into on migration -- see schema.sql).
async function getUserTeams(user) {
  const rows = await db.prepare(`
    SELECT t.id, t.name, t.gender_category, t.color_primary, t.color_secondary,
           t.brand_accent, t.logo_url, t.institution_id, i.name AS institution_name
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

module.exports = {
  requireAuth, requireRole, requireTeamAccess, requireSharedTeamWithUser, requireGameAccess,
  requireStatisticianOrFallback, teamHasActiveStatistician, getUserTeams, signToken, JWT_SECRET,
};