const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { computeTeamMetrics, computePlayerMetrics, tagInsights } = require('../services/metrics');
const { generateGameNarrative } = require('../services/narrative');

const router = express.Router();
router.use(requireAuth);

function aggregateTeamTotals(playerRows) {
  const totals = { points: 0, fgm: 0, fga: 0, three_pm: 0, three_pa: 0, ftm: 0, fta: 0,
    oreb: 0, dreb: 0, reb: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0 };
  for (const p of playerRows) {
    totals.points += p.points || 0;
    totals.fgm += p.fgm || 0; totals.fga += p.fga || 0;
    totals.three_pm += p.three_pm || 0; totals.three_pa += p.three_pa || 0;
    totals.ftm += p.ftm || 0; totals.fta += p.fta || 0;
    totals.oreb += p.oreb || 0; totals.dreb += p.dreb || 0; totals.reb += p.reb || 0;
    totals.assists += p.assists || 0; totals.steals += p.steals || 0; totals.blocks += p.blocks || 0;
    totals.turnovers += p.turnovers || 0; totals.fouls += p.fouls || 0;
  }
  return totals;
}

// Trigger metric computation for a game once its Box Score is extracted.
// (Full pipeline needs all 10 reports per the proposal; this computes what's
// derivable from Box Score data alone, which covers the core Four Factors.)
router.post('/games/:gameId/compute', requireRole('Administrator', 'Statistician'), (req, res) => {
  const { gameId } = req.params;
  const playerRows = db.prepare('SELECT * FROM player_game_stats WHERE game_id = ?').all(gameId);
  if (playerRows.length === 0) {
    return res.status(422).json({ error: 'No extracted player stats found for this game. Upload and extract a Box Score first.' });
  }

  const homeRows = playerRows.filter((p) => p.team_side === 'home');
  const oppRows = playerRows.filter((p) => p.team_side === 'opponent');
  const homeTotals = aggregateTeamTotals(homeRows);
  const oppTotals = aggregateTeamTotals(oppRows);

  const homeMetrics = computeTeamMetrics(homeTotals, oppTotals);
  const oppMetrics = computeTeamMetrics(oppTotals, homeTotals);
  const insightTags = tagInsights(homeMetrics, oppMetrics, homeRows, oppRows);
  const playerMetrics = playerRows.map(computePlayerMetrics);

  const metricsPayload = {
    home: { ...homeMetrics, raw: homeTotals },
    opponent: { ...oppMetrics, raw: oppTotals },
    players: playerMetrics,
  };

  db.prepare(`
    INSERT INTO game_metrics (game_id, metrics_json, insight_tags_json)
    VALUES (?, ?, ?)
    ON CONFLICT(game_id) DO UPDATE SET metrics_json = excluded.metrics_json,
      insight_tags_json = excluded.insight_tags_json, computed_at = datetime('now')
  `).run(gameId, JSON.stringify(metricsPayload), JSON.stringify(insightTags));

  db.prepare("UPDATE games SET status = 'extracted' WHERE id = ?").run(gameId);

  res.json({ metrics: metricsPayload, insightTags });
});

// Generate the AI narrative from already-computed metrics.
router.post('/games/:gameId/narrative', requireRole('Administrator', 'Statistician', 'Coach'), async (req, res) => {
  const { gameId } = req.params;
  const row = db.prepare('SELECT * FROM game_metrics WHERE game_id = ?').get(gameId);
  if (!row) {
    return res.status(422).json({ error: 'Metrics have not been computed for this game yet. Call /compute first.' });
  }
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
  const metrics = JSON.parse(row.metrics_json);
  const insightTags = JSON.parse(row.insight_tags_json || '[]');

  const topPlayers = [...metrics.players]
    .sort((a, b) => b.points - a.points)
    .slice(0, 5);

  try {
    const { text, model } = await generateGameNarrative({
      homeTeamName: game.home_team_id,
      opponentTeamName: game.opponent_team_id,
      homeMetrics: metrics.home,
      oppMetrics: metrics.opponent,
      insightTags,
      topPlayers,
    });

    db.prepare(`
      INSERT INTO game_narratives (game_id, narrative_text, model)
      VALUES (?, ?, ?)
      ON CONFLICT(game_id) DO UPDATE SET narrative_text = excluded.narrative_text,
        model = excluded.model, generated_at = datetime('now')
    `).run(gameId, text, model);

    db.prepare("UPDATE games SET status = 'analyzed' WHERE id = ?").run(gameId);
    res.json({ narrative: text, model });
  } catch (err) {
    if (err.code === 'MISSING_API_KEY') {
      return res.status(503).json({ error: err.message });
    }
    res.status(502).json({ error: `Narrative generation failed: ${err.message}` });
  }
});

router.get('/games/:gameId', (req, res) => {
  const metricsRow = db.prepare('SELECT * FROM game_metrics WHERE game_id = ?').get(req.params.gameId);
  const narrativeRow = db.prepare('SELECT * FROM game_narratives WHERE game_id = ?').get(req.params.gameId);
  res.json({
    metrics: metricsRow ? JSON.parse(metricsRow.metrics_json) : null,
    insightTags: metricsRow ? JSON.parse(metricsRow.insight_tags_json || '[]') : [],
    narrative: narrativeRow ? narrativeRow.narrative_text : null,
  });
});

module.exports = router;
