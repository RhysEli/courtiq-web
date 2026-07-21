import { Box, Button, Card, CardContent, Chip, Grid, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import Layout from '../components/Layout';

function Leagues({ mode, toggleTheme, selectedTeam, onTeamChange, role, leagues, setLeagues }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [season, setSeason] = useState('2026/27');
  const [description, setDescription] = useState('');

  const canManage = role === 'Administrator' || role === 'Coach';

  const addLeague = () => {
    if (!name.trim()) return;
    setLeagues((prev) => [...prev, { id: prev.length + 1, name, category, season, description }]);
    setName('');
    setCategory('');
    setSeason('2026/27');
    setDescription('');
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>League directory</Typography>
          <Typography color="text.secondary">Track the competitions and divisions that organize your season.</Typography>
        </Box>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Configured leagues</Typography>
              <Stack spacing={2}>
                {leagues.map((league) => (
                  <Box key={league.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography fontWeight={700}>{league.name}</Typography>
                      <Chip label={league.season} color="primary" size="small" />
                    </Box>
                    <Typography color="text.secondary" mt={1}>{league.description}</Typography>
                    <Typography variant="body2" mt={1}>Category: {league.category || 'Open'}</Typography>
                  </Box>
                ))}
              </Stack>
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
                <Button variant="contained" color="primary" onClick={addLeague} disabled={!canManage}>Save league</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Layout>
  );
}

export default Leagues;
