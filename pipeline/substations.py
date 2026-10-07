"""Locate TEC register connection sites at OpenStreetMap substations. See "Locating connection
sites" in docs/SPEC.md.

The TEC register names each project's connection site but gives no coordinates. A site is located
only when its name, with voltages and words like "Substation" or "GSP" removed, exactly matches a
high-voltage OpenStreetMap substation (132kV or above, or tagged as transmission) in the right
transmission owner's area, and every such match lies within 5km of the others. Planned sites, such
as "Connection Node A" or anything marked not yet constructed, stay unlocated. Nothing is guessed.

The located sites live in pipeline/substations.json, which pipeline/substation_candidates.py
writes and which is checked by hand before it is committed. The weekly run only reads that file.
"""

import json
import math
import re
from collections import defaultdict
from pathlib import Path

from pyproj import Transformer

SITES_FILE = Path(__file__).resolve().parent / "substations.json"

HIGH_VOLTAGE = 132_000
MAX_SPREAD_M = 5_000

# Words that describe the kind of site rather than which site it is.
_NOISE = re.compile(
    r"\b(?:substation|sub|s/s|gsp|grid supply point|grid|supply|point|idno|tertiary|kv|"
    r"bulk supply|bsp|switching station|electricity|supergrid|gis|ais)\b"
)
# Sites that do not exist yet, so have no location to find.
PLANNED = re.compile(r"connection node|not yet constructed|proposed|\bfuture\b", re.IGNORECASE)

# Rough northing bounds (BNG metres) of each transmission owner's area, used only to rule out
# a same-named substation at the other end of the country. OFTO sites are offshore anywhere.
OWNER_NORTHING = {
    "NGET": (0, 680_000),  # England and Wales
    "SPT": (530_000, 770_000),  # southern Scotland
    "SHET": (590_000, 1_230_000),  # northern Scotland, Argyll and the islands
}

_to_bng = Transformer.from_crs(4326, 27700, always_xy=True)


def site_key(name: str) -> str:
    """Lower-case site name with voltages, bracketed notes and generic words removed."""
    s = re.sub(r"\([^)]*\)", " ", name.lower()).replace("&", " and ").replace("'", "")
    s = re.sub(r"\d+(?:/\d+)*\s*kv\b", " ", s)
    s = _NOISE.sub(" ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def high_voltage_substations(elements: list[dict]) -> list[dict]:
    """Named OSM substations at 132kV or above, or tagged as transmission, in BNG."""
    out = []
    for e in elements:
        tags = e.get("tags", {})
        if "name" not in tags:
            continue
        if _max_voltage(tags.get("voltage")) < HIGH_VOLTAGE and tags.get("substation") != "transmission":
            continue
        centre = e.get("center") or {"lat": e.get("lat"), "lon": e.get("lon")}
        if centre["lat"] is None:
            continue
        x, y = _to_bng.transform(centre["lon"], centre["lat"])
        out.append({"osm": f"{e['type']}/{e['id']}", "name": tags["name"], "x": round(x), "y": round(y)})
    return out


def index_by_name(substations: list[dict]) -> dict[str, list[dict]]:
    index: dict[str, list[dict]] = defaultdict(list)
    for s in substations:
        index[site_key(s["name"])].append(s)
    return dict(index)


def locate(site: str, host: str | None, index: dict[str, list[dict]]) -> tuple[dict | None, str]:
    """The OSM substation for a TEC connection site, or None and the reason it was not found."""
    if PLANNED.search(site):
        return None, "planned site"
    key = site_key(site)
    if not key:
        return None, "no name to match"
    low, high = OWNER_NORTHING.get(host or "", (0, math.inf))
    matches = [s for s in index.get(key, []) if low <= s["y"] <= high]
    if not matches:
        return None, "no substation of that name"
    spread = max(math.hypot(a["x"] - b["x"], a["y"] - b["y"]) for a in matches for b in matches)
    if spread > MAX_SPREAD_M:
        return None, "several substations of that name"
    # Several OSM features at one site (a 400kV and a 132kV compound, say): use the first by ID
    # so the choice is stable between runs.
    return min(matches, key=lambda s: s["osm"]), "name"


def _max_voltage(value: str | None) -> int:
    numbers = [float(v) for v in re.findall(r"\d+(?:\.\d+)?", value or "")]
    return int(max(numbers)) if numbers else 0


def load_sites(path: Path = SITES_FILE) -> dict[str, dict]:
    """Connection site name -> located substation, from the committed file."""
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))["sites"]
