import json
from datetime import date

from pipeline import changes


def project(id: int, stage: str | None) -> dict:
    return {"id": id, "name": f"Site {id}", "technology": "Wind Onshore", "mw": 20, "stage": stage}


def link(id: str, stage: str) -> dict:
    return {"id": id, "name": id.upper(), "stage": stage, "importMw": 1000, "exportMw": 1050}


def read_changes(data_dir):
    return json.loads((data_dir / "changes.json").read_text(encoding="utf-8"))["changes"]


def run(data_dir, day, records, links, events=()):
    return changes.update(
        data_dir, day, records, links, list(events), "the July 2026 REPD release", "the NESO register"
    )


def test_diff_finds_changed_added_and_removed():
    assert changes.diff({"1": "consented", "2": "in_planning"}, {"1": "operational", "3": "in_planning"}) == [
        ("1", "consented", "operational"),
        ("2", "in_planning", None),
        ("3", None, "in_planning"),
    ]


def test_two_consecutive_runs_produce_the_expected_change_list(tmp_path):
    """The phase 2 'done when' check: run 1, then run 2 with changed stages."""
    first = [project(1, "consented"), project(2, "in_planning"), project(3, "operational")]
    summary = run(tmp_path, date(2026, 10, 6), first, [link("ifa", "operational")])
    assert summary == {"first_snapshot": True, "wrote_snapshot": True, "spotted": 0, "changes": 0}

    second = [project(1, "under_construction"), project(2, "stalled"), project(4, "in_planning")]
    # REPD dates explain project 1 starting construction, so it is not logged again as spotted.
    dated = [{"date": "2026-09-01", "dateKind": "event", "source": "project", "id": 1,
              "type": "construction_started", "stage": "under_construction"}]
    summary = run(tmp_path, date(2026, 11, 2), second, [link("ifa", "operational")], dated)

    assert summary["wrote_snapshot"] and summary["spotted"] == 3
    entries = read_changes(tmp_path)
    spotted = [(e["id"], e["type"], e["from"], e["stage"]) for e in entries if e["dateKind"] == "spotted"]
    assert spotted == [
        (4, "added", None, "in_planning"),
        (3, "removed", "operational", None),
        (2, "stage_changed", "in_planning", "stalled"),
    ]
    assert all(e["spottedIn"] == "the July 2026 REPD release" for e in entries if e["dateKind"] == "spotted")
    assert [e["id"] for e in entries if e["dateKind"] == "event"] == [1]


def test_unchanged_run_writes_no_snapshot_and_identical_output(tmp_path):
    records = [project(1, "consented")]
    run(tmp_path, date(2026, 10, 6), records, [])
    before = (tmp_path / "changes.json").read_bytes()
    summary = run(tmp_path, date(2026, 10, 13), records, [])
    assert not summary["wrote_snapshot"]
    assert sorted(p.name for p in (tmp_path / "snapshots").iterdir()) == ["2026-10-06.json"]
    assert (tmp_path / "changes.json").read_bytes() == before


def test_interconnector_stage_changes_are_spotted(tmp_path):
    run(tmp_path, date(2026, 10, 6), [], [link("neuconnect", "under_construction")])
    run(tmp_path, date(2027, 3, 1), [], [link("neuconnect", "operational")])
    (entry,) = read_changes(tmp_path)
    assert entry["source"] == "interconnector"
    assert (entry["id"], entry["from"], entry["stage"], entry["mw"]) == ("neuconnect", "under_construction", "operational", 1050)
    assert entry["spottedIn"] == "the NESO register"


def test_spotted_changes_older_than_the_window_drop_out(tmp_path):
    run(tmp_path, date(2026, 1, 5), [project(1, "consented")], [])
    run(tmp_path, date(2026, 2, 2), [project(1, "operational")], [])
    assert len(read_changes(tmp_path)) == 1
    run(tmp_path, date(2027, 3, 1), [project(1, "operational")], [])
    assert read_changes(tmp_path) == []
