// Rule-based analytical engine (Sprint III).
// All statistical computation here is deterministic — no ML, no LLM.
// Formulas follow standard basketball analytics definitions (Oliver, Four Factors).

function safeDiv(numerator, denominator) {
  if (!denominator) return 0;
  return numerator / denominator;
}

/**
 * @param {object} t - team totals: { points, fgm, fga, three_pm, three_pa, ftm, fta,
 *                      oreb, dreb, reb, assists, steals, blocks, turnovers, fouls }
 * @param {object} opp - opponent totals, same shape (needed for possession estimate + Four Factors)
 */
function computeTeamMetrics(t, opp) {
  const trueShootingAttempts = t.fga + 0.44 * t.fta;
  const tsPct = safeDiv(t.points, 2 * trueShootingAttempts) * 100;

  const efgPct = safeDiv(t.fgm + 0.5 * t.three_pm, t.fga) * 100;

  // Possessions estimate (standard formula used across public analytics).
  const possessions =
    t.fga - t.oreb + t.turnovers + 0.44 * t.fta;
  const pointsPerPossession = safeDiv(t.points, possessions);

  const turnoverRate = safeDiv(t.turnovers, possessions) * 100;

  const orebPct = safeDiv(t.oreb, t.oreb + (opp ? opp.dreb : 0)) * 100;

  const ftRate = safeDiv(t.ftm, t.fga) * 100;

  // Dean Oliver's Four Factors, in his standard weighting.
  const fourFactors = {
    shooting: efgPct,          // 40%
    turnovers: turnoverRate,   // 25%
    rebounding: orebPct,       // 20%
    freeThrows: ftRate,        // 15%
  };

  return {
    points: t.points,
    trueShootingPct: round1(tsPct),
    effectiveFgPct: round1(efgPct),
    possessionsEstimate: round1(possessions),
    pointsPerPossession: round2(pointsPerPossession),
    turnoverRatePct: round1(turnoverRate),
    offensiveReboundPct: round1(orebPct),
    freeThrowRatePct: round1(ftRate),
    fourFactors: {
      shootingEfgPct: round1(fourFactors.shooting),
      turnoverRatePct: round1(fourFactors.turnovers),
      offensiveReboundPct: round1(fourFactors.rebounding),
      freeThrowRatePct: round1(fourFactors.freeThrows),
    },
  };
}

function computePlayerMetrics(p) {
  const trueShootingAttempts = p.fga + 0.44 * p.fta;
  const tsPct = safeDiv(p.points, 2 * trueShootingAttempts) * 100;
  const efgPct = safeDiv(p.fgm + 0.5 * p.three_pm, p.fga) * 100;

  return {
    playerName: p.player_name,
    points: p.points,
    trueShootingPct: round1(tsPct),
    effectiveFgPct: round1(efgPct),
    reboundsTotal: p.reb,
    assists: p.assists,
    turnovers: p.turnovers,
    plusMinus: p.plus_minus ?? null,
  };
}

function round1(n) { return Math.round((n + Number.EPSILON) * 10) / 10; }
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

// Rule-based insight tagging: conditional logic converting numbers into
// tactical labels, per the proposal's "Turnover Destruction" / "3-Point
// Collapse" / "Bench Superiority" examples. These thresholds are a
// starting point — calibrate against real game data.
function tagInsights(homeMetrics, oppMetrics, homePlayers, oppPlayers) {
  const tags = [];

  const tovDiff = homeMetrics.turnoverRatePct - oppMetrics.turnoverRatePct;
  if (tovDiff <= -8) tags.push({ tag: 'Turnover Destruction', team: 'home', detail: `Home turnover rate (${homeMetrics.turnoverRatePct}%) was well below the opponent's (${oppMetrics.turnoverRatePct}%).` });
  if (tovDiff >= 8) tags.push({ tag: 'Turnover Destruction', team: 'opponent', detail: `Opponent turnover rate (${oppMetrics.turnoverRatePct}%) was well below home's (${homeMetrics.turnoverRatePct}%).` });

  if (homeMetrics.effectiveFgPct < 40) tags.push({ tag: '3-Point Collapse', team: 'home', detail: `Home eFG% (${homeMetrics.effectiveFgPct}%) indicates a cold shooting night.` });
  if (oppMetrics.effectiveFgPct < 40) tags.push({ tag: '3-Point Collapse', team: 'opponent', detail: `Opponent eFG% (${oppMetrics.effectiveFgPct}%) indicates a cold shooting night.` });

  if (homeMetrics.offensiveReboundPct >= 35) tags.push({ tag: 'Offensive Boards Dominance', team: 'home', detail: `Home offensive rebound rate of ${homeMetrics.offensiveReboundPct}%.` });
  if (oppMetrics.offensiveReboundPct >= 35) tags.push({ tag: 'Offensive Boards Dominance', team: 'opponent', detail: `Opponent offensive rebound rate of ${oppMetrics.offensiveReboundPct}%.` });

  // Bench Superiority: same symmetric-differential shape as Turnover
  // Destruction above. benchPoints is attached onto homeMetrics/
  // oppMetrics by analysis.js's compute route (real, computed from
  // game_rotation_stints + player_game_stats -- see getStarterJerseys/
  // benchPointsFromRows there), not part of computeTeamMetrics' own pure
  // box-score-totals calculation. null on either side means that team
  // has no rotation data for this game -- skip the tag entirely rather
  // than guessing, same as every other "no data yet" gap in this app.
  //
  // Threshold (10 points): no rigorous analytics convention exists for
  // this the way Four Factors' weightings do -- same "starting point,
  // calibrate against real game data" spirit as every threshold above
  // (see this function's own opening comment), anchored to the loose
  // ~10-point bench differential broadcast commentary commonly treats as
  // notable. A real, working value, not a placeholder left for later.
  if (homeMetrics.benchPoints != null && oppMetrics.benchPoints != null) {
    const benchDiff = homeMetrics.benchPoints - oppMetrics.benchPoints;
    if (benchDiff >= 10) tags.push({ tag: 'Bench Superiority', team: 'home', detail: `Home bench outscored the opponent's bench ${homeMetrics.benchPoints}-${oppMetrics.benchPoints}.` });
    if (benchDiff <= -10) tags.push({ tag: 'Bench Superiority', team: 'opponent', detail: `Opponent bench outscored home's bench ${oppMetrics.benchPoints}-${homeMetrics.benchPoints}.` });
  }

  return tags;
}

module.exports = { computeTeamMetrics, computePlayerMetrics, tagInsights };
