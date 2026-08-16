import { Alert, Box, Button, Card, CardContent, CircularProgress, Grid, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import Layout from '../components/layout';
import { backendApi } from '../api/client';
import { applyTheme, getCurrentBrand } from '../theme/applyTheme';
import { persistBrandColors, loadPersistedBrandColors } from '../theme/brandColors';
import { loadPersistedUserPreference } from '../theme/userPreference';

// Visual overhaul step 2: Team Manager-only screen for the REAL team brand
// colors added in step 1 (backend/src/routes/teams.js's PATCH
// /:teamId/brand, already Team Manager + requireTeamAccess gated -- no
// backend change needed here, this is the UI step 1 deliberately deferred).
// Edits live-preview through the same shared applyTheme() the personal-
// preference screen uses (not duplicated), so the real sidebar/topbar/
// login-button colors visibly change as you type -- Save persists to the
// database; navigating away without saving reverts the live preview back
// to the last-saved colors (see the cleanup effect below).

function TeamBrandSettings({ selectedTeam, onTeamChange, role, selectedSeason, logout, currentUser }) {
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState('');

  const [form, setForm] = useState({ colorPrimary: '', colorSecondary: '', brandAccent: '', logoUrl: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');

  // The user's own accent_override, so live-previewing a brand edit
  // resolves --user-accent correctly instead of assuming no override.
  const myAccentOverride = useRef(loadPersistedUserPreference()?.accentOverride ?? null);
  const savedBrand = useRef(null); // last-saved (or initially-loaded) colors, for the unmount revert

  useEffect(() => {
    backendApi.getMyPreferences()
      .then((data) => { myAccentOverride.current = data.accent_override; })
      .catch(() => { /* fall back to the localStorage-cached value already in the ref */ });
  }, []);

  useEffect(() => {
    setTeamsLoading(true);
    setTeamsError('');
    backendApi.getTeams()
      .then(setTeams)
      .catch((err) => setTeamsError(err.message || 'Could not load teams.'))
      .finally(() => setTeamsLoading(false));
  }, []);

  const activeTeam = useMemo(() => {
    const guess = teams.find((t) => t.name?.toLowerCase().includes(String(selectedTeam || '').toLowerCase().replace(/-/g, ' ')));
    return guess || teams[0];
  }, [teams, selectedTeam]);

  useEffect(() => {
    if (!activeTeam) return;
    const loaded = {
      colorPrimary: activeTeam.color_primary || '',
      colorSecondary: activeTeam.color_secondary || '',
      brandAccent: activeTeam.brand_accent || '',
      logoUrl: activeTeam.logo_url || '',
    };
    setForm(loaded);
    savedBrand.current = loaded;
  }, [activeTeam]);

  // Revert the live preview back to the last-saved colors if this screen
  // is left with unsaved edits still applied -- otherwise a manager who
  // previews a color and navigates away without saving would leave the
  // WHOLE app (sidebar, topbar, login) showing a color that was never
  // actually persisted.
  useEffect(() => () => {
    if (savedBrand.current) {
      applyTheme({ brand: savedBrand.current, userPref: { accentOverride: myAccentOverride.current } });
    }
  }, []);

  const updateField = (field) => (event) => {
    const next = { ...form, [field]: event.target.value };
    setForm(next);
    applyTheme({ brand: next, userPref: { accentOverride: myAccentOverride.current } });
  };

  const save = async () => {
    if (!activeTeam) return;
    setSaving(true);
    setSaveError('');
    try {
      const updated = await backendApi.updateTeamBrand(activeTeam.id, form);
      const savedColors = {
        colorPrimary: updated.color_primary || '',
        colorSecondary: updated.color_secondary || '',
        brandAccent: updated.brand_accent || '',
        logoUrl: updated.logo_url || '',
      };
      savedBrand.current = savedColors;
      applyTheme({ brand: savedColors, userPref: { accentOverride: myAccentOverride.current } });
      // If this IS the browser's own logged-in team, keep the persisted
      // cache (main.jsx reads this on next load) in sync too.
      const cachedBrand = loadPersistedBrandColors();
      if (cachedBrand) persistBrandColors(savedColors);
      setNotice(`Saved ${activeTeam.name}'s brand colors.`);
    } catch (err) {
      setSaveError(err.message || 'Could not save brand colors.');
    } finally {
      setSaving(false);
    }
  };

  if (teamsLoading) {
    return (
      <Layout selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout} currentUser={currentUser}>
        <Stack alignItems="center" sx={{ py: 6 }}><CircularProgress /></Stack>
      </Layout>
    );
  }

  return (
    <Layout selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout} currentUser={currentUser}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 720 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Team brand</Typography>
          <Typography color="text.secondary">
            These colors apply to everyone on {activeTeam?.name || 'your team'} -- changes preview live across the app as you edit, below.
          </Typography>
        </Box>

        {teamsError && <Alert severity="error">{teamsError}</Alert>}

        {activeTeam ? (
          <Card>
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="Primary color" value={form.colorPrimary} onChange={updateField('colorPrimary')} helperText="Hex, e.g. #ff7a1a" />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="Secondary color" value={form.colorSecondary} onChange={updateField('colorSecondary')} helperText="Hex, e.g. #111827" />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="Accent color" value={form.brandAccent} onChange={updateField('brandAccent')} helperText="Hex, e.g. #f8fafc" />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="Logo URL" value={form.logoUrl} onChange={updateField('logoUrl')} />
                </Grid>
              </Grid>

              <Stack direction="row" spacing={1.5} sx={{ mt: 3 }}>
                {[
                  { label: 'Primary', value: form.colorPrimary },
                  { label: 'Secondary', value: form.colorSecondary },
                  { label: 'Accent', value: form.brandAccent },
                ].map(({ label, value }) => (
                  <Box key={label} sx={{ textAlign: 'center' }}>
                    <Box sx={{ width: 48, height: 48, borderRadius: 2, bgcolor: value || 'transparent', border: '2px solid rgba(255,255,255,0.2)' }} />
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{label}</Typography>
                  </Box>
                ))}
              </Stack>

              {saveError && <Alert severity="error" sx={{ mt: 2 }}>{saveError}</Alert>}
              {notice && <Alert severity="success" sx={{ mt: 2 }}>{notice}</Alert>}

              <Button variant="contained" sx={{ mt: 3 }} onClick={save} disabled={saving}>
                {saving ? 'Saving…' : `Save ${activeTeam.name}'s brand`}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Typography color="text.secondary">No team found to configure.</Typography>
        )}
      </Box>
    </Layout>
  );
}

export default TeamBrandSettings;
