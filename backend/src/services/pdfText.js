const fs = require('fs');
const { PDFParse } = require('pdf-parse');

// Every extractor (Box Score, Quarter, Plus/Minus, Lineup Analysis,
// Rotations Summary, Play-by-Play, Score Sheet) was independently reading
// the same PDF file and running it through pdf-parse -- 7 full parses of
// one document per bulk-import file. On Render's free tier (0.1 CPU),
// that repeated CPU-bound work was the dominant cost in a slow import,
// not the database calls (already fixed separately via batched inserts).
//
// This does the read + parse + normalize ONCE; bulkImport.js calls it a
// single time per file and passes the resulting `lines` array into every
// extractor, each of which now accepts pre-parsed lines as an optional
// final argument instead of always re-deriving them from a file path.
//
// normalizeLines() is unchanged from what reportExtractors.js /
// pdfExtraction.js / parseScoreSheet.js each independently implemented
// (confirmed identical across all three before consolidating here).
function normalizeLines(rawText) {
  return rawText
    .replace(/\t/g, ' ')
    .split('\n')
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

async function parseFileToLines(filePath) {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();
  return normalizeLines(data.text);
}

module.exports = { normalizeLines, parseFileToLines };