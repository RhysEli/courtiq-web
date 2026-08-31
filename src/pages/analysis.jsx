import {
  Box, Grid, Card, CardContent, Typography, Stack, Alert,
  TextField, MenuItem, Button, CircularProgress, Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import SportsBasketballIcon from '@mui/icons-material/SportsBasketball';
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

  // Step 51: real Lineup Analysis / Rotations Summary / Plus-Minus Summary
  // data (game_lineup_analysis/game_rotation_stints/game_plus_minus) --
  // fully extracted and populated for every real game since well before
  // this round (confirmed Step 47), but GET /games/:gameId/report-data
  // (the real backend route that already serves it) had no frontend
  // consumer anywhere in this app until now.
  const [reportData, setReportData] = useState(null);
  const [reportDataLoading, setReportDataLoading] = useState(false);
  const [reportDataError, setReportDataError] = useState('');

  // Step 54: real, on-demand game-flow narrative (POST /analysis/games/
  // :gameId/game-flow) and coaching verdict (POST .../coaching-verdict) --
  // both real, live, backend-verified (Step 53) but with no frontend
  // consumer until now. Neither is persisted (narrative.js's own comment
  // on why), so both are opt-in "Generate" buttons, same on-demand
  // pattern as opponent-analysis.jsx's "AI Scouting Report" card -- not an
  // auto-fetch like the AI-generated narrative below, which reads an
  // already-stored game_narratives row.
  const [gameFlow, setGameFlow] = useState(null);
  const [gameFlowLoading, setGameFlowLoading] = useState(false);
  const [gameFlowError, setGameFlowError] = useState('');
  const [coachingVerdict, setCoachingVerdict] = useState(null);
  const [coachingVerdictLoading, setCoachingVerdictLoading] = useState(false);
  const [coachingVerdictError, setCoachingVerdictError] = useState('');

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

  useEffect(() => {
    if (!selectedGameId) { setReportData(null); return undefined; }
    let cancelled = false;
    setReportDataLoading(true);
    setReportDataError('');
    backendApi.getReportData(selectedGameId)
      .then((data) => { if (!cancelled) setReportData(data); })
      .catch((err) => { if (!cancelled) setReportDataError(err.message || 'Could not load lineup/rotation/plus-minus data.'); })
      .finally(() => { if (!cancelled) setReportDataLoading(false); });
    return () => { cancelled = true; };
  }, [selectedGameId]);

  // Step 54: neither of these is fetched automatically (they're real,
  // opt-in Claude calls) -- but a stale game-flow narrative or coaching
  // verdict from the PREVIOUS selected game must not linger on screen
  // once the game picker changes, so both reset here the same way
  // opponent-analysis.jsx's own aiReport resets on every new head-to-head
  // lookup.
  useEffect(() => {
    setGameFlow(null); setGameFlowError('');
    setCoachingVerdict(null); setCoachingVerdictError('');
  }, [selectedGameId]);

  // "SURNAME I." per player, joined -- the real shape lineup_analysis/
  // rotation_stints store (players_json is already parsed to an array by
  // the backend route), same "surname + initial" convention this app's
  // own PDF extractors use elsewhere (rosterMap).
  function formatLineupPlayers(players) {
    return (players || []).map((p) => `${p.surname}${p.initial ? ` ${p.initial}.` : ''}`).join(', ');
  }

  // Real countdown-clock parsing ("MM:SS", counting down within a
  // quarter) into total seconds, so rotation stints can be sorted into
  // real chronological order (quarter_on ascending, then time_on
  // descending -- a stint starting at 10:00 happened before one starting
  // at 04:36 in the same quarter).
  function clockToSeconds(mmss) {
    if (!mmss) return 0;
    const [m, s] = mmss.split(':').map(Number);
    return (m || 0) * 60 + (s || 0);
  }

  // Step 54: the coaching-verdict route's real plain-text output uses
  // exactly these six headers, each on its own line, per its own prompt
  // (narrative.js's generateCoachingVerdict) -- matched here verbatim
  // (case-insensitively) rather than splitting on blank lines, since
  // that's the one guarantee the prompt actually makes about the real
  // output's shape. Returns [] if none of the six headers are found at
  // all (a real, if rare, off-spec generation), so the caller can fall
  // back to showing the raw text rather than silently rendering nothing.
  const COACHING_VERDICT_SECTIONS = [
    'What went well', 'What must improve', 'Offense', 'Defense', 'Rotation and lineup', 'Player development',
  ];
  function parseCoachingVerdict(text) {
    if (!text) return [];
    const sections = [];
    let current = null;
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      const header = COACHING_VERDICT_SECTIONS.find((h) => h.toLowerCase() === line.toLowerCase());
      if (header) {
        current = { title: header, body: [] };
        sections.push(current);
      } else if (current && line) {
        current.body.push(line);
      }
    }
    return sections;
  }

  function groupByTeamSide(rows) {
    const groups = {};
    for (const r of rows || []) {
      if (!groups[r.team_side]) groups[r.team_side] = { teamSide: r.team_side, teamName: r.team_name, rows: [] };
      groups[r.team_side].rows.push(r);
    }
    return Object.values(groups);
  }

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
  const verdictSections = coachingVerdict ? parseCoachingVerdict(coachingVerdict) : [];

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

  // Step 54: real, on-demand Claude calls -- same try/catch/finally shape
  // as opponent-analysis.jsx's generateAiReport, and the same real error
  // message pass-through (backendApi's request() already extracts the
  // backend's real {error: "..."} body for a 503 missing-API-key or 502
  // generation-failure response into err.message).
  const generateGameFlow = async () => {
    if (!selectedGameId) return;
    setGameFlowLoading(true);
    setGameFlowError('');
    try {
      const data = await backendApi.getGameFlowNarrative(selectedGameId);
      setGameFlow(data.text);
    } catch (err) {
      setGameFlowError(err.message || 'Could not generate the game-flow narrative.');
    } finally {
      setGameFlowLoading(false);
    }
  };

  const generateCoachingVerdict = async () => {
    if (!selectedGameId) return;
    setCoachingVerdictLoading(true);
    setCoachingVerdictError('');
    try {
      const data = await backendApi.getCoachingVerdict(selectedGameId);
      setCoachingVerdict(data.text);
    } catch (err) {
      setCoachingVerdictError(err.message || 'Could not generate the coaching verdict.');
    } finally {
      setCoachingVerdictLoading(false);
    }
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
            <Typography variant="h6" fontWeight={700}>Game-flow narrative</Typography>
            <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
              A real, chronological account of how this game unfolded -- specific scoring runs, momentum swings,
              and the substitutions behind them -- generated fresh from this game's real quarter scores, rotation
              stints, and play-by-play. Not stored: generated on demand, same as the opponent scouting report on
              the Opponent Analysis page.
            </Typography>
            <Button
              variant="contained"
              startIcon={gameFlowLoading ? <CircularProgress size={18} /> : <SportsBasketballIcon />}
              onClick={generateGameFlow}
              disabled={gameFlowLoading}
              sx={{ mb: 2 }}
            >
              {gameFlowLoading ? 'Generating…' : gameFlow ? 'Regenerate' : 'Generate game-flow narrative'}
            </Button>
            {gameFlowError && <Alert severity="error">{gameFlowError}</Alert>}
            {gameFlow && <Typography sx={{ whiteSpace: 'pre-line' }}>{gameFlow}</Typography>}
          </CardContent>
        </Card>
      )}

      {selectedGameId && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Coaching verdict</Typography>
            <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
              Real, categorized coaching recommendations -- what went well, what must improve, and specific
              offense/defense/rotation/player-development guidance -- generated fresh from this game's real
              metrics. Not stored: generated on demand.
            </Typography>
            <Button
              variant="contained"
              startIcon={coachingVerdictLoading ? <CircularProgress size={18} /> : <SportsBasketballIcon />}
              onClick={generateCoachingVerdict}
              disabled={coachingVerdictLoading}
              sx={{ mb: 2 }}
            >
              {coachingVerdictLoading ? 'Generating…' : coachingVerdict ? 'Regenerate' : 'Generate coaching verdict'}
            </Button>
            {coachingVerdictError && <Alert severity="error">{coachingVerdictError}</Alert>}
            {coachingVerdict && (
              verdictSections.length > 0 ? (
                <Grid container spacing={2}>
                  {verdictSections.map((section) => (
                    <Grid item xs={12} md={6} key={section.title}>
                      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5, height: '100%' }}>
                        <Typography fontWeight={700} sx={{ mb: 1 }}>{section.title}</Typography>
                        <Stack spacing={0.5}>
                          {section.body.map((line, i) => (
                            <Typography key={`${section.title}-${i}`} variant="body2">{line}</Typography>
                          ))}
                        </Stack>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <>
                  <Alert severity="warning" sx={{ mb: 1 }}>
                    Could not split this into its six real sections -- showing the raw generated text below.
                  </Alert>
                  <Typography sx={{ whiteSpace: 'pre-line' }}>{coachingVerdict}</Typography>
                </>
              )
            )}
          </CardContent>
        </Card>
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

      {selectedGameId && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Lineup analysis</Typography>
            <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
              Real 5-man units from this game's Lineup Analysis report -- time on court, real score while that
              unit played, and the resulting differential. Each team's best (highest differential) and worst
              (lowest differential) real lineup is highlighted.
            </Typography>
            {reportDataLoading ? (
              <CircularProgress size={24} />
            ) : reportDataError ? (
              <Alert severity="error">{reportDataError}</Alert>
            ) : !reportData || !reportData.lineupAnalysis || reportData.lineupAnalysis.length === 0 ? (
              <Alert severity="info">No Lineup Analysis data recorded for this game yet.</Alert>
            ) : (
              groupByTeamSide(reportData.lineupAnalysis).map((group) => {
                const sorted = [...group.rows].sort((a, b) => b.score_diff - a.score_diff);
                const bestId = sorted.length > 1 ? sorted[0].id : null;
                const worstId = sorted.length > 1 ? sorted[sorted.length - 1].id : null;
                return (
                  <Box key={group.teamSide} sx={{ mb: 3 }}>
                    <Typography fontWeight={700} sx={{ mb: 1, textTransform: 'capitalize' }}>
                      {group.teamName || group.teamSide} ({group.teamSide})
                    </Typography>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Lineup</TableCell>
                          <TableCell>Time on court</TableCell>
                          <TableCell>Score</TableCell>
                          <TableCell>Diff</TableCell>
                          <TableCell>Pts/min</TableCell>
                          <TableCell>Reb</TableCell>
                          <TableCell>Stl</TableCell>
                          <TableCell>TO</TableCell>
                          <TableCell>Ast</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {sorted.map((row) => (
                          <TableRow
                            key={row.id}
                            sx={{
                              bgcolor: row.id === bestId ? 'success.main' : row.id === worstId ? 'error.main' : undefined,
                              '& .MuiTableCell-root': row.id === bestId || row.id === worstId ? { color: 'common.white' } : undefined,
                            }}
                          >
                            <TableCell sx={{ maxWidth: 320 }}>{formatLineupPlayers(row.players_json)}</TableCell>
                            <TableCell>{row.time_on_court}</TableCell>
                            <TableCell>{row.score}</TableCell>
                            <TableCell>{row.score_diff > 0 ? `+${row.score_diff}` : row.score_diff}</TableCell>
                            <TableCell>{row.points_per_min != null ? Number(row.points_per_min).toFixed(2) : '—'}</TableCell>
                            <TableCell>{row.rebounds}</TableCell>
                            <TableCell>{row.steals}</TableCell>
                            <TableCell>{row.turnovers}</TableCell>
                            <TableCell>{row.assists}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      {selectedGameId && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Rotation timeline</Typography>
            <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
              Real chronological entry/exit for each 5-man unit, from this game's Rotations Summary report --
              when each real lineup checked in and out, in real game-clock order.
            </Typography>
            {reportDataLoading ? (
              <CircularProgress size={24} />
            ) : reportDataError ? (
              <Alert severity="error">{reportDataError}</Alert>
            ) : !reportData || !reportData.rotationStints || reportData.rotationStints.length === 0 ? (
              <Alert severity="info">No Rotations Summary data recorded for this game yet.</Alert>
            ) : (
              groupByTeamSide(reportData.rotationStints).map((group) => {
                const sorted = [...group.rows].sort((a, b) => {
                  if (a.quarter_on !== b.quarter_on) return a.quarter_on - b.quarter_on;
                  return clockToSeconds(b.time_on) - clockToSeconds(a.time_on);
                });
                return (
                  <Box key={group.teamSide} sx={{ mb: 3 }}>
                    <Typography fontWeight={700} sx={{ mb: 1, textTransform: 'capitalize' }}>
                      {group.teamName || group.teamSide} ({group.teamSide})
                    </Typography>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Lineup</TableCell>
                          <TableCell>In</TableCell>
                          <TableCell>Out</TableCell>
                          <TableCell>Time on court</TableCell>
                          <TableCell>Score</TableCell>
                          <TableCell>Diff</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {sorted.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell sx={{ maxWidth: 320 }}>{formatLineupPlayers(row.players_json)}</TableCell>
                            <TableCell>Q{row.quarter_on} {row.time_on}</TableCell>
                            <TableCell>{row.quarter_off ? `Q${row.quarter_off} ${row.time_off}` : '—'}</TableCell>
                            <TableCell>{row.time_on_court}</TableCell>
                            <TableCell>{row.score}</TableCell>
                            <TableCell>{row.score_diff > 0 ? `+${row.score_diff}` : row.score_diff}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      {selectedGameId && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Plus-minus: on court vs. off court</Typography>
            <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
              Real per-player splits from this game's Plus/Minus Summary report -- how the team's real score,
              scoring margin, and pace looked while each player was on the court versus on the bench. This goes
              beyond a simple plus/minus number, and beyond what any of CourtIQ's reference designs show -- real
              on/off splits, not just a single net figure.
            </Typography>
            {reportDataLoading ? (
              <CircularProgress size={24} />
            ) : reportDataError ? (
              <Alert severity="error">{reportDataError}</Alert>
            ) : !reportData || !reportData.plusMinus || reportData.plusMinus.length === 0 ? (
              <Alert severity="info">No Plus/Minus Summary data recorded for this game yet.</Alert>
            ) : (
              groupByTeamSide(reportData.plusMinus).map((group) => (
                <Box key={group.teamSide} sx={{ mb: 3 }}>
                  <Typography fontWeight={700} sx={{ mb: 1, textTransform: 'capitalize' }}>
                    {group.teamName || group.teamSide} ({group.teamSide})
                  </Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Player</TableCell>
                        <TableCell>Min (On)</TableCell>
                        <TableCell>Min (Off)</TableCell>
                        <TableCell>Score (On)</TableCell>
                        <TableCell>Score (Off)</TableCell>
                        <TableCell>Diff (On)</TableCell>
                        <TableCell>Diff (Off)</TableCell>
                        <TableCell>Pts/min (On)</TableCell>
                        <TableCell>Pts/min (Off)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {group.rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.player_name}</TableCell>
                          <TableCell>{row.minutes_on}</TableCell>
                          <TableCell>{row.minutes_off}</TableCell>
                          <TableCell>{row.score_while_on}</TableCell>
                          <TableCell>{row.score_while_off}</TableCell>
                          <TableCell>{row.points_diff_on > 0 ? `+${row.points_diff_on}` : row.points_diff_on}</TableCell>
                          <TableCell>{row.points_diff_off > 0 ? `+${row.points_diff_off}` : row.points_diff_off}</TableCell>
                          <TableCell>{row.points_per_min_on != null ? Number(row.points_per_min_on).toFixed(2) : '—'}</TableCell>
                          <TableCell>{row.points_per_min_off != null ? Number(row.points_per_min_off).toFixed(2) : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </Layout>
  );
}

export default Analysis;