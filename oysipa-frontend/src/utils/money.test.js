import { formatMoney, formatMoneyCompact } from './money';

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

describe('formatMoneyCompact', () => {
  it('shortens large values with three significant digits', () => {
    expect(formatMoneyCompact(1.26e12, 'NGN')).toBe('₦1.26tn');
    expect(formatMoneyCompact(2.0e9)).toBe('₦2bn');
    expect(formatMoneyCompact(32.4e9, 'NGN')).toBe('₦32.4bn');
    expect(formatMoneyCompact(391e6, 'USD')).toBe('US$391m');
    expect(formatMoneyCompact(8e6, 'EUR')).toBe('€8m');
    expect(formatMoneyCompact(950000, 'GBP')).toBe('£950k');
    expect(formatMoneyCompact(750, 'NGN')).toBe('₦750');
    expect(formatMoneyCompact(5e6, 'Other')).toBe('5m (Other)');
  });

  it('promotes to the next unit after rounding', () => {
    expect(formatMoneyCompact(999999, 'NGN')).toBe('₦1m');
    expect(formatMoneyCompact(999.6e9, 'NGN')).toBe('₦1tn');
    expect(formatMoneyCompact(999.6, 'NGN')).toBe('₦1k');
    expect(formatMoneyCompact(999.4e6, 'USD')).toBe('US$999m');
    expect(formatMoneyCompact(-999999, 'NGN')).toBe('₦-1m');
    expect(formatMoneyCompact(1e15, 'NGN')).toBe('₦1000tn');
  });

  it('shows a dash for a missing value', () => {
    expect(formatMoneyCompact(null)).toBe('—');
    expect(formatMoneyCompact(undefined, 'USD')).toBe('—');
  });
});
