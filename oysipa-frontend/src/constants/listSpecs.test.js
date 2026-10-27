import { LIST_SPECS, listForPath } from './listSpecs';
import { BUILT_IN_VIEWS } from './listViews';
import { canonicalQuery, parseQuery } from '../utils/listQuery';
import { makeOverview, makeMine } from '../test/analyticsFixtures';

// Every built-in view and every dashboard / "My work" link must survive the
// spec of the list it opens: no parameter is dropped as "not on the list".
const survives = (path) => {
  const list = listForPath(path);
  expect(list).not.toBeNull();
  const query = path.split('?')[1] || '';
  const sent = new URLSearchParams(query);
  const kept = new URLSearchParams(canonicalQuery(LIST_SPECS[list], query));
  [...new Set(sent.keys())].forEach((key) => {
    expect({ path, key, has: kept.has(key) }).toEqual({ path, key, has: true });
  });
};

const linksIn = (obj, out = []) => {
  if (Array.isArray(obj)) obj.forEach((v) => linksIn(v, out));
  else if (obj && typeof obj === 'object') {
    Object.entries(obj).forEach(([k, v]) => {
      if ((k === 'to' || k === 'seeAll') && typeof v === 'string' && v.startsWith('/')) out.push(v);
      else linksIn(v, out);
    });
  }
  return out;
};

describe('list specs', () => {
  it.each(Object.entries(BUILT_IN_VIEWS).flatMap(([list, views]) => views.map((v) => [list, v.label, v.query])))(
    '%s built-in view "%s" keeps all its filters',
    (list, label, query) => survives(`/${list}?${query}`),
  );

  it('the dashboard and My work links keep all their filters', () => {
    const links = [
      ...linksIn(makeOverview()),
      ...linksIn(makeMine()),
      '/projects?hasValue=1&organisationType=Investor',
      '/projects?hasJobs=1&organisationType=Investor',
      '/projects?organisationType=Investor',
      '/investors?firstContactYear=2025&organisationType=Investor',
      '/investors?firstContactYear=none&organisationType=Investor',
      '/investors?officer=me',
      '/issues?status=Open&status=In+progress&officer=me',
      '/interactions?noCode=1&officer=me',
      '/evidence?untagged=1',
      '/announcements?year=2026&oysipaNamed=true',
      // Links the API sends (story 11.15 review): metrics.mine / overview `to` fields.
      '/interactions?loggedBy=me&officerLogs=1&from=2026-10-01&to=2026-10-27',
      '/interactions?officerLogs=1',
      '/announcements?year=2026&oysipaNamed=true&counted=1',
      '/issues?year=2026&status=Open&status=In+progress&status=Resolved&status=Closed+unresolved',
      '/projects?lifecycleStatus=Lead&officer=me',
      '/projects?lifecycleStatus=Lead&organisationType=Investor',
    ].filter((p) => listForPath(p));
    expect(links.length).toBeGreaterThan(15);
    links.forEach(survives);
  });

  it('repeated params, old comma links, values containing commas, old flag spellings', () => {
    const inv = LIST_SPECS.investors;
    expect(parseQuery(inv, 'country=Korea%2C+Republic+of').country).toEqual(['Korea, Republic of']);
    expect(parseQuery(inv, 'country=Ghana&country=Korea%2C+Republic+of').country).toEqual(['Ghana', 'Korea, Republic of']);
    expect(parseQuery(inv, 'sector=Agribusiness,Manufacturing').sector).toEqual(['Agribusiness', 'Manufacturing']);
    expect(parseQuery(inv, 'sector=Agribusiness&sector=Manufacturing').sector).toEqual(['Agribusiness', 'Manufacturing']);
    expect(parseQuery(inv, 'hasValue=true&incomplete=1')).toMatchObject({ hasValue: true, incomplete: true });
    expect(parseQuery(LIST_SPECS.issues, 'status=Open,In progress').status).toEqual(['Open', 'In progress']);
    // A status name (any text, from the API) with a comma, repeated: kept whole.
    expect(parseQuery(LIST_SPECS.projects, 'lifecycleStatus=Lead%2C+warm&lifecycleStatus=Exit').lifecycleStatus).toEqual(['Lead, warm', 'Exit']);
    expect(canonicalQuery(inv, 'sector=Agribusiness,Manufacturing')).toBe('sector=Agribusiness&sector=Manufacturing');
  });

  it('at most 50 values; an inverted date range is ignored', () => {
    const many = Array.from({ length: 60 }, (_, i) => `investor=${String(i).padStart(24, 'a')}`).join('&');
    expect(parseQuery(LIST_SPECS.interactions, many).investor).toHaveLength(50);
    expect(parseQuery(LIST_SPECS.interactions, 'from=2026-03-01&to=2026-02-01')).toMatchObject({ from: '', to: '' });
    expect(parseQuery(LIST_SPECS.interactions, 'from=2026-02-01&to=2026-03-01')).toMatchObject({ from: '2026-02-01', to: '2026-03-01' });
  });
});
