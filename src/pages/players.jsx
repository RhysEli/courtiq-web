import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout';
import { backendApi } from '../api/client';

// FR-11: real roster data against the backend `players` table
// (backend/src/routes/players.js), replacing the old localStorage-only
// managementService.js version of this page. Mirrors players-management.jsx's
// data-fetching (team-scoped roster, since the real API has no global
// player list) and is limited to the columns that actually exist on
// `players` -- full_name, jersey_number, position -- rather than the mock
// data's invented fields (height, weight, status, medical notes, etc.),
// none of which have anywhere real to be stored.

function Players({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout, currentUser }) {
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState('');
  const [teamId, setTeamId] = useState('');

  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState('');

  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ fullName: '', jerseyNumber: '', position: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [removingId, setRemovingId] = useState(null);

  const canManage = role === 'Statistician' || role === 'Team Manager';

  useEffect(() => {
    let cancelled = false;
    setTeamsLoading(true);
    backendApi.getTeams()
      .then((data) => {
        if (cancelled) return;
        setTeams(data);
        // Matched by exact identity against currentUser.team -- the real,
        // backend-scoped team name from getUserTeams() at login -- never
        // a fuzzy guess against the team-switcher's mock value, and never
        // a fallback to data[0] (the alphabetically-first team in the
        // whole system's unscoped list, which this account may have no
        // relationship to at all). No match leaves teamId empty (the
        // Team dropdown below still lets them pick one manually) rather
        // than silently loading the wrong team's real roster.
        const myTeam = data.find((t) => t.name === currentUser?.team);
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

  const filteredRoster = useMemo(
    () => roster.filter((player) => `${player.full_name} ${player.position || ''}`.toLowerCase().includes(search.toLowerCase())),
    [roster, search],
  );

  const addPlayer = async () => {
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
          <Grid item xs={12} md={6}>
            <TextField label="Search players" placeholder="Search by name or position" fullWidth value={search} onChange={(event) => setSearch(event.target.value)} />
          </Grid>
        </Grid>
        {teamsError && <Alert severity="error">{teamsError}</Alert>}

        <Grid container spacing={3}>
          <Grid item xs={12} md={7}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>Roster</Typography>
                {rosterLoading ? (
                  <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>
                ) : (
                  <>
                    {rosterError && <Alert severity="error" sx={{ mt: 2 }}>{rosterError}</Alert>}
                    <Table sx={{ mt: 2 }}>
                      <TableHead>
                        <TableRow>
                          <TableCell>Player</TableCell>
                          <TableCell>Position</TableCell>
                          <TableCell>Jersey</TableCell>
                          <TableCell>Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredRoster.map((player) => (
                          <TableRow key={player.id}>
                            <TableCell>{player.full_name}</TableCell>
                            <TableCell>{player.position ? <Chip label={player.position} size="small" /> : '—'}</TableCell>
                            <TableCell>{player.jersey_number ?? '—'}</TableCell>
                            <TableCell>
                              <Button
                                size="small" variant="outlined" color="error"
                                disabled={!canManage || removingId === player.id}
                                onClick={() => removePlayer(player.id)}
                              >
                                {removingId === player.id ? 'Removing…' : 'Remove'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredRoster.length === 0 && (
                          <TableRow><TableCell colSpan={4}>No players on this roster yet.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={5}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>Add player</Typography>
                <Stack spacing={2} sx={{ mt: 2 }}>
                  <TextField label="Full name" value={form.fullName} onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))} fullWidth />
                  <TextField label="Jersey number" value={form.jerseyNumber} onChange={(event) => setForm((prev) => ({ ...prev, jerseyNumber: event.target.value }))} fullWidth />
                  <TextField label="Position" value={form.position} onChange={(event) => setForm((prev) => ({ ...prev, position: event.target.value }))} fullWidth />
                  {submitError && <Alert severity="error">{submitError}</Alert>}
                  <Button variant="contained" onClick={addPlayer} disabled={!canManage || submitting || !teamId || !form.fullName.trim()}>
                    {submitting ? 'Adding…' : 'Save player'}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </Layout>
  );
}

export default Players;
