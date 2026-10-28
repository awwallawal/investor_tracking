import React from 'react';
import { Box } from '@mui/material';
import { tokens } from '../../theme';
import { statusTone } from './statusTones';

const BADGE_TONES = {
  default: { bg: tokens.neutralTint, fg: tokens.navText },
  primary: { bg: tokens.maroonTint2, fg: tokens.maroonDark },
  info: { bg: tokens.blueTint, fg: tokens.blue },
  warning: { bg: tokens.warningTint, fg: tokens.warningText },
  success: { bg: tokens.successTint, fg: tokens.success },
};

// A small rounded pill for a status or a type. Without `tone`, the tone comes
// from the shared status map (statusTones.js).
const StatusBadge = ({ label, tone }) => {
  const resolved = tone || statusTone(label);
  const c = BADGE_TONES[resolved] || BADGE_TONES.default;
  return (
    <Box
      component="span"
      data-tone={resolved}
      sx={{
        display: 'inline-block',
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.5,
        borderRadius: '999px',
        px: 1.25,
        py: 0.25,
        bgcolor: c.bg,
        color: c.fg,
        whiteSpace: 'nowrap',
        verticalAlign: 'middle',
      }}
    >
      {label}
    </Box>
  );
};

export default StatusBadge;
