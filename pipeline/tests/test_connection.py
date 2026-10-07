from pipeline import connection, tec_match


def tranche(status="Scoping", gate=None, date="2030-10-31"):
    return {"status": status, "gate": gate, "effectiveFrom": date}


def project(tec_id, *tranches, site="Hill 132kV"):
    return {"id": tec_id, "name": f"Project {tec_id}", "connectionSite": site, "tranches": list(tranches)}


def records(*ids, stage="operational"):
    return [{"id": i, "stage": stage} for i in ids]


def result(*pairs):
    return tec_match.Result([tec_match.Match(t, ids, "name") for t, ids in pairs], [])


def test_built_tranche_means_energised_even_with_a_gate_2_extension():
    projects = [project("t1", tranche("Built"), tranche("Consents Approved", "2"))]
    (c,) = connection.badges(result(("t1", [5])), projects, records(5)).values()
    assert c["badge"] == "energised"
    assert c["contractedDate"] is None


def test_repd_wins_when_tec_says_built_but_repd_does_not():
    projects = [project("t1", tranche("Built", date=None), tranche("Consents Approved", "2", "2028-04-01"))]
    c = connection.badges(result(("t1", [5])), projects, records(5, stage="under_construction"))[5]
    assert (c["badge"], c["contractedDate"]) == ("gate2", "2028-04-01")
    only_built = [project("t2", tranche("Built"))]
    assert connection.badges(result(("t2", [6])), only_built, records(6, stage="consented")) == {}


def test_gate_2_takes_the_earliest_contracted_date_and_its_site():
    projects = [
        project("t1", tranche("Consents Approved", "2", "2029-04-01"), site="A"),
        project("t2", tranche("Scoping", "2", "2027-10-30"), site="B"),
    ]
    c = connection.badges(result(("t1", [5]), ("t2", [5])), projects, records(5))[5]
    assert (c["badge"], c["contractedDate"], c["site"]) == ("gate2", "2027-10-30", "B")
    assert [t["projectId"] for t in c["tec"]] == ["t1", "t2"]


def test_gate_1_blank_gate_and_unmatched_records_get_no_badge():
    projects = [project("t1", tranche("Consents Approved", "1")), project("t2", tranche("Scoping"))]
    assert connection.badges(result(("t1", [5]), ("t2", [6]), ("t3", [])), projects + [project("t3")], records(5, 6)) == {}


def test_one_tec_project_can_badge_several_records():
    projects = [project("t1", tranche("Under Construction/Commissioning", "2"))]
    assert set(connection.badges(result(("t1", [5, 6])), projects, records(5, 6))) == {5, 6}


def test_stage_mismatches_list_built_records_not_operational_in_repd():
    projects = [project("t1", tranche("Built")), project("t2", tranche("Built")), project("t3", tranche("Scoping", "2"))]
    recs = [{"id": 5, "stage": "operational"}, {"id": 6, "stage": "under_construction"}, {"id": 7, "stage": "consented"}]
    assert connection.stage_mismatches(result(("t1", [5]), ("t2", [6]), ("t3", [7])), projects, recs) == [6]
