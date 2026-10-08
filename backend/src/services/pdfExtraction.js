const { assignTeamSides } = require('./teamSide');
const { parseFileToLines } = require('./pdfText');

// FIBA LiveStats "Box Score" report extractor.
//
// CALIBRATED against a real exported PDF (FIBA_Box_Score_USIU_vs_JKUAT,
// division 1, 21 Jun 2026, powered by Genius Sports). Confirmed column
// order per player row, matching the report's own legend:
//   Min | FG(M/A,%) | 2PT(M/A,%) | 3PT(M/A,%) | FT(M/A,%)
//   | OR | DR | TOT | AS | TO | ST | BS | PF | FD | +/- | EF | PTS
// pdf-parse's tab placement is inconsistent between rows (depends on text
// x-position, not real table cells), so this parses on a fixed-arity
// whitespace-token pattern rather than trusting tab boundaries. If a future
// export from a different FIBA LiveStats template reorders these columns,
// the fix is in PLAYER_ROW_REGEX and the destructuring below only.
//
// Also handles merged/combined PDFs that bundle the Box Score alongside
// other FIBA report types (Play-by-Play, Shot Chart, etc.) in one file --
// the "Assistant Coach(es):" section markers only ever appear on the Box
// Score's own pages, so extraction is unaffected by whatever else is
// bundled into the same PDF (confirmed against a real 10-report merged
// export on 22 Jul 2026 -- extraction matched the standalone Box Score
// exactly, player-for-player).

const MONTH_ABBREVIATIONS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Parses a "<day> <Mon> <year>" date string (e.g. "26 Jul 2026", the real
// format this report's own venue/date line uses once the weekday prefix
// is stripped) into a real, timezone-independent ISO date string, built
// directly from its own day/month/year components -- never through
// new Date(nonIsoString).toISOString(), which Node parses as LOCAL
// midnight for this exact non-ISO format, then converts to UTC. That
// made the same real date compute to a different ISO string depending on
// the server's timezone offset at parse time: confirmed directly on
// this project's own dev environment (Africa/Nairobi, UTC+3) that "26
// Jul 2026" computed as "2026-07-25" -- one day early -- while the
// identical input under TZ=UTC computed the correct "2026-07-26" (Step
// 27 investigation). That's what split real game data across duplicate
// `games` rows in production. Returns null on anything that doesn't
// match, same as the caller's own null-on-no-match convention.
function parseDayMonthYear(dateOnly) {
  const match = dateOnly.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!match) return null;
  const monthIndex = MONTH_ABBREVIATIONS[match[2].toLowerCase()];
  if (monthIndex === undefined) return null;
  const day = Number(match[1]);
  const year = Number(match[3]);
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Groups: star, jersey, name, min, fgm, fga, fgpct, twopm, twopa, twopct,
// threepm, threepa, threepct, ftm, fta, ftpct, oreb, dreb, tot, as, to, st,
// bs, pf, fd, plusminus, ef, pts
const PLAYER_ROW_REGEX = new RegExp(
  '^(\\*?)(\\d{1,2})\\s+' +                                    // star + jersey
  "([A-Z][A-Za-z.'()\\-]*(?:\\s+[A-Za-z.'()\\-]+)*)\\s+" +      // name (allows "(C)")
  '(\\d{1,2}:\\d{2})\\s+' +                                    // minutes
  '(\\d+)/(\\d+)\\s+([\\d.]+)\\s+' +                           // FG M/A %
  '(\\d+)/(\\d+)\\s+([\\d.]+)\\s+' +                           // 2PT M/A %
  '(\\d+)/(\\d+)\\s+([\\d.]+)\\s+' +                           // 3PT M/A %
  '(\\d+)/(\\d+)\\s+([\\d.]+)\\s+' +                           // FT M/A %
  '(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+' +                           // OR DR TOT
  '(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+' +                 // AS TO ST BS
  '(\\d+)\\s+(\\d+)\\s+' +                                     // PF FD
  '([+-]?\\d+)\\s+' +                                          // +/-
  '([+-]?\\d+)\\s+' +                                          // EF
  '(\\d+)$',                                                   // PTS
);

// Step 67/68: the report's own official per-team Totals row -- same
// column shape as PLAYER_ROW_REGEX above, minus the star/jersey/name
// prefix (this row always prints the literal "Totals" + a fixed "200:00"
// in their place). Previously discarded entirely (see the old
// `/^Totals\b/.test(line) -> continue` in extractBoxScore below); now the
// authoritative source for team_game_stats, read directly rather than
// reconstructed by summing player rows (Step 67 investigation: summing
// alone undercounts OR/DR/TOT/TO whenever this game's own Team/Coach row,
// below, carries a nonzero value).
// Groups: fgm, fga, fgpct, twopm, twopa, twopct, threepm, threepa,
// threepct, ftm, fta, ftpct, oreb, dreb, tot, as, to, st, bs, pf, fd,
// plusminus, ef, pts.
const TOTALS_ROW_REGEX = new RegExp(
  '^Totals\\s+\\d{1,3}:\\d{2}\\s+' + // real team-minutes total, e.g. "200:00" (5 players x 40 min) -- 3 digits, unlike a player's own 1-2-digit minutes field
  '(\\d+)/(\\d+)\\s+([\\d.]+)\\s+' +
  '(\\d+)/(\\d+)\\s+([\\d.]+)\\s+' +
  '(\\d+)/(\\d+)\\s+([\\d.]+)\\s+' +
  '(\\d+)/(\\d+)\\s+([\\d.]+)\\s+' +
  '(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+' +
  '(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+' +
  '(\\d+)\\s+(\\d+)\\s+' +
  '([+-]?\\d+)\\s+' +
  '([+-]?\\d+)\\s+' +
  '(\\d+)$',
);

// Team-attributed rebounds/turnovers/fouls not credited to any individual
// player (e.g. a rebound off a missed free throw with no clear individual
// recipient). Confirmed (Step 67 investigation, two real games, both
// closing exactly against their own official Totals row) that these 5
// values are always OR, DR, TOT, TO, PF, in that fixed order -- the only
// columns this row ever carries.
const TEAM_COACH_ROW_REGEX = /^Team\/Coach\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/;

function parseTotalsColumns(match) {
  const [
    , fgm, fga, fgPct, twoPm, twoPa, twoPct, threePm, threePa, threePct,
    ftm, fta, ftPct, oreb, dreb, tot, assists, turnovers, steals, blocks,
    fouls, foulsDrawn, plusMinus, efficiency, points,
  ] = match;
  return {
    fgm: Number(fgm), fga: Number(fga), fg_pct: Number(fgPct),
    two_pm: Number(twoPm), two_pa: Number(twoPa), two_pct: Number(twoPct),
    three_pm: Number(threePm), three_pa: Number(threePa), three_pct: Number(threePct),
    ftm: Number(ftm), fta: Number(fta), ft_pct: Number(ftPct),
    oreb: Number(oreb), dreb: Number(dreb), reb: Number(tot),
    assists: Number(assists), turnovers: Number(turnovers),
    steals: Number(steals), blocks: Number(blocks),
    fouls: Number(fouls), fouls_drawn: Number(foulsDrawn),
    plus_minus: Number(plusMinus), efficiency: Number(efficiency),
    points: Number(points),
  };
}

function parseTeamCoachColumns(match) {
  const [, oreb, dreb, reb, turnovers, fouls] = match;
  return {
    oreb: Number(oreb), dreb: Number(dreb), reb: Number(reb),
    turnovers: Number(turnovers), fouls: Number(fouls),
  };
}

// Every column a Totals row and a summed set of player rows can both
// produce. plus_minus/efficiency deliberately excluded -- confirmed
// (Step 67 investigation, real numbers) these are NOT simple sums of the
// individual players' own same-named columns (one real team's 12 players'
// own +/- values summed to 44 against that same team's own real printed
// Totals +/- of 8; EF showed the same kind of mismatch) -- a different,
// non-additive team-level stat FIBA prints, not a real discrepancy this
// check should ever flag.
const RECONCILABLE_FIELDS = [
  'fgm', 'fga', 'two_pm', 'two_pa', 'three_pm', 'three_pa', 'ftm', 'fta',
  'oreb', 'dreb', 'reb', 'assists', 'turnovers', 'steals', 'blocks',
  'fouls', 'fouls_drawn', 'points',
];

// The only RECONCILABLE_FIELDS the Team/Coach row can carry a nonzero
// contribution to -- every other field (every shooting stat, assists,
// steals, blocks, fouls_drawn, points) always reconciles with zero team
// contribution (confirmed, Step 67: always fully individually attributed
// in this format).
const TEAM_ATTRIBUTABLE_FIELDS = ['oreb', 'dreb', 'reb', 'turnovers', 'fouls'];

// Real extraction-time integrity check (Step 67/68, not assumed): summed
// player rows for this side, plus the Team/Coach row's own team-
// attributed contribution, should equal the Totals row exactly, for
// every real reconcilable column. A mismatch is recorded on the returned
// object (reconciled: false, reconciliationNotes), never silently
// swallowed or treated as if one side or the other must be right.
function reconcileTeamTotals(playersForSide, totals, teamCoach) {
  if (!totals) {
    return { reconciled: false, notes: 'No official Totals row was found for this team -- nothing to reconcile against.' };
  }
  const mismatches = [];
  for (const field of RECONCILABLE_FIELDS) {
    const summedPlayers = playersForSide.reduce((acc, p) => acc + (p[field] || 0), 0);
    const teamContribution = (TEAM_ATTRIBUTABLE_FIELDS.includes(field) && teamCoach) ? (teamCoach[field] || 0) : 0;
    const reconstructed = summedPlayers + teamContribution;
    if (reconstructed !== totals[field]) {
      mismatches.push(`${field}: players(${summedPlayers}) + team(${teamContribution}) = ${reconstructed}, but Totals row says ${totals[field]}`);
    }
  }
  return mismatches.length === 0
    ? { reconciled: true, notes: null }
    : { reconciled: false, notes: mismatches.join('; ') };
}

// Parses the repeating per-page header block that every FIBA LiveStats
// report (Box Score, Play-by-Play, Shot Chart, etc.) carries, anchored on
// the literal "FIBA Box Score" title line. Returns null if the PDF doesn't
// contain a Box Score page at all (e.g. someone uploaded a different report
// type on its own).
function parseGameHeader(lines) {
  const titleIdx = lines.findIndex((l) => l === 'FIBA Box Score');
  if (titleIdx === -1 || titleIdx < 2) return null;

  const divisionLine = lines[titleIdx - 2] || null;
  const venueDateLine = lines[titleIdx - 1] || '';
  const scoreLine = lines[titleIdx + 1] || '';

  const venueDateMatch = venueDateLine.match(/^(.+?),\s*(.+?)\s+Start time:\s*(\d{1,2}:\d{2})$/);
  const scoreMatch = scoreLine.match(/^(.+?)\s+(\d+)\s*[\u2013\u2012-]\s*(\d+)\s+(.+)$/);

  let gameNumber = null;
  for (let i = titleIdx; i < Math.min(titleIdx + 25, lines.length); i += 1) {
    const gm = lines[i].match(/^Game No\.:\s*(\d+)/);
    if (gm) { gameNumber = gm[1]; break; }
  }

  let isoDate = null;
  if (venueDateMatch) {
    // e.g. "Sun 19 Jul 2026" -> strip weekday, parse "19 Jul 2026" via
    // parseDayMonthYear above (timezone-independent -- see its own
    // comment for why that matters here specifically).
    const dateOnly = venueDateMatch[2].replace(/^\w+\s+/, '');
    isoDate = parseDayMonthYear(dateOnly);
  }

  return {
    division: divisionLine,
    venue: venueDateMatch ? venueDateMatch[1].trim() : null,
    matchDateRaw: venueDateMatch ? venueDateMatch[2].trim() : null,
    matchDate: isoDate,
    tipOffTime: venueDateMatch ? venueDateMatch[3] : null,
    homeTeam: scoreMatch ? scoreMatch[1].trim() : null,
    homeScore: scoreMatch ? Number(scoreMatch[2]) : null,
    awayScore: scoreMatch ? Number(scoreMatch[3]) : null,
    awayTeam: scoreMatch ? scoreMatch[4].trim() : null,
    gameNumber,
  };
}

async function extractBoxScore(filePath, preParsedLines = null) {
  // If bulkImport.js already parsed this file once (to share across all 7
  // extractors -- see pdfText.js), reuse those lines instead of reading
  // and re-parsing the PDF again here.
  const lines = preParsedLines || await parseFileToLines(filePath);

  const gameInfo = parseGameHeader(lines);

  // Split the document into per-team sections using the
  // "<TEAM NAME> (<ABBR>) ... Assistant Coach(es):" header line that
  // precedes each roster table. First section encountered = home team
  // (matches the order teams are listed in the game's own title line),
  // second = opponent. If the PDF bundles other report types alongside
  // the Box Score (merged exports), those pages don't contain this
  // marker and are simply ignored.
  const sectionHeaderRegex = /Assistant Coach\(es\):/;
  const sectionStartIdx = [];
  lines.forEach((line, idx) => {
    if (sectionHeaderRegex.test(line)) sectionStartIdx.push(idx);
  });

  if (sectionStartIdx.length < 2) {
    const err = new Error(
      'Could not find two team roster sections ("Assistant Coach(es):" headers) in this PDF. ' +
      'This extractor expects the standard FIBA LiveStats Box Score layout.',
    );
    err.code = 'EXTRACTION_NO_SECTIONS';
    err.rawTextSample = lines.join('\n').slice(0, 2000);
    throw err;
  }

  const sections = sectionStartIdx.slice(0, 2).map((startIdx, i) => {
    const endIdx = i + 1 < sectionStartIdx.length ? sectionStartIdx[i + 1] : lines.length;
    const sectionLines = lines.slice(startIdx, endIdx);
    // Team name prints on the same line as the "Assistant Coach(es):"
    // marker, e.g. "USIU TIGERS (USIU) Assistant Coach(es):".
    const headerMatch = lines[startIdx].match(/^(.+?)\s*\([A-Za-z0-9]{2,6}\)\s*Assistant Coach\(es\):/);
    return { sectionLines, team_name: headerMatch ? headerMatch[1].trim() : null };
  });

  // Assign 'home'/'opponent' by matching each section's own team name
  // against the actual home team from the game header, not by which
  // section happens to print first -- see teamSide.js for why.
  const sidedSections = assignTeamSides(sections, gameInfo && gameInfo.homeTeam);

  const players = [];
  const unparsedLines = [];
  const totalsBySide = {};
  const teamCoachBySide = {};

  sidedSections.forEach(({ sectionLines, team_side: teamSide }) => {
    for (const line of sectionLines) {
      if (/^No Name Min/.test(line) || /^M\/A/.test(line)) {
        continue; // column header rows, never real data
      }

      const totalsMatch = line.match(TOTALS_ROW_REGEX);
      if (totalsMatch) {
        totalsBySide[teamSide] = parseTotalsColumns(totalsMatch);
        continue;
      }
      const teamCoachMatch = line.match(TEAM_COACH_ROW_REGEX);
      if (teamCoachMatch) {
        teamCoachBySide[teamSide] = parseTeamCoachColumns(teamCoachMatch);
        continue;
      }
      if (/^Totals\b/.test(line) || /^Team\/Coach\b/.test(line)) {
        // Matched the literal row prefix but not the rest of the expected
        // layout -- a real parse failure for a row this extractor DOES
        // recognize, surfaced via unparsedLines rather than silently
        // discarded (Step 67/68: these two rows used to be unconditionally
        // dropped right here, which is exactly the bug this round fixes).
        unparsedLines.push(line);
        continue;
      }

      const match = line.match(PLAYER_ROW_REGEX);
      if (match) {
        const [
          , , jersey, name, minutes,
          fgm, fga, fgPct,
          twoPm, twoPa, twoPct,
          threePm, threePa, threePct,
          ftm, fta, ftPct,
          oreb, dreb, tot,
          assists, turnovers, steals, blocks,
          fouls, foulsDrawn,
          plusMinus, efficiency, points,
        ] = match;

        players.push({
          jersey_number: Number(jersey),
          player_name: name.trim(),
          team_side: teamSide,
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
          fouls: Number(fouls),
          fouls_drawn: Number(foulsDrawn),
          plus_minus: Number(plusMinus),
          efficiency: Number(efficiency),
        });
      } else if (/\d/.test(line) && line.length > 20 && !/^No\b/.test(line)) {
        unparsedLines.push(line);
      }
    }
  });

  if (players.length === 0) {
    const err = new Error(
      'No player rows matched the expected Box Score layout inside the detected team sections.',
    );
    err.code = 'EXTRACTION_NO_MATCH';
    err.rawTextSample = lines.join('\n').slice(0, 2000);
    throw err;
  }

  // Step 67/68: real team-level totals, read directly from each side's own
  // official Totals row -- null (not a guess) when that row didn't parse,
  // so bulkImport.js's persistence step correctly writes no game_team_stats
  // row for that side rather than a fabricated one, leaving consumers to
  // fall back to summing player_game_stats as they already did before this
  // round. Reconciled against that same side's summed player rows + Team/
  // Coach row as a real, not assumed, integrity check either way.
  const teamTotals = {};
  for (const side of ['home', 'opponent']) {
    const totals = totalsBySide[side] || null;
    const teamCoach = teamCoachBySide[side] || null;
    const playersForSide = players.filter((p) => p.team_side === side);
    const { reconciled, notes } = reconcileTeamTotals(playersForSide, totals, teamCoach);
    teamTotals[side] = totals ? {
      ...totals, teamCoach, reconciled, reconciliationNotes: notes,
    } : null;
  }

  return {
    players,
    gameInfo,
    teamTotals,
    unparsedLineCount: unparsedLines.length,
    unparsedLines: unparsedLines.slice(0, 10),
  };
}

function minutesToDecimal(mmss) {
  const [m, s] = mmss.split(':').map(Number);
  return Math.round((m + s / 60) * 10) / 10;
}

module.exports = { extractBoxScore, parseGameHeader };