import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button,
} from '@mui/material';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import LifecycleStatusManager from '../components/LifecycleStatusManager';
import MdaPicker from '../components/MdaPicker';
import ExchangeRatesSection from '../components/ExchangeRatesSection';
import { saveMouMdas, useMdas } from '../api/mdas';
import { getCurrentUser } from '../utils/currentUser';

// MoU MDAs (story 11.7c): the MDAs in OYSIPA's MoU, flagged "(MoU)" on the
// issues register. DG and Portal-Admin; the server re-checks the role.
const MouMdasSection = () => {
  const {
    mdas, loading, error: loadError, setMdas,
  } = useMdas();
  const [codes, setCodes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const savedCodes = mdas.filter((m) => m.mou).map((m) => m.code);
  const savedKey = [...savedCodes].sort().join('|');
  useEffect(() => { setCodes(mdas.filter((m) => m.mou).map((m) => m.code)); }, [mdas]);
  const changed = [...new Set(codes)].sort().join('|') !== savedKey;
  const ready = !loading && !loadError && mdas.length > 0;

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const list = await saveMouMdas(codes);
      setMdas(list);
      setSaved(true);
    } catch (err) {
      setError(err?.response?.data?.message || err?.response?.data?.msg || 'Failed to save the MoU MDAs.');
      // keep the previous list
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="MoU MDAs" subtitle='These MDAs are marked "(MoU)" on the issues register.'>
      {(loadError || error) && <Alert severity="error" sx={{ my: 1 }}>{error || loadError}</Alert>}
      {saved && <Alert severity="success" sx={{ my: 1 }}>MoU MDAs saved.</Alert>}
      <MdaPicker
        id="mou-mdas"
        label="MoU MDAs"
        mdas={mdas}
        value={codes}
        onChange={(next) => { setCodes(next); setSaved(false); }}
        showMou={false}
        disabled={!ready || saving}
        placeholder="Search by name or abbreviation"
      />
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 2, mt: 2, flexWrap: 'wrap',
      }}
      >
        <Button variant="contained" onClick={save} disabled={!ready || saving || !changed}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
        {ready && codes.length === 0 && <Alert severity="warning" sx={{ py: 0 }}>No MDA will be marked MoU</Alert>}
      </Box>
    </SectionCard>
  );
};

const AdminPage = () => {
  const role = getCurrentUser()?.role;
  const canManageStatuses = role === 'Director-General' || role === 'Portal-Admin';
  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader eyebrow="Admin" title="Admin Settings" subtitle="Settings used across the tracker. Every change is recorded in the change log." />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <MouMdasSection />
        {/* Exchange rates (story 11.14): DG and Portal-Admin. */}
        {canManageStatuses && <ExchangeRatesSection />}
        {/* Lifecycle statuses: DG and Portal-Admin (owner decision 24 Oct 2026). */}
        {canManageStatuses && <LifecycleStatusManager />}
      </Box>
    </Box>
  );
};

export default AdminPage;
