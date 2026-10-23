import { formatMoney } from './money';

describe('formatMoney', () => {
  it('shows the currency with the value', () => {
    expect(formatMoney(2500000000, 'NGN')).toBe('₦2,500,000,000');
    expect(formatMoney(10000000, 'USD')).toBe('US$10,000,000');
    expect(formatMoney(5000, 'EUR')).toBe('€5,000');
    expect(formatMoney(5000, 'GBP')).toBe('£5,000');
    expect(formatMoney(5000, 'Other')).toBe('5,000 (Other)');
  });

  it('treats a missing currency as NGN and a missing value as 0', () => {
    expect(formatMoney(1200)).toBe('₦1,200');
    expect(formatMoney(undefined, 'USD')).toBe('US$0');
    expect(formatMoney('750', null)).toBe('₦750');
  });
});
