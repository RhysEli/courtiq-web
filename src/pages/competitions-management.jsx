import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Checkbox, CircularProgress,
  FormControlLabel, Grid, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import Layout from '../components/layout';
import { backendApi } from '../api/client';

// Real competition configuration against the backend `competitions` table
// (backend/src/routes/competitions.js), renamed from `leagues` -- the old
// name was actively wrong once this entity also covers Friendlies and
// Tournaments, which are not leagues. A competition is a persistent,
// reusable entity now: the old free-text "Season" field is gone entirely
// (a competition no longer belongs to one season by construction -- a
// season links into one instead, a later round's job, not this page's).
//
// `type` is the fixed small set the backend actually distinguishes
// (league tier / custom recurring / friendly / tournament); `recurring`
// is primarily meaningful for the custom type. `name` stays free text --
// "Premier Division"/"Division One"/"Division Two" (fetched from
// GET /competitions/presets) are offered as quick-select suggestions for
// the league-tier type, not a hardcoded restriction on what any
// competition can be named.
const TYPE_LABELS = {
  league_tier: 'League tier',
  custom_recurring: 'Custom (recurring)',
  friendly: 'Friendly',
  tournament: 'Tournament',
};

function CompetitionsManagement({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [competitions, setCompetitions] = useState([]);
  const [competitionsLoading, setCompetitionsLoading] = useState(true);
  const [competitionsError, setCompetitionsError] = useState('');
  const [presetNames, setPresetNames] = useState([]);

  const [form, setForm] = useState({ name: '', category: '', type: 'league_tier', recurring: false, description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [removingId, setRemovingId] = useState(null);

  const loadCompetitions = () => {
    setCompetitionsLoading(true);
    setCompetitionsError('');
    backendApi.getCompetitions()
      .then(setCompetitions)
      .catch((err) => setCompetitionsError(err.message || 'Could not load competitions.'))
      .finally(() => setCompetitionsLoading(false));
  };

  useEffect(() => {
    loadCompetitions();
    backendApi.getCompetitionPresets()
      .then((data) => setPresetNames(data.leagueTierNames || []))
      .catch(() => { /* presets are just a UI convenience -- the form still works without them */ });
  }, []);

  const createCompetition = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await backendApi.createCompetition({
        name: form.name.trim(),
        category: form.category || null,
        type: form.type,
        recurring: form.recurring,
        description: form.description || null,
      });
      setForm({ name: '', category: '', type: 'league_tier', recurring: false, description: '' });
      loadCompetitions();
    } catch (err) {
      setSubmitError(err.message || 'Could not create competition.');
    } finally {
      setSubmitting(false);
    }
  };

  const removeCompetition = async (competitionId) => {
    setRemovingId(competitionId);
    try {
      await backendApi.deleteCompetition(competitionId);
      loadCompetitions();
    } catch (err) {
      setCompetitionsError(err.message || 'Could not remove competition.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h5" fontWeight={700}>Competition management</Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}>
                <Autocomplete
                  freeSolo
                  options={form.type === 'league_tier' ? presetNames : []}
                  inputValue={form.name}
                  onInputChange={(event, value) => setForm((prev) => ({ ...prev, name: value }))}
                  renderInput={(params) => <TextField {...params} fullWidth label="Competition name" />}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  select fullWidth label="Type" value={form.type}
                  onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
                >
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <MenuItem key={value} value={value}>{label}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Category" value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={<Checkbox checked={form.recurring} onChange={(event) => setForm((prev) => ({ ...prev, recurring: event.target.checked }))} />}
                  label="Recurring (comes back each season)"
                />
              </Grid>
              <Grid item xs={12}><TextField fullWidth label="Description" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} /></Grid>
            </Grid>
            {submitError && <Alert severity="error" sx={{ mt: 2 }}>{submitError}</Alert>}
            <Button
              variant="contained" sx={{ mt: 2 }} onClick={createCompetition}
              disabled={submitting || !form.name.trim()}
            >
              {submitting ? 'Creating…' : 'Create competition'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Competitions</Typography>
            {competitionsLoading ? (
              <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>
            ) : (
              <>
                {competitionsError && <Alert severity="error" sx={{ mt: 2 }}>{competitionsError}</Alert>}
                <Table size="small" sx={{ mt: 2 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Category</TableCell>
                      <TableCell>Recurring</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {competitions.map((competition) => (
                      <TableRow key={competition.id}>
                        <TableCell>{competition.name}</TableCell>
                        <TableCell>{TYPE_LABELS[competition.type] || competition.type}</TableCell>
                        <TableCell>{competition.category || '—'}</TableCell>
                        <TableCell>{competition.recurring ? 'Yes' : 'No'}</TableCell>
                        <TableCell>{competition.description || '—'}</TableCell>
                        <TableCell>
                          <Button
                            size="small" variant="outlined" color="error"
                            disabled={removingId === competition.id}
                            onClick={() => removeCompetition(competition.id)}
                          >
                            {removingId === competition.id ? 'Removing…' : 'Remove'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {competitions.length === 0 && (
                      <TableRow><TableCell colSpan={6}>No competitions yet.</TableCell></TableRow>
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

export default CompetitionsManagement;
