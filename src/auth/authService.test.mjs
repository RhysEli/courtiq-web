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

const { loginUser, logoutUser, getStoredAuth, registerUser } = await import('./authService.js');

test('loginUser authenticates a known manager account', () => {
  localStorage.clear();

  const result = loginUser({ email: 'manager@courtiq.com', password: 'demo123', rememberMe: true });

  assert.equal(result.success, true);
  assert.equal(result.user.role, 'Team Manager');
  assert.equal(getStoredAuth().currentUser.email, 'manager@courtiq.com');
});

test('registerUser stores a new user and authenticates it', () => {
  localStorage.clear();

  const result = registerUser({
    username: 'newuser',
    email: 'new.user@courtiq.com',
    password: 'demo123',
    confirmPassword: 'demo123',
    role: 'Coach',
    rememberMe: true,
    createOrganization: false,
    inviteCode: 'INV-DEMO',
    institution: 'USIU',
    team: 'USIU Tigers Men',
  });

  assert.equal(result.success, true);
  assert.equal(getStoredAuth().currentUser.email, 'new.user@courtiq.com');
});

test('logoutUser clears persisted auth', () => {
  localStorage.clear();
  loginUser({ email: 'coach@courtiq.com', password: 'demo123', rememberMe: false });

  logoutUser();

  const auth = getStoredAuth();
  assert.equal(auth.currentUser, null);
  assert.equal(auth.role, null);
});
