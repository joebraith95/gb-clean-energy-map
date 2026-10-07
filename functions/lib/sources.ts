// Parsing for NESO Carbon Intensity and Sheffield Solar PV_Live. Pure functions.

export const CARBON_INTENSITY_API = 'https://api.carbonintensity.org.uk';
export const PV_LIVE_API = 'https://api.pvlive.uk/pvlive/api/v4';

export interface Region {
  id: number;
  name: string;
  /** Forecast carbon intensity in gCO2/kWh. */
  intensity: number;
  /** "very low" to "very high". */
  index: string;
  /** Share of generation by fuel, in per cent. */
  mix: Record<string, number>;
}

export interface Regional {
  from: string;
  to: string;
  regions: Region[];
}

interface CarbonIntensityRegional {
  data: {
    from: string;
    to: string;
    regions: {
      regionid: number;
      shortname: string;
      intensity: { forecast: number; index: string };
      generationmix: { fuel: string; perc: number }[];
    }[];
  }[];
}

/** The 14 DNO regions; the API's extra aggregate regions (England, Scotland, Wales, GB) are dropped. */
export function parseRegional(body: CarbonIntensityRegional): Regional {
  const period = body.data?.[0];
  if (!period) throw new Error('Carbon Intensity returned no data');
  return {
    from: period.from,
    to: period.to,
    regions: period.regions
      .filter((r) => r.regionid <= 14)
      .map((r) => ({
        id: r.regionid,
        name: r.shortname,
        intensity: r.intensity.forecast,
        index: r.intensity.index,
        mix: Object.fromEntries(r.generationmix.map((m) => [m.fuel, m.perc])),
      })),
  };
}

export interface Solar {
  time: string;
  mw: number;
  capacityMwp: number | null;
}

interface PvLiveResponse {
  meta: string[];
  data: (string | number)[][];
}

export function parsePvLive(body: PvLiveResponse): Solar {
  const row = body.data?.[0];
  if (!row) throw new Error('PV_Live returned no data');
  const field = (name: string) => row[body.meta.indexOf(name)];
  const capacity = body.meta.includes('installedcapacity_mwp')
    ? Number(field('installedcapacity_mwp'))
    : null;
  return {
    time: String(field('datetime_gmt')),
    mw: Math.round(Number(field('generation_mw'))),
    capacityMwp: capacity === null ? null : Math.round(capacity),
  };
}
