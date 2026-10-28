import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import SaberReportPage from './SaberReportPage';
import apiClient from '../api/api';

// Story 11.9: SABER report page (synthetic figures).
vi.mock('../utils/dates', async (importOriginal) => ({
  ...(await importOriginal()),
  todayLagos: () => '2026-06-15',
}));

const PARTS = [
  { part: 'completeness', format: 'csv', rows: 12 },
  { part: 'services', format: 'csv', rows: 29 },
  { part: 'credit', format: 'csv', rows: 2 },
  { part: 'announcements', format: 'csv', rows: 3 },
  { part: 'issues', format: 'csv', rows: 4 },
  { part: 'pdf', format: 'pdf' },
  { part: 'all', format: 'zip' },
];
const reportFor = (year) => ({
  year: year === 'all' ? null : Number(year),
  currentYear: 2026,
  summary: {
    projectsChecked: 12, projectsComplete: 3, completeShare: 0.25, fieldsFilledShare: 0.8, interactions: 40, servicesTagged: year === '2025' ? 31 : 7, creditLinkage: 2, announcements: 3, announcementsCounted: 1, issues: 4, issuesResolved: 3, issuesResolvedShare: 0.75,
  },
  links: {
    completeness: '/projects?organisationType=Investor',
    services: `/interactions?officerLogs=1&year=${year}&serviceCode=M1`,
    credit: `/interactions?officerLogs=1&creditLinkage=1&year=${year}`,
    announcements: `/announcements?year=${year}&oysipaNamed=true&counted=1`,
    issues: `/issues?year=${year}&status=Open`,
  },
  parts: PARTS,
});

const renderPage = () => render(<MemoryRouter><SaberReportPage /></MemoryRouter>);

describe('SaberReportPage', () => {
  let getSpy;
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    getSpy = vi.spyOn(apiClient, 'get').mockImplementation((url, config) => {
      if (url === '/api/saber-report') return Promise.resolve({ data: reportFor(config.params.year) });
      if (url === '/api/saber-report/download') {
        const { year, part } = config.params;
        const ext = { pdf: 'pdf', all: 'zip' }[part] || 'csv';
        return Promise.resolve({
          data: new Blob(['x']),
          headers: { 'content-disposition': `attachment; filename="saber-report-${year}-${part}.${ext}"` },
        });
      }
      return Promise.resolve({ data: [] });
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the header, the confidential note and the summary cards linked to their lists', async () => {
    renderPage();
    expect(await screen.findByText('Services tagged')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'SABER report' })).toBeInTheDocument();
    expect(getSpy).toHaveBeenCalledWith('/api/saber-report', { params: { year: '2026' } });
    expect(screen.getByText(/Confidential: OYSIPA internal \(contains personal data\)/)).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Summary' });
    const links = within(summary).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/projects?organisationType=Investor',
      // 11.17: the second link on "Projects checked".
      '/fill-gaps?year=2026',
      '/interactions?officerLogs=1&year=2026&serviceCode=M1',
      '/interactions?officerLogs=1&creditLinkage=1&year=2026',
      '/announcements?year=2026&oysipaNamed=true&counted=1',
      '/issues?year=2026&status=Open',
    ]);
    expect(within(summary).getByText('12')).toBeInTheDocument();
    expect(within(summary).getByText(/25% complete/)).toBeInTheDocument();
    expect(within(summary).getByText('1/5')).toBeInTheDocument();
    expect(within(summary).getByText('75%')).toBeInTheDocument();
  });

  it('"Fill the gaps" on the Projects checked card follows the year (11.17)', async () => {
    renderPage();
    await screen.findByText('Services tagged');
    expect(screen.getByRole('link', { name: 'Fill the gaps' })).toHaveAttribute('href', '/fill-gaps?year=2026');
    await userEvent.click(screen.getByRole('button', { name: '2025' }));
    await waitFor(() => expect(screen.getByRole('link', { name: 'Fill the gaps' })).toHaveAttribute('href', '/fill-gaps?year=2025'));
  });

  it('picking 2025 reloads the summary for 2025', async () => {
    renderPage();
    await screen.findByText('Services tagged');
    await userEvent.click(screen.getByRole('button', { name: '2025' }));
    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/api/saber-report', { params: { year: '2025' } }));
    expect(await screen.findByText('31')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2025' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('"Earlier years" goes down to 2000; the current year comes from the server', async () => {
    getSpy.mockImplementation((url, config) => Promise.resolve({ data: { ...reportFor(config.params.year), currentYear: 2027 } }));
    renderPage();
    await screen.findByText('Services tagged');
    // The server says 2027 (the browser clock says 2026): its button is offered.
    expect(screen.getByRole('button', { name: '2027' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2023' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '2022' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Earlier years' }));
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options[0]).toBe('2022');
    expect(options[options.length - 1]).toBe('2000');
    await userEvent.click(screen.getByRole('option', { name: '2010' }));
    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/api/saber-report', { params: { year: '2010' } }));
  });

  it('six download buttons plus "Download all (ZIP)", each a blob download of that part', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderPage();
    await screen.findByText('Services tagged');
    await userEvent.click(screen.getByRole('button', { name: '2025' }));
    await screen.findByText('31');
    const section = screen.getByRole('region', { name: 'Download the evidence' });
    const buttons = within(section).getAllByRole('button');
    expect(buttons).toHaveLength(7);
    expect(buttons.map((b) => b.textContent)).toEqual([
      'T1–T11 completeness (CSV) · 12 rows', 'Services by code (CSV) · 29 rows', 'Credit linkage (CSV) · 2 rows',
      'Announcements (CSV) · 3 rows', 'Issues (CSV) · 4 rows', 'PDF report', 'Download all (ZIP)',
    ]);
    await userEvent.click(within(section).getByRole('button', { name: 'Download all (ZIP)' }));
    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/api/saber-report/download', { params: { year: '2025', part: 'all' }, responseType: 'blob' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    await userEvent.click(within(section).getByRole('button', { name: 'PDF report' }));
    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/api/saber-report/download', { params: { year: '2025', part: 'pdf' }, responseType: 'blob' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(2));
  });

  it('a refused download shows the server message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getSpy.mockImplementation((url, config) => {
      if (url === '/api/saber-report') return Promise.resolve({ data: reportFor(config.params.year) });
      return Promise.reject({ response: { status: 500, data: new Blob([JSON.stringify({ message: 'Could not write the audit record. Nothing was exported.' })]) } });
    });
    renderPage();
    await screen.findByText('Services tagged');
    await userEvent.click(screen.getByRole('button', { name: /Issues \(CSV\)/ }));
    expect(await screen.findByText('Could not write the audit record. Nothing was exported.')).toBeInTheDocument();
  });

  it('Staff (403) see a refusal, no figures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getSpy.mockRejectedValue({ response: { status: 403 } });
    renderPage();
    expect(await screen.findByText('The SABER report is for the DG and Portal-Admin.')).toBeInTheDocument();
    expect(screen.queryByText('Services tagged')).not.toBeInTheDocument();
  });
});
