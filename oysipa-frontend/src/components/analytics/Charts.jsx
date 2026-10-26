import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { tokens } from '../../theme';

// Pure CSS charts for the analytics screens (story 11.14; no chart library).
// Each chart is role="img" with an aria-label that lists every value, and each
// bar links to the filtered list behind it when the item has a `to`.

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

// "Agribusiness 27, Manufacturing 5" for the aria-label.
const valuesLabel = (title, items, valueOf = (i) => i.count) => (
  `${title}: ${items.map((i) => `${i.label} ${fmt(valueOf(i))}`).join(', ')}`
);

const MaybeLink = ({ to, children, label, sx }) => (to ? (
  <Box component={RouterLink} to={to} aria-label={label} sx={{ color: 'inherit', textDecoration: 'none', '&:hover .bar-fill': { opacity: 0.85 }, '&:hover .bar-label': { color: tokens.maroon }, ...sx }}>
    {children}
  </Box>
) : <Box sx={sx}>{children}</Box>);

// Horizontal bars: [{ label, count, to, priority, notRecorded }].
export const BarList = ({
  title, items, color = tokens.maroon, maxRows, emptyText = 'No data yet.',
}) => {
  const rows = maxRows ? items.slice(0, maxRows) : items;
  const max = Math.max(1, ...rows.map((i) => i.count));
  if (!rows.length) return <Typography variant="body2" color="text.secondary">{emptyText}</Typography>;
  return (
    <Box role="img" aria-label={valuesLabel(title, rows)} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {rows.map((i) => {
        const fill = i.notRecorded || i.unknown ? tokens.border : (i.priority === false ? tokens.blue : color);
        return (
          <MaybeLink
            key={i.label}
            to={i.to}
            label={`${i.label}: ${fmt(i.count)}`}
            sx={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 38%) 1fr auto', alignItems: 'center', gap: 1.25, fontSize: 13 }}
          >
            <Box component="span" className="bar-label" sx={{ overflowWrap: 'anywhere', fontWeight: i.priority ? 600 : 400, color: i.notRecorded || i.unknown ? 'text.secondary' : 'text.primary' }}>
              {i.label}
              {i.priority && <Box component="span" sx={{ ml: 0.5, color: tokens.maroon, fontSize: 11 }} aria-hidden="true">★</Box>}
            </Box>
            <Box component="span" sx={{ height: 10, borderRadius: 5, bgcolor: tokens.rowDivider, overflow: 'hidden', display: 'block' }}>
              <Box component="span" className="bar-fill" sx={{ display: 'block', height: '100%', width: `${Math.round((i.count / max) * 100)}%`, bgcolor: fill, borderRadius: 5 }} />
            </Box>
            <Box component="span" className="tabular-nums" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, minWidth: 28, textAlign: 'right' }}>{fmt(i.count)}</Box>
          </MaybeLink>
        );
      })}
    </Box>
  );
};

// Vertical bars by year: [{ year, count, overlay?, to?, highlight? }].
// `overlay` (e.g. OYSIPA-named) is drawn inside the bar in the darker colour.
export const YearColumns = ({
  title, series, overlayLabel, height = 170,
}) => {
  const max = Math.max(1, ...series.map((s) => s.count));
  const label = `${title}: ${series.map((s) => `${s.year} ${fmt(s.count)}${overlayLabel ? ` (${fmt(s.overlay)} ${overlayLabel})` : ''}`).join(', ')}`;
  return (
    <Box role="img" aria-label={label}>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: { xs: 1, sm: 2 }, height: height + 24 }}>
        {series.map((s) => {
          const h = Math.round((s.count / max) * height);
          const oh = s.count ? Math.round(((s.overlay || 0) / s.count) * h) : 0;
          return (
            <MaybeLink
              key={s.year}
              to={s.to}
              label={`${s.year}: ${fmt(s.count)}${overlayLabel ? `, ${fmt(s.overlay)} ${overlayLabel}` : ''}`}
              sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}
            >
              <Box component="span" className="tabular-nums" sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>{fmt(s.count)}</Box>
              <Box
                component="span"
                className="bar-fill"
                sx={{
                  width: '100%', maxWidth: 56, height: Math.max(h, s.count ? 2 : 0), borderRadius: '8px 8px 0 0', position: 'relative', overflow: 'hidden', display: 'block',
                  bgcolor: s.highlight ? tokens.maroon : tokens.maroonTint2,
                }}
              >
                {overlayLabel && oh > 0 && (
                  <Box component="span" sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: oh, bgcolor: tokens.maroon, display: 'block' }} />
                )}
              </Box>
            </MaybeLink>
          );
        })}
      </Box>
      <Box aria-hidden="true" sx={{ display: 'flex', gap: { xs: 1, sm: 2 }, mt: 0.75, borderTop: 1, borderColor: 'divider', pt: 0.75 }}>
        {series.map((s) => (
          <Box key={s.year} sx={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 12, color: 'text.secondary' }}>{s.year}</Box>
        ))}
      </Box>
    </Box>
  );
};
