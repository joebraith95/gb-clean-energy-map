import { describe, expect, it } from 'vitest';
import type { Interconnector } from '../data/interconnectors';
import { ZOOM_LEVELS } from '../map/levels';
import { buildLinkMarkers } from '../map/markers';
import { DEFAULT_FILTERS, countLinksShown, makeIncludeLink } from './filters';

function link(overrides: Partial<Interconnector>): Interconnector {
  return {
    id: 'x',
    name: 'X',
    partner: 'France',
    stage: 'operational',
    registerStatus: 'Built',
    importMw: 1000,
    exportMw: 1050,
    connectionSite: null,
    gate: null,
    contractedDate: null,
    commissioned: null,
    gbEnd: { name: 'GB', kind: 'converter', osm: '', x: 608_000, y: 138_000 },
    partnerEnd: null,
    milestones: [],
    sources: [],
    ...overrides,
  };
}

const links = [link({}), link({ id: 'planned', stage: 'in_planning', gbEnd: null })];
const withFlex = { ...DEFAULT_FILTERS, flexibility: true };

describe('interconnector filters', () => {
  it('belong to the flexibility layer, which starts off', () => {
    expect(makeIncludeLink(links, DEFAULT_FILTERS)(0)).toBe(false);
    expect(makeIncludeLink(links, withFlex)(0)).toBe(true);
  });

  it('respect the interconnector group, stage and capacity filters', () => {
    expect(makeIncludeLink(links, { ...withFlex, techGroups: ['solar'] })(0)).toBe(false);
    expect(makeIncludeLink(links, { ...withFlex, stages: ['in_planning'] })(0)).toBe(false);
    expect(makeIncludeLink(links, { ...withFlex, minMw: 1000 })(0)).toBe(true);
  });

  it('count only interconnectors with a GB landing point', () => {
    expect(countLinksShown(links, withFlex)).toBe(1);
  });
});

describe('interconnector markers', () => {
  it('sit at the GB landing point and use the larger capacity', () => {
    const [marker] = buildLinkMarkers(links, ZOOM_LEVELS[2], () => true);
    expect(marker).toMatchObject({ source: 'interconnector', index: 0, col: 608, mw: 1050 });
    expect(buildLinkMarkers(links, ZOOM_LEVELS[2], () => true)).toHaveLength(1);
  });
});
