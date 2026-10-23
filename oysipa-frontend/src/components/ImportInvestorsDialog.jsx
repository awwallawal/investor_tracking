import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import apiClient from '../api/api';

const MAX_BYTES = 2 * 1024 * 1024;

const errorMessage = (err, fallback) => err?.response?.data?.message || err?.response?.data?.msg || fallback;

const formFor = (file, confirm) => {
  const form = new FormData();
  if (confirm !== undefined) form.append('confirm', confirm);
  form.append('file', file);
  return form;
};

// A small table with a heading; hidden when there are no rows.
const ReportTable = ({ title, rows, columns, severity }) => {
  if (!rows || rows.length === 0) return null;
  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle1" component="h3" color={severity === 'error' ? 'error' : undefined} sx={{ fontWeight: 600 }}>
        {`${title} (${rows.length})`}
      </Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 260 }}>
        <Table size="small" stickyHeader aria-label={title}>
          <TableHead>
            <TableRow>
              {columns.map((c) => <TableCell key={c.label}>{c.label}</TableCell>)}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                {columns.map((c) => <TableCell key={c.label} sx={{ overflowWrap: 'anywhere' }}>{c.value(r)}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

const list = (items) => (items && items.length ? items.join(', ') : '—');
const conflictText = (c) => (c.app !== undefined ? `${c.field}: app "${c.app}", file "${c.file}"` : c.field);
const rowLabel = (r) => r.name || r.key || r.id || `row ${r.row}`;

const DryRunReport = ({ report }) => {
  const c = report.counts || {};
  return (
    <Box>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
        <Chip color="primary" label={`To create: ${c.create ?? 0}`} />
        <Chip label={`To update: ${c.update ?? 0}`} />
        <Chip label={`Projects: ${c.projectsToCreate ?? 0}`} />
        <Chip label={`Interactions: ${c.interactionsToCreate ?? 0}`} />
        <Chip label={`Duplicates: ${(c.duplicates ?? 0) + (c.interactionDuplicates ?? 0)}`} />
        <Chip color={(c.errors || c.interactionErrors) ? 'error' : 'default'} label={`Errors: ${(c.errors ?? 0) + (c.interactionErrors ?? 0)}`} />
        <Chip color={c.warnings ? 'warning' : 'default'} label={`Warnings: ${c.warnings ?? 0}`} />
      </Stack>
      <ReportTable
        title="Errors (skipped)"
        severity="error"
        rows={report.errors}
        columns={[
          { label: 'Row', value: (r) => `${r.kind === 'interaction' ? 'Interaction' : 'Record'} ${r.row}` },
          { label: 'Organisation / id', value: rowLabel },
          { label: 'Problem', value: (r) => r.message },
        ]}
      />
      <ReportTable
        title="Warnings"
        rows={report.warnings}
        columns={[
          { label: 'Row', value: (r) => r.row },
          { label: 'Organisation / id', value: rowLabel },
          { label: 'Warning', value: (r) => r.message },
        ]}
      />
      <ReportTable
        title="To create"
        rows={report.create}
        columns={[
          { label: 'Organisation', value: rowLabel },
          { label: 'Type', value: (r) => r.organisationType },
          { label: 'Lead source', value: (r) => r.leadSource },
          { label: 'Projects', value: (r) => list((r.projects || []).map((p) => p.title)) },
        ]}
      />
      <ReportTable
        title="To update"
        rows={report.update}
        columns={[
          { label: 'App record', value: (r) => r.appName },
          { label: 'Fields to fill', value: (r) => list(r.filled) },
          { label: 'Not changed (differs)', value: (r) => list((r.conflicts || []).map(conflictText)) },
          { label: 'Projects to add', value: (r) => list((r.projects || []).map((p) => p.title)) },
          { label: 'Projects skipped', value: (r) => list(r.projectsSkipped) },
        ]}
      />
      <ReportTable
        title="Interactions to create"
        rows={report.interactions}
        columns={[
          { label: 'Id', value: (r) => r.id },
          { label: 'Organisation', value: (r) => r.name },
          { label: 'Date', value: (r) => r.date },
          { label: 'Codes', value: (r) => list(r.serviceCodes) },
        ]}
      />
      <ReportTable
        title="Duplicates (skipped)"
        rows={report.duplicates}
        columns={[
          { label: 'Kind', value: (r) => r.kind },
          { label: 'Organisation / id', value: rowLabel },
          { label: 'Matches', value: (r) => r.matches || r.note || '—' },
        ]}
      />
    </Box>
  );
};

const downloadReport = (report, fileName) => {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `import-report-${(fileName || 'file').replace(/\.json$/i, '')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// DG/Admin only (the server enforces it too): choose file → Dry run → review →
// type "IMPORT <n>" → Run → result. Run is enabled only after a successful dry
// run of the same file, and only while the typed text matches.
const ImportInvestorsDialog = ({ open, onClose, onImported }) => {
  const [file, setFile] = useState(null);
  const [dryRun, setDryRun] = useState(null); // { file, confirmation, report }
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setDryRun(null);
      setConfirm('');
      setError('');
      setResult(null);
    }
  }, [open]);

  const chooseFile = (e) => {
    const f = e.target.files && e.target.files[0];
    setDryRun(null);
    setConfirm('');
    setResult(null);
    setError('');
    if (!f) { setFile(null); return; }
    if (!/\.json$/i.test(f.name)) { setFile(null); setError('Choose the content studio import file (.json).'); return; }
    if (f.size > MAX_BYTES) { setFile(null); setError('The import file is larger than 2 MB.'); return; }
    setFile(f);
  };

  const runDry = async () => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const { data } = await apiClient.post('/api/investors/import/dry-run', formFor(file));
      setDryRun({ file, confirmation: data.confirmation, report: data.report });
      setConfirm('');
    } catch (err) {
      setDryRun(null);
      setError(errorMessage(err, 'The dry run failed.'));
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await apiClient.post('/api/investors/import/run', formFor(file, confirm.trim()));
      setResult(data);
      setDryRun(null);
      setConfirm('');
      if (onImported) onImported(data);
    } catch (err) {
      const data = err?.response?.data;
      if (err?.response?.status === 400 && data?.confirmation && dryRun && data.confirmation !== dryRun.confirmation) {
        // The data changed since the dry run: that review no longer holds.
        setDryRun(null);
        setConfirm('');
        setError(`${errorMessage(err, 'The data changed since the dry run.')} The data changed since the dry run: run the dry run again.`);
      } else {
        setError(errorMessage(err, 'The import failed. Nothing was imported.'));
      }
    } finally {
      setBusy(false);
    }
  };

  const dryRunMatchesFile = !!dryRun && dryRun.file === file;
  const canRun = dryRunMatchesFile && !busy && confirm.trim() === dryRun.confirmation;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>Import investors</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Upload the content studio import file. The dry run shows what would change and writes nothing.
          Existing records only get empty fields filled; their lead source never changes.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <Button variant="outlined" component="label" disabled={busy}>
            Choose file
            <input hidden type="file" accept=".json,application/json" onChange={chooseFile} data-testid="import-file" />
          </Button>
          <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{file ? file.name : 'No file chosen'}</Typography>
          <Button variant="contained" onClick={runDry} disabled={!file || busy}>Dry run</Button>
        </Box>

        {dryRunMatchesFile && (
          <>
            <DryRunReport report={dryRun.report} />
            <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button onClick={() => downloadReport(dryRun.report, file?.name)}>Download report</Button>
            </Box>
            <TextField
              sx={{ mt: 2 }}
              fullWidth
              label="Type the confirmation"
              helperText={`Type ${dryRun.confirmation} to run the import (the number of investors it creates).`}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
            />
          </>
        )}

        {result && (
          <Alert severity={result.errors && result.errors.length ? 'warning' : 'success'} sx={{ mt: 2 }}>
            {`Imported: ${result.counts.created} created, ${result.counts.updated} updated (${result.counts.fieldsFilled} fields filled), `
              + `${result.counts.projectsCreated} project(s), ${result.counts.interactionsCreated} interaction(s).`}
            {result.errors && result.errors.length > 0 && ` ${result.errors.length} item(s) could not be written; see the report.`}
            <Box sx={{ mt: 1 }}>
              <Button size="small" onClick={() => downloadReport({ ...result }, file?.name)}>Download result</Button>
            </Box>
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>{result ? 'Close' : 'Cancel'}</Button>
        <Button variant="contained" color="primary" onClick={runImport} disabled={!canRun}>
          {busy ? 'Working...' : 'Run import'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ImportInvestorsDialog;
