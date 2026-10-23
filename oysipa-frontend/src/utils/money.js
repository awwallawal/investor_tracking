// Project values always show with their currency (e.g. "₦2,500,000,000",
// "US$10,000,000"). Old projects without a currency are NGN.
const SYMBOLS = { NGN: '₦', USD: 'US$', EUR: '€', GBP: '£' };

export const formatMoney = (value, currency) => {
  const n = Number(value);
  const amount = (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const code = currency || 'NGN';
  const symbol = SYMBOLS[code];
  return symbol ? `${symbol}${amount}` : `${amount} (${code})`;
};

export default formatMoney;
