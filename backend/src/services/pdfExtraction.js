const fs = require('fs');
const { PDFParse } = require('pdf-parse');

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
    // e.g. "Sun 19 Jul 2026" -> strip weekday, parse the rest
    const dateOnly = venueDateMatch[2].replace(/^\w+\s+/, '');
    const parsed = new Date(dateOnly);
    if (!Number.isNaN(parsed.getTime())) {
      isoDate = parsed.toISOString().slice(0, 10);
    }
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

async function extractBoxScore(filePath) {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();

  // Normalise: collapse tabs to single spaces so column boundaries don't
  // depend on pdf-parse's inconsistent tab insertion, then split into
  // logical lines. Player rows are single lines already in this export.
  const normalizedText = data.text.replace(/\t/g, ' ');
  const lines = normalizedText.split('\n').map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean);

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
    err.rawTextSample = data.text.slice(0, 2000);
    throw err;
  }

  const sections = sectionStartIdx.slice(0, 2).map((startIdx, i) => {
    const endIdx = i + 1 < sectionStartIdx.length ? sectionStartIdx[i + 1] : lines.length;
    return lines.slice(startIdx, endIdx);
  });

  const teamSideOrder = ['home', 'opponent'];
  const players = [];
  const unparsedLines = [];

  sections.forEach((sectionLines, i) => {
    const teamSide = teamSideOrder[i] || `team_${i}`;
    for (const line of sectionLines) {
      if (/^Totals\b/.test(line) || /^Team\/Coach\b/.test(line) || /^No Name Min/.test(line) || /^M\/A/.test(line)) {
        continue; // summary/header rows, not individual players
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
    err.rawTextSample = data.text.slice(0, 2000);
    throw err;
  }

  return {
    players,
    gameInfo,
    unparsedLineCount: unparsedLines.length,
    unparsedLines: unparsedLines.slice(0, 10),
  };
}

function minutesToDecimal(mmss) {
  const [m, s] = mmss.split(':').map(Number);
  return Math.round((m + s / 60) * 10) / 10;
}

module.exports = { extractBoxScore, parseGameHeader };
