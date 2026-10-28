import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
    Alert, Button, Box, Card, Link as MuiLink, Tab, Tabs, Typography,
} from '@mui/material';
import InvestorEditForm from '../components/InvestorEditForm';
import UserAssignmentDropdown from '../components/UserAssignmentDropdown';
import ProjectList from '../components/ProjectList';
import ProjectForm from '../components/ProjectForm';
import InteractionLogForm from '../components/InteractionLogForm';
import InteractionLogList from '../components/InteractionLogList';
import IssueForm from '../components/IssueForm';
import InvestorOverview from '../components/investor/InvestorOverview';
import InvestorFiles from '../components/investor/InvestorFiles';
import InvestorHistory from '../components/investor/InvestorHistory';
import { PageBreadcrumbs } from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import StatusBadge from '../components/ui/StatusBadge';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import SectionCard from '../components/ui/SectionCard';
import { STAGE_TONE } from '../components/ui/statusTones';
import { fetchIssues } from '../api/issues';
import { fetchAnnouncements } from '../api/announcements';
import { fetchFillGaps } from '../api/fillGaps';
import { fetchFxRates } from '../api/fxRates';
import { issueReference } from '../constants/issueFields';
import apiClient from '../api/api';
import { getCurrentUser, isAdminRole } from '../utils/currentUser';
import { dateLine } from '../utils/dates';
import { formatMoneyCompact, ngnEquivalentOf } from '../utils/money';
import { formatCount } from '../utils/analytics';
import { buildActivity, investorCompleteness } from '../utils/investorPage';
import { DEFAULT_ORGANISATION_TYPE, UNKNOWN_LEAD_SOURCE } from '../constants/investorFields';
import { tokens } from '../theme';

// Tabs, kept in the URL as ?tab= (Overview has no parameter).
const INVESTOR_TABS = ['overview', 'projects', 'interactions', 'issues', 'announcements', 'files', 'history'];
const OPEN_ISSUE_STATUSES = ['Open', 'In progress'];

const initialsOf = (name) => String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

const stageOf = (p) => (p?.lifecycleStatus && typeof p.lifecycleStatus === 'object' ? p.lifecycleStatus.name : '') || '';
const latestProject = (projects) => [...projects].sort((a, b) => (new Date(b.createdAt || 0).getTime() || 0) - (new Date(a.createdAt || 0).getTime() || 0))[0];

// count: a number, '…' while loading or '—' after a failed load.
const TabLabel = ({ label, count }) => (
    <span>
        {label}
        {(typeof count === 'number' || typeof count === 'string') && (
            <Box component="span" className="tabular-nums" sx={{ ml: 0.75, color: 'text.secondary', fontWeight: 500 }}>{` ${count}`}</Box>
        )}
    </span>
);

const InvestorProfilePage = () => {
    const [investor, setInvestor] = useState(null);
    const [projects, setProjects] = useState([]);
    const [isEditFormOpen, setIsEditFormOpen] = useState(false);
    const [isProjectFormOpen, setIsProjectFormOpen] = useState(false);
    const [isLogFormOpen, setIsLogFormOpen] = useState(false);
    const [logs, setLogs] = useState({ loading: true, rows: [], error: null });
    const [issues, setIssues] = useState([]);
    const [issuesLoading, setIssuesLoading] = useState(true);
    const [issuesError, setIssuesError] = useState('');
    const [isIssueFormOpen, setIsIssueFormOpen] = useState(false);
    const [announcements, setAnnouncements] = useState([]);
    // 'loading' | 'loaded' | 'error'
    const [announcementsState, setAnnouncementsState] = useState('loading');
    const [fx, setFx] = useState(null);
    const [fxError, setFxError] = useState(false);
    const [completeness, setCompleteness] = useState({ loading: true, data: null });
    const completenessRequest = useRef(0);
    const { id } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const currentUser = getCurrentUser();
    const isStaff = currentUser?.role === 'Staff';
    const isAdmin = isAdminRole(currentUser?.role);

    const fetchInvestorAndProjects = useCallback(async () => {
        try {
            const [investorResponse, projectsResponse] = await Promise.all([
                apiClient.get(`/api/investors/${id}`),
                apiClient.get(`/api/projects/investors/${id}/projects`)
            ]);
            setInvestor(investorResponse.data);
            setProjects(Array.isArray(projectsResponse.data) ? projectsResponse.data : []);
        } catch (error) {
            console.error("Fetch error:", error);
        }
    }, [id]);

    useEffect(() => {
        fetchInvestorAndProjects();
    }, [id, fetchInvestorAndProjects]);

    // The interactions (investor level and its projects'), loaded once for the
    // timeline, the Interactions tab, the counts and the Files tab.
    const loadLogs = useCallback(async () => {
        try {
            const { data } = await apiClient.get(`/api/interactions/investors/${id}`);
            setLogs({ loading: false, rows: Array.isArray(data) ? data : [], error: null });
        } catch (error) {
            console.error(error);
            setLogs({ loading: false, rows: [], error: 'Failed to fetch interaction logs.' });
        }
    }, [id]);

    useEffect(() => {
        loadLogs();
    }, [loadLogs]);

    // Fetched on its own so an issues failure never blocks the profile.
    const loadIssues = useCallback(async () => {
        try {
            const data = await fetchIssues({ investor: id });
            setIssues(Array.isArray(data) ? data : []);
            setIssuesError('');
        } catch (error) {
            console.error('Issues fetch error:', error);
            setIssues([]);
            setIssuesError('Could not load the issues for this investor.');
        } finally {
            setIssuesLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadIssues();
    }, [loadIssues]);

    // Announcements are linked to projects: those of this investor's projects.
    const projectIds = projects.map((p) => p._id).join(',');
    const projectsLoaded = !!investor;
    useEffect(() => {
        if (!projectIds) {
            setAnnouncements([]);
            setAnnouncementsState(projectsLoaded ? 'loaded' : 'loading');
            return undefined;
        }
        let live = true;
        setAnnouncementsState('loading');
        fetchAnnouncements({ project: projectIds })
            .then((data) => {
                if (!live) return;
                setAnnouncements(Array.isArray(data) ? data : []);
                setAnnouncementsState('loaded');
            })
            .catch((error) => {
                console.error('Announcements fetch error:', error);
                if (!live) return;
                setAnnouncements([]);
                setAnnouncementsState('error');
            });
        return () => { live = false; };
    }, [projectIds, projectsLoaded]);

    // Exchange rates only when a project is in another currency.
    const needsFx = projects.some((p) => Number(p.estimatedValue) > 0 && p.currency && p.currency !== 'NGN');
    useEffect(() => {
        if (!needsFx) return undefined;
        let live = true;
        fetchFxRates()
            .then((data) => { if (live) { setFx(data); setFxError(false); } })
            .catch((error) => { console.error('Exchange rates fetch error:', error); if (live) { setFx(null); setFxError(true); } });
        return () => { live = false; };
    }, [needsFx]);

    const organisationType = investor?.organisationType || DEFAULT_ORGANISATION_TYPE;
    const isInvestorType = organisationType === DEFAULT_ORGANISATION_TYPE;

    // Record completeness: the Fill the gaps worklist for this investor, all years.
    // Only the newest request's answer is applied (saves can overlap).
    const loadCompleteness = useCallback(async () => {
        completenessRequest.current += 1;
        const request = completenessRequest.current;
        try {
            const data = await fetchFillGaps({ year: 'all', investor: id });
            if (request === completenessRequest.current) setCompleteness({ loading: false, data });
        } catch (error) {
            console.error('Completeness fetch error:', error);
            if (request === completenessRequest.current) setCompleteness({ loading: false, data: null });
        }
    }, [id]);
    // Interactions close T10 and investor edits T8/T11: re-check after changes.
    const refreshCompleteness = () => {
        if (isInvestorType) loadCompleteness();
    };

    useEffect(() => {
        if (investor && isInvestorType) loadCompleteness();
    }, [investor, isInvestorType, loadCompleteness]);

    const events = useMemo(
        () => buildActivity({ logs: logs.rows, issues, announcements }),
        [logs.rows, issues, announcements],
    );

    const handleIssueSaved = () => {
        setIsIssueFormOpen(false);
        loadIssues();
    };

    const handleEditSave = () => {
        setIsEditFormOpen(false);
        fetchInvestorAndProjects();
        refreshCompleteness();
    };

    const handleProjectFormSave = () => {
        setIsProjectFormOpen(false);
        fetchInvestorAndProjects();
        refreshCompleteness();
    };

    const handleLogFormSave = () => {
        setIsLogFormOpen(false);
        loadLogs(); // re-fetch the interactions timeline
        refreshCompleteness();
    };

    // Tag, delete or a document change in the Interactions tab: `update` is
    // applied to the newest rows, never to a stale copy.
    const handleLogsChange = (update) => {
        setLogs((prev) => ({ ...prev, rows: update(prev.rows) }));
        refreshCompleteness();
    };

    const handleAssignUser = async (userId) => {
        try {
            await apiClient.put(`/api/investors/${investor._id}`, { assignedTo: userId || null });
            fetchInvestorAndProjects();
        } catch (error) {
            console.error("Assignment error:", error);
        }
    };

    if (!investor) {
        return <div>Loading...</div>;
    }

    // DG/Admin can always write. Staff only on investors assigned to them
    // (the backend enforces the same rule; GET populates assignedTo).
    const canWrite = !isStaff
        || (!!currentUser?.id && investor.assignedTo?._id === currentUser.id);

    // History follows the change-log access (DG / Portal-Admin).
    const tabs = INVESTOR_TABS.filter((t) => t !== 'history' || isAdmin);
    const requested = searchParams.get('tab');
    const tab = tabs.includes(requested) ? requested : 'overview';
    const setTab = (next) => {
        const params = new URLSearchParams(searchParams);
        if (next === 'overview') params.delete('tab');
        else params.set('tab', next);
        setSearchParams(params, { replace: true });
    };

    const openIssues = issues.filter((i) => OPEN_ISSUE_STATUSES.includes(i.status)).length;
    const latest = latestProject(projects);
    const stage = stageOf(latest);
    const eq = ngnEquivalentOf(projects, fx);
    let pipelineValue = '—';
    let pipelineHint = 'no project values yet';
    if (eq.count > 0 && eq.count === eq.excludedCount) {
        // Every valued project is in "Other": nothing converts to ₦.
        pipelineHint = `${eq.excluded.join(', ')} currency left out of the ₦ total`;
    } else if (eq.count > 0) {
        if (eq.value !== null) {
            pipelineValue = formatMoneyCompact(eq.value, 'NGN');
            pipelineHint = `${formatCount(eq.count)} ${eq.count === 1 ? 'project' : 'projects'} with a value${eq.excluded.length ? ` (${eq.excluded.join(', ')} left out)` : ''}`;
        } else {
            pipelineValue = formatMoneyCompact(eq.ngnSum, 'NGN');
            if (fx) pipelineHint = `NGN only: no rate for ${eq.missing.join(', ')}`;
            else pipelineHint = fxError ? 'NGN only: rates not available' : 'NGN only: loading rates';
        }
    }
    const jobs = projects.reduce((sum, p) => sum + (Number(p.estimatedNumberOfJobs) > 0 ? Number(p.estimatedNumberOfJobs) : 0), 0);

    const firstContact = !investor.firstContactDate && investor.importBatchId ? 'Not recorded' : (dateLine(investor, 'firstContactDate') || '—');
    const keyFacts = [
        { label: 'First contact', value: firstContact },
        { label: 'Lead source', value: investor.leadSource || UNKNOWN_LEAD_SOURCE },
        investor.leadSourceDetail ? { label: 'Lead source detail', value: investor.leadSourceDetail } : null,
        investor.referredBy ? {
            label: 'Referred by',
            value: investor.referredBy._id
                ? <MuiLink component={Link} to={`/investors/${investor.referredBy._id}`}>{investor.referredBy.investorName}</MuiLink>
                : String(investor.referredBy),
        } : null,
        { label: 'Officer', value: investor.assignedTo ? investor.assignedTo.name : 'Unassigned' },
        { label: 'Key contact', value: investor.keyContactPerson || '—' },
        { label: 'Email', value: investor.email || '—' },
        { label: 'Phone', value: investor.phoneNumber || '—' },
        { label: 'Head office', value: investor.headOffice || '—' },
        { label: 'Website', value: investor.website || '—' },
        { label: 'Organisation type', value: organisationType },
        { label: 'Sector', value: investor.sector || '—' },
        investor.sectorDetail ? { label: 'Sector detail', value: investor.sectorDetail } : null,
        { label: 'Country of origin', value: investor.countryOfOrigin || '—' },
        investor.countryDetail ? { label: 'Recorded as', value: investor.countryDetail } : null,
        { label: 'Registration', value: investor.companyRegistrationInfo || '—' },
    ];

    const addProjectButton = canWrite ? (
        <Button size="small" variant="outlined" onClick={() => setIsProjectFormOpen(true)}>Add New Project</Button>
    ) : null;
    const fillGapsTo = `/fill-gaps?${new URLSearchParams({ year: 'all', officer: 'all', investor: investor._id }).toString()}`;

    const issueColumns = [
        {
            key: 'issue',
            label: 'Issue',
            render: (issue) => (
                <MuiLink component={Link} to={`/issues/${issue._id}`} sx={{ fontWeight: 600 }}>
                    {issueReference(issue) ? `${issueReference(issue)} · ` : ''}
                    {issue.category || 'Issue'}
                </MuiLink>
            ),
        },
        { key: 'status', label: 'Status', render: (issue) => <StatusBadge label={issue.status} /> },
        { key: 'dateReported', label: 'Reported', render: (issue) => dateLine(issue, 'dateReported') },
        { key: 'mda', label: 'MDA', hideOnPhone: true, render: (issue) => issue.mdaResponsible || '—' },
    ];
    const announcementColumns = [
        { key: 'announcementDate', label: 'Date', render: (a) => dateLine(a, 'announcementDate') },
        {
            key: 'outlet',
            label: 'Outlet',
            render: (a) => <MuiLink component={Link} to={`/announcements/${a._id}`} sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{a.outlet || 'Announcement'}</MuiLink>,
        },
        { key: 'project', label: 'Project', hideOnPhone: true, render: (a) => a.project?.projectTitle || '—' },
        { key: 'oysipaNamed', label: 'OYSIPA', render: (a) => <StatusBadge label={a.oysipaNamed ? 'OYSIPA named' : 'OYSIPA not named'} /> },
    ];

    // '…' while loading, '—' after a failed load.
    const countOf = (n, loading, failed) => {
        if (loading) return '…';
        if (failed) return '—';
        return n;
    };
    const issuesCount = countOf(issues.length, issuesLoading, !!issuesError);
    const openIssuesCount = countOf(openIssues, issuesLoading, !!issuesError);
    const announcementsCount = countOf(announcements.length, announcementsState === 'loading', announcementsState === 'error');
    const counts = {
        projects: projects.length,
        interactions: logs.rows.length,
        issues: issuesCount,
        announcements: announcementsCount,
    };
    const tabNames = {
        overview: 'Overview', projects: 'Projects', interactions: 'Interactions', issues: 'Issues', announcements: 'Announcements', files: 'Files', history: 'History',
    };

    return (
        <Box sx={{ minWidth: 0 }}>
            <PageBreadcrumbs items={[{ label: 'Investors', to: '/investors' }, { label: investor.investorName || 'Investor' }]} />

            <Card component="section" aria-label="Investor summary" sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2.5, mb: 2.5 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5, alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', minWidth: 0 }}>
                        <Box
                            aria-hidden="true"
                            sx={{
                                width: { xs: 52, sm: 64 }, height: { xs: 52, sm: 64 }, flexShrink: 0, borderRadius: '16px', bgcolor: tokens.maroonTint2, color: tokens.maroon, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: { xs: 18, sm: 22 },
                            }}
                        >
                            {initialsOf(investor.investorName)}
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="h4" component="h1" sx={{ fontSize: { xs: 22, sm: 28 }, overflowWrap: 'anywhere' }}>{investor.investorName}</Typography>
                            <Box aria-label="Investor tags" role="list" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                                {stage && <span role="listitem"><StatusBadge label={stage} tone={STAGE_TONE} /></span>}
                                <span role="listitem"><StatusBadge label={organisationType} tone={isInvestorType ? 'default' : 'info'} /></span>
                                {investor.sector && <span role="listitem"><StatusBadge label={investor.sector} /></span>}
                                {investor.countryOfOrigin && <span role="listitem"><StatusBadge label={investor.countryOfOrigin} /></span>}
                            </Box>
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                        {canWrite && <Button variant="outlined" onClick={() => setIsEditFormOpen(true)}>Edit</Button>}
                        {canWrite && <Button variant="outlined" onClick={() => setIsIssueFormOpen(true)}>Register issue</Button>}
                        {canWrite && <Button variant="contained" onClick={() => setIsLogFormOpen(true)}>+ Log interaction</Button>}
                        {!isStaff && (
                            <UserAssignmentDropdown
                                investorId={investor._id}
                                currentAssignedUser={investor.assignedTo}
                                onAssign={handleAssignUser}
                            />
                        )}
                    </Box>
                </Box>
                <Box
                    component="ul"
                    aria-label="Investor figures"
                    sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1.5 }}
                >
                    <li><StatCard compact label="Projects" value={formatCount(projects.length)} /></li>
                    {isInvestorType && <li><StatCard compact label="Pipeline value" value={pipelineValue} hint={pipelineHint} /></li>}
                    {isInvestorType && <li><StatCard compact label="Jobs pledged" value={formatCount(jobs)} /></li>}
                    <li><StatCard compact label="Interactions" value={logs.loading ? '…' : formatCount(logs.rows.length)} /></li>
                    <li><StatCard compact label="Open issues" value={typeof openIssuesCount === 'number' ? formatCount(openIssuesCount) : openIssuesCount} /></li>
                    <li><StatCard compact label="Announcements" value={typeof announcementsCount === 'number' ? formatCount(announcementsCount) : announcementsCount} /></li>
                </Box>
            </Card>

            <Box sx={{ borderBottom: `1px solid ${tokens.divider}`, mb: 2.5, minWidth: 0 }}>
                <Tabs
                    value={tab}
                    onChange={(e, next) => setTab(next)}
                    variant="scrollable"
                    scrollButtons="auto"
                    allowScrollButtonsMobile
                    aria-label="Investor sections"
                    sx={{ minHeight: 44, '& .MuiTab-root': { minHeight: 44, textTransform: 'none', fontSize: 14, px: 1.75 } }}
                >
                    {tabs.map((t) => (
                        <Tab
                            key={t}
                            value={t}
                            id={`investor-tab-${t}`}
                            aria-controls={`investor-tabpanel-${t}`}
                            label={<TabLabel label={tabNames[t]} count={counts[t]} />}
                        />
                    ))}
                </Tabs>
            </Box>

            <Box role="tabpanel" id={`investor-tabpanel-${tab}`} aria-labelledby={`investor-tab-${tab}`} sx={{ minWidth: 0 }}>
                {tab === 'overview' && (
                    <InvestorOverview
                        events={events}
                        eventsLoading={logs.loading}
                        projects={projects}
                        projectAction={addProjectButton}
                        keyFacts={keyFacts}
                        notes={investor.notes}
                        completenessProps={{
                            applicable: isInvestorType,
                            organisationType,
                            completeness: investorCompleteness(completeness.data),
                            loading: completeness.loading,
                            fillGapsTo,
                        }}
                    />
                )}

                {tab === 'projects' && (
                    <SectionCard title="Projects" actions={addProjectButton} flush>
                        <ProjectList projects={projects} embedded />
                    </SectionCard>
                )}

                {tab === 'interactions' && (
                    <InteractionLogList
                        investorId={investor._id}
                        canWrite={canWrite}
                        canDelete={isAdmin}
                        logs={logs.rows}
                        loading={logs.loading}
                        error={logs.error}
                        onLogsChange={handleLogsChange}
                        title="Interactions"
                    />
                )}

                {tab === 'issues' && (
                    <SectionCard title="Issues" flush>
                        {issuesError && <Alert severity="error" sx={{ mx: 2, mb: 1.5 }}>{issuesError}</Alert>}
                        <DataTable
                            ariaLabel="Investor issues"
                            columns={issueColumns}
                            rows={issues}
                            embedded
                            emptyState={<EmptyState title={issuesError ? 'Issues not loaded' : 'No issues registered for this investor.'} />}
                        />
                    </SectionCard>
                )}

                {tab === 'announcements' && (
                    <SectionCard title="Announcements" subtitle="Public announcements about this investor's projects." flush>
                        <DataTable
                            ariaLabel="Investor announcements"
                            columns={announcementColumns}
                            rows={announcements}
                            embedded
                            emptyState={<EmptyState title="No announcements for this investor's projects." />}
                        />
                    </SectionCard>
                )}

                {tab === 'files' && <InvestorFiles investorId={investor._id} logs={logs.rows} />}

                {tab === 'history' && isAdmin && <InvestorHistory investor={investor} projects={projects} />}
            </Box>

            <InvestorEditForm
                open={isEditFormOpen}
                onClose={() => setIsEditFormOpen(false)}
                onSave={handleEditSave}
                investorData={investor}
            />

            <ProjectForm
                open={isProjectFormOpen}
                onClose={() => setIsProjectFormOpen(false)}
                onSave={handleProjectFormSave}
                investorId={investor._id}
            />

            <InteractionLogForm
                open={isLogFormOpen}
                onClose={() => setIsLogFormOpen(false)}
                onSave={handleLogFormSave}
                investorId={investor._id}
            />

            <IssueForm
                open={isIssueFormOpen}
                onClose={() => setIsIssueFormOpen(false)}
                onSaved={handleIssueSaved}
                investorId={investor._id}
            />
        </Box>
    );
};

// A new investor id (e.g. the Referred-by link) mounts a fresh page: no data,
// tab counts or timeline paging carry over from the previous investor.
const InvestorProfileRoute = () => {
    const { id } = useParams();
    return <InvestorProfilePage key={id} />;
};

export default InvestorProfileRoute;
