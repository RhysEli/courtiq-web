const geniusSportsReader = require('./statsFormats/geniusSportsReader');

// Step 72: the one place that knows which stats-vendor formats this app can
// read. Every reader exports { id, detect(lines), parse(lines) } and
// produces the same common shape (see geniusSportsReader.js's own comment
// for its exact fields); bulkImport.js calls detectAndParse() instead of
// any one format's own extractor, so adding format N+1 later means writing
// one more reader and pushing it onto READERS below -- nothing else in
// bulkImport.js, no schema change, no change to this file's own dispatch
// logic.
//
// Phase 1 (this round) has exactly one reader. A FIBA Europe Stats Suite
// reader (or any other format) is explicitly out of scope here.
const READERS = [geniusSportsReader];

// Exactly one registered reader must recognise a file -- never a silent
// first-match-wins. Zero matches and more than one match are both real,
// surfaced errors.
function detectAndParse(lines) {
  const matches = READERS.filter((reader) => reader.detect(lines));

  if (matches.length === 0) {
    // Phase 1 has exactly one reader, so this message is verbatim what
    // extractBoxScore has always thrown when it can't find the two
    // "Assistant Coach(es):" team-roster sections -- bulk import's real
    // failure response needs to stay byte-identical to today's. Once a
    // second reader exists, a zero-match error can no longer name one
    // specific format's own missing marker as the reason; this needs to
    // become a genuinely reader-agnostic message then, not before.
    const err = new Error(
      'Could not find two team roster sections ("Assistant Coach(es):" headers) in this PDF. '
      + 'This extractor expects the standard FIBA LiveStats Box Score layout.',
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
