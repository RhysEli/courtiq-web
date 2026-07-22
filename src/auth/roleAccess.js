export const roleRouteAccess = {
  Statistician: ['/dashboard', '/statistics', '/institutions', '/teams', '/leagues', '/seasons', '/games', '/reports', '/analysis', '/analysis-import', '/opponent-analysis', '/settings', '/account', '/users', '/organizations', '/leagues-management', '/seasons-management', '/teams-management', '/players-management'],
  'Team Manager': ['/dashboard', '/institutions', '/teams', '/leagues', '/seasons', '/games', '/reports', '/analysis', '/analysis-import', '/opponent-analysis', '/settings', '/account', '/users', '/organizations', '/leagues-management', '/seasons-management', '/teams-management', '/players-management'],
  Coach: ['/dashboard', '/players', '/games', '/statistics', '/analysis', '/opponent-analysis', '/settings', '/account'],
  Athlete: ['/dashboard', '/statistics', '/analysis', '/settings', '/account'],
};

export function isRouteAllowed(role, path) {
  const normalizedRole = role || 'Statistician';
  return roleRouteAccess[normalizedRole]?.includes(path) ?? false;
}

export function getDefaultDashboardPath() {
  return '/dashboard';
}
