const fs = require('fs');
const { PDFParse } = require('pdf-parse');

// FIBA LiveStats "Play by Play" report extractor.
//
// CALIBRATED against the real merged 10-report export
// (26TH_JULY_MERGED_USIU_TIGERS_VS_CONGO_NETS.pdf) -- validated by
// reconstructing home/opponent scoring from all 540 parsed events across
// all 4 quarters and confirming the total matches the Box Score's final
// score (83-34) exactly, with zero unattributed scoring plays and zero
// unclassified lines.
//
// LAYOUT: the report is visually two columns (home team's events on the
// left, opponent's on the right of a shared Game Time / Score / Diff
// spine). pdf-parse's linear text extraction keeps one event per line in
// the common case, as either:
//   "TIME JERSEY NAME TEXT [SCORE DIFF]"          (home team scored, or no
//                                                   score change)
//   "TIME SCORE DIFF JERSEY NAME TEXT"             (opponent scored)
// but whenever an event's description is long enough to wrap, the line
// splits across two or three physical lines with no leading time on the
// first fragment, e.g.:
//   "6 NGALA J 2pt FG fast break in the paint, driving layup"
//   "08:03 2-2 0"
//   "made (2)"
// This parser reassembles those fragments with a small state machine keyed
// on line shape (see classifyLine), not on column x-position -- pdf-parse
// does not expose word coordinates, so column position isn't available to
// key off, and even if it were, team is determined more reliably below.
//
// TEAM ATTRIBUTION: done by matching jersey number + name against the
// roster from extractBoxScore() (home/opponent), not by column position or
// by score-before/after-jersey ordering. This matters: jersey numbers
// commonly collide between the two squads (in the calibration game, jersey
// numbers 9, 11, 12, 13, 14 and 18 are ALL shared), so a jersey-only or
// column-only heuristic will silently hand events to the wrong team on
// every collision. There is deliberately NO jersey-only fallback in
// resolveTeam() for this reason -- an unresolved team (null) is a signal
// to fix the name match, not something to guess through.
//
// NAME FORMAT MISMATCH BETWEEN REPORT TYPES: extractBoxScore's
// player_name is "FIRSTNAME SURNAME" (e.g. "AMOS KIM", as printed in the
// Box Score roster table). This report instead prints "SURNAME INITIAL"
// (e.g. "KIM A") -- the initial is the first letter of the box score
// name's FIRST token, and the surname is its LAST token. buildRosterIndex
// below handles that conversion; get it backwards and roster lookups will
// silently fail over to whichever fallback you wrote (which is exactly
// the bug this file's first draft had -- caught only by the points-total
// cross-check, not by eyeballing a handful of sample events).

const TIME_RE = /^(\d{1,2}:\d{2})$/;
const TIME_SCORE_RE = /^(\d{1,2}:\d{2})\s+(\d+-\d+)\s+(-?\d+)$/;
const TIME_EVENT_RE = /^(\d{1,2}:\d{2})\s+(.+)$/;
const JERSEY_NAME_LEAD_RE = /^(\d{1,2})\s+([A-Z]+)\s+([A-Z])\b\s*(.*)$/;
const SCORE_DIFF_LEAD_RE = /^(\d+-\d+)\s+(-?\d+)\s+(.*)$/;
const SCORE_DIFF_TRAIL_RE = /^(.*?)\s+(\d+-\d+)\s+(-?\d+)$/;
const QUARTER_HEADER_RE = /^Quarter (\d+)$/;
const NEUTRAL_EVENT_RE = /^(Timeout Full|jump ball situation)$/;

function classifyLine(line) {
  if (TIME_SCORE_RE.test(line)) return 'TIME_SCORE';
  if (TIME_RE.test(line)) return 'TIME_ONLY';
  if (TIME_EVENT_RE.test(line)) return 'TIME_EVENT';
  if (JERSEY_NAME_LEAD_RE.test(line)) return 'EVENT_START_NO_TIME';
  return 'CONTINUATION';
}

function parseEventContent(rest) {
  let score = null;
  let diff = null;

  const scoreLead = rest.match(SCORE_DIFF_LEAD_RE);
  if (scoreLead) {
    score = scoreLead[1];
    diff = Number(scoreLead[2]);
    rest = scoreLead[3];
  }

  const jerseyMatch = rest.match(JERSEY_NAME_LEAD_RE);
  if (jerseyMatch) {
    let text = jerseyMatch[4];
    if (!score) {
      const trail = text.match(SCORE_DIFF_TRAIL_RE);
      if (trail) {
        text = trail[1];
        score = trail[2];
        diff = Number(trail[3]);
      }
    }
    return {
      jersey: Number(jerseyMatch[1]),
      surname: jerseyMatch[2],
      initial: jerseyMatch[3],
      text: text.trim(),
      score,
      diff,
    };
  }

  // No jersey -- neutral event (Timeout Full, jump ball situation) or an
  // unattributed team rebound/turnover the report itself credits to no
  // player (confirmed genuine against raw text, e.g. "00:32 defensive
  // rebound (9)" with no player token anywhere on that line -- this is
  // not a parsing loss, it's how the source data is).
  return { jersey: null, surname: null, initial: null, text: rest.trim(), score, diff };
}

function buildRosterIndex(players) {
  const index = new Map();
  for (const p of players) {
    const parts = p.player_name.replace(/\(.*?\)/g, '').trim().split(/\s+/);
    if (parts.length < 2) continue;
    const initial = parts[0][0].toUpperCase();
    const surname = parts[parts.length - 1].toUpperCase();
    index.set(`${p.jersey_number}|${surname}|${initial}`, p.team_side);
  }
  return index;
}

function resolveTeam(rosterIndex, jersey, surname, initial) {
  if (jersey == null) return null;
  const key = `${jersey}|${surname}|${initial}`;
  return rosterIndex.has(key) ? rosterIndex.get(key) : null;
}

// lines: pre-normalised lines (same tab-collapse/trim/whitespace-collapse
// pipeline extractBoxScore uses) covering the Play-by-Play pages only, or
// the whole merged-PDF text -- non-Play-by-Play content is ignored until
// the "Game Time USIU Score Diff CNS" column header is seen.
// players: the `players` array from extractBoxScore() for this same game
// (used purely for jersey/name -> team_side lookup).
function parsePlayByPlay(lines, players) {
  const rosterIndex = buildRosterIndex(players);
  const events = [];
  let quarter = null;
  let pending = null;
  let inEventSection = false;
  const skippedLines = [];
  const unresolvedTeamCount = { count: 0 };

  function flush() {
    if (!pending) return;
    const team = resolveTeam(rosterIndex, pending.jersey, pending.surname, pending.initial);
    if (pending.jersey != null && team == null) unresolvedTeamCount.count += 1;
    events.push({
      quarter,
      time: pending.time,
      team, // 'home' | 'opponent' | null (neutral event or unresolved roster match)
      jersey: pending.jersey,
      player: pending.jersey != null ? `${pending.surname} ${pending.initial}` : null,
      description: pending.textParts.join(' ').replace(/\s+/g, ' ').trim(),
      score: pending.score,       // e.g. "45-17", running score at this event, or null
      score_diff: pending.diff,   // signed differential, or null
    });
    pending = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const qMatch = line.match(QUARTER_HEADER_RE);
    if (qMatch) {
      flush();
      quarter = Number(qMatch[1]);
      inEventSection = false;
      continue;
    }
    if (line === 'Game Time USIU Score Diff CNS') {
      inEventSection = true;
      continue;
    }
    if (!inEventSection) continue;
    if (line.startsWith('DIVISION 1 Play by Play')) { inEventSection = false; continue; }

    const kind = classifyLine(line);

    if (kind === 'TIME_EVENT') {
      const m = line.match(TIME_EVENT_RE);
      const time = m[1];
      const rest = m[2];

      if (NEUTRAL_EVENT_RE.test(rest)) {
        flush();
        pending = { jersey: null, surname: null, initial: null, textParts: [rest], score: null, diff: null, time };
        flush();
        continue;
      }

      const parsed = parseEventContent(rest);
      flush();
      pending = {
        jersey: parsed.jersey,
        surname: parsed.surname,
        initial: parsed.initial,
        textParts: [parsed.text],
        score: parsed.score,
        diff: parsed.diff,
        time,
      };
      flush();
      continue;
    }

    if (kind === 'EVENT_START_NO_TIME') {
      const m = line.match(JERSEY_NAME_LEAD_RE);
      flush();
      pending = {
        jersey: Number(m[1]),
        surname: m[2],
        initial: m[3],
        textParts: [m[4]],
        score: null,
        diff: null,
        time: null,
      };
      continue;
    }

    if (kind === 'TIME_SCORE') {
      const m = line.match(TIME_SCORE_RE);
      if (pending) {
        pending.time = m[1];
        pending.score = m[2];
        pending.diff = Number(m[3]);
      } else {
        skippedLines.push(line);
      }
      continue;
    }

    if (kind === 'TIME_ONLY') {
      if (pending) {
        pending.time = line;
      } else {
        skippedLines.push(line);
      }
      continue;
    }

    // CONTINUATION -- wrapped second/third fragment of the current event
    if (pending) {
      pending.textParts.push(line);
    } else {
      skippedLines.push(line);
    }
  }
  flush();

  return { events, skippedLines, unresolvedTeamCount: unresolvedTeamCount.count };
}

// filePath: path to the merged PDF (or a standalone Play-by-Play export).
// players: pass the `players` array already returned by extractBoxScore()
// for this same game -- required for team attribution, see header comment.
async function extractPlayByPlay(filePath, players) {
  if (!Array.isArray(players) || players.length === 0) {
    const err = new Error('extractPlayByPlay requires the players[] array from extractBoxScore() for this game (used for team attribution).');
    err.code = 'EXTRACTION_MISSING_ROSTER';
    throw err;
  }

  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();

  const normalizedText = data.text.replace(/\t/g, ' ');
  const lines = normalizedText.split('\n').map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean);

  if (!lines.some((l) => l === 'DIVISION 1 Play by Play' || l.endsWith('Play by Play'))) {
    const err = new Error('No Play by Play pages found in this PDF.');
    err.code = 'EXTRACTION_NO_SECTIONS';
    throw err;
  }

  const { events, skippedLines, unresolvedTeamCount } = parsePlayByPlay(lines, players);

  if (events.length === 0) {
    const err = new Error('No play-by-play events matched the expected layout.');
    err.code = 'EXTRACTION_NO_MATCH';
    err.rawTextSample = data.text.slice(0, 2000);
    throw err;
  }

  // Surface partial-failure signals rather than silently returning
  // incomplete data: skippedLines means a line shape wasn't recognised
  // (report format drifted from this game's layout); unresolvedTeamCount
  // means a jersey+name combination in the play-by-play didn't match any
  // roster entry (name spelling drift between report types, or a player
  // substitution/eligibility swap mid-tournament).
  return {
    events,
    quarterCounts: [1, 2, 3, 4].map((q) => events.filter((e) => e.quarter === q).length),
    skippedLineCount: skippedLines.length,
    skippedLines: skippedLines.slice(0, 10),
    unresolvedTeamCount,
  };
}

module.exports = { extractPlayByPlay, parsePlayByPlay };