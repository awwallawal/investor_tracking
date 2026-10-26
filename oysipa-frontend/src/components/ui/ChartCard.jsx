import React from 'react';
import { Card, Box, Typography } from '@mui/material';

// A card that frames a chart or a widget: title, optional subtitle and legend
// on top, the content, then an optional small footnote.
// `legend` is a list of { label, color } or any node.
const ChartCard = ({ title, subtitle, legend, footnote, children }) => (
  <Card component="section" aria-label={typeof title === 'string' ? title : undefined} sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h6" component="h2" sx={{ fontSize: 18, lineHeight: 1.4 }}>{title}</Typography>
        {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
      </Box>
      {Array.isArray(legend) ? (
        <Box component="ul" aria-label="Legend" sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, m: 0, p: 0, listStyle: 'none' }}>
          {legend.map((item) => (
            <Box component="li" key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12, color: 'text.secondary' }}>
              <Box aria-hidden="true" sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: item.color }} />
              {item.label}
            </Box>
          ))}
        </Box>
      ) : legend}
    </Box>
    <Box sx={{ mt: 2, minWidth: 0 }}>{children}</Box>
    {footnote && (
      <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 2 }}>
        {footnote}
      </Typography>
    )}
  </Card>
);

export default ChartCard;
