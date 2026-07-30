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
router.post('/', requireRole('Administrator', 'Statistician'), (req, res) => {
  const { seasonId, leagueId, homeTeamId, opponentTeamId, gameDate } = req.body;
  if (!homeTeamId || !opponentTeamId || !gameDate) {
    return res.status(400).json({ error: 'homeTeamId, opponentTeamId, gameDate are required' });
  }
  const result = db.prepare(`
    INSERT INTO games (season_id, league_id, home_team_id, opponent_team_id, game_date, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(seasonId || null, leagueId || null, homeTeamId, opponentTeamId, gameDate, req.user.id);

  res.status(201).json(getGameWithReportStatus(result.lastInsertRowid));
});

router.get('/', (req, res) => {
  const games = db.prepare('SELECT * FROM games ORDER BY game_date DESC').all();
  res.json(games.map((g) => getGameWithReportStatus(g.id)));
});

router.get('/:id', (req, res) => {
  const game = getGameWithReportStatus(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
});

function getGameWithReportStatus(gameId) {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
  if (!game) return null;
  const uploaded = db.prepare('SELECT report_type, extraction_status FROM reports WHERE game_id = ?').all(gameId);
  const uploadedTypes = new Set(uploaded.map((r) => r.report_type));
  const reportChecklist = REPORT_TYPES.map((type) => ({
    type,
    uploaded: uploadedTypes.has(type),
    status: uploaded.find((r) => r.report_type === type)?.extraction_status || 'not_uploaded',
  }));
  return { ...game, reportChecklist };
}

module.exports = router;
