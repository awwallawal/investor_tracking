import React, { useState } from 'react';
import { Box, CssBaseline } from '@mui/material';
import Header from './Header';
import Sidebar from './Sidebar';

const drawerWidth = 240;

const AppLayout = ({ children }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <Header onDrawerToggle={handleDrawerToggle} drawerWidth={drawerWidth} />
      <Sidebar
        drawerWidth={drawerWidth}
        mobileOpen={mobileOpen}
        onDrawerToggle={handleDrawerToggle}
      />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          // minWidth 0 lets wide tables scroll inside the page instead of
          // stretching it (which makes phones zoom out).
          minWidth: 0,
          p: { xs: 2, sm: 3 },
          mt: { xs: '56px', sm: '64px' },
          width: { sm: `calc(100% - ${drawerWidth}px)` },
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

export default AppLayout;
