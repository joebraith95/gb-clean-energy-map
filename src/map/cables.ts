// Schematic interconnector cables: a dashed line from the GB landing point to the partner end,
// with the dashes moving in the direction power is flowing.

/** Dash and gap lengths, in multiples of the line width. */
export const DASH = 2;
export const GAP = 2;
/** Steps the dashes move through before the pattern repeats. */
export const PULSE_STEPS = 8;

/**
 * Which way a cable's dashes move: 1 outwards (Great Britain exporting), -1 inwards (importing),
 * 0 still. With no live flow, operational cables pulse outwards as a sign of activity.
 */
export function pulseDirection(stage: string, flowMw: number | undefined): -1 | 0 | 1 {
  if (flowMw === undefined) return stage === 'operational' ? 1 : 0;
  if (flowMw > 0) return -1;
  if (flowMw < 0) return 1;
  return 0;
}

/**
 * The dash pattern (dash, gap, dash, gap) with the dashes moved `step` steps along the line,
 * away from its start. Stepping through 0 to PULSE_STEPS - 1 makes the dashes travel.
 */
export function dashPattern(step: number): number[] {
  const period = DASH + GAP;
  const wrapped = ((step % PULSE_STEPS) + PULSE_STEPS) % PULSE_STEPS;
  const shift = (wrapped / PULSE_STEPS) * period;
  // Either the pattern opens with part of the gap, or with the tail of a dash that has wrapped.
  return shift <= GAP ? [0, shift, DASH, GAP - shift] : [shift - GAP, GAP, period - shift, 0];
}
