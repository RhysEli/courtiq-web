// Visual overhaul step 1: team-level brand colors as CSS custom properties
// on the document root, so any component can theme off var(--brand-primary)
// / var(--brand-secondary) / var(--brand-accent) instead of a hardcoded hex.
//
// Deliberately separate from src/contexts/ThemeContext.jsx's `teamColors` --
// that's a personal, per-browser preference (a preset picked from a
// dropdown, never backed by the database). This module is the real team's
// actual brand identity from the `teams` table. A later step layers
// personal overrides on top of this foundation; it doesn't replace it.
//
// Persisted to localStorage so a returning, already-logged-in user's
// colors can be applied synchronously in main.jsx, before React's first
// render -- an effect (which only runs after the initial paint) would
// flash the defaults first. The very first visit before any login has no
// persisted value yet, so it falls back to CourtIQ's own default palette;
// that flash is unavoidable since there's no real color to show yet.

const BRAND_STORAGE_KEY = 'courtiq-brand-colors';

// Matches the backfill defaults in backend/src/db/schema.sql (CourtIQ's
// own "Classic Orange" identity, also TEAM_PRESETS.classic in
// src/theme/themeConfig.js) so a team with no real brand colors configured
// yet looks intentional, not broken.
const DEFAULT_BRAND_COLORS = {
  colorPrimary: '#ff7a1a',
  colorSecondary: '#38bdf8',
  brandAccent: '#f8fafc',
};

function applyBrandColors(colors = {}) {
  const root = document.documentElement;
  root.style.setProperty('--brand-primary', colors.colorPrimary || DEFAULT_BRAND_COLORS.colorPrimary);
  root.style.setProperty('--brand-secondary', colors.colorSecondary || DEFAULT_BRAND_COLORS.colorSecondary);
  root.style.setProperty('--brand-accent', colors.brandAccent || DEFAULT_BRAND_COLORS.brandAccent);
}

function persistBrandColors(colors) {
  try {
    window.localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(colors));
  } catch {
    /* localStorage full or unavailable -- non-fatal, just won't persist */
  }
}

function loadPersistedBrandColors() {
  try {
    const raw = window.localStorage.getItem(BRAND_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export { applyBrandColors, persistBrandColors, loadPersistedBrandColors, DEFAULT_BRAND_COLORS, BRAND_STORAGE_KEY };
