import { Box, Button, Card, CardContent, Chip, Grid, Stack, TextField, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import Layout from '../components/Layout';

function Institutions({ mode, toggleTheme, selectedTeam, onTeamChange, role, institutions, setInstitutions }) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [teams, setTeams] = useState('');

  const canManage = role === 'Administrator' || role === 'Coach';

  const institutionList = useMemo(() => institutions, [institutions]);

  const addInstitution = () => {
    if (!name.trim()) return;
    setInstitutions((prev) => [
      ...prev,
      { id: `${name.toLowerCase().replace(/\s+/g, '-')}`, name, location, teams: teams.split(',').filter(Boolean) },
    ]);
    setName('');
    setLocation('');
    setTeams('');
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Institution management</Typography>
          <Typography color="text.secondary">Manage the organizations, clubs, and campus programs behind each team.</Typography>
        </Box>
        {canManage && (
          <Button variant="contained" color="primary">Create institution</Button>
        )}
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
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Layout>
  );
}

export default Institutions;
