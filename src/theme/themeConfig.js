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
  mode: 'dark',
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
