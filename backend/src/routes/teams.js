const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, requireTeamAccess } = require('../middleware/auth');
const { imageUpload, uploadImage } = require('../services/imageUpload');
const { findCandidate, queuePendingReview } = require('../services/teamIdentity');
const { getGroupedTeamIds } = require('../services/teamIdentityGroups');

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

// Step 9 Round 4: manually pre-register a team, separate from the
// find-or-create paths in bulkImport.js/games.js (which stay exactly as
// they are -- both continue to coexist; a manually-created team here and
// an auto-created opponent team there are the same kind of row, just
// entered through different doors). Only `name` is required --
// institutionId/genderCategory are the two columns that have sat dormant
// since Step 5's original seeding (only the two seeded USIU teams ever
// had them set). `id` is the name itself, verbatim -- matching the exact
// convention the find-or-create paths already use (team id IS the team
// name text), so a manually-created "EAGLES" and a bulk-imported "EAGLES"
// resolve to the same row rather than silently diverging.
//
// Statistician-only, no Team Manager fallback: this is a more
// consequential action than editing a team's own settings (the PATCH
// below, which stays shared) -- it's adding a brand-new top-level entity
// to the whole system, not technical work tied to a team the caller
// already belongs to. Same category, same reasoning, as seasons.js/
// competitions.js/institutions.js's own POST routes: the Team Manager
// fallback rule (requireStatisticianOrFallback) exists specifically for
// "your team has no Statistician" situations, and there's no "your team"
// yet when the team doesn't exist.
//
// Step 14: this is one of the three find-or-create call sites now going
// through services/teamIdentity.js's matching instead of a raw exact-id
// check. Doesn't call resolveTeamName() directly, though -- that
// function's "no match" path can't carry institutionId/genderCategory
// (bulkImport.js/games.js never have them), and this route's "already
// exists" 409 for an EXACT match is deliberately kept (silently aliasing
// and returning 201 for a deliberate "create" click would be misleading)
// -- so this route uses findCandidate/queuePendingReview directly and
// does its own insert on the no-match path.
router.post('/', requireRole('Statistician'), async (req, res) => {
  try {
    const { name, institutionId, genderCategory } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const trimmed = name.trim();

    if (institutionId) {
      const institution = await db.prepare('SELECT id FROM institutions WHERE id = ?').get(institutionId);
      if (!institution) {
        return res.status(400).json({ error: 'institutionId does not match a real institution' });
      }
    }

    const candidate = await findCandidate(trimmed);
    if (candidate.type === 'exact') {
      return res.status(409).json({ error: `A team named '${trimmed}' already exists` });
    }
    if (candidate.type === 'fuzzy') {
      const reviewId = await queuePendingReview(trimmed, candidate);
      return res.status(409).json({
        error: `'${trimmed}' looks similar to an existing team (${candidate.reason}) -- check the team identity review queue to confirm it's the same team, or reject to create it as new.`,
        reviewId,
      });
    }

    const id = trimmed;
    const team = await db.prepare(`
      INSERT INTO teams (id, name, institution_id, gender_category)
      VALUES (?, ?, ?, ?)
      RETURNING id, name, institution_id, gender_category, coach_name, manager_name, statistician_name, color_primary, color_secondary, brand_accent, logo_url
    `).get(id, trimmed, institutionId || null, genderCategory || null);
    await db.prepare(`
      INSERT INTO team_name_aliases (team_id, alias_text) VALUES (?, ?)
      ON CONFLICT (alias_text) DO NOTHING
    `).run(id, trimmed);

    res.status(201).json(team);
  } catch (err) {
    console.error('create team failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// FR-11: configure an EXISTING team -- coach/manager/statistician
// assignment, colours, logo, and (Step 9 Round 4) institution/gender
// category. Partial update: any field omitted from the body keeps its
// current value rather than being nulled out (an explicit `null` still
// clears it, e.g. to unassign a team from an institution).
// requireTeamAccess added so a Statistician/Team Manager can only edit
// their own team(s) -- previously any authenticated Statistician or Team
// Manager could edit ANY team's config regardless of membership.
router.patch('/:teamId', requireRole('Statistician', 'Team Manager'), requireTeamAccess('teamId'), async (req, res) => {
  try {
    const { teamId } = req.params;

    const existing = await db.prepare(
      'SELECT coach_name, manager_name, statistician_name, color_primary, color_secondary, logo_url, institution_id, gender_category FROM teams WHERE id = ?',
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
      institutionId = existing.institution_id,
      genderCategory = existing.gender_category,
    } = req.body;

    if (institutionId) {
      const institution = await db.prepare('SELECT id FROM institutions WHERE id = ?').get(institutionId);
      if (!institution) {
        return res.status(400).json({ error: 'institutionId does not match a real institution' });
      }
    }

    const team = await db.prepare(`
      UPDATE teams
      SET coach_name = ?, manager_name = ?, statistician_name = ?, color_primary = ?, color_secondary = ?, logo_url = ?, institution_id = ?, gender_category = ?
      WHERE id = ?
      RETURNING id, name, institution_id, gender_category, coach_name, manager_name, statistician_name, color_primary, color_secondary, logo_url
    `).get(coachName, managerName, statisticianName, colorPrimary, colorSecondary, logoUrl, institutionId, genderCategory, teamId);

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

// Real logo upload -- replaces the plain "Logo URL" text field's manual
// paste-a-URL flow. Same gating as the brand PATCH just above (Team
// Manager only, own team only): a logo is part of brand identity, not
// general team config. multer's imageUpload.single('photo') parses the
// multipart body (this route accepts ONLY the file, not the other brand
// fields -- keeps the "upload a file" and "save these text/color fields"
// concerns in separate requests, same shape as reports.js/bulkImport.js's
// existing upload endpoints, rather than one route juggling both a JSON
// and multipart body depending on what's attached).
router.patch('/:teamId/logo', requireRole('Team Manager'), requireTeamAccess('teamId'), imageUpload.single('photo'), async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: 'No photo file uploaded (expected multipart field "photo")' });
    }

    const existing = await db.prepare('SELECT id FROM teams WHERE id = ?').get(teamId);
    if (!existing) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const logoUrl = await uploadImage({
      entityType: 'team-logos',
      entityId: teamId,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
    });

    const team = await db.prepare(
      'UPDATE teams SET logo_url = ? WHERE id = ? RETURNING id, name, logo_url',
    ).get(logoUrl, teamId);

    res.json(team);
  } catch (err) {
    console.error('team logo upload failed:', err);
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

// FR-07 (Opponent Intelligence Module): "generating an opponent
// intelligence profile by aggregating all historical data from games
// played against a named opponent, computing cross-encounter averages
// and identifying recurring tactical patterns." A different computation
// from season-stats just above -- that one averages a team's games
// against EVERYONE; this one filters to games against one specific
// opponent.
//
// Both teamId and opponentTeamId are resolved through Step 14's
// grouping layer (getGroupedTeamIds) before anything else -- every game
// query below filters against the FULL set of ids sharing each side's
// canonical identity, never the two raw path params directly. A team
// grouped under (or as the canonical of) either id is included
// automatically, so a duplicate split across two ids (the exact
// usiu-men/USIU TIGERS shape, before Step 14 Phase C resolved that
// specific case directly) is treated as one opponent, not two, without
// this route needing to know anything about that history.
//
// Insight tags (metrics.js's tagInsights, already computed and stored
// per game -- "Turnover Destruction", "3-Point Collapse", etc.) are
// relabeled 'mine'/'opponent' per encounter (team_side flips per game,
// same as season-stats' own home/opponent resolution) and counted
// across the whole head-to-head history. This is a frequency count of
// existing, already-validated per-game tags -- not a new pattern-
// detection algorithm.
//
// No role gate, same precedent as season-stats just above: read-only
// aggregate stats, viewable by any authenticated user regardless of
// team membership -- Opponent Analysis already works this way for any
// two teams' independent season averages, and this is the same category
// of read, just filtered to shared games instead of all of them.
router.get('/:teamId/opponents/:opponentTeamId/history', async (req, res) => {
  try {
    const { teamId, opponentTeamId } = req.params;

    const myTeamIds = await getGroupedTeamIds(teamId);
    const opponentIds = await getGroupedTeamIds(opponentTeamId);

    const games = await db.prepare(`
      SELECT * FROM games
      WHERE (home_team_id = ANY(?) AND opponent_team_id = ANY(?))
         OR (home_team_id = ANY(?) AND opponent_team_id = ANY(?))
      ORDER BY game_date ASC, id ASC
    `).all(myTeamIds, opponentIds, opponentIds, myTeamIds);

    if (games.length === 0) {
      return res.json({
        teamId, opponentTeamId, myTeamIds, opponentIds,
        encounters: [], aggregate: null, tagFrequency: [],
      });
    }

    const pct = (made, att) => (att > 0 ? Number(((made / att) * 100).toFixed(1)) : 0);

    // Same shape as season-stats' own `team` object, reused for both a
    // single encounter (gamesPlayed = 1) and the full aggregate
    // (gamesPlayed = every shared game) -- one shape, one frontend
    // rendering path for either.
    function summarizeStatRows(rows, gamesPlayed) {
      const sum = (key) => rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
      const totals = {
        points: sum('points'), fgm: sum('fgm'), fga: sum('fga'),
        three_pm: sum('three_pm'), three_pa: sum('three_pa'),
        ftm: sum('ftm'), fta: sum('fta'),
        reb: sum('reb'), assists: sum('assists'), steals: sum('steals'),
        blocks: sum('blocks'), turnovers: sum('turnovers'),
      };
      const perGame = (key) => (gamesPlayed > 0 ? Number((totals[key] / gamesPlayed).toFixed(1)) : 0);
      return {
        gamesPlayed,
        ppg: perGame('points'), rpg: perGame('reb'), apg: perGame('assists'),
        spg: perGame('steals'), bpg: perGame('blocks'), topg: perGame('turnovers'),
        fgPct: pct(totals.fgm, totals.fga),
        threePct: pct(totals.three_pm, totals.three_pa),
        ftPct: pct(totals.ftm, totals.fta),
      };
    }

    const encounters = [];
    let allMyRows = [];
    let allOppRows = [];
    const tagCounts = {};

    for (const game of games) {
      const iAmHome = myTeamIds.includes(game.home_team_id);
      const mySide = iAmHome ? 'home' : 'opponent';
      const theirSide = iAmHome ? 'opponent' : 'home';

      const myRows = await db.prepare('SELECT * FROM player_game_stats WHERE game_id = ? AND team_side = ?').all(game.id, mySide);
      const oppRows = await db.prepare('SELECT * FROM player_game_stats WHERE game_id = ? AND team_side = ?').all(game.id, theirSide);
      allMyRows = allMyRows.concat(myRows);
      allOppRows = allOppRows.concat(oppRows);

      const stage = game.stage_id
        ? await db.prepare('SELECT id, name FROM stages WHERE id = ?').get(game.stage_id)
        : null;

      const metricsRow = await db.prepare('SELECT insight_tags_json FROM game_metrics WHERE game_id = ?').get(game.id);
      const rawTags = metricsRow ? JSON.parse(metricsRow.insight_tags_json || '[]') : [];
      const tags = rawTags.map((t) => {
        const mine = (t.team === 'home') === iAmHome;
        const relabeled = mine ? 'mine' : 'opponent';
        const key = `${t.tag}::${relabeled}`;
        tagCounts[key] = (tagCounts[key] || 0) + 1;
        return { tag: t.tag, team: relabeled, detail: t.detail };
      });

      encounters.push({
        gameId: game.id,
        gameDate: game.game_date,
        seasonId: game.season_id,
        competitionId: game.competition_id,
        stageId: game.stage_id,
        stageName: stage ? stage.name : null,
        myTeamId: game[`${mySide}_team_id`],
        opponentTeamId: game[`${theirSide}_team_id`],
        myStats: summarizeStatRows(myRows, 1),
        opponentStats: summarizeStatRows(oppRows, 1),
        tags,
      });
    }

    const aggregate = {
      encounters: games.length,
      mine: summarizeStatRows(allMyRows, games.length),
      opponent: summarizeStatRows(allOppRows, games.length),
    };

    const tagFrequency = Object.entries(tagCounts)
      .map(([key, count]) => {
        const [tag, team] = key.split('::');
        return { tag, team, count };
      })
      .sort((a, b) => b.count - a.count);

    res.json({ teamId, opponentTeamId, myTeamIds, opponentIds, encounters, aggregate, tagFrequency });
  } catch (err) {
    console.error('team opponent history failed:', err);
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