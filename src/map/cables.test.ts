import { describe, expect, it } from 'vitest';
import { DASH, GAP, PULSE_STEPS, dashPattern, pulseDirection } from './cables';

describe('pulseDirection', () => {
  it('follows live flows, and falls back to outwards for operational links', () => {
    expect(pulseDirection('operational', 800)).toBe(-1);
    expect(pulseDirection('operational', -200)).toBe(1);
    expect(pulseDirection('operational', 0)).toBe(0);
    expect(pulseDirection('operational', undefined)).toBe(1);
    expect(pulseDirection('under_construction', undefined)).toBe(0);
  });
});

describe('dashPattern', () => {
  it('starts with a whole dash', () => {
    expect(dashPattern(0)).toEqual([0, 0, DASH, GAP]);
  });

  it('always covers one period with the same amount of dash', () => {
    for (let step = -PULSE_STEPS; step < 2 * PULSE_STEPS; step++) {
      const [dashA, gapA, dashB, gapB] = dashPattern(step);
      expect(dashA + gapA + dashB + gapB).toBeCloseTo(DASH + GAP);
      expect(dashA + dashB).toBeCloseTo(DASH);
      for (const length of [dashA, gapA, dashB, gapB]) expect(length).toBeGreaterThanOrEqual(0);
    }
  });

  it('moves the dashes along the line and repeats', () => {
    // The first dash starts further along with each step, until it wraps round.
    expect(dashPattern(1)[1]).toBeGreaterThan(dashPattern(0)[1]);
    expect(dashPattern(PULSE_STEPS)).toEqual(dashPattern(0));
    expect(dashPattern(-1)).toEqual(dashPattern(PULSE_STEPS - 1));
  });
});
