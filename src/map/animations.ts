// Pixel effects for recent events, as offsets in art pixels from the marker's centre.
// Pure, so the frames can be tested; MapView draws them.

export type EffectKind = 'consented' | 'construction_started' | 'operational';

/** Time per frame (ms) and frames per effect: about 1.2 seconds at 8 frames a second. */
export const FRAME_MS = 125;
export const FRAMES = 10;
/** How long the still outline shows instead, when the viewer prefers reduced motion (ms). */
export const STILL_MS = 3000;
/** Delay between effects in the on-load sequence (ms). */
export const STAGGER_MS = 150;

type Pixel = [number, number];

/** Square ring of the given radius. */
function ring(radius: number, every = 1): Pixel[] {
  const pixels: Pixel[] = [];
  for (let i = -radius; i <= radius; i++) {
    pixels.push([i, -radius], [i, radius]);
    if (i !== -radius && i !== radius) pixels.push([-radius, i], [radius, i]);
  }
  return every > 1 ? pixels.filter((_, n) => n % every === 0) : pixels;
}

const DIRECTIONS: Pixel[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/** Pixels lit in one frame of an effect. Frames past the end are empty. */
export function effectPixels(kind: EffectKind, frame: number): Pixel[] {
  if (frame < 0 || frame >= FRAMES) return [];
  switch (kind) {
    // Consent: a square ring expanding outwards, thinning as it goes.
    case 'consented':
      return ring(5 + frame, frame >= FRAMES - 3 ? 2 : 1);
    // Construction: scaffold corners blinking on and off.
    case 'construction_started': {
      if (frame % 2 === 1) return [];
      const r = 7;
      const pixels: Pixel[] = [];
      for (const [sx, sy] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ]) {
        pixels.push([sx * r, sy * r], [sx * (r - 1), sy * r], [sx * r, sy * (r - 1)]);
        pixels.push([sx * (r - 2), sy * r], [sx * r, sy * (r - 2)]);
      }
      return pixels;
    }
    // Energisation: sparks shooting out in eight directions.
    case 'operational': {
      const near = 5 + frame;
      return DIRECTIONS.flatMap(([dx, dy]) => [
        [dx * near, dy * near] as Pixel,
        [dx * (near + 1), dy * (near + 1)] as Pixel,
      ]);
    }
  }
}

/** The still outline shown instead of an animation under reduced motion. */
export function stillPixels(): Pixel[] {
  return ring(6);
}

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
