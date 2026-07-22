import { Box, Typography, Grid, Card, CardContent, Stack, Chip, Table, TableBody, TableCell, TableHead, TableRow, Divider } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Layout from '../components/Layout';
import { getTeamData } from '../data/mockData';

export default function Dashboard({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const data = getTeamData(selectedTeam);

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card sx={{ p: 1 }}>
          <CardContent>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
              <Box>
                <Typography variant="h4" fontWeight={700}>Welcome back, {role || 'Rhys'}</Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>Current Team: {data.profile.name}</Typography>
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Chip label={`League: ${data.profile.league}`} color="primary" variant="outlined" />
                <Chip label={`Season: ${selectedSeason || data.profile.season}`} color="primary" variant="outlined" />
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Grid container spacing={3}>
          {data.stats.map((item) => (
            <Grid item xs={12} sm={6} md={3} key={item.title}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary">{item.title}</Typography>
                  <Typography variant="h3" fontWeight={700} sx={{ mt: 1 }}>{item.value}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{item.subtitle}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} lg={8}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>Performance trend</Typography>
                <Box sx={{ height: 300, mt: 2 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.performance}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                      <XAxis dataKey="name" stroke="currentColor" />
                      <YAxis stroke="currentColor" />
                      <Tooltip />
                      <Line type="monotone" dataKey="points" stroke="#ff7a1a" strokeWidth={3} />
                      <Line type="monotone" dataKey="efficiency" stroke="#38bdf8" strokeWidth={3} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>Upcoming Match</Typography>
                <Typography variant="h5" color="primary.main" sx={{ mt: 1, fontWeight: 700 }}>vs KU Pirates</Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>Friday • 7:30 PM • USIU Arena</Typography>
                <Divider sx={{ my: 2 }} />
                <Typography fontWeight={600}>Scouting note</Typography>
                <Typography color="text.secondary">Focus on transition defense and rim protection in the first half.</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>Recent Games</Typography>
                <Table size="small" sx={{ mt: 2 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Opponent</TableCell>
                      <TableCell align="right">Result</TableCell>
                      <TableCell align="right">Score</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.recentGames.map((game) => (
                      <TableRow key={game.date}>
                        <TableCell>{game.opponent}</TableCell>
                        <TableCell align="right">{game.result}</TableCell>
                        <TableCell align="right">{game.score}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>AI Insight</Typography>
                <Typography color="text.secondary" sx={{ mt: 2 }}>{data.aiAnalysis.matchSummary}</Typography>
                <Chip label={`MVP: ${data.aiAnalysis.mvp}`} color="primary" sx={{ mt: 2 }} />
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>Team Leaderboard</Typography>
                <Stack spacing={1.5} sx={{ mt: 2 }}>
                  {data.leaderboard.map((entry) => (
                    <Box key={entry.name} sx={{ p: 1.2, borderRadius: 2, bgcolor: 'action.hover' }}>
                      <Typography fontWeight={600}>{entry.name}</Typography>
                      <Typography color="text.secondary" variant="body2">{entry.value}</Typography>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </Layout>
  );
}