import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import Layout from '../components/layout';
import { backendApi } from '../api/client';

// Real institution CRUD against the `institutions` table (backend/src/
// routes/institutions.js), replacing the old localStorage-only
// managementService.js version of this page. The old "Teams (comma
// separated)" free-text field is dropped entirely -- it was never a real
// relationship. An institution's team list below is now genuinely
// derived: it filters the real GET /api/teams response on
// institution_id (a real FK), rather than being typed/edited here.
// Assigning a team to an institution happens on the team side (Team
// Management's PATCH /teams/:teamId, Step 9 Round 4), not here.
//
// No client-side role gate on the create form -- matches
// seasons-management.jsx/competitions-management.jsx's own pattern:
// /institutions is a shared route for both Statistician and Team
// Manager (roleAccess.js), but institutions.js's POST is
// Statistician-only, so a Team Manager's attempt is caught and surfaced
// as a real error from the backend, not silently disabled client-side.

function Institutions({ mode, toggleTheme, role, selectedSeason, logout }) {
  const [institutions, setInstitutions] = useState([]);
  const [institutionsLoading, setInstitutionsLoading] = useState(true);
  const [institutionsError, setInstitutionsError] = useState('');

  const [teams, setTeams] = useState([]);

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [notice, setNotice] = useState('');

  const loadInstitutions = () => {
    setInstitutionsLoading(true);
    setInstitutionsError('');
    return backendApi.getInstitutions()
      .then(setInstitutions)
      .catch((err) => setInstitutionsError(err.message || 'Could not load institutions.'))
      .finally(() => setInstitutionsLoading(false));
  };

  useEffect(() => {
    loadInstitutions();
    backendApi.getTeams().then(setTeams).catch(() => setTeams([]));
  }, []);

  const addInstitution = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    setNotice('');
    try {
      const institution = await backendApi.createInstitution({ name: name.trim(), location: location.trim() || null });
      setInstitutions((prev) => [...prev, institution].sort((a, b) => a.name.localeCompare(b.name)));
      setName('');
      setLocation('');
      setNotice(`Saved ${institution.name}`);
    } catch (err) {
      setSubmitError(err.message || 'Could not save institution.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Institution management</Typography>
          <Typography color="text.secondary">Manage the organizations, clubs, and campus programs behind each team.</Typography>
        </Box>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Active institutions</Typography>
              {institutionsLoading && (
                <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>
              )}
              {!institutionsLoading && institutionsError && <Alert severity="error">{institutionsError}</Alert>}
              {!institutionsLoading && !institutionsError && institutions.length === 0 && (
                <Alert severity="info">No institutions yet.</Alert>
              )}
              {!institutionsLoading && !institutionsError && institutions.length > 0 && (
                <Stack spacing={2}>
                  {institutions.map((institution) => {
                    const institutionTeams = teams.filter((t) => t.institution_id === institution.id);
                    return (
                      <Box key={institution.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography fontWeight={700}>{institution.name}</Typography>
                          <Chip label={institution.location || 'Regional'} color="primary" size="small" />
                        </Box>
                        <Typography color="text.secondary" mt={1}>
                          {institutionTeams.length > 0
                            ? institutionTeams.map((t) => t.name).join(' • ')
                            : 'No teams assigned yet.'}
                        </Typography>
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Add institution</Typography>
              <Stack spacing={2}>
                <TextField label="Institution name" value={name} onChange={(event) => setName(event.target.value)} fullWidth />
                <TextField label="Location" value={location} onChange={(event) => setLocation(event.target.value)} fullWidth />
                <Button variant="contained" color="primary" onClick={addInstitution} disabled={submitting || !name.trim()}>
                  {submitting ? 'Saving…' : 'Save institution'}
                </Button>
                {submitError && <Alert severity="error">{submitError}</Alert>}
                {notice && <Alert severity="success">{notice}</Alert>}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Layout>
  );
}

export default Institutions;
