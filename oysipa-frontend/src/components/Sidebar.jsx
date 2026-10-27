import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import InsertChartOutlinedIcon from '@mui/icons-material/InsertChartOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import HistoryIcon from '@mui/icons-material/History';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { getCurrentUser } from '../utils/currentUser';
import { fetchUntaggedCount, UNTAGGED_CHANGED_EVENT } from '../api/evidence';
import { tokens } from '../theme';
import { isActivePath } from '../utils/shell';

const drawerWidth = 248;

const ALL = ['Director-General', 'Portal-Admin', 'Staff'];
const ADMINS = ['Director-General', 'Portal-Admin'];

const Sidebar = ({ mobileOpen, onDrawerToggle }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { pathname } = useLocation();
  // Signed-in state comes from one place: the decoded token.
  const user = getCurrentUser();
  const userRole = user?.role || null;
  const signedIn = Boolean(user);

  // Untagged evidence files, shown as a badge on "Evidence library". Fetched on
  // mount and whenever a library screen reports a change.
  const [untagged, setUntagged] = useState(null);
  useEffect(() => {
    if (!signedIn) return undefined;
    let active = true;
    const load = () => fetchUntaggedCount()
      .then((count) => { if (active) setUntagged(count); })
      .catch(() => { if (active) setUntagged(null); });
    load();
    window.addEventListener(UNTAGGED_CHANGED_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(UNTAGGED_CHANGED_EVENT, load);
    };
  }, [signedIn]);

  if (!signedIn) {
    return null; // Don't render sidebar if not authenticated
  }

  const groups = [
    {
      key: 'top',
      items: [
        { path: '/dashboard', name: userRole === 'Staff' ? 'My work' : 'Dashboard', icon: DashboardOutlinedIcon, roles: ALL },
      ],
    },
    {
      key: 'pipeline',
      title: 'Pipeline',
      items: [
        { path: '/investors', name: 'Investors', icon: ApartmentOutlinedIcon, roles: ALL },
        { path: '/projects', name: 'Projects', icon: InsertChartOutlinedIcon, roles: ALL },
        { path: '/interactions', name: 'Interactions', icon: ChatBubbleOutlineIcon, roles: ALL },
      ],
    },
    {
      key: 'saber',
      title: 'SABER evidence',
      items: [
        { path: '/issues', name: 'Issues', icon: ReportProblemOutlinedIcon, roles: ALL },
        { path: '/announcements', name: 'Announcements', icon: CampaignOutlinedIcon, roles: ALL },
        { path: '/evidence', name: 'Evidence library', icon: FolderOutlinedIcon, roles: ALL, badge: untagged },
      ],
    },
    {
      key: 'admin',
      title: 'Admin',
      items: [
        { path: '/saber-report', name: 'SABER report', icon: AssessmentOutlinedIcon, roles: ADMINS },
        { path: '/changelog', name: 'Change log', icon: HistoryIcon, roles: ADMINS },
        { path: '/users', name: 'Users', icon: PersonAddAltOutlinedIcon, roles: ADMINS },
        { path: '/admin', name: 'Settings', icon: SettingsOutlinedIcon, roles: ADMINS },
      ],
    },
  ]
    .map((group) => ({ ...group, items: group.items.filter((item) => userRole && item.roles.includes(userRole)) }))
    .filter((group) => group.items.length > 0);

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, px: 2, py: 3, minHeight: '100%', boxSizing: 'border-box' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1 }}>
        <Box
          aria-hidden="true"
          sx={{ width: 36, height: 36, borderRadius: '10px', bgcolor: tokens.maroon, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, flexShrink: 0 }}
        >
          O
        </Box>
        <Box>
          <Typography component="div" sx={{ fontWeight: 600, fontSize: 16, lineHeight: 1.3, color: tokens.text }}>OYSIPA</Typography>
          <Typography component="div" sx={{ fontSize: 12, color: tokens.textSecondary }}>Investor Tracker</Typography>
        </Box>
      </Box>

      {groups.map((group) => (
        <Box key={group.key} component="nav" aria-label={group.title || 'Main'}>
          {group.title && (
            <Typography
              component="div"
              sx={{ color: tokens.navGroupLabel, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', px: 1.5, pb: 0.5 }}
            >
              {group.title}
            </Typography>
          )}
          <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {group.items.map((link) => {
              const active = isActivePath(pathname, link.path);
              const Icon = link.icon;
              return (
                <ListItem key={link.path} disablePadding>
                  <ListItemButton
                    component={RouterLink}
                    to={link.path}
                    selected={active}
                    aria-current={active ? 'page' : undefined}
                    onClick={isMobile ? onDrawerToggle : undefined}
                    sx={{
                      borderRadius: '10px',
                      px: 1.5,
                      py: 1,
                      color: tokens.navText,
                      '&:hover': { bgcolor: tokens.navHover, color: tokens.maroon },
                      '&.Mui-selected, &.Mui-selected:hover': { bgcolor: tokens.maroonTint, color: tokens.maroon },
                      '&.Mui-selected .MuiListItemText-primary': { fontWeight: 600 },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 0, mr: 1.5, color: 'inherit' }}>
                      <Icon sx={{ fontSize: 20 }} />
                    </ListItemIcon>
                    <ListItemText primary={link.name} slotProps={{ primary: { sx: { fontSize: 14 } } }} />
                    {link.badge > 0 && (
                      <Box
                        component="span"
                        aria-label={`${link.badge} untagged`}
                        title="Untagged files"
                        sx={{ ml: 1, bgcolor: tokens.badge, color: tokens.badgeText, borderRadius: '999px', fontSize: 11, fontWeight: 600, px: 1, py: '1px' }}
                      >
                        {link.badge > 999 ? '999+' : link.badge}
                      </Box>
                    )}
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Box>
      ))}

      {groups.length === 0 && (
        <Typography sx={{ fontSize: 13, color: tokens.textSecondary, px: 1.5 }}>
          No menu for this role. Please contact the Portal Admin.
        </Typography>
      )}

      {userRole === 'Staff' && (
        <Typography sx={{ mt: 'auto', fontSize: 12, color: tokens.textSecondary, px: 1.5 }}>
          Staff account: Admin, users, the change log and the SABER report are for the DG and Portal-Admin.
        </Typography>
      )}
    </Box>
  );

  return (
    <Box sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
      <Drawer
        variant={isMobile ? 'temporary' : 'permanent'}
        open={isMobile ? mobileOpen : true}
        onClose={onDrawerToggle}
        ModalProps={isMobile ? { keepMounted: true } : undefined}
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            maxWidth: '85vw',
            boxSizing: 'border-box',
            bgcolor: tokens.paper,
            borderRight: `1px solid ${tokens.divider}`,
          },
        }}
      >
        {drawerContent}
      </Drawer>
    </Box>
  );
};

export default Sidebar;
