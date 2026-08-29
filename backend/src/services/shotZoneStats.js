// Step 45 Phase 3: shared aggregation for the real "shot selection zones"
// stat breakdown (paint / mid_range / three -- attempts, makes, make%).
// Deliberately NOT a shot chart -- no x/y coordinates, no court diagram,
// just a per-zone tally. Shared between the single-game endpoint
// (routes/reports.js) and the cross-game team endpoint (routes/teams.js)
// so both present the exact same numbers for the exact same underlying
// rows -- no separate pivot logic to drift apart.

const ZONES = ['paint', 'mid_range', 'three'];

function pct(makes, attempts) {
  return attempts > 0 ? Number(((makes / attempts) * 100).toFixed(1)) : 0;
}

function emptyZones() {
  return {
    paint: { attempts: 0, makes: 0, pct: 0 },
    mid_range: { attempts: 0, makes: 0, pct: 0 },
    three: { attempts: 0, makes: 0, pct: 0 },
  };
}

// rows: real grouped query results, one row per (player, zone) --
// {player_id, full_name, team_side (optional), shot_zone, attempts, makes}.
// team_side is only meaningful within a single game (home vs opponent);
// the cross-game team endpoint omits it since every row already belongs
// to one team's own roster.
function summarizeByPlayer(rows) {
  const byPlayer = {};
  for (const row of rows) {
    const key = row.player_id;
    if (!byPlayer[key]) {
      byPlayer[key] = {
        playerId: row.player_id,
        fullName: row.full_name,
        teamSide: row.team_side || null,
        zones: emptyZones(),
        totalAttempts: 0,
        totalMakes: 0,
      };
    }
    const entry = byPlayer[key];
    const attempts = Number(row.attempts);
    const makes = Number(row.makes);
    entry.zones[row.shot_zone] = { attempts, makes, pct: pct(makes, attempts) };
    entry.totalAttempts += attempts;
    entry.totalMakes += makes;
  }
  return Object.values(byPlayer)
    .map((p) => ({ ...p, totalPct: pct(p.totalMakes, p.totalAttempts) }))
    .sort((a, b) => b.totalAttempts - a.totalAttempts);
}

// Rolls up an already-summarized player list into one or more team totals,
// grouped by teamSide. Returns [] if no row carries a teamSide (the
// cross-game single-team case computes its own single total separately,
// since there every row already belongs to the same team).
function summarizeByTeamSide(players) {
  const byTeam = {};
  for (const p of players) {
    if (!p.teamSide) continue;
    if (!byTeam[p.teamSide]) {
      byTeam[p.teamSide] = { teamSide: p.teamSide, zones: emptyZones(), totalAttempts: 0, totalMakes: 0 };
    }
    const entry = byTeam[p.teamSide];
    for (const zone of ZONES) {
      entry.zones[zone].attempts += p.zones[zone].attempts;
      entry.zones[zone].makes += p.zones[zone].makes;
    }
    entry.totalAttempts += p.totalAttempts;
    entry.totalMakes += p.totalMakes;
  }
  return Object.values(byTeam).map((t) => {
    for (const zone of ZONES) t.zones[zone].pct = pct(t.zones[zone].makes, t.zones[zone].attempts);
    return { ...t, totalPct: pct(t.totalMakes, t.totalAttempts) };
  });
}

module.exports = {
  ZONES, pct, emptyZones, summarizeByPlayer, summarizeByTeamSide,
};
