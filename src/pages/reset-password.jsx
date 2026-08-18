import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { backendApi } from '../api/client';

// Public, unauthenticated -- reached only via a link a staff member
// triggered (POST /users/:userId/reset-password, users.jsx's "Reset
// password" button), never a self-service "forgot password" request.
// No token-preview step (unlike accept-invite.jsx's GET-then-POST
// shape) -- the token is only actually validated on submit, by the
// backend's POST /reset-password/:token; an invalid/expired/already-used
// token surfaces as an inline error at that point instead.
function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!password) {
      setError('Password is required.');
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
      await backendApi.resetPassword(token, password);
      setDone(true);
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
          <Typography variant="h5" fontWeight={700} gutterBottom>Set a new password</Typography>

          {!done ? (
            <Stack spacing={2}>
              <Typography color="text.secondary">Choose a new password for your CourtIQ account.</Typography>
              <TextField label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth autoFocus />
              <TextField label="Confirm password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} fullWidth />
              {error && <Alert severity="error">{error}</Alert>}
              <Button variant="contained" size="large" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Saving…' : 'Set new password'}
              </Button>
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Alert severity="success">Your password has been updated.</Alert>
              <Button variant="contained" size="large" onClick={() => navigate('/')}>Go to login</Button>
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default ResetPassword;
