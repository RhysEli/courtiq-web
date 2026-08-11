import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  LinearProgress, Stack, Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { useEffect, useState } from 'react';
import Layout from '../components/layout';
import { backendApi } from '../api/client';
import { reconcileBulkImportResults } from '../services/bulkImportBridge';

// The backend attaches one entry per report type under
// entry.additionalReports[key], shaped either as
// { status: 'stored', rows: <number|{teamRows,playerRows}> } or
// { status: 'failed', error, code }.
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

// Only the completed results are persisted -- a File object itself cannot
// survive JSON serialization or a browser tab discard, so there is no way
// to resume an in-flight upload after a full reload. What CAN survive is
// the record of what already finished, so a reload doesn't throw away
// real progress -- only files still queued or mid-upload need to be
// re-added, not the whole batch.
// Persisted to localStorage (not sessionStorage) so results are visible
// from any tab, not just the one that ran the import -- sessionStorage is
// isolated per tab, which was the actual cause of "my results disappeared"
// when a new file was added from a different tab than the one used before.
const PROGRESS_KEY = 'courtiq-bulk-import-progress';

function loadPersistedOutcomes() {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistOutcomes(outcomes) {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(outcomes));
  } catch {
    /* localStorage full or unavailable -- non-fatal, just won't persist */
  }
}

function fileKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function BulkImport({ selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  // Staged files not yet run: { key, file }. Kept separate from outcomes
  // (completed results) so the two lists can't get confused.
  const [staged, setStaged] = useState([]);
  const [running, setRunning] = useState(false);
  const [currentFileName, setCurrentFileName] = useState(null);
  const [outcomes, setOutcomes] = useState(() => loadPersistedOutcomes());
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    persistOutcomes(outcomes);
  }, [outcomes]);

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList);
    setStaged((prev) => {
      const existingKeys = new Set(prev.map((s) => s.key));
      // No longer filtered against `outcomes` -- a file that already has a
      // result showing can still be re-added and re-run (e.g. after a bug
      // fix, or to pick up new stats), without clearing Results first.
      const additions = incoming
        .map((file) => ({ key: fileKey(file), file }))
        .filter((s) => !existingKeys.has(s.key));
      return [...prev, ...additions];
    });
  };

  const removeStaged = (key) => {
    setStaged((prev) => prev.filter((s) => s.key !== key));
  };

  const clearCompleted = () => {
    setOutcomes([]);
    persistOutcomes([]);
  };

  const handleImport = async () => {
    if (staged.length === 0) {
      setNotice({ severity: 'warning', text: 'Add one or more FIBA Box Score PDFs first.' });
      return;
    }
    setRunning(true);
    setNotice(null);

    // Files are sent one at a time, not as one large multi-file request.
    // This means a completed file's result is saved and displayed
    // immediately -- if the tab is discarded partway through a large
    // batch, only the single file that was mid-upload is lost, not
    // everything already finished.
    const queue = [...staged];
    let created = 0;
    let matched = 0;
    let failed = 0;

    for (const item of queue) {
      setCurrentFileName(item.file.name);
      try {
        const { summary: importSummary, results } = await backendApi.bulkImport([item.file]);
        const reconciled = await reconcileBulkImportResults(results);
        const outcome = { ...reconciled[0], fileKey: item.key };
        setOutcomes((prev) => [outcome, ...prev.filter((o) => o.fileKey !== item.key)]);
        created += importSummary.gamesCreated;
        matched += importSummary.gamesMatched;
        failed += importSummary.failed;
      } catch (err) {
        setOutcomes((prev) => [
          { filename: item.file.name, fileKey: item.key, status: 'failed', error: err.message || 'Import failed.' },
          ...prev.filter((o) => o.fileKey !== item.key),
        ]);
        failed += 1;
      }
      // Remove from the staged list as soon as it's done, success or fail,
      // so a partially-run batch shows exactly what's left to do.
      setStaged((prev) => prev.filter((s) => s.key !== item.key));
    }

    setCurrentFileName(null);
    setRunning(false);
    setNotice({
      severity: failed > 0 ? 'warning' : 'success',
      text: `${created} game(s) created, ${matched} matched to existing games, ${failed} failed.`,
    });
  };

  return (
    <Layout selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Bulk import</Typography>
          <Typography color="text.secondary">
            Add FIBA Box Score PDFs as you go — each file's own header (teams, score, date) is read to
            automatically create or match its game. Files are processed one at a time, and finished results
            are kept even if you switch tabs or add more files mid-way.
          </Typography>
        </Box>

        {notice && <Alert severity={notice.severity}>{notice.text}</Alert>}

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
                Add PDF files
                <input
                  type="file"
                  accept="application/pdf"
                  multiple
                  hidden
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = ''; // allow re-adding the same filename later if removed
                  }}
                />
              </Button>

              {staged.length > 0 && (
                <Stack spacing={1}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Queued ({staged.length})
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {staged.map((s) => (
                      <Chip
                        key={s.key}
                        label={s.file.name}
                        size="small"
                        icon={running && currentFileName === s.file.name ? <CircularProgress size={14} /> : undefined}
                        onDelete={running ? undefined : () => removeStaged(s.key)}
                        deleteIcon={<CloseIcon />}
                        disabled={running && currentFileName !== s.file.name}
                      />
                    ))}
                  </Stack>
                </Stack>
              )}

              {running && (
                <Box>
                  <LinearProgress />
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    Importing {currentFileName}…
                  </Typography>
                </Box>
              )}

              <Button variant="contained" onClick={handleImport} disabled={running || staged.length === 0}>
                {running ? 'Importing…' : `Import ${staged.length > 0 ? staged.length : ''} file(s)`}
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {outcomes.length > 0 && (
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" fontWeight={700}>Results</Typography>
                <Button size="small" onClick={clearCompleted} disabled={running}>Clear</Button>
              </Stack>
              <Stack spacing={2}>
                {outcomes.map((o) => (
                  <Box key={o.fileKey || o.filename} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
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