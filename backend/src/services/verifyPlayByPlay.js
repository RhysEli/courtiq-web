/**
 * VERIFY PLAY-BY-PLAY EXTRACTION — RUN THIS BEFORE CHANGING playByPlay CODE
 * ==========================================================================
 *
 * This is the single source of truth for "does extractPlayByPlay work?" —
 * not anyone's memory, not anyone's re-reading of the code. Run it.
 *
 * USAGE:
 *   node verifyPlayByPlay.js path/to/26TH_JULY_MERGED_USIU_TIGERS_VS_CONGO_NETS.pdf
 *
 * EXPECTED OUTPUT (this is the known-correct answer, checked by hand
 * against the real PDF's FIBA Box Score page and Score Sheet page):
 *   Roster size: 22
 *   Total events: 540
 *   Final reconstructed score: home 83, opponent 34
 *   PASS
 *
 * RULE FOR ANY FUTURE SESSION (human or AI): if this script prints PASS
 * with the current reportExtractors.js, do not replace extractPlayByPlay
 * based on a claim that it's broken — the claim is wrong until this
 * script, run fresh, shows otherwise. If someone proposes a replacement
 * implementation, run THIS SAME SCRIPT against that implementation before
 * adopting it (swap the require() below) — if it can't pass this check,
 * it doesn't go in, no matter how confident the reasoning sounds.
 */

const path = require('path');

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error('Usage: node verifyPlayByPlay.js path/to/game.pdf');
  process.exit(1);
}

async function main() {
  const { extractPlayByPlay, extractBoxScoreRoster } = require(
    path.resolve(__dirname, 'reportExtractors.js')
  );
  const fs = require('fs');
  const { PDFParse } = require('pdf-parse');

  // Reproduce the same line-normalisation reportExtractors.js uses
  // internally, just for the roster sanity check below.
  const buffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();
  const lines = data.text
    .replace(/\t/g, ' ')
    .split('\n')
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

  let failed = false;

  // --- Check 1: roster builds without throwing, exactly 22 players ---
  let rosterSize = 0;
  try {
    const { rosterMap } = extractBoxScoreRoster(lines);
    rosterSize = Object.keys(rosterMap).length;
  } catch (e) {
    console.log('Roster build: THREW —', e.message);
    failed = true;
  }
  console.log('Roster size:', rosterSize, rosterSize === 22 ? '(expected 22)' : '*** EXPECTED 22 ***');
  if (rosterSize !== 22) failed = true;

  // --- Check 2: extraction runs, returns events ---
  let result;
  try {
    result = await extractPlayByPlay(pdfPath);
  } catch (e) {
    console.log('extractPlayByPlay: THREW —', e.message);
    console.log('FAIL');
    process.exit(1);
  }

  console.log('Total events:', result.events.length, result.events.length === 540 ? '(expected 540)' : '*** EXPECTED 540 ***');
  if (result.events.length !== 540) failed = true;

  // --- Check 3: final score reconstructs correctly from event data ---
  const scored = result.events.filter((e) => e.score);
  const last = scored[scored.length - 1];
  const home = last ? last.score.home : null;
  const opponent = last ? last.score.opponent : null;
  console.log('Final reconstructed score: home', home, ', opponent', opponent,
    (home === 83 && opponent === 34) ? '(expected 83-34)' : '*** EXPECTED 83-34 ***');
  if (home !== 83 || opponent !== 34) failed = true;

  // --- Check 4: no event with a named player has an unresolved team ---
  const unresolved = result.events.filter((e) => e.player_surname && !e.team);
  console.log('Events with a named player but no team match:', unresolved.length, unresolved.length === 0 ? '(expected 0)' : '*** EXPECTED 0 ***');
  if (unresolved.length !== 0) failed = true;

  // --- Check 5: no truncated continuation text (spot-check a known wrap) ---
  const knownWrap = result.events.find((e) => e.time === '08:03' && e.player_surname === 'NGALA');
  const wrapOk = knownWrap && knownWrap.action_text.includes('made (2)');
  console.log('Known wrapped-line event intact:', wrapOk ? 'YES' : '*** NO — continuation text is being lost ***');
  if (!wrapOk) failed = true;

  // --- Check 6: no event's action_text is abnormally long ---
  // A real bug in this extractor once produced a single 15,860-character
  // event by silently absorbing every line of the rest of the document
  // (Player Evaluation, Plus/Minus, Quarter, Rotations Summary, Score
  // Sheet) into one pending event that never got flushed at the true end
  // of the Play-by-Play section. Real basketball action text is always a
  // short phrase; anything over 150 chars means that bug (or one shaped
  // like it) is back.
  const MAX_SANE_LENGTH = 150;
  const oversized = result.events.filter((e) => e.action_text.length > MAX_SANE_LENGTH);
  const longest = result.events.reduce((max, e) => (e.action_text.length > max.action_text.length ? e : max));
  console.log('Longest action_text:', longest.action_text.length, 'chars', longest.action_text.length <= MAX_SANE_LENGTH ? `(expected <= ${MAX_SANE_LENGTH})` : `*** EXPECTED <= ${MAX_SANE_LENGTH} — an event is absorbing content from another report ***`);
  if (oversized.length > 0) failed = true;

  console.log();
  console.log(failed ? 'FAIL — do not trust extractPlayByPlay until this is fixed and re-run' : 'PASS');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('Script error:', e);
  process.exit(1);
});