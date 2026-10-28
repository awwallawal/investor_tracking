import React from 'react';
import { Box } from '@mui/material';

// Key facts as a definition grid (story 11.16): label on the left, value on
// the right; on phones the value goes under its label.
// items: [{ label, value }] — an item with value null/undefined is left out.
const KeyFacts = ({ items, labelWidth = 140, ariaLabel }) => (
  <Box
    component="dl"
    aria-label={ariaLabel}
    sx={{
      m: 0,
      display: 'grid',
      gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: `${labelWidth}px minmax(0, 1fr)` },
      columnGap: 1.5,
      rowGap: { xs: 0.25, sm: 1 },
      fontSize: 14,
    }}
  >
    {items.filter((i) => i && i.value !== null && i.value !== undefined).map((i) => (
      <React.Fragment key={i.label}>
        <Box component="dt" sx={{ color: 'text.secondary', mt: { xs: 1, sm: 0 } }}>{i.label}</Box>
        <Box component="dd" sx={{ m: 0, overflowWrap: 'anywhere', whiteSpace: i.multiline ? 'pre-wrap' : undefined }}>{i.value}</Box>
      </React.Fragment>
    ))}
  </Box>
);

export default KeyFacts;
