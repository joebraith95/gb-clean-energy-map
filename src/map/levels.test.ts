import { describe, expect, it } from 'vitest';
import { ZOOM_LEVELS, bngToCell, gridSize } from './levels';

describe('levels', () => {
  it('fits the national view in 380px', () => {
    const national = ZOOM_LEVELS[0];
    expect(gridSize(national).cols * national.scale).toBeLessThanOrEqual(380);
  });

  it('uses integer scales only', () => {
    for (const level of ZOOM_LEVELS) expect(Number.isInteger(level.scale)).toBe(true);
  });

  it('puts northern points on lower rows', () => {
    const level = ZOOM_LEVELS[2];
    const shetland = bngToCell(446_000, 1_150_000, level);
    const cornwall = bngToCell(170_000, 40_000, level);
    expect(shetland.row).toBeLessThan(cornwall.row);
    expect(bngToCell(0, 1_230_000, level)).toEqual({ col: 0, row: 0 });
  });
});
