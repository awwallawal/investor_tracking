import React from 'react';
import {
  FormControl, FormHelperText, InputLabel, ListSubheader, MenuItem, Select, TextField,
} from '@mui/material';
import {
  PRIORITY_SECTORS, OTHER_SECTORS, NOT_RECORDED, isSectorValue,
} from '../constants/sectors';

// Sector picker (priority sectors first) and the optional sector detail text
// (story 11.14). `values` holds sector and sectorDetail; `onChange(name, value)`.
// A stored value that is not on the list (an old record not yet cleaned up)
// stays shown and selectable, so saving the form does not change it.
// `emptyLabel`: when set, an empty choice with that label is offered
// (projects: "Use the investor's sector").
const SectorFields = ({
  values, onChange, required = false, emptyLabel, helperText, id = 'sector',
}) => {
  const value = values.sector || '';
  const legacy = value && !isSectorValue(value) ? value : null;
  const hasEmpty = emptyLabel !== undefined;
  const help = helperText || (legacy ? 'This old value is not on the sector list: choose one from the list.' : null);
  return (
    <>
      <FormControl fullWidth margin="normal" required={required}>
        <InputLabel id={`${id}-label`} shrink={hasEmpty || !!value}>Sector</InputLabel>
        <Select
          labelId={`${id}-label`}
          label="Sector"
          name="sector"
          value={value}
          displayEmpty={hasEmpty}
          notched={hasEmpty || !!value}
          onChange={(e) => onChange('sector', e.target.value)}
        >
          {hasEmpty && <MenuItem value=""><em>{emptyLabel}</em></MenuItem>}
          {legacy && <MenuItem value={legacy}>{`${legacy} (old value)`}</MenuItem>}
          <ListSubheader>SABER priority sectors</ListSubheader>
          {PRIORITY_SECTORS.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          <ListSubheader>Other sectors</ListSubheader>
          {OTHER_SECTORS.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          <MenuItem value={NOT_RECORDED}>{NOT_RECORDED}</MenuItem>
        </Select>
        {help && <FormHelperText>{help}</FormHelperText>}
      </FormControl>
      <TextField
        name="sectorDetail"
        label="Sector detail (optional)"
        value={values.sectorDetail || ''}
        onChange={(e) => onChange('sectorDetail', e.target.value)}
        fullWidth
        margin="normal"
      />
    </>
  );
};

export default SectorFields;
