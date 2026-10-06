"""Snapshots of headline stages and the "what changed" list. See "Change feed" in docs/SPEC.md.

Each run compares headline stages with the latest snapshot. When anything differs it writes a
new snapshot and logs every change that REPD's own dates do not already explain as a "spotted"
change. data/changes.json is rebuilt each run from the dated events in the current release plus
the spotted log, so it never depends on keeping old source files.
"""

import json
from datetime import date
from pathlib import Path

import pandas as pd

from pipeline.events import WINDOW_MONTHS

SNAPSHOT_DIR_NAME = "snapshots"
SPOTTED_LOG = "spotted.json"


def project_stages(records: list[dict]) -> dict[str, str | None]:
    return {str(r["id"]): r["stage"] for r in records}


def link_stages(links: list[dict]) -> dict[str, str | None]:
    return {r["id"]: r["stage"] for r in links}


def latest_snapshot(snapshot_dir: Path) -> dict | None:
    files = sorted(p for p in snapshot_dir.glob("????-??-??.json"))
    return json.loads(files[-1].read_text(encoding="utf-8")) if files else None


def diff(previous: dict[str, str | None], current: dict[str, str | None]) -> list[tuple[str, str | None, str | None]]:
    """(id, from stage, to stage) for every id whose stage differs, including added and removed."""
    changes = []
    for key in sorted(set(previous) | set(current), key=_sort_key):
        before, after = previous.get(key, "absent"), current.get(key, "absent")
        if before != after:
            changes.append((key, None if before == "absent" else before, None if after == "absent" else after))
    return changes


def update(
    data_dir: Path,
    run_date: date,
    records: list[dict],
    links: list[dict],
    events: list[dict],
    release_label: str,
    register_label: str,
) -> dict:
    """Write a snapshot if stages changed, extend the spotted log, and rebuild data/changes.json.

    Returns a summary for the pipeline report.
    """
    snapshot_dir = data_dir / SNAPSHOT_DIR_NAME
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    current = {"projects": project_stages(records), "interconnectors": link_stages(links)}
    previous = latest_snapshot(snapshot_dir)

    log_path = snapshot_dir / SPOTTED_LOG
    log = json.loads(log_path.read_text(encoding="utf-8")) if log_path.exists() else []
    spotted_now: list[dict] = []
    wrote_snapshot = False

    unchanged = previous is not None and all(previous[k] == current[k] for k in current)
    if not unchanged:
        if previous is not None:
            spotted_now = _spotted(previous, current, records, links, events, run_date, release_label, register_label)
            log.extend(spotted_now)
            _write(log_path, log)
        _write(snapshot_dir / f"{run_date.isoformat()}.json", {"date": run_date.isoformat(), **current})
        wrote_snapshot = True

    start = (pd.Timestamp(run_date) - pd.DateOffset(months=WINDOW_MONTHS)).date().isoformat()
    recent_spotted = [entry for entry in log if entry["date"] > start]
    changes = sorted(events + recent_spotted, key=lambda e: (e["date"], str(e["id"]), e["type"]), reverse=True)
    _write(data_dir / "changes.json", {"windowMonths": WINDOW_MONTHS, "changes": changes})
    return {
        "first_snapshot": previous is None,
        "wrote_snapshot": wrote_snapshot,
        "spotted": len(spotted_now),
        "changes": len(changes),
    }


def _spotted(previous, current, records, links, events, run_date, release_label, register_label) -> list[dict]:
    """Stage changes since the last snapshot that no dated event in the current release explains."""
    explained = {(str(e["id"]), e["stage"]) for e in events}
    by_project = {str(r["id"]): r for r in records}
    by_link = {r["id"]: r for r in links}
    entries = []
    for key, before, after in diff(previous["projects"], current["projects"]):
        if after is not None and (key, after) in explained:
            continue
        record = by_project.get(key)
        entries.append(
            {
                "date": run_date.isoformat(),
                "dateKind": "spotted",
                "spottedIn": release_label,
                "source": "project",
                "id": int(key),
                "type": _change_type(before, after),
                "from": before,
                "stage": after,
                "name": record["name"] if record else None,
                "technology": record["technology"] if record else None,
                "mw": record["mw"] if record else None,
            }
        )
    for key, before, after in diff(previous["interconnectors"], current["interconnectors"]):
        link = by_link.get(key)
        entries.append(
            {
                "date": run_date.isoformat(),
                "dateKind": "spotted",
                "spottedIn": register_label,
                "source": "interconnector",
                "id": key,
                "type": _change_type(before, after),
                "from": before,
                "stage": after,
                "name": link["name"] if link else key,
                "technology": "Interconnector",
                "mw": max(v for v in (link["importMw"], link["exportMw"]) if v is not None) if link and (link["importMw"] or link["exportMw"]) else None,
            }
        )
    return entries


def _change_type(before: str | None, after: str | None) -> str:
    if before is None:
        return "added"
    if after is None:
        return "removed"
    return "stage_changed"


def _sort_key(key: str):
    return (0, int(key)) if key.isdigit() else (1, key)


def _write(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
