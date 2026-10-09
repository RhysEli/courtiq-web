export const TEAM_PRESETS = {
  usiu: {
    id: 'usiu',
    name: 'USIU Tigers',
    primary: '#f5c518',
    secondary: '#1e3a5f',
    accent: '#ffffff',
  },
  classic: {
    id: 'classic',
    name: 'Classic Orange',
    primary: '#ff7a1a',
    secondary: '#38bdf8',
    accent: '#f8fafc',
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight Blue',
    primary: '#3b82f6',
    secondary: '#1e293b',
    accent: '#e2e8f0',
  },
  forest: {
    id: 'forest',
    name: 'Forest Green',
    primary: '#22c55e',
    secondary: '#14532d',
    accent: '#ecfdf5',
  },
  crimson: {
    id: 'crimson',
    name: 'Crimson Elite',
    primary: '#ef4444',
    secondary: '#7f1d1d',
    accent: '#fef2f2',
  },
};

export const ROLE_THEMES = {
  Athlete: {
    label: 'Athlete',
    tagline: 'Train. Compete. Elevate.',
    gradient: ['#1a0a00', '#3d1a00', '#0d0500'],
    heroGradient: ['#c1121f', '#ff6b00', '#ff9500'],
    glow: '#ff6b00',
    particle: '#ff9500',
    icon: '🏀',
  },
  Coach: {
    label: 'Coach',
    tagline: 'Strategy. Leadership. Victory.',
    gradient: ['#001a14', '#003d2e', '#000d0a'],
    heroGradient: ['#047857', '#10b981', '#34d399'],
    glow: '#10b981',
    particle: '#34d399',
    icon: '📋',
  },
  Statistician: {
    label: 'Statistician',
    tagline: 'Data. Insight. Precision.',
    gradient: ['#0a001a', '#1a0a3d', '#05000d'],
    heroGradient: ['#7c3aed', '#a855f7', '#ec4899'],
    glow: '#8b5cf6',
    particle: '#a78bfa',
    icon: '📊',
  },
  'Team Manager': {
    label: 'Team Manager',
    tagline: 'Organize. Coordinate. Excel.',
    gradient: ['#001020', '#0a2040', '#000810'],
    heroGradient: ['#0a1e3f', '#1d4ed8', '#fbbf24'],
    glow: '#f59e0b',
    particle: '#fbbf24',
    icon: '🏆',
  },
};

export const DEFAULT_PREFERENCES = {
  // 'light' | 'dark' | 'auto' -- visual overhaul step 2's DB-backed
  // personal preference (users.theme_mode). 'auto' is resolved to a
  // concrete light/dark value in ThemeContext.jsx, not here. Matches
  // users.theme_mode's own DEFAULT 'auto' in schema.sql -- a brand-new
  // account (or a first-ever visit before any login at all) should follow
  // the device's light/dark setting, not silently land on dark.
  themeMode: 'auto',
  teamPreset: 'usiu',
  teamColors: { ...TEAM_PRESETS.usiu },
  backgroundIntensity: 'medium',
  sidebarCollapsed: false,
};

export function getRoleTheme(role) {
  return ROLE_THEMES[role] || ROLE_THEMES.Statistician;
}

export function buildMuiTheme(mode, teamColors) {
  const primary = teamColors?.primary || TEAM_PRESETS.usiu.primary;
  const secondary = teamColors?.secondary || TEAM_PRESETS.usiu.secondary;
  // Step 70/71: the same opaque surface colour as MuiCard's own base hue
  // below, just alpha 1 instead of translucent -- never tied to team
  // colour presets (those only ever tint primary/secondary, never this
  // surface). Shared by every dropdown override further down so a
  // Menu/Select, a Popover and an Autocomplete popup all land on the
  // exact same solid colour instead of three copies that could drift.
  const opaqueSurface = mode === 'dark' ? 'rgb(17, 24, 39)' : 'rgb(255, 255, 255)';

  return {
    palette: {
      mode,
      primary: { main: primary, light: adjustBrightness(primary, 30), dark: adjustBrightness(primary, -20) },
      secondary: { main: secondary, light: adjustBrightness(secondary, 30), dark: adjustBrightness(secondary, -20) },
      background: {
        default: 'transparent',
        paper: mode === 'dark' ? 'rgba(17, 24, 39, 0.72)' : 'rgba(255, 255, 255, 0.78)',
      },
      text: {
        primary: mode === 'dark' ? '#f8fafc' : '#0f172a',
        secondary: mode === 'dark' ? '#94a3b8' : '#475569',
      },
    },
    shape: { borderRadius: 16 },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            backgroundColor: mode === 'dark' ? 'rgba(17, 24, 39, 0.65)' : 'rgba(255, 255, 255, 0.72)',
            boxShadow: mode === 'dark' ? '0 8px 32px rgba(0,0,0,0.35)' : '0 8px 32px rgba(15, 23, 42, 0.1)',
            border: mode === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(15, 23, 42, 0.08)',
          },
        },
      },
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: 'transparent',
          },
        },
      },
      // Step 70/71: every Menu/Select popup, Popover and Autocomplete
      // dropdown previously had no background override at all, so each
      // one silently inherited palette.background.paper above --
      // deliberately translucent for MuiCard's own glass look (paired
      // there with a backdrop-filter blur none of these ever had), which
      // let page content behind a dropdown read straight through its
      // text. Fixed once here, for every current and future dropdown,
      // instead of per-instance -- a topbar.jsx-only fix is exactly how
      // the same bug ended up in six more Selects in
      // opponent-analysis.jsx. Deliberately scoped to MuiMenu/MuiPopover/
      // MuiAutocomplete's own `paper` slots specifically, not a MuiPaper-
      // level override -- MuiCard itself renders through Paper under the
      // hood, so a MuiPaper override would have silently flattened its
      // own deliberate translucency too. MuiDialog has its own separate
      // Paper slot, also untouched.
      MuiMenu: { styleOverrides: { paper: { backgroundColor: opaqueSurface } } },
      MuiPopover: { styleOverrides: { paper: { backgroundColor: opaqueSurface } } },
      MuiAutocomplete: { styleOverrides: { paper: { backgroundColor: opaqueSurface } } },
    },
  };
}

function adjustBrightness(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + percent));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + percent));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + percent));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
