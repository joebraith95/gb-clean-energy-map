"""Map records for TEC register projects that have no REPD record. See "TEC-only projects" in
docs/SPEC.md.

Each becomes one record, placed at its located connection substation:
- Stage from the furthest tranche's TEC status: Scoping is Early development, then In planning,
  Consented, Under construction and Operational, the same stages REPD uses.
- Technology: generation over storage for a hybrid project (one record, as REPD splits them).
  Storage the register does not describe is "Storage (type not published)" unless the name says
  it is a battery.
- Hidden, but kept, when the connection site is not located, when capacity is not published, or
  when a REPD record looks like the same project but was not matched: drawing both would show
  one project twice.
"""

import re

from pipeline import connection, tec_match
from pipeline.repd import HIDDEN_NO_CAPACITY
from pipeline.stages import FLEXIBILITY, GENERATION, Stage

ID_PREFIX = "tec-"

HIDDEN_SITE_NOT_LOCATED = "site_not_located"
HIDDEN_POSSIBLE_DUPLICATE = "possible_repd_duplicate"

STATUS_STAGE = {
    "Scoping": Stage.EARLY_DEVELOPMENT,
    "Awaiting Consents": Stage.IN_PLANNING,
    "Consents Approved": Stage.CONSENTED,
    "Under Construction/Commissioning": Stage.UNDER_CONSTRUCTION,
    "Built": Stage.OPERATIONAL,
}

UNSPECIFIED_STORAGE = "Storage (type not published)"

# Technology tag -> (technology name on the map, layer), in order of preference for a hybrid.
TECHNOLOGY = {
    "wind_offshore": ("Wind Offshore", GENERATION),
    "wind_onshore": ("Wind Onshore", GENERATION),
    "solar": ("Solar Photovoltaics", GENERATION),
    "hydro": ("Hydro", GENERATION),
    "tidal": ("Tidal", GENERATION),
    "pumped_storage": ("Pumped Storage Hydroelectricity", FLEXIBILITY),
    "liquid_air": ("Liquid Air Energy Storage", FLEXIBILITY),
    "hydrogen": ("Hydrogen", FLEXIBILITY),
    "storage": (UNSPECIFIED_STORAGE, FLEXIBILITY),
}
BATTERY_NAME = re.compile(r"\b(?:bess|battery|batteries)\b", re.IGNORECASE)

# A REPD candidate this close counts as a possible duplicate.
DUPLICATE_NAME = 0.6
DUPLICATE_CAPACITY = 0.5


def build(result: tec_match.Result, projects: list[dict], sites: dict[str, dict]) -> list[dict]:
    """One record per TEC project with no REPD record, sorted by ID."""
    by_id = {p["id"]: p for p in projects}
    records = []
    for m in result.matches:
        if m.repd_ids:
            continue
        project = by_id[m.tec_id]
        stage = max((STATUS_STAGE[t["status"]] for t in project["tranches"]), key=list(Stage).index)
        technology, layer = _technology(project)
        site = sites.get(project["connectionSite"] or "")
        mw = project["capacityMw"] if project["capacityMw"] and project["capacityMw"] > 0 else None
        records.append(
            {
                "id": ID_PREFIX + project["id"],
                "name": project["name"],
                "technology": technology,
                "layer": layer,
                "stage": stage.value,
                "hidden": _hidden(m, site, mw),
                "x": site["x"] if site else None,
                "y": site["y"] if site else None,
                "mw": mw,
                # Projects sharing a substation are spread around it when drawn.
                "site": project["connectionSite"] if site else None,
                "details": _details(project, site, stage),
            }
        )
    return sorted(records, key=lambda r: r["id"])


def _technology(project: dict) -> tuple[str, str]:
    tag = min(project["technologies"], key=list(TECHNOLOGY).index)
    name, layer = TECHNOLOGY[tag]
    if tag == "storage" and BATTERY_NAME.search(project["name"]):
        name = "Battery"
    return name, layer


def _hidden(match: tec_match.Match, site: dict | None, mw: float | None) -> str | None:
    if match.method != "override_none" and any(
        (c.name >= DUPLICATE_NAME or c.contained) and (c.capacity or 0) >= DUPLICATE_CAPACITY
        for c in match.candidates
    ):
        return HIDDEN_POSSIBLE_DUPLICATE
    if site is None:
        return HIDDEN_SITE_NOT_LOCATED
    if mw is None:
        return HIDDEN_NO_CAPACITY
    return None


def _details(project: dict, site: dict | None, stage: Stage) -> dict:
    return {
        "kind": "tec",
        "tecProjectId": project["id"],
        "customer": project["customer"],
        "connectionSite": project["connectionSite"],
        "hostTo": project["hostTo"],
        "agreementType": project["agreementType"],
        "technologies": project["technologies"],
        "substation": {"name": site["name"], "osm": site["osm"]} if site else None,
        "tranches": [
            {
                "stage": t["stage"],
                "status": t["status"],
                "gate": t["gate"],
                "changeMw": t["changeMw"],
                "cumulativeMw": t["cumulativeMw"],
                # Contracted dates are shown for Gate 2 only (docs/SPEC.md).
                "contractedDate": t["effectiveFrom"] if t["gate"] == "2" else None,
            }
            for t in project["tranches"]
        ],
        "connection": connection.badge_for([project], stage == Stage.OPERATIONAL),
    }
