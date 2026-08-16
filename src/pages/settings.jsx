import { Alert, Box, Grid, Typography, Switch, FormControlLabel, Button, Stack, ToggleButton, ToggleButtonGroup, CircularProgress } from '@mui/material';
import { useEffect, useState } from 'react';
import Layout from '../components/layout';
import GlassCard, { GlassCardContent } from '../components/GlassCard';
import NamedColorGrid from '../components/NamedColorGrid';
import { useThemePreferences } from '../contexts/ThemeContext';
import { TEAM_PRESETS } from '../theme/themeConfig';
import { ACCENT_OPTIONS, persistUserPreference } from '../theme/userPreference';
import { applyTheme, getCurrentBrand } from '../theme/applyTheme';
import { backendApi } from '../api/client';
import { isRouteAllowed } from '../auth/roleAccess';
import { useNavigate } from 'react-router-dom';
import PaletteRoundedIcon from '@mui/icons-material/PaletteRounded';
import AccountCircleRoundedIcon from '@mui/icons-material/AccountCircleRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';

// Visual overhaul step 2: personal preference (theme_mode + accent_override
// on `users`), self-service for every role via backendApi.getMyPreferences/
// updateMyPreferences (backend/src/routes/users.js, no role gate). Both
// controls below live-apply immediately through the SAME applyTheme()
// Step 1's login flow uses (no duplicated CSS-var logic), then persist to
// the backend -- that's the "live preview that doesn't require re-login"
// this step asked for. Team brand colors themselves aren't editable here
// -- see team-brand-settings.jsx (Team Manager only).

function Settings({ selectedTeam, onTeamChange, role, selectedSeason, logout, currentUser }) {
  const navigate = useNavigate();
  const { themeMode, setThemeMode, teamColors, setTeamPreset, backgroundIntensity, setBackgroundIntensity } = useThemePreferences();

  const [accentOverride, setAccentOverride] = useState(null);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsError, setPrefsError] = useState('');
  const [savingField, setSavingField] = useState(null);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let cancelled = false;
    backendApi.getMyPreferences()
      .then((data) => {
        if (cancelled) return;
        setAccentOverride(data.accent_override);
        // Keep ThemeContext/localStorage in sync with the real DB value,
        // in case this browser's cached copy (from a previous login) is
        // stale -- e.g. the preference was changed from another device.
        if (data.theme_mode && data.theme_mode !== themeMode) setThemeMode(data.theme_mode);
        persistUserPreference({ themeMode: data.theme_mode, accentOverride: data.accent_override });
        applyTheme({ brand: getCurrentBrand(), userPref: { accentOverride: data.accent_override } });
      })
      .catch((err) => { if (!cancelled) setPrefsError(err.message || 'Could not load your preferences.'); })
      .finally(() => { if (!cancelled) setPrefsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeThemeMode = async (event, value) => {
    if (!value) return;
    const previous = themeMode;
    setThemeMode(value); // live-apply immediately
    setSavingField('themeMode');
    setSaveError('');
    try {
      const updated = await backendApi.updateMyPreferences({ themeMode: value });
      persistUserPreference({ themeMode: updated.theme_mode, accentOverride });
    } catch (err) {
      setThemeMode(previous); // roll back the live-applied value on failure
      setSaveError(err.message || 'Could not save theme mode.');
    } finally {
      setSavingField(null);
    }
  };

  const changeAccentOverride = async (value) => {
    const previous = accentOverride;
    setAccentOverride(value);
    applyTheme({ brand: getCurrentBrand(), userPref: { accentOverride: value } }); // live-apply immediately
    setSavingField('accent');
    setSaveError('');
    try {
      const updated = await backendApi.updateMyPreferences({ accentOverride: value });
      persistUserPreference({ themeMode, accentOverride: updated.accent_override });
    } catch (err) {
      setAccentOverride(previous);
      applyTheme({ brand: getCurrentBrand(), userPref: { accentOverride: previous } });
      setSaveError(err.message || 'Could not save accent color.');
    } finally {
      setSavingField(null);
    }
  };

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
                Manage your display name and visual preferences from your profile page.
              </Typography>
              <Button variant="contained" onClick={() => navigate('/profile')} sx={{ bgcolor: teamColors.primary, color: '#000' }}>
                Open Profile
              </Button>
            </GlassCardContent>
          </GlassCard>
        </Grid>

        {isRouteAllowed(role, '/team-brand-settings') && (
          <Grid item xs={12} md={6}>
            <GlassCard glowColor={teamColors.primary}>
              <GlassCardContent>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                  <GroupsRoundedIcon sx={{ color: teamColors.primary }} />
                  <Typography variant="h6" fontWeight={700}>Team Brand</Typography>
                </Stack>
                <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
                  Set your team's real primary, secondary, and accent colors -- visible to everyone on the team, everywhere in the app.
                </Typography>
                <Button variant="contained" onClick={() => navigate('/team-brand-settings')} sx={{ bgcolor: teamColors.primary, color: '#000' }}>
                  Open Team Brand
                </Button>
              </GlassCardContent>
            </GlassCard>
          </Grid>
        )}

        <Grid item xs={12} md={6}>
          <GlassCard glowColor={teamColors.secondary}>
            <GlassCardContent>
              <Typography variant="h6" fontWeight={700}>Theme</Typography>
              <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Theme mode</Typography>
              <ToggleButtonGroup value={themeMode} exclusive onChange={changeThemeMode} size="small" disabled={savingField === 'themeMode'}>
                <ToggleButton value="light">Light</ToggleButton>
                <ToggleButton value="dark">Dark</ToggleButton>
                <ToggleButton value="auto">Auto</ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Auto follows your device's light/dark setting.
              </Typography>

              <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>Quick Team Preset</Typography>
              <Typography color="text.secondary" variant="body2" sx={{ mb: 1.5 }}>
                Personal preview only -- doesn't change your team's real colors for anyone else.
              </Typography>
              <NamedColorGrid
                options={Object.values(TEAM_PRESETS).slice(0, 4).map((preset) => ({ hex: preset.primary, name: preset.name }))}
                value={teamColors.primary}
                onChange={(hex) => {
                  const preset = Object.values(TEAM_PRESETS).find((p) => p.primary === hex);
                  if (preset) setTeamPreset(preset.id);
                }}
              />
            </GlassCardContent>
          </GlassCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <GlassCard>
            <GlassCardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <TuneRoundedIcon />
                <Typography variant="h6" fontWeight={700}>My Accent Color</Typography>
              </Stack>
              <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
                Overrides your team's accent just for you, everywhere else stays your team's real brand colors.
              </Typography>

              {prefsLoading ? (
                <Stack alignItems="center" sx={{ py: 2 }}><CircularProgress size={24} /></Stack>
              ) : (
                <>
                  {prefsError && <Alert severity="error" sx={{ mb: 2 }}>{prefsError}</Alert>}
                  <Box
                    onClick={() => changeAccentOverride(null)}
                    sx={{
                      display: 'inline-flex', alignItems: 'center', gap: 1, cursor: 'pointer', mb: 1.5,
                      px: 1.5, py: 0.5, borderRadius: 2,
                      border: accentOverride === null ? '2px solid #fff' : '2px dashed rgba(255,255,255,0.4)',
                    }}
                  >
                    <Box sx={{ width: 20, height: 20, borderRadius: '50%', border: '2px dashed rgba(255,255,255,0.5)' }} />
                    <Typography variant="body2">Use team default</Typography>
                  </Box>
                  <NamedColorGrid
                    options={ACCENT_OPTIONS.map((option) => ({ hex: option.hex, name: option.label }))}
                    value={accentOverride}
                    onChange={changeAccentOverride}
                  />
                  {saveError && <Alert severity="error" sx={{ mt: 2 }}>{saveError}</Alert>}

                  <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>Live preview</Typography>
                  <Box
                    sx={{
                      width: '100%',
                      height: 56,
                      borderRadius: 2,
                      bgcolor: 'var(--user-accent)',
                      transition: 'background-color 0.2s ease',
                    }}
                  />
                </>
              )}
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
