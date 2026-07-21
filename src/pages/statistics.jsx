import { Box, Grid, Card, CardContent, Typography, TextField, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, Stack } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import Layout from '../components/Layout';
import { getTeamData } from '../data/mockData';

const pieData = [
  { name: 'Offense', value: 58 },
  { name: 'Defense', value: 42 },
];

const colors = ['#ff7a1a', '#38bdf8'];

function Statistics({ mode, toggleTheme, selectedTeam, onTeamChange }) {
  const data = getTeamData(selectedTeam);

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Filters</Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={4}><TextField fullWidth select label="League" defaultValue={data.profile.league}><MenuItem value={data.profile.league}>{data.profile.league}</MenuItem></TextField></Grid>
              <Grid item xs={12} sm={4}><TextField fullWidth select label="Season" defaultValue={data.profile.season}><MenuItem value={data.profile.season}>{data.profile.season}</MenuItem></TextField></Grid>
              <Grid item xs={12} sm={4}><TextField fullWidth select label="Opponent" defaultValue="All"><MenuItem value="All">All</MenuItem></TextField></Grid>
            </Grid>
          </CardContent>
        </Card>

        <Grid container spacing={3}>
          <Grid item xs={12} lg={7}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>Team statistics</Typography>
                <Box sx={{ height: 300, mt: 2 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.teamStats}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                      <XAxis dataKey="category" stroke="currentColor" />
                      <YAxis stroke="currentColor" />
                      <Tooltip />
                      <Bar dataKey="value" fill="#ff7a1a" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} lg={5}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>Shooting efficiency</Typography>
                <Box sx={{ height: 300, mt: 2 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={90} fill="#8884d8">
                        {pieData.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Player statistics</Typography>
            <Table sx={{ mt: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Player</TableCell>
                  <TableCell>PPG</TableCell>
                  <TableCell>RPG</TableCell>
                  <TableCell>APG</TableCell>
                  <TableCell>FG%</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.playerStats.map((player) => (
                  <TableRow key={player.name}>
                    <TableCell>{player.name}</TableCell>
                    <TableCell>{player.ppg}</TableCell>
                    <TableCell>{player.rpg}</TableCell>
                    <TableCell>{player.apg}</TableCell>
                    <TableCell>{player.fg}</TableCell>
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

export default Statistics;
