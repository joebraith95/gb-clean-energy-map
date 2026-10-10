"""Build the region lines drawn over the satellite map.

Two sets of lines: the nations and English regions (ONS International Territorial Level 1) and the
14 electricity distribution (DNO) licence areas (NESO). Only the borders between neighbouring areas
are kept, because the coast is already visible in the imagery. Each area also gets a label point.

Both sources are in British National Grid. The output is longitude and latitude, as the map needs.

Run from the repo root:
  python -m pipeline.build_boundaries --fetch   # download both sources into assets/boundaries
  python -m pipeline.build_boundaries           # write data/boundaries.json from the saved sources
"""

import argparse
import json
import math
import urllib.request
from collections import defaultdict
from pathlib import Path

from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent
REGION_SOURCE = ROOT / "assets" / "boundaries" / "ons-itl1.geojson"
DNO_SOURCE = ROOT / "assets" / "boundaries" / "neso-dno-licence-areas.geojson"
OUTPUT = ROOT / "data" / "boundaries.json"

# ONS International Territorial Level 1 (January 2025) Boundaries UK BUC: generalised to 500m.
# Open Government Licence v3.0; contains OS data. Requested in EPSG:27700.
ONS_ITL1_URL = (
    "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/"
    "ITL1_JAN_2025_UK_BUC/FeatureServer/0/query"
    "?where=1%3D1&outFields=ITL125CD,ITL125NM&outSR=27700&f=geojson"
)
# NESO GIS Boundaries for GB DNO Licence Areas, 3 May 2024. NESO Open Data Licence. EPSG:27700.
NESO_DNO_URL = (
    "https://api.neso.energy/dataset/0e377f16-95e9-4c15-a1fc-49e06a39cfa0/resource/"
    "1c6a7dc0-1b6c-443a-bc67-5f7125649434/download/gb-dno-license-areas-20240503-as-geojson.geojson"
)

# The map covers Great Britain only.
NOT_GB = {"Northern Ireland"}
# Vertices closer than this (metres) to the straight line between their neighbours are dropped.
SIMPLIFY_METRES = 150
# Decimal places of longitude and latitude kept (about a metre).
PRECISION = 5

Point = tuple[int, int]


def fetch_sources() -> None:
    REGION_SOURCE.parent.mkdir(parents=True, exist_ok=True)

    print("Downloading ONS ITL1 boundaries")
    regions = [
        _feature(_region_name(f["properties"]["ITL125NM"]), f["geometry"])
        for f in _get_json(ONS_ITL1_URL)["features"]
    ]
    _save(
        REGION_SOURCE,
        regions,
        "ONS International Territorial Level 1 (January 2025) Boundaries UK BUC, EPSG:27700, OGL v3.0",
        ONS_ITL1_URL,
    )

    print("Downloading NESO DNO licence areas")
    areas = [
        _feature(f["properties"]["Area"], f["geometry"], operator=f["properties"]["DNO_Full"])
        for f in _get_json(NESO_DNO_URL)["features"]
    ]
    _save(
        DNO_SOURCE,
        areas,
        "NESO GIS Boundaries for GB DNO Licence Areas (3 May 2024), EPSG:27700, NESO Open Data Licence",
        NESO_DNO_URL,
    )


def build() -> dict:
    """Shared borders and label points for both sets of areas, as one GeoJSON collection."""
    to_lonlat = Transformer.from_crs(27700, 4326, always_xy=True)

    def lonlat(point: tuple[float, float]) -> list[float]:
        lon, lat = to_lonlat.transform(*point)
        return [round(lon, PRECISION), round(lat, PRECISION)]

    features = []
    for kind, path in (("region", REGION_SOURCE), ("dno", DNO_SOURCE)):
        areas = [
            f
            for f in json.loads(path.read_text(encoding="utf-8"))["features"]
            if f["properties"]["name"] not in NOT_GB
        ]
        lines = shared_borders([f["geometry"]["coordinates"] for f in areas])
        features.append(
            {
                "type": "Feature",
                "properties": {"kind": kind},
                "geometry": {
                    "type": "MultiLineString",
                    "coordinates": [[lonlat(p) for p in simplify(line, SIMPLIFY_METRES)] for line in lines],
                },
            }
        )
        for area in areas:
            features.append(
                {
                    "type": "Feature",
                    "properties": {"kind": kind, **area["properties"]},
                    "geometry": {"type": "Point", "coordinates": lonlat(label_point(area["geometry"]["coordinates"]))},
                }
            )
    return {"type": "FeatureCollection", "features": features}


def shared_borders(areas: list[list]) -> list[list[Point]]:
    """Lines along every edge that two different areas share, joined end to end.

    `areas` holds one multipolygon per area. Neighbours in both sources use identical vertices
    along their common border, so an edge is shared when it appears in more than one area.
    """
    owners: dict[tuple[Point, Point], set[int]] = defaultdict(set)
    for index, polygons in enumerate(areas):
        for polygon in polygons:
            for ring in polygon:
                points = [(round(x), round(y)) for x, y in ring]
                for a, b in zip(points, points[1:]):
                    if a != b:
                        owners[(min(a, b), max(a, b))].add(index)
    return join_edges([edge for edge, areas_using in owners.items() if len(areas_using) > 1])


def join_edges(edges: list[tuple[Point, Point]]) -> list[list[Point]]:
    """Chains edges into lines that run between junctions (points where other than two edges meet)."""
    neighbours: dict[Point, list[Point]] = defaultdict(list)
    for a, b in edges:
        neighbours[a].append(b)
        neighbours[b].append(a)
    unused = set(edges)

    def walk(start: Point, then: Point) -> list[Point]:
        line = [start, then]
        unused.discard((min(start, then), max(start, then)))
        while len(neighbours[line[-1]]) == 2:
            onward = next((p for p in neighbours[line[-1]] if p != line[-2]), None)
            if onward is None or (min(line[-1], onward), max(line[-1], onward)) not in unused:
                break
            unused.discard((min(line[-1], onward), max(line[-1], onward)))
            line.append(onward)
        return line

    lines = []
    # Lines that start at a junction or a loose end first, then any closed loops left over.
    for start in sorted(p for p, others in neighbours.items() if len(others) != 2):
        for then in sorted(neighbours[start]):
            if (min(start, then), max(start, then)) in unused:
                lines.append(walk(start, then))
    while unused:
        a, b = min(unused)
        lines.append(walk(a, b))
    return lines


def simplify(line: list[Point], tolerance: float) -> list[Point]:
    """Douglas-Peucker: drops vertices within `tolerance` of the line between the points kept."""
    keep = [False] * len(line)
    keep[0] = keep[-1] = True
    stack = [(0, len(line) - 1)]
    while stack:
        first, last = stack.pop()
        worst, worst_distance = -1, tolerance
        for i in range(first + 1, last):
            distance = _distance_to_segment(line[i], line[first], line[last])
            if distance > worst_distance:
                worst, worst_distance = i, distance
        if worst >= 0:
            keep[worst] = True
            stack.extend([(first, worst), (worst, last)])
    return [point for point, kept in zip(line, keep) if kept]


def label_point(polygons: list) -> tuple[float, float]:
    """Centroid of the area's largest polygon (its mainland), where the name is drawn."""
    ring = max((polygon[0] for polygon in polygons), key=lambda r: abs(_signed_area(r)))
    area = _signed_area(ring)
    cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
        cross = x0 * y1 - x1 * y0
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    return cx / (6 * area), cy / (6 * area)


def _signed_area(ring: list) -> float:
    return sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(ring, ring[1:])) / 2


def _distance_to_segment(p: Point, a: Point, b: Point) -> float:
    dx, dy = b[0] - a[0], b[1] - a[1]
    if dx == 0 and dy == 0:
        return math.dist(p, a)
    t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
    return math.dist(p, (a[0] + t * dx, a[1] + t * dy))


def _region_name(name: str) -> str:
    """ONS adds "(England)" to names that other countries also use; the map does not need it."""
    return name.replace(" (England)", "")


def _feature(name: str, geometry: dict, **properties: str) -> dict:
    polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    # Whole metres are ample, and keep shared vertices identical.
    rounded = [[[[round(x), round(y)] for x, y in ring] for ring in polygon] for polygon in polygons]
    return {
        "type": "Feature",
        "properties": {"name": name, **properties},
        "geometry": {"type": "MultiPolygon", "coordinates": rounded},
    }


def _get_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=180) as response:
        return json.load(response)


def _save(path: Path, features: list, description: str, url: str) -> None:
    collection = {"type": "FeatureCollection", "source": description, "url": url, "features": features}
    path.write_text(json.dumps(collection, separators=(",", ":")), encoding="utf-8")
    print(f"Saved {len(features)} features to {path.relative_to(ROOT)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the region lines for the map.")
    parser.add_argument("--fetch", action="store_true", help="download the boundary sources first")
    args = parser.parse_args()
    if args.fetch:
        fetch_sources()
    collection = build()
    OUTPUT.write_text(json.dumps(collection, separators=(",", ":")), encoding="utf-8")
    for feature in collection["features"]:
        if feature["geometry"]["type"] == "MultiLineString":
            lines = feature["geometry"]["coordinates"]
            print(f"{feature['properties']['kind']}: {len(lines)} lines, {sum(len(l) for l in lines)} points")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
