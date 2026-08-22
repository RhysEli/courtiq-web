import {
  Alert, Autocomplete, Box, Button, Card, CardContent, CircularProgress, FormControlLabel, Grid, MenuItem,
  Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import Layout from '../components/layout';
import ColorField from '../components/ColorField';
import { backendApi } from '../api/client';

// FR-11: real team configuration against the backend `teams` table
// (backend/src/routes/teams.js), replacing the old localStorage-only
// version of this page (which wrote to 'courtiq-teams' and was never
// read by anything real). The old mock form let you "Create team" with
// Category, Assistant Coach, Physiotherapist, Trainer, League, and
// Season fields -- none of those have a matching real column, so those
// are dropped rather than inventing schema/endpoints for them.
//
// Step 9 Round 4: a real "Create team" action now exists (name,
// institution, gender category -- POST /api/teams), separate from
// bulkImport.js/games.js's own find-or-create-on-import path, which
// this page has nothing to do with. The edit form below also gained
// institution/gender fields, since the general PATCH now accepts them --
// this is the only UI path to assign an institution to any of the real
// teams that predate this feature (all null until edited here).
//
// Logo editing was removed from the edit form (was a plain "Logo URL"
// text field writing teams.logo_url directly) once Team Brand
// (team-brand-settings.jsx) got a real upload control -- two paths to
// the same column, one validated (staff-curated image upload via
// Supabase Storage) and one not (paste any string), was worth
// collapsing to one. Team Brand is Team Manager only, so Statisticians
// lose logo-editing entirely rather than keeping a lesser, unvalidated
// path here -- they never had a real one to begin with.

// Quick-select convenience, not a constrained enum -- typing any other
// value is still fully supported (same freeSolo Autocomplete pattern as
// competitions-management.jsx's competition name field). Matches the
// schema.sql comment on teams.gender_category ("Men | Women | Mixed").
const GENDER_PRESETS = ['Men', 'Women', 'Mixed'];

const emptyForm = { coachName: '', managerName: '', statisticianName: '', colorPrimary: '', colorSecondary: '', institutionId: '', genderCategory: '' };
const emptyCreateForm = { name: '', institutionId: '', genderCategory: '' };

function TeamsManagement({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState('');
  const [teamId, setTeamId] = useState('');

  const [institutions, setInstitutions] = useState([]);

  const [form, setForm] = useState(emptyForm);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createNotice, setCreateNotice] = useState('');

  const loadTeams = () => {
    setTeamsLoading(true);
    setTeamsError('');
    return backendApi.getTeams()
      .then((data) => {
        setTeams(data);
        return data;
      })
      .catch((err) => { setTeamsError(err.message || 'Could not load teams.'); return []; })
      .finally(() => setTeamsLoading(false));
  };

  useEffect(() => {
    loadTeams().then((data) => setTeamId(data[0]?.id || ''));
    backendApi.getInstitutions().then(setInstitutions).catch(() => setInstitutions([]));
  }, []);

  // Populate the edit form from whichever team is currently selected.
  useEffect(() => {
    const team = teams.find((t) => t.id === teamId);
    setForm(team ? {
      coachName: team.coach_name || '',
      managerName: team.manager_name || '',
      statisticianName: team.statistician_name || '',
      colorPrimary: team.color_primary || '',
      colorSecondary: team.color_secondary || '',
      institutionId: team.institution_id || '',
      genderCategory: team.gender_category || '',
    } : emptyForm);
  }, [teamId, teams]);

  const saveTeam = async () => {
    if (!teamId) return;
    setSaving(true);
    setSaveError('');
    try {
      // Empty string (the "No institution" option / a cleared gender
      // field) means "unassign", not "keep whatever it was" -- sent as
      // an explicit null so the backend's partial-update default
      // (omitted key keeps the existing value) doesn't kick in.
      await backendApi.updateTeam(teamId, {
        ...form,
        institutionId: form.institutionId || null,
        genderCategory: form.genderCategory || null,
      });
      await loadTeams();
    } catch (err) {
      setSaveError(err.message || 'Could not save team.');
    } finally {
      setSaving(false);
    }
  };

  const createTeam = async () => {
    if (!createForm.name.trim()) return;
    setCreating(true);
    setCreateError('');
    setCreateNotice('');
    try {
      const team = await backendApi.createTeam({
        name: createForm.name.trim(),
        institutionId: createForm.institutionId || null,
        genderCategory: createForm.genderCategory || null,
      });
      setCreateForm(emptyCreateForm);
      setCreateNotice(`Created ${team.name}`);
      await loadTeams();
      setTeamId(team.id);
    } catch (err) {
      setCreateError(err.message || 'Could not create team.');
    } finally {
      setCreating(false);
    }
  };

  const selectedTeamName = teams.find((t) => t.id === teamId)?.name || '';

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h5" fontWeight={700}>Create team</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Manually pre-register a team. Bulk Import/game creation still auto-create opponent teams on their own -- this is a separate, additional way to add one.
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth label="Team name" value={createForm.name}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth select label="Institution" value={createForm.institutionId}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, institutionId: event.target.value }))}
                >
                  <MenuItem value="">No institution</MenuItem>
                  {institutions.map((i) => <MenuItem key={i.id} value={i.id}>{i.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} md={3}>
                <Autocomplete
                  freeSolo
                  options={GENDER_PRESETS}
                  inputValue={createForm.genderCategory}
                  onInputChange={(event, value) => setCreateForm((prev) => ({ ...prev, genderCategory: value }))}
                  renderInput={(params) => <TextField {...params} fullWidth label="Gender category" />}
                />
              </Grid>
            </Grid>
            {createError && <Alert severity="error" sx={{ mt: 2 }}>{createError}</Alert>}
            {createNotice && <Alert severity="success" sx={{ mt: 2 }}>{createNotice}</Alert>}
            <Button variant="contained" sx={{ mt: 2 }} onClick={createTeam} disabled={creating || !createForm.name.trim()}>
              {creating ? 'Creating…' : 'Create team'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h5" fontWeight={700}>Team management</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Configure an existing team.
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth select label="Team" value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  disabled={teamsLoading || teams.length === 0}
                >
                  {teams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                </TextField>
              </Grid>
            </Grid>
            {teamsError && <Alert severity="error" sx={{ mt: 2 }}>{teamsError}</Alert>}

            {teamId && (
              <>
                <Grid container spacing={2} sx={{ mt: 0 }}>
                  <Grid item xs={12} md={6}><TextField fullWidth label="Coach" value={form.coachName} onChange={(event) => setForm((prev) => ({ ...prev, coachName: event.target.value }))} /></Grid>
                  <Grid item xs={12} md={6}><TextField fullWidth label="Team Manager" value={form.managerName} onChange={(event) => setForm((prev) => ({ ...prev, managerName: event.target.value }))} /></Grid>
                  <Grid item xs={12} md={6}><TextField fullWidth label="Statistician" value={form.statisticianName} onChange={(event) => setForm((prev) => ({ ...prev, statisticianName: event.target.value }))} /></Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth select label="Institution" value={form.institutionId}
                      onChange={(event) => setForm((prev) => ({ ...prev, institutionId: event.target.value }))}
                    >
                      <MenuItem value="">No institution</MenuItem>
                      {institutions.map((i) => <MenuItem key={i.id} value={i.id}>{i.name}</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Autocomplete
                      freeSolo
                      options={GENDER_PRESETS}
                      inputValue={form.genderCategory}
                      onInputChange={(event, value) => setForm((prev) => ({ ...prev, genderCategory: value }))}
                      renderInput={(params) => <TextField {...params} fullWidth label="Gender category" />}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <ColorField label="Primary Colour" value={form.colorPrimary} onChange={(hex) => setForm((prev) => ({ ...prev, colorPrimary: hex }))} />
                    <ColorField label="Secondary Colour" value={form.colorSecondary} onChange={(hex) => setForm((prev) => ({ ...prev, colorSecondary: hex }))} />
                    <FormControlLabel
                      control={<Switch checked={advancedOpen} onChange={(event) => setAdvancedOpen(event.target.checked)} />}
                      label="Advanced: enter custom hex codes"
                    />
                    {advancedOpen && (
                      <Grid container spacing={2} sx={{ mt: 0.5 }}>
                        <Grid item xs={12} md={6}>
                          <TextField fullWidth label="Primary hex" value={form.colorPrimary} onChange={(event) => setForm((prev) => ({ ...prev, colorPrimary: event.target.value }))} helperText="e.g. #ff7a1a" />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField fullWidth label="Secondary hex" value={form.colorSecondary} onChange={(event) => setForm((prev) => ({ ...prev, colorSecondary: event.target.value }))} helperText="e.g. #111827" />
                        </Grid>
                      </Grid>
                    )}
                  </Grid>
                </Grid>
                {saveError && <Alert severity="error" sx={{ mt: 2 }}>{saveError}</Alert>}
                <Button variant="contained" sx={{ mt: 2 }} onClick={saveTeam} disabled={saving}>
                  {saving ? 'Saving…' : `Save ${selectedTeamName}`}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Teams</Typography>
            {teamsLoading ? (
              <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>
            ) : (
              <Table size="small" sx={{ mt: 2 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Institution</TableCell>
                    <TableCell>Gender</TableCell>
                    <TableCell>Coach</TableCell>
                    <TableCell>Team Manager</TableCell>
                    <TableCell>Statistician</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {teams.map((team) => (
                    <TableRow key={team.id}>
                      <TableCell>{team.name}</TableCell>
                      <TableCell>{institutions.find((i) => i.id === team.institution_id)?.name || '—'}</TableCell>
                      <TableCell>{team.gender_category || '—'}</TableCell>
                      <TableCell>{team.coach_name || '—'}</TableCell>
                      <TableCell>{team.manager_name || '—'}</TableCell>
                      <TableCell>{team.statistician_name || '—'}</TableCell>
                    </TableRow>
                  ))}
                  {teams.length === 0 && (
                    <TableRow><TableCell colSpan={6}>No teams yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Box>
    </Layout>
  );
}

export default TeamsManagement;
