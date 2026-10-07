import { describe, expect, it } from 'vitest';
import { formatTime, isFresh, mixRows, type NationalLive } from './live';

const national: NationalLive = {
  mix: {
    data: {
      time: '2026-10-07T19:30:00Z',
      fuels: { WIND: 6000, CCGT: 3000, OCGT: 0, NUCLEAR: 1000, PS: -500, COAL: 0 },
      interconnectors: { ifa: 800, nsl: 400, eleclink: -200 },
    },
    fetchedAt: '2026-10-07T19:31:00Z',
    stale: false,
  },
  solar: { data: { time: '2026-10-07T19:30:00Z', mw: 0, capacityMwp: 24000 }, fetchedAt: '', stale: false },
  credits: [],
};

describe('live mix', () => {
  it('groups fuels, adds net imports, and leaves out demand and zeros', () => {
    const rows = mixRows(national);
    expect(rows.map((r) => [r.key, r.mw])).toEqual([
      ['wind', 6000],
      ['nuclear', 1000],
      ['gas', 3000],
      ['imports', 1000],
    ]);
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1);
  });

  it('is empty when the source is unavailable', () => {
    expect(mixRows({ ...national, mix: { data: null, error: 'down' } })).toEqual([]);
    expect(isFresh({ data: null, error: 'down' })).toBe(false);
  });

  it('shows times in UK time', () => {
    expect(formatTime('2026-10-07T19:30:00Z')).toBe('20:30');
    expect(formatTime('2026-12-07T19:30:00Z')).toBe('19:30');
  });
});
