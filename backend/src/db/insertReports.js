const db = require('./index');

// Insert helpers for the six FIBA LiveStats report types that, until now,
// were extracted successfully but only ever attached to the bulk-import API
// response for inspection -- never written to a table. Each function here
// mirrors the shape a single extractor in reportExtractors.js / parseScoreSheet.js
// actually returns (see those files for the source shape).
//
// Design choices carried over from the Box Score insert path in bulkImport.js:
//  - DELETE-then-INSERT per game, so re-running an import never duplicates rows.
//  - Each insert function is self-contained and safe to call even if a
//    previous report type's insert already threw -- the caller is expected
//    to wrap each call in its own try/catch (bulkImport.js does this).
//
// Batching note (added after moving to Supabase Postgres, hosted in a
// different region than the Render backend): one round trip per row was
// fine for local SQLite, but over a real network connection -- especially
// cross-region -- per-row latency compounds directly into real wait time.
// Play-by-Play alone is ~500+ rows per game. insertBatch() below groups
// rows into multi-row `INSERT ... VALUES (...), (...), ...` statements so
// a report with 500 rows takes ~5-10 round trips instead of 500.

const BATCH_SIZE = 100; // rows per INSERT statement

// columns: array of column names, in the same order each row array provides
// values. rows: array of arrays (one inner array per row, same length/order
// as columns). Chunks internally so no single statement gets unreasonably
// large. Returns the number of rows inserted.
async function insertBatch(table, columns, rows) {
  let inserted = 0;
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const chunk = rows.slice(start, start + BATCH_SIZE);
    const placeholdersPerRow = `(${columns.map(() => '?').join(',')})`;
    const valuesSql = chunk.map(() => placeholdersPerRow).join(',');
    const flatParams = chunk.flat();
    await db.prepare(`
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES ${valuesSql}
    `).run(...flatParams);
    inserted += chunk.length;
  }
  return inserted;
}

async function insertQuarterReport(gameId, quarterReport) {
  await db.prepare('DELETE FROM game_quarter_team WHERE game_id = ?').run(gameId);
  await db.prepare('DELETE FROM game_quarter_player WHERE game_id = ?').run(gameId);

  const teamRows = [];
  const playerRows = [];
  for (const team of quarterReport.teams) {
    const qt = team.quarterTotals || {};
    teamRows.push([
      gameId, team.team_side, team.team_name, team.final_score,
      qt.q1 ?? null, qt.q2 ?? null, qt.q3 ?? null, qt.q4 ?? null,
      team.cumulativeScore ? JSON.stringify(team.cumulativeScore) : null,
    ]);
    for (const p of (team.players || [])) {
      playerRows.push([
        gameId, team.team_side, p.jersey_number, p.player_name, p.points_total,
        p.points_q1, p.points_q2, p.points_q3, p.points_q4,
      ]);
    }
  }

  const teamCount = await insertBatch(
    'game_quarter_team',
    ['game_id', 'team_side', 'team_name', 'final_score', 'q1', 'q2', 'q3', 'q4', 'cumulative_score_json'],
    teamRows,
  );
  const playerCount = await insertBatch(
    'game_quarter_player',
    ['game_id', 'team_side', 'jersey_number', 'player_name', 'points_total', 'points_q1', 'points_q2', 'points_q3', 'points_q4'],
    playerRows,
  );
  return { teamRows: teamCount, playerRows: playerCount };
}

async function insertPlusMinus(gameId, plusMinus) {
  await db.prepare('DELETE FROM game_plus_minus WHERE game_id = ?').run(gameId);

  const rows = [];
  for (const team of plusMinus.teams) {
    for (const p of (team.players || [])) {
      rows.push([
        gameId, team.team_side, p.jersey_number, p.player_name, p.minutes_on, p.minutes_off,
        p.score_while_on, p.score_while_off, p.points_diff_on, p.points_diff_off,
        p.points_per_min_on, p.points_per_min_off, p.assists_on, p.assists_off,
        p.rebounds_on, p.rebounds_off, p.steals_on, p.steals_off, p.turnovers_on, p.turnovers_off,
      ]);
    }
  }

  const count = await insertBatch(
    'game_plus_minus',
    ['game_id', 'team_side', 'jersey_number', 'player_name', 'minutes_on', 'minutes_off',
      'score_while_on', 'score_while_off', 'points_diff_on', 'points_diff_off',
      'points_per_min_on', 'points_per_min_off', 'assists_on', 'assists_off',
      'rebounds_on', 'rebounds_off', 'steals_on', 'steals_off', 'turnovers_on', 'turnovers_off'],
    rows,
  );
  return { rows: count };
}

async function insertLineupAnalysis(gameId, lineupAnalysis) {
  await db.prepare('DELETE FROM game_lineup_analysis WHERE game_id = ?').run(gameId);

  const rows = [];
  for (const team of lineupAnalysis.teams) {
    for (const l of (team.lineups || [])) {
      rows.push([
        gameId, team.team_side, team.team_name, JSON.stringify(l.players), l.time_on_court,
        l.score, l.score_diff, l.points_per_min, l.rebounds, l.steals, l.turnovers, l.assists,
      ]);
    }
  }

  const count = await insertBatch(
    'game_lineup_analysis',
    ['game_id', 'team_side', 'team_name', 'players_json', 'time_on_court', 'score', 'score_diff',
      'points_per_min', 'rebounds', 'steals', 'turnovers', 'assists'],
    rows,
  );
  return { rows: count };
}

async function insertRotationsSummary(gameId, rotationsSummary) {
  await db.prepare('DELETE FROM game_rotation_stints WHERE game_id = ?').run(gameId);

  const rows = [];
  for (const team of rotationsSummary.teams) {
    for (const s of (team.stints || [])) {
      rows.push([
        gameId, team.team_side, team.team_name, JSON.stringify(s.players),
        s.quarter_on, s.time_on, s.quarter_off, s.time_off, s.time_on_court,
        s.score, s.score_diff, s.rebounds, s.steals, s.turnovers, s.assists,
      ]);
    }
  }

  const count = await insertBatch(
    'game_rotation_stints',
    ['game_id', 'team_side', 'team_name', 'players_json', 'quarter_on', 'time_on', 'quarter_off', 'time_off',
      'time_on_court', 'score', 'score_diff', 'rebounds', 'steals', 'turnovers', 'assists'],
    rows,
  );
  return { rows: count };
}

async function insertPlayByPlay(gameId, playByPlay) {
  // NOTE: field names here match what extractPlayByPlay's flushPending()
  // actually pushes -- quarter, time, team, jersey_number, player_surname,
  // player_initial, action_text, score. There is no raw/original text kept
  // on the final event object (only during accumulation, before parsing),
  // so game_play_by_play.raw_text is intentionally left null here.
  await db.prepare('DELETE FROM game_play_by_play WHERE game_id = ?').run(gameId);

  const events = playByPlay.events || [];
  const rows = events.map((e, idx) => [
    gameId, idx, e.quarter ?? null, e.time ?? null, e.team ?? null,
    e.jersey_number ?? null, e.player_surname ?? null, e.player_initial ?? null,
    e.action_text ?? null, e.score ?? null, null,
  ]);

  const count = await insertBatch(
    'game_play_by_play',
    ['game_id', 'sequence_index', 'quarter', 'event_time', 'team_code', 'jersey_number',
      'surname', 'initial', 'action_text', 'score', 'raw_text'],
    rows,
  );
  return { rows: count };
}

async function insertScoreSheet(gameId, scoreSheet) {
  await db.prepare('DELETE FROM game_score_sheet WHERE game_id = ?').run(gameId);
  await db.prepare(`
    INSERT INTO game_score_sheet (game_id, game_ended_at, winning_team, final_score_team_a, final_score_team_b)
    VALUES (?,?,?,?,?)
  `).run(gameId, scoreSheet.gameEndedAt, scoreSheet.winningTeam, scoreSheet.finalScoreTeamA, scoreSheet.finalScoreTeamB);
  return { rows: 1 };
}

module.exports = {
  quarter: insertQuarterReport,
  plusMinus: insertPlusMinus,
  lineupAnalysis: insertLineupAnalysis,
  rotationsSummary: insertRotationsSummary,
  playByPlay: insertPlayByPlay,
  scoreSheet: insertScoreSheet,
};