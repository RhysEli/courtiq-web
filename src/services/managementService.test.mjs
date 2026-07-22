import test from 'node:test';
import assert from 'node:assert/strict';

const createLocalStorage = () => {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
};

global.localStorage = createLocalStorage();

const { createLeague, getLeagues, archiveLeague, createSeason, getSeasons } = await import('./managementService.js');

test('createLeague persists a league and archiveLeague updates it', () => {
  localStorage.clear();

  const league = createLeague({ name: 'Nairobi Cup', category: 'Men', season: '2026/27', description: 'Regional competition' });
  assert.equal(league.name, 'Nairobi Cup');

  let leagues = getLeagues();
  assert.equal(leagues.length, 1);

  archiveLeague(league.id);
  leagues = getLeagues();
  assert.equal(leagues[0].archived, true);
});

test('createSeason stores an active season', () => {
  localStorage.clear();

  const season = createSeason({ name: '2026/27' });
  const seasons = getSeasons();

  assert.equal(season.name, '2026/27');
  assert.equal(seasons[0].active, true);
});
