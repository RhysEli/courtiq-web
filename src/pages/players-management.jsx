import { Box, Button, Card, CardContent, Grid, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import Layout from '../components/Layout';

function PlayersManagement({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [form, setForm] = useState({ name: '', photo: '', dob: '', height: '', weight: '', nationality: '', position: '', jerseyNumber: '', dominantHand: '', status: '', medicalNotes: '', season: '2026/27', team: '' });
  const [refreshToken, setRefreshToken] = useState(0);
  const players = useMemo(() => JSON.parse(window.localStorage.getItem('courtiq-players') || '[]'), [refreshToken]);

  const createPlayer = () => {
    const nextPlayers = [...players, { id: `player-${Date.now()}`, ...form }];
    window.localStorage.setItem('courtiq-players', JSON.stringify(nextPlayers));
    setForm({ name: '', photo: '', dob: '', height: '', weight: '', nationality: '', position: '', jerseyNumber: '', dominantHand: '', status: '', medicalNotes: '', season: '2026/27', team: '' });
    setRefreshToken((prev) => prev + 1);
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h5" fontWeight={700}>Player management</Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}><TextField fullWidth label="Name" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Photo" value={form.photo} onChange={(event) => setForm((prev) => ({ ...prev, photo: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="DOB" value={form.dob} onChange={(event) => setForm((prev) => ({ ...prev, dob: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Height" value={form.height} onChange={(event) => setForm((prev) => ({ ...prev, height: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Weight" value={form.weight} onChange={(event) => setForm((prev) => ({ ...prev, weight: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Nationality" value={form.nationality} onChange={(event) => setForm((prev) => ({ ...prev, nationality: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Position" value={form.position} onChange={(event) => setForm((prev) => ({ ...prev, position: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Jersey Number" value={form.jerseyNumber} onChange={(event) => setForm((prev) => ({ ...prev, jerseyNumber: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Dominant Hand" value={form.dominantHand} onChange={(event) => setForm((prev) => ({ ...prev, dominantHand: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Status" value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Season" value={form.season} onChange={(event) => setForm((prev) => ({ ...prev, season: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Team" value={form.team} onChange={(event) => setForm((prev) => ({ ...prev, team: event.target.value }))} /></Grid>
              <Grid item xs={12}><TextField fullWidth multiline minRows={3} label="Medical Notes" value={form.medicalNotes} onChange={(event) => setForm((prev) => ({ ...prev, medicalNotes: event.target.value }))} /></Grid>
            </Grid>
            <Button variant="contained" sx={{ mt: 2 }} onClick={createPlayer}>Create player</Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Players</Typography>
            <Table size="small" sx={{ mt: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Position</TableCell>
                  <TableCell>Team</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {players.map((player) => (
                  <TableRow key={player.id}>
                    <TableCell>{player.name}</TableCell>
                    <TableCell>{player.position}</TableCell>
                    <TableCell>{player.team}</TableCell>
                    <TableCell>{player.status}</TableCell>
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

export default PlayersManagement;
