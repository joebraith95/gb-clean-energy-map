// British National Grid (EPSG:27700) to WGS84 longitude and latitude.
// The data stays in BNG, as its sources publish it; only the map view needs longitude and latitude,
// because satellite imagery and place names are served in web map tiles.
// Uses the Ordnance Survey seven-parameter (Helmert) transformation, accurate to about 5 metres,
// which is finer than the imagery.

const RADIANS = Math.PI / 180;

// Airy 1830 ellipsoid and the National Grid projection.
const AIRY = { a: 6_377_563.396, b: 6_356_256.909 };
const SCALE = 0.9996012717;
const ORIGIN_LAT = 49 * RADIANS;
const ORIGIN_LON = -2 * RADIANS;
const ORIGIN_EAST = 400_000;
const ORIGIN_NORTH = -100_000;

const WGS84 = { a: 6_378_137, b: 6_356_752.3141 };

// OSGB36 to WGS84: translations in metres, rotations in arc seconds, scale in parts per million.
const HELMERT = {
  tx: 446.448,
  ty: -125.157,
  tz: 542.06,
  rx: 0.1502,
  ry: 0.247,
  rz: 0.8421,
  s: -20.4894,
};

/** Longitude and latitude (WGS84, degrees) of a BNG point, in the order map libraries expect. */
export function bngToLonLat(east: number, north: number): [number, number] {
  const { a, b } = AIRY;
  const e2 = 1 - (b * b) / (a * a);
  const n = (a - b) / (a + b);

  // Latitude of the point's northing on the central meridian, by iteration.
  let lat = ORIGIN_LAT;
  let m = 0;
  do {
    lat += (north - ORIGIN_NORTH - m) / (a * SCALE);
    m = meridionalArc(lat, b, n);
  } while (Math.abs(north - ORIGIN_NORTH - m) >= 0.00001);

  const sin = Math.sin(lat);
  const cos = Math.cos(lat);
  const tan = Math.tan(lat);
  const nu = (a * SCALE) / Math.sqrt(1 - e2 * sin * sin);
  const rho = (a * SCALE * (1 - e2)) / Math.pow(1 - e2 * sin * sin, 1.5);
  const eta2 = nu / rho - 1;
  const tan2 = tan * tan;
  const tan4 = tan2 * tan2;
  const tan6 = tan4 * tan2;

  const vii = tan / (2 * rho * nu);
  const viii = (tan / (24 * rho * nu ** 3)) * (5 + 3 * tan2 + eta2 - 9 * tan2 * eta2);
  const ix = (tan / (720 * rho * nu ** 5)) * (61 + 90 * tan2 + 45 * tan4);
  const x = 1 / (cos * nu);
  const xi = (1 / (cos * 6 * nu ** 3)) * (nu / rho + 2 * tan2);
  const xii = (1 / (cos * 120 * nu ** 5)) * (5 + 28 * tan2 + 24 * tan4);
  const xiia = (1 / (cos * 5040 * nu ** 7)) * (61 + 662 * tan2 + 1320 * tan4 + 720 * tan6);

  const de = east - ORIGIN_EAST;
  const osgbLat = lat - vii * de ** 2 + viii * de ** 4 - ix * de ** 6;
  const osgbLon = ORIGIN_LON + x * de - xi * de ** 3 + xii * de ** 5 - xiia * de ** 7;

  return toWgs84(osgbLat, osgbLon);
}

function meridionalArc(lat: number, b: number, n: number): number {
  const dLat = lat - ORIGIN_LAT;
  const sLat = lat + ORIGIN_LAT;
  const n2 = n * n;
  const n3 = n2 * n;
  return (
    b *
    SCALE *
    ((1 + n + (5 / 4) * n2 + (5 / 4) * n3) * dLat -
      (3 * n + 3 * n2 + (21 / 8) * n3) * Math.sin(dLat) * Math.cos(sLat) +
      ((15 / 8) * n2 + (15 / 8) * n3) * Math.sin(2 * dLat) * Math.cos(2 * sLat) -
      (35 / 24) * n3 * Math.sin(3 * dLat) * Math.cos(3 * sLat))
  );
}

/** Moves an OSGB36 latitude and longitude (radians) onto WGS84, through cartesian coordinates. */
function toWgs84(lat: number, lon: number): [number, number] {
  const airyE2 = 1 - (AIRY.b * AIRY.b) / (AIRY.a * AIRY.a);
  const nu = AIRY.a / Math.sqrt(1 - airyE2 * Math.sin(lat) ** 2);
  const x1 = nu * Math.cos(lat) * Math.cos(lon);
  const y1 = nu * Math.cos(lat) * Math.sin(lon);
  const z1 = (1 - airyE2) * nu * Math.sin(lat);

  const s = 1 + HELMERT.s / 1e6;
  const rx = (HELMERT.rx / 3600) * RADIANS;
  const ry = (HELMERT.ry / 3600) * RADIANS;
  const rz = (HELMERT.rz / 3600) * RADIANS;
  const x2 = HELMERT.tx + s * x1 - rz * y1 + ry * z1;
  const y2 = HELMERT.ty + rz * x1 + s * y1 - rx * z1;
  const z2 = HELMERT.tz - ry * x1 + rx * y1 + s * z1;

  const e2 = 1 - (WGS84.b * WGS84.b) / (WGS84.a * WGS84.a);
  const p = Math.hypot(x2, y2);
  let wgsLat = Math.atan2(z2, p * (1 - e2));
  for (let i = 0; i < 10; i++) {
    const v = WGS84.a / Math.sqrt(1 - e2 * Math.sin(wgsLat) ** 2);
    const next = Math.atan2(z2 + e2 * v * Math.sin(wgsLat), p);
    if (Math.abs(next - wgsLat) < 1e-12) break;
    wgsLat = next;
  }
  return [Math.atan2(y2, x2) / RADIANS, wgsLat / RADIANS];
}
