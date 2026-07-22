import { Box } from '@mui/material';
import Sidebar from './sidebar';
import Topbar from './topbar';

export default function Layout({ children, mode, toggleTheme, selectedTeam, onTeamChange, role, selectedInstitution, selectedLeague, selectedSeason, logout }) {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Sidebar role={role} selectedSeason={selectedSeason} logout={logout} />

      <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 3 }, bgcolor: 'background.default' }}>
        <Topbar mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedInstitution={selectedInstitution} selectedLeague={selectedLeague} selectedSeason={selectedSeason} />
        <Box sx={{ pt: 1 }}>{children}</Box>
      </Box>
    </Box>
  );
}