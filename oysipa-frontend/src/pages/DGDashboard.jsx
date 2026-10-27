import React, { useState, useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Button, Card, LinearProgress, Link, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import ChartCard from '../components/ui/ChartCard';
import { BarList, YearColumns } from '../components/analytics/Charts';
import apiClient from '../api/api';
import { getAuthenticatedUser } from '../utils/auth';
import { todayLagos } from '../utils/dates';
import { formatMoneyCompact } from '../utils/money';
import {
  changeText, coverageText, otherCurrenciesText, ratesUsedText, formatCount,
} from '../utils/analytics';
import { BAND_LABELS } from '../constants/issueFields';
import { ANNOUNCEMENT_TARGET, ANNOUNCEMENT_BAND_LABELS } from '../constants/announcementFields';
import { issueYears } from '../constants/issueFields';
import { tokens } from '../theme';

const FIRST_YEAR = 2023;
const TYPE_ONE = { Investor: 'investor', Intermediary: 'intermediary', 'Promotion agent': 'promotion agent', Contact: 'contact' };
const TYPE_MANY = { Investor: 'investors', Intermediary: 'intermediaries', 'Promotion agent': 'promotion agents', Contact: 'contacts' };
const ALL = 'all';

// Click-through targets (story 11.15). organisationType=Investor keeps the
// list in the same scope as the headline figure, so the counts match.
const PIPELINE_VALUE_LINK = '/projects?hasValue=1&organisationType=Investor';
const JOBS_LINK = '/projects?hasJobs=1&organisationType=Investor';
const UNTAGGED_FILES_LINK = '/evidence?untagged=1';
const firstContactLink = (year) => `/investors?firstContactYear=${year}&organisationType=Investor`;

const grid = (min) => ({ display: 'grid', gap: 2, gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))` });

// Year buttons: 2023 … current, then "All years".
const YearSelector = ({ value, onChange, currentYear }) => {
  const years = [];
  for (let y = FIRST_YEAR; y <= currentYear; y += 1) years.push(y);
  return (
    <Box role="group" aria-label="Year" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
      {[...years.map(String), ALL].map((y) => {
        const active = String(value) === y;
        return (
          <Button
            key={y}
            size="small"
            variant={active ? 'contained' : 'outlined'}
            aria-pressed={active}
            onClick={() => onChange(y === ALL ? ALL : Number(y))}
          >
            {y === ALL ? 'All years' : y}
          </Button>
        );
      })}
    </Box>
  );
};

// One SABER indicator card (big figure on the left, text on the right).
const SaberCard = ({ figure, label, children }) => (
  <Card sx={{ p: 2.5, display: 'flex', gap: 2, alignItems: 'center', height: '100%', boxSizing: 'border-box' }}>
    <Box sx={{
      minWidth: 64, height: 64, px: 1, borderRadius: 3, bgcolor: tokens.maroonTint, color: tokens.maroon, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 20, fontVariantNumeric: 'tabular-nums',
    }}
    >
      {figure}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="overline" component="h2" color="text.secondary" sx={{ lineHeight: 1.4 }}>{label}</Typography>
      {children}
    </Box>
  </Card>
);

const IssuesCard = ({ issues }) => {
  let figure = '—';
  let line = 'No issues registered';
  if (issues && issues.total) {
    figure = `${Math.round(issues.share * 100)}%`;
    line = `${issues.resolved} of ${issues.total} reported in ${issues.year} resolved`;
  } else if (issues && issues.withdrawn) {
    line = `No issues counted (${issues.withdrawn} withdrawn)`;
  }
  return (
    <SaberCard figure={figure} label="DLR 4.5 · issues resolved">
      <Typography variant="body1" sx={{ fontWeight: 600 }}>
        <Link component={RouterLink} to={(issues && issues.to) || '/issues'} underline="hover" color="inherit">{line}</Link>
      </Typography>
      {issues && issues.total > 0 && <Typography variant="body2" color="text.secondary">{BAND_LABELS[issues.band] || issues.band}</Typography>}
    </SaberCard>
  );
};

const AnnouncementsCard = ({ named, series }) => {
  const others = (series || []).filter((s) => s.year !== named.year && s.oysipaNamed > 0).reverse();
  return (
    <SaberCard figure={`${named.counted}/${ANNOUNCEMENT_TARGET}`} label="DLR 4.4 · announcements naming OYSIPA">
      <Typography variant="body1" sx={{ fontWeight: 600 }}>
        <Link component={RouterLink} to={named.to || `/announcements?year=${named.year}&oysipaNamed=true`} underline="hover" color="inherit">
          {`${named.counted} of ${ANNOUNCEMENT_TARGET} in ${named.year}`}
        </Link>
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {[ANNOUNCEMENT_BAND_LABELS[named.band] || named.band, ...others.slice(0, 3).map((s) => `${s.year}: ${s.oysipaNamed}`)].join(' · ')}
      </Typography>
    </SaberCard>
  );
};

const EvidenceCard = ({ evidence }) => (
  <SaberCard figure={formatCount(evidence.files)} label="Evidence library">
    <Typography variant="body1" sx={{ fontWeight: 600 }}>{`${formatCount(evidence.files)} private files`}</Typography>
    <Typography variant="body2">
      {evidence.untagged > 0
        ? <Link component={RouterLink} to={UNTAGGED_FILES_LINK}>{`${formatCount(evidence.untagged)} still need tagging`}</Link>
        : 'All files tagged'}
    </Typography>
  </SaberCard>
);

const DGDashboard = () => {
  const currentYear = Number(todayLagos().slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sectorView, setSectorView] = useState('investors');
  const user = getAuthenticatedUser();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiClient.get('/api/analytics/overview', { params: { year: String(year) } })
      .then(({ data: d }) => { if (active) setData(d); })
      .catch((err) => {
        console.error(err);
        if (active) setError('Failed to fetch the dashboard data.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [year]);

  let welcome = null;
  if (user) welcome = user.name ? `Welcome ${user.role}, ${user.name}` : `Welcome ${user.role}`;

  const header = (
    <PageHeader
      eyebrow="Oyo State investment pipeline"
      title="Dashboard"
      subtitle={welcome}
      actions={<YearSelector value={year} onChange={setYear} currentYear={currentYear} />}
    />
  );

  if (error) {
    return (
      <Box>
        {header}
        <Typography color="error">{error}</Typography>
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

  const {
    headline, yearOnYear: yoy, breakdowns, saber, fx,
  } = data;
  const ch = yoy.change;
  const prev = ch ? ch.previousYear : null;
  const selectedLabel = year === ALL ? 'all years' : String(year);

  // Headline numbers
  const inv = headline.investors;
  const typeHint = Object.entries(inv.byType || {})
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${formatCount(n)} ${(n === 1 ? TYPE_ONE : TYPE_MANY)[t] || t}`)
    .join(' · ');
  const newInvestorsHint = ch && ch.newInvestors
    ? ` · ${formatCount(ch.newInvestors.current)} new in ${ch.year} (${changeText(ch.newInvestors, prev)})`
    : '';
  const groups = headline.projects.byStageGroup || {};
  const stageHint = Object.entries(groups).filter(([, n]) => n > 0).map(([g, n]) => `${formatCount(n)} ${g.toLowerCase()}`).join(' · ');

  const values = headline.values;
  const ngn = values.byCurrency.NGN;
  const eq = values.ngnEquivalent;
  const others = otherCurrenciesText(values.byCurrency);
  const valueCoverage = `${coverageText(values.coverage, 'projects of investors', 'carry a value')} (intermediaries, agents and contacts not counted)`;
  const excludedNote = eq && eq.excluded && eq.excluded.length ? `${eq.excluded.join(', ')} currency not converted.` : null;
  let pipelineValue;
  let pipelineHint;
  // The whole card links to the projects, except when its hint carries its own
  // links (a missing rate): links cannot nest.
  const pipelineLinked = !!(eq && eq.value !== null);
  if (eq && eq.value !== null) {
    pipelineValue = formatMoneyCompact(eq.value, 'NGN');
    pipelineHint = (
      <>
        {`₦ equivalent: ${formatMoneyCompact(ngn ? ngn.sum : 0, 'NGN')}${others ? ` + ${others}` : ''}`}
        {eq.ratesUsed.length > 0 && <><br />{`at ${ratesUsedText(eq.ratesUsed)}`}</>}
        {excludedNote && <><br />{excludedNote}</>}
        <br />
        {valueCoverage}
      </>
    );
  } else {
    pipelineValue = formatMoneyCompact(ngn ? ngn.sum : 0, 'NGN');
    pipelineHint = (
      <>
        {`₦ only${others ? `; + ${others}` : ''}`}
        <br />
        {`No ₦ equivalent: no rate for ${(eq && eq.missing.length ? eq.missing : ['a currency']).join(', ')}. `}
        <Link component={RouterLink} to="/admin">Set rates</Link>
        {excludedNote && <><br />{excludedNote}</>}
        <br />
        {valueCoverage}
        {' · '}
        <Link component={RouterLink} to={PIPELINE_VALUE_LINK}>See the projects</Link>
      </>
    );
  }
  const sizeValue = ngn && ngn.median !== null ? formatMoneyCompact(ngn.median, 'NGN') : '—';
  const sizeHint = ngn && ngn.count
    ? `median of ${formatCount(ngn.count)} ₦ projects of investors · average ${formatMoneyCompact(ngn.average, 'NGN')}`
    : 'no ₦ project values yet';
  const jobs = headline.jobs;

  // Year-on-year series
  // Bars link only to years the announcements page offers.
  const listYears = new Set(issueYears());
  const annSeries = yoy.announcements.series.map((s) => ({
    ...s, overlay: s.oysipaNamed, to: listYears.has(s.year) ? `/announcements?year=${s.year}` : null, highlight: false,
  }));
  const fcSeries = yoy.newInvestors.series.map((s) => ({ ...s, highlight: s.year === year, to: firstContactLink(s.year) }));
  const services = yoy.services;
  // Sector chart: investors, or (11.14 #27) projects by project sector.
  const projectSector = breakdowns.projectSector && Array.isArray(breakdowns.projectSector.items) ? breakdowns.projectSector : null;
  const showProjects = sectorView === 'projects' && !!projectSector;
  const sectorBreakdown = showProjects ? projectSector : breakdowns.sector;
  const sectorNoun = showProjects ? 'projects' : 'investors';
  const sectorTitle = showProjects ? 'Projects by sector' : 'Investors by sector';
  const sectorItems = sectorBreakdown.items.filter((i) => i.count > 0 || i.priority);
  const stageItems = breakdowns.stage.items.filter((i) => i.count > 0);
  const leadItems = breakdowns.leadSource.items.filter((i) => i.count > 0);
  const notRecordedSector = sectorBreakdown.items.find((i) => i.notRecorded);

  return (
    <Box>
      {header}
      {loading && <LinearProgress aria-label="Loading the dashboard" sx={{ mb: 2 }} />}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, opacity: loading ? 0.6 : 1 }} aria-busy={loading}>
        {fx && fx.stale && fx.stale.length > 0 && (
          <Alert severity="warning">
            {`Exchange rates out of date (older than ${fx.staleDays} days): ${fx.stale.join(', ')}. `}
            <Link component={RouterLink} to="/admin">Update the rates</Link>
          </Alert>
        )}
        <Box component="section" aria-label="Headline numbers" sx={grid(200)}>
          <StatCard label="Investors" value={formatCount(inv.total)} hint={`${typeHint}${newInvestorsHint}`} to="/investors?organisationType=Investor" />
          <StatCard label="Projects" value={formatCount(headline.projects.total)} hint={stageHint || 'no projects yet'} to="/projects?organisationType=Investor" />
          <StatCard label="Pipeline value" tone="primary" value={pipelineValue} hint={pipelineHint} to={pipelineLinked ? PIPELINE_VALUE_LINK : undefined} />
          <StatCard label="Typical project size" value={sizeValue} hint={sizeHint} />
          <StatCard
            label="Jobs pledged"
            value={formatCount(jobs.sum)}
            hint={coverageText(jobs.coverage, 'projects of investors', 'have a jobs figure')}
            to={JOBS_LINK}
          />
        </Box>

        <Box component="section" aria-label="SABER indicators" sx={grid(280)}>
          <AnnouncementsCard named={saber.announcements} series={yoy.announcements.series} />
          <IssuesCard issues={saber.issues} />
          <EvidenceCard evidence={saber.evidence} />
        </Box>
        {year === ALL && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: -2 }}>
            {`SABER indicators are for ${saber.year}; charts and services cover all years.`}
          </Typography>
        )}

        <Box sx={grid(360)}>
          <ChartCard
            title="Public investment announcements by year"
            legend={[{ label: 'All', color: tokens.maroonTint2 }, { label: 'Naming OYSIPA', color: tokens.maroon }]}
            footnote={`By announcement date.${ch && ch.announcements ? ` ${ch.year}: ${formatCount(ch.announcements.current)} (${changeText(ch.announcements, prev)}).` : ''} Click a bar to open those announcements.`}
          >
            <YearColumns title="Announcements by year" series={annSeries} overlayLabel="naming OYSIPA" />
          </ChartCard>
          <ChartCard
            title="New investors by first-contact year"
            footnote={(
              <>
                {`${coverageText(yoy.newInvestors.coverage, 'investors', 'have a first-contact date')}.`}
                {yoy.newInvestors.earlier > 0 ? ` ${formatCount(yoy.newInvestors.earlier)} first contacted before ${yoy.newInvestors.series[0].year}.` : ''}
                {ch && ch.newInvestors ? ` ${ch.year}: ${formatCount(ch.newInvestors.current)} (${changeText(ch.newInvestors, prev)}).` : ''}
                {yoy.newInvestors.undated > 0 && (
                  <>
                    {` ${formatCount(yoy.newInvestors.undated)} have no first-contact date yet: `}
                    <Link component={RouterLink} to={firstContactLink('none')}>fill them in</Link>
                    .
                  </>
                )}
              </>
            )}
          >
            <YearColumns title="New investors by first-contact year" series={fcSeries} />
          </ChartCard>
        </Box>

        <Box sx={grid(320)}>
          <ChartCard title="Pipeline by stage" footnote={coverageText(breakdowns.stage.coverage, 'projects', 'have a stage')}>
            <BarList title="Pipeline by stage" items={stageItems} emptyText="No projects yet." />
          </ChartCard>
          <ChartCard
            title={sectorTitle}
            legend={[{ label: 'SABER priority (★)', color: tokens.maroon }, { label: 'Other sectors', color: tokens.blue }]}
            footnote={(
              <>
                {`${coverageText(sectorBreakdown.coverage, sectorNoun, 'have a sector')}.`}
                {notRecordedSector && notRecordedSector.count > 0 && (
                  <>
                    {' '}
                    <Link component={RouterLink} to={notRecordedSector.to}>{`Fix the ${formatCount(notRecordedSector.count)} not recorded`}</Link>
                  </>
                )}
              </>
            )}
          >
            {projectSector && (
              <ToggleButtonGroup
                size="small"
                exclusive
                value={showProjects ? 'projects' : 'investors'}
                onChange={(e, v) => { if (v) setSectorView(v); }}
                aria-label="Count by sector"
                sx={{ mb: 2 }}
              >
                <ToggleButton value="investors">Investors</ToggleButton>
                <ToggleButton value="projects">Projects</ToggleButton>
              </ToggleButtonGroup>
            )}
            <BarList title={sectorTitle} items={sectorItems} />
          </ChartCard>
          <ChartCard title="Where investors come from" footnote={`${coverageText(breakdowns.country.coverage, 'investors', 'have a country')}.`}>
            <BarList title="Investors by country" items={breakdowns.country.items} color={tokens.blue} />
          </ChartCard>
          <ChartCard title="How they found us (T11)" footnote={`${coverageText(breakdowns.leadSource.coverage, 'investors', 'have a known lead source')}.`}>
            <BarList title="Investors by lead source" items={leadItems} />
          </ChartCard>
        </Box>

        <ChartCard
          title={`Services delivered (SABER codes) · ${selectedLabel}`}
          subtitle={`${formatCount(services.interactions)} interactions with a happened date in ${selectedLabel} · ${formatCount(services.tagged)} tagged with a code${services.creditLinkage ? ` · ${formatCount(services.creditLinkage)} credit linkage` : ''}${ch && ch.services ? ` · ${changeText(ch.services, prev)}` : ''}`}
          footnote={`Interactions without a happened date are not counted by year (${formatCount(yoy.interactions.undated)} undated).`}
        >
          <Box
            role="img"
            aria-label={`Services by SABER code: ${services.codes.map((c) => `${c.code} ${c.count}`).join(', ')}`}
            sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}
          >
            {services.codes.map((c) => (
              <Box
                key={c.code}
                sx={{
                  border: 1, borderColor: c.count ? tokens.primaryBorder : 'divider', bgcolor: c.count ? tokens.maroonTint : 'transparent', borderRadius: 2, p: 1, textAlign: 'center',
                }}
              >
                <Box sx={{ fontSize: 12, color: 'text.secondary' }}>{c.code}</Box>
                <Box sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: c.count ? tokens.maroon : 'text.secondary' }}>{c.count}</Box>
              </Box>
            ))}
          </Box>
        </ChartCard>

        <Typography variant="caption" color="text.secondary" component="p">
          Every chart links to the list behind it. Figures are live from the tracker. Values are shown per currency; the ₦ equivalent uses the
          {' '}
          <Link component={RouterLink} to="/admin">Admin exchange rates</Link>
          . Years use happened dates (announcement, first contact, interaction), never the import or registration day.
        </Typography>
      </Box>
    </Box>
  );
};

export default DGDashboard;
