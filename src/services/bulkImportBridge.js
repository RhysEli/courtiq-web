// Bridges bulk-imported backend games (created directly from PDF headers,
// with no localStorage match to begin with) into the app's own match list,
// so they actually show up on the Games page instead of only existing in
// the backend database. This is the gap the analysis-import flow doesn't
// have (there, a match already exists before you upload a report) but
// bulk-import does, since it can create brand-new games from a folder of
// PDFs with no match set up ahead of time.

import { backendApi } from '../api/client';
import { createMatch, getMatches, updateMatch } from './matchService';
import { readGameMap, writeGameMap, buildAnalysisFromRealMetrics } from './realAnalysisBridge';

function findMatchByBackendGameId(gameId) {
  const map = readGameMap();
  const matchId = Object.keys(map).find((key) => map[key] === gameId);
  if (!matchId) return null;
  return getMatches().find((match) => match.id === matchId) || null;
}

// Runs after bulk-import: for each successfully imported/matched backend
// game, ensure a local match exists (create one if this game was newly
// discovered from a PDF), then compute real metrics and, best-effort,
// an AI narrative, writing an analysis entry in the same shape the rest
// of the UI already expects.
export async function reconcileBulkImportResults(results, { withNarrative = true } = {}) {
  const outcomes = [];

  for (const entry of results) {
    if (entry.status === 'failed') {
      outcomes.push({ ...entry, matchId: null, analyzed: false });
      continue;
    }

    let match = findMatchByBackendGameId(entry.gameId);
    if (!match) {
      match = createMatch({
        homeTeam: entry.homeTeam,
        awayTeam: entry.awayTeam,
        matchDate: entry.matchDate,
        status: 'Completed',
      });
      const map = readGameMap();
      map[match.id] = entry.gameId;
      writeGameMap(map);
    }

    try {
      const computeResult = await backendApi.computeMetrics(entry.gameId);
      let narrative = null;
      if (withNarrative) {
        try {
          const narrativeResult = await backendApi.generateNarrative(entry.gameId);
          narrative = narrativeResult.narrative;
        } catch {
          narrative = null; // best-effort — missing API key etc. shouldn't block the metrics
        }
      }

      const { analysis, reportRecord } = buildAnalysisFromRealMetrics({
        matchId: match.id,
        metrics: computeResult.metrics,
        insightTags: computeResult.insightTags || [],
        narrative,
        players: null,
        reportMeta: { name: entry.filename, type: 'Box Score', playersExtracted: entry.playersExtracted },
        additionalReports: entry.additionalReports || null,
      });

      updateMatch(match.id, {
        importedReports: [...(match.importedReports || []), reportRecord.id],
        analysisIds: [...(match.analysisIds || []), analysis.id],
      });

      outcomes.push({ ...entry, matchId: match.id, analyzed: true, narrativeGenerated: Boolean(narrative) });
    } catch (err) {
      outcomes.push({ ...entry, matchId: match.id, analyzed: false, analysisError: err.message });
    }
  }

  return outcomes;
}