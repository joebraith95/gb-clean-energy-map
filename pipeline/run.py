"""Pipeline entry point. Run from the repo root: python -m pipeline.run [--report] [--offline]"""

import argparse
import json
from pathlib import Path

from pipeline import corrections, output, repd

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "pipeline" / "raw"
DATA_DIR = ROOT / "data"


def main() -> None:
    parser = argparse.ArgumentParser(description="Build map data from REPD.")
    parser.add_argument("--report", action="store_true", help="print before and after counts per stage and technology")
    parser.add_argument("--offline", action="store_true", help="reuse the cached download in pipeline/raw")
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
        source = {"name": "REPD (DESNZ)", "page": repd.SOURCE_PAGE, "file": release.url, "updated": release.updated}
        source_file.write_text(json.dumps(source), encoding="utf-8")

    before = output.read_index(DATA_DIR)
    df = repd.load(raw_csv)
    fixes = corrections.apply(df, corrections.load_corrections())
    for ref_id, reason in fixes.stale:
        print(f"WARNING: correction for REPD {ref_id} skipped ({reason}). Review pipeline/corrections.json.")
    records = repd.build_records(df, fixes.notes)
    output.write(records, source, DATA_DIR)
    print(f"Wrote {len(records)} projects to {DATA_DIR}")
    print(f"Corrections applied: {len(fixes.applied)}  Skipped for review: {len(fixes.stale)}")

    if args.report:
        after = output.read_index(DATA_DIR)
        print_report(output.summarise(before) if before else None, output.summarise(after))


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
