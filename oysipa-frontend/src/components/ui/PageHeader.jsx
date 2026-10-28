import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Breadcrumbs, Link, Typography } from '@mui/material';

// "Investors / Name": links for the parents, plain text for the current page.
export const PageBreadcrumbs = ({ items }) => (
  <Breadcrumbs aria-label="Breadcrumb" sx={{ mb: 1.5, fontSize: 13, '& .MuiBreadcrumbs-ol': { flexWrap: 'wrap' }, '& .MuiBreadcrumbs-li': { minWidth: 0, overflowWrap: 'anywhere' } }}>
    {items.map((item, i) => (item.to ? (
      <Link key={`${i}-${item.label}`} component={RouterLink} to={item.to} underline="hover">{item.label}</Link>
    ) : (
      <Typography key={`${i}-${item.label}`} component="span" color="text.secondary" sx={{ fontSize: 13 }} aria-current="page">{item.label}</Typography>
    )))}
  </Breadcrumbs>
);

const PageHeaderBody = ({
  eyebrow, title, subtitle, actions, meta,
}) => (
  <Box
    component="header"
    sx={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 2,
      alignItems: { xs: 'stretch', sm: 'flex-end' },
      justifyContent: 'space-between',
      flexDirection: { xs: 'column', sm: 'row' },
      mb: 3,
    }}
  >
    <Box sx={{ minWidth: 0 }}>
      {eyebrow && (
        <Typography variant="overline" component="p" color="text.secondary" sx={{ display: 'block' }}>
          {eyebrow}
        </Typography>
      )}
      <Typography variant="h4" component="h1" sx={{ mt: eyebrow ? 0.5 : 0, overflowWrap: 'anywhere' }}>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
          {subtitle}
        </Typography>
      )}
      {meta && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>{meta}</Box>}
    </Box>
    {actions && (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, flexDirection: { xs: 'column', sm: 'row' } }}>
        {actions}
      </Box>
    )}
  </Box>
);

// Top of every redesigned screen: optional breadcrumb, small eyebrow label,
// the page title (h1), an optional line under it and the page's main buttons
// on the right. breadcrumbs: [{ label, to }] (the last item, without `to`, is
// the current page). meta: badges shown under the title.
const PageHeader = ({
  eyebrow, title, subtitle, actions, breadcrumbs, meta,
}) => (
  <>
    {breadcrumbs && breadcrumbs.length > 0 && <PageBreadcrumbs items={breadcrumbs} />}
    <PageHeaderBody eyebrow={eyebrow} title={title} subtitle={subtitle} actions={actions} meta={meta} />
  </>
);

export default PageHeader;
