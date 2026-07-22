import { Box, Grid, Card, CardContent, Typography, TextField, Table, TableBody, TableCell, TableHead, TableRow, Chip, Button, Alert, Stack } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { createPlayer, deletePlayer, getPlayers, updatePlayer } from '../services/managementService';

function Players({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [players, setPlayers] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ jerseyNumber: '', fullName: '', position: '', height: '', weight: '', age: '', nationality: '', dominantHand: 'Right', status: 'Active', medicalNotes: '', emergencyContact: '', currentTeam: selectedTeam || '', season: selectedSeason || '', photo: 'placeholder' });
  const [notice, setNotice] = useState('');

  const canManage = role === 'Statistician' || role === 'Team Manager';
  const canEdit = role === 'Statistician' || role === 'Team Manager';

  useEffect(() => {
    setPlayers(getPlayers());
  }, []);

  const filteredPlayers = useMemo(() => players.filter((player) => `${player.fullName} ${player.position}`.toLowerCase().includes(search.toLowerCase())), [players, search]);

  const addPlayer = () => {
    if (!form.fullName.trim()) return;
    const player = createPlayer({ ...form, currentTeam: selectedTeam || form.currentTeam, season: selectedSeason || form.season });
    setPlayers((prev) => [...prev, player]);
    setForm({ ...form, jerseyNumber: '', fullName: '', position: '', height: '', weight: '', age: '', nationality: '', dominantHand: 'Right', status: 'Active', medicalNotes: '', emergencyContact: '', currentTeam: selectedTeam || '', season: selectedSeason || '', photo: 'placeholder' });
    setNotice(`Saved ${player.fullName}`);
  };

  const editPlayer = (playerId) => {
    const target = players.find((player) => player.id === playerId);
    if (!target) return;
    const updated = updatePlayer(playerId, { status: target.status === 'Active' ? 'Inactive' : 'Active' });
    setPlayers(updated);
    setNotice('Updated player status');
  };

  const removePlayer = (playerId) => {
    const updated = deletePlayer(playerId);
    setPlayers(updated);
    setNotice('Removed player');
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <TextField label="Search players" placeholder="Search by name or position" fullWidth value={search} onChange={(event) => setSearch(event.target.value)} />
        <Grid container spacing={3}>
          <Grid item xs={12} md={7}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>Roster</Typography>
                <Table sx={{ mt: 2 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Player</TableCell>
                      <TableCell>Position</TableCell>
                      <TableCell>Jersey</TableCell>
                      <TableCell>Height</TableCell>
                      <TableCell>Weight</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredPlayers.map((player) => (
                      <TableRow key={player.id}>
                        <TableCell>{player.fullName}</TableCell>
                        <TableCell>{player.position}</TableCell>
                        <TableCell>#{player.jerseyNumber}</TableCell>
                        <TableCell>{player.height}</TableCell>
                        <TableCell>{player.weight}</TableCell>
                        <TableCell><Chip label={player.status} color={player.status === 'Active' ? 'primary' : 'default'} size="small" /></TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1}>
                            <Button size="small" variant="outlined" onClick={() => editPlayer(player.id)} disabled={!canEdit}>Edit</Button>
                            <Button size="small" variant="outlined" color="error" onClick={() => removePlayer(player.id)} disabled={!canEdit}>Remove</Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={5}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>Add / manage player</Typography>
                <Stack spacing={2} sx={{ mt: 2 }}>
                  <TextField label="Jersey number" value={form.jerseyNumber} onChange={(event) => setForm((prev) => ({ ...prev, jerseyNumber: event.target.value }))} fullWidth />
                  <TextField label="Full name" value={form.fullName} onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))} fullWidth />
                  <TextField label="Position" value={form.position} onChange={(event) => setForm((prev) => ({ ...prev, position: event.target.value }))} fullWidth />
                  <TextField label="Height" value={form.height} onChange={(event) => setForm((prev) => ({ ...prev, height: event.target.value }))} fullWidth />
                  <TextField label="Weight" value={form.weight} onChange={(event) => setForm((prev) => ({ ...prev, weight: event.target.value }))} fullWidth />
                  <TextField label="Age" value={form.age} onChange={(event) => setForm((prev) => ({ ...prev, age: event.target.value }))} fullWidth />
                  <TextField label="Nationality" value={form.nationality} onChange={(event) => setForm((prev) => ({ ...prev, nationality: event.target.value }))} fullWidth />
                  <TextField label="Dominant hand" value={form.dominantHand} onChange={(event) => setForm((prev) => ({ ...prev, dominantHand: event.target.value }))} fullWidth />
                  <TextField label="Medical notes" value={form.medicalNotes} onChange={(event) => setForm((prev) => ({ ...prev, medicalNotes: event.target.value }))} fullWidth />
                  <TextField label="Emergency contact" value={form.emergencyContact} onChange={(event) => setForm((prev) => ({ ...prev, emergencyContact: event.target.value }))} fullWidth />
                  <TextField label="Current team" value={form.currentTeam} onChange={(event) => setForm((prev) => ({ ...prev, currentTeam: event.target.value }))} fullWidth />
                  <TextField label="Season" value={form.season} onChange={(event) => setForm((prev) => ({ ...prev, season: event.target.value }))} fullWidth />
                  <Button variant="contained" onClick={addPlayer} disabled={!canManage}>Save player</Button>
                  {notice && <Alert severity="success">{notice}</Alert>}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </Layout>
  );
}

export default Players;
