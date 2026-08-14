import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import Layout from '../components/layout';
import { backendApi } from '../api/client';

// FR-11: real league/competition data against the backend `leagues` table
// (backend/src/routes/leagues.js), replacing the old localStorage-only
// managementService.js version of this page. Mirrors leagues-management.jsx's
// finding that `leagues` only has name/category/season/description columns
// and no update endpoint or "archived" flag -- so the old Edit and Archive
// actions are dropped along with the Country/Level/Status fields that never
// had a real column. Create and Delete are kept, matching what
// leagues-management.jsx already does against the real API.

function Leagues({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [leagues, setLeagues] = useState([]);
  const [leaguesLoading, setLeaguesLoading] = useState(true);
  const [leaguesError, setLeaguesError] = useState('');

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [season, setSeason] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [removingId, setRemovingId] = useState(null);
  const [notice, setNotice] = useState('');

  const canManage = role === 'Statistician' || role === 'Team Manager';

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

  const addLeague = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await backendApi.createLeague({
        name: name.trim(),
        category: category || null,
        season: season || null,
        description: description || null,
      });
      setName('');
      setCategory('');
      setSeason('');
      setDescription('');
      setNotice(`Saved ${name.trim()}`);
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>League directory</Typography>
          <Typography color="text.secondary">Track the competitions and divisions that organize your season.</Typography>
        </Box>
      </Box>

      {leaguesError && <Alert severity="error" sx={{ mb: 2 }}>{leaguesError}</Alert>}

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Configured leagues</Typography>
              {leaguesLoading ? (
                <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>
              ) : (
                <Stack spacing={2}>
                  {leagues.map((league) => (
                    <Box key={league.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography fontWeight={700}>{league.name}</Typography>
                        {league.season && <Chip label={league.season} color="primary" size="small" />}
                      </Box>
                      {league.description && <Typography color="text.secondary" mt={1}>{league.description}</Typography>}
                      <Typography variant="body2" mt={1}>Category: {league.category || 'Open'}</Typography>
                      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                        <Button
                          size="small" variant="outlined" color="error"
                          disabled={!canManage || removingId === league.id}
                          onClick={() => removeLeague(league.id)}
                        >
                          {removingId === league.id ? 'Deleting…' : 'Delete'}
                        </Button>
                      </Stack>
                    </Box>
                  ))}
                  {leagues.length === 0 && <Typography color="text.secondary">No leagues yet.</Typography>}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Create league</Typography>
              <Stack spacing={2}>
                <TextField label="League name" value={name} onChange={(event) => setName(event.target.value)} fullWidth />
                <TextField label="Category" value={category} onChange={(event) => setCategory(event.target.value)} fullWidth />
                <TextField label="Season" value={season} onChange={(event) => setSeason(event.target.value)} fullWidth />
                <TextField label="Description" value={description} onChange={(event) => setDescription(event.target.value)} fullWidth />
                {submitError && <Alert severity="error">{submitError}</Alert>}
                <Button variant="contained" color="primary" onClick={addLeague} disabled={!canManage || submitting || !name.trim()}>
                  {submitting ? 'Saving…' : 'Save league'}
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

export default Leagues;
