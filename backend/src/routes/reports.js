const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth, requireRole, requireGameAccess, requireStatisticianOrFallback } = require('../middleware/auth');
const { extractBoxScore } = require('../services/pdfExtraction');
const { logAction } = require('../services/auditLog');

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

    const insert = await db.prepare(`
      INSERT INTO reports (game_id, report_type, original_filename, storage_path, uploaded_by)
      VALUES (?, ?, ?, ?, ?)
      RETURNING id
    `).run(gameId, reportType, req.file.originalname, req.file.path, req.user.id);
    const reportId = insert.lastInsertRowid;

    if (reportType === 'Box Score') {
      try {
        const { players, unparsedLineCount } = await extractBoxScore(req.file.path);
        // NOTE: team_side (home/opponent) assignment currently needs to be
        // confirmed by the Statistician — Box Score PDFs list both rosters
        // but don't always make home/away unambiguous from text alone.
        // Simplification for this pass: first half of parsed rows = home.
        const midpoint = Math.ceil(players.length / 2);
        const insertStat = db.prepare(`
          INSERT INTO player_game_stats
            (game_id, player_name, team_side, minutes, points, fgm, fga, three_pm, three_pa,
             ftm, fta, oreb, dreb, reb, assists, steals, blocks, turnovers, fouls, plus_minus, raw_extraction)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `);
        for (const p of players) {
          const idx = players.indexOf(p);
          const teamSide = idx < midpoint ? 'home' : 'opponent';
          await insertStat.run(
            gameId, p.player_name, teamSide, p.minutes, p.points, p.fgm, p.fga,
            p.three_pm, p.three_pa, p.ftm, p.fta, p.oreb, p.dreb, p.reb,
            p.assists, p.steals, p.blocks, p.turnovers, p.fouls, p.plus_minus,
            JSON.stringify(p),
          );
        }
        await db.prepare('UPDATE reports SET extraction_status = ? WHERE id = ?').run('extracted', reportId);
        await logAction(req.user.id, 'upload', `${reportType} report: ${req.file.originalname} -> game #${gameId} (${players.length} players extracted)`, true);
        return res.status(201).json({
          reportId,
          extraction: { playersExtracted: players.length, unparsedLineCount },
          note: unparsedLineCount > 0
            ? `${unparsedLineCount} line(s) looked like stat rows but did not match the parser — check extraction_error-free but review raw text if numbers look off.`
            : undefined,
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

    // Other 9 report types (Play-by-Play, Player Evaluation, etc.) are
    // stored but not yet parsed — extraction for those follows the same
    // pattern as extractBoxScore once you supply real sample PDFs for each.
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

module.exports = router;