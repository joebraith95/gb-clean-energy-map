"""Download, clean and map the Renewable Energy Planning Database (REPD)."""

import json
import re
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

import pandas as pd

from pipeline.stages import (
    OFF_TRACK,
    STAGE_DATE_COLUMNS,
    Stage,
    headline_stage,
    technology_layer,
)

PUBLICATION_API = (
    "https://www.gov.uk/api/content/government/publications/"
    "renewable-energy-planning-database-quarterly-extract"
)
SOURCE_PAGE = "https://www.gov.uk/government/publications/renewable-energy-planning-database-quarterly-extract"

# Map extent in British National Grid metres. Keep in step with src/map/levels.ts.
EXTENT = {"min_x": 0, "min_y": 0, "max_x": 760_000, "max_y": 1_230_000}

# Why a kept record is not drawn on the map. Order matters: the first that applies is recorded.
HIDDEN_OFF_TRACK = "off_track"
HIDDEN_NO_STAGE = "no_stage"
HIDDEN_NO_LOCATION = "no_location"
HIDDEN_OUTSIDE_EXTENT = "outside_extent"
HIDDEN_NO_CAPACITY = "no_capacity"


@dataclass
class Release:
    title: str
    url: str
    updated: str


def latest_release() -> Release:
    """Find the current REPD CSV from the GOV.UK content API."""
    with urllib.request.urlopen(PUBLICATION_API, timeout=60) as response:
        page = json.load(response)
    for attachment in page["details"]["attachments"]:
        if attachment.get("content_type") == "text/csv" and "REPD" in attachment.get("title", ""):
            return Release(attachment["title"], attachment["url"], page["public_updated_at"][:10])
    raise RuntimeError("No REPD CSV attachment found on the GOV.UK publication page")


def download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(url, dest)
    return dest


def load(path: Path) -> pd.DataFrame:
    """Read the raw CSV as strings with whitespace normalised in headers and values."""
    # Windows-1252: the file contains curly apostrophes (0x92) and en dashes (0x96).
    df = pd.read_csv(path, encoding="cp1252", dtype=str, keep_default_na=False)
    df.columns = [_clean_text(c) for c in df.columns]
    for column in df.columns:
        df[column] = df[column].map(_clean_text)
    return df


def build_records(df: pd.DataFrame) -> list[dict]:
    """Apply the spec's scope and stage rules. Returns one dict per kept record, sorted by ID."""
    records = []
    for row in df.to_dict("records"):
        if row["Country"] not in {"England", "Scotland", "Wales"}:
            continue  # Great Britain only; Northern Ireland uses Irish Grid and is out of scope.
        layer = technology_layer(row["Technology Type"])
        if layer is None:
            continue
        stage_dates = {column: _parse_date(row[column]) for column in STAGE_DATE_COLUMNS}
        stage = headline_stage(row["Development Status (short)"], stage_dates)
        if stage is None and row["Development Status (short)"] == "Revised":
            continue  # Superseded record.

        x, y = _parse_number(row["X-coordinate"]), _parse_number(row["Y-coordinate"])
        mw = _parse_number(row["Installed Capacity (MWelec)"])
        records.append(
            {
                "id": int(row["Ref ID"]),
                "name": row["Site Name"],
                "technology": row["Technology Type"],
                "layer": layer,
                "stage": stage.value if stage else None,
                "hidden": _hidden_reason(stage, x, y, mw),
                "x": round(x) if x is not None else None,
                "y": round(y) if y is not None else None,
                "mw": mw,
                "details": _details(row, stage_dates),
            }
        )
    records.sort(key=lambda r: r["id"])
    return records


def _hidden_reason(stage: Stage | None, x: float | None, y: float | None, mw: float | None) -> str | None:
    if stage in OFF_TRACK:
        return HIDDEN_OFF_TRACK
    if stage is None:
        return HIDDEN_NO_STAGE
    if x is None or y is None:
        return HIDDEN_NO_LOCATION
    if not (EXTENT["min_x"] <= x < EXTENT["max_x"] and EXTENT["min_y"] <= y < EXTENT["max_y"]):
        return HIDDEN_OUTSIDE_EXTENT
    if mw is None:
        return HIDDEN_NO_CAPACITY
    return None


def _details(row: dict, stage_dates: dict[str, date | None]) -> dict:
    """Fields for the project card. Missing values stay None and show as "Not published"."""
    granted = [
        stage_dates["Planning Permission Granted"],
        stage_dates["Appeal Granted"],
        stage_dates["Secretary of State - Granted"],
    ]
    granted = [d for d in granted if d]
    technology = row["Technology Type"]
    return {
        "operator": row["Operator (or Applicant)"] or None,
        "storageType": row["Storage Type"] or None,
        "repdStatus": row["Development Status (short)"],
        "address": row["Address"] or None,
        "county": row["County"] or None,
        "region": row["Region"] or None,
        "country": row["Country"],
        "postcode": row["Post Code"] or None,
        "planningAuthority": row["Planning Authority"] or None,
        "planningRef": row["Planning Application Reference"] or None,
        "appealRef": row["Appeal Reference"] or None,
        "offshore": {"Wind Offshore": True, "Wind Onshore": False}.get(technology),
        "turbines": _parse_number(row["No. of Turbines"]),
        "dates": {
            "submitted": _iso(stage_dates["Planning Application Submitted"]),
            # The final grant, whether by the planning authority, on appeal or by the Secretary of State.
            "consented": _iso(max(granted)) if granted else None,
            "constructionStart": _iso(stage_dates["Under Construction"]),
            "operational": _iso(stage_dates["Operational"]),
        },
        "recordUpdated": _iso(_parse_date(row["Record Last Updated (dd/mm/yyyy)"])),
    }


MISSING_MARKERS = {"NA", "N/A", "n/a"}


def _clean_text(value: str) -> str:
    """Normalise whitespace. Placeholder markers such as "NA" become blank (not published)."""
    value = re.sub(r"\s+", " ", value).strip()
    return "" if value in MISSING_MARKERS else value


def _parse_number(value: str) -> float | None:
    if not value:
        return None
    try:
        number = float(value.replace(",", ""))
    except ValueError:
        return None
    return int(number) if number.is_integer() else number


def _parse_date(value: str) -> date | None:
    if not value:
        return None
    return datetime.strptime(value, "%d/%m/%Y").date()


def _iso(value: date | None) -> str | None:
    return value.isoformat() if value else None
