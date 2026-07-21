import { Box, Grid, Card, CardContent, Typography, Switch, FormControlLabel, TextField, Button, Stack } from '@mui/material';
import Layout from '../components/Layout';

function Settings({ mode, toggleTheme, selectedTeam, onTeamChange, role }) {
  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={700}>User profile</Typography>
              <TextField fullWidth label="Full name" defaultValue="Rhys Coleman" sx={{ mt: 2, mb: 2 }} />
              <TextField fullWidth label="Role" defaultValue={role || 'Statistician'} sx={{ mb: 2 }} />
              <TextField fullWidth label="Email" defaultValue="rhys@courtiq.io" />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={700}>Theme</Typography>
              <FormControlLabel control={<Switch checked={mode === 'dark'} onChange={toggleTheme} />} label={mode === 'dark' ? 'Dark mode' : 'Light mode'} sx={{ mt: 2, display: 'block' }} />
              <Typography color="text.secondary" sx={{ mt: 2 }}>Team colour</Typography>
              <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: '#ff7a1a' }} />
                <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: '#38bdf8' }} />
                <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: '#f59e0b' }} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={700}>Notifications</Typography>
              <FormControlLabel control={<Switch defaultChecked />} label="Game reminders" sx={{ mt: 2, display: 'block' }} />
              <FormControlLabel control={<Switch defaultChecked />} label="AI analysis updates" sx={{ display: 'block' }} />
              <Button variant="contained" sx={{ mt: 2 }}>Save changes</Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Layout>
  );
}

export default Settings;
