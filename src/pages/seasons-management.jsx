import { Box, Button, Card, CardContent, Chip, Grid, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import Layout from '../components/Layout';

function SeasonsManagement({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [form, setForm] = useState({ name: '', status: 'draft' });
  const [refreshToken, setRefreshToken] = useState(0);
  const seasons = useMemo(() => JSON.parse(window.localStorage.getItem('courtiq-seasons') || '[]'), [refreshToken]);

  const createSeason = () => {
    const nextSeasons = [...seasons, { id: `season-${Date.now()}`, ...form }];
    window.localStorage.setItem('courtiq-seasons', JSON.stringify(nextSeasons));
    setForm({ name: '', status: 'draft' });
    setRefreshToken((prev) => prev + 1);
  };

  const activateSeason = (seasonId) => {
    const nextSeasons = seasons.map((season) => ({ ...season, status: season.id === seasonId ? 'active' : 'archived' }));
    window.localStorage.setItem('courtiq-seasons', JSON.stringify(nextSeasons));
    setRefreshToken((prev) => prev + 1);
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h5" fontWeight={700}>Season management</Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}><TextField fullWidth label="Season name" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} /></Grid>
            </Grid>
            <Button variant="contained" sx={{ mt: 2 }} onClick={createSeason}>Create season</Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Seasons</Typography>
            <Table size="small" sx={{ mt: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {seasons.map((season) => (
                  <TableRow key={season.id}>
                    <TableCell>{season.name}</TableCell>
                    <TableCell><Chip label={season.status} size="small" /></TableCell>
                    <TableCell><Button size="small" variant="outlined" onClick={() => activateSeason(season.id)}>Activate</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Box>
    </Layout>
  );
}

export default SeasonsManagement;
