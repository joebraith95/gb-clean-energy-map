import { describe, expect, it } from 'vitest';
import {
  ZOOM_LEVELS,
  anchorOffset,
  bngToCell,
  clampAxis,
  gridSize,
  nationalScale,
  physicalScale,
  screenToBng,
  snap,
} from './levels';

describe('levels', () => {
  it('fits the national view in 380px on a standard screen', () => {
    const scale = nationalScale(380, 700, 1);
    expect(gridSize(ZOOM_LEVELS[0]).cols * scale).toBeLessThanOrEqual(380);
    expect(scale).toBe(2);
  });

  it('uses whole physical pixels per cell at every level and screen density', () => {
    for (const dpr of [1, 1.5, 2, 2.75, 3]) {
      const national = nationalScale(380, 700, dpr);
      for (const level of ZOOM_LEVELS)
        expect(Number.isInteger(physicalScale(level, national))).toBe(true);
    }
  });

  it('zooms in at every step', () => {
    const national = nationalScale(380, 700, 2);
    const metresPerPixel = ZOOM_LEVELS.map((l) => l.cellMetres / physicalScale(l, national));
    expect(metresPerPixel[1]).toBeLessThan(metresPerPixel[0]);
    expect(metresPerPixel[2]).toBeLessThan(metresPerPixel[1]);
  });

  it('puts northern points on lower rows', () => {
    const level = ZOOM_LEVELS[2];
    const shetland = bngToCell(446_000, 1_150_000, level);
    const cornwall = bngToCell(170_000, 40_000, level);
    expect(shetland.row).toBeLessThan(cornwall.row);
    expect(bngToCell(0, 1_230_000, level)).toEqual({ col: 0, row: 0 });
  });

  it('keeps the anchor point fixed when zooming', () => {
    const point = { x: 325_000, y: 674_000 };
    const screen = { x: 120, y: 300 };
    const level = ZOOM_LEVELS[1];
    const offset = anchorOffset(screen, point, level, 3);
    const back = screenToBng(screen, offset, level, 3);
    expect(back.x).toBeCloseTo(point.x);
    expect(back.y).toBeCloseTo(point.y);
  });

  it('snaps to whole physical pixels', () => {
    expect(snap(10.3, 2)).toBe(10.5);
    expect(snap(10.3, 1)).toBe(10);
  });

  it('centres a small map and clamps a large one', () => {
    expect(clampAxis(50, 200, 400)).toBe(100);
    expect(clampAxis(20, 1000, 400)).toBe(0);
    expect(clampAxis(-900, 1000, 400)).toBe(-600);
    expect(clampAxis(-300, 1000, 400)).toBe(-300);
  });
});
