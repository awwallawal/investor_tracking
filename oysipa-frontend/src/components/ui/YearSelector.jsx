import React from 'react';
import { Box, Button, MenuItem, TextField } from '@mui/material';

export const ALL_YEARS = 'all';
export const FIRST_YEAR = 2023;

// Year buttons: firstYear … current, then "All years" (DG dashboard, SABER
// report). With `minYear` below firstYear, an "Earlier years" choice lists
// firstYear - 1 down to minYear.
const YearSelector = ({
  value, onChange, currentYear, firstYear = FIRST_YEAR, minYear = firstYear,
}) => {
  const years = [];
  for (let y = firstYear; y <= currentYear; y += 1) years.push(y);
  const earlier = [];
  for (let y = Math.min(firstYear, currentYear + 1) - 1; y >= minYear; y -= 1) earlier.push(y);
  const earlierValue = value !== ALL_YEARS && earlier.includes(Number(value)) ? String(value) : '';
  return (
    <Box role="group" aria-label="Year" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, ...(earlier.length > 0 && { alignItems: 'center' }) }}>
      {[...years.map(String), ALL_YEARS].map((y) => {
        const active = String(value) === y;
        return (
          <Button
            key={y}
            size="small"
            variant={active ? 'contained' : 'outlined'}
            aria-pressed={active}
            onClick={() => onChange(y === ALL_YEARS ? ALL_YEARS : Number(y))}
          >
            {y === ALL_YEARS ? 'All years' : y}
          </Button>
        );
      })}
      {earlier.length > 0 && (
        <TextField
          select
          size="small"
          label="Earlier years"
          value={earlierValue}
          onChange={(e) => onChange(Number(e.target.value))}
          sx={{ minWidth: 140 }}
        >
          {earlier.map((y) => <MenuItem key={y} value={String(y)}>{y}</MenuItem>)}
        </TextField>
      )}
    </Box>
  );
};

export default YearSelector;
