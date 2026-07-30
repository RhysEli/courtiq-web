const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { extractBoxScore } = require('../services/pdfExtraction');

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

// Upload a single FIBA report PDF for a game and extract it.
router.post(
  '/games/:gameId/reports',
  requireRole('Administrator', 'Statistician'),
  upload.single('file'),
  async (req, res) => {
    const { gameId } = req.params;
    const { reportType } = req.body;
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    if (!reportType) return res.status(400).json({ error: 'reportType is required' });

    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const insert = db.prepare(`
      INSERT INTO reports (game_id, report_type, original_filename, storage_path, uploaded_by)
      VALUES (?, ?, ?, ?, ?)
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
        players.forEach((p, idx) => {
          const teamSide = idx < midpoint ? 'home' : 'opponent';
          insertStat.run(
            gameId, p.player_name, teamSide, p.minutes, p.points, p.fgm, p.fga,
            p.three_pm, p.three_pa, p.ftm, p.fta, p.oreb, p.dreb, p.reb,
            p.assists, p.steals, p.blocks, p.turnovers, p.fouls, p.plus_minus,
            JSON.stringify(p),
          );
        });
        db.prepare('UPDATE reports SET extraction_status = ? WHERE id = ?').run('extracted', reportId);
        return res.status(201).json({
          reportId,
          extraction: { playersExtracted: players.length, unparsedLineCount },
          note: unparsedLineCount > 0
            ? `${unparsedLineCount} line(s) looked like stat rows but did not match the parser — check extraction_error-free but review raw text if numbers look off.`
            : undefined,
        });
      } catch (err) {
        db.prepare('UPDATE reports SET extraction_status = ?, extraction_error = ? WHERE id = ?')
          .run('failed', err.message, reportId);
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
    db.prepare('UPDATE reports SET extraction_status = ? WHERE id = ?').run('pending', reportId);
    res.status(201).json({
      reportId,
      note: `${reportType} was stored but extraction for this report type is not yet implemented.`,
    });
  },
);

router.get('/games/:gameId/reports', (req, res) => {
  const reports = db.prepare('SELECT id, report_type, original_filename, extraction_status, extraction_error, uploaded_at FROM reports WHERE game_id = ?')
    .all(req.params.gameId);
  res.json(reports);
});

module.exports = router;
