import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Grid, MenuItem,
  Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import Layout from '../components/layout';
import { backendApi } from '../api/client';

// FR-11: real team configuration against the backend `teams` table
// (backend/src/routes/teams.js), replacing the old localStorage-only
// version of this page (which wrote to 'courtiq-teams' and was never
// read by anything real). The old mock form let you "Create team" with
// Category, Assistant Coach, Physiotherapist, Trainer, League, and
// Season fields -- none of those have a matching real column, and
// teams are already correctly created as a side effect of Bulk
// Import/game creation, so there's no real "create a team" action here.
// This page is edit-only: pick an existing real team, edit its
// coach/manager/statistician/colours/logo, save. Dropped fields are
// noted here rather than inventing schema/endpoints for them.

const emptyForm = { coachName: '', managerName: '', statisticianName: '', colorPrimary: '', colorSecondary: '', logoUrl: '' };

function TeamsManagement({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState('');
  const [teamId, setTeamId] = useState('');

  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

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
      logoUrl: team.logo_url || '',
    } : emptyForm);
  }, [teamId, teams]);

  const saveTeam = async () => {
    if (!teamId) return;
    setSaving(true);
    setSaveError('');
    try {
      await backendApi.updateTeam(teamId, form);
      await loadTeams();
    } catch (err) {
      setSaveError(err.message || 'Could not save team.');
    } finally {
      setSaving(false);
    }
  };

  const selectedTeamName = teams.find((t) => t.id === teamId)?.name || '';

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h5" fontWeight={700}>Team management</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Configure an existing team. Teams themselves are created automatically from Bulk Import/game data, not here.
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
                  <Grid item xs={12} md={6}><TextField fullWidth label="Logo URL" value={form.logoUrl} onChange={(event) => setForm((prev) => ({ ...prev, logoUrl: event.target.value }))} /></Grid>
                  <Grid item xs={12} md={6}><TextField fullWidth label="Primary Colour" value={form.colorPrimary} onChange={(event) => setForm((prev) => ({ ...prev, colorPrimary: event.target.value }))} /></Grid>
                  <Grid item xs={12} md={6}><TextField fullWidth label="Secondary Colour" value={form.colorSecondary} onChange={(event) => setForm((prev) => ({ ...prev, colorSecondary: event.target.value }))} /></Grid>
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
                    <TableCell>Coach</TableCell>
                    <TableCell>Team Manager</TableCell>
                    <TableCell>Statistician</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {teams.map((team) => (
                    <TableRow key={team.id}>
                      <TableCell>{team.name}</TableCell>
                      <TableCell>{team.coach_name || '—'}</TableCell>
                      <TableCell>{team.manager_name || '—'}</TableCell>
                      <TableCell>{team.statistician_name || '—'}</TableCell>
                    </TableRow>
                  ))}
                  {teams.length === 0 && (
                    <TableRow><TableCell colSpan={4}>No teams yet.</TableCell></TableRow>
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
