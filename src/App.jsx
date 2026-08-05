import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';

import { useAuth } from './contexts/AuthContext';
import { useThemePreferences } from './contexts/ThemeContext';
import Login from './pages/login';
import Dashboard from './pages/Dashboard';
import Teams from './pages/teams';
import Players from './pages/players';
import Games from './pages/games';
import Statistics from './pages/statistics';
import Analysis from './pages/analysis';
import AnalysisImport from './pages/analysis-import';
import BulkImport from './pages/bulk-import';
import OpponentAnalysis from './pages/opponent-analysis';
import Settings from './pages/settings';
import Profile from './pages/profile';
import Institutions from './pages/institutions';
import Leagues from './pages/leagues';
import Seasons from './pages/seasons';
import Reports from './pages/reports';
import Account from './pages/account';
import Users from './pages/users';
import Organizations from './pages/organizations';
import LeaguesManagement from './pages/leagues-management';
import SeasonsManagement from './pages/seasons-management';
import TeamsManagement from './pages/teams-management';
import PlayersManagement from './pages/players-management';
import { isRouteAllowed } from './auth/roleAccess';

const initialInstitutions = [
  { id: 'usiu', name: 'USIU', location: 'Nairobi, Kenya', teams: ['USIU Tigers (Men)', 'USIU Flames (Women)'] },
];

const initialLeagues = [
  { id: 1, name: 'Nairobi Basketball League', category: 'Men', season: '2026/27', description: "Premier men's competition for college and club teams." },
  { id: 2, name: 'Women Premier League', category: 'Women', season: '2026/27', description: "Elite women's competition for university and club sides." },
];

const initialSeasons = [
  { id: '2025/26', name: '2025/26', active: false },
  { id: '2026/27', name: '2026/27', active: true },
];

const initialReports = [
  { id: 1, name: 'USIU vs Strathmore Box Score.pdf', type: 'Box Score', uploadedAt: 'Today • 08:40' },
];

function ProtectedRoute({ children, allowedPath }) {
  const { isAuthenticated, role } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  if (allowedPath && !isRouteAllowed(role, allowedPath)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function ThemedApp() {
  const { muiThemeOptions } = useThemePreferences();
  const theme = useMemo(() => createTheme(muiThemeOptions), [muiThemeOptions]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppRoutes />
    </ThemeProvider>
  );
}

function AppRoutes() {
  const [selectedTeam, setSelectedTeam] = useState('usiu-men');
  const [selectedInstitution, setSelectedInstitution] = useState('usiu');
  const [selectedLeague, setSelectedLeague] = useState('Nairobi Basketball League');
  const [selectedSeason, setSelectedSeason] = useState('2026/27');
  const [selectedGame, setSelectedGame] = useState('all');
  const [institutions, setInstitutions] = useState(initialInstitutions);
  const [leagues, setLeagues] = useState(initialLeagues);
  const [seasons, setSeasons] = useState(initialSeasons);
  const [reports, setReports] = useState(initialReports);
  const { role, currentUser, logout } = useAuth();

  useEffect(() => {
    const savedTeam = window.localStorage.getItem('courtiq-team');
    if (savedTeam) setSelectedTeam(savedTeam);
    const savedInstitution = window.localStorage.getItem('courtiq-institution');
    if (savedInstitution) setSelectedInstitution(savedInstitution);
    const savedLeague = window.localStorage.getItem('courtiq-league');
    if (savedLeague) setSelectedLeague(savedLeague);
    const savedSeason = window.localStorage.getItem('courtiq-season');
    if (savedSeason) setSelectedSeason(savedSeason);
  }, []);

  useEffect(() => {
    window.localStorage.setItem('courtiq-reports', JSON.stringify(reports));
  }, [reports]);

  useEffect(() => {
    window.localStorage.setItem('courtiq-team', selectedTeam);
  }, [selectedTeam]);

  useEffect(() => {
    window.localStorage.setItem('courtiq-institution', selectedInstitution);
  }, [selectedInstitution]);

  useEffect(() => {
    window.localStorage.setItem('courtiq-league', selectedLeague);
  }, [selectedLeague]);

  useEffect(() => {
    window.localStorage.setItem('courtiq-season', selectedSeason);
  }, [selectedSeason]);

  const sharedProps = {
    selectedTeam,
    onTeamChange: setSelectedTeam,
    selectedInstitution,
    onInstitutionChange: setSelectedInstitution,
    selectedLeague,
    onLeagueChange: setSelectedLeague,
    selectedSeason,
    onSeasonChange: setSelectedSeason,
    role: role || currentUser?.role || 'Statistician',
    currentUser,
    logout,
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<ProtectedRoute allowedPath="/dashboard"><Dashboard {...sharedProps} /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute allowedPath="/profile"><Profile {...sharedProps} /></ProtectedRoute>} />
        <Route path="/teams" element={<ProtectedRoute allowedPath="/teams"><Teams {...sharedProps} institutions={institutions} setInstitutions={setInstitutions} /></ProtectedRoute>} />
        <Route path="/players" element={<ProtectedRoute allowedPath="/players"><Players {...sharedProps} /></ProtectedRoute>} />
        <Route path="/games" element={<ProtectedRoute allowedPath="/games"><Games {...sharedProps} reports={reports} /></ProtectedRoute>} />
        <Route path="/statistics" element={<ProtectedRoute allowedPath="/statistics"><Statistics {...sharedProps} selectedGame={selectedGame} onGameChange={setSelectedGame} /></ProtectedRoute>} />
        <Route path="/analysis" element={<ProtectedRoute allowedPath="/analysis"><Analysis {...sharedProps} /></ProtectedRoute>} />
        <Route path="/analysis-import" element={<ProtectedRoute allowedPath="/analysis-import"><AnalysisImport {...sharedProps} /></ProtectedRoute>} />
        <Route path="/bulk-import" element={<ProtectedRoute allowedPath="/bulk-import"><BulkImport {...sharedProps} /></ProtectedRoute>} />
        <Route path="/opponent-analysis" element={<ProtectedRoute allowedPath="/opponent-analysis"><OpponentAnalysis {...sharedProps} /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute allowedPath="/settings"><Settings {...sharedProps} /></ProtectedRoute>} />
        <Route path="/institutions" element={<ProtectedRoute allowedPath="/institutions"><Institutions {...sharedProps} institutions={institutions} setInstitutions={setInstitutions} /></ProtectedRoute>} />
        <Route path="/leagues" element={<ProtectedRoute allowedPath="/leagues"><Leagues {...sharedProps} leagues={leagues} setLeagues={setLeagues} /></ProtectedRoute>} />
        <Route path="/seasons" element={<ProtectedRoute allowedPath="/seasons"><Seasons {...sharedProps} seasons={seasons} setSeasons={setSeasons} /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute allowedPath="/reports"><Reports {...sharedProps} reports={reports} setReports={setReports} /></ProtectedRoute>} />
        <Route path="/account" element={<Account {...sharedProps} />} />
        <Route path="/users" element={<ProtectedRoute allowedPath="/users"><Users {...sharedProps} /></ProtectedRoute>} />
        <Route path="/organizations" element={<ProtectedRoute allowedPath="/organizations"><Organizations {...sharedProps} /></ProtectedRoute>} />
        <Route path="/leagues-management" element={<ProtectedRoute allowedPath="/leagues-management"><LeaguesManagement {...sharedProps} /></ProtectedRoute>} />
        <Route path="/seasons-management" element={<ProtectedRoute allowedPath="/seasons-management"><SeasonsManagement {...sharedProps} /></ProtectedRoute>} />
        <Route path="/teams-management" element={<ProtectedRoute allowedPath="/teams-management"><TeamsManagement {...sharedProps} /></ProtectedRoute>} />
        <Route path="/players-management" element={<ProtectedRoute allowedPath="/players-management"><PlayersManagement {...sharedProps} /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

function App() {
  return <ThemedApp />;
}

export default App;
