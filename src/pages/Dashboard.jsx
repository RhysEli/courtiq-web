import { Box, Typography, Grid, Card, CardContent, Stack, Chip, Table, TableBody, TableCell, TableHead, TableRow, Divider, Alert } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { getTeamData } from '../data/mockData';
import { getMatches } from '../services/matchService';
import { getAnalysisEntries, getImportedReports } from '../services/analysisService';

export default function Dashboard({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const data = getTeamData(selectedTeam);
  const [matches, setMatches] = useState([]);
  const [analysisEntries, setAnalysisEntries] = useState([]);
  const [reports, setReports] = useState([]);

  useEffect(() => {
    setMatches(getMatches());
    setAnalysisEntries(getAnalysisEntries());
    setReports(getImportedReports());
  }, []);

  const summary = useMemo(() => {
    const upcoming = matches.filter((match) => match.status === 'Scheduled' || match.status === 'Live').length;
    const live = matches.filter((match) => match.status === 'Live').length;
    const completed = matches.filter((match) => match.status === 'Completed').length;
    return { upcoming, live, completed, total: matches.length };
  }, [matches]);

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
          {[
            { title: 'Upcoming Matches', value: summary.upcoming, subtitle: 'Scheduled and live matches' },
            { title: 'Live Matches', value: summary.live, subtitle: 'Currently running' },
            { title: 'Completed Matches', value: summary.completed, subtitle: 'Finished games' },
            { title: 'Total Matches', value: summary.total, subtitle: 'All saved matches' },
          ].map((item) => (
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
                <Typography variant="h5" color="primary.main" sx={{ mt: 1, fontWeight: 700 }}>{matches.find((match) => match.status === 'Scheduled') ? `${matches.find((match) => match.status === 'Scheduled').homeTeam} vs ${matches.find((match) => match.status === 'Scheduled').awayTeam}` : 'No scheduled match'}</Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>{matches.find((match) => match.status === 'Scheduled') ? `${matches.find((match) => match.status === 'Scheduled').matchDate} • ${matches.find((match) => match.status === 'Scheduled').venue}` : 'Create a match to populate this section.'}</Typography>
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
                <Typography variant="h6" fontWeight={700}>Latest Reports</Typography>
                <Stack spacing={1.5} sx={{ mt: 2 }}>
                  {reports.slice(0, 3).map((report) => (
                    <Box key={report.id} sx={{ p: 1.2, borderRadius: 2, bgcolor: 'action.hover' }}>
                      <Typography fontWeight={600}>{report.name}</Typography>
                      <Typography color="text.secondary" variant="body2">{report.type}</Typography>
                    </Box>
                  ))}
                  {!reports.length && <Alert severity="info">No imported reports yet.</Alert>}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>Coach Recommendations</Typography>
                <Stack spacing={1.5} sx={{ mt: 2 }}>
                  {(analysisEntries[0]?.recommendations || []).map((item) => (
                    <Box key={item} sx={{ p: 1.2, borderRadius: 2, bgcolor: 'action.hover' }}>
                      <Typography fontWeight={600}>{item}</Typography>
                    </Box>
                  ))}
                  {!analysisEntries.length && <Alert severity="info">Run analysis to generate coaching guidance.</Alert>}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </Layout>
  );
}