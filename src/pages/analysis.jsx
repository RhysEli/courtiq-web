import { Box, Grid, Card, CardContent, Typography, Chip, Stack, Divider, Alert } from '@mui/material';
import { useEffect, useState } from 'react';
import Layout from '../components/layout';
import { getAnalysisEntries } from '../services/analysisService';

function Analysis({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [analysisEntry, setAnalysisEntry] = useState(null);

  useEffect(() => {
    setAnalysisEntry(getAnalysisEntries().slice(-1)[0] || null);
  }, []);

  const summary = analysisEntry?.teamSummary || {};
  const players = analysisEntry?.playerAnalysis || [];

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      {!analysisEntry ? (
        <Alert severity="info">Upload a report and run analysis to populate this view.</Alert>
      ) : (
        <Grid container spacing={3}>
          {analysisEntry.isRealExtraction && (
            <Grid item xs={12}>
              <Chip label="Real extraction — computed from an uploaded FIBA Box Score PDF" color="success" />
            </Grid>
          )}
          {analysisEntry.narrative && (
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" fontWeight={700}>AI-generated narrative</Typography>
                  <Typography sx={{ mt: 2, whiteSpace: 'pre-line' }}>{analysisEntry.narrative}</Typography>
                </CardContent>
              </Card>
            </Grid>
          )}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>Match summary</Typography>
                <Typography color="text.secondary" sx={{ mt: 2 }}>Auto-generated from the latest imported report set for this match.</Typography>
                <Stack spacing={1.5} sx={{ mt: 3 }}>
                  <Typography><strong>Points:</strong> {summary.points}</Typography>
                  <Typography><strong>FG%:</strong> {summary.fgPct}</Typography>
                  <Typography><strong>3PT%:</strong> {summary.threePtPct}</Typography>
                  <Typography><strong>FT%:</strong> {summary.ftPct}</Typography>
                  <Typography><strong>Rebounds:</strong> {summary.rebounds}</Typography>
                  <Typography><strong>Assists:</strong> {summary.assists}</Typography>
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
                  {(analysisEntry.strengths || []).map((item) => <Chip key={item} label={item} color="primary" variant="outlined" />)}
                </Stack>
                <Typography fontWeight={600} sx={{ mt: 2 }}>Weaknesses</Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                  {(analysisEntry.weaknesses || []).map((item) => <Chip key={item} label={item} color="secondary" variant="outlined" />)}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>Recommendations</Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
                  {(analysisEntry.recommendations || []).map((item) => <Chip key={item} label={item} color="primary" />)}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>Player development</Typography>
                <Stack spacing={2} sx={{ mt: 2 }}>
                  {players.map((player) => (
                    <Box key={player.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
                      <Typography fontWeight={700}>{player.fullName}</Typography>
                      <Typography color="text.secondary">PPG {player.ppg} • RPG {player.rpg} • APG {player.apg}</Typography>
                      <Typography color="text.secondary">Trend: {player.trend} • Consistency: {player.consistencyRating}/100</Typography>
                      <Typography color="text.secondary">Strengths: {player.strengths.join(', ')}</Typography>
                      <Typography color="text.secondary">Areas to improve: {player.areasToImprove.join(', ')}</Typography>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Layout>
  );
}

export default Analysis;
