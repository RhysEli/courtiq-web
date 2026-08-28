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
  deleteGame: (id) => request(`/games/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  getAnnotations: (gameId) => request(`/annotations?gameId=${gameId}`),
  addAnnotation: (gameId, body) => request('/annotations', { method: 'POST', body: { gameId, body } }),
  // FR-09: season-summary annotation scope, same backend table/route as
  // the game-scoped pair above -- keyed by team_competition_season_id,
  // not the raw seasons.id (see backend/src/db/schema.sql's comment on
  // annotations for why).
  getSeasonAnnotations: (teamCompetitionSeasonId) => request(`/annotations?teamCompetitionSeasonId=${teamCompetitionSeasonId}`),
  addSeasonAnnotation: (teamCompetitionSeasonId, body) => request('/annotations', { method: 'POST', body: { teamCompetitionSeasonId, body } }),
  // FR-09: player-profile annotation scope, same backend table/route as
  // the two pairs above -- keyed by playerId, the same stable id
  // player-development.jsx already resolves and queries stats by
  // (Step 16a), not a raw name.
  getPlayerAnnotations: (playerId) => request(`/annotations?playerId=${playerId}`),
  addPlayerAnnotation: (playerId, body) => request('/annotations', { method: 'POST', body: { playerId, body } }),
  bulkImport: (files, { seasonId, competitionId, stageId } = {}) => {
    const form = new FormData();
    files.forEach((file) => form.append('files', file));
    if (seasonId) form.append('seasonId', seasonId);
    if (competitionId) form.append('competitionId', competitionId);
    if (stageId) form.append('stageId', stageId);
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
  // Real, already-computed metrics + narrative for one game (game_metrics/
  // game_narratives), independent of the legacy localStorage-backed
  // analysisEntry the rest of analysis.jsx's page still uses -- narrative
  // is null whenever it hasn't been generated (or generation failed),
  // which is a real, best-effort state (see routes/analysis.js's own
  // narrative route), not an error.
  getGameAnalysis: (gameId) => request(`/analysis/games/${gameId}`),
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
  // Step 9 Round 4: manually pre-register a team (name, optional
  // institutionId/genderCategory) -- separate from bulkImport.js/games.js's
  // existing find-or-create-on-import path, which is unchanged and keeps
  // auto-creating opponent teams the same way it always has.
  createTeam: (data) => request('/teams', { method: 'POST', body: data }),
  // FR-11: configure an existing team's coach/manager/statistician/colours/logo (backend/src/routes/teams.js).
  // Step 9 Round 4: also accepts institutionId/genderCategory now.
  updateTeam: (teamId, data) => request(`/teams/${encodeURIComponent(teamId)}`, { method: 'PATCH', body: data }),
  // Visual overhaul step 1: dedicated brand-identity update (Team Manager
  // only, own team only). No settings UI calls this yet -- added now so
  // the endpoint is actually usable once that UI exists.
  updateTeamBrand: (teamId, data) => request(`/teams/${encodeURIComponent(teamId)}/brand`, { method: 'PATCH', body: data }),
  // Photo uploads: real file upload against Supabase Storage
  // (backend/src/services/imageUpload.js), replacing the old plain
  // "paste a URL" text fields. Each takes an already-resized Blob (see
  // src/utils/resizeImage.js) and returns the updated row with its new
  // *_url.
  uploadTeamLogo: (teamId, blob) => {
    const form = new FormData();
    form.append('photo', blob, 'logo.jpg');
    return request(`/teams/${encodeURIComponent(teamId)}/logo`, { method: 'PATCH', body: form, isForm: true });
  },
  getTeamSeasonStats: (teamId) => request(`/teams/${teamId}/season-stats`),
  // Step 38 Phase 2: StatisticianDashboard's "Data Points"/"Recent Reports"
  // tiles -- real team-scoped aggregates that didn't exist behind any
  // existing route (backend/src/routes/teams.js).
  getTeamPlayerStatsCount: (teamId) => request(`/teams/${encodeURIComponent(teamId)}/player-stats-count`),
  getTeamReports: (teamId) => request(`/teams/${encodeURIComponent(teamId)}/reports`),
  // FR-07 Phase 1/2: real head-to-head history between two teams (resolved
  // through Step 14's identity-grouping layer server-side), distinct from
  // getTeamSeasonStats above -- that averages a team's games against
  // everyone, this filters to games actually played against one opponent.
  getOpponentHistory: (teamId, opponentTeamId) => request(`/teams/${encodeURIComponent(teamId)}/opponents/${encodeURIComponent(opponentTeamId)}/history`),
  // playerId, not playerName -- the route now filters by the stable
  // player_id resolved at ingestion time (see backend/src/db/schema.sql's
  // comment on player_game_stats.player_id), not the raw extracted name
  // string, so two different real players who happen to share an
  // identical name on the same team no longer collide.
  getPlayerDevelopment: (teamId, playerId) => request(`/teams/${teamId}/players/${playerId}/development`),
  // FR-11: real roster CRUD against the `players` table (backend/src/routes/players.js).
  getTeamPlayers: (teamId) => request(`/teams/${teamId}/players`),
  addPlayer: (teamId, data) => request(`/teams/${teamId}/players`, { method: 'POST', body: data }),
  removePlayer: (teamId, playerId) => request(`/teams/${teamId}/players/${playerId}`, { method: 'DELETE' }),
  // Staff-curated player photo (Statistician/Team Manager only, never
  // self-service -- players don't have accounts here at all).
  uploadPlayerPhoto: (teamId, playerId, blob) => {
    const form = new FormData();
    form.append('photo', blob, 'photo.jpg');
    return request(`/teams/${teamId}/players/${playerId}/photo`, { method: 'PATCH', body: form, isForm: true });
  },
  // Player identity review queue (backend/src/routes/playerIdentityReview.js)
  // -- fuzzy name matches from bulk-import/report-upload/addPlayer above
  // that need a human confirm/reject before they're linked to an existing
  // player or treated as someone new.
  getPlayerIdentityReview: (teamId) => request(`/teams/${teamId}/player-identity-review`),
  confirmPlayerIdentityReview: (teamId, reviewId) => request(`/teams/${teamId}/player-identity-review/${reviewId}/confirm`, { method: 'POST' }),
  rejectPlayerIdentityReview: (teamId, reviewId) => request(`/teams/${teamId}/player-identity-review/${reviewId}/reject`, { method: 'POST' }),
  // Step 14: team identity review queue (backend/src/routes/
  // teamIdentityReview.js) -- unscoped, unlike the player one above, so no
  // :teamId in these paths.
  getTeamIdentityReview: () => request('/team-identity-review'),
  confirmTeamIdentityReview: (reviewId) => request(`/team-identity-review/${reviewId}/confirm`, { method: 'POST' }),
  rejectTeamIdentityReview: (reviewId) => request(`/team-identity-review/${reviewId}/reject`, { method: 'POST' }),
  // A team's competition-season history (backend/src/routes/teamCompetitionSeasons.js)
  // -- the real fact behind a promotion/relegation trajectory. Populated
  // by explicit staff action, not inferred from games.
  getTeamCompetitionSeasons: (teamId) => request(`/teams/${teamId}/competition-seasons`),
  addTeamCompetitionSeason: (teamId, data) => request(`/teams/${teamId}/competition-seasons`, { method: 'POST', body: data }),
  removeTeamCompetitionSeason: (teamId, id) => request(`/teams/${teamId}/competition-seasons/${id}`, { method: 'DELETE' }),
  // Step 12: real stage CRUD (backend/src/routes/stages.js), nested under
  // a team's own competition-season membership -- same URL-nesting shape
  // as the competition-seasons endpoints just above.
  getStages: (teamId, tcsId) => request(`/teams/${encodeURIComponent(teamId)}/competition-seasons/${tcsId}/stages`),
  createStage: (teamId, tcsId, data) => request(`/teams/${encodeURIComponent(teamId)}/competition-seasons/${tcsId}/stages`, { method: 'POST', body: data }),
  removeStage: (teamId, tcsId, stageId) => request(`/teams/${encodeURIComponent(teamId)}/competition-seasons/${tcsId}/stages/${stageId}`, { method: 'DELETE' }),
  // FR-11: real season CRUD against the `seasons` table (backend/src/routes/seasons.js).
  getSeasons: () => request('/seasons'),
  createSeason: (data) => request('/seasons', { method: 'POST', body: data }),
  // Step 12: toggle active after creation (backend's PATCH /seasons/:id) --
  // previously only ever settable once, at creation.
  updateSeason: (id, data) => request(`/seasons/${encodeURIComponent(id)}`, { method: 'PATCH', body: data }),
  deleteSeason: (id) => request(`/seasons/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  // Real competition CRUD against the `competitions` table (backend/src/routes/competitions.js),
  // renamed from `leagues` -- covers league tiers, custom recurring
  // competitions, Friendlies, and Tournaments, not just leagues.
  getCompetitions: () => request('/competitions'),
  getCompetitionPresets: () => request('/competitions/presets'),
  createCompetition: (data) => request('/competitions', { method: 'POST', body: data }),
  deleteCompetition: (id) => request(`/competitions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  // Real institution CRUD (backend/src/routes/institutions.js). An
  // institution's team list is deliberately not fetched here -- it's
  // derived by filtering the existing getTeams() response on
  // institution_id, not a separate stored/editable list.
  getInstitutions: () => request('/institutions'),
  createInstitution: (data) => request('/institutions', { method: 'POST', body: data }),
  deleteInstitution: (id) => request(`/institutions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  // FR-14: real audit trail of upload/compute/narrative actions (backend/src/routes/auditLog.js).
  getAuditLog: () => request('/audit-log'),
  // Visual overhaul step 2: self-service personal preference (backend/src/routes/users.js). No role gate -- scoped to the caller's own row.
  getMyPreferences: () => request('/users/me/preferences'),
  updateMyPreferences: (data) => request('/users/me/preferences', { method: 'PATCH', body: data }),
  // Staff-facing user directory (backend/src/routes/users.js), replacing
  // users.jsx's old entirely-localStorage user list. Statistician/Team
  // Manager only, enforced server-side.
  getUsers: () => request('/users'),
  updateUser: (userId, data) => request(`/users/${encodeURIComponent(userId)}`, { method: 'PATCH', body: data }),
  // Additive/subtractive team membership (backend/src/routes/users.js) --
  // unlike updateUser's teamId field above (which REPLACES a user's
  // entire team list), these add or remove one membership at a time
  // without touching any others. What a multi-team Statistician actually
  // needs to be granted a second team.
  addUserTeam: (userId, teamId) => request(`/users/${encodeURIComponent(userId)}/teams`, { method: 'POST', body: { teamId } }),
  removeUserTeam: (userId, teamId) => request(`/users/${encodeURIComponent(userId)}/teams/${encodeURIComponent(teamId)}`, { method: 'DELETE' }),
  // Staff-curated user photo -- same staff-only gating as updateUser
  // above, applies to every role including the uploader's own row. No
  // self-service equivalent exists (profile.jsx never calls this).
  uploadUserPhoto: (userId, blob) => {
    const form = new FormData();
    form.append('photo', blob, 'photo.jpg');
    return request(`/users/${encodeURIComponent(userId)}/photo`, { method: 'PATCH', body: form, isForm: true });
  },
  // Staff-triggered password reset -- same staff-only gating as
  // updateUser/uploadUserPhoto. Mirrors sendInviteEmail's emailSent/
  // emailError response shape.
  triggerPasswordReset: (userId) => request(`/users/${encodeURIComponent(userId)}/reset-password`, {
    method: 'POST', body: { appUrl: window.location.origin },
  }),
  // Public -- the invited/reset person isn't logged in yet, mirrors
  // getInvite/acceptInvite's plain-fetch shape (not the normal
  // authenticated request() flow).
  resetPassword: (token, password) => fetch(`${BASE_URL}/reset-password/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  }).then((r) => {
    if (!r.ok) return r.json().then((body) => { throw new Error(body.error || 'Could not reset password'); });
    return r.json();
  }),
};