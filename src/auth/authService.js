import { createOrganization, createUserAccount, getUsers, getOrganizations, getInvites } from '../services/accountService.js';
import { backendApi } from '../api/client';

const AUTH_STORAGE_KEY = 'courtiq-auth';
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

  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
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
      },
      role: data.user.role,
      rememberMe,
    };

    persistAuth(authState);
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

export function registerUser(userData) {
  ensureDemoUsers();
  const normalizedEmail = normalizeEmail(userData.email);
  const existingUser = getUsers().find((user) => normalizeEmail(user.email) === normalizedEmail);

  if (existingUser) {
    return { success: false, error: 'An account already exists for this email.' };
  }

  if (!userData.username || !normalizedEmail || !userData.password || !userData.confirmPassword) {
    return { success: false, error: 'Please complete all required fields.' };
  }

  if (userData.password !== userData.confirmPassword) {
    return { success: false, error: 'Passwords do not match.' };
  }

  const organizations = getOrganizations();
  const shouldCreateOrganization = Boolean(userData.createOrganization || !organizations.length);

  const account = createUserAccount({
    username: userData.username,
    firstName: userData.firstName || '',
    lastName: userData.lastName || '',
    email: normalizedEmail,
    phoneNumber: userData.phoneNumber || '',
    password: userData.password,
    role: userData.role || 'Coach',
    institution: userData.institution || '',
    team: userData.team || '',
    status: 'active',
    lastLogin: 'Just now',
    profilePhoto: 'mock-avatar',
  });

  let organization = null;
  if (shouldCreateOrganization) {
    organization = createOrganization({ name: userData.institution || userData.username, country: userData.country || 'Kenya', sport: userData.sport || 'Basketball', description: `${userData.username}'s organization` }, account.id);
  }

  if (!shouldCreateOrganization && userData.inviteCode) {
    const invite = getInvites().find((entry) => entry.code === userData.inviteCode && entry.status === 'pending');
    if (invite) {
      const users = getUsers().map((entry) => (entry.id === account.id ? { ...entry, institution: invite.institution, team: invite.team, role: invite.role } : entry));
      const storage = getStorage();
      if (storage) {
        storage.setItem(USER_STORAGE_KEY, JSON.stringify(users));
      }
    }
  }

  const authState = {
    currentUser: {
      id: account.id,
      email: account.email,
      name: account.username,
      role: account.role,
      institution: account.institution,
      team: account.team,
    },
    role: account.role,
    rememberMe: Boolean(userData.rememberMe),
  };

  persistAuth(authState);

  return { success: true, user: authState.currentUser, organization };
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