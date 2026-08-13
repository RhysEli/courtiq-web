import { Box, Button, Card, CardContent, Checkbox, FormControlLabel, MenuItem, Snackbar, Stack, TextField, Typography, Alert } from '@mui/material';
import SportsBasketballIcon from '@mui/icons-material/SportsBasketball';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { registerUser } from '../auth/authService';

function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [mode, setMode] = useState('signin');
  const [signInForm, setSignInForm] = useState({ email: 'manager@courtiq.com', password: 'demo123', rememberMe: true });
  const [signUpForm, setSignUpForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'Coach',
    rememberMe: true,
    createOrganization: true,
    institution: '',
    team: '',
    country: 'Kenya',
    sport: 'Basketball',
    inviteCode: '',
  });
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

  const handleSignUp = () => {
    const result = registerUser({
      username: signUpForm.username,
      email: signUpForm.email,
      password: signUpForm.password,
      confirmPassword: signUpForm.confirmPassword,
      role: signUpForm.role,
      rememberMe: signUpForm.rememberMe,
      createOrganization: signUpForm.createOrganization,
      institution: signUpForm.institution,
      team: signUpForm.team,
      country: signUpForm.country,
      sport: signUpForm.sport,
      inviteCode: signUpForm.inviteCode,
    });

    if (result.success) {
      setError('');
      setMessage(signUpForm.createOrganization ? 'Account created and organization setup is ready.' : 'Account created. Your organization request is pending review.');
      navigate('/dashboard');
      return;
    }

    setError(result.error);
  };

  const roleOptions = useMemo(() => ['Statistician', 'Team Manager', 'Coach', 'Athlete'], []);

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
              <TextField fullWidth label="Username" margin="normal" value={signUpForm.username} onChange={(event) => setSignUpForm((prev) => ({ ...prev, username: event.target.value }))} />
              <TextField fullWidth label="Email" margin="normal" value={signUpForm.email} onChange={(event) => setSignUpForm((prev) => ({ ...prev, email: event.target.value }))} />
              <TextField fullWidth label="Password" type="password" margin="normal" value={signUpForm.password} onChange={(event) => setSignUpForm((prev) => ({ ...prev, password: event.target.value }))} />
              <TextField fullWidth label="Confirm Password" type="password" margin="normal" value={signUpForm.confirmPassword} onChange={(event) => setSignUpForm((prev) => ({ ...prev, confirmPassword: event.target.value }))} />
              <TextField select fullWidth label="Role" margin="normal" value={signUpForm.role} onChange={(event) => setSignUpForm((prev) => ({ ...prev, role: event.target.value }))}>
                {roleOptions.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
              </TextField>
              <FormControlLabel control={<Checkbox checked={signUpForm.rememberMe} onChange={(event) => setSignUpForm((prev) => ({ ...prev, rememberMe: event.target.checked }))} />} label="Remember me" sx={{ mt: 1 }} />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2 }}>
                <Button fullWidth variant={signUpForm.createOrganization ? 'contained' : 'outlined'} onClick={() => setSignUpForm((prev) => ({ ...prev, createOrganization: true }))}>Create Organization</Button>
                <Button fullWidth variant={!signUpForm.createOrganization ? 'contained' : 'outlined'} onClick={() => setSignUpForm((prev) => ({ ...prev, createOrganization: false }))}>Join Existing</Button>
              </Stack>
              {!signUpForm.createOrganization && (
                <TextField fullWidth label="Invite Code" margin="normal" value={signUpForm.inviteCode} onChange={(event) => setSignUpForm((prev) => ({ ...prev, inviteCode: event.target.value }))} />
              )}
              {signUpForm.createOrganization && (
                <Box sx={{ mt: 2 }}>
                  <TextField fullWidth label="Institution" margin="normal" value={signUpForm.institution} onChange={(event) => setSignUpForm((prev) => ({ ...prev, institution: event.target.value }))} />
                  <TextField fullWidth label="Team" margin="normal" value={signUpForm.team} onChange={(event) => setSignUpForm((prev) => ({ ...prev, team: event.target.value }))} />
                  <TextField fullWidth label="Country" margin="normal" value={signUpForm.country} onChange={(event) => setSignUpForm((prev) => ({ ...prev, country: event.target.value }))} />
                  <TextField fullWidth label="Sport" margin="normal" value={signUpForm.sport} onChange={(event) => setSignUpForm((prev) => ({ ...prev, sport: event.target.value }))} />
                </Box>
              )}
              {error && <Typography color="error.main" sx={{ mt: 2 }}>{error}</Typography>}
              {message && <Alert severity="success" sx={{ mt: 2 }}>{message}</Alert>}
              <Button fullWidth variant="contained" sx={{ mt: 3, bgcolor: '#ff7a1a', '&:hover': { bgcolor: '#e96b10' } }} onClick={handleSignUp}>Create Account</Button>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default Login;