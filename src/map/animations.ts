// Effects for recent events: a short animation around the marker, drawn in the new stage's colour.
// The shapes and motion are CSS (see .map-effect in index.css); this decides what plays and when.

export type EffectKind = 'consented' | 'construction_started' | 'operational';

/** How long an effect runs (ms). Keep in step with the .map-effect animations in index.css. */
export const EFFECT_MS = 1200;
/** How long the still ring shows instead, when the viewer prefers reduced motion (ms). */
export const STILL_MS = 3000;
/** Delay between effects in the on-load sequence (ms). */
export const STAGGER_MS = 150;

export interface EventCandidate<T> {
  target: T;
  kind: EffectKind;
  date: string;
  mw: number;
}

/**
 * Which recent events play when the map opens: those in the `months` before the newest event,
 * that are visible now, largest first, at most `limit`.
 */
export function pickOnLoad<T>(
  candidates: EventCandidate<T>[],
  isVisible: (target: T) => boolean,
  months = 3,
  limit = 30,
): EventCandidate<T>[] {
  if (candidates.length === 0) return [];
  const newest = candidates.reduce((max, c) => (c.date > max ? c.date : max), candidates[0].date);
  const start = new Date(`${newest}T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() - months);
  const cutoff = start.toISOString().slice(0, 10);
  return candidates
    .filter((c) => c.date > cutoff && isVisible(c.target))
    .sort((a, b) => b.mw - a.mw)
    .slice(0, limit);
}
