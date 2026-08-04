import { useState } from 'react';
import { Box, Grid, Typography, Switch, FormControlLabel, TextField, Button, Stack, Avatar, Chip, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { motion } from 'framer-motion';
import Layout from '../components/layout';
import GlassCard, { GlassCardContent } from '../components/GlassCard';
import { useAuth } from '../contexts/AuthContext';
import { useThemePreferences } from '../contexts/ThemeContext';
import { TEAM_PRESETS, getRoleTheme } from '../theme/themeConfig';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import PaletteRoundedIcon from '@mui/icons-material/PaletteRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';

function ColorSwatch({ color, label, selected, onClick }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'transform 0.2s',
        '&:hover': { transform: 'scale(1.08)' },
      }}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: 2,
          bgcolor: color,
          border: selected ? '3px solid #fff' : '2px solid rgba(255,255,255,0.2)',
          boxShadow: selected ? `0 0 16px ${color}` : 'none',
          mx: 'auto',
        }}
      />
      <Typography variant="caption" sx={{ mt: 0.5, display: 'block', color: 'text.secondary' }}>{label}</Typography>
    </Box>
  );
}

function Profile({ selectedTeam, onTeamChange, role, selectedSeason, logout, currentUser }) {
  const { currentUser: authUser } = useAuth();
  const user = currentUser || authUser;
  const roleTheme = getRoleTheme(role);
  const {
    mode, toggleTheme, teamColors, teamPreset, setTeamPreset, setTeamColors,
    backgroundIntensity, setBackgroundIntensity,
  } = useThemePreferences();

  const [localColors, setLocalColors] = useState({ ...teamColors });
  const [displayName, setDisplayName] = useState(user?.name || '');

  const handleSave = () => {
    setTeamColors(localColors);
  };

  return (
    <Layout selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout} currentUser={user}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 1200 }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <GlassCard glowColor={roleTheme.glow}>
            <GlassCardContent>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="center">
                <Avatar
                  sx={{
                    width: 96,
                    height: 96,
                    fontSize: '2.5rem',
                    fontWeight: 800,
                    bgcolor: `${teamColors.primary}33`,
                    border: `4px solid ${teamColors.primary}`,
                    color: teamColors.primary,
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
            <GlassCard glowColor={teamColors.primary}>
              <GlassCardContent>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                  <PaletteRoundedIcon sx={{ color: teamColors.primary }} />
                  <Typography variant="h6" fontWeight={700}>Team Colors</Typography>
                </Stack>
                <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
                  Customize your team's visual identity. These colors apply across the app while keeping your role's unique atmosphere.
                </Typography>

                <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Presets</Typography>
                <Stack direction="row" flexWrap="wrap" gap={2} sx={{ mb: 3 }}>
                  {Object.values(TEAM_PRESETS).map((preset) => (
                    <ColorSwatch
                      key={preset.id}
                      color={preset.primary}
                      label={preset.name}
                      selected={teamPreset === preset.id}
                      onClick={() => {
                        setTeamPreset(preset.id);
                        setLocalColors({ primary: preset.primary, secondary: preset.secondary, accent: preset.accent });
                      }}
                    />
                  ))}
                </Stack>

                <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Custom Colors</Typography>
                <Grid container spacing={2} sx={{ mb: 2 }}>
                  {[
                    { key: 'primary', label: 'Primary (Jersey)' },
                    { key: 'secondary', label: 'Secondary (Accent)' },
                    { key: 'accent', label: 'Highlight' },
                  ].map(({ key, label }) => (
                    <Grid item xs={4} key={key}>
                      <Typography variant="caption" color="text.secondary">{label}</Typography>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box
                          component="input"
                          type="color"
                          value={localColors[key]}
                          onChange={(e) => setLocalColors((prev) => ({ ...prev, [key]: e.target.value }))}
                          sx={{ width: 40, height: 40, border: 'none', borderRadius: 1, cursor: 'pointer', bgcolor: 'transparent' }}
                        />
                        <TextField
                          size="small"
                          value={localColors[key]}
                          onChange={(e) => setLocalColors((prev) => ({ ...prev, [key]: e.target.value }))}
                          sx={{ flex: 1 }}
                        />
                      </Stack>
                    </Grid>
                  ))}
                </Grid>

                <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.04)', mb: 2 }}>
                  <Typography variant="caption" color="text.secondary">Preview</Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Box sx={{ flex: 1, height: 32, borderRadius: 1, bgcolor: localColors.primary }} />
                    <Box sx={{ flex: 1, height: 32, borderRadius: 1, bgcolor: localColors.secondary }} />
                    <Box sx={{ flex: 1, height: 32, borderRadius: 1, bgcolor: localColors.accent, border: '1px solid rgba(255,255,255,0.2)' }} />
                  </Stack>
                </Box>

                <Button variant="contained" startIcon={<SaveRoundedIcon />} onClick={handleSave} sx={{ bgcolor: localColors.primary, color: '#000', '&:hover': { bgcolor: localColors.primary, filter: 'brightness(1.1)' } }}>
                  Apply Colors
                </Button>
              </GlassCardContent>
            </GlassCard>
          </Grid>

          <Grid item xs={12} md={6}>
            <GlassCard glowColor={roleTheme.glow}>
              <GlassCardContent>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                  <TuneRoundedIcon sx={{ color: roleTheme.glow }} />
                  <Typography variant="h6" fontWeight={700}>Appearance</Typography>
                </Stack>

                <FormControlLabel
                  control={<Switch checked={mode === 'dark'} onChange={toggleTheme} />}
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
                  sx={{ mb: 3 }}
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
              </GlassCardContent>
            </GlassCard>
          </Grid>
        </Grid>
      </Box>
    </Layout>
  );
}

export default Profile;
