import {
  Box, Grid, Card, CardContent, Typography, Chip, Stack, Divider, Alert,
  TextField, MenuItem, Button, CircularProgress,
} from '@mui/material';
import { useEffect, useState } from 'react';
import Layout from '../components/layout';
import { getAnalysisEntries } from '../services/analysisService';
import { backendApi } from '../api/client';

function Analysis({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [analysisEntry, setAnalysisEntry] = useState(null);

  useEffect(() => {
    setAnalysisEntry(getAnalysisEntries().slice(-1)[0] || null);
  }, []);

  // FR-09: real Coach annotations on a real game record, independent of
  // the mock analysisEntry data above -- uses the actual backend `games`
  // and `annotations` tables.
  const [games, setGames] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [gamesError, setGamesError] = useState('');
  const [selectedGameId, setSelectedGameId] = useState('');
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [noteError, setNoteError] = useState('');

  useEffect(() => {
    let cancelled = false;
    backendApi.getGames()
      .then((data) => {
        if (cancelled) return;
        setGames(data);
        setSelectedGameId(data[0]?.id || '');
      })
      .catch((err) => { if (!cancelled) setGamesError(err.message || 'Could not load games.'); })
      .finally(() => { if (!cancelled) setGamesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const loadNotes = (gameId) => {
    if (!gameId) return;
    setNotesLoading(true);
    backendApi.getAnnotations(gameId)
      .then(setNotes)
      .catch((err) => setNoteError(err.message || 'Could not load notes.'))
      .finally(() => setNotesLoading(false));
  };

  useEffect(() => {
    if (selectedGameId) loadNotes(selectedGameId);
  }, [selectedGameId]);

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setSubmittingNote(true);
    setNoteError('');
    try {
      await backendApi.addAnnotation(selectedGameId, noteText.trim());
      setNoteText('');
      loadNotes(selectedGameId);
    } catch (err) {
      setNoteError(err.message || 'Could not add note.');
    } finally {
      setSubmittingNote(false);
    }
  };

  const summary = analysisEntry?.teamSummary || {};
  const players = analysisEntry?.playerAnalysis || [];

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={700}>Coach notes</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Free-text notes on a real game record, visible to the team and added by Coaches.
          </Typography>

          {gamesError && <Alert severity="error" sx={{ mb: 2 }}>{gamesError}</Alert>}

          <TextField
            select fullWidth label="Game" value={selectedGameId}
            onChange={(e) => setSelectedGameId(e.target.value)}
            disabled={gamesLoading || games.length === 0}
            sx={{ mb: 2, maxWidth: 420 }}
          >
            {games.map((g) => (
              <MenuItem key={g.id} value={g.id}>
                Game #{g.id} — {g.game_date || 'no date'}
              </MenuItem>
            ))}
          </TextField>

          {games.length === 0 && !gamesLoading && (
            <Alert severity="info" sx={{ mb: 2 }}>No games recorded yet.</Alert>
          )}

          {notesLoading ? (
            <CircularProgress size={24} />
          ) : (
            <Stack spacing={1.5} sx={{ mb: 2 }}>
              {notes.length === 0 && <Typography color="text.secondary">No notes on this game yet.</Typography>}
              {notes.map((note) => (
                <Box key={note.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                  <Typography>{note.body}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {note.author_name || 'Coach'} • {new Date(note.created_at).toLocaleString()}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}

          {role === 'Coach' && selectedGameId && (
            <Stack spacing={1}>
              <TextField
                multiline minRows={2} fullWidth label="Add a note"
                value={noteText} onChange={(e) => setNoteText(e.target.value)}
              />
              {noteError && <Alert severity="error">{noteError}</Alert>}
              <Button variant="contained" onClick={handleAddNote} disabled={submittingNote || !noteText.trim()} sx={{ alignSelf: 'flex-start' }}>
                {submittingNote ? 'Adding…' : 'Add note'}
              </Button>
            </Stack>
          )}
        </CardContent>
      </Card>

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
          {analysisEntry.additionalReports?.quarter && analysisEntry.additionalReports.quarter.status !== 'failed' && (
            <Grid item xs={12}>
              <Alert severity="info">
                Quarter-by-quarter data was extracted and stored for this game
                ({analysisEntry.additionalReports.quarter.rows?.playerRows ?? '—'} player rows).
                A detailed breakdown view isn't wired up on this page yet -- the
                real data lives in the database and can be pulled via the
                game's report-data endpoint.
              </Alert>
            </Grid>
          )}
          {(analysisEntry.additionalReports?.plusMinus || analysisEntry.additionalReports?.lineupAnalysis || analysisEntry.additionalReports?.rotationsSummary) && (
            <Grid item xs={12}>
              <Alert severity="info">
                Additional real data extracted from this upload:
                <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }} useFlexGap>
                  {analysisEntry.additionalReports?.plusMinus?.status !== 'failed' && analysisEntry.additionalReports?.plusMinus?.rows != null && (
                    <Chip size="small" label={`Plus/Minus — ${analysisEntry.additionalReports.plusMinus.rows} players`} />
                  )}
                  {analysisEntry.additionalReports?.lineupAnalysis?.status !== 'failed' && analysisEntry.additionalReports?.lineupAnalysis?.rows != null && (
                    <Chip size="small" label={`Lineup Analysis — ${analysisEntry.additionalReports.lineupAnalysis.rows} lineups`} />
                  )}
                  {analysisEntry.additionalReports?.rotationsSummary?.status !== 'failed' && analysisEntry.additionalReports?.rotationsSummary?.rows != null && (
                    <Chip size="small" label={`Rotations Summary — ${analysisEntry.additionalReports.rotationsSummary.rows} stints`} />
                  )}
                </Stack>
                {' '}Dedicated views for these are coming — the raw data is already stored with this analysis.
              </Alert>
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