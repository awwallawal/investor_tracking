// Synthetic analytics responses (story 11.14), shaped like
// oysipa-backend/src/services/metrics.js overview() and mine().

const SECTORS = [
  ['Infrastructure', true, 3], ['Waste and circular economy', true, 31], ['Real estate and construction', true, 22],
  ['Agribusiness', true, 27], ['Renewable energy', true, 5], ['Culture and tourism', true, 16],
  ['Manufacturing', false, 5], ['Other', false, 0],
];
const codes = ['M1', 'M4', 'A7', 'V1'].map((code, i) => ({ code, count: [0, 5, 8, 4][i] }));
const change = (current, previous) => ({
  current, previous, delta: current - previous, pct: previous ? (current - previous) / previous : null, isNew: previous === 0 && current > 0,
});
const sectorLink = (name) => `/investors?sector=${encodeURIComponent(name).replace(/%20/g, '+')}&organisationType=Investor`;

export const makeOverview = (overrides = {}) => ({
  year: 2026,
  currentYear: 2026,
  headline: {
    investors: {
      total: 166, records: 177, byType: { Investor: 166, Intermediary: 6, 'Promotion agent': 0, Contact: 5 }, coverage: { with: 177, total: 177 },
    },
    projects: {
      total: 183,
      byStageGroup: {
        'Early pipeline': 30, 'Commitment or execution': 55, Operating: 98, Exited: 0, 'Other stages': 0,
      },
      coverage: { with: 183, total: 183 },
    },
    values: {
      byCurrency: {
        NGN: {
          sum: 1.26e12, count: 39, average: 32.4e9, median: 2.0e9,
        },
        USD: {
          sum: 391e6, count: 8, average: 48.9e6, median: 10e6,
        },
      },
      coverage: { with: 47, total: 183 },
      ngnEquivalent: {
        value: 1.26e12 + 391e6 * 1361.84, ratesUsed: [{ currency: 'USD', rate: 1361.84, asOf: '2026-10-23', source: 'CBN', stale: false }], missing: [], stale: false,
      },
    },
    jobs: { sum: 14957, count: 39, coverage: { with: 39, total: 183 } },
  },
  yearOnYear: {
    announcements: {
      series: [{ year: 2023, count: 9, oysipaNamed: 1 }, { year: 2024, count: 18, oysipaNamed: 2 }, { year: 2025, count: 17, oysipaNamed: 2 }, { year: 2026, count: 11, oysipaNamed: 0 }],
      undated: 0,
      to: '/announcements',
    },
    newInvestors: {
      series: [{ year: 2023, count: 21 }, { year: 2024, count: 11 }, { year: 2025, count: 60 }, { year: 2026, count: 14 }],
      undated: 67,
      later: 0,
      total: 173,
      coverage: { with: 106, total: 173 },
      to: '/investors?organisationType=Investor',
    },
    interactions: {
      series: [{ year: 2026, count: 34 }], undated: 28, later: 0, total: 62, coverage: { with: 34, total: 62 }, to: '/interactions',
    },
    services: {
      year: 2026, codes, interactions: 34, tagged: 20, creditLinkage: 2, coverage: { with: 20, total: 34 },
    },
    change: {
      year: 2026,
      previousYear: 2025,
      announcements: change(11, 17),
      oysipaNamed: change(0, 2),
      newInvestors: change(14, 60),
      interactions: change(34, 0),
      services: change(20, 0),
    },
  },
  breakdowns: {
    stage: {
      items: [
        { label: 'Initial Lead', count: 18, group: 'Early pipeline', to: '/projects?lifecycleStatus=Initial+Lead' },
        { label: 'Commitment', count: 46, group: 'Commitment or execution', to: '/projects?lifecycleStatus=Commitment' },
        { label: 'Exit', count: 0, group: 'Exited', to: '/projects?lifecycleStatus=Exit' },
      ],
      coverage: { with: 183, total: 183 },
    },
    sector: {
      items: [
        ...SECTORS.map(([label, priority, count]) => ({
          label, priority, count, to: sectorLink(label),
        })),
        {
          label: 'Not recorded', priority: false, notRecorded: true, count: 13, to: sectorLink('Not recorded'),
        },
      ],
      coverage: { with: 153, total: 166 },
    },
    country: {
      items: [
        { label: 'Nigeria', count: 110, to: '/investors?country=Nigeria&organisationType=Investor' },
        { label: 'China', count: 5, to: '/investors?country=China&organisationType=Investor' },
        {
          label: 'Others', count: 7, countries: 6, to: null,
        },
        {
          label: 'Not recorded', notRecorded: true, count: 44, to: '/investors?country=Not+recorded&organisationType=Investor',
        },
      ],
      coverage: { with: 122, total: 166 },
    },
    leadSource: {
      items: [
        { label: 'Government or MDA referral', count: 51, to: '/investors?leadSource=Government+or+MDA+referral&organisationType=Investor' },
        {
          label: 'Unknown (pre-T11)', count: 85, unknown: true, to: '/investors?leadSource=Unknown+%28pre-T11%29&organisationType=Investor',
        },
      ],
      coverage: { with: 81, total: 166 },
    },
    organisationType: { items: [], coverage: { with: 177, total: 177 } },
  },
  saber: {
    year: 2026,
    issues: {
      year: 2026, total: 4, resolved: 0, withdrawn: 0, share: 0, band: 'below basic',
    },
    announcements: { year: 2026, counted: 0, band: 'none yet' },
    evidence: { files: 302, untagged: 87, to: '/evidence' },
  },
  fx: {
    latest: {}, missing: [], stale: [], staleDays: 30,
  },
  ...overrides,
});

export const makeMine = (overrides = {}) => ({
  scope: 'assigned',
  investors: { total: 12, investors: 11 },
  projects: { total: 9 },
  values: {
    byCurrency: {
      NGN: {
        sum: 4.5e9, count: 3, average: 1.5e9, median: 1e9,
      },
    },
    coverage: { with: 3, total: 9 },
    ngnEquivalent: {
      value: 4.5e9, ratesUsed: [], missing: [], stale: false,
    },
  },
  interactionsLogged: { thisMonth: 7, lastMonth: 3 },
  openIssues: 2,
  attention: {
    noContact: { count: 4, days: 60, to: '/investors' },
    missingFields: {
      count: 5, reasons: {}, to: '/investors',
    },
    staleIssues: { count: 1, days: 14, to: '/issues' },
    untaggedInteractions: { count: 6, to: '/interactions' },
    untaggedFiles: { count: 87, to: '/evidence' },
  },
  stages: {
    items: [{ label: 'Lead', count: 4, to: '/projects?lifecycleStatus=Lead' }, { label: 'Commitment', count: 5, to: '/projects?lifecycleStatus=Commitment' }],
    coverage: { with: 9, total: 9 },
  },
  recent: [{
    _id: 'r1', category: 'Site visit', description: 'Visited the site', interactionDate: '2026-10-12T00:00:00.000Z', createdAt: '2026-10-12T09:00:00.000Z', investor: { _id: 'i1', investorName: 'Sample Agro Processing Ltd' }, loggedBy: { _id: 'u1', name: 'Officer A' }, mine: true,
  }],
  glance: {
    investors: 177,
    projects: 183,
    values: {
      byCurrency: { NGN: { sum: 1.26e12, count: 39 } },
      ngnEquivalent: {
        value: 1.26e12, ratesUsed: [], missing: [], stale: false,
      },
    },
    jobs: { sum: 14957, count: 39 },
  },
  fx: { stale: [], missing: [] },
  ...overrides,
});

export const emptyMine = () => makeMine({
  investors: { total: 0, investors: 0 },
  projects: { total: 0 },
  values: { byCurrency: {}, coverage: { with: 0, total: 0 }, ngnEquivalent: { value: 0, ratesUsed: [], missing: [], stale: false } },
  interactionsLogged: { thisMonth: 0, lastMonth: 0 },
  openIssues: 0,
  attention: {
    noContact: { count: 0, days: 60, to: '/investors' },
    missingFields: { count: 0, reasons: {}, to: '/investors' },
    staleIssues: { count: 0, days: 14, to: '/issues' },
    untaggedInteractions: { count: 0, to: '/interactions' },
    untaggedFiles: { count: 0, to: '/evidence' },
  },
  stages: { items: [], coverage: { with: 0, total: 0 } },
  recent: [],
});
