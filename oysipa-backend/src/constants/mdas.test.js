// Story 11.7c: the Oyo MDA reference list and resolveMda.
const {
  MDA_LIST, MDA_CODES, MDA_ALIASES, LEGACY_ALIASES, DEFAULT_MOU_MDAS, resolveMda,
} = require('./mdas');

const norm = (s) => String(s).trim().replace(/\s+/g, ' ').toLowerCase();

describe('MDA_LIST', () => {
  it('has the 63 vlprs entries plus Other last, with unique codes', () => {
    expect(MDA_LIST).toHaveLength(64);
    expect(MDA_LIST[0]).toEqual({ name: 'Oyo State Hospital Management Board', code: 'OYSHMB', abbreviation: 'OYSHMB' });
    expect(MDA_LIST[63]).toEqual({ name: 'Other', code: 'OTHER', abbreviation: 'Other' });
    expect(new Set(MDA_CODES).size).toBe(64);
    MDA_ALIASES.forEach((a) => expect(MDA_CODES).toContain(a.newCode));
    DEFAULT_MOU_MDAS.forEach((c) => expect(MDA_CODES).toContain(c));
  });
});

describe('resolveMda', () => {
  it.each([
    // exact code, case-insensitive, whitespace collapsed
    ['LANDS AND HOUSING', ['LANDS AND HOUSING']],
    ['  lands   and housing ', ['LANDS AND HOUSING']],
    // vlprs name
    ['Ministry of Trade, Investment and Cooperatives', ['TRADE']],
    ['ministry of culture and tourism', ['CULTURE AND TOURISM']],
    // abbreviation
    ['Lands & Housing', ['LANDS AND HOUSING']],
    ['Local Govt', ['LOCAL GOVERNMENT']],
    // vlprs old codes
    ['MLH', ['LANDS AND HOUSING']],
    ['irs', ['BIR']],
    // studio / legacy alias map (every row)
    ['Ministry of Lands, Housing and Urban Development', ['LANDS AND HOUSING']],
    ['Ministry of Environment and Natural Resources', ['ENVIRONMENT']],
    ['Oyo State Internal Revenue Service (OYSIRS)', ['BIR']],
    ['Oyo State Internal Revenue Service', ['BIR']],
    ['OYSIRS', ['BIR']],
    ['Ministry of Public Works and Transport', ['WORKS AND TRANSPORT']],
    ['Office of the Surveyor-General', ['SURVEYOR GENERAL']],
    ['Ministry of Agriculture / OYSADA', ['AGRICULTURE', 'OYSADA']],
    ['Local Government', ['LOCAL GOVERNMENT']],
    // names that already match
    ['OYSIPA', ['OYSIPA']],
    ['Other', ['OTHER']],
    ['Ministry of Energy and Mineral Resources', ['ENERGY RESOURCES']],
  ])('%s → %j', (raw, codes) => {
    expect(resolveMda(raw)).toEqual({ codes });
  });

  it('drops a trailing "(…)" qualifier once when the base matches', () => {
    expect(resolveMda('OYSIPA (BOI and finance linkage)')).toEqual({ codes: ['OYSIPA'], qualified: true });
    expect(resolveMda('Ministry of Finance (budget office)')).toEqual({ codes: ['FINANCE'], qualified: true });
    expect(resolveMda('Ministry of Agriculture / OYSADA (farm road)')).toEqual({ codes: ['AGRICULTURE', 'OYSADA'], qualified: true });
    // only once
    expect(resolveMda('OYSIPA (a) (b)')).toHaveProperty('error');
    // unknown base
    expect(resolveMda('Ministry of Magic (wands)')).toHaveProperty('error');
  });

  it('unknown, empty or non-text → error', () => {
    expect(resolveMda('Ministry of Magic')).toHaveProperty('error');
    expect(resolveMda('')).toHaveProperty('error');
    expect(resolveMda('   ')).toHaveProperty('error');
    expect(resolveMda(null)).toHaveProperty('error');
    expect(resolveMda(42)).toHaveProperty('error');
  });
});

describe('vlprs old codes and table collisions', () => {
  it.each(MDA_ALIASES.map((a) => [a.oldCode, a.newCode]))('old code %s → %s', (oldCode, newCode) => {
    expect(resolveMda(oldCode)).toEqual({ codes: [newCode] });
  });

  it('no normalised key (code, name, abbreviation, old code, legacy alias) maps to two different code sets', () => {
    const keys = new Map();
    const clashes = [];
    const add = (key, codes) => {
      const k = norm(key);
      const v = [...codes].join('|');
      if (keys.has(k) && keys.get(k) !== v) clashes.push(`${k}: ${keys.get(k)} vs ${v}`);
      else keys.set(k, v);
    };
    MDA_LIST.forEach((m) => { add(m.code, [m.code]); add(m.name, [m.code]); add(m.abbreviation, [m.code]); });
    MDA_ALIASES.forEach((a) => add(a.oldCode, [a.newCode]));
    Object.entries(LEGACY_ALIASES).forEach(([name, codes]) => add(name, codes));
    expect(clashes).toEqual([]);
  });
});
