export const roleRouteAccess = {
  Statistician: ['/dashboard', '/profile', '/statistics', '/institutions', '/teams', '/leagues', '/seasons', '/games', '/reports', '/analysis', '/analysis-import','/bulk-import', '/opponent-analysis', '/settings', '/account', '/users', '/organizations', '/leagues-management', '/seasons-management', '/teams-management', '/players-management'],
  'Team Manager': ['/dashboard', '/profile', '/institutions', '/teams', '/leagues', '/seasons', '/games', '/reports', '/analysis', '/analysis-import', '/opponent-analysis', '/settings', '/account', '/users', '/organizations', '/leagues-management', '/seasons-management', '/teams-management', '/players-management'],
  Coach: ['/dashboard', '/profile', '/players', '/games', '/statistics', '/analysis', '/opponent-analysis', '/settings', '/account'],
  Athlete: ['/dashboard', '/profile', '/statistics', '/analysis', '/settings', '/account'],
};

export function isRouteAllowed(role, path) {
  const normalizedRole = role || 'Statistician';
  return roleRouteAccess[normalizedRole]?.includes(path) ?? false;
}

export function getDefaultDashboardPath() {
  return '/dashboard';
}
