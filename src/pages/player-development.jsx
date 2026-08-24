import {
  Box, Grid, Card, CardContent, Typography, TextField, MenuItem, Table, TableBody,
  TableCell, TableHead, TableRow, Stack, CircularProgress, Alert, Button,
} from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout';
import { backendApi } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

// FR-08: "The system shall maintain a longitudinal player profile
// displaying per-season and career-cumulative statistics for each
// registered player, enabling trend analysis of individual development
// over time." (exact wording from the project proposal)
//
// Built the same way as FR-06 (statistics.jsx): real backend data only,
// via /api/teams/:teamId/players/:playerId/development, which computes
// both career-cumulative totals and per-season averages directly from
// real extracted player_game_stats rows. A player with no real games
// shows "No games recorded yet", never a fabricated trend line.
//
// Scoped by playerId (a stable id resolved once at ingestion time), not
// the raw extracted name string -- two different real players sharing an
// identical extracted name on the same team no longer collide (see
// backend/src/db/schema.sql's comment on player_game_stats.player_id).

function PlayerDevelopment({ mode, toggleTheme, role, selectedSeason, logout, currentUser }) {
  const { activeTeam } = useAuth();
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState('');
  const [teamId, setTeamId] = useState('');

  const [rosterPlayers, setRosterPlayers] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [playerId, setPlayerId] = useState('');

  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

  // FR-09: player-profile annotations, scoped to the same playerId this
  // page already resolves and queries development stats by (Step 16a) --
  // stable and real, not a raw name, so no identity-collision risk here.
  const [playerNotes, setPlayerNotes] = useState([]);
  const [playerNotesLoading, setPlayerNotesLoading] = useState(false);
  const [playerNoteText, setPlayerNoteText] = useState('');
  const [submittingPlayerNote, setSubmittingPlayerNote] = useState(false);
  const [playerNoteError, setPlayerNoteError] = useState('');

  // FR-10: an Athlete's own account has a real `team`/`playerName` (see
  // authService.js) -- scope them to their own profile and hide both
  // pickers, rather than letting them browse every player on every team.
  const isAthlete = role === 'Athlete';

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

  // Player picker is populated from the same season-stats endpoint
  // Statistics already uses -- its `players` array is exactly "every
  // player with at least one real extracted game for this team", which
  // is the correct set of choices here too. Each entry now carries both
  // playerId (what's actually queried) and playerName (what's displayed).
  useEffect(() => {
    if (!teamId) return undefined;
    let cancelled = false;
    setRosterLoading(true);
    setPlayerId('');
    setProfile(null);
    backendApi.getTeamSeasonStats(teamId)
      .then((data) => {
        if (cancelled) return;
        const roster = (data.players || []).map((p) => ({ playerId: p.playerId, playerName: p.playerName }));
        setRosterPlayers(roster);
        // An Athlete defaults to their own player, not the first roster
        // entry.
        setPlayerId((isAthlete && currentUser?.playerId) || roster[0]?.playerId || '');
      })
      .catch(() => { if (!cancelled) setRosterPlayers([]); })
      .finally(() => { if (!cancelled) setRosterLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  useEffect(() => {
    if (!teamId || !playerId) return undefined;
    let cancelled = false;
    setProfileLoading(true);
    setProfileError('');
    backendApi.getPlayerDevelopment(teamId, playerId)
      .then((data) => { if (!cancelled) setProfile(data); })
      .catch((err) => { if (!cancelled) setProfileError(err.message || 'Could not load player development profile.'); })
      .finally(() => { if (!cancelled) setProfileLoading(false); });
    return () => { cancelled = true; };
  }, [teamId, playerId]);

  const loadPlayerNotes = (id) => {
    if (!id) return;
    setPlayerNotesLoading(true);
    backendApi.getPlayerAnnotations(id)
      .then(setPlayerNotes)
      .catch((err) => setPlayerNoteError(err.message || 'Could not load notes.'))
      .finally(() => setPlayerNotesLoading(false));
  };

  useEffect(() => {
    setPlayerNotes([]);
    setPlayerNoteError('');
    if (playerId) loadPlayerNotes(playerId);
  }, [playerId]);

  const handleAddPlayerNote = async () => {
    if (!playerNoteText.trim() || !playerId) return;
    setSubmittingPlayerNote(true);
    setPlayerNoteError('');
    try {
      await backendApi.addPlayerAnnotation(playerId, playerNoteText.trim());
      setPlayerNoteText('');
      loadPlayerNotes(playerId);
    } catch (err) {
      setPlayerNoteError(err.message || 'Could not add note.');
    } finally {
      setSubmittingPlayerNote(false);
    }
  };

  const career = profile?.career;
  const seasons = profile?.seasons || [];

  // Recharts needs one flat array with a category key (season name) plus
  // one numeric key per line -- reshape the per-season list into that.
  const trendData = useMemo(() => seasons.map((s) => ({
    season: s.seasonName,
    PPG: s.ppg,
    RPG: s.rpg,
    APG: s.apg,
  })), [seasons]);

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Player Development</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Longitudinal per-season and career-cumulative stats for one player, from real extracted game data.
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                {isAthlete ? (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Team</Typography>
                    <Typography>{teams.find((t) => t.id === teamId)?.name || 'Your team'}</Typography>
                  </Box>
                ) : (
                  <TextField
                    fullWidth select label="Team" value={teamId}
                    onChange={(e) => setTeamId(e.target.value)}
                    disabled={teamsLoading || teams.length === 0}
                  >
                    {teams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                  </TextField>
                )}
              </Grid>
              <Grid item xs={12} sm={4}>
                {isAthlete ? (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Player</Typography>
                    <Typography>{profile?.playerName || 'You'}</Typography>
                  </Box>
                ) : (
                  <TextField
                    fullWidth select label="Player" value={playerId}
                    onChange={(e) => setPlayerId(e.target.value)}
                    disabled={rosterLoading || rosterPlayers.length === 0}
                  >
                    {rosterPlayers.map((p) => <MenuItem key={p.playerId} value={p.playerId}>{p.playerName}</MenuItem>)}
                  </TextField>
                )}
              </Grid>
            </Grid>
            {teamsError && <Alert severity="error" sx={{ mt: 2 }}>{teamsError}</Alert>}
            {!rosterLoading && teamId && rosterPlayers.length === 0 && (
              <Alert severity="info" sx={{ mt: 2 }}>No players with recorded games for this team yet.</Alert>
            )}
          </CardContent>
        </Card>

        {playerId && (
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={700}>Player notes</Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Free-text notes on this player's profile, visible to the team and added by Coaches.
              </Typography>

              {playerNotesLoading ? (
                <CircularProgress size={24} />
              ) : (
                <Stack spacing={1.5} sx={{ mb: 2 }}>
                  {playerNotes.length === 0 && <Typography color="text.secondary">No notes on this player yet.</Typography>}
                  {playerNotes.map((note) => (
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
                    value={playerNoteText} onChange={(e) => setPlayerNoteText(e.target.value)}
                  />
                  {playerNoteError && <Alert severity="error">{playerNoteError}</Alert>}
                  <Button
                    variant="contained" onClick={handleAddPlayerNote}
                    disabled={submittingPlayerNote || !playerNoteText.trim()} sx={{ alignSelf: 'flex-start' }}
                  >
                    {submittingPlayerNote ? 'Adding…' : 'Add note'}
                  </Button>
                </Stack>
              )}
            </CardContent>
          </Card>
        )}

        {profileLoading && (
          <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>
        )}

        {!profileLoading && profileError && <Alert severity="error">{profileError}</Alert>}

        {!profileLoading && !profileError && profile && !career && (
          <Alert severity="info">No games recorded yet for this player.</Alert>
        )}

        {!profileLoading && !profileError && career && (
          <>
            <Grid container spacing={2}>
              {[
                ['Career GP', career.gamesPlayed],
                ['Career PPG', career.ppg],
                ['Career RPG', career.rpg],
                ['Career APG', career.apg],
                ['Career FG%', `${career.fgPct}%`],
                ['Career 3P%', `${career.threePct}%`],
              ].map(([label, value]) => (
                <Grid item xs={6} sm={4} md={2} key={label}>
                  <Card>
                    <CardContent>
                      <Typography variant="caption" color="text.secondary">{label}</Typography>
                      <Typography variant="h5" fontWeight={700}>{value}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>

            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>Trend across seasons</Typography>
                {seasons.length < 2 ? (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    Only {seasons.length} season{seasons.length === 1 ? '' : 's'} of real data recorded so far —
                    a trend line becomes meaningful once this player has games across multiple seasons.
                  </Alert>
                ) : (
                  <Box sx={{ height: 320, mt: 2 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                        <XAxis dataKey="season" stroke="currentColor" />
                        <YAxis stroke="currentColor" />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="PPG" stroke="#ff7a1a" strokeWidth={2} />
                        <Line type="monotone" dataKey="RPG" stroke="#38bdf8" strokeWidth={2} />
                        <Line type="monotone" dataKey="APG" stroke="#a78bfa" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </Box>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>Per-season breakdown</Typography>
                <Table sx={{ mt: 2 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Season</TableCell>
                      <TableCell>GP</TableCell>
                      <TableCell>PPG</TableCell>
                      <TableCell>RPG</TableCell>
                      <TableCell>APG</TableCell>
                      <TableCell>FG%</TableCell>
                      <TableCell>3P%</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {seasons.map((s) => (
                      <TableRow key={s.seasonId}>
                        <TableCell>{s.seasonName}</TableCell>
                        <TableCell>{s.gamesPlayed}</TableCell>
                        <TableCell>{s.ppg}</TableCell>
                        <TableCell>{s.rpg}</TableCell>
                        <TableCell>{s.apg}</TableCell>
                        <TableCell>{s.fgPct}%</TableCell>
                        <TableCell>{s.threePct}%</TableCell>
                      </TableRow>
                    ))}
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

export default PlayerDevelopment;