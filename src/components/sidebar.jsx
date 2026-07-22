import { NavLink, useLocation } from 'react-router-dom';
import { Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Typography, Divider, Avatar, useTheme, Button } from '@mui/material';
import { isRouteAllowed } from '../auth/roleAccess';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import SportsBasketballRoundedIcon from '@mui/icons-material/SportsBasketballRounded';
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import BusinessRoundedIcon from '@mui/icons-material/BusinessRounded';
import ArticleRoundedIcon from '@mui/icons-material/ArticleRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';

const navItems = [
  { label: 'Dashboard', path: '/dashboard', icon: DashboardRoundedIcon },
  { label: 'Teams', path: '/teams', icon: GroupsRoundedIcon },
  { label: 'Players', path: '/players', icon: PersonRoundedIcon },
  { label: 'Games', path: '/games', icon: SportsBasketballRoundedIcon },
  { label: 'Statistics', path: '/statistics', icon: BarChartRoundedIcon },
  { label: 'AI Analysis', path: '/analysis', icon: AutoAwesomeRoundedIcon },
  { label: 'Institutions', path: '/institutions', icon: BusinessRoundedIcon },
  { label: 'Leagues', path: '/leagues', icon: SchoolRoundedIcon },
  { label: 'Seasons', path: '/seasons', icon: CalendarMonthRoundedIcon },
  { label: 'Reports', path: '/reports', icon: ArticleRoundedIcon },
  { label: 'Settings', path: '/settings', icon: SettingsRoundedIcon },
];

function Sidebar({ role, selectedSeason, logout }) {
  const location = useLocation();
  const theme = useTheme();
  const allowedItems = navItems.filter((item) => isRouteAllowed(role, item.path));

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: 260,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: 260,
          boxSizing: 'border-box',
          bgcolor: theme.palette.mode === 'dark' ? '#0b1220' : '#f8fafc',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          color: 'text.primary',
          p: 2,
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Avatar sx={{ bgcolor: 'primary.main', width: 42, height: 42 }}>CI</Avatar>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>CourtIQ</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Basketball analytics</Typography>
        </Box>
      </Box>

      <Divider sx={{ borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)', mb: 2 }} />

      <List>
        {allowedItems.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.path;
          return (
            <ListItemButton
              key={item.path}
              component={NavLink}
              to={item.path}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                bgcolor: active ? 'rgba(255,122,26,0.16)' : 'transparent',
                color: active ? 'primary.main' : 'text.secondary',
                '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)' },
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>
                <Icon />
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          );
        })}
      </List>

      <Box sx={{ mt: 'auto', p: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)', borderRadius: 3 }}>
        <Typography variant="subtitle2" sx={{ color: 'text.primary', fontWeight: 600 }}>Role: {role || 'Statistician'}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>Season: {selectedSeason || '2026/27'}</Typography>
        <Button startIcon={<LogoutRoundedIcon />} fullWidth sx={{ mt: 2 }} onClick={logout}>
          Logout
        </Button>
      </Box>
    </Drawer>
  );
}

export default Sidebar;
