"""Dated stage events taken from REPD's own date columns. See "Change feed" in docs/SPEC.md.

Only dates on or before the release date count: REPD occasionally holds later dates, which
cannot have happened yet. "Planning Permission Expired" is a deadline, so it only counts once
the date has passed and the record's status is "Planning Permission Expired".
"""

from collections import Counter
from datetime import date

import pandas as pd

from pipeline.repd import _parse_date
from pipeline.stages import Stage

# Event type -> (REPD date columns, the headline stage the event moves the project to).
EVENT_COLUMNS: dict[str, tuple[list[str], Stage]] = {
    "application_submitted": (["Planning Application Submitted"], Stage.IN_PLANNING),
    "appeal_lodged": (["Appeal Lodged"], Stage.IN_PLANNING),
    "consented": (
        ["Planning Permission Granted", "Appeal Granted", "Secretary of State - Granted"],
        Stage.CONSENTED,
    ),
    "refused": (
        ["Planning Permission Refused", "Appeal Refused", "Secretary of State - Refusal"],
        Stage.STALLED,
    ),
    "withdrawn": (["Planning Application Withdrawn", "Appeal Withdrawn"], Stage.STALLED),
    "construction_started": (["Under Construction"], Stage.UNDER_CONSTRUCTION),
    "operational": (["Operational"], Stage.OPERATIONAL),
}
EXPIRY_COLUMN = "Planning Permission Expired"
EXPIRED_STATUS = "Planning Permission Expired"

WINDOW_MONTHS = 12


def dated_events(df: pd.DataFrame, records: list[dict], release: date) -> tuple[list[dict], Counter]:
    """Events within WINDOW_MONTHS up to the release date, newest first.

    Returns the events and a count of dates ignored because they fall after the release.
    """
    start = (pd.Timestamp(release) - pd.DateOffset(months=WINDOW_MONTHS)).date()
    kept = {r["id"]: r for r in records}
    rows = df[df["Ref ID"].astype(int).isin(kept)]
    events: list[dict] = []
    ignored: Counter = Counter()
    for row in rows.to_dict("records"):
        record = kept[int(row["Ref ID"])]
        found: set[tuple[str, date]] = set()
        for event_type, (columns, _) in EVENT_COLUMNS.items():
            for column in columns:
                when = _parse_date(row[column])
                if when is None:
                    continue
                if when > release:
                    ignored[event_type] += 1
                    continue
                found.add((event_type, when))
        expiry = _parse_date(row[EXPIRY_COLUMN])
        if expiry and expiry <= release and row["Development Status (short)"] == EXPIRED_STATUS:
            found.add(("permission_expired", expiry))
        for event_type, when in found:
            if when > start:
                events.append(event(record, event_type, when))
    events.sort(key=lambda e: (e["date"], e["id"], e["type"]), reverse=True)
    return events, ignored


def event_stage(event_type: str) -> Stage:
    if event_type == "permission_expired":
        return Stage.STALLED
    return EVENT_COLUMNS[event_type][1]


def event(record: dict, event_type: str, when: date) -> dict:
    return {
        "date": when.isoformat(),
        "dateKind": "event",
        "source": "project",
        "id": record["id"],
        "type": event_type,
        "stage": event_stage(event_type).value,
        "name": record["name"],
        "technology": record["technology"],
        "mw": record["mw"],
    }
