import test from 'node:test';
import assert from 'node:assert/strict';

const createLocalStorage = () => {
  const store = new Map();
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
  };
};

global.localStorage = createLocalStorage();

const { createMatch, updateMatch, saveMatchRoster, setLiveMatchState, getMatches } = await import('./matchService.js');

test('createMatch persists a new match and updateMatch changes its status', () => {
  localStorage.clear();
  const match = createMatch({ homeTeam: 'USIU', awayTeam: 'KCA', league: 'Nairobi Cup', season: '2026/27', institution: 'USIU', venue: 'USIU Arena', matchDate: '2026-08-10', tipOffTime: '19:00', competitionStage: 'Quarterfinal', status: 'Scheduled' });
  assert.equal(match.homeTeam, 'USIU');
  let matches = getMatches();
  assert.equal(matches.length, 1);
  updateMatch(match.id, { status: 'Live' });
  matches = getMatches();
  assert.equal(matches[0].status, 'Live');
});

test('saveMatchRoster and setLiveMatchState persist roster and live data', () => {
  localStorage.clear();
  const match = createMatch({ homeTeam: 'USIU', awayTeam: 'Strathmore', league: 'Nairobi Cup', season: '2026/27', institution: 'USIU', venue: 'USIU Arena', matchDate: '2026-08-11', tipOffTime: '19:00', competitionStage: 'Semi Final', status: 'Scheduled' });
  saveMatchRoster(match.id, [{ id: 'p1', name: 'Asha', startingFive: true }, { id: 'p2', name: 'Mina', startingFive: false }]);
  setLiveMatchState(match.id, { scoreboard: { home: 54, away: 52 }, quarter: 'Q2', gameClock: '08:20', possession: 'Away', teamFouls: { home: 4, away: 3 }, timeouts: { home: 1, away: 0 }, paused: false });
  const matches = getMatches();
  assert.equal(matches[0].roster.length, 2);
  assert.equal(matches[0].liveState.scoreboard.home, 54);
});
