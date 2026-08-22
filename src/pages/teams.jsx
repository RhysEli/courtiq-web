import { Alert, Avatar, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, FormControlLabel, Grid, Stack, Switch, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout';
import ColorField from '../components/ColorField';
import { backendApi } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

// FR-11: real team data against the backend `teams` table
// (backend/src/routes/teams.js), replacing the old localStorage-only
// managementService.js version of this page. Mirrors teams-management.jsx's
// finding that the real backend has no "create team" action -- teams are
// created as a side effect of Bulk Import/game data, not from this UI --
// so the old "Save Team" (create) form is dropped. "Update Selected Team"
// is kept, matching teams-management.jsx's real editable columns
// (coach/manager/statistician/colours/logo). League, season, and roster
// (comma-separated free text) never had a real column and are dropped;
// roster count is now the real count from the team's actual roster.

const emptyForm = { coachName: '', managerName: '', statisticianName: '', colorPrimary: '', colorSecondary: '', logoUrl: '' };

function Teams({ mode, toggleTheme, role, selectedSeason, logout }) {
  const { activeTeam: sessionActiveTeam } = useAuth();
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState('');

  const [rosterCount, setRosterCount] = useState(null);
  const [rosterCountError, setRosterCountError] = useState('');

  const [form, setForm] = useState(emptyForm);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');

  const canManage = role === 'Statistician' || role === 'Team Manager';

  const loadTeams = () => {
    setTeamsLoading(true);
    setTeamsError('');
    return backendApi.getTeams()
      .then((data) => { setTeams(data); return data; })
      .catch((err) => { setTeamsError(err.message || 'Could not load teams.'); return []; })
      .finally(() => setTeamsLoading(false));
  };

  useEffect(() => {
    loadTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Matched by the session's active team (Step 9 Phase 2/3) -- a real,
  // stable id, not a name string. Never a fallback to teams[0] (the
  // alphabetically-first team in the whole system's unscoped list, which
  // this account may have no relationship to at all). No match means no
  // team is shown, not a wrong one.
  const activeTeam = useMemo(
    () => teams.find((t) => t.id === sessionActiveTeam?.id),
    [teams, sessionActiveTeam],
  );

  // Populate the edit form from whichever team is currently active.
  useEffect(() => {
    setForm(activeTeam ? {
      coachName: activeTeam.coach_name || '',
      managerName: activeTeam.manager_name || '',
      statisticianName: activeTeam.statistician_name || '',
      colorPrimary: activeTeam.color_primary || '',
      colorSecondary: activeTeam.color_secondary || '',
      logoUrl: activeTeam.logo_url || '',
    } : emptyForm);
  }, [activeTeam]);

  useEffect(() => {
    if (!activeTeam) { setRosterCount(null); return; }
    setRosterCountError('');
    backendApi.getTeamPlayers(activeTeam.id)
      .then((data) => setRosterCount(data.length))
      .catch((err) => setRosterCountError(err.message || 'Could not load roster count.'));
  }, [activeTeam]);

  const updateActiveTeam = async () => {
    if (!activeTeam) return;
    setSaving(true);
    setSaveError('');
    try {
      await backendApi.updateTeam(activeTeam.id, form);
      await loadTeams();
      setNotice(`Updated ${activeTeam.name}`);
    } catch (err) {
      setSaveError(err.message || 'Could not save team.');
    } finally {
      setSaving(false);
    }
  };

  if (teamsLoading) {
    return (
      <Layout mode={mode} toggleTheme={toggleTheme} role={role} selectedSeason={selectedSeason} logout={logout}>
        <Stack alignItems="center" sx={{ py: 6 }}><CircularProgress /></Stack>
      </Layout>
    );
  }

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} role={role} selectedSeason={selectedSeason} logout={logout}>
      {teamsError && <Alert severity="error" sx={{ mb: 2 }}>{teamsError}</Alert>}
      {!teamsError && !activeTeam && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Could not find your team ({sessionActiveTeam?.name || 'unknown'}) in the team list.
        </Alert>
      )}
      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h5" fontWeight={700}>{activeTeam?.name || 'No team found'}</Typography>
                  <Typography color="text.secondary">{activeTeam?.gender_category || 'No real teams found for this organisation yet.'}</Typography>
                </Box>
                {/* Real uploaded team logo (team-brand-settings.jsx) when
                    set -- falls back to the initials automatically
                    (MUI Avatar's own behavior) for a team with no logo
                    uploaded yet. */}
                <Avatar src={activeTeam?.logo_url || undefined} sx={{ width: 72, height: 72, bgcolor: 'primary.main', fontSize: 24 }}>
                  {activeTeam?.name?.slice(0, 2).toUpperCase() || 'TM'}
                </Avatar>
              </Stack>
              <Divider sx={{ my: 3 }} />
              {activeTeam ? (
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}><TextField fullWidth label="Coach" value={form.coachName} onChange={(event) => setForm((prev) => ({ ...prev, coachName: event.target.value }))} /></Grid>
                  <Grid item xs={12} sm={6}><TextField fullWidth label="Team manager" value={form.managerName} onChange={(event) => setForm((prev) => ({ ...prev, managerName: event.target.value }))} /></Grid>
                  <Grid item xs={12} sm={6}><TextField fullWidth label="Statistician" value={form.statisticianName} onChange={(event) => setForm((prev) => ({ ...prev, statisticianName: event.target.value }))} /></Grid>
                  <Grid item xs={12} sm={6}><TextField fullWidth label="Logo URL" value={form.logoUrl} onChange={(event) => setForm((prev) => ({ ...prev, logoUrl: event.target.value }))} /></Grid>
                  <Grid item xs={12}>
                    <ColorField label="Primary colour" value={form.colorPrimary} onChange={(hex) => setForm((prev) => ({ ...prev, colorPrimary: hex }))} />
                    <ColorField label="Secondary colour" value={form.colorSecondary} onChange={(hex) => setForm((prev) => ({ ...prev, colorSecondary: hex }))} />
                    <FormControlLabel
                      control={<Switch checked={advancedOpen} onChange={(event) => setAdvancedOpen(event.target.checked)} />}
                      label="Advanced: enter custom hex codes"
                    />
                    {advancedOpen && (
                      <Grid container spacing={2} sx={{ mt: 0.5 }}>
                        <Grid item xs={12} sm={6}>
                          <TextField fullWidth label="Primary hex" value={form.colorPrimary} onChange={(event) => setForm((prev) => ({ ...prev, colorPrimary: event.target.value }))} helperText="e.g. #ff7a1a" />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <TextField fullWidth label="Secondary hex" value={form.colorSecondary} onChange={(event) => setForm((prev) => ({ ...prev, colorSecondary: event.target.value }))} helperText="e.g. #111827" />
                        </Grid>
                      </Grid>
                    )}
                  </Grid>
                  {saveError && <Grid item xs={12}><Alert severity="error">{saveError}</Alert></Grid>}
                  <Grid item xs={12}>
                    <Button variant="contained" onClick={updateActiveTeam} disabled={!canManage || saving}>
                      {saving ? 'Saving…' : `Update ${activeTeam.name}`}
                    </Button>
                  </Grid>
                  {notice && <Grid item xs={12}><Alert severity="success">{notice}</Alert></Grid>}
                </Grid>
              ) : (
                <Typography color="text.secondary">Teams are created automatically from Bulk Import/game data.</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={700}>Team Overview</Typography>
              <Stack spacing={1.5} sx={{ mt: 2 }}>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                  <Typography color="text.secondary">Category</Typography>
                  <Typography fontWeight={600}>{activeTeam?.gender_category || '—'}</Typography>
                </Box>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                  <Typography color="text.secondary">Roster count</Typography>
                  <Typography fontWeight={600}>{rosterCountError ? '—' : rosterCount === null ? '…' : `${rosterCount} players`}</Typography>
                </Box>
              </Stack>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" fontWeight={700}>Team Contacts</Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {activeTeam && [
                  { name: activeTeam.coach_name, role: 'Coach', access: 'Read' },
                  { name: activeTeam.manager_name, role: 'Team Manager', access: 'Manage' },
                  { name: activeTeam.statistician_name, role: 'Statistician', access: 'Technical' },
                ].filter((member) => member.name).map((member) => (
                  <Box key={member.role} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography fontWeight={600}>{member.name}</Typography>
                      <Typography color="text.secondary" variant="body2">{member.role}</Typography>
                    </Box>
                    <Chip label={member.access} color="primary" variant="outlined" />
                  </Box>
                ))}
                {activeTeam && ![activeTeam.coach_name, activeTeam.manager_name, activeTeam.statistician_name].some(Boolean) && (
                  <Typography color="text.secondary">No contacts configured for this team yet.</Typography>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Layout>
  );
}

export default Teams;
