import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, FormControlLabel, Grid, MenuItem,
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
//
// Step 12: a real "Competition memberships" section for the selected
// team -- team_competition_seasons (Step 8) and stages (Step 11) both
// had complete, tested backends and zero frontend consumers until now.
// Placed here rather than a new page: this IS the existing team-
// management surface, the selected team is already resolved, and a
// membership is fundamentally team configuration, the same category as
// everything else on this page. Two DIFFERENT gates apply within the
// same card, deliberately not the same one: membership rows themselves
// (add/remove) are Statistician-only (Step 8's precedent), but stages
// nested inside a membership are Statistician + Team Manager shared
// (Step 11's deliberate departure from that precedent, since stage
// tagging is ongoing day-to-day work, not one-time structural setup).
// Reflected here in what's enabled, not left for the backend to 403.

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

  // Step 12: competition memberships (team_competition_seasons) + stages
  // for whichever team is selected above.
  const canManageMembership = role === 'Statistician';
  const canManageStages = role === 'Statistician' || role === 'Team Manager';

  const [realSeasons, setRealSeasons] = useState([]);
  const [realCompetitions, setRealCompetitions] = useState([]);

  const [tcsRows, setTcsRows] = useState([]);
  const [tcsLoading, setTcsLoading] = useState(false);
  const [tcsError, setTcsError] = useState('');

  const [newMembership, setNewMembership] = useState({ seasonId: '', competitionId: '' });
  const [addingMembership, setAddingMembership] = useState(false);
  const [addMembershipError, setAddMembershipError] = useState('');
  const [removingMembershipId, setRemovingMembershipId] = useState(null);

  // Stages, keyed by team_competition_seasons id -- one team can hold
  // several memberships (Step 8: regular league tier AND a one-off
  // tournament in the same season), each with its own independent stage
  // list.
  const [stagesByTcs, setStagesByTcs] = useState({});
  const [newStageNameByTcs, setNewStageNameByTcs] = useState({});
  const [addingStageTcsId, setAddingStageTcsId] = useState(null);
  const [stageErrorByTcs, setStageErrorByTcs] = useState({});
  const [removingStageId, setRemovingStageId] = useState(null);

  const loadMemberships = (id) => {
    if (!id) { setTcsRows([]); return; }
    setTcsLoading(true);
    setTcsError('');
    backendApi.getTeamCompetitionSeasons(id)
      .then((rows) => {
        setTcsRows(rows);
        rows.forEach((tcs) => {
          backendApi.getStages(id, tcs.id)
            .then((stages) => setStagesByTcs((prev) => ({ ...prev, [tcs.id]: stages })))
            .catch(() => setStagesByTcs((prev) => ({ ...prev, [tcs.id]: [] })));
        });
      })
      .catch((err) => { setTcsError(err.message || 'Could not load competition memberships.'); setTcsRows([]); })
      .finally(() => setTcsLoading(false));
  };

  const addMembership = async () => {
    if (!teamId || !newMembership.seasonId || !newMembership.competitionId) return;
    setAddingMembership(true);
    setAddMembershipError('');
    try {
      await backendApi.addTeamCompetitionSeason(teamId, newMembership);
      setNewMembership({ seasonId: '', competitionId: '' });
      loadMemberships(teamId);
    } catch (err) {
      setAddMembershipError(err.message || 'Could not add membership.');
    } finally {
      setAddingMembership(false);
    }
  };

  const removeMembership = async (tcsId) => {
    setRemovingMembershipId(tcsId);
    setTcsError('');
    try {
      await backendApi.removeTeamCompetitionSeason(teamId, tcsId);
      loadMemberships(teamId);
    } catch (err) {
      setTcsError(err.message || 'Could not remove membership.');
    } finally {
      setRemovingMembershipId(null);
    }
  };

  const addStage = async (tcsId) => {
    const name = (newStageNameByTcs[tcsId] || '').trim();
    if (!name) return;
    setAddingStageTcsId(tcsId);
    setStageErrorByTcs((prev) => ({ ...prev, [tcsId]: '' }));
    try {
      const stage = await backendApi.createStage(teamId, tcsId, { name });
      setStagesByTcs((prev) => ({ ...prev, [tcsId]: [...(prev[tcsId] || []), stage] }));
      setNewStageNameByTcs((prev) => ({ ...prev, [tcsId]: '' }));
    } catch (err) {
      setStageErrorByTcs((prev) => ({ ...prev, [tcsId]: err.message || 'Could not add stage.' }));
    } finally {
      setAddingStageTcsId(null);
    }
  };

  const removeStage = async (tcsId, stageId) => {
    setRemovingStageId(stageId);
    setStageErrorByTcs((prev) => ({ ...prev, [tcsId]: '' }));
    try {
      await backendApi.removeStage(teamId, tcsId, stageId);
      setStagesByTcs((prev) => ({ ...prev, [tcsId]: (prev[tcsId] || []).filter((s) => s.id !== stageId) }));
    } catch (err) {
      setStageErrorByTcs((prev) => ({ ...prev, [tcsId]: err.message || 'Could not remove stage.' }));
    } finally {
      setRemovingStageId(null);
    }
  };

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
    backendApi.getSeasons().then(setRealSeasons).catch(() => setRealSeasons([]));
    backendApi.getCompetitions().then(setRealCompetitions).catch(() => setRealCompetitions([]));
  }, []);

  useEffect(() => {
    loadMemberships(teamId);
    setNewMembership({ seasonId: '', competitionId: '' });
    setAddMembershipError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

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

        {teamId && (
          <Card>
            <CardContent>
              <Typography variant="h5" fontWeight={700}>Competition memberships</Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Which competitions and seasons {selectedTeamName} has played in, and each one's stage structure.
                {!canManageMembership && ' Adding or removing a membership is Statistician-only -- you can still add and remove stages on the memberships already recorded below.'}
              </Typography>

              {canManageMembership ? (
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} sm={5}>
                    <TextField
                      fullWidth select label="Season" value={newMembership.seasonId}
                      onChange={(event) => setNewMembership((prev) => ({ ...prev, seasonId: event.target.value }))}
                    >
                      {realSeasons.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={5}>
                    <TextField
                      fullWidth select label="Competition" value={newMembership.competitionId}
                      onChange={(event) => setNewMembership((prev) => ({ ...prev, competitionId: event.target.value }))}
                    >
                      {realCompetitions.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={2}>
                    <Button
                      fullWidth variant="contained" onClick={addMembership}
                      disabled={addingMembership || !newMembership.seasonId || !newMembership.competitionId}
                    >
                      {addingMembership ? 'Adding…' : 'Add'}
                    </Button>
                  </Grid>
                </Grid>
              ) : null}
              {addMembershipError && <Alert severity="error" sx={{ mt: 2 }}>{addMembershipError}</Alert>}
              {tcsError && <Alert severity="error" sx={{ mt: 2 }}>{tcsError}</Alert>}

              <Stack spacing={2} sx={{ mt: 3 }}>
                {tcsLoading && (
                  <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>
                )}
                {!tcsLoading && tcsRows.length === 0 && (
                  <Typography color="text.secondary">No competition memberships recorded for {selectedTeamName} yet.</Typography>
                )}
                {!tcsLoading && tcsRows.map((tcs) => {
                  const stages = stagesByTcs[tcs.id];
                  return (
                    <Box key={tcs.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1}>
                        <Box>
                          <Typography fontWeight={700}>{tcs.competition_name}</Typography>
                          <Typography color="text.secondary" variant="body2">{tcs.season_name} • {tcs.competition_type}</Typography>
                        </Box>
                        {canManageMembership && (
                          <Button
                            size="small" variant="outlined" color="error"
                            disabled={removingMembershipId === tcs.id}
                            onClick={() => removeMembership(tcs.id)}
                          >
                            {removingMembershipId === tcs.id ? 'Removing…' : 'Remove membership'}
                          </Button>
                        )}
                      </Stack>

                      <Divider sx={{ my: 1.5 }} />

                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Stages</Typography>
                      {stages === undefined ? (
                        <CircularProgress size={18} />
                      ) : (
                        <>
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                            {stages.map((stage) => (
                              <Chip
                                key={stage.id}
                                label={stage.name}
                                onDelete={canManageStages ? () => removeStage(tcs.id, stage.id) : undefined}
                                disabled={removingStageId === stage.id}
                              />
                            ))}
                            {stages.length === 0 && (
                              <Typography color="text.secondary" variant="body2">No stages added yet.</Typography>
                            )}
                          </Stack>
                          {canManageStages && (
                            <Stack direction="row" spacing={1}>
                              <TextField
                                size="small" label="New stage (e.g. Round 1)"
                                value={newStageNameByTcs[tcs.id] || ''}
                                onChange={(event) => setNewStageNameByTcs((prev) => ({ ...prev, [tcs.id]: event.target.value }))}
                              />
                              <Button
                                size="small" variant="outlined"
                                disabled={addingStageTcsId === tcs.id || !(newStageNameByTcs[tcs.id] || '').trim()}
                                onClick={() => addStage(tcs.id)}
                              >
                                {addingStageTcsId === tcs.id ? 'Adding…' : 'Add stage'}
                              </Button>
                            </Stack>
                          )}
                          {stageErrorByTcs[tcs.id] && <Alert severity="error" sx={{ mt: 1 }}>{stageErrorByTcs[tcs.id]}</Alert>}
                        </>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            </CardContent>
          </Card>
        )}

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
