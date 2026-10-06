import { describe, expect, it } from 'vitest';
import { decodeLevel } from './grid';

describe('decodeLevel', () => {
  it('expands runs row-major', () => {
    const cells = decodeLevel({ cellMetres: 1000, cols: 3, rows: 2, runs: [0, 2, 1, 3, 2, 1] });
    expect(Array.from(cells)).toEqual([0, 0, 1, 1, 1, 2]);
  });

  it('rejects runs that do not cover the grid', () => {
    expect(() => decodeLevel({ cellMetres: 1000, cols: 3, rows: 2, runs: [0, 2] })).toThrow();
  });
});
