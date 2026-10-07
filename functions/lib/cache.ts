// Caching with a stale fallback, so the site keeps showing the last good figures if a source is down.

export interface CacheStore {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
}

export interface Cached<T> {
  data: T;
  /** When the data was fetched from the source. */
  fetchedAt: string;
  /** True when the source failed and this is the last good copy. */
  stale: boolean;
}

export interface Unavailable {
  data: null;
  error: string;
}

/**
 * Returns a fresh cached copy if it is younger than `freshSeconds`; otherwise loads from the
 * source. If loading fails, returns the last good copy (kept for `keepSeconds`) marked stale,
 * or an Unavailable result. Never throws.
 */
export async function cached<T>(
  store: CacheStore,
  key: string,
  freshSeconds: number,
  keepSeconds: number,
  load: () => Promise<T>,
  now: () => number = Date.now,
): Promise<Cached<T> | Unavailable> {
  const hit = await store.match(key).catch(() => undefined);
  const previous = hit ? ((await hit.json()) as { data: T; fetchedAt: string }) : null;
  const age = previous ? (now() - Date.parse(previous.fetchedAt)) / 1000 : Infinity;
  if (previous && age < freshSeconds) return { ...previous, stale: false };

  try {
    const data = await load();
    const fetchedAt = new Date(now()).toISOString();
    const body = JSON.stringify({ data, fetchedAt });
    await store
      .put(key, new Response(body, { headers: { 'Cache-Control': `max-age=${keepSeconds}` } }))
      .catch(() => undefined);
    return { data, fetchedAt, stale: false };
  } catch (error) {
    if (previous && age < keepSeconds) return { ...previous, stale: true };
    return { data: null, error: error instanceof Error ? error.message : 'Source unavailable' };
  }
}

/** fetch with a timeout and a JSON body, failing on any non-2xx status. */
export async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'gb-clean-energy-map' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} responded ${response.status}`);
  return (await response.json()) as T;
}

/** The Workers Cache API, keyed by a synthetic URL, or a no-op store where it is unavailable. */
export function edgeCache(): CacheStore {
  const store = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  if (!store) return { match: async () => undefined, put: async () => undefined };
  const url = (key: string) => `https://live-cache.internal/${encodeURIComponent(key)}`;
  return {
    match: (key) => store.match(url(key)),
    put: (key, response) => store.put(url(key), response),
  };
}

export function jsonResponse(body: unknown, maxAgeSeconds: number): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAgeSeconds}`,
    },
  });
}
