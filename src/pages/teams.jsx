import { Box, Grid, Card, CardContent, Typography, TextField, Button, Chip, Stack, Avatar, Divider } from '@mui/material';
import Layout from '../components/Layout';
import { getTeamData } from '../data/mockData';

function Teams({ mode, toggleTheme, selectedTeam, onTeamChange }) {
  const data = getTeamData(selectedTeam);

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h5" fontWeight={700}>{data.profile.name}</Typography>
                  <Typography color="text.secondary">{data.profile.institution}</Typography>
                </Box>
                <Avatar sx={{ width: 72, height: 72, bgcolor: 'primary.main', fontSize: 24 }}>UT</Avatar>
              </Stack>
              <Divider sx={{ my: 3 }} />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Institution" defaultValue={data.profile.institution} /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth label="League" defaultValue={data.profile.league} /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Season" defaultValue={data.profile.season} /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Team colours" defaultValue={data.profile.colours.join(', ')} /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Team manager" defaultValue={data.profile.manager} /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Statistician" defaultValue={data.profile.statistician} /></Grid>
                <Grid item xs={12}><Button variant="contained" sx={{ mt: 1 }}>Save Team</Button></Grid>
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
                  <Typography fontWeight={600}>{data.profile.league}</Typography>
                </Box>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                  <Typography color="text.secondary">Season</Typography>
                  <Typography fontWeight={600}>{data.profile.season}</Typography>
                </Box>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                  <Typography color="text.secondary">Roster count</Typography>
                  <Typography fontWeight={600}>{data.profile.roster} players</Typography>
                </Box>
              </Stack>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" fontWeight={700}>Team Contacts</Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {data.members.map((member) => (
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
