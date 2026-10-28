import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Link, Typography,
} from '@mui/material';
import apiClient from '../../api/api';
import { documentErrorMessage, openEvidenceFile, openInteractionDocument } from '../../api/documents';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import SectionCard from '../ui/SectionCard';
import { formatDate } from '../../utils/dates';
import { interactionDocuments, libraryFilesOf } from '../../utils/investorPage';

// The Files tab: every document of this investor's interactions and the
// evidence library files tagged to it. Files open through short-lived signed links.
const InvestorFiles = ({ investorId, logs }) => {
  const [library, setLibrary] = useState(null);
  const [libraryError, setLibraryError] = useState('');
  const [openError, setOpenError] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { data } = await apiClient.get('/api/evidence/files');
        if (live) setLibrary(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        if (live) {
          setLibrary([]);
          setLibraryError('Could not load the library files.');
        }
      }
    })();
    return () => { live = false; };
  }, [investorId]);

  const open = async (fn, fallback) => {
    setOpenError('');
    try {
      await fn();
    } catch (err) {
      setOpenError(documentErrorMessage(err, fallback));
      console.error(err);
    }
  };

  const docs = interactionDocuments(logs);
  const libraryFiles = libraryFilesOf(library || [], investorId, logs);

  const docColumns = [
    { key: 'fileName', label: 'File', render: (r) => <Box component="span" sx={{ overflowWrap: 'anywhere' }}>{r.fileName}</Box> },
    { key: 'date', label: 'Date', render: (r) => formatDate(r.date) || '—' },
    {
      key: 'interaction',
      label: 'Interaction',
      hideOnPhone: true,
      render: (r) => (
        <Box component="span" sx={{ overflowWrap: 'anywhere' }}>
          {r.log.description}
          {r.log.project?.projectTitle && <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>{`Project: ${r.log.project.projectTitle}`}</Typography>}
        </Box>
      ),
    },
    {
      key: 'open',
      label: '',
      align: 'right',
      render: (r) => (r.url ? (
        <Link href={r.url} target="_blank" rel="noopener">[View Document]</Link>
      ) : (
        <Button size="small" aria-label={`View ${r.fileName}`} onClick={() => open(() => openInteractionDocument(r.log._id, r.doc._id), 'Could not open the document.')}>View</Button>
      )),
    },
  ];
  const libraryColumns = [
    { key: 'fileName', label: 'File', render: (f) => <Box component="span" sx={{ overflowWrap: 'anywhere' }}>{f.fileName}</Box> },
    { key: 'date', label: 'Date', render: (f) => formatDate(f.documentDate || f.uploadedAt) || '—' },
    { key: 'folder', label: 'Folder', hideOnPhone: true, render: (f) => f.folder?.name || '—' },
    { key: 'what', label: 'What it is', hideOnPhone: true, render: (f) => f.what || '—' },
    {
      key: 'open',
      label: '',
      align: 'right',
      render: (f) => <Button size="small" aria-label={`Open ${f.fileName}`} onClick={() => open(() => openEvidenceFile(f._id), 'Could not open the file.')}>Open</Button>,
    },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {openError && <Alert severity="error" onClose={() => setOpenError('')}>{openError}</Alert>}
      <SectionCard title="Interaction documents" subtitle="Attached to this investor's interactions and its projects' interactions." flush>
        <DataTable
          ariaLabel="Interaction documents"
          columns={docColumns}
          rows={docs}
          getRowKey={(r) => r.key}
          embedded
          emptyState={<EmptyState title="No documents attached yet" />}
        />
      </SectionCard>
      <SectionCard title="Library files" subtitle="Evidence library files tagged to this investor." flush>
        {libraryError && <Alert severity="error" sx={{ mx: 2, mb: 1 }}>{libraryError}</Alert>}
        <DataTable
          ariaLabel="Library files"
          columns={libraryColumns}
          rows={libraryFiles}
          loading={library === null}
          embedded
          emptyState={<EmptyState title="No library files tagged to this investor" />}
        />
      </SectionCard>
    </Box>
  );
};

export default InvestorFiles;
