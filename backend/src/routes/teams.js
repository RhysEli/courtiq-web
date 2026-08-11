const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// List every team that exists in the system -- not scoped to "my
// institution" or "my team". Rows here come from two sources: teams
// explicitly created via Teams management, AND teams auto-created by
// bulkImport.js the first time it sees a new home/opponent team name in
// an uploaded PDF (INSERT ... ON CONFLICT DO NOTHING). Either way, any
// team that has played a real, extracted game shows up here, which is
// what lets Opponent Analysis compare against ANY team with real stats,
// not just the logged-in user's own team.
router.get('/', async (req, res) => {
  try {
    const teams = await db.prepare('SELECT id, name, institution_id, gender_category FROM teams ORDER BY name').all();
    res.json(teams);
  } catch (err) {
    console.error('list teams failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Season-aggregate stats for one team, computed entirely from real
// player_game_stats rows across every game that team has actually
// played (as either home or opponent, in either role, in real bulk-
// imported/extracted games). No random/placeholder fallback values
// anywhere -- a team or player with zero real games returns zero
// games/stats, not a fabricated number.
//
// Two levels returned:
//   - team: per-game AVERAGES (not totals) across all that team's games,
//     plus real shooting percentages computed from summed makes/
//     attempts (not an average of per-game percentages, which would be
//     skewed by low-attempt games).
//   - players: same shape, grouped by player_name, so the frontend can
//     offer a player-vs-player comparison scoped to real players who
//     have actually appeared in this team's extracted box scores.
router.get('/:teamId/season-stats', async (req, res) => {
  try {
    const { teamId } = req.params;

    const games = await db.prepare(
      'SELECT id, home_team_id, opponent_team_id FROM games WHERE home_team_id = ? OR opponent_team_id = ?',
    ).all(teamId, teamId);

    if (games.length === 0) {
      return res.json({ teamId, gamesPlayed: 0, team: null, players: [] });
    }

    // For each game this team played, figure out whether it was 'home'
    // or 'opponent' in THAT specific game (team_side is per-game, not a
    // fixed identity), then pull only that side's player rows.
    let allRows = [];
    for (const game of games) {
      const side = game.home_team_id === teamId ? 'home' : 'opponent';
      const rows = await db.prepare(
        'SELECT * FROM player_game_stats WHERE game_id = ? AND team_side = ?',
      ).all(game.id, side);
      allRows = allRows.concat(rows);
    }

    const gamesPlayed = games.length;
    const sum = (key) => allRows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);

    const totals = {
      points: sum('points'), fgm: sum('fgm'), fga: sum('fga'),
      three_pm: sum('three_pm'), three_pa: sum('three_pa'),
      ftm: sum('ftm'), fta: sum('fta'),
      oreb: sum('oreb'), dreb: sum('dreb'), reb: sum('reb'),
      assists: sum('assists'), steals: sum('steals'), blocks: sum('blocks'),
      turnovers: sum('turnovers'), fouls: sum('fouls'),
    };

    const pct = (made, att) => (att > 0 ? Number(((made / att) * 100).toFixed(1)) : 0);
    const perGame = (key) => Number((totals[key] / gamesPlayed).toFixed(1));

    const team = {
      gamesPlayed,
      ppg: perGame('points'),
      rpg: perGame('reb'),
      apg: perGame('assists'),
      spg: perGame('steals'),
      bpg: perGame('blocks'),
      topg: perGame('turnovers'),
      fgPct: pct(totals.fgm, totals.fga),
      threePct: pct(totals.three_pm, totals.three_pa),
      ftPct: pct(totals.ftm, totals.fta),
    };

    // Group by player_name for per-player season averages. Uses
    // player_name as extracted (not linked to the players/roster table,
    // since no real roster data with positions has been entered anywhere
    // in the system yet -- see project notes). This means two players
    // with identical extracted names would merge into one row; not a
    // concern for the current real dataset, worth revisiting once real
    // roster data exists.
    const byPlayer = {};
    for (const r of allRows) {
      if (!byPlayer[r.player_name]) byPlayer[r.player_name] = [];
      byPlayer[r.player_name].push(r);
    }

    const players = Object.entries(byPlayer).map(([name, rows]) => {
      const gp = rows.length;
      const s = (key) => rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
      const totalFgm = s('fgm'); const totalFga = s('fga');
      const totalThreeM = s('three_pm'); const totalThreeA = s('three_pa');
      const totalFtm = s('ftm'); const totalFta = s('fta');
      return {
        playerName: name,
        gamesPlayed: gp,
        ppg: Number((s('points') / gp).toFixed(1)),
        rpg: Number((s('reb') / gp).toFixed(1)),
        apg: Number((s('assists') / gp).toFixed(1)),
        spg: Number((s('steals') / gp).toFixed(1)),
        bpg: Number((s('blocks') / gp).toFixed(1)),
        topg: Number((s('turnovers') / gp).toFixed(1)),
        fgPct: pct(totalFgm, totalFga),
        threePct: pct(totalThreeM, totalThreeA),
        ftPct: pct(totalFtm, totalFta),
      };
    }).sort((a, b) => b.ppg - a.ppg);

    res.json({ teamId, gamesPlayed, team, players });
  } catch (err) {
    console.error('team season-stats failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;