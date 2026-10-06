import { describe, expect, it } from 'vitest';
import { formatDate, formatMw, orNotPublished } from './format';

describe('format', () => {
  it('formats dates in British style', () => {
    expect(formatDate('2026-08-03')).toBe('3 Aug 2026');
    expect(formatDate(null)).toBe('Not published');
  });

  it('formats capacity', () => {
    expect(formatMw(49.9)).toBe('49.9 MW');
    expect(formatMw(1200)).toBe('1,200 MW');
    expect(formatMw(null)).toBe('Not published');
  });

  it('marks missing values as not published', () => {
    expect(orNotPublished('')).toBe('Not published');
    expect(orNotPublished(0)).toBe('0');
  });
});
