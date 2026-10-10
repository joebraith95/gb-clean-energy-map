// Which projects are drawn in a zoom band, where, and how big.

import { linkCapacity, type Interconnector } from '../data/interconnectors';
import type { ProjectIndex } from '../data/projects';
import type { Stage } from '../theme/tokens';
import { techKind, type TechKind } from './kinds';
import type { ZoomBand } from './levels';

/** Capacity tier boundaries in MW: under 10, 10 to 50, 50 to 300, 300 and over. */
export const TIER_LIMITS_MW = [10, 50, 300];
/** Marker diameter in CSS pixels for each tier. The two smallest are plain dots. */
export const MARKER_SIZES = [9, 13, 24, 32];
/** First tier drawn as a badge with a technology icon rather than a dot. */
export const FIRST_BADGE_TIER = 2;

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
  /** British National Grid metres. */
  x: number;
  y: number;
  /** Capacity in MW; the combined total when phases are clustered. */
  mw: number;
  tier: number;
  stage: Stage;
  kind: TechKind;
  /**
   * For projects sharing a connection substation: this marker's place in the spiral around it,
   * in steps of the largest marker in the group (`tier`). The renderer turns it into pixels, so
   * the group fans out just enough at any zoom. The position stays the substation's.
   */
  spread?: { dx: number; dy: number; tier: number };
}

export function capacityTier(mw: number): number {
  const tier = TIER_LIMITS_MW.findIndex((limit) => mw < limit);
  return tier === -1 ? TIER_LIMITS_MW.length : tier;
}

/** How far (CSS px) a marker is drawn from its position, to fan out a shared substation. */
export function spreadOffset(marker: Marker): [number, number] {
  if (!marker.spread) return [0, 0];
  // The largest marker in the group plus a small gap.
  const step = MARKER_SIZES[marker.spread.tier] + 2;
  return [marker.spread.dx * step, marker.spread.dy * step];
}

/**
 * Markers for one band, smallest first so larger projects draw on top.
 * `include` is the user's filter; projects hidden by the pipeline or below the band's capacity
 * floor are always left out. Where the band clusters phases, the phases of one project that pass
 * the filter become a single marker at the largest phase, sized by their combined capacity.
 * Projects placed at the same connection substation (TEC-only projects) share one position, so
 * the largest sits on the substation and the rest fan out around it, nearest first (see `spread`).
 */
export function buildMarkers(
  projects: ProjectIndex,
  band: ZoomBand,
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
    if (!band.clusterPhases || group < 0) {
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
    if (mw < band.minMw) continue;
    markers.push({
      source: 'project',
      index: i,
      x: projects.x[i]!,
      y: projects.y[i]!,
      mw,
      tier: capacityTier(mw),
      stage: projects.stages[projects.stage[i]] as Stage,
      kind: techKind(projects.technologies[projects.tech[i]]),
    });
  }
  spreadSharedSites(markers, projects);
  return markers.sort((a, b) => a.mw - b.mw);
}

/** Gives the markers at each shared substation their places in a spiral around it. */
function spreadSharedSites(markers: Marker[], projects: ProjectIndex): void {
  const bySite = new Map<number, Marker[]>();
  for (const marker of markers) {
    const site = projects.site[marker.index];
    if (site < 0) continue;
    const group = bySite.get(site);
    if (group) group.push(marker);
    else bySite.set(site, [marker]);
  }
  for (const group of bySite.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => b.mw - a.mw || a.index - b.index);
    const offsets = spiralOffsets(group.length);
    const tier = group[0].tier;
    group.forEach((marker, k) => {
      marker.spread = { dx: offsets[k][0], dy: offsets[k][1], tier };
    });
  }
}

/** The first `n` offsets around a centre: the centre, then each surrounding ring in turn. */
export function spiralOffsets(n: number): [number, number][] {
  const offsets: [number, number][] = [[0, 0]];
  for (let ring = 1; offsets.length < n; ring++) {
    const cells: [number, number][] = [];
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) cells.push([dx, dy]);
      }
    }
    // Within a ring, the places closest to the centre come first.
    cells.sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2));
    offsets.push(...cells);
  }
  return offsets.slice(0, n);
}

/** Markers at the GB landing point of each interconnector that passes the filter. */
export function buildLinkMarkers(
  links: Interconnector[],
  band: ZoomBand,
  include: (index: number) => boolean,
): Marker[] {
  const markers: Marker[] = [];
  links.forEach((link, i) => {
    const mw = linkCapacity(link);
    if (!link.gbEnd || !link.stage || mw === null || mw < band.minMw || !include(i)) return;
    markers.push({
      source: 'interconnector',
      index: i,
      x: link.gbEnd.x,
      y: link.gbEnd.y,
      mw,
      tier: capacityTier(mw),
      stage: link.stage,
      kind: 'interconnector',
    });
  });
  return markers.sort((a, b) => a.mw - b.mw);
}
