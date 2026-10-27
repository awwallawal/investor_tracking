import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, Typography,
} from '@mui/material';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import YearSelector, { ALL_YEARS } from '../components/ui/YearSelector';
import { fetchSaberReport, downloadSaberReport } from '../api/saberReport';
import { exportErrorMessage } from '../api/listExport';
import { todayLagos } from '../utils/dates';
import { formatCount } from '../utils/analytics';
import { ANNOUNCEMENT_TARGET } from '../constants/announcementFields';

// The API accepts 2000 to the current year (spec 11.9).
const MIN_YEAR = 2000;
export const CONFIDENTIAL = 'Confidential: OYSIPA internal (contains personal data)';

const grid = (min) => ({ display: 'grid', gap: 2, gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))` });
const pct = (share) => (share === null || share === undefined ? '—' : `${Math.round(share * 100)}%`);

// Button labels per part (the server lists the parts and their row counts).
const PART_BUTTONS = {
  completeness: 'T1–T11 completeness (CSV)',
  services: 'Services by code (CSV)',
  credit: 'Credit linkage (CSV)',
  announcements: 'Announcements (CSV)',
  issues: 'Issues (CSV)',
  pdf: 'PDF report',
};

// SABER report / verifier export (story 11.9): DG and Portal-Admin.
const SaberReportPage = () => {
  // The first request asks for this Lagos year; after that the server's current year rules.
  const clientYear = Number(todayLagos().slice(0, 4));
  const [year, setYear] = useState(clientYear);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetchSaberReport(year)
      .then((d) => { if (active) setData(d); })
      .catch((err) => {
        console.error(err);
        if (active) setError(err?.response?.status === 403 ? 'The SABER report is for the DG and Portal-Admin.' : 'Failed to load the SABER report.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [year]);

  const download = async (part) => {
    setBusy(part);
    setDownloadError('');
    try {
      await downloadSaberReport(year, part);
    } catch (err) {
      console.error(err);
      setDownloadError(await exportErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const currentYear = (data && data.currentYear) || clientYear;
  const yearLabel = year === ALL_YEARS ? 'all years' : String(year);
  const header = (
    <PageHeader
      eyebrow="SABER DLI 4 evidence"
      title="SABER report"
      subtitle={`Evidence set for the World Bank verifier · ${yearLabel}. Years use happened dates, never the day a record was entered.`}
      actions={<YearSelector value={year} onChange={setYear} currentYear={currentYear} minYear={MIN_YEAR} />}
    />
  );

  if (error) {
    return (
      <Box>
        {header}
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }
  if (loading && !data) {
    return (
      <Box>
        {header}
        <Typography color="text.secondary">Loading...</Typography>
      </Box>
    );
  }

  const { summary: s, links, parts } = data;
  const csvParts = parts.filter((p) => p.format === 'csv');

  return (
    <Box sx={{ minWidth: 0 }}>
      {header}
      <Alert severity="warning" sx={{ mb: 3 }}>
        {`${CONFIDENTIAL}. Every file says so, names the year, when it was generated and by whom. Each download is recorded in the change log.`}
      </Alert>

      <Box component="section" aria-label="Summary" sx={{ ...grid(200), mb: 3 }}>
        <StatCard
          label="Projects checked (T1–T11)"
          value={formatCount(s.projectsChecked)}
          hint={`${pct(s.completeShare)} complete (${formatCount(s.projectsComplete)} with nothing missing) · ${pct(s.fieldsFilledShare)} of fields filled`}
          to={links.completeness}
        />
        <StatCard
          label="Services tagged"
          value={formatCount(s.servicesTagged)}
          hint={`of ${formatCount(s.interactions)} officer interactions in ${yearLabel}`}
          to={links.services}
          tone="primary"
        />
        <StatCard
          label="Credit linkage"
          value={formatCount(s.creditLinkage)}
          hint={`interactions in ${yearLabel}`}
          to={links.credit}
        />
        <StatCard
          label="DLR 4.4 · announcements counted"
          value={`${formatCount(s.announcementsCounted)}/${ANNOUNCEMENT_TARGET}`}
          hint={`naming OYSIPA · ${formatCount(s.announcements)} announcements in ${yearLabel}`}
          to={links.announcements}
        />
        <StatCard
          label="DLR 4.5 · issues resolved"
          value={pct(s.issuesResolvedShare)}
          hint={`${formatCount(s.issuesResolved)} of ${formatCount(s.issues)} issues resolved (Withdrawn left out)`}
          to={links.issues}
        />
      </Box>

      <Card component="section" aria-labelledby="saber-downloads" sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography id="saber-downloads" variant="h6" component="h2">Download the evidence</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
          Five CSVs (full text) and a PDF (A4, long text cut to fit), singly or all six in one ZIP. The figures match the dashboard for the same year.
        </Typography>
        {downloadError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setDownloadError('')}>{downloadError}</Alert>}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
          {[...csvParts.map((p) => p.part), 'pdf'].map((part) => {
            const meta = parts.find((p) => p.part === part);
            const rows = meta && typeof meta.rows === 'number' ? ` · ${formatCount(meta.rows)} rows` : '';
            return (
              <Button
                key={part}
                variant="outlined"
                startIcon={<FileDownloadOutlinedIcon />}
                onClick={() => download(part)}
                disabled={busy !== null}
                sx={{ maxWidth: '100%', whiteSpace: 'normal', textAlign: 'left' }}
              >
                {busy === part ? 'Preparing...' : `${PART_BUTTONS[part]}${rows}`}
              </Button>
            );
          })}
        </Box>
        <Button
          variant="contained"
          startIcon={<FileDownloadOutlinedIcon />}
          onClick={() => download('all')}
          disabled={busy !== null}
          sx={{ maxWidth: '100%' }}
        >
          {busy === 'all' ? 'Preparing...' : 'Download all (ZIP)'}
        </Button>
      </Card>
    </Box>
  );
};

export default SaberReportPage;
