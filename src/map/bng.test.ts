import { describe, expect, it } from 'vitest';
import { bngToLonLat } from './bng';

// Reference values from pyproj (EPSG:27700 to EPSG:4326). The two points far out to sea are
// beyond the Ordnance Survey correction grid, where pyproj applies no datum shift at all, so their
// values come from pyproj with the same Helmert parameters. 0.0002 degrees is about 15 metres.
const TOLERANCE = 0.0002;

describe('bngToLonLat', () => {
  it.each([
    ['Caister water tower (OS worked example)', 651_409.903, 313_177.27, 1.716052, 52.657979],
    ['south-west corner of the map', 0, 0, -7.55716, 49.766807],
    ['the North Sea towards Dogger Bank', 730_000, 470_000, 3.03718, 54.020283],
    ['north-east corner of the map', 760_000, 1_230_000, 4.61804, 60.789417],
    ['the Lizard', 170_370, 11_572, -5.203002, 49.960071],
    ['Shetland', 457_000, 1_215_000, -0.954095, 60.813815],
    ['central Scotland', 300_000, 700_000, -3.612595, 56.1821],
    ['central London', 530_000, 180_000, -0.128354, 51.503991],
  ])('places %s', (_name, east, north, lon, lat) => {
    const [gotLon, gotLat] = bngToLonLat(east, north);
    expect(Math.abs(gotLon - lon)).toBeLessThan(TOLERANCE);
    expect(Math.abs(gotLat - lat)).toBeLessThan(TOLERANCE);
  });
});
