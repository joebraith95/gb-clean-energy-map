from pipeline import substations


def element(osm_id, name, lat, lon, voltage="132000", kind=None, kind_tag="way"):
    tags = {"name": name, "power": "substation"}
    if voltage:
        tags["voltage"] = voltage
    if kind:
        tags["substation"] = kind
    return {"type": kind_tag, "id": osm_id, "center": {"lat": lat, "lon": lon}, "tags": tags}


def index(*elements):
    return substations.index_by_name(substations.high_voltage_substations(list(elements)))


def test_site_key_drops_voltages_notes_and_generic_words():
    assert substations.site_key("Nairn 132/33kV Grid Supply Point Substation") == "nairn"
    assert substations.site_key("Carntyne (SPD) GSP") == "carntyne"
    assert substations.site_key("DEVOL MOOR 132/33KV GRID SUPPLY POINT SUBSTATION") == "devol moor"
    assert substations.site_key("Slough East 132kV Substation") == "slough east"
    assert substations.site_key("Cilfynydd Supergrid Substation") == "cilfynydd"
    assert substations.site_key("Connah's Quay 400kV AIS") == substations.site_key("Connahs Quay GIS Substation")


def test_only_high_voltage_or_transmission_substations_count():
    subs = substations.high_voltage_substations([
        element(1, "Big", 55.0, -3.0, "400000;132000"),
        element(2, "Small", 55.0, -3.0, "11000"),
        element(3, "Untagged transmission", 55.0, -3.0, None, "transmission"),
        element(4, "Untagged", 55.0, -3.0, None),
    ])
    assert [s["name"] for s in subs] == ["Big", "Untagged transmission"]


def test_locates_a_unique_name_in_bng():
    found, reason = substations.locate("Abernethy GSP", "SHET", index(element(7, "Abernethy Substation", 56.33, -3.31)))
    assert reason == "name"
    assert found["osm"] == "way/7"
    assert 300_000 < found["x"] < 340_000 and 700_000 < found["y"] < 740_000


def test_planned_sites_are_never_located():
    idx = index(element(1, "Chesterfield Substation", 53.2, -1.4))
    assert substations.locate("Chesterfield 400kV Substation (Not yet constructed)", "NGET", idx) == (None, "planned site")
    assert substations.locate("West Anglia Connection Node F 400kV", "NGET", idx) == (None, "planned site")


def test_owner_area_rules_out_a_namesake_at_the_other_end_of_the_country():
    idx = index(element(1, "Newton Substation", 52.5, -1.5), element(2, "Newton Substation", 57.5, -4.2))
    found, _ = substations.locate("Newton 132kV", "SHET", idx)
    assert found["osm"] == "way/2"


def test_namesakes_far_apart_stay_unlocated():
    idx = index(element(1, "Newton Substation", 52.5, -1.5), element(2, "Newton Substation", 51.5, -0.5))
    assert substations.locate("Newton 132kV", "NGET", idx) == (None, "several substations of that name")


def test_several_compounds_at_one_site_pick_a_stable_one():
    idx = index(element(9, "Harker Substation", 54.94, -2.96, "400000"), element(3, "Harker", 54.941, -2.961, "132000"))
    found, _ = substations.locate("Harker 400kV Substation", "NGET", idx)
    assert found["osm"] == "way/3"
