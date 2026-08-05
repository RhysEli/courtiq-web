import { Alert, Box, Button, Card, CardContent, Chip, LinearProgress, Stack, Typography } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useState } from 'react';
import Layout from '../components/layout';
import { backendApi } from '../api/client';
import { reconcileBulkImportResults } from '../services/bulkImportBridge';

// The backend attaches one entry per report type under
// entry.additionalReports[key], shaped either as
// { status: 'stored', rows: <number|{teamRows,playerRows}> } or
// { status: 'failed', error, code } -- NOT the raw extraction shape
// (previously this assumed {teams:[...]}/{events:[...]}, which crashed
// the render once bulkImport.js started returning storage-confirmation
// summaries instead of raw extracted data).
const ADDITIONAL_REPORT_TYPES = [
  { key: 'quarter', label: 'Quarter' },
  { key: 'plusMinus', label: 'Plus/Minus' },
  { key: 'lineupAnalysis', label: 'Lineup Analysis' },
  { key: 'rotationsSummary', label: 'Rotations Summary' },
  { key: 'playByPlay', label: 'Play-by-Play' },
  { key: 'scoreSheet', label: 'Score Sheet' },
];

function reportRowCount(data) {
  if (data.rows == null) return null;
  if (typeof data.rows === 'number') return data.rows;
  // Quarter's rows shape is { teamRows, playerRows } -- player count is
  // the more meaningful number to show at a glance.
  return data.rows.playerRows ?? data.rows.teamRows ?? null;
}

function BulkImport({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [outcomes, setOutcomes] = useState([]);
  const [notice, setNotice] = useState(null);

  const handleImport = async () => {
    if (files.length === 0) {
      setNotice({ severity: 'warning', text: 'Choose one or more FIBA Box Score PDFs first.' });
      return;
    }
    setLoading(true);
    setNotice(null);
    setSummary(null);
    setOutcomes([]);
    try {
      const { summary: importSummary, results } = await backendApi.bulkImport(files);
      setSummary(importSummary);
      const reconciled = await reconcileBulkImportResults(results);
      setOutcomes(reconciled);
      setNotice({
        severity: importSummary.failed > 0 ? 'warning' : 'success',
        text: `${importSummary.gamesCreated} game(s) created, ${importSummary.gamesMatched} matched to existing games, ${importSummary.failed} failed.`,
      });
    } catch (err) {
      setNotice({ severity: 'error', text: err.message || 'Bulk import failed.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Bulk import</Typography>
          <Typography color="text.secondary">
            Drop in a whole folder of FIBA Box Score PDFs at once — each file's own header (teams, score, date)
            is read to automatically create or match its game, so you don't need to set matches up by hand first.
          </Typography>
        </Box>

        {notice && <Alert severity={notice.severity}>{notice.text}</Alert>}

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
                {files.length > 0 ? `${files.length} file(s) selected` : 'Choose PDF files'}
                <input
                  type="file"
                  accept="application/pdf"
                  multiple
                  hidden
                  onChange={(e) => setFiles(Array.from(e.target.files))}
                />
              </Button>
              {files.length > 0 && (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {files.map((f) => <Chip key={f.name} label={f.name} size="small" />)}
                </Stack>
              )}
              {loading && <LinearProgress />}
              <Button variant="contained" onClick={handleImport} disabled={loading}>
                Import all
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {outcomes.length > 0 && (
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Results</Typography>
              <Stack spacing={2}>
                {outcomes.map((o, i) => (
                  <Box key={i} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography fontWeight={700}>{o.filename}</Typography>
                      <Chip
                        size="small"
                        label={o.status === 'failed' ? 'Failed' : o.status === 'game_created' ? 'Game created' : 'Game matched'}
                        color={o.status === 'failed' ? 'error' : 'success'}
                      />
                    </Stack>
                    {o.status !== 'failed' ? (
                      <>
                        <Typography color="text.secondary">
                          {o.homeTeam} {o.homeScore} – {o.awayScore} {o.awayTeam} • {o.matchDate}
                          {o.gameNumber ? ` • Game #${o.gameNumber}` : ''}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {o.playersExtracted} players extracted
                          {o.analyzed ? ' • analysis computed' : ' • analysis failed'}
                          {o.narrativeGenerated ? ' • AI narrative generated' : ''}
                        </Typography>
                        {o.additionalReports && (
                          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }} useFlexGap>
                            {ADDITIONAL_REPORT_TYPES.map(({ key, label }) => {
                              const data = o.additionalReports[key];
                              if (!data) return null;
                              if (data.status === 'failed') {
                                return <Chip key={key} size="small" variant="outlined" color="error" label={`${label} — failed`} />;
                              }
                              const n = reportRowCount(data);
                              return (
                                <Chip
                                  key={key}
                                  size="small"
                                  variant="outlined"
                                  label={n === null || n === undefined ? label : `${label} — ${n}`}
                                />
                              );
                            })}
                          </Stack>
                        )}
                      </>
                    ) : (
                      <Typography color="error">{o.error}</Typography>
                    )}
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        )}
      </Box>
    </Layout>
  );
}

export default BulkImport;