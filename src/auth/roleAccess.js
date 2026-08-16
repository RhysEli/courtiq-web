export const roleRouteAccess = {
  Statistician: ['/dashboard', '/profile', '/statistics', '/player-development', '/institutions', '/teams', '/leagues', '/seasons', '/games', '/reports', '/analysis','/bulk-import', '/opponent-analysis', '/settings', '/account', '/users', '/organizations', '/leagues-management', '/seasons-management', '/teams-management', '/players-management', '/audit-log'],
  // team-brand-settings is Team Manager only -- not shared with
  // Statistician like most other '-management' pages here, matching the
  // backend's PATCH /teams/:teamId/brand (visual overhaul step 1), which
  // is also Team-Manager-only unlike the general team-config PATCH.
  'Team Manager': ['/dashboard', '/profile', '/statistics', '/player-development', '/institutions', '/teams', '/leagues', '/seasons', '/games', '/reports', '/analysis', '/opponent-analysis', '/settings', '/team-brand-settings', '/account', '/users', '/organizations', '/leagues-management', '/seasons-management', '/teams-management', '/players-management', '/audit-log'],
  Coach: ['/dashboard', '/profile', '/players', '/games', '/statistics', '/player-development', '/analysis', '/opponent-analysis', '/settings', '/account'],
  Athlete: ['/dashboard', '/profile', '/statistics', '/player-development', '/analysis', '/settings', '/account'],
};

export function isRouteAllowed(role, path) {
  const normalizedRole = role || 'Statistician';
  return roleRouteAccess[normalizedRole]?.includes(path) ?? false;
}

export function getDefaultDashboardPath() {
  return '/dashboard';
}