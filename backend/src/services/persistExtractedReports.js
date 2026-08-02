const db = require('../db');

// ---------------------------------------------------------------------
// Prepared statements. Grouped by report type, each with its own
// DELETE (for the replace-not-accumulate pattern already used by
// player_game_stats in bulkImport.js) and INSERT.
// ---------------------------------------------------------------------

const del = {
  quarterPlayers: db.prepare('DELETE FROM game_quarter_player_stats WHERE game_id = ?'),
  quarterTeams: db.prepare('DELETE FROM game_quarter_team_totals WHERE game_id = ?'),
  plusMinus: db.prepare('DELETE FROM game_plus_minus WHERE game_id = ?'),
  lineupAnalysis: db.prepare('DELETE FROM game_lineup_analysis WHERE game_id = ?'),
  rotationStints: db.prepare('DELETE FROM game_rotation_stints WHERE game_id = ?'),
  playByPlay: db.prepare('DELETE FROM game_play_by_play WHERE game_id = ?'),
  scoreSheet: db.prepare('DELETE FROM game_score_sheet WHERE game_id = ?'),
};

const insert = {
  quarterPlayer: db.prepare(`
    INSERT INTO game_quarter_player_stats
      (game_id, team_side, jersey_number, player_name, points_total, points_q1, points_q2, points_q3, points_q4)
    VALUES (?,?,?,?,?,?,?,?,?)
  `),
  quarterTeam: db.prepare(`
    INSERT INTO game_quarter_team_totals
      (game_id, team_side, team_name, final_score, q1, q2, q3, q4, cumulative_score_json)
    VALUES (?,?,?,?,?,?,?,?,?)
  `),
  plusMinus: db.prepare(`
    INSERT INTO game_plus_minus
      (game_id, team_side, jersey_number, player_name, minutes_on, minutes_off,
       score_while_on, score_while_off, points_diff_on, points_diff_off,
       points_per_min_on, points_per_min_off, assists_on, assists_off,
       rebounds_on, rebounds_off, steals_on, steals_off, turnovers_on, turnovers_off)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `),
  lineupAnalysis: db.prepare(`
    INSERT INTO game_lineup_analysis
      (game_id, team_side, team_name, players_json, time_on_court, score,
       score_diff, points_per_min, rebounds, steals, turnovers, assists)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `),
  rotationStint: db.prepare(`
    INSERT INTO game_rotation_stints
      (game_id, team_side, team_name, players_json, quarter_on, time_on, quarter_off,
       time_off, time_on_court, score, score_diff, rebounds, steals, turnovers, assists)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `),
  playByPlayEvent: db.prepare(`
    INSERT INTO game_play_by_play
      (game_id, sequence, quarter, game_time, team_side, jersey_number,
       player_surname, player_initial, action_text, score_home, score_opponent, score_diff)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `),
  scoreSheet: db.prepare(`
    INSERT INTO game_score_sheet (game_id, game_ended_at, winning_team, final_score_team_a, final_score_team_b)
    VALUES (?,?,?,?,?)
  `),
};

// ---------------------------------------------------------------------
// Per-report persist functions. Each is defensive about its input shape
// (e.g. skips silently if that extractor failed and the entry is an
// { error, code } object instead of real data), so one report type's
// extraction failure can't crash persistence for the others.
// ---------------------------------------------------------------------

function persistQuarter(gameId, quarterResult) {
  del.quarterPlayers.run(gameId);
  del.quarterTeams.run(gameId);
  if (!quarterResult || !quarterResult.teams) return;

  quarterResult.teams.forEach((team) => {
    insert.quarterTeam.run(
      gameId, team.team_side, team.team_name, team.final_score,
      team.quarterTotals ? team.quarterTotals.q1 : null,
      team.quarterTotals ? team.quarterTotals.q2 : null,
      team.quarterTotals ? team.quarterTotals.q3 : null,
      team.quarterTotals ? team.quarterTotals.q4 : null,
      team.cumulativeScore ? JSON.stringify(team.cumulativeScore) : null,
    );
    (team.players || []).forEach((p) => {
      insert.quarterPlayer.run(
        gameId, team.team_side, p.jersey_number, p.player_name,
        p.points_total, p.points_q1, p.points_q2, p.points_q3, p.points_q4,
      );
    });
  });
}

function persistPlusMinus(gameId, plusMinusResult) {
  del.plusMinus.run(gameId);
  if (!plusMinusResult || !plusMinusResult.teams) return;

  plusMinusResult.teams.forEach((team) => {
    (team.players || []).forEach((p) => {
      insert.plusMinus.run(
        gameId, team.team_side, p.jersey_number, p.player_name,
        p.minutes_on, p.minutes_off, p.score_while_on, p.score_while_off,
        p.points_diff_on, p.points_diff_off, p.points_per_min_on, p.points_per_min_off,
        p.assists_on, p.assists_off, p.rebounds_on, p.rebounds_off,
        p.steals_on, p.steals_off, p.turnovers_on, p.turnovers_off,
      );
    });
  });
}

function persistLineupAnalysis(gameId, lineupResult) {
  del.lineupAnalysis.run(gameId);
  if (!lineupResult || !lineupResult.teams) return;

  lineupResult.teams.forEach((team) => {
    (team.lineups || []).forEach((l) => {
      insert.lineupAnalysis.run(
        gameId, team.team_side, team.team_name, JSON.stringify(l.players),
        l.time_on_court, l.score, l.score_diff, l.points_per_min,
        l.rebounds, l.steals, l.turnovers, l.assists,
      );
    });
  });
}

function persistRotationsSummary(gameId, rotationsResult) {
  del.rotationStints.run(gameId);
  if (!rotationsResult || !rotationsResult.teams) return;

  rotationsResult.teams.forEach((team) => {
    (team.stints || []).forEach((s) => {
      insert.rotationStint.run(
        gameId, team.team_side, team.team_name, JSON.stringify(s.players),
        s.quarter_on, s.time_on, s.quarter_off, s.time_off, s.time_on_court,
        s.score, s.score_diff, s.rebounds, s.steals, s.turnovers, s.assists,
      );
    });
  });
}

function persistPlayByPlay(gameId, playByPlayResult) {
  del.playByPlay.run(gameId);
  if (!playByPlayResult || !playByPlayResult.events) return;

  playByPlayResult.events.forEach((e, idx) => {
    insert.playByPlayEvent.run(
      gameId, idx, e.quarter, e.time, e.team, e.jersey_number,
      e.player_surname, e.player_initial, e.action_text,
      e.score ? e.score.home : null,
      e.score ? e.score.opponent : null,
      e.score ? e.score.diff : null,
    );
  });
}

function persistScoreSheet(gameId, scoreSheetResult) {
  del.scoreSheet.run(gameId);
  if (!scoreSheetResult || scoreSheetResult.error) return;

  insert.scoreSheet.run(
    gameId, scoreSheetResult.gameEndedAt, scoreSheetResult.winningTeam,
    scoreSheetResult.finalScoreTeamA, scoreSheetResult.finalScoreTeamB,
  );
}

// ---------------------------------------------------------------------
// Single entry point: pass the gameId and the whole additionalReports
// object as returned by the extractor loop in bulkImport.js. Each report
// type is handled independently -- if additionalReports.X is an error
// object (extraction failed for that one report), its persist function
// clears any stale rows for this game and returns without inserting new
// ones, rather than throwing and blocking the others.
// ---------------------------------------------------------------------
function persistAdditionalReports(gameId, additionalReports) {
  if (!additionalReports) return;
  persistQuarter(gameId, additionalReports.quarter);
  persistPlusMinus(gameId, additionalReports.plusMinus);
  persistLineupAnalysis(gameId, additionalReports.lineupAnalysis);
  persistRotationsSummary(gameId, additionalReports.rotationsSummary);
  persistPlayByPlay(gameId, additionalReports.playByPlay);
  persistScoreSheet(gameId, additionalReports.scoreSheet);
}

module.exports = { persistAdditionalReports };