import {
  Box, Grid, Card, CardContent, Typography, Stack, Alert,
  TextField, MenuItem, Button, CircularProgress, Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import Layout from '../components/layout';
import { backendApi } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

function Analysis({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const { activeTeam } = useAuth();

  // FR-09: real Coach annotations on a real game record -- uses the actual
  // backend `games` and `annotations` tables.
  const [games, setGames] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [gamesError, setGamesError] = useState('');
  const [selectedGameId, setSelectedGameId] = useState('');

  // Step 48: real team names, so the game picker can show "vs Coastal
  // Kings" instead of a raw internal game id -- same real data
  // (GET /teams) statistics.jsx's own Win/Loss Progression list already
  // resolves opponent names from.
  const [teams, setTeams] = useState([]);
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [noteError, setNoteError] = useState('');

  // FR-13: real, selectedGameId-scoped match stats + AI narrative
  // (game_metrics/game_narratives via GET /analysis/games/:gameId). Built
  // specifically so the PDF export (and the cards it mirrors) reflect
  // real numbers for the actual selected game.
  const [realAnalysis, setRealAnalysis] = useState(null);
  const [realAnalysisLoading, setRealAnalysisLoading] = useState(false);
  const [realAnalysisError, setRealAnalysisError] = useState('');

  // Step 45 Phase 3: real "shot selection zones" (paint/mid_range/three)
  // for the selected game -- built from game_play_by_play's shot_zone/
  // player_id (Phase 1 backfill + Phase 2 ingestion-time population).
  // A coarse stat breakdown, NOT a shot chart -- no court diagram, no x/y.
  const [shotZones, setShotZones] = useState(null);
  const [shotZonesLoading, setShotZonesLoading] = useState(false);
  const [shotZonesError, setShotZonesError] = useState('');

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

  useEffect(() => {
    backendApi.getTeams().then(setTeams).catch(() => {});
  }, []);

  // Step 48: same real "vs {opponent} — {date} — W/L {scoreA}-{scoreB}"
  // shape as statistics.jsx's Win/Loss Progression list -- deliberately
  // not inventing a new format. opponentId only resolves correctly once
  // activeTeam has loaded; before that (or if a user has no active team)
  // this falls back to the game's real id/date rather than guessing which
  // side is "ours" and risking a wrong label that looks plausible.
  function gameLabel(g) {
    if (!activeTeam) return `Game #${g.id} — ${g.game_date || 'no date'}`;
    const opponentId = g.home_team_id === activeTeam.id ? g.opponent_team_id : g.home_team_id;
    const opponentName = teams.find((t) => t.id === opponentId)?.name || opponentId;
    let resultLabel = 'Outcome pending';
    if (g.outcome) {
      if (g.outcome.winningTeamId === activeTeam.id) resultLabel = `W ${g.outcome.scoreA}-${g.outcome.scoreB}`;
      else if (g.outcome.winningTeamId) resultLabel = `L ${g.outcome.scoreA}-${g.outcome.scoreB}`;
      else resultLabel = 'Outcome unclear';
    }
    return `vs ${opponentName} — ${g.game_date || 'no date'} — ${resultLabel}`;
  }

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

  useEffect(() => {
    if (!selectedGameId) { setRealAnalysis(null); return undefined; }
    let cancelled = false;
    setRealAnalysisLoading(true);
    setRealAnalysisError('');
    backendApi.getGameAnalysis(selectedGameId)
      .then((data) => { if (!cancelled) setRealAnalysis(data); })
      .catch((err) => { if (!cancelled) setRealAnalysisError(err.message || 'Could not load match analysis.'); })
      .finally(() => { if (!cancelled) setRealAnalysisLoading(false); });
    return () => { cancelled = true; };
  }, [selectedGameId]);

  useEffect(() => {
    if (!selectedGameId) { setShotZones(null); return undefined; }
    let cancelled = false;
    setShotZonesLoading(true);
    setShotZonesError('');
    backendApi.getGameShotZones(selectedGameId)
      .then((data) => { if (!cancelled) setShotZones(data); })
      .catch((err) => { if (!cancelled) setShotZonesError(err.message || 'Could not load shot selection zones.'); })
      .finally(() => { if (!cancelled) setShotZonesLoading(false); });
    return () => { cancelled = true; };
  }, [selectedGameId]);

  // Plain made/attempted percentages (the same shape every other page in
  // this app already shows -- FG%/3PT%/FT%), derived from the home side's
  // raw box-score totals game_metrics stores, not the advanced metrics
  // (effectiveFgPct etc) computeTeamMetrics also returns -- those are a
  // different, unrelated stat, not what "Match summary" has ever labeled
  // here. null (not zeroes) until metrics actually exist for this game --
  // compute hasn't necessarily run yet.
  const pct = (made, att) => (att > 0 ? Number(((made / att) * 100).toFixed(1)) : 0);
  const homeRaw = realAnalysis?.metrics?.home?.raw;
  const matchSummary = homeRaw ? {
    points: homeRaw.points,
    fgPct: pct(homeRaw.fgm, homeRaw.fga),
    threePtPct: pct(homeRaw.three_pm, homeRaw.three_pa),
    ftPct: pct(homeRaw.ftm, homeRaw.fta),
    rebounds: homeRaw.reb,
    assists: homeRaw.assists,
  } : null;
  const realNarrative = realAnalysis?.narrative || null;

  const selectedGame = games.find((g) => g.id === selectedGameId);

  // FR-13: export the currently-selected real game's summary as a PDF --
  // match stats, AI narrative, and Coach notes, exactly what's rendered
  // on screen for this game and nothing else. Each section honestly
  // labels its own absence (metrics not computed yet / narrative not
  // generated yet / no notes yet) rather than showing blank or fabricated
  // content -- narrative especially is a real best-effort step elsewhere
  // in this system (routes/analysis.js's narrative route can fail or
  // simply never have been run), not something guaranteed to exist.
  const exportGamePdf = () => {
    const doc = new jsPDF();
    let y = 18;

    doc.setFontSize(16);
    doc.text(`CourtIQ Game Summary — Game #${selectedGameId}`, 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.text(`Generated ${new Date().toLocaleString()} • ${selectedGame?.game_date || 'no date recorded'}`, 14, y);
    y += 10;

    doc.setFontSize(12);
    doc.text('Match summary', 14, y);
    y += 8;
    doc.setFontSize(10);
    if (matchSummary) {
      [
        ['Points', matchSummary.points], ['FG%', `${matchSummary.fgPct}%`],
        ['3PT%', `${matchSummary.threePtPct}%`], ['FT%', `${matchSummary.ftPct}%`],
        ['Rebounds', matchSummary.rebounds], ['Assists', matchSummary.assists],
      ].forEach(([label, value]) => {
        doc.text(`${label}: ${value}`, 14, y);
        y += 6;
      });
    } else {
      doc.text('Metrics have not been computed for this game yet.', 14, y);
      y += 6;
    }

    y += 4;
    doc.setFontSize(12);
    doc.text('AI-generated narrative', 14, y);
    y += 8;
    doc.setFontSize(10);
    if (realNarrative) {
      const lines = doc.splitTextToSize(realNarrative, 180);
      lines.forEach((line) => {
        if (y > 280) { doc.addPage(); y = 18; }
        doc.text(line, 14, y);
        y += 6;
      });
    } else {
      doc.text('No AI narrative has been generated for this game yet.', 14, y);
      y += 6;
    }

    y += 4;
    doc.setFontSize(12);
    if (y > 270) { doc.addPage(); y = 18; }
    doc.text('Coach notes', 14, y);
    y += 8;
    doc.setFontSize(10);
    if (notes.length === 0) {
      doc.text('No notes on this game yet.', 14, y);
      y += 6;
    } else {
      notes.forEach((note) => {
        if (y > 270) { doc.addPage(); y = 18; }
        const lines = doc.splitTextToSize(note.body, 180);
        lines.forEach((line) => { doc.text(line, 14, y); y += 6; });
        doc.setFontSize(8);
        doc.text(`${note.author_name || 'Coach'} • ${new Date(note.created_at).toLocaleString()}`, 14, y);
        doc.setFontSize(10);
        y += 8;
      });
    }

    doc.save(`courtiq-game-summary-${selectedGameId}.pdf`);
  };

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

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1}>
            <Box>
              <Typography variant="h6" fontWeight={700}>Coach notes</Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Free-text notes on a real game record, visible to the team and added by Coaches.
              </Typography>
            </Box>
            {selectedGameId && (
              <Button variant="outlined" size="small" startIcon={<DownloadIcon />} onClick={exportGamePdf}>
                Download game summary as PDF
              </Button>
            )}
          </Stack>

          {gamesError && <Alert severity="error" sx={{ mb: 2 }}>{gamesError}</Alert>}

          <TextField
            select fullWidth label="Game" value={selectedGameId}
            onChange={(e) => setSelectedGameId(e.target.value)}
            disabled={gamesLoading || games.length === 0}
            sx={{ mb: 2, maxWidth: 420 }}
          >
            {games.map((g) => (
              <MenuItem key={g.id} value={g.id}>
                {gameLabel(g)}
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

      {selectedGameId && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>Match summary</Typography>
                <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
                  Computed from this game's real extracted Box Score.
                </Typography>
                {realAnalysisLoading ? (
                  <CircularProgress size={24} />
                ) : realAnalysisError ? (
                  <Alert severity="error">{realAnalysisError}</Alert>
                ) : matchSummary ? (
                  <Stack spacing={1}>
                    <Typography><strong>Points:</strong> {matchSummary.points}</Typography>
                    <Typography><strong>FG%:</strong> {matchSummary.fgPct}%</Typography>
                    <Typography><strong>3PT%:</strong> {matchSummary.threePtPct}%</Typography>
                    <Typography><strong>FT%:</strong> {matchSummary.ftPct}%</Typography>
                    <Typography><strong>Rebounds:</strong> {matchSummary.rebounds}</Typography>
                    <Typography><strong>Assists:</strong> {matchSummary.assists}</Typography>
                  </Stack>
                ) : (
                  <Alert severity="info">Metrics have not been computed for this game yet.</Alert>
                )}
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>AI-generated narrative</Typography>
                {realAnalysisLoading ? (
                  <CircularProgress size={24} sx={{ mt: 2 }} />
                ) : realNarrative ? (
                  <Typography sx={{ mt: 2, whiteSpace: 'pre-line' }}>{realNarrative}</Typography>
                ) : (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    No AI narrative has been generated for this game yet -- this is a best-effort step
                    (see Analysis) and may not have been run, or may have failed.
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {selectedGameId && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Shot selection zones</Typography>
            <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
              A stat breakdown of where each attempt came from -- paint, mid-range, or three-point -- read
              directly from this game's real play-by-play text. Not a shot chart: there's no court diagram or
              exact shot location, just attempts/makes/make% per zone.
            </Typography>
            {shotZonesLoading ? (
              <CircularProgress size={24} />
            ) : shotZonesError ? (
              <Alert severity="error">{shotZonesError}</Alert>
            ) : !shotZones || shotZones.players.length === 0 ? (
              <Alert severity="info">No play-by-play shot data recorded for this game yet.</Alert>
            ) : (
              <>
                <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }} useFlexGap>
                  {shotZones.teams.map((t) => (
                    <Box key={t.teamSide} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5, minWidth: 220 }}>
                      <Typography fontWeight={700} sx={{ textTransform: 'capitalize' }}>{t.teamSide} team</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Paint {t.zones.paint.makes}/{t.zones.paint.attempts} ({t.zones.paint.pct}%) •
                        {' '}Mid-range {t.zones.mid_range.makes}/{t.zones.mid_range.attempts} ({t.zones.mid_range.pct}%) •
                        {' '}Three {t.zones.three.makes}/{t.zones.three.attempts} ({t.zones.three.pct}%)
                      </Typography>
                    </Box>
                  ))}
                </Stack>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Player</TableCell>
                      <TableCell>Team</TableCell>
                      <TableCell>Paint (M/A, %)</TableCell>
                      <TableCell>Mid-range (M/A, %)</TableCell>
                      <TableCell>Three (M/A, %)</TableCell>
                      <TableCell>Total (M/A, %)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {shotZones.players.map((p) => (
                      <TableRow key={p.playerId}>
                        <TableCell>{p.fullName}</TableCell>
                        <TableCell sx={{ textTransform: 'capitalize' }}>{p.teamSide}</TableCell>
                        <TableCell>{p.zones.paint.makes}/{p.zones.paint.attempts} ({p.zones.paint.pct}%)</TableCell>
                        <TableCell>{p.zones.mid_range.makes}/{p.zones.mid_range.attempts} ({p.zones.mid_range.pct}%)</TableCell>
                        <TableCell>{p.zones.three.makes}/{p.zones.three.attempts} ({p.zones.three.pct}%)</TableCell>
                        <TableCell>{p.totalMakes}/{p.totalAttempts} ({p.totalPct}%)</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {shotZones.unresolvedAttempts > 0 && (
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
                    {shotZones.unresolvedAttempts} shot attempt{shotZones.unresolvedAttempts === 1 ? '' : 's'} in this game
                    couldn't be tied to a specific player (usually a name still pending player-identity review) and
                    aren't included in the table above.
                  </Typography>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </Layout>
  );
}

export default Analysis;