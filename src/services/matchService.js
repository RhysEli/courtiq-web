const MATCH_STORAGE_KEY = 'courtiq-matches';
const ROSTER_STORAGE_KEY = 'courtiq-match-rosters';
const LIVE_STORAGE_KEY = 'courtiq-live-matches';

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

function normalizeList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

export function getMatches() {
  return readStorage(MATCH_STORAGE_KEY, []);
}

export function createMatch(payload) {
  const matches = getMatches();
  const match = {
    id: payload.id || `match-${Date.now()}`,
    homeTeam: payload.homeTeam || '',
    awayTeam: payload.awayTeam || '',
    league: payload.league || '',
    season: payload.season || '',
    institution: payload.institution || '',
    venue: payload.venue || '',
    matchDate: payload.matchDate || '',
    tipOffTime: payload.tipOffTime || '',
    competitionStage: payload.competitionStage || 'Regular Season',
    status: payload.status || 'Scheduled',
    roster: payload.roster || [],
    activeRoster: normalizeList(payload.activeRoster || payload.roster || []),
    startingFive: normalizeList(payload.startingFive),
    benchPlayers: normalizeList(payload.benchPlayers),
    injuredPlayers: normalizeList(payload.injuredPlayers),
    unavailablePlayers: normalizeList(payload.unavailablePlayers),
    importedReports: payload.importedReports || [],
    analysisIds: payload.analysisIds || [],
    liveState: payload.liveState || {
      scoreboard: { home: 0, away: 0 },
      quarter: 'Q1',
      gameClock: '10:00',
      possession: payload.homeTeam || 'Home',
      teamFouls: { home: 0, away: 0 },
      timeouts: { home: 0, away: 0 },
      startedAt: null,
      paused: false,
    },
    createdAt: new Date().toISOString(),
  };
  matches.push(match);
  writeStorage(MATCH_STORAGE_KEY, matches);
  writeStorage(ROSTER_STORAGE_KEY, [...readStorage(ROSTER_STORAGE_KEY, []), { matchId: match.id, roster: match.roster }]);
  writeStorage(LIVE_STORAGE_KEY, [...readStorage(LIVE_STORAGE_KEY, []), { matchId: match.id, liveState: match.liveState }]);
  return match;
}

export function updateMatch(matchId, updates) {
  const matches = getMatches().map((match) => (match.id === matchId ? { ...match, ...updates } : match));
  writeStorage(MATCH_STORAGE_KEY, matches);
  return matches;
}

export function deleteMatch(matchId) {
  const matches = getMatches().filter((match) => match.id !== matchId);
  writeStorage(MATCH_STORAGE_KEY, matches);
  return matches;
}

export function archiveMatch(matchId) {
  return updateMatch(matchId, { status: 'Archived' });
}

export function duplicateMatch(matchId) {
  const source = getMatches().find((match) => match.id === matchId);
  if (!source) return null;
  return createMatch({ ...source, id: undefined, status: 'Scheduled' });
}

export function getMatchRosters() {
  return readStorage(ROSTER_STORAGE_KEY, []);
}

export function saveMatchRoster(matchId, roster) {
  const rosters = getMatchRosters().filter((entry) => entry.matchId !== matchId);
  rosters.push({ matchId, roster });
  writeStorage(ROSTER_STORAGE_KEY, rosters);
  const matches = getMatches().map((match) => (match.id === matchId ? { ...match, roster } : match));
  writeStorage(MATCH_STORAGE_KEY, matches);
  return rosters;
}

export function getLiveMatchState(matchId) {
  const states = readStorage(LIVE_STORAGE_KEY, []);
  return states.find((entry) => entry.matchId === matchId)?.liveState || null;
}

export function setLiveMatchState(matchId, liveState) {
  const states = readStorage(LIVE_STORAGE_KEY, []);
  const nextStates = states.filter((entry) => entry.matchId !== matchId);
  nextStates.push({ matchId, liveState });
  writeStorage(LIVE_STORAGE_KEY, nextStates);
  const matches = getMatches().map((match) => (match.id === matchId ? { ...match, liveState } : match));
  writeStorage(MATCH_STORAGE_KEY, matches);
  return liveState;
}

export function getMatchById(matchId) {
  return getMatches().find((match) => match.id === matchId) || null;
}
