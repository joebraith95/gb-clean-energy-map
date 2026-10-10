import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, ZOOM_BANDS, bandIndex } from './levels';

describe('zoom bands', () => {
  it('start in order, within the zoom range', () => {
    expect(ZOOM_BANDS[0].minZoom).toBeLessThanOrEqual(MIN_ZOOM);
    for (let i = 1; i < ZOOM_BANDS.length; i++) {
      expect(ZOOM_BANDS[i].minZoom).toBeGreaterThan(ZOOM_BANDS[i - 1].minZoom);
    }
    expect(ZOOM_BANDS[ZOOM_BANDS.length - 1].minZoom).toBeLessThanOrEqual(MAX_ZOOM);
  });

  it('show more projects, never fewer, as you zoom in', () => {
    for (let i = 1; i < ZOOM_BANDS.length; i++) {
      expect(ZOOM_BANDS[i].minMw).toBeLessThanOrEqual(ZOOM_BANDS[i - 1].minMw);
    }
  });

  it('finds the band for a zoom', () => {
    expect(bandIndex(MIN_ZOOM)).toBe(0);
    expect(bandIndex(6.49)).toBe(0);
    expect(bandIndex(6.5)).toBe(1);
    expect(bandIndex(MAX_ZOOM)).toBe(ZOOM_BANDS.length - 1);
  });
});
