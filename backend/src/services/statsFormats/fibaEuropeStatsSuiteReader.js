const { assignTeamSides } = require('../teamSide');

// Step 74: a second stats-format reader (see ../statsFormatRegistry.js for
// the dispatcher contract). Built from the real evidence gathered in the
// Step 73 investigation: 61 real distinct games found across 2024-11-08 to
// 2026-03-01, running concurrently with Genius Sports, not a closed
// 2024/2025 backlog -- so this is a format CourtIQ needs to go on reading,
// not a one-off.
//
// This reader is registered with the dispatcher (so detectAndParse() can
// recognise a FIBA Europe file and bulkImport.js can give a clear, honest
// "not enabled yet" message instead of a generic one -- see bulkImport.js),
// but nothing calls resolvePlayerName or resolveTeamName for its output,
// and nothing writes a row because of it. Identity resolution for its three
// distinct player-identity styles (see classifyIdentityStyle below) is
// explicitly out of scope for this round.

// Every real file checked (62 box-score sources, all of version "3.6.2")
// prints this exact footer on every page, in both merged multi-report PDFs
// and single-report-type exports alike -- unlike Genius Sports, which has
// no textual brand marker at all on its own non-box-score report types.
// Case-insensitive on purpose: nothing about this format's own identity
// should hinge on capitalisation (see the exclusion this forces on
// geniusSportsReader.js's own detect(), below).
const FOOTER_REGEX = /FIBA Europe Stats Suite/i;

function detect(lines) {
  return lines.some((line) => FOOTER_REGEX.test(line));
}

// ---------------------------------------------------------------------------
// Header (game info)
// ---------------------------------------------------------------------------

// Anchors the start of the box-score section itself. Unlike Genius Sports'
// "FIBA Box Score" title (which only ever appears once, on that report's own
// page), this exact literal only appears on the box-score page of a FIBA
// Europe export -- confirmed across every real file checked, merged or
// standalone.
const BOX_SCORE_TITLE = 'OFFICIAL STATISTICS';

// The header block always appears (in this order, confirmed across all real
// box-score sources checked) immediately before BOX_SCORE_TITLE: a
// quarter-by-quarter score line in parentheses, a literal "null" line (a
// real artifact of whatever produces these exports -- not a parsing
// failure, so it is not reported as one), "(Local time)", the date+time,
// the "<Team1> vs <Team2>" title, "Game no. <N>", and the final score. Each
// is found independently by its own regex rather than by a fixed line
// offset, so a header missing one field doesn't corrupt the others.
function parseHeader(lines, titleIdx) {
  const preamble = lines.slice(Math.max(0, titleIdx - 12), titleIdx);

  let team1Name = null;
  let team2Name = null;
  for (const line of preamble) {
    const m = line.match(/^(.+?)\s+vs\s+(.+)$/i);
    if (m) { [, team1Name, team2Name] = m; break; }
  }

  let isoDate = null;
  let tipOffTime = null;
  for (const line of preamble) {
    const m = line.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}:\d{2})$/);
    if (m) {
      // Built directly from the regex's own numeric groups, never through
      // new Date(nonIsoString) -- see pdfExtraction.js's parseDayMonthYear
      // for why that's the wrong tool for a non-ISO date string (same
      // local-midnight/UTC drift risk applies to any string-based Date
      // parse, not just that one format).
      isoDate = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      tipOffTime = m[4];
      break;
    }
  }

  let gameNumber = null;
  for (const line of preamble) {
    const m = line.match(/^Game no\.?\s*(\S+)/i);
    if (m) { gameNumber = m[1]; break; }
  }

  let score1 = null;
  let score2 = null;
  for (const line of preamble) {
    // Plain "NN - NN", not the parenthesised/comma'd quarter-break line.
    const m = line.match(/^(\d{1,3})\s*-\s*(\d{1,3})$/);
    if (m) { [, score1, score2] = m; break; }
  }

  return {
    venue: null, // never printed in this format's header -- not guessed
    division: null, // likewise never printed; it only ever appears as folder context on disk, not in the PDF text
    matchDate: isoDate,
    tipOffTime,
    // Named homeTeam/awayTeam only to match the existing common-shape field
    // names every reader uses (see geniusSportsReader.js) -- "home" here
    // means nothing more than "named first in the title," exactly the same
    // convention pdfExtraction.js's own parseGameHeader already uses for
    // Genius Sports (see teamSide.js). This reader does not decide which
    // side is Rhys's team; see team1/team2 below, which preserve the
    // printed label and print order untouched for whatever later step
    // needs to make that call.
    homeTeam: team1Name,
    awayTeam: team2Name,
    homeScore: score1 === null ? null : Number(score1),
    awayScore: score2 === null ? null : Number(score2),
    gameNumber,
  };
}

// ---------------------------------------------------------------------------
// Section location
// ---------------------------------------------------------------------------

// Step 75: anchors on "Min" immediately followed by the completely fixed
// literal "FG 2P FG 3P FG FT Reb" -- not on the team-name line's own shape.
// Step 74 required that line to look like "<Name> (<Code>)", which is
// true on every real file except one (THUNDER GAME.pdf, whose home
// section prints the bare text "UNITED STATES" with no parenthesised
// code at all -- see the investigation notes). The "Min"+"FG 2P FG..."
// pair is unaffected by whatever the team-name line itself looks like,
// and was confirmed to find the exact same section boundaries as the old
// "(code)"-based anchor on all 61 other real sources before this was
// switched over (the 62nd, THUNDER, is the one case where the two
// methods disagree -- this one recovers it).
function findTeamSections(lines, titleIdx) {
  const headerIdx = [];
  for (let i = titleIdx; i < lines.length - 2 && headerIdx.length < 2; i += 1) {
    if (lines[i] === 'Min' && lines[i + 1] === 'FG 2P FG 3P FG FT Reb') headerIdx.push(i - 1);
  }
  if (headerIdx.length < 2) return null;

  return headerIdx.map((startIdx, i) => {
    const endIdx = i + 1 < headerIdx.length ? headerIdx[i + 1] : lines.length;
    const printedLabel = lines[startIdx];
    const nameMatch = printedLabel.match(/^(.+?)\s*\(([^()]+)\)$/);
    return {
      sectionLines: lines.slice(startIdx, endIdx),
      printedLabel,
      printOrder: i,
      team_name: nameMatch ? nameMatch[1].trim() : printedLabel,
    };
  });
}

// ---------------------------------------------------------------------------
// Row parsing -- tokenisation and the 18-field Totals/Team-Coach mapping
// are exactly what Step 73 derived and verified by reconciliation
// arithmetic against real Totals rows (62 box-score sources, 57 at 18/18 on
// every team). See that investigation for how these were derived; nothing
// here is assumed.
// ---------------------------------------------------------------------------

function splitSeg(seg) {
  return seg.trim().split(/\s+/).filter(Boolean);
}

function splitMA(tok) {
  const m = tok.match(/^(\d+)\/(\d+)$/);
  return m ? { m: Number(m[1]), a: Number(m[2]) } : null;
}

// pdfText.js's normalizeLines() turns every tab into a plain space before
// this reader ever sees a line (shared with every other extractor in this
// codebase -- see pdfExtraction.js's own top comment on why: pdf-parse's
// tab placement isn't trustworthy as a column boundary). That means a
// player row arrives as one flat run of whitespace-separated tokens, not
// the tab-delimited segments Step 73's own scratch tooling saw when it
  // read pdf-parse's per-page text directly. The fix is the same one
// pdfExtraction.js's PLAYER_ROW_REGEX already uses for Genius Sports: a
// fixed-arity whitespace pattern, with a flexible leading group for the
// player's own printed code/name (which can be one word, two, or
// occasionally more) that stops as soon as something shaped like a
// jersey number follows. Verified against the same real tab-delimited
// token order Step 73 derived and reconciled -- flattening tabs to spaces
// doesn't change that order, only how it has to be recovered.
const PLAYER_ROW_REGEX = new RegExp(
  '^((?:[A-Za-z][A-Za-z0-9]*\\s+)+)' + // printed code/name (1+ letter-led words)
  '(\\*?)(\\d{1,2})\\s+' + // starter marker + jersey number
  '(\\d{1,2}:\\d{2})\\s+' + // minutes
  '(\\d+)\\s+' + // points
  '(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+' + // 4 "other scalar" fields (positions 0-3)
  '(\\d+)/(\\d+)\\s+([\\d.]+)\\s+' + // FG M/A, FG%
  '(\\d+)/(\\d+)\\s+([\\d.]+)\\s+' + // 2PT M/A, 2PT%
  '([\\d.]+)\\s+' + // 3PT%
  '(\\d+)/(\\d+)\\s+' + // 3PT M/A
  '([\\d.]+)\\s+' + // FT%
  '(\\d+)/(\\d+)\\s+' + // FT M/A
  '(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+' + // 5 more "other scalar" fields (positions 4-8)
  '([+-]?\\d+)$', // +/-
);

const DNP_ROW_REGEX = /^((?:[A-Za-z][A-Za-z0-9]*\s+)+)(\*?)(\d{1,2})\s+DNP$/;

// Player row's 9 "other scalar" positions (after PTS, before the shooting
// block) map to these positions within the Totals row's own 9 "other
// scalar" tokens (after its PTS token). Step 73 verified this mapping
// reconciles exactly for both teams across 57 of 62 real sources. The
// legend on every real file names ten distinct labels across these nine
// slots (AS, Reb/RD/RO/Tot, PF, C, D, TO, ST, BS) but Step 73 could not
// verify which raw slot each label attaches to beyond the first four
// (confidently AS, Tot, RD, RO, by position proximity to PTS) -- the
// remaining five are left as unlabeled positions rather than asserted
// wrong. The reconciliation check below does not need the labels to be
// right, only the positions to be consistent, which is what was verified.
const PLAYER_POS_TO_TOTALS_SLOT = [5, 6, 7, 8, 0, 1, 2, 3, 4];
const TEAMCOACH_IDX_TO_TOTALS_SLOT = { 0: 8, 1: 7, 2: 6, 3: 1, 4: 2 };

function parsePlayerRow(line) {
  const m = line.match(PLAYER_ROW_REGEX);
  if (!m) return { ok: false, raw: line, reason: 'did not match the fixed-arity player-row shape' };
  const [
    , codeRaw, star, jersey, minutes, ptsRaw,
    s0, s1, s2, s3,
    fgm, fga, fgPct,
    p2m, p2a, p2Pct,
    p3Pct, p3m, p3a,
    ftPct, ftm, fta,
    s4, s5, s6, s7, s8,
    plusMinus,
  ] = m;

  return {
    ok: true,
    code: codeRaw.trim(),
    jerseyRaw: `${star}${jersey}`,
    minutes,
    pts: Number(ptsRaw),
    otherScalars: [s0, s1, s2, s3, s4, s5, s6, s7, s8].map(Number),
    fg: { m: Number(fgm), a: Number(fga) },
    p2: { m: Number(p2m), a: Number(p2a) },
    p3: { m: Number(p3m), a: Number(p3a) },
    ft: { m: Number(ftm), a: Number(fta) },
    plusMinus,
    // fgPct/p2Pct/p3Pct/ftPct are read off the row but not used -- the
    // reconciliation check verifies the M/A counts directly, and a
    // percentage is derived/rounded so it isn't itself a reconcilable
    // field. Referenced here only so eslint doesn't flag them unused.
    _percentages: { fgPct, p2Pct, p3Pct, ftPct },
    raw: line,
  };
}

function parseDnpRow(line) {
  const m = line.match(DNP_ROW_REGEX);
  if (!m) return null;
  const [, codeRaw, star, jersey] = m;
  return { code: codeRaw.trim(), jerseyRaw: `${star}${jersey}`, raw: line };
}

// ---------------------------------------------------------------------------
// Row repair -- Step 75. Step 74 treated any row that didn't fit the
// fixed-arity shape as unparseable, full stop. That's the right call for
// a row whose STAT values are actually in doubt, but three of the real
// corruption patterns found only ever damage the printed code/jersey
// text, never a stat field -- and the reconciliation check itself (every
// player row plus Team/Coach, summed, against the official Totals row,
// on all 18 fields) is strong independent evidence of that: a team that
// reconciles exactly once a repaired row is included could not be doing
// so by accident, since all 18 real totals would have to agree by luck.
//
// A repair here never touches a stat value -- it only recognises one of
// these three already-observed shapes and produces a line that then
// parses normally. The result is kept only if it's proven correct: see
// parseSection below, which only accepts a team's repairs if that team's
// own officialTotals row reconciles at 18/18 with them included, and
// discards all of them for that team otherwise. The printed identity
// text itself is never repaired -- parseSection always recovers and
// stores the ORIGINAL, unrepaired code text (see how `originalCodeText`
// is derived there), so "F 0" stays "F 0", not "F O".
//
// Each pattern is tried independently; every real row seen so far needed
// exactly one.
function tryRepairs(line) {
  const candidates = [];

  // Pattern "digit-zero-for-letter-O": a bare "0" standing in for the
  // letter "O", wedged between the code's letter-led word(s) and the
  // real jersey+minutes (or jersey+DNP) that follows. Observed in
  // "F 0 *55 21:36 15 ..." (ANU GAME.pdf), "T 0 13 23:25 19 ..." (KPA
  // GAME.pdf), "S 0 1 21:04 2 ..." (TUM GAME.pdf).
  {
    const m = line.match(/^((?:[A-Za-z][A-Za-z0-9]*\s+)+)0\s+(\*?\d{1,2}\s+(?:\d{1,2}:\d{2}\s+.+|DNP))$/);
    if (m) {
      candidates.push({
        pattern: 'digit-zero-for-letter-O',
        repairedLine: `${m[1]}O ${m[2]}`,
        describe: () => 'Replaced the bare "0" immediately after the printed code with "O" for parsing purposes only; every field after it is untouched.',
      });
    }
  }

  // Pattern "stray-character-in-code": a single stray non-alphanumeric
  // character glued onto an otherwise valid code word. Observed in
  // "A A` 9 37:39 3 ..." (KCA'' GAME.pdf) -- a trailing backtick on the
  // second code word. Limited to the first 3 tokens (codes are 1-2 words
  // in every real row seen) so this can't reach into the stat portion of
  // the row.
  {
    const tokens = line.split(' ');
    for (let i = 0; i < Math.min(tokens.length, 3); i += 1) {
      const strayMatch = tokens[i].match(/^([A-Za-z][A-Za-z0-9]*)[^A-Za-z0-9\s]$/);
      if (strayMatch) {
        const repairedTokens = tokens.slice();
        repairedTokens[i] = strayMatch[1];
        candidates.push({
          pattern: 'stray-character-in-code',
          repairedLine: repairedTokens.join(' '),
          describe: () => `Removed the stray trailing character "${tokens[i].slice(-1)}" from code token "${tokens[i]}" for parsing purposes only.`,
        });
      }
    }
  }

  // Pattern "stray-extra-number": a stray extra number inserted right
  // after the real jersey number, before minutes or "DNP" -- two
  // consecutive bare-digit tokens (either may carry the starter "*")
  // where exactly one is expected. Observed in "B TASUR 21 27 14:08 ..."
  // and "A ADONIC 42 37 12:46 ..." (ANU WOLFPACKS GAME.pdf / 22 B TIGERS
  // VS WOLFPACKS Boxscore.pdf), and the sequential "14 96 DNP" / "5 *97
  // 25:49 ..." / "17 98 04:29 ..." / "13 99 09:46 ..." in DUMAS GAME.pdf
  // (that 96/97/98/99 run looks like a hidden row-index artifact, not
  // real jersey numbers). The first of the two digit tokens is kept as
  // the jersey number; the second is discarded. Nothing after the
  // discarded token is touched, so this choice never affects a stat
  // value either way, regardless of which of the two was "really" the
  // jersey.
  {
    const m = line.match(/^((?:[A-Za-z][A-Za-z0-9]*\s+)+)(\*?\d{1,2})\s+\*?\d{1,2}\s+(\d{1,2}:\d{2}\s+.+|DNP)$/);
    if (m) {
      candidates.push({
        pattern: 'stray-extra-number',
        repairedLine: `${m[1]}${m[2]} ${m[3]}`,
        describe: () => `Removed a stray second number inserted immediately after the jersey number "${m[2]}"; kept "${m[2]}" as the jersey and discarded the extra token. Nothing after it is touched.`,
      });
    }
  }

  return candidates;
}

// Recovers the exact original printed code/name text for a row that was
// repaired, independent of which pattern applied: every repair pattern
// above only ever touches tokens inside the code/jersey prefix, and
// never changes how many tokens that prefix occupies on the ORIGINAL
// line (pattern "digit-zero-for-letter-O" adds one token to the code
// that was already there in the original; "stray-character-in-code"
// changes a token's spelling but not the count; "stray-extra-number"
// doesn't touch the code at all). So taking the same number of leading
// whitespace-tokens from the original line as the repaired parse's own
// `code` field has always recovers the real, unrepaired text verbatim.
function originalCodeText(originalLine, repairedCode) {
  const tokenCount = repairedCode.split(/\s+/).length;
  return originalLine.split(/\s+/).slice(0, tokenCount).join(' ');
}

function parseTotalsRow(line) {
  const segs = line.split('\t');
  const tokens = [];
  for (const seg of segs) tokens.push(...splitSeg(seg));
  if (tokens.length !== 18) return { ok: false, reason: `expected 18 tokens, got ${tokens.length}` };
  const pts = Number(tokens[0]);
  const otherScalars = tokens.slice(1, 10).map(Number);
  const ft = splitMA(tokens[11]); const p3 = splitMA(tokens[12]); const p2 = splitMA(tokens[14]); const fg = splitMA(tokens[16]);
  if (Number.isNaN(pts) || otherScalars.some((n) => Number.isNaN(n)) || !ft || !p3 || !p2 || !fg) {
    return { ok: false, reason: 'non-numeric field in totals row' };
  }
  return { ok: true, pts, otherScalars, fg, p2, p3, ft };
}

function parseTeamCoachRow(line) {
  if (!line.startsWith('Team/Coach')) return { ok: false, reason: 'not a Team/Coach row shape' };
  const values = splitSeg(line.slice('Team/Coach'.length)).map(Number);
  if (values.length !== 5 || values.some((n) => Number.isNaN(n))) return { ok: false, reason: `expected 5 numeric values, got ${JSON.stringify(values)}` };
  return { ok: true, values };
}

// ---------------------------------------------------------------------------
// Identity -- three real styles found in Step 73, none resolved to a
// player record here. Jersey numbers are recorded but never used to
// identify anyone: Step 73 found the same printed code under as many as
// six different jersey numbers across real files for the same real player.
// ---------------------------------------------------------------------------

// Documented rule: split the printed text on whitespace. A token is a
// "bare initial" if it is a single letter with an optional trailing period.
//   - exactly one token at all               -> 'single_token' (too short to classify further; recorded verbatim, not forced into one of the three styles)
//   - both tokens bare initials               -> 'jersey_code'      e.g. "V M"
//   - first token a bare initial, second not  -> 'initial_surname'  e.g. "V MPONELA"
//   - neither token a bare initial            -> 'full_name'        e.g. "VITUMBIKO MPONELA"
// Three or more tokens fall into the same three buckets by just the first
// token and "the rest" -- "AJAK SIMON" (first token "AJAK", 4 letters) is
// full_name, not a special fourth case.
function classifyIdentityStyle(printedCode) {
  const raw = printedCode.trim();
  const tokens = raw.split(/\s+/);
  if (tokens.length === 1) return { type: 'single_token', raw };

  const first = tokens[0];
  const rest = tokens.slice(1).join(' ');
  const isBareInitial = (tok) => /^[A-Za-z]\.?$/.test(tok);

  if (isBareInitial(first) && isBareInitial(rest)) {
    return { type: 'jersey_code', raw, firstInitial: first.replace('.', ''), secondInitial: rest.replace('.', '') };
  }
  if (isBareInitial(first) && !isBareInitial(rest)) {
    return { type: 'initial_surname', raw, firstInitial: first.replace('.', ''), surname: rest };
  }
  return { type: 'full_name', raw, name: raw };
}

// ---------------------------------------------------------------------------
// Reconciliation -- same 18-field check Step 73 ran (players + Team/Coach
// row against the Totals row), carried into the reader itself so every
// game gets it, not just the ones Step 73 happened to sample.
// ---------------------------------------------------------------------------

function reconcileTeam(players, totalsRow, teamCoachRow) {
  const mismatches = [];
  if (!totalsRow) return { reconciled: false, notes: 'No Totals row was found for this team -- nothing to reconcile against.' };

  const sumPts = players.reduce((s, p) => s + p.pts, 0);
  if (sumPts !== totalsRow.pts) mismatches.push(`points: players sum=${sumPts} vs totals=${totalsRow.pts}`);

  const teamAdd = new Array(9).fill(0);
  if (teamCoachRow) {
    teamCoachRow.values.forEach((v, idx) => { teamAdd[TEAMCOACH_IDX_TO_TOTALS_SLOT[idx]] += v; });
  }
  for (let slot = 0; slot < 9; slot += 1) {
    const playerPos = PLAYER_POS_TO_TOTALS_SLOT.indexOf(slot);
    const sum = players.reduce((s, p) => s + p.otherScalars[playerPos], 0) + teamAdd[slot];
    if (sum !== totalsRow.otherScalars[slot]) {
      mismatches.push(`field[${slot}]: players+team=${sum} vs totals=${totalsRow.otherScalars[slot]}`);
    }
  }

  for (const key of ['fg', 'p2', 'p3', 'ft']) {
    const sumM = players.reduce((s, p) => s + p[key].m, 0);
    const sumA = players.reduce((s, p) => s + p[key].a, 0);
    if (sumM !== totalsRow[key].m) mismatches.push(`${key}.m: players sum=${sumM} vs totals=${totalsRow[key].m}`);
    if (sumA !== totalsRow[key].a) mismatches.push(`${key}.a: players sum=${sumA} vs totals=${totalsRow[key].a}`);
  }

  return mismatches.length === 0
    ? { reconciled: true, notes: null }
    : { reconciled: false, notes: mismatches.join('; ') };
}

// ---------------------------------------------------------------------------
// Section -> common-shape team object
// ---------------------------------------------------------------------------

// Tries every repair pattern against a line that failed normal parsing.
// Returns the first candidate that, once repaired, parses as either a
// real player row or a DNP row -- along with the recovered original
// (unrepaired) identity text. Returns null if no pattern applies or none
// of the repaired lines parse either.
function tryRepairAndParse(line) {
  for (const candidate of tryRepairs(line)) {
    const playerParse = parsePlayerRow(candidate.repairedLine);
    if (playerParse.ok) {
      return {
        kind: 'player', parsed: playerParse, pattern: candidate.pattern,
        description: candidate.describe(), repairedLine: candidate.repairedLine,
        originalCode: originalCodeText(line, playerParse.code),
      };
    }
    const dnpParse = parseDnpRow(candidate.repairedLine);
    if (dnpParse) {
      return {
        kind: 'dnp', parsed: dnpParse, pattern: candidate.pattern,
        description: candidate.describe(), repairedLine: candidate.repairedLine,
        originalCode: originalCodeText(line, dnpParse.code),
      };
    }
  }
  return null;
}

function parseSection(section) {
  const players = [];
  const dnp = [];
  const unparsed = [];
  const repairCandidates = []; // pending -- not yet proven against this team's own Totals row
  let totalsRow = null;
  let teamCoachRow = null;

  for (const line of section.sectionLines) {
    if (line === section.printedLabel || line === 'Min' || /^FG 2P FG/.test(line) || /^AS PTS /.test(line)
      || line === 'PF' || /^C D \+/.test(line) || /^Head coach:/.test(line) || /^Assistant coach\(es\):/i.test(line)
      || /^Name No\./.test(line)) {
      continue; // known header/preamble lines, never real data
    }
    if (line === 'Totals') continue;
    if (line.startsWith('Team/Coach')) {
      const r = parseTeamCoachRow(line);
      if (r.ok) teamCoachRow = r;
      else unparsed.push({ team: section.printedLabel, raw: line, reason: r.reason });
      continue;
    }
    // The Totals data row is the one line in this section made up purely
    // of digits/dots/slashes/spaces (no letters at all) -- confirmed
    // unique to that row within a team section.
    if (/^[\d./ ]+$/.test(line)) {
      const r = parseTotalsRow(line);
      if (r.ok) { totalsRow = r; break; } // nothing legitimate for this team follows its own Totals row
    }
    const dnpRow = parseDnpRow(line);
    if (dnpRow) { dnp.push(dnpRow); continue; }
    const r = parsePlayerRow(line);
    if (r.ok) { players.push(r); continue; }
    // Didn't fit the normal shape -- try the three documented repair
    // patterns (Step 75) before giving up on this row. Not accepted yet:
    // held separately until this team's own Totals row is known, so
    // acceptance can be gated on whether including it makes the team
    // reconcile (see below).
    const repaired = tryRepairAndParse(line);
    if (repaired) repairCandidates.push({ original: line, repaired });
    else unparsed.push({ team: section.printedLabel, raw: line, reason: 'did not match the fixed-arity player-row shape' });
  }

  const baseline = reconcileTeam(players, totalsRow, teamCoachRow);
  let finalPlayers = players;
  let finalDnp = dnp;
  let recon = baseline;
  const acceptedRepairs = [];

  if (repairCandidates.length > 0) {
    const candidatePlayers = repairCandidates.filter((c) => c.repaired.kind === 'player').map((c) => c.repaired.parsed);
    const withRepairs = reconcileTeam([...players, ...candidatePlayers], totalsRow, teamCoachRow);
    if (withRepairs.reconciled) {
      // Proven: this team's own official Totals row reconciles at 18/18
      // with every repaired row included -- accept all of them for this
      // team. (A DNP repair carries no stats, so it can't itself affect
      // reconciliation either way; it's accepted alongside the others
      // once the team as a whole is proven, not gated separately.)
      finalPlayers = [...players, ...candidatePlayers];
      finalDnp = [...dnp, ...repairCandidates.filter((c) => c.repaired.kind === 'dnp').map((c) => c.repaired.parsed)];
      recon = {
        reconciled: true,
        notes: `Reconciled at 18/18 after ${repairCandidates.length} repaired row(s), each validated by this team's own 18-field match against its official Totals row. See repairs for detail.`,
      };
      repairCandidates.forEach((c) => {
        acceptedRepairs.push({
          team: section.printedLabel, original: c.original, repaired: c.repaired.repairedLine,
          pattern: c.repaired.pattern, description: c.repaired.description,
        });
      });
    } else {
      // Not provably correct -- discard the repairs entirely and fall
      // back to Step 74's behaviour: these rows are unparsed, not
      // guessed into the team.
      repairCandidates.forEach((c) => {
        unparsed.push({ team: section.printedLabel, raw: c.original, reason: 'did not match the fixed-arity player-row shape (a repair was tried but discarded because the team did not reconcile with it)' });
      });
    }
  }

  return {
    printedLabel: section.printedLabel,
    printOrder: section.printOrder,
    team_name: section.team_name,
    repairs: acceptedRepairs,
    players: finalPlayers.map((p) => {
      // p.raw is the REPAIRED line for a repaired player (parsePlayerRow
      // was run on candidate.repairedLine, not the original), so matching
      // against acceptedRepairs' own `repaired` field (not `original`)
      // finds the right entry.
      const repairEntry = acceptedRepairs.find((rr) => rr.repaired === p.raw);
      return {
        jersey_number_raw: p.jerseyRaw,
        identity: classifyIdentityStyle(repairEntry ? originalCodeText(repairEntry.original, p.code) : p.code),
        minutes: p.minutes,
        points: p.pts,
        fgm: p.fg.m, fga: p.fg.a,
        two_pm: p.p2.m, two_pa: p.p2.a,
        three_pm: p.p3.m, three_pa: p.p3.a,
        ftm: p.ft.m, fta: p.ft.a,
        otherScalars: p.otherScalars,
        repaired: !!repairEntry,
        plus_minus_raw: p.plusMinus,
      };
    }),
    dnp: finalDnp.map((d) => {
      const repairEntry = acceptedRepairs.find((rr) => rr.repaired === d.raw);
      return {
        jersey_number_raw: d.jerseyRaw,
        identity: classifyIdentityStyle(repairEntry ? originalCodeText(repairEntry.original, d.code) : d.code),
        repaired: !!repairEntry,
      };
    }),
    totals: totalsRow ? {
      points: totalsRow.pts,
      fgm: totalsRow.fg.m, fga: totalsRow.fg.a,
      two_pm: totalsRow.p2.m, two_pa: totalsRow.p2.a,
      three_pm: totalsRow.p3.m, three_pa: totalsRow.p3.a,
      ftm: totalsRow.ft.m, fta: totalsRow.ft.a,
      otherScalars: totalsRow.otherScalars,
      teamCoach: teamCoachRow ? teamCoachRow.values : null,
      reconciled: recon.reconciled,
      reconciliationNotes: recon.notes,
    } : null,
    unparsed,
  };
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

// The other known FIBA Europe Stats Suite report-section titles, used
// only to make a "no box score" error name precisely what IS in the file
// instead of a generic "e.g." list -- confirmed literal titles from real
// standalone and merged exports alike.
const OTHER_SECTION_TITLES = [
  'PLAY BY PLAY', 'LINEUP EFFICIENCY', 'SCORE DEVELOPMENT', 'TEAM COMPARISON', 'PLAYER EVALUATION', 'Shot chart',
];

async function parse(lines) {
  const titleIdx = lines.indexOf(BOX_SCORE_TITLE);
  if (titleIdx === -1) {
    const foundTitles = OTHER_SECTION_TITLES.filter((t) => lines.includes(t));
    const err = new Error(
      foundTitles.length > 0
        ? `This is a FIBA Europe Stats Suite export containing ${foundTitles.join(', ')}, but no box score `
          + `("${BOX_SCORE_TITLE}") section -- there is nothing for this reader to extract from this specific file.`
        : `Could not find the box-score section ("${BOX_SCORE_TITLE}") in this PDF, and none of this format's `
          + 'other known report-section titles either. This looks like a FIBA Europe Stats Suite export, but not '
          + 'one this reader recognises the contents of.',
    );
    err.code = 'EXTRACTION_NO_BOX_SCORE';
    err.rawTextSample = lines.join('\n').slice(0, 2000);
    throw err;
  }

  const gameInfo = parseHeader(lines, titleIdx);
  const sections = findTeamSections(lines, titleIdx);
  if (!sections) {
    const err = new Error(
      'Found a FIBA Europe Stats Suite box-score title but could not find two team roster sections '
      + '("Min" immediately followed by "FG 2P FG 3P FG FT Reb", twice) after it.',
    );
    err.code = 'EXTRACTION_NO_SECTIONS';
    err.rawTextSample = lines.join('\n').slice(0, 2000);
    throw err;
  }

  const parsedSections = sections.map(parseSection);

  // Reuse the exact same shared, format-agnostic helper Genius Sports
  // already uses (teamSide.js) -- it matches each section's own printed
  // team name against gameInfo.homeTeam (the team named first in this
  // file's own "<Team1> vs <Team2>" title), with the same honest
  // positional+unconfirmed fallback Genius Sports gets when that match is
  // uncertain. This is "what the import flow does today," applied
  // identically -- not a new decision this reader makes about whose team
  // is whose. Each side still carries its own printedLabel/printOrder/
  // team_name untouched, exactly as printed, regardless of which side this
  // assigns as home/opponent.
  const sided = assignTeamSides(parsedSections, gameInfo.homeTeam);

  const bySide = {};
  sided.forEach((s) => { bySide[s.team_side] = s; });

  const unparsedAll = parsedSections.flatMap((s) => s.unparsed);

  return {
    format: 'fiba-europe-stats-suite',
    gameInfo,
    teams: {
      home: bySide.home,
      opponent: bySide.opponent,
    },
    unparsed: { count: unparsedAll.length, samples: unparsedAll.slice(0, 10) },
    extra: {},
  };
}

module.exports = {
  id: 'fiba-europe-stats-suite', detect, parse, classifyIdentityStyle,
};
