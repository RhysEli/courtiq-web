import { Box, Grid, Card, CardContent, Typography, TextField, Button, Chip, Stack, Avatar, Divider, Alert } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { createTeam, getTeams, updateTeam } from '../services/managementService';

function Teams({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState({ name: '', institution: '', category: 'Men', gender: 'Men', primaryColour: '#ff7a1a', secondaryColour: '#38bdf8', league: '', season: selectedSeason || '', coach: '', teamManager: '', statistician: '', roster: '' });
  const [notice, setNotice] = useState('');

  const canManage = role === 'Statistician' || role === 'Team Manager';
  const activeTeam = useMemo(() => teams.find((team) => team.id === selectedTeam) || teams[0], [teams, selectedTeam]);

  useEffect(() => {
    const storedTeams = getTeams();
    setTeams(storedTeams);
  }, []);

  const saveTeam = () => {
    if (!form.name.trim()) return;
    const team = createTeam({ ...form, roster: form.roster.split(',').map((entry) => entry.trim()).filter(Boolean) });
    setTeams((prev) => [...prev, team]);
    onTeamChange?.(team.id);
    setForm({ ...form, name: '', institution: '', category: 'Men', gender: 'Men', primaryColour: '#ff7a1a', secondaryColour: '#38bdf8', league: '', season: selectedSeason || '', coach: '', teamManager: '', statistician: '', roster: '' });
    setNotice(`Saved ${team.name}`);
  };

  const updateSelectedTeam = () => {
    if (!activeTeam) return;
    const updatedTeams = updateTeam(activeTeam.id, { institution: form.institution || activeTeam.institution, league: form.league || activeTeam.league, season: form.season || activeTeam.season, coach: form.coach || activeTeam.coach, teamManager: form.teamManager || activeTeam.teamManager, statistician: form.statistician || activeTeam.statistician });
    setTeams(updatedTeams);
    setNotice(`Updated ${activeTeam.name}`);
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h5" fontWeight={700}>{activeTeam?.name || 'No team selected'}</Typography>
                  <Typography color="text.secondary">{activeTeam?.institution || 'Create a team to start managing roster operations.'}</Typography>
                </Box>
                <Avatar sx={{ width: 72, height: 72, bgcolor: 'primary.main', fontSize: 24 }}>{activeTeam?.name?.slice(0, 2).toUpperCase() || 'TM'}</Avatar>
              </Stack>
              <Divider sx={{ my: 3 }} />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Team name" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Institution" value={form.institution} onChange={(event) => setForm((prev) => ({ ...prev, institution: event.target.value }))} /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Category" value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))} /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Gender" value={form.gender} onChange={(event) => setForm((prev) => ({ ...prev, gender: event.target.value }))} /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Primary colour" value={form.primaryColour} onChange={(event) => setForm((prev) => ({ ...prev, primaryColour: event.target.value }))} /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Secondary colour" value={form.secondaryColour} onChange={(event) => setForm((prev) => ({ ...prev, secondaryColour: event.target.value }))} /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth label="League" value={form.league} onChange={(event) => setForm((prev) => ({ ...prev, league: event.target.value }))} /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Season" value={form.season} onChange={(event) => setForm((prev) => ({ ...prev, season: event.target.value }))} /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Coach" value={form.coach} onChange={(event) => setForm((prev) => ({ ...prev, coach: event.target.value }))} /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Team manager" value={form.teamManager} onChange={(event) => setForm((prev) => ({ ...prev, teamManager: event.target.value }))} /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Statistician" value={form.statistician} onChange={(event) => setForm((prev) => ({ ...prev, statistician: event.target.value }))} /></Grid>
                <Grid item xs={12}><TextField fullWidth label="Roster (comma separated)" value={form.roster} onChange={(event) => setForm((prev) => ({ ...prev, roster: event.target.value }))} /></Grid>
                <Grid item xs={12}><Button variant="contained" sx={{ mt: 1 }} onClick={saveTeam} disabled={!canManage}>Save Team</Button></Grid>
                {activeTeam && <Grid item xs={12}><Button variant="outlined" onClick={updateSelectedTeam} disabled={!canManage}>Update Selected Team</Button></Grid>}
                {notice && <Grid item xs={12}><Alert severity="success">{notice}</Alert></Grid>}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={700}>Team Overview</Typography>
              <Stack spacing={1.5} sx={{ mt: 2 }}>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                  <Typography color="text.secondary">League</Typography>
                  <Typography fontWeight={600}>{activeTeam?.league || '—'}</Typography>
                </Box>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                  <Typography color="text.secondary">Season</Typography>
                  <Typography fontWeight={600}>{activeTeam?.season || '—'}</Typography>
                </Box>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                  <Typography color="text.secondary">Roster count</Typography>
                  <Typography fontWeight={600}>{activeTeam?.roster?.length || 0} players</Typography>
                </Box>
              </Stack>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" fontWeight={700}>Team Contacts</Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {activeTeam && [
                  { name: activeTeam.coach, role: 'Coach', access: 'Read' },
                  { name: activeTeam.teamManager, role: 'Team Manager', access: 'Manage' },
                  { name: activeTeam.statistician, role: 'Statistician', access: 'Technical' },
                ].filter((member) => member.name).map((member) => (
                  <Box key={member.name} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography fontWeight={600}>{member.name}</Typography>
                      <Typography color="text.secondary" variant="body2">{member.role}</Typography>
                    </Box>
                    <Chip label={member.access} color="primary" variant="outlined" />
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Layout>
  );
}

export default Teams;
