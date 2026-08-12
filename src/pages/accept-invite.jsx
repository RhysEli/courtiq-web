import { Alert, Box, Button, Card, CardContent, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { backendApi } from '../api/client';

function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState(null);

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    backendApi.getInvite(token)
      .then((data) => setInvite(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    if (!name || !password) {
      setError('Name and password are required.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await backendApi.acceptInvite(token, { name, password });
      setAccepted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Card sx={{ maxWidth: 480, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" fontWeight={700} gutterBottom>Accept your CourtIQ invite</Typography>

          {loading && (
            <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>
          )}

          {!loading && error && !invite && (
            <Alert severity="error">{error}</Alert>
          )}

          {!loading && invite && !accepted && (
            <Stack spacing={2}>
              <Typography color="text.secondary">
                You've been invited as a <strong>{invite.role}</strong>
                {invite.team_name ? ` on ${invite.team_name}` : ''}
                {invite.institution_name ? ` at ${invite.institution_name}` : ''}.
                Set up your account below.
              </Typography>
              <TextField label="Email" value={invite.email} disabled fullWidth />
              <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} fullWidth autoFocus />
              <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth />
              <TextField label="Confirm password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} fullWidth />
              {error && <Alert severity="error">{error}</Alert>}
              <Button variant="contained" size="large" onClick={handleAccept} disabled={submitting}>
                {submitting ? 'Creating account…' : 'Accept & create account'}
              </Button>
            </Stack>
          )}

          {accepted && (
            <Stack spacing={2}>
              <Alert severity="success">Your account was created successfully.</Alert>
              <Button variant="contained" size="large" onClick={() => navigate('/')}>Go to login</Button>
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default AcceptInvite;