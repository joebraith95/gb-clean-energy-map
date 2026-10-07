"""Connection badges for REPD records from their TEC register matches. See "Connection badge" in
docs/SPEC.md.

- Energised: a matched TEC tranche is Built and REPD says Operational. Where the two disagree,
  REPD wins and the record is treated as not energised.
- Gate 2 contracted: otherwise, a matched tranche has Gate 2. Carries the earliest contracted date
  among those tranches and its connection site.
- Not published: everything else, including Gate 1 and a blank Gate. Such records get no entry.

The badge never changes the headline stage.
"""

from pipeline import tec_match

ENERGISED = "energised"
GATE_2 = "gate2"
# Index order in data/projects.json; 0 means not published.
BADGES = ["not_published", GATE_2, ENERGISED]


def badges(result: tec_match.Result, projects: list[dict], records: list[dict]) -> dict[int, dict]:
    """REPD ID -> connection details, for records that have a badge."""
    by_id = {p["id"]: p for p in projects}
    stage = {r["id"]: r["stage"] for r in records}
    methods = {m.tec_id: m.method for m in result.matches}
    out = {}
    for repd_id, tec_ids in result.by_repd().items():
        matched = [by_id[t] for t in sorted(tec_ids)]
        found = badge_for(matched, stage[repd_id] == "operational", methods)
        if found:
            out[repd_id] = found
    return out


def badge_for(matched: list[dict], operational: bool, methods: dict[str, str] | None = None) -> dict | None:
    """The badge from some TEC projects' tranches, or None for not published.

    `operational` says whether the record's own stage is Operational: Energised needs both a
    Built tranche and that, so REPD wins where the two disagree.
    """
    tranches = [(p, t) for p in matched for t in p["tranches"]]
    tec = [{"name": p["name"], "projectId": p["id"], "matchedBy": (methods or {}).get(p["id"])} for p in matched]
    if operational and any(t["status"] == "Built" for _, t in tranches):
        return {"badge": ENERGISED, "contractedDate": None, "site": None, "tec": tec}
    gate_2 = [(p, t) for p, t in tranches if t["gate"] == "2"]
    if not gate_2:
        return None
    # Tranches with no date sort last; the date shown is the earliest published one.
    project, tranche = min(gate_2, key=lambda pt: pt[1]["effectiveFrom"] or "9999")
    return {
        "badge": GATE_2,
        # Always shown as "Contracted date", never "expected" (docs/SPEC.md).
        "contractedDate": tranche["effectiveFrom"],
        "site": project["connectionSite"],
        "tec": tec,
    }


def stage_mismatches(result: tec_match.Result, projects: list[dict], records: list[dict]) -> list[int]:
    """Records built in TEC but not Operational in REPD, for the report. REPD wins for these."""
    by_id = {p["id"]: p for p in projects}
    stage = {r["id"]: r["stage"] for r in records}
    return sorted(
        repd_id
        for repd_id, tec_ids in result.by_repd().items()
        if stage[repd_id] != "operational"
        and any(t["status"] == "Built" for tec_id in tec_ids for t in by_id[tec_id]["tranches"])
    )
