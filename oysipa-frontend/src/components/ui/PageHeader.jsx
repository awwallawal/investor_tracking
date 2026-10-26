import React from 'react';
import { Box, Typography } from '@mui/material';

// Top of every redesigned screen: small eyebrow label, the page title (h1),
// an optional line under it and the page's main buttons on the right.
const PageHeader = ({ eyebrow, title, subtitle, actions }) => (
  <Box
    component="header"
    sx={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 2,
      alignItems: { xs: 'stretch', sm: 'flex-end' },
      justifyContent: 'space-between',
      flexDirection: { xs: 'column', sm: 'row' },
      mb: 3,
    }}
  >
    <Box sx={{ minWidth: 0 }}>
      {eyebrow && (
        <Typography variant="overline" component="p" color="text.secondary" sx={{ display: 'block' }}>
          {eyebrow}
        </Typography>
      )}
      <Typography variant="h4" component="h1" sx={{ mt: eyebrow ? 0.5 : 0, overflowWrap: 'anywhere' }}>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
          {subtitle}
        </Typography>
      )}
    </Box>
    {actions && (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, flexDirection: { xs: 'column', sm: 'row' } }}>
        {actions}
      </Box>
    )}
  </Box>
);

export default PageHeader;
