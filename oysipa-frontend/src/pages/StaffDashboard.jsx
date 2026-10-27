import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, CircularProgress, Alert, Card, Button, Link,
} from '@mui/material';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import { jwtDecode } from 'jwt-decode';
import ProjectSummaryCard from '../components/ProjectSummaryCard';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';
import { BarList } from '../components/analytics/Charts';
import apiClient from '../api/api';
import { formatMoneyCompact } from '../utils/money';
import { formatCount, otherCurrenciesText } from '../utils/analytics';
import { mainDate } from '../utils/dates';
import { tokens } from '../theme';

// "Needs your attention" rows, from mine.attention (story 11.14).
const ATTENTION = [
  {
    key: 'noContact', title: (a) => `No contact in ${a.days || 60}+ days`, text: 'Investors you look after with no interaction logged recently.', action: 'Review', bg: tokens.warningTint, fg: tokens.warningText,
  },
  {
    key: 'missingFields', title: () => 'Records missing T1–T11 fields', text: 'Sector, country, lead source, first-contact date or a project value still empty.', action: 'Complete', bg: tokens.maroonTint, fg: tokens.maroon,
  },
  {
    key: 'staleIssues', title: () => 'Open issues waiting on an action', text: (a) => `Last action more than ${a.days || 14} days ago.`, action: 'Add action', bg: tokens.maroonTint, fg: tokens.maroon,
  },
  {
    key: 'untaggedInteractions', title: () => 'Interactions without a SABER code', text: 'Tag the service so it counts in the SABER report.', action: 'Tag', bg: tokens.blueTint, fg: tokens.blue,
  },
  {
    key: 'untaggedFiles', title: () => 'Files in the library waiting for a tag', text: 'Library-wide count: untagged files belong to no investor yet. Link the ones that are yours.', action: 'Tag files', bg: tokens.blueTint, fg: tokens.blue,
  },
];

const pipelineText = (values) => {
  if (!values) return { value: '₦0', hint: '' };
  const eq = values.ngnEquivalent;
  const ngn = values.byCurrency && values.byCurrency.NGN;
  if (eq && eq.value !== null) return { value: formatMoneyCompact(eq.value, 'NGN'), equivalent: true };
  const others = otherCurrenciesText(values.byCurrency);
  return { value: formatMoneyCompact(ngn ? ngn.sum : 0, 'NGN'), others };
};

const StaffDashboard = () => {
  const [projects, setProjects] = useState([]);
  const [mine, setMine] = useState(null);
  const [mineError, setMineError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const decodedToken = jwtDecode(token);
        setUser(decodedToken.user);
      } catch (err) {
        console.error('Error decoding token:', err);
        setError('Invalid session. Please log in again.');
        setLoading(false);
      }
    } else {
      setError('No authentication token found. Please log in.');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    const loadProjects = apiClient.get('/api/staff/dashboard')
      .then(({ data }) => { if (active) setProjects(Array.isArray(data) ? data : []); })
      .catch((err) => {
        console.error('Error fetching dashboard data:', err);
        if (active) setError(err.response?.data?.msg || 'Failed to fetch dashboard data');
      });
    const loadMine = apiClient.get('/api/analytics/mine')
      .then(({ data }) => { if (active) setMine(data && typeof data === 'object' && !Array.isArray(data) ? data : null); })
      .catch((err) => {
        console.error('Error fetching my numbers:', err);
        if (active) setMineError('Could not load your numbers.');
      });
    Promise.all([loadProjects, loadMine]).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!user) {
    return null;
  }

  const myInvestors = mine ? mine.investors.total : 0;
  // Card links open exactly the records the card counts (story 11.15): Staff
  // see their assigned investors (officer=me); DG/Admin (scope all) everything.
  const own = !mine || mine.scope === 'assigned';
  // The API sends the targets (mine.investors.to, openIssuesTo, interactionsLogged.to); older responses fall back.
  const investorsLink = mine?.investors?.to || (own ? '/investors?officer=me' : '/investors');
  const openIssuesLink = mine?.openIssuesTo || `/issues?status=Open&status=${encodeURIComponent('In progress')}${own ? '&officer=me' : ''}`;
  const loggedLink = mine?.interactionsLogged?.to || undefined;
  const pipeline = pipelineText(mine && mine.values);
  const stageItems = mine ? mine.stages.items.filter((i) => i.count > 0) : [];
  const glance = mine && mine.glance;
  const glanceValue = glance ? pipelineText(glance.values) : null;

  return (
    <Box>
      <PageHeader
        eyebrow="My work"
        title={user.name ? `Welcome, ${user.name}` : 'Welcome'}
        subtitle={mine
          ? `You look after ${formatCount(myInvestors)} investor${myInvestors === 1 ? '' : 's'}. Here is what needs you today.`
          : `Role: ${user.role}`}
        actions={(
          <>
            <Button variant="outlined" component={RouterLink} to="/issues">Register issue</Button>
            <Button variant="outlined" component={RouterLink} to="/announcements">Register announcement</Button>
            <Button variant="contained" component={RouterLink} to="/interactions">+ Log interaction</Button>
          </>
        )}
      />
      {mineError && <Alert severity="warning" sx={{ mb: 2 }}>{mineError}</Alert>}

      <Box
        component="section"
        aria-label="My numbers"
        sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', mb: 3 }}
      >
        <StatCard label="My investors" value={formatCount(myInvestors)} hint="assigned to you" tone="primary" to={investorsLink} />
        <StatCard
          label="My pipeline"
          value={pipeline.value}
          hint={`across ${formatCount(mine ? mine.projects.total : projects.length)} projects${pipeline.equivalent ? ' (₦ equivalent)' : ''}${pipeline.others ? ` · + ${pipeline.others}` : ''}`}
        />
        <StatCard
          label="Logged this month"
          value={formatCount(mine ? mine.interactionsLogged.thisMonth : 0)}
          hint={`interactions · ${formatCount(mine ? mine.interactionsLogged.lastMonth : 0)} last month`}
          to={loggedLink}
        />
        <StatCard label="Open issues" value={formatCount(mine ? mine.openIssues : 0)} hint="on your investors" tone="warning" to={openIssuesLink} />
      </Box>

      {mine && myInvestors === 0 && (
        <Card sx={{ mb: 3 }}>
          <EmptyState
            icon={<ApartmentOutlinedIcon />}
            title="No investors assigned to you yet"
            text="When the DG or Portal-Admin assigns an investor to you, your numbers and to-dos appear here."
          />
        </Card>
      )}

      {mine && (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1.6fr 1fr' }, mb: 4, alignItems: 'start' }}>
          <Card component="section" aria-label="Needs your attention" sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 1, mb: 2 }}>
              <Typography variant="h6" component="h2" sx={{ fontSize: 18 }}>Needs your attention</Typography>
              <Typography variant="caption" color="text.secondary">worked out from your records</Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {ATTENTION.map((row) => {
                const a = mine.attention[row.key] || { count: 0 };
                const text = typeof row.text === 'function' ? row.text(a) : row.text;
                return (
                  <Box
                    key={row.key}
                    component={RouterLink}
                    to={a.to || '/'}
                    data-testid={`attention-${row.key}`}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 2, p: 1.5, borderRadius: 3, border: 1, borderColor: 'divider', color: 'inherit', textDecoration: 'none', '&:hover': { bgcolor: tokens.navHover },
                    }}
                  >
                    <Box component="span" sx={{
                      minWidth: 44, height: 44, borderRadius: 2, bgcolor: row.bg, color: row.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                    }}
                    >
                      {formatCount(a.count)}
                    </Box>
                    <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
                      <Box component="span" sx={{ display: 'block', fontWeight: 600 }}>{row.title(a)}</Box>
                      <Box component="span" sx={{ display: 'block', fontSize: 13, color: 'text.secondary' }}>{text}</Box>
                    </Box>
                    <Box component="span" sx={{ color: tokens.maroon, fontSize: 13, whiteSpace: 'nowrap', display: { xs: 'none', sm: 'inline' } }}>{`${row.action} →`}</Box>
                  </Box>
                );
              })}
            </Box>
          </Card>

          <Box component="aside" sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <Card component="section" aria-label="My pipeline by stage" sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography variant="h6" component="h2" sx={{ fontSize: 18, mb: 2 }}>My pipeline by stage</Typography>
              <BarList title="My pipeline by stage" items={stageItems} emptyText="No projects on your investors yet." />
            </Card>
            <Card component="section" aria-label="Recent on my investors" sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography variant="h6" component="h2" sx={{ fontSize: 18, mb: 1.5 }}>Recent on my investors</Typography>
              {mine.recent.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No interactions logged yet.</Typography>
              ) : (
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                  {mine.recent.map((r) => (
                    <Box component="li" key={r._id} sx={{ fontSize: 14 }}>
                      <b>{r.category}</b>
                      {r.investor && (
                        <>
                          {' · '}
                          <Link component={RouterLink} to={`/investors/${r.investor._id}`}>{r.investor.investorName}</Link>
                        </>
                      )}
                      <Box sx={{ fontSize: 12, color: 'text.secondary' }}>
                        {`${mainDate(r, 'interactionDate')} · ${r.mine ? 'you' : (r.loggedBy?.name || 'unknown')}`}
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </Card>
            {glance && (
              <Card component="section" aria-label="Oyo State at a glance" sx={{ p: { xs: 2, sm: 3 } }}>
                <Typography variant="h6" component="h2" sx={{ fontSize: 18, mb: 1 }}>Oyo State at a glance</Typography>
                <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {`${formatCount(glance.investors)} investors · ${formatCount(glance.projects)} projects`}
                  <br />
                  {`${glanceValue.value} pipeline${glanceValue.equivalent ? ' (₦ equivalent)' : ''} · ${formatCount(glance.jobs.sum)} jobs pledged`}
                </Typography>
              </Card>
            )}
          </Box>
        </Box>
      )}

      <Typography variant="h5" component="h2" gutterBottom>
        Your Assigned Projects
      </Typography>
      {projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<AssignmentTurnedInOutlinedIcon />}
            title="All Clear!"
            text="You have no projects assigned to you at the moment. When a new project is assigned, it will appear here."
          />
        </Card>
      ) : (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
          {projects.map((project) => (
            <ProjectSummaryCard key={project._id} project={project} />
          ))}
        </Box>
      )}
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 3 }}>
        Staff see every investor but can change only the ones assigned to them; the counts here are theirs.
      </Typography>
    </Box>
  );
};

export default StaffDashboard;
