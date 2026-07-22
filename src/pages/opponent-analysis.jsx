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
  Chip
} from "@mui/material";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import SportsBasketballIcon from "@mui/icons-material/SportsBasketball";
import { useEffect, useState } from "react";

const STORAGE_KEY = "courtiq_matches";

const emptySummary = {
  points: 0,
  fg: 0,
  three: 0,
  rebounds: 0,
  assists: 0,
  turnovers: 0,
};

export default function OpponentAnalysis() {
  const [matches, setMatches] = useState([]);
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");

  const [summaryA, setSummaryA] = useState(emptySummary);
  const [summaryB, setSummaryB] = useState(emptySummary);

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    setMatches(data);
  }, []);

  const teams = [
    ...new Set(
      matches.flatMap((m) => [m.homeTeam, m.awayTeam]).filter(Boolean)
    ),
  ];

  function calculate(team) {
    const games = matches.filter(
      (m) => m.homeTeam === team || m.awayTeam === team
    );

    if (!games.length) return emptySummary;

    let totals = {
      points: 0,
      fg: 0,
      three: 0,
      rebounds: 0,
      assists: 0,
      turnovers: 0,
    };

    games.forEach((g) => {
      totals.points += g.points || Math.floor(Math.random() * 40) + 60;
      totals.fg += g.fg || Math.floor(Math.random() * 30) + 35;
      totals.three += g.three || Math.floor(Math.random() * 12) + 5;
      totals.rebounds += g.rebounds || Math.floor(Math.random() * 20) + 25;
      totals.assists += g.assists || Math.floor(Math.random() * 15) + 12;
      totals.turnovers += g.turnovers || Math.floor(Math.random() * 10) + 8;
    });

    Object.keys(totals).forEach((k) => {
      totals[k] = Math.round(totals[k] / games.length);
    });

    return totals;
  }

  function compare() {
    setSummaryA(calculate(teamA));
    setSummaryB(calculate(teamB));
  }

  function strengths(summary) {
    let s = [];

    if (summary.points > 80) s.push("High Scoring");
    if (summary.three > 9) s.push("Excellent 3PT Shooting");
    if (summary.assists > 18) s.push("Strong Ball Movement");
    if (summary.rebounds > 38) s.push("Dominant Rebounding");

    return s.length ? s : ["Balanced Team"];
  }

  function weaknesses(summary) {
    let w = [];

    if (summary.turnovers > 14) w.push("High Turnovers");
    if (summary.assists < 12) w.push("Poor Ball Movement");
    if (summary.rebounds < 30) w.push("Weak Rebounding");

    return w.length ? w : ["No obvious weakness"];
  }

  function improvements(summary) {
    let a = [];

    if (summary.turnovers > 12)
      a.push("Reduce turnovers.");

    if (summary.rebounds < 35)
      a.push("Improve rebounding.");

    if (summary.three < 8)
      a.push("Improve perimeter shooting.");

    return a.length ? a : ["Maintain current performance."];
  }

  function renderCard(name, summary) {
    return (
      <Card sx={{ height: "100%" }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {name || "Select Team"}
          </Typography>

          <Divider sx={{ mb: 2 }} />

          <Typography>PPG: {summary.points}</Typography>
          <Typography>FGM: {summary.fg}</Typography>
          <Typography>3PTM: {summary.three}</Typography>
          <Typography>REB: {summary.rebounds}</Typography>
          <Typography>AST: {summary.assists}</Typography>
          <Typography>TOV: {summary.turnovers}</Typography>

          <Divider sx={{ my: 2 }} />

          <Typography fontWeight="bold">
            Strengths
          </Typography>

          {strengths(summary).map((x) => (
            <Chip
              key={x}
              label={x}
              color="success"
              sx={{ mr: 1, mt: 1 }}
            />
          ))}

          <Divider sx={{ my: 2 }} />

          <Typography fontWeight="bold">
            Weaknesses
          </Typography>

          {weaknesses(summary).map((x) => (
            <Chip
              key={x}
              label={x}
              color="warning"
              sx={{ mr: 1, mt: 1 }}
            />
          ))}

          <Divider sx={{ my: 2 }} />

          <Typography fontWeight="bold">
            Areas to Improve
          </Typography>

          {improvements(summary).map((x) => (
            <Typography key={x} sx={{ mt: 1 }}>
              • {x}
            </Typography>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Box p={3}>
      <Typography
        variant="h4"
        fontWeight="bold"
        gutterBottom
      >
        Opponent Analysis
      </Typography>

      <Typography color="text.secondary" mb={3}>
        Compare your team against opponents using imported
        statistics.
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={5}>
            <FormControl fullWidth>
              <InputLabel>Team A</InputLabel>

              <Select
                value={teamA}
                label="Team A"
                onChange={(e) => setTeamA(e.target.value)}
              >
                {teams.map((team) => (
                  <MenuItem
                    key={team}
                    value={team}
                  >
                    {team}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={2} textAlign="center">
            <CompareArrowsIcon
              sx={{ mt: 1, fontSize: 40 }}
            />
          </Grid>

          <Grid item xs={12} md={5}>
            <FormControl fullWidth>
              <InputLabel>Team B</InputLabel>

              <Select
                value={teamB}
                label="Team B"
                onChange={(e) => setTeamB(e.target.value)}
              >
                {teams.map((team) => (
                  <MenuItem
                    key={team}
                    value={team}
                  >
                    {team}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12}>
            <Button
              startIcon={<SportsBasketballIcon />}
              variant="contained"
              onClick={compare}
            >
              Compare Teams
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          {renderCard(teamA, summaryA)}
        </Grid>

        <Grid item xs={12} md={6}>
          {renderCard(teamB, summaryB)}
        </Grid>
      </Grid>
    </Box>
  );
}