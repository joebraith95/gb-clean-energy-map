"""Pipeline entry point. Run from the repo root: python -m pipeline.run [--report] [--offline]"""

import argparse
import csv
import json
import re
from datetime import date
from pathlib import Path

from pipeline import bmu, changes, connection, corrections, events, interconnectors, output, phases, repd, substations, tec, tec_match

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

    tec_projects, tec_source = read_tec(args.offline)
    tec_result = match_tec(tec_projects, records)
    connections = connection.badges(tec_result, tec_projects, records)
    for r in records:
        r["details"]["connection"] = connections.get(r["id"])
    print_connections(connections, connection.stage_mismatches(tec_result, tec_projects, records), records)
    print_site_coverage(tec_result, tec_projects)

    output.write(records, source, DATA_DIR, tec_source)
    print(f"Wrote {len(records)} projects to {DATA_DIR}")
    print(f"Corrections applied: {len(fixes.applied)}  Skipped for review: {len(fixes.stale)}")
    print(f"Phase groups matched: {len(groups)} covering {sum(len(g) for g in groups)} records")

    links, link_source = build_interconnectors(args.offline)

    farms = bmu.validate(bmu.load(), records)
    bmu.write(farms, DATA_DIR)
    print(f"BM unit map: {len(farms)} wind farms, {sum(len(f['units']) for f in farms)} units")

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


def read_tec(offline: bool) -> tuple[list[dict], dict]:
    """Read the TEC register. Matching it to REPD comes in phase 4, step 2."""
    register_csv = RAW_DIR / "tec-register.csv"
    source_file = RAW_DIR / "tec-register-source.json"
    if offline:
        if not register_csv.exists() or not source_file.exists():
            raise SystemExit("No cached TEC register. Run once without --offline.")
        source = json.loads(source_file.read_text(encoding="utf-8"))
    else:
        url = tec.latest_register_url()
        print("Downloading NESO TEC register")
        repd.download(url, register_csv)
        source = {"name": "TEC register (NESO)", "page": tec.SOURCE_PAGE, "file": url}
        source_file.write_text(json.dumps(source), encoding="utf-8")

    projects, left_out = tec.build_projects(tec.load(register_csv))
    tranches = [t for p in projects for t in p["tranches"]]
    print(
        f"TEC register: {len(projects)} projects in scope ({len(tranches)} tranches); left out "
        f"{left_out[tec.EXCLUDED_TECHNOLOGY]} with an excluded technology, {left_out[tec.NO_TECHNOLOGY]} with none"
    )
    by_status: dict[str, int] = {}
    for t in tranches:
        key = f"{t['status']}, Gate {t['gate'] or 'blank'}"
        by_status[key] = by_status.get(key, 0) + 1
    for key in sorted(by_status):
        print(f"  {key:45} {by_status[key]:5}")
    return projects, source


def print_connections(connections: dict[int, dict], mismatched: list[int], records: list[dict]) -> None:
    counts = {b: 0 for b in connection.BADGES[1:]}
    for c in connections.values():
        counts[c["badge"]] += 1
    print(f"Connection badges: {counts[connection.ENERGISED]} energised, {counts[connection.GATE_2]} Gate 2 contracted")
    stages = {r["id"]: r["stage"] for r in records}
    print(f"  Built in TEC but not Operational in REPD (REPD wins, not shown as energised): {len(mismatched)}")
    for repd_id in mismatched:
        print(f"    REPD {repd_id}: {stages[repd_id]}")


def print_site_coverage(result: tec_match.Result, projects: list[dict]) -> None:
    """How many TEC projects with no REPD record have a located connection site (phase 4, step 5)."""
    sites = substations.load_sites()
    by_id = {p["id"]: p for p in projects}
    unmatched = [by_id[m.tec_id] for m in result.matches if not m.repd_ids]
    located = sum(1 for p in unmatched if p["connectionSite"] in sites)
    print(f"TEC projects not in REPD: {len(unmatched)}, connection site located for {located}")


def match_tec(projects: list[dict], records: list[dict]) -> tec_match.Result:
    """Match TEC projects to REPD and write a review list. Badges come in phase 4, step 3."""
    result = tec_match.match(projects, records, tec_match.load_overrides())
    for tec_id, reason in result.stale_overrides:
        print(f"WARNING: TEC override for {tec_id} skipped ({reason}). Review pipeline/tec_matches.json.")
    projects_by_id = {p["id"]: p for p in projects}
    counts: dict[tuple[str, str], int] = {}
    for m in result.matches:
        status = _furthest_status(projects_by_id[m.tec_id])
        counts[(status, m.method)] = counts.get((status, m.method), 0) + 1
    methods = ["name", "name_capacity", "name_contained", "name_hybrid", "override", "override_none", "unmatched"]
    print("TEC matching by furthest tranche status")
    print(f"  {'':34}" + "".join(f"{m:>15}" for m in methods))
    for status in tec_match.STATUS_STEP:
        print(f"  {status:34}" + "".join(f"{counts.get((status, m), 0):>15}" for m in methods))
    shared = {repd_id: ids for repd_id, ids in result.by_repd().items() if len(ids) > 1}
    print(f"  REPD records matched by more than one TEC project: {len(shared)}")
    write_match_review(result, projects_by_id, {r["id"]: r for r in records}, RAW_DIR / "tec-match-review.csv")
    return result


def write_match_review(result: tec_match.Result, projects: dict, records: dict, path: Path) -> None:
    """Every TEC project with its match or best candidates, for checking by hand."""
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow([
            "TEC Project ID", "TEC name", "TEC MW", "TEC status", "Gate", "Connection site", "Method",
            "REPD ID", "REPD name", "REPD MW", "REPD stage", "Name score", "Capacity ratio", "Blocked",
        ])
        for m in result.matches:
            p = projects[m.tec_id]
            gates = "/".join(sorted({t["gate"] for t in p["tranches"] if t["gate"]}))
            head = [m.tec_id, p["name"], p["capacityMw"], _furthest_status(p), gates, p["connectionSite"], m.method]
            rows = [c for c in m.candidates if c.repd_id in m.repd_ids] if m.repd_ids else m.candidates[:3]
            if m.repd_ids and not rows:  # an override, so no candidate list
                rows = [tec_match.Candidate(i, None, None, records[i]["technology"], records[i]["mw"], records[i]["stage"], False) for i in m.repd_ids]
            if not rows:
                writer.writerow(head)
            for c in rows:
                r = records[c.repd_id]
                writer.writerow(head + [c.repd_id, r["name"], r["mw"], r["stage"], c.name, c.capacity, c.blocked or ""])


def _furthest_status(project: dict) -> str:
    return max((t["status"] for t in project["tranches"]), key=tec_match.STATUS_STEP.__getitem__)


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
    table("All kept records by connection badge", "by_connection")


if __name__ == "__main__":
    main()
