import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';

import Login from './pages/login';
import Dashboard from './pages/Dashboard';
import Teams from './pages/teams';
import Players from './pages/players';
import Games from './pages/games';
import Statistics from './pages/statistics';
import Analysis from './pages/analysis';
import Settings from './pages/settings';
import Institutions from './pages/institutions';
import Leagues from './pages/leagues';
import Seasons from './pages/seasons';
import Reports from './pages/reports';

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

function App() {
  const [mode, setMode] = useState('dark');
  const [userRole, setUserRole] = useState('Statistician');
  const [selectedTeam, setSelectedTeam] = useState('usiu-men');
  const [selectedInstitution, setSelectedInstitution] = useState('usiu');
  const [selectedLeague, setSelectedLeague] = useState('Nairobi Basketball League');
  const [selectedSeason, setSelectedSeason] = useState('2026/27');
  const [selectedGame, setSelectedGame] = useState('all');
  const [institutions, setInstitutions] = useState(initialInstitutions);
  const [leagues, setLeagues] = useState(initialLeagues);
  const [seasons, setSeasons] = useState(initialSeasons);
  const [reports, setReports] = useState(initialReports);

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
    const savedRole = window.localStorage.getItem('courtiq-role');
    if (savedRole) {
      setUserRole(savedRole);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('courtiq-theme', mode);
  }, [mode]);

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

  useEffect(() => {
    window.localStorage.setItem('courtiq-role', userRole);
  }, [userRole]);

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
          <Route path="/" element={<Login onLogin={setUserRole} />} />
          <Route path="/dashboard" element={<Dashboard mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} selectedInstitution={selectedInstitution} onInstitutionChange={setSelectedInstitution} selectedLeague={selectedLeague} onLeagueChange={setSelectedLeague} selectedSeason={selectedSeason} onSeasonChange={setSelectedSeason} role={userRole} />} />
          <Route path="/teams" element={<Teams mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} selectedInstitution={selectedInstitution} onInstitutionChange={setSelectedInstitution} selectedSeason={selectedSeason} onSeasonChange={setSelectedSeason} role={userRole} institutions={institutions} setInstitutions={setInstitutions} />} />
          <Route path="/players" element={<Players mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} selectedSeason={selectedSeason} role={userRole} />} />
          <Route path="/games" element={<Games mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} selectedSeason={selectedSeason} role={userRole} reports={reports} />} />
          <Route path="/statistics" element={<Statistics mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} selectedInstitution={selectedInstitution} selectedLeague={selectedLeague} selectedSeason={selectedSeason} selectedGame={selectedGame} onGameChange={setSelectedGame} role={userRole} />} />
          <Route path="/analysis" element={<Analysis mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} selectedSeason={selectedSeason} role={userRole} />} />
          <Route path="/settings" element={<Settings mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} role={userRole} />} />
          <Route path="/institutions" element={<Institutions mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} role={userRole} institutions={institutions} setInstitutions={setInstitutions} />} />
          <Route path="/leagues" element={<Leagues mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} role={userRole} leagues={leagues} setLeagues={setLeagues} />} />
          <Route path="/seasons" element={<Seasons mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} role={userRole} seasons={seasons} setSeasons={setSeasons} selectedSeason={selectedSeason} onSeasonChange={setSelectedSeason} />} />
          <Route path="/reports" element={<Reports mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} role={userRole} reports={reports} setReports={setReports} />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;