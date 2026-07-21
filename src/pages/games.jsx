import { Box, Grid, Card, CardContent, Typography, Button, Chip, Stack, Divider, List, ListItem, ListItemText } from '@mui/material';
import Layout from '../components/Layout';
import { getTeamData } from '../data/mockData';

function Games({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason }) {
  const data = getTeamData(selectedTeam);
  const canManage = role === 'Administrator' || role === 'Statistician' || role === 'Coach';

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <Button variant="contained" disabled={!canManage}>Create Game</Button>
        <Button variant="outlined" disabled={!canManage}>Upload Statistics</Button>
        <Button variant="outlined" disabled={!canManage}>Generate Analysis</Button>
      </Stack>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={700}>Upcoming games</Typography>
              <List>
                {data.games.filter((game) => game.type === 'Upcoming').map((game) => (
                  <Box key={game.title}>
                    <ListItem sx={{ px: 0 }}>
                      <ListItemText primary={game.title} secondary={game.venue} />
                      <Chip label={game.date} color="primary" variant="outlined" />
                    </ListItem>
                    <Divider />
                  </Box>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={700}>Completed games</Typography>
              <List>
                {data.games.filter((game) => game.type === 'Completed').map((game) => (
                  <Box key={game.title}>
                    <ListItem sx={{ px: 0 }}>
                      <ListItemText primary={game.title} secondary={game.venue} />
                      <Chip label={game.date} color="success" variant="outlined" />
                    </ListItem>
                    <Divider />
                  </Box>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Layout>
  );
}

export default Games;
