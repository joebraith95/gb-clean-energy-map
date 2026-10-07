"""Match TEC register projects to REPD records. See "Connection data" in docs/PHASE4_PLAN.md.

The register has no coordinates or REPD IDs, so a match rests on a compatible technology, the
distinctive words of the project name, and capacity. Only a clear winner is accepted; anything
ambiguous stays unmatched (so its badge reads "Not published") and is listed for review.
pipeline/tec_matches.json forces or forbids pairings by hand.

A hybrid TEC project (solar and battery under one connection, say) can match one REPD record per
technology when REPD lists them separately. Several TEC projects can match one REPD record (offshore wind farms are often split into A, B
and C connections), so this is not one-to-one either way. An override can link one TEC project to several REPD records, for a connection that covers more
than one phase.
"""

import json
import math
import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from pipeline import phases

OVERRIDES_FILE = Path(__file__).resolve().parent / "tec_matches.json"

# TEC technology tag -> compatible REPD technology types.
COMPATIBLE = {
    "wind_onshore": {"Wind Onshore"},
    "wind_offshore": {"Wind Offshore"},
    "solar": {"Solar Photovoltaics"},
    "hydro": {"Small Hydro", "Large Hydro"},
    "tidal": {"Tidal Stream", "Tidal Lagoon", "Shoreline Wave"},
    "storage": {"Battery", "Compressed Air Energy Storage", "Flywheels", "Liquid Air Energy Storage"},
    "pumped_storage": {"Pumped Storage Hydroelectricity"},
    "liquid_air": {"Liquid Air Energy Storage"},
    "hydrogen": {"Hydrogen"},
}

# Words that describe the kind of project or company rather than which project it is.
NOISE_WORDS = {
    "the", "and", "of", "o", "at", "on", "a", "to", "nr", "near", "land",
    "ltd", "limited", "plc", "llp", "uk", "sro", "spv", "project", "projects", "development",
    "wind", "farm", "windfarm", "turbine", "turbines", "offshore", "onshore", "array",
    "solar", "photovoltaic", "battery", "batteries", "storage", "energy", "system", "systems",
    "facility", "power", "station", "park", "centre", "center", "hub", "scheme", "plant",
    "hydro", "hydroelectric", "pumped", "tidal", "hydrogen", "green", "renewable", "renewables",
    "substation", "sub", "grid", "gsp", "kv", "mw", "mwe", "bess", "pv", "ess",
    "tertiary", "connection", "fferm", "platform",
    # Developers whose names prefix project names in the register.
    "sse", "zenobe", "alcemi", "natpower", "elmya", "statkraft", "rwe", "edf", "scottishpower",
}
# Phase numbering: single digits (roman numerals are converted) and single letters. Used to
# separate phases, not names. Longer numbers ("Keithick 16 Solar") are usually capacities; dropped.
PHASE_TOKEN = re.compile(r"^(?:[1-9][a-e]?|[a-e])$")
OTHER_NUMBER = re.compile(r"^\d+[a-z]?$")
ROMAN = {"i": "1", "ii": "2", "iii": "3", "iv": "4", "v": "5", "vi": "6", "iia": "2a", "iib": "2b"}
EXTENSION_WORDS = re.compile(r"\b(?:extension|ext)\b", re.IGNORECASE)
REPOWER_WORDS = re.compile(r"\brepower(?:ing|ed)?\b", re.IGNORECASE)

# Furthest TEC tranche status and REPD stage as steps, for a consistency check only.
STATUS_STEP = {
    "Scoping": 0,
    "Awaiting Consents": 1,
    "Consents Approved": 2,
    "Under Construction/Commissioning": 3,
    "Built": 4,
}
OFF_TRACK = {"stalled", "decommissioned"}
STAGE_STEP = {"in_planning": 1, "consented": 2, "under_construction": 3, "operational": 4}

# Acceptance thresholds.
STRONG_NAME = 0.999  # every distinctive word shared
GOOD_NAME = 0.6
SAME_NAME = 0.05  # names within this of the best count as equally good
CLOSE_CAPACITY = 0.9  # smaller capacity at least 90% of the larger
FAIR_CAPACITY = 0.5  # enough for an exact name
PLAUSIBLE_NAME = 0.34  # below this a candidate is not worth listing for review
NUMBERING_WEIGHT = 1.0  # a phase number counts, but far less than a distinctive word
RARE_WORD = 5  # a word in at most this many REPD names identifies a place


@dataclass
class Candidate:
    repd_id: int
    name: float
    capacity: float | None
    technology: str
    mw: float | None
    stage: str | None
    # Every distinctive word and phase number of the TEC name, one of the words rare, appears in
    # the REPD name.
    contained: bool
    # Why the candidate cannot be accepted automatically, if it cannot. It can still be reviewed.
    blocked: str | None = None


@dataclass
class Match:
    tec_id: str
    repd_ids: list[int]
    method: str  # "name", "name_capacity", "override", "override_none" or "unmatched"
    candidates: list[Candidate] = field(default_factory=list)


@dataclass
class Result:
    matches: list[Match]
    # (TEC Project ID, reason) for overrides that no longer apply.
    stale_overrides: list[tuple[str, str]]

    def by_repd(self) -> dict[int, list[str]]:
        out: dict[int, list[str]] = defaultdict(list)
        for m in self.matches:
            for repd_id in m.repd_ids:
                out[repd_id].append(m.tec_id)
        return dict(out)


def tokens(name: str) -> tuple[frozenset[str], frozenset[str]]:
    """Distinctive name words, and phase numbering words, for a project name."""
    base = phases.base_name(REPOWER_WORDS.sub(" ", name))
    base = re.sub(r"\b\d+(?:\s\d+)?\s?(?:mw|kv)\b", " ", base)  # "49 5mw", "132kv"
    words = [ROMAN.get(w, w) for w in base.split() if w not in NOISE_WORDS]
    core = frozenset(w for w in words if not PHASE_TOKEN.match(w) and not OTHER_NUMBER.match(w))
    numbering = frozenset(w for w in words if PHASE_TOKEN.match(w))
    return core, numbering


def match(projects: list[dict], records: list[dict], overrides: dict | None = None) -> Result:
    overrides = overrides or {"match": [], "noMatch": []}
    records_by_id = {r["id"]: r for r in records}
    record_tokens = {r["id"]: tokens(r["name"]) for r in records}

    # Rarer words carry more weight: "hill" or "moor" says less than "arecleoch".
    document_count: dict[str, int] = defaultdict(int)
    index: dict[str, list[int]] = defaultdict(list)
    for repd_id, (core, _) in record_tokens.items():
        for word in core:
            document_count[word] += 1
            index[word].append(repd_id)
    total = len(records)

    def weight(word: str) -> float:
        return math.log((total + 1) / (document_count.get(word, 0) + 1)) + 1

    forced, forbidden, stale = _read_overrides(overrides, projects, records_by_id)

    matches = []
    for project in projects:
        tec_id = project["id"]
        if tec_id in forced:
            matches.append(Match(tec_id, forced[tec_id], "override" if forced[tec_id] else "override_none"))
            continue
        allowed = set().union(*(COMPATIBLE[t] for t in project["technologies"]))
        core, numbering = tokens(project["name"])
        flags = _flags(project["name"])
        furthest = max(STATUS_STEP[t["status"]] for t in project["tranches"])
        seen = {i for w in core for i in index.get(w, [])}
        candidates = []
        for repd_id in seen:
            record = records_by_id[repd_id]
            if record["technology"] not in allowed or repd_id in forbidden.get(tec_id, set()):
                continue
            other_core, other_numbering = record_tokens[repd_id]
            shared = sum(weight(w) for w in core & other_core)
            shared += NUMBERING_WEIGHT * len(numbering & other_numbering)
            union = sum(weight(w) for w in core | other_core)
            union += NUMBERING_WEIGHT * len(numbering | other_numbering)
            name = shared / union if union else 0.0
            contained = (
                core <= other_core
                and numbering <= other_numbering
                and min(document_count[w] for w in core) <= RARE_WORD
            )
            if name < PLAUSIBLE_NAME and not contained:
                continue
            capacity = _capacity_ratio(project["capacityMw"], record["mw"])
            blocked = None
            if _flags(record["name"]) != flags:
                blocked = "extension or repowering wording differs"
            elif STAGE_STEP.get(record["stage"], 0) > furthest + 1:
                blocked = "REPD stage is well ahead of the TEC status"
            elif capacity is None:
                blocked = "capacity not published"
            candidates.append(
                Candidate(
                    repd_id, round(name, 3), capacity, record["technology"], record["mw"], record["stage"],
                    contained, blocked,
                )
            )
        candidates.sort(key=lambda c: (-c.name, -(c.capacity or 0), c.repd_id))
        matches.append(_decide(project, candidates))
    return Result(matches, stale)


def _decide(project: dict, candidates: list[Candidate]) -> Match:
    """Accept only a clear winner among candidates that are not blocked."""
    tec_id = project["id"]
    listed = candidates[:5]
    eligible = [c for c in candidates if c.blocked is None]
    if not eligible:
        return Match(tec_id, [], "unmatched", listed)
    hybrid = _hybrid(project, eligible)
    if hybrid:
        return Match(tec_id, [c.repd_id for c in hybrid], "name_hybrid", listed)
    top = eligible[0].name
    pool = [c for c in eligible if c.name >= top - SAME_NAME]
    if top >= STRONG_NAME:
        fair = [c for c in pool if c.capacity >= FAIR_CAPACITY]
        close = [c for c in fair if c.capacity >= CLOSE_CAPACITY]
        for narrowed in (fair, close):
            if len(narrowed) == 1:
                return Match(tec_id, [narrowed[0].repd_id], "name", listed)
    elif top >= GOOD_NAME:
        close = [c for c in pool if c.capacity >= CLOSE_CAPACITY]
        if len(close) == 1:
            return Match(tec_id, [close[0].repd_id], "name_capacity", listed)
    # REPD names are often addresses: "Knocknagael, Essich - Battery Storage" for "Knocknagael BESS".
    contained = [c for c in eligible if c.contained and c.capacity >= CLOSE_CAPACITY]
    if len(contained) == 1:
        return Match(tec_id, [contained[0].repd_id], "name_contained", listed)
    return Match(tec_id, [], "unmatched", listed)


def _hybrid(project: dict, eligible: list[Candidate]) -> list[Candidate] | None:
    """For a multi-technology TEC project, one exact-name REPD record per technology, if REPD
    splits it that way and the capacities add up."""
    if len(project["technologies"]) < 2:
        return None
    by_technology: dict[str, list[Candidate]] = defaultdict(list)
    for c in eligible:
        # A refused or decommissioned record is an earlier scheme, not the other half of this one.
        if c.name >= STRONG_NAME and c.stage not in OFF_TRACK:
            by_technology[c.technology].append(c)
    if len(by_technology) < 2 or any(len(group) > 1 for group in by_technology.values()):
        return None
    picked = sorted((group[0] for group in by_technology.values()), key=lambda c: c.repd_id)
    total = _capacity_ratio(project["capacityMw"], sum(c.mw for c in picked))
    return picked if total is not None and total >= FAIR_CAPACITY else None


def _flags(name: str) -> tuple[bool, bool]:
    return bool(EXTENSION_WORDS.search(name)), bool(REPOWER_WORDS.search(name))


def _capacity_ratio(a: float | None, b: float | None) -> float | None:
    if not a or not b or a <= 0 or b <= 0:
        return None
    return round(min(a, b) / max(a, b), 3)


def _read_overrides(overrides: dict, projects: list[dict], records_by_id: dict):
    tec_ids = {p["id"] for p in projects}
    forced: dict[str, list[int]] = {}
    forbidden: dict[str, set[int]] = defaultdict(set)
    stale = []
    for entry in overrides.get("match", []):
        # "repd" is a list of REPD IDs; an empty list confirms the project is not in REPD.
        tec_id, repd_ids = entry["tec"], entry["repd"]
        missing = [i for i in repd_ids if i not in records_by_id]
        if tec_id not in tec_ids:
            stale.append((tec_id, "TEC project no longer in the register"))
        elif missing:
            stale.append((tec_id, f"REPD records {missing} no longer in REPD"))
        else:
            forced[tec_id] = repd_ids
    for entry in overrides.get("noMatch", []):
        tec_id = entry["tec"]
        if tec_id not in tec_ids:
            stale.append((tec_id, "TEC project no longer in the register"))
        else:
            forbidden[tec_id].add(entry["repd"])
    return forced, forbidden, stale


def load_overrides(path: Path = OVERRIDES_FILE) -> dict:
    if not path.exists():
        return {"match": [], "noMatch": []}
    return json.loads(path.read_text(encoding="utf-8"))
