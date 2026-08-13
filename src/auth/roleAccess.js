export const roleRouteAccess = {
  Statistician: ['/dashboard', '/profile', '/statistics', '/player-development', '/institutions', '/teams', '/leagues', '/seasons', '/games', '/reports', '/analysis','/bulk-import', '/opponent-analysis', '/settings', '/account', '/users', '/organizations', '/leagues-management', '/seasons-management', '/teams-management', '/players-management'],
  'Team Manager': ['/dashboard', '/profile', '/statistics', '/player-development', '/institutions', '/teams', '/leagues', '/seasons', '/games', '/reports', '/analysis', '/opponent-analysis', '/settings', '/account', '/users', '/organizations', '/leagues-management', '/seasons-management', '/teams-management', '/players-management'],
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