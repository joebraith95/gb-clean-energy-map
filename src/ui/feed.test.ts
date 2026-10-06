import { describe, expect, it } from 'vitest';
import { isAnimated, type Change } from '../data/changes';
import { changeLabel, filterChanges, groupByMonth } from './feed';
import { DEFAULT_FILTERS } from './filters';

function change(overrides: Partial<Change>): Change {
  return {
    date: '2026-07-01',
    dateKind: 'event',
    source: 'project',
    id: 1,
    type: 'consented',
    stage: 'consented',
    name: 'Site',
    technology: 'Solar Photovoltaics',
    mw: 20,
    ...overrides,
  };
}

describe('feed', () => {
  it('labels events and spotted changes in plain English', () => {
    expect(changeLabel(change({}))).toBe('Consent granted');
    expect(changeLabel(change({ type: 'stage_changed', stage: 'stalled' }))).toBe('Now stalled');
    expect(changeLabel(change({ type: 'stage_changed', stage: 'under_construction' }))).toBe(
      'Now under construction',
    );
    expect(changeLabel(change({ type: 'removed', stage: null }))).toBe('Removed from REPD');
    expect(changeLabel(change({ type: 'added', source: 'interconnector' }))).toBe(
      'New in the NESO register',
    );
  });

  it('applies the map filters except stage, and the feed type filter', () => {
    const items = [
      change({ id: 1 }),
      change({ id: 2, type: 'refused', stage: 'stalled' }),
      change({ id: 3, mw: 0.2 }),
      change({ id: 4, technology: 'Battery' }),
      change({ id: 5, mw: null }),
    ];
    expect(filterChanges(items, DEFAULT_FILTERS, 'all').map((c) => c.id)).toEqual([1, 2]);
    expect(filterChanges(items, DEFAULT_FILTERS, 'planning').map((c) => c.id)).toEqual([2]);
    const everything = { ...DEFAULT_FILTERS, flexibility: true, minMw: 0 };
    expect(filterChanges(items, everything, 'all').map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('shows interconnector changes with the flexibility layer', () => {
    const link = change({
      source: 'interconnector',
      id: 'nsl',
      technology: 'Interconnector',
      mw: 1400,
    });
    expect(filterChanges([link], DEFAULT_FILTERS, 'all')).toEqual([]);
    expect(filterChanges([link], { ...DEFAULT_FILTERS, flexibility: true }, 'all')).toHaveLength(1);
  });

  it('groups by month in order', () => {
    const groups = groupByMonth([
      change({ date: '2026-07-20' }),
      change({ date: '2026-07-02' }),
      change({ date: '2026-06-30' }),
    ]);
    expect(groups.map((g) => [g.month, g.changes.length])).toEqual([
      ['July 2026', 2],
      ['June 2026', 1],
    ]);
  });

  it('animates consent, construction and energisation of 5MW or more only', () => {
    expect(isAnimated(change({}))).toBe(true);
    expect(isAnimated(change({ mw: 4.9 }))).toBe(false);
    expect(isAnimated(change({ type: 'application_submitted' }))).toBe(false);
    expect(isAnimated(change({ dateKind: 'spotted' }))).toBe(false);
  });
});
