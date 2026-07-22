import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';

import { useAuth } from './contexts/AuthContext';
import Login from './pages/login';
import Dashboard from './pages/Dashboard';
import Teams from './pages/teams';
import Players from './pages/players';
import Games from './pages/games';
import Statistics from './pages/statistics';
import Analysis from './pages/analysis';
import AnalysisImport from './pages/analysis-import';
import OpponentAnalysis from './pages/opponent-analysis';
import Settings from './pages/settings';
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
  { id: 1, name: 'Nairobi Basketball League', category: 'Men', season: '2026/27', description: 'Premier men’s competition for college and club teams.' },
  { id: 2, name: 'Women Premier League', category: 'Women', season: '2026/27', description: 'Elite women’s competition for university and club sides.' },
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

function App() {
  const [mode, setMode] = useState('dark');
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
    const savedMode = window.localStorage.getItem('courtiq-theme');
    if (savedMode) {
      setMode(savedMode);
    }
    const savedTeam = window.localStorage.getItem('courtiq-team');
    if (savedTeam) {
      setSelectedTeam(savedTeam);
    }
    const savedInstitution = window.localStorage.getItem('courtiq-institution');
    if (savedInstitution) {
      setSelectedInstitution(savedInstitution);
    }
    const savedLeague = window.localStorage.getItem('courtiq-league');
    if (savedLeague) {
      setSelectedLeague(savedLeague);
    }
    const savedSeason = window.localStorage.getItem('courtiq-season');
    if (savedSeason) {
      setSelectedSeason(savedSeason);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('courtiq-theme', mode);
  }, [mode]);

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

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: '#ff7a1a' },
          secondary: { main: '#38bdf8' },
          background: {
            default: mode === 'dark' ? '#030712' : '#f8fafc',
            paper: mode === 'dark' ? '#111827' : '#ffffff',
          },
          text: {
            primary: mode === 'dark' ? '#f8fafc' : '#0f172a',
            secondary: mode === 'dark' ? '#9ca3af' : '#475569',
          },
        },
        shape: { borderRadius: 16 },
        components: {
          MuiCard: {
            styleOverrides: {
              root: {
                boxShadow: mode === 'dark' ? '0 20px 45px rgba(0,0,0,0.25)' : '0 14px 36px rgba(15, 23, 42, 0.08)',
                border: mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(15, 23, 42, 0.08)',
              },
            },
          },
        },
      }),
    [mode],
  );

  const toggleTheme = () => {
    setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard" element={<ProtectedRoute allowedPath="/dashboard"><Dashboard mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} selectedInstitution={selectedInstitution} onInstitutionChange={setSelectedInstitution} selectedLeague={selectedLeague} onLeagueChange={setSelectedLeague} selectedSeason={selectedSeason} onSeasonChange={setSelectedSeason} role={role || currentUser?.role || 'Statistician'} logout={logout} /></ProtectedRoute>} />
          <Route path="/teams" element={<ProtectedRoute allowedPath="/teams"><Teams mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} selectedInstitution={selectedInstitution} onInstitutionChange={setSelectedInstitution} selectedSeason={selectedSeason} onSeasonChange={setSelectedSeason} role={role || currentUser?.role || 'Statistician'} institutions={institutions} setInstitutions={setInstitutions} logout={logout} /></ProtectedRoute>} />
          <Route path="/players" element={<ProtectedRoute allowedPath="/players"><Players mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} selectedSeason={selectedSeason} role={role || currentUser?.role || 'Statistician'} logout={logout} /></ProtectedRoute>} />
          <Route path="/games" element={<ProtectedRoute allowedPath="/games"><Games mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} selectedSeason={selectedSeason} role={role || currentUser?.role || 'Statistician'} reports={reports} logout={logout} /></ProtectedRoute>} />
          <Route path="/statistics" element={<ProtectedRoute allowedPath="/statistics"><Statistics mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} selectedInstitution={selectedInstitution} selectedLeague={selectedLeague} selectedSeason={selectedSeason} selectedGame={selectedGame} onGameChange={setSelectedGame} role={role || currentUser?.role || 'Statistician'} logout={logout} /></ProtectedRoute>} />
          <Route path="/analysis" element={<ProtectedRoute allowedPath="/analysis"><Analysis mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} selectedSeason={selectedSeason} role={role || currentUser?.role || 'Statistician'} logout={logout} /></ProtectedRoute>} />
          <Route path="/analysis-import" element={<ProtectedRoute allowedPath="/analysis-import"><AnalysisImport mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} selectedSeason={selectedSeason} role={role || currentUser?.role || 'Statistician'} logout={logout} /></ProtectedRoute>} />
          <Route path="/opponent-analysis" element={<ProtectedRoute allowedPath="/opponent-analysis"><OpponentAnalysis mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} selectedSeason={selectedSeason} role={role || currentUser?.role || 'Statistician'} logout={logout} /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute allowedPath="/settings"><Settings mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} role={role || currentUser?.role || 'Statistician'} logout={logout} /></ProtectedRoute>} />
          <Route path="/institutions" element={<ProtectedRoute allowedPath="/institutions"><Institutions mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} role={role || currentUser?.role || 'Statistician'} institutions={institutions} setInstitutions={setInstitutions} logout={logout} /></ProtectedRoute>} />
          <Route path="/leagues" element={<ProtectedRoute allowedPath="/leagues"><Leagues mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} role={role || currentUser?.role || 'Statistician'} leagues={leagues} setLeagues={setLeagues} logout={logout} /></ProtectedRoute>} />
          <Route path="/seasons" element={<ProtectedRoute allowedPath="/seasons"><Seasons mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} role={role || currentUser?.role || 'Statistician'} seasons={seasons} setSeasons={setSeasons} selectedSeason={selectedSeason} onSeasonChange={setSelectedSeason} logout={logout} /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute allowedPath="/reports"><Reports mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} role={role || currentUser?.role || 'Statistician'} reports={reports} setReports={setReports} logout={logout} /></ProtectedRoute>} />
          <Route path="/account" element={<Account mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} role={role || currentUser?.role || 'Statistician'} selectedSeason={selectedSeason} logout={logout} />} />
          <Route path="/users" element={<ProtectedRoute allowedPath="/users"><Users mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} role={role || currentUser?.role || 'Statistician'} selectedSeason={selectedSeason} logout={logout} /></ProtectedRoute>} />
          <Route path="/organizations" element={<ProtectedRoute allowedPath="/organizations"><Organizations mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} role={role || currentUser?.role || 'Statistician'} selectedSeason={selectedSeason} logout={logout} /></ProtectedRoute>} />
          <Route path="/leagues-management" element={<ProtectedRoute allowedPath="/leagues-management"><LeaguesManagement mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} role={role || currentUser?.role || 'Statistician'} selectedSeason={selectedSeason} logout={logout} /></ProtectedRoute>} />
          <Route path="/seasons-management" element={<ProtectedRoute allowedPath="/seasons-management"><SeasonsManagement mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} role={role || currentUser?.role || 'Statistician'} selectedSeason={selectedSeason} logout={logout} /></ProtectedRoute>} />
          <Route path="/teams-management" element={<ProtectedRoute allowedPath="/teams-management"><TeamsManagement mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} role={role || currentUser?.role || 'Statistician'} selectedSeason={selectedSeason} logout={logout} /></ProtectedRoute>} />
          <Route path="/players-management" element={<ProtectedRoute allowedPath="/players-management"><PlayersManagement mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} role={role || currentUser?.role || 'Statistician'} selectedSeason={selectedSeason} logout={logout} /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;