import { Alert, Box, Button, Card, CardContent, Checkbox, FormControlLabel, IconButton, Snackbar, Stack, TextField, Typography } from '@mui/material';
import SportsBasketballIcon from '@mui/icons-material/SportsBasketball';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useThemePreferences } from '../contexts/ThemeContext';
import RoleBackground from '../components/RoleBackground';

function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const { mode, toggleTheme, setThemeMode } = useThemePreferences();
  const [tabMode, setTabMode] = useState('signin');
  const [signInForm, setSignInForm] = useState({ email: 'manager@courtiq.com', password: 'demo123', rememberMe: true });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    const result = await login({ email: signInForm.email, password: signInForm.password, rememberMe: signInForm.rememberMe });
    if (result.success) {
      setError('');
      setMessage('Signed in successfully.');
      // Brand colors/accent are already live (authService.js applies them
      // via plain DOM calls, no React needed) -- theme_mode is React
      // state owned by ThemeContext, a sibling context authService.js
      // can't reach directly, so it's applied here instead for a
      // same-tab live update (no reload) on a fresh login.
      if (result.user?.themeMode) setThemeMode(result.user.themeMode);
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
    <Box sx={{ minHeight: '100vh', position: 'relative' }}>
      <RoleBackground role="Statistician" />

      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          minHeight: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          p: 3,
        }}
      >
        <Card sx={{ width: { xs: '100%', md: 540 }, p: 2, borderRadius: 4 }}>
          <CardContent>
            <Stack direction="row" justifyContent="flex-end">
              <IconButton sx={{ color: 'text.secondary' }} onClick={toggleTheme}>
                {mode === 'dark' ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
              </IconButton>
            </Stack>
            <Box textAlign="center" mb={3} mt={-2}>
              <SportsBasketballIcon sx={{ fontSize: 70, color: 'var(--brand-primary)' }} />
              <Typography variant="h4" fontWeight="bold">
                CourtIQ
              </Typography>
              <Typography color="textSecondary">Basketball performance intelligence</Typography>
            </Box>

            <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
              <Button fullWidth variant={tabMode === 'signin' ? 'contained' : 'outlined'} onClick={() => setTabMode('signin')}>Sign In</Button>
              <Button fullWidth variant={tabMode === 'signup' ? 'contained' : 'outlined'} onClick={() => setTabMode('signup')}>Sign Up</Button>
            </Stack>

            {tabMode === 'signin' ? (
              <Box>
                <TextField fullWidth label="Email" margin="normal" value={signInForm.email} onChange={(event) => setSignInForm((prev) => ({ ...prev, email: event.target.value }))} />
                <TextField fullWidth label="Password" type="password" margin="normal" value={signInForm.password} onChange={(event) => setSignInForm((prev) => ({ ...prev, password: event.target.value }))} />
                <FormControlLabel control={<Checkbox checked={signInForm.rememberMe} onChange={(event) => setSignInForm((prev) => ({ ...prev, rememberMe: event.target.checked }))} />} label="Remember me" sx={{ mt: 1 }} />
                {error && <Typography color="error.main" sx={{ mt: 2 }}>{error}</Typography>}
                {message && <Alert severity="success" sx={{ mt: 2 }}>{message}</Alert>}
                <Button fullWidth variant="contained" sx={{ mt: 3, bgcolor: 'var(--brand-primary)', '&:hover': { bgcolor: 'var(--brand-primary)', filter: 'brightness(0.9)' } }} onClick={handleLogin}>Enter CourtIQ</Button>
              </Box>
            ) : (
              <Box>
                <Typography color="textSecondary">
                  Accounts are created by invite. Contact your Team Manager or Statistician to receive an invite link.
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

export default Login;
