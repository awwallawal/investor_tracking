import React, { useEffect, useState } from 'react';
import { Box, useMediaQuery, useTheme } from '@mui/material';
import Header from './Header';
import Sidebar from './Sidebar';

// App shell (story 11.13): white sidebar on the left (a drawer on phones and
// small tablets), the top bar, then the page content (max 1320 px wide).
const AppLayout = ({ children }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  // Widening the window to md or more shows the permanent sidebar: close the drawer.
  useEffect(() => {
    if (isDesktop) setMobileOpen(false);
  }, [isDesktop]);

  const handleDrawerToggle = () => {
    setMobileOpen((open) => !open);
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Sidebar mobileOpen={mobileOpen} onDrawerToggle={handleDrawerToggle} />
      <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Header onDrawerToggle={handleDrawerToggle} />
        <Box
          component="main"
          sx={{
            // minWidth 0 lets wide tables scroll inside their own box instead
            // of stretching the page (which makes phones zoom out).
            minWidth: 0,
            width: '100%',
            maxWidth: 1320,
            boxSizing: 'border-box',
            p: { xs: 2, sm: 4 },
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default AppLayout;
