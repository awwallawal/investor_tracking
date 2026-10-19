import React from 'react';
import { TextField } from '@mui/material';
import { MIN_HAPPENED_DAY, todayLagos } from '../utils/dates';

// Officer-entered "happened" date (YYYY-MM-DD). Empty means today; the server
// rejects future dates and dates before 1990 as well.
const HappenedDateField = ({ label, value, onChange, name, disabled, helperText = 'Leave empty for today', ...rest }) => (
  <TextField
    type="date"
    margin="dense"
    fullWidth
    variant="standard"
    label={label}
    name={name}
    value={value || ''}
    onChange={(e) => onChange(e.target.value)}
    disabled={disabled}
    helperText={helperText}
    slotProps={{
      inputLabel: { shrink: true },
      htmlInput: { max: todayLagos(), min: MIN_HAPPENED_DAY },
    }}
    {...rest}
  />
);

export default HappenedDateField;
