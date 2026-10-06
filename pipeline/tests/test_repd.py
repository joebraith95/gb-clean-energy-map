import pandas as pd

from pipeline import output, repd

COLUMNS = [
    "Ref ID", "Site Name", "Operator (or Applicant)", "Technology Type", "Storage Type",
    "Installed Capacity (MWelec)", "Development Status (short)", "Address", "County", "Region",
    "Country", "Post Code", "X-coordinate", "Y-coordinate", "Planning Authority",
    "Planning Application Reference", "Appeal Reference", "No. of Turbines",
    "Planning Application Submitted", "Appeal Lodged", "Planning Permission Granted",
    "Appeal Granted", "Secretary of State - Granted", "Under Construction", "Operational",
    "Record Last Updated (dd/mm/yyyy)",
]


def row(**values) -> dict:
    base = {column: "" for column in COLUMNS}
    base.update(
        {
            "Ref ID": "1", "Site Name": "Test Farm", "Technology Type": "Wind Onshore",
            "Installed Capacity (MWelec)": "10", "Development Status (short)": "Operational",
            "Country": "Scotland", "X-coordinate": "250000", "Y-coordinate": "650000",
        }
    )
    base.update(values)
    return base


def build(*rows: dict) -> list[dict]:
    return repd.build_records(pd.DataFrame(list(rows), columns=COLUMNS))


def test_load_normalises_headers_values_and_encoding(tmp_path):
    path = tmp_path / "repd.csv"
    content = "Ref ID ,Site Name,Planning Permission  Granted,Operational\n7, Bishop’s Farm ,01/02/2020,NA\n"
    path.write_bytes(content.encode("cp1252"))
    df = repd.load(path)
    assert list(df.columns) == ["Ref ID", "Site Name", "Planning Permission Granted", "Operational"]
    assert df.loc[0, "Site Name"] == "Bishop’s Farm"
    assert df.loc[0, "Operational"] == ""


def test_scope_excludes_northern_ireland_excluded_tech_and_revised():
    records = build(
        row(**{"Ref ID": "1"}),
        row(**{"Ref ID": "2", "Country": "Northern Ireland"}),
        row(**{"Ref ID": "3", "Technology Type": "Biomass (dedicated)"}),
        row(**{"Ref ID": "4", "Development Status (short)": "Revised"}),
    )
    assert [r["id"] for r in records] == [1]


def test_hidden_reasons():
    records = build(
        row(**{"Ref ID": "1"}),
        row(**{"Ref ID": "2", "Development Status (short)": "Abandoned"}),
        row(**{"Ref ID": "3", "Development Status (short)": "No Application Required"}),
        row(**{"Ref ID": "4", "X-coordinate": ""}),
        row(**{"Ref ID": "5", "X-coordinate": "966043"}),
        row(**{"Ref ID": "6", "Installed Capacity (MWelec)": ""}),
    )
    assert [r["hidden"] for r in records] == [
        None, "off_track", "no_stage", "no_location", "outside_extent", "no_capacity",
    ]


def test_numbers_and_dates_are_parsed():
    (record,) = build(
        row(
            **{
                "Installed Capacity (MWelec)": "1,200.5",
                "Planning Permission Granted": "01/02/2019",
                "Appeal Granted": "03/04/2020",
                "Operational": "05/06/2023",
            }
        )
    )
    assert record["mw"] == 1200.5
    assert record["details"]["dates"]["consented"] == "2020-04-03"
    assert record["details"]["dates"]["operational"] == "2023-06-05"
    assert record["details"]["dates"]["submitted"] is None


def test_offshore_flag_only_for_wind():
    onshore, offshore, solar = build(
        row(**{"Ref ID": "1"}),
        row(**{"Ref ID": "2", "Technology Type": "Wind Offshore"}),
        row(**{"Ref ID": "3", "Technology Type": "Solar Photovoltaics"}),
    )
    assert onshore["details"]["offshore"] is False
    assert offshore["details"]["offshore"] is True
    assert solar["details"]["offshore"] is None


def test_output_round_trip(tmp_path):
    records = build(row(**{"Ref ID": "1"}), row(**{"Ref ID": "66", "Development Status (short)": "Abandoned"}))
    output.write(records, {"name": "test"}, tmp_path)
    index = output.read_index(tmp_path)
    summary = output.summarise(index)
    assert summary["total"] == 2
    assert summary["on_map"] == 1
    assert summary["hidden_by_reason"] == {"off_track": 1}
    assert (tmp_path / "details" / "01.json").exists()
    assert (tmp_path / "details" / "02.json").read_text(encoding="utf-8").startswith('{"66"')
