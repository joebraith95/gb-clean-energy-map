from pipeline import tec_match, tec_records


def project(tec_id="a", name="Hill Wind Farm", technologies=("wind_onshore",), statuses=("Scoping",),
            gate=None, mw=50, site="Hill 132kV"):
    tranches = [{"stage": None, "status": s, "gate": gate, "changeMw": mw, "cumulativeMw": mw,
                 "effectiveFrom": "2030-10-31"} for s in statuses]
    return {"id": tec_id, "name": name, "customer": "Hill Ltd", "connectionSite": site, "hostTo": "SPT",
            "agreementType": "Direct Connection", "technologies": list(technologies), "capacityMw": mw,
            "tranches": tranches}


SITES = {"Hill 132kV": {"osm": "way/1", "name": "Hill Substation", "x": 300000, "y": 600000}}


def build(projects, matches=None, sites=SITES):
    matches = matches or [tec_match.Match(p["id"], [], "unmatched") for p in projects]
    return {r["id"]: r for r in tec_records.build(tec_match.Result(matches, []), projects, sites)}


def test_unmatched_scoping_project_is_early_development_at_its_substation():
    r = build([project()])["tec-a"]
    assert (r["stage"], r["technology"], r["layer"], r["hidden"]) == ("early_development", "Wind Onshore", "generation", None)
    assert (r["x"], r["y"], r["site"], r["mw"]) == (300000, 600000, "Hill 132kV", 50)
    assert r["details"]["kind"] == "tec"
    assert r["details"]["substation"] == {"name": "Hill Substation", "osm": "way/1"}


def test_matched_projects_get_no_record():
    assert build([project()], [tec_match.Match("a", [5], "name")]) == {}


def test_stage_comes_from_the_furthest_tranche():
    assert build([project(statuses=("Built", "Scoping"))])["tec-a"]["stage"] == "operational"
    assert build([project(statuses=("Consents Approved",))])["tec-a"]["stage"] == "consented"


def test_hybrid_uses_generation_and_storage_needs_a_battery_name():
    assert build([project(technologies=("solar", "storage"))])["tec-a"]["technology"] == "Solar Photovoltaics"
    assert build([project(technologies=("storage",), name="Hill BESS")])["tec-a"]["technology"] == "Battery"
    unnamed = build([project(technologies=("storage",), name="Hill Energy Park")])["tec-a"]
    assert (unnamed["technology"], unnamed["layer"]) == ("Storage (type not published)", "flexibility")


def test_hidden_reasons():
    assert build([project(site="Nowhere")])["tec-a"]["hidden"] == "site_not_located"
    assert build([project(mw=0)])["tec-a"]["hidden"] == "no_capacity"
    lookalike = tec_match.Candidate(5, 1.0, 0.9, "Wind Onshore", 45, "in_planning", False, "REPD stage is well ahead of the TEC status")
    dup = build([project()], [tec_match.Match("a", [], "unmatched", [lookalike])])["tec-a"]
    assert dup["hidden"] == "possible_repd_duplicate"
    confirmed = build([project()], [tec_match.Match("a", [], "override_none", [lookalike])])["tec-a"]
    assert confirmed["hidden"] is None


def test_badge_and_contracted_dates_for_gate_2_only():
    gate2 = build([project(gate="2")])["tec-a"]["details"]
    assert gate2["connection"]["badge"] == "gate2"
    assert gate2["tranches"][0]["contractedDate"] == "2030-10-31"
    gate1 = build([project(gate="1")])["tec-a"]["details"]
    assert gate1["connection"] is None and gate1["tranches"][0]["contractedDate"] is None
    built = build([project(statuses=("Built",))])["tec-a"]["details"]
    assert built["connection"]["badge"] == "energised"
