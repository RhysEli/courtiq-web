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
// Same possessions estimate computeTeamMetrics has always used for `t`,
// pulled out so it can also be applied to `opp` -- Steal% and Defensive
// Rating (Step 49) both need the OPPONENT's own possessions estimate,
// not the team's, and re-deriving that formula a second time inline
// would risk the two copies drifting apart.
function computePossessions(totals) {
  return totals.fga - totals.oreb + totals.turnovers + 0.44 * totals.fta;
}

function computeTeamMetrics(t, opp) {
  const trueShootingAttempts = t.fga + 0.44 * t.fta;
  const tsPct = safeDiv(t.points, 2 * trueShootingAttempts) * 100;

  const efgPct = safeDiv(t.fgm + 0.5 * t.three_pm, t.fga) * 100;

  // Possessions estimate (standard formula used across public analytics).
  const possessions = computePossessions(t);
  const pointsPerPossession = safeDiv(t.points, possessions);

  const turnoverRate = safeDiv(t.turnovers, possessions) * 100;

  const orebPct = safeDiv(t.oreb, t.oreb + (opp ? opp.dreb : 0)) * 100;

  // Step 49: fixed to FTA/FGA (the standard definition), matching the
  // player-level ftRatePct Step 48 already added correctly. This was
  // FTM/FGA (makes) before -- confirmed wrong against the standard
  // definition, and confirmed (Step 49) to already be feeding the live
  // AI narrative via fourFactors.freeThrowRatePct below. Not silently
  // patched: see this round's real before/after narrative check.
  const ftRate = safeDiv(t.fta, t.fga) * 100;

  // Dean Oliver's Four Factors, in his standard weighting.
  const fourFactors = {
    shooting: efgPct,          // 40%
    turnovers: turnoverRate,   // 25%
    rebounding: orebPct,       // 20%
    freeThrows: ftRate,        // 15%
  };

  // Step 49 additions -- all confirmed cheap derivations from fields
  // already in `t`/`opp` (Step 47's data-readiness finding), no new
  // extraction.
  const dreb = opp
    ? safeDiv(t.dreb, t.dreb + opp.oreb) * 100
    : null;

  const totalRebPct = opp
    ? safeDiv(t.oreb + t.dreb, (t.oreb + t.dreb) + (opp.oreb + opp.dreb)) * 100
    : null;

  // Steal %: "STL per 100 opp possessions" -- the exact real formula
  // confirmed (Step 49) from reference-analysis-format's own file 2
  // (the only one of the three reference files that defines this metric
  // explicitly), not guessed. Uses the OPPONENT's own possessions
  // estimate (computePossessions(opp)), not the team's own -- a steal
  // ends one of the opponent's possessions, not one of the team's.
  const oppPossessions = opp ? computePossessions(opp) : null;
  const stealPct = opp ? safeDiv(t.steals, oppPossessions) * 100 : null;

  const threePointAttemptRatePct = safeDiv(t.three_pa, t.fga) * 100;

  // Offensive/Defensive Rating: points scored/allowed per 100 real
  // possessions. ORtg is just pointsPerPossession*100 restated on the
  // conventional per-100 basis; DRtg is the opponent's own points scored
  // per 100 of THEIR possessions (i.e. how efficiently they scored
  // against this team) -- confirmed against reference file 3's real
  // numbers, where team A's DRtg exactly equals team B's ORtg for the
  // same real game (61.6 / 53.9 mirrored on both sides).
  const offensiveRating = pointsPerPossession * 100;
  const defensiveRating = opp ? safeDiv(opp.points, oppPossessions) * 100 : null;
  const netRating = opp ? offensiveRating - defensiveRating : null;

  return {
    points: t.points,
    trueShootingPct: round1(tsPct),
    effectiveFgPct: round1(efgPct),
    possessionsEstimate: round1(possessions),
    pointsPerPossession: round2(pointsPerPossession),
    turnoverRatePct: round1(turnoverRate),
    offensiveReboundPct: round1(orebPct),
    freeThrowRatePct: round1(ftRate),
    defensiveReboundPct: dreb === null ? null : round1(dreb),
    totalReboundPct: totalRebPct === null ? null : round1(totalRebPct),
    stealPct: stealPct === null ? null : round1(stealPct),
    threePointAttemptRatePct: round1(threePointAttemptRatePct),
    offensiveRating: round1(offensiveRating),
    defensiveRating: defensiveRating === null ? null : round1(defensiveRating),
    netRating: netRating === null ? null : round1(netRating),
    fourFactors: {
      shootingEfgPct: round1(fourFactors.shooting),
      turnoverRatePct: round1(fourFactors.turnovers),
      offensiveReboundPct: round1(fourFactors.rebounding),
      freeThrowRatePct: round1(fourFactors.freeThrows),
    },
  };
}

// Minimum real minutes played before a per-40-minute projection is shown
// at all -- below this, scaling up a real but tiny sample (e.g. 1 rebound
// in 2 real minutes -> a "20 rebounds/40min" projection) produces a
// number that's technically arithmetic but not a real, trustworthy
// estimate of anything. No rigorous statistical convention fixes this
// value the way Four Factors' weightings are fixed -- this is a judgment
// call, same "starting point, calibrate against real game data" spirit
// as tagInsights' own thresholds. 10 real minutes is the cutoff used
// here: confirmed against real per-game data (Step 49) that this
// correctly excludes real garbage-time/foul-trouble cameos (a real 1.6-
// or 4.2-minute stint) while still covering every real rotation player.
const MIN_MINUTES_FOR_PER40 = 10;

function computePlayerMetrics(p) {
  const trueShootingAttempts = p.fga + 0.44 * p.fta;
  const tsPct = safeDiv(p.points, 2 * trueShootingAttempts) * 100;
  const efgPct = safeDiv(p.fgm + 0.5 * p.three_pm, p.fga) * 100;

  // FIBA Efficiency Index: (PTS+REB+AST+STL+BLK) - (missed FG + missed FT
  // + TO). Real field names confirmed against player_game_stats (Step
  // 47/49): missed FG = fga - fgm, missed FT = fta - ftm, both already
  // real integer columns, no derivation needed beyond the subtraction.
  const missedFg = p.fga - p.fgm;
  const missedFt = p.fta - p.ftm;
  const fibaEfficiency = (p.points + p.reb + p.assists + p.steals + p.blocks)
    - (missedFg + missedFt + p.turnovers);

  // AST/TO ratio: no existing real precedent for this exact stat
  // anywhere in this codebase (confirmed by grep, Step 49) to stay
  // consistent with -- but plusMinus just below already establishes this
  // file's own real convention for "not a real number to report": null,
  // not a misleading 0. turnovers = 0 with real assists on the board is
  // a real, observed case (e.g. game 5's Austin Muriuki: 1 AST, 0 TO) --
  // dividing would either throw or (via safeDiv) silently print 0, which
  // reads as "terrible ball security" for a player who committed zero
  // turnovers. null here, for the UI to render as "—" later, same as
  // this file's existing null-for-plusMinus precedent.
  const astToRatio = p.turnovers > 0 ? round2(p.assists / p.turnovers) : null;

  // 3-point attempt rate and FT rate, both relative to FGA (the standard
  // definitions). FT rate is deliberately FTA/FGA here, NOT the FTM/FGA
  // formula this file's own computeTeamMetrics uses for freeThrowRatePct
  // -- Step 47 flagged that team-level formula as non-standard (uses
  // makes, not attempts); not copying the same mistake into new
  // player-level code. FTA can exceed FGA for a player who draws a lot of
  // contact relative to how often he actually shoots (a real, correct,
  // not-capped-at-100% result -- confirmed real, Step 49: Austin Muriuki,
  // game 5, 6 FTA on just 1 FGA -> a real 600% FT rate, not a bug).
  const threePointAttemptRatePct = safeDiv(p.three_pa, p.fga) * 100;
  const ftRatePct = safeDiv(p.fta, p.fga) * 100;

  // Per-40-minute projections: real per-game counting stats scaled to a
  // 40-minute basis, using the real `minutes` column already stored on
  // every player_game_stats row. null (the whole object, not a guessed
  // number) below MIN_MINUTES_FOR_PER40 or when minutes itself is real
  // but missing (older rows / a report type that didn't carry it) --
  // same "don't show a real-looking number that isn't a real estimate"
  // reasoning as the threshold comment above.
  const per40 = (p.minutes && p.minutes >= MIN_MINUTES_FOR_PER40) ? {
    points: round1((p.points / p.minutes) * 40),
    rebounds: round1((p.reb / p.minutes) * 40),
    assists: round1((p.assists / p.minutes) * 40),
    steals: round1((p.steals / p.minutes) * 40),
    blocks: round1((p.blocks / p.minutes) * 40),
    turnovers: round1((p.turnovers / p.minutes) * 40),
  } : null;

  return {
    playerName: p.player_name,
    points: p.points,
    trueShootingPct: round1(tsPct),
    effectiveFgPct: round1(efgPct),
    reboundsTotal: p.reb,
    assists: p.assists,
    turnovers: p.turnovers,
    plusMinus: p.plus_minus ?? null,
    fibaEfficiency,
    astToRatio,
    threePointAttemptRatePct: round1(threePointAttemptRatePct),
    ftRatePct: round1(ftRatePct),
    per40,
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
