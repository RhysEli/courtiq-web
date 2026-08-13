import {
  Box, Grid, Card, CardContent, Typography, TextField, MenuItem, Table, TableBody,
  TableCell, TableHead, TableRow, Stack, CircularProgress, Alert,
} from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout';
import { backendApi } from '../api/client';

// FR-08: "The system shall maintain a longitudinal player profile
// displaying per-season and career-cumulative statistics for each
// registered player, enabling trend analysis of individual development
// over time." (exact wording from the project proposal)
//
// Built the same way as FR-06 (statistics.jsx): real backend data only,
// via the new /api/teams/:teamId/players/:playerName/development
// endpoint, which computes both career-cumulative totals and per-season
// averages directly from real extracted player_game_stats rows. A player
// with no real games shows "No games recorded yet", never a fabricated
// trend line.
//
// Known limitation, inherited from how players are identified everywhere
// else in this system (see season-stats route): a player is scoped to
// (team, extracted name) since there's no roster/player-ID linkage in the
// data model yet. Two different real players with an identical extracted
// name on the same team would incorrectly merge into one profile.

function PlayerDevelopment({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState('');
  const [teamId, setTeamId] = useState('');

  const [rosterPlayers, setRosterPlayers] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [playerName, setPlayerName] = useState('');

  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setTeamsLoading(true);
    backendApi.getTeams()
      .then((data) => {
        if (cancelled) return;
        setTeams(data);
        const guess = data.find((t) => t.name?.toLowerCase().includes(String(selectedTeam || '').toLowerCase().replace(/-/g, ' ')));
        setTeamId(guess?.id || data[0]?.id || '');
      })
      .catch((err) => { if (!cancelled) setTeamsError(err.message || 'Could not load teams.'); })
      .finally(() => { if (!cancelled) setTeamsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Player picker is populated from the same season-stats endpoint
  // Statistics already uses -- its `players` array is exactly "every
  // player with at least one real extracted game for this team", which
  // is the correct set of choices here too.
  useEffect(() => {
    if (!teamId) return undefined;
    let cancelled = false;
    setRosterLoading(true);
    setPlayerName('');
    setProfile(null);
    backendApi.getTeamSeasonStats(teamId)
      .then((data) => {
        if (cancelled) return;
        const names = (data.players || []).map((p) => p.playerName);
        setRosterPlayers(names);
        setPlayerName(names[0] || '');
      })
      .catch(() => { if (!cancelled) setRosterPlayers([]); })
      .finally(() => { if (!cancelled) setRosterLoading(false); });
    return () => { cancelled = true; };
  }, [teamId]);

  useEffect(() => {
    if (!teamId || !playerName) return undefined;
    let cancelled = false;
    setProfileLoading(true);
    setProfileError('');
    backendApi.getPlayerDevelopment(teamId, playerName)
      .then((data) => { if (!cancelled) setProfile(data); })
      .catch((err) => { if (!cancelled) setProfileError(err.message || 'Could not load player development profile.'); })
      .finally(() => { if (!cancelled) setProfileLoading(false); });
    return () => { cancelled = true; };
  }, [teamId, playerName]);

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
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Player Development</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Longitudinal per-season and career-cumulative stats for one player, from real extracted game data.
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth select label="Team" value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  disabled={teamsLoading || teams.length === 0}
                >
                  {teams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth select label="Player" value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  disabled={rosterLoading || rosterPlayers.length === 0}
                >
                  {rosterPlayers.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
                </TextField>
              </Grid>
            </Grid>
            {teamsError && <Alert severity="error" sx={{ mt: 2 }}>{teamsError}</Alert>}
            {!rosterLoading && teamId && rosterPlayers.length === 0 && (
              <Alert severity="info" sx={{ mt: 2 }}>No players with recorded games for this team yet.</Alert>
            )}
          </CardContent>
        </Card>

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