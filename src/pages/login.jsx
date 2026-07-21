import { Box, Button, Card, CardContent, MenuItem, TextField, Typography } from '@mui/material';
import SportsBasketballIcon from '@mui/icons-material/SportsBasketball';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Login({ onLogin }) {
  const navigate = useNavigate();
  const [role, setRole] = useState('Statistician');

  const handleLogin = () => {
    onLogin?.(role);
    navigate('/dashboard');
  };

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
      <Card sx={{ width: 420, p: 2, borderRadius: 4, bgcolor: '#111827', color: 'white', border: '1px solid rgba(255,255,255,0.08)' }}>
        <CardContent>
          <Box textAlign="center" mb={4}>
            <SportsBasketballIcon sx={{ fontSize: 70, color: '#ff7a1a' }} />
            <Typography variant="h4" fontWeight="bold" sx={{ color: 'white' }}>
              CourtIQ
            </Typography>
            <Typography color="grey.400">Basketball performance intelligence</Typography>
          </Box>

          <TextField fullWidth label="Email" margin="normal" defaultValue="coach@courtiq.io" />
          <TextField fullWidth label="Password" type="password" margin="normal" defaultValue="demo123" />
          <TextField select fullWidth label="Role" margin="normal" value={role} onChange={(event) => setRole(event.target.value)}>
            <MenuItem value="Administrator">Administrator</MenuItem>
            <MenuItem value="Statistician">Statistician</MenuItem>
            <MenuItem value="Coach">Coach</MenuItem>
          </TextField>

          <Button
            fullWidth
            variant="contained"
            sx={{ mt: 3, bgcolor: '#ff7a1a', '&:hover': { bgcolor: '#e96b10' } }}
            onClick={handleLogin}
          >
            Enter CourtIQ
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}

export default Login;