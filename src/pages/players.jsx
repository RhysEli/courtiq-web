import { Box, Grid, Card, CardContent, Typography, TextField, Table, TableBody, TableCell, TableHead, TableRow, Chip } from '@mui/material';
import Layout from '../components/Layout';
import { getTeamData } from '../data/mockData';

function Players({ mode, toggleTheme, selectedTeam, onTeamChange }) {
  const data = getTeamData(selectedTeam);

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <TextField label="Search players" placeholder="Search by name or position" fullWidth />
        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Roster</Typography>
            <Table sx={{ mt: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Player</TableCell>
                  <TableCell>Position</TableCell>
                  <TableCell>Jersey</TableCell>
                  <TableCell>Height</TableCell>
                  <TableCell>Weight</TableCell>
                  <TableCell>PPG</TableCell>
                  <TableCell>RPG</TableCell>
                  <TableCell>APG</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.players.map((player) => (
                  <TableRow key={player.name}>
                    <TableCell>{player.name}</TableCell>
                    <TableCell>{player.position}</TableCell>
                    <TableCell>#{player.jersey}</TableCell>
                    <TableCell>{player.height}</TableCell>
                    <TableCell>{player.weight}</TableCell>
                    <TableCell>{player.ppg}</TableCell>
                    <TableCell>{player.rpg}</TableCell>
                    <TableCell>{player.apg}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Box>
    </Layout>
  );
}

export default Players;
