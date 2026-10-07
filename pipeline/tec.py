"""Read the NESO Transmission Entry Capacity (TEC) register.

The register (NESO Open Data Licence) lists transmission connection agreements: connection site,
capacity, contracted date, project status and Gate. It has no coordinates or REPD IDs.

Projects with staged capacity have one row per tranche, and tranches can differ in status and
Gate (a built wind farm with a scoping extension, for example), so each row is kept as a tranche
under its project rather than collapsed.
"""

import json
import re
import urllib.request
from datetime import datetime
from pathlib import Path

import pandas as pd

from pipeline.stages import UnmappedValueError

DATASET_API = (
    "https://api.neso.energy/api/3/action/package_show?id=cbd45e54-e6e2-4a38-99f1-8de6fd96d7c1"
)
SOURCE_PAGE = "https://www.neso.energy/data-portal/transmission-entry-capacity-tec-register"

COLUMNS = [
    "Project Name",
    "Customer Name",
    "Connection Site",
    "Stage",
    "MW Connected",
    "MW Increase / Decrease",
    "Cumulative Total Capacity (MW)",
    "MW Effective From",
    "Project Status",
    "Agreement Type",
    "HOST TO",
    "Plant Type",
    "Project ID",
    "Project Number",
    "Gate",
]

STATUSES = {
    "Scoping",
    "Awaiting Consents",
    "Consents Approved",
    "Under Construction/Commissioning",
    "Built",
}
GATES = {"", "1", "2"}

# "Plant Type" parts -> technology tag. A row can list several parts, separated by ";".
PLANT_TECHNOLOGY = {
    "Wind Onshore": "wind_onshore",
    "Wind Offshore": "wind_offshore",
    "PV Array (Photo Voltaic/solar)": "solar",
    "Hydro": "hydro",
    "Tidal": "tidal",
    "Energy Storage System": "storage",
    "Pump Storage": "pumped_storage",
    "LAES (Liquid Air Energy Storage)": "liquid_air",
    "Hydrogen": "hydrogen",
}
# Parts that say nothing about generation; ignored.
PLANT_IGNORED = {"Demand", "Reactive Compensation", "Substation"}
# Parts that put the whole project out of scope: a gas plant with a battery is still a gas plant.
# Interconnectors come from the Interconnector Register instead.
PLANT_EXCLUDED = {
    "CCGT (Combined Cycle Gas Turbine)",
    "OCGT (Open Cycle Gas Turbine)",
    "CHP (Combined Heat and Power)",
    "Gas Reciprocating",
    "Oil & AGT (Advanced Gas Turbine)",
    "Nuclear",
    "Biomass",
    "Thermal",
    "Waste",
    "Interconnector",
}

# Why a project is left out.
EXCLUDED_TECHNOLOGY = "excluded_technology"
NO_TECHNOLOGY = "no_technology"


def latest_register_url() -> str:
    with urllib.request.urlopen(DATASET_API, timeout=60) as response:
        package = json.load(response)
    csvs = [r for r in package["result"]["resources"] if r.get("format", "").lower() == "csv"]
    if not csvs:
        raise RuntimeError("No CSV resource on the NESO TEC register dataset")
    return csvs[0]["url"]


def load(path: Path) -> pd.DataFrame:
    """Read the register as strings with whitespace normalised. The first header carries a BOM."""
    df = pd.read_csv(path, encoding="utf-8-sig", dtype=str, keep_default_na=False)
    df.columns = [_clean_text(c) for c in df.columns]
    missing = [c for c in COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"TEC register is missing columns: {missing}")
    for column in df.columns:
        df[column] = df[column].map(_clean_text)
    return df


def build_projects(df: pd.DataFrame) -> tuple[list[dict], dict[str, int]]:
    """One dict per in-scope project with its tranches, sorted by Project ID.

    Also returns the number of projects left out for each reason.
    """
    projects: dict[str, dict] = {}
    for row in df.to_dict("records"):
        project_id = row["Project ID"]
        if not project_id:
            raise ValueError(f"TEC register row with no Project ID: {row['Project Name']!r}")
        project = projects.setdefault(
            project_id,
            {
                "id": project_id,
                "name": row["Project Name"],
                "customer": row["Customer Name"] or None,
                "connectionSite": row["Connection Site"] or None,
                "hostTo": row["HOST TO"] or None,
                "agreementType": row["Agreement Type"] or None,
                "plantTypes": [],
                "tranches": [],
            },
        )
        for part in _plant_parts(row["Plant Type"]):
            if part not in project["plantTypes"]:
                project["plantTypes"].append(part)
        project["tranches"].append(_tranche(row))

    kept, left_out = [], {EXCLUDED_TECHNOLOGY: 0, NO_TECHNOLOGY: 0}
    for project in projects.values():
        parts = project.pop("plantTypes")
        if any(p in PLANT_EXCLUDED for p in parts):
            left_out[EXCLUDED_TECHNOLOGY] += 1
            continue
        technologies = sorted({PLANT_TECHNOLOGY[p] for p in parts if p in PLANT_TECHNOLOGY})
        if not technologies:
            left_out[NO_TECHNOLOGY] += 1
            continue
        project["technologies"] = technologies
        # Rows are in tranche order, so the last cumulative figure is the project total.
        project["capacityMw"] = project["tranches"][-1]["cumulativeMw"]
        kept.append(project)
    kept.sort(key=lambda p: p["id"])
    return kept, left_out


def _plant_parts(value: str) -> list[str]:
    parts = [p.strip() for p in value.split(";") if p.strip()]
    for part in parts:
        if part not in PLANT_TECHNOLOGY and part not in PLANT_IGNORED and part not in PLANT_EXCLUDED:
            raise UnmappedValueError(f"Unknown TEC plant type: {part!r}")
    return parts


def _tranche(row: dict) -> dict:
    status = row["Project Status"]
    if status not in STATUSES:
        raise UnmappedValueError(f"Unknown TEC project status: {status!r}")
    gate = re.sub(r"\.0$", "", row["Gate"])
    if gate not in GATES:
        raise UnmappedValueError(f"Unknown TEC Gate: {row['Gate']!r}")
    return {
        "projectNumber": row["Project Number"] or None,
        "stage": int(row["Stage"]) if row["Stage"] else None,
        "status": status,
        "gate": gate or None,
        "connectedMw": _number(row["MW Connected"]),
        "changeMw": _number(row["MW Increase / Decrease"]),
        "cumulativeMw": _number(row["Cumulative Total Capacity (MW)"]),
        "effectiveFrom": _iso_date(row["MW Effective From"]),
    }


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _number(value: str) -> float | None:
    if not value:
        return None
    number = float(value.replace(",", ""))
    return int(number) if number.is_integer() else number


def _iso_date(value: str) -> str | None:
    """Dates are dd/mm/yyyy. Any other format stops the pipeline, as for REPD."""
    if not value:
        return None
    return datetime.strptime(value, "%d/%m/%Y").date().isoformat()
