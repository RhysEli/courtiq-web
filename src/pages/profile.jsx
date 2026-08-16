import { useState } from 'react';
import { Box, Grid, Typography, Switch, FormControlLabel, TextField, Stack, Avatar, Chip, ToggleButton, ToggleButtonGroup, ThemeProvider, createTheme } from '@mui/material';
import { motion } from 'framer-motion';
import Layout from '../components/layout';
import GlassCard, { GlassCardContent } from '../components/GlassCard';
import { useAuth } from '../contexts/AuthContext';
import { useThemePreferences } from '../contexts/ThemeContext';
import { getRoleTheme } from '../theme/themeConfig';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';

// Accent footprint expansion: the dark-mode Switch and Background Intensity
// ToggleButtonGroup below duplicate settings.jsx's Theme mode / Background
// Intensity controls (same underlying preference, different entry point),
// so they pick up the same var(--user-accent) selected-state styling for
// consistency -- personal-preference-panel UI only, no team data touched.
// Solid fill + computed --user-accent-fg foreground (not a translucent
// self-tint), same reasoning as settings.jsx's ACCENT_TOGGLE_SX: a pale
// accent rendered as its own color on a faint tint of itself barely reads
// as "selected" at all.
const ACCENT_TOGGLE_SX = {
  '& .MuiToggleButton-root.Mui-selected': {
    bgcolor: 'var(--user-accent)',
    color: 'var(--user-accent-fg)',
    borderColor: 'var(--user-accent)',
  },
  '& .MuiToggleButton-root.Mui-selected:hover': {
    bgcolor: 'var(--user-accent)',
    filter: 'brightness(0.92)',
  },
};
const ACCENT_SWITCH_SX = {
  '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--user-accent)' },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: 'var(--user-accent)', opacity: 0.5 },
};

// TextField/OutlinedInput's focus ring follows theme.palette.primary by
// default -- itself bound app-wide to the local Quick Team Preset (see
// buildMuiTheme in theme/themeConfig.js), same root cause as everything
// else in this sweep. But palette.primary backs a LOT more than focus
// rings across the app (104 TextFields, 20+ contained Buttons that don't
// already have an explicit accent override, checkboxes/radios/tabs/
// progress spinners/sliders in 20-30+ files) -- reassigning it wholesale
// would silently recolor all of that, unaudited, just to fix four text
// fields on this one page. A nested ThemeProvider scopes the override to
// just the "Profile Details" TextFields below via createTheme(outerTheme,
// overrides), MUI's documented merge pattern for exactly this -- it deep-
// merges onto the real app theme (still the same palette, mode, every
// other component override) rather than replacing it, so nothing outside
// this subtree is affected. This is the first nested ThemeProvider in the
// app; App.jsx's is still the only theme driving everything else.
const withAccentFocusRing = (outerTheme) => createTheme(outerTheme, {
  components: {
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--user-accent)' },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          '&.Mui-focused': { color: 'var(--user-accent)' },
        },
      },
    },
  },
});

// The "Team Colors" editor that used to live here (presets + custom hex +
// an "Apply Colors" button) was removed -- it only ever wrote to
// ThemeContext's local, per-browser teamColors preference (never the
// backend), but was worded as if it edited the team's real brand identity
// ("Customize your team's visual identity", "Primary (Jersey)"), which is
// actually Step 1/2's DB-backed system (backend PATCH /teams/:teamId/brand,
// Team Manager only, edited from team-brand-settings.jsx). Having both
// made it look like this screen could repaint the real team colors for
// everyone, for any role -- it couldn't. See settings.jsx for the
// Team-Manager-gated link to the real editor.

function Profile({ selectedTeam, onTeamChange, role, selectedSeason, logout, currentUser }) {
  const { currentUser: authUser } = useAuth();
  const user = currentUser || authUser;
  const roleTheme = getRoleTheme(role);
  const { mode, toggleTheme, backgroundIntensity, setBackgroundIntensity } = useThemePreferences();

  const [displayName, setDisplayName] = useState(user?.name || '');

  return (
    <Layout selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout} currentUser={user}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 1200 }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <GlassCard glowColor={roleTheme.glow}>
            <GlassCardContent>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="center">
                {/* Personal accent, not the local-only Quick Team Preset --
                    same user-identity-marker treatment as the topbar avatar
                    and sidebar "CI" badge (this is that same category of
                    element, just on this page). */}
                <Avatar
                  sx={{
                    width: 96,
                    height: 96,
                    fontSize: '2.5rem',
                    fontWeight: 800,
                    bgcolor: 'var(--user-accent)',
                    border: '4px solid var(--user-accent)',
                    color: 'var(--user-accent-fg)',
                  }}
                >
                  {(displayName || 'U').charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                    <Typography variant="h4" fontWeight={800}>{displayName || 'Your Profile'}</Typography>
                    <Chip label={`${roleTheme.icon} ${role}`} size="small" sx={{ bgcolor: `${roleTheme.glow}22`, color: roleTheme.glow, fontWeight: 700 }} />
                  </Stack>
                  <Typography color="text.secondary">{user?.email || 'user@courtiq.com'}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{user?.institution || 'USIU'} • {user?.team || 'USIU Tigers Men'}</Typography>
                </Box>
              </Stack>
            </GlassCardContent>
          </GlassCard>
        </motion.div>

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <GlassCard glowColor={roleTheme.glow}>
              <GlassCardContent>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                  <TuneRoundedIcon sx={{ color: roleTheme.glow }} />
                  <Typography variant="h6" fontWeight={700}>Appearance</Typography>
                </Stack>

                <FormControlLabel
                  control={<Switch checked={mode === 'dark'} onChange={toggleTheme} sx={ACCENT_SWITCH_SX} />}
                  label={mode === 'dark' ? 'Dark mode' : 'Light mode'}
                  sx={{ display: 'block', mb: 3 }}
                />

                <Typography variant="subtitle2" sx={{ mb: 1 }}>Background Intensity</Typography>
                <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
                  Control how prominent your role's animated background appears.
                </Typography>
                <ToggleButtonGroup
                  value={backgroundIntensity}
                  exclusive
                  onChange={(_, val) => val && setBackgroundIntensity(val)}
                  size="small"
                  sx={{ mb: 3, ...ACCENT_TOGGLE_SX }}
                >
                  <ToggleButton value="subtle">Subtle</ToggleButton>
                  <ToggleButton value="medium">Medium</ToggleButton>
                  <ToggleButton value="vivid">Vivid</ToggleButton>
                </ToggleButtonGroup>

                <Typography variant="subtitle2" sx={{ mb: 1 }}>Your Role Atmosphere</Typography>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: `${roleTheme.glow}15`, border: `1px solid ${roleTheme.glow}33` }}>
                  <Typography variant="h5">{roleTheme.icon}</Typography>
                  <Typography fontWeight={700} sx={{ color: roleTheme.glow }}>{roleTheme.label}</Typography>
                  <Typography color="text.secondary" variant="body2">{roleTheme.tagline}</Typography>
                  <Typography color="text.secondary" variant="caption" sx={{ mt: 1, display: 'block' }}>
                    Each role has a unique animated background that reflects their purpose in the basketball ecosystem.
                  </Typography>
                </Box>
              </GlassCardContent>
            </GlassCard>
          </Grid>

          <Grid item xs={12}>
            <GlassCard>
              <GlassCardContent>
                <Typography variant="h6" fontWeight={700}>Profile Details</Typography>
                <ThemeProvider theme={withAccentFocusRing}>
                  <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={12} md={6}>
                      <TextField fullWidth label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField fullWidth label="Email" value={user?.email || ''} disabled />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField fullWidth label="Role" value={role || ''} disabled />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField fullWidth label="Team" value={user?.team || ''} disabled />
                    </Grid>
                  </Grid>
                </ThemeProvider>
              </GlassCardContent>
            </GlassCard>
          </Grid>
        </Grid>
      </Box>
    </Layout>
  );
}

export default Profile;
