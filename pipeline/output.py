"""Write the map index and card detail shards, and summarise them for the report."""

import json
from collections import Counter
from pathlib import Path

from pipeline.stages import Stage

DETAIL_SHARDS = 64


def write(records: list[dict], source: dict, data_dir: Path) -> None:
    """Write data/projects.json (compact map index) and data/details/NN.json (card details)."""
    technologies = sorted({r["technology"] for r in records})
    stages = [s.value for s in Stage]
    hidden_reasons = sorted({r["hidden"] for r in records if r["hidden"]})

    index = {
        "source": source,
        "technologies": technologies,
        "stages": stages,
        "hiddenReasons": hidden_reasons,
        "detailShards": DETAIL_SHARDS,
        # Columnar arrays, one entry per project, to keep the file small.
        # tech, stage and hidden are indexes into the lists above; -1 means none.
        "id": [r["id"] for r in records],
        "name": [r["name"] for r in records],
        "x": [r["x"] for r in records],
        "y": [r["y"] for r in records],
        "mw": [r["mw"] for r in records],
        "tech": [technologies.index(r["technology"]) for r in records],
        "flex": [1 if r["layer"] == "flexibility" else 0 for r in records],
        "stage": [stages.index(r["stage"]) if r["stage"] else -1 for r in records],
        "hidden": [hidden_reasons.index(r["hidden"]) if r["hidden"] else -1 for r in records],
        # Phase group number shared by phases of one project, or -1.
        "group": [r.get("group", -1) for r in records],
    }
    data_dir.mkdir(parents=True, exist_ok=True)
    write_json(data_dir / "projects.json", index)

    shards: dict[int, dict] = {n: {} for n in range(DETAIL_SHARDS)}
    for r in records:
        shards[r["id"] % DETAIL_SHARDS][str(r["id"])] = r["details"]
    details_dir = data_dir / "details"
    details_dir.mkdir(exist_ok=True)
    for n, shard in shards.items():
        write_json(details_dir / f"{n:02d}.json", shard)


def summarise(index: dict) -> dict:
    """Counts from a projects.json index, for before and after comparisons."""
    stages, techs, reasons = index["stages"], index["technologies"], index["hiddenReasons"]
    stage_names = [stages[s] if s >= 0 else "none" for s in index["stage"]]
    tech_names = [techs[t] for t in index["tech"]]
    on_map = [h < 0 for h in index["hidden"]]
    return {
        "total": len(index["id"]),
        "on_map": sum(on_map),
        "on_map_1mw": sum(1 for shown, mw in zip(on_map, index["mw"]) if shown and mw >= 1),
        "by_stage": Counter(stage_names),
        "by_technology": Counter(tech_names),
        "on_map_by_stage": Counter(s for s, shown in zip(stage_names, on_map) if shown),
        "on_map_by_technology": Counter(t for t, shown in zip(tech_names, on_map) if shown),
        "hidden_by_reason": Counter(reasons[h] for h in index["hidden"] if h >= 0),
    }


def read_index(data_dir: Path) -> dict | None:
    path = data_dir / "projects.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
