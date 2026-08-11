import {
  Box,
  Typography,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Card,
  CardContent,
  Divider,
  Chip,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
} from "@mui/material";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import SportsBasketballIcon from "@mui/icons-material/SportsBasketball";
import { useEffect, useState } from "react";
import Layout from "../components/layout";
import { backendApi } from "../api/client";

// REBUILT to use real data. The previous version read from a
// localStorage key ("courtiq_matches") that nothing in the app ever
// wrote to, and fabricated stats with Math.random() whenever a real
// field was missing -- which was always, since the expected data shape
// was never populated. This version calls the real backend
// (/api/teams, /api/teams/:id/season-stats), which computes season
// averages directly from actual extracted player_game_stats rows. A
// team or player with zero real games shows "No games recorded yet",
// never a fabricated number.

const emptyStats = {
  gamesPlayed: 0, ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, topg: 0,
  fgPct: 0, threePct: 0, ftPct: 0,
};

export default function OpponentAnalysis({ mode, toggleTheme, selectedTeam, onTeamChange, selectedSeason, role, logout }) {
  const [tab, setTab] = useState(0); // 0 = Team vs Team, 1 = Player vs Player

  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState("");

  // Team vs Team state
  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");
  const [statsA, setStatsA] = useState(null);
  const [statsB, setStatsB] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState("");

  // Player vs Player state -- players are drawn from whichever team(s)
  // are selected above, since player_game_stats rows are only real for
  // players who have actually appeared in that team's extracted games.
  const [playerTeamAId, setPlayerTeamAId] = useState("");
  const [playerTeamBId, setPlayerTeamBId] = useState("");
  const [playersA, setPlayersA] = useState([]);
  const [playersB, setPlayersB] = useState([]);
  const [playerAName, setPlayerAName] = useState("");
  const [playerBName, setPlayerBName] = useState("");
  const [playerStatsA, setPlayerStatsA] = useState(null);
  const [playerStatsB, setPlayerStatsB] = useState(null);
  const [playerLoadError, setPlayerLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setTeamsLoading(true);
    backendApi.getTeams()
      .then((data) => { if (!cancelled) setTeams(data); })
      .catch((err) => { if (!cancelled) setTeamsError(err.message || "Could not load teams."); })
      .finally(() => { if (!cancelled) setTeamsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const teamName = (id) => teams.find((t) => t.id === id)?.name || id;

  async function compareTeams() {
    if (!teamAId || !teamBId) return;
    setComparing(true);
    setCompareError("");
    try {
      const [a, b] = await Promise.all([
        backendApi.getTeamSeasonStats(teamAId),
        backendApi.getTeamSeasonStats(teamBId),
      ]);
      setStatsA(a.team || emptyStats);
      setStatsB(b.team || emptyStats);
    } catch (err) {
      setCompareError(err.message || "Could not load season stats for one or both teams.");
    } finally {
      setComparing(false);
    }
  }

  async function loadPlayersForTeam(teamId, setPlayers) {
    if (!teamId) { setPlayers([]); return; }
    try {
      const data = await backendApi.getTeamSeasonStats(teamId);
      setPlayers(data.players || []);
    } catch (err) {
      setPlayerLoadError(err.message || "Could not load players for this team.");
      setPlayers([]);
    }
  }

  useEffect(() => { loadPlayersForTeam(playerTeamAId, setPlayersA); setPlayerAName(""); setPlayerStatsA(null); }, [playerTeamAId]);
  useEffect(() => { loadPlayersForTeam(playerTeamBId, setPlayersB); setPlayerBName(""); setPlayerStatsB(null); }, [playerTeamBId]);

  function comparePlayers() {
    setPlayerStatsA(playersA.find((p) => p.playerName === playerAName) || null);
    setPlayerStatsB(playersB.find((p) => p.playerName === playerBName) || null);
  }

  function strengths(s) {
    const out = [];
    if (s.ppg > 80) out.push("High Scoring");
    if (s.threePct > 36) out.push("Excellent 3PT Shooting");
    if (s.apg > 18) out.push("Strong Ball Movement");
    if (s.rpg > 38) out.push("Dominant Rebounding");
    if (s.spg > 8) out.push("Disruptive Defense");
    return out.length ? out : (s.gamesPlayed ? ["Balanced Team"] : []);
  }
  function weaknesses(s) {
    const out = [];
    if (s.topg > 14) out.push("High Turnovers");
    if (s.apg < 12) out.push("Poor Ball Movement");
    if (s.rpg < 30) out.push("Weak Rebounding");
    if (s.ftPct < 65) out.push("Inconsistent Free Throw Shooting");
    return out.length ? out : (s.gamesPlayed ? ["No obvious weakness"] : []);
  }
  function improvements(s) {
    const out = [];
    if (s.topg > 12) out.push("Reduce turnovers.");
    if (s.rpg < 35) out.push("Improve rebounding.");
    if (s.threePct < 33) out.push("Improve perimeter shooting.");
    if (s.ftPct < 70) out.push("Improve free throw consistency.");
    return out.length ? out : (s.gamesPlayed ? ["Maintain current performance."] : []);
  }

  function renderTeamCard(label, s) {
    if (!s) return null;
    if (!s.gamesPlayed) {
      return (
        <Card sx={{ height: "100%" }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>{label}</Typography>
            <Divider sx={{ mb: 2 }} />
            <Typography color="text.secondary">No games recorded yet for this team.</Typography>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card sx={{ height: "100%" }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>{label}</Typography>
          <Typography variant="caption" color="text.secondary">{s.gamesPlayed} game{s.gamesPlayed === 1 ? "" : "s"} recorded</Typography>
          <Divider sx={{ my: 2 }} />
          <Typography>PPG: {s.ppg}</Typography>
          <Typography>RPG: {s.rpg}</Typography>
          <Typography>APG: {s.apg}</Typography>
          <Typography>SPG: {s.spg}</Typography>
          <Typography>BPG: {s.bpg}</Typography>
          <Typography>TOPG: {s.topg}</Typography>
          <Typography>FG%: {s.fgPct}%</Typography>
          <Typography>3PT%: {s.threePct}%</Typography>
          <Typography>FT%: {s.ftPct}%</Typography>
          <Divider sx={{ my: 2 }} />
          <Typography fontWeight="bold">Strengths</Typography>
          {strengths(s).map((x) => <Chip key={x} label={x} color="success" sx={{ mr: 1, mt: 1 }} />)}
          <Divider sx={{ my: 2 }} />
          <Typography fontWeight="bold">Weaknesses</Typography>
          {weaknesses(s).map((x) => <Chip key={x} label={x} color="warning" sx={{ mr: 1, mt: 1 }} />)}
          <Divider sx={{ my: 2 }} />
          <Typography fontWeight="bold">Areas to Improve</Typography>
          {improvements(s).map((x) => <Typography key={x} sx={{ mt: 1 }}>• {x}</Typography>)}
        </CardContent>
      </Card>
    );
  }

  function renderPlayerCard(label, s) {
    if (!s) return (
      <Card sx={{ height: "100%" }}><CardContent>
        <Typography variant="h6" gutterBottom>{label}</Typography>
        <Divider sx={{ mb: 2 }} />
        <Typography color="text.secondary">Select a player to compare.</Typography>
      </CardContent></Card>
    );
    return (
      <Card sx={{ height: "100%" }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>{s.playerName}</Typography>
          <Typography variant="caption" color="text.secondary">{s.gamesPlayed} game{s.gamesPlayed === 1 ? "" : "s"} recorded</Typography>
          <Divider sx={{ my: 2 }} />
          <Typography>PPG: {s.ppg}</Typography>
          <Typography>RPG: {s.rpg}</Typography>
          <Typography>APG: {s.apg}</Typography>
          <Typography>SPG: {s.spg}</Typography>
          <Typography>BPG: {s.bpg}</Typography>
          <Typography>TOPG: {s.topg}</Typography>
          <Typography>FG%: {s.fgPct}%</Typography>
          <Typography>3PT%: {s.threePct}%</Typography>
          <Typography>FT%: {s.ftPct}%</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box p={3}>
        <Typography variant="h4" fontWeight="bold" gutterBottom>Opponent Analysis</Typography>
        <Typography color="text.secondary" mb={3}>
          Compare any two teams, or any two players, using real season-average statistics computed from uploaded game reports.
        </Typography>

        {teamsError && <Alert severity="error" sx={{ mb: 2 }}>{teamsError}</Alert>}
        {!teamsLoading && teams.length === 0 && !teamsError && (
          <Alert severity="info" sx={{ mb: 2 }}>
            No teams with recorded games yet. Import a game via Bulk Import or Reports first.
          </Alert>
        )}

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
          <Tab label="Team vs Team" />
          <Tab label="Player vs Player" />
        </Tabs>

        {tab === 0 && (
          <>
            <Paper sx={{ p: 3, mb: 3 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={5}>
                  <FormControl fullWidth disabled={teamsLoading}>
                    <InputLabel>Team A</InputLabel>
                    <Select value={teamAId} label="Team A" onChange={(e) => setTeamAId(e.target.value)}>
                      {teams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={2} textAlign="center">
                  <CompareArrowsIcon sx={{ mt: 1, fontSize: 40 }} />
                </Grid>
                <Grid item xs={12} md={5}>
                  <FormControl fullWidth disabled={teamsLoading}>
                    <InputLabel>Team B</InputLabel>
                    <Select value={teamBId} label="Team B" onChange={(e) => setTeamBId(e.target.value)}>
                      {teams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <Button
                    startIcon={comparing ? <CircularProgress size={18} /> : <SportsBasketballIcon />}
                    variant="contained"
                    onClick={compareTeams}
                    disabled={!teamAId || !teamBId || comparing}
                  >
                    Compare Teams
                  </Button>
                </Grid>
              </Grid>
              {compareError && <Alert severity="error" sx={{ mt: 2 }}>{compareError}</Alert>}
            </Paper>

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>{renderTeamCard(teamAId ? teamName(teamAId) : "Select Team", statsA)}</Grid>
              <Grid item xs={12} md={6}>{renderTeamCard(teamBId ? teamName(teamBId) : "Select Team", statsB)}</Grid>
            </Grid>
          </>
        )}

        {tab === 1 && (
          <>
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Pick a team on each side, then a player from that team's real recorded games. Works for two players on the
                same team (e.g. comparing two guards) or two players on different teams.
              </Typography>
              {playerLoadError && <Alert severity="error" sx={{ mb: 2 }}>{playerLoadError}</Alert>}
              <Grid container spacing={2}>
                <Grid item xs={12} md={5}>
                  <FormControl fullWidth sx={{ mb: 2 }} disabled={teamsLoading}>
                    <InputLabel>Team (Player A)</InputLabel>
                    <Select value={playerTeamAId} label="Team (Player A)" onChange={(e) => setPlayerTeamAId(e.target.value)}>
                      {teams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <FormControl fullWidth disabled={!playerTeamAId}>
                    <InputLabel>Player A</InputLabel>
                    <Select value={playerAName} label="Player A" onChange={(e) => setPlayerAName(e.target.value)}>
                      {playersA.map((p) => <MenuItem key={p.playerName} value={p.playerName}>{p.playerName}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={2} textAlign="center">
                  <CompareArrowsIcon sx={{ mt: 1, fontSize: 40 }} />
                </Grid>
                <Grid item xs={12} md={5}>
                  <FormControl fullWidth sx={{ mb: 2 }} disabled={teamsLoading}>
                    <InputLabel>Team (Player B)</InputLabel>
                    <Select value={playerTeamBId} label="Team (Player B)" onChange={(e) => setPlayerTeamBId(e.target.value)}>
                      {teams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <FormControl fullWidth disabled={!playerTeamBId}>
                    <InputLabel>Player B</InputLabel>
                    <Select value={playerBName} label="Player B" onChange={(e) => setPlayerBName(e.target.value)}>
                      {playersB.map((p) => <MenuItem key={p.playerName} value={p.playerName}>{p.playerName}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <Button
                    startIcon={<SportsBasketballIcon />}
                    variant="contained"
                    onClick={comparePlayers}
                    disabled={!playerAName || !playerBName}
                  >
                    Compare Players
                  </Button>
                </Grid>
              </Grid>
            </Paper>

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>{renderPlayerCard("Player A", playerStatsA)}</Grid>
              <Grid item xs={12} md={6}>{renderPlayerCard("Player B", playerStatsB)}</Grid>
            </Grid>
          </>
        )}
      </Box>
    </Layout>
  );
}