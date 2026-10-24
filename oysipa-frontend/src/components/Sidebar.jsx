import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Badge,
  Toolbar,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { jwtDecode } from 'jwt-decode';
import { fetchUntaggedCount, UNTAGGED_CHANGED_EVENT } from '../api/evidence';

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

  // Untagged evidence files, shown as a badge on "Evidence Library". Fetched on
  // mount and whenever a library screen reports a change.
  const [untagged, setUntagged] = useState(null);
  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    const load = () => fetchUntaggedCount()
      .then((count) => { if (active) setUntagged(count); })
      .catch(() => { if (active) setUntagged(null); });
    load();
    window.addEventListener(UNTAGGED_CHANGED_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(UNTAGGED_CHANGED_EVENT, load);
    };
  }, [token]);

  const navLinks = [
    { path: '/dashboard', name: 'Dashboard', roles: ['Director-General', 'Portal-Admin', 'Staff'] },
    { path: '/users', name: 'User Management', roles: ['Director-General', 'Portal-Admin'] },
    { path: '/investors', name: 'Investor Directory', roles: ['Director-General', 'Portal-Admin', 'Staff'] },
    { path: '/issues', name: 'Issues', roles: ['Director-General', 'Portal-Admin', 'Staff'] },
    { path: '/evidence', name: 'Evidence Library', roles: ['Director-General', 'Portal-Admin', 'Staff'], badge: untagged },
    { path: '/admin', name: 'Admin Settings', roles: ['Director-General', 'Portal-Admin'] },
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
                  {link.badge > 0 && (
                    <Badge
                      badgeContent={link.badge}
                      max={999}
                      color="primary"
                      sx={{ mr: 1.5 }}
                      aria-label={`${link.badge} untagged`}
                      title="Untagged files"
                    />
                  )}
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
      sx={
        {
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' },
        }
      }
    >
      {drawerContent}
    </Drawer>
  );
};

export default Sidebar;

