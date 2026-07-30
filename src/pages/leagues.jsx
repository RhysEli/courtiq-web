import { Box, Button, Card, CardContent, Chip, Grid, Stack, TextField, Typography, Alert } from '@mui/material';
import { useEffect, useState } from 'react';
import Layout from '../components/layout';
import { archiveLeague, createLeague, deleteLeague, getLeagues, updateLeague } from '../services/managementService';

function Leagues({ mode, toggleTheme, selectedTeam, onTeamChange, role, leagues, setLeagues, selectedSeason, logout }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [season, setSeason] = useState('2026/27');
  const [description, setDescription] = useState('');
  const [notice, setNotice] = useState('');

  const canManage = role === 'Statistician' || role === 'Team Manager';

  useEffect(() => {
    if (setLeagues) {
      setLeagues(getLeagues());
    }
  }, [setLeagues]);

  const addLeague = () => {
    if (!name.trim()) return;
    const league = createLeague({ name, category, season, description });
    setLeagues((prev) => [...prev, league]);
    setName('');
    setCategory('');
    setSeason('2026/27');
    setDescription('');
    setNotice(`Saved ${league.name}`);
  };

  const saveEdit = (leagueId) => {
    const updated = updateLeague(leagueId, { description });
    setLeagues(updated);
    setNotice('Updated league');
  };

  const archive = (leagueId) => {
    const updated = archiveLeague(leagueId);
    setLeagues(updated);
    setNotice('Archived league');
  };

  const remove = (leagueId) => {
    const updated = deleteLeague(leagueId);
    setLeagues(updated);
    setNotice('Deleted league');
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
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
                      <Chip label={league.archived ? 'Archived' : league.season} color="primary" size="small" />
                    </Box>
                    <Typography color="text.secondary" mt={1}>{league.description}</Typography>
                    <Typography variant="body2" mt={1}>Category: {league.category || 'Open'}</Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                      <Button size="small" variant="outlined" onClick={() => saveEdit(league.id)} disabled={!canManage}>Edit</Button>
                      <Button size="small" variant="outlined" onClick={() => archive(league.id)} disabled={!canManage}>Archive</Button>
                      <Button size="small" variant="outlined" color="error" onClick={() => remove(league.id)} disabled={!canManage}>Delete</Button>
                    </Stack>
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
