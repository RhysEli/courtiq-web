import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Grid, LinearProgress, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { useEffect, useState } from 'react';
import Layout from '../components/layout';
import { backendApi } from '../api/client';
import { reconcileBulkImportResults } from '../services/bulkImportBridge';
import { useAuth } from '../contexts/AuthContext';

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

// Same fix as the Reports page's double-submission bug: `running` and
// `currentFileName` were plain useState, which resets to nothing on a
// component remount. Navigating to another sidebar tab mid-upload made
// the page look idle again, even though the original upload was still
// genuinely running in the background on the old (now orphaned) component
// instance -- and worse, when that orphaned upload finished, its
// setOutcomes(...) call was a no-op (component unmounted), silently
// losing the result forever. The user's only option was to re-upload,
// risking a second concurrent request for the same file.
// Persisting a single "currently importing" marker (only one file is ever
// mid-upload at a time, since the queue runs sequentially) lets a
// freshly-mounted component correctly show "still importing X" instead of
// looking idle. A 10-minute staleness timeout covers a genuine page
// refresh, which kills the request outright with no code path left to
// ever clear this marker normally.
const IN_PROGRESS_KEY = 'courtiq-bulk-import-inprogress';
const STALE_AFTER_MS = 10 * 60 * 1000;

function loadInProgressMarker() {
  try {
    const raw = window.localStorage.getItem(IN_PROGRESS_KEY);
    if (!raw) return null;
    const marker = JSON.parse(raw);
    if (Date.now() - marker.startedAt > STALE_AFTER_MS) {
      window.localStorage.removeItem(IN_PROGRESS_KEY);
      return null;
    }
    return marker;
  } catch {
    return null;
  }
}

function setInProgressMarker(filename) {
  try {
    window.localStorage.setItem(IN_PROGRESS_KEY, JSON.stringify({ filename, startedAt: Date.now() }));
  } catch {
    /* non-fatal */
  }
}

function clearInProgressMarker() {
  try {
    window.localStorage.removeItem(IN_PROGRESS_KEY);
  } catch {
    /* non-fatal */
  }
}

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
  const { activeTeam } = useAuth();
  // Staged files not yet run: { key, file }. Kept separate from outcomes
  // (completed results) so the two lists can't get confused.
  const [staged, setStaged] = useState([]);
  const [running, setRunning] = useState(() => loadInProgressMarker() !== null);
  const [currentFileName, setCurrentFileName] = useState(() => loadInProgressMarker()?.filename ?? null);
  const [outcomes, setOutcomes] = useState(() => loadPersistedOutcomes());
  const [notice, setNotice] = useState(null);

  // Real season/competition tagging (games.season_id/competition_id) --
  // had a working backend since day one but no UI to actually populate
  // it. Applies to every file in this run, not per-file -- a batch is
  // normally one team's PDFs from around the same time. Both optional,
  // same as the backend fields themselves. Distinct from the
  // `selectedSeason` prop above, which is App.jsx's own cosmetic topbar-
  // display value, not a real season id.
  const [realSeasons, setRealSeasons] = useState([]);
  const [realCompetitions, setRealCompetitions] = useState([]);
  const [seasonId, setSeasonId] = useState('');
  const [competitionId, setCompetitionId] = useState('');

  // Step 12: stage tagging, same batch-level shape as season/competition
  // above. Unlike games.jsx (which has an explicit Home team field to
  // resolve "which of my teams is this for"), a batch has no such field --
  // each file's real home/away teams aren't known until the PDF is parsed
  // server-side. The best available answer before upload is the session's
  // active team (Step 9's multi-team switcher, useAuth().activeTeam) --
  // exactly the "which of my teams am I acting as right now" concept it
  // exists for. This is a best-effort offering, not a guarantee: if a
  // file's actual home/away doesn't include the active team, the backend's
  // own resolution (services/resolveGameStage.js) still rejects it with a
  // clear per-file error, same as any other stageId mismatch.
  const [realStages, setRealStages] = useState([]);
  const [membershipTcs, setMembershipTcs] = useState(null);
  const [stagesLoading, setStagesLoading] = useState(false);
  const [stageId, setStageId] = useState('');

  useEffect(() => {
    backendApi.getSeasons().then(setRealSeasons).catch(() => {});
    backendApi.getCompetitions().then(setRealCompetitions).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeTeam?.id || !seasonId || !competitionId) {
      setRealStages([]);
      setMembershipTcs(null);
      return;
    }
    let cancelled = false;
    setStagesLoading(true);
    backendApi.getTeamCompetitionSeasons(activeTeam.id)
      .then((rows) => {
        if (cancelled) return;
        const tcs = rows.find((r) => String(r.competition_id) === String(competitionId) && r.season_id === seasonId);
        setMembershipTcs(tcs || null);
        if (!tcs) { setRealStages([]); return undefined; }
        return backendApi.getStages(activeTeam.id, tcs.id).then((stages) => { if (!cancelled) setRealStages(stages); });
      })
      .catch(() => { if (!cancelled) { setRealStages([]); setMembershipTcs(null); } })
      .finally(() => { if (!cancelled) setStagesLoading(false); });
    return () => { cancelled = true; };
  }, [activeTeam, seasonId, competitionId]);

  useEffect(() => {
    if (stageId && !realStages.some((s) => String(s.id) === String(stageId))) {
      setStageId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realStages]);

  useEffect(() => {
    persistOutcomes(outcomes);
  }, [outcomes]);

  // Only relevant right after a remount that inherited an in-progress
  // marker from a possibly-orphaned upload in a previous component
  // instance (see IN_PROGRESS_KEY comment above) -- if THIS instance is
  // the one actually running handleImport, it manages running/
  // currentFileName directly and this poll is a harmless no-op alongside
  // it. Stops as soon as the marker is gone (upload finished elsewhere)
  // or this instance's own handleImport takes over.
  useEffect(() => {
    if (!running) return undefined;
    const interval = setInterval(() => {
      const marker = loadInProgressMarker();
      if (!marker) {
        setRunning(false);
        setCurrentFileName(null);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [running]);

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
      setInProgressMarker(item.file.name);
      try {
        const { summary: importSummary, results } = await backendApi.bulkImport([item.file], {
          seasonId: seasonId || undefined,
          competitionId: competitionId || undefined,
          stageId: stageId || undefined,
        });
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

    clearInProgressMarker();
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
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField select fullWidth label="Season (optional)" value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
                    <MenuItem value="">Untagged</MenuItem>
                    {realSeasons.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField select fullWidth label="Competition (optional)" value={competitionId} onChange={(e) => setCompetitionId(e.target.value)}>
                    <MenuItem value="">Untagged</MenuItem>
                    {realCompetitions.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    select fullWidth label="Stage (optional)" value={stageId} onChange={(e) => setStageId(e.target.value)}
                    disabled={stagesLoading || realStages.length === 0}
                    helperText={
                      stagesLoading ? 'Loading…'
                        : !seasonId || !competitionId ? 'Pick a season and competition first'
                          : !activeTeam ? 'No active team'
                            : !membershipTcs ? `No membership recorded for ${activeTeam.name} in this competition/season -- add one from Team Management`
                              : realStages.length === 0 ? 'No stages added yet -- add one from Team Management'
                                : ' '
                    }
                  >
                    {realStages.length > 0 && <MenuItem value="">Untagged</MenuItem>}
                    {realStages.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                  </TextField>
                </Grid>
              </Grid>
              <Typography variant="caption" color="text.secondary">
                Applies to every file in this batch. Stage is resolved against your active team ({activeTeam?.name || 'none set'}) --
                if a file's actual home/away team differs, the stage tag may not apply to it; you'll see a clear per-file error, not a silent mismatch.
              </Typography>
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
                                // EXTRACTION_NO_SECTIONS means the section genuinely
                                // isn't present in this PDF (not a real failure).
                                const notInThisFile = data.code === 'EXTRACTION_NO_SECTIONS';
                                return (
                                  <Chip
                                    key={key}
                                    size="small"
                                    variant="outlined"
                                    color={notInThisFile ? 'default' : 'error'}
                                    label={notInThisFile ? `${label} — not in this file` : `${label} — failed`}
                                  />
                                );
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