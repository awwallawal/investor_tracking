// SABER DLI 4 investor services, wording verbatim from
// SABER-DLI4-Investor-Services-and-Tracking-System.pdf (pp.2-3).
// The codes are the working aids printed there. Keep in sync with
// oysipa-backend/src/constants/serviceCodes.js (the model enum).

export const SERVICE_CATEGORIES = ['Marketing', 'Information', 'Assistance', 'Advocacy'];

export const SERVICE_CATEGORY_LABELS = {
  Marketing: 'Marketing Services',
  Information: 'Information Services',
  Assistance: 'Assistance Services',
  Advocacy: 'Advocacy',
};

export const SERVICE_CODES = [
  { code: 'M1', category: 'Marketing', wording: 'Conducting media campaigns to build/reinforce location image and investment advantages' },
  { code: 'M2', category: 'Marketing', wording: 'Advertising priority sectors via different international media outlets' },
  { code: 'M3', category: 'Marketing', wording: 'Participating in business events/conferences promoting priority sectors' },
  { code: 'M4', category: 'Marketing', wording: 'Proactively promote priority sectors through network of intermediaries' },
  { code: 'M5', category: 'Marketing', wording: "Reach out to targeted investors/suppliers in priority sectors abroad or within the location within a priority sector, seeking face-to-face meetings to persuade, setting forth the location's benefits" },
  { code: 'M6', category: 'Marketing', wording: 'Reach out to the main office of established investors within a priority sector' },
  { code: 'M7', category: 'Marketing', wording: "Seek face-to-face meetings to persuade to invest, stating the location's value proposition for reinvestment (expansion or diversification)" },

  { code: 'I1', category: 'Information', wording: 'A published investment guide for the location: printed, PDF, or downloadable from the website' },
  { code: 'I2', category: 'Information', wording: 'Circulated active information updates concerning priority sectors/activities' },
  { code: 'I3', category: 'Information', wording: 'Published sector-specific brochure(s) with top reasons to invest in the location' },
  { code: 'I4', category: 'Information', wording: 'Published detailed profile(s) of priority sectors' },
  { code: 'I5', category: 'Information', wording: 'A published guide to regulatory procedures/roadmap' },
  { code: 'I6', category: 'Information', wording: 'Published detailed project opportunity profiles with specific information on concrete projects of interest to relevant investors' },
  { code: 'I7', category: 'Information', wording: 'The provision of tailored responses to specific questions asked by specific investors' },

  { code: 'A1', category: 'Assistance', wording: 'Supporting the first-time site visit with itinerary/agenda suggestions, planning and meeting confirmation' },
  { code: 'A2', category: 'Assistance', wording: "Delivering a comprehensive briefing on the location and accompanying investors' representatives during first-time site visits" },
  { code: 'A3', category: 'Assistance', wording: 'Supporting with follow-up site visit itinerary/agenda suggestions, planning and meeting confirmation' },
  { code: 'A4', category: 'Assistance', wording: 'Introducing investors to other foreign companies, domestic companies, potential suppliers, and institutions (public, private, educational, government authorities)' },
  { code: 'A5', category: 'Assistance', wording: 'Following up proactively with investors after site visits and offer additional services to address post-visit investor needs' },
  { code: 'A6', category: 'Assistance', wording: 'Guiding investors on government structure, regulatory and non-regulatory aspects for business start-up, including entry and establishment procedures, through advice and introductions' },
  { code: 'A7', category: 'Assistance', wording: 'Providing comprehensive support through intervention on project management for business start-up including A-to-Z follow-up, tactical problem-solving for individual investors, compliance with licensing, permitting and regulatory procedures, and support linking with service providers' },
  { code: 'A8', category: 'Assistance', wording: 'Proactively meeting/visiting investors to monitor the status of investment projects and explore new investment opportunities' },
  { code: 'A9', category: 'Assistance', wording: 'Inviting investors to relevant activities and/or events to promote linkages/matchmaking opportunities between them and suppliers' },
  { code: 'A10', category: 'Assistance', wording: 'Organizing events between market players (buyers and suppliers) to create networking opportunities and linkages between investors and suppliers' },

  { code: 'V1', category: 'Advocacy', wording: 'Coordinating and interacting with investors and private sector representatives' },
  { code: 'V2', category: 'Advocacy', wording: 'Identifying issues and challenges limiting FDI and defining strategies and action plans to address challenges/bottlenecks' },
  { code: 'V3', category: 'Advocacy', wording: 'Analyzing and reporting on the investment climate/ecosystem' },
  { code: 'V4', category: 'Advocacy', wording: 'Formulating and submitting investment climate/policy and/or ecosystem improvement proposals based on feedback received from investors' },
  { code: 'V5', category: 'Advocacy', wording: 'Advocating and following up on government actions to improve the investment climate/policy/ecosystem' },
];

export const SERVICE_CODE_MAP = Object.fromEntries(SERVICE_CODES.map((s) => [s.code, s]));

export const serviceWording = (code) => SERVICE_CODE_MAP[code]?.wording || code;
