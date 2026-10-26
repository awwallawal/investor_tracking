import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Card, CardActionArea, Box, Typography } from '@mui/material';
import { tokens } from '../../theme';

// Colour sets per tone: card background, border, label and number colours.
const STAT_TONES = {
  default: { bg: tokens.paper, border: tokens.divider, label: tokens.textSecondary, value: tokens.text, hint: tokens.textSecondary },
  primary: { bg: tokens.maroonTint, border: tokens.primaryBorder, label: tokens.maroon, value: tokens.maroonDark, hint: tokens.textSecondary },
  warning: { bg: tokens.warningTint, border: tokens.warningBorder, label: tokens.warningText, value: tokens.warningText, hint: tokens.warningText },
  info: { bg: tokens.blueTint, border: tokens.infoBorder, label: tokens.blue, value: tokens.blue, hint: tokens.textSecondary },
};

// One headline number. With `to`, the whole card links there.
const StatCard = ({ label, value, hint, tone = 'default', to }) => {
  const c = STAT_TONES[tone] || STAT_TONES.default;
  const body = (
    <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1, height: '100%', boxSizing: 'border-box' }}>
      <Typography variant="overline" component="div" sx={{ color: c.label, lineHeight: 1.4 }}>
        {label}
      </Typography>
      <Typography
        component="p"
        className="tabular-nums"
        sx={{ fontSize: { xs: 28, sm: 34 }, fontWeight: 700, lineHeight: 1.1, color: c.value, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}
      >
        {value}
      </Typography>
      {hint && (
        <Typography variant="body2" component="div" sx={{ color: c.hint, fontSize: 13 }}>
          {hint}
        </Typography>
      )}
    </Box>
  );

  return (
    <Card data-tone={tone} sx={{ height: '100%', bgcolor: c.bg, borderColor: c.border }}>
      {to ? (
        <CardActionArea component={RouterLink} to={to} sx={{ height: '100%', alignItems: 'stretch' }}>
          {body}
        </CardActionArea>
      ) : body}
    </Card>
  );
};

export default StatCard;
