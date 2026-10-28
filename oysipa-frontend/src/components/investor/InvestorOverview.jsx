import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Button, LinearProgress, Link, Typography,
} from '@mui/material';
import SectionCard from '../ui/SectionCard';
import KeyFacts from '../ui/KeyFacts';
import EmptyState from '../ui/EmptyState';
import StatusBadge from '../ui/StatusBadge';
import { STAGE_TONE } from '../ui/statusTones';
import { COMPLETENESS_FIELDS } from '../../utils/investorPage';
import { formatMoney } from '../../utils/money';
import { tokens } from '../../theme';

const TIMELINE_STEP = 15;

const DOT = {
  interaction: tokens.maroon,
  status: tokens.blue,
  issue: tokens.badge,
  announcement: tokens.success,
};

const Tag = ({ tag }) => (tag.status ? <StatusBadge label={tag.label} /> : (
  <Box component="span" sx={{ fontSize: 12, border: `1px solid ${tokens.divider}`, borderRadius: '999px', px: 1, py: 0.25, overflowWrap: 'anywhere' }}>
    {tag.label}
  </Box>
));

const ActivityTimeline = ({ events, loading }) => {
  const [shown, setShown] = useState(TIMELINE_STEP);
  if (loading && events.length === 0) return <Typography variant="body2" color="text.secondary">Loading...</Typography>;
  if (events.length === 0) return <EmptyState title="No activity yet" text="Interactions, issues and announcements of this investor appear here." />;
  return (
    <>
      <Box component="ol" aria-label="Activity" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {events.slice(0, shown).map((e, i, list) => (
          <Box component="li" key={e.key} sx={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)', columnGap: 1.5 }}>
            <Box aria-hidden="true" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Box sx={{
                width: 12, height: 12, borderRadius: '999px', bgcolor: DOT[e.kind], mt: 0.5, boxShadow: `0 0 0 4px ${tokens.paper}, 0 0 0 5px ${tokens.divider}`,
              }}
              />
              {i < list.length - 1 && <Box sx={{ flex: 1, width: 2, bgcolor: tokens.rowDivider, my: 0.75 }} />}
            </Box>
            <Box sx={{ pb: 2.5, minWidth: 0 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1, alignItems: 'baseline' }}>
                {e.to ? (
                  <Link component={RouterLink} to={e.to} sx={{ fontWeight: 600, fontSize: 14 }}>{e.title}</Link>
                ) : (
                  <Typography component="span" sx={{ fontWeight: 600, fontSize: 14 }}>{e.title}</Typography>
                )}
                <Typography component="span" variant="caption" color="text.secondary">
                  {[e.when, e.by].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
              {e.text && <Typography variant="body2" sx={{ mt: 0.5, color: tokens.navText, overflowWrap: 'anywhere' }}>{e.text}</Typography>}
              {e.tags.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
                  {e.tags.map((t, i) => <Tag key={`${t.kind || (t.status ? 'status' : 'tag')}-${t.label}-${i}`} tag={t} />)}
                </Box>
              )}
            </Box>
          </Box>
        ))}
      </Box>
      {events.length > shown && (
        <Button size="small" onClick={() => setShown((n) => n + TIMELINE_STEP)}>
          {`Show more (${events.length - shown} older)`}
        </Button>
      )}
    </>
  );
};

const stageOf = (p) => (p.lifecycleStatus && typeof p.lifecycleStatus === 'object' ? p.lifecycleStatus.name : '') || '';

const ProjectsPanel = ({ projects, action }) => (
  <SectionCard title="Projects" actions={action}>
    {projects.length === 0 ? (
      <Typography variant="body2" color="text.secondary">No projects found for this investor.</Typography>
    ) : (
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
        {projects.map((p) => (
          <Box component="li" key={p._id} sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
              <Link component={RouterLink} to={`/projects/${p._id}`} sx={{ fontWeight: 600, fontSize: 14, overflowWrap: 'anywhere' }}>{p.projectTitle}</Link>
              {Number(p.estimatedValue) > 0 && (
                <Typography component="span" className="tabular-nums" sx={{ fontSize: 13, fontWeight: 600 }}>{formatMoney(p.estimatedValue, p.currency)}</Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center', mt: 0.5 }}>
              {stageOf(p) && <StatusBadge label={stageOf(p)} tone={STAGE_TONE} />}
              <Typography component="span" variant="caption" color="text.secondary">
                {[p.location, Number(p.estimatedNumberOfJobs) > 0 ? `${Number(p.estimatedNumberOfJobs).toLocaleString('en-US')} jobs` : ''].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    )}
  </SectionCard>
);

const CompletenessPanel = ({
  applicable, organisationType, completeness, loading, fillGapsTo,
}) => {
  let body;
  if (!applicable) {
    body = (
      <Typography variant="body2" color="text.secondary">
        {`Not applicable: the SABER check covers Investor records only (this is ${/^[AEIOU]/i.test(organisationType) ? 'an' : 'a'} ${organisationType}).`}
      </Typography>
    );
  } else if (loading) {
    body = <Typography variant="body2" color="text.secondary">Loading...</Typography>;
  } else if (!completeness) {
    body = <Typography variant="body2" color="text.secondary">Completeness is not available right now.</Typography>;
  } else if (completeness.checked === 0) {
    body = <Typography variant="body2" color="text.secondary">No project to check yet: T1–T11 are checked per project.</Typography>;
  } else {
    const total = COMPLETENESS_FIELDS.length;
    const share = Math.round((completeness.complete / total) * 100);
    body = (
      <>
        <LinearProgress
          variant="determinate"
          value={share}
          aria-label="Fields complete"
          sx={{ height: 10, borderRadius: '999px', bgcolor: tokens.rowDivider, '& .MuiLinearProgress-bar': { bgcolor: tokens.success, borderRadius: '999px' } }}
        />
        <Typography variant="body2" sx={{ mt: 1 }}>{`${completeness.complete} of ${total} fields complete`}</Typography>
        {completeness.missing.length > 0 ? (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Missing:</Typography>
            <Box component="ul" aria-label="Missing fields" sx={{ m: 0, pl: 2.5, fontSize: 14 }}>
              {completeness.missing.map((m) => <li key={m.key}>{m.label}</li>)}
            </Box>
            <Link component={RouterLink} to={fillGapsTo} sx={{ display: 'inline-block', mt: 1, fontWeight: 600, fontSize: 14 }}>Fill the gaps</Link>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Every T1–T11 field is filled on its projects.</Typography>
        )}
      </>
    );
  }
  return <SectionCard title="Record completeness (T1–T11)">{body}</SectionCard>;
};

const InvestorOverview = ({
  events, eventsLoading, projects, projectAction, completenessProps, keyFacts, notes,
}) => (
  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5, alignItems: 'flex-start' }}>
    <Box sx={{ flex: '999 1 480px', minWidth: 0 }}>
      <SectionCard title="Activity">
        <ActivityTimeline events={events} loading={eventsLoading} />
      </SectionCard>
    </Box>
    <Box component="aside" aria-label="Investor details" sx={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <ProjectsPanel projects={projects} action={projectAction} />
      <CompletenessPanel {...completenessProps} />
      <SectionCard title="Key facts">
        <KeyFacts items={keyFacts} labelWidth={130} ariaLabel="Key facts" />
      </SectionCard>
      <SectionCard title="Notes">
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{notes || '—'}</Typography>
      </SectionCard>
    </Box>
  </Box>
);

export default InvestorOverview;
