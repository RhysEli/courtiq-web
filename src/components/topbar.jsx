import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, IconButton, Badge, Avatar, Stack, FormControl, Select, MenuItem,
  Menu, Button, CircularProgress, Divider, alpha, useTheme,
} from '@mui/material';
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import { useThemePreferences } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { getRoleTheme } from '../theme/themeConfig';
import { backendApi } from '../api/client';

// Step 58 Phase 2: real, per-user notifications, replacing the bell's old
// hardcoded badgeContent={3} (a static literal with no onClick at all --
// confirmed dead UI, Step 56 investigation). Row styling below follows
// this app's own established "short timestamped record" list pattern
// (the Coach/Season/Player notes boxes already used throughout
// team-insights.jsx: bordered Box, body text, caption timestamp) rather
// than audit-log.jsx's wide 5-column table, which doesn't fit a ~360px
// dropdown -- but the empty-state phrasing ("No notifications yet.")
// matches audit-log.jsx's own "No audit log entries yet." convention
// exactly, and unread rows use this app's existing fontWeight:700
// emphasis convention (same as sidebar.jsx's active nav item) plus a
// small accent dot, rather than inventing a new visual language.
function notificationTargetUrl(n) {
  if (n.game_id) return `/statistics?gameId=${n.game_id}`;
  if (n.player_identity_review_id) return '/players-management';
  // report_id: no trigger writes this yet (Phase 3, not built) -- best
  // effort only, genuinely untested, since no real notification can
  // carry this today.
  if (n.report_id) return '/statistics';
  return null;
}

const UNREAD_POLL_MS = 60_000;

function NotificationsMenu({ teamColors }) {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [anchorEl, setAnchorEl] = useState(null);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState('');

  const refreshUnreadCount = () => {
    backendApi.getUnreadNotificationCount()
      .then((data) => setUnreadCount(data.count))
      .catch(() => {}); // best-effort -- a failed poll just leaves the last known real count showing
  };

  useEffect(() => {
    refreshUnreadCount();
    const interval = setInterval(refreshUnreadCount, UNREAD_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  const openMenu = (event) => {
    setAnchorEl(event.currentTarget);
    setItemsLoading(true);
    setItemsError('');
    backendApi.getNotifications()
      .then(setItems)
      .catch((err) => setItemsError(err.message || 'Could not load notifications.'))
      .finally(() => setItemsLoading(false));
  };
  const closeMenu = () => setAnchorEl(null);

  const handleRowClick = async (n) => {
    if (!n.read_at) {
      // Optimistic: flip this row and the badge immediately, then make the
      // real call -- if it fails, the next real poll/open corrects it,
      // same "don't block the UI on a best-effort write" spirit as the
      // rest of this app's real-time updates.
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i)));
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        await backendApi.markNotificationRead(n.id);
      } catch {
        // real write failed -- leave the optimistic UI as-is, the next
        // poll/open will reconcile against the real server state.
      }
    }
    closeMenu();
    const target = notificationTargetUrl(n);
    if (target) navigate(target);
  };

  const handleMarkAllRead = async () => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((i) => (i.read_at ? i : { ...i, read_at: now })));
    setUnreadCount(0);
    try {
      await backendApi.markAllNotificationsRead();
    } catch {
      refreshUnreadCount(); // reconcile against the real count if the write failed
    }
  };

  return (
    <>
      <IconButton sx={{ color: 'text.secondary' }} onClick={openMenu}>
        <Badge badgeContent={unreadCount} sx={{ '& .MuiBadge-badge': { bgcolor: teamColors.primary, color: '#000' } }}>
          <NotificationsNoneRoundedIcon />
        </Badge>
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 360, maxHeight: 480 } } }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1 }}>
          <Typography fontWeight={700}>Notifications</Typography>
          {items.some((i) => !i.read_at) && (
            <Button size="small" onClick={handleMarkAllRead} sx={{ color: 'var(--user-accent)' }}>
              Mark all read
            </Button>
          )}
        </Stack>
        <Divider />
        {itemsLoading ? (
          <Stack alignItems="center" sx={{ py: 3 }}><CircularProgress size={22} /></Stack>
        ) : itemsError ? (
          <Typography color="error" variant="body2" sx={{ px: 2, py: 2 }}>{itemsError}</Typography>
        ) : items.length === 0 ? (
          <Typography color="text.secondary" variant="body2" sx={{ px: 2, py: 2 }}>No notifications yet.</Typography>
        ) : (
          items.map((n) => (
            <MenuItem key={n.id} onClick={() => handleRowClick(n)} sx={{ whiteSpace: 'normal', alignItems: 'flex-start', py: 1.25 }}>
              {!n.read_at && (
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'var(--user-accent)', mt: 0.75, mr: 1.5, flexShrink: 0 }} />
              )}
              <Box sx={{ minWidth: 0, ml: n.read_at ? 3.5 : 0 }}>
                <Typography variant="body2" fontWeight={n.read_at ? 400 : 700} sx={{ whiteSpace: 'normal' }}>
                  {n.message}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(n.created_at).toLocaleString()}
                </Typography>
              </Box>
            </MenuItem>
          ))
        )}
      </Menu>
    </>
  );
}

function Topbar({ role, selectedInstitution, selectedLeague, selectedSeason, currentUser }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const { mode, toggleTheme, teamColors } = useThemePreferences();
  const { activeTeam, setActiveTeam } = useAuth();
  const teams = currentUser?.teams || [];
  const roleTheme = getRoleTheme(role);
  const isDark = theme.palette.mode === 'dark';
  const userName = currentUser?.name || role || 'User';

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 2,
        mb: 3,
        p: 1.5,
        borderRadius: 3,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        backgroundColor: isDark ? 'rgba(11, 18, 32, 0.45)' : 'rgba(255, 255, 255, 0.45)',
        border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(15,23,42,0.06)',
      }}
    >
      <Box>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
          {selectedInstitution || 'USIU'} • {selectedLeague || 'Nairobi Basketball League'} • {selectedSeason || '2026/27'}
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.3 }}>
          <Typography variant="caption" sx={{ color: roleTheme.glow, fontWeight: 600 }}>{roleTheme.icon}</Typography>
          <Typography variant="body2" fontWeight={600}>{roleTheme.tagline}</Typography>
        </Stack>
      </Box>

      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        {teams.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <Select
              value={activeTeam?.id || ''}
              onChange={(event) => setActiveTeam(event.target.value)}
              sx={{
                color: 'text.primary',
                bgcolor: alpha(teamColors.primary, 0.1),
                borderRadius: 2,
                fontSize: '0.875rem',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha(teamColors.primary, 0.3) },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: teamColors.primary },
              }}
            >
              {teams.map((t) => (
                <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        <IconButton sx={{ color: 'text.secondary' }} onClick={toggleTheme}>
          {mode === 'dark' ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
        </IconButton>

        <NotificationsMenu teamColors={teamColors} />

        {/* Personal accent, not team brand -- this is the logged-in user's
            own initial badge, not a team identity marker, so it reads
            var(--user-accent) rather than the team's real --brand-primary
            or the unrelated local-only teamColors preset. src falls back
            to the letter automatically (MUI Avatar's own behavior) when
            no staff-curated photo has been set -- read-only here, upload
            only ever happens from the staff-facing Users page. */}
        <Avatar
          src={currentUser?.photoUrl || undefined}
          sx={{
            bgcolor: 'var(--user-accent)',
            color: 'var(--user-accent-fg)',
            width: 38,
            height: 38,
            fontWeight: 700,
            border: '2px solid var(--user-accent)',
            cursor: 'pointer',
          }}
          onClick={() => navigate('/profile')}
        >
          {userName.charAt(0).toUpperCase()}
        </Avatar>
      </Stack>
    </Box>
  );
}

export default Topbar;
