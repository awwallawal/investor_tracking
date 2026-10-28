import React, { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { shortValue } from '../utils/changeLog';

// The changes of one change-log row (story 11.10; shared with the investor
// page's History tab, 11.16).

// One value; a long one is shortened and can be expanded.
const ChangeValue = ({ value }) => {
  const [open, setOpen] = useState(false);
  const { text, full, long } = shortValue(value);
  return (
    <>
      <Box component="span" sx={{ overflowWrap: 'anywhere' }}>{open ? full : text}</Box>
      {long && (
        <Button size="small" variant="text" sx={{ minWidth: 0, p: 0, ml: 0.5, verticalAlign: 'baseline' }} onClick={() => setOpen((o) => !o)}>
          {open ? 'Show less' : 'Show more'}
        </Button>
      )}
    </>
  );
};

// "field: old → new" per change.
const ChangeList = ({ changes }) => {
  if (!changes || changes.length === 0) return <Typography variant="body2" color="text.secondary">—</Typography>;
  return (
    <Box component="ul" sx={{ m: 0, pl: 2 }}>
      {changes.map((c) => (
        <Typography component="li" variant="body2" key={c.field} data-testid="change">
          <strong>{c.field}</strong>
          {': '}
          <ChangeValue value={c.old} />
          {' → '}
          <ChangeValue value={c.new} />
        </Typography>
      ))}
    </Box>
  );
};

export default ChangeList;
