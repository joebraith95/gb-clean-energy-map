import { describe, expect, it } from 'vitest';
import type { ProjectIndex } from '../data/projects';
import { GB_LAND, SEA } from './grid';
import { ZOOM_LEVELS } from './levels';
import { buildMarkers, capacityTier } from './markers';

const local = ZOOM_LEVELS[2];

function index(
  rows: { x: number; y: number; mw: number; tech?: number; hidden?: number; group?: number }[],
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
  };
}

// A 3x3 grid at the top-left of the map: land in the middle column only.
const land = {
  cols: 3,
  rows: 3,
  cells: new Uint8Array([SEA, GB_LAND, SEA, SEA, GB_LAND, SEA, SEA, GB_LAND, SEA]),
};
// Centre of cell (col, row) at the 1km level.
const at = (col: number, row: number) => ({ x: col * 1000 + 500, y: 1_230_000 - row * 1000 - 500 });

describe('markers', () => {
  it('assigns capacity tiers', () => {
    expect([1, 10, 49.9, 50, 300, 1200].map(capacityTier)).toEqual([0, 1, 1, 2, 3, 3]);
  });

  it('skips hidden projects and those below the level floor', () => {
    const projects = index([
      { ...at(1, 1), mw: 5, hidden: 0 },
      { ...at(1, 1), mw: 5 },
    ]);
    expect(buildMarkers(projects, local, land, () => true).map((m) => m.index)).toEqual([1]);
    expect(buildMarkers(projects, ZOOM_LEVELS[0], land, () => true)).toEqual([]);
  });

  it('moves coastal onshore projects onto land but leaves offshore ones at sea', () => {
    const projects = index([
      { ...at(0, 1), mw: 5 },
      { ...at(0, 1), mw: 5, tech: 1 },
    ]);
    const [onshore, offshore] = buildMarkers(projects, local, land, () => true);
    expect([onshore.col, onshore.row]).toEqual([1, 1]);
    expect([offshore.col, offshore.row]).toEqual([0, 1]);
  });

  it('draws larger projects last', () => {
    const projects = index([
      { ...at(1, 0), mw: 500 },
      { ...at(1, 0), mw: 2 },
    ]);
    expect(buildMarkers(projects, local, land, () => true).map((m) => m.index)).toEqual([1, 0]);
  });

  it('clusters phases into one marker at the largest phase on levels that cluster', () => {
    const projects = index([
      { ...at(1, 0), mw: 30, group: 0 },
      { ...at(1, 1), mw: 40, group: 0 },
      { ...at(1, 2), mw: 20 },
    ]);
    const national = { ...ZOOM_LEVELS[0], cellMetres: 1000, minMw: 50 };
    const markers = buildMarkers(projects, national, land, () => true);
    expect(markers).toHaveLength(1);
    expect(markers[0].index).toBe(1);
    expect(markers[0].mw).toBe(70);
    expect(buildMarkers(projects, local, land, () => true)).toHaveLength(3);
  });

  it('only combines phases that pass the filter', () => {
    const projects = index([
      { ...at(1, 0), mw: 30, group: 0 },
      { ...at(1, 1), mw: 40, group: 0 },
    ]);
    const national = { ...ZOOM_LEVELS[0], cellMetres: 1000, minMw: 50 };
    expect(buildMarkers(projects, national, land, (i) => i === 1)).toEqual([]);
  });

  it('separates nearby projects at deep zoom while still snapping coastal ones to land', () => {
    const site = { ...ZOOM_LEVELS[6], landMetres: 1000 };
    const projects = index([
      { x: 1100, y: 1_229_100, mw: 5 },
      { x: 1400, y: 1_229_100, mw: 5 },
      { ...at(0, 1), mw: 5 },
    ]);
    const [a, b, coastal] = buildMarkers(projects, site, land, () => true);
    expect(a.col).not.toBe(b.col);
    // The coastal project moves to the centre of the land cell at col 1, row 1 (1km cells).
    expect(coastal.col).toBe(Math.floor(1500 / site.cellMetres));
    expect(coastal.row).toBe(Math.floor(1500 / site.cellMetres));
  });
});
