import { Box, Button, Card, CardContent, Grid, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import Layout from '../components/layout';
import { createOrganization, getOrganizations } from '../services/accountService';

function Organizations({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [form, setForm] = useState({ name: '', logo: '', country: '', sport: '', description: '', status: 'active' });
  const [refreshToken, setRefreshToken] = useState(0);
  const organizations = useMemo(() => getOrganizations(), [refreshToken]);

  const create = () => {
    createOrganization(form, 'manager-1');
    setForm({ name: '', logo: '', country: '', sport: '', description: '', status: 'active' });
    setRefreshToken((prev) => prev + 1);
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h5" fontWeight={700}>Organization management</Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}><TextField fullWidth label="Institution name" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Logo" value={form.logo} onChange={(event) => setForm((prev) => ({ ...prev, logo: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Country" value={form.country} onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Sport" value={form.sport} onChange={(event) => setForm((prev) => ({ ...prev, sport: event.target.value }))} /></Grid>
              <Grid item xs={12}><TextField fullWidth multiline minRows={3} label="Description" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} /></Grid>
            </Grid>
            <Button variant="contained" sx={{ mt: 2 }} onClick={create}>Save institution</Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Institutions</Typography>
            <Table size="small" sx={{ mt: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Country</TableCell>
                  <TableCell>Sport</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {organizations.map((organization) => (
                  <TableRow key={organization.id}>
                    <TableCell>{organization.name}</TableCell>
                    <TableCell>{organization.country}</TableCell>
                    <TableCell>{organization.sport}</TableCell>
                    <TableCell>{organization.status}</TableCell>
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

export default Organizations;
