"""Headline stage and technology mapping for REPD records.

This module is the code form of the stage model in docs/SPEC.md. If source data does not fit,
it raises rather than guessing, so the spec can be updated first.
"""

from datetime import date
from enum import Enum


class Stage(str, Enum):
    EARLY_DEVELOPMENT = "early_development"
    IN_PLANNING = "in_planning"
    CONSENTED = "consented"
    UNDER_CONSTRUCTION = "under_construction"
    OPERATIONAL = "operational"
    STALLED = "stalled"
    DECOMMISSIONED = "decommissioned"


# Stages that are kept in the data but hidden on the map.
OFF_TRACK = {Stage.STALLED, Stage.DECOMMISSIONED}

# "Development Status (short)" -> headline stage. None means the record is superseded and excluded.
STATUS_TO_STAGE: dict[str, Stage | None] = {
    "Application Submitted": Stage.IN_PLANNING,
    "Appeal Lodged": Stage.IN_PLANNING,
    "Awaiting Construction": Stage.CONSENTED,
    "Under Construction": Stage.UNDER_CONSTRUCTION,
    "Operational": Stage.OPERATIONAL,
    "Application Refused": Stage.STALLED,
    "Application Withdrawn": Stage.STALLED,
    "Appeal Refused": Stage.STALLED,
    "Appeal Withdrawn": Stage.STALLED,
    "Planning Permission Expired": Stage.STALLED,
    "Abandoned": Stage.STALLED,
    "Decommissioned": Stage.DECOMMISSIONED,
    "Revised": None,
}

NO_APPLICATION_REQUIRED = "No Application Required"

# REPD stage date columns -> the stage each one evidences. Used for "No Application Required".
STAGE_DATE_COLUMNS: dict[str, Stage] = {
    "Planning Application Submitted": Stage.IN_PLANNING,
    "Appeal Lodged": Stage.IN_PLANNING,
    "Planning Permission Granted": Stage.CONSENTED,
    "Appeal Granted": Stage.CONSENTED,
    "Secretary of State - Granted": Stage.CONSENTED,
    "Under Construction": Stage.UNDER_CONSTRUCTION,
    "Operational": Stage.OPERATIONAL,
}

GENERATION = "generation"
FLEXIBILITY = "flexibility"

# "Technology Type" -> layer. None means excluded from the map.
TECHNOLOGY_LAYER: dict[str, str | None] = {
    "Wind Onshore": GENERATION,
    "Wind Offshore": GENERATION,
    "Solar Photovoltaics": GENERATION,
    "Small Hydro": GENERATION,
    "Large Hydro": GENERATION,
    "Tidal Stream": GENERATION,
    "Tidal Lagoon": GENERATION,
    "Shoreline Wave": GENERATION,
    "Battery": FLEXIBILITY,
    "Pumped Storage Hydroelectricity": FLEXIBILITY,
    "Liquid Air Energy Storage": FLEXIBILITY,
    "Compressed Air Energy Storage": FLEXIBILITY,
    "Flywheels": FLEXIBILITY,
    "Hydrogen": FLEXIBILITY,
    "Biomass (dedicated)": None,
    "Biomass (co-firing)": None,
    "EfW Incineration": None,
    "Landfill Gas": None,
    "Anaerobic Digestion": None,
    "Sewage Sludge Digestion": None,
    "Advanced Conversion Technologies": None,
    "Geothermal": None,
    "Hot Dry Rocks (HDR)": None,
    "Fuel Cell (Hydrogen)": None,
    "Air Source Heat Pumps": None,
    "Unknown": None,
}


class UnmappedValueError(ValueError):
    """A source value the spec does not cover. Update docs/SPEC.md before mapping it."""


def headline_stage(status: str, stage_dates: dict[str, date | None]) -> Stage | None:
    """Headline stage for a REPD record, or None if it is excluded or has no evidence of a stage.

    `stage_dates` maps REPD date column names to parsed dates (None or missing if blank).
    """
    status = status.strip()
    if status == NO_APPLICATION_REQUIRED:
        return _latest_dated_stage(stage_dates)
    if status not in STATUS_TO_STAGE:
        raise UnmappedValueError(f"Unknown REPD status: {status!r}")
    return STATUS_TO_STAGE[status]


def technology_layer(technology: str) -> str | None:
    """Return "generation", "flexibility", or None if the technology is excluded."""
    technology = technology.strip()
    if technology not in TECHNOLOGY_LAYER:
        raise UnmappedValueError(f"Unknown REPD technology: {technology!r}")
    return TECHNOLOGY_LAYER[technology]


def _latest_dated_stage(stage_dates: dict[str, date | None]) -> Stage | None:
    dated = [
        (d, STAGE_DATE_COLUMNS[col])
        for col, d in stage_dates.items()
        if d and col in STAGE_DATE_COLUMNS
    ]
    if not dated:
        return None
    # Latest date wins; on a tie, the further-along stage wins.
    order = list(Stage)
    return max(dated, key=lambda item: (item[0], order.index(item[1])))[1]
