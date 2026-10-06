"""Build the pixel land grid for each zoom level.

GB land comes from ONS country boundaries (Ordnance Survey based, already in British National Grid).
Other land (Ireland, France, Isle of Man, Channel Islands) comes from Natural Earth and is only scenery.

Run from the repo root:
  python -m pipeline.build_grid --fetch   # download both sources and save them in assets/grid
  python -m pipeline.build_grid           # rasterise the saved sources to data/grid.json
"""

import argparse
import json
import urllib.request
from pathlib import Path

import numpy as np
from pyproj import Transformer

from pipeline.repd import EXTENT

ROOT = Path(__file__).resolve().parent.parent
GB_SOURCE = ROOT / "assets" / "grid" / "ons-countries-gb.geojson"
OTHER_SOURCE = ROOT / "assets" / "grid" / "natural-earth-other-land.geojson"
GRID_FILE = ROOT / "data" / "grid.json"

# ONS Countries (December 2024) Boundaries UK BGC: generalised to 20m, clipped to mean high water.
# Open Government Licence v3.0; contains OS data. Requested in EPSG:27700.
ONS_COUNTRIES_URL = (
    "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/"
    "Countries_December_2024_Boundaries_UK_BGC/FeatureServer/0/query"
    "?where=1%3D1&outFields=CTRY24NM&outSR=27700&f=geojson"
)
# Natural Earth 1:10m admin 0 map units. Public domain.
NATURAL_EARTH_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
    "ne_10m_admin_0_map_units.geojson"
)
# Generous lon/lat box around the map extent, used to clip the global Natural Earth file.
CLIP_BOX = (-12.0, 48.0, 6.0, 62.0)

GB_UNITS = {"England", "Scotland", "Wales"}

SEA, GB_LAND, OTHER_LAND = 0, 1, 2

# Keep in step with ZOOM_LEVELS in src/map/levels.ts.
CELL_SIZES = [4000, 2000, 1000, 500]
# Each cell is sampled on a fine sub-grid; it is land if at least this share of samples is land.
SAMPLES_PER_KM = 4
LAND_SHARE = 0.4
# Rings smaller than this (square metres) cannot affect a 250m sample grid, so they are not stored.
MIN_RING_AREA = 10_000
# Vertices closer than this (metres) to the previous kept vertex are dropped, for the same reason.
MIN_VERTEX_SPACING = 50


def fetch_sources() -> None:
    GB_SOURCE.parent.mkdir(parents=True, exist_ok=True)

    print("Downloading ONS country boundaries")
    countries = _get_json(ONS_COUNTRIES_URL)
    gb = [
        {
            "type": "Feature",
            "properties": {"name": f["properties"]["CTRY24NM"]},
            # 10m precision is ample when sampling every 250m.
            "geometry": {"type": "MultiPolygon", "coordinates": _round(_drop_tiny(_polygons(f["geometry"])), -1)},
        }
        for f in countries["features"]
        if f["properties"]["CTRY24NM"] in GB_UNITS
    ]
    _save(GB_SOURCE, gb, "ONS Countries (December 2024) Boundaries UK BGC, EPSG:27700, OGL v3.0", ONS_COUNTRIES_URL)

    print("Downloading Natural Earth map units")
    world = _get_json(NATURAL_EARTH_URL)
    other = []
    for f in world["features"]:
        if f["properties"]["NAME"] in GB_UNITS:
            continue
        kept = [p for p in _polygons(f["geometry"]) if _ring_touches_box(p[0], CLIP_BOX)]
        if kept:
            other.append(
                {
                    "type": "Feature",
                    "properties": {"name": f["properties"]["NAME"]},
                    "geometry": {"type": "MultiPolygon", "coordinates": _round(kept, 4)},
                }
            )
    _save(OTHER_SOURCE, other, "Natural Earth 1:10m admin 0 map units, non-GB, lon/lat, public domain", NATURAL_EARTH_URL)


def build() -> dict:
    """Rasterise the saved sources into one land grid per zoom level."""
    to_bng = Transformer.from_crs(4326, 27700, always_xy=True)
    edges = {GB_LAND: [], OTHER_LAND: []}
    for ring in _rings(GB_SOURCE):
        edges[GB_LAND].append(np.array(ring, dtype=float))
    for ring in _rings(OTHER_SOURCE):
        lon, lat = np.array(ring, dtype=float).T
        x, y = to_bng.transform(lon, lat)
        edges[OTHER_LAND].append(np.column_stack([x, y]))

    fine_metres = 1000 / SAMPLES_PER_KM
    fine = np.zeros(_shape(fine_metres), dtype=np.uint8)
    # Other land first, so GB wins anywhere the two overlap.
    for value in (OTHER_LAND, GB_LAND):
        fine[_rasterise(edges[value], fine_metres)] = value

    levels = []
    for cell in CELL_SIZES:
        grid = _downsample(fine, int(cell / fine_metres))
        rows, cols = grid.shape
        levels.append({"cellMetres": cell, "cols": cols, "rows": rows, "runs": _run_length(grid)})

    return {
        "extent": EXTENT,
        "values": {"sea": SEA, "gbLand": GB_LAND, "otherLand": OTHER_LAND},
        # Rows run from the northern edge down; runs alternate value, count across the whole grid.
        "levels": levels,
    }


def _drop_tiny(polygons: list) -> list:
    kept = []
    for polygon in polygons:
        if _ring_area(polygon[0]) < MIN_RING_AREA:
            continue
        rings = [polygon[0]] + [hole for hole in polygon[1:] if _ring_area(hole) >= MIN_RING_AREA]
        kept.append([_thin(ring) for ring in rings])
    return kept


def _thin(ring: list) -> list:
    kept = [ring[0]]
    for point in ring[1:-1]:
        if abs(point[0] - kept[-1][0]) + abs(point[1] - kept[-1][1]) >= MIN_VERTEX_SPACING:
            kept.append(point)
    kept.append(ring[-1])
    return kept


def _ring_area(ring: list) -> float:
    x, y = np.array(ring, dtype=float).T
    return abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1))) / 2


def _rings(path: Path):
    for feature in json.loads(path.read_text(encoding="utf-8"))["features"]:
        for polygon in feature["geometry"]["coordinates"]:
            yield from polygon


def _get_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=180) as response:
        return json.load(response)


def _save(path: Path, features: list, description: str, url: str) -> None:
    collection = {"type": "FeatureCollection", "source": description, "url": url, "features": features}
    path.write_text(json.dumps(collection, separators=(",", ":")), encoding="utf-8")
    print(f"Saved {len(features)} features to {path.relative_to(ROOT)}")


def _rasterise(rings: list[np.ndarray], cell: float) -> np.ndarray:
    """Even-odd scanline fill of all rings, sampling at cell centres. Row 0 is the northern edge."""
    rows, cols = _shape(cell)
    mask = np.zeros((rows, cols), dtype=bool)
    starts = np.concatenate([ring[:-1] for ring in rings])
    ends = np.concatenate([ring[1:] for ring in rings])
    x0, y0, x1, y1 = starts[:, 0], starts[:, 1], ends[:, 0], ends[:, 1]
    centres_x = EXTENT["min_x"] + (np.arange(cols) + 0.5) * cell
    for row in range(rows):
        y = EXTENT["max_y"] - (row + 0.5) * cell
        crossing = (y0 <= y) != (y1 <= y)
        if not crossing.any():
            continue
        xs = x0[crossing] + (y - y0[crossing]) * (x1[crossing] - x0[crossing]) / (y1[crossing] - y0[crossing])
        xs.sort()
        inside = np.searchsorted(xs, centres_x) % 2 == 1
        mask[row] = inside
    return mask


def _downsample(fine: np.ndarray, factor: int) -> np.ndarray:
    """Each coarse cell takes the most common land value if land covers at least LAND_SHARE of it."""
    rows, cols = -(-fine.shape[0] // factor), -(-fine.shape[1] // factor)
    # Pad partial cells at the southern and eastern edges with sea, matching gridSize() in levels.ts.
    padded = np.zeros((rows * factor, cols * factor), dtype=fine.dtype)
    padded[: fine.shape[0], : fine.shape[1]] = fine
    blocks = padded.reshape(rows, factor, cols, factor)
    gb = (blocks == GB_LAND).mean(axis=(1, 3))
    other = (blocks == OTHER_LAND).mean(axis=(1, 3))
    grid = np.full((rows, cols), SEA, dtype=np.uint8)
    land = gb + other >= LAND_SHARE
    grid[land & (gb >= other)] = GB_LAND
    grid[land & (gb < other)] = OTHER_LAND
    return grid


def _run_length(grid: np.ndarray) -> list[int]:
    flat = grid.ravel()
    change = np.flatnonzero(np.diff(flat)) + 1
    starts = np.concatenate([[0], change])
    counts = np.diff(np.concatenate([starts, [flat.size]]))
    runs = np.empty(starts.size * 2, dtype=np.int64)
    runs[0::2] = flat[starts]
    runs[1::2] = counts
    return runs.tolist()


def _shape(cell: float) -> tuple[int, int]:
    cols = int(np.ceil((EXTENT["max_x"] - EXTENT["min_x"]) / cell))
    rows = int(np.ceil((EXTENT["max_y"] - EXTENT["min_y"]) / cell))
    return rows, cols


def _polygons(geometry: dict) -> list:
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiPolygon":
        return geometry["coordinates"]
    return []


def _ring_touches_box(ring: list, box: tuple[float, float, float, float]) -> bool:
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    return min(lons) <= box[2] and max(lons) >= box[0] and min(lats) <= box[3] and max(lats) >= box[1]


def _round(value, digits: int):
    if isinstance(value, (int, float)):
        rounded = round(value, digits)
        return int(rounded) if digits <= 0 else rounded
    return [_round(v, digits) for v in value]


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the pixel land grid.")
    parser.add_argument("--fetch", action="store_true", help="download and save the coastline sources first")
    args = parser.parse_args()
    if args.fetch or not (GB_SOURCE.exists() and OTHER_SOURCE.exists()):
        fetch_sources()
    grid = build()
    GRID_FILE.write_text(json.dumps(grid, separators=(",", ":")), encoding="utf-8")
    for level in grid["levels"]:
        print(f"{level['cellMetres']}m: {level['cols']} x {level['rows']} cells, {len(level['runs']) // 2} runs")
    print(f"Wrote {GRID_FILE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
