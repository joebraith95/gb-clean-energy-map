import { describe, expect, it } from 'vitest';
import type { ProjectIndex } from '../data/projects';
import { DEFAULT_FILTERS, countShown, makeInclude, stagesPresent } from './filters';

const projects: ProjectIndex = {
  source: { name: '', page: '', file: '', updated: null },
  technologies: ['Battery', 'Solar Photovoltaics', 'Wind Onshore'],
  stages: [
    'early_development',
    'in_planning',
    'consented',
    'under_construction',
    'operational',
    'stalled',
  ],
  hiddenReasons: ['off_track'],
  detailShards: 64,
  id: [1, 2, 3, 4, 5],
  name: ['a', 'b', 'c', 'd', 'e'],
  x: [1, 1, 1, 1, 1],
  y: [1, 1, 1, 1, 1],
  mw: [20, 0.5, 30, 10, 10],
  tech: [0, 1, 2, 2, 1],
  flex: [1, 0, 0, 0, 0],
  stage: [4, 4, 1, 5, 2],
  hidden: [-1, -1, -1, 0, -1],
  group: [-1, -1, -1, -1, -1],
  connectionSource: null,
  connectionBadges: ['not_published', 'gate2', 'energised'],
  conn: [0, 0, 1, 2, 1],
  site: [-1, -1, -1, -1, -1],
};

describe('filters', () => {
  it('hides the flexibility layer and sub-1MW projects by default', () => {
    const include = makeInclude(projects, DEFAULT_FILTERS);
    expect([0, 1, 2, 4].map(include)).toEqual([false, false, true, true]);
  });

  it('shows storage when the flexibility layer is on', () => {
    expect(makeInclude(projects, { ...DEFAULT_FILTERS, flexibility: true })(0)).toBe(true);
  });

  it('filters by technology group and stage', () => {
    expect(makeInclude(projects, { ...DEFAULT_FILTERS, techGroups: ['solar'] })(2)).toBe(false);
    expect(makeInclude(projects, { ...DEFAULT_FILTERS, stages: ['consented'] })(4)).toBe(true);
    expect(makeInclude(projects, { ...DEFAULT_FILTERS, stages: ['consented'] })(2)).toBe(false);
  });

  it('shows only Gate 2 contracted projects when asked', () => {
    const include = makeInclude(projects, { ...DEFAULT_FILTERS, minMw: 0, gate2Only: true });
    expect([1, 2, 4].map(include)).toEqual([false, true, true]);
  });

  it('counts only drawable projects', () => {
    expect(countShown(projects, { ...DEFAULT_FILTERS, minMw: 0 })).toBe(3);
  });

  it('lists only stages with drawable projects', () => {
    expect(stagesPresent(projects)).toEqual(['in_planning', 'consented', 'operational']);
  });
});
