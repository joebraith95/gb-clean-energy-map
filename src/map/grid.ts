// Land grid produced by pipeline/build_grid.py: one run-length encoded mask per zoom level.

import { dataUrl } from '../config';

export const SEA = 0;
export const GB_LAND = 1;
export const OTHER_LAND = 2;

export interface GridLevel {
  cellMetres: number;
  cols: number;
  rows: number;
  /** Alternating value, count pairs, row-major from the north-west corner. */
  runs: number[];
}

export interface GridFile {
  levels: GridLevel[];
}

export async function loadGrid(): Promise<GridFile> {
  const response = await fetch(dataUrl('grid.json'));
  if (!response.ok) throw new Error(`Could not load grid.json (${response.status})`);
  return response.json();
}

/** Expands the runs into one value per cell. */
export function decodeLevel(level: GridLevel): Uint8Array {
  const cells = new Uint8Array(level.cols * level.rows);
  let offset = 0;
  for (let i = 0; i < level.runs.length; i += 2) {
    cells.fill(level.runs[i], offset, offset + level.runs[i + 1]);
    offset += level.runs[i + 1];
  }
  if (offset !== cells.length)
    throw new Error(`Grid runs cover ${offset} of ${cells.length} cells`);
  return cells;
}
