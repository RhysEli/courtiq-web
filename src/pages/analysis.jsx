import { Box, Grid, Card, CardContent, Typography, Chip, Stack, Divider } from '@mui/material';
import Layout from '../components/Layout';
import { getTeamData } from '../data/mockData';

function Analysis({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const data = getTeamData(selectedTeam);

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={700}>Match summary</Typography>
              <Typography color="text.secondary" sx={{ mt: 2 }}>{data.aiAnalysis.matchSummary}</Typography>
              <Stack spacing={1.5} sx={{ mt: 3 }}>
                <Typography><strong>MVP:</strong> {data.aiAnalysis.mvp}</Typography>
                <Typography><strong>Offensive rating:</strong> {data.aiAnalysis.offensiveRating}</Typography>
                <Typography><strong>Defensive rating:</strong> {data.aiAnalysis.defensiveRating}</Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={700}>Strengths & Weaknesses</Typography>
              <Divider sx={{ my: 2 }} />
              <Typography fontWeight={600}>Strengths</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                {data.aiAnalysis.strengths.map((item) => <Chip key={item} label={item} color="primary" variant="outlined" />)}
              </Stack>
              <Typography fontWeight={600} sx={{ mt: 2 }}>Weaknesses</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                {data.aiAnalysis.weaknesses.map((item) => <Chip key={item} label={item} color="secondary" variant="outlined" />)}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={700}>Recommendations</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
                {data.aiAnalysis.recommendations.map((item) => <Chip key={item} label={item} color="primary" />)}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Layout>
  );
}

export default Analysis;
