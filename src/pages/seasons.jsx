import { Alert, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, FormControlLabel, Grid, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import Layout from '../components/layout';
import { backendApi } from '../api/client';

// FR-11: real season data against the backend `seasons` table
// (backend/src/routes/seasons.js), replacing the old localStorage-only
// managementService.js version of this page. Mirrors seasons-management.jsx's
// finding that `seasons` only has a binary `active` flag with no
// activate-later endpoint (only GET/POST/DELETE) -- so the old "Activate"
// button (which wrote a fake active flag to mock data) and "Archive"
// (no real column at all) are dropped. Picking which season this browser
// is currently viewing (onSeasonChange) is kept -- that was always local
// UI state, not a backend write, so there's nothing to swap it to; it's
// simply decoupled from the old fake "Activate" semantics.
//
// Step 12: the real gap (no way to flip `active` after creation) is
// closed -- "Active" is no longer purely read-only. The new toggle is
// gated to role === 'Statistician' specifically, NOT the looser
// canManage (Statistician + Team Manager) check the pre-existing Remove
// button below uses -- PATCH /seasons/:id really is Statistician-only,
// so this one reflects that precisely rather than inheriting the
// page's existing, looser convention.

function Seasons({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, onSeasonChange, logout }) {
  const [seasons, setSeasons] = useState([]);
  const [seasonsLoading, setSeasonsLoading] = useState(true);
  const [seasonsError, setSeasonsError] = useState('');

  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [active, setActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [removingId, setRemovingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [notice, setNotice] = useState('');

  const canManage = role === 'Statistician' || role === 'Team Manager';
  const canToggleActive = role === 'Statistician';

  const loadSeasons = () => {
    setSeasonsLoading(true);
    setSeasonsError('');
    backendApi.getSeasons()
      .then(setSeasons)
      .catch((err) => setSeasonsError(err.message || 'Could not load seasons.'))
      .finally(() => setSeasonsLoading(false));
  };

  useEffect(() => {
    loadSeasons();
  }, []);

  const addSeason = async () => {
    if (!id.trim() || !name.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await backendApi.createSeason({ id: id.trim(), name: name.trim(), active });
      setId('');
      setName('');
      setActive(false);
      setNotice(`Created ${name.trim()}`);
      loadSeasons();
    } catch (err) {
      setSubmitError(err.message || 'Could not create season.');
    } finally {
      setSubmitting(false);
    }
  };

  const removeSeason = async (seasonId) => {
    setRemovingId(seasonId);
    try {
      await backendApi.deleteSeason(seasonId);
      loadSeasons();
    } catch (err) {
      setSeasonsError(err.message || 'Could not remove season.');
    } finally {
      setRemovingId(null);
    }
  };

  const toggleActive = async (season) => {
    setTogglingId(season.id);
    try {
      await backendApi.updateSeason(season.id, { active: !season.active });
      loadSeasons();
    } catch (err) {
      setSeasonsError(err.message || 'Could not update season.');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Season control center</Typography>
          <Typography color="text.secondary">Pick which season you're viewing and keep all reports aligned with the right campaign.</Typography>
        </Box>
      </Box>

      {seasonsError && <Alert severity="error" sx={{ mb: 2 }}>{seasonsError}</Alert>}

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Seasons</Typography>
              {seasonsLoading ? (
                <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>
              ) : (
                <Stack spacing={2}>
                  {seasons.map((season) => (
                    <Box key={season.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography fontWeight={700}>{season.name}</Typography>
                        <Typography color="text.secondary">{season.name === selectedSeason ? 'Currently viewing' : ' '}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Chip label={season.active ? 'Active' : 'Inactive'} color={season.active ? 'success' : 'default'} size="small" />
                        {canToggleActive && (
                          <Button
                            variant="outlined" size="small"
                            disabled={togglingId === season.id}
                            onClick={() => toggleActive(season)}
                          >
                            {togglingId === season.id ? 'Updating…' : season.active ? 'Mark concluded' : 'Reactivate'}
                          </Button>
                        )}
                        <Button
                          variant="outlined" size="small"
                          onClick={() => onSeasonChange?.(season.name)}
                          disabled={season.name === selectedSeason}
                        >
                          View
                        </Button>
                        <Button
                          variant="outlined" size="small" color="error"
                          disabled={!canManage || removingId === season.id}
                          onClick={() => removeSeason(season.id)}
                        >
                          {removingId === season.id ? 'Removing…' : 'Remove'}
                        </Button>
                      </Box>
                    </Box>
                  ))}
                  {seasons.length === 0 && <Typography color="text.secondary">No seasons yet.</Typography>}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Create season</Typography>
              <Stack spacing={2}>
                <TextField label="Season ID (e.g. 2026/27)" value={id} onChange={(event) => setId(event.target.value)} fullWidth />
                <TextField label="Season name" value={name} onChange={(event) => setName(event.target.value)} fullWidth />
                <FormControlLabel control={<Checkbox checked={active} onChange={(event) => setActive(event.target.checked)} />} label="Set as active season" />
                {submitError && <Alert severity="error">{submitError}</Alert>}
                <Button variant="contained" color="primary" onClick={addSeason} disabled={!canManage || submitting || !id.trim() || !name.trim()}>
                  {submitting ? 'Saving…' : 'Save season'}
                </Button>
                {notice && <Alert severity="success">{notice}</Alert>}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Layout>
  );
}

export default Seasons;
