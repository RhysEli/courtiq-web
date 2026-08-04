const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const { assignTeamSides } = require('./teamSide');

// -----------------------------------------------------------------------
// Extractors for two more FIBA LiveStats report types, following the same
// approach as extractBoxScore() in pdfExtraction.js: normalise whitespace,
// locate the report by its own title line, split into per-team sections,
// then parse one row per player with a fixed-arity regex.
//
// CALIBRATED against a real export (26TH_JULY_MERGED_USIU_TIGERS_VS_
// CONGO_NETS, Game No. 212, 26 Jul 2026). If a future export reorders
// columns, the fix is in the relevant ROW_REGEX and its destructuring
// only -- same convention as pdfExtraction.js.
//
// IMPORTANT: in this export format, each report's title line is printed
// as a FOOTER after the data table, not as a header before it (confirmed
// directly against the real PDF text -- e.g. the standalone line
// "Quarter" and the line "Rotations Summary" each appear only once, and
// only after the team data blocks they belong to). Because of that,
// team-block detection below does NOT filter by position relative to
// titleIdx -- titleIdx is only used as a presence check (does this PDF
// contain this report at all), never as a boundary for where team data
// can appear.
// -----------------------------------------------------------------------

function normalizeLines(rawText) {
  return rawText
    .replace(/\t/g, ' ')
    .split('\n')
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

// ---------------------------------------------------------------------
// QUARTER REPORT
// ---------------------------------------------------------------------
// Per team: a "<TEAM NAME> <team total>" line, then "No. Pos. Name",
// then "Quarters" / "Total 1 2 3 4", then one row per player who scored
// at least once (0-point players are still listed), then a
// "Quarter Scores <total> <q1> <q2> <q3> <q4>" row, then the running
// cumulative score line (e.g. "26 43 61 83").
const QUARTER_PLAYER_ROW_REGEX = new RegExp(
  '^(\\d{1,2})\\s+' +                                       // jersey
  "([A-Z][A-Za-z.'()\\-]*(?:\\s+[A-Za-z.'()\\-]+)*)\\s+" +   // name (allows "(C)")
  '(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)$',         // total q1 q2 q3 q4
);

async function extractQuarterReport(filePath, homeTeamName = null) {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();
  const lines = normalizeLines(data.text);

  const titleIdx = lines.findIndex((l) => l === 'Quarter');
  if (titleIdx === -1) {
    const err = new Error('Could not find the "Quarter" report title in this PDF.');
    err.code = 'EXTRACTION_NO_SECTIONS';
    throw err;
  }
  // NOTE: titleIdx above is a presence check ONLY. In this export format
  // the "Quarter" title line is a footer printed AFTER the team data
  // blocks, so team-block detection below intentionally does not filter
  // by idx relative to titleIdx -- doing so was the bug that made this
  // function return zero results even when the data was present earlier
  // in the document.

  // Team blocks start at a "<TEAM NAME> <final score>" line (an all-caps
  // name with no digits inside it). The "No. Pos. Name" / "Quarters" /
  // "Total 1 2 3 4" header beneath it wraps across a variable number of
  // physical lines depending on column width in the source PDF, so
  // instead of matching that header exactly, a team-name candidate is
  // confirmed by checking that "Total" and the "1 2 3 4" sequence both
  // appear somewhere in the next few lines.
  const TEAM_TOTAL_LINE_REGEX = /^([A-Z][A-Z .]+[A-Z])\s+(\d{1,3})$/;
  const teamHeaderIdx = [];
  lines.forEach((line, idx) => {
    const m = line.match(TEAM_TOTAL_LINE_REGEX);
    if (!m) return;
    const lookahead = lines.slice(idx + 1, idx + 8).join(' ');
    if (/Total/.test(lookahead) && /1\s*2\s*3\s*4/.test(lookahead)) {
      teamHeaderIdx.push(idx);
    }
  });

  if (teamHeaderIdx.length < 2) {
    const err = new Error('Could not find two team quarter-breakdown blocks in this PDF.');
    err.code = 'EXTRACTION_NO_SECTIONS';
    throw err;
  }

  const rawTeams = teamHeaderIdx.slice(0, 2).map((startIdx, i) => {
    const teamLine = lines[startIdx]; // e.g. "USIU TIGERS 83"
    const teamMatch = teamLine.match(/^(.+?)\s+(\d+)$/);
    const endIdx = i + 1 < teamHeaderIdx.length ? teamHeaderIdx[i + 1] : lines.length;
    const blockLines = lines.slice(startIdx, endIdx);

    const players = [];
    let quarterTotals = null;
    let cumulativeScore = null;

    for (let j = 0; j < blockLines.length; j += 1) {
      const line = blockLines[j];
      const qsMatch = line.match(/^Quarter Scores\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/);
      if (qsMatch) {
        quarterTotals = {
          total: Number(qsMatch[1]),
          q1: Number(qsMatch[2]), q2: Number(qsMatch[3]),
          q3: Number(qsMatch[4]), q4: Number(qsMatch[5]),
        };
        // Next line is the cumulative running total, e.g. "26 43 61 83"
        const cumLine = blockLines[j + 1];
        const cumMatch = cumLine && cumLine.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/);
        if (cumMatch) {
          cumulativeScore = cumMatch.slice(1).map(Number);
        }
        continue;
      }
      const playerMatch = line.match(QUARTER_PLAYER_ROW_REGEX);
      if (playerMatch) {
        const [, jersey, name, total, q1, q2, q3, q4] = playerMatch;
        players.push({
          jersey_number: Number(jersey),
          player_name: name.trim(),
          points_total: Number(total),
          points_q1: Number(q1), points_q2: Number(q2),
          points_q3: Number(q3), points_q4: Number(q4),
        });
      }
    }

    return {
      team_name: teamMatch ? teamMatch[1].trim() : null,
      final_score: teamMatch ? Number(teamMatch[2]) : null,
      players,
      quarterTotals,
      cumulativeScore, // running total after each quarter, e.g. [26,43,61,83]
    };
  });

  const teams = assignTeamSides(rawTeams, homeTeamName);

  return { teams };
}

// ---------------------------------------------------------------------
// PLAYER PLUS/MINUS SUMMARY
// ---------------------------------------------------------------------
// Per team: "No Name Mins Score Points Diff Points per Min Assists
// Rebounds Steals Turnovers" then "On Off" x8 sub-header, then one row
// per player with paired on/off values throughout.
const PLUSMINUS_ROW_REGEX = new RegExp(
  '^(\\d{1,2})\\s+' +                                       // jersey
  "([A-Z][A-Za-z.'()\\-]*(?:\\s+[A-Za-z.'()\\-]+)*)\\s+" +   // name
  '(\\d{1,2}:\\d{2})\\s+(\\d{1,2}:\\d{2})\\s+' +             // mins on / off
  '(\\d+)-(\\d+)\\s+(\\d+)-(\\d+)\\s+' +                     // score on / off (each "A-B")
  '([+-]?\\d+)\\s+([+-]?\\d+)\\s+' +                         // points diff on / off
  '([\\d.]+)\\s+([\\d.]+)\\s+' +                             // points per min on / off
  '(\\d+)\\s+(\\d+)\\s+' +                                   // assists on / off
  '(\\d+)\\s+(\\d+)\\s+' +                                   // rebounds on / off
  '(\\d+)\\s+(\\d+)\\s+' +                                   // steals on / off
  '(\\d+)\\s+(\\d+)$',                                       // turnovers on / off
);

async function extractPlusMinusSummary(filePath, homeTeamName = null) {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();
  const lines = normalizeLines(data.text);

  const titleIdx = lines.findIndex((l, i) => l === 'Player Plus/Minus' && lines[i + 1] === 'Summary');
  if (titleIdx === -1) {
    const err = new Error('Could not find the "Player Plus/Minus Summary" report title in this PDF.');
    err.code = 'EXTRACTION_NO_SECTIONS';
    throw err;
  }

  // Each team section starts at its own team-name-only line, immediately
  // followed eventually by the "No Name Mins Score..." header. Detect
  // team sections via that header line instead, then walk backwards one
  // line for the team name.
  const headerIdx = [];
  lines.forEach((line, idx) => {
    if (/^No Name Mins Score Points Diff Points per Min Assists Rebounds Steals Turnovers$/.test(line)) {
      headerIdx.push(idx);
    }
  });

  if (headerIdx.length < 2) {
    const err = new Error('Could not find two team plus/minus tables in this PDF.');
    err.code = 'EXTRACTION_NO_SECTIONS';
    throw err;
  }

  const rawTeams = headerIdx.slice(0, 2).map((headerLineIdx, i) => {
    const teamName = lines[headerLineIdx - 1] || null;
    const endIdx = i + 1 < headerIdx.length ? headerIdx[i + 1] - 1 : lines.length;
    const blockLines = lines.slice(headerLineIdx + 2, endIdx); // skip header + "On Off" sub-row

    const players = [];
    for (const line of blockLines) {
      const match = line.match(PLUSMINUS_ROW_REGEX);
      if (match) {
        const [
          , jersey, name, minsOn, minsOff,
          scoreOnFor, scoreOnAgainst, scoreOffFor, scoreOffAgainst,
          pointsDiffOn, pointsDiffOff, ppmOn, ppmOff,
          assistsOn, assistsOff, reboundsOn, reboundsOff,
          stealsOn, stealsOff, turnoversOn, turnoversOff,
        ] = match;

        players.push({
          jersey_number: Number(jersey),
          player_name: name.trim(),
          minutes_on: minsOn, minutes_off: minsOff,
          score_while_on: `${scoreOnFor}-${scoreOnAgainst}`,
          score_while_off: `${scoreOffFor}-${scoreOffAgainst}`,
          points_diff_on: Number(pointsDiffOn),
          points_diff_off: Number(pointsDiffOff),
          points_per_min_on: Number(ppmOn),
          points_per_min_off: Number(ppmOff),
          assists_on: Number(assistsOn), assists_off: Number(assistsOff),
          rebounds_on: Number(reboundsOn), rebounds_off: Number(reboundsOff),
          steals_on: Number(stealsOn), steals_off: Number(stealsOff),
          turnovers_on: Number(turnoversOn), turnovers_off: Number(turnoversOff),
        });
      }
    }

    return { team_name: teamName, players };
  });

  const teams = assignTeamSides(rawTeams, homeTeamName);

  return { teams };
}

// ---------------------------------------------------------------------
// SHARED: lineup identifier string parser
// ---------------------------------------------------------------------
// A lineup string looks like:
//   "5- AMAYAI E/ 6- NGALAJ/ 8- NYONGESAB/ 9-OKUMUI/ 18-OKWEMBAJ/"
// Five "<jersey>-<surname+initial>/" segments, with inconsistent spacing
// around the dash and around the initial (calibrated against real
// export -- both "AMAYAI E/" and "NGALAJ/" style spacing appear in the
// same document). The reliable pattern: strip the trailing "/", the
// LAST character remaining is always the first-name initial, everything
// before it is the surname.
const LINEUP_SEGMENT_REGEX = /(\d{1,2})-\s*([A-Za-z]+(?:\s?[A-Za-z])?)\//g;

function parseLineupString(rawLineup) {
  const players = [];
  let match;
  LINEUP_SEGMENT_REGEX.lastIndex = 0;
  while ((match = LINEUP_SEGMENT_REGEX.exec(rawLineup)) !== null) {
    const jersey = Number(match[1]);
    const nameChunk = match[2].trim();
    // Split "AMAYAI E" (already spaced) vs "NGALAJ" (concatenated) into
    // surname + initial the same way either way: last char = initial.
    const initial = nameChunk.slice(-1);
    const surname = nameChunk.slice(0, -1).trim();
    players.push({ jersey_number: jersey, surname, initial });
  }
  if (players.length !== 5) {
    const err = new Error(
      `Expected 5 players in lineup string, parsed ${players.length}: "${rawLineup}"`,
    );
    err.code = 'EXTRACTION_LINEUP_PARSE_FAILED';
    err.rawLineup = rawLineup;
    throw err;
  }
  return players;
}

// ---------------------------------------------------------------------
// LINEUP ANALYSIS
// ---------------------------------------------------------------------
// Per team: team name line, then "Lineup Time Score Score Diff Pts/Min
// Reb Stl Tov Ass" header, then one row per 5-man combination that saw
// court time, ordered by minutes played descending.
const LINEUP_ROW_REGEX =
  /^(.+?\/)\s+(\d{1,2}:\d{2})\s+(\d+)-(\d+)\s+([+-]?\d+)\s+([\d.]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/;

async function extractLineupAnalysis(filePath, homeTeamName = null) {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();
  const lines = normalizeLines(data.text);

  const headerIdx = [];
  lines.forEach((line, idx) => {
    if (line === 'Lineup Time Score Score Diff Pts/Min Reb Stl Tov Ass') headerIdx.push(idx);
  });

  if (headerIdx.length < 2) {
    const err = new Error('Could not find two team Lineup Analysis tables in this PDF.');
    err.code = 'EXTRACTION_NO_SECTIONS';
    throw err;
  }

  const rawTeams = headerIdx.slice(0, 2).map((headerLineIdx, i) => {
    const teamName = lines[headerLineIdx - 1] || null;
    const endIdx = i + 1 < headerIdx.length ? headerIdx[i + 1] - 1 : lines.length;
    const blockLines = lines.slice(headerLineIdx + 1, endIdx);

    const lineups = [];
    for (const line of blockLines) {
      const match = line.match(LINEUP_ROW_REGEX);
      if (match) {
        const [, lineupStr, time, scoreFor, scoreAgainst, scoreDiff, ptsPerMin, reb, stl, tov, ass] = match;
        lineups.push({
          players: parseLineupString(lineupStr),
          time_on_court: time,
          score: `${scoreFor}-${scoreAgainst}`,
          score_diff: Number(scoreDiff),
          points_per_min: Number(ptsPerMin),
          rebounds: Number(reb),
          steals: Number(stl),
          turnovers: Number(tov),
          assists: Number(ass),
        });
      }
    }
    return { team_name: teamName, lineups };
  });

  const teams = assignTeamSides(rawTeams, homeTeamName);

  return { teams };
}

// ---------------------------------------------------------------------
// ROTATIONS SUMMARY
// ---------------------------------------------------------------------
// Same lineup identifier, different columns: Quarter On, Time On,
// Quarter Off, Time Off, Time on Court, Score, Score Diff, Reb, Stl,
// Tov, Ass -- ordered chronologically rather than by minutes played.
//
// This report has more columns than Lineup Analysis, so its column
// header AND its data rows wrap across a variable number of physical
// text lines in the real export (confirmed against a live run: a
// per-line regex only ever saw the tail fragment of a wrapped row, e.g.
// "OKWEMBA J/" instead of the full 5-player lineup string). The fix is
// to flatten each team's block into one continuous string and match
// rows with a global regex instead of depending on line boundaries.
const ROTATION_ROW_GLOBAL_REGEX = new RegExp(
  '((?:\\d{1,2}-\\s*[A-Za-z]+(?:\\s?[A-Za-z])?/\\s*){5})' + // exactly 5 player segments
    '(\\d)\\s+(\\d{1,2}:\\d{2})\\s+' + // quarter on, time on
    '(\\d)\\s+(\\d{1,2}:\\d{2})\\s+' + // quarter off, time off
    '(\\d{1,2}:\\d{2})\\s+' + // time on court
    '(\\d+)-(\\d+)\\s+([+-]?\\d+)\\s+' + // score, score diff
    '(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)', // reb stl tov ass
  'g',
);

async function extractRotationsSummary(filePath, homeTeamName = null) {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();
  const lines = normalizeLines(data.text);

  const titleIdx = lines.findIndex(
    (l, i) => l === 'Rotations Summary' || (l === 'Rotations' && lines[i + 1] === 'Summary'),
  );
  if (titleIdx === -1) {
    const err = new Error('Could not find the "Rotations Summary" report title in this PDF.');
    err.code = 'EXTRACTION_NO_SECTIONS';
    throw err;
  }
  // NOTE: same as extractQuarterReport above -- titleIdx is a presence
  // check ONLY. "Rotations Summary" prints as a footer after each team's
  // data block in this export, so team detection below must not filter
  // by idx relative to titleIdx.

  // Team name lines are plain all-caps text (e.g. "CONGO NETS") with the
  // "Lineup Quarter" column header appearing shortly after. This must
  // check for "Lineup" followed specifically by "Quarter" -- Lineup
  // Analysis's header is "Lineup Time Score Score...", which also
  // contains the word "Lineup" and would otherwise be matched by mistake
  // (confirmed: an earlier version using a bare /Lineup/ test grabbed
  // Lineup Analysis's team blocks instead of Rotations Summary's).
  const TEAM_NAME_ONLY_REGEX = /^[A-Z][A-Z ]{1,30}$/;
  const teamNameIdx = [];
  lines.forEach((line, idx) => {
    if (!TEAM_NAME_ONLY_REGEX.test(line)) return;
    const lookahead = lines.slice(idx + 1, idx + 6).join(' ');
    if (/Lineup\s+Quarter\b/.test(lookahead)) teamNameIdx.push(idx);
  });

  if (teamNameIdx.length < 2) {
    const err = new Error('Could not find two team Rotations Summary tables in this PDF.');
    err.code = 'EXTRACTION_NO_SECTIONS';
    throw err;
  }

  const rawTeams = teamNameIdx.slice(0, 2).map((nameIdx, i) => {
    const teamName = lines[nameIdx];
    const endIdx = i + 1 < teamNameIdx.length ? teamNameIdx[i + 1] : lines.length;
    const flatBlock = lines.slice(nameIdx + 1, endIdx).join(' ');

    const stints = [];
    ROTATION_ROW_GLOBAL_REGEX.lastIndex = 0;
    let match;
    while ((match = ROTATION_ROW_GLOBAL_REGEX.exec(flatBlock)) !== null) {
      const [
        , lineupStr, quarterOn, timeOn, quarterOff, timeOff, timeOnCourt,
        scoreFor, scoreAgainst, scoreDiff, reb, stl, tov, ass,
      ] = match;
      try {
        stints.push({
          players: parseLineupString(lineupStr),
          quarter_on: Number(quarterOn),
          time_on: timeOn,
          quarter_off: Number(quarterOff),
          time_off: timeOff,
          time_on_court: timeOnCourt,
          score: `${scoreFor}-${scoreAgainst}`,
          score_diff: Number(scoreDiff),
          rebounds: Number(reb),
          steals: Number(stl),
          turnovers: Number(tov),
          assists: Number(ass),
        });
      } catch (parseErr) {
        // Skip a single malformed stint rather than failing the whole
        // team's table -- the raw lineup string is kept on the error for
        // debugging via server logs if this happens often.
        console.warn('Skipped one Rotations Summary row:', parseErr.message);
      }
    }
    return { team_name: teamName, stints };
  });

  const teams = assignTeamSides(rawTeams, homeTeamName);

  return { teams };
}

module.exports = {
  extractQuarterReport,
  extractPlusMinusSummary,
  extractLineupAnalysis,
  extractRotationsSummary,
};

// ---------------------------------------------------------------------
// PLAY BY PLAY
// ---------------------------------------------------------------------
// The header block ("DIVISION 1" / date / report title / score line /
// quarter-score box / "GameNo." / "Attendance" / "GameDuration" /
// "Report Generated" / a "-- N of 36 --" page marker) repeats at every
// page break throughout this multi-page report -- confirmed directly:
// it always starts at the literal line "DIVISION 1" and always ends at
// a line matching /^-- \d+ of \d+ --$/, so that pair is used as a skip
// boundary rather than trying to match every line inside it individually.
// Occasionally two such blocks appear back to back with no data between
// them (a blank page at a report boundary) -- skipping is applied
// repeatedly to handle that.
//
// The "Game Time USIU Score Diff CNS" column header also repeats,
// inconsistently, at points not always adjacent to a header block, so
// it is skipped as its own exact-match line wherever it appears.
//
// Column layout: when USIU (left column) acts, the score/diff (if the
// action scored) is appended AFTER the action text; when CNS (right
// column) acts, the score/diff appears BEFORE the action text, because
// the empty USIU cell contributes nothing to the linearized reading
// order for that row. Rather than using that position as the signal for
// which team acted (fragile), team is instead resolved by looking the
// acting player's "<SURNAME> <INITIAL>" token up against the roster
// built from the Box Score section (extractBoxScoreRoster below) --
// confirmed no surname+initial collisions between the two teams in this
// export. The leading/trailing position is used only to know whether a
// found score belongs before or after the action text, not to infer team.
//
// Wrapped rows (a row's action text continuing onto the next physical
// line with no time prefix) are merged the same way as other extractors
// in this file: any line that isn't a recognised structural marker and
// isn't itself time-prefixed is treated as a continuation of the
// previous event and appended to it.
//
// NOTE ON SCOPE: this extracts one row per event -- quarter, game clock,
// acting player (jersey/surname/initial/team) when present, the raw
// action text verbatim, and the score/diff if that action changed the
// score. It does NOT classify the action text into a taxonomy (shot
// type, make/miss, foul type, etc.) -- that raw text is preserved
// as-is so a later pass can do that classification without re-parsing
// PDFs. A handful of events (team rebounds after a loose ball) have no
// individual player credited in the source PDF itself -- these are kept
// with player: null rather than dropped, since that reflects the actual
// report, not a parsing failure.

const ROSTER_ROW_REGEX =
  /^\*?(\d{1,2})\s+([A-Z][A-Za-z'\-]+(?:\s+[A-Za-z'\-]+)*?)(?:\s*\(C\))?\s+(\d{1,2}:\d{2})\s+/;

function extractBoxScoreRoster(lines) {
  // Team section headers look like "USIU TIGERS (USIU) Assistant Coach(es):"
  const teamHeaderRegex = /^(.+?)\s*\(([A-Z]{2,5})\)\s+Assistant Coach/;
  const teams = [];
  lines.forEach((line, idx) => {
    const m = line.match(teamHeaderRegex);
    if (m) teams.push({ startIdx: idx, teamFullName: m[1].trim(), teamCode: m[2] });
  });
  if (teams.length < 2) {
    const err = new Error('Could not find two team roster sections in the Box Score.');
    err.code = 'EXTRACTION_NO_SECTIONS';
    throw err;
  }

  // roster key: "SURNAME INITIAL" (uppercase) -> { teamCode, jersey, fullName }
  const rosterMap = {};
  teams.slice(0, 2).forEach((team, i) => {
    // Bound each team's roster scan by its OWN "Totals" row, not by
    // document length or the next team header -- the last team has no
    // "next team" to bound it, and without this the scan would run to
    // the end of the whole document and re-match unrelated later tables
    // that share the same "jersey NAME time..." shape (confirmed: the
    // Plus/Minus Summary table further down matches this same pattern
    // and was being pulled in as false roster data for the last team).
    const outerBound = i + 1 < teams.length ? teams[i + 1].startIdx : lines.length;
    let totalsIdx = -1;
    for (let k = team.startIdx + 1; k < outerBound; k += 1) {
      if (lines[k].startsWith('Totals')) { totalsIdx = k; break; }
    }
    const endIdx = totalsIdx === -1 ? outerBound : totalsIdx;
    for (let j = team.startIdx + 1; j < endIdx; j += 1) {
      const line = lines[j];
      if (line.startsWith('Team/Coach')) continue;
      const rm = line.match(ROSTER_ROW_REGEX);
      if (!rm) continue;
      const [, jersey, rawName] = rm;
      const nameWords = rawName.replace(/\(C\)/i, '').trim().split(/\s+/);
      if (nameWords.length < 2) continue; // can't split first/surname reliably
      const firstName = nameWords[0];
      const surname = nameWords.slice(1).join(' ').toUpperCase();
      const initial = firstName[0].toUpperCase();
      const key = `${surname} ${initial}`;
      if (rosterMap[key] && rosterMap[key].teamCode !== team.teamCode) {
        console.warn(`Play-by-play roster: ambiguous name "${key}" appears on both teams; team attribution for this player will be unreliable.`);
      }
      rosterMap[key] = { teamCode: team.teamCode, jersey: Number(jersey), fullName: `${firstName} ${nameWords.slice(1).join(' ')}` };
    }
  });

  return { rosterMap, teamCodes: teams.slice(0, 2).map((t) => t.teamCode) };
}

const PAGE_MARKER_REGEX = /^-- \d+ of \d+ --$/;
const TIME_PREFIX_REGEX = /^(\d{1,2}:\d{2})\s+(.*)$/;
const PLAYER_TOKEN_REGEX = /^(\d{1,2})\s+([A-Z][A-Za-z'\-]+)\s+([A-Z])\s+(.*)$/;
const LEADING_SCORE_REGEX = /^(\d+)-(\d+)\s+(-?\d+)\s+(.*)$/;
const TRAILING_SCORE_REGEX = /^(.*?)\s+(\d+)-(\d+)\s+(-?\d+)$/;

function skipHeaderBlocks(lines, startIdx) {
  let idx = startIdx;
  while (idx < lines.length && lines[idx] === 'DIVISION 1') {
    const markerIdx = lines.findIndex((l, i) => i > idx && PAGE_MARKER_REGEX.test(l));
    idx = markerIdx === -1 ? lines.length : markerIdx + 1;
  }
  return idx;
}

function parseEventText(rawText) {
  let text = rawText.trim();
  let score = null;

  const leading = text.match(LEADING_SCORE_REGEX);
  if (leading) {
    score = { home: Number(leading[1]), opponent: Number(leading[2]), diff: Number(leading[3]) };
    text = leading[4].trim();
  } else {
    const trailing = text.match(TRAILING_SCORE_REGEX);
    if (trailing) {
      score = { home: Number(trailing[2]), opponent: Number(trailing[3]), diff: Number(trailing[4]) };
      text = trailing[1].trim();
    }
  }

  const playerMatch = text.match(PLAYER_TOKEN_REGEX);
  if (playerMatch) {
    const [, jersey, surname, initial, actionText] = playerMatch;
    return {
      jersey_number: Number(jersey),
      surname: surname.toUpperCase(),
      initial: initial.toUpperCase(),
      action_text: actionText.trim(),
      score,
    };
  }

  // No player token (e.g. "Timeout Full", "jump ball situation", or an
  // uncredited team rebound) -- keep the event with player fields null
  // rather than dropping it.
  return { jersey_number: null, surname: null, initial: null, action_text: text, score };
}

async function extractPlayByPlay(filePath) {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();
  const lines = normalizeLines(data.text);

  const { rosterMap, teamCodes } = extractBoxScoreRoster(lines);

  // Anchored on "Quarter N" rather than "Quarter Starters:" -- the latter
  // is always the line immediately after "Quarter N", and the loop below
  // relies on encountering "Quarter N" itself to arm awaitingStarters (the
  // countdown that skips the two starting-lineup lines). Starting at
  // "Quarter Starters:" skipped over that line entirely, so
  // awaitingStarters was never armed and the loop broke on the very first
  // roster line -- this was silently producing zero events on real PDFs.
  const firstQuarterStartIdx = lines.findIndex((l) => /^Quarter \d$/.test(l));
  if (firstQuarterStartIdx === -1) {
    const err = new Error('Could not find the "Quarter N" marker that begins Play by Play in this PDF.');
    err.code = 'EXTRACTION_NO_SECTIONS';
    throw err;
  }

  const events = [];
  let currentQuarter = null;
  let awaitingStarters = 0; // counts down 2 lines (USIU starters, CNS starters) after "Quarter N"
  let pending = null; // { quarter, time, rawText }

  const flushPending = () => {
    if (!pending) return;
    const parsed = parseEventText(pending.rawText);
    let team = null;
    if (parsed.surname) {
      const rosterEntry = rosterMap[`${parsed.surname} ${parsed.initial}`];
      if (rosterEntry) team = rosterEntry.teamCode;
    }
    events.push({
      quarter: pending.quarter,
      time: pending.time,
      team,
      jersey_number: parsed.jersey_number,
      player_surname: parsed.surname,
      player_initial: parsed.initial,
      action_text: parsed.action_text,
      score: parsed.score,
    });
    pending = null;
  };

  let idx = firstQuarterStartIdx;
  while (idx < lines.length) {
    const line = lines[idx];

    if (line === 'DIVISION 1') {
      // ALWAYS flush before skipping a header block, unconditionally --
      // even the LAST page of Play-by-Play still labels its own footer
      // "Play by Play" (confirmed against real output), so the title
      // text inside the block cannot distinguish "more PBP coming" from
      // "this was the final page." A real multi-line wrapped event never
      // legitimately spans an entire page break in this export, so
      // flushing here costs nothing on genuine continuations, and it
      // guarantees nothing can survive across a page boundary to
      // silently absorb whatever report comes next -- which is exactly
      // what produced a 15,860-character "event" before this fix: the
      // header block was skipped correctly, but the still-open pending
      // event was never closed, so it kept absorbing every line after
      // (Player Evaluation, Plus/Minus, Quarter, Rotations Summary, Score
      // Sheet) all the way to the end of the document.
      flushPending();
      idx = skipHeaderBlocks(lines, idx);
      continue;
    }
    if (line === 'Game Time USIU Score Diff CNS') { idx += 1; continue; }

    if (line.startsWith('Quarter Starters:')) { idx += 1; continue; }

    const quarterMatch = line.match(/^Quarter (\d)$/);
    if (quarterMatch) {
      flushPending();
      currentQuarter = Number(quarterMatch[1]);
      awaitingStarters = 2; // next two lines are the USIU / CNS starting lineups
      idx += 1;
      continue;
    }

    if (awaitingStarters > 0) { awaitingStarters -= 1; idx += 1; continue; }

    const timeMatch = line.match(TIME_PREFIX_REGEX);
    if (timeMatch) {
      flushPending();
      pending = { quarter: currentQuarter, time: timeMatch[1], rawText: timeMatch[2] };
      idx += 1;
      continue;
    }

    if (pending) {
      // Continuation of a wrapped event line.
      pending.rawText += ' ' + line;
      idx += 1;
      continue;
    }

    // Nothing recognised, no pending event to attach it to, and we're
    // past the last "Quarter Starters:" -- this is the start of the
    // next report section (e.g. Player Evaluation). Stop here.
    break;
  }
  flushPending();

  return { teamCodes, events };
}

module.exports.extractPlayByPlay = extractPlayByPlay;
module.exports.extractBoxScoreRoster = extractBoxScoreRoster;