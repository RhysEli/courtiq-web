const geniusSportsReader = require('./statsFormats/geniusSportsReader');
const fibaEuropeStatsSuiteReader = require('./statsFormats/fibaEuropeStatsSuiteReader');

// Step 72: the one place that knows which stats-vendor formats this app can
// read. Every reader exports { id, detect(lines), parse(lines) } and
// produces the same common shape (see geniusSportsReader.js's own comment
// for its exact fields); bulkImport.js calls detectAndParse() instead of
// any one format's own extractor, so adding format N+1 later means writing
// one more reader and pushing it onto READERS below -- nothing else in
// bulkImport.js, no schema change, no change to this file's own dispatch
// logic.
//
// Step 74 adds the second reader, FIBA Europe Stats Suite -- registered so
// the dispatcher can recognise its files, but bulkImport.js stops before
// writing anything for that format (see its own comment) since identity
// resolution for that format's three player-identity styles doesn't exist
// yet.
const READERS = [geniusSportsReader, fibaEuropeStatsSuiteReader];

// Exactly one registered reader must recognise a file -- never a silent
// first-match-wins. Zero matches and more than one match are both real,
// surfaced errors.
function detectAndParse(lines) {
  const matches = READERS.filter((reader) => reader.detect(lines));

  if (matches.length === 0) {
    // Step 74: now that a second reader exists, this can no longer name
    // one specific format's own missing marker as the reason (that was
    // true in Phase 1, when a zero-match result could only mean "not
    // Genius Sports"). Reader-agnostic, naming what every registered
    // reader actually looked for, so a file that matches neither still
    // gets a message that reflects reality.
    const markers = READERS.map((r) => `${r.id} (its own detect())`).join(', ');
    const err = new Error(
      `Could not recognise this PDF as any supported stats format. Checked: ${markers}. `
      + 'This extractor expects a standard FIBA LiveStats Box Score layout (Genius Sports or FIBA Europe Stats Suite).',
    );
    err.code = 'EXTRACTION_NO_SECTIONS';
    err.rawTextSample = lines.join('\n').slice(0, 2000);
    throw err;
  }

  if (matches.length > 1) {
    // Not expected to ever fire with real, mutually-exclusive format
    // signatures -- if it does, that's a bug in one of those readers'
    // own detect(), surfaced loudly rather than silently resolved by
    // picking whichever matched first.
    const err = new Error(
      `This file matched more than one known stats format (${matches.map((r) => r.id).join(', ')}) -- `
      + 'cannot tell which one to use.',
    );
    err.code = 'EXTRACTION_AMBIGUOUS_FORMAT';
    throw err;
  }

  return matches[0].parse(lines);
}

module.exports = { detectAndParse, READERS };
