from pipeline.phases import base_name, group_phases, mentions_phase


def rec(id, name, x=100_000, y=100_000, technology="Solar Photovoltaics"):
    return {"id": id, "name": name, "technology": technology, "x": x, "y": y}


def test_base_name_strips_phase_wording():
    assert base_name("Caddington Solar Farm (Phase 1)") == "caddington"
    assert base_name("Stowbridge Farm - Extension (Phase 2)") == "stowbridge farm"
    assert base_name("Chittering Solar Farm - extension 2") == "chittering"
    assert base_name("Whitelee Windfarm Extension Phase 3") == "whitelee"


def test_base_name_ignores_generic_words_and_lettered_phases():
    assert base_name("Crystal Rig Wind Farm Phase 2a") == base_name("Crystal Rig Phase 1")
    assert base_name("Nevendon Battery Storage Extension") == "nevendon"


def test_mentions_phase():
    assert mentions_phase("Pingry Farm - Phase 2")
    assert not mentions_phase("Phaseless Farm")


def test_groups_phases_of_one_project():
    records = [
        rec(1, "Caddington Solar Farm (Phase 1)"),
        rec(2, "Caddington Solar Farm (Phase 2)", x=103_000),
        rec(3, "Caddington Solar Farm"),
        rec(4, "Elsewhere Solar Farm"),
    ]
    assert group_phases(records) == [[1, 2, 3]]


def test_requires_phase_wording_same_technology_and_proximity():
    same_name_no_phase = [rec(1, "Home Farm"), rec(2, "Home Farm")]
    assert group_phases(same_name_no_phase) == []

    other_tech = [rec(1, "Moor Phase 1"), rec(2, "Moor Phase 2", technology="Battery")]
    assert group_phases(other_tech) == []

    far_apart = [rec(1, "Moor Phase 1"), rec(2, "Moor Phase 2", x=200_000)]
    assert group_phases(far_apart) == []


def test_manual_links_and_unlinks():
    records = [rec(1, "Moor Phase 1"), rec(2, "Moor Phase 2"), rec(3, "Different Name")]
    assert group_phases(records, {"link": [], "unlink": [[1, 2]]}) == []
    assert group_phases(records, {"link": [[1, 3]], "unlink": []}) == [[1, 2, 3]]
