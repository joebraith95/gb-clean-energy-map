import pandas as pd
import pytest

from pipeline import interconnectors

COLUMNS = ["Project Name", "Connection Site", "MW Import - Total", "MW Export - Total",
           "MW Effective From", "Project Status", "Gate"]


def register(*rows):
    return pd.DataFrame([dict(zip(COLUMNS, r)) for r in rows], columns=COLUMNS)


def entry(**overrides):
    base = {
        "id": "x", "name": "X Link", "registerProject": "X Link", "partner": "France",
        "commissioned": None, "milestones": [], "sources": [],
        "gbEnd": {"name": "Sellindge", "kind": "converter", "osm": "way/1", "lat": 51.1059, "lon": 0.9752},
        "partnerEnd": None,
    }
    base.update(overrides)
    return {"interconnectors": [base]}


def test_built_register_status_means_operational_and_energised_capacity():
    reg = register(("X Link", "Sellindge 400kV", "1988.0", "1988.0", "", "Built", ""))
    (record,) = interconnectors.build(reg, entry())
    assert record["stage"] == "operational"
    assert record["importMw"] == 1988
    assert record["contractedDate"] is None


def test_ofgem_milestone_sets_stage_when_register_is_not_decisive():
    reg = register(("X Link", "Site", "750", "750", "2028-11-30", "Awaiting Consents", ""))
    milestones = [{"type": "ipa", "label": "IPA", "date": "2024-11-12", "source": "s"}]
    (record,) = interconnectors.build(reg, entry(milestones=milestones))
    assert record["stage"] == "in_planning"


def test_contracted_date_only_for_gate_2():
    reg = register(("X Link", "Site", "750", "750", "2028-11-30", "Scoping", "2.0"))
    (record,) = interconnectors.build(reg, entry())
    assert record["gate"] == "2"
    assert record["contractedDate"] == "2028-11-30"


def test_staged_projects_use_the_last_row():
    reg = register(
        ("X Link", "Site", "270", "500", "", "Built", ""),
        ("X Link", "Site", "500", "500", "", "Built", ""),
    )
    (record,) = interconnectors.build(reg, entry())
    assert record["importMw"] == 500


def test_landing_points_are_converted_to_bng():
    reg = register(("X Link", "Site", "1", "1", "", "Built", ""))
    (record,) = interconnectors.build(reg, entry())
    # Sellindge converter station is at about TR 083 383.
    assert 607_000 < record["gbEnd"]["x"] < 610_000
    assert 137_000 < record["gbEnd"]["y"] < 140_000


def test_missing_register_row_stops_the_pipeline():
    with pytest.raises(ValueError):
        interconnectors.build(register(), entry())


def test_curated_file_is_well_formed():
    curated = interconnectors.load_curated()
    ids = [i["id"] for i in curated["interconnectors"]]
    assert len(ids) == len(set(ids))
    for item in curated["interconnectors"]:
        for milestone in item["milestones"]:
            assert milestone["type"] in interconnectors.MILESTONE_STAGE
            assert milestone["source"].startswith("https://")
