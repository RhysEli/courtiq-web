import { useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Box, List, ListItemButton, ListItemIcon, ListItemText, Typography, Divider, Avatar, Button, Tooltip, IconButton, Stack } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { motion, AnimatePresence } from 'framer-motion';
import { isRouteAllowed } from '../auth/roleAccess';
import { getRoleTheme } from '../theme/themeConfig';
import { useThemePreferences } from '../contexts/ThemeContext';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import PersonAddRoundedIcon from '@mui/icons-material/PersonAddRounded';
import SportsBasketballRoundedIcon from '@mui/icons-material/SportsBasketballRounded';
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import BusinessRoundedIcon from '@mui/icons-material/BusinessRounded';
import ArticleRoundedIcon from '@mui/icons-material/ArticleRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import ManageAccountsRoundedIcon from '@mui/icons-material/ManageAccountsRounded';
import AccountCircleRoundedIcon from '@mui/icons-material/AccountCircleRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import PaletteRoundedIcon from '@mui/icons-material/PaletteRounded';
const navItems = [
  { label: 'Dashboard', path: '/dashboard', icon: DashboardRoundedIcon },
  { label: 'Profile', path: '/profile', icon: AccountCircleRoundedIcon },
  { label: 'Teams', path: '/teams', icon: GroupsRoundedIcon },
  { label: 'Team Management', path: '/teams-management', icon: GroupsRoundedIcon },
  { label: 'Players', path: '/players', icon: PersonRoundedIcon },
  { label: 'Player Management', path: '/players-management', icon: PersonAddRoundedIcon },
  { label: 'Games', path: '/games', icon: SportsBasketballRoundedIcon },
  { label: 'Statistics', path: '/statistics', icon: BarChartRoundedIcon },
  { label: 'Player Development', path: '/player-development', icon: TrendingUpRoundedIcon },
  { label: 'AI Analysis', path: '/analysis', icon: AutoAwesomeRoundedIcon },
  // 'Analysis Import' intentionally removed from nav ahead of the
  // presentation -- most report types on that page are simulated
  // placeholder data (only Box Score has a real backend pipeline, via
  // realAnalysisBridge.js), and Bulk Import already covers everything it
  // does plus 6 more real report types. Route/page code is untouched in
  // App.jsx and roleAccess.js has the same path removed, so direct URL
  // access is blocked too -- not just hidden. Trivially reversible after
  // the presentation if there's a reason to bring it back.
  { label: 'Upload Reports', path: '/bulk-import', icon: ArticleRoundedIcon },
  { label: 'Opponent Analysis', path: '/opponent-analysis', icon: BarChartRoundedIcon },
  { label: 'Users', path: '/users', icon: ManageAccountsRoundedIcon },
  { label: 'Institutions', path: '/institutions', icon: BusinessRoundedIcon },
  { label: 'Leagues', path: '/leagues', icon: SchoolRoundedIcon },
  { label: 'League Management', path: '/leagues-management', icon: SchoolRoundedIcon },
  { label: 'Seasons', path: '/seasons', icon: CalendarMonthRoundedIcon },
  { label: 'Season Management', path: '/seasons-management', icon: CalendarMonthRoundedIcon },
  { label: 'Reports', path: '/reports', icon: ArticleRoundedIcon },
  { label: 'Audit Log', path: '/audit-log', icon: HistoryRoundedIcon },
  { label: 'Settings', path: '/settings', icon: SettingsRoundedIcon },
  { label: 'Team Brand', path: '/team-brand-settings', icon: PaletteRoundedIcon },
];

function Sidebar({ role, selectedSeason, logout, currentUser }) {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const { sidebarCollapsed, toggleSidebar } = useThemePreferences();
  const roleTheme = getRoleTheme(role);
  const allowedItems = navItems.filter((item) => isRouteAllowed(role, item.path));
  const isDark = theme.palette.mode === 'dark';
  const width = sidebarCollapsed ? 72 : 248;

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
  }, [width]);

  const glassStyle = {
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    backgroundColor: isDark ? 'rgba(11, 18, 32, 0.55)' : 'rgba(255, 255, 255, 0.55)',
    border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(15,23,42,0.08)',
    boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 32px rgba(15,23,42,0.1)',
  };

  return (
    <Box
      component={motion.nav}
      animate={{ width }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      sx={{
        position: 'fixed',
        top: 16,
        left: 16,
        bottom: 16,
        zIndex: 1200,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 3,
        overflow: 'hidden',
        ...glassStyle,
      }}
    >
      {/* FIX: side-by-side (Avatar + ml:auto toggle button) doesn't fit in the
          collapsed 72px width -- the button was getting pushed outside the
          visible area and clipped by this container's overflow:hidden,
          making it unreachable once collapsed. Stacking vertically when
          collapsed keeps both elements inside the visible width. */}
      <Box
        sx={{
          p: sidebarCollapsed ? 1 : 2,
          display: 'flex',
          flexDirection: sidebarCollapsed ? 'column' : 'row',
          alignItems: 'center',
          gap: sidebarCollapsed ? 1 : 1.5,
          minHeight: 64,
        }}
      >
        {/* Personal accent, not the local-only Quick Team Preset -- same
            mechanism as the wordmark right next to it and the topbar
            avatar (topbar.jsx). */}
        <Avatar
          sx={{
            bgcolor: 'var(--user-accent)',
            color: 'var(--user-accent-fg)',
            width: sidebarCollapsed ? 40 : 42,
            height: sidebarCollapsed ? 40 : 42,
            fontWeight: 800,
            cursor: 'pointer',
            flexShrink: 0,
          }}
          onClick={() => navigate('/dashboard')}
        >
          CI
        </Avatar>
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, whiteSpace: 'nowrap', color: 'var(--user-accent)' }}>CourtIQ</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>Basketball analytics</Typography>
            </motion.div>
          )}
        </AnimatePresence>
        <IconButton
          size="small"
          onClick={toggleSidebar}
          sx={{ ...(sidebarCollapsed ? {} : { ml: 'auto' }), color: 'text.secondary', flexShrink: 0 }}
        >
          {sidebarCollapsed ? <ChevronRightRoundedIcon /> : <ChevronLeftRoundedIcon />}
        </IconButton>
      </Box>

      <Divider sx={{ borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' }} />

      <List sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', px: 1, py: 1 }}>
        {allowedItems.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.path;
          const button = (
            <ListItemButton
              key={item.path}
              component={NavLink}
              to={item.path}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                minHeight: 44,
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                px: sidebarCollapsed ? 1 : 2,
                // Personal accent, not team brand -- this is a per-user "where
                // am I" affordance, not the team's real visual identity, so it
                // reads var(--user-accent) rather than var(--brand-primary).
                bgcolor: active ? 'color-mix(in srgb, var(--user-accent) 18%, transparent)' : 'transparent',
                color: active ? 'var(--user-accent)' : 'text.secondary',
                borderLeft: active ? '3px solid var(--user-accent)' : '3px solid transparent',
                '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)' },
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: sidebarCollapsed ? 0 : 36, justifyContent: 'center' }}>
                <Icon fontSize="small" />
              </ListItemIcon>
              {!sidebarCollapsed && <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: active ? 700 : 400 }} />}
            </ListItemButton>
          );

          return sidebarCollapsed ? (
            <Tooltip key={item.path} title={item.label} placement="right">
              {button}
            </Tooltip>
          ) : (
            button
          );
        })}
      </List>

      <Box sx={{ p: sidebarCollapsed ? 1 : 2, borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'}` }}>
        {!sidebarCollapsed ? (
          <>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Typography variant="caption" sx={{ color: roleTheme.glow, fontWeight: 700 }}>{roleTheme.icon} {role || 'Statistician'}</Typography>
            </Stack>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Season {selectedSeason || '2026/27'}</Typography>
            <Button startIcon={<LogoutRoundedIcon />} fullWidth size="small" sx={{ mt: 1.5, color: 'text.secondary' }} onClick={logout}>
              Logout
            </Button>
          </>
        ) : (
          <Tooltip title="Logout" placement="right">
            <IconButton onClick={logout} sx={{ color: 'text.secondary', width: '100%' }}>
              <LogoutRoundedIcon />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}

export default Sidebar;