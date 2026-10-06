// Which projects are drawn at a zoom level, in which cell, and how big.

import { MARINE_TECHNOLOGIES, type ProjectIndex } from '../data/projects';
import type { Stage } from '../theme/tokens';
import { SEA } from './grid';
import { EXTENT, type ZoomLevel } from './levels';

/** Capacity tier boundaries in MW: under 10, 10 to 50, 50 to 300, 300 and over. */
export const TIER_LIMITS_MW = [10, 50, 300];
/** Marker size per tier in CSS pixels. Replaced by sprites in step 4. */
export const TIER_SIZES = [3, 4, 6, 8];

export interface Marker {
  /** Position in the project index arrays. */
  index: number;
  col: number;
  row: number;
  tier: number;
  stage: Stage;
}

export function capacityTier(mw: number): number {
  const tier = TIER_LIMITS_MW.findIndex((limit) => mw < limit);
  return tier === -1 ? TIER_LIMITS_MW.length : tier;
}

/**
 * Markers for one level, smallest first so larger projects draw on top.
 * `include` is the user's filter; projects hidden by the pipeline or below the level's
 * capacity floor are always left out. Onshore projects that fall on a sea cell next to the
 * coast are drawn on the nearest land cell; their data is unchanged.
 */
export function buildMarkers(
  projects: ProjectIndex,
  level: ZoomLevel,
  land: { cells: Uint8Array; cols: number; rows: number },
  include: (index: number) => boolean,
): Marker[] {
  const markers: Marker[] = [];
  for (let i = 0; i < projects.id.length; i++) {
    const x = projects.x[i];
    const y = projects.y[i];
    const mw = projects.mw[i];
    if (projects.hidden[i] >= 0 || x === null || y === null || mw === null) continue;
    if (mw < level.minMw || !include(i)) continue;

    let col = Math.floor((x - EXTENT.minX) / level.cellMetres);
    let row = Math.floor((EXTENT.maxY - y) / level.cellMetres);
    if (!MARINE_TECHNOLOGIES.has(projects.technologies[projects.tech[i]])) {
      [col, row] = nearestLand(x, y, col, row, level, land);
    }
    markers.push({
      index: i,
      col,
      row,
      tier: capacityTier(mw),
      stage: projects.stages[projects.stage[i]] as Stage,
    });
  }
  return markers.sort((a, b) => (projects.mw[a.index] ?? 0) - (projects.mw[b.index] ?? 0));
}

function nearestLand(
  x: number,
  y: number,
  col: number,
  row: number,
  level: ZoomLevel,
  land: { cells: Uint8Array; cols: number; rows: number },
): [number, number] {
  const at = (c: number, r: number) =>
    c >= 0 && r >= 0 && c < land.cols && r < land.rows ? land.cells[r * land.cols + c] : SEA;
  if (at(col, row) !== SEA) return [col, row];

  let best: [number, number] = [col, row];
  let bestDistance = Infinity;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (at(col + dc, row + dr) === SEA) continue;
      const cx = EXTENT.minX + (col + dc + 0.5) * level.cellMetres;
      const cy = EXTENT.maxY - (row + dr + 0.5) * level.cellMetres;
      const distance = (cx - x) ** 2 + (cy - y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = [col + dc, row + dr];
      }
    }
  }
  return best;
}
