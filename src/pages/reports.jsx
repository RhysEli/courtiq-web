import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, Stack, Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { useState } from 'react';
import Layout from '../components/layout';
import { backendApi } from '../api/client';
import { reconcileBulkImportResults } from '../services/bulkImportBridge';

// Only Box Score is actually parsed on the backend today -- every other
// FIBA export type is stored but extraction isn't implemented for it yet
// (see backend/src/routes/reports.js's own comment on this). Previously
// this page had five buttons that "downloaded" fabricated placeholder
// text pretending to be these reports; that's worse than admitting the
// real state, so it's removed rather than faked.
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
  return data.rows.playerRows ?? data.rows.teamRows ?? null;
}

function Reports({ selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const canManage = role === 'Administrator' || role === 'Statistician' || role === 'Team Manager';
  const [uploading, setUploading] = useState(false);
  const [recent, setRecent] = useState([]);
  const [notice, setNotice] = useState(null);

  const handleFileChosen = async (file) => {
    if (!canManage || !file) return;
    setUploading(true);
    setNotice(null);
    try {
      const { summary, results } = await backendApi.bulkImport([file]);
      const [reconciled] = await reconcileBulkImportResults(results);
      setRecent((prev) => [reconciled, ...prev]);
      if (summary.failed > 0) {
        setNotice({ severity: 'error', text: 'Could not read this report -- see details below.' });
      }
    } catch (err) {
      setRecent((prev) => [{ filename: file.name, status: 'failed', error: err.message || 'Upload failed.' }, ...prev]);
      setNotice({ severity: 'error', text: err.message || 'Upload failed.' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Layout selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>FIBA reports</Typography>
        <Typography color="text.secondary">
          Upload a single FIBA report PDF — its own header (teams, score, date) is read to automatically
          create or match its game, same as Bulk Import, just one file at a time.
        </Typography>
      </Box>

      {notice && <Alert severity={notice.severity} sx={{ mb: 3 }}>{notice.text}</Alert>}

      <Grid container spacing={3}>
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Upload report</Typography>
              <Box sx={{ border: '2px dashed', borderColor: 'primary.main', borderRadius: 3, p: 4, textAlign: 'center' }}>
                <UploadFileIcon sx={{ fontSize: 44, color: 'primary.main' }} />
                <Typography mt={2}>Select a PDF FIBA report export</Typography>
                <Button
                  component="label"
                  variant="contained"
                  color="primary"
                  sx={{ mt: 2 }}
                  disabled={!canManage || uploading}
                  startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : undefined}
                >
                  {uploading ? 'Uploading…' : 'Choose file'}
                  <input
                    type="file"
                    accept="application/pdf"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      handleFileChosen(file);
                      e.target.value = '';
                    }}
                  />
                </Button>
                {!canManage && (
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                    Your role doesn't have permission to upload reports.
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Recent uploads</Typography>
              {recent.length === 0 ? (
                <Typography color="text.secondary">Nothing uploaded yet this session.</Typography>
              ) : (
                <Stack spacing={2}>
                  {recent.map((o, i) => (
                    <Box key={i} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography fontWeight={700}>{o.filename}</Typography>
                        <Chip
                          size="small"
                          icon={o.status === 'failed' ? <ErrorIcon /> : <CheckCircleIcon />}
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
                                  <Chip key={key} size="small" variant="outlined" label={n == null ? label : `${label} — ${n}`} />
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
              )}

              <Alert severity="info" sx={{ mt: 3 }}>
                Box Score and the six additional FIBA report types (Quarter, Plus/Minus, Lineup Analysis,
                Rotations Summary, Play-by-Play, Score Sheet) are fully parsed on upload. Coach Report, Match
                Analysis Report, Opponent Scouting Report, Player Development Report, and Season Summary
                Report are stored but not yet extracted — in-app preview and download for those will be added
                once real sample PDFs are available to build parsers against.
              </Alert>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Layout>
  );
}

export default Reports;