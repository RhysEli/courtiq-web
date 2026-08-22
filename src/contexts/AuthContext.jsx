import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getStoredAuth, loginUser as loginUserService, logoutUser as logoutUserService } from '../auth/authService';

const AuthContext = createContext(null);

// Which of currentUser.teams (Step 9 Phase 2) the app is currently acting
// as. Deliberately not stored on currentUser itself -- that's a login-time
// snapshot (see authService.js), and switching which team you're viewing
// shouldn't need a fresh login. Persisted so a page reload doesn't reset
// your selection back to the first team every time -- same UX the old
// mock topbar switcher already had (courtiq-team), but this is a
// genuinely different, real concept, so it gets its own key rather than
// reusing that one.
const ACTIVE_TEAM_STORAGE_KEY = 'courtiq-active-team';

function loadPersistedActiveTeamId() {
  try {
    return window.localStorage.getItem(ACTIVE_TEAM_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function persistActiveTeamId(teamId) {
  try {
    if (teamId) window.localStorage.setItem(ACTIVE_TEAM_STORAGE_KEY, teamId);
    else window.localStorage.removeItem(ACTIVE_TEAM_STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => getStoredAuth());
  const [activeTeamId, setActiveTeamId] = useState(null);

  useEffect(() => {
    const storedAuth = getStoredAuth();
    setAuth(storedAuth);
  }, []);

  // Resolves the actual active team whenever currentUser (or its own
  // teams list) changes -- covers login, a stored session loading on
  // first render, and logout. Prefers a persisted selection, but only if
  // it's still one of this user's real teams (a persisted id from a
  // previous account, or a team they've since lost access to, falls back
  // to the first team rather than silently pointing at nothing).
  useEffect(() => {
    const teams = auth.currentUser?.teams || [];
    if (teams.length === 0) {
      setActiveTeamId(null);
      return;
    }
    const persisted = loadPersistedActiveTeamId();
    const stillValid = persisted && teams.some((t) => t.id === persisted);
    setActiveTeamId(stillValid ? persisted : teams[0].id);
  }, [auth.currentUser]);

  const login = async ({ email, password, rememberMe = false }) => {
    const result = await loginUserService({ email, password, rememberMe });
    if (result.success) {
      setAuth({
        currentUser: result.user,
        role: result.user.role,
        rememberMe,
      });
    }

    return result;
  };

  const logout = () => {
    logoutUserService();
    persistActiveTeamId(null);
    setAuth({ currentUser: null, role: null, rememberMe: false });
  };

  const setActiveTeam = (teamId) => {
    const teams = auth.currentUser?.teams || [];
    if (!teams.some((t) => t.id === teamId)) return; // not one of this user's real teams -- ignored, not a silent no-op error
    setActiveTeamId(teamId);
    persistActiveTeamId(teamId);
  };

  const activeTeam = useMemo(
    () => (auth.currentUser?.teams || []).find((t) => t.id === activeTeamId) || null,
    [auth.currentUser, activeTeamId],
  );

  const value = useMemo(
    () => ({
      auth,
      currentUser: auth.currentUser,
      role: auth.role,
      rememberMe: auth.rememberMe,
      login,
      logout,
      isAuthenticated: Boolean(auth.currentUser),
      activeTeam,
      setActiveTeam,
    }),
    [auth, activeTeam],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}