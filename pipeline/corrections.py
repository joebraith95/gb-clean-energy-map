"""Apply hand-maintained fixes for clear errors in REPD. See "Corrections" in docs/SPEC.md."""

import json
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

CORRECTIONS_FILE = Path(__file__).resolve().parent / "corrections.json"


@dataclass
class Outcome:
    applied: list[int] = field(default_factory=list)
    # (id, reason) for corrections skipped because REPD no longer matches what they were written against.
    stale: list[tuple[int, str]] = field(default_factory=list)
    # REPD ID -> card notes for the corrections applied to it.
    notes: dict[int, list[str]] = field(default_factory=dict)


def load_corrections(path: Path = CORRECTIONS_FILE) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


def apply(df: pd.DataFrame, corrections: list[dict]) -> Outcome:
    """Apply corrections to the cleaned REPD frame in place."""
    outcome = Outcome()
    for correction in corrections:
        ref = str(correction["id"])
        matches = df.index[df["Ref ID"] == ref]
        if len(matches) != 1:
            outcome.stale.append((correction["id"], "record not found"))
            continue
        i = matches[0]
        changed = [
            column
            for column, values in correction["fields"].items()
            if df.at[i, column] != values["repd"]
        ]
        if changed:
            outcome.stale.append((correction["id"], f"REPD value changed in {', '.join(changed)}"))
            continue
        for column, values in correction["fields"].items():
            df.at[i, column] = values["corrected"]
        outcome.applied.append(correction["id"])
        outcome.notes.setdefault(correction["id"], []).append(correction["note"])
    return outcome
