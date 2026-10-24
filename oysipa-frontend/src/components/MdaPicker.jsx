import React from 'react';
import { Autocomplete, TextField, createFilterOptions } from '@mui/material';
import { mdaOptionLabel } from '../api/mdas';

// Searchable multi-select over the Oyo MDA list (story 11.7c). `value` and
// `onChange` use MDA codes. Search matches the name, abbreviation or code.
const filterOptions = createFilterOptions({
  stringify: (m) => `${m.name} ${m.abbreviation || ''} ${m.code}`,
});

const MdaPicker = ({
  mdas, value, onChange, label = 'MDA responsible', showMou = true, disabled = false, id = 'mda-picker', placeholder,
}) => {
  const byCode = Object.fromEntries((mdas || []).map((m) => [m.code, m]));
  const selected = (value || []).map((code) => byCode[code] || {
    code, name: code, abbreviation: '', mou: false,
  });
  const optionLabel = (m) => (showMou ? mdaOptionLabel(m) : m.name);

  return (
    <Autocomplete
      id={id}
      multiple
      disableCloseOnSelect
      options={mdas || []}
      value={selected}
      onChange={(_e, next) => onChange(next.map((m) => m.code))}
      getOptionLabel={optionLabel}
      isOptionEqualToValue={(o, v) => o.code === v.code}
      filterOptions={filterOptions}
      disabled={disabled}
      renderOption={(props, m) => {
        const { key, ...rest } = props;
        return <li key={key} {...rest}>{optionLabel(m)}</li>;
      }}
      renderInput={(params) => (
        <TextField {...params} label={label} variant="standard" margin="dense" placeholder={placeholder} />
      )}
    />
  );
};

export default MdaPicker;
