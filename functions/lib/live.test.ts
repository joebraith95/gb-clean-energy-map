import { describe, expect, it } from 'vitest';
import bmuMap from '../../data/bmu-map.json';
import { cached, type CacheStore } from './cache';
import {
  INTERCONNECTOR_CODES,
  farmSeries,
  parseFuelinst,
  scheduledLevel,
  type AcceptanceRow,
  type FuelinstRow,
  type PhysicalRow,
} from './elexon';
import boalf from './fixtures/boalf-moweo1.json';
import fuelinst from './fixtures/fuelinst.json';
import pn from './fixtures/pn-moweo1.json';
import pvlive from './fixtures/pvlive.json';
import regional from './fixtures/regional.json';
import { parsePvLive, parseRegional } from './sources';

describe('FUELINST', () => {
  const mix = parseFuelinst(fuelinst as FuelinstRow[]);

  it('keeps only the latest period', () => {
    const times = new Set((fuelinst as FuelinstRow[]).map((r) => r.startTime));
    expect(mix.time).toBe([...times].sort().at(-1));
  });

  it('splits fuels from interconnectors and maps interconnector codes to our IDs', () => {
    expect(Object.keys(mix.fuels)).toContain('WIND');
    expect(Object.keys(mix.fuels).some((k) => k.startsWith('INT'))).toBe(false);
    expect(Object.keys(mix.interconnectors).sort()).toEqual(
      Object.values(INTERCONNECTOR_CODES).sort(),
    );
  });

  it('rejects an empty response', () => {
    expect(() => parseFuelinst([])).toThrow();
  });
});

describe('Carbon Intensity and PV_Live', () => {
  it('keeps the 14 regions only', () => {
    const parsed = parseRegional(regional);
    expect(parsed.regions).toHaveLength(14);
    expect(parsed.regions[0]).toMatchObject({ id: 1, name: 'North Scotland' });
    expect(typeof parsed.regions[0].mix.wind).toBe('number');
  });

  it('reads the national solar estimate', () => {
    const solar = parsePvLive(pvlive);
    expect(solar.capacityMwp).toBeGreaterThan(10_000);
    expect(solar.mw).toBeGreaterThanOrEqual(0);
  });
});

describe('scheduled output', () => {
  const t = (iso: string) => Date.parse(iso);
  const pnRow: PhysicalRow = {
    timeFrom: '2026-10-06T10:00:00Z',
    timeTo: '2026-10-06T10:30:00Z',
    levelFrom: 100,
    levelTo: 200,
  };
  const accept = (n: number, level: number): AcceptanceRow => ({
    timeFrom: '2026-10-06T10:10:00Z',
    timeTo: '2026-10-06T10:20:00Z',
    levelFrom: level,
    levelTo: level,
    acceptanceNumber: n,
  });

  it('follows the physical notification, interpolating within a segment', () => {
    expect(scheduledLevel([pnRow], [], t('2026-10-06T10:15:00Z'))).toBe(150);
  });

  it('uses the latest accepted bid or offer where one is active', () => {
    expect(scheduledLevel([pnRow], [accept(1, 40), accept(2, 20)], t('2026-10-06T10:15:00Z'))).toBe(
      20,
    );
    expect(scheduledLevel([pnRow], [accept(2, 20)], t('2026-10-06T10:25:00Z'))).toBeCloseTo(
      183.3,
      1,
    );
  });

  it('never shows a gap as zero', () => {
    const series = farmSeries(
      [
        { pn: [pnRow], boalf: [] },
        { pn: [], boalf: [] },
      ],
      new Date('2026-10-06T10:00:00Z'),
      new Date('2026-10-06T10:30:00Z'),
    );
    expect(series.every((p) => p.mw === null)).toBe(true);
  });

  it('builds a 24-hour series from recorded Elexon data', () => {
    const rows = (pn as { data: PhysicalRow[] }).data;
    const accepted = (boalf as { data: AcceptanceRow[] }).data;
    const to = new Date(rows.reduce((m, r) => (r.timeTo > m ? r.timeTo : m), rows[0].timeTo));
    const from = new Date(to.getTime() - 24 * 60 * 60_000);
    const series = farmSeries([{ pn: rows, boalf: accepted }], from, to);
    expect(series).toHaveLength(97);
    const known = series.filter((p) => p.mw !== null).map((p) => p.mw as number);
    expect(known.length).toBeGreaterThan(80);
    // Moray East unit 1 is a 300MW unit.
    expect(Math.max(...known)).toBeLessThanOrEqual(320);
  });
});

describe('cache with stale fallback', () => {
  function memoryStore(): CacheStore & { entries: Map<string, string> } {
    const entries = new Map<string, string>();
    return {
      entries,
      match: async (key) => (entries.has(key) ? new Response(entries.get(key)) : undefined),
      put: async (key, response) => void entries.set(key, await response.text()),
    };
  }

  it('serves fresh copies, then the last good copy marked stale when the source fails', async () => {
    const store = memoryStore();
    let clock = Date.parse('2026-10-06T12:00:00Z');
    const now = () => clock;
    const ok = await cached(store, 'k', 300, 3600, async () => ({ mw: 1 }), now);
    expect(ok).toMatchObject({ data: { mw: 1 }, stale: false });

    clock += 60_000;
    const fresh = await cached(store, 'k', 300, 3600, async () => ({ mw: 2 }), now);
    expect(fresh).toMatchObject({ data: { mw: 1 }, stale: false });

    clock += 600_000;
    const failing = async () => {
      throw new Error('down');
    };
    expect(await cached(store, 'k', 300, 3600, failing, now)).toMatchObject({
      data: { mw: 1 },
      stale: true,
    });

    clock += 4 * 3600_000;
    expect(await cached(store, 'k', 300, 3600, failing, now)).toEqual({
      data: null,
      error: 'down',
    });
  });
});

describe('BM unit map', () => {
  it('only lists Elexon unit IDs, so the unit endpoint cannot be used as an open proxy', () => {
    for (const farm of (bmuMap as { farms: { units: string[] }[] }).farms) {
      for (const unit of farm.units) expect(unit).toMatch(/^[TE]_[A-Z0-9-]+$/);
    }
  });
});
