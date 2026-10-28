import React from 'react';
import { Box, Typography } from '@mui/material';
import { tokens } from '../../theme';

// List rows in the design style (story 11.16), in place of MUI List: each row
// has a main line, an optional line under it and actions on the right (under
// it on phones). rows: [{ key, primary, secondary, actions }].
const RowList = ({ rows, ariaLabel, empty }) => {
  if (!rows.length) return empty ? <Typography variant="body2" color="text.secondary">{empty}</Typography> : null;
  return (
    <Box component="ul" aria-label={ariaLabel} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {rows.map((r, i) => (
        <Box
          component="li"
          key={r.key}
          sx={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 2, rowGap: 0.5, py: 1.25, borderTop: i ? `1px solid ${tokens.rowDivider}` : 0,
          }}
        >
          <Box sx={{ minWidth: 0, flex: '1 1 240px' }}>
            <Typography component="div" variant="body2" sx={{ fontWeight: 500, overflowWrap: 'anywhere', whiteSpace: r.preWrap ? 'pre-wrap' : undefined }}>{r.primary}</Typography>
            {r.secondary && <Typography component="div" variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{r.secondary}</Typography>}
          </Box>
          {r.actions && <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>{r.actions}</Box>}
        </Box>
      ))}
    </Box>
  );
};

export default RowList;
