const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, requireTeamAccess } = require('../middleware/auth');

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
//
// Includes the FR-11 config columns (coach_name/manager_name/
// statistician_name/color_primary/color_secondary/logo_url) so
// Team Management can populate its edit form straight from this list --
// no separate "get one team" endpoint needed.
router.get('/', async (req, res) => {
  try {
    const teams = await db.prepare(
      'SELECT id, name, institution_id, gender_category, coach_name, manager_name, statistician_name, color_primary, color_secondary, brand_accent, logo_url FROM teams ORDER BY name',
    ).all();
    res.json(teams);
  } catch (err) {
    console.error('list teams failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// FR-11: configure an EXISTING team -- coach/manager/statistician
// assignment, colours, logo. Deliberately no POST here: teams are
// already correctly created as a side effect of Bulk Import/game
// creation (INSERT ... ON CONFLICT DO NOTHING, see games.js) --
// creating a bare team with no games attached would be a different,
// out-of-scope feature. Partial update: any field omitted from the body
// keeps its current value rather than being nulled out.
// requireTeamAccess added so a Statistician/Team Manager can only edit
// their own team(s) -- previously any authenticated Statistician or Team
// Manager could edit ANY team's config regardless of membership.
router.patch('/:teamId', requireRole('Statistician', 'Team Manager'), requireTeamAccess('teamId'), async (req, res) => {
  try {
    const { teamId } = req.params;

    const existing = await db.prepare(
      'SELECT coach_name, manager_name, statistician_name, color_primary, color_secondary, logo_url FROM teams WHERE id = ?',
    ).get(teamId);
    if (!existing) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const {
      coachName = existing.coach_name,
      managerName = existing.manager_name,
      statisticianName = existing.statistician_name,
      colorPrimary = existing.color_primary,
      colorSecondary = existing.color_secondary,
      logoUrl = existing.logo_url,
    } = req.body;

    const team = await db.prepare(`
      UPDATE teams
      SET coach_name = ?, manager_name = ?, statistician_name = ?, color_primary = ?, color_secondary = ?, logo_url = ?
      WHERE id = ?
      RETURNING id, name, institution_id, gender_category, coach_name, manager_name, statistician_name, color_primary, color_secondary, logo_url
    `).get(coachName, managerName, statisticianName, colorPrimary, colorSecondary, logoUrl, teamId);

    res.json(team);
  } catch (err) {
    console.error('update team failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Visual overhaul step 1: dedicated brand-identity update, separate from
// the general team-config PATCH above. Narrower than that endpoint in
// one remaining way: gated to Team Manager only, not Statistician too --
// brand identity is a Team Manager call, per the brief. (Both endpoints
// are now requireTeamAccess'd to the caller's own team.)
// color_primary/color_secondary are the same columns the general PATCH
// already edits (see schema.sql for why they weren't renamed to
// brand_primary/brand_secondary) -- this endpoint is an additional, more
// tightly-scoped way to set the same two fields, plus brand_accent and
// logo_url. Partial update, same as the general PATCH.
router.patch('/:teamId/brand', requireRole('Team Manager'), requireTeamAccess('teamId'), async (req, res) => {
  try {
    const { teamId } = req.params;

    const existing = await db.prepare(
      'SELECT color_primary, color_secondary, brand_accent, logo_url FROM teams WHERE id = ?',
    ).get(teamId);
    if (!existing) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const {
      colorPrimary = existing.color_primary,
      colorSecondary = existing.color_secondary,
      brandAccent = existing.brand_accent,
      logoUrl = existing.logo_url,
    } = req.body;

    const team = await db.prepare(`
      UPDATE teams
      SET color_primary = ?, color_secondary = ?, brand_accent = ?, logo_url = ?
      WHERE id = ?
      RETURNING id, name, color_primary, color_secondary, brand_accent, logo_url
    `).get(colorPrimary, colorSecondary, brandAccent, logoUrl, teamId);

    res.json(team);
  } catch (err) {
    console.error('update team brand failed:', err);
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

// FR-08: "The system shall maintain a longitudinal player profile
// displaying per-season and career-cumulative statistics for each
// registered player, enabling trend analysis of individual development
// over time." (exact wording from the project proposal)
//
// Same honest limitation as the per-player grouping in the season-stats
// route above: players are identified by their extracted player_name
// string, not a real roster player_id -- there is no roster/player
// linkage anywhere in the current data model. A player is therefore
// scoped to (teamId, playerName) here, matching how the players list in
// season-stats already works. Two different real players who happen to
// share an identical extracted name on the same team would incorrectly
// merge -- not a concern for the current real dataset, worth revisiting
// if real roster data with stable player IDs is ever entered.
router.get('/:teamId/players/:playerName/development', async (req, res) => {
  try {
    const { teamId, playerName } = req.params;

    const games = await db.prepare(
      'SELECT id, home_team_id, opponent_team_id, season_id, game_date FROM games WHERE home_team_id = ? OR opponent_team_id = ? ORDER BY game_date ASC',
    ).all(teamId, teamId);

    if (games.length === 0) {
      return res.json({ teamId, playerName, career: null, seasons: [] });
    }

    // Same per-game team_side resolution as season-stats -- which side
    // this team was on varies per game, it isn't a fixed identity.
    let allRows = [];
    for (const game of games) {
      const side = game.home_team_id === teamId ? 'home' : 'opponent';
      const rows = await db.prepare(
        'SELECT * FROM player_game_stats WHERE game_id = ? AND team_side = ? AND player_name = ?',
      ).all(game.id, side, playerName);
      for (const row of rows) {
        allRows.push({ ...row, season_id: game.season_id, game_date: game.game_date });
      }
    }

    if (allRows.length === 0) {
      return res.json({ teamId, playerName, career: null, seasons: [] });
    }

    const seasonNames = await db.prepare('SELECT id, name FROM seasons').all();
    const seasonNameById = Object.fromEntries(seasonNames.map((s) => [s.id, s.name]));

    const pct = (made, att) => (att > 0 ? Number(((made / att) * 100).toFixed(1)) : 0);

    // Shared aggregator: same shape used for both a single season's rows
    // and the full career's rows, so `career` and each entry in `seasons`
    // come back with identical fields -- convenient for a trend chart
    // that plots the same stat across both.
    function summarize(rows) {
      const gp = rows.length;
      const s = (key) => rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
      const totalFgm = s('fgm'); const totalFga = s('fga');
      const totalThreeM = s('three_pm'); const totalThreeA = s('three_pa');
      const totalFtm = s('ftm'); const totalFta = s('fta');
      return {
        gamesPlayed: gp,
        totalPoints: s('points'),
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
    }

    const bySeason = {};
    for (const row of allRows) {
      const key = row.season_id || 'unassigned';
      if (!bySeason[key]) bySeason[key] = [];
      bySeason[key].push(row);
    }

    // Sorted chronologically by season id where possible (season ids in
    // this system are date-like strings, e.g. "2025-2026") so a trend
    // chart plots left-to-right in real time order, not insertion order.
    const seasons = Object.entries(bySeason)
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([seasonId, rows]) => ({
        seasonId,
        seasonName: seasonNameById[seasonId] || (seasonId === 'unassigned' ? 'No season assigned' : seasonId),
        ...summarize(rows),
      }));

    const career = summarize(allRows);

    res.json({ teamId, playerName, career, seasons });
  } catch (err) {
    console.error('player development failed:', err);
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;