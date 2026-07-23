import { Box, Button, Card, CardContent, Grid, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import Layout from '../components/layout';

function TeamsManagement({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [form, setForm] = useState({ name: '', category: '', coach: '', assistantCoach: '', teamManager: '', statistician: '', physiotherapist: '', trainer: '', league: '', season: '2026/27', colours: '', logo: '' });
  const [refreshToken, setRefreshToken] = useState(0);
  const teams = useMemo(() => JSON.parse(window.localStorage.getItem('courtiq-teams') || '[]'), [refreshToken]);

  const createTeam = () => {
    const nextTeams = [...teams, { id: `team-${Date.now()}`, ...form }];
    window.localStorage.setItem('courtiq-teams', JSON.stringify(nextTeams));
    setForm({ name: '', category: '', coach: '', assistantCoach: '', teamManager: '', statistician: '', physiotherapist: '', trainer: '', league: '', season: '2026/27', colours: '', logo: '' });
    setRefreshToken((prev) => prev + 1);
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h5" fontWeight={700}>Team management</Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}><TextField fullWidth label="Team name" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Category" value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Coach" value={form.coach} onChange={(event) => setForm((prev) => ({ ...prev, coach: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Assistant Coach" value={form.assistantCoach} onChange={(event) => setForm((prev) => ({ ...prev, assistantCoach: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Team Manager" value={form.teamManager} onChange={(event) => setForm((prev) => ({ ...prev, teamManager: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Statistician" value={form.statistician} onChange={(event) => setForm((prev) => ({ ...prev, statistician: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Physiotherapist" value={form.physiotherapist} onChange={(event) => setForm((prev) => ({ ...prev, physiotherapist: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Trainer" value={form.trainer} onChange={(event) => setForm((prev) => ({ ...prev, trainer: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="League" value={form.league} onChange={(event) => setForm((prev) => ({ ...prev, league: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Season" value={form.season} onChange={(event) => setForm((prev) => ({ ...prev, season: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Colours" value={form.colours} onChange={(event) => setForm((prev) => ({ ...prev, colours: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Logo" value={form.logo} onChange={(event) => setForm((prev) => ({ ...prev, logo: event.target.value }))} /></Grid>
            </Grid>
            <Button variant="contained" sx={{ mt: 2 }} onClick={createTeam}>Create team</Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Teams</Typography>
            <Table size="small" sx={{ mt: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Coach</TableCell>
                  <TableCell>Season</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {teams.map((team) => (
                  <TableRow key={team.id}>
                    <TableCell>{team.name}</TableCell>
                    <TableCell>{team.category}</TableCell>
                    <TableCell>{team.coach}</TableCell>
                    <TableCell>{team.season}</TableCell>
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

export default TeamsManagement;
