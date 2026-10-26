import React from 'react';
import { Box, Typography } from '@mui/material';
import { tokens } from '../../theme';

// Shown when a list or a section has nothing in it.
const EmptyState = ({ icon, title, text, action }) => (
  <Box role="status" sx={{ textAlign: 'center', py: { xs: 4, sm: 6 }, px: 2 }}>
    {icon && (
      <Box
        aria-hidden="true"
        sx={{
          width: 48, height: 48, borderRadius: '14px', mx: 'auto', mb: 1.5,
          display: 'grid', placeItems: 'center', bgcolor: tokens.maroonTint, color: tokens.maroon,
        }}
      >
        {icon}
      </Box>
    )}
    {title && <Typography variant="subtitle1" component="p" sx={{ fontWeight: 600 }}>{title}</Typography>}
    {text && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 480, mx: 'auto' }}>{text}</Typography>}
    {action && <Box sx={{ mt: 2 }}>{action}</Box>}
  </Box>
);

export default EmptyState;
