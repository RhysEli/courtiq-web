import { Alert, Box, Button, Card, CardContent, Chip, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { createAnalysisForMatch, getImportedReports, saveImportedReport } from '../services/analysisService';
import { getMatches, updateMatch } from '../services/matchService';
import { getPlayers } from '../services/managementService';

const reportTypes = ['Scoresheet PDF', 'Play-by-Play PDF', 'Shot Chart PDF', 'Quarter Scoring PDF', 'Plus Minus PDF', 'Lineup Efficiency PDF', 'Team Comparison PDF'];

function AnalysisImport({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [matches, setMatches] = useState([]);
  const [players, setPlayers] = useState([]);
  const [reports, setReports] = useState([]);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [reportType, setReportType] = useState('Scoresheet PDF');
  const [reportName, setReportName] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setMatches(getMatches());
    setPlayers(getPlayers());
    setReports(getImportedReports());
  }, []);

  const selectedMatch = useMemo(() => matches.find((match) => match.id === selectedMatchId) || null, [matches, selectedMatchId]);

  const importReport = () => {
    if (!selectedMatchId) {
      setNotice('Select a match before importing a report.');
      return;
    }

    const parsedSummary = {
      points: 78 + reports.length,
      fgPct: 0.46 + reports.length * 0.002,
      threePtPct: 0.36 + reports.length * 0.003,
      ftPct: 0.74 + reports.length * 0.001,
      rebounds: 38 + reports.length,
      assists: 16 + reports.length,
      turnovers: 12 + reports.length,
      steals: 5 + reports.length * 0.2,
      blocks: 3 + reports.length * 0.1,
      benchPoints: 18 + reports.length,
      fastBreakPoints: 10 + reports.length * 0.3,
      paintPoints: 24 + reports.length,
      secondChancePoints: 7 + reports.length * 0.2,
      fouls: 14 + reports.length * 0.2,
    };

    const report = {
      id: `report-${Date.now()}`,
      name: reportName || `${reportType} ${reports.length + 1}`,
      type: reportType,
      uploadedAt: new Date().toLocaleString(),
      parsedSummary,
      matchId: selectedMatchId,
    };

    const savedReports = saveImportedReport(report);
    setReports(savedReports);
    const analysis = createAnalysisForMatch(selectedMatchId, [report], players);
    updateMatch(selectedMatchId, { importedReports: [...(selectedMatch?.importedReports || []), report.id], analysisIds: [...(selectedMatch?.analysisIds || []), analysis.id] });
    setMatches(getMatches());
    setNotice('Report imported, parsed, and attached to the selected match.');
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Analysis import</Typography>
          <Typography color="text.secondary">Import official FIBA reports, simulate parsing, and attach the resulting analysis to the selected match.</Typography>
        </Box>

        {notice && <Alert severity="success">{notice}</Alert>}

        <Grid container spacing={3}>
          <Grid item xs={12} md={5}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>Import report</Typography>
                <Stack spacing={2} sx={{ mt: 2 }}>
                  <TextField select label="Match" value={selectedMatchId} onChange={(event) => setSelectedMatchId(event.target.value)}>
                    {matches.map((match) => <MenuItem key={match.id} value={match.id}>{match.homeTeam} vs {match.awayTeam}</MenuItem>)}
                  </TextField>
                  <TextField select label="Report type" value={reportType} onChange={(event) => setReportType(event.target.value)}>
                    {reportTypes.map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                  </TextField>
                  <TextField label="Report name" value={reportName} onChange={(event) => setReportName(event.target.value)} />
                  <Button variant="contained" onClick={importReport}>Import and analyze</Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={7}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>Imported reports</Typography>
                <Stack spacing={2} sx={{ mt: 2 }}>
                  {reports.map((report) => (
                    <Box key={report.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
                      <Typography fontWeight={700}>{report.name}</Typography>
                      <Typography color="text.secondary">{report.type} • {report.uploadedAt}</Typography>
                      <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                        <Chip label={`Points ${report.parsedSummary?.points || 0}`} size="small" />
                        <Chip label={`FG% ${report.parsedSummary?.fgPct || 0}`} size="small" />
                        <Chip label={`Rebounds ${report.parsedSummary?.rebounds || 0}`} size="small" />
                      </Stack>
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

export default AnalysisImport;
