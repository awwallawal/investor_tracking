import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Link } from '@mui/material';
import DataTable from './ui/DataTable';
import EmptyState from './ui/EmptyState';
import StatusBadge from './ui/StatusBadge';
import { STAGE_TONE } from './ui/statusTones';
import { formatMoney } from '../utils/money';

// The projects of one investor (the investor page's Projects tab). The page
// fetches them and passes them in. lifecycleStatus may be missing or a raw id.
const stageOf = (p) => (p.lifecycleStatus && typeof p.lifecycleStatus === 'object' ? p.lifecycleStatus.name : '') || '';
const hasValue = (p) => Number(p.estimatedValue) > 0;

const ProjectList = ({ projects, emptyAction, embedded = false }) => {
    const columns = [
        {
            key: 'projectTitle',
            label: 'Project',
            sortable: true,
            render: (p) => <Link component={RouterLink} to={`/projects/${p._id}`} sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{p.projectTitle}</Link>,
        },
        {
            key: 'stage',
            label: 'Stage',
            sortable: true,
            sortValue: stageOf,
            render: (p) => (stageOf(p) ? <StatusBadge label={stageOf(p)} tone={STAGE_TONE} /> : 'N/A'),
        },
        {
            key: 'estimatedValue',
            label: 'Value',
            align: 'right',
            sortable: true,
            sortValue: (p) => (hasValue(p) ? Number(p.estimatedValue) : ''),
            render: (p) => (hasValue(p) ? formatMoney(p.estimatedValue, p.currency) : '—'),
        },
        { key: 'location', label: 'Location', hideOnPhone: true, render: (p) => p.location || '—' },
        {
            key: 'estimatedNumberOfJobs',
            label: 'Jobs',
            align: 'right',
            hideOnPhone: true,
            render: (p) => (Number(p.estimatedNumberOfJobs) > 0 ? Number(p.estimatedNumberOfJobs).toLocaleString('en-US') : '—'),
        },
    ];
    return (
        <DataTable
            ariaLabel="Investor projects"
            columns={columns}
            rows={projects || []}
            rowLink={(p) => `/projects/${p._id}`}
            embedded={embedded}
            emptyState={<EmptyState title="No projects found for this investor." action={emptyAction} />}
        />
    );
};

export default ProjectList;
