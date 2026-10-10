import { describe, expect, it } from 'vitest';
import { pickOnLoad, type EventCandidate } from './animations';

describe('pickOnLoad', () => {
  const candidate = (target: number, date: string, mw: number): EventCandidate<number> => ({
    target,
    kind: 'consented',
    date,
    mw,
  });

  it('keeps the last three months, visible only, largest first, capped', () => {
    const picked = pickOnLoad(
      [
        candidate(1, '2026-07-08', 50),
        candidate(2, '2026-06-01', 700),
        candidate(3, '2026-03-01', 900),
        candidate(4, '2026-05-01', 80),
      ],
      (target) => target !== 4,
      3,
      2,
    );
    expect(picked.map((c) => c.target)).toEqual([2, 1]);
  });

  it('handles an empty list', () => {
    expect(pickOnLoad([], () => true)).toEqual([]);
  });
});
