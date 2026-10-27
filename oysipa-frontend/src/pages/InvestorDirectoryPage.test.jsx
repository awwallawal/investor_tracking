import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { vi } from 'vitest';
import InvestorDirectoryPage from './InvestorDirectoryPage';
import apiClient from '../api/api';

// Unsigned JWT-shaped token; jwtDecode only reads the payload.
const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id: 'u1', role } })}.sig`;

const mockInvestors = [
  { _id: '1', investorName: 'John Doe', sector: 'Tech', countryOfOrigin: 'USA' },
  { _id: '2', investorName: 'Jane Smith', sector: 'Agriculture', countryOfOrigin: 'Canada' },
];

const STATUSES = [{ _id: 's1', name: 'Lead' }, { _id: 's2', name: 'Commitment' }];
const STAFF = [{ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Officer A' }];

// Routes apiClient.get by URL: the investors list goes to `investors`; the
// page's side requests (views, stages, officers) get fixed answers.
const mockApi = (investors, { views = [] } = {}) => vi.spyOn(apiClient, 'get').mockImplementation((url, config) => {
  if (url === '/api/views') return Promise.resolve({ data: views });
  if (url === '/api/lifecycle-statuses') return Promise.resolve({ data: STATUSES });
  if (url === '/api/users/staff') return Promise.resolve({ data: STAFF });
  if (url === '/api/investors') return investors(url, config);
  return Promise.reject(new Error(`unexpected ${url}`));
});
const listOf = (data, headers) => () => Promise.resolve({ data, ...(headers && { headers }) });
const investorCalls = (spy) => spy.mock.calls.filter(([url]) => url === '/api/investors');
const lastInvestorCall = (spy) => investorCalls(spy).at(-1);

// The facet pill (not the column header of the same name).
const facetButton = (facet) => screen.getAllByRole('button', { name: new RegExp(`^${facet}`) })
  .find((b) => b.hasAttribute('aria-haspopup'));
// Opens a facet pill and toggles one option (the menu stays open: Escape closes it).
const chooseFacet = async (facet, option) => {
  await userEvent.click(facetButton(facet));
  await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: option }));
  await userEvent.keyboard('{Escape}');
};

const renderPage = () => render(
  <MemoryRouter>
    <InvestorDirectoryPage />
  </MemoryRouter>
);

describe('InvestorDirectoryPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('token');
  });

  afterEach(() => {
    localStorage.removeItem('token');
  });

  it('renders investor directory and fetched investors', async () => {
    const getSpy = mockApi(listOf(mockInvestors));

    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Investors' })).toBeInTheDocument();

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith('/api/investors');
    });

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('Staff: no Delete button and no Actions column; no officer list is requested', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    const getSpy = mockApi(listOf(mockInvestors));
    renderPage();
    expect(await screen.findByText('John Doe')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
    expect(getSpy).not.toHaveBeenCalledWith('/api/users/staff');
  });

  it.each(['Director-General', 'Portal-Admin'])('%s: Confirm disabled until a reason is typed; DELETE sends the reason and refetches', async (role) => {
    localStorage.setItem('token', tokenFor(role));
    let calls = 0;
    const getSpy = mockApi(() => {
      calls += 1;
      return Promise.resolve({ data: calls === 1 ? mockInvestors : [mockInvestors[1]] });
    });
    const delSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: { deleted: { investors: 1, projects: 2, interactions: 4 } } });
    renderPage();

    expect(await screen.findByText('John Doe')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Delete John Doe?')).toBeInTheDocument();
    expect(within(dialog).getByText(/This also deletes all its projects and interactions/)).toBeInTheDocument();

    const confirm = within(dialog).getByRole('button', { name: 'Confirm delete' });
    expect(confirm).toBeDisabled();
    const reason = within(dialog).getByLabelText(/reason/i);
    // fireEvent.change, not userEvent.type: per-keystroke typing made these tests
    // take 15-20 s. Whitespace-only must keep Confirm disabled; the sent reason is trimmed.
    fireEvent.change(reason, { target: { value: '   ' } });
    expect(confirm).toBeDisabled();
    fireEvent.change(reason, { target: { value: '   Duplicate record  ' } });
    expect(reason).toHaveValue('   Duplicate record  ');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);

    await waitFor(() => expect(delSpy).toHaveBeenCalledWith('/api/investors/1', { data: { reason: 'Duplicate record' } }));
    expect(await screen.findByText(/Deleted John Doe: 1 investor, 2 project\(s\), 4 interaction\(s\)/)).toBeInTheDocument();
    await waitFor(() => expect(investorCalls(getSpy)).toHaveLength(2));
    await waitFor(() => expect(screen.queryByText('John Doe')).not.toBeInTheDocument());
  }, 20000);

  it('shows the API error on failure and keeps the investor', async () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    mockApi(listOf(mockInvestors));
    vi.spyOn(apiClient, 'delete').mockRejectedValue({ response: { status: 500, data: { message: 'Could not write the audit record. Nothing was deleted.' } } });
    renderPage();

    await userEvent.click((await screen.findAllByRole('button', { name: 'Delete' }))[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: 'Test' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm delete' }));
    expect(await within(dialog).findByText('Could not write the audit record. Nothing was deleted.')).toBeInTheDocument();
    expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0);
  }, 20000);
});

describe('InvestorDirectoryPage — T11 filters, type chip and Import (11.5 + 11.11)', () => {
  const typed = [
    { _id: '1', investorName: 'John Doe', sector: 'Tech', countryOfOrigin: 'USA', organisationType: 'Investor' },
    { _id: '3', investorName: 'NIPC Synthetic', sector: 'Gov', countryOfOrigin: 'Nigeria', organisationType: 'Intermediary' },
    { _id: '4', investorName: 'Old Record', sector: 'Agro', countryOfOrigin: 'Nigeria' },
  ];
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('token');
  });
  afterEach(() => localStorage.removeItem('token'));

  it('shows an organisation-type chip on each row (old records show Investor)', async () => {
    mockApi(listOf(typed));
    renderPage();
    expect(await screen.findByText('NIPC Synthetic')).toBeInTheDocument();
    expect(screen.getByText('Intermediary')).toBeInTheDocument();
    expect(screen.getAllByText('Investor')).toHaveLength(2);
  });

  it('filters by lead source and organisation type through the API', async () => {
    const getSpy = mockApi(listOf(typed));
    renderPage();
    await screen.findByText('John Doe');
    await chooseFacet('Type', 'Intermediary');
    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/api/investors', { params: { organisationType: 'Intermediary' } }));
    await chooseFacet('Lead source', 'Unknown (pre-T11)');
    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/api/investors', { params: { leadSource: 'Unknown (pre-T11)', organisationType: 'Intermediary' } }));
  }, 20000);

  it('Staff: no Import investors button', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    mockApi(listOf(typed));
    renderPage();
    await screen.findByText('John Doe');
    expect(screen.queryByRole('button', { name: 'Import investors' })).not.toBeInTheDocument();
  });

  it.each(['Director-General', 'Portal-Admin'])('%s: Import investors opens the dialog', async (role) => {
    localStorage.setItem('token', tokenFor(role));
    mockApi(listOf(typed));
    renderPage();
    await screen.findByText('John Doe');
    await userEvent.click(screen.getByRole('button', { name: 'Import investors' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Run import' })).toBeDisabled();
  });
});

describe('InvestorDirectoryPage — search (11.7)', () => {
  const all = [
    { _id: '1', investorName: 'Lakeside Marine & Tourism', sector: 'Tourism', countryOfOrigin: 'Nigeria' },
    { _id: '2', investorName: 'Nutco Synthetic', sector: 'Agro', countryOfOrigin: 'Nigeria' },
  ];
  const Location = () => <div data-testid="location">{useLocation().search}</div>;
  const renderAt = (entry = '/investors') => render(
    <MemoryRouter initialEntries={[entry]}>
      <InvestorDirectoryPage />
      <Location />
    </MemoryRouter>
  );
  const respond = (url, config) => {
    const q = config?.params?.q;
    if (q === 'lakeview') return Promise.resolve({ data: [all[0]], headers: { 'x-total-count': '177' } });
    if (q) return Promise.resolve({ data: [], headers: { 'x-total-count': '177' } });
    return Promise.resolve({ data: all, headers: { 'x-total-count': '177' } });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('token');
  });

  it('typing "lakeview": one request after the 300 ms pause, count "1 of 177", ?q= in the URL', async () => {
    const getSpy = mockApi(respond);
    renderAt();
    expect(await screen.findByText('2 of 177 investors')).toBeInTheDocument();
    expect(getSpy).toHaveBeenCalledWith('/api/investors');
    await userEvent.type(screen.getByLabelText('Search investors'), 'lakeview');
    // Debounced: no request per keystroke.
    expect(getSpy).not.toHaveBeenCalledWith('/api/investors', { params: { q: 'eley' } });
    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/api/investors', { params: { q: 'lakeview' } }));
    expect(getSpy.mock.calls.filter(([, c]) => c?.params?.q).length).toBe(1);
    expect(await screen.findByText('1 of 177 investors')).toBeInTheDocument();
    expect(screen.queryByText('Nutco Synthetic')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('?q=lakeview'));
  });

  it('empty state names the query; clear (x) restores the full list and the URL', async () => {
    const getSpy = mockApi(respond);
    renderAt('/investors?q=zzz');
    expect(await screen.findByText('No investors match "zzz"')).toBeInTheDocument();
    expect(getSpy).toHaveBeenCalledWith('/api/investors', { params: { q: 'zzz' } });
    expect(screen.getByLabelText('Search investors')).toHaveValue('zzz');
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(await screen.findByText('Nutco Synthetic')).toBeInTheDocument();
    expect(screen.getByText('2 of 177 investors')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^$/));
    expect(lastInvestorCall(getSpy)).toEqual(['/api/investors']);
  });

  it('search combines with a filter in one request', async () => {
    const getSpy = mockApi(respond);
    renderAt('/investors?q=lakeview');
    await screen.findByText('1 of 177 investors');
    await chooseFacet('Type', 'Intermediary');
    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/api/investors', { params: { organisationType: 'Intermediary', q: 'lakeview' } }));
  });

  it('a slower, older response never overwrites the newer list', async () => {
    let releaseOld;
    mockApi((url, config) => {
      if (!config) return new Promise((r) => { releaseOld = r; });
      return respond(url, config);
    });
    renderAt();
    await userEvent.type(screen.getByLabelText('Search investors'), 'lakeview');
    expect(await screen.findByText('1 of 177 investors', {}, { timeout: 5000 })).toBeInTheDocument();
    releaseOld({ data: all, headers: { 'x-total-count': '177' } });
    await new Promise((r) => { setTimeout(r, 50); });
    expect(screen.getByText('1 of 177 investors')).toBeInTheDocument();
    expect(screen.queryByText('Nutco Synthetic')).not.toBeInTheDocument();
  });

  it('a ?q= change from outside (back/forward, a link) updates the box and the list', async () => {
    const getSpy = mockApi(respond);
    const Nav = () => {
      const navigate = useNavigate();
      return <button type="button" onClick={() => navigate('/investors?q=lakeview')}>go</button>;
    };
    render(
      <MemoryRouter initialEntries={['/investors']}>
        <InvestorDirectoryPage />
        <Nav />
        <Location />
      </MemoryRouter>
    );
    await screen.findByText('2 of 177 investors');
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/api/investors', { params: { q: 'lakeview' } }));
    expect(screen.getByLabelText('Search investors')).toHaveValue('lakeview');
    expect(await screen.findByText('1 of 177 investors')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('?q=lakeview');
  });
});

describe('InvestorDirectoryPage — redesigned list (11.13)', () => {
  const all = [
    { _id: '1', investorName: 'Bravo Foods', sector: 'Agro', countryOfOrigin: 'Nigeria' },
    { _id: '2', investorName: 'Alpha Power', sector: 'Energy', countryOfOrigin: 'Ghana', organisationType: 'Intermediary' },
  ];
  let lastLocation;
  const Location = () => {
    lastLocation = useLocation();
    const { pathname, search } = lastLocation;
    return <div data-testid="location">{`${pathname}${search}`}</div>;
  };
  const renderAt = (entry = '/investors') => render(
    <MemoryRouter initialEntries={[entry]}>
      <InvestorDirectoryPage />
      <Location />
    </MemoryRouter>
  );
  const names = () => within(screen.getByRole('table', { name: 'Investors' })).getAllByRole('link').map((a) => a.textContent);

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('token');
  });
  afterEach(() => localStorage.removeItem('token'));

  it('the type shows as a badge; sorting by name asks the server (?sort=name) and sets aria-sort', async () => {
    const getSpy = mockApi((url, config) => Promise.resolve({
      data: config?.params?.sort === 'name' ? [all[1], all[0]] : all,
    }));
    renderAt();
    await screen.findByText('Bravo Foods');
    expect(screen.getByText('Intermediary')).toHaveAttribute('data-tone', 'info');
    expect(names()).toEqual(['Bravo Foods', 'Alpha Power']);
    const header = screen.getByRole('columnheader', { name: 'Name' });
    await userEvent.click(within(header).getByRole('button'));
    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/api/investors', { params: { sort: 'name' } }));
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    await waitFor(() => expect(names()).toEqual(['Alpha Power', 'Bravo Foods']));
    expect(new URLSearchParams(lastLocation.search).get('sort')).toBe('name');
    await userEvent.click(within(header).getByRole('button'));
    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/api/investors', { params: { sort: '-name' } }));
    expect(header).toHaveAttribute('aria-sort', 'descending');
  });

  it('clicking a row opens the investor', async () => {
    mockApi(listOf(all));
    renderAt();
    await userEvent.click(await screen.findByText('Ghana'));
    expect(screen.getByTestId('location')).toHaveTextContent('/investors/2');
  });

  it('active filters show as chips; removing one and Clear all reset them (and ?q=)', async () => {
    const getSpy = mockApi(listOf(all));
    renderAt('/investors?q=agro');
    expect(await screen.findByText('Search: "agro"')).toBeInTheDocument();
    await chooseFacet('Type', 'Intermediary');
    expect(await screen.findByText('Type: Intermediary')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Type: Intermediary' }));
    await waitFor(() => expect(lastInvestorCall(getSpy)).toEqual(['/api/investors', { params: { q: 'agro' } }]));
    expect(screen.queryByText('Type: Intermediary')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    await waitFor(() => expect(lastInvestorCall(getSpy)).toEqual(['/api/investors']));
    expect(screen.getByLabelText('Search investors')).toHaveValue('');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/investors$/));
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();
  }, 20000);

  it('an empty directory shows the empty state', async () => {
    mockApi(listOf([]));
    renderAt();
    expect(await screen.findByText('No investors yet')).toBeInTheDocument();
  });

  it('a failed first load shows an error with Retry (not "Loading..." forever); Retry reloads', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let calls = 0;
    const getSpy = mockApi(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('Network Error')) : Promise.resolve({ data: all });
    });
    renderAt();
    expect(await screen.findByText('Could not load investors')).toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Bravo Foods')).toBeInTheDocument();
    expect(screen.queryByText('Could not load investors')).not.toBeInTheDocument();
    expect(investorCalls(getSpy)).toHaveLength(2);
  });
});

describe('InvestorDirectoryPage — click-through filters from the URL (11.14)', () => {
  let lastLocation;
  const LocationProbe = () => {
    lastLocation = useLocation();
    return null;
  };
  const renderAt = (url) => render(
    <MemoryRouter initialEntries={[url]}>
      <InvestorDirectoryPage />
      <LocationProbe />
    </MemoryRouter>
  );
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('token');
  });

  it('reads sector, country, lead source and type from the URL, sends them, and shows chips', async () => {
    const getSpy = mockApi(listOf(mockInvestors));
    renderAt('/investors?sector=Agribusiness&organisationType=Investor&country=Nigeria&leadSource=Other');
    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/api/investors', {
      params: {
        leadSource: 'Other', organisationType: 'Investor', sector: 'Agribusiness', country: 'Nigeria',
      },
    }));
    expect(await screen.findByText('Sector: Agribusiness')).toBeInTheDocument();
    expect(screen.getByText('Country: Nigeria')).toBeInTheDocument();
    expect(screen.getByText('Type: Investor')).toBeInTheDocument();
    expect(screen.getByText('Lead source: Other')).toBeInTheDocument();
  });

  it('removing a chip removes it from the URL and refetches without it', async () => {
    const getSpy = mockApi(listOf(mockInvestors));
    renderAt('/investors?sector=Not+recorded&country=Nigeria');
    expect(await screen.findByText('Sector: Not recorded')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Sector: Not recorded' }));
    await waitFor(() => expect(lastInvestorCall(getSpy)).toEqual(['/api/investors', { params: { country: 'Nigeria' } }]));
    expect(new URLSearchParams(lastLocation.search).get('sector')).toBeNull();
    expect(new URLSearchParams(lastLocation.search).get('country')).toBe('Nigeria');
    expect(screen.queryByText('Sector: Not recorded')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    await waitFor(() => expect(lastInvestorCall(getSpy)).toEqual(['/api/investors']));
    expect(lastLocation.search).toBe('');
  });

  it('values the server would refuse are ignored (not sent, no chip)', async () => {
    const getSpy = mockApi(listOf(mockInvestors));
    renderAt(`/investors?sector=Agro&leadSource=Gossip&organisationType=Alien&officer=bob&firstContactYear=20x5&noContactDays=-3&country=${'x'.repeat(101)}`);
    await screen.findByText('John Doe');
    expect(investorCalls(getSpy)).toEqual([['/api/investors']]);
    expect(screen.queryByText(/^Sector:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Country:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Officer:/)).not.toBeInTheDocument();
  });

  it('a 400 from the server shows its message, not a connection error', async () => {
    mockApi(() => Promise.reject({ response: { status: 400, data: { message: 'Invalid country filter.' } } }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderAt('/investors?country=Nigeria');
    expect(await screen.findByText(/Invalid country filter./)).toBeInTheDocument();
    expect(screen.queryByText(/Check your connection/)).not.toBeInTheDocument();
  });

  it('choosing a sector in the filter puts it in the URL', async () => {
    const getSpy = mockApi(listOf(mockInvestors));
    renderAt('/investors');
    await screen.findByText('John Doe');
    await chooseFacet('Sector', 'Culture and tourism');
    await waitFor(() => expect(lastInvestorCall(getSpy)).toEqual(['/api/investors', { params: { sector: 'Culture and tourism' } }]));
    expect(new URLSearchParams(lastLocation.search).get('sector')).toBe('Culture and tourism');
  }, 20000);
});

describe('InvestorDirectoryPage — 11.15 filters, views and export', () => {
  let lastLocation;
  let navigate;
  const Probe = () => {
    lastLocation = useLocation();
    navigate = useNavigate();
    return null;
  };
  const renderAt = (url) => render(
    <MemoryRouter initialEntries={[url]}>
      <InvestorDirectoryPage />
      <Probe />
    </MemoryRouter>
  );
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('token');
  });
  afterEach(() => localStorage.removeItem('token'));

  it('multi-select sector → one request with both sectors (repeated params), "N of M" count', async () => {
    const getSpy = mockApi((url, config) => Promise.resolve({
      data: config?.params?.sector ? [mockInvestors[0]] : mockInvestors,
      headers: { 'x-total-count': '177' },
    }));
    renderAt('/investors');
    await screen.findByText('2 of 177 investors');
    await userEvent.click(facetButton('Sector'));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Agribusiness' }));
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Manufacturing' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(lastInvestorCall(getSpy)).toEqual(['/api/investors', { params: { sector: ['Agribusiness', 'Manufacturing'] } }]));
    expect(await screen.findByText('1 of 177 investors')).toBeInTheDocument();
    expect(screen.getByText('Sector: Agribusiness')).toBeInTheDocument();
    expect(screen.getByText('Sector: Manufacturing')).toBeInTheDocument();
    expect(facetButton('Sector')).toHaveAccessibleName('Sector: Agribusiness, Manufacturing');
    expect(facetButton('Sector')).toHaveTextContent('Sector · 2');
  }, 20000);

  it('Back restores the previous filters and results; refresh restores the view', async () => {
    const getSpy = mockApi(listOf(mockInvestors));
    const { unmount } = renderAt('/investors?sector=Agribusiness');
    await screen.findByText('Sector: Agribusiness');
    await chooseFacet('Type', 'Intermediary');
    await waitFor(() => expect(lastInvestorCall(getSpy)).toEqual(['/api/investors', { params: { sector: 'Agribusiness', organisationType: 'Intermediary' } }]));
    navigate(-1);
    await waitFor(() => expect(lastInvestorCall(getSpy)).toEqual(['/api/investors', { params: { sector: 'Agribusiness' } }]));
    expect(screen.queryByText('Type: Intermediary')).not.toBeInTheDocument();

    // Refresh: the same URL renders the same view.
    const url = `${lastLocation.pathname}${lastLocation.search}`;
    unmount();
    getSpy.mockClear();
    renderAt(url);
    expect(await screen.findByText('Sector: Agribusiness')).toBeInTheDocument();
    await waitFor(() => expect(investorCalls(getSpy)).toEqual([['/api/investors', { params: { sector: 'Agribusiness' } }]]));
  }, 20000);

  it('built-in tab "No contact in 60+ days" sets ?noContactDays=60 and shows its chip', async () => {
    const getSpy = mockApi(listOf(mockInvestors));
    renderAt('/investors');
    await screen.findByText('John Doe');
    expect(screen.getByRole('tab', { name: 'All investors' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('tab', { name: 'No contact in 60+ days' }));
    await waitFor(() => expect(lastInvestorCall(getSpy)).toEqual(['/api/investors', { params: { noContactDays: '60' } }]));
    expect(lastLocation.search).toBe('?noContactDays=60');
    expect(screen.getByRole('tab', { name: 'No contact in 60+ days' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('No contact in 60+ days', { selector: 'span' })).toBeInTheDocument();
  });

  it('the Staff "My work" link opens their no-contact investors', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    const getSpy = mockApi(listOf(mockInvestors));
    renderAt('/investors?noContactDays=60&officer=me');
    await screen.findByText('John Doe');
    expect(getSpy).toHaveBeenCalledWith('/api/investors', { params: { officer: 'me', noContactDays: '60' } });
    expect(screen.getByText('Officer: Me')).toBeInTheDocument();
  });

  it('stage, officer, first contact, value and incomplete filters are sent', async () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    const getSpy = mockApi(listOf(mockInvestors));
    renderAt('/investors');
    await screen.findByText('John Doe');
    await chooseFacet('Stage', 'Commitment');
    await chooseFacet('Officer', 'Officer A');
    await chooseFacet('First contact', 'No date');
    await userEvent.click(screen.getByRole('button', { name: 'With a project value' }));
    await userEvent.click(screen.getByRole('button', { name: 'Incomplete records' }));
    await waitFor(() => expect(lastInvestorCall(getSpy)).toEqual(['/api/investors', {
      params: {
        stage: 'Commitment', officer: STAFF[0]._id, firstContactYear: 'none', hasValue: '1', incomplete: '1',
      },
    }]));
    expect(screen.getByText('Officer: Officer A')).toBeInTheDocument();
    expect(screen.getByText('No first-contact date')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'With a project value' })).toHaveAttribute('aria-pressed', 'true');
  }, 30000);

  it('a typed country is added to the filter', async () => {
    const getSpy = mockApi(listOf(mockInvestors));
    renderAt('/investors');
    await screen.findByText('John Doe');
    await userEvent.click(facetButton('Country'));
    fireEvent.change(await screen.findByLabelText('Type a country'), { target: { value: 'Ghana' } });
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(lastInvestorCall(getSpy)).toEqual(['/api/investors', { params: { country: 'Ghana' } }]));
  });

  it('Export this view downloads the current filters (CSV blob)', async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation((url) => {
      if (url.startsWith('/api/export/')) {
        return Promise.resolve({ data: new Blob(['Filters: sector=Agribusiness\n'], { type: 'text/csv' }), headers: { 'content-disposition': 'attachment; filename="oysipa-investors-2026-10-27.csv"' } });
      }
      if (url === '/api/investors') return Promise.resolve({ data: mockInvestors });
      return Promise.resolve({ data: [] });
    });
    renderAt('/investors?sector=Agribusiness&q=agro&sort=-name');
    await screen.findByText('John Doe');
    await userEvent.click(screen.getByRole('button', { name: 'Export this view (CSV)' }));
    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/api/export/investors', {
      params: { q: 'agro', sector: 'Agribusiness', sort: '-name' },
      responseType: 'blob',
    }));
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('a saved view shows as a tab and opens its query', async () => {
    const getSpy = mockApi(listOf(mockInvestors), {
      views: [{
        _id: 'v1', list: 'investors', name: 'My agro', query: 'sector=Agribusiness', shared: false, mine: true, canEdit: true, canDelete: true,
      }],
    });
    renderAt('/investors');
    await userEvent.click(await screen.findByRole('tab', { name: 'My agro' }));
    await waitFor(() => expect(lastInvestorCall(getSpy)).toEqual(['/api/investors', { params: { sector: 'Agribusiness' } }]));
    expect(screen.getByRole('tab', { name: 'My agro' })).toHaveAttribute('aria-selected', 'true');
  });
});
