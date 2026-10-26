import React from 'react';
import { Card, Box, IconButton, Link, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { tokens } from '../../theme';

// Layout shell for a list's search and filters (no data logic here):
// the search slot and filter slots on top, then the result count, the
// active-filter chips (each removable) and "Clear all".
// `chips` is a list of { key, label, onRemove }.
// Empty values (and 0) are never printed as a bare "0" or "".
const hasValue = (v) => v !== null && v !== undefined && v !== '' && v !== false && v !== 0;

const FilterBar = ({ search, filters, resultCount, chips = [], onClearAll }) => (
  <Card component="section" aria-label="Search and filters" sx={{ p: 2, mb: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', '& > *': { minWidth: 0 } }}>
      {search && <Box sx={{ flex: '1 1 280px', display: 'flex', '& > *': { flexGrow: 1 } }}>{search}</Box>}
      {filters}
    </Box>
    {(hasValue(resultCount) || chips.length > 0) && (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', fontSize: 13 }}>
        {hasValue(resultCount) && (
          <Typography variant="body2" component="span" color="text.secondary" className="tabular-nums" sx={{ fontSize: 13 }}>
            {resultCount}
          </Typography>
        )}
        {chips.map((chip) => (
          <Box
            component="span"
            key={chip.key}
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: 0.25, borderRadius: '999px',
              bgcolor: tokens.maroonTint2, color: tokens.maroonDark, pl: 1.25, pr: 0.25, py: 0.25, fontSize: 13,
            }}
          >
            {chip.label}
            {chip.onRemove && (
              <IconButton size="small" aria-label={`Remove ${chip.label}`} onClick={chip.onRemove} sx={{ color: 'inherit', p: 0.25 }}>
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            )}
          </Box>
        ))}
        {chips.length > 0 && onClearAll && (
          <Link component="button" type="button" variant="body2" onClick={onClearAll} sx={{ fontSize: 13 }}>
            Clear all
          </Link>
        )}
      </Box>
    )}
  </Card>
);

export default FilterBar;
