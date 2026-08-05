import { Box, Grid, Typography, Switch, FormControlLabel, Button, Stack, ToggleButton, ToggleButtonGroup } from '@mui/material';
import Layout from '../components/layout';
import GlassCard, { GlassCardContent } from '../components/GlassCard';
import { useThemePreferences } from '../contexts/ThemeContext';
import { TEAM_PRESETS } from '../theme/themeConfig';
import { useNavigate } from 'react-router-dom';
import PaletteRoundedIcon from '@mui/icons-material/PaletteRounded';
import AccountCircleRoundedIcon from '@mui/icons-material/AccountCircleRounded';

function Settings({ selectedTeam, onTeamChange, role, selectedSeason, logout, currentUser }) {
  const navigate = useNavigate();
  const { mode, toggleTheme, teamColors, teamPreset, setTeamPreset, backgroundIntensity, setBackgroundIntensity } = useThemePreferences();

  return (
    <Layout selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout} currentUser={currentUser}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <GlassCard glowColor={teamColors.primary}>
            <GlassCardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <AccountCircleRoundedIcon sx={{ color: teamColors.primary }} />
                <Typography variant="h6" fontWeight={700}>Profile & Customization</Typography>
              </Stack>
              <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
                Manage your profile, team colors, and visual preferences from your profile page.
              </Typography>
              <Button variant="contained" onClick={() => navigate('/profile')} sx={{ bgcolor: teamColors.primary, color: '#000' }}>
                Open Profile
              </Button>
            </GlassCardContent>
          </GlassCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <GlassCard glowColor={teamColors.secondary}>
            <GlassCardContent>
              <Typography variant="h6" fontWeight={700}>Theme</Typography>
              <FormControlLabel control={<Switch checked={mode === 'dark'} onChange={toggleTheme} />} label={mode === 'dark' ? 'Dark mode' : 'Light mode'} sx={{ mt: 2, display: 'block' }} />

              <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Quick Team Preset</Typography>
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                {Object.values(TEAM_PRESETS).slice(0, 4).map((preset) => (
                  <Box
                    key={preset.id}
                    onClick={() => setTeamPreset(preset.id)}
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      bgcolor: preset.primary,
                      cursor: 'pointer',
                      border: teamPreset === preset.id ? '3px solid #fff' : '2px solid transparent',
                      boxShadow: teamPreset === preset.id ? `0 0 12px ${preset.primary}` : 'none',
                    }}
                  />
                ))}
              </Stack>
            </GlassCardContent>
          </GlassCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <GlassCard>
            <GlassCardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <PaletteRoundedIcon />
                <Typography variant="h6" fontWeight={700}>Background Intensity</Typography>
              </Stack>
              <ToggleButtonGroup value={backgroundIntensity} exclusive onChange={(_, val) => val && setBackgroundIntensity(val)} size="small">
                <ToggleButton value="subtle">Subtle</ToggleButton>
                <ToggleButton value="medium">Medium</ToggleButton>
                <ToggleButton value="vivid">Vivid</ToggleButton>
              </ToggleButtonGroup>
            </GlassCardContent>
          </GlassCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <GlassCard>
            <GlassCardContent>
              <Typography variant="h6" fontWeight={700}>Notifications</Typography>
              <FormControlLabel control={<Switch defaultChecked />} label="Game reminders" sx={{ mt: 2, display: 'block' }} />
              <FormControlLabel control={<Switch defaultChecked />} label="AI analysis updates" sx={{ display: 'block' }} />
              <Button variant="outlined" sx={{ mt: 2 }}>Save preferences</Button>
            </GlassCardContent>
          </GlassCard>
        </Grid>
      </Grid>
    </Layout>
  );
}

export default Settings;
