import { Box, Button, Card, CardContent, Chip, Grid, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import Layout from '../components/Layout';

function LeaguesManagement({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [form, setForm] = useState({ name: '', country: '', level: '', season: '2026/27', status: 'active' });
  const [refreshToken, setRefreshToken] = useState(0);
  const leagues = useMemo(() => JSON.parse(window.localStorage.getItem('courtiq-leagues') || '[]'), [refreshToken]);

  const createLeague = () => {
    const nextLeagues = [...leagues, { id: `league-${Date.now()}`, ...form }];
    window.localStorage.setItem('courtiq-leagues', JSON.stringify(nextLeagues));
    setForm({ name: '', country: '', level: '', season: '2026/27', status: 'active' });
    setRefreshToken((prev) => prev + 1);
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h5" fontWeight={700}>League management</Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}><TextField fullWidth label="League name" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Country" value={form.country} onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Level" value={form.level} onChange={(event) => setForm((prev) => ({ ...prev, level: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Season" value={form.season} onChange={(event) => setForm((prev) => ({ ...prev, season: event.target.value }))} /></Grid>
            </Grid>
            <Button variant="contained" sx={{ mt: 2 }} onClick={createLeague}>Create league</Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Leagues</Typography>
            <Table size="small" sx={{ mt: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Country</TableCell>
                  <TableCell>Level</TableCell>
                  <TableCell>Season</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {leagues.map((league) => (
                  <TableRow key={league.id}>
                    <TableCell>{league.name}</TableCell>
                    <TableCell>{league.country}</TableCell>
                    <TableCell>{league.level}</TableCell>
                    <TableCell>{league.season}</TableCell>
                    <TableCell><Chip label={league.status} size="small" /></TableCell>
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

export default LeaguesManagement;
