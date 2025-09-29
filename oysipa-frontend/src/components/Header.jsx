import React from 'react';
import { AppBar, Toolbar, Typography, Box } from '@mui/material';
import LogoutButton from './LogoutButton';

const Header = () => {
  const token = localStorage.getItem('token');

  return (
    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          OYSIPA Investor Tracker
        </Typography>
        {token && <LogoutButton />}
      </Toolbar>
    </AppBar>
  );
};

export default Header;

