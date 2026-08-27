// Bridges the app's localStorage match/team/player data to the real
// backend's Box Score extraction + metrics + AI narrative pipeline, then
// writes the result back in the exact shape analysisService.js already
// produces — so analysis.jsx, opponent-analysis.jsx, and the dashboard
// don't need to change at all.

import { backendApi } from '../api/client';
import { getAnalysisEntries, getImportedReports } from './analysisService';

const GAME_MAP_KEY = 'courtiq-backend-game-map';
const ANALYSIS_STORAGE_KEY = 'courtiq-analysis';
const REPORT_STORAGE_KEY = 'courtiq-imported-reports';

export function readGameMap() {
  try {
    return JSON.parse(window.localStorage.getItem(GAME_MAP_KEY) || '{}');
  } catch {
    return {};
  }
}

export function writeGameMap(map) {
  window.localStorage.setItem(GAME_MAP_KEY, JSON.stringify(map));
}

// Create (or reuse) a backend game record for a given localStorage match.
async function ensureBackendGame(match) {
  const map = readGameMap();
  if (map[match.id]) return map[match.id];

  const game = await backendApi.createGame({
    homeTeamId: match.homeTeam,
    opponentTeamId: match.awayTeam,
    seasonId: match.season || undefined,
    gameDate: match.matchDate || new Date().toISOString().slice(0, 10),
  });

  map[match.id] = game.id;
  writeGameMap(map);
  return game.id;
}

function matchPlayerName(extractedName, rosterPlayers) {
  const normalized = extractedName.trim().toLowerCase();
  return rosterPlayers.find((p) => (p.fullName || '').trim().toLowerCase() === normalized) || null;
}

// Convert the backend's real metrics payload into the same shape
// analysisService.createAnalysisForMatch() already produces, so existing
// pages don't need rewriting.
export function buildAnalysisFromRealMetrics({ matchId, metrics, insightTags, narrative, players, reportMeta, additionalReports }) {
  const home = metrics.home;

  const teamSummary = {
    points: home.points,
    fgPct: home.raw.fga ? Number((home.raw.fgm / home.raw.fga).toFixed(3)) : 0,
    threePtPct: home.raw.three_pa ? Number((home.raw.three_pm / home.raw.three_pa).toFixed(3)) : 0,
    ftPct: home.raw.fta ? Number((home.raw.ftm / home.raw.fta).toFixed(3)) : 0,
    rebounds: home.raw.reb,
    assists: home.raw.assists,
    turnovers: home.raw.turnovers,
    steals: home.raw.steals,
    blocks: home.raw.blocks,
    // Real, computed from game_rotation_stints (Step 26 investigation +
    // implementation) -- backend/src/routes/analysis.js's compute route
    // attaches this onto home/opponent directly. null means Rotation
    // Summary hasn't been extracted for this game yet, not a fabricated
    // placeholder -- a real, honest "no data" distinct from a real,
    // computed 0.
    benchPoints: home.benchPoints ?? null,
    // Real, computed from game_play_by_play's own literal FIBA "fast
    // break" wording (Step 26 investigation + implementation) --
    // analysis.js's compute route attaches this onto home/opponent the
    // same way as benchPoints above. null means Play-by-Play hasn't been
    // extracted for this game yet, not a fabricated placeholder.
    fastBreakPoints: home.fastBreakPoints ?? null,
    paintPoints: null,      // needs Shot Areas (not yet parsed -- no real extractor exists for this report type at all, unlike Rotation Summary/Play-by-Play above)
    secondChancePoints: null,
    fouls: home.raw.fouls,
    // Real, backend-computed fields not in the old fabricated shape —
    // kept alongside so pages can be upgraded to show them directly.
    trueShootingPct: home.trueShootingPct,
    effectiveFgPct: home.effectiveFgPct,
    pointsPerPossession: home.pointsPerPossession,
    turnoverRatePct: home.turnoverRatePct,
    offensiveReboundPct: home.offensiveReboundPct,
    fourFactors: home.fourFactors,
  };

  const playerAnalysis = metrics.players
    .map((p, index) => {
      const rosterMatch = players ? matchPlayerName(p.playerName, players) : null;
      return {
        id: rosterMatch?.id || `extracted-${index}-${p.playerName.replace(/\s+/g, '-')}`,
        fullName: p.playerName,
        position: rosterMatch?.position || '',
        ppg: p.points,
        rpg: p.reboundsTotal,
        apg: p.assists,
        spg: null,
        bpg: null,
        minutes: null,
        per: null,
        efficiency: null,
        trueShooting: p.trueShootingPct,
        usageRate: null,
        plusMinus: p.plusMinus,
        trend: null,
        strengths: [],
        weaknesses: [],
        areasToImprove: [],
        recentForm: null,
        consistencyRating: null,
        developmentProgress: null,
      };
    });

  const strengths = insightTags.filter((t) => t.team === 'home').map((t) => t.tag);
  const weaknesses = insightTags.filter((t) => t.team === 'opponent').map((t) => `Opponent: ${t.tag}`);
  const recommendations = narrative ? [] : [];

  const analysis = {
    id: `analysis-${Date.now()}`,
    matchId,
    createdAt: new Date().toISOString(),
    reports: [reportMeta],
    teamSummary,
    playerAnalysis,
    strengths,
    weaknesses,
    recommendations,
    narrative: narrative || null,
    isRealExtraction: true, // flag so the UI can distinguish real vs simulated
    opponentAnalysis: null,
    // Extra FIBA report types beyond Box Score (Quarter, Plus/Minus,
    // Lineup Analysis, Rotations Summary, etc.), when the uploaded PDF
    // was a merged multi-report export and those extractors succeeded.
    // Shape: { quarter, plusMinus, lineupAnalysis, rotationsSummary }.
    additionalReports: additionalReports || null,
  };

  const entries = getAnalysisEntries().filter((entry) => entry.matchId !== matchId);
  entries.push(analysis);
  window.localStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(entries));

  const reportRecord = {
    id: `report-${Date.now()}`,
    name: reportMeta.name,
    type: reportMeta.type,
    uploadedAt: new Date().toLocaleString(),
    matchId,
    isRealExtraction: true,
  };
  const reports = [...getImportedReports(), reportRecord];
  window.localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(reports));

  return { analysis, reportRecord };
}

// The main entry point: upload a real Box Score PDF for a match, extract
// it, compute real metrics, generate an AI narrative, and persist an
// analysis entry in the same shape the rest of the app expects.
export async function importRealBoxScore({ match, file, players, withNarrative = true }) {
  const gameId = await ensureBackendGame(match);

  const uploadResult = await backendApi.uploadReport(gameId, 'Box Score', file);
  if (uploadResult.error) {
    const err = new Error(uploadResult.error);
    err.data = uploadResult;
    throw err;
  }

  const computeResult = await backendApi.computeMetrics(gameId);

  let narrative = null;
  if (withNarrative) {
    try {
      const narrativeResult = await backendApi.generateNarrative(gameId);
      narrative = narrativeResult.narrative;
    } catch (err) {
      // Narrative generation is best-effort — a missing/invalid API key on
      // the backend shouldn't block showing the real computed metrics.
      narrative = null;
    }
  }

  return buildAnalysisFromRealMetrics({
    matchId: match.id,
    metrics: computeResult.metrics,
    insightTags: computeResult.insightTags || [],
    narrative,
    players,
    reportMeta: {
      name: file.name,
      type: 'Box Score',
      playersExtracted: uploadResult.extraction?.playersExtracted,
    },
  });
}