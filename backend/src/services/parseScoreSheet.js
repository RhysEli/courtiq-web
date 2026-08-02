const fs = require('fs');
const { PDFParse } = require('pdf-parse');

// FIBA official "SCORESHEET" report extractor.
//
// HONEST SCOPE NOTE, read before wiring this in: I checked this report's
// PDF at the word/coordinate level (not just the rendered view) and most
// of what's visually on the page -- the Team Fouls grid (the boxes that
// get crossed out per quarter), the Running Score number grid, and the
// Time-outs-used boxes -- are drawn as vector graphics/checkbox marks,
// NOT as text. They are not in the text layer at all, so no text-based
// parser (this one included) can recover them. Attempting to regex them
// out of pdf-parse's output will either throw or silently return garbage
// depending on how confident the regex is, which is worse than not
// extracting them.
//
// The ONE genuinely new fact on this page that isn't already captured by
// extractBoxScore or the Quarter report is "Game ended at (hh:mm)". Final
// score and per-quarter scores are also present but are duplicates of
// what extractBoxScore/Quarter already give you -- included here only as
// a cross-check, not as new data.
//
// If team-fouls-by-quarter or timeout-usage genuinely matter for your
// report, they'd need to come from a different source (e.g. manual entry,
// or a coordinate/graphics-aware PDF library that can detect which
// checkbox cells are filled) -- that's a materially bigger lift than a
// text parser and wasn't attempted here.

async function extractScoreSheet(filePath) {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();

  const normalizedText = data.text.replace(/\t/g, ' ');
  const lines = normalizedText.split('\n').map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean);

  if (!lines.some((l) => l.includes('SCORESHEET'))) {
    const err = new Error('No Score Sheet page found in this PDF.');
    err.code = 'EXTRACTION_NO_SECTIONS';
    throw err;
  }

  // Not line-anchored: this text sits at the end of a shared line with
  // "Captain's signature in case of protest" to its left (confirmed
  // against the real export), so search anywhere in the line rather than
  // assuming it starts one.
  const gameEndedLine = lines.find((l) => /Game ?ended ?at/i.test(l));
  const gameEndedMatch = gameEndedLine && gameEndedLine.match(/Game ?ended ?at.*?(\d{1,2}:\d{2})/i);

  const winningTeamLine = lines.find((l) => /Name ?of ?winning ?team/i.test(l));
  const winningTeamMatch = winningTeamLine && winningTeamLine.match(/team\s+(.+)$/i);

  const finalScoreLine = lines.find((l) => /Final Score/i.test(l));
  const finalScoreMatch = finalScoreLine && finalScoreLine.match(/Team A:\s*(\d+)\s*Team B:\s*(\d+)/i);

  if (!gameEndedMatch) {
    const err = new Error('Could not find "Game ended at" on the Score Sheet page -- layout may have changed.');
    err.code = 'EXTRACTION_NO_MATCH';
    err.rawTextSample = data.text.slice(0, 2000);
    throw err;
  }

  return {
    gameEndedAt: gameEndedMatch[1],
    winningTeam: winningTeamMatch ? winningTeamMatch[1].trim() : null,
    finalScoreTeamA: finalScoreMatch ? Number(finalScoreMatch[1]) : null,
    finalScoreTeamB: finalScoreMatch ? Number(finalScoreMatch[2]) : null,
    note: 'Team fouls by quarter, running score grid, and timeout usage are checkbox/vector graphics on this report, not text, and are not extractable via pdf-parse.',
  };
}

module.exports = { extractScoreSheet };