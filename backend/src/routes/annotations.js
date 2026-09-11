const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { createNotification, resolveTeamRecipients } = require('../services/notifications');

const router = express.Router();
router.use(requireAuth);

// FR-09: coach annotations on a game record, a season summary
// (team_competition_seasons, not the raw shared seasons.id -- see
// schema.sql's comment on annotations for why), or a player profile.
// The `annotations` table already existed in schema.sql (game_id,
// author_id, body, created_at) but nothing read or wrote to it -- this
// wires it up for real, then this round extends it to all three scopes.

// Reads whichever single scope identifier is present (params/body/query --
// same fallback chain the old requireGameAccess('gameId') call site used,
// since GET reads gameId off ?gameId= and POST off the JSON body), resolves
// the real team_id behind it, and checks the requester actually has access
// to that team. game scope has team_id directly on the row (home/opponent);
// season and player scope don't carry team_id on the request at all (unlike
// routes keyed by a :teamId param), so each needs its own one-lookup
// resolution -- team_competition_seasons.team_id / players.team_id -- before
// the same accessibleTeamIds check requireTeamAccess itself does. Attaches
// the resolved { column, id } to req.annotationScope for both route
// handlers below; column is always one of three hardcoded literal strings
// this function itself assigns, never derived from request input, so
// interpolating it into the query text is safe.
async function resolveAnnotationScope(req, res, next) {
  const gameId = req.params.gameId || req.body?.gameId || req.query.gameId;
  const teamCompetitionSeasonId = req.params.teamCompetitionSeasonId || req.body?.teamCompetitionSeasonId || req.query.teamCompetitionSeasonId;
  const playerId = req.params.playerId || req.body?.playerId || req.query.playerId;

  const provided = [gameId, teamCompetitionSeasonId, playerId].filter((v) => v !== undefined && v !== null && v !== '');
  if (provided.length !== 1) {
    return res.status(400).json({ error: 'Exactly one of gameId, teamCompetitionSeasonId, or playerId is required' });
  }

  const accessibleTeamIds = req.user.teamIds || [];

  try {
    if (gameId) {
      const game = await db.prepare('SELECT home_team_id, opponent_team_id FROM games WHERE id = ?').get(gameId);
      if (!game) return res.status(404).json({ error: 'Game not found' });
      const hasAccess = accessibleTeamIds.includes(game.home_team_id) || accessibleTeamIds.includes(game.opponent_team_id);
      if (!hasAccess) return res.status(403).json({ error: 'You do not have access to this game' });
      // teamIds carried forward for Step 60 Phase 3's coach-note
      // notification -- both real sides of the game, same real team-
      // scoping the game-analyzed trigger already uses (a note on a game
      // is relevant to either side's own staff, not just the author's).
      // Reuses the access check's own query above rather than a second
      // lookup at the POST handler.
      req.annotationScope = { column: 'game_id', id: gameId, teamIds: [game.home_team_id, game.opponent_team_id] };
      return next();
    }

    if (teamCompetitionSeasonId) {
      const tcs = await db.prepare('SELECT team_id FROM team_competition_seasons WHERE id = ?').get(teamCompetitionSeasonId);
      if (!tcs) return res.status(404).json({ error: 'Team competition season not found' });
      if (!accessibleTeamIds.includes(tcs.team_id)) return res.status(403).json({ error: 'You do not have access to this team' });
      req.annotationScope = { column: 'team_competition_season_id', id: teamCompetitionSeasonId, teamIds: [tcs.team_id] };
      return next();
    }

    const player = await db.prepare('SELECT team_id FROM players WHERE id = ?').get(playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (!accessibleTeamIds.includes(player.team_id)) return res.status(403).json({ error: 'You do not have access to this team' });
    req.annotationScope = { column: 'player_id', id: playerId, teamIds: [player.team_id] };
    return next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

router.get('/', resolveAnnotationScope, async (req, res) => {
  try {
    const { column, id } = req.annotationScope;
    const rows = await db.prepare(`
      SELECT a.id, a.body, a.created_at, u.name AS author_name
      FROM annotations a
      LEFT JOIN users u ON u.id = a.author_id
      WHERE a.${column} = ?
      ORDER BY a.created_at DESC
    `).all(id);
    res.json(rows);
  } catch (err) {
    console.error('list annotations failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Only Coaches may add annotations, per the proposal's stated RBAC design
// (FR-09) -- unchanged across all three scopes, enforced here on the
// backend, not just hidden in the UI.
router.post('/', requireRole('Coach'), resolveAnnotationScope, async (req, res) => {
  const { body } = req.body;
  if (!body?.trim()) {
    return res.status(400).json({ error: 'body is required' });
  }
  try {
    const { column, id, teamIds } = req.annotationScope;
    const result = await db.prepare(`
      INSERT INTO annotations (${column}, author_id, body)
      VALUES (?, ?, ?)
      RETURNING id
    `).run(id, req.user.id, body.trim());

    // Step 60 Phase 3: real notification for real team members other than
    // the author -- reuses resolveTeamRecipients, same helper and same
    // exclude-the-actor shape the game-analyzed trigger already uses.
    // Game-scoped notes only: notifications' own real scope columns
    // (game_id/report_id/player_identity_review_id) have no column for
    // "a season summary" or "a player profile" -- adding one is a real
    // schema change, explicitly out of this round's scope, so a
    // team_competition_season_id- or player_id-scoped note structurally
    // has nothing real to attach a notification row to yet.
    if (column === 'game_id') {
      const [author, game] = await Promise.all([
        db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id),
        db.prepare('SELECT home_team_id, opponent_team_id, game_date FROM games WHERE id = ?').get(id),
      ]);
      const recipients = await resolveTeamRecipients(teamIds, { excludeUserId: req.user.id });
      for (const recipientUserId of recipients) {
        await createNotification({
          recipientUserId,
          type: 'note_added',
          message: `${author?.name || 'A coach'} added a note to ${game.home_team_id} vs ${game.opponent_team_id} (${game.game_date || 'no date'}).`,
          gameId: id,
        });
      }
    }

    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error('create annotation failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
