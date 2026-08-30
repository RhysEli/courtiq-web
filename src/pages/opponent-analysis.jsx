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

export default function OpponentAnalysis({ mode, toggleTheme, selectedTeam, onTeamChange, selectedSeason, role, logout }) {
  // Step 47 Phase 1: the old "Team vs Team" tab (independent season
  // averages for any two teams) is removed -- confirmed via Step 46 to
  // silently compare our full season against whatever sliver of data
  // exists for the other team, which for every real opponent in this
  // system today is just their head-to-head game(s) against us, since
  // nobody else's independent season is tracked. Head-to-Head (below) is
  // the correctly-scoped replacement -- both sides' stats are filtered to
  // real shared games only, before aggregating either side -- and is now
  // the sole way to compare our team against a specific opponent, and the
  // default tab.
  const [tab, setTab] = useState(0); // 0 = Head-to-Head History, 1 = Player vs Player

  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState("");

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

  // Head-to-Head History state (FR-07 Phase 1/2) -- the real shared
  // history: only games the two selected teams actually played against
  // each other, resolved through Step 14's identity-grouping layer
  // server-side so a grouped duplicate opponent id is counted once, not
  // treated as a separate opponent.
  const [h2hTeamId, setH2hTeamId] = useState("");
  const [h2hOpponentId, setH2hOpponentId] = useState("");
  const [h2hData, setH2hData] = useState(null);
  const [h2hLoading, setH2hLoading] = useState(false);
  const [h2hError, setH2hError] = useState("");

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

  async function loadHeadToHead() {
    if (!h2hTeamId || !h2hOpponentId) return;
    setH2hLoading(true);
    setH2hError("");
    setH2hData(null);
    try {
      const data = await backendApi.getOpponentHistory(h2hTeamId, h2hOpponentId);
      setH2hData(data);
    } catch (err) {
      setH2hError(err.message || "Could not load head-to-head history.");
    } finally {
      setH2hLoading(false);
    }
  }

  // Groups an already chronologically-sorted encounters array by stage
  // name, preserving first-appearance order. This is a labeling/grouping
  // operation on discrete encounters, not a cumulative "through stage N"
  // rollup -- it doesn't depend on stages having a reliable chronological
  // sequence field (they don't; see stages' schema), since each encounter
  // already carries its own real game_date and is just being bucketed by
  // whichever stage tag it already has.
  function groupByStage(encounters) {
    const groups = [];
    const byName = new Map();
    for (const e of encounters) {
      const key = e.stageName || "No stage assigned";
      if (!byName.has(key)) {
        const group = { stageName: key, encounters: [] };
        byName.set(key, group);
        groups.push(group);
      }
      byName.get(key).encounters.push(e);
    }
    return groups;
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
          Look up real head-to-head history between your team and a specific opponent -- scoped to only the real
          games actually played between them -- or compare two individual players' season averages.
        </Typography>

        {teamsError && <Alert severity="error" sx={{ mb: 2 }}>{teamsError}</Alert>}
        {!teamsLoading && teams.length === 0 && !teamsError && (
          <Alert severity="info" sx={{ mb: 2 }}>
            No teams with recorded games yet. Import a game via Bulk Import or Reports first.
          </Alert>
        )}

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
          <Tab label="Head-to-Head History" />
          <Tab label="Player vs Player" />
        </Tabs>

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

        {tab === 0 && (
          <>
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Shows the real games actually played between the two selected teams, both sides' stats scoped to
                only those shared games, aggregated across every recorded meeting.
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={5}>
                  <FormControl fullWidth disabled={teamsLoading}>
                    <InputLabel>My Team</InputLabel>
                    <Select value={h2hTeamId} label="My Team" onChange={(e) => setH2hTeamId(e.target.value)}>
                      {teams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={2} textAlign="center">
                  <CompareArrowsIcon sx={{ mt: 1, fontSize: 40 }} />
                </Grid>
                <Grid item xs={12} md={5}>
                  <FormControl fullWidth disabled={teamsLoading}>
                    <InputLabel>Opponent</InputLabel>
                    <Select value={h2hOpponentId} label="Opponent" onChange={(e) => setH2hOpponentId(e.target.value)}>
                      {teams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <Button
                    startIcon={h2hLoading ? <CircularProgress size={18} /> : <SportsBasketballIcon />}
                    variant="contained"
                    onClick={loadHeadToHead}
                    disabled={!h2hTeamId || !h2hOpponentId || h2hTeamId === h2hOpponentId || h2hLoading}
                  >
                    Load Head-to-Head History
                  </Button>
                </Grid>
              </Grid>
              {h2hError && <Alert severity="error" sx={{ mt: 2 }}>{h2hError}</Alert>}
            </Paper>

            {h2hData && h2hData.encounters.length === 0 && (
              <Alert severity="info" sx={{ mb: 3 }}>
                {teamName(h2hTeamId)} and {teamName(h2hOpponentId)} have no recorded games against each other yet.
              </Alert>
            )}

            {h2hData && h2hData.encounters.length > 0 && (
              <>
                {h2hData.encounters.length === 1 && (
                  <Alert severity="info" sx={{ mb: 3 }}>
                    Only one meeting recorded so far between these teams -- not enough history yet for a meaningful trend.
                  </Alert>
                )}

                <Grid container spacing={3} sx={{ mb: 3 }}>
                  <Grid item xs={12} md={6}>
                    {renderTeamCard(
                      `${teamName(h2hTeamId)} (vs ${teamName(h2hOpponentId)}, ${h2hData.aggregate.encounters} meeting${h2hData.aggregate.encounters === 1 ? "" : "s"})`,
                      h2hData.aggregate.mine,
                    )}
                  </Grid>
                  <Grid item xs={12} md={6}>
                    {renderTeamCard(
                      `${teamName(h2hOpponentId)} (vs ${teamName(h2hTeamId)}, ${h2hData.aggregate.encounters} meeting${h2hData.aggregate.encounters === 1 ? "" : "s"})`,
                      h2hData.aggregate.opponent,
                    )}
                  </Grid>
                </Grid>

                {h2hData.tagFrequency.length > 0 && (
                  <Paper sx={{ p: 3, mb: 3 }}>
                    <Typography variant="h6" gutterBottom>Recurring Patterns</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      How often each already-computed per-game insight tag has recurred across these two teams'
                      shared games -- a frequency count, not a new pattern-detection algorithm.
                    </Typography>
                    {h2hData.tagFrequency.map((t) => (
                      <Chip
                        key={`${t.tag}-${t.team}`}
                        label={`${t.tag} (${t.team === "mine" ? teamName(h2hTeamId) : teamName(h2hOpponentId)}) × ${t.count}`}
                        color={t.team === "mine" ? "primary" : "default"}
                        sx={{ mr: 1, mb: 1 }}
                      />
                    ))}
                  </Paper>
                )}

                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>Meeting by Meeting</Typography>
                  {groupByStage(h2hData.encounters).map((group) => (
                    <Box key={group.stageName} sx={{ mb: 3 }}>
                      <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>{group.stageName}</Typography>
                      {group.encounters.map((e) => (
                        <Box
                          key={e.gameId}
                          sx={{
                            display: "flex", flexWrap: "wrap", justifyContent: "space-between",
                            alignItems: "center", py: 1, borderBottom: "1px solid", borderColor: "divider", gap: 1,
                          }}
                        >
                          <Typography variant="body2" color="text.secondary" sx={{ minWidth: 110 }}>{e.gameDate}</Typography>
                          <Typography fontWeight="bold">{e.myStats.ppg} - {e.opponentStats.ppg}</Typography>
                          <Box>
                            {e.tags.length === 0 && <Typography variant="caption" color="text.secondary">No tags recorded</Typography>}
                            {e.tags.map((t, i) => (
                              <Chip
                                key={`${e.gameId}-${t.tag}-${t.team}-${i}`}
                                size="small"
                                label={t.team === "opponent" ? `${t.tag} (them)` : t.tag}
                                sx={{ mr: 0.5, mb: 0.5 }}
                              />
                            ))}
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  ))}
                </Paper>
              </>
            )}
          </>
        )}
      </Box>
    </Layout>
  );
}