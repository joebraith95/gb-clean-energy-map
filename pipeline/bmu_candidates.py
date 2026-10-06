"""Suggest Elexon BM units for large operational wind farms in REPD, for hand review.

Run from the repo root: python -m pipeline.bmu_candidates
Nothing here is written to data/: confirmed matches go into pipeline/bmu_map.json by hand.
"""

import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "pipeline" / "raw" / "bmunits.json"
BMU_URL = "https://data.elexon.co.uk/bmrs/api/v1/reference/bmunits/all"
MIN_MW = 100

GENERIC = {
    "wind", "farm", "windfarm", "offshore", "onshore", "extension", "phase", "limited", "ltd",
    "energy", "power", "renewables", "renewable", "the", "and", "park", "array", "project",
}


def words(text: str | None) -> set[str]:
    tokens = re.sub(r"[^a-z ]", " ", (text or "").lower()).split()
    return {t for t in tokens if len(t) > 3 and t not in GENERIC}


def load_units() -> list[dict]:
    if not RAW.exists():
        RAW.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(BMU_URL, timeout=120) as response:
            RAW.write_bytes(response.read())
    units = json.loads(RAW.read_text(encoding="utf-8"))
    return [
        u for u in units
        if (u.get("fuelType") or "").upper().startswith("WIND")
        and (u.get("elexonBmUnit") or "").startswith(("T_", "E_"))
    ]


def main() -> None:
    index = json.loads((ROOT / "data" / "projects.json").read_text(encoding="utf-8"))
    techs, stages = index["technologies"], index["stages"]
    units = load_units()
    farms = [
        (index["id"][i], index["name"][i], index["mw"][i], techs[index["tech"][i]])
        for i in range(len(index["id"]))
        if techs[index["tech"][i]] in ("Wind Onshore", "Wind Offshore")
        and stages[index["stage"][i]] == "operational"
        and (index["mw"][i] or 0) >= MIN_MW
    ]
    for repd_id, name, mw, tech in sorted(farms, key=lambda f: -f[2]):
        farm_words = words(name)
        scored = []
        for u in units:
            overlap = farm_words & (words(u.get("bmUnitName")) | words(u.get("leadPartyName")))
            if overlap:
                scored.append((len(overlap), u))
        scored.sort(key=lambda s: (-s[0], s[1]["elexonBmUnit"]))
        print(f"\nREPD {repd_id}  {name}  ({tech}, {mw} MW)")
        for score, u in scored[:6]:
            print(
                f"    {u['elexonBmUnit']:14} {u.get('bmUnitName') or '':34} "
                f"{u.get('generationCapacity') or '':>9} MW  {u.get('leadPartyName') or ''}"
            )
        if not scored:
            print("    (no name match)")


if __name__ == "__main__":
    main()
