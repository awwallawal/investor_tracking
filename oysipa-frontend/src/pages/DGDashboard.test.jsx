import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';
import DGDashboard from './DGDashboard';
import apiClient from '../api/api';
import { getAuthenticatedUser } from '../utils/auth';
import { makeOverview } from '../test/analyticsFixtures';

vi.mock('../api/api');
vi.mock('../utils/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}));
// A fixed "today" so the year selector (and the snapshot) do not change with the calendar.
vi.mock('../utils/dates', async (importOriginal) => ({
  ...(await importOriginal()),
  todayLagos: () => '2026-06-15',
}));

const renderPage = () => render(<BrowserRouter><DGDashboard /></BrowserRouter>);
const overviewCalls = () => apiClient.get.mock.calls.filter(([url]) => url === '/api/analytics/overview');

describe('DGDashboard (11.14 analytics)', () => {
  const mockUser = { name: 'Test User', role: 'Director-General' };

  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockReturnValue(mockUser);
    apiClient.get.mockImplementation((url, config) => {
      if (url === '/api/analytics/overview') {
        const y = config?.params?.year;
        return Promise.resolve({ data: makeOverview({ year: y === 'all' ? null : Number(y) }) });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
  });

  it('loads the overview for the current year and shows the headline numbers with coverage', async () => {
    renderPage();
    expect(await screen.findByText(`Welcome ${mockUser.role}, ${mockUser.name}`)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/api/analytics/overview', { params: { year: '2026' } });

    const headline = await screen.findByRole('region', { name: 'Headline numbers' });
    expect(within(headline).getByText('166')).toBeInTheDocument();
    expect(within(headline).getByText(/^166 investors · 6 intermediaries · 5 contacts/)).toBeInTheDocument();
    expect(within(headline).getByText(/14 new in 2026 \(−77% vs 2025\)/)).toBeInTheDocument();
    expect(within(headline).getByText('183')).toBeInTheDocument();
    expect(within(headline).getByText('30 early pipeline · 55 commitment or execution · 98 operating')).toBeInTheDocument();
    // ₦ equivalent = NGN + US$391m at 1361.84 = ₦1.79tn
    expect(within(headline).getByText('₦1.79tn')).toBeInTheDocument();
    expect(within(headline).getByText(/₦ equivalent: ₦1.26tn \+ US\$391m/)).toBeInTheDocument();
    expect(within(headline).getByText(/USD ₦1,361.84 \(23 Oct 2026\)/)).toBeInTheDocument();
    expect(within(headline).getAllByText(/47 of 183 projects of investors carry a value/)).toHaveLength(1);
    // Typical size: median with the average
    expect(within(headline).getByText('₦2bn')).toBeInTheDocument();
    expect(within(headline).getByText(/average ₦32.4bn/)).toBeInTheDocument();
    expect(within(headline).getByText('14,957')).toBeInTheDocument();
    expect(within(headline).getByText('39 of 183 projects of investors have a jobs figure')).toBeInTheDocument();
  });

  it('shows the SABER cards from the overview', async () => {
    renderPage();
    const saber = await screen.findByRole('region', { name: 'SABER indicators' });
    expect(within(saber).getByText('0/5')).toBeInTheDocument();
    expect(within(saber).getByRole('link', { name: '0 of 5 in 2026' })).toHaveAttribute('href', '/announcements?year=2026&oysipaNamed=true');
    expect(within(saber).getByText('0 of 4 reported in 2026 resolved')).toBeInTheDocument();
    expect(within(saber).getByText('302 private files')).toBeInTheDocument();
    expect(within(saber).getByRole('link', { name: '87 still need tagging' })).toHaveAttribute('href', '/evidence');
  });

  it('charts are images labelled with their values, and bars link to the filtered list', async () => {
    renderPage();
    const sectorChart = await screen.findByRole('img', { name: /^Investors by sector:/ });
    expect(sectorChart).toHaveAttribute('aria-label', expect.stringContaining('Agribusiness 27'));
    expect(sectorChart).toHaveAttribute('aria-label', expect.stringContaining('Not recorded 13'));
    expect(within(sectorChart).getByRole('link', { name: 'Agribusiness: 27' }))
      .toHaveAttribute('href', '/investors?sector=Agribusiness&organisationType=Investor');
    // Sector with no investors and not a priority sector is left out
    expect(sectorChart).not.toHaveAttribute('aria-label', expect.stringContaining('Other 0'));
    expect(screen.getByRole('link', { name: 'Fix the 13 not recorded' })).toHaveAttribute('href', '/investors?sector=Not+recorded&organisationType=Investor');

    const ann = screen.getByRole('img', { name: /^Announcements by year:/ });
    expect(ann).toHaveAttribute('aria-label', 'Announcements by year: 2023 9 (1 naming OYSIPA), 2024 18 (2 naming OYSIPA), 2025 17 (2 naming OYSIPA), 2026 11 (0 naming OYSIPA)');
    expect(within(ann).getByRole('link', { name: '2024: 18, 2 naming OYSIPA' })).toHaveAttribute('href', '/announcements?year=2024');

    const fc = screen.getByRole('img', { name: /^New investors by first-contact year:/ });
    expect(fc).toHaveAttribute('aria-label', expect.stringContaining('2025 60'));
    expect(screen.getByText(/67 have no first-contact date yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'fill them in' })).toHaveAttribute('href', '/investors?organisationType=Investor');

    const country = screen.getByRole('img', { name: /^Investors by country:/ });
    expect(within(country).getByRole('link', { name: 'Nigeria: 110' })).toHaveAttribute('href', '/investors?country=Nigeria&organisationType=Investor');
    expect(within(country).queryByRole('link', { name: 'Others: 7' })).not.toBeInTheDocument();
    expect(within(country).getByText('Others')).toBeInTheDocument();

    const stage = screen.getByRole('img', { name: /^Pipeline by stage:/ });
    expect(within(stage).getByRole('link', { name: 'Commitment: 46' })).toHaveAttribute('href', '/projects?lifecycleStatus=Commitment');
    expect(stage).not.toHaveAttribute('aria-label', expect.stringContaining('Exit'));

    const lead = screen.getByRole('img', { name: /^Investors by lead source:/ });
    expect(lead).toHaveAttribute('aria-label', expect.stringContaining('Unknown (pre-T11) 85'));

    const services = screen.getByRole('img', { name: /^Services by SABER code:/ });
    expect(services).toHaveAttribute('aria-label', 'Services by SABER code: M1 0, M4 5, A7 8, V1 4');
  });

  it('switching the year refetches with ?year=; "All years" sends year=all', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'Headline numbers' });
    const years = screen.getByRole('group', { name: 'Year' });
    expect(within(years).getAllByRole('button').map((b) => b.textContent)).toEqual(['2023', '2024', '2025', '2026', 'All years']);
    expect(within(years).getByRole('button', { name: '2026' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(within(years).getByRole('button', { name: '2025' }));
    await waitFor(() => expect(apiClient.get).toHaveBeenLastCalledWith('/api/analytics/overview', { params: { year: '2025' } }));
    expect(within(years).getByRole('button', { name: '2025' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(within(years).getByRole('button', { name: 'All years' }));
    await waitFor(() => expect(apiClient.get).toHaveBeenLastCalledWith('/api/analytics/overview', { params: { year: 'all' } }));
    expect(await screen.findByText(/SABER indicators are for 2026/)).toBeInTheDocument();
    expect(overviewCalls()).toHaveLength(3);
  });

  it('a missing rate: no ₦ equivalent is invented; the ₦ total shows with a "Set rates" link', async () => {
    const data = makeOverview();
    data.headline.values.ngnEquivalent = {
      value: null, ratesUsed: [], missing: ['USD'], stale: false,
    };
    apiClient.get.mockResolvedValue({ data });
    renderPage();
    const headline = await screen.findByRole('region', { name: 'Headline numbers' });
    expect(within(headline).getByText('₦1.26tn')).toBeInTheDocument();
    expect(within(headline).queryByText('₦1.79tn')).not.toBeInTheDocument();
    expect(within(headline).getByText(/No ₦ equivalent: no rate for USD/)).toBeInTheDocument();
    expect(within(headline).getByRole('link', { name: 'Set rates' })).toHaveAttribute('href', '/admin');
  });

  it('out-of-date rates show a warning', async () => {
    apiClient.get.mockResolvedValue({
      data: makeOverview({
        fx: {
          latest: {}, missing: [], stale: ['EUR'], staleDays: 30,
        },
      }),
    });
    renderPage();
    expect(await screen.findByText(/Exchange rates out of date \(older than 30 days\): EUR/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Update the rates' })).toHaveAttribute('href', '/admin');
  });

  it('a previous year of 0 shows the change as "new"', async () => {
    renderPage();
    expect(await screen.findByText(/34 interactions with a happened date in 2026 · 20 tagged with a code · 2 credit linkage · new vs 2025/)).toBeInTheDocument();
  });

  it('shows a loading bar while a new year loads', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'Headline numbers' });
    let release;
    apiClient.get.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ data: makeOverview({ year: 2025 }) }); }));
    await userEvent.click(within(screen.getByRole('group', { name: 'Year' })).getByRole('button', { name: '2025' }));
    expect(await screen.findByRole('progressbar', { name: 'Loading the dashboard' })).toBeInTheDocument();
    release();
    await waitFor(() => expect(screen.queryByRole('progressbar', { name: 'Loading the dashboard' })).not.toBeInTheDocument());
  });

  it('announcement bars link only to years the list offers; Other currency is noted, not converted; earlier first contacts noted', async () => {
    const data = makeOverview();
    data.yearOnYear.announcements.series = [{ year: 2022, count: 3, oysipaNamed: 0 }, ...data.yearOnYear.announcements.series];
    data.yearOnYear.newInvestors.earlier = 4;
    data.headline.values.ngnEquivalent = { ...data.headline.values.ngnEquivalent, excluded: ['Other'] };
    apiClient.get.mockResolvedValue({ data });
    renderPage();
    const ann = await screen.findByRole('img', { name: /^Announcements by year:/ });
    expect(within(ann).queryByRole('link', { name: '2022: 3, 0 naming OYSIPA' })).not.toBeInTheDocument();
    expect(within(ann).getByRole('link', { name: '2023: 9, 1 naming OYSIPA' })).toHaveAttribute('href', '/announcements?year=2023');
    expect(screen.getByText(/Other currency not converted/)).toBeInTheDocument();
    expect(screen.getByText(/4 first contacted before 2023/)).toBeInTheDocument();
  });

  it('displays an error message if the API call fails', async () => {
    apiClient.get.mockRejectedValue(new Error('API Error'));
    renderPage();
    expect(await screen.findByText('Failed to fetch the dashboard data.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Headline numbers' })).not.toBeInTheDocument();
  });

  it('matches snapshot after successful render', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'Headline numbers' });
    expect(document.body).toMatchSnapshot();
  });

  it('a token without a name: "Welcome Director-General" (no "undefined")', async () => {
    getAuthenticatedUser.mockReturnValue({ role: 'Director-General' });
    renderPage();
    expect(await screen.findByText('Welcome Director-General')).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });
});
