import { getUsers } from '../services/accountService.js';
import { backendApi } from '../api/client.js';
import { applyTheme } from '../theme/applyTheme.js';
import { persistBrandColors } from '../theme/brandColors.js';
import { persistUserPreference } from '../theme/userPreference.js';
import { seedThemeModeForNextLoad } from '../contexts/ThemeContext.jsx';

const AUTH_STORAGE_KEY = 'courtiq-auth';
// Bump whenever currentUser's shape changes in a way pages actually rely
// on (teamId, photoUrl, most recently teams -- the full multi-team list,
// which the active-team switcher and the pages swept onto it now depend
// on existing at all, not just having the right value). This is the root fix for a bug
// this project has hit repeatedly under different names ("team brand
// wrong team", "team resolution all pages", "team match regression",
// and now "Team Brand shows no team on Render"): login.jsx's
// `if (isAuthenticated) { navigate('/dashboard') }` shortcut trusts
// whatever's in localStorage forever, without ever re-running a real
// login, so a session cached before a shape change (e.g. from before
// teamId existed at all) sits there indefinitely -- every one of those
// prior fixes added a NEW field (teamId, matched by id not name) but
// never invalidated OLD cached sessions that predate the field existing.
// Confirmed by reproducing it directly: a simulated pre-teamId session
// (no teamId key, the old mock-shaped "USIU Tigers Men" name with no
// parens) reproduces team-brand-settings.jsx's exact "Could not find
// your team" error, while a genuinely fresh login does not. Past fixes
// treated the SYMPTOM (which page, which matching strategy); this treats
// the actual mechanism -- an old cached blob outliving the code that
// wrote it -- so the next shape change doesn't need its own bug report.
const AUTH_STATE_VERSION = 3;
const USER_STORAGE_KEY = 'courtiq-users';
const ORGANIZATION_STORAGE_KEY = 'courtiq-organizations';
const INVITE_STORAGE_KEY = 'courtiq-invites';
// Real per-user JWT, read by src/api/client.js and preferred over the
// shared service account whenever it's present.
const USER_TOKEN_KEY = 'courtiq-user-token';

const normalizeEmail = (email = '') => email.trim().toLowerCase();

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }

  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage;
  }

  return null;
}

const demoUsers = [
  {
    id: 'manager-1',
    username: 'manager',
    firstName: 'Asha',
    lastName: 'Wanjiru',
    email: 'manager@courtiq.com',
    phoneNumber: '+254700000001',
    password: 'demo123',
    role: 'Team Manager',
    institution: 'USIU',
    team: 'USIU Tigers Men',
    status: 'active',
    lastLogin: 'Just now',
  },
  {
    id: 'statistician-1',
    username: 'rhys',
    firstName: 'Rhys',
    lastName: 'Cole',
    email: 'statistician@courtiq.com',
    phoneNumber: '+254700000002',
    password: 'demo123',
    role: 'Statistician',
    institution: 'USIU',
    team: 'USIU Tigers Men',
    status: 'active',
    lastLogin: '2 hours ago',
  },
  {
    id: 'coach-1',
    username: 'coach',
    firstName: 'Njeri',
    lastName: 'Mugo',
    email: 'coach@courtiq.com',
    phoneNumber: '+254700000003',
    password: 'demo123',
    role: 'Coach',
    institution: 'USIU',
    team: 'USIU Tigers Men',
    status: 'active',
    lastLogin: 'Yesterday',
  },
  {
    id: 'athlete-1',
    username: 'athlete',
    firstName: 'Mina',
    lastName: 'Kibet',
    email: 'athlete@courtiq.com',
    phoneNumber: '+254700000004',
    password: 'demo123',
    role: 'Athlete',
    institution: 'USIU',
    // FR-10: kept in sync with the matching record in accountService.js
    // (the actual seed source -- see the comment there for why these
    // particular values were chosen).
    team: 'USIU TIGERS',
    playerName: 'AMOS KIM',
    status: 'active',
    lastLogin: '3 days ago',
  },
];

function ensureDemoUsers() {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const storedUsers = storage.getItem(USER_STORAGE_KEY);
  if (!storedUsers) {
    storage.setItem(USER_STORAGE_KEY, JSON.stringify(demoUsers));
  }

  const storedOrganizations = storage.getItem(ORGANIZATION_STORAGE_KEY);
  if (!storedOrganizations) {
    storage.setItem(ORGANIZATION_STORAGE_KEY, JSON.stringify([{ id: 'usiu', name: 'USIU', country: 'Kenya', sport: 'Basketball', description: 'Regional basketball program', status: 'active' }]));
  }

  if (!storage.getItem(INVITE_STORAGE_KEY)) {
    storage.setItem(INVITE_STORAGE_KEY, JSON.stringify([]));
  }
}

export function getStoredAuth() {
  const storage = getStorage();
  if (!storage) {
    return { currentUser: null, role: null, rememberMe: false };
  }

  try {
    ensureDemoUsers();
    const storedValue = storage.getItem(AUTH_STORAGE_KEY);
    if (!storedValue) {
      return { currentUser: null, role: null, rememberMe: false };
    }

    const parsedValue = JSON.parse(storedValue);
    // A session cached under an older shape (missing fields like teamId
    // that current pages depend on) is discarded here rather than trusted
    // -- same "not authenticated" result login.jsx already handles by
    // showing the real login form, so this doesn't need its own UI state.
    // Also clears the stale blob itself so it doesn't keep failing this
    // same check on every future load.
    if (parsedValue.currentUser && parsedValue.version !== AUTH_STATE_VERSION) {
      clearAuth();
      return { currentUser: null, role: null, rememberMe: false };
    }
    return {
      currentUser: parsedValue.currentUser ?? null,
      role: parsedValue.role ?? null,
      rememberMe: Boolean(parsedValue.rememberMe),
    };
  } catch {
    return { currentUser: null, role: null, rememberMe: false };
  }
}

export function persistAuth(authState) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  // Stamped here (not by each caller) so every current and future
  // persistAuth() call site is automatically versioned without needing
  // to remember to add it -- the one thing that was missing before.
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ ...authState, version: AUTH_STATE_VERSION }));
}

export function clearAuth() {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(AUTH_STORAGE_KEY);
}

export async function loginUser({ email, password, rememberMe = false }) {
  const normalizedEmail = normalizeEmail(email);

  // Try the real backend first. Accounts created through the real invite
  // flow live in the actual `users` table, and logging in this way stores
  // a real per-user token (see USER_TOKEN_KEY) so every subsequent API
  // call carries this person's real role/team and the backend's existing
  // requireAuth/requireRole checks apply for real -- not just in the UI.
  try {
    const data = await backendApi.login({ email: normalizedEmail, password });
    const storage = getStorage();
    if (storage) {
      storage.setItem(USER_TOKEN_KEY, data.token);
    }

    const authState = {
      currentUser: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        role: data.user.role,
        institution: data.user.teams?.[0]?.institution_name || '',
        team: data.user.teams?.[0]?.name || '',
        // Real, stable identifier for the pages that need to fetch/edit
        // this exact team's data -- name-string matching (even exact)
        // breaks silently on formatting drift (e.g. "USIU Tigers Men" vs
        // the real "USIU Tigers (Men)"), which is exactly what happened
        // here. Prefer this over `team` (the display name) wherever both
        // are available. Still just the first team, same as `team`/
        // `institution` above -- unchanged default behavior for a
        // single-team user. The full list right below is what actually
        // makes a second or third team reachable; AuthContext tracks
        // which one is currently "active" separately (see
        // ActiveTeamContext), since currentUser is a login-time snapshot
        // and switching active teams shouldn't require a fresh login.
        teamId: data.user.teams?.[0]?.id || '',
        // Every real team this user belongs to (getUserTeams, backend) --
        // was silently dropped down to just teams[0] before; a user with
        // more than one membership had no way to reach the others from
        // the frontend at all, even though the backend/JWT already
        // supported it fully (req.user.teamIds always carried the whole
        // list). Same shape as each entry already had (id, name,
        // institution_name, color_primary/secondary, brand_accent,
        // gender_category, logo_url).
        teams: data.user.teams || [],
        // Staff-curated photo (backend PATCH /users/:userId/photo) --
        // read back at login like any other profile field. A fresh
        // upload made to this same account while already logged in
        // won't show until next login, same as a role/team change --
        // currentUser is a login-time snapshot, not live-refreshed.
        photoUrl: data.user.photoUrl || '',
        // Visual overhaul step 2: carried through so login.jsx can call
        // setThemeMode() for a same-tab live update -- ThemeContext is a
        // sibling of AuthContext in main.jsx's provider tree (not a
        // descendant), so this service module can't call its hook
        // directly. See seedThemeModeForNextLoad below for the
        // next-page-load path.
        themeMode: data.user.themeMode,
        // The real per-user linkage FR-10's Athlete-scoping pages need
        // (player-development.jsx). Null for an Athlete invited without a
        // player-name link, or any non-Athlete role -- a real, valid
        // state consumers must treat as "not linked yet", not fall back
        // to someone else's data.
        playerId: data.user.playerId,
      },
      role: data.user.role,
      rememberMe,
    };

    persistAuth(authState);

    // Visual overhaul step 1/2: this user's first (primary) real team's
    // brand colors plus their own theme_mode/accent_override, applied
    // immediately so a fresh login doesn't need a reload to pick them up,
    // and persisted so the NEXT app load (main.jsx / ThemeContext) can
    // apply/resolve them before first paint. A demo account (the fallback
    // path below) has no real team or preference row, so nothing to apply
    // there -- the existing persisted/default ones stand.
    const primaryTeam = data.user.teams?.[0];
    const brandColors = primaryTeam ? {
      colorPrimary: primaryTeam.color_primary,
      colorSecondary: primaryTeam.color_secondary,
      brandAccent: primaryTeam.brand_accent,
    } : null;
    const userPref = { themeMode: data.user.themeMode, accentOverride: data.user.accentOverride };

    if (brandColors) persistBrandColors(brandColors);
    persistUserPreference(userPref);
    seedThemeModeForNextLoad(userPref.themeMode);
    applyTheme({ brand: brandColors || {}, userPref });

    return { success: true, user: authState.currentUser };
  } catch {
    // No matching real account (or backend unreachable) -- fall back to
    // the local demo accounts below so the existing demo logins keep
    // working exactly as before.
  }

  ensureDemoUsers();
  const matchingUser = getUsers().find((user) => normalizeEmail(user.email) === normalizedEmail && user.password === password);

  if (!matchingUser) {
    return { success: false, error: 'Invalid email or password.' };
  }

  const authState = {
    currentUser: {
      id: matchingUser.id,
      email: matchingUser.email,
      name: matchingUser.username || `${matchingUser.firstName} ${matchingUser.lastName}`.trim(),
      role: matchingUser.role,
      institution: matchingUser.institution,
      team: matchingUser.team,
      // FR-10: carried through so an Athlete's Statistics/Player Development
      // views can auto-scope to their own real stats. Real backend accounts
      // (the branch above) have no equivalent linkage yet -- see the
      // (teamId, playerName) note in backend/src/routes/teams.js.
      playerName: matchingUser.playerName,
    },
    role: matchingUser.role,
    rememberMe,
  };

  persistAuth(authState);

  return { success: true, user: authState.currentUser };
}

export function logoutUser() {
  clearAuth();
  const storage = getStorage();
  if (storage) {
    storage.removeItem(USER_TOKEN_KEY);
  }
  return { success: true };
}

export function getRoleForEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  const matchingUser = getUsers().find((user) => normalizeEmail(user.email) === normalizedEmail);
  return matchingUser?.role ?? null;
}