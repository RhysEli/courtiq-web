import { AppBar, Toolbar, Typography, Box, IconButton, Badge, Avatar, Stack, FormControl, Select, MenuItem, useTheme } from '@mui/material';
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import { alpha } from '@mui/material/styles';
import { teamOptions } from '../data/mockData';

function Topbar({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedInstitution, selectedLeague, selectedSeason }) {
  const theme = useTheme();

  return (
    <AppBar position="static" elevation={0} sx={{ bgcolor: 'transparent', color: 'text.primary', mb: 3 }}>
      <Toolbar disableGutters sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.15) }}>
            <SearchRoundedIcon sx={{ color: 'primary.main' }} />
          </Box>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            {selectedInstitution || 'USIU'} • {selectedLeague || 'Nairobi Basketball League'} • {selectedSeason || '2026/27'}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <Select
              value={selectedTeam}
              onChange={(event) => onTeamChange(event.target.value)}
              sx={{
                color: 'text.primary',
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)',
                borderRadius: 2,
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
              }}
            >
              {teamOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <IconButton sx={{ color: 'text.secondary' }} onClick={toggleTheme}>
            {mode === 'dark' ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
          </IconButton>
          <IconButton sx={{ color: 'text.secondary' }}>
            <Badge badgeContent={3} color="warning">
              <NotificationsNoneRoundedIcon />
            </Badge>
          </IconButton>
          <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36 }}>{(role || 'S').charAt(0).toUpperCase()}</Avatar>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}

export default Topbar;
