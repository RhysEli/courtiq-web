import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout';
import { backendApi } from '../api/client';
import { getMatches } from '../services/matchService';
import { getAnalysisEntries, getImportedReports } from '../services/analysisService';
import { useAuth } from '../contexts/AuthContext';
import {
  AthleteDashboard,
  CoachDashboard,
  StatisticianDashboard,
  TeamManagerDashboard,
} from '../components/dashboards/RoleDashboards';

// Real recent-games trend line (Athlete/Coach/Statistician dashboards'
// "Season Progress" chart), replacing mockData.js's hand-written Sep-Feb
// numbers. Built from GET /games' outcome (backed by game_score_sheet).
// final_score_team_a/b are the raw "Team A"/"Team B" labels straight off
// the FIBA Score Sheet form -- NOT guaranteed to align with home/opponent
// (see backend/src/services/parseScoreSheet.js) -- so which raw score is
// "ours" is derived from the already-resolved winningTeamId (max score if
// we won, min if we lost), never guessed from team_a/team_b directly.
// Games with no Score Sheet yet, or an unresolved winner, are left out of
// the trend entirely rather than shown with a fabricated attribution.
function buildPerformanceTrend(games, teamId) {
  if (!teamId) return [];
  return games
    .filter((g) => g.home_team_id === teamId || g.opponent_team_id === teamId)
    .filter((g) => g.outcome && g.outcome.winningTeamId && g.outcome.scoreA !== g.outcome.scoreB)
    .sort((a, b) => (a.game_date < b.game_date ? -1 : a.game_date > b.game_date ? 1 : 0))
    .slice(-6)
    .map((g) => {
      const weWon = g.outcome.winningTeamId === teamId;
      const scores = [g.outcome.scoreA, g.outcome.scoreB];
      return {
        name: new Date(g.game_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        points: weWon ? Math.max(...scores) : Math.min(...scores),
        opponentPoints: weWon ? Math.min(...scores) : Math.max(...scores),
      };
    });
}

export default function Dashboard({ role, selectedSeason, logout, currentUser }) {
  const { currentUser: authUser, activeTeam } = useAuth();
  const user = currentUser || authUser;
  const [matches, setMatches] = useState([]);
  const [analysisEntries, setAnalysisEntries] = useState([]);
  const [reports, setReports] = useState([]);
  const [performance, setPerformance] = useState([]);

  useEffect(() => {
    setMatches(getMatches());
    setAnalysisEntries(getAnalysisEntries());
    setReports(getImportedReports());
  }, []);

  useEffect(() => {
    if (!activeTeam?.id) { setPerformance([]); return undefined; }
    let cancelled = false;
    backendApi.getGames()
      .then((games) => { if (!cancelled) setPerformance(buildPerformanceTrend(games, activeTeam.id)); })
      .catch(() => { if (!cancelled) setPerformance([]); });
    return () => { cancelled = true; };
  }, [activeTeam?.id]);

  // Real team name (AuthContext's activeTeam, already backed by a real
  // teams row -- see backend/src/middleware/auth.js's getUserTeams),
  // replacing mockData.js's getTeamData lookup (Step 9 investigation
  // flagged this: a real team id essentially never matched the mock's 4
  // hardcoded keys, silently falling back to the 'usiu-men' entry for
  // every user regardless of role or actual team).
  //
  // performanceEmptyReason: an empty data.performance array is ambiguous
  // on its own -- it means something different depending on WHY it's
  // empty, and the chart can't tell those apart just by looking at an
  // empty array. 'no-team' covers the account authService.js's local
  // demo-login fallback produces (no `teams` on currentUser at all, e.g.
  // logging in with the login page's own pre-filled manager@courtiq.com/
  // demo123, which isn't a real backend account -- see authService.js's
  // demo fallback path), where activeTeam is null and GET /games is never
  // even called. 'no-games' covers a real team with no games that have a
  // resolved Score Sheet outcome yet -- a real, valid, honest state for a
  // new or still-in-progress season. Both used to render as the exact
  // same bare, unexplained empty chart.
  const data = useMemo(() => ({
    profile: { name: activeTeam?.name || 'Your Team' },
    performance,
    performanceEmptyReason: !activeTeam?.id ? 'no-team' : (performance.length === 0 ? 'no-games' : null),
  }), [activeTeam?.id, activeTeam?.name, performance]);

  const summary = useMemo(() => {
    const upcoming = matches.filter((match) => match.status === 'Scheduled' || match.status === 'Live').length;
    const live = matches.filter((match) => match.status === 'Live').length;
    const completed = matches.filter((match) => match.status === 'Completed').length;
    return { upcoming, live, completed, total: matches.length };
  }, [matches]);

  const userName = user?.name?.split(' ')[0] || role || 'there';
  const dashboardProps = {
    data, summary, matches, analysisEntries, reports, userName,
    // Staff-curated (backend PATCH /users/:userId/photo) -- read-only
    // here, HeroBanner just displays it. Falls back to the initial-letter
    // avatar automatically when unset.
    photoUrl: user?.photoUrl,
    season: selectedSeason,
  };

  const roleDashboard = {
    Athlete: <AthleteDashboard {...dashboardProps} />,
    Coach: <CoachDashboard {...dashboardProps} />,
    Statistician: <StatisticianDashboard {...dashboardProps} />,
    'Team Manager': <TeamManagerDashboard {...dashboardProps} />,
  };

  return (
    <Layout
      role={role}
      selectedSeason={selectedSeason}
      logout={logout}
      currentUser={user}
    >
      {roleDashboard[role] || roleDashboard.Statistician}
    </Layout>
  );
}
