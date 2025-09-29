import React from 'react';
import { Box, Typography } from '@mui/material';

const AdminDashboard = () => {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Portal Administration
      </Typography>
      <Typography>
        User management and system configuration options will be available here.
      </Typography>
    </Box>
  );
};

export default AdminDashboard;