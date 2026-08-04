import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_PREFERENCES, TEAM_PRESETS, buildMuiTheme } from '../theme/themeConfig';

const STORAGE_KEY = 'courtiq-preferences';

const ThemeContext = createContext(null);

function loadPreferences() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_PREFERENCES, ...parsed, teamColors: { ...DEFAULT_PREFERENCES.teamColors, ...parsed.teamColors } };
    }
  } catch {
    /* use defaults */
  }
  return { ...DEFAULT_PREFERENCES };
}

export function ThemePreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(loadPreferences);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    window.localStorage.setItem('courtiq-theme', preferences.mode);
  }, [preferences]);

  const setMode = useCallback((mode) => {
    setPreferences((prev) => ({ ...prev, mode }));
  }, []);

  const toggleTheme = useCallback(() => {
    setPreferences((prev) => ({ ...prev, mode: prev.mode === 'dark' ? 'light' : 'dark' }));
  }, []);

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
    () => buildMuiTheme(preferences.mode, preferences.teamColors),
    [preferences.mode, preferences.teamColors],
  );

  const value = useMemo(
    () => ({
      preferences,
      mode: preferences.mode,
      teamColors: preferences.teamColors,
      teamPreset: preferences.teamPreset,
      backgroundIntensity: preferences.backgroundIntensity,
      sidebarCollapsed: preferences.sidebarCollapsed,
      setMode,
      toggleTheme,
      setTeamPreset,
      setTeamColors,
      setBackgroundIntensity,
      toggleSidebar,
      muiThemeOptions,
    }),
    [preferences, setMode, toggleTheme, setTeamPreset, setTeamColors, setBackgroundIntensity, toggleSidebar, muiThemeOptions],
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
