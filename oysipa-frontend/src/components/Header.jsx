import React from 'react';
import { AppBar, Toolbar, Typography, Box, IconButton } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutButton from './LogoutButton';

const Header = ({ onDrawerToggle }) => {
  const token = localStorage.getItem('token');

  return (
    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
      <Toolbar>
        <IconButton
          color="inherit"
          aria-label="open drawer"
          edge="start"
          onClick={onDrawerToggle}
          sx={{ mr: 2, display: { sm: 'none' } }}
        >
          <MenuIcon />
        </IconButton>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          OYSIPA Investor Tracker
        </Typography>
        {token && <LogoutButton />}
      </Toolbar>
    </AppBar>
  );
};

export default Header;
