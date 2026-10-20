import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@mui/material';

const LogoutButton = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <Button color="inherit" variant="outlined" onClick={handleLogout} sx={{ flexShrink: 0 }}>
      Logout
    </Button>
  );
};

export default LogoutButton;
