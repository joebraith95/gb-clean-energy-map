"""Pipeline entry point. Run from the repo root: python -m pipeline.run [--report]"""

import argparse


def main() -> None:
    parser = argparse.ArgumentParser(description="Build map data from REPD and the interconnector file.")
    parser.add_argument("--report", action="store_true", help="print counts per stage and technology")
    args = parser.parse_args()

    # REPD ingest is built in phase 1 step 1.
    print("Pipeline not built yet (phase 1 step 1).")
    if args.report:
        print("Report: no data yet.")


if __name__ == "__main__":
    main()
