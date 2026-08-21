const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { extractBoxScore } = require('../services/pdfExtraction');
const { parseFileToLines } = require('../services/pdfText');
const {
  extractQuarterReport,
  extractPlusMinusSummary,
  extractLineupAnalysis,
  extractRotationsSummary,
  extractPlayByPlay,
} = require('../services/reportExtractors');
const { extractScoreSheet } = require('../services/parseScoreSheet');
const { persistAdditionalReports } = require('../services/persistExtractedReports');
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
        // Parsed once and reused across the box score + all 6 additional
        // extractors below -- each was independently re-reading and
        // re-parsing this same PDF from disk (7 full parses per file),
        // which was the dominant cost in a slow bulk import.
        const lines = await parseFileToLines(file.path);
        const { players, gameInfo, unparsedLineCount } = await extractBoxScore(file.path, lines);

        if (!gameInfo || !gameInfo.homeTeam || !gameInfo.awayTeam || !gameInfo.matchDate) {
          entry.status = 'failed';
          entry.error = 'Could not read team names and date from this PDF\'s header. '
            + 'It may not be a FIBA Box Score report, or the header layout is different from what this parser expects.';
          results.push(entry);
          await logAction(req.user.id, 'upload', `Bulk import: ${file.originalname} (unreadable header)`, false);
          continue;
        }

        entry.additionalReports = {};
        for (const [key, extractorFn] of Object.entries(extraExtractors)) {
          try {
            entry.additionalReports[key] = await extractorFn(file.path, gameInfo.homeTeam, lines);
          } catch (extraErr) {
            entry.additionalReports[key] = { error: extraErr.message, code: extraErr.code };
          }
        }

        const homeTeamId = gameInfo.homeTeam;
        const awayTeamId = gameInfo.awayTeam;

        // Checked against the two team-name strings straight off the PDF,
        // before either side is written to `teams` -- deliberately no DB
        // lookup here, so a brand-new opponent team (not yet a row) never
        // needs its own access grant; the check only cares whether ONE of
        // the two named sides is already a team this user belongs to (see
        // requireGameAccess's comment in middleware/auth.js for the same
        // "either side" reasoning at the single-game level). Per-file, not
        // route-level: one batch can contain PDFs for several different
        // games, so a file for a team the caller has no access to is
        // skipped on its own rather than failing the whole batch.
        if (req.user.role !== 'Administrator') {
          const accessibleTeamIds = req.user.teamIds || [];
          if (!accessibleTeamIds.includes(homeTeamId) && !accessibleTeamIds.includes(awayTeamId)) {
            entry.status = 'failed';
            entry.error = `You do not have access to either team in this game (${gameInfo.homeTeam} vs ${gameInfo.awayTeam}).`;
            results.push(entry);
            await logAction(req.user.id, 'upload', `Bulk import: ${file.originalname} (no access to ${homeTeamId}/${awayTeamId})`, false);
            continue;
          }
        }

        await db.prepare('INSERT INTO teams (id, name) VALUES (?, ?) ON CONFLICT (id) DO NOTHING').run(homeTeamId, homeTeamId);
        await db.prepare('INSERT INTO teams (id, name) VALUES (?, ?) ON CONFLICT (id) DO NOTHING').run(awayTeamId, awayTeamId);
        if (seasonId) {
          await db.prepare('INSERT INTO seasons (id, name) VALUES (?, ?) ON CONFLICT (id) DO NOTHING').run(seasonId, seasonId);
        }

        // Date-tolerant match: a game manually entered on the Games page and
        // the same game's PDF uploaded later via Bulk Import can disagree by
        // a day (e.g. a typo, or a tip-off past midnight) without actually
        // being two different games. game_date is stored as TEXT but is
        // always an ISO 'YYYY-MM-DD' string (both the manual date picker and
        // pdfExtraction.js's isoDate produce that format), so a ::date cast
        // gives a real day-difference comparison here.
        const candidates = await db.prepare(`
          SELECT * FROM games
          WHERE home_team_id = ? AND opponent_team_id = ?
            AND ABS(game_date::date - ?::date) <= 1
        `).all(homeTeamId, awayTeamId, gameInfo.matchDate);

        let game = null;
        if (candidates.length === 1) {
          game = candidates[0];
        } else if (candidates.length > 1) {
          // Ambiguous -- more than one existing game for this matchup falls
          // within the tolerance window. Don't guess: fall back to an exact
          // date match only, and if even that doesn't resolve it uniquely,
          // fall through to creating a new game record. A safe duplicate
          // beats silently merging into the wrong one of two real games
          // these teams legitimately played twice.
          game = candidates.find((g) => g.game_date === gameInfo.matchDate) || null;
        }

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

        await db.prepare('DELETE FROM player_game_stats WHERE game_id = ?').run(game.id);
        for (const p of players) {
          await insertStatStmt.run(
            game.id, p.player_name, p.team_side, p.minutes, p.points, p.fgm, p.fga,
            p.three_pm, p.three_pa, p.ftm, p.fta, p.oreb, p.dreb, p.reb,
            p.assists, p.steals, p.blocks, p.turnovers, p.fouls, p.plus_minus,
            JSON.stringify(p),
          );
        }

        // Replaces entry.additionalReports (previously the raw per-extractor
        // output) with the persistence summary -- {status, rows} per report
        // type -- which is the shape the frontend has always expected.
        entry.additionalReports = await persistAdditionalReports(game.id, entry.additionalReports);

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
        await logAction(req.user.id, 'upload', `Bulk import: ${file.originalname} -> game #${game.id} (${entry.status})`, true);
      } catch (err) {
        entry.status = 'failed';
        entry.error = err.message;
        entry.code = err.code;
        results.push(entry);
        await logAction(req.user.id, 'upload', `Bulk import: ${file.originalname} (${err.message})`, false);
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