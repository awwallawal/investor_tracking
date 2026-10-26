import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, MenuItem, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { addFxRate, fetchFxRates, FX_CURRENCIES } from '../api/fxRates';
import { formatDate, todayLagos } from '../utils/dates';
import { formatMoney } from '../utils/money';

const EMPTY = {
  currency: 'USD', rate: '', asOf: '', source: '',
};

// Admin "Exchange rates" (story 11.14): the ₦ rate per currency used for the
// dashboard's ₦ equivalent. Add a dated rate; the latest date per currency is
// used. DG and Portal-Admin; the server re-checks the role and audits edits.
const ExchangeRatesSection = () => {
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetchFxRates()
      .then((s) => { if (active) setState(s); })
      .catch(() => { if (active) setLoadError('Failed to load the exchange rates.'); });
    return () => { active = false; };
  }, []);

  const set = (name) => (e) => {
    const { value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setSaved(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaved(false);
    const rate = Number(form.rate);
    if (!form.rate || !Number.isFinite(rate) || rate <= 0) {
      setError('Enter the rate in ₦ per unit (more than 0).');
      return;
    }
    if (!form.asOf) {
      setError('Enter the date of the rate.');
      return;
    }
    if (form.asOf > todayLagos()) {
      setError('The rate date cannot be in the future.');
      return;
    }
    if (!form.source.trim()) {
      setError('Say where the rate comes from.');
      return;
    }
    setSaving(true);
    try {
      const next = await addFxRate({
        currency: form.currency, rate, asOf: form.asOf, source: form.source.trim(),
      });
      setState(next);
      setForm(EMPTY);
      setSaved(true);
    } catch (err) {
      setError(err?.response?.data?.message || err?.response?.data?.msg || 'Failed to save the rate.');
    } finally {
      setSaving(false);
    }
  };

  const latest = state ? state.latest : {};
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Typography variant="h6" component="h2">Exchange rates</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Naira per unit, used for the dashboard&apos;s ₦ equivalent. The latest date for each currency is used.
      </Typography>
      {loadError && <Alert severity="error" sx={{ my: 1 }}>{loadError}</Alert>}
      {state && state.stale.length > 0 && (
        <Alert severity="warning" sx={{ my: 1 }}>
          {`Rates out of date (older than ${state.staleDays} days): ${state.stale.join(', ')}. Add a current rate.`}
        </Alert>
      )}
      {state && state.missing.length > 0 && (
        <Alert severity="info" sx={{ my: 1 }}>
          {`No rate set for ${state.missing.join(', ')}: the ₦ equivalent is not shown while a needed rate is missing.`}
        </Alert>
      )}
      {state && (
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', my: 2 }}>
          {FX_CURRENCIES.map((c) => (
            <Box key={c} data-testid={`fx-latest-${c}`} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
              <Typography variant="overline" component="div">{c}</Typography>
              {latest[c] ? (
                <>
                  <Typography sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{`${formatMoney(latest[c].rate, 'NGN')} per ${c}`}</Typography>
                  <Typography variant="body2" color={latest[c].stale ? 'warning.main' : 'text.secondary'}>
                    {`as of ${formatDate(latest[c].asOf)}${latest[c].stale ? ' (out of date)' : ''}`}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{latest[c].source}</Typography>
                </>
              ) : <Typography variant="body2" color="text.secondary">No rate set</Typography>}
            </Box>
          ))}
        </Box>
      )}
      <Box component="form" onSubmit={submit} noValidate sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'flex-start' }}>
        <TextField select label="Currency" name="currency" value={form.currency} onChange={set('currency')} size="small" sx={{ minWidth: 110 }}>
          {FX_CURRENCIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
        </TextField>
        <TextField label="₦ per unit" name="rate" type="number" value={form.rate} onChange={set('rate')} size="small" slotProps={{ htmlInput: { min: 0, step: 'any' } }} />
        <TextField
          label="Rate date"
          name="asOf"
          type="date"
          value={form.asOf}
          onChange={set('asOf')}
          size="small"
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayLagos() } }}
        />
        <TextField label="Source" name="source" value={form.source} onChange={set('source')} size="small" sx={{ flex: '1 1 240px' }} />
        <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving...' : 'Add rate'}</Button>
      </Box>
      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      {saved && <Alert severity="success" sx={{ mt: 1 }}>Rate added.</Alert>}
      {state && state.history.length > 0 && (
        <TableContainer sx={{ mt: 2 }}>
          <Table size="small" aria-label="Exchange rate history">
            <TableHead>
              <TableRow>
                <TableCell>Currency</TableCell>
                <TableCell align="right">₦ per unit</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Source</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {state.history.map((h, i) => (
                <TableRow key={`${h.currency}-${h.asOf}-${i}`}>
                  <TableCell>{h.currency}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(h.rate, 'NGN')}</TableCell>
                  <TableCell>{formatDate(h.asOf)}</TableCell>
                  <TableCell>{h.source}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
};

export default ExchangeRatesSection;
