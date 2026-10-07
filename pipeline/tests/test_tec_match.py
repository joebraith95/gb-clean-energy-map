from pipeline import tec_match


def project(name, mw, technologies=("wind_onshore",), status="Built", tec_id="t1"):
    return {
        "id": tec_id,
        "name": name,
        "technologies": list(technologies),
        "capacityMw": mw,
        "tranches": [{"status": status, "gate": None}],
    }


def record(repd_id, name, mw, technology="Wind Onshore", stage="operational"):
    return {"id": repd_id, "name": name, "mw": mw, "technology": technology, "stage": stage}


# Unrelated records so word rarity behaves as it does on the full REPD.
FILLER = [record(1000 + i, f"Filler {i} Farm", 10) for i in range(30)]


def run(projects, records, overrides=None):
    return {m.tec_id: m for m in tec_match.match(projects, records + FILLER, overrides).matches}


def test_tokens_drop_generic_words_and_convert_roman_numerals():
    assert tec_match.tokens("Lairg II Wind Farm") == (frozenset({"lairg"}), frozenset({"2"}))
    assert tec_match.tokens("Rothienorman 50MW BESS") == (frozenset({"rothienorman"}), frozenset())
    assert tec_match.tokens("Glens of Foudland Wind (SRO)") == (frozenset({"glens", "foudland"}), frozenset())


def test_exact_name_matches():
    m = run([project("Triton Knoll Offshore Wind Farm", 824, ["wind_offshore"])],
            [record(1, "Triton Knoll", 857, "Wind Offshore")])["t1"]
    assert (m.repd_ids, m.method) == ([1], "name")


def test_technology_must_be_compatible():
    m = run([project("Burbo Bank", 90, ["wind_offshore"])], [record(1, "Burbo Bank", 90, "Battery")])["t1"]
    assert m.repd_ids == [] and m.candidates == []


def test_capacity_separates_phases_of_one_name():
    m = run([project("Clash Gour", 210, status="Awaiting Consents")],
            [record(1, "Clash Gour", 225, stage="in_planning"), record(2, "Clash Gour", 50, stage="in_planning")])["t1"]
    assert m.repd_ids == [1]


def test_phase_numbering_separates_phases():
    m = run([project("Lairg II Wind Farm", 50)], [record(1, "Lairg 2 Wind Farm", 49.9), record(2, "Lairg Wind Farm", 7.5)])["t1"]
    assert m.repd_ids == [1]


def test_equally_good_candidates_stay_unmatched():
    m = run([project("Thanet", 300, ["wind_offshore"])],
            [record(1, "Thanet", 300, "Wind Offshore"), record(2, "Thanet", 310, "Wind Offshore")])["t1"]
    assert m.method == "unmatched"
    assert [c.repd_id for c in m.candidates] == [1, 2]


def test_extension_must_match_extension():
    m = run([project("Lorg Extension Wind Farm", 33, status="Scoping")], [record(1, "Lorg Windfarm", 33, stage="consented")])["t1"]
    assert m.repd_ids == []
    assert m.candidates[0].blocked == "extension or repowering wording differs"


def test_repd_stage_well_ahead_of_tec_is_blocked():
    m = run([project("Edinbane Windfarm", 41.4, status="Scoping")], [record(1, "Edinbane Wind Farm", 41.4)])["t1"]
    assert m.repd_ids == []
    assert m.candidates[0].blocked == "REPD stage is well ahead of the TEC status"


def test_exact_name_with_very_different_capacity_is_not_accepted():
    m = run([project("Hunterston Battery Storage Facility", 200, ["storage"], "Consents Approved")],
            [record(1, "Hunterston", 5, "Battery", "consented")])["t1"]
    assert m.repd_ids == []


def test_close_name_needs_close_capacity():
    projects = [project("Clyde North", 374.5), project("Clyde North", 20, tec_id="t2")]
    common = [record(100 + i, f"North Field {i}", 5) for i in range(10)]  # "north" is a common word
    matches = run(projects, [record(1, "Clyde Wind Farm", 350)] + common)
    assert (matches["t1"].repd_ids, matches["t1"].method) == ([1], "name_capacity")
    assert matches["t2"].repd_ids == []


def test_name_contained_in_an_address_style_repd_name():
    m = run([project("Knocknagael BESS", 200, ["storage"], "Awaiting Consents")],
            [record(1, "Knocknagael, Essich - Battery Storage", 200, "Battery", "in_planning")])["t1"]
    assert (m.repd_ids, m.method) == ([1], "name_contained")


def test_contained_name_must_agree_on_phase_numbering():
    m = run([project("Dogger Bank Project 4 (Dogger Bank B)", 1200, ["wind_offshore"])],
            [record(1, "Dogger Bank C (was Teesside A)", 1200, "Wind Offshore", "under_construction")])["t1"]
    assert m.repd_ids == []


def test_overrides_force_forbid_and_go_stale():
    projects = [project("Kennoxhead Wind Farm", 112, tec_id="t1"), project("Glen App", 22, tec_id="t2")]
    records = [record(1, "Kennoxhead Wind Farm", 62), record(2, "Kennoxhead Wind Farm Extension", 38.4),
               record(3, "Glen App", 22)]
    overrides = {
        "match": [{"tec": "t1", "repd": [1, 2], "reason": "covers both phases"},
                  {"tec": "gone", "repd": [], "reason": "x"}],
        "noMatch": [{"tec": "t2", "repd": 3, "reason": "different site"}],
    }
    result = tec_match.match(projects, records + FILLER, overrides)
    matches = {m.tec_id: m for m in result.matches}
    assert (matches["t1"].repd_ids, matches["t1"].method) == ([1, 2], "override")
    assert matches["t2"].repd_ids == []
    assert result.stale_overrides == [("gone", "TEC project no longer in the register")]
    assert result.by_repd() == {1: ["t1"], 2: ["t1"]}


def test_override_with_empty_list_confirms_not_in_repd():
    overrides = {"match": [{"tec": "t1", "repd": [], "reason": "not in REPD"}], "noMatch": []}
    m = run([project("Glen App", 22)], [record(1, "Glen App", 22)], overrides)["t1"]
    assert (m.repd_ids, m.method) == ([], "override_none")


def test_hybrid_project_matches_one_record_per_technology():
    m = run([project("Bilbo Farm", 67.1, ["solar", "storage"], "Under Construction/Commissioning")],
            [record(1, "Bilbo Solar Farm", 36.6, "Solar Photovoltaics", "under_construction"),
             record(2, "Bilbo Solar Farm Energy Storage", 40, "Battery", "under_construction")])["t1"]
    assert (m.repd_ids, m.method) == ([1, 2], "name_hybrid")


def test_hybrid_needs_capacities_to_add_up():
    m = run([project("Worset Lane", 37.5, ["solar", "storage"], "Consents Approved")],
            [record(1, "Worset Lane - Solar Farm", 49.99, "Solar Photovoltaics", "consented"),
             record(2, "Worset Lane - Battery Energy Storage", 200, "Battery", "consented")])["t1"]
    assert m.method != "name_hybrid"


def test_long_numbers_are_capacities_not_phases():
    assert tec_match.tokens("Keithick 16 Solar & BESS") == (frozenset({"keithick"}), frozenset())


def test_hybrid_ignores_refused_earlier_schemes():
    m = run([project("Cloud Hill Windfarm", 60, ["storage", "wind_onshore"], "Awaiting Consents")],
            [record(1, "Cloud Hill Wind Farm", 56, stage="consented"),
             record(2, "Cloud Hill Wind Farm", 34, "Battery", "stalled")])["t1"]
    assert m.method != "name_hybrid"
    assert m.repd_ids == [1]
