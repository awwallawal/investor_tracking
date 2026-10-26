import apiClient from './api';

// Exchange rates (story 11.14): Setting fxRates on the server.
// Shape: { currencies, staleDays, latest: { USD: { rate, asOf, source, ageDays, stale } },
//          missing: [...], stale: [...], history: [{ currency, rate, asOf, source }] }.
export const FX_CURRENCIES = ['USD', 'EUR', 'GBP'];

const normalise = (data) => {
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  return {
    currencies: Array.isArray(d.currencies) ? d.currencies : FX_CURRENCIES,
    staleDays: d.staleDays || 30,
    latest: d.latest && typeof d.latest === 'object' ? d.latest : {},
    missing: Array.isArray(d.missing) ? d.missing : FX_CURRENCIES,
    stale: Array.isArray(d.stale) ? d.stale : [],
    history: Array.isArray(d.history) ? d.history : [],
  };
};

export const fetchFxRates = async () => normalise((await apiClient.get('/api/fx-rates')).data);

// DG / Portal-Admin: add one dated rate. Returns the new state.
export const addFxRate = async (entry) => normalise((await apiClient.post('/api/fx-rates', entry)).data);
