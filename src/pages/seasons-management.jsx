import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, FormControlLabel,
  Grid, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import Layout from '../components/layout';
import { backendApi } from '../api/client';

// FR-11: real season configuration against the backend `seasons` table
// (backend/src/routes/seasons.js), replacing the old localStorage-only
// version of this page (which wrote to 'courtiq-seasons' and was never
// read by anything real). The old mock form had a three-state "status"
// (draft/active/archived) with a separate "Activate" action -- the real
// `seasons` table only has a binary `active` flag and there's no
// activate-later endpoint (only GET/POST/DELETE), so "status" is dropped
// in favor of an "active" checkbox set at creation time, rather than
// inventing a status column or an activate endpoint that don't exist.
//
// Step 12: that gap is closed -- PATCH /seasons/:id can now flip `active`
// after creation, so "mark a season concluded" is a real toggle button
// here, not just a read-only Chip. Gated to role === 'Statistician'
// specifically (not the page's own canManage-style shared check used
// elsewhere) since that's the route's actual gate, same one-time
// administrative-decision category as create/remove above.

function SeasonsManagement({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [seasons, setSeasons] = useState([]);
  const [seasonsLoading, setSeasonsLoading] = useState(true);
  const [seasonsError, setSeasonsError] = useState('');

  const [form, setForm] = useState({ id: '', name: '', active: false });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [removingId, setRemovingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

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

  const createSeason = async () => {
    if (!form.id.trim() || !form.name.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await backendApi.createSeason({
        id: form.id.trim(),
        name: form.name.trim(),
        active: form.active,
      });
      setForm({ id: '', name: '', active: false });
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
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h5" fontWeight={700}>Season management</Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}><TextField fullWidth label="Season ID (e.g. 2026/27)" value={form.id} onChange={(event) => setForm((prev) => ({ ...prev, id: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Season name" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} /></Grid>
              <Grid item xs={12}>
                <FormControlLabel
                  control={<Checkbox checked={form.active} onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))} />}
                  label="Set as active season"
                />
              </Grid>
            </Grid>
            {submitError && <Alert severity="error" sx={{ mt: 2 }}>{submitError}</Alert>}
            <Button
              variant="contained" sx={{ mt: 2 }} onClick={createSeason}
              disabled={submitting || !form.id.trim() || !form.name.trim()}
            >
              {submitting ? 'Creating…' : 'Create season'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Seasons</Typography>
            {seasonsLoading ? (
              <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>
            ) : (
              <>
                {seasonsError && <Alert severity="error" sx={{ mt: 2 }}>{seasonsError}</Alert>}
                <Table size="small" sx={{ mt: 2 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>ID</TableCell>
                      <TableCell>Name</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {seasons.map((season) => (
                      <TableRow key={season.id}>
                        <TableCell>{season.id}</TableCell>
                        <TableCell>{season.name}</TableCell>
                        <TableCell><Chip label={season.active ? 'Active' : 'Inactive'} color={season.active ? 'success' : 'default'} size="small" /></TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1}>
                            {canToggleActive && (
                              <Button
                                size="small" variant="outlined"
                                disabled={togglingId === season.id}
                                onClick={() => toggleActive(season)}
                              >
                                {togglingId === season.id ? 'Updating…' : season.active ? 'Mark concluded' : 'Reactivate'}
                              </Button>
                            )}
                            <Button
                              size="small" variant="outlined" color="error"
                              disabled={removingId === season.id}
                              onClick={() => removeSeason(season.id)}
                            >
                              {removingId === season.id ? 'Removing…' : 'Remove'}
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                    {seasons.length === 0 && (
                      <TableRow><TableCell colSpan={4}>No seasons yet.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
      </Box>
    </Layout>
  );
}

export default SeasonsManagement;
