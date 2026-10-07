// Live data from the site's own API (functions/api/live). The browser never calls third parties.

import { API_BASE, dataUrl } from '../config';

export interface Credit {
  source: string;
  text: string;
  licence: string;
}

export interface Fresh<T> {
  data: T;
  fetchedAt: string;
  /** True when the source is down and this is the last good copy. */
  stale: boolean;
}

/** A source that could not be reached and had no recent copy. */
export interface Missing {
  data: null;
  error: string;
}

export type Part<T> = Fresh<T> | Missing;

export interface NationalLive {
  mix: Part<{
    time: string;
    fuels: Record<string, number>;
    /** MW by interconnector ID; positive means Great Britain is importing. */
    interconnectors: Record<string, number>;
  }>;
  solar: Part<{ time: string; mw: number; capacityMwp: number | null }>;
  credits: Credit[];
}

export interface RegionLive {
  id: number;
  name: string;
  intensity: number;
  index: string;
  mix: Record<string, number>;
}

export interface RegionsLive {
  regions: Part<{ from: string; to: string; regions: RegionLive[] }>;
  credits: Credit[];
}

export interface UnitLive {
  repdIds: number[];
  units: string[];
  note: string | null;
  label: string;
  output: Part<{
    points: { time: string; mw: number | null }[];
    latest: { time: string; mw: number } | null;
  }>;
  credits: Credit[];
}

export interface BmuMap {
  farms: { repdIds: number[]; units: string[]; note?: string }[];
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(`Live data unavailable (${response.status})`);
  return response.json();
}

export const loadNational = () => getJson<NationalLive>('/live/national');
export const loadRegions = () => getJson<RegionsLive>('/live/regions');
export const loadUnit = (repdId: number) => getJson<UnitLive>(`/live/unit?repd=${repdId}`);

/** Which REPD projects have live output: the static map published by the pipeline. */
export async function loadBmuMap(): Promise<Set<number>> {
  const response = await fetch(dataUrl('bmu-map.json'));
  if (!response.ok) return new Set();
  const map: BmuMap = await response.json();
  return new Set(map.farms.flatMap((f) => f.repdIds));
}

export function isFresh<T>(part: Part<T> | undefined): part is Fresh<T> {
  return !!part && part.data !== null;
}

const ukTime = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/London',
});

/** "19:30" in UK time. */
export function formatTime(iso: string): string {
  return ukTime.format(new Date(iso));
}

/** Fuel codes from Elexon FUELINST, grouped and labelled for display. */
export const FUEL_GROUPS: { key: string; label: string; codes: string[] }[] = [
  { key: 'wind', label: 'Wind (transmission-connected)', codes: ['WIND'] },
  { key: 'solar', label: 'Solar (estimate)', codes: [] },
  { key: 'nuclear', label: 'Nuclear', codes: ['NUCLEAR'] },
  { key: 'gas', label: 'Gas', codes: ['CCGT', 'OCGT'] },
  { key: 'biomass', label: 'Biomass', codes: ['BIOMASS'] },
  { key: 'hydro', label: 'Hydro', codes: ['NPSHYD'] },
  { key: 'pumped', label: 'Pumped storage', codes: ['PS'] },
  { key: 'imports', label: 'Net imports', codes: [] },
  { key: 'coal', label: 'Coal', codes: ['COAL'] },
  { key: 'oil', label: 'Oil', codes: ['OIL'] },
  { key: 'other', label: 'Other', codes: ['OTHER'] },
];

export interface MixRow {
  key: string;
  label: string;
  mw: number;
  share: number;
}

/**
 * Generation by group in MW and as a share of the total. Negative values (pumping, net exports)
 * are left out of the total and shown as zero, since they are demand rather than supply.
 */
export function mixRows(national: NationalLive): MixRow[] {
  if (!isFresh(national.mix)) return [];
  const { fuels, interconnectors } = national.mix.data;
  const solar = isFresh(national.solar) ? national.solar.data.mw : 0;
  const netImports = Object.values(interconnectors).reduce((sum, mw) => sum + mw, 0);
  const rows = FUEL_GROUPS.map((group) => {
    let mw = group.codes.reduce((sum, code) => sum + (fuels[code] ?? 0), 0);
    if (group.key === 'solar') mw = solar;
    if (group.key === 'imports') mw = netImports;
    return { key: group.key, label: group.label, mw: Math.max(0, mw), share: 0 };
  });
  const total = rows.reduce((sum, r) => sum + r.mw, 0);
  return rows
    .map((r) => ({ ...r, share: total > 0 ? r.mw / total : 0 }))
    .filter((r) => r.mw > 0);
}
