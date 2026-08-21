import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import Layout from '../components/layout';
import { backendApi } from '../api/client';

// Real competition data against the backend `competitions` table
// (backend/src/routes/competitions.js), renamed from `leagues` -- the old
// name was actively wrong once this entity also covers Friendlies and
// Tournaments, which are not leagues. `type` is now required (the fixed
// set the backend distinguishes); the old free-text "Season" field is
// gone entirely -- a competition no longer belongs to one season by
// construction (a season links into one instead, a later round's job).
// Mirrors competitions-management.jsx's own shape; this page stays a
// lighter "directory" view alongside it (Create + Delete, no Category
// edit surface here) rather than being folded into one page, matching
// how the two pages already divided this work before the rename.

const TYPE_LABELS = {
  league_tier: 'League tier',
  custom_recurring: 'Custom (recurring)',
  friendly: 'Friendly',
  tournament: 'Tournament',
};

function Competitions({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [competitions, setCompetitions] = useState([]);
  const [competitionsLoading, setCompetitionsLoading] = useState(true);
  const [competitionsError, setCompetitionsError] = useState('');

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('league_tier');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [removingId, setRemovingId] = useState(null);
  const [notice, setNotice] = useState('');

  const canManage = role === 'Statistician' || role === 'Team Manager';

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
  }, []);

  const addCompetition = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await backendApi.createCompetition({
        name: name.trim(),
        category: category || null,
        type,
        description: description || null,
      });
      setName('');
      setCategory('');
      setType('league_tier');
      setDescription('');
      setNotice(`Saved ${name.trim()}`);
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Competition directory</Typography>
          <Typography color="text.secondary">Track the leagues, tournaments, and friendlies that organize your season.</Typography>
        </Box>
      </Box>

      {competitionsError && <Alert severity="error" sx={{ mb: 2 }}>{competitionsError}</Alert>}

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Configured competitions</Typography>
              {competitionsLoading ? (
                <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>
              ) : (
                <Stack spacing={2}>
                  {competitions.map((competition) => (
                    <Box key={competition.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography fontWeight={700}>{competition.name}</Typography>
                        <Chip label={TYPE_LABELS[competition.type] || competition.type} color="primary" size="small" />
                      </Box>
                      {competition.description && <Typography color="text.secondary" mt={1}>{competition.description}</Typography>}
                      <Typography variant="body2" mt={1}>Category: {competition.category || 'Open'}</Typography>
                      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                        <Button
                          size="small" variant="outlined" color="error"
                          disabled={!canManage || removingId === competition.id}
                          onClick={() => removeCompetition(competition.id)}
                        >
                          {removingId === competition.id ? 'Deleting…' : 'Delete'}
                        </Button>
                      </Stack>
                    </Box>
                  ))}
                  {competitions.length === 0 && <Typography color="text.secondary">No competitions yet.</Typography>}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Create competition</Typography>
              <Stack spacing={2}>
                <TextField label="Competition name" value={name} onChange={(event) => setName(event.target.value)} fullWidth />
                <TextField select label="Type" value={type} onChange={(event) => setType(event.target.value)} fullWidth>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <MenuItem key={value} value={value}>{label}</MenuItem>
                  ))}
                </TextField>
                <TextField label="Category" value={category} onChange={(event) => setCategory(event.target.value)} fullWidth />
                <TextField label="Description" value={description} onChange={(event) => setDescription(event.target.value)} fullWidth />
                {submitError && <Alert severity="error">{submitError}</Alert>}
                <Button variant="contained" color="primary" onClick={addCompetition} disabled={!canManage || submitting || !name.trim()}>
                  {submitting ? 'Saving…' : 'Save competition'}
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

export default Competitions;
