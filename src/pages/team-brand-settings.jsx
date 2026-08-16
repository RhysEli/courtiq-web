import { Alert, Box, Button, Card, CardContent, CircularProgress, FormControlLabel, Grid, Stack, Switch, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import Layout from '../components/layout';
import ColorField from '../components/ColorField';
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
//
// Color entry is name-based by default (NamedColorGrid, a curated ~32-
// color palette) rather than raw hex -- nobody managing a team wants to
// type or know a hex code. Advanced hex entry is still available behind
// a toggle for the rare exact-brand-match case; the backend is unchanged
// either way (color_primary/color_secondary/brand_accent are plain TEXT,
// no format constraint), so this is purely a UI change. A saved color
// that doesn't land on a named swatch (a custom hex, or non-hex legacy
// data like the real "YELLOW"/"BLUE" strings on one seeded team) just
// shows as its own current-color preview with no swatch highlighted --
// still displayed honestly, not hidden or coerced onto the nearest name.

function TeamBrandSettings({ selectedTeam, onTeamChange, role, selectedSeason, logout, currentUser }) {
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState('');

  const [form, setForm] = useState({ colorPrimary: '', colorSecondary: '', brandAccent: '', logoUrl: '' });
  const [advancedOpen, setAdvancedOpen] = useState(false);
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

  // Matched by currentUser.teamId -- a real, stable id, not a name string.
  const activeTeam = useMemo(
    () => teams.find((t) => t.id === currentUser?.teamId),
    [teams, currentUser],
  );

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

  const setFieldValue = (field, value) => {
    const next = { ...form, [field]: value };
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
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 760 }}>
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
              <ColorField label="Primary color" value={form.colorPrimary} onChange={(hex) => setFieldValue('colorPrimary', hex)} />
              <ColorField label="Secondary color" value={form.colorSecondary} onChange={(hex) => setFieldValue('colorSecondary', hex)} />
              <ColorField label="Accent color" value={form.brandAccent} onChange={(hex) => setFieldValue('brandAccent', hex)} />

              <TextField fullWidth label="Logo URL" value={form.logoUrl} onChange={(event) => setFieldValue('logoUrl', event.target.value)} sx={{ mb: 1 }} />

              <FormControlLabel
                sx={{ mt: 1, display: 'block' }}
                control={<Switch checked={advancedOpen} onChange={(event) => setAdvancedOpen(event.target.checked)} />}
                label="Advanced: enter custom hex codes"
              />
              {advancedOpen && (
                <Grid container spacing={2} sx={{ mt: 0.5, mb: 1 }}>
                  <Grid item xs={12} sm={4}>
                    <TextField fullWidth label="Primary hex" value={form.colorPrimary} onChange={(event) => setFieldValue('colorPrimary', event.target.value)} helperText="e.g. #ff7a1a" />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField fullWidth label="Secondary hex" value={form.colorSecondary} onChange={(event) => setFieldValue('colorSecondary', event.target.value)} helperText="e.g. #111827" />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField fullWidth label="Accent hex" value={form.brandAccent} onChange={(event) => setFieldValue('brandAccent', event.target.value)} helperText="e.g. #f8fafc" />
                  </Grid>
                </Grid>
              )}

              {saveError && <Alert severity="error" sx={{ mt: 2 }}>{saveError}</Alert>}
              {notice && <Alert severity="success" sx={{ mt: 2 }}>{notice}</Alert>}

              <Button variant="contained" sx={{ mt: 3 }} onClick={save} disabled={saving}>
                {saving ? 'Saving…' : `Save ${activeTeam.name}'s brand`}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Alert severity="error">
            Could not find your team ({currentUser?.team || 'unknown'}) in the team list.
          </Alert>
        )}
      </Box>
    </Layout>
  );
}

export default TeamBrandSettings;
