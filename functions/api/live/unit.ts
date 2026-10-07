// GET /api/live/unit?repd=<REPD ID>: scheduled output over the last 24 hours for a large wind farm
// in data/bmu-map.json. Only mapped farms are served, so this cannot be used as an open proxy.

import bmuMap from '../../../data/bmu-map.json';
import { elexonCredit } from '../../lib/attribution';
import { cached, edgeCache, fetchJson, jsonResponse } from '../../lib/cache';
import { ELEXON_API, farmSeries, type AcceptanceRow, type PhysicalRow } from '../../lib/elexon';

interface Farm {
  repdIds: number[];
  units: string[];
  note?: string;
}

const farms = (bmuMap as { farms: Farm[] }).farms;

const minute = (date: Date) => `${date.toISOString().slice(0, 16)}Z`;

export const onRequestGet: PagesFunction = async ({ request }) => {
  const repd = Number(new URL(request.url).searchParams.get('repd'));
  const farm = farms.find((f) => f.repdIds.includes(repd));
  if (!farm) {
    return new Response(JSON.stringify({ error: 'No live data for this project' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const output = await cached(
    edgeCache(),
    `unit:${farm.units.join(',')}`,
    10 * 60,
    6 * 60 * 60,
    async () => {
      const to = new Date();
      const from = new Date(to.getTime() - 24 * 60 * 60_000);
      const range = `from=${minute(from)}&to=${minute(to)}`;
      const units = await Promise.all(
        farm.units.map(async (unit) => {
          const [pn, boalf] = await Promise.all([
            fetchJson<{ data: PhysicalRow[] }>(
              `${ELEXON_API}/balancing/physical?bmUnit=${unit}&${range}&dataset=PN`,
            ),
            fetchJson<{ data: AcceptanceRow[] }>(
              `${ELEXON_API}/balancing/acceptances?bmUnit=${unit}&${range}`,
            ),
          ]);
          return { pn: pn.data, boalf: boalf.data };
        }),
      );
      const points = farmSeries(units, from, to);
      const latest = [...points].reverse().find((p) => p.mw !== null) ?? null;
      return { points, latest };
    },
  );

  return jsonResponse(
    {
      repdIds: farm.repdIds,
      units: farm.units,
      note: farm.note ?? null,
      label: 'Scheduled output (Elexon)',
      output,
      credits: [elexonCredit()],
    },
    120,
  );
};
