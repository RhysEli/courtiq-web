const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, requireGameAccess, requireStatisticianOrFallback } = require('../middleware/auth');
const { computeTeamMetrics, computePlayerMetrics, tagInsights } = require('../services/metrics');
const { generateGameNarrative } = require('../services/narrative');
const { logAction } = require('../services/auditLog');

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

// Starting five's jersey numbers for `realTeamId` in this game, read off
// the first game_rotation_stints row (the opening tip: quarter_on 1, the
// highest/earliest time_on since the clock counts down) -- confirmed
// against 6 real games that this row always lists exactly the starting
// five, with a jersey-number join to player_game_stats reconciling
// exactly to the team's real final score every time (investigation,
// Step 26).
//
// Joined on team_name, never team_side: game_rotation_stints.team_side
// does NOT reliably agree with player_game_stats.team_side for the same
// physical team (confirmed inverted in 2 of 6 real games checked --
// each report type's extractor decides home/opponent independently).
// team_name is the real team id string in every game checked and is
// what's actually reliable here. Flagged, not fixed -- the team_side
// disagreement itself is a separate, pre-existing bug out of this
// round's scope.
//
// Returns null (not an empty Set) when this team has no rotation data
// for this game at all -- the caller uses that to report bench points as
// honestly absent, not a guessed/fabricated zero.
async function getStarterJerseys(gameId, realTeamId) {
  const firstStint = await db.prepare(`
    SELECT players_json FROM game_rotation_stints
    WHERE game_id = ? AND team_name = ?
    ORDER BY quarter_on ASC, time_on DESC LIMIT 1
  `).get(gameId, realTeamId);
  if (!firstStint) return null;
  return new Set(JSON.parse(firstStint.players_json).map((p) => p.jersey_number));
}

// Splits one side's player_game_stats rows into starter/bench point
// totals using each row's own raw_extraction.jersey_number (already
// embedded per row at ingestion time -- see persistExtractedReports.js/
// bulkImport.js/reports.js's Box Score persistence) against the starter
// jersey Set from getStarterJerseys above.
function benchPointsFromRows(playerRows, starterJerseys) {
  let benchPoints = 0;
  for (const row of playerRows) {
    const jersey = JSON.parse(row.raw_extraction).jersey_number;
    if (!starterJerseys.has(jersey)) benchPoints += row.points || 0;
  }
  return benchPoints;
}

// Trigger metric computation for a game once its Box Score is extracted.
// (Full pipeline needs all 10 reports per the proposal; this computes what's
// derivable from Box Score data alone, which covers the core Four Factors.)
//
// POSTGRES MIGRATION FIX: this whole route was never actually converted
// despite being listed as done -- wasn't async, and every db call was
// missing await (so playerRows was a Promise, not an array, causing
// "playerRows.filter is not a function"). Also fixed datetime('now')
// (SQLite-only) -> NOW() (Postgres) in the metrics upsert below.
//
// Statistician-primary, Team-Manager-fallback (requireStatisticianOrFallback,
// same as report uploads): this is the rule-based Four Factors/shooting-
// percentage engine (schema.sql's own description), deriving numbers
// straight out of already-extracted box score rows -- treated as "import/
// store statistics" work, not the "deeper AI analysis" the fallback rule
// carves out. That carve-out is specifically the narrative route right
// below, which calls the Claude API and stays Statistician-only, no
// fallback, ever.
router.post('/games/:gameId/compute', requireRole('Statistician', 'Team Manager'), requireGameAccess('gameId'), requireStatisticianOrFallback('gameId'), async (req, res) => {
  try {
    const { gameId } = req.params;
    const playerRows = await db.prepare('SELECT * FROM player_game_stats WHERE game_id = ?').all(gameId);
    if (playerRows.length === 0) {
      await logAction(req.user.id, 'compute', `Compute metrics: game #${gameId} (no extracted player stats)`, false);
      return res.status(422).json({ error: 'No extracted player stats found for this game. Upload and extract a Box Score first.' });
    }

    const homeRows = playerRows.filter((p) => p.team_side === 'home');
    const oppRows = playerRows.filter((p) => p.team_side === 'opponent');
    const homeTotals = aggregateTeamTotals(homeRows);
    const oppTotals = aggregateTeamTotals(oppRows);

    const homeMetrics = computeTeamMetrics(homeTotals, oppTotals);
    const oppMetrics = computeTeamMetrics(oppTotals, homeTotals);

    // Bench points: real, computed from already-extracted rotation data
    // (Step 26 investigation), not a fabricated placeholder. Attached
    // directly onto homeMetrics/oppMetrics (rather than threaded through
    // computeTeamMetrics' own signature) so computeTeamMetrics stays the
    // pure box-score-totals function its own docblock describes, and so
    // tagInsights below can read it off the same metrics objects without
    // a signature change.
    const game = await db.prepare('SELECT home_team_id, opponent_team_id FROM games WHERE id = ?').get(gameId);
    const homeStarters = await getStarterJerseys(gameId, game.home_team_id);
    const oppStarters = await getStarterJerseys(gameId, game.opponent_team_id);
    homeMetrics.benchPoints = homeStarters ? benchPointsFromRows(homeRows, homeStarters) : null;
    oppMetrics.benchPoints = oppStarters ? benchPointsFromRows(oppRows, oppStarters) : null;

    const insightTags = tagInsights(homeMetrics, oppMetrics, homeRows, oppRows);
    const playerMetrics = playerRows.map(computePlayerMetrics);

    const metricsPayload = {
      home: { ...homeMetrics, raw: homeTotals },
      opponent: { ...oppMetrics, raw: oppTotals },
      players: playerMetrics,
    };

    await db.prepare(`
      INSERT INTO game_metrics (game_id, metrics_json, insight_tags_json)
      VALUES (?, ?, ?)
      ON CONFLICT (game_id) DO UPDATE SET metrics_json = excluded.metrics_json,
        insight_tags_json = excluded.insight_tags_json, computed_at = NOW()
    `).run(gameId, JSON.stringify(metricsPayload), JSON.stringify(insightTags));

    await db.prepare("UPDATE games SET status = 'extracted' WHERE id = ?").run(gameId);

    await logAction(req.user.id, 'compute', `Compute metrics: game #${gameId}`, true);
    res.json({ metrics: metricsPayload, insightTags });
  } catch (err) {
    console.error('compute failed:', err);
    await logAction(req.user.id, 'compute', `Compute metrics: game #${req.params.gameId} (${err.message})`, false);
    res.status(500).json({ error: `Metric computation failed: ${err.message}` });
  }
});

// Generate the AI narrative from already-computed metrics. Statistician-
// only, no Team Manager fallback, even for a team with no Statistician --
// this is the actual "deeper AI analysis" the fallback rule explicitly
// carves out, as distinct from compute's rule-based numbers just above.
// Coach keeps its existing access here unchanged (untouched by the
// Statistician/Team Manager split -- Coach was never part of it).
//
// POSTGRES MIGRATION FIX: this route WAS marked async, but still had
// unawaited db.prepare(...).get(...) calls (row and game came back as
// unresolved Promises, so row.metrics_json etc would have thrown or
// behaved incorrectly), plus the same datetime('now') -> NOW() fix as
// above in the narrative upsert.
router.post('/games/:gameId/narrative', requireRole('Statistician', 'Coach'), requireGameAccess('gameId'), async (req, res) => {
  const { gameId } = req.params;
  try {
    const row = await db.prepare('SELECT * FROM game_metrics WHERE game_id = ?').get(gameId);
    if (!row) {
      await logAction(req.user.id, 'narrative', `Generate narrative: game #${gameId} (metrics not computed yet)`, false);
      return res.status(422).json({ error: 'Metrics have not been computed for this game yet. Call /compute first.' });
    }
    const game = await db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
    const metrics = JSON.parse(row.metrics_json);
    const insightTags = JSON.parse(row.insight_tags_json || '[]');

    const topPlayers = [...metrics.players]
      .sort((a, b) => b.points - a.points)
      .slice(0, 5);

    const { text, model } = await generateGameNarrative({
      homeTeamName: game.home_team_id,
      opponentTeamName: game.opponent_team_id,
      homeMetrics: metrics.home,
      oppMetrics: metrics.opponent,
      insightTags,
      topPlayers,
    });

    await db.prepare(`
      INSERT INTO game_narratives (game_id, narrative_text, model)
      VALUES (?, ?, ?)
      ON CONFLICT (game_id) DO UPDATE SET narrative_text = excluded.narrative_text,
        model = excluded.model, generated_at = NOW()
    `).run(gameId, text, model);

    await db.prepare("UPDATE games SET status = 'analyzed' WHERE id = ?").run(gameId);
    await logAction(req.user.id, 'narrative', `Generate narrative: game #${gameId} (model ${model})`, true);
    res.json({ narrative: text, model });
  } catch (err) {
    if (err.code === 'MISSING_API_KEY') {
      await logAction(req.user.id, 'narrative', `Generate narrative: game #${gameId} (missing API key)`, false);
      return res.status(503).json({ error: err.message });
    }
    console.error('narrative generation failed:', err);
    await logAction(req.user.id, 'narrative', `Generate narrative: game #${gameId} (${err.message})`, false);
    res.status(502).json({ error: `Narrative generation failed: ${err.message}` });
  }
});

// POSTGRES MIGRATION FIX: wasn't async, both db calls were missing await.
router.get('/games/:gameId', requireGameAccess('gameId'), async (req, res) => {
  try {
    const metricsRow = await db.prepare('SELECT * FROM game_metrics WHERE game_id = ?').get(req.params.gameId);
    const narrativeRow = await db.prepare('SELECT * FROM game_narratives WHERE game_id = ?').get(req.params.gameId);
    res.json({
      metrics: metricsRow ? JSON.parse(metricsRow.metrics_json) : null,
      insightTags: metricsRow ? JSON.parse(metricsRow.insight_tags_json || '[]') : [],
      narrative: narrativeRow ? narrativeRow.narrative_text : null,
    });
  } catch (err) {
    console.error('fetch analysis failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;