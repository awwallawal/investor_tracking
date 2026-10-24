// Oyo State MDA reference list (story 11.7c). Single copy in this repo: the
// frontend reads it from GET /api/mdas.
//
// Source: vlprs repository, packages/shared/src/constants/mdas.ts (MDA_LIST,
// MDA_ALIASES), copied 24 Oct 2026. MDA_LIST has 63 entries; copied as plain JS.
// Names are kept exactly as vlprs has them. One entry is added here: Other.
// Issues store the code; screens show the name.

const MDA_LIST = Object.freeze([
  { name: 'Oyo State Hospital Management Board', code: 'OYSHMB', abbreviation: 'OYSHMB' },
  { name: 'Ministry of Finance', code: 'FINANCE', abbreviation: 'Finance' },
  { name: 'Agricultural Credit Corporation of Oyo State', code: 'ACCOS', abbreviation: 'ACCOS' },
  { name: 'Library Board', code: 'LIBRARY', abbreviation: 'Library Board' },
  { name: 'Ministry of Local Government and Chieftaincy Matters', code: 'LOCAL GOVERNMENT', abbreviation: 'Local Govt' },
  { name: 'Ministry of Information', code: 'INFORMATION', abbreviation: 'Information' },
  { name: 'Public Complaints Commission', code: 'PCC', abbreviation: 'PCC' },
  { name: 'Bureau of Statistics', code: 'STATISTICS', abbreviation: 'Statistics' },
  { name: 'Board for Technical and Vocational Education', code: 'BOTAVED', abbreviation: 'BOTAVED' },
  { name: 'Ministry of Special Duties', code: 'SPECIAL DUTIES', abbreviation: 'Special Duties' },
  { name: 'Oyo State Housing Corporation', code: 'HOUSING', abbreviation: 'Housing Corp' },
  { name: 'Local Government Audit Commission', code: 'LOCAL GOVERNMENT AUDIT', abbreviation: 'LG Audit' },
  { name: 'Office of the Surveyor General', code: 'SURVEYOR GENERAL', abbreviation: 'Surveyor General' },
  { name: 'Teaching Service Commission', code: 'TESCOM', abbreviation: 'TESCOM' },
  { name: 'Ministry of Women Affairs', code: 'WOMEN AFFAIRS', abbreviation: 'Women Affairs' },
  { name: 'Oyo State Legislature', code: 'LEGISLATURE', abbreviation: 'Legislature' },
  { name: 'Broadcasting Corporation of Oyo State', code: 'BCOS', abbreviation: 'BCOS' },
  { name: 'Ministry of Environment', code: 'ENVIRONMENT', abbreviation: 'Environment' },
  { name: 'State Universal Basic Education Board', code: 'SUBEB', abbreviation: 'SUBEB' },
  { name: 'Oyo State Sports Council', code: 'SPORTS COUNCIL', abbreviation: 'Sports Council' },
  { name: 'House of Assembly Commission', code: 'ASSEMBLY COMMISSION', abbreviation: 'Assembly Commission' },
  { name: 'Oyo State Water Corporation', code: 'WATER CORPORATION', abbreviation: 'Water Corp' },
  { name: 'Board of Internal Revenue', code: 'BIR', abbreviation: 'BIR' },
  { name: 'Ministry of Budget and Economic Planning', code: 'BUDGET AND PLANNING', abbreviation: 'Budget & Planning' },
  { name: 'Oyo State Judicial Service Commission', code: 'JUDICIAL COMMISSION', abbreviation: 'Judicial Commission' },
  { name: 'Ministry of Health', code: 'HEALTH', abbreviation: 'Health' },
  { name: 'College of Health Sciences', code: 'HEALTH COLLEGE', abbreviation: 'Health College' },
  { name: 'College of Nursing and Midwifery', code: 'NURSING AND MIDWIFERY', abbreviation: 'Nursing & Midwifery' },
  { name: 'Oyo State Agency for Adult and Non-Formal Education', code: 'AANFE', abbreviation: 'AANFE' },
  { name: 'Ministry of Energy and Mineral Resources', code: 'ENERGY RESOURCES', abbreviation: 'Energy Resources' },
  { name: 'Oyo State Health Insurance Agency', code: 'OYSHIA', abbreviation: 'OYSHIA' },
  { name: 'Ministry of Establishment', code: 'ESTABLISHMENT', abbreviation: 'Establishment' },
  { name: 'Oyo State Investment, Public and Private Partnership Agency', code: 'OYSIPA', abbreviation: 'OYSIPA' },
  { name: 'Oyo State Road Traffic Management Agency', code: 'OYRTMA', abbreviation: 'OYRTMA' },
  { name: 'Oyo State Independent Electoral Commission', code: 'OYSIEC', abbreviation: 'OYSIEC' },
  { name: 'Oyo State Primary Healthcare Board', code: 'OYSPHB', abbreviation: 'OYSPHB' },
  { name: 'Oyo State Mineral Development Agency', code: 'OYSMDA', abbreviation: 'OYSMDA' },
  { name: 'Ministry of Lands and Housing', code: 'LANDS AND HOUSING', abbreviation: 'Lands & Housing' },
  { name: 'Ministry of Education', code: 'EDUCATION', abbreviation: 'Education' },
  { name: 'Oyo State Advertising Agency', code: 'OYSAA', abbreviation: 'OYSAA' },
  { name: 'Oyo State Rural Electrification Board', code: 'OYSREB', abbreviation: 'OYSREB' },
  { name: "Governor's Office", code: 'GOVERNOR OFFICE', abbreviation: "Governor's Office" },
  { name: "Accountant General's Office", code: 'ACCOUNTANT GENERAL', abbreviation: 'Accountant General' },
  { name: 'Ministry of Arts and Culture', code: 'ARTS AND CULTURE', abbreviation: 'Arts & Culture' },
  { name: 'Oyo State High Court', code: 'HIGH COURT', abbreviation: 'High Court' },
  { name: 'Oyo State Agency for Youth Development', code: 'YOUTH DEVELOPMENT', abbreviation: 'Youth Development' },
  { name: 'Oyo State Road Maintenance Agency', code: 'OYSROMA', abbreviation: 'OYSROMA' },
  { name: 'Head of Service Office', code: 'HOS', abbreviation: 'HOS' },
  { name: 'Oyo State Government Printing Press', code: 'PRINTING PRESS', abbreviation: 'Printing Press' },
  { name: 'Cocoa Development Unit', code: 'CDU', abbreviation: 'CDU' },
  { name: 'Auditor General of Oyo State', code: 'AUDITOR GENERAL', abbreviation: 'Auditor General' },
  { name: 'Ministry of Works and Transport', code: 'WORKS AND TRANSPORT', abbreviation: 'Works & Transport' },
  { name: 'Oyo State Agricultural Development Agency', code: 'OYSADA', abbreviation: 'OYSADA' },
  { name: 'Civil Service Commission', code: 'CSC', abbreviation: 'CSC' },
  { name: 'Ministry of Youth and Sports', code: 'YOUTH AND SPORTS', abbreviation: 'Youth & Sports' },
  { name: 'Ministry of Trade, Investment and Cooperatives', code: 'TRADE', abbreviation: 'Trade' },
  { name: 'Oyo State Pensions Board', code: 'PENSIONS BOARD', abbreviation: 'Pensions Board' },
  { name: 'Ministry of Justice', code: 'JUSTICE', abbreviation: 'Justice' },
  { name: 'Customary Court of Appeal', code: 'CCA', abbreviation: 'CCA' },
  { name: 'Ministry of Agriculture', code: 'AGRICULTURE', abbreviation: 'Agriculture' },
  { name: 'Audit Service Commission', code: 'AUDIT SERVICE COMMISSION', abbreviation: 'Audit Service' },
  { name: 'Ministry of Culture and Tourism', code: 'CULTURE AND TOURISM', abbreviation: 'Culture & Tourism' },
  { name: 'Oyo State Fire Service Agency', code: 'FIRE', abbreviation: 'Fire Service' },
  { name: 'Other', code: 'OTHER', abbreviation: 'Other' },
].map((m) => Object.freeze(m)));

const MDA_CODES = MDA_LIST.map((m) => m.code);

// vlprs legacy codes: old (incorrect) code → canonical code.
const MDA_ALIASES = Object.freeze([
  { oldCode: 'HLT', newCode: 'HEALTH' },
  { oldCode: 'EDU', newCode: 'EDUCATION' },
  { oldCode: 'WKT', newCode: 'WORKS AND TRANSPORT' },
  { oldCode: 'MOF', newCode: 'FINANCE' },
  { oldCode: 'MOA', newCode: 'AGRICULTURE' },
  { oldCode: 'MOJ', newCode: 'JUSTICE' },
  { oldCode: 'MTI', newCode: 'TRADE' },
  { oldCode: 'MIC', newCode: 'INFORMATION' },
  { oldCode: 'MEN', newCode: 'ENVIRONMENT' },
  { oldCode: 'MWA', newCode: 'WOMEN AFFAIRS' },
  { oldCode: 'MLH', newCode: 'LANDS AND HOUSING' },
  { oldCode: 'MLG', newCode: 'LOCAL GOVERNMENT' },
  { oldCode: 'MBE', newCode: 'BUDGET AND PLANNING' },
  { oldCode: 'MET', newCode: 'ESTABLISHMENT' },
  { oldCode: 'MYS', newCode: 'YOUTH AND SPORTS' },
  { oldCode: 'MER', newCode: 'ENERGY RESOURCES' },
  { oldCode: 'MSD', newCode: 'SPECIAL DUTIES' },
  { oldCode: 'IRS', newCode: 'BIR' },
  { oldCode: 'TSC', newCode: 'TESCOM' },
  { oldCode: 'HMB', newCode: 'OYSHMB' },
  { oldCode: 'OSBC', newCode: 'BCOS' },
  { oldCode: 'SWB', newCode: 'SPORTS COUNCIL' },
  { oldCode: 'UBE', newCode: 'SUBEB' },
  { oldCode: 'LIB', newCode: 'LIBRARY' },
  { oldCode: 'FRE', newCode: 'FIRE' },
  { oldCode: 'PHC', newCode: 'OYSPHB' },
  { oldCode: 'RMC', newCode: 'OYSROMA' },
  { oldCode: 'AGA', newCode: 'ACCOUNTANT GENERAL' },
  { oldCode: 'OHS', newCode: 'HOS' },
  { oldCode: 'GOV', newCode: 'GOVERNOR OFFICE' },
  { oldCode: 'OAG', newCode: 'AUDITOR GENERAL' },
  { oldCode: 'JSC', newCode: 'JUDICIAL COMMISSION' },
  { oldCode: 'SHA', newCode: 'ASSEMBLY COMMISSION' },
  { oldCode: 'WCA', newCode: 'WATER CORPORATION' },
  { oldCode: 'TVT', newCode: 'BOTAVED' },
  { oldCode: 'TRB', newCode: 'OYRTMA' },
  { oldCode: 'PCR', newCode: 'PENSIONS BOARD' },
  { oldCode: 'ASA', newCode: 'OYSADA' },
].map((a) => Object.freeze(a)));

// Studio / legacy names (the 11.7 hand-written list and the content studio
// file) → code(s). One name can stand for more than one MDA.
const LEGACY_ALIASES = Object.freeze({
  'Ministry of Lands, Housing and Urban Development': ['LANDS AND HOUSING'],
  'Ministry of Environment and Natural Resources': ['ENVIRONMENT'],
  'Oyo State Internal Revenue Service (OYSIRS)': ['BIR'],
  'Oyo State Internal Revenue Service': ['BIR'],
  OYSIRS: ['BIR'],
  'Ministry of Public Works and Transport': ['WORKS AND TRANSPORT'],
  'Office of the Surveyor-General': ['SURVEYOR GENERAL'],
  'Ministry of Agriculture / OYSADA': ['AGRICULTURE', 'OYSADA'],
  'Local Government': ['LOCAL GOVERNMENT'],
});

// MoU MDAs when no setting is stored (owner, 24 Oct 2026). The fifth is picked
// in the app (Admin page, "MoU MDAs").
const DEFAULT_MOU_MDAS = Object.freeze(['LANDS AND HOUSING', 'ENVIRONMENT', 'BIR', 'TRADE']);

const norm = (s) => String(s).trim().replace(/\s+/g, ' ').toLowerCase();

const lookup = (pairs) => {
  const map = new Map();
  pairs.forEach(([key, codes]) => {
    const k = norm(key);
    if (!map.has(k)) map.set(k, codes);
  });
  return map;
};

// Tried in this order.
const TABLES = [
  lookup(MDA_LIST.map((m) => [m.code, [m.code]])),
  lookup(MDA_LIST.map((m) => [m.name, [m.code]])),
  lookup(MDA_LIST.map((m) => [m.abbreviation, [m.code]])),
  lookup(MDA_ALIASES.map((a) => [a.oldCode, [a.newCode]])),
  lookup(Object.entries(LEGACY_ALIASES)),
];

const find = (key) => {
  const k = norm(key);
  for (const table of TABLES) {
    if (table.has(k)) return [...table.get(k)];
  }
  return null;
};

// resolveMda(raw) → { codes: [...] } | { codes, qualified: true } | { error }.
// Case-insensitive, whitespace collapsed. A trailing "(…)" qualifier is dropped
// once when the base matches (qualified: true, so the caller warns).
const resolveMda = (raw) => {
  if (typeof raw !== 'string' || !raw.trim()) return { error: 'MDA is empty or not text' };
  const direct = find(raw);
  if (direct) return { codes: direct };
  const m = raw.trim().match(/^(.*?)\s*\([^()]*\)$/);
  if (m && m[1].trim()) {
    const base = find(m[1]);
    if (base) return { codes: base, qualified: true };
  }
  return { error: 'MDA is not on the list' };
};

const mdaByCode = (code) => MDA_LIST.find((m) => m.code === code);

module.exports = {
  MDA_LIST, MDA_CODES, MDA_ALIASES, LEGACY_ALIASES, DEFAULT_MOU_MDAS, resolveMda, mdaByCode,
};
