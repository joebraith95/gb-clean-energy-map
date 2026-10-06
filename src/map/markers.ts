// Which projects are drawn at a zoom level, in which cell, and how big.

import { linkCapacity, type Interconnector } from '../data/interconnectors';
import { MARINE_TECHNOLOGIES, type ProjectIndex } from '../data/projects';
import type { Stage } from '../theme/tokens';
import { SEA } from './grid';
import { EXTENT, type ZoomLevel } from './levels';
import { spriteKind, type SpriteKind } from './sprites';

/** Capacity tier boundaries in MW: under 10, 10 to 50, 50 to 300, 300 and over. */
export const TIER_LIMITS_MW = [10, 50, 300];
/** Dot size in CSS pixels for the two smallest tiers. Larger tiers use sprite tiles. */
export const DOT_SIZES = [3, 5];
/** First tier drawn as a sprite tile rather than a dot. */
export const FIRST_SPRITE_TIER = DOT_SIZES.length;

/** What a marker or the card shows: a REPD project or an interconnector, by position in its list. */
export interface Selection {
  source: 'project' | 'interconnector';
  index: number;
}

export function sameSelection(a: Selection | null, b: Selection | null): boolean {
  return a === b || (a !== null && b !== null && a.source === b.source && a.index === b.index);
}

export interface Marker {
  source: Selection['source'];
  /** Position in the project index arrays, or in the interconnector list. */
  index: number;
  col: number;
  row: number;
  /** Capacity in MW; the combined total when phases are clustered. */
  mw: number;
  tier: number;
  stage: Stage;
  kind: SpriteKind;
}

export function capacityTier(mw: number): number {
  const tier = TIER_LIMITS_MW.findIndex((limit) => mw < limit);
  return tier === -1 ? TIER_LIMITS_MW.length : tier;
}

/**
 * Markers for one level, smallest first so larger projects draw on top.
 * `include` is the user's filter; projects hidden by the pipeline or below the level's
 * capacity floor are always left out. Where the level clusters phases, the phases of one
 * project that pass the filter become a single marker at the largest phase, sized by their
 * combined capacity. Onshore projects that fall on a sea cell next to the coast are drawn on
 * the nearest land cell; their data is unchanged.
 */
export function buildMarkers(
  projects: ProjectIndex,
  level: ZoomLevel,
  land: { cells: Uint8Array; cols: number; rows: number },
  include: (index: number) => boolean,
): Marker[] {
  // Candidates: drawable projects that pass the filter, with their phases combined if clustering.
  const candidates = new Map<number, { index: number; mw: number }>();
  const groupLead = new Map<number, number>();
  for (let i = 0; i < projects.id.length; i++) {
    const mw = projects.mw[i];
    if (projects.hidden[i] >= 0 || projects.x[i] === null || projects.y[i] === null) continue;
    if (mw === null || !include(i)) continue;
    const group = projects.group[i];
    if (!level.clusterPhases || group < 0) {
      candidates.set(i, { index: i, mw });
      continue;
    }
    const lead = groupLead.get(group);
    if (lead === undefined) {
      groupLead.set(group, i);
      candidates.set(i, { index: i, mw });
      continue;
    }
    const combined = candidates.get(lead)!;
    const total = combined.mw + mw;
    if (mw > (projects.mw[combined.index] ?? 0)) {
      // The largest phase leads, so the marker sits where most of the capacity is.
      candidates.delete(lead);
      groupLead.set(group, i);
      candidates.set(i, { index: i, mw: total });
    } else {
      combined.mw = total;
    }
  }

  const markers: Marker[] = [];
  for (const { index: i, mw } of candidates.values()) {
    if (mw < level.minMw) continue;
    const x = projects.x[i]!;
    const y = projects.y[i]!;
    const technology = projects.technologies[projects.tech[i]];
    const [px, py] = MARINE_TECHNOLOGIES.has(technology)
      ? [x, y]
      : nearestLandPoint(x, y, level.landMetres, land);
    const col = Math.floor((px - EXTENT.minX) / level.cellMetres);
    const row = Math.floor((py - EXTENT.maxY) / -level.cellMetres);
    markers.push({
      source: 'project',
      index: i,
      col,
      row,
      mw,
      tier: capacityTier(mw),
      stage: projects.stages[projects.stage[i]] as Stage,
      kind: spriteKind(technology),
    });
  }
  return markers.sort((a, b) => a.mw - b.mw);
}

/** Markers at the GB landing point of each interconnector that passes the filter. */
export function buildLinkMarkers(
  links: Interconnector[],
  level: ZoomLevel,
  include: (index: number) => boolean,
): Marker[] {
  const markers: Marker[] = [];
  links.forEach((link, i) => {
    const mw = linkCapacity(link);
    if (!link.gbEnd || !link.stage || mw === null || mw < level.minMw || !include(i)) return;
    markers.push({
      source: 'interconnector',
      index: i,
      col: Math.floor((link.gbEnd.x - EXTENT.minX) / level.cellMetres),
      row: Math.floor((EXTENT.maxY - link.gbEnd.y) / level.cellMetres),
      mw,
      tier: capacityTier(mw),
      stage: link.stage,
      kind: 'interconnector',
    });
  });
  return markers.sort((a, b) => a.mw - b.mw);
}

/**
 * Where to draw an onshore project: its own position if its land cell is land, otherwise the
 * centre of the nearest neighbouring land cell, or its own position if there is none.
 */
function nearestLandPoint(
  x: number,
  y: number,
  landMetres: number,
  land: { cells: Uint8Array; cols: number; rows: number },
): [number, number] {
  const col = Math.floor((x - EXTENT.minX) / landMetres);
  const row = Math.floor((EXTENT.maxY - y) / landMetres);
  const at = (c: number, r: number) =>
    c >= 0 && r >= 0 && c < land.cols && r < land.rows ? land.cells[r * land.cols + c] : SEA;
  if (at(col, row) !== SEA) return [x, y];

  let best: [number, number] = [x, y];
  let bestDistance = Infinity;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (at(col + dc, row + dr) === SEA) continue;
      const cx = EXTENT.minX + (col + dc + 0.5) * landMetres;
      const cy = EXTENT.maxY - (row + dr + 0.5) * landMetres;
      const distance = (cx - x) ** 2 + (cy - y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = [cx, cy];
      }
    }
  }
  return best;
}
