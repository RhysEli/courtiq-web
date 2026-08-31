import {
  Box, Grid, Card, CardContent, Typography, TextField, MenuItem, Table, TableBody,
  TableCell, TableHead, TableRow, Stack, CircularProgress, Alert, Button, Link,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import SportsBasketballIcon from '@mui/icons-material/SportsBasketball';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import Layout from '../components/layout';
import { backendApi } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

// Step 55: merges the 3 previously-separate routes (statistics.jsx,
// analysis.jsx, player-development.jsx) into one continuous page/flow, per
// Rhys's decision: team+season selection at the top feeds a real game
// picker for that team, picking a game loads that game's full Analysis
// inline further down, and Player Development sits below that -- one
// scrollable page, not three routes to navigate between. This file is a
// NEW combined component (not statistics.jsx renamed) so each section's
// original file stays a clean historical reference, but every section
// below is a straight carry-over of that section's own real logic --
// nothing about what each section computes or how it calls the backend
// was rewritten. The only real behavioral change (not just wiring) is
// deliberate and required by the merge itself: the Analysis section's
// game picker, which previously listed EVERY game in the system, is now
// scoped to just the selected team's games (reusing this page's own
// already-team-scoped `teamGames`, the same list Win/Loss Progression
// already computes) -- "a real game picker for that team/season", per
// the brief. Team/game pickers that were previously separate and
// independent on 3 different pages are now genuinely shared state.

const emptySeasonStats = {
  gamesPlayed: 0, ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, topg: 0,
  fgPct: 0, threePct: 0, ftPct: 0,
};

function TeamInsights({ mode, toggleTheme, role, selectedSeason, logout, currentUser }) {
  const { activeTeam } = useAuth();

  // ---- Shared, page-level state -------------------------------------
  // One real team picker for the whole page (previously statistics.jsx
  // and player-development.jsx each had their own independent copy of
  // this exact same teams/teamId fetch+state; analysis.jsx separately
  // fetched `teams` too, just to resolve opponent names for its game
  // labels). Consolidated into one real fetch, reused everywhere below.
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState('');
  const [teamId, setTeamId] = useState('');
  const isAthlete = role === 'Athlete';

  useEffect(() => {
    let cancelled = false;
    setTeamsLoading(true);
    backendApi.getTeams()
      .then((data) => {
        if (cancelled) return;
        setTeams(data);
        const guess = data.find((t) => t.id === activeTeam?.id);
        setTeamId(guess?.id || data[0]?.id || '');
      })
      .catch((err) => { if (!cancelled) setTeamsError(err.message || 'Could not load teams.'); })
      .finally(() => { if (!cancelled) setTeamsLoading(false); });
    return () => { cancelled = true; };
  }, [activeTeam?.id]);

  // =====================================================================
  // SECTION 1: Statistics (season averages, win/loss, team shot zones)
  // -- straight carry-over of statistics.jsx's own real logic, just
  // reading the shared teamId above instead of its own copy.
  // =====================================================================
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');

  // Renamed from statistics.jsx's own `shotZones` -> `teamShotZones`
  // purely to avoid colliding with the Analysis section's own
  // single-game `shotZones` state further down this same file -- same
  // real data/endpoint, no logic change.
  const [teamShotZones, setTeamShotZones] = useState(null);
  const [teamShotZonesLoading, setTeamShotZonesLoading] = useState(false);
  const [teamShotZonesError, setTeamShotZonesError] = useState('');

  // Real games list -- reused for BOTH Win/Loss Progression below AND
  // the Analysis section's game picker further down (see this file's
  // header comment: the game picker is now deliberately team-scoped,
  // and `teamGames` below is exactly the real scoping logic that already
  // existed here for Win/Loss Progression, just reused a second time
  // rather than re-fetched/re-filtered independently).
  const [games, setGames] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesError, setGamesError] = useState('');

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
    if (!teamId) { setTeamShotZones(null); return undefined; }
    let cancelled = false;
    setTeamShotZonesLoading(true);
    setTeamShotZonesError('');
    backendApi.getTeamShotZones(teamId)
      .then((data) => { if (!cancelled) setTeamShotZones(data); })
      .catch((err) => { if (!cancelled) setTeamShotZonesError(err.message || 'Could not load shot selection zones.'); })
      .finally(() => { if (!cancelled) setTeamShotZonesLoading(false); });
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

  const team = stats?.team || emptySeasonStats;
  const players = stats?.players || [];

  const teamGames = useMemo(() => games
    .filter((g) => g.home_team_id === teamId || g.opponent_team_id === teamId)
    .slice()
    .sort((a, b) => (a.game_date < b.game_date ? -1 : a.game_date > b.game_date ? 1 : 0)), [games, teamId]);

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

  // Renamed from statistics.jsx's own `exportPdf` -> `exportSeasonPdf`
  // purely to avoid colliding with the Analysis/Player Development
  // sections' own PDF exports further down -- identical logic.
  const exportSeasonPdf = () => {
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

  // =====================================================================
  // SECTION 2: game picker (new, minimal) -- feeds the Analysis section
  // below. Reuses `teamGames` above (already team-scoped) rather than a
  // second independent fetch/filter.
  // =====================================================================
  const [selectedGameId, setSelectedGameId] = useState('');

  // Reset the selected game whenever the selected team changes, so
  // Analysis below doesn't keep showing a game from the PREVIOUS team.
  useEffect(() => {
    setSelectedGameId('');
  }, [teamId]);

  // Adapted from analysis.jsx's own real gameLabel(): the reference team
  // for "which side is ours" is now this page's explicit, shared teamId
  // (the team selected at the top of the page) rather than the logged-in
  // user's own activeTeam -- necessary since the whole page, including a
  // multi-team Statistician's choice of which team to look at, is now
  // driven by that top picker. Same real "vs {opponent} — {date} — W/L
  // {scoreA}-{scoreB}" format, unchanged.
  function gameLabel(g) {
    if (!teamId) return `Game #${g.id} — ${g.game_date || 'no date'}`;
    const opponentId = g.home_team_id === teamId ? g.opponent_team_id : g.home_team_id;
    const opponentName = teams.find((t) => t.id === opponentId)?.name || opponentId;
    let resultLabel = 'Outcome pending';
    if (g.outcome) {
      if (g.outcome.winningTeamId === teamId) resultLabel = `W ${g.outcome.scoreA}-${g.outcome.scoreB}`;
      else if (g.outcome.winningTeamId) resultLabel = `L ${g.outcome.scoreA}-${g.outcome.scoreB}`;
      else resultLabel = 'Outcome unclear';
    }
    return `vs ${opponentName} — ${g.game_date || 'no date'} — ${resultLabel}`;
  }

  // =====================================================================
  // SECTION 3: Analysis (single selected game) -- straight carry-over of
  // analysis.jsx's own real logic. Its own independent `teams`/`games`
  // fetches were dropped (this page already has both, shared above);
  // everything else -- every generation route, every data shape -- is
  // untouched.
  // =====================================================================
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [noteError, setNoteError] = useState('');

  const [realAnalysis, setRealAnalysis] = useState(null);
  const [realAnalysisLoading, setRealAnalysisLoading] = useState(false);
  const [realAnalysisError, setRealAnalysisError] = useState('');

  const [shotZones, setShotZones] = useState(null);
  const [shotZonesLoading, setShotZonesLoading] = useState(false);
  const [shotZonesError, setShotZonesError] = useState('');

  const [reportData, setReportData] = useState(null);
  const [reportDataLoading, setReportDataLoading] = useState(false);
  const [reportDataError, setReportDataError] = useState('');

  const [gameFlow, setGameFlow] = useState(null);
  const [gameFlowLoading, setGameFlowLoading] = useState(false);
  const [gameFlowError, setGameFlowError] = useState('');
  const [coachingVerdict, setCoachingVerdict] = useState(null);
  const [coachingVerdictLoading, setCoachingVerdictLoading] = useState(false);
  const [coachingVerdictError, setCoachingVerdictError] = useState('');

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

  useEffect(() => {
    setGameFlow(null); setGameFlowError('');
    setCoachingVerdict(null); setCoachingVerdictError('');
  }, [selectedGameId]);

  function formatLineupPlayers(playersList) {
    return (playersList || []).map((p) => `${p.surname}${p.initial ? ` ${p.initial}.` : ''}`).join(', ');
  }

  function clockToSeconds(mmss) {
    if (!mmss) return 0;
    const [m, s] = mmss.split(':').map(Number);
    return (m || 0) * 60 + (s || 0);
  }

  function groupByTeamSide(rows) {
    const groups = {};
    for (const r of rows || []) {
      if (!groups[r.team_side]) groups[r.team_side] = { teamSide: r.team_side, teamName: r.team_name, rows: [] };
      groups[r.team_side].rows.push(r);
    }
    return Object.values(groups);
  }

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

  const gamePct = (made, att) => (att > 0 ? Number(((made / att) * 100).toFixed(1)) : 0);
  const homeRaw = realAnalysis?.metrics?.home?.raw;
  const matchSummary = homeRaw ? {
    points: homeRaw.points,
    fgPct: gamePct(homeRaw.fgm, homeRaw.fga),
    threePtPct: gamePct(homeRaw.three_pm, homeRaw.three_pa),
    ftPct: gamePct(homeRaw.ftm, homeRaw.fta),
    rebounds: homeRaw.reb,
    assists: homeRaw.assists,
  } : null;
  const realNarrative = realAnalysis?.narrative || null;
  const verdictSections = coachingVerdict ? parseCoachingVerdict(coachingVerdict) : [];

  const selectedGame = teamGames.find((g) => g.id === selectedGameId);

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

  const generateCoachingVerdictText = async () => {
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

  // =====================================================================
  // SECTION 4: Player Development -- straight carry-over of
  // player-development.jsx's own real logic. Its own independent
  // team picker/fetch was dropped (reads the shared teamId above
  // instead); the player picker (which player on this team) and
  // everything below it is untouched.
  // =====================================================================
  const [rosterPlayers, setRosterPlayers] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [playerId, setPlayerId] = useState('');

  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

  const [playerNotes, setPlayerNotes] = useState([]);
  const [playerNotesLoading, setPlayerNotesLoading] = useState(false);
  const [playerNoteText, setPlayerNoteText] = useState('');
  const [submittingPlayerNote, setSubmittingPlayerNote] = useState(false);
  const [playerNoteError, setPlayerNoteError] = useState('');

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
        setPlayerId(isAthlete ? (currentUser?.playerId || '') : (roster[0]?.playerId || ''));
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

  const athleteUnlinked = isAthlete && !currentUser?.playerId;

  const career = profile?.career;
  const seasons = profile?.seasons || [];

  const trendData = useMemo(() => seasons.map((s) => ({
    season: s.seasonName,
    PPG: s.ppg,
    RPG: s.rpg,
    APG: s.apg,
  })), [seasons]);

  // Renamed from player-development.jsx's own `exportPdf` -> `exportPlayerPdf`
  // purely to avoid colliding with the other two sections' PDF exports.
  const exportPlayerPdf = () => {
    const doc = new jsPDF();
    let y = 18;

    doc.setFontSize(16);
    doc.text(`CourtIQ Player Development Profile — ${profile?.playerName || 'Player'}`, 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.text(`Generated ${new Date().toLocaleString()} • ${career.gamesPlayed} real recorded game(s)`, 14, y);
    y += 10;

    doc.setFontSize(12);
    doc.text('Career-cumulative averages', 14, y);
    y += 6;
    doc.setFontSize(10);
    [
      ['GP', career.gamesPlayed], ['PPG', career.ppg], ['RPG', career.rpg],
      ['APG', career.apg], ['SPG', career.spg], ['BPG', career.bpg], ['TOPG', career.topg],
      ['FG%', `${career.fgPct}%`], ['3P%', `${career.threePct}%`], ['FT%', `${career.ftPct}%`],
    ].forEach(([label, value]) => {
      doc.text(`${label}: ${value}`, 14, y);
      y += 6;
    });

    y += 4;
    doc.setFontSize(12);
    doc.text('Per-season breakdown', 14, y);
    y += 8;
    doc.setFontSize(9);
    doc.text('Season', 14, y);
    doc.text('GP', 90, y);
    doc.text('PPG', 110, y);
    doc.text('RPG', 130, y);
    doc.text('APG', 150, y);
    doc.text('FG%', 170, y);
    y += 5;
    doc.line(14, y, 196, y);
    y += 5;

    seasons.forEach((s) => {
      if (y > 280) { doc.addPage(); y = 18; }
      doc.text(String(s.seasonName), 14, y);
      doc.text(String(s.gamesPlayed), 90, y);
      doc.text(String(s.ppg), 110, y);
      doc.text(String(s.rpg), 130, y);
      doc.text(String(s.apg), 150, y);
      doc.text(`${s.fgPct}%`, 170, y);
      y += 6;
    });

    const fileName = (profile?.playerName || 'player').replace(/\s+/g, '-').toLowerCase();
    doc.save(`courtiq-player-development-${fileName}.pdf`);
  };

  // Lightest real solution for a page this long: a sticky in-page jump
  // bar with 4 anchors, one per section below. Each section's own top
  // Box carries a matching id + scrollMarginTop so the jump lands below
  // this sticky bar rather than under it.
  const SECTION_NAV_HEIGHT = 48;
  const jumpTo = (id) => (e) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Team Insights</Typography>
          <Typography color="text.secondary">
            Season statistics, game-by-game analysis, and player development for one team, in one continuous flow.
          </Typography>
        </Box>

        <Box
          sx={{
            position: 'sticky', top: 0, zIndex: 5, bgcolor: 'background.default',
            py: 1, borderBottom: '1px solid', borderColor: 'divider',
          }}
        >
          <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
            <Link href={`#section-statistics`} onClick={jumpTo('section-statistics')} underline="hover">Statistics</Link>
            <Link href={`#section-game-picker`} onClick={jumpTo('section-game-picker')} underline="hover">Pick a game</Link>
            <Link href={`#section-analysis`} onClick={jumpTo('section-analysis')} underline="hover">Analysis</Link>
            <Link href={`#section-player-development`} onClick={jumpTo('section-player-development')} underline="hover">Player Development</Link>
          </Stack>
        </Box>

        {/* ============================= Statistics ============================= */}
        <Box id="section-statistics" sx={{ scrollMarginTop: SECTION_NAV_HEIGHT + 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
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
                <Button variant="outlined" size="small" startIcon={<DownloadIcon />} onClick={exportSeasonPdf}>
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

              <Card>
                <CardContent>
                  <Typography variant="h6" fontWeight={700}>Shot selection zones (season)</Typography>
                  <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
                    A stat breakdown of where each player's attempts came from -- paint, mid-range, or three-point --
                    aggregated across every one of this team's real games with play-by-play data. Not a shot chart:
                    no court diagram, no exact shot location.
                  </Typography>
                  {teamShotZonesLoading ? (
                    <CircularProgress size={24} />
                  ) : teamShotZonesError ? (
                    <Alert severity="error">{teamShotZonesError}</Alert>
                  ) : !teamShotZones || teamShotZones.players.length === 0 ? (
                    <Alert severity="info">No play-by-play shot data recorded for this team's games yet.</Alert>
                  ) : (
                    <>
                      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5, mb: 2, display: 'inline-block' }}>
                        <Typography fontWeight={700}>Team total</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Paint {teamShotZones.team.zones.paint.makes}/{teamShotZones.team.zones.paint.attempts} ({teamShotZones.team.zones.paint.pct}%) •
                          {' '}Mid-range {teamShotZones.team.zones.mid_range.makes}/{teamShotZones.team.zones.mid_range.attempts} ({teamShotZones.team.zones.mid_range.pct}%) •
                          {' '}Three {teamShotZones.team.zones.three.makes}/{teamShotZones.team.zones.three.attempts} ({teamShotZones.team.zones.three.pct}%)
                        </Typography>
                      </Box>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Player</TableCell>
                            <TableCell>Paint (M/A, %)</TableCell>
                            <TableCell>Mid-range (M/A, %)</TableCell>
                            <TableCell>Three (M/A, %)</TableCell>
                            <TableCell>Total (M/A, %)</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {teamShotZones.players.map((p) => (
                            <TableRow key={p.playerId}>
                              <TableCell>{p.fullName}</TableCell>
                              <TableCell>{p.zones.paint.makes}/{p.zones.paint.attempts} ({p.zones.paint.pct}%)</TableCell>
                              <TableCell>{p.zones.mid_range.makes}/{p.zones.mid_range.attempts} ({p.zones.mid_range.pct}%)</TableCell>
                              <TableCell>{p.zones.three.makes}/{p.zones.three.attempts} ({p.zones.three.pct}%)</TableCell>
                              <TableCell>{p.totalMakes}/{p.totalAttempts} ({p.totalPct}%)</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {teamShotZones.unresolvedAttemptsAcrossTheseGames > 0 && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
                          {teamShotZones.unresolvedAttemptsAcrossTheseGames} shot attempt{teamShotZones.unresolvedAttemptsAcrossTheseGames === 1 ? '' : 's'} across
                          this team's games (either side) couldn't be tied to a specific player (usually a name still
                          pending player-identity review) and aren't included above.
                        </Typography>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </Box>

        {/* ============================= Game picker ============================= */}
        <Card id="section-game-picker" sx={{ scrollMarginTop: SECTION_NAV_HEIGHT + 8 }}>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Pick a game</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Choose one of this team's real recorded games to see its full Analysis below.
            </Typography>
            <TextField
              select fullWidth label="Game" value={selectedGameId}
              onChange={(e) => setSelectedGameId(e.target.value)}
              disabled={gamesLoading || teamGames.length === 0}
              sx={{ maxWidth: 420 }}
            >
              {teamGames.map((g) => (
                <MenuItem key={g.id} value={g.id}>
                  {gameLabel(g)}
                </MenuItem>
              ))}
            </TextField>
            {teamGames.length === 0 && !gamesLoading && (
              <Alert severity="info" sx={{ mt: 2 }}>No games recorded yet for this team.</Alert>
            )}
          </CardContent>
        </Card>

        {/* ============================= Analysis ============================= */}
        {selectedGameId && (
          <Box id="section-analysis" sx={{ scrollMarginTop: SECTION_NAV_HEIGHT + 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1}>
                  <Box>
                    <Typography variant="h6" fontWeight={700}>Coach notes</Typography>
                    <Typography color="text.secondary" sx={{ mb: 2 }}>
                      Free-text notes on this real game record, visible to the team and added by Coaches.
                    </Typography>
                  </Box>
                  <Button variant="outlined" size="small" startIcon={<DownloadIcon />} onClick={exportGamePdf}>
                    Download game summary as PDF
                  </Button>
                </Stack>

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

                {role === 'Coach' && (
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

            <Grid container spacing={3}>
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
                        and may not have been run, or may have failed.
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            <Card>
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

            <Card>
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
                  onClick={generateCoachingVerdictText}
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

            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>Shot selection zones (this game)</Typography>
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

            <Card>
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

            <Card>
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

            <Card>
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
          </Box>
        )}

        {/* ============================= Player Development ============================= */}
        <Box id="section-player-development" sx={{ scrollMarginTop: SECTION_NAV_HEIGHT + 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={700}>Player Development</Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Longitudinal per-season and career-cumulative stats for one player on this team, from real extracted
                game data.
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  {isAthlete ? (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Player</Typography>
                      <Typography>{athleteUnlinked ? 'Not linked yet' : (profile?.playerName || 'You')}</Typography>
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
              {!rosterLoading && teamId && rosterPlayers.length === 0 && (
                <Alert severity="info" sx={{ mt: 2 }}>No players with recorded games for this team yet.</Alert>
              )}
              {athleteUnlinked && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  Your account isn't linked to a player profile yet. Nothing on this page is shown until that's done,
                  so you're never looking at a teammate's stats.
                </Alert>
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
              <Stack direction="row" alignItems="center" justifyContent="flex-end">
                <Button variant="outlined" size="small" startIcon={<DownloadIcon />} onClick={exportPlayerPdf}>
                  Download as PDF
                </Button>
              </Stack>

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
      </Box>
    </Layout>
  );
}

export default TeamInsights;
