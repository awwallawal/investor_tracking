import { describe, it, expect } from 'vitest';
import { MAX_URL_LENGTH, isHttpUrl } from './announcementFields';

describe('isHttpUrl', () => {
  it('accepts http(s) links up to the server limit', () => {
    expect(isHttpUrl('https://news.example.test/a')).toBe(true);
    expect(isHttpUrl('http://archive.example.test/a')).toBe(true);
    const longest = `https://a.test/${'x'.repeat(MAX_URL_LENGTH - 15)}`;
    expect(longest).toHaveLength(MAX_URL_LENGTH);
    expect(isHttpUrl(longest)).toBe(true);
  });

  it('refuses other schemes, non-links and over-long links', () => {
    expect(isHttpUrl('javascript:x')).toBe(false);
    expect(isHttpUrl('ftp://example.test/x')).toBe(false);
    expect(isHttpUrl('not a link')).toBe(false);
    expect(isHttpUrl(`https://a.test/${'x'.repeat(MAX_URL_LENGTH)}`)).toBe(false);
    expect(MAX_URL_LENGTH).toBe(2000);
  });
});
