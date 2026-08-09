const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { extractBoxScore } = require('../services/pdfExtraction');
const {
  extractQuarterReport,
  extractPlusMinusSummary,
  extractLineupAnalysis,
  extractRotationsSummary,
  extractPlayByPlay,
} = require('../services/reportExtractors');
const { extractScoreSheet } = require('../services/parseScoreSheet');
const { persistAdditionalReports } = require('../services/persistExtractedReports');

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

const insertStatStmt = db.prepare(`
  INSERT INTO player_game_stats
    (game_id, player_name, team_side, minutes, points, fgm, fga, three_pm, three_pa,
     ftm, fta, oreb, dreb, reb, assists, steals, blocks, turnovers, fouls, plus_minus, raw_extraction)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);

const extraExtractors = {
  quarter: extractQuarterReport,
  plusMinus: extractPlusMinusSummary,
  lineupAnalysis: extractLineupAnalysis,
  rotationsSummary: extractRotationsSummary,
  playByPlay: extractPlayByPlay,
  scoreSheet: extractScoreSheet,
};

router.post(
  '/games/bulk-import',
  requireRole('Administrator', 'Statistician'),
  upload.array('files', 100),
  async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'At least one PDF file is required (field name: files)' });
    }
    const { seasonId, leagueId } = req.body;

    const results = [];

    for (const file of req.files) {
      const entry = { filename: file.originalname };
      try {
        const { players, gameInfo, unparsedLineCount } = await extractBoxScore(file.path);

        if (!gameInfo || !gameInfo.homeTeam || !gameInfo.awayTeam || !gameInfo.matchDate) {
          entry.status = 'failed';
          entry.error = 'Could not read team names and date from this PDF\'s header. '
            + 'It may not be a FIBA Box Score report, or the header layout is different from what this parser expects.';
          results.push(entry);
          continue;
        }

        entry.additionalReports = {};
        for (const [key, extractorFn] of Object.entries(extraExtractors)) {
          try {
            entry.additionalReports[key] = await extractorFn(file.path);
          } catch (extraErr) {
            entry.additionalReports[key] = { error: extraErr.message, code: extraErr.code };
          }
        }

        const homeTeamId = gameInfo.homeTeam;
        const awayTeamId = gameInfo.awayTeam;

        db.prepare('INSERT OR IGNORE INTO teams (id, name) VALUES (?, ?)').run(homeTeamId, homeTeamId);
        db.prepare('INSERT OR IGNORE INTO teams (id, name) VALUES (?, ?)').run(awayTeamId, awayTeamId);
        if (seasonId) {
          db.prepare('INSERT OR IGNORE INTO seasons (id, name) VALUES (?, ?)').run(seasonId, seasonId);
        }

        let game = db.prepare(`
          SELECT * FROM games WHERE home_team_id = ? AND opponent_team_id = ? AND game_date = ?
        `).get(homeTeamId, awayTeamId, gameInfo.matchDate);

        let created = false;
        if (!game) {
          const insertGame = db.prepare(`
            INSERT INTO games (season_id, league_id, home_team_id, opponent_team_id, game_date, created_by, status)
            VALUES (?, ?, ?, ?, ?, ?, 'extracted')
          `).run(seasonId || null, leagueId || null, homeTeamId, awayTeamId, gameInfo.matchDate, req.user.id);
          game = db.prepare('SELECT * FROM games WHERE id = ?').get(insertGame.lastInsertRowid);
          created = true;
        }

        const insertReport = db.prepare(`
          INSERT INTO reports (game_id, report_type, original_filename, storage_path, uploaded_by, extraction_status)
          VALUES (?, 'Box Score', ?, ?, ?, 'extracted')
        `).run(game.id, file.originalname, file.path, req.user.id);

        db.prepare('DELETE FROM player_game_stats WHERE game_id = ?').run(game.id);
        players.forEach((p) => {
          insertStatStmt.run(
            game.id, p.player_name, p.team_side, p.minutes, p.points, p.fgm, p.fga,
            p.three_pm, p.three_pa, p.ftm, p.fta, p.oreb, p.dreb, p.reb,
            p.assists, p.steals, p.blocks, p.turnovers, p.fouls, p.plus_minus,
            JSON.stringify(p),
          );
        });

        persistAdditionalReports(game.id, entry.additionalReports);

        entry.status = created ? 'game_created' : 'game_matched';
        entry.gameId = game.id;
        entry.homeTeam = gameInfo.homeTeam;
        entry.awayTeam = gameInfo.awayTeam;
        entry.homeScore = gameInfo.homeScore;
        entry.awayScore = gameInfo.awayScore;
        entry.matchDate = gameInfo.matchDate;
        entry.gameNumber = gameInfo.gameNumber;
        entry.playersExtracted = players.length;
        entry.unparsedLineCount = unparsedLineCount;
        entry.reportId = insertReport.lastInsertRowid;
        results.push(entry);
      } catch (err) {
        entry.status = 'failed';
        entry.error = err.message;
        entry.code = err.code;
        results.push(entry);
      }
    }

    const summary = {
      total: results.length,
      gamesCreated: results.filter((r) => r.status === 'game_created').length,
      gamesMatched: results.filter((r) => r.status === 'game_matched').length,
      failed: results.filter((r) => r.status === 'failed').length,
    };

    res.status(207).json({ summary, results });
  },
);

module.exports = router;