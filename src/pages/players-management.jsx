import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Grid, MenuItem, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import Layout from '../components/layout';
import { backendApi } from '../api/client';

// FR-11: real roster assignment against the backend `players` table
// (backend/src/routes/players.js), replacing the old localStorage-only
// version of this page (which wrote to 'courtiq-players' and was never
// read by anything real). The form is limited to the columns that
// actually exist on `players` -- id, team_id, full_name, jersey_number,
// position -- rather than carrying over fields (photo, DOB, medical
// notes, etc.) that have nowhere real to be stored.

function PlayersManagement({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout, currentUser }) {
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState('');
  const [teamId, setTeamId] = useState('');

  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState('');

  const [form, setForm] = useState({ fullName: '', jerseyNumber: '', position: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [removingId, setRemovingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setTeamsLoading(true);
    backendApi.getTeams()
      .then((data) => {
        if (cancelled) return;
        setTeams(data);
        // Matched by currentUser.teamId -- a real, stable id, not a name
        // string. Matching on the display name (currentUser.team vs
        // t.name) broke silently the moment the two disagreed on
        // formatting (a stale cached session's "USIU Tigers Men" vs the
        // real team's actual name "USIU Tigers (Men)") -- exact-string
        // matching is still just as fragile as fuzzy matching once the
        // two sides can drift, it just fails differently. No match
        // leaves teamId empty (the Team dropdown below still lets them
        // pick one manually) rather than silently loading the wrong
        // team's real roster.
        const myTeam = data.find((t) => t.id === currentUser?.teamId);
        if (myTeam) {
          setTeamId(myTeam.id);
        } else {
          setTeamsError(`Could not find your team (${currentUser?.team || 'unknown'}) in the team list.`);
        }
      })
      .catch((err) => { if (!cancelled) setTeamsError(err.message || 'Could not load teams.'); })
      .finally(() => { if (!cancelled) setTeamsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRoster = (id) => {
    if (!id) return;
    setRosterLoading(true);
    setRosterError('');
    backendApi.getTeamPlayers(id)
      .then(setRoster)
      .catch((err) => setRosterError(err.message || 'Could not load roster.'))
      .finally(() => setRosterLoading(false));
  };

  useEffect(() => {
    if (teamId) loadRoster(teamId);
  }, [teamId]);

  const createPlayer = async () => {
    if (!teamId || !form.fullName.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await backendApi.addPlayer(teamId, {
        fullName: form.fullName.trim(),
        jerseyNumber: form.jerseyNumber ? Number(form.jerseyNumber) : null,
        position: form.position || null,
      });
      setForm({ fullName: '', jerseyNumber: '', position: '' });
      loadRoster(teamId);
    } catch (err) {
      setSubmitError(err.message || 'Could not add player.');
    } finally {
      setSubmitting(false);
    }
  };

  const removePlayer = async (playerId) => {
    setRemovingId(playerId);
    try {
      await backendApi.removePlayer(teamId, playerId);
      loadRoster(teamId);
    } catch (err) {
      setRosterError(err.message || 'Could not remove player.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h5" fontWeight={700}>Player management</Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth select label="Team" value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  disabled={teamsLoading || teams.length === 0}
                >
                  {teams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Name" value={form.fullName} onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Jersey Number" value={form.jerseyNumber} onChange={(event) => setForm((prev) => ({ ...prev, jerseyNumber: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Position" value={form.position} onChange={(event) => setForm((prev) => ({ ...prev, position: event.target.value }))} /></Grid>
            </Grid>
            {teamsError && <Alert severity="error" sx={{ mt: 2 }}>{teamsError}</Alert>}
            {submitError && <Alert severity="error" sx={{ mt: 2 }}>{submitError}</Alert>}
            <Button
              variant="contained" sx={{ mt: 2 }} onClick={createPlayer}
              disabled={submitting || !teamId || !form.fullName.trim()}
            >
              {submitting ? 'Adding…' : 'Add player'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Roster</Typography>
            {rosterLoading ? (
              <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>
            ) : (
              <>
                {rosterError && <Alert severity="error" sx={{ mt: 2 }}>{rosterError}</Alert>}
                <Table size="small" sx={{ mt: 2 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Jersey Number</TableCell>
                      <TableCell>Position</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {roster.map((player) => (
                      <TableRow key={player.id}>
                        <TableCell>{player.full_name}</TableCell>
                        <TableCell>{player.jersey_number ?? '—'}</TableCell>
                        <TableCell>{player.position || '—'}</TableCell>
                        <TableCell>
                          <Button
                            size="small" variant="outlined" color="error"
                            disabled={removingId === player.id}
                            onClick={() => removePlayer(player.id)}
                          >
                            {removingId === player.id ? 'Removing…' : 'Remove'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {roster.length === 0 && (
                      <TableRow><TableCell colSpan={4}>No players on this roster yet.</TableCell></TableRow>
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

export default PlayersManagement;
