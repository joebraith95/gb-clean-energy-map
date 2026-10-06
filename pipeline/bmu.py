"""Validate the hand-checked BM unit mapping and publish it for the site and the live API."""

import json
from pathlib import Path

MAP_FILE = Path(__file__).resolve().parent / "bmu_map.json"


def load(path: Path = MAP_FILE) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def validate(mapping: dict, records: list[dict]) -> list[dict]:
    """Return the farms if every entry is sound; raise ValueError otherwise."""
    known = {r["id"] for r in records}
    seen_units: set[str] = set()
    seen_ids: set[int] = set()
    for farm in mapping["farms"]:
        if not farm["repdIds"] or not farm["units"]:
            raise ValueError(f"Empty entry in the BM unit map: {farm}")
        for repd_id in farm["repdIds"]:
            if repd_id not in known:
                raise ValueError(
                    f"REPD {repd_id} is in pipeline/bmu_map.json but not in the current REPD data. "
                    "Check whether REPD removed or renumbered it before editing the map."
                )
            if repd_id in seen_ids:
                raise ValueError(f"REPD {repd_id} appears twice in the BM unit map")
            seen_ids.add(repd_id)
        for unit in farm["units"]:
            if not unit.startswith(("T_", "E_")):
                raise ValueError(f"Not an Elexon BM unit ID: {unit}")
            if unit in seen_units:
                raise ValueError(f"BM unit {unit} appears twice in the BM unit map")
            seen_units.add(unit)
    return mapping["farms"]


def write(farms: list[dict], data_dir: Path) -> None:
    """data/bmu-map.json: the farms, without review metadata."""
    published = [{k: farm[k] for k in ("repdIds", "units", "note") if k in farm} for farm in farms]
    (data_dir / "bmu-map.json").write_text(
        json.dumps({"farms": published}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
