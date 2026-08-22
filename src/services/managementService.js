const LEAGUE_STORAGE_KEY = 'courtiq-leagues';
const SEASON_STORAGE_KEY = 'courtiq-seasons';
const TEAM_STORAGE_KEY = 'courtiq-teams';
const PLAYER_STORAGE_KEY = 'courtiq-players';

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
  if (!storage) {
    return fallback;
  }

  try {
    const storedValue = storage.getItem(key);
    return storedValue ? JSON.parse(storedValue) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(key, JSON.stringify(value));
}

export function getTeams() {
  return readStorage(TEAM_STORAGE_KEY, []);
}

export function createTeam(data) {
  const teams = getTeams();
  const team = {
    id: data.id || `team-${Date.now()}`,
    name: data.name,
    category: data.category || 'Men',
    gender: data.gender || 'Men',
    primaryColour: data.primaryColour || '#ff7a1a',
    secondaryColour: data.secondaryColour || '#38bdf8',
    logo: data.logo || 'placeholder',
    league: data.league || '',
    season: data.season || '',
    coach: data.coach || '',
    teamManager: data.teamManager || '',
    statistician: data.statistician || '',
    institution: data.institution || '',
    roster: data.roster || [],
    createdAt: new Date().toISOString(),
  };

  teams.push(team);
  writeStorage(TEAM_STORAGE_KEY, teams);
  return team;
}

export function updateTeam(teamId, updates) {
  const teams = getTeams().map((team) => (team.id === teamId ? { ...team, ...updates } : team));
  writeStorage(TEAM_STORAGE_KEY, teams);
  return teams;
}

export function getLeagues() {
  return readStorage(LEAGUE_STORAGE_KEY, []);
}

export function createLeague(data) {
  const leagues = getLeagues();
  const league = {
    id: data.id || `league-${Date.now()}`,
    name: data.name,
    category: data.category || 'Open',
    season: data.season || '',
    description: data.description || '',
    archived: false,
    createdAt: new Date().toISOString(),
  };

  leagues.push(league);
  writeStorage(LEAGUE_STORAGE_KEY, leagues);
  return league;
}

export function updateLeague(leagueId, updates) {
  const leagues = getLeagues().map((league) => (league.id === leagueId ? { ...league, ...updates } : league));
  writeStorage(LEAGUE_STORAGE_KEY, leagues);
  return leagues;
}

export function archiveLeague(leagueId) {
  return updateLeague(leagueId, { archived: true });
}

export function deleteLeague(leagueId) {
  const leagues = getLeagues().filter((league) => league.id !== leagueId);
  writeStorage(LEAGUE_STORAGE_KEY, leagues);
  return leagues;
}

export function getSeasons() {
  return readStorage(SEASON_STORAGE_KEY, []);
}

export function createSeason(data) {
  const seasons = getSeasons();
  const season = {
    id: data.id || `season-${Date.now()}`,
    name: data.name,
    active: !seasons.length,
    archived: false,
    createdAt: new Date().toISOString(),
  };

  seasons.push(season);
  writeStorage(SEASON_STORAGE_KEY, seasons);
  return season;
}

export function setActiveSeason(seasonId) {
  const seasons = getSeasons().map((season) => ({ ...season, active: season.id === seasonId }));
  writeStorage(SEASON_STORAGE_KEY, seasons);
  return seasons;
}

export function archiveSeason(seasonId) {
  const seasons = getSeasons().map((season) => (season.id === seasonId ? { ...season, archived: true, active: false } : season));
  writeStorage(SEASON_STORAGE_KEY, seasons);
  return seasons;
}

export function getPlayers() {
  return readStorage(PLAYER_STORAGE_KEY, []);
}

export function createPlayer(data) {
  const players = getPlayers();
  const player = {
    id: data.id || `player-${Date.now()}`,
    jerseyNumber: data.jerseyNumber || '',
    fullName: data.fullName || '',
    position: data.position || '',
    height: data.height || '',
    weight: data.weight || '',
    age: data.age || '',
    nationality: data.nationality || '',
    dominantHand: data.dominantHand || 'Right',
    status: data.status || 'Active',
    medicalNotes: data.medicalNotes || '',
    emergencyContact: data.emergencyContact || '',
    currentTeam: data.currentTeam || '',
    season: data.season || '',
    photo: data.photo || 'placeholder',
    createdAt: new Date().toISOString(),
  };

  players.push(player);
  writeStorage(PLAYER_STORAGE_KEY, players);
  return player;
}

export function updatePlayer(playerId, updates) {
  const players = getPlayers().map((player) => (player.id === playerId ? { ...player, ...updates } : player));
  writeStorage(PLAYER_STORAGE_KEY, players);
  return players;
}

export function deletePlayer(playerId) {
  const players = getPlayers().filter((player) => player.id !== playerId);
  writeStorage(PLAYER_STORAGE_KEY, players);
  return players;
}
