import { describe, expect, it } from 'vitest';
import { cableCells, isDash, pulseDirection } from './cables';
import { ZOOM_LEVELS } from './levels';

const level = { ...ZOOM_LEVELS[2], cellMetres: 1000 };
// Centre of a cell at the 1km level.
const at = (col: number, row: number) => ({ x: col * 1000 + 500, y: 1_230_000 - row * 1000 - 500 });

describe('cableCells', () => {
  it('runs from the GB end to the partner end', () => {
    const cells = cableCells(at(0, 0), at(3, 0), level, 10, 10);
    expect(cells.map((c) => c.col)).toEqual([0, 1, 2, 3]);
    expect(cells.map((c) => c.step)).toEqual([0, 1, 2, 3]);
  });

  it('draws a connected diagonal', () => {
    const cells = cableCells(at(0, 0), at(4, 2), level, 10, 10);
    for (let i = 1; i < cells.length; i++) {
      expect(Math.abs(cells[i].col - cells[i - 1].col)).toBeLessThanOrEqual(1);
      expect(Math.abs(cells[i].row - cells[i - 1].row)).toBeLessThanOrEqual(1);
    }
    expect(cells.at(-1)).toMatchObject({ col: 4, row: 2 });
  });

  it('stops at the edge of the map', () => {
    const cells = cableCells(at(7, 1), at(30, 1), level, 10, 10);
    expect(cells.at(-1)?.col).toBe(9);
  });
});

describe('pulseDirection', () => {
  it('follows live flows, and falls back to outwards for operational links', () => {
    expect(pulseDirection('operational', 800)).toBe(-1);
    expect(pulseDirection('operational', -200)).toBe(1);
    expect(pulseDirection('operational', 0)).toBe(0);
    expect(pulseDirection('operational', undefined)).toBe(1);
    expect(pulseDirection('under_construction', undefined)).toBe(0);
  });
});

describe('isDash', () => {
  it('draws two cells in every four and moves with the phase', () => {
    expect([0, 1, 2, 3, 4].map((s) => isDash(s, 0))).toEqual([true, true, false, false, true]);
    expect([0, 1, 2, 3].map((s) => isDash(s, 1))).toEqual([false, true, true, false]);
  });
});
