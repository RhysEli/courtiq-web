import {
  Box, Grid, Card, CardContent, Typography, TextField, MenuItem, Table, TableBody,
  TableCell, TableHead, TableRow, Stack, CircularProgress, Alert,
} from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout';
import { backendApi } from '../api/client';

// REBUILT to use real data (FR-06 Season Dashboard). The previous version
// read from src/data/mockData.js -- fabricated players, a hardcoded 58/42
// offense/defense split, entirely disconnected from any real game. This
// version calls the real backend (/api/teams, /api/teams/:id/season-stats),
// the same endpoint Opponent Analysis already uses, which computes season
// averages directly from actual extracted player_game_stats rows. A team
// with zero real games shows "No games recorded yet", never a fabricated
// number.
//
// Known limitation: the games table has no stored score/outcome field, so
// win/loss progression and per-game trend lines aren't available from this
// endpoint -- what's shown here is real season-aggregate team and player
// averages, computed from real extracted stats.

const emptyStats = {
  gamesPlayed: 0, ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, topg: 0,
  fgPct: 0, threePct: 0, ftPct: 0,
};

function Statistics({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState('');

  const [teamId, setTeamId] = useState('');
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setTeamsLoading(true);
    backendApi.getTeams()
      .then((data) => {
        if (cancelled) return;
        setTeams(data);
        // Best-effort default: match the app-wide selectedTeam by name if
        // possible, otherwise just pick the first real team. selectedTeam
        // is a legacy UI-only identifier and won't always match a real
        // team id, so this is a convenience default, not a hard link.
        const guess = data.find((t) => t.name?.toLowerCase().includes(String(selectedTeam || '').toLowerCase().replace(/-/g, ' ')));
        setTeamId(guess?.id || data[0]?.id || '');
      })
      .catch((err) => { if (!cancelled) setTeamsError(err.message || 'Could not load teams.'); })
      .finally(() => { if (!cancelled) setTeamsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const team = stats?.team || emptyStats;
  const players = stats?.players || [];

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

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Team</Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={4}>
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
              </Grid>
            </Grid>
            {teamsError && <Alert severity="error" sx={{ mt: 2 }}>{teamsError}</Alert>}
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
            <Typography color="text.secondary">
              Season averages across {team.gamesPlayed} real recorded game{team.gamesPlayed === 1 ? '' : 's'}.
            </Typography>

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