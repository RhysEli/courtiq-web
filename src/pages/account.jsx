import { Box, Button, Card, CardContent, Grid, MenuItem, Stack, TextField, Typography, Snackbar, Alert } from '@mui/material';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout';
import { createUserAccount, createOrganization, createInvite, createAccessRequest } from '../services/accountService';
import { useAuth } from '../contexts/AuthContext';

function Account({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [flow, setFlow] = useState('create-organization');
  const [form, setForm] = useState({
    username: '',
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    password: '',
    institution: '',
    team: '',
    country: '',
    sport: 'Basketball',
    inviteCode: '',
    desiredRole: 'Coach',
    message: '',
  });
  const [notice, setNotice] = useState('');

  const createAccount = () => {
    const user = createUserAccount({
      username: form.username,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phoneNumber: form.phoneNumber,
      password: form.password,
      role: flow === 'create-organization' ? 'Team Manager' : form.desiredRole,
      institution: form.institution,
      team: form.team,
      status: 'active',
    });

    if (flow === 'create-organization') {
      createOrganization({ name: form.institution, country: form.country, sport: form.sport }, user.id);
      login({ email: form.email, password: form.password, rememberMe: true });
      setNotice('Organization created and your account is ready.');
      navigate('/dashboard');
      return;
    }

    createInvite({ email: form.email, institution: form.institution, team: form.team, role: form.desiredRole, status: 'pending' });
    createAccessRequest({ email: form.email, institution: form.institution, desiredRole: form.desiredRole, message: form.message });
    setNotice('Your account was created. Your request is pending review.');
  };

  const sharedFields = useMemo(() => [
    { key: 'username', label: 'Username' },
    { key: 'firstName', label: 'First Name' },
    { key: 'lastName', label: 'Last Name' },
    { key: 'email', label: 'Email' },
    { key: 'phoneNumber', label: 'Phone Number' },
    { key: 'password', label: 'Password', type: 'password' },
  ], []);

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h5" fontWeight={700}>Create account</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>Choose how to join CourtIQ and complete onboarding.</Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mt: 3 }}>
              <Button variant={flow === 'create-organization' ? 'contained' : 'outlined'} onClick={() => setFlow('create-organization')}>Create organization</Button>
              <Button variant={flow === 'join-organization' ? 'contained' : 'outlined'} onClick={() => setFlow('join-organization')}>Join existing organization</Button>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Grid container spacing={2}>
              {sharedFields.map((field) => (
                <Grid item xs={12} md={6} key={field.key}>
                  <TextField fullWidth label={field.label} type={field.type || 'text'} value={form[field.key]} onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))} />
                </Grid>
              ))}

              {flow === 'create-organization' ? (
                <>
                  <Grid item xs={12} md={6}><TextField fullWidth label="Institution" value={form.institution} onChange={(event) => setForm((prev) => ({ ...prev, institution: event.target.value }))} /></Grid>
                  <Grid item xs={12} md={6}><TextField fullWidth label="Country" value={form.country} onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value }))} /></Grid>
                  <Grid item xs={12} md={6}><TextField fullWidth label="Sport" value={form.sport} onChange={(event) => setForm((prev) => ({ ...prev, sport: event.target.value }))} /></Grid>
                  <Grid item xs={12} md={6}><TextField fullWidth label="Team" value={form.team} onChange={(event) => setForm((prev) => ({ ...prev, team: event.target.value }))} /></Grid>
                </>
              ) : (
                <>
                  <Grid item xs={12} md={6}><TextField fullWidth label="Institution" value={form.institution} onChange={(event) => setForm((prev) => ({ ...prev, institution: event.target.value }))} /></Grid>
                  <Grid item xs={12} md={6}><TextField fullWidth label="Team" value={form.team} onChange={(event) => setForm((prev) => ({ ...prev, team: event.target.value }))} /></Grid>
                  <Grid item xs={12} md={6}><TextField select fullWidth label="Desired Role" value={form.desiredRole} onChange={(event) => setForm((prev) => ({ ...prev, desiredRole: event.target.value }))}>
                    <MenuItem value="Coach">Coach</MenuItem>
                    <MenuItem value="Statistician">Statistician</MenuItem>
                    <MenuItem value="Team Manager">Team Manager</MenuItem>
                  </TextField></Grid>
                  <Grid item xs={12} md={6}><TextField fullWidth label="Invite Code" value={form.inviteCode} onChange={(event) => setForm((prev) => ({ ...prev, inviteCode: event.target.value }))} /></Grid>
                  <Grid item xs={12}><TextField fullWidth multiline minRows={3} label="Message" value={form.message} onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))} /></Grid>
                </>
              )}
              <Grid item xs={12}><Button variant="contained" onClick={createAccount}>Create account</Button></Grid>
            </Grid>
          </CardContent>
        </Card>
      </Box>

      <Snackbar open={Boolean(notice)} autoHideDuration={4000} onClose={() => setNotice('')}>
        <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>
      </Snackbar>
    </Layout>
  );
}

export default Account;
