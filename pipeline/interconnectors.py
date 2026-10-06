"""Combine the hand-curated interconnector file with the NESO Interconnector Register.

The register (NESO Open Data Licence) gives contracted capacity, status, GB connection site,
contracted date and Gate. pipeline/interconnectors.json adds what it lacks: partner country,
landing points (OpenStreetMap, ODbL) and Ofgem cap and floor milestones.
"""

import json
import urllib.request
from pathlib import Path

import pandas as pd
from pyproj import Transformer

from pipeline.stages import Stage

CURATED_FILE = Path(__file__).resolve().parent / "interconnectors.json"
REGISTER_DATASET_API = (
    "https://api.neso.energy/api/3/action/package_show?id=a7cca714-9dbb-42b1-99c8-4bc7211605a8"
)
REGISTER_PAGE = "https://www.neso.energy/data-portal/interconnector-register"

# Ofgem cap and floor milestones -> headline stage (see "Interconnectors" in docs/SPEC.md).
MILESTONE_STAGE = {
    "ipa": Stage.IN_PLANNING,
    "fpa": Stage.CONSENTED,
    "construction": Stage.UNDER_CONSTRUCTION,
    "commissioned": Stage.OPERATIONAL,
}
# Register project status -> headline stage, where the register is decisive.
REGISTER_STAGE = {
    "Built": Stage.OPERATIONAL,
    "Under Construction/Commissioning": Stage.UNDER_CONSTRUCTION,
}

_to_bng = Transformer.from_crs(4326, 27700, always_xy=True)


def latest_register_url() -> str:
    with urllib.request.urlopen(REGISTER_DATASET_API, timeout=60) as response:
        package = json.load(response)
    resources = package["result"]["resources"]
    csvs = [r for r in resources if r.get("format", "").lower() == "csv"]
    if not csvs:
        raise RuntimeError("No CSV resource on the NESO Interconnector Register dataset")
    return csvs[0]["url"]


def load_register(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, encoding="utf-8-sig", dtype=str, keep_default_na=False)
    df.columns = [c.strip() for c in df.columns]
    return df.apply(lambda column: column.str.strip())


def build(register: pd.DataFrame, curated: dict) -> list[dict]:
    """One record per curated interconnector, joined to its register rows."""
    records = []
    for entry in curated["interconnectors"]:
        rows = register[register["Project Name"] == entry["registerProject"]]
        if rows.empty:
            raise ValueError(
                f"{entry['name']}: no row named {entry['registerProject']!r} in the NESO register. "
                "Check whether the register renamed or removed it before changing the curated file."
            )
        # Staged projects (such as Moyle) have one row per stage; the last holds the totals.
        row = rows.iloc[-1]
        status = row["Project Status"]
        stage = _stage(status, entry["milestones"])
        gate = row["Gate"].split(".")[0] if row["Gate"] else None
        records.append(
            {
                "id": entry["id"],
                "name": entry["name"],
                "partner": entry["partner"],
                "stage": stage.value if stage else None,
                "registerStatus": status,
                "importMw": _number(row["MW Import - Total"]),
                "exportMw": _number(row["MW Export - Total"]),
                "connectionSite": row["Connection Site"] or None,
                "gate": gate,
                # Shown as "Contracted date", and only for Gate 2 projects (docs/SPEC.md).
                "contractedDate": _iso(row["MW Effective From"]) if gate == "2" else None,
                "commissioned": entry["commissioned"],
                "gbEnd": _end(entry["gbEnd"]),
                "partnerEnd": _end(entry["partnerEnd"]),
                "milestones": entry["milestones"],
                "sources": entry["sources"],
            }
        )
    return records


def _stage(status: str, milestones: list[dict]) -> Stage | None:
    candidates = [MILESTONE_STAGE[m["type"]] for m in milestones]
    if status in REGISTER_STAGE:
        candidates.append(REGISTER_STAGE[status])
    if not candidates:
        return None
    order = list(Stage)
    return max(candidates, key=order.index)


def _end(end: dict | None) -> dict | None:
    if end is None:
        return None
    x, y = _to_bng.transform(end["lon"], end["lat"])
    return {
        "name": end["name"],
        "kind": end.get("kind"),
        "osm": f"https://www.openstreetmap.org/{end['osm']}",
        "x": round(x),
        "y": round(y),
    }


def _number(value: str) -> float | None:
    if not value:
        return None
    number = float(value)
    return int(number) if number.is_integer() else number


def _iso(value: str) -> str | None:
    return value[:10] if value else None


def load_curated(path: Path = CURATED_FILE) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))
