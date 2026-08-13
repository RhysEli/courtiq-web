// Client for the real CourtIQ backend (Express/SQLite/Claude API).
// This is intentionally separate from the app's own localStorage-based
// auth/data layer (authService.js, managementService.js, etc.) — those
// stay as-is. This client is used only by the real analysis pipeline
// (Box Score upload -> extraction -> metrics -> AI narrative).

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// The app's own login system (authService.js) is a separate, localStorage
// based multi-tenant system that doesn't share users with the backend.
// Rather than requiring every CourtIQ user to also have a backend account,
// all real-analysis API calls run under one shared "service" credential.
// This is a deliberate simplification — see README section
// "Two auth systems" for the follow-up needed to unify them.
const SERVICE_EMAIL = 'stats@courtiq.dev';
const SERVICE_PASSWORD = 'courtiq123';
const TOKEN_KEY = 'courtiq-backend-token';

// Real per-user token, set by authService.loginUser() when someone signs in
// with real backend credentials (e.g. an account created via the invite
// flow). When present, this is used instead of the shared service account,
// so API calls carry the actual logged-in person's real role/team and the
// backend's existing requireRole/requireAuth checks apply for real. Falls
// back to the shared service token for anyone still on the local demo
// accounts, so those keep working exactly as before.
const USER_TOKEN_KEY = 'courtiq-user-token';

async function getServiceToken() {
  const cached = window.localStorage.getItem(TOKEN_KEY);
  if (cached) return cached;

  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: SERVICE_EMAIL, password: SERVICE_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error('Could not reach the CourtIQ backend for real analysis. Is it running on ' + BASE_URL + '?');
  }
  const data = await res.json();
  window.localStorage.setItem(TOKEN_KEY, data.token);
  return data.token;
}

async function getAuthToken() {
  const userToken = window.localStorage.getItem(USER_TOKEN_KEY);
  if (userToken) return userToken;
  return getServiceToken();
}

async function request(path, { method = 'GET', body, isForm = false } = {}) {
  const token = await getAuthToken();
  const headers = { Authorization: `Bearer ${token}` };
  if (!isForm) headers['Content-Type'] = 'application/json';

  let res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    // Whichever token we used is missing/expired -- clear just that one
    // and retry once with a fresh token from the same source.
    const usedUserToken = Boolean(window.localStorage.getItem(USER_TOKEN_KEY));
    if (usedUserToken) {
      window.localStorage.removeItem(USER_TOKEN_KEY);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
    }
    const freshToken = await getAuthToken();
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { ...headers, Authorization: `Bearer ${freshToken}` },
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    });
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const message = data?.error || `Request failed with status ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const backendApi = {
  // Real per-user login against the backend `users` table. No token needed
  // for this call itself -- it's how one is obtained.
  login: ({ email, password }) => fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then((r) => {
    if (!r.ok) {
      return r.json().then((data) => {
        throw new Error(data.error || 'Invalid email or password.');
      });
    }
    return r.json();
  }),
  createGame: (payload) => request('/games', { method: 'POST', body: payload }),
  getGames: () => request('/games'),
  getGame: (id) => request(`/games/${id}`),
  getAnnotations: (gameId) => request(`/annotations?gameId=${gameId}`),
  addAnnotation: (gameId, body) => request('/annotations', { method: 'POST', body: { gameId, body } }),
  bulkImport: (files, { seasonId, leagueId } = {}) => {
    const form = new FormData();
    files.forEach((file) => form.append('files', file));
    if (seasonId) form.append('seasonId', seasonId);
    if (leagueId) form.append('leagueId', leagueId);
    return request('/games/bulk-import', { method: 'POST', body: form, isForm: true });
  },
  uploadReport: (gameId, reportType, file) => {
    const form = new FormData();
    form.append('reportType', reportType);
    form.append('file', file);
    return request(`/games/${gameId}/reports`, { method: 'POST', body: form, isForm: true });
  },
  computeMetrics: (gameId) => request(`/analysis/games/${gameId}/compute`, { method: 'POST' }),
  generateNarrative: (gameId) => request(`/analysis/games/${gameId}/narrative`, { method: 'POST' }),
  sendInviteEmail: (payload) => request('/invites/send', { method: 'POST', body: payload }),
  listInvites: () => request('/invites'),
  revokeInvite: (token) => request(`/invites/${token}/revoke`, { method: 'POST' }),
  // Public endpoints -- the invited person isn't logged in yet, so these
  // don't go through the normal authenticated request() flow.
  getInvite: (token) => fetch(`${BASE_URL}/invites/${token}`).then((r) => {
    if (!r.ok) return r.json().then((body) => { throw new Error(body.error || 'Invite not found'); });
    return r.json();
  }),
  acceptInvite: (token, payload) => fetch(`${BASE_URL}/invites/${token}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((r) => {
    if (!r.ok) return r.json().then((body) => { throw new Error(body.error || 'Could not accept invite'); });
    return r.json();
  }),
  // NEW: real Opponent Analysis data -- lists every team with real games in
  // the system (not scoped to "my team"), and per-team season-aggregate
  // stats (team + per-player averages) computed from actual extracted
  // player_game_stats rows, no random/placeholder fallbacks.
  getTeams: () => request('/teams'),
  getTeamSeasonStats: (teamId) => request(`/teams/${teamId}/season-stats`),
  getPlayerDevelopment: (teamId, playerName) => request(`/teams/${teamId}/players/${encodeURIComponent(playerName)}/development`),
};