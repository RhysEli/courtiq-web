import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout';
import { backendApi } from '../api/client';
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

  // Step 37/38: every dashboard tile below is now backed by real data, not
  // the old localStorage mock store (matchService/analysisService) --
  // sourced from the SAME real GET /games payload already fetched here for
  // the performance chart, plus a handful of already-existing endpoints
  // (getTeamPlayers, getUsers, getGameAnalysis, getAnnotations). No new
  // backend routes needed for any of this -- see Step 37's investigation
  // for the per-tile classification that established each of these was
  // already queryable.
  const [games, setGames] = useState([]);
  useEffect(() => {
    if (!activeTeam?.id) { setGames([]); return undefined; }
    let cancelled = false;
    backendApi.getGames()
      .then((data) => { if (!cancelled) setGames(data); })
      .catch(() => { if (!cancelled) setGames([]); });
    return () => { cancelled = true; };
  }, [activeTeam?.id]);

  // getGames() is already scoped server-side to every real team on this
  // user's token (req.user.teamIds), not just activeTeam -- a Team Manager
  // with several real teams gets all of their games back in one call. Most
  // tiles are framed around the single currently-selected team though, so
  // teamGames narrows to that for everything except Organization Overview
  // (TeamManagerDashboard), which deliberately uses the unfiltered `games`
  // to show every real team the manager actually has.
  const teamGames = useMemo(
    () => games.filter((g) => g.home_team_id === activeTeam?.id || g.opponent_team_id === activeTeam?.id),
    [games, activeTeam?.id],
  );

  const performance = useMemo(() => buildPerformanceTrend(games, activeTeam?.id), [games, activeTeam?.id]);

  // completed: has a real resolved outcome (a Score Sheet was extracted and
  // its winner matched to one of this game's own two sides). upcoming:
  // everything else -- no live/in-progress concept exists anywhere in the
  // real schema (games.status is awaiting_reports/extracted/analyzed, a
  // reporting-pipeline state, not a live-game tracker), so this covers both
  // "hasn't been played yet" and "played but no Score Sheet uploaded yet"
  // honestly as one real "not yet resolved" bucket, rather than guessing
  // at a live/in-progress split the data can't actually support.
  const summary = useMemo(() => {
    const completed = teamGames.filter((g) => g.outcome != null).length;
    return { upcoming: teamGames.length - completed, completed, total: teamGames.length };
  }, [teamGames]);

  // Coach's "Win Rate" tile -- real wins/losses among this team's real
  // resolved games (outcome.winningTeamId already resolved server-side
  // against this game's own two real sides, see games.js's comment on
  // getGameWithReportStatus). null (not 0%) when there are no resolved
  // games yet, an honestly-undefined rate rather than a fabricated 0%.
  const winRate = useMemo(() => {
    const resolved = teamGames.filter((g) => g.outcome != null);
    if (resolved.length === 0) return null;
    const wins = resolved.filter((g) => g.outcome.winningTeamId === activeTeam?.id).length;
    return Math.round((wins / resolved.length) * 100);
  }, [teamGames, activeTeam?.id]);

  const todayStr = new Date().toISOString().slice(0, 10);
  // nextGame: nearest real future game (for "what's coming up" tiles).
  // latestGame: most recent real game by date regardless of outcome (for
  // "what did we learn" tiles -- insights/notes are tied to whichever game
  // was actually played most recently, not to the next scheduled one).
  const nextGame = useMemo(() => {
    const upcomingSorted = teamGames
      .filter((g) => g.game_date && g.game_date >= todayStr)
      .sort((a, b) => (a.game_date < b.game_date ? -1 : 1));
    return upcomingSorted[0] || null;
  }, [teamGames, todayStr]);
  const latestGame = useMemo(() => {
    const sorted = [...teamGames].sort((a, b) => (a.game_date < b.game_date ? 1 : -1));
    return sorted[0] || null;
  }, [teamGames]);
  const upcomingGames = useMemo(
    () => teamGames.filter((g) => g.outcome == null).sort((a, b) => (a.game_date < b.game_date ? -1 : 1)).slice(0, 4),
    [teamGames],
  );

  // Roster (real `players` rows for the active team) -- Coach's "Roster"
  // tile. Existing endpoint (backend/src/routes/players.js), just never
  // called from this page before.
  const [roster, setRoster] = useState([]);
  useEffect(() => {
    if (!activeTeam?.id) { setRoster([]); return undefined; }
    let cancelled = false;
    backendApi.getTeamPlayers(activeTeam.id)
      .then((data) => { if (!cancelled) setRoster(data); })
      .catch(() => { if (!cancelled) setRoster([]); });
    return () => { cancelled = true; };
  }, [activeTeam?.id]);

  // Staff (real `users` sharing this team, role Coach/Statistician) --
  // Team Manager's "Staff Members" tile only. GET /users is STAFF_ROLES-
  // gated server-side (Statistician/Team Manager) -- only fetched for
  // Team Manager here, since that's the only dashboard that shows it.
  const [staff, setStaff] = useState([]);
  useEffect(() => {
    if (role !== 'Team Manager' || !activeTeam?.id) { setStaff([]); return undefined; }
    let cancelled = false;
    backendApi.getUsers()
      .then((data) => { if (!cancelled) setStaff(data); })
      .catch(() => { if (!cancelled) setStaff([]); });
    return () => { cancelled = true; };
  }, [role, activeTeam?.id]);
  const staffCount = useMemo(
    () => staff.filter((u) => (u.role === 'Coach' || u.role === 'Statistician') && (u.teams || []).some((t) => t.id === activeTeam?.id)).length,
    [staff, activeTeam?.id],
  );

  // Real insight tags (backend/src/services/metrics.js's tagInsights,
  // already computed/stored whenever /analysis/games/:id/compute has run)
  // for the most recently-played real game -- Coach's "AI Coaching
  // Recommendations" tile. Empty array (not an error) whenever metrics
  // haven't been computed for that game yet -- an honest, real "nothing
  // yet" state, same as analysis.jsx's own FR-13 section already treats it.
  const [insightTags, setInsightTags] = useState([]);
  useEffect(() => {
    if (!latestGame?.id) { setInsightTags([]); return undefined; }
    let cancelled = false;
    backendApi.getGameAnalysis(latestGame.id)
      .then((data) => { if (!cancelled) setInsightTags(data.insightTags || []); })
      .catch(() => { if (!cancelled) setInsightTags([]); });
    return () => { cancelled = true; };
  }, [latestGame?.id]);

  // Real annotations (the same `annotations` table/route analysis.jsx's
  // FR-09 section already uses) on the most recently-played real game --
  // Athlete's "Team Notes" tile (renamed from "Coach Notes for You": these
  // are real notes on the team's games, not personally targeted at this
  // athlete -- no user<->player identity link exists anywhere in the
  // schema to make that personalization real).
  const [teamNotes, setTeamNotes] = useState([]);
  useEffect(() => {
    if (!latestGame?.id) { setTeamNotes([]); return undefined; }
    let cancelled = false;
    backendApi.getAnnotations(latestGame.id)
      .then((data) => { if (!cancelled) setTeamNotes(data); })
      .catch(() => { if (!cancelled) setTeamNotes([]); });
    return () => { cancelled = true; };
  }, [latestGame?.id]);

  // Real reports count + extraction accuracy (Statistician's "Reports"/
  // "Accuracy" tiles), derived from the SAME reportChecklist every real
  // game in `teamGames` already carries (backend/src/routes/games.js's
  // getGameWithReportStatus) -- no new endpoint needed for the count/rate,
  // only for the actual per-report list (Phase 2's "Recent Reports").
  const reportsSummary = useMemo(() => {
    let uploaded = 0;
    let extracted = 0;
    for (const g of teamGames) {
      for (const r of (g.reportChecklist || [])) {
        if (r.uploaded) {
          uploaded += 1;
          if (r.status === 'extracted') extracted += 1;
        }
      }
    }
    return { count: uploaded, accuracyPct: uploaded > 0 ? Math.round((extracted / uploaded) * 100) : null };
  }, [teamGames]);

  // Real per-team game counts across every real team this Team Manager
  // actually has (user.teams, already loaded at login -- see AuthContext)
  // -- Organization Overview, deliberately using the unfiltered `games`
  // list (every real team combined), not teamGames (activeTeam only).
  const gamesByTeam = useMemo(() => {
    const counts = {};
    for (const t of (user?.teams || [])) counts[t.id] = 0;
    for (const g of games) {
      if (counts[g.home_team_id] !== undefined) counts[g.home_team_id] += 1;
      if (counts[g.opponent_team_id] !== undefined) counts[g.opponent_team_id] += 1;
    }
    return counts;
  }, [games, user?.teams]);

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

  const userName = user?.name?.split(' ')[0] || role || 'there';
  const dashboardProps = {
    data, summary, userName,
    roster, staffCount, insightTags, teamNotes, reportsSummary, winRate,
    nextGame, latestGame, upcomingGames,
    myTeams: user?.teams || [], gamesByTeam,
    // Phase 2 (Step 38) will replace this with a real team-scoped reports
    // list; an empty array here is an honest "nothing loaded yet" state,
    // not a fabricated one -- StatisticianDashboard's existing "No reports
    // imported yet" fallback renders correctly against it either way.
    reports: [],
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
