// Story 11.14: sector list and resolveSector. Pure: no database.
const {
  SECTORS, SECTOR_VALUES, PRIORITY_SECTORS, NOT_RECORDED, resolveSector, isSectorValue,
} = require('./sectors');

// Every sector spelling in the live data on 24 Oct 2026 (34 values) → expected sector.
const LIVE_SPELLINGS = [
  ['Agriculture/Agribusiness', 'Agribusiness'],
  ['Manufacturing', 'Manufacturing'],
  ['Manufacturing ', 'Manufacturing'],
  ['Tourism', 'Culture and tourism'],
  ['Agribusiness', 'Agribusiness'],
  ['Solid Minerals and Mining', 'Solid minerals and mining'],
  ['Energy (oil and gas)', 'Oil and gas'],
  ['Real Estate and Construction', 'Real estate and construction'],
  ['Financial Services', 'Financial services'],
  ['Culture and Tourism', 'Culture and tourism'],
  ['Renewable Energy', 'Renewable energy'],
  ['Infrastructure', 'Infrastructure'],
  ['Hospitality', 'Culture and tourism'],
  ['Retail and Trade', 'Trade and retail'],
  ['Technology and ICT', 'Technology and ICT'],
  ['Waste and Circular Economy', 'Waste and circular economy'],
  ['Healthcare', 'Healthcare'],
  ['Not known', NOT_RECORDED],
  ['Agriculture (cashew processing)', 'Agribusiness'],
  ['Tourism and hospitality', 'Culture and tourism'],
  ['ICT', 'Technology and ICT'],
  ['Healthcare infrastructure', 'Healthcare'],
  ['Agribusiness and infrastructure', 'Agribusiness'],
  ['Infrastructure, energy, agriculture, mining', 'Infrastructure'],
  ['Transport and logistics', 'Transport and logistics'],
  ['Tourism and leisure', 'Culture and tourism'],
  ['Intermediary (trade)', 'Trade and retail'],
  ['Intermediary (agriculture)', 'Agribusiness'],
  ['Intermediary (employer federation)', 'Other'],
  ['Intermediary (agritech)', 'Agribusiness'],
  ['Intermediary (development partner)', 'Other'],
  ['Manufacturing (burnt brick)', 'Manufacturing'],
  ['Solid Minerals and Mining (mineral testing laboratory)', 'Solid minerals and mining'],
  ['Solid Minerals and Mining (mineral export)', 'Solid minerals and mining'],
];

describe('sector list', () => {
  it('has the six priority sectors flagged, then the others, Other last', () => {
    expect(SECTORS.filter((s) => s.priority).map((s) => s.name)).toEqual([
      'Infrastructure', 'Waste and circular economy', 'Real estate and construction',
      'Agribusiness', 'Renewable energy', 'Culture and tourism',
    ]);
    expect(PRIORITY_SECTORS).toHaveLength(6);
    expect(SECTORS).toHaveLength(15);
    expect(SECTORS[SECTORS.length - 1]).toEqual({ name: 'Other', priority: false });
    expect(SECTOR_VALUES).toContain(NOT_RECORDED);
    expect(isSectorValue('Agribusiness')).toBe(true);
    expect(isSectorValue('agribusiness')).toBe(false);
    expect(isSectorValue('Agro')).toBe(false);
  });
});

describe('resolveSector', () => {
  it('maps all 34 live spellings', () => {
    expect(LIVE_SPELLINGS).toHaveLength(34);
    LIVE_SPELLINGS.forEach(([raw, sector]) => {
      const got = resolveSector(raw);
      expect({ raw, sector: got.sector }).toEqual({ raw, sector });
      expect(got.warning).toBeUndefined();
    });
  });

  it('keeps the original text as detail only when it differs from the sector name', () => {
    expect(resolveSector('Manufacturing ')).toEqual({ sector: 'Manufacturing', detail: null });
    expect(resolveSector('Culture and Tourism')).toEqual({ sector: 'Culture and tourism', detail: null });
    expect(resolveSector('Intermediary (agritech)')).toEqual({ sector: 'Agribusiness', detail: 'Intermediary (agritech)' });
    expect(resolveSector('Manufacturing (burnt brick)')).toEqual({ sector: 'Manufacturing', detail: 'Manufacturing (burnt brick)' });
    expect(resolveSector('Hospitality')).toEqual({ sector: 'Culture and tourism', detail: 'Hospitality' });
  });

  it('maps the spec spellings, ignoring case and spaces', () => {
    expect(resolveSector('Intermediary (agriculture/agritech)').sector).toBe('Agribusiness');
    expect(resolveSector('Intermediary (development partner / employer federation)').sector).toBe('Other');
    expect(resolveSector('  WASTE   and circular ECONOMY ').sector).toBe('Waste and circular economy');
    expect(resolveSector('Solid Minerals & Mining').sector).toBe('Solid minerals and mining');
  });

  it('empty and "Not known" are Not recorded with no detail', () => {
    [undefined, null, '', '   ', 'Not known', 'NOT KNOWN', 'Not recorded'].forEach((raw) => {
      expect(resolveSector(raw)).toEqual({ sector: NOT_RECORDED, detail: null });
    });
  });

  it('unknown values become Other with a warning, keeping the text', () => {
    const got = resolveSector('Mystery Sector');
    expect(got.sector).toBe('Other');
    expect(got.detail).toBe('Mystery Sector');
    expect(got.warning).toMatch(/Mystery Sector/);
    expect(resolveSector('Intermediary (space travel)')).toMatchObject({ sector: 'Other', warning: expect.any(String) });
  });

  it('list values resolve to themselves', () => {
    SECTOR_VALUES.forEach((v) => expect(resolveSector(v)).toEqual({ sector: v, detail: null }));
  });
});
