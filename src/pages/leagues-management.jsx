import {
  Alert, Box, Button, Card, CardContent, CircularProgress,
  Grid, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import Layout from '../components/layout';
import { backendApi } from '../api/client';

// FR-11: real league/competition configuration against the backend
// `leagues` table (backend/src/routes/leagues.js), replacing the old
// localStorage-only version of this page (which wrote to
// 'courtiq-leagues' and was never read by anything real). The old mock
// form had Country, Level, and Status fields with no matching real
// column -- `leagues` only has name (required), category, season,
// description. Dropped rather than inventing schema for them.

function LeaguesManagement({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [leagues, setLeagues] = useState([]);
  const [leaguesLoading, setLeaguesLoading] = useState(true);
  const [leaguesError, setLeaguesError] = useState('');

  const [form, setForm] = useState({ name: '', category: '', season: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [removingId, setRemovingId] = useState(null);

  const loadLeagues = () => {
    setLeaguesLoading(true);
    setLeaguesError('');
    backendApi.getLeagues()
      .then(setLeagues)
      .catch((err) => setLeaguesError(err.message || 'Could not load leagues.'))
      .finally(() => setLeaguesLoading(false));
  };

  useEffect(() => {
    loadLeagues();
  }, []);

  const createLeague = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await backendApi.createLeague({
        name: form.name.trim(),
        category: form.category || null,
        season: form.season || null,
        description: form.description || null,
      });
      setForm({ name: '', category: '', season: '', description: '' });
      loadLeagues();
    } catch (err) {
      setSubmitError(err.message || 'Could not create league.');
    } finally {
      setSubmitting(false);
    }
  };

  const removeLeague = async (leagueId) => {
    setRemovingId(leagueId);
    try {
      await backendApi.deleteLeague(leagueId);
      loadLeagues();
    } catch (err) {
      setLeaguesError(err.message || 'Could not remove league.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h5" fontWeight={700}>League management</Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}><TextField fullWidth label="League name" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Category" value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Season" value={form.season} onChange={(event) => setForm((prev) => ({ ...prev, season: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Description" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} /></Grid>
            </Grid>
            {submitError && <Alert severity="error" sx={{ mt: 2 }}>{submitError}</Alert>}
            <Button
              variant="contained" sx={{ mt: 2 }} onClick={createLeague}
              disabled={submitting || !form.name.trim()}
            >
              {submitting ? 'Creating…' : 'Create league'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Leagues</Typography>
            {leaguesLoading ? (
              <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>
            ) : (
              <>
                {leaguesError && <Alert severity="error" sx={{ mt: 2 }}>{leaguesError}</Alert>}
                <Table size="small" sx={{ mt: 2 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Category</TableCell>
                      <TableCell>Season</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {leagues.map((league) => (
                      <TableRow key={league.id}>
                        <TableCell>{league.name}</TableCell>
                        <TableCell>{league.category || '—'}</TableCell>
                        <TableCell>{league.season || '—'}</TableCell>
                        <TableCell>{league.description || '—'}</TableCell>
                        <TableCell>
                          <Button
                            size="small" variant="outlined" color="error"
                            disabled={removingId === league.id}
                            onClick={() => removeLeague(league.id)}
                          >
                            {removingId === league.id ? 'Removing…' : 'Remove'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {leagues.length === 0 && (
                      <TableRow><TableCell colSpan={5}>No leagues yet.</TableCell></TableRow>
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

export default LeaguesManagement;
