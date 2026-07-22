import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map();
const localStorageMock = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
  clear() {
    storage.clear();
  },
};

globalThis.window = { localStorage: localStorageMock };
globalThis.localStorage = localStorageMock;

const { createAnalysisForMatch, getAnalysisEntries, generateOpponentAnalysis } = await import('./analysisService.js');

test('createAnalysisForMatch builds structured team and player analysis', () => {
  const analysis = createAnalysisForMatch('match-1', [
    { name: 'scoresheet.pdf', type: 'Scoresheet PDF', parsedSummary: { points: 84, fgPct: 0.48, threePtPct: 0.41, ftPct: 0.78, rebounds: 42, assists: 18, turnovers: 11, steals: 7, blocks: 4, benchPoints: 26, fastBreakPoints: 12, paintPoints: 30, secondChancePoints: 8, fouls: 17 } },
  ], [
    { id: 'p1', fullName: 'Asha', position: 'PG' },
    { id: 'p2', fullName: 'Njeri', position: 'SF' },
  ]);

  assert.equal(analysis.teamSummary.points, 84);
  assert.equal(analysis.playerAnalysis[0].ppg, 22);
  assert.ok(analysis.strengths.includes('Excellent perimeter shooting'));
  assert.ok(analysis.weaknesses.includes('Poor free throw shooting'));
  assert.ok(analysis.recommendations.includes('Improve defensive rebounding'));
});

test('generateOpponentAnalysis builds comparison data and recommendations', () => {
  const matches = [
    { id: 'm1', homeTeam: 'USIU', awayTeam: 'Strathmore', status: 'Completed', teamSummary: { points: 82, defense: 74, rebounds: 38, turnovers: 12, benchPoints: 20, threePtPct: 0.39, paintPoints: 28, fastBreakPoints: 10, pace: 72 } },
    { id: 'm2', homeTeam: 'USIU', awayTeam: 'KCAU', status: 'Completed', teamSummary: { points: 78, defense: 81, rebounds: 34, turnovers: 15, benchPoints: 16, threePtPct: 0.33, paintPoints: 22, fastBreakPoints: 8, pace: 68 } },
  ];

  const result = generateOpponentAnalysis(matches, 'm1');
  assert.equal(result.comparisons.length, 2);
  assert.ok(result.recommendations.includes('Press the ball to force turnovers'));
});

test('getAnalysisEntries returns persisted analysis entries', () => {
  const entries = getAnalysisEntries();
  assert.ok(Array.isArray(entries));
});
