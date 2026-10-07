// Schematic interconnector cables: a straight pixel line from the GB landing point towards the
// partner end, clipped to the map. Drawn in grid cells so it stays pixel-perfect at every level.

import { EXTENT } from './levels';

/** Every DASH_PERIOD cells, the first DASH_ON are drawn. */
export const DASH_PERIOD = 4;
export const DASH_ON = 2;

export interface CableCell {
  col: number;
  row: number;
  /** Position along the cable from the GB end, for dashes and the pulse. */
  step: number;
}

/** Cells on the line between two BNG points (Bresenham), keeping only those inside the grid. */
export function cableCells(
  from: { x: number; y: number },
  to: { x: number; y: number },
  level: { cellMetres: number },
  cols: number,
  rows: number,
): CableCell[] {
  const cell = (x: number, y: number) => ({
    col: Math.floor((x - EXTENT.minX) / level.cellMetres),
    row: Math.floor((EXTENT.maxY - y) / level.cellMetres),
  });
  const start = cell(from.x, from.y);
  const end = cell(to.x, to.y);
  const dc = Math.abs(end.col - start.col);
  const dr = -Math.abs(end.row - start.row);
  const sc = start.col < end.col ? 1 : -1;
  const sr = start.row < end.row ? 1 : -1;
  let error = dc + dr;
  let { col, row } = start;
  const cells: CableCell[] = [];
  for (let step = 0; ; step++) {
    const inside = col >= 0 && row >= 0 && col < cols && row < rows;
    if (inside) cells.push({ col, row, step });
    else if (cells.length > 0) break; // Left the map: the rest is off screen.
    if (col === end.col && row === end.row) break;
    const twice = 2 * error;
    if (twice >= dr) {
      error += dr;
      col += sc;
    }
    if (twice <= dc) {
      error += dc;
      row += sr;
    }
  }
  return cells;
}

/**
 * Which way a cable's dashes move: 1 outwards (Great Britain exporting), -1 inwards (importing),
 * 0 still. With no live flow, operational cables pulse outwards as a sign of activity.
 */
export function pulseDirection(stage: string, flowMw: number | undefined): -1 | 0 | 1 {
  if (flowMw === undefined) return stage === 'operational' ? 1 : 0;
  if (flowMw > 0) return -1;
  if (flowMw < 0) return 1;
  return 0;
}

/** Whether a cable cell is part of a dash, given the pulse phase. */
export function isDash(step: number, phase: number): boolean {
  return (((step - phase) % DASH_PERIOD) + DASH_PERIOD) % DASH_PERIOD < DASH_ON;
}
