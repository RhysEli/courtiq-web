import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout';
import { getTeamData } from '../data/mockData';
import { getMatches } from '../services/matchService';
import { getAnalysisEntries, getImportedReports } from '../services/analysisService';
import { useAuth } from '../contexts/AuthContext';
import {
  AthleteDashboard,
  CoachDashboard,
  StatisticianDashboard,
  TeamManagerDashboard,
} from '../components/dashboards/RoleDashboards';

export default function Dashboard({ role, selectedSeason, logout, currentUser }) {
  const { currentUser: authUser, activeTeam } = useAuth();
  const user = currentUser || authUser;
  // getTeamData is still the old 4-key mock lookup (Step 9 investigation) --
  // switching its key from the disconnected mock selectedTeam to the real
  // active team id is consistent with the rest of this sweep, but the
  // underlying data stays mock either way since real team ids essentially
  // never match the mock's hardcoded keys; it falls back to the 'usiu-men'
  // entry same as before.
  const data = getTeamData(activeTeam?.id);
  const [matches, setMatches] = useState([]);
  const [analysisEntries, setAnalysisEntries] = useState([]);
  const [reports, setReports] = useState([]);

  useEffect(() => {
    setMatches(getMatches());
    setAnalysisEntries(getAnalysisEntries());
    setReports(getImportedReports());
  }, []);

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
    season: selectedSeason || data.profile.season,
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
