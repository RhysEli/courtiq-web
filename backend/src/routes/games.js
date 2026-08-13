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

// Create a game record (Statistician only, per proposal's RBAC design).
router.post('/', requireRole('Administrator', 'Statistician'), async (req, res) => {
  const { seasonId, leagueId, homeTeamId, opponentTeamId, gameDate, venue } = req.body;
  if (!homeTeamId || !opponentTeamId || !gameDate) {
    return res.status(400).json({ error: 'homeTeamId, opponentTeamId, gameDate are required' });
  }
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