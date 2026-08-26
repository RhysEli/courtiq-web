import {
  Box, Grid, Card, CardContent, Typography, TextField, MenuItem, Table, TableBody,
  TableCell, TableHead, TableRow, Stack, CircularProgress, Alert, Button,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import Layout from '../components/layout';
import { backendApi } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

// REBUILT to use real data (FR-06 Season Dashboard). The previous version
// read from src/data/mockData.js -- fabricated players, a hardcoded 58/42
// offense/defense split, entirely disconnected from any real game. This
// version calls the real backend (/api/teams, /api/teams/:id/season-stats),
// the same endpoint Opponent Analysis already uses, which computes season
// averages directly from actual extracted player_game_stats rows. A team
// with zero real games shows "No games recorded yet", never a fabricated
// number.
//
// Win/loss progression (below) is a separate real data source from season-
// stats: GET /games's outcome field, backed by game_score_sheet, which can
// now be populated via either bulk-import or the single-report upload path
// (reports.js's Score Sheet extraction, wired up this round -- previously
// only bulk-import ever populated it, which is why outcomes used to be so
// inconsistently available). A game with no Score Sheet uploaded yet shows
// "Outcome pending", never a fabricated result.

const emptyStats = {
  gamesPlayed: 0, ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, topg: 0,
  fgPct: 0, threePct: 0, ftPct: 0,
};

function Statistics({ mode, toggleTheme, role, selectedSeason, logout }) {
  const { activeTeam } = useAuth();
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState('');

  const [teamId, setTeamId] = useState('');
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');

  // FR-06 win/loss progression: a separate real data source from
  // season-stats above -- GET /games already resolves each game's real
  // outcome (games.js's getGameWithReportStatus, backed by
  // game_score_sheet) independent of player_game_stats, so this needs its
  // own fetch and its own "no games yet" gate rather than reusing
  // team.gamesPlayed (a team could have a real Score Sheet on a game with
  // no Box Score/player stats extracted at all).
  const [games, setGames] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesError, setGamesError] = useState('');

  // FR-10: an Athlete's own account has a real `team` name (see
  // authService.js) -- scope them to it and hide the picker, rather than
  // letting them browse every team's stats.
  const isAthlete = role === 'Athlete';

  // FR-09: season-summary annotations. Scoped to a real
  // team_competition_seasons row (not the raw seasons.id -- see backend/
  // src/db/schema.sql's comment on annotations for why), resolved from
  // the team + season + competition selection the same way games.jsx's
  // Step 12 stage picker already resolves it -- fetch this team's real
  // competition-season memberships and find the one matching the selected
  // season/competition, rather than assuming one exists.
  const [realSeasons, setRealSeasons] = useState([]);
  const [realCompetitions, setRealCompetitions] = useState([]);
  const [seasonId, setSeasonId] = useState('');
  const [competitionId, setCompetitionId] = useState('');
  const [membershipTcs, setMembershipTcs] = useState(null);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [seasonNotes, setSeasonNotes] = useState([]);
  const [seasonNotesLoading, setSeasonNotesLoading] = useState(false);
  const [seasonNoteText, setSeasonNoteText] = useState('');
  const [submittingSeasonNote, setSubmittingSeasonNote] = useState(false);
  const [seasonNoteError, setSeasonNoteError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setTeamsLoading(true);
    backendApi.getTeams()
      .then((data) => {
        if (cancelled) return;
        setTeams(data);
        // Matched by the session's active team (Step 9 Phase 3) -- a real,
        // stable id, replacing the old fuzzy name-match against the mock
        // selectedTeam value, which rarely matched a real team name at
        // all and silently fell back to data[0] almost every time.
        const guess = data.find((t) => t.id === activeTeam?.id);
        setTeamId(guess?.id || data[0]?.id || '');
      })
      .catch((err) => { if (!cancelled) setTeamsError(err.message || 'Could not load teams.'); })
      .finally(() => { if (!cancelled) setTeamsLoading(false); });
    return () => { cancelled = true; };
    // Re-runs on active-team switch so this page re-scopes to the newly
    // active team rather than staying stuck on the old one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTeam?.id]);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    setStatsLoading(true);
    setStatsError('');
    backendApi.getTeamSeasonStats(teamId)
      .then((data) => { if (!cancelled) setStats(data); })
      .catch((err) => { if (!cancelled) setStatsError(err.message || 'Could not load season stats.'); })
      .finally(() => { if (!cancelled) setStatsLoading(false); });
    return () => { cancelled = true; };
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return undefined;
    let cancelled = false;
    setGamesLoading(true);
    setGamesError('');
    backendApi.getGames()
      .then((data) => { if (!cancelled) setGames(data); })
      .catch((err) => { if (!cancelled) setGamesError(err.message || 'Could not load games.'); })
      .finally(() => { if (!cancelled) setGamesLoading(false); });
    return () => { cancelled = true; };
  }, [teamId]);

  useEffect(() => {
    backendApi.getSeasons().then(setRealSeasons).catch(() => {});
    backendApi.getCompetitions().then(setRealCompetitions).catch(() => {});
  }, []);

  // Same resolution games.jsx's Step 12 stage picker already does: this
  // team's real competition-season memberships, filtered to the one
  // matching the currently-selected season + competition. null (not an
  // error) when no membership is recorded yet for that combination -- a
  // real, currently-common state (production has zero team_competition_
  // seasons rows for most teams as of this round).
  useEffect(() => {
    if (!teamId || !seasonId || !competitionId) {
      setMembershipTcs(null);
      return undefined;
    }
    let cancelled = false;
    setMembershipLoading(true);
    backendApi.getTeamCompetitionSeasons(teamId)
      .then((rows) => {
        if (cancelled) return;
        const tcs = rows.find((r) => String(r.competition_id) === String(competitionId) && r.season_id === seasonId);
        setMembershipTcs(tcs || null);
      })
      .catch(() => { if (!cancelled) setMembershipTcs(null); })
      .finally(() => { if (!cancelled) setMembershipLoading(false); });
    return () => { cancelled = true; };
  }, [teamId, seasonId, competitionId]);

  const loadSeasonNotes = (tcsId) => {
    if (!tcsId) return;
    setSeasonNotesLoading(true);
    backendApi.getSeasonAnnotations(tcsId)
      .then(setSeasonNotes)
      .catch((err) => setSeasonNoteError(err.message || 'Could not load notes.'))
      .finally(() => setSeasonNotesLoading(false));
  };

  useEffect(() => {
    setSeasonNotes([]);
    setSeasonNoteError('');
    if (membershipTcs) loadSeasonNotes(membershipTcs.id);
  }, [membershipTcs]);

  const handleAddSeasonNote = async () => {
    if (!seasonNoteText.trim() || !membershipTcs) return;
    setSubmittingSeasonNote(true);
    setSeasonNoteError('');
    try {
      await backendApi.addSeasonAnnotation(membershipTcs.id, seasonNoteText.trim());
      setSeasonNoteText('');
      loadSeasonNotes(membershipTcs.id);
    } catch (err) {
      setSeasonNoteError(err.message || 'Could not add note.');
    } finally {
      setSubmittingSeasonNote(false);
    }
  };

  const team = stats?.team || emptyStats;
  const players = stats?.players || [];

  // Chronological, this team's games only (GET /games already scopes to
  // games the caller's own teams were home OR opponent in, system-wide --
  // filtered here to just the selected team, since a Coach/Statistician on
  // several teams can select any of them above).
  const teamGames = useMemo(() => games
    .filter((g) => g.home_team_id === teamId || g.opponent_team_id === teamId)
    .slice()
    .sort((a, b) => (a.game_date < b.game_date ? -1 : a.game_date > b.game_date ? 1 : 0)), [games, teamId]);

  // 'pending': no Score Sheet uploaded yet (outcome is null) -- honest,
  // not a guess. 'unclear': a Score Sheet exists but its winning_team text
  // didn't resolve to either real side (games.js's winningTeamId, null in
  // that case) -- a real, if rare, extraction-quality edge case, distinct
  // from "not uploaded yet" and worth surfacing as its own state rather
  // than folding it into "pending".
  const progression = useMemo(() => teamGames.map((g) => {
    const opponentId = g.home_team_id === teamId ? g.opponent_team_id : g.home_team_id;
    const opponentName = teams.find((t) => t.id === opponentId)?.name || opponentId;
    let result = 'pending';
    if (g.outcome) {
      if (g.outcome.winningTeamId === teamId) result = 'win';
      else if (g.outcome.winningTeamId) result = 'loss';
      else result = 'unclear';
    }
    return { gameId: g.id, gameDate: g.game_date, opponentName, result, outcome: g.outcome };
  }), [teamGames, teamId, teams]);

  const record = useMemo(() => progression.reduce((acc, p) => {
    if (p.result === 'win') acc.wins += 1;
    else if (p.result === 'loss') acc.losses += 1;
    else if (p.result === 'unclear') acc.unclear += 1;
    else acc.pending += 1;
    return acc;
  }, { wins: 0, losses: 0, unclear: 0, pending: 0 }), [progression]);

  const shootingData = useMemo(() => ([
    { category: 'FG%', value: team.fgPct },
    { category: '3P%', value: team.threePct },
    { category: 'FT%', value: team.ftPct },
  ]), [team]);

  const perGameData = useMemo(() => ([
    { category: 'PPG', value: team.ppg },
    { category: 'RPG', value: team.rpg },
    { category: 'APG', value: team.apg },
    { category: 'SPG', value: team.spg },
    { category: 'BPG', value: team.bpg },
    { category: 'TOPG', value: team.topg },
  ]), [team]);

  // FR-13: export the currently-displayed real season summary as a PDF.
  // Built from the same `team`/`players` state rendered on screen -- no
  // separate fetch, no placeholder values.
  const exportPdf = () => {
    const teamName = teams.find((t) => t.id === teamId)?.name || 'Team';
    const doc = new jsPDF();
    let y = 18;

    doc.setFontSize(16);
    doc.text(`CourtIQ Season Summary — ${teamName}`, 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.text(`Generated ${new Date().toLocaleString()} • ${team.gamesPlayed} real recorded game(s)`, 14, y);
    y += 10;

    doc.setFontSize(12);
    doc.text('Team per-game averages', 14, y);
    y += 6;
    doc.setFontSize(10);
    [
      ['PPG', team.ppg], ['RPG', team.rpg], ['APG', team.apg],
      ['SPG', team.spg], ['BPG', team.bpg], ['TOPG', team.topg],
      ['FG%', `${team.fgPct}%`], ['3P%', `${team.threePct}%`], ['FT%', `${team.ftPct}%`],
    ].forEach(([label, value]) => {
      doc.text(`${label}: ${value}`, 14, y);
      y += 6;
    });

    y += 4;
    doc.setFontSize(12);
    doc.text('Player season averages', 14, y);
    y += 8;
    doc.setFontSize(9);
    doc.text('Player', 14, y);
    doc.text('GP', 90, y);
    doc.text('PPG', 110, y);
    doc.text('RPG', 130, y);
    doc.text('APG', 150, y);
    doc.text('FG%', 170, y);
    y += 5;
    doc.line(14, y, 196, y);
    y += 5;

    players.forEach((p) => {
      if (y > 280) { doc.addPage(); y = 18; }
      doc.text(String(p.playerName), 14, y);
      doc.text(String(p.gamesPlayed), 90, y);
      doc.text(String(p.ppg), 110, y);
      doc.text(String(p.rpg), 130, y);
      doc.text(String(p.apg), 150, y);
      doc.text(`${p.fgPct}%`, 170, y);
      y += 6;
    });

    doc.save(`courtiq-season-summary-${teamName.replace(/\s+/g, '-').toLowerCase()}.pdf`);
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Team</Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={4}>
                {isAthlete ? (
                  <Typography sx={{ mt: 1 }} color="text.secondary">
                    {teams.find((t) => t.id === teamId)?.name || 'Your team'}
                  </Typography>
                ) : (
                  <TextField
                    fullWidth
                    select
                    label="Team"
                    value={teamId}
                    onChange={(e) => setTeamId(e.target.value)}
                    disabled={teamsLoading || teams.length === 0}
                  >
                    {teams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                  </TextField>
                )}
              </Grid>
            </Grid>
            {teamsError && <Alert severity="error" sx={{ mt: 2 }}>{teamsError}</Alert>}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Season notes</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Free-text notes on this team's season summary, visible to the team and added by Coaches.
            </Typography>

            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth select label="Season" value={seasonId}
                  onChange={(e) => setSeasonId(e.target.value)}
                  disabled={realSeasons.length === 0}
                >
                  {realSeasons.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth select label="Competition" value={competitionId}
                  onChange={(e) => setCompetitionId(e.target.value)}
                  disabled={realCompetitions.length === 0}
                >
                  {realCompetitions.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </TextField>
              </Grid>
            </Grid>

            {!seasonId || !competitionId ? (
              <Typography color="text.secondary">Pick a season and competition to see or add notes.</Typography>
            ) : membershipLoading ? (
              <CircularProgress size={24} />
            ) : !membershipTcs ? (
              <Alert severity="info">
                This team has no recorded membership in this competition for this season, so there's no season
                summary to attach notes to yet.
              </Alert>
            ) : (
              <>
                {seasonNotesLoading ? (
                  <CircularProgress size={24} />
                ) : (
                  <Stack spacing={1.5} sx={{ mb: 2 }}>
                    {seasonNotes.length === 0 && <Typography color="text.secondary">No notes on this season summary yet.</Typography>}
                    {seasonNotes.map((note) => (
                      <Box key={note.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                        <Typography>{note.body}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {note.author_name || 'Coach'} • {new Date(note.created_at).toLocaleString()}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                )}

                {role === 'Coach' && (
                  <Stack spacing={1}>
                    <TextField
                      multiline minRows={2} fullWidth label="Add a note"
                      value={seasonNoteText} onChange={(e) => setSeasonNoteText(e.target.value)}
                    />
                    {seasonNoteError && <Alert severity="error">{seasonNoteError}</Alert>}
                    <Button
                      variant="contained" onClick={handleAddSeasonNote}
                      disabled={submittingSeasonNote || !seasonNoteText.trim()} sx={{ alignSelf: 'flex-start' }}
                    >
                      {submittingSeasonNote ? 'Adding…' : 'Add note'}
                    </Button>
                  </Stack>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Win/Loss Progression</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Real outcomes from each game's Score Sheet, in chronological order. A game shows "Outcome pending"
              until a Score Sheet has actually been uploaded and extracted for it -- never a guessed result.
            </Typography>

            {gamesError && <Alert severity="error" sx={{ mb: 2 }}>{gamesError}</Alert>}

            {gamesLoading ? (
              <CircularProgress size={24} />
            ) : teamGames.length === 0 ? (
              <Typography color="text.secondary">No games recorded yet for this team.</Typography>
            ) : (
              <>
                <Typography sx={{ mb: 2 }}>
                  <strong>{record.wins}-{record.losses}</strong>
                  {record.pending > 0 && ` • ${record.pending} outcome${record.pending === 1 ? '' : 's'} pending`}
                  {record.unclear > 0 && ` • ${record.unclear} unclear`}
                </Typography>
                <Stack spacing={1}>
                  {progression.map((p) => (
                    <Stack
                      key={p.gameId} direction="row" alignItems="center" justifyContent="space-between"
                      sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
                    >
                      <Typography color="text.secondary" sx={{ minWidth: 110 }}>{p.gameDate || 'no date'}</Typography>
                      <Typography sx={{ flex: 1, mx: 2 }}>vs {p.opponentName}</Typography>
                      {p.result === 'win' && <Typography color="success.main" fontWeight={700}>W {p.outcome.scoreA}-{p.outcome.scoreB}</Typography>}
                      {p.result === 'loss' && <Typography color="error.main" fontWeight={700}>L {p.outcome.scoreA}-{p.outcome.scoreB}</Typography>}
                      {p.result === 'unclear' && <Typography color="warning.main">Outcome unclear</Typography>}
                      {p.result === 'pending' && <Typography color="text.secondary">Outcome pending</Typography>}
                    </Stack>
                  ))}
                </Stack>
              </>
            )}
          </CardContent>
        </Card>

        {statsLoading && (
          <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>
        )}

        {!statsLoading && statsError && <Alert severity="error">{statsError}</Alert>}

        {!statsLoading && !statsError && stats && team.gamesPlayed === 0 && (
          <Alert severity="info">No games recorded yet for this team.</Alert>
        )}

        {!statsLoading && !statsError && stats && team.gamesPlayed > 0 && (
          <>
            <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
              <Typography color="text.secondary">
                Season averages across {team.gamesPlayed} real recorded game{team.gamesPlayed === 1 ? '' : 's'}.
              </Typography>
              <Button variant="outlined" size="small" startIcon={<DownloadIcon />} onClick={exportPdf}>
                Download as PDF
              </Button>
            </Stack>

            <Grid container spacing={3}>
              <Grid item xs={12} lg={7}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" fontWeight={700}>Team per-game averages</Typography>
                    <Box sx={{ height: 300, mt: 2 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={perGameData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                          <XAxis dataKey="category" stroke="currentColor" />
                          <YAxis stroke="currentColor" />
                          <Tooltip />
                          <Bar dataKey="value" fill="#ff7a1a" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} lg={5}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" fontWeight={700}>Shooting efficiency</Typography>
                    <Box sx={{ height: 300, mt: 2 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={shootingData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                          <XAxis dataKey="category" stroke="currentColor" />
                          <YAxis stroke="currentColor" domain={[0, 100]} />
                          <Tooltip />
                          <Bar dataKey="value" fill="#38bdf8" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>Player season averages</Typography>
                <Table sx={{ mt: 2 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Player</TableCell>
                      <TableCell>GP</TableCell>
                      <TableCell>PPG</TableCell>
                      <TableCell>RPG</TableCell>
                      <TableCell>APG</TableCell>
                      <TableCell>FG%</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {players.map((player) => (
                      <TableRow key={player.playerName}>
                        <TableCell>{player.playerName}</TableCell>
                        <TableCell>{player.gamesPlayed}</TableCell>
                        <TableCell>{player.ppg}</TableCell>
                        <TableCell>{player.rpg}</TableCell>
                        <TableCell>{player.apg}</TableCell>
                        <TableCell>{player.fgPct}%</TableCell>
                      </TableRow>
                    ))}
                    {players.length === 0 && (
                      <TableRow><TableCell colSpan={6}>No player stats recorded yet.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </Box>
    </Layout>
  );
}

export default Statistics;