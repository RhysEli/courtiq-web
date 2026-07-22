import { Box, Button, Card, CardContent, Chip, Grid, Stack, TextField, Typography, Alert } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { createInstitution, getInstitutions } from '../services/managementService';

function Institutions({ mode, toggleTheme, selectedTeam, onTeamChange, role, institutions, setInstitutions, selectedSeason, logout }) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [teams, setTeams] = useState('');
  const [notice, setNotice] = useState('');

  const canManage = role === 'Statistician' || role === 'Team Manager';

  const institutionList = useMemo(() => institutions ?? [], [institutions]);

  useEffect(() => {
    const storedInstitutions = getInstitutions();
    if (setInstitutions && storedInstitutions.length) {
      setInstitutions(storedInstitutions);
    }
  }, [setInstitutions]);

  const addInstitution = () => {
    if (!name.trim()) return;
    const institution = createInstitution({ name, location, teams: teams.split(',').map((entry) => entry.trim()).filter(Boolean) });
    if (setInstitutions) {
      setInstitutions((prev) => [...prev, institution]);
    }
    setName('');
    setLocation('');
    setTeams('');
    setNotice(`Saved ${institution.name}`);
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
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
              <Stack spacing={2}>
                {institutionList.map((institution) => (
                  <Box key={institution.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography fontWeight={700}>{institution.name}</Typography>
                      <Chip label={institution.location || 'Regional'} color="primary" size="small" />
                    </Box>
                    <Typography color="text.secondary" mt={1}>{institution.teams?.join(' • ')}</Typography>
                  </Box>
                ))}
              </Stack>
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
                <TextField label="Teams (comma separated)" value={teams} onChange={(event) => setTeams(event.target.value)} fullWidth />
                <Button variant="contained" color="primary" onClick={addInstitution} disabled={!canManage}>Save institution</Button>
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
