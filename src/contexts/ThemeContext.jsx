import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_PREFERENCES, TEAM_PRESETS, buildMuiTheme } from '../theme/themeConfig';

const STORAGE_KEY = 'courtiq-preferences';

const ThemeContext = createContext(null);

function loadPreferences() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Visual overhaul step 2: `mode` (2-way) was this key's field name
      // before themeMode (3-way, DB-backed, supports 'auto') existed --
      // migrate any already-stored value rather than silently reverting a
      // returning user to the default.
      const themeMode = parsed.themeMode || parsed.mode || DEFAULT_PREFERENCES.themeMode;
      return { ...DEFAULT_PREFERENCES, ...parsed, themeMode, teamColors: { ...DEFAULT_PREFERENCES.teamColors, ...parsed.teamColors } };
    }
  } catch {
    /* use defaults */
  }
  return { ...DEFAULT_PREFERENCES };
}

function getSystemPrefersDark() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// The one place 'auto' becomes a real light/dark value. Every existing
// consumer of `mode` (RoleBackground, sidebar, topbar, buildMuiTheme, ...)
// expects a plain 'light'/'dark' string, same contract as before this
// step -- they don't need to know 'auto' exists.
function resolveMode(themeMode, systemPrefersDark) {
  return themeMode === 'auto' ? (systemPrefersDark ? 'dark' : 'light') : themeMode;
}

export function ThemePreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(loadPreferences);
  const [systemPrefersDark, setSystemPrefersDark] = useState(getSystemPrefersDark);

  // Only matters when themeMode is 'auto' -- keeps the resolved mode live
  // if the OS theme flips while the app is open, rather than only picking
  // it up on next load.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event) => setSystemPrefersDark(event.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  const mode = useMemo(
    () => resolveMode(preferences.themeMode, systemPrefersDark),
    [preferences.themeMode, systemPrefersDark],
  );

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    // Legacy key, not read anywhere else in the app -- kept only so
    // anything external that might read it still sees the resolved value.
    window.localStorage.setItem('courtiq-theme', mode);
  }, [preferences, mode]);

  const setThemeMode = useCallback((themeMode) => {
    setPreferences((prev) => ({ ...prev, themeMode }));
  }, []);

  // Explicit toggle always lands on a concrete light/dark (escaping
  // 'auto' if that was selected) -- picks the opposite of whatever is
  // CURRENTLY resolved/showing. 'auto' itself is only chosen via the
  // personal-preference settings screen's 3-way control.
  const toggleTheme = useCallback(() => {
    setPreferences((prev) => ({ ...prev, themeMode: resolveMode(prev.themeMode, systemPrefersDark) === 'dark' ? 'light' : 'dark' }));
  }, [systemPrefersDark]);

  const setTeamPreset = useCallback((presetId) => {
    const preset = TEAM_PRESETS[presetId];
    if (preset) {
      setPreferences((prev) => ({
        ...prev,
        teamPreset: presetId,
        teamColors: { primary: preset.primary, secondary: preset.secondary, accent: preset.accent },
      }));
    }
  }, []);

  const setTeamColors = useCallback((colors) => {
    setPreferences((prev) => ({
      ...prev,
      teamPreset: 'custom',
      teamColors: { ...prev.teamColors, ...colors },
    }));
  }, []);

  const setBackgroundIntensity = useCallback((backgroundIntensity) => {
    setPreferences((prev) => ({ ...prev, backgroundIntensity }));
  }, []);

  const toggleSidebar = useCallback(() => {
    setPreferences((prev) => ({ ...prev, sidebarCollapsed: !prev.sidebarCollapsed }));
  }, []);

  const muiThemeOptions = useMemo(
    () => buildMuiTheme(mode, preferences.teamColors),
    [mode, preferences.teamColors],
  );

  const value = useMemo(
    () => ({
      preferences,
      mode,
      themeMode: preferences.themeMode,
      teamColors: preferences.teamColors,
      teamPreset: preferences.teamPreset,
      backgroundIntensity: preferences.backgroundIntensity,
      sidebarCollapsed: preferences.sidebarCollapsed,
      setThemeMode,
      toggleTheme,
      setTeamPreset,
      setTeamColors,
      setBackgroundIntensity,
      toggleSidebar,
      muiThemeOptions,
    }),
    [preferences, mode, setThemeMode, toggleTheme, setTeamPreset, setTeamColors, setBackgroundIntensity, toggleSidebar, muiThemeOptions],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePreferences() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemePreferences must be used within ThemePreferencesProvider');
  }
  return context;
}

// Plain (non-hook) export for src/auth/authService.js, which runs outside
// any React tree and so can't call setThemeMode via the hook. Writes
// straight into this context's own storage key so the NEXT mount of
// ThemePreferencesProvider (its useState(loadPreferences) lazy
// initializer, which runs before first paint) picks up the DB value --
// same "seed storage, resolve on next pre-paint init" pattern
// src/theme/brandColors.js uses for --brand-* CSS vars, just via React
// state instead of a raw style property. Does NOT live-update an already-
// mounted provider in this tab -- see src/pages/login.jsx's explicit
// setThemeMode() call for that.
function seedThemeModeForNextLoad(themeMode) {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const existing = raw ? JSON.parse(raw) : {};
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, themeMode }));
  } catch {
    /* non-fatal */
  }
}

export { seedThemeModeForNextLoad };
