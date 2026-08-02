// FIBA Europe Stats Suite (v3.6.2) extractors -- a DIFFERENT report system
// from FIBA LiveStats (which pdfExtraction.js/reportExtractors.js are
// built against). Games exported from this system have no
// "Assistant Coach(es):" or "Quarter Starters:" markers at all, so the
// existing extractors will never match them -- they need their own
// detector and their own parsers.
//
// VERIFIED against a real export (TIGERS vs BLADES, game no. 24,
// 28.06.2025) at the raw-text level via pdfplumber, which is the same
// underlying extraction approach as pdf-parse (both walk the PDF's text
// content stream). KNOWN RISK: a prior attempt at this same format found
// that pdf-parse's actual column/token order did NOT always match a
// layout-aware renderer's -- I don't have network access to run pdf-parse
// itself in this environment, so treat the regexes below as verified
// against extracted text content, not against pdf-parse's exact
// tokenisation. Cross-checks (team-total reconciliation) are included
// specifically to catch that class of error at runtime rather than
// silently returning wrong data -- do not remove them.

const fs = require('fs');
const { PDFParse } = require('pdf-parse');

function isStatsSuiteFormat(text) {
  return /FIBA Europe Stats Suite/i.test(text);
}

// This format's page headings, used to bound each extractor to its own
// section when the PDF is a merged multi-report export (which every real
// export in this codebase has been so far). Without this, a permissive
// heuristic in one extractor (e.g. Lineup Efficiency's all-caps
// team-name detector) can pick up stray lines from a completely
// different report type elsewhere in the same document -- caught during
// testing: parsing Lineup Efficiency against the full merged document
// produced two extra phantom "teams" (0 lineups each) picked up from the
// Official Statistics and Team Comparison pages.
const SECTION_HEADINGS = [
  'OFFICIAL STATISTICS', 'LINEUP EFFICIENCY', 'PLAY BY PLAY',
  'PLAYER EVALUATION', 'SCORE DEVELOPMENT', 'Shot chart', 'TEAM COMPARISON',
];

function sliceSection(lines, startMarker) {
  const startIdx = lines.indexOf(startMarker);
  if (startIdx === -1) return null;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    if (SECTION_HEADINGS.includes(lines[i])) { endIdx = i; break; }
  }
  return lines.slice(startIdx, endIdx);
}

// --- Official Statistics (this format's Box Score equivalent) ---------

// Row shape verified against real text, e.g.:
//   "*5V MPONELA 39:02 9/21 42.9 8/16 50.0 1/5 20.0 2/4 50.0 2 4 6 8 4 5 0 2 5 +7 21"
//   "11D KISIVULI 10:17 1/4 25.0 1/2 50.0 0/2 0.0 0/2 0.0 0 0 0 0 2 1 0 0 1 -14 2"
// Star + jersey + initial run together with no space ("*5V", "11D");
// surname follows after a space. Column order after minutes: FG M/A%,
// 2P M/A%, 3P M/A%, FT M/A%, then OR RD Tot AS TO ST BS C D +/- PTS (11
// single-number fields -- confirmed against the Legend block: this
// format uses C/D for committed/drawn fouls where FIBA LiveStats uses
// PF/FD, and has no separate DNP row data beyond the "DNP" marker).
const PLAYER_ROW_REGEX = new RegExp(
  '^(\\*?)(\\d{1,2})([A-Z])\\s+([A-Z][A-Za-z]*)\\s+' +   // star, jersey, initial, surname
  '(\\d{1,2}:\\d{2})\\s+' +                              // minutes
  '(\\d+)/(\\d+)\\s+([\\d.]+)\\s+' +                     // FG
  '(\\d+)/(\\d+)\\s+([\\d.]+)\\s+' +                     // 2P
  '(\\d+)/(\\d+)\\s+([\\d.]+)\\s+' +                     // 3P
  '(\\d+)/(\\d+)\\s+([\\d.]+)\\s+' +                     // FT
  '(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+' +                     // OR RD Tot
  '(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+' +            // AS TO ST BS
  '(\\d+)\\s+(\\d+)\\s+' +                               // C D
  '([+-]?\\d+)\\s+' +                                    // +/-
  '(\\d+)$',                                              // PTS
);
const DNP_ROW_REGEX = /^(\d{1,2})([A-Z])\s+([A-Z][A-Za-z]*)\s+DNP$/;
const TEAM_HEADER_REGEX = /^(.+?)\s+\((.+?)\)\s+Head coach:/;
const TOTALS_REGEX = /^Totals\s+(\d+)\/(\d+)/;
const SCORE_LINE_REGEX = /^(\d+)\s*-\s*(\d+)$/;
const GAME_NO_REGEX = /^Game no\.\s*(\d+)/;
const MATCHUP_REGEX = /^(.+?)\s+vs\s+(.+)$/;
const DATE_REGEX = /(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2})/;

function parseOfficialStatisticsText(lines) {
  const gameNoLine = lines.find((l) => GAME_NO_REGEX.test(l));
  const gameNumber = gameNoLine ? gameNoLine.match(GAME_NO_REGEX)[1] : null;

  const matchupIdx = lines.findIndex((l) => MATCHUP_REGEX.test(l));
  const matchup = matchupIdx !== -1 ? lines[matchupIdx].match(MATCHUP_REGEX) : null;

  const dateLine = lines.find((l) => DATE_REGEX.test(l));
  const dateMatch = dateLine && dateLine.match(DATE_REGEX);
  const matchDate = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : null;
  const tipOffTime = dateMatch ? dateMatch[4] : null;

  // Final score appears as its own "70 - 71" line right after the
  // "OFFICIAL STATISTICS" heading.
  const scoreLineIdx = lines.findIndex((l) => SCORE_LINE_REGEX.test(l));
  const scoreMatch = scoreLineIdx !== -1 ? lines[scoreLineIdx].match(SCORE_LINE_REGEX) : null;

  const teamHeaderIdxs = [];
  lines.forEach((line, idx) => {
    if (TEAM_HEADER_REGEX.test(line)) teamHeaderIdxs.push(idx);
  });

  if (teamHeaderIdxs.length < 2) {
    const err = new Error('Could not find two "<TEAM> (<CLUB>) Head coach:" section headers.');
    err.code = 'EXTRACTION_NO_SECTIONS';
    throw err;
  }

  const sections = teamHeaderIdxs.slice(0, 2).map((startIdx, i) => {
    const endIdx = i + 1 < teamHeaderIdxs.length ? teamHeaderIdxs[i + 1] : lines.length;
    return lines.slice(startIdx, endIdx);
  });

  const teamSideOrder = ['home', 'opponent'];
  const players = [];
  const teamTotalsFromDoc = []; // [{points, fga, fgm}] per team, from the Totals row, for cross-check only
  const unparsedLines = [];

  sections.forEach((sectionLines, i) => {
    const teamSide = teamSideOrder[i];
    const headerMatch = sectionLines[0].match(TEAM_HEADER_REGEX);
    const teamName = headerMatch ? headerMatch[1].trim() : null;

    for (const line of sectionLines) {
      const totalsMatch = line.match(TOTALS_REGEX);
      if (totalsMatch) {
        const ptsMatch = line.match(/(\d+)$/);
        teamTotalsFromDoc.push({
          teamSide,
          fgm: Number(totalsMatch[1]),
          fga: Number(totalsMatch[2]),
          points: ptsMatch ? Number(ptsMatch[1]) : null,
        });
        continue;
      }
      if (/^Team\/Coach\b/.test(line) || /^No\. Name Min/.test(line) || /^FG 2P FG/.test(line)) {
        continue;
      }
      const dnp = line.match(DNP_ROW_REGEX);
      if (dnp) {
        players.push({
          jersey_number: Number(dnp[1]),
          player_name: `${dnp[3]} ${dnp[2]}`, // "SURNAME INITIAL" -> normalised below
          team_side: teamSide,
          team_name: teamName,
          did_not_play: true,
        });
        continue;
      }
      const m = line.match(PLAYER_ROW_REGEX);
      if (m) {
        const [
          , star, jersey, initial, surname, minutes,
          fgm, fga, fgPct, twoPm, twoPa, twoPct, threePm, threePa, threePct,
          ftm, fta, ftPct, oreb, dreb, tot, assists, turnovers, steals, blocks,
          committedFouls, drawnFouls, plusMinus, points,
        ] = m;
        players.push({
          jersey_number: Number(jersey),
          // Normalised to the SAME "FIRSTNAME SURNAME"-shaped convention
          // extractBoxScore() uses for LiveStats, so downstream code
          // (e.g. a shared player-name-matching helper) doesn't need a
          // second code path: here we only have an initial, not a full
          // first name, so this stores "INITIAL SURNAME" and callers
          // matching against this format's OTHER reports (Lineup
          // Efficiency's "V. MPONELA", Play-by-Play's "V. MPONELA")
          // should match on (surname, initial) pairs, not full-string
          // equality -- see parseStatsSuitePlayByPlay.js when it exists.
          player_name: `${initial} ${surname}`,
          team_side: teamSide,
          team_name: teamName,
          starter: star === '*',
          minutes_display: minutes,
          minutes: minutesToDecimal(minutes),
          points: Number(points),
          fgm: Number(fgm), fga: Number(fga), fg_pct: Number(fgPct),
          two_pm: Number(twoPm), two_pa: Number(twoPa), two_pct: Number(twoPct),
          three_pm: Number(threePm), three_pa: Number(threePa), three_pct: Number(threePct),
          ftm: Number(ftm), fta: Number(fta), ft_pct: Number(ftPct),
          oreb: Number(oreb), dreb: Number(dreb), reb: Number(tot),
          assists: Number(assists),
          turnovers: Number(turnovers),
          steals: Number(steals),
          blocks: Number(blocks),
          committed_fouls: Number(committedFouls),
          drawn_fouls: Number(drawnFouls),
          plus_minus: Number(plusMinus),
        });
      } else if (/\d/.test(line) && line.length > 15) {
        unparsedLines.push(line);
      }
    }
  });

  // Cross-check: sum of player points per team must equal both (a) the
  // Totals row's own PTS figure and (b) the final score parsed from the
  // "70 - 71" line. This is the same class of check that caught a real
  // team-attribution bug in the LiveStats Play-by-Play parser -- keep it.
  const checkResults = teamSideOrder.map((side, i) => {
    const summed = players.filter((p) => p.team_side === side && !p.did_not_play)
      .reduce((sum, p) => sum + p.points, 0);
    const totalsRow = teamTotalsFromDoc.find((t) => t.teamSide === side);
    const finalScore = scoreMatch ? Number(scoreMatch[i + 1]) : null;
    return {
      team_side: side,
      summed_player_points: summed,
      totals_row_points: totalsRow ? totalsRow.points : null,
      final_score: finalScore,
      consistent: totalsRow && finalScore != null
        && summed === totalsRow.points && summed === finalScore,
    };
  });

  if (checkResults.some((c) => !c.consistent)) {
    const err = new Error(
      'Player points do not reconcile with the Totals row and/or final score for at least one team -- '
      + 'this usually means the row regex is misreading a column for this specific export. Not returning '
      + 'unverified data.',
    );
    err.code = 'EXTRACTION_RECONCILIATION_FAILED';
    err.checkResults = checkResults;
    err.rawTextSample = lines.slice(0, 40).join('\n');
    throw err;
  }

  if (players.filter((p) => !p.did_not_play).length === 0) {
    const err = new Error('No player rows matched the expected Stats Suite Official Statistics layout.');
    err.code = 'EXTRACTION_NO_MATCH';
    err.rawTextSample = lines.slice(0, 40).join('\n');
    throw err;
  }

  return {
    players,
    gameInfo: {
      gameNumber,
      homeTeam: matchup ? matchup[1].trim() : null,
      awayTeam: matchup ? matchup[2].trim() : null,
      homeScore: scoreMatch ? Number(scoreMatch[1]) : null,
      awayScore: scoreMatch ? Number(scoreMatch[2]) : null,
      matchDate,
      tipOffTime,
    },
    reconciliation: checkResults,
    unparsedLineCount: unparsedLines.length,
    unparsedLines: unparsedLines.slice(0, 10),
  };
}

function minutesToDecimal(mmss) {
  const [m, s] = mmss.split(':').map(Number);
  return Math.round((m + s / 60) * 10) / 10;
}

async function extractStatsSuiteOfficialStatistics(filePath) {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();

  if (!isStatsSuiteFormat(data.text)) {
    const err = new Error('This PDF is not a FIBA Europe Stats Suite export (no "FIBA Europe Stats Suite" marker found).');
    err.code = 'EXTRACTION_WRONG_FORMAT';
    throw err;
  }

  const normalizedText = data.text.replace(/\t/g, ' ');
  const lines = normalizedText.split('\n').map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean);

  if (!lines.some((l) => l === 'OFFICIAL STATISTICS')) {
    const err = new Error('No Official Statistics page found in this PDF.');
    err.code = 'EXTRACTION_NO_SECTIONS';
    throw err;
  }

  return parseOfficialStatisticsText(lines);
}

// --- Lineup Efficiency ---------------------------------------------------

// Row shape verified, e.g.:
//   "5. V. MPONELA* 7. P. OTANGO* 9. K. DENG* 20. M. GICHANA* 21. J. ATHIAN* 06:28 +11 (14 - 3)"
// Five "jersey. Initial. Surname[*]" tokens, then minutes, then a signed
// differential with the raw score in parens. The trailing "* - Starters"
// footnote line is not itself a lineup row and must be excluded.
const LINEUP_PLAYER_TOKEN = '\\d{1,2}\\.\\s+[A-Z]\\.\\s+[A-Z][A-Za-z]*\\*?';
const LINEUP_ROW_REGEX = new RegExp(
  '^((?:' + LINEUP_PLAYER_TOKEN + '\\s+){4}' + LINEUP_PLAYER_TOKEN + ')\\s+'
  + '(\\d{1,2}:\\d{2})\\s+'
  + '([+-]?\\d+)\\s+\\((\\d+)\\s*-\\s*(\\d+)\\)$',
);
const LINEUP_PLAYER_SPLIT_REGEX = /(\d{1,2})\.\s+([A-Z])\.\s+([A-Z][A-Za-z]*)(\*?)/g;

function parseLineupEfficiencyText(lines) {
  const teams = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === 'null' || line === '* - Starters' || line.startsWith('FIBA Europe Stats Suite')) continue;
    if (line === 'TIGERS vs BLADES' || /^Game no\./.test(line) || line === '(Local time)') continue;
    if (line === 'LINEUP EFFICIENCY' || /^\d+\s*-\s*\d+$/.test(line) || /^\(\d/.test(line)) continue;
    if (line === 'Lineup Minutes played Score development') continue;

    // A bare team name line (all-caps word(s), nothing else) starts a
    // new team section -- this format has no "(CLUB)" suffix here like
    // Official Statistics does, just the plain team name on its own line.
    if (/^[A-Z][A-Z ]+$/.test(line) && !LINEUP_ROW_REGEX.test(line)) {
      current = { teamName: line, lineups: [] };
      teams.push(current);
      continue;
    }

    const m = line.match(LINEUP_ROW_REGEX);
    if (m && current) {
      const playersRaw = m[1];
      const players = [];
      let pm;
      LINEUP_PLAYER_SPLIT_REGEX.lastIndex = 0;
      while ((pm = LINEUP_PLAYER_SPLIT_REGEX.exec(playersRaw)) !== null) {
        players.push({
          jersey_number: Number(pm[1]),
          initial: pm[2],
          surname: pm[3],
          starter: pm[4] === '*',
        });
      }
      current.lineups.push({
        players,
        minutes_played: m[2],
        score_diff: Number(m[3]),
        team_points: Number(m[4]),
        opponent_points: Number(m[5]),
      });
    }
  }

  const realTeams = teams.filter((t) => t.lineups.length > 0);
  if (realTeams.length === 0) {
    const err = new Error('No lineup rows matched the expected Stats Suite Lineup Efficiency layout.');
    err.code = 'EXTRACTION_NO_MATCH';
    err.rawTextSample = lines.slice(0, 30).join('\n');
    throw err;
  }

  return { teams: realTeams };
}

async function extractStatsSuiteLineupEfficiency(filePath) {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();

  if (!isStatsSuiteFormat(data.text)) {
    const err = new Error('This PDF is not a FIBA Europe Stats Suite export.');
    err.code = 'EXTRACTION_WRONG_FORMAT';
    throw err;
  }

  const normalizedText = data.text.replace(/\t/g, ' ');
  const lines = normalizedText.split('\n').map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean);

  if (!lines.some((l) => l === 'LINEUP EFFICIENCY')) {
    const err = new Error('No Lineup Efficiency page found in this PDF.');
    err.code = 'EXTRACTION_NO_SECTIONS';
    throw err;
  }

  const scoped = sliceSection(lines, 'LINEUP EFFICIENCY');
  return parseLineupEfficiencyText(scoped);
}

// --- Player Evaluation ----------------------------------------------------

// Verified 4-line block per player, e.g.:
//   "#11. D KISIVULI (TIGERS )"
//   "FG 2P FG 3P FG FT Reb PF Minutes played: 10:17"
//   "M/A % M/A % M/A % M/A % RORD Tot AS TO ST BS C D PTS Points scored: 2"
//   "1/4 25.0 1/2 50.0 0/2 0.0 0/2 0.0 0 0 0 0 2 1 0 0 1 2 +/- rating: -14"
// Minutes/points/+- are appended to the ends of the legend/data lines
// rather than living on their own lines, so they're pulled with their
// own small regexes rather than as part of the main data-row match.
const PLAYER_HEADER_REGEX = /^#(\d{1,2})\.\s+([A-Z])\s+([A-Z][A-Za-z]*)\s+\((.+?)\s*\)$/;
const MINUTES_SUFFIX_REGEX = /Minutes played:\s*(\d{1,2}:\d{2})$/;
const POINTS_SUFFIX_REGEX = /Points scored:\s*(\d+)$/;
const PLUSMINUS_SUFFIX_REGEX = /\+\/-\s*rating:\s*([+-]?\d+)$/;
const EVAL_DATA_ROW_REGEX = new RegExp(
  '^(\\d+)/(\\d+)\\s+([\\d.]+)\\s+'
  + '(\\d+)/(\\d+)\\s+([\\d.]+)\\s+'
  + '(\\d+)/(\\d+)\\s+([\\d.]+)\\s+'
  + '(\\d+)/(\\d+)\\s+([\\d.]+)\\s+'
  + '(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+'
  + '(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+'
  + '(\\d+)\\s+(\\d+)\\s+'
  + '(\\d+)',                                   // PTS (the "+/- rating:" suffix is stripped before this regex runs)
);

function parsePlayerEvaluationText(lines) {
  const players = [];
  let pending = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const header = line.match(PLAYER_HEADER_REGEX);
    if (header) {
      if (pending && pending.points != null) players.push(pending);
      pending = {
        jersey_number: Number(header[1]),
        player_name: `${header[2]} ${header[3]}`, // "INITIAL SURNAME" convention, see Official Statistics note
        team_name: header[4].trim(),
        minutes_display: null,
        points: null,
        plus_minus: null,
      };
      continue;
    }
    if (!pending) continue;

    const minutesM = line.match(MINUTES_SUFFIX_REGEX);
    if (minutesM) pending.minutes_display = minutesM[1];

    const pointsM = line.match(POINTS_SUFFIX_REGEX);
    if (pointsM) pending.points_suffix = Number(pointsM[1]); // cross-check against data row's own PTS

    const plusMinusM = line.match(PLUSMINUS_SUFFIX_REGEX);
    let dataLine = line;
    if (plusMinusM) {
      pending.plus_minus = Number(plusMinusM[1]);
      dataLine = line.slice(0, line.indexOf('+/- rating:')).trim();
    }

    const dataM = dataLine.match(EVAL_DATA_ROW_REGEX);
    if (dataM) {
      const [
        , fgm, fga, fgPct, twoPm, twoPa, twoPct, threePm, threePa, threePct,
        ftm, fta, ftPct, oreb, dreb, tot, assists, turnovers, steals, blocks,
        committedFouls, drawnFouls, points,
      ] = dataM;
      Object.assign(pending, {
        fgm: Number(fgm), fga: Number(fga), fg_pct: Number(fgPct),
        two_pm: Number(twoPm), two_pa: Number(twoPa), two_pct: Number(twoPct),
        three_pm: Number(threePm), three_pa: Number(threePa), three_pct: Number(threePct),
        ftm: Number(ftm), fta: Number(fta), ft_pct: Number(ftPct),
        oreb: Number(oreb), dreb: Number(dreb), reb: Number(tot),
        assists: Number(assists), turnovers: Number(turnovers),
        steals: Number(steals), blocks: Number(blocks),
        committed_fouls: Number(committedFouls), drawn_fouls: Number(drawnFouls),
        points: Number(points),
      });
    }
  }
  if (pending && pending.points != null) players.push(pending);

  // Cross-check: the "Points scored: N" suffix (from the legend line) must
  // match the PTS field parsed off the end of the data row itself -- two
  // independent readings of the same number, from two different lines.
  const mismatches = players.filter((p) => p.points_suffix != null && p.points_suffix !== p.points);
  if (mismatches.length > 0) {
    const err = new Error('Points scored (legend line) does not match parsed PTS (data row) for at least one player -- not returning unverified data.');
    err.code = 'EXTRACTION_RECONCILIATION_FAILED';
    err.mismatches = mismatches;
    throw err;
  }

  if (players.length === 0) {
    const err = new Error('No player blocks matched the expected Stats Suite Player Evaluation layout.');
    err.code = 'EXTRACTION_NO_MATCH';
    err.rawTextSample = lines.slice(0, 30).join('\n');
    throw err;
  }

  return { players };
}

async function extractStatsSuitePlayerEvaluation(filePath) {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();

  if (!isStatsSuiteFormat(data.text)) {
    const err = new Error('This PDF is not a FIBA Europe Stats Suite export.');
    err.code = 'EXTRACTION_WRONG_FORMAT';
    throw err;
  }

  const normalizedText = data.text.replace(/\t/g, ' ');
  const lines = normalizedText.split('\n').map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean);

  if (!lines.some((l) => l === 'PLAYER EVALUATION')) {
    const err = new Error('No Player Evaluation page found in this PDF.');
    err.code = 'EXTRACTION_NO_SECTIONS';
    throw err;
  }

  return parsePlayerEvaluationText(lines);
}

module.exports = {
  isStatsSuiteFormat,
  extractStatsSuiteOfficialStatistics,
  extractStatsSuiteLineupEfficiency,
  extractStatsSuitePlayerEvaluation,
  parseOfficialStatisticsText,
  parseLineupEfficiencyText,
  parsePlayerEvaluationText,
};