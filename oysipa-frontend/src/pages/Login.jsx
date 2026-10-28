import React, { useState } from 'react';
import apiClient from '../api/api';
import { useNavigate } from 'react-router-dom';
import { Box, Card, TextField, Button, Typography, Alert, InputAdornment, IconButton } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { tokens } from '../theme';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleClickShowPassword = () => setShowPassword((show) => !show);

  const handleMouseDownPassword = (event) => {
    event.preventDefault();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await apiClient.post('/api/auth/login', { email, password });
      localStorage.setItem('token', res.data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.msg || 'Login failed');
    }
  };

  // A centred card with the OYSIPA mark on the light background (story 11.16).
  return (
    <Box
      component="main"
      sx={{
        minHeight: '100vh', bgcolor: 'background.default', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2, py: 4, boxSizing: 'border-box',
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 420, p: { xs: 3, sm: 4 }, boxSizing: 'border-box' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
          <Box
            aria-hidden="true"
            sx={{
              width: 44, height: 44, borderRadius: '12px', bgcolor: tokens.maroon, color: tokens.paper, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 20, flexShrink: 0,
            }}
          >
            O
          </Box>
          <Box>
            <Typography component="h1" sx={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>
              OYSIPA Portal
            </Typography>
            <Typography variant="body2" color="text.secondary">Investor Tracker</Typography>
          </Box>
        </Box>
        <Typography component="h2" variant="h5" sx={{ fontSize: 22 }}>
          Sign In
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Use the email and password from your invitation.
        </Typography>
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2, width: '100%' }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label="Email Address"
            name="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="toggle password visibility"
                    onClick={handleClickShowPassword}
                    onMouseDown={handleMouseDownPassword}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
          >
            Sign In
          </Button>
          {error && <Alert severity="error">{error}</Alert>}
        </Box>
      </Card>
    </Box>
  );
};

export default LoginPage;