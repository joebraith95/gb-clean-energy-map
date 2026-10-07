// Parsing for Elexon Insights (BMRS) data. Pure functions, tested against recorded responses.

export const ELEXON_API = 'https://data.elexon.co.uk/bmrs/api/v1';

/** FUELINST interconnector codes -> our interconnector IDs (pipeline/interconnectors.json). */
export const INTERCONNECTOR_CODES: Record<string, string> = {
  INTFR: 'ifa',
  INTIFA2: 'ifa2',
  INTELEC: 'eleclink',
  INTNED: 'britned',
  INTNEM: 'nemo',
  INTNSL: 'nsl',
  INTVKL: 'viking',
  INTIRL: 'moyle',
  INTEW: 'ewic',
  INTGRNL: 'greenlink',
};

export interface FuelinstRow {
  startTime: string;
  fuelType: string;
  generation: number;
}

export interface NationalMix {
  /** Start of the 5-minute period the figures describe. */
  time: string;
  /** Generation by FUELINST fuel code in MW, interconnectors excluded. */
  fuels: Record<string, number>;
  /** Flow per interconnector in MW: positive means Great Britain is importing. */
  interconnectors: Record<string, number>;
}

/** The latest complete period in a FUELINST stream response. */
export function parseFuelinst(rows: FuelinstRow[]): NationalMix {
  if (rows.length === 0) throw new Error('FUELINST returned no rows');
  const time = rows.reduce(
    (latest, r) => (r.startTime > latest ? r.startTime : latest),
    rows[0].startTime,
  );
  const fuels: Record<string, number> = {};
  const interconnectors: Record<string, number> = {};
  for (const row of rows) {
    if (row.startTime !== time) continue;
    const link = INTERCONNECTOR_CODES[row.fuelType];
    if (link) interconnectors[link] = row.generation;
    else if (!row.fuelType.startsWith('INT')) fuels[row.fuelType] = row.generation;
  }
  return { time, fuels, interconnectors };
}

export interface PhysicalRow {
  timeFrom: string;
  timeTo: string;
  levelFrom: number;
  levelTo: number;
}

export interface AcceptanceRow extends PhysicalRow {
  acceptanceNumber: number;
}

export interface SeriesPoint {
  time: string;
  mw: number | null;
}

/** Level of a segment at time t (ms), interpolating between its ends; null if t is outside it. */
function levelAt(row: PhysicalRow, t: number): number | null {
  const from = Date.parse(row.timeFrom);
  const to = Date.parse(row.timeTo);
  if (t < from || t > to) return null;
  if (to === from) return row.levelTo;
  return row.levelFrom + ((row.levelTo - row.levelFrom) * (t - from)) / (to - from);
}

/**
 * Scheduled output of one unit at time t: the most recent accepted bid or offer (BOALF) covering
 * t if there is one, otherwise the generator's own Physical Notification (PN). Null if neither
 * covers t.
 */
export function scheduledLevel(
  pn: PhysicalRow[],
  boalf: AcceptanceRow[],
  t: number,
): number | null {
  let accepted: AcceptanceRow | null = null;
  for (const row of boalf) {
    if (levelAt(row, t) === null) continue;
    if (!accepted || row.acceptanceNumber > accepted.acceptanceNumber) accepted = row;
  }
  if (accepted) return levelAt(accepted, t);
  for (const row of pn) {
    const level = levelAt(row, t);
    if (level !== null) return level;
  }
  return null;
}

/**
 * Sum of scheduled output across a farm's units, sampled every `stepMinutes` from `from` to `to`.
 * A sample is null unless every unit has a level at that time, so a gap is never shown as zero.
 */
export function farmSeries(
  units: { pn: PhysicalRow[]; boalf: AcceptanceRow[] }[],
  from: Date,
  to: Date,
  stepMinutes = 15,
): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  const step = stepMinutes * 60_000;
  const start = Math.ceil(from.getTime() / step) * step;
  for (let t = start; t <= to.getTime(); t += step) {
    let total = 0;
    let complete = true;
    for (const unit of units) {
      const level = scheduledLevel(unit.pn, unit.boalf, t);
      if (level === null) {
        complete = false;
        break;
      }
      total += level;
    }
    points.push({
      time: new Date(t).toISOString(),
      mw: complete ? Math.max(0, Math.round(total)) : null,
    });
  }
  return points;
}
