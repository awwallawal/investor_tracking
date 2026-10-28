import React from 'react';
import { Box, Card, Typography } from '@mui/material';

// A card section of a detail page (story 11.16): a header row with the title
// (h2), an optional line under it and actions on the right, then the content.
// `flush` drops the content padding (for a table or a list that has its own).
const SectionCard = ({
  title, subtitle, actions, children, flush = false, headingLevel = 2, id,
}) => (
  <Card component="section" aria-labelledby={id ? `${id}-title` : undefined} aria-label={id ? undefined : (typeof title === 'string' ? title : undefined)} sx={{ minWidth: 0 }}>
    {(title || actions) && (
      <Box sx={{
        display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', justifyContent: 'space-between', px: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 2.5 }, pb: flush ? 1.5 : 0,
      }}
      >
        <Box sx={{ minWidth: 0 }}>
          {title && (
            <Typography id={id ? `${id}-title` : undefined} variant="h6" component={`h${headingLevel}`} sx={{ fontSize: 17, lineHeight: 1.4, overflowWrap: 'anywhere' }}>
              {title}
            </Typography>
          )}
          {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
        </Box>
        {actions && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>{actions}</Box>}
      </Box>
    )}
    <Box sx={flush ? { minWidth: 0 } : { px: { xs: 2, sm: 3 }, py: { xs: 2, sm: 2.5 }, minWidth: 0 }}>
      {children}
    </Box>
  </Card>
);

export default SectionCard;
