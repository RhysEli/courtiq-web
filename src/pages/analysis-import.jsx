import { Alert, Box, Button, Card, CardContent, Chip, Grid, LinearProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout';
import { createAnalysisForMatch, getImportedReports, saveImportedReport } from '../services/analysisService';
import { importRealBoxScore } from '../services/realAnalysisBridge';
import { getMatches, updateMatch } from '../services/matchService';
import { getPlayers } from '../services/managementService';

// Only Box Score has a real extraction pipeline right now (backend +
// calibrated FIBA parser). The rest still use the original simulated
// placeholder data until their extractors are built the same way.
const REAL_REPORT_TYPES = ['Box Score'];
const SIMULATED_REPORT_TYPES = ['Play-by-Play PDF', 'Shot Chart PDF', 'Quarter Scoring PDF', 'Plus Minus PDF', 'Lineup Efficiency PDF', 'Team Comparison PDF'];
const reportTypes = [...REAL_REPORT_TYPES, ...SIMULATED_REPORT_TYPES];

function AnalysisImport({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [matches, setMatches] = useState([]);
  const [players, setPlayers] = useState([]);
  const [reports, setReports] = useState([]);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [reportType, setReportType] = useState('Box Score');
  const [reportName, setReportName] = useState('');
  const [file, setFile] = useState(null);
  const [notice, setNotice] = useState(null); // { severity, text }
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMatches(getMatches());
    setPlayers(getPlayers());
    setReports(getImportedReports());
  }, []);

  const selectedMatch = useMemo(() => matches.find((match) => match.id === selectedMatchId) || null, [matches, selectedMatchId]);
  const isRealType = REAL_REPORT_TYPES.includes(reportType);

  const importReport = async () => {
    if (!selectedMatchId) {
      setNotice({ severity: 'warning', text: 'Select a match before importing a report.' });
      return;
    }

    if (isRealType) {
      if (!file) {
        setNotice({ severity: 'warning', text: 'Choose a PDF file to upload for Box Score.' });
        return;
      }
      setLoading(true);
      setNotice(null);
      try {
        const { analysis, reportRecord } = await importRealBoxScore({ match: selectedMatch, file, players });
        setReports([...getImportedReports()]);
        updateMatch(selectedMatchId, {
          importedReports: [...(selectedMatch?.importedReports || []), reportRecord.id],
          analysisIds: [...(selectedMatch?.analysisIds || []), analysis.id],
        });
        setMatches(getMatches());
        setNotice({
          severity: 'success',
          text: `Real extraction complete: ${reportRecord.playersExtracted ?? 'several'} players parsed from the PDF and analyzed${analysis.narrative ? ' with an AI narrative' : ''}.`,
        });
        setFile(null);
      } catch (err) {
        setNotice({ severity: 'error', text: err.message || 'Real extraction failed.' });
      } finally {
        setLoading(false);
      }
      return;
    }

    // Simulated path for report types without a real extractor yet.
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
      isRealExtraction: false,
    };

    const savedReports = saveImportedReport(report);
    setReports(savedReports);
    const analysis = createAnalysisForMatch(selectedMatchId, [report], players);
    updateMatch(selectedMatchId, { importedReports: [...(selectedMatch?.importedReports || []), report.id], analysisIds: [...(selectedMatch?.analysisIds || []), analysis.id] });
    setMatches(getMatches());
    setNotice({ severity: 'info', text: `${reportType} imported using simulated placeholder data (no real extractor built for this report type yet).` });
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Analysis import</Typography>
          <Typography color="text.secondary">Import official FIBA reports and generate analysis. Box Score uses real PDF extraction against the CourtIQ backend; other report types are still simulated.</Typography>
        </Box>

        {notice && <Alert severity={notice.severity}>{notice.text}</Alert>}

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
                    {reportTypes.map((type) => (
                      <MenuItem key={type} value={type}>
                        {type} {REAL_REPORT_TYPES.includes(type) ? '— real extraction' : '— simulated'}
                      </MenuItem>
                    ))}
                  </TextField>

                  {isRealType ? (
                    <Button component="label" variant="outlined">
                      {file ? file.name : 'Choose Box Score PDF'}
                      <input type="file" accept="application/pdf" hidden onChange={(e) => setFile(e.target.files[0])} />
                    </Button>
                  ) : (
                    <TextField label="Report name" value={reportName} onChange={(event) => setReportName(event.target.value)} />
                  )}

                  {loading && <LinearProgress />}
                  <Button variant="contained" onClick={importReport} disabled={loading}>
                    {isRealType ? 'Upload, extract & analyze' : 'Import and analyze (simulated)'}
                  </Button>
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
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography fontWeight={700}>{report.name}</Typography>
                        <Chip
                          size="small"
                          label={report.isRealExtraction ? 'Real' : 'Simulated'}
                          color={report.isRealExtraction ? 'success' : 'default'}
                        />
                      </Stack>
                      <Typography color="text.secondary">{report.type} • {report.uploadedAt}</Typography>
                      {report.parsedSummary && (
                        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                          <Chip label={`Points ${report.parsedSummary?.points || 0}`} size="small" />
                          <Chip label={`FG% ${report.parsedSummary?.fgPct || 0}`} size="small" />
                          <Chip label={`Rebounds ${report.parsedSummary?.rebounds || 0}`} size="small" />
                        </Stack>
                      )}
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
