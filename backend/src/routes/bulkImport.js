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
const insertReportData = require('../db/insertReports');

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

// Extractors for the additional FIBA LiveStats report types, beyond the
// Box Score. Each one is called independently against the same merged
// PDF -- if a given report type isn't present in a particular export, or
// its regex doesn't match this file's exact formatting, that single
// extractor fails without blocking the Box Score import that already
// succeeded, or the other extractors.
const extraExtractors = {
  quarter: extractQuarterReport,
  plusMinus: extractPlusMinusSummary,
  lineupAnalysis: extractLineupAnalysis,
  rotationsSummary: extractRotationsSummary,
  playByPlay: extractPlayByPlay,
  scoreSheet: extractScoreSheet,
};

// Bulk-import Box Score PDFs (standalone or merged 10-report exports --
// both work, since only the Box Score's own pages carry the
// "Assistant Coach(es):" markers this extractor looks for). Each file's
// own header (team names, score, date, game number) is parsed to
// auto-create or match a game record, so a whole season's worth of PDFs
// can be dropped in at once without manually creating each match first.
// Re-running this on the same files (e.g. to catch the current season up
// to where it stands) is safe: an existing game for the same two teams
// on the same date is reused rather than duplicated, and that game's
// stats are replaced with the fresh extraction rather than appended.
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

        const homeTeamId = gameInfo.homeTeam;
        const awayTeamId = gameInfo.awayTeam;

        await db.prepare('INSERT INTO teams (id, name) VALUES (?, ?) ON CONFLICT (id) DO NOTHING').run(homeTeamId, homeTeamId);
        await db.prepare('INSERT INTO teams (id, name) VALUES (?, ?) ON CONFLICT (id) DO NOTHING').run(awayTeamId, awayTeamId);
        if (seasonId) {
          await db.prepare('INSERT INTO seasons (id, name) VALUES (?, ?) ON CONFLICT (id) DO NOTHING').run(seasonId, seasonId);
        }

        let game = await db.prepare(`
          SELECT * FROM games WHERE home_team_id = ? AND opponent_team_id = ? AND game_date = ?
        `).get(homeTeamId, awayTeamId, gameInfo.matchDate);

        let created = false;
        if (!game) {
          const insertGame = await db.prepare(`
            INSERT INTO games (season_id, league_id, home_team_id, opponent_team_id, game_date, created_by, status)
            VALUES (?, ?, ?, ?, ?, ?, 'extracted')
            RETURNING id
          `).run(seasonId || null, leagueId || null, homeTeamId, awayTeamId, gameInfo.matchDate, req.user.id);
          game = await db.prepare('SELECT * FROM games WHERE id = ?').get(insertGame.lastInsertRowid);
          created = true;
        }

        const insertReport = await db.prepare(`
          INSERT INTO reports (game_id, report_type, original_filename, storage_path, uploaded_by, extraction_status)
          VALUES (?, 'Box Score', ?, ?, ?, 'extracted')
          RETURNING id
        `).run(game.id, file.originalname, file.path, req.user.id);

        // Replace, don't accumulate: clears out any earlier extraction for
        // this game before inserting the fresh one, so re-running the
        // bulk import never double-counts stats.
        await db.prepare('DELETE FROM player_game_stats WHERE game_id = ?').run(game.id);
        for (const p of players) {
          await insertStatStmt.run(
            game.id, p.player_name, p.team_side, p.minutes, p.points, p.fgm, p.fga,
            p.three_pm, p.three_pa, p.ftm, p.fta, p.oreb, p.dreb, p.reb,
            p.assists, p.steals, p.blocks, p.turnovers, p.fouls, p.plus_minus,
            JSON.stringify(p),
          );
        }

        // Run the additional report-type extractors against this same file,
        // now that a game.id exists to attach them to. Each is independent:
        // extraction failure or storage failure for one report type doesn't
        // block the Box Score import that already succeeded, or the others.
        entry.additionalReports = {};
        for (const [key, extractorFn] of Object.entries(extraExtractors)) {
          try {
            // gameInfo.homeTeam is already validated non-null above (line 88)
            // before this point is reachable -- passing it lets each
            // extractor match team_side to the actual home team instead of
            // guessing from print order (see teamSide.js). Extractors that
            // don't take a second argument (playByPlay, scoreSheet) simply
            // ignore the extra param.
            const extracted = await extractorFn(file.path, gameInfo.homeTeam);
            const { rows, teamRows, playerRows } = await insertReportData[key](game.id, extracted);
            entry.additionalReports[key] = {
              status: 'stored',
              rows: rows ?? (teamRows !== undefined ? { teamRows, playerRows } : undefined),
            };
          } catch (extraErr) {
            entry.additionalReports[key] = { status: 'failed', error: extraErr.message, code: extraErr.code };
          }
        }

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