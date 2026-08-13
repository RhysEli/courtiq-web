const USER_STORAGE_KEY = 'courtiq-users';
const ORGANIZATION_STORAGE_KEY = 'courtiq-organizations';
const INVITE_STORAGE_KEY = 'courtiq-invites';
const REQUEST_STORAGE_KEY = 'courtiq-access-requests';

const defaultUsers = [
  {
    id: 'manager-1',
    username: 'manager',
    firstName: 'Asha',
    lastName: 'Wanjiru',
    email: 'manager@courtiq.com',
    phoneNumber: '+254700000001',
    profilePhoto: 'mock-avatar-manager',
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
    profilePhoto: 'mock-avatar-statistician',
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
    profilePhoto: 'mock-avatar-coach',
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
    profilePhoto: 'mock-avatar-athlete',
    password: 'demo123',
    role: 'Athlete',
    institution: 'USIU',
    // FR-10: links this account to a real player row so Statistics/Player
    // Development can auto-scope to "their own" real stats instead of a
    // team/player picker. team/playerName here must match a real team name
    // and player_name as they appear in extracted player_game_stats (see
    // the (teamId, playerName) convention documented in
    // backend/src/routes/teams.js) -- 'USIU TIGERS' / 'AMOS KIM' is a real
    // team+player pair with real recorded games in the current dataset.
    team: 'USIU TIGERS',
    playerName: 'AMOS KIM',
    status: 'active',
    lastLogin: '3 days ago',
  },
];

const defaultOrganizations = [
  {
    id: 'usiu',
    name: 'USIU',
    logo: 'mock-logo-usiu',
    country: 'Kenya',
    sport: 'Basketball',
    description: 'Regional basketball program',
    status: 'active',
  },
];

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

function ensureSeedData() {
  const users = readStorage(USER_STORAGE_KEY, []);
  if (!users.length) {
    writeStorage(USER_STORAGE_KEY, defaultUsers);
  }

  const organizations = readStorage(ORGANIZATION_STORAGE_KEY, []);
  if (!organizations.length) {
    writeStorage(ORGANIZATION_STORAGE_KEY, defaultOrganizations);
  }

  const invites = readStorage(INVITE_STORAGE_KEY, []);
  if (!invites.length) {
    writeStorage(INVITE_STORAGE_KEY, []);
  }

  const requests = readStorage(REQUEST_STORAGE_KEY, []);
  if (!requests.length) {
    writeStorage(REQUEST_STORAGE_KEY, []);
  }
}

ensureSeedData();

export function getUsers() {
  return readStorage(USER_STORAGE_KEY, defaultUsers);
}

export function getOrganizations() {
  return readStorage(ORGANIZATION_STORAGE_KEY, defaultOrganizations);
}

export function getInvites() {
  return readStorage(INVITE_STORAGE_KEY, []);
}

export function getAccessRequests() {
  return readStorage(REQUEST_STORAGE_KEY, []);
}

export function createUserAccount(userData) {
  const users = getUsers();
  const normalizedUser = {
    ...userData,
    id: userData.id || `user-${Date.now()}`,
    status: userData.status || 'pending',
    lastLogin: userData.lastLogin || 'Never',
    profilePhoto: userData.profilePhoto || 'mock-avatar',
  };

  users.push(normalizedUser);
  writeStorage(USER_STORAGE_KEY, users);
  return normalizedUser;
}

export function createOrganization(organizationData, ownerId) {
  const organizations = getOrganizations();
  const organization = {
    id: organizationData.id || `org-${Date.now()}`,
    name: organizationData.name,
    logo: organizationData.logo || 'mock-logo',
    country: organizationData.country,
    sport: organizationData.sport,
    description: organizationData.description || '',
    status: organizationData.status || 'active',
  };

  organizations.push(organization);
  writeStorage(ORGANIZATION_STORAGE_KEY, organizations);

  const users = getUsers().map((user) =>
    user.id === ownerId ? { ...user, institution: organization.name, role: 'Team Manager', status: 'active' } : user,
  );
  writeStorage(USER_STORAGE_KEY, users);

  return organization;
}

export function createInvite(inviteData) {
  const invites = getInvites();
  const invite = {
    id: inviteData.id || `invite-${Date.now()}`,
    code: inviteData.code || `INV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    email: inviteData.email,
    institution: inviteData.institution,
    team: inviteData.team || '',
    role: inviteData.role,
    expiration: inviteData.expiration || '7 days',
    status: inviteData.status || 'pending',
    createdAt: new Date().toISOString(),
  };

  invites.push(invite);
  writeStorage(INVITE_STORAGE_KEY, invites);
  return invite;
}

export function updateInviteStatus(inviteId, status) {
  const invites = getInvites().map((invite) => (invite.id === inviteId ? { ...invite, status } : invite));
  writeStorage(INVITE_STORAGE_KEY, invites);
  return invites;
}

export function createAccessRequest(requestData) {
  const requests = getAccessRequests();
  const request = {
    id: requestData.id || `request-${Date.now()}`,
    institution: requestData.institution,
    desiredRole: requestData.desiredRole,
    message: requestData.message,
    email: requestData.email,
    status: requestData.status || 'pending',
  };

  requests.push(request);
  writeStorage(REQUEST_STORAGE_KEY, requests);
  return request;
}

export function updateAccessRequestStatus(requestId, status) {
  const requests = getAccessRequests().map((request) => (request.id === requestId ? { ...request, status } : request));
  writeStorage(REQUEST_STORAGE_KEY, requests);
  return requests;
}

export function updateUserStatus(userId, status) {
  const users = getUsers().map((user) => (user.id === userId ? { ...user, status } : user));
  writeStorage(USER_STORAGE_KEY, users);
  return users;
}

export function updateUserRole(userId, role) {
  const users = getUsers().map((user) => (user.id === userId ? { ...user, role } : user));
  writeStorage(USER_STORAGE_KEY, users);
  return users;
}

export function updateUserTeam(userId, team) {
  const users = getUsers().map((user) => (user.id === userId ? { ...user, team } : user));
  writeStorage(USER_STORAGE_KEY, users);
  return users;
}

export function updateUserInstitution(userId, institution) {
  const users = getUsers().map((user) => (user.id === userId ? { ...user, institution } : user));
  writeStorage(USER_STORAGE_KEY, users);
  return users;
}

export function resetPassword(userId, password) {
  const users = getUsers().map((user) => (user.id === userId ? { ...user, password } : user));
  writeStorage(USER_STORAGE_KEY, users);
  return users;
}
