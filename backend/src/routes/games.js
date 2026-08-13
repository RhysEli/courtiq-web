const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const REPORT_TYPES = [
  'Box Score', 'Play-by-Play', 'Player Evaluation', 'Plus Minus Summary',
  'Quarter Scoring', 'Rotation Summary', 'Lineup Analysis', 'Shot Areas',
  'Shot Charts', 'Score Sheet',
];

// Create a game record (Statistician/Team Manager, per proposal's RBAC design — FR-11 gives Team Manager season/competition administration).
router.post('/', requireRole('Administrator', 'Statistician', 'Team Manager'), async (req, res) => {
  const { seasonId, leagueId, homeTeamId, gameDate, venue } = req.body;
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
  const opponentTeamId = opponentTeamName.trim();
  await db.prepare('INSERT INTO teams (id, name) VALUES (?, ?) ON CONFLICT (id) DO NOTHING').run(opponentTeamId, opponentTeamId);

  const result = await db.prepare(`
    INSERT INTO games (season_id, league_id, home_team_id, opponent_team_id, game_date, venue, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `).run(seasonId || null, leagueId || null, homeTeamId, opponentTeamId, gameDate, venue || null, req.user.id);

  res.status(201).json(await getGameWithReportStatus(result.lastInsertRowid));
});

router.get('/', async (req, res) => {
  const games = await db.prepare('SELECT * FROM games ORDER BY game_date DESC').all();
  res.json(await Promise.all(games.map((g) => getGameWithReportStatus(g.id))));
});

router.get('/:id', async (req, res) => {
  const game = await getGameWithReportStatus(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
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
  return {
    ...game,
    reportChecklist,
    outcome: scoreSheet
      ? { winningTeam: scoreSheet.winning_team, scoreA: scoreSheet.final_score_team_a, scoreB: scoreSheet.final_score_team_b }
      : null,
  };
}

module.exports = router;