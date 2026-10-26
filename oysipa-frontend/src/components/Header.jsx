import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar, Toolbar, Box, Button, IconButton, InputBase, Menu, MenuItem, ListItemIcon, Typography, ButtonBase,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import SearchIcon from '@mui/icons-material/Search';
import LogoutIcon from '@mui/icons-material/Logout';
import { getCurrentUser } from '../utils/currentUser';
import { initialsFor, searchShortcutLabel } from '../utils/shell';
import { tokens } from '../theme';

const SEARCH_LABEL = 'Search investors…';

const logout = (navigate) => {
  localStorage.removeItem('token');
  navigate('/login');
};

// Ctrl/⌘ K is left alone while a dialog is open or another field has focus.
const shortcutBlocked = (ownInput) => {
  if (document.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')) return true;
  const el = document.activeElement;
  if (!el || el === ownInput || el === document.body) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

// Global search (placeholder until 11.15): searches investors only. Enter goes
// to the investor directory with ?q=<text>; Ctrl/⌘ K focuses the box.
const GlobalSearch = () => {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        if (shortcutBlocked(inputRef.current)) return;
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    // Enter that confirms an IME composition (e.g. Chinese, Japanese input) is not a search.
    if (e.nativeEvent?.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    navigate(`/investors?${new URLSearchParams({ q }).toString()}`);
  };

  return (
    <Box
      component="label"
      sx={{
        flex: '1 1 320px', maxWidth: 560, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.25,
        border: `1px solid ${tokens.border}`, borderRadius: '12px', px: { xs: 1.25, sm: 1.75 }, py: { xs: 0.5, sm: 0.75 },
        bgcolor: tokens.inputBg, '&:focus-within': { borderColor: tokens.maroon },
      }}
    >
      <SearchIcon aria-hidden="true" sx={{ fontSize: 20, color: tokens.textSecondary }} />
      <InputBase
        inputRef={inputRef}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={SEARCH_LABEL}
        sx={{ flex: 1, minWidth: 0, fontSize: 14 }}
        inputProps={{ 'aria-label': SEARCH_LABEL }}
      />
      <Box
        component="kbd"
        sx={{
          display: { xs: 'none', sm: 'inline-block' }, fontFamily: 'inherit', fontSize: 12, color: tokens.textSecondary,
          border: `1px solid ${tokens.border}`, borderRadius: '6px', px: 0.75, py: '2px', whiteSpace: 'nowrap',
        }}
      >
        {searchShortcutLabel()}
      </Box>
    </Box>
  );
};

// Name (when the token has one), role and initials; the menu holds Log out.
const UserChip = ({ user }) => {
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState(null);
  const name = (user?.name || '').trim();
  const role = user?.role || '';
  const isStaff = role === 'Staff';

  const handleLogout = () => {
    setAnchor(null);
    logout(navigate);
  };

  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={anchor ? 'true' : undefined}
        aria-controls={anchor ? 'user-menu' : undefined}
        aria-label={`Account: ${name ? `${name}, ` : ''}${role}`}
        sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: '12px', p: 0.5, flexShrink: 0 }}
      >
        <Box sx={{ textAlign: 'right', display: { xs: 'none', sm: 'block' }, maxWidth: 220 }}>
          <Typography component="div" noWrap sx={{ fontSize: 14, fontWeight: 600 }}>{name || role}</Typography>
          {name && <Typography component="div" noWrap sx={{ fontSize: 12, color: tokens.textSecondary }}>{role}</Typography>}
        </Box>
        <Box
          aria-hidden="true"
          sx={{
            width: 40, height: 40, borderRadius: '999px', display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 14,
            bgcolor: isStaff ? tokens.blueTint : tokens.maroonTint2, color: isStaff ? tokens.blue : tokens.maroon,
          }}
        >
          {initialsFor(user)}
        </Box>
      </ButtonBase>
      <Menu
        id="user-menu"
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ px: 2, py: 1, display: { xs: 'block', sm: 'none' } }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{name || role}</Typography>
          {name && <Typography sx={{ fontSize: 12, color: tokens.textSecondary }}>{role}</Typography>}
        </Box>
        <MenuItem onClick={handleLogout}>
          <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
          Log out
        </MenuItem>
      </Menu>
    </>
  );
};

// Compact OYSIPA mark, shown in the top bar when the sidebar is a drawer.
const CompactMark = () => (
  <Box
    role="img"
    aria-label="OYSIPA"
    title="OYSIPA Investor Tracker"
    sx={{
      display: { xs: 'grid', md: 'none' }, placeItems: 'center', flexShrink: 0, width: 32, height: 32,
      borderRadius: '9px', bgcolor: tokens.maroon, color: '#fff', fontWeight: 700, fontSize: 15,
    }}
  >
    <span aria-hidden="true">O</span>
  </Box>
);

const Header = ({ onDrawerToggle }) => {
  const navigate = useNavigate();
  const hasToken = Boolean(localStorage.getItem('token'));
  // Signed-in state comes from one place: the decoded token.
  const user = getCurrentUser();

  return (
    <AppBar
      position="sticky"
      elevation={0}
      color="inherit"
      sx={{ bgcolor: tokens.paper, borderBottom: `1px solid ${tokens.divider}`, color: tokens.text }}
    >
      <Toolbar sx={{ gap: { xs: 1, sm: 2 }, px: { xs: 1, sm: 4 }, py: { xs: 1, sm: 1.5 }, justifyContent: 'space-between' }}>
        <IconButton
          color="inherit"
          aria-label="open drawer"
          edge="start"
          onClick={onDrawerToggle}
          sx={{ display: { md: 'none' } }}
        >
          <MenuIcon />
        </IconButton>
        <CompactMark />
        {user && <GlobalSearch />}
        {user && <UserChip user={user} />}
        {/* A token that cannot be read: no chip, just a way out. */}
        {!user && hasToken && (
          <Button variant="outlined" onClick={() => logout(navigate)} sx={{ flexShrink: 0, ml: 'auto' }}>
            Log out
          </Button>
        )}
      </Toolbar>
    </AppBar>
  );
};

export default Header;
