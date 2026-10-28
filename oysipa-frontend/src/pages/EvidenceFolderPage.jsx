import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, Stack, TextField, Typography,
} from '@mui/material';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import LocalOfferOutlined from '@mui/icons-material/LocalOfferOutlined';
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined';
import {
  EVIDENCE_CHIP_LABELS, EVIDENCE_LIST_SPEC, EVIDENCE_SORTS, deleteEvidenceFile, evidenceErrorMessage, fetchFolderFilesResponse,
  notifyUntaggedChanged, removeEvidenceLink, uploadEvidenceFile,
} from '../api/evidence';
import FilterBar, { SortMenu } from '../components/ui/FilterBar';
import ViewTabs from '../components/ui/ViewTabs';
import ExportButton from '../components/ExportButton';
import useListQuery from '../hooks/useListQuery';
import { resultCountLabel, totalFromResponse } from '../utils/listQuery';
import { DOCUMENT_ACCEPT, documentErrorMessage, openEvidenceFile } from '../api/documents';
import EvidenceTagDialog from '../components/EvidenceTagDialog';
import HappenedDateField from '../components/HappenedDateField';
import { getCurrentUser, isAdminRole } from '../utils/currentUser';
import { formatDate } from '../utils/dates';
import {
  EmptyState, EvidenceFilters, EvidenceSearchField, FolderCard, FolderGrid, IconTile,
} from '../components/EvidenceUi';
import { fileIcon, plural } from '../utils/evidenceUi';

const fileDate = (f) => formatDate(f.documentDate || f.uploadedAt);
const fileSize = (bytes) => {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const shorten = (s, n = 40) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');

const linkLabel = (link) => {
  const parts = [link.investor?.investorName || 'Investor'];
  if (link.interaction) parts.push(shorten(link.interaction.description) || 'interaction');
  if (link.serviceCodes?.length) parts.push(link.serviceCodes.join(', '));
  return parts.join(' · ');
};

// DG/Admin: upload one or more files with an optional shared date and "what".
const AddFilesDialog = ({ folderId, onClose, onDone }) => {
  const [files, setFiles] = useState([]);
  const [documentDate, setDocumentDate] = useState('');
  const [what, setWhat] = useState('');
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState([]);

  const handleUpload = async () => {
    setUploading(true);
    const out = [];
    for (const file of files) {
      try {
        await uploadEvidenceFile(folderId, file, { documentDate, what: what.trim() });
        out.push({ name: file.name, ok: true });
      } catch (err) {
        out.push({ name: file.name, ok: false, message: evidenceErrorMessage(err, 'Upload failed.') });
      }
    }
    setResults(out);
    setUploading(false);
    onDone(out.some((r) => r.ok));
  };

  const failed = results.filter((r) => !r.ok);
  return (
    <Dialog open onClose={uploading ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Add files</DialogTitle>
      <DialogContent>
        <Button variant="outlined" component="label" disabled={uploading}>
          {files.length ? `${files.length} file${files.length === 1 ? '' : 's'} chosen` : 'Choose files'}
          <input
            type="file"
            hidden
            multiple
            accept={DOCUMENT_ACCEPT}
            aria-label="Evidence files"
            onChange={(e) => { setFiles(Array.from(e.target.files || [])); setResults([]); }}
          />
        </Button>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>PDF, Word, Excel, JPEG or PNG, up to 10 MB each. No video or audio.</Typography>
        <HappenedDateField label="Document date" value={documentDate} onChange={setDocumentDate} disabled={uploading} helperText="Leave empty when unknown (the upload date is shown)" />
        <TextField label="What (optional)" fullWidth margin="dense" variant="standard" value={what} onChange={(e) => setWhat(e.target.value)} disabled={uploading} />
        {results.length > 0 && (
          <Alert severity={failed.length ? 'warning' : 'success'} sx={{ mt: 2 }}>
            {`${results.length - failed.length} of ${results.length} uploaded.`}
            {failed.map((r, i) => <Box key={`${i}-${r.name}`} sx={{ overflowWrap: 'anywhere' }}>{`${r.name}: ${r.message}`}</Box>)}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={uploading}>{results.length ? 'Close' : 'Cancel'}</Button>
        <Button onClick={handleUpload} disabled={uploading || files.length === 0 || results.length > 0}>
          {uploading ? 'Uploading...' : 'Upload'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// DG/Admin: confirm with a reason (required for a file delete, optional for an unlink).
const ConfirmDialog = ({
  title, text, reasonRequired, confirmLabel, onClose, onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const handle = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(evidenceErrorMessage(err, 'The action failed.'));
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <DialogContentText sx={{ mb: 2, overflowWrap: 'anywhere' }}>{text}</DialogContentText>
        <TextField label={reasonRequired ? 'Reason' : 'Reason (optional)'} required={reasonRequired} fullWidth value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button color="error" variant="contained" onClick={handle} disabled={busy || (reasonRequired && !reason.trim())}>{confirmLabel}</Button>
      </DialogActions>
    </Dialog>
  );
};

// One file as a card: name and details, tags, then the actions. Phones get a
// stacked card with full-width buttons; wider screens a single row.
const FileItem = ({
  file, isAdmin, onOpen, onTag, onDelete, onUnlink,
}) => {
  const { icon, color } = fileIcon(file.mimeType);
  const links = file.links || [];
  return (
    <Card
      component="li"
      sx={{
        listStyle: 'none',
        p: { xs: 1.5, sm: 2 },
        display: 'grid',
        gap: { xs: 1.25, md: 2 },
        alignItems: 'center',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.4fr) minmax(0, 1fr) auto' },
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start', minWidth: 0 }}>
        <IconTile icon={icon} color={color} size={36} />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{file.fileName}</Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', color: 'text.secondary' }}>
            <Typography variant="body2" component="span">{fileDate(file)}</Typography>
            {Number.isFinite(file.size) && <Typography variant="body2" component="span" aria-hidden>·</Typography>}
            {Number.isFinite(file.size) && <Typography variant="body2" component="span">{fileSize(file.size)}</Typography>}
          </Stack>
          {file.what && <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{file.what}</Typography>}
        </Box>
      </Stack>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', minWidth: 0 }}>
        {links.length === 0 && <StatusBadge label="Untagged" />}
        {links.map((l) => (
          <Chip
            key={l._id}
            size="small"
            variant="outlined"
            label={linkLabel(l)}
            sx={{ maxWidth: '100%' }}
            {...(isAdmin && { onDelete: () => onUnlink(l) })}
          />
        ))}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ justifyContent: { md: 'flex-end' }, '& > *': { flex: { xs: 1, md: 'none' } } }}>
        <Button size="small" variant="contained" startIcon={<OpenInNewOutlined />} onClick={onOpen} aria-label={`Open ${file.fileName}`}>Open</Button>
        <Button size="small" variant="outlined" startIcon={<LocalOfferOutlined />} onClick={onTag} aria-label={`Tag ${file.fileName}`}>Tag</Button>
        {isAdmin && (
          <Button size="small" color="error" onClick={onDelete} aria-label={`Delete ${file.fileName}`}>Delete</Button>
        )}
      </Stack>
    </Card>
  );
};

// One folder's files: Open (signed link), Tag (all roles), and for DG/Admin
// Add files, Delete (reason required) and unlink a tag.
const EvidenceFolderPage = () => {
  const { folderId } = useParams();
  const user = getCurrentUser();
  const isAdmin = isAdminRole(user?.role);
  const [folder, setFolder] = useState(null);
  const [files, setFiles] = useState([]);
  const [subfolders, setSubfolders] = useState([]);
  const [total, setTotal] = useState(null);
  const lq = useListQuery(EVIDENCE_LIST_SPEC);
  const untaggedOnly = lq.values.untagged;
  const paramsKey = JSON.stringify(lq.apiParams);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tagging, setTagging] = useState(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [unlinking, setUnlinking] = useState(null);

  // Only the newest request may set the list (filters change quickly).
  const requestId = useRef(0);
  const load = useCallback(async () => {
    requestId.current += 1;
    const id = requestId.current;
    try {
      const response = await fetchFolderFilesResponse(folderId, JSON.parse(paramsKey));
      if (id !== requestId.current) return;
      const data = response.data || {};
      setFolder(data.folder);
      setSubfolders(data.subfolders || []);
      setFiles(data.files || []);
      setTotal(totalFromResponse(response));
      setError('');
    } catch (err) {
      if (id !== requestId.current) return;
      setError(evidenceErrorMessage(err, 'Failed to load the folder.'));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [folderId, paramsKey]);

  useEffect(() => { load(); }, [load]);

  const handleOpen = async (file) => {
    setError('');
    try {
      await openEvidenceFile(file._id);
    } catch (err) {
      setError(documentErrorMessage(err, 'Could not open the file.'));
    }
  };

  const changed = () => { notifyUntaggedChanged(); load(); };
  const untaggedHere = files.filter((f) => !(f.links || []).length).length;

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader
        breadcrumbs={[
          { label: 'Evidence Library', to: '/evidence' },
          ...(folder?.parent ? [{ label: folder.parent.name, to: `/evidence/${folder.parent._id}` }] : []),
          ...(folder ? [{ label: folder.name }] : []),
        ]}
        eyebrow={folder?.folderDate ? `Folder · ${formatDate(folder.folderDate)}` : 'Folder'}
        title={folder?.name || 'Folder'}
        subtitle={folder?.description}
        actions={(
          <>
            <ExportButton list="evidence" params={{ ...lq.apiParams, folder: folderId }} />
            {isAdmin && folder && (
              <Button variant="contained" startIcon={<UploadFileOutlined />} onClick={() => setAdding(true)}>Add files</Button>
            )}
          </>
        )}
      />

      {subfolders.length > 0 && (
        <Box component="nav" aria-label="Subfolders" sx={{ mb: 3 }}>
          <Typography variant="h6" component="h2" sx={{ fontSize: 17, mb: 1 }}>Subfolders</Typography>
          <FolderGrid>
            {subfolders.map((sub) => (
              <FolderCard
                key={sub._id}
                folder={sub}
                ariaLabel={`${sub.name} · ${plural(sub.fileCount, 'file')}${sub.untaggedCount ? ` · ${sub.untaggedCount} untagged` : ''}`}
              />
            ))}
          </FolderGrid>
        </Box>
      )}

      <Typography variant="h6" component="h2" sx={{ fontSize: 17, mb: 1.5 }}>
        {loading ? 'Files' : `${plural(files.length, 'file')}${!untaggedOnly && untaggedHere ? ` · ${untaggedHere} untagged` : ''}`}
      </Typography>
      <ViewTabs list="evidence" current={lq.filterKey} canonical={lq.canonical} saveQuery={lq.queryString} onApply={lq.applyQuery} />
      <FilterBar
        search={<EvidenceSearchField lq={lq} />}
        filters={<EvidenceFilters lq={lq} />}
        resultCount={loading ? null : resultCountLabel(files.length, total, 'file')}
        chips={lq.chips(EVIDENCE_CHIP_LABELS)}
        onClearAll={() => lq.clearAll()}
        end={<SortMenu options={EVIDENCE_SORTS} value={lq.sort} onChange={lq.setSort} defaultLabel="Date, oldest first" />}
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>}
      {!loading && files.length === 0 && (
        <EmptyState icon={InsertDriveFileOutlined}>
          {(() => {
            if (lq.activeCount > (untaggedOnly ? 1 : 0)) return 'No files match these filters.';
            return untaggedOnly ? 'No untagged files.' : 'No files in this folder.';
          })()}
        </EmptyState>
      )}
      {!loading && files.length > 0 && (
        <Stack component="ul" aria-label="Files" spacing={1.5} sx={{ p: 0, m: 0 }}>
          {files.map((f) => (
            <FileItem
              key={f._id}
              file={f}
              isAdmin={isAdmin}
              onOpen={() => handleOpen(f)}
              onTag={() => setTagging(f)}
              onDelete={() => setDeleting(f)}
              onUnlink={(l) => setUnlinking({ file: f, link: l })}
            />
          ))}
        </Stack>
      )}
      {tagging && (
        <EvidenceTagDialog
          file={tagging}
          onClose={() => setTagging(null)}
          onSaved={() => { setTagging(null); changed(); }}
        />
      )}
      {adding && (
        <AddFilesDialog
          folderId={folderId}
          onClose={() => setAdding(false)}
          onDone={(any) => { if (any) changed(); }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete file"
          text={`Delete "${deleting.fileName}" from the library? The stored file is removed. A record is kept in the audit log.`}
          reasonRequired
          confirmLabel="Confirm delete"
          onClose={() => setDeleting(null)}
          onConfirm={async (reason) => { await deleteEvidenceFile(deleting._id, reason); setDeleting(null); changed(); }}
        />
      )}
      {unlinking && (
        <ConfirmDialog
          title="Remove tag"
          text={`Remove the tag "${linkLabel(unlinking.link)}" from "${unlinking.file.fileName}"? The file stays in the library.`}
          confirmLabel="Remove tag"
          onClose={() => setUnlinking(null)}
          onConfirm={async (reason) => {
            await removeEvidenceLink(unlinking.file._id, unlinking.link._id, reason);
            setUnlinking(null);
            changed();
          }}
        />
      )}
    </Box>
  );
};

export default EvidenceFolderPage;
