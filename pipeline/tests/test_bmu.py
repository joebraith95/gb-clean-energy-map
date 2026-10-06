import json

import pytest

from pipeline import bmu


def farm(ids, units):
    return {"repdIds": ids, "units": units, "checked": "2026-10-06"}


RECORDS = [{"id": 1}, {"id": 2}, {"id": 3}]


def test_valid_map_passes_and_publishes_without_review_fields(tmp_path):
    farms = bmu.validate({"farms": [farm([1], ["T_A-1"]), farm([2, 3], ["T_B-1", "T_B-2"])]}, RECORDS)
    bmu.write(farms, tmp_path)
    published = json.loads((tmp_path / "bmu-map.json").read_text(encoding="utf-8"))
    assert published == {"farms": [{"repdIds": [1], "units": ["T_A-1"]}, {"repdIds": [2, 3], "units": ["T_B-1", "T_B-2"]}]}


@pytest.mark.parametrize(
    "farms",
    [
        [farm([9], ["T_A-1"])],  # REPD ID not in the data
        [farm([1], ["T_A-1"]), farm([1], ["T_B-1"])],  # REPD ID twice
        [farm([1], ["T_A-1"]), farm([2], ["T_A-1"])],  # unit twice
        [farm([1], ["HOWAO-1"])],  # not an Elexon unit ID
        [farm([], ["T_A-1"])],  # empty
    ],
)
def test_problems_stop_the_pipeline(farms):
    with pytest.raises(ValueError):
        bmu.validate({"farms": farms}, RECORDS)


def test_the_real_map_is_well_formed():
    mapping = bmu.load()
    ids = [i for f in mapping["farms"] for i in f["repdIds"]]
    units = [u for f in mapping["farms"] for u in f["units"]]
    assert len(ids) == len(set(ids))
    assert len(units) == len(set(units))
    assert all(f["checked"] for f in mapping["farms"])
