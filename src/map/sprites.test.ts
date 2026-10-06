import { describe, expect, it } from 'vitest';
import { spriteInk, stageColours } from '../theme/tokens';
import { GLYPHS, GLYPH_SIZE, TILE_SIZE, spriteKind, tilePixels } from './sprites';

describe('sprites', () => {
  it('has square glyphs of the right size', () => {
    for (const frames of Object.values(GLYPHS)) {
      for (const glyph of frames) {
        expect(glyph).toHaveLength(GLYPH_SIZE);
        for (const line of glyph) expect(line).toMatch(new RegExp(`^[k.]{${GLYPH_SIZE}}$`));
      }
    }
  });

  it('gives wind two different frames', () => {
    expect(GLYPHS.wind).toHaveLength(2);
    expect(GLYPHS.wind[0]).not.toEqual(GLYPHS.wind[1]);
  });

  it('builds a tile with an ink outline and stage background', () => {
    const tile = tilePixels('solar', 0, 'consented');
    expect(tile).toHaveLength(TILE_SIZE);
    expect(tile[0].every((c) => c === spriteInk)).toBe(true);
    expect(tile[1][1]).toBe(stageColours.consented);
  });

  it('maps every included REPD technology to a sprite', () => {
    for (const technology of [
      'Wind Onshore',
      'Wind Offshore',
      'Solar Photovoltaics',
      'Small Hydro',
      'Large Hydro',
      'Tidal Stream',
      'Tidal Lagoon',
      'Shoreline Wave',
      'Battery',
      'Pumped Storage Hydroelectricity',
      'Liquid Air Energy Storage',
      'Compressed Air Energy Storage',
      'Flywheels',
      'Hydrogen',
    ]) {
      expect(() => spriteKind(technology)).not.toThrow();
    }
    expect(() => spriteKind('Fusion')).toThrow();
  });
});
