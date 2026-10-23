import React from 'react';
import {
  FormControl, InputLabel, Select, MenuItem, ListSubheader, ListItemText, Checkbox,
  FormControlLabel, FormHelperText, Box,
} from '@mui/material';
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS, SERVICE_CODES } from '../constants/serviceCodes';

// SABER service-code multi-select, grouped by category, with the verbatim
// PDF wording on each option, plus the separate "Credit linkage" flag
// (credit linkage has no service code in the PDF). Shared by
// InteractionLogForm and the "Tag services" dialog in InteractionLogList.
// showCreditLinkage=false hides the checkbox (Evidence library tags have no credit flag).
const ServiceCodePicker = ({
  value, onChange, creditLinkage, onCreditLinkageChange, disabled = false, showCreditLinkage = true,
  helperText = 'Pick every SABER service this interaction delivered (optional).',
}) => {
  const selected = value || [];

  const handleChange = (event) => {
    const next = event.target.value;
    // Ignore clicks on the group headers (they carry no value).
    const codes = (typeof next === 'string' ? next.split(',') : next).filter(Boolean);
    // Keep the PDF order, whatever order they were clicked in.
    onChange(SERVICE_CODES.map((s) => s.code).filter((c) => codes.includes(c)));
  };

  const items = [];
  SERVICE_CATEGORIES.forEach((category) => {
    items.push(<ListSubheader key={`h-${category}`}>{SERVICE_CATEGORY_LABELS[category]}</ListSubheader>);
    SERVICE_CODES.filter((s) => s.category === category).forEach((s) => {
      items.push(
        <MenuItem key={s.code} value={s.code} sx={{ alignItems: 'flex-start', whiteSpace: 'normal' }}>
          <Checkbox checked={selected.includes(s.code)} size="small" sx={{ p: 0, mr: 1, mt: 0.25 }} />
          <ListItemText
            primary={s.code}
            secondary={s.wording}
            slotProps={{ secondary: { sx: { whiteSpace: 'normal' } } }}
          />
        </MenuItem>,
      );
    });
  });

  return (
    <Box>
      <FormControl fullWidth margin="dense" variant="standard" disabled={disabled}>
        <InputLabel id="saber-services-label">SABER services</InputLabel>
        <Select
          labelId="saber-services-label"
          id="saber-services-select"
          multiple
          value={selected}
          onChange={handleChange}
          renderValue={(sel) => sel.join(', ')}
          MenuProps={{ PaperProps: { sx: { maxHeight: 420, maxWidth: 560 } } }}
        >
          {items}
        </Select>
        <FormHelperText>{helperText}</FormHelperText>
      </FormControl>
      {showCreditLinkage && (
      <FormControlLabel
        control={(
          <Checkbox
            checked={!!creditLinkage}
            onChange={(e) => onCreditLinkageChange(e.target.checked)}
            disabled={disabled}
          />
        )}
        label="Credit linkage (assistance linking investors to credit institutions)"
      />
      )}
    </Box>
  );
};

export default ServiceCodePicker;
