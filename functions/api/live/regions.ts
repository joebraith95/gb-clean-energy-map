// GET /api/live/regions: forecast carbon intensity and generation mix for the 14 regions.

import { CARBON_INTENSITY_CREDIT } from '../../lib/attribution';
import { cached, edgeCache, fetchJson, jsonResponse } from '../../lib/cache';
import { CARBON_INTENSITY_API, parseRegional } from '../../lib/sources';

export const onRequestGet: PagesFunction = async () => {
  const regions = await cached(edgeCache(), 'ci-regional', 30 * 60, 6 * 60 * 60, async () =>
    parseRegional(await fetchJson(`${CARBON_INTENSITY_API}/regional`)),
  );
  return jsonResponse({ regions, credits: [CARBON_INTENSITY_CREDIT] }, 300);
};
