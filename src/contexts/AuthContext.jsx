import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getStoredAuth, loginUser as loginUserService, logoutUser as logoutUserService } from '../auth/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => getStoredAuth());

  useEffect(() => {
    const storedAuth = getStoredAuth();
    setAuth(storedAuth);
  }, []);

  const login = ({ email, password, rememberMe = false }) => {
    const result = loginUserService({ email, password, rememberMe });
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
    setAuth({ currentUser: null, role: null, rememberMe: false });
  };

  const value = useMemo(
    () => ({
      auth,
      currentUser: auth.currentUser,
      role: auth.role,
      rememberMe: auth.rememberMe,
      login,
      logout,
      isAuthenticated: Boolean(auth.currentUser),
    }),
    [auth],
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
