import { Box } from '@mui/material';
import RoleBackground from './RoleBackground';
import Sidebar from './sidebar';
import Topbar from './topbar';
import { useAuth } from '../contexts/AuthContext';

export default function Layout({ children, role, selectedInstitution, selectedLeague, selectedSeason, logout }) {
  const { currentUser } = useAuth();

  return (
    <Box sx={{ minHeight: '100vh', position: 'relative' }}>
      <RoleBackground role={role} />

      <Sidebar role={role} selectedSeason={selectedSeason} logout={logout} currentUser={currentUser} />

      <Box
        component="main"
        sx={{
          position: 'relative',
          zIndex: 1,
          minHeight: '100vh',
          pl: { xs: 2, md: 'calc(var(--sidebar-width, 260px) + 24px)' },
          pr: { xs: 2, md: 3 },
          pt: { xs: 2, md: 3 },
          pb: 4,
          transition: 'padding-left 0.3s ease',
        }}
      >
        <Topbar
          role={role}
          selectedInstitution={selectedInstitution}
          selectedLeague={selectedLeague}
          selectedSeason={selectedSeason}
          currentUser={currentUser}
        />
        <Box sx={{ pt: 1 }} className="fade-in-up">{children}</Box>
      </Box>
    </Box>
  );
}
