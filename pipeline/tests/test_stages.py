from datetime import date

import pytest

from pipeline.stages import (
    FLEXIBILITY,
    GENERATION,
    NO_APPLICATION_REQUIRED,
    STATUS_TO_STAGE,
    Stage,
    UnmappedValueError,
    headline_stage,
    technology_layer,
)

# Every "Development Status (short)" value in the July 2026 REPD release.
JULY_2026_STATUSES = {
    "Application Submitted", "Appeal Lodged", "Awaiting Construction", "Under Construction",
    "Operational", "Application Refused", "Application Withdrawn", "Appeal Refused",
    "Appeal Withdrawn", "Planning Permission Expired", "Abandoned", "Decommissioned",
    "No Application Required", "Revised",
}


@pytest.mark.parametrize(
    "status, expected",
    [
        ("Application Submitted", Stage.IN_PLANNING),
        ("Appeal Lodged", Stage.IN_PLANNING),
        ("Awaiting Construction", Stage.CONSENTED),
        ("Under Construction", Stage.UNDER_CONSTRUCTION),
        ("Operational", Stage.OPERATIONAL),
        ("Application Refused", Stage.STALLED),
        ("Application Withdrawn", Stage.STALLED),
        ("Appeal Refused", Stage.STALLED),
        ("Appeal Withdrawn", Stage.STALLED),
        ("Planning Permission Expired", Stage.STALLED),
        ("Abandoned", Stage.STALLED),
        ("Decommissioned", Stage.DECOMMISSIONED),
        ("Revised", None),
    ],
)
def test_status_mapping_matches_spec(status, expected):
    assert headline_stage(status, {}) == expected


def test_all_july_2026_statuses_are_covered():
    assert set(STATUS_TO_STAGE) | {NO_APPLICATION_REQUIRED} == JULY_2026_STATUSES


def test_whitespace_is_ignored():
    assert headline_stage("  Operational ", {}) == Stage.OPERATIONAL


def test_unknown_status_raises():
    with pytest.raises(UnmappedValueError):
        headline_stage("Pending Review", {})


def test_no_application_required_uses_latest_date():
    dates = {"Planning Permission Granted": date(2020, 1, 1), "Under Construction": date(2022, 6, 1)}
    assert headline_stage(NO_APPLICATION_REQUIRED, dates) == Stage.UNDER_CONSTRUCTION


def test_no_application_required_without_dates_is_hidden():
    assert headline_stage(NO_APPLICATION_REQUIRED, {"Operational": None}) is None


def test_no_application_required_tie_prefers_later_stage():
    same_day = date(2021, 3, 3)
    dates = {"Under Construction": same_day, "Operational": same_day}
    assert headline_stage(NO_APPLICATION_REQUIRED, dates) == Stage.OPERATIONAL


@pytest.mark.parametrize(
    "technology, expected",
    [
        ("Wind Offshore", GENERATION),
        ("Solar Photovoltaics", GENERATION),
        ("Battery", FLEXIBILITY),
        ("Hydrogen", FLEXIBILITY),
        ("Biomass (dedicated)", None),
        ("Geothermal", None),
    ],
)
def test_technology_layer(technology, expected):
    assert technology_layer(technology) == expected


def test_unknown_technology_raises():
    with pytest.raises(UnmappedValueError):
        technology_layer("Fusion")
