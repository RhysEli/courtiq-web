import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';

import { useAuth } from './contexts/AuthContext';
import { useThemePreferences } from './contexts/ThemeContext';
import Login from './pages/login';
import AcceptInvite from './pages/accept-invite';
import ResetPassword from './pages/reset-password';
import Dashboard from './pages/Dashboard';
import Teams from './pages/teams';
import Players from './pages/players';
import Games from './pages/games';
import Statistics from './pages/statistics';
import PlayerDevelopment from './pages/player-development';
import Analysis from './pages/analysis';
import AnalysisImport from './pages/analysis-import';
import BulkImport from './pages/bulk-import';
import OpponentAnalysis from './pages/opponent-analysis';
import Settings from './pages/settings';
import Profile from './pages/profile';
import Institutions from './pages/institutions';
import Competitions from './pages/competitions';
import Seasons from './pages/seasons';
import Reports from './pages/reports';
import Users from './pages/users';
import Organizations from './pages/organizations';
import CompetitionsManagement from './pages/competitions-management';
import SeasonsManagement from './pages/seasons-management';
import TeamsManagement from './pages/teams-management';
import PlayersManagement from './pages/players-management';
import AuditLog from './pages/audit-log';
import TeamBrandSettings from './pages/team-brand-settings';
import { isRouteAllowed } from './auth/roleAccess';

const initialInstitutions = [
  { id: 'usiu', name: 'USIU', location: 'Nairobi, Kenya', teams: ['USIU Tigers (Men)', 'USIU Flames (Women)'] },
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
        <Route path="/accept-invite/:token" element={<AcceptInvite />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
        <Route path="/dashboard" element={<ProtectedRoute allowedPath="/dashboard"><Dashboard {...sharedProps} /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute allowedPath="/profile"><Profile {...sharedProps} /></ProtectedRoute>} />
        <Route path="/teams" element={<ProtectedRoute allowedPath="/teams"><Teams {...sharedProps} institutions={institutions} setInstitutions={setInstitutions} /></ProtectedRoute>} />
        <Route path="/players" element={<ProtectedRoute allowedPath="/players"><Players {...sharedProps} /></ProtectedRoute>} />
        <Route path="/games" element={<ProtectedRoute allowedPath="/games"><Games {...sharedProps} reports={reports} /></ProtectedRoute>} />
        <Route path="/statistics" element={<ProtectedRoute allowedPath="/statistics"><Statistics {...sharedProps} selectedGame={selectedGame} onGameChange={setSelectedGame} /></ProtectedRoute>} />
        <Route path="/player-development" element={<ProtectedRoute allowedPath="/player-development"><PlayerDevelopment {...sharedProps} /></ProtectedRoute>} />
        <Route path="/analysis" element={<ProtectedRoute allowedPath="/analysis"><Analysis {...sharedProps} /></ProtectedRoute>} />
        <Route path="/analysis-import" element={<ProtectedRoute allowedPath="/analysis-import"><AnalysisImport {...sharedProps} /></ProtectedRoute>} />
        <Route path="/bulk-import" element={<ProtectedRoute allowedPath="/bulk-import"><BulkImport {...sharedProps} /></ProtectedRoute>} />
        <Route path="/opponent-analysis" element={<ProtectedRoute allowedPath="/opponent-analysis"><OpponentAnalysis {...sharedProps} /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute allowedPath="/settings"><Settings {...sharedProps} /></ProtectedRoute>} />
        <Route path="/team-brand-settings" element={<ProtectedRoute allowedPath="/team-brand-settings"><TeamBrandSettings {...sharedProps} /></ProtectedRoute>} />
        <Route path="/institutions" element={<ProtectedRoute allowedPath="/institutions"><Institutions {...sharedProps} institutions={institutions} setInstitutions={setInstitutions} /></ProtectedRoute>} />
        <Route path="/competitions" element={<ProtectedRoute allowedPath="/competitions"><Competitions {...sharedProps} /></ProtectedRoute>} />
        <Route path="/seasons" element={<ProtectedRoute allowedPath="/seasons"><Seasons {...sharedProps} seasons={seasons} setSeasons={setSeasons} /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute allowedPath="/reports"><Reports {...sharedProps} reports={reports} setReports={setReports} /></ProtectedRoute>} />
        {/* /account used to render a fake, unauthenticated account/org
            creation flow (accountService.js/localStorage, no real backend
            user row) with no ProtectedRoute wrapper -- reachable by anyone,
            logged in or not. The real, working way to create an account is
            the invite/accept flow (accept-invite.jsx, backend/src/routes/
            invites.js). Redirecting rather than deleting src/pages/account.jsx
            outright -- it's simply unrouted now. */}
        <Route path="/account" element={<Navigate to="/" replace />} />
        <Route path="/users" element={<ProtectedRoute allowedPath="/users"><Users {...sharedProps} /></ProtectedRoute>} />
        <Route path="/organizations" element={<ProtectedRoute allowedPath="/organizations"><Organizations {...sharedProps} /></ProtectedRoute>} />
        <Route path="/competitions-management" element={<ProtectedRoute allowedPath="/competitions-management"><CompetitionsManagement {...sharedProps} /></ProtectedRoute>} />
        <Route path="/seasons-management" element={<ProtectedRoute allowedPath="/seasons-management"><SeasonsManagement {...sharedProps} /></ProtectedRoute>} />
        <Route path="/teams-management" element={<ProtectedRoute allowedPath="/teams-management"><TeamsManagement {...sharedProps} /></ProtectedRoute>} />
        <Route path="/players-management" element={<ProtectedRoute allowedPath="/players-management"><PlayersManagement {...sharedProps} /></ProtectedRoute>} />
        <Route path="/audit-log" element={<ProtectedRoute allowedPath="/audit-log"><AuditLog {...sharedProps} /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

function App() {
  return <ThemedApp />;
}

export default App;