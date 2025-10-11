import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Toolbar,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { jwtDecode } from 'jwt-decode';

const drawerWidth = 240;

const Sidebar = ({ mobileOpen, onDrawerToggle }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const token = localStorage.getItem('token');
  let userRole = null;

  if (token) {
    try {
      const decodedToken = jwtDecode(token);
      userRole = decodedToken.user.role;
    } catch (error) {
      console.error('Error decoding token:', error);
      localStorage.removeItem('token');
    }
  }

  const navLinks = [
    { path: '/dashboard', name: 'Dashboard', roles: ['Director-General', 'Portal-Admin', 'Staff'] },
    { path: '/users', name: 'User Management', roles: ['Director-General', 'Portal-Admin'] },
    { path: '/investors', name: 'Investor Directory', roles: ['Director-General', 'Portal-Admin', 'Staff'] },
    { path: '/admin', name: 'Admin Settings', roles: ['Portal-Admin'] },
  ];

  if (!token) {
    return null; // Don't render sidebar if not authenticated
  }

  const drawerContent = (
    <>
      <Toolbar />
      <List>
        {navLinks.map((link) => {
          if (userRole && link.roles.includes(userRole)) {
            return (
              <ListItem key={link.path} disablePadding>
                <ListItemButton component={RouterLink} to={link.path} onClick={isMobile ? onDrawerToggle : null}>
                  <ListItemText primary={link.name} />
                </ListItemButton>
              </ListItem>
            );
          }
          return null;
        })}
      </List>
    </>
  );

  return (
    <Drawer
      variant={isMobile ? 'temporary' : 'permanent'}
      open={isMobile ? mobileOpen : true}
      onClose={onDrawerToggle}
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' },
      }}
    >
      {drawerContent}
    </Drawer>
  );
};

export default Sidebar;
