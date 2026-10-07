import pandas as pd
import pytest

from pipeline import tec
from pipeline.stages import UnmappedValueError


def row(**overrides):
    base = {
        "Project Name": "Hill Wind Farm",
        "Customer Name": "Hill Wind Ltd",
        "Connection Site": "Hill 132kV Substation",
        "Stage": "",
        "MW Connected": "0",
        "MW Increase / Decrease": "50",
        "Cumulative Total Capacity (MW)": "50",
        "MW Effective From": "31/10/2029",
        "Project Status": "Scoping",
        "Agreement Type": "Direct Connection",
        "HOST TO": "SPT",
        "Plant Type": "Wind Onshore",
        "Project ID": "a01",
        "Project Number": "PRO-001",
        "Gate": "",
    }
    base.update(overrides)
    return base


def register(*rows):
    return pd.DataFrame(list(rows), columns=tec.COLUMNS)


def test_load_reads_bom_and_cleans_whitespace(tmp_path):
    path = tmp_path / "tec.csv"
    header = ",".join(tec.COLUMNS)
    values = ",".join(f'"{v}"' for v in row(**{"Project Name": "  Hill   Wind Farm "}).values())
    path.write_text(f"{header}\n{values}\n", encoding="utf-8-sig")
    df = tec.load(path)
    assert list(df.columns) == tec.COLUMNS
    assert df.loc[0, "Project Name"] == "Hill Wind Farm"


def test_load_stops_on_missing_column(tmp_path):
    path = tmp_path / "tec.csv"
    path.write_text("Project Name,Gate\nX,1\n", encoding="utf-8-sig")
    with pytest.raises(ValueError, match="missing columns"):
        tec.load(path)


def test_single_row_project():
    (project,), left_out = tec.build_projects(register(row(Gate="2")))
    assert project["id"] == "a01"
    assert project["technologies"] == ["wind_onshore"]
    assert project["capacityMw"] == 50
    assert project["tranches"] == [
        {
            "projectNumber": "PRO-001",
            "stage": None,
            "status": "Scoping",
            "gate": "2",
            "connectedMw": 0,
            "changeMw": 50,
            "cumulativeMw": 50,
            "effectiveFrom": "2029-10-31",
        }
    ]
    assert left_out == {tec.EXCLUDED_TECHNOLOGY: 0, tec.NO_TECHNOLOGY: 0}


def test_staged_rows_stay_separate_tranches_with_their_own_status_and_gate():
    reg = register(
        row(**{"Stage": "1", "MW Connected": "114", "MW Increase / Decrease": "0",
               "Cumulative Total Capacity (MW)": "114", "MW Effective From": "",
               "Project Status": "Built", "Gate": "2", "Project Number": "PRO-001"}),
        row(**{"Stage": "2", "MW Increase / Decrease": "216", "Cumulative Total Capacity (MW)": "330",
               "Project Status": "Scoping", "Gate": "1", "Project Number": "PRO-002",
               "Plant Type": "Energy Storage System;Wind Onshore"}),
    )
    (project,), _ = tec.build_projects(reg)
    assert project["capacityMw"] == 330
    assert [(t["stage"], t["status"], t["gate"]) for t in project["tranches"]] == [
        (1, "Built", "2"),
        (2, "Scoping", "1"),
    ]
    assert project["tranches"][0]["effectiveFrom"] is None
    assert project["technologies"] == ["storage", "wind_onshore"]


def test_hybrid_plant_types_and_ignored_parts():
    reg = register(row(**{"Plant Type": "Demand;Energy Storage System;PV Array (Photo Voltaic/solar)"}))
    (project,), _ = tec.build_projects(reg)
    assert project["technologies"] == ["solar", "storage"]


def test_any_fossil_part_excludes_the_project():
    reg = register(
        row(**{"Plant Type": "Energy Storage System;Gas Reciprocating"}),
        row(**{"Project ID": "a02", "Plant Type": "Reactive Compensation"}),
    )
    projects, left_out = tec.build_projects(reg)
    assert projects == []
    assert left_out == {tec.EXCLUDED_TECHNOLOGY: 1, tec.NO_TECHNOLOGY: 1}


def test_gate_written_as_decimal_is_accepted():
    (project,), _ = tec.build_projects(register(row(Gate="2.0")))
    assert project["tranches"][0]["gate"] == "2"


@pytest.mark.parametrize(
    "field, value",
    [
        ("Project Status", "Cancelled"),
        ("Gate", "3"),
        ("Plant Type", "Fusion"),
    ],
)
def test_unknown_values_stop_the_pipeline(field, value):
    with pytest.raises(UnmappedValueError):
        tec.build_projects(register(row(**{field: value})))


def test_other_date_formats_stop_the_pipeline():
    with pytest.raises(ValueError):
        tec.build_projects(register(row(**{"MW Effective From": "2029-10-31"})))


def test_numbers_with_thousands_separators():
    (project,), _ = tec.build_projects(register(row(**{"Cumulative Total Capacity (MW)": "1,296"})))
    assert project["capacityMw"] == 1296
