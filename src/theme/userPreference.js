// Visual overhaul step 2: personal preference layer (users.theme_mode /
// users.accent_override). accent_override now accepts any #rrggbb hex
// (backend/src/db/schema.sql's CHECK is format-only, not enum-limited --
// see FullColorPicker.jsx for the rich picker this unblocked). This list
// is kept only as curated quick-pick swatches alongside that picker, not
// as a validation boundary -- picking a color not on this list is normal,
// expected usage now, not an edge case.
//
// Persisted to localStorage under its own key (separate from
// src/theme/brandColors.js's team-brand key, and separate from
// src/contexts/ThemeContext.jsx's own 'courtiq-preferences' key, which
// still owns purely local-only settings like sidebarCollapsed and the old
// teamColors preset picker) so the resolved value can be applied at
// bootstrap before first render, same reasoning as brandColors.js.

const ACCENT_OPTIONS = [
  { id: 'rose', hex: '#f43f5e', label: 'Rose' },
  { id: 'amber', hex: '#f59e0b', label: 'Amber' },
  { id: 'emerald', hex: '#22c55e', label: 'Emerald' },
  { id: 'sky', hex: '#0ea5e9', label: 'Sky' },
  { id: 'violet', hex: '#8b5cf6', label: 'Violet' },
  { id: 'pink', hex: '#ec4899', label: 'Pink' },
];

const THEME_MODE_OPTIONS = ['light', 'dark', 'auto'];

const USER_PREFERENCE_STORAGE_KEY = 'courtiq-user-preference';

function persistUserPreference({ themeMode, accentOverride }) {
  try {
    window.localStorage.setItem(USER_PREFERENCE_STORAGE_KEY, JSON.stringify({ themeMode, accentOverride }));
  } catch {
    /* localStorage full or unavailable -- non-fatal, just won't persist */
  }
}

function loadPersistedUserPreference() {
  try {
    const raw = window.localStorage.getItem(USER_PREFERENCE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export { ACCENT_OPTIONS, THEME_MODE_OPTIONS, persistUserPreference, loadPersistedUserPreference, USER_PREFERENCE_STORAGE_KEY };
