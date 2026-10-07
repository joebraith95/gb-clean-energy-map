"""Locate every TEC register connection site at an OpenStreetMap substation and write
pipeline/substations.json. Check the output by hand before committing it.

Run from the repo root: python -m pipeline.substation_candidates [--fetch]
--fetch re-downloads the substations from the Overpass API into pipeline/raw/ (about 10MB).
Entries marked "method": "hand" in the existing file are kept as they are.
"""

import argparse
import json
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date
from pathlib import Path

from pipeline import substations, tec

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "pipeline" / "raw" / "osm-substations.json"
TEC_CSV = ROOT / "pipeline" / "raw" / "tec-register.csv"
OVERPASS = "https://overpass-api.de/api/interpreter"
QUERY = (
    '[out:json][timeout:240];area["ISO3166-1"="GB"][admin_level=2]->.gb;'
    '(nwr["power"="substation"]["name"](area.gb););out center tags;'
)
USER_AGENT = "gb-clean-energy-map/0.1 (https://github.com/joebraith95/gb-clean-energy-map)"


def fetch() -> None:
    body = urllib.parse.urlencode({"data": QUERY}).encode()
    request = urllib.request.Request(OVERPASS, data=body, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=300) as response:
        RAW.write_bytes(response.read())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--fetch", action="store_true", help="re-download substations from OpenStreetMap")
    args = parser.parse_args()
    if args.fetch or not RAW.exists():
        print("Downloading substations from the Overpass API")
        fetch()
    if not TEC_CSV.exists():
        raise SystemExit("No cached TEC register. Run python -m pipeline.run once first.")

    osm = json.loads(RAW.read_text(encoding="utf-8"))
    index = substations.index_by_name(substations.high_voltage_substations(osm["elements"]))
    register = tec.load(TEC_CSV)
    hosts = dict(zip(register["Connection Site"], register["HOST TO"]))

    previous = substations.load_sites()
    sites, reasons = {}, Counter()
    for site in sorted(hosts):
        if previous.get(site, {}).get("method") == "hand":
            sites[site] = previous[site]
            reasons["hand"] += 1
            continue
        found, reason = substations.locate(site, hosts[site] or None, index)
        reasons[reason] += 1
        if found:
            sites[site] = {**found, "method": reason, "checked": date.today().isoformat()}

    out = {
        "_about": (
            "TEC register connection sites located at OpenStreetMap substations (ODbL), written by "
            "python -m pipeline.substation_candidates and checked by hand. Coordinates are British "
            "National Grid metres. Entries with method 'hand' were added or corrected by hand and "
            "are kept on later runs. Sites not listed could not be located."
        ),
        "osmTimestamp": osm.get("osm3s", {}).get("timestamp_osm_base"),
        "sites": sites,
    }
    substations.SITES_FILE.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(hosts)} connection sites: " + ", ".join(f"{n} {r}" for r, n in reasons.most_common()))
    print(f"Wrote {len(sites)} located sites to {substations.SITES_FILE}")


if __name__ == "__main__":
    main()
