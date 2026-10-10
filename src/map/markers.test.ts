import { describe, expect, it } from 'vitest';
import type { ProjectIndex } from '../data/projects';
import { ZOOM_BANDS } from './levels';
import { buildMarkers, capacityTier, spiralOffsets, spreadOffset } from './markers';

const national = ZOOM_BANDS[0];
const local = ZOOM_BANDS[2];

function index(
  rows: {
    x: number;
    y: number;
    mw: number;
    tech?: number;
    hidden?: number;
    group?: number;
    site?: number;
  }[],
): ProjectIndex {
  return {
    source: { name: '', page: '', file: '', updated: null },
    technologies: ['Wind Onshore', 'Wind Offshore'],
    stages: ['operational'],
    hiddenReasons: ['off_track'],
    detailShards: 64,
    id: rows.map((_, i) => i + 1),
    name: rows.map(() => 'test'),
    x: rows.map((r) => r.x),
    y: rows.map((r) => r.y),
    mw: rows.map((r) => r.mw),
    tech: rows.map((r) => r.tech ?? 0),
    flex: rows.map(() => 0),
    stage: rows.map(() => 0),
    hidden: rows.map((r) => r.hidden ?? -1),
    group: rows.map((r) => r.group ?? -1),
    connectionSource: null,
    connectionBadges: ['not_published', 'gate2', 'energised'],
    conn: rows.map(() => 0),
    site: rows.map((r) => r.site ?? -1),
  };
}

// A point on a 1km lattice from the top-left of the map.
const at = (col: number, row: number) => ({ x: col * 1000 + 500, y: 1_230_000 - row * 1000 - 500 });

describe('markers', () => {
  it('lists spiral offsets nearest first', () => {
    expect(spiralOffsets(5)).toEqual([
      [0, 0],
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
    ]);
    expect(spiralOffsets(10)).toHaveLength(10);
  });

  it('fans out projects sharing a substation around it, largest in the centre', () => {
    const projects = index([
      { ...at(1, 1), mw: 10, site: 0 },
      { ...at(1, 1), mw: 300, site: 0 },
      { ...at(1, 1), mw: 20, site: 0 },
      { ...at(1, 1), mw: 15 },
    ]);
    const markers = new Map(buildMarkers(projects, local, () => true).map((m) => [m.index, m]));
    // Everyone keeps the substation's position; the spread says where to draw around it.
    expect([...markers.values()].every((m) => m.x === 1500 && m.y === 1_228_500)).toBe(true);
    expect(markers.get(1)?.spread).toEqual({ dx: 0, dy: 0, tier: 3 });
    expect(markers.get(2)?.spread).toEqual({ dx: 0, dy: -1, tier: 3 });
    expect(markers.get(0)?.spread).toEqual({ dx: -1, dy: 0, tier: 3 });
    // A REPD project at the same point is not part of the group.
    expect(markers.get(3)?.spread).toBeUndefined();
    // Each step clears the largest marker in the group.
    expect(spreadOffset(markers.get(1)!)).toEqual([0, 0]);
    expect(spreadOffset(markers.get(2)!)).toEqual([0, -34]);
    expect(spreadOffset(markers.get(3)!)).toEqual([0, 0]);
  });

  it('assigns capacity tiers', () => {
    expect([1, 10, 49.9, 50, 300, 1200].map(capacityTier)).toEqual([0, 1, 1, 2, 3, 3]);
  });

  it('skips hidden projects and those below the band floor', () => {
    const projects = index([
      { ...at(1, 1), mw: 5, hidden: 0 },
      { ...at(1, 1), mw: 5 },
    ]);
    expect(buildMarkers(projects, local, () => true).map((m) => m.index)).toEqual([1]);
    expect(buildMarkers(projects, national, () => true)).toEqual([]);
  });

  it('keeps every project at its published position', () => {
    const projects = index([
      { x: 1100, y: 1_229_100, mw: 5 },
      { x: 1400, y: 1_229_100, mw: 5, tech: 1 },
    ]);
    const [a, b] = buildMarkers(projects, local, () => true);
    expect([a.x, a.y]).toEqual([1100, 1_229_100]);
    expect([b.x, b.y]).toEqual([1400, 1_229_100]);
  });

  it('draws larger projects last', () => {
    const projects = index([
      { ...at(1, 0), mw: 500 },
      { ...at(1, 0), mw: 2 },
    ]);
    expect(buildMarkers(projects, local, () => true).map((m) => m.index)).toEqual([1, 0]);
  });

  it('clusters phases into one marker at the largest phase in bands that cluster', () => {
    const projects = index([
      { ...at(1, 0), mw: 30, group: 0 },
      { ...at(1, 1), mw: 40, group: 0 },
      { ...at(1, 2), mw: 20 },
    ]);
    const markers = buildMarkers(projects, national, () => true);
    expect(markers).toHaveLength(1);
    expect(markers[0].index).toBe(1);
    expect(markers[0].mw).toBe(70);
    expect(buildMarkers(projects, local, () => true)).toHaveLength(3);
  });

  it('only combines phases that pass the filter', () => {
    const projects = index([
      { ...at(1, 0), mw: 30, group: 0 },
      { ...at(1, 1), mw: 40, group: 0 },
    ]);
    expect(buildMarkers(projects, national, (i) => i === 1)).toEqual([]);
  });
});
