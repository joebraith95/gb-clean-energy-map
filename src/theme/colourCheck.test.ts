import { describe, expect, it } from 'vitest';
import { VISION, difference } from './colourCheck';
import { markerInk, stageColours } from './tokens';

// CIE76 difference of 20 or more reads as clearly different colours, even on small markers.
const MIN_DIFFERENCE = 20;

const colours: Record<string, string> = { ...stageColours, ink: markerInk };
const names = Object.keys(colours);

describe('stage colours', () => {
  for (const [vision, matrix] of Object.entries(VISION)) {
    it(`stay distinguishable with ${vision} vision`, () => {
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const d = difference(colours[names[i]], colours[names[j]], matrix);
          expect(d, `${names[i]} vs ${names[j]}`).toBeGreaterThanOrEqual(MIN_DIFFERENCE);
        }
      }
    });
  }
});
