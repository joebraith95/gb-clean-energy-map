import { describe, expect, it } from 'vitest';
import { FRAMES, effectPixels, pickOnLoad, stillPixels, type EventCandidate } from './animations';

describe('effect frames', () => {
  it('draws something for every frame of each effect except construction blinks', () => {
    for (let frame = 0; frame < FRAMES; frame++) {
      expect(effectPixels('consented', frame).length).toBeGreaterThan(0);
      expect(effectPixels('operational', frame).length).toBe(16);
      expect(effectPixels('construction_started', frame).length).toBe(frame % 2 ? 0 : 20);
    }
  });

  it('expands the consent ring and stops after the last frame', () => {
    const radius = (frame: number) => Math.max(...effectPixels('consented', frame).map(([x]) => x));
    expect(radius(1)).toBeGreaterThan(radius(0));
    expect(effectPixels('consented', FRAMES)).toEqual([]);
  });

  it('keeps effects clear of a single-size sprite tile', () => {
    // A 9px tile reaches 4 art pixels from its centre.
    for (const pixel of [...effectPixels('consented', 0), ...stillPixels()]) {
      expect(Math.max(Math.abs(pixel[0]), Math.abs(pixel[1]))).toBeGreaterThan(4);
    }
  });
});

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
