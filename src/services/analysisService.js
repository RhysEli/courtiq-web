const ANALYSIS_STORAGE_KEY = 'courtiq-analysis';
const REPORT_STORAGE_KEY = 'courtiq-imported-reports';

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }

  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage;
  }

  return null;
}

function readStorage(key, fallback) {
  const storage = getStorage();
  if (!storage) return fallback;
  try {
    const value = storage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(key, JSON.stringify(value));
}

function createTeamSummary(parsedReports) {
  const report = parsedReports[0] || {};
  const summary = report.parsedSummary || {};
  return {
    points: summary.points || 0,
    fgPct: summary.fgPct || 0,
    threePtPct: summary.threePtPct || 0,
    ftPct: summary.ftPct || 0,
    rebounds: summary.rebounds || 0,
    assists: summary.assists || 0,
    turnovers: summary.turnovers || 0,
    steals: summary.steals || 0,
    blocks: summary.blocks || 0,
    benchPoints: summary.benchPoints || 0,
    fastBreakPoints: summary.fastBreakPoints || 0,
    paintPoints: summary.paintPoints || 0,
    secondChancePoints: summary.secondChancePoints || 0,
    fouls: summary.fouls || 0,
  };
}

function createPlayerAnalysis(players, summary) {
  return players.map((player, index) => {
    const ppg = Math.max(8, Math.round((summary.points / Math.max(1, players.length)) * 0.8 + index * 2));
    const rpg = Math.max(2, Math.round((summary.rebounds / Math.max(1, players.length)) * 0.7 + index));
    const apg = Math.max(1, Math.round((summary.assists / Math.max(1, players.length)) * 0.8 + index * 0.3));
    const spg = Math.max(0.5, Number((summary.steals / Math.max(1, players.length * 2)).toFixed(1)) + index * 0.1);
    const bpg = Math.max(0.2, Number((summary.blocks / Math.max(1, players.length * 3)).toFixed(1)) + index * 0.05);
    const minutes = 24 + index * 4;
    const per = Number((22 + ppg * 0.7 + rpg * 0.5 + apg * 0.4).toFixed(1));
    const efficiency = Number(((summary.points / Math.max(1, summary.turnovers + 1)) * 10).toFixed(1));
    const trueShooting = Number(((summary.points / (2 * (summary.points + 0.44 * summary.fouls + 1))).toFixed(2)));
    const usageRate = Number((22 + index).toFixed(1));
    const plusMinus = summary.points - summary.turnovers + index * 2;
    return {
      id: player.id,
      fullName: player.fullName,
      position: player.position || 'G',
      ppg,
      rpg,
      apg,
      spg,
      bpg,
      minutes,
      per,
      efficiency,
      trueShooting,
      usageRate,
      plusMinus,
      trend: ppg > 20 ? 'Rising' : 'Steady',
      strengths: ppg > 20 ? ['Shot creation', 'Ball movement'] : ['Defensive effort'],
      weaknesses: summary.turnovers > 10 ? ['Turnover risk'] : ['Consistency'],
      areasToImprove: summary.ftPct < 0.75 ? ['Free throw consistency'] : ['Shot selection'],
      recentForm: 'Improving',
      consistencyRating: 78 + index,
      developmentProgress: 'On track',
    };
  });
}

function createStrengthsAndWeaknesses(summary) {
  const strengths = [];
  const weaknesses = [];
  const recommendations = [];

  if (summary.threePtPct >= 0.38) strengths.push('Excellent perimeter shooting');
  if (summary.rebounds >= 40) strengths.push('Strong rebounding');
  if (summary.assists >= 18) strengths.push('High assist ratio');
  if (summary.fastBreakPoints >= 10) strengths.push('Good transition offense');
  if (summary.benchPoints >= 20) strengths.push('Strong bench contribution');
  if (summary.turnovers <= 12) strengths.push('Excellent defensive pressure');
  if (summary.turnovers <= 12) strengths.push('Low turnover rate');

  if (summary.ftPct < 0.75) weaknesses.push('Poor free throw shooting');
  if (summary.paintPoints < 24) weaknesses.push('Weak interior defense');
  if (summary.rebounds < 36) weaknesses.push('Poor rebounding');
  if (summary.turnovers > 14) weaknesses.push('Too many turnovers');
  if (summary.fastBreakPoints < 8) weaknesses.push('Poor transition defense');
  if (summary.benchPoints < 16) weaknesses.push('Weak bench production');
  if (summary.points < 75) weaknesses.push('Poor shot selection');

  if (summary.rebounds < 36) recommendations.push('Improve defensive rebounding');
  if (summary.turnovers > 14) recommendations.push('Reduce turnovers');
  if (summary.ftPct < 0.75) recommendations.push('Improve free throw consistency');
  if (summary.paintPoints < 24) recommendations.push('Attack the paint more');
  if (summary.fastBreakPoints < 8) recommendations.push('Improve transition defense');
  if (summary.assists < 15) recommendations.push('Increase ball movement');
  if (summary.benchPoints < 16) recommendations.push('Develop bench scoring');

  return {
    strengths: strengths.slice(0, 4),
    weaknesses: weaknesses.slice(0, 4),
    recommendations: recommendations.slice(0, 4),
  };
}

export function createAnalysisForMatch(matchId, reports, players) {
  const summary = createTeamSummary(reports);
  const playerAnalysis = createPlayerAnalysis(players, summary);
  const { strengths, weaknesses, recommendations } = createStrengthsAndWeaknesses(summary);
  const analysis = {
    id: `analysis-${Date.now()}`,
    matchId,
    createdAt: new Date().toISOString(),
    reports: reports.map((report) => ({ name: report.name, type: report.type, uploadedAt: new Date().toLocaleString() })),
    teamSummary: summary,
    playerAnalysis,
    strengths,
    weaknesses,
    recommendations,
    opponentAnalysis: null,
  };
  const entries = getAnalysisEntries().filter((entry) => entry.matchId !== matchId);
  entries.push(analysis);
  writeStorage(ANALYSIS_STORAGE_KEY, entries);
  writeStorage(REPORT_STORAGE_KEY, reports);
  return analysis;
}

export function getAnalysisEntries() {
  return readStorage(ANALYSIS_STORAGE_KEY, []);
}

export function getImportedReports() {
  return readStorage(REPORT_STORAGE_KEY, []);
}

export function saveImportedReport(report) {
  const reports = [...getImportedReports(), report];
  writeStorage(REPORT_STORAGE_KEY, reports);
  return reports;
}

export function generateOpponentAnalysis(matches, selectedMatchId) {
  const selected = matches.find((match) => match.id === selectedMatchId);
  const comparisons = matches
    .filter((match) => match.id !== selectedMatchId)
    .map((match) => ({
      id: match.id,
      name: `${match.homeTeam} vs ${match.awayTeam}`,
      scoring: match.teamSummary?.points || 0,
      defense: match.teamSummary?.defense || 0,
      rebounding: match.teamSummary?.rebounds || 0,
      turnovers: match.teamSummary?.turnovers || 0,
      benchProduction: match.teamSummary?.benchPoints || 0,
      threePointShooting: match.teamSummary?.threePtPct || 0,
      paintScoring: match.teamSummary?.paintPoints || 0,
      fastBreakPoints: match.teamSummary?.fastBreakPoints || 0,
      pace: match.teamSummary?.pace || 0,
    }));
  const recommendations = [];
  if (selected?.teamSummary?.turnovers > 12) recommendations.push('Press the ball to force turnovers');
  if (selected?.teamSummary?.rebounds < 38) recommendations.push('Target the glass harder');
  if (selected?.teamSummary?.threePtPct < 0.36) recommendations.push('Close out harder on shooters');
  return { selectedMatchId, comparisons, recommendations };
}
