const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, requireGameAccess } = require('../middleware/auth');
const { resolveGameStageId } = require('../services/resolveGameStage');
const { resolveTeamName } = require('../services/teamIdentity');
const { normalizeTeamName } = require('../services/teamSide');
const { logAction } = require('../services/auditLog');

const router = express.Router();
router.use(requireAuth);

const REPORT_TYPES = [
  'Box Score', 'Play-by-Play', 'Player Evaluation', 'Plus Minus Summary',
  'Quarter Scoring', 'Rotation Summary', 'Lineup Analysis', 'Shot Areas',
  'Shot Charts', 'Score Sheet',
];

// Create a game record (Statistician/Team Manager, per proposal's RBAC design — FR-11 gives Team Manager season/competition administration).
router.post('/', requireRole('Statistician', 'Team Manager'), async (req, res) => {
  const { seasonId, competitionId, homeTeamId, gameDate, venue, stageId } = req.body;
  // Accept either field name: opponentTeamName (typed freely on the Games
  // page) or the older opponentTeamId (still sent by
  // src/services/realAnalysisBridge.js, used by the Analysis Import tab's
  // real Box Score path). Both are just team-name strings under the hood.
  const opponentTeamName = req.body.opponentTeamName || req.body.opponentTeamId;
  if (!homeTeamId || !opponentTeamName?.trim() || !gameDate) {
    return res.status(400).json({ error: 'homeTeamId, opponentTeamName, gameDate are required' });
  }
  // Opponents are frequently teams you don't otherwise track full stats
  // for -- you're recording the game for your own team's comparison, not
  // building out their roster. Same find-or-create-by-name convention
  // Bulk Import already uses when it reads a team name off a PDF, so a
  // manually-typed opponent and a PDF-detected one land in the same row.
  const opponentTeamRaw = opponentTeamName.trim();

  // Same "either side, no DB lookup" reasoning as bulkImport.js's per-file
  // check: the caller must have access to homeTeamId OR opponentTeamId,
  // checked purely against their own JWT teamIds. Deliberately anchored
  // to the raw typed/extracted string, not a resolved identity -- this
  // must run before team-name resolution below can do any write (a new
  // alias, a new review candidate, or a new team row), same ordering
  // this check has always had, unchanged by Step 14.
  const accessibleTeamIds = req.user.teamIds || [];
  if (!accessibleTeamIds.includes(homeTeamId) && !accessibleTeamIds.includes(opponentTeamRaw)) {
    return res.status(403).json({ error: 'You do not have access to either team in this game' });
  }

  // Step 14: resolves the opponent name through team identity matching
  // (services/teamIdentity.js) instead of a raw find-or-create INSERT.
  // A fuzzy match blocks game creation until a human resolves it --
  // unlike stage tagging, a team is foundational to the game row itself,
  // not an optional tag; there's no "leave it ambiguous for now" option.
  const opponentResolution = await resolveTeamName({ name: opponentTeamRaw });
  if (opponentResolution.status === 'pending_review') {
    return res.status(409).json({
      error: 'This opponent name looks similar to an existing team -- check the team identity review queue to confirm before creating this game.',
      reviewId: opponentResolution.reviewId,
    });
  }
  const opponentTeamId = opponentResolution.teamId;

  // Step 27: this route was the confirmed, real source of at least one
  // (very likely both) of a pair of duplicate `games` rows discovered in
  // production for the same real match -- unlike bulkImport.js, which
  // has its own +/-1-day tolerance (below, same convention) to avoid
  // re-creating a game it's already seen, this manual route had no
  // equivalent check at all and would happily insert a new row for a
  // team pairing/date that already exists. Checked BOTH team-order
  // pairings (home/opponent either way round), not just the caller's own
  // order -- bulkImport.js's own query only checks one order, a real gap
  // the investigation flagged but didn't need to close for the known
  // pair; costs nothing extra to close here since this is a fresh query.
  //
  // Warn-and-confirm, not a hard block or a queued review (unlike the
  // opponent-identity check just above): a wrong duplicate game is
  // lower-stakes and fully reversible by the same caller, right there,
  // unlike a wrong team merge corrupting shared roster data -- so this
  // surfaces the near-match for the caller to look at and resubmit with
  // confirmDuplicate: true, rather than blocking outright or routing
  // through a separate human review queue.
  if (!req.body.confirmDuplicate) {
    const duplicateCandidate = await db.prepare(`
      SELECT * FROM games
      WHERE (
        (home_team_id = ? AND opponent_team_id = ?) OR
        (home_team_id = ? AND opponent_team_id = ?)
      )
      AND ABS(game_date::date - ?::date) <= 1
    `).get(homeTeamId, opponentTeamId, opponentTeamId, homeTeamId, gameDate);

    if (duplicateCandidate) {
      const candidateTeams = await db.prepare('SELECT id, name FROM teams WHERE id IN (?, ?)')
        .all(duplicateCandidate.home_team_id, duplicateCandidate.opponent_team_id);
      const teamName = (teamId) => candidateTeams.find((t) => t.id === teamId)?.name || teamId;
      return res.status(409).json({
        status: 'possible_duplicate',
        game: {
          id: duplicateCandidate.id,
          homeTeamName: teamName(duplicateCandidate.home_team_id),
          opponentTeamName: teamName(duplicateCandidate.opponent_team_id),
          gameDate: duplicateCandidate.game_date,
          venue: duplicateCandidate.venue,
          status: duplicateCandidate.status,
        },
      });
    }
  } else {
    await logAction(req.user.id, 'create_game', `Created game for ${homeTeamId} vs ${opponentTeamId} on ${gameDate} despite a possible duplicate (confirmed by caller)`, true);
  }

  // See services/resolveGameStage.js for why this needs more than a
  // straight "does this id exist" check -- a stage belongs to one of the
  // caller's OWN teams' competition-season memberships, not just any real
  // stage in the system.
  const stageResolution = await resolveGameStageId({
    teamIds: accessibleTeamIds, homeTeamId, opponentTeamId, seasonId, competitionId, stageId,
  });
  if (!stageResolution.ok) {
    return res.status(400).json({ error: stageResolution.error });
  }

  const result = await db.prepare(`
    INSERT INTO games (season_id, competition_id, home_team_id, opponent_team_id, game_date, venue, created_by, stage_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `).run(seasonId || null, competitionId || null, homeTeamId, opponentTeamId, gameDate, venue || null, req.user.id, stageResolution.stageId);

  res.status(201).json(await getGameWithReportStatus(result.lastInsertRowid));
});

// Filtered, not 403'd, for the same reason GET /users is filtered rather
// than blocked outright: this is a list endpoint, and "you can't see this
// team's games" is a per-row concern, not an all-or-nothing one. Everyone
// sees only games where their own team was home OR opponent (see
// requireGameAccess's comment in middleware/auth.js for why "either side",
// not just home/creator).
router.get('/', async (req, res) => {
  const games = await db.prepare('SELECT * FROM games ORDER BY game_date DESC').all();
  const myTeamIds = req.user.teamIds || [];
  const visibleGames = games.filter((g) => myTeamIds.includes(g.home_team_id) || myTeamIds.includes(g.opponent_team_id));
  res.json(await Promise.all(visibleGames.map((g) => getGameWithReportStatus(g.id))));
});

router.get('/:id', requireGameAccess('id'), async (req, res) => {
  const game = await getGameWithReportStatus(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
});

// Remove a duplicate/mistaken game record. Blocked (409) if any real
// player_game_stats rows are attached -- same delete-guard discipline as
// seasons.js/competitions.js. A game with reports referencing it but no
// player_game_stats (e.g. only a failed extraction) will still fail here
// via the games.reports foreign key, which is an acceptable safe failure,
// not something this route needs to special-case.
router.delete('/:id', requireRole('Statistician', 'Team Manager'), requireGameAccess('id'), async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.prepare('SELECT id FROM games WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const statsCount = await db.prepare('SELECT COUNT(*) AS count FROM player_game_stats WHERE game_id = ?').get(id);
    if (Number(statsCount.count) > 0) {
      return res.status(409).json({ error: `Cannot delete game: ${statsCount.count} real player stat row(s) are attached` });
    }

    await db.prepare('DELETE FROM games WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('remove game failed:', err);
    res.status(500).json({ error: err.message });
  }
});

async function getGameWithReportStatus(gameId) {
  const game = await db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
  if (!game) return null;
  const uploaded = await db.prepare('SELECT report_type, extraction_status FROM reports WHERE game_id = ?').all(gameId);
  const uploadedTypes = new Set(uploaded.map((r) => r.report_type));
  const reportChecklist = REPORT_TYPES.map((type) => ({
    type,
    uploaded: uploadedTypes.has(type),
    status: uploaded.find((r) => r.report_type === type)?.extraction_status || 'not_uploaded',
  }));
  // FR-02's "outcome" field: rather than duplicating a score column on
  // `games`, this reads the real result from game_score_sheet once a
  // Score Sheet report has actually been extracted for this game. Until
  // then, outcome is honestly "pending", not a fabricated value.
  const scoreSheet = await db.prepare(
    'SELECT winning_team, final_score_team_a, final_score_team_b FROM game_score_sheet WHERE game_id = ?',
  ).get(gameId);
  // winningTeamId: winning_team is raw text off the Score Sheet PDF (e.g.
  // "USIU TIGERS"), not a resolved team id -- resolved here against this
  // game's own two real sides using the same normalized-substring match
  // teamSide.js's assignTeamSides already uses for exactly this kind of
  // raw-PDF-text-vs-team-identity reconciliation, reused directly rather
  // than duplicated. Confirmed against real production data before
  // relying on this: winning_team matches home_team_id/opponent_team_id
  // directly in every existing real game_score_sheet row. null (not a
  // guess) if it matches neither side -- an honestly unresolved outcome,
  // distinct from no Score Sheet having been uploaded at all.
  let winningTeamId = null;
  if (scoreSheet) {
    const normalizedWinner = normalizeTeamName(scoreSheet.winning_team);
    if (normalizedWinner) {
      const normalizedHome = normalizeTeamName(game.home_team_id);
      const normalizedOpponent = normalizeTeamName(game.opponent_team_id);
      if (normalizedHome && (normalizedWinner.includes(normalizedHome) || normalizedHome.includes(normalizedWinner))) {
        winningTeamId = game.home_team_id;
      } else if (normalizedOpponent && (normalizedWinner.includes(normalizedOpponent) || normalizedOpponent.includes(normalizedWinner))) {
        winningTeamId = game.opponent_team_id;
      }
    }
  }
  // Whether this game has any real extracted player stats -- the actual
  // condition that determines whether it's safe to delete (see DELETE
  // /:id below), not a proxy like "outcome pending" (a game can have real
  // stats but still show outcome-pending if no Score Sheet was uploaded).
  const statsRow = await db.prepare(
    'SELECT EXISTS (SELECT 1 FROM player_game_stats WHERE game_id = ?) AS has_stats',
  ).get(gameId);
  return {
    ...game,
    reportChecklist,
    outcome: scoreSheet
      ? { winningTeam: scoreSheet.winning_team, winningTeamId, scoreA: scoreSheet.final_score_team_a, scoreB: scoreSheet.final_score_team_b }
      : null,
    hasStats: Boolean(statsRow.has_stats),
  };
}

module.exports = router;