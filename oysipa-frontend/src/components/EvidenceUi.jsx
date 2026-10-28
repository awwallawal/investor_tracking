import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Card, CardActionArea, CardContent, Stack, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import { formatDate } from '../utils/dates';
import { plural } from '../utils/evidenceUi';
import { EVIDENCE_TYPES } from '../api/evidence';
import {
  DateRangeFilter, FacetFilter, SearchField, ToggleFilter,
} from './ui/FilterBar';
import StatCard from './ui/StatCard';
import StatusBadge from './ui/StatusBadge';
import { tokens } from '../theme';

// Shared look for the Evidence library screens.

// A palette colour, falling back to info/primary when the theme lacks it
// (e.g. the custom "accent" colour outside the app theme).
const tone = (theme, color) => (theme.palette[color] || theme.palette.info || theme.palette.primary).main;

// A soft tinted square holding an icon (brand colour by default).
export const IconTile = ({ icon, color = 'primary', size = 40 }) => (
  <Box
    aria-hidden
    sx={(theme) => ({
      width: size,
      height: size,
      flexShrink: 0,
      borderRadius: 2,
      display: 'grid',
      placeItems: 'center',
      color: tone(theme, color),
      bgcolor: alpha(tone(theme, color), 0.08),
    })}
  >
    {React.createElement(icon, { fontSize: size >= 40 ? 'medium' : 'small' })}
  </Box>
);

// One number with a label, for the summary strip (a compact StatCard).
export const StatTile = ({ label, value, tone: toneName }) => (
  <StatCard compact label={label} value={value} tone={toneName === 'warning' ? 'warning' : 'default'} />
);

// Card for a folder (library page and subfolders of a folder page). The whole
// card is one link; `ariaLabel` overrides its accessible name when given.
export const FolderCard = ({ folder, ariaLabel }) => (
  <Card
    sx={(theme) => ({
      height: '100%',
      transition: 'border-color 150ms, box-shadow 150ms, transform 150ms',
      '&:hover': {
        borderColor: theme.palette.primary.main,
        boxShadow: `0 6px 18px ${alpha(theme.palette.primary.main, 0.12)}`,
        transform: 'translateY(-1px)',
      },
    })}
  >
    <CardActionArea
      component={RouterLink}
      to={`/evidence/${folder._id}`}
      aria-label={ariaLabel}
      sx={{ height: '100%', display: 'flex', alignItems: 'stretch' }}
    >
      <CardContent sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1, p: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <IconTile icon={FolderOutlined} size={36} />
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}
            >
              {folder.name}
            </Typography>
            {folder.folderDate && <Typography variant="body2" color="text.secondary">{formatDate(folder.folderDate)}</Typography>}
          </Box>
        </Stack>
        {folder.description && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {folder.description}
          </Typography>
        )}
        <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 'auto', pt: 0.5, flexWrap: 'wrap' }}>
          <StatusBadge label={plural(folder.fileCount, 'file')} />
          {folder.untaggedCount > 0 && <StatusBadge label={`${folder.untaggedCount} untagged`} tone="warning" />}
        </Stack>
      </CardContent>
    </CardActionArea>
  </Card>
);

// Responsive grid for folder cards.
export const FolderGrid = ({ children }) => (
  <Box sx={{ display: 'grid', gap: { xs: 1.5, sm: 2 }, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
    {children}
  </Box>
);

// Dashed empty state.
export const EmptyState = ({ icon, children }) => (
  <Box
    role="status"
    sx={{
      p: { xs: 3, sm: 4 }, borderRadius: '16px', border: `1px dashed ${tokens.border}`, bgcolor: tokens.paper, textAlign: 'center', color: 'text.secondary',
    }}
  >
    {icon && <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}><IconTile icon={icon} color="accent" /></Box>}
    <Typography>{children}</Typography>
  </Box>
);

// The evidence filter controls, shared by the folder page and the library.
export const EvidenceFilters = ({ lq }) => (
  <>
    <ToggleFilter label="Untagged only" active={lq.values.untagged} onChange={(on) => lq.set({ untagged: on })} />
    <FacetFilter label="Type" options={EVIDENCE_TYPES} selected={lq.values.type} onChange={(type) => lq.set({ type })} />
    <DateRangeFilter label="Date" from={lq.values.from} to={lq.values.to} onChange={({ from, to }) => lq.set({ from, to })} />
  </>
);

export const EvidenceSearchField = ({ lq }) => (
  <SearchField
    label="Search files"
    placeholder="File name or what it is..."
    value={lq.searchInput}
    onChange={lq.setSearchInput}
    onClear={lq.clearSearch}
  />
);
