import { Box, Grid, Card, CardContent, Typography, Button, Chip, Stack, Divider, List, ListItem, ListItemText, TextField, MenuItem, Alert, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress, Autocomplete } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/layout';
import { archiveMatch, createMatch, deleteMatch, duplicateMatch, getMatches, saveMatchRoster, setLiveMatchState, updateMatch } from '../services/matchService';
import { backendApi } from '../api/client';

function Games({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [seasonFilter, setSeasonFilter] = useState('All');
  const [leagueFilter, setLeagueFilter] = useState('All');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailMatch, setDetailMatch] = useState(null);
  const [editingMatchId, setEditingMatchId] = useState(null);
  const [form, setForm] = useState({ homeTeam: '', awayTeam: '', league: '', season: '', institution: '', venue: '', matchDate: '', tipOffTime: '', competitionStage: 'Regular Season', status: 'Scheduled', activeRoster: '', startingFive: '', benchPlayers: '', injuredPlayers: '', unavailablePlayers: '' });
  const [notice, setNotice] = useState('');
  const canManage = role === 'Statistician' || role === 'Team Manager';
  const canView = role === 'Statistician' || role === 'Team Manager' || role === 'Coach' || role === 'Athlete';

  // FR-02: real game records, backed by the actual `games` table --
  // separate from the mock "matches" CRUD below (matchService.js /
  // localStorage), which has no real backend equivalent for most of its
  // fields (roster, tip-off time, competition stage, institution). This
  // section covers what the real backend actually supports: teams,
  // date, venue, and (once a Score Sheet is uploaded) real outcome.
  const canCreateRealGame = role === 'Administrator' || role === 'Statistician' || role === 'Team Manager';
  const [realTeams, setRealTeams] = useState([]);
  const [realGames, setRealGames] = useState([]);
  const [realGamesLoading, setRealGamesLoading] = useState(true);
  const [realGamesError, setRealGamesError] = useState('');
  const [newGame, setNewGame] = useState({ homeTeamId: '', opponentTeamName: '', gameDate: '', venue: '' });
  const [creatingGame, setCreatingGame] = useState(false);
  const [createGameError, setCreateGameError] = useState('');

  const loadRealGames = () => {
    setRealGamesLoading(true);
    backendApi.getGames()
      .then(setRealGames)
      .catch((err) => setRealGamesError(err.message || 'Could not load games.'))
      .finally(() => setRealGamesLoading(false));
  };

  useEffect(() => {
    backendApi.getTeams().then(setRealTeams).catch(() => {});
    loadRealGames();
  }, []);

  const teamName = (id) => realTeams.find((t) => t.id === id)?.name || id;

  const handleCreateRealGame = async () => {
    if (!newGame.homeTeamId || !newGame.opponentTeamName.trim() || !newGame.gameDate) return;
    setCreatingGame(true);
    setCreateGameError('');
    try {
      await backendApi.createGame(newGame);
      setNewGame({ homeTeamId: '', opponentTeamName: '', gameDate: '', venue: '' });
      loadRealGames();
    } catch (err) {
      setCreateGameError(err.message || 'Could not create game.');
    } finally {
      setCreatingGame(false);
    }
  };


  useEffect(() => {
    setMatches(getMatches());
  }, []);

  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      const matchesSearch = `${match.homeTeam} ${match.awayTeam} ${match.league} ${match.season} ${match.status} ${match.matchDate}`.toLowerCase();
      const matchesText = search.toLowerCase();
      const matchesStatus = statusFilter === 'All' || match.status === statusFilter;
      const matchesSeason = seasonFilter === 'All' || match.season === seasonFilter;
      const matchesLeague = leagueFilter === 'All' || match.league === leagueFilter;
      return matchesSearch.includes(matchesText) && matchesStatus && matchesSeason && matchesLeague;
    });
  }, [matches, search, statusFilter, seasonFilter, leagueFilter]);

  const resetForm = () => {
    setForm({ homeTeam: '', awayTeam: '', league: '', season: '', institution: '', venue: '', matchDate: '', tipOffTime: '', competitionStage: 'Regular Season', status: 'Scheduled', activeRoster: '', startingFive: '', benchPlayers: '', injuredPlayers: '', unavailablePlayers: '' });
  };

  const createNewMatch = () => {
    if (!form.homeTeam || !form.awayTeam || !form.league || !form.season || !form.venue || !form.matchDate || !form.tipOffTime || form.homeTeam === form.awayTeam) {
      setNotice('Please complete all required match fields.');
      return;
    }
    const payload = {
      ...form,
      activeRoster: form.activeRoster,
      startingFive: form.startingFive,
      benchPlayers: form.benchPlayers,
      injuredPlayers: form.injuredPlayers,
      unavailablePlayers: form.unavailablePlayers,
    };
    if (editingMatchId) {
      const updatedMatches = updateMatch(editingMatchId, payload);
      setMatches(updatedMatches);
      setEditingMatchId(null);
      setNotice('Match updated and saved locally.');
    } else {
      createMatch(payload);
      setMatches(getMatches());
      setNotice('Match created and saved locally.');
    }
    resetForm();
    setDialogOpen(false);
  };

  const startMatch = (matchId) => {
    const updated = updateMatch(matchId, { status: 'Live' });
    setMatches(updated);
    setNotice('Match marked as live.');
  };

  const setArchived = (matchId) => {
    const updated = archiveMatch(matchId);
    setMatches(updated);
    setNotice('Match archived.');
  };

  const removeMatch = (matchId) => {
    const updated = deleteMatch(matchId);
    setMatches(updated);
    setNotice('Match deleted.');
  };

  const duplicate = (matchId) => {
    const duplicated = duplicateMatch(matchId);
    if (duplicated) {
      setMatches(getMatches());
      setNotice('Match duplicated.');
    }
  };

  const openEditDialog = (match) => {
    setEditingMatchId(match.id);
    setForm({
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      league: match.league,
      season: match.season,
      institution: match.institution,
      venue: match.venue,
      matchDate: match.matchDate,
      tipOffTime: match.tipOffTime,
      competitionStage: match.competitionStage,
      status: match.status,
      activeRoster: (match.activeRoster || []).join(', '),
      startingFive: (match.startingFive || []).join(', '),
      benchPlayers: (match.benchPlayers || []).join(', '),
      injuredPlayers: (match.injuredPlayers || []).join(', '),
      unavailablePlayers: (match.unavailablePlayers || []).join(', '),
    });
    setDialogOpen(true);
  };

  const viewDetails = (match) => {
    setDetailMatch(match);
  };

  const saveRoster = (matchId) => {
    const roster = [{ id: 'p1', name: 'Asha', startingFive: true, captain: true }, { id: 'p2', name: 'Mina', startingFive: true, captain: false }, { id: 'p3', name: 'Njeri', startingFive: true, captain: false }, { id: 'p4', name: 'Kip', startingFive: true, captain: false }, { id: 'p5', name: 'Juma', startingFive: true, captain: false }, { id: 'p6', name: 'Zuri', startingFive: false, captain: false }];
    saveMatchRoster(matchId, roster);
    setNotice('Roster saved for match.');
  };

  const toggleLiveState = (matchId, status) => {
    const current = matches.find((match) => match.id === matchId);
    if (!current) return;
    const liveState = {
      ...current.liveState,
      scoreboard: { home: current.liveState?.scoreboard?.home ?? 0, away: current.liveState?.scoreboard?.away ?? 0 },
      quarter: current.liveState?.quarter || 'Q1',
      gameClock: current.liveState?.gameClock || '10:00',
      possession: current.liveState?.possession || 'Home',
      teamFouls: { home: current.liveState?.teamFouls?.home || 0, away: current.liveState?.teamFouls?.away || 0 },
      timeouts: { home: current.liveState?.timeouts?.home || 0, away: current.liveState?.timeouts?.away || 0 },
      paused: status === 'Pause',
    };
    setLiveMatchState(matchId, liveState);
    updateMatch(matchId, { status: status === 'Pause' ? 'Live' : 'Live' });
    setMatches(getMatches());
    setNotice('Live state updated.');
  };

  const goToUpload = () => {
    navigate('/analysis-import');
  };

  const seasons = useMemo(() => Array.from(new Set(matches.map((match) => match.season).filter(Boolean))), [matches]);
  const leagues = useMemo(() => Array.from(new Set(matches.map((match) => match.league).filter(Boolean))), [matches]);

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={700}>Real game records</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Backed by the real backend — separate from the scheduling board below.
          </Typography>

          {canCreateRealGame && (
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={3}>
                <TextField select fullWidth label="Home team" value={newGame.homeTeamId}
                  onChange={(e) => setNewGame({ ...newGame, homeTeamId: e.target.value })}>
                  {realTeams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={3}>
                <Autocomplete
                  freeSolo
                  options={realTeams.map((t) => t.name)}
                  inputValue={newGame.opponentTeamName}
                  onInputChange={(e, value) => setNewGame({ ...newGame, opponentTeamName: value })}
                  renderInput={(params) => <TextField {...params} label="Opponent (type any name)" />}
                />
              </Grid>
              <Grid item xs={12} sm={2}>
                <TextField fullWidth type="date" label="Date" InputLabelProps={{ shrink: true }} value={newGame.gameDate}
                  onChange={(e) => setNewGame({ ...newGame, gameDate: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={2}>
                <TextField fullWidth label="Venue" value={newGame.venue}
                  onChange={(e) => setNewGame({ ...newGame, venue: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={2}>
                <Button fullWidth variant="contained" sx={{ height: '100%' }} disabled={creatingGame} onClick={handleCreateRealGame}>
                  {creatingGame ? 'Creating…' : 'Create game'}
                </Button>
              </Grid>
              {createGameError && <Grid item xs={12}><Alert severity="error">{createGameError}</Alert></Grid>}
            </Grid>
          )}

          {realGamesLoading ? <CircularProgress size={24} /> : realGamesError ? (
            <Alert severity="error">{realGamesError}</Alert>
          ) : (
            <List dense>
              {realGames.length === 0 && <Typography color="text.secondary">No real game records yet.</Typography>}
              {realGames.map((g) => (
                <ListItem key={g.id} divider>
                  <ListItemText
                    primary={`${teamName(g.home_team_id)} vs ${teamName(g.opponent_team_id)} — ${g.game_date}${g.venue ? ` @ ${g.venue}` : ''}`}
                    secondary={g.outcome ? `Final: ${g.outcome.scoreA} - ${g.outcome.scoreB} (winner: ${g.outcome.winningTeam})` : 'Outcome pending — no Score Sheet uploaded yet'}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <Button variant="contained" onClick={() => { resetForm(); setEditingMatchId(null); setDialogOpen(true); }} disabled={!canManage}>Create Match</Button>
        <Button variant="outlined" disabled title="Live in-game tracking is not built yet">View Live (Coming Soon)</Button>
        <Button variant="outlined" onClick={goToUpload} disabled={!canManage}>Upload Statistics</Button>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}><TextField fullWidth label="Search" value={search} onChange={(event) => setSearch(event.target.value)} /></Grid>
        <Grid item xs={12} md={3}><TextField select fullWidth label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><MenuItem value="All">All</MenuItem><MenuItem value="Scheduled">Scheduled</MenuItem><MenuItem value="Live">Live</MenuItem><MenuItem value="Completed">Completed</MenuItem><MenuItem value="Cancelled">Cancelled</MenuItem></TextField></Grid>
        <Grid item xs={12} md={3}><TextField select fullWidth label="Season" value={seasonFilter} onChange={(event) => setSeasonFilter(event.target.value)}><MenuItem value="All">All</MenuItem>{seasons.map((season) => <MenuItem key={season} value={season}>{season}</MenuItem>)}</TextField></Grid>
        <Grid item xs={12} md={3}><TextField select fullWidth label="League" value={leagueFilter} onChange={(event) => setLeagueFilter(event.target.value)}><MenuItem value="All">All</MenuItem>{leagues.map((league) => <MenuItem key={league} value={league}>{league}</MenuItem>)}</TextField></Grid>
      </Grid>

      {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={700}>Scheduled & Live Matches</Typography>
              <List>
                {filteredMatches.filter((match) => match.status !== 'Completed' && match.status !== 'Cancelled' && match.status !== 'Archived').map((match) => (
                  <Box key={match.id}>
                    <ListItem sx={{ px: 0, alignItems: 'flex-start' }}>
                      <ListItemText primary={`${match.homeTeam} vs ${match.awayTeam}`} secondary={`${match.league} • ${match.venue} • ${match.matchDate} ${match.tipOffTime}`} />
                      <Stack spacing={1}>
                        <Chip label={match.status} color={match.status === 'Live' ? 'primary' : 'default'} variant="outlined" />
                        <Stack direction="row" spacing={1}>
                          <Button size="small" variant="outlined" onClick={() => viewDetails(match)}>Details</Button>
                          {canManage && <Button size="small" variant="outlined" onClick={() => openEditDialog(match)}>Edit</Button>}
                          {canManage && <Button size="small" variant="outlined" onClick={() => saveRoster(match.id)}>Roster</Button>}
                          {canManage && <Button size="small" variant="outlined" onClick={() => startMatch(match.id)}>Start</Button>}
                          {canManage && <Button size="small" variant="outlined" onClick={() => duplicate(match.id)}>Copy</Button>}
                          {canManage && <Button size="small" variant="outlined" color="error" onClick={() => { if (window.confirm(`Delete ${match.homeTeam} vs ${match.awayTeam}? This cannot be undone.`)) removeMatch(match.id); }}>Delete</Button>}
                        </Stack>
                      </Stack>
                    </ListItem>
                    <Divider />
                  </Box>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={700}>Completed & Archived</Typography>
              <List>
                {filteredMatches.filter((match) => match.status === 'Completed' || match.status === 'Cancelled' || match.status === 'Archived').map((match) => (
                  <Box key={match.id}>
                    <ListItem sx={{ px: 0, alignItems: 'flex-start' }}>
                      <ListItemText primary={`${match.homeTeam} vs ${match.awayTeam}`} secondary={`${match.league} • ${match.status}`} />
                      <Stack spacing={1}>
                        <Chip label={match.status} color="success" variant="outlined" />
                        <Stack direction="row" spacing={1}>
                          {canManage && <Button size="small" variant="outlined" onClick={() => removeMatch(match.id)}>Delete</Button>}
                          {canManage && <Button size="small" variant="outlined" onClick={() => setArchived(match.id)}>Archive</Button>}
                        </Stack>
                      </Stack>
                    </ListItem>
                    <Divider />
                  </Box>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditingMatchId(null); resetForm(); }} maxWidth="md" fullWidth>
        <DialogTitle>{editingMatchId ? 'Edit Match' : 'Create Match'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}><TextField fullWidth label="Home Team" value={form.homeTeam} onChange={(event) => setForm((prev) => ({ ...prev, homeTeam: event.target.value }))} /></Grid>
            <Grid item xs={12} md={6}><TextField fullWidth label="Away Team" value={form.awayTeam} onChange={(event) => setForm((prev) => ({ ...prev, awayTeam: event.target.value }))} /></Grid>
            <Grid item xs={12} md={6}><TextField fullWidth label="League" value={form.league} onChange={(event) => setForm((prev) => ({ ...prev, league: event.target.value }))} /></Grid>
            <Grid item xs={12} md={6}><TextField fullWidth label="Season" value={form.season} onChange={(event) => setForm((prev) => ({ ...prev, season: event.target.value }))} /></Grid>
            <Grid item xs={12} md={6}><TextField fullWidth label="Institution" value={form.institution} onChange={(event) => setForm((prev) => ({ ...prev, institution: event.target.value }))} /></Grid>
            <Grid item xs={12} md={6}><TextField fullWidth label="Venue" value={form.venue} onChange={(event) => setForm((prev) => ({ ...prev, venue: event.target.value }))} /></Grid>
            <Grid item xs={12} md={6}><TextField fullWidth label="Match Date" value={form.matchDate} onChange={(event) => setForm((prev) => ({ ...prev, matchDate: event.target.value }))} /></Grid>
            <Grid item xs={12} md={6}><TextField fullWidth label="Tip-off Time" value={form.tipOffTime} onChange={(event) => setForm((prev) => ({ ...prev, tipOffTime: event.target.value }))} /></Grid>
            <Grid item xs={12}><TextField select fullWidth label="Competition Stage" value={form.competitionStage} onChange={(event) => setForm((prev) => ({ ...prev, competitionStage: event.target.value }))}><MenuItem value="Regular Season">Regular Season</MenuItem><MenuItem value="Quarterfinal">Quarterfinal</MenuItem><MenuItem value="Semifinal">Semifinal</MenuItem><MenuItem value="Final">Final</MenuItem></TextField></Grid>
            <Grid item xs={12} md={6}><TextField fullWidth label="Active Roster" value={form.activeRoster} onChange={(event) => setForm((prev) => ({ ...prev, activeRoster: event.target.value }))} /></Grid>
            <Grid item xs={12} md={6}><TextField fullWidth label="Starting Five" value={form.startingFive} onChange={(event) => setForm((prev) => ({ ...prev, startingFive: event.target.value }))} /></Grid>
            <Grid item xs={12} md={6}><TextField fullWidth label="Bench Players" value={form.benchPlayers} onChange={(event) => setForm((prev) => ({ ...prev, benchPlayers: event.target.value }))} /></Grid>
            <Grid item xs={12} md={6}><TextField fullWidth label="Injured Players" value={form.injuredPlayers} onChange={(event) => setForm((prev) => ({ ...prev, injuredPlayers: event.target.value }))} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Unavailable Players" value={form.unavailablePlayers} onChange={(event) => setForm((prev) => ({ ...prev, unavailablePlayers: event.target.value }))} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDialogOpen(false); setEditingMatchId(null); resetForm(); }}>Cancel</Button>
          <Button variant="contained" onClick={createNewMatch}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(detailMatch)} onClose={() => setDetailMatch(null)} maxWidth="md" fullWidth>
        <DialogTitle>Match Details</DialogTitle>
        <DialogContent>
          {detailMatch && <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Typography fontWeight={700}>{detailMatch.homeTeam} vs {detailMatch.awayTeam}</Typography>
            <Typography color="text.secondary">{detailMatch.league} • {detailMatch.season}</Typography>
            <Typography color="text.secondary">Venue: {detailMatch.venue}</Typography>
            <Typography color="text.secondary">Date: {detailMatch.matchDate} • {detailMatch.tipOffTime}</Typography>
            <Typography color="text.secondary">Stage: {detailMatch.competitionStage}</Typography>
            <Typography color="text.secondary">Status: {detailMatch.status}</Typography>
            <Typography fontWeight={600}>Preparation</Typography>
            <Typography color="text.secondary">Active roster: {(detailMatch.activeRoster || []).join(', ') || 'Not set'}</Typography>
            <Typography color="text.secondary">Starting five: {(detailMatch.startingFive || []).join(', ') || 'Not set'}</Typography>
            <Typography color="text.secondary">Bench: {(detailMatch.benchPlayers || []).join(', ') || 'Not set'}</Typography>
            <Typography color="text.secondary">Injured: {(detailMatch.injuredPlayers || []).join(', ') || 'Not set'}</Typography>
            <Typography color="text.secondary">Unavailable: {(detailMatch.unavailablePlayers || []).join(', ') || 'Not set'}</Typography>
            <Typography fontWeight={600}>Roster</Typography>
            {detailMatch.roster?.map((item) => <Typography key={item.id} color="text.secondary">{item.name} {item.startingFive ? '(Starting Five)' : ''}</Typography>)}
            <Typography fontWeight={600}>Live state</Typography>
            <Typography color="text.secondary">Quarter: {detailMatch.liveState?.quarter || 'Q1'} • Score {detailMatch.liveState?.scoreboard?.home || 0}-{detailMatch.liveState?.scoreboard?.away || 0}</Typography>
          </Stack>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailMatch(null)}>Close</Button>
          {canManage && <Button variant="contained" onClick={() => toggleLiveState(detailMatch.id, 'Pause')}>Pause</Button>}
          {canManage && <Button variant="outlined" onClick={() => startMatch(detailMatch.id)}>Start</Button>}
        </DialogActions>
      </Dialog>
    </Layout>
  );
}

export default Games;
