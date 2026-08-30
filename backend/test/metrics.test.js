const test = require('node:test');
const assert = require('node:assert/strict');
const { computeTeamMetrics, computePlayerMetrics, tagInsights } = require('../src/services/metrics.js');

// Pure/deterministic rule-based engine (backend/src/services/metrics.js) --
// no DB, no network, no mocking needed. Same node:test + node:assert/strict
// style as the frontend's src/**/*.test.mjs files.

test('computeTeamMetrics: normal box score computes expected Four Factors and shooting/possession stats', () => {
  // Hand-calculated from these totals:
  //   trueShootingAttempts = fga + 0.44*fta        = 70 + 0.44*20  = 78.8
  //   TS%   = points / (2 * trueShootingAttempts)  = 84 / 157.6    = 53.2994...% -> 53.3
  //   eFG%  = (fgm + 0.5*three_pm) / fga            = 34 / 70       = 48.5714...% -> 48.6
  //   poss  = fga - oreb + turnovers + 0.44*fta     = 70-12+11+8.8  = 77.8
  //   PPP   = points / poss                         = 84 / 77.8     = 1.07969... -> 1.08
  //   TOV%  = turnovers / poss                      = 11 / 77.8     = 14.1388...% -> 14.1
  //   OREB% = oreb / (oreb + opp.dreb)               = 12 / (12+30)  = 28.5714...% -> 28.6
  //   FTRate = fta / fga (Step 49 fix -- was ftm/fga) = 20 / 70      = 28.5714...% -> 28.6
  //
  //   Step 49 additions:
  //   oppPoss = opp.fga - opp.oreb + opp.turnovers + 0.44*opp.fta
  //           = 68 - 10 + 14 + 0.44*16              = 79.04
  //   DREB%   = dreb / (dreb + opp.oreb)             = 28 / (28+10)  = 73.6842...% -> 73.7
  //   TReb%   = (oreb+dreb) / ((oreb+dreb)+(opp.oreb+opp.dreb))
  //           = 40 / (40+40)                         = 50.0%
  //   Steal%  = steals / oppPoss                     = 7 / 79.04     = 8.8563...% -> 8.9
  //   3PAr    = three_pa / fga                       = 20 / 70       = 28.5714...% -> 28.6
  //   ORtg    = points/poss * 100                    = 84/77.8*100   = 107.9691...  -> 108.0
  //   DRtg    = opp.points/oppPoss * 100              = 78/79.04*100  = 98.6842...   -> 98.7
  //   NetRtg  = ORtg - DRtg (unrounded)                                              -> 9.3
  const t = { points: 84, fgm: 30, fga: 70, three_pm: 8, three_pa: 20, ftm: 16, fta: 20, oreb: 12, dreb: 28, reb: 40, assists: 18, steals: 7, blocks: 4, turnovers: 11, fouls: 17 };
  const opp = { points: 78, fgm: 28, fga: 68, three_pm: 6, three_pa: 18, ftm: 12, fta: 16, oreb: 10, dreb: 30, reb: 40, assists: 15, steals: 5, blocks: 2, turnovers: 14, fouls: 19 };

  const metrics = computeTeamMetrics(t, opp);

  assert.equal(metrics.points, 84);
  assert.equal(metrics.trueShootingPct, 53.3);
  assert.equal(metrics.effectiveFgPct, 48.6);
  assert.equal(metrics.possessionsEstimate, 77.8);
  assert.equal(metrics.pointsPerPossession, 1.08);
  assert.equal(metrics.turnoverRatePct, 14.1);
  assert.equal(metrics.offensiveReboundPct, 28.6);
  assert.equal(metrics.freeThrowRatePct, 28.6);
  assert.equal(metrics.defensiveReboundPct, 73.7);
  assert.equal(metrics.totalReboundPct, 50);
  assert.equal(metrics.stealPct, 8.9);
  assert.equal(metrics.threePointAttemptRatePct, 28.6);
  assert.equal(metrics.offensiveRating, 108);
  assert.equal(metrics.defensiveRating, 98.7);
  assert.equal(metrics.netRating, 9.3);

  // Four Factors mirrors the same shooting/turnover/rebounding/free-throw figures.
  assert.deepEqual(metrics.fourFactors, {
    shootingEfgPct: 48.6,
    turnoverRatePct: 14.1,
    offensiveReboundPct: 28.6,
    freeThrowRatePct: 28.6,
  });
});

test('computeTeamMetrics: zero field-goal attempts does not produce NaN/Infinity (safeDiv guard)', () => {
  // fga: 0 means the raw formulas for eFG% (fgm/fga), FT Rate (fta/fga)
  // and 3PAr (three_pa/fga) would divide by zero -- safeDiv must guard
  // all three back to 0 instead of NaN/Infinity. Points still come
  // entirely from free throws (5 points on 5-for-6 FT shooting), so TS%,
  // possessions, turnover rate and OREB% stay meaningful (driven by
  // fta/oreb/turnovers, not fga):
  //   trueShootingAttempts = 0 + 0.44*6            = 2.64
  //   TS%   = 5 / (2*2.64)                          = 94.6969...% -> 94.7
  //   eFG%  = (0 + 0.5*0) / 0                       -> guarded to 0 (would be 0/0)
  //   poss  = 0 - 2 + 3 + 0.44*6                    = 3.64 -> rounds to 3.6
  //   PPP   = 5 / 3.64                              = 1.3736... -> 1.37
  //   TOV%  = 3 / 3.64                               = 82.4175...% -> 82.4
  //   OREB% = 2 / (2+4)                              = 33.3333...% -> 33.3
  //   FTRate = 6 / 0                                 -> guarded to 0 (would be Infinity)
  //   3PAr  = 0 / 0                                  -> guarded to 0
  //
  //   Real, complete opponent totals this time (Step 49) -- the original
  //   minimal `{ dreb: 4 }` only worked because the old code touched
  //   exactly one opp field; the new opp-dependent fields need a real,
  //   full totals shape to test honestly rather than exercising
  //   safeDiv's NaN-is-falsy quirk on missing fields (opp.dreb kept at 4
  //   so the existing OREB% assertion is untouched):
  //   oppPoss = 40 - 6 + 5 + 0.44*8                  = 42.52
  //   DREB%   = 0 / (0+6)                             = 0.0%
  //   TReb%   = (2+0) / ((2+0)+(6+4))                 = 16.6666...% -> 16.7
  //   Steal%  = 0 / 42.52                             = 0.0%
  //   ORtg    = 1.373626... * 100                     = 137.3626... -> 137.4
  //   DRtg    = 40 / 42.52 * 100                       = 94.0733...  -> 94.1
  //   NetRtg  = 137.3626... - 94.0733... (unrounded)                 -> 43.3
  const t = { points: 5, fgm: 0, fga: 0, three_pm: 0, three_pa: 0, ftm: 5, fta: 6, oreb: 2, dreb: 0, reb: 2, assists: 0, steals: 0, blocks: 0, turnovers: 3, fouls: 2 };
  const opp = { points: 40, fgm: 15, fga: 40, three_pm: 3, three_pa: 10, ftm: 5, fta: 8, oreb: 6, dreb: 4, reb: 10, assists: 8, steals: 3, blocks: 1, turnovers: 5, fouls: 12 };

  const metrics = computeTeamMetrics(t, opp);

  assert.equal(metrics.effectiveFgPct, 0);
  assert.equal(metrics.freeThrowRatePct, 0);
  assert.equal(metrics.trueShootingPct, 94.7);
  assert.equal(metrics.possessionsEstimate, 3.6);
  assert.equal(metrics.pointsPerPossession, 1.37);
  assert.equal(metrics.turnoverRatePct, 82.4);
  assert.equal(metrics.offensiveReboundPct, 33.3);
  assert.equal(metrics.defensiveReboundPct, 0);
  assert.equal(metrics.totalReboundPct, 16.7);
  assert.equal(metrics.stealPct, 0);
  assert.equal(metrics.threePointAttemptRatePct, 0);
  assert.equal(metrics.offensiveRating, 137.4);
  assert.equal(metrics.defensiveRating, 94.1);
  assert.equal(metrics.netRating, 43.3);

  // No field anywhere in the result should be NaN or Infinity.
  const flat = [
    metrics.trueShootingPct, metrics.effectiveFgPct, metrics.possessionsEstimate, metrics.pointsPerPossession,
    metrics.turnoverRatePct, metrics.offensiveReboundPct, metrics.freeThrowRatePct, metrics.defensiveReboundPct,
    metrics.totalReboundPct, metrics.stealPct, metrics.threePointAttemptRatePct, metrics.offensiveRating,
    metrics.defensiveRating, metrics.netRating, ...Object.values(metrics.fourFactors),
  ];
  for (const value of flat) {
    assert.ok(Number.isFinite(value), `expected finite number, got ${value}`);
  }
});

test('computeTeamMetrics: with no opponent totals, all opponent-dependent new fields are null, not NaN', () => {
  // Not a real call shape today -- both real call sites (analysis.js's
  // compute route) always pass a full, real opponent totals object.
  // orebPct's own opp-optional guard already existed before Step 49
  // though, so this defends the same real function against ever being
  // called this way in the future: the new opponent-dependent fields
  // (DREB%, TReb%, Steal%, DRtg, NetRtg) must follow the same
  // "null, not a guess" convention orebPct already established, not
  // silently compute against undefined opponent fields.
  const t = { points: 50, fgm: 20, fga: 45, three_pm: 4, three_pa: 12, ftm: 6, fta: 8, oreb: 8, dreb: 20, reb: 28, assists: 10, steals: 5, blocks: 2, turnovers: 8, fouls: 10 };

  const metrics = computeTeamMetrics(t);

  assert.equal(metrics.defensiveReboundPct, null);
  assert.equal(metrics.totalReboundPct, null);
  assert.equal(metrics.stealPct, null);
  assert.equal(metrics.defensiveRating, null);
  assert.equal(metrics.netRating, null);
  // Fields that only ever depended on t (or already guarded opp being
  // absent before this round) still compute normally.
  assert.ok(Number.isFinite(metrics.offensiveRating));
  assert.ok(Number.isFinite(metrics.threePointAttemptRatePct));
});

test('computePlayerMetrics: normal case computes expected shooting stats and passes through raw totals', () => {
  // trueShootingAttempts = fga + 0.44*fta = 18 + 0.44*6 = 20.64
  // TS%  = points / (2*20.64) = 24 / 41.28 = 58.1395...% -> 58.1
  // eFG% = (fgm + 0.5*three_pm) / fga = (9 + 1) / 18 = 55.5555...% -> 55.6
  // FIBA EFF = (PTS+REB+AST+STL+BLK) - (missedFG+missedFT+TO)
  //          = (24+8+5+3+1) - ((18-9)+(6-4)+2) = 41 - 13 = 28
  // AST/TO   = 5/2 = 2.5
  // 3PAr     = three_pa/fga = 6/18 = 33.3333...% -> 33.3
  // FT rate  = fta/fga = 6/18 = 33.3333...% -> 33.3 (FTA/FGA, not FTM/FGA)
  // per40 (minutes=30, >= the 10-minute floor):
  //   scale = 40/30 = 1.3333...
  //   PTS/40 = 24*1.3333 = 32.0
  //   REB/40 = 8*1.3333  = 10.6666... -> 10.7
  //   AST/40 = 5*1.3333  = 6.6666...  -> 6.7
  //   STL/40 = 3*1.3333  = 4.0
  //   BLK/40 = 1*1.3333  = 1.3333...  -> 1.3
  //   TO/40  = 2*1.3333  = 2.6666...  -> 2.7
  const p = { player_name: 'Amos Kim', points: 24, fgm: 9, fga: 18, three_pm: 2, three_pa: 6, ftm: 4, fta: 6, reb: 8, assists: 5, steals: 3, blocks: 1, turnovers: 2, plus_minus: 9, minutes: 30 };

  const metrics = computePlayerMetrics(p);

  assert.equal(metrics.playerName, 'Amos Kim');
  assert.equal(metrics.points, 24);
  assert.equal(metrics.trueShootingPct, 58.1);
  assert.equal(metrics.effectiveFgPct, 55.6);
  assert.equal(metrics.reboundsTotal, 8);
  assert.equal(metrics.assists, 5);
  assert.equal(metrics.turnovers, 2);
  assert.equal(metrics.plusMinus, 9);
  assert.equal(metrics.fibaEfficiency, 28);
  assert.equal(metrics.astToRatio, 2.5);
  assert.equal(metrics.threePointAttemptRatePct, 33.3);
  assert.equal(metrics.ftRatePct, 33.3);
  assert.deepEqual(metrics.per40, {
    points: 32, rebounds: 10.7, assists: 6.7, steals: 4, blocks: 1.3, turnovers: 2.7,
  });
});

test('computePlayerMetrics: zero turnovers with real assists on the board is null, not a misleading 0', () => {
  // Real case (Step 49): a player can genuinely finish with 0 turnovers
  // and > 0 assists (e.g. game 5's Austin Muriuki: 1 AST, 0 TO). Dividing
  // assists by 0 must not silently print 0 (which would misread as "zero
  // assists per turnover", i.e. bad, when the real story is flawless ball
  // security) or Infinity. null, for the UI to render as "n/a" later.
  const p = { player_name: 'Austin Muriuki', points: 5, fgm: 0, fga: 1, three_pm: 0, three_pa: 0, ftm: 5, fta: 6, reb: 2, assists: 1, steals: 0, blocks: 2, turnovers: 0, plus_minus: 3, minutes: 14.1 };

  const metrics = computePlayerMetrics(p);

  assert.equal(metrics.astToRatio, null);
  // FIBA EFF = (5+2+1+0+2) - ((1-0)+(6-5)+0) = 10 - 2 = 8
  assert.equal(metrics.fibaEfficiency, 8);
  // FT rate = fta/fga = 6/1 = 600% -- real, correct, and NOT capped at
  // 100% (FTA/FGA is a rate relative to shot attempts, not a make
  // percentage) -- a player who draws heavy contact relative to how
  // rarely he actually shoots is real, not a bug.
  assert.equal(metrics.ftRatePct, 600);
});

test('computePlayerMetrics: real minutes below the per-40 floor omits the projection entirely', () => {
  // Real case (Step 49): game 7's Glen Morangi played 4.2 real minutes.
  // Scaling his box score to 40 minutes would produce a number that's
  // arithmetically valid but not a trustworthy real estimate of anything
  // -- per40 must be null (the whole object, not a guessed figure),
  // not just omitted fields.
  const p = { player_name: 'Glen Morangi', points: 0, fgm: 0, fga: 0, three_pm: 0, three_pa: 0, ftm: 0, fta: 0, reb: 0, assists: 0, steals: 0, blocks: 0, turnovers: 1, plus_minus: -6, minutes: 4.2 };

  const metrics = computePlayerMetrics(p);

  assert.equal(metrics.per40, null);
  // FIBA EFF = 0 - (0+0+1) = -1 -- a real, valid negative value.
  assert.equal(metrics.fibaEfficiency, -1);
});

test('tagInsights: a big turnover-rate gap produces a Turnover Destruction tag', () => {
  // tagInsights operates on already-computed metrics objects (not raw box
  // scores), so the trigger condition can be set directly: home's turnover
  // rate is 10 points below the opponent's, which is <= the -8 threshold in
  // metrics.js for a home-side "Turnover Destruction" tag.
  const homeMetrics = { turnoverRatePct: 10, effectiveFgPct: 50, offensiveReboundPct: 30 };
  const oppMetrics = { turnoverRatePct: 20, effectiveFgPct: 48, offensiveReboundPct: 28 };

  const tags = tagInsights(homeMetrics, oppMetrics, [], []);

  assert.ok(tags.length >= 1);
  assert.ok(tags.some((tag) => tag.tag === 'Turnover Destruction' && tag.team === 'home'));
});
