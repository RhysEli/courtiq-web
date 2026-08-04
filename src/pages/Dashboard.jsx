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

export default function Dashboard({ selectedTeam, onTeamChange, role, selectedSeason, logout, currentUser }) {
  const { currentUser: authUser } = useAuth();
  const user = currentUser || authUser;
  const data = getTeamData(selectedTeam);
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
  const dashboardProps = { data, summary, matches, analysisEntries, reports, userName, season: selectedSeason || data.profile.season };

  const roleDashboard = {
    Athlete: <AthleteDashboard {...dashboardProps} />,
    Coach: <CoachDashboard {...dashboardProps} />,
    Statistician: <StatisticianDashboard {...dashboardProps} />,
    'Team Manager': <TeamManagerDashboard {...dashboardProps} />,
  };

  return (
    <Layout
      selectedTeam={selectedTeam}
      onTeamChange={onTeamChange}
      role={role}
      selectedSeason={selectedSeason}
      logout={logout}
      currentUser={user}
    >
      {roleDashboard[role] || roleDashboard.Statistician}
    </Layout>
  );
}
