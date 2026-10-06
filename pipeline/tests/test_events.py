from datetime import date

import pandas as pd

from pipeline.events import EVENT_COLUMNS, EXPIRY_COLUMN, dated_events

DATE_COLUMNS = sorted({c for columns, _ in EVENT_COLUMNS.values() for c in columns} | {EXPIRY_COLUMN})
RELEASE = date(2026, 8, 3)


def frame(*rows: dict) -> pd.DataFrame:
    base = {column: "" for column in DATE_COLUMNS}
    return pd.DataFrame([{**base, "Development Status (short)": "Operational", **r} for r in rows])


def record(id: int) -> dict:
    return {"id": id, "name": f"Site {id}", "technology": "Solar Photovoltaics", "mw": 10}


def test_events_come_from_date_columns_with_their_stage():
    df = frame({"Ref ID": "1", "Planning Permission Granted": "05/12/2025", "Under Construction": "01/05/2026"})
    events, ignored = dated_events(df, [record(1)], RELEASE)
    assert [(e["type"], e["date"], e["stage"]) for e in events] == [
        ("construction_started", "2026-05-01", "under_construction"),
        ("consented", "2025-12-05", "consented"),
    ]
    assert not ignored


def test_dates_after_the_release_are_ignored_and_counted():
    df = frame({"Ref ID": "1", "Planning Permission Granted": "15/12/2026"})
    events, ignored = dated_events(df, [record(1)], RELEASE)
    assert events == []
    assert ignored == {"consented": 1}


def test_only_the_last_twelve_months_are_kept():
    df = frame({"Ref ID": "1", "Operational": "01/07/2025", "Planning Application Submitted": "01/09/2025"})
    events, _ = dated_events(df, [record(1)], RELEASE)
    assert [e["type"] for e in events] == ["application_submitted"]


def test_expiry_is_an_event_only_when_past_and_the_status_says_expired():
    future_deadline = {"Ref ID": "1", EXPIRY_COLUMN: "01/01/2030", "Development Status (short)": "Awaiting Construction"}
    past_but_live = {"Ref ID": "2", EXPIRY_COLUMN: "01/03/2026", "Development Status (short)": "Awaiting Construction"}
    expired = {"Ref ID": "3", EXPIRY_COLUMN: "01/03/2026", "Development Status (short)": "Planning Permission Expired"}
    events, _ = dated_events(frame(future_deadline, past_but_live, expired), [record(1), record(2), record(3)], RELEASE)
    assert [(e["id"], e["type"], e["stage"]) for e in events] == [(3, "permission_expired", "stalled")]


def test_records_outside_scope_are_skipped():
    df = frame({"Ref ID": "9", "Operational": "01/05/2026"})
    events, _ = dated_events(df, [record(1)], RELEASE)
    assert events == []


def test_the_same_event_on_two_columns_counts_once():
    df = frame({"Ref ID": "1", "Planning Permission Granted": "01/04/2026", "Appeal Granted": "01/04/2026"})
    events, _ = dated_events(df, [record(1)], RELEASE)
    assert len(events) == 1
