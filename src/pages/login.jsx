import { Box, Button, Card, CardContent, Checkbox, FormControlLabel, Snackbar, Stack, TextField, Typography, Alert } from '@mui/material';
import SportsBasketballIcon from '@mui/icons-material/SportsBasketball';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [mode, setMode] = useState('signin');
  const [signInForm, setSignInForm] = useState({ email: 'manager@courtiq.com', password: 'demo123', rememberMe: true });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    const result = await login({ email: signInForm.email, password: signInForm.password, rememberMe: signInForm.rememberMe });
    if (result.success) {
      setError('');
      setMessage('Signed in successfully.');
      navigate('/dashboard');
      return;
    }

    setError(result.error);
  };

  if (isAuthenticated) {
    navigate('/dashboard');
    return null;
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top, #1f2937 0%, #030712 70%)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        p: 3,
      }}
    >
      <Card sx={{ width: { xs: '100%', md: 540 }, p: 2, borderRadius: 4, bgcolor: '#111827', color: 'white', border: '1px solid rgba(255,255,255,0.08)' }}>
        <CardContent>
          <Box textAlign="center" mb={3}>
            <SportsBasketballIcon sx={{ fontSize: 70, color: '#ff7a1a' }} />
            <Typography variant="h4" fontWeight="bold" sx={{ color: 'white' }}>
              CourtIQ
            </Typography>
            <Typography color="grey.400">Basketball performance intelligence</Typography>
          </Box>

          <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
            <Button fullWidth variant={mode === 'signin' ? 'contained' : 'outlined'} onClick={() => setMode('signin')}>Sign In</Button>
            <Button fullWidth variant={mode === 'signup' ? 'contained' : 'outlined'} onClick={() => setMode('signup')}>Sign Up</Button>
          </Stack>

          {mode === 'signin' ? (
            <Box>
              <TextField fullWidth label="Email" margin="normal" value={signInForm.email} onChange={(event) => setSignInForm((prev) => ({ ...prev, email: event.target.value }))} />
              <TextField fullWidth label="Password" type="password" margin="normal" value={signInForm.password} onChange={(event) => setSignInForm((prev) => ({ ...prev, password: event.target.value }))} />
              <FormControlLabel control={<Checkbox checked={signInForm.rememberMe} onChange={(event) => setSignInForm((prev) => ({ ...prev, rememberMe: event.target.checked }))} />} label="Remember me" sx={{ mt: 1 }} />
              {error && <Typography color="error.main" sx={{ mt: 2 }}>{error}</Typography>}
              {message && <Alert severity="success" sx={{ mt: 2 }}>{message}</Alert>}
              <Button fullWidth variant="contained" sx={{ mt: 3, bgcolor: '#ff7a1a', '&:hover': { bgcolor: '#e96b10' } }} onClick={handleLogin}>Enter CourtIQ</Button>
            </Box>
          ) : (
            <Box>
              <Typography color="grey.300">
                Accounts are created by invite. Contact your Team Manager or Statistician to receive an invite link.
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default Login;