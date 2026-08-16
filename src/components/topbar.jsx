import { useNavigate } from 'react-router-dom';
import { Box, Typography, IconButton, Badge, Avatar, Stack, FormControl, Select, MenuItem, alpha, useTheme } from '@mui/material';
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import { teamOptions } from '../data/mockData';
import { useThemePreferences } from '../contexts/ThemeContext';
import { getRoleTheme } from '../theme/themeConfig';

function Topbar({ selectedTeam, onTeamChange, role, selectedInstitution, selectedLeague, selectedSeason, currentUser }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const { mode, toggleTheme, teamColors } = useThemePreferences();
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
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <Select
            value={selectedTeam}
            onChange={(event) => onTeamChange(event.target.value)}
            sx={{
              color: 'text.primary',
              bgcolor: alpha(teamColors.primary, 0.1),
              borderRadius: 2,
              fontSize: '0.875rem',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha(teamColors.primary, 0.3) },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: teamColors.primary },
            }}
          >
            {teamOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <IconButton sx={{ color: 'text.secondary' }} onClick={toggleTheme}>
          {mode === 'dark' ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
        </IconButton>

        <IconButton sx={{ color: 'text.secondary' }}>
          <Badge badgeContent={3} sx={{ '& .MuiBadge-badge': { bgcolor: teamColors.primary, color: '#000' } }}>
            <NotificationsNoneRoundedIcon />
          </Badge>
        </IconButton>

        <Avatar
          sx={{
            bgcolor: alpha(teamColors.primary, 0.2),
            color: 'var(--brand-primary)',
            width: 38,
            height: 38,
            fontWeight: 700,
            border: '2px solid var(--brand-primary)',
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
