import React, { useState } from 'react';
import { Alert, Button, Snackbar } from '@mui/material';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { exportErrorMessage, exportList } from '../api/listExport';

// "Export this view (CSV)" (story 11.15): downloads the list's current view
// (same filters and sort). Every export is recorded in the ChangeLog by the
// server; more than 5,000 rows is refused with "narrow the filters".
const ExportButton = ({ list, params = {}, label = 'Export this view (CSV)', disabled = false }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      await exportList(list, params);
    } catch (err) {
      console.error(err);
      setError(await exportErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={run} disabled={busy || disabled}>
        {busy ? 'Exporting...' : label}
      </Button>
      <Snackbar open={!!error} autoHideDuration={8000} onClose={() => setError('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="error" onClose={() => setError('')} sx={{ maxWidth: 'calc(100vw - 32px)' }}>{error}</Alert>
      </Snackbar>
    </>
  );
};

export default ExportButton;
