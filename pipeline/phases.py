"""Group REPD records that are phases of the same project. See "Phased projects" in docs/SPEC.md.

REPD has no field linking phases, so groups come from names: same technology, names that match once
phase or extension wording is removed, at least one name that mentions a phase or extension, and
each member within 10km of another member. pipeline/phase_links.json can add or remove links by hand.
"""

import json
import math
import re
from collections import defaultdict
from pathlib import Path

LINKS_FILE = Path(__file__).resolve().parent / "phase_links.json"
MAX_DISTANCE_M = 10_000

_NUMBER = r"(?:\d+|[ivx]+|one|two|three|four|five|[a-e])"
PHASE_WORDS = re.compile(rf"\b(?:phase|extension|ext)\b\.?(?:\s*{_NUMBER}\b)?", re.IGNORECASE)


def base_name(name: str) -> str:
    """Lower-case name with phase and extension wording and punctuation removed."""
    stripped = PHASE_WORDS.sub(" ", name.lower())
    stripped = re.sub(r"[^a-z0-9]+", " ", stripped)
    return re.sub(r"\s+", " ", stripped).strip()


def mentions_phase(name: str) -> bool:
    return PHASE_WORDS.search(name) is not None


def load_links(path: Path = LINKS_FILE) -> dict:
    if not path.exists():
        return {"link": [], "unlink": []}
    return json.loads(path.read_text(encoding="utf-8"))


def group_phases(records: list[dict], links: dict | None = None) -> list[list[int]]:
    """Return groups of REPD IDs, each sorted, for records that are phases of one project."""
    links = links or {"link": [], "unlink": []}
    by_key: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in records:
        base = base_name(r["name"])
        if base:
            by_key[(base, r["technology"])].append(r)

    parent: dict[int, int] = {}

    def find(i: int) -> int:
        parent.setdefault(i, i)
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(a: int, b: int) -> None:
        parent[find(a)] = find(b)

    unlinked = {frozenset(pair) for pair in links.get("unlink", [])}
    for members in by_key.values():
        if len(members) < 2 or not any(mentions_phase(m["name"]) for m in members):
            continue
        for i, a in enumerate(members):
            for b in members[i + 1 :]:
                if frozenset((a["id"], b["id"])) in unlinked:
                    continue
                if _distance(a, b) <= MAX_DISTANCE_M:
                    union(a["id"], b["id"])

    known = {r["id"] for r in records}
    for group in links.get("link", []):
        present = [i for i in group if i in known]
        for other in present[1:]:
            union(present[0], other)

    groups: dict[int, list[int]] = defaultdict(list)
    for i in parent:
        groups[find(i)].append(i)
    return sorted(sorted(g) for g in groups.values() if len(g) > 1)


def _distance(a: dict, b: dict) -> float:
    if None in (a["x"], a["y"], b["x"], b["y"]):
        return math.inf
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"])
