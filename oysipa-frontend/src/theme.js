import { createTheme } from '@mui/material';

// OYSIPA design system (story 11.13): the owner-approved lighter look.
// Maroon and blue on a warm off-white, white cards with a soft border.
export const tokens = {
  maroon: '#850504',
  maroonDark: '#5E0302',
  maroonTint: '#FBF1F0',
  maroonTint2: '#F1E4E3',
  blue: '#0A558C',
  blueTint: '#E6EEF5',
  background: '#FAFAF8',
  paper: '#FFFFFF',
  divider: '#ECE8E2',
  text: '#1F1D1B',
  textSecondary: '#5C5752',
  warningTint: '#FFF4D6',
  warningText: '#6B4A00',
  success: '#1E7A4D',
  successTint: '#E3F2EA',
  // Shell and control colours.
  border: '#DCD6CE', // inputs, outlined buttons, search box
  inputBg: '#FBFAF8', // top-bar search box
  rowDivider: '#F0ECE6', // table row lines
  navGroupLabel: '#6E665F',
  navText: '#3D3935',
  navHover: '#F6F1F0',
  neutralTint: '#F4F1EC', // default badge
  primaryBorder: '#F0D9D7', // primary StatCard
  warningBorder: '#F3E2B3', // warning StatCard
  infoBorder: '#CFDDEA', // info StatCard
  badge: '#F4B400', // sidebar untagged badge
  badgeText: '#3B0706',
  cardShadow: '0 1px 2px rgba(31,29,27,.03), 0 6px 18px rgba(31,29,27,.03)',
};

const theme = createTheme({
  palette: {
    primary: {
      main: tokens.maroon,
      dark: tokens.maroonDark,
      light: tokens.maroonTint2,
      tint: tokens.maroonTint,
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: tokens.blue,
      light: tokens.blueTint,
      tint: tokens.blueTint,
      contrastText: '#FFFFFF',
    },
    // Kept: screens use the `accent` key; it is the blue.
    accent: {
      main: tokens.blue,
      light: tokens.blueTint,
      tint: tokens.blueTint,
      contrastText: '#FFFFFF',
    },
    success: { main: tokens.success },
    warning: { main: tokens.badge, light: tokens.warningTint, tint: tokens.warningTint, dark: tokens.warningText },
    error: { main: '#DC3545' },
    text: { primary: tokens.text, secondary: tokens.textSecondary },
    background: { default: tokens.background, paper: tokens.paper },
    divider: tokens.divider,
  },
  // shape.borderRadius stays at MUI's 4 so existing sx `borderRadius: n` keep their size;
  // the radii below are set per component.
  typography: {
    fontFamily: 'Poppins, sans-serif',
    // Headings shrink on phones (below 600px) so long titles fit.
    h1: { fontSize: '32px', fontWeight: 700, lineHeight: 1.2, '@media (max-width:599.95px)': { fontSize: '26px' } },
    h2: { fontSize: '24px', fontWeight: 700, lineHeight: 1.3, '@media (max-width:599.95px)': { fontSize: '21px' } },
    h3: { fontSize: '20px', fontWeight: 600, lineHeight: 1.4, '@media (max-width:599.95px)': { fontSize: '18px' } },
    h4: { fontWeight: 700, letterSpacing: '-0.01em', '@media (max-width:599.95px)': { fontSize: '1.5rem', lineHeight: 1.3 } },
    h5: { fontWeight: 600, '@media (max-width:599.95px)': { fontSize: '1.25rem' } },
    h6: { fontWeight: 600 },
    body1: { fontSize: '16px', fontWeight: 400, lineHeight: 1.5 },
    body2: { fontSize: '14px', fontWeight: 400, lineHeight: 1.5 },
    button: { textTransform: 'none', fontWeight: 600 },
    // Small uppercase label above titles and on stat cards.
    overline: { fontSize: '12px', fontWeight: 500, letterSpacing: '0.04em', lineHeight: 1.5, textTransform: 'uppercase' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: tokens.background, color: tokens.text },
        // Tabular numbers for stats and tables.
        '.tabular-nums': { fontVariantNumeric: 'tabular-nums' },
      },
    },
    MuiPaper: {
      styleOverrides: {
        rounded: { borderRadius: 16 },
        outlined: { borderColor: tokens.divider },
      },
    },
    MuiCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: `1px solid ${tokens.divider}`,
          boxShadow: tokens.cardShadow,
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          '&.MuiPaper-root': {
            border: `1px solid ${tokens.divider}`,
            boxShadow: tokens.cardShadow,
          },
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10, textTransform: 'none', fontWeight: 600 },
        outlined: { borderColor: tokens.border },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 10 },
        notchedOutline: { borderColor: tokens.border },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottomColor: tokens.rowDivider },
        head: { fontSize: '12px', fontWeight: 600, color: tokens.textSecondary, whiteSpace: 'nowrap' },
      },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 500 } },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 10, '&.MuiPaper-rounded': { borderRadius: 10 } } },
    },
    MuiPopover: {
      styleOverrides: { paper: { '&.MuiPaper-rounded': { borderRadius: 12 } } },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: 16 } },
    },
  },
});

export default theme;
