from app.engine.fagverk_grounding import ground_message


def test_public_administration_inflections_ground_to_forvaltning() -> None:
    source = """
    I denne artikkelen diskuterer vi hvordan den norske statsforvaltningen bruker evalueringer.
    Forvaltningen arbeider mer systematisk med evalueringene, og oppdragsgiver skal bruke en evaluering til læring og forbedring.
    Respondentene etterlyser bedre integrering av evalueringsresultater i mål- og resultatstyringssystemet og tettere oppfølging.
    Offentlig sektor trenger ikke flere evalueringer, men høyere kvalitet og mer langsiktig styring.
    """
    grounding = ground_message(source)
    assert grounding["status"] == "grounded", grounding
    assert grounding["match"]["subject_id"] == "politikk"
    assert grounding["match"]["chapter_id"] == "forvaltning"
    assert "forvaltning" in grounding["match"]["matched_terms"]
    assert "evaluering" in grounding["match"]["matched_terms"]
    assert "mål- og resultatstyring" in grounding["match"]["matched_terms"]
