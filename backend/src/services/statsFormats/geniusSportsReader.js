const { extractBoxScore } = require('../pdfExtraction');

// Step 72: a thin reshape over pdfExtraction.js's existing extractBoxScore --
// deliberately NOT a rewrite. Every regex, every reconciliation computation
// (RECONCILABLE_FIELDS, TEAM_ATTRIBUTABLE_FIELDS, reconcileTeamTotals) and
// parseGameHeader itself stay exactly where they are in pdfExtraction.js,
// unchanged, still used as-is by reports.js/analysis.js/reportExtractors.js/
// dumpRawText.js -- none of those are in this round's scope. This file only
// relabels that same output into the common shape every stats-format reader
// (see ../statsFormatRegistry.js) is expected to produce, so bulkImport.js
// can consume any of them identically.
//
// detect() is the exact "Assistant Coach(es):" section-header test
// extractBoxScore has always used to find the two team roster sections --
// extracted here as the one shared source of truth, so detect() and the
// real parse can never drift out of sync with each other.
const SECTION_HEADER_REGEX = /Assistant Coach\(es\):/;

function detect(lines) {
  return lines.some((line) => SECTION_HEADER_REGEX.test(line));
}

// Common shape (see statsFormatRegistry.js for the full contract):
//   { format, gameInfo, teams: { home: {players, totals}, opponent: {players, totals} }, unparsed, extra }
// Each player keeps every field extractBoxScore already produced on it
// (including team_side, for raw_extraction/audit parity with today) and
// gains one new field, `identity` -- this format only ever prints a full
// name, so identity is always { type: 'full_name', name }. No other field's
// value is touched.
async function parse(lines) {
  const {
    players, gameInfo, teamTotals, unparsedLineCount, unparsedLines,
  } = await extractBoxScore(null, lines);

  const bySide = { home: [], opponent: [] };
  for (const p of players) {
    bySide[p.team_side].push({ ...p, identity: { type: 'full_name', name: p.player_name } });
  }

  return {
    format: 'fiba-box-score', // unchanged literal -- matches every existing game_team_stats.source_format row already written under this label
    gameInfo,
    teams: {
      home: { players: bySide.home, totals: teamTotals.home },
      opponent: { players: bySide.opponent, totals: teamTotals.opponent },
    },
    unparsed: { count: unparsedLineCount, samples: unparsedLines },
    // Reserved for a later phase (richer per-format data -- play-by-play,
    // lineups, shot-level detail). Always {} here; no reader populates it
    // yet and nothing downstream reads it.
    extra: {},
  };
}

module.exports = { id: 'fiba-box-score', detect, parse };
