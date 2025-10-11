import React from 'react';
import { Box, Typography, Container } from '@mui/material';
import LifecycleStatusManager from '../components/LifecycleStatusManager';

const AdminPage = () => {
  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Admin Settings
        </Typography>
        <LifecycleStatusManager />
      </Box>
    </Container>
  );
};

export default AdminPage;