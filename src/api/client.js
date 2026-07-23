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

async function request(path, { method = 'GET', body, isForm = false } = {}) {
  const token = await getServiceToken();
  const headers = { Authorization: `Bearer ${token}` };
  if (!isForm) headers['Content-Type'] = 'application/json';

  let res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    // Token expired — clear and retry once with a fresh login.
    window.localStorage.removeItem(TOKEN_KEY);
    const freshToken = await getServiceToken();
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
  createGame: (payload) => request('/games', { method: 'POST', body: payload }),
  getGame: (id) => request(`/games/${id}`),
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
};
