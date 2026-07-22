import { Box, Button, Card, CardContent, Chip, Grid, Stack, TextField, Typography, Alert } from '@mui/material';
import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { archiveSeason, createSeason, getSeasons, setActiveSeason } from '../services/managementService';

function Seasons({ mode, toggleTheme, selectedTeam, onTeamChange, role, seasons, setSeasons, selectedSeason, onSeasonChange, logout }) {
  const [name, setName] = useState('');
  const [notice, setNotice] = useState('');
  const canManage = role === 'Statistician' || role === 'Team Manager';

  useEffect(() => {
    if (setSeasons) {
      setSeasons(getSeasons());
    }
  }, [setSeasons]);

  const addSeason = () => {
    if (!name.trim()) return;
    const season = createSeason({ name });
    setSeasons((prev) => [...prev, season]);
    setName('');
    setNotice(`Created ${season.name}`);
  };

  const activate = (seasonId) => {
    const updated = setActiveSeason(seasonId);
    setSeasons(updated);
    onSeasonChange?.(updated.find((season) => season.id === seasonId)?.name || selectedSeason);
    setNotice('Activated season');
  };

  const archive = (seasonId) => {
    const updated = archiveSeason(seasonId);
    setSeasons(updated);
    setNotice('Archived season');
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Season control center</Typography>
          <Typography color="text.secondary">Switch the active season and keep all reports aligned with the right campaign.</Typography>
        </Box>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Seasons</Typography>
              <Stack spacing={2}>
                {seasons.map((season) => (
                  <Box key={season.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography fontWeight={700}>{season.name}</Typography>
                      <Typography color="text.secondary">{season.active ? 'Active season' : season.archived ? 'Archived' : 'Inactive'}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Chip label={season.active ? 'Current' : 'Inactive'} color={season.active ? 'primary' : 'default'} />
                      <Button variant="outlined" size="small" onClick={() => activate(season.id)} disabled={!canManage}>Activate</Button>
                      <Button variant="outlined" size="small" onClick={() => archive(season.id)} disabled={!canManage}>Archive</Button>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Create season</Typography>
              <Stack spacing={2}>
                <TextField label="Season label" value={name} onChange={(event) => setName(event.target.value)} fullWidth />
                <Button variant="contained" color="primary" onClick={addSeason} disabled={!canManage}>Save season</Button>
                {notice && <Alert severity="success">{notice}</Alert>}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Layout>
  );
}

export default Seasons;
