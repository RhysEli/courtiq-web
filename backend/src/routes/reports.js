const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth, requireRole, requireGameAccess, requireStatisticianOrFallback } = require('../middleware/auth');
const { extractBoxScore } = require('../services/pdfExtraction');
const { logAction } = require('../services/auditLog');
const { resolvePlayerName } = require('../services/playerIdentity');
const {
  extractQuarterReport,
  extractPlusMinusSummary,
  extractLineupAnalysis,
  extractRotationsSummary,
  extractPlayByPlay,
} = require('../services/reportExtractors');
const { extractScoreSheet } = require('../services/parseScoreSheet');
const {
  persistQuarter,
  persistPlusMinus,
  persistLineupAnalysis,
  persistRotationsSummary,
  persistPlayByPlay,
  persistScoreSheet,
} = require('../services/persistExtractedReports');
const { summarizeByPlayer, summarizeByTeamSide } = require('../services/shotZoneStats');

const router = express.Router();
router.use(requireAuth);

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../data/uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are accepted for FIBA reports'));
    }
    cb(null, true);
  },
});

// Maps the reportType string this route receives (matching games.js's
// REPORT_TYPES) to the same real extractor + persist function bulkImport.js
// already uses for its own 6-extractor pass. Deliberately NOT going
// through persistExtractedReports.js's persistAdditionalReports wrapper:
// that function unconditionally runs all 6 persist* functions on every
// call, and each one unconditionally deletes its own table's rows for
// gameId before checking whether it was actually passed real data for
// this call -- correct for bulk-import (one call, all 6 keys genuinely
// populated together from the same PDF), but confirmed directly to
// silently wipe every other already-persisted report type for a game the
// moment a DIFFERENT type gets uploaded through this one-type-per-request
// route. Calling the individual persist* function here touches only the
// table for the type actually being persisted.
//
// Box Score is handled separately below (its own player_game_stats/
// identity-resolution path, unrelated to any of this). Player Evaluation,
// Shot Areas, and Shot Charts have no real extractor anywhere in this
// codebase -- genuinely not yet implemented, not just missing from this map.
const REPORT_TYPE_EXTRACTORS = {
  'Quarter Scoring': { key: 'quarter', extract: extractQuarterReport, persist: persistQuarter },
  'Plus Minus Summary': { key: 'plusMinus', extract: extractPlusMinusSummary, persist: persistPlusMinus },
  'Lineup Analysis': { key: 'lineupAnalysis', extract: extractLineupAnalysis, persist: persistLineupAnalysis },
  'Rotation Summary': { key: 'rotationsSummary', extract: extractRotationsSummary, persist: persistRotationsSummary },
  'Play-by-Play': { key: 'playByPlay', extract: extractPlayByPlay, persist: persistPlayByPlay },
  'Score Sheet': { key: 'scoreSheet', extract: extractScoreSheet, persist: persistScoreSheet },
};

// Upload a single FIBA report PDF for a game and extract it. Statistician-
// primary; Team Manager falls back to this (import/store only, not the
// deeper AI narrative -- see analysis.js) when their own team currently
// has no Statistician.
router.post(
  '/games/:gameId/reports',
  requireRole('Statistician', 'Team Manager'),
  requireGameAccess('gameId'),
  requireStatisticianOrFallback('gameId'),
  upload.single('file'),
  async (req, res) => {
    const { gameId } = req.params;
    const { reportType } = req.body;
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    if (!reportType) return res.status(400).json({ error: 'reportType is required' });

    const game = await db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    // One cache for this request (this route only ever extracts/persists
    // one report type per upload -- see REPORT_TYPE_EXTRACTORS's comment
    // above -- but the Box Score branch and persistQuarter/persistPlusMinus
    // both still loop over many players across up to 2 team_ids). Created
    // fresh per request, never module-level, so it can't leak between two
    // different report-upload requests.
    const identityCache = {};

    const insert = await db.prepare(`
      INSERT INTO reports (game_id, report_type, original_filename, storage_path, uploaded_by)
      VALUES (?, ?, ?, ?, ?)
      RETURNING id
    `).run(gameId, reportType, req.file.originalname, req.file.path, req.user.id);
    const reportId = insert.lastInsertRowid;

    if (reportType === 'Box Score') {
      try {
        const { players, unparsedLineCount } = await extractBoxScore(req.file.path);
        // team_side comes straight from extractBoxScore's own p.team_side
        // (services/teamSide.js's assignTeamSides, matched against the Box
        // Score header's real home-team name) -- this branch used to
        // discard that and recompute its own positional midpoint guess
        // instead, silently mislabeling home/opponent whenever the away
        // team happened to print first. Confirmed (Step 30 investigation)
        // that guess was never actually exercised against any real,
        // currently-stored data -- this route had never been used for a
        // real Box Score upload at all -- but it was a live, latent bug in
        // the running code regardless. Same p.team_side usage
        // bulkImport.js's own Box Score loop already has (routes/
        // bulkImport.js) -- not reimplemented here, just no longer
        // discarded.
        //
        // Player identity resolution (playerIdentity.js) -- previously
        // missing entirely on this ingestion path (unlike bulkImport.js's
        // primary Box Score route), so a name uploaded through this single-
        // report route got no players/player_name_aliases/
        // player_identity_review entry at all until a later manual
        // backfill happened to catch it. Same per-player resolve-then-
        // insert shape as bulkImport.js now uses -- identity resolution
        // stays a sequential per-player await (a later name's decision can
        // depend on an alias this same loop just created); only the
        // actual row insert is collected and batched afterward, the same
        // fix bulkImport.js's own Box Score loop got.
        const statRows = [];
        let anyTeamSideUnconfirmed = false;
        for (const p of players) {
          if (p.team_side_unconfirmed) anyTeamSideUnconfirmed = true;
          const playerTeamId = p.team_side === 'home' ? game.home_team_id : game.opponent_team_id;
          let playerId = null;
          if (playerTeamId) {
            const resolution = await resolvePlayerName({
              teamId: playerTeamId, name: p.player_name, gameId, reportType: 'Box Score', cache: identityCache,
            });
            if (resolution.status === 'linked' || resolution.status === 'created') {
              playerId = resolution.playerId;
            }
            // 'pending_review' leaves playerId null -- confirmReview/
            // rejectReview in playerIdentity.js backfill it onto this row
            // once a human resolves the review, same as bulkImport.js.
          }
          statRows.push([
            gameId, p.player_name, p.team_side, p.minutes, p.points, p.fgm, p.fga,
            p.three_pm, p.three_pa, p.ftm, p.fta, p.oreb, p.dreb, p.reb,
            p.assists, p.steals, p.blocks, p.turnovers, p.fouls, p.plus_minus,
            JSON.stringify(p), playerId,
          ]);
        }
        await db.batchInsert(
          'player_game_stats',
          ['game_id', 'player_name', 'team_side', 'minutes', 'points', 'fgm', 'fga', 'three_pm', 'three_pa',
            'ftm', 'fta', 'oreb', 'dreb', 'reb', 'assists', 'steals', 'blocks', 'turnovers', 'fouls', 'plus_minus',
            'raw_extraction', 'player_id'],
          statRows,
        );
        await db.prepare('UPDATE reports SET extraction_status = ? WHERE id = ?').run('extracted', reportId);
        await logAction(req.user.id, 'upload', `${reportType} report: ${req.file.originalname} -> game #${gameId} (${players.length} players extracted)`, true);
        const noteParts = [];
        if (unparsedLineCount > 0) {
          noteParts.push(`${unparsedLineCount} line(s) looked like stat rows but did not match the parser — check extraction_error-free but review raw text if numbers look off.`);
        }
        if (anyTeamSideUnconfirmed) {
          noteParts.push('Could not confidently match one or both team names to home/opponent from this PDF\'s own header — team side fell back to print order for at least one player and should be double-checked.');
        }
        return res.status(201).json({
          reportId,
          extraction: { playersExtracted: players.length, unparsedLineCount },
          note: noteParts.length > 0 ? noteParts.join(' ') : undefined,
        });
      } catch (err) {
        await db.prepare('UPDATE reports SET extraction_status = ?, extraction_error = ? WHERE id = ?')
          .run('failed', err.message, reportId);
        await logAction(req.user.id, 'upload', `${reportType} report: ${req.file.originalname} -> game #${gameId} (${err.message})`, false);
        return res.status(422).json({
          reportId,
          error: err.message,
          code: err.code,
          rawTextSample: err.rawTextSample,
        });
      }
    }

    // The 6 report types that already have a real, working extractor --
    // the same ones bulkImport.js runs on every uploaded PDF, wired here
    // to the SAME extractor function and the SAME persistExtractedReports.js
    // persistence path, not reimplemented. Unlike bulkImport.js (which
    // tries all 6 unconditionally against a possibly-merged PDF and
    // silently skips whichever don't match), this route trusts the
    // caller's own reportType selection -- a real extraction failure here
    // is a genuine error (422), the same way the Box Score branch above
    // already treats one.
    const mapped = REPORT_TYPE_EXTRACTORS[reportType];
    if (mapped) {
      try {
        // homeTeamName: bulkImport.js derives this from the SAME PDF's own
        // Box Score header (extracted moments earlier in that flow) --
        // this route only ever extracts one report type per upload, so
        // there's no co-extracted header text available here. game.
        // home_team_id (already fetched above) is the best real stand-in:
        // assignTeamSides (services/teamSide.js) does a normalized
        // substring match against it, and gracefully falls back to
        // positional assignment with team_side_unconfirmed: true if it
        // doesn't match -- never a hard failure either way.
        const result = await mapped.extract(req.file.path, game.home_team_id);
        // teamIdBySide: same shape persistAdditionalReports builds
        // internally for persistQuarter/persistPlusMinus's own player-
        // identity resolution -- built here directly since `game` is
        // already in scope, rather than re-fetching it. Harmless to pass
        // to the other 4 persist* functions too; none of them accept a
        // third argument, so it's simply unused there.
        const teamIdBySide = { home: game.home_team_id, opponent: game.opponent_team_id };
        const rows = await mapped.persist(gameId, result, teamIdBySide, identityCache);

        await db.prepare('UPDATE reports SET extraction_status = ? WHERE id = ?').run('extracted', reportId);
        await logAction(req.user.id, 'upload', `${reportType} report: ${req.file.originalname} -> game #${gameId} (extracted)`, true);
        return res.status(201).json({ reportId, extraction: { status: 'stored', rows } });
      } catch (err) {
        await db.prepare('UPDATE reports SET extraction_status = ?, extraction_error = ? WHERE id = ?')
          .run('failed', err.message, reportId);
        await logAction(req.user.id, 'upload', `${reportType} report: ${req.file.originalname} -> game #${gameId} (${err.message})`, false);
        return res.status(422).json({
          reportId,
          error: err.message,
          code: err.code,
          rawTextSample: err.rawTextSample,
        });
      }
    }

    // Only Player Evaluation, Shot Areas, and Shot Charts land here --
    // genuinely no extractor exists anywhere in this codebase for these
    // three, unlike the 6 above.
    await db.prepare('UPDATE reports SET extraction_status = ? WHERE id = ?').run('pending', reportId);
    await logAction(req.user.id, 'upload', `${reportType} report: ${req.file.originalname} -> game #${gameId} (stored, not yet parsed)`, true);
    res.status(201).json({
      reportId,
      note: `${reportType} was stored but extraction for this report type is not yet implemented.`,
    });
  },
);

router.get('/games/:gameId/reports', requireGameAccess('gameId'), async (req, res) => {
  const reports = await db.prepare('SELECT id, report_type, original_filename, extraction_status, extraction_error, uploaded_at FROM reports WHERE game_id = ?')
    .all(req.params.gameId);
  res.json(reports);
});

// The structured data actually parsed out of the 6 additional report types
// (Quarter, Plus/Minus, Lineup Analysis, Rotations Summary, Play-by-Play,
// Score Sheet) for a game, as written by bulkImport.js's insertReportData
// calls. Separate from GET /games/:gameId/reports above, which only lists
// upload metadata for the `reports` table, not the extracted content.
router.get('/games/:gameId/report-data', requireGameAccess('gameId'), async (req, res) => {
  const { gameId } = req.params;
  const game = await db.prepare('SELECT id FROM games WHERE id = ?').get(gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const quarterTeams = await db.prepare('SELECT * FROM game_quarter_team WHERE game_id = ?').all(gameId);
  const quarterPlayers = await db.prepare('SELECT * FROM game_quarter_player WHERE game_id = ?').all(gameId);
  const plusMinus = await db.prepare('SELECT * FROM game_plus_minus WHERE game_id = ?').all(gameId);
  const lineupAnalysis = (await db.prepare('SELECT * FROM game_lineup_analysis WHERE game_id = ?').all(gameId))
    .map((row) => ({ ...row, players_json: JSON.parse(row.players_json) }));
  const rotationStints = (await db.prepare('SELECT * FROM game_rotation_stints WHERE game_id = ?').all(gameId))
    .map((row) => ({ ...row, players_json: JSON.parse(row.players_json) }));
  const playByPlay = await db.prepare('SELECT * FROM game_play_by_play WHERE game_id = ? ORDER BY sequence_index').all(gameId);
  const scoreSheet = (await db.prepare('SELECT * FROM game_score_sheet WHERE game_id = ?').get(gameId)) || null;

  res.json({
    quarter: { teams: quarterTeams, players: quarterPlayers },
    plusMinus,
    lineupAnalysis,
    rotationStints,
    playByPlay,
    scoreSheet,
  });
});

// Step 45 Phase 3: real "shot selection zones" breakdown (paint/mid_range/
// three -- attempts, makes, make%) for one game, per player and per team
// side. NOT a shot chart -- no x/y, no court diagram, a stat breakdown
// only, built from shot_zone/player_id (Phase 1 backfill + Phase 2
// ingestion-time population) on game_play_by_play.
router.get('/games/:gameId/shot-zones', requireGameAccess('gameId'), async (req, res) => {
  const { gameId } = req.params;
  const game = await db.prepare('SELECT id, home_team_id, opponent_team_id FROM games WHERE id = ?').get(gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const rows = await db.prepare(`
    SELECT gpp.player_id, p.full_name,
      CASE WHEN p.team_id = ? THEN 'home' ELSE 'opponent' END as team_side,
      gpp.shot_zone,
      COUNT(*) as attempts,
      COUNT(*) FILTER (WHERE gpp.action_text ILIKE '%made%') as makes
    FROM game_play_by_play gpp
    JOIN players p ON p.id = gpp.player_id
    WHERE gpp.game_id = ? AND gpp.shot_zone IS NOT NULL
    GROUP BY gpp.player_id, p.full_name, team_side, gpp.shot_zone
  `).all(game.home_team_id, gameId);

  const players = summarizeByPlayer(rows);
  const teams = summarizeByTeamSide(players);

  // Real events that DID carry a real shot_zone but couldn't be tied to a
  // specific player_id -- disclosed, not hidden, same as every other real
  // identity-resolution gap in this system (typically a name still sitting
  // in the pending player_identity_review queue).
  const unresolved = await db.prepare(
    'SELECT COUNT(*) as n FROM game_play_by_play WHERE game_id = ? AND shot_zone IS NOT NULL AND player_id IS NULL',
  ).get(gameId);

  res.json({
    gameId: Number(gameId), players, teams, unresolvedAttempts: Number(unresolved.n),
  });
});

module.exports = router;