"""Pipeline entry point. Run from the repo root: python -m pipeline.run [--report] [--offline]"""

import argparse
import json
import re
from datetime import date
from pathlib import Path

from pipeline import changes, corrections, events, interconnectors, output, phases, repd

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "pipeline" / "raw"
DATA_DIR = ROOT / "data"


def main() -> None:
    parser = argparse.ArgumentParser(description="Build map data from REPD.")
    parser.add_argument("--report", action="store_true", help="print before and after counts per stage and technology")
    parser.add_argument("--offline", action="store_true", help="reuse the cached download in pipeline/raw")
    parser.add_argument("--run-date", type=date.fromisoformat, default=date.today(), help="date to stamp a new snapshot with (YYYY-MM-DD)")
    args = parser.parse_args()

    raw_csv = RAW_DIR / "repd.csv"
    source_file = RAW_DIR / "repd-source.json"
    if args.offline:
        if not raw_csv.exists() or not source_file.exists():
            raise SystemExit("No cached REPD file. Run once without --offline.")
        source = json.loads(source_file.read_text(encoding="utf-8"))
    else:
        release = repd.latest_release()
        print(f"Downloading {release.title}")
        repd.download(release.url, raw_csv)
        source = {
            "name": "REPD (DESNZ)",
            "page": repd.SOURCE_PAGE,
            "file": release.url,
            "updated": release.updated,
            "release": release_label(release.title, release.updated),
        }
        source_file.write_text(json.dumps(source), encoding="utf-8")

    before = output.read_index(DATA_DIR)
    df = repd.load(raw_csv)
    fixes = corrections.apply(df, corrections.load_corrections())
    for ref_id, reason in fixes.stale:
        print(f"WARNING: correction for REPD {ref_id} skipped ({reason}). Review pipeline/corrections.json.")
    records = repd.build_records(df, fixes.notes)
    groups = phases.group_phases(records, phases.load_links())
    by_id = {r["id"]: r for r in records}
    for number, group in enumerate(groups):
        for ref_id in group:
            by_id[ref_id]["group"] = number
            by_id[ref_id]["details"]["phases"] = [other for other in group if other != ref_id]
    output.write(records, source, DATA_DIR)
    print(f"Wrote {len(records)} projects to {DATA_DIR}")
    print(f"Corrections applied: {len(fixes.applied)}  Skipped for review: {len(fixes.stale)}")
    print(f"Phase groups matched: {len(groups)} covering {sum(len(g) for g in groups)} records")

    links, link_source = build_interconnectors(args.offline)

    release_date = date.fromisoformat(source["updated"])
    dated, ignored = events.dated_events(df, records, release_date)
    summary = changes.update(
        DATA_DIR,
        args.run_date,
        records,
        links,
        dated,
        source.get("release") or release_label("", source["updated"]),
        f"the NESO Interconnector Register ({human_date(args.run_date)})",
    )
    print_changes(dated, ignored, summary)

    if args.report:
        after = output.read_index(DATA_DIR)
        print_report(output.summarise(before) if before else None, output.summarise(after))


def build_interconnectors(offline: bool) -> tuple[list[dict], dict]:
    register_csv = RAW_DIR / "interconnector-register.csv"
    source_file = RAW_DIR / "interconnector-register-source.json"
    if offline:
        if not register_csv.exists() or not source_file.exists():
            raise SystemExit("No cached Interconnector Register. Run once without --offline.")
        source = json.loads(source_file.read_text(encoding="utf-8"))
    else:
        url = interconnectors.latest_register_url()
        print("Downloading NESO Interconnector Register")
        repd.download(url, register_csv)
        source = {"name": "Interconnector Register (NESO)", "page": interconnectors.REGISTER_PAGE, "file": url}
        source_file.write_text(json.dumps(source), encoding="utf-8")

    records = interconnectors.build(interconnectors.load_register(register_csv), interconnectors.load_curated())
    output.write_json(DATA_DIR / "interconnectors.json", {"source": source, "interconnectors": records})
    drawn = sum(1 for r in records if r["gbEnd"])
    print(f"Wrote {len(records)} interconnectors ({drawn} with a GB landing point)")
    for r in records:
        print(f"  {r['name']:26} {r['partner']:17} {r['stage'] or '-':19} {r['importMw']}/{r['exportMw']} MW")
    return records, source


def human_date(day: date) -> str:
    return f"{day.day} {day.strftime('%B %Y')}"


def release_label(title: str, updated: str) -> str:
    """"the July 2026 REPD release" from the GOV.UK attachment title, or the publication date."""
    match = re.search(r"\):\s*([A-Z][a-z]+ \d{4})", title)
    if match:
        return f"the {match.group(1)} REPD release"
    return f"the REPD release published {human_date(date.fromisoformat(updated))}"


def print_changes(dated: list[dict], ignored, summary: dict) -> None:
    by_type: dict[str, int] = {}
    for e in dated:
        by_type[e["type"]] = by_type.get(e["type"], 0) + 1
    print(f"\nDated events in the last {events.WINDOW_MONTHS} months: {len(dated)}")
    for name in sorted(by_type):
        print(f"  {name:26}{by_type[name]:>6}")
    if ignored:
        print(f"Dates after the release, ignored: {dict(ignored)}")
    if summary["first_snapshot"]:
        print("First snapshot written; spotted changes start from the next change in the sources.")
    elif summary["wrote_snapshot"]:
        print(f"New snapshot written. Spotted changes not explained by REPD dates: {summary['spotted']}")
    else:
        print("Stages unchanged since the last snapshot; no new snapshot.")
    print(f"Wrote {summary['changes']} entries to data/changes.json")


def print_report(before: dict | None, after: dict) -> None:
    def table(title: str, key: str) -> None:
        old, new = (before or {}).get(key, {}), after[key]
        print(f"\n{title}")
        print(f"  {'':34}{'before':>8}{'after':>8}{'change':>8}")
        for name in sorted(set(old) | set(new)):
            o, n = old.get(name, 0), new.get(name, 0)
            print(f"  {name:34}{o if before else '-':>8}{n:>8}{(n - o) if before else '':>8}")

    print(f"\nTotal kept: {after['total']}  On map: {after['on_map']}  On map at 1MW or more: {after['on_map_1mw']}")
    table("All kept records by stage", "by_stage")
    table("On map by stage", "on_map_by_stage")
    table("All kept records by technology", "by_technology")
    table("On map by technology", "on_map_by_technology")
    table("Hidden by reason", "hidden_by_reason")


if __name__ == "__main__":
    main()
