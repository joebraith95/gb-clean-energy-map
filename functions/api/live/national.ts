// GET /api/live/national: national generation mix and interconnector flows (Elexon FUELINST),
// plus the national solar estimate (PV_Live). Each source is cached and fails independently.

import { PV_LIVE_CREDIT, elexonCredit } from '../../lib/attribution';
import { cached, edgeCache, fetchJson, jsonResponse } from '../../lib/cache';
import { ELEXON_API, parseFuelinst, type FuelinstRow } from '../../lib/elexon';
import { PV_LIVE_API, parsePvLive } from '../../lib/sources';

const SIX_HOURS = 6 * 60 * 60;

const minute = (date: Date) => `${date.toISOString().slice(0, 16)}Z`;

export const onRequestGet: PagesFunction = async () => {
  const store = edgeCache();
  const now = new Date();
  const [mix, solar] = await Promise.all([
    cached(store, 'fuelinst', 5 * 60, SIX_HOURS, async () => {
      const from = minute(new Date(now.getTime() - 20 * 60_000));
      const url = `${ELEXON_API}/datasets/FUELINST/stream?publishDateTimeFrom=${from}&publishDateTimeTo=${minute(now)}`;
      return parseFuelinst(await fetchJson<FuelinstRow[]>(url));
    }),
    cached(store, 'pvlive-national', 10 * 60, SIX_HOURS, async () =>
      parsePvLive(await fetchJson(`${PV_LIVE_API}/pes/0?extra_fields=installedcapacity_mwp`)),
    ),
  ]);
  return jsonResponse({ mix, solar, credits: [elexonCredit(now), PV_LIVE_CREDIT] }, 60);
};
