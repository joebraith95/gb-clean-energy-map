import pandas as pd

from pipeline import corrections

SWAP = {
    "id": 5,
    "fields": {
        "X-coordinate": {"repd": "870800", "corrected": "264300"},
        "Y-coordinate": {"repd": "264300", "corrected": "870800"},
    },
    "reason": "test",
    "note": "Location corrected from REPD (X and Y were swapped)",
}


def frame(x: str, y: str) -> pd.DataFrame:
    return pd.DataFrame([{"Ref ID": "5", "X-coordinate": x, "Y-coordinate": y}])


def test_applies_when_repd_still_matches():
    df = frame("870800", "264300")
    outcome = corrections.apply(df, [SWAP])
    assert outcome.applied == [5]
    assert (df.at[0, "X-coordinate"], df.at[0, "Y-coordinate"]) == ("264300", "870800")
    assert outcome.notes == {5: [SWAP["note"]]}


def test_skips_and_flags_when_repd_has_changed():
    df = frame("264300", "870800")
    outcome = corrections.apply(df, [SWAP])
    assert outcome.applied == []
    assert outcome.stale[0][0] == 5
    assert df.at[0, "X-coordinate"] == "264300"


def test_flags_missing_record():
    outcome = corrections.apply(pd.DataFrame([{"Ref ID": "9", "X-coordinate": "", "Y-coordinate": ""}]), [SWAP])
    assert outcome.stale == [(5, "record not found")]


def test_corrections_file_is_well_formed():
    for correction in corrections.load_corrections():
        assert correction["reason"] and correction["note"]
        for values in correction["fields"].values():
            assert set(values) == {"repd", "corrected"}
