// Step 55: /player-development and /analysis removed from every role
// below -- both routes now just redirect to /statistics (App.jsx), which
// is the one merged page covering all three (Statistics/Analysis/Player
// Development combined). /statistics itself was already present for
// every role here, so no role loses access to anything -- these two
// entries were purely stale after the redirect, since neither route is
// ever actually rendered/checked against isRouteAllowed anymore.
export const roleRouteAccess = {
  Statistician: ['/dashboard', '/profile', '/statistics', '/institutions', '/teams', '/competitions', '/seasons', '/games', '/reports', '/bulk-import', '/opponent-analysis', '/settings', '/account', '/users', '/organizations', '/competitions-management', '/seasons-management', '/teams-management', '/players-management', '/audit-log'],
  // team-brand-settings is Team Manager only -- not shared with
  // Statistician like most other '-management' pages here, matching the
  // backend's PATCH /teams/:teamId/brand (visual overhaul step 1), which
  // is also Team-Manager-only unlike the general team-config PATCH.
  'Team Manager': ['/dashboard', '/profile', '/statistics', '/institutions', '/teams', '/competitions', '/seasons', '/games', '/reports', '/opponent-analysis', '/settings', '/team-brand-settings', '/account', '/users', '/organizations', '/competitions-management', '/seasons-management', '/teams-management', '/players-management', '/audit-log'],
  Coach: ['/dashboard', '/profile', '/players', '/games', '/statistics', '/opponent-analysis', '/settings', '/account'],
  Athlete: ['/dashboard', '/profile', '/statistics', '/settings', '/account'],
};

export function isRouteAllowed(role, path) {
  const normalizedRole = role || 'Statistician';
  return roleRouteAccess[normalizedRole]?.includes(path) ?? false;
}

export function getDefaultDashboardPath() {
  return '/dashboard';
}