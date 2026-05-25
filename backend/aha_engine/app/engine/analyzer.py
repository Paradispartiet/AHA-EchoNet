from __future__ import annotations

from app.schemas import AnalyzeRequest, CanonicalAhaAnalysis, Confidence, HistoryGoLink


def _normalize(message: str) -> str:
    return " ".join(message.lower().split())


def _contains_any(message: str, phrases: list[str]) -> bool:
    return any(phrase in message for phrase in phrases)


def detect_content_type(message: str) -> str:
    normalized = _normalize(message)

    if _contains_any(
        normalized,
        ["modul", "analyseklassifisering", "grensesnitt", "regressjoner", "testdata"],
    ):
        return "project_note"

    if (
        " jeg " in f" {normalized} "
        and _contains_any(normalized, ["i dag", "kjente jeg", "følelse", "kanskje handler det"])
    ):
        return "day_log"

    if _contains_any(
        normalized,
        [
            "pinse",
            "den hellige ånd",
            "kirkens fødselsdag",
            "apostlene",
            "morgenbladet",
            "idédebatt",
            "kulturkritikk",
            "redaksjonell profil",
            "offentlighet",
            "nav-reformen",
            "velferdsforvaltningen",
            "etatskulturer",
            "styringsutfordringer",
            "samordning",
            "roman",
            "tilknytningsteori",
            "ambivalent tilknytning",
            "fortellergrep",
            "hjemmel i lov",
            "legitimt formål",
            "forholdsmessig",
            "vedtaket",
            "rettigheter",
        ],
    ):
        return "academic_article"

    return "general"


def detect_domain(message: str) -> str:
    normalized = _normalize(message)

    if _contains_any(
        normalized,
        ["morgenbladet", "idédebatt", "kulturkritikk", "redaksjonell profil", "offentlighet", "avis"],
    ):
        return "institutional_media_history"

    if _contains_any(
        normalized,
        ["nav-reformen", "velferdsforvaltningen", "etatskulturer", "styringsutfordringer", "samordning"],
    ):
        return "public_administration_reform"

    if _contains_any(normalized, ["roman", "tilknytningsteori", "ambivalent tilknytning", "fortellergrep"]):
        return "literary_attachment"

    return "generic_academic"


def build_history_go_links(domain: str, message: str) -> list[HistoryGoLink]:
    normalized = _normalize(message)

    if domain == "institutional_media_history" and _contains_any(
        normalized,
        ["morgenbladet", "idédebatt", "kulturkritikk", "redaksjonell profil", "offentlighet", "avis"],
    ):
        return [
            HistoryGoLink(
                type="topic",
                id="morgenbladet",
                title="Morgenbladet",
                reason="Teksten handler om pressehistorie, offentlighet og institusjonell utvikling.",
            )
        ]

    if domain == "public_administration_reform" and _contains_any(
        normalized,
        ["nav-reformen", "velferdsforvaltningen", "etatskulturer", "styringsutfordringer", "samordning"],
    ):
        return [
            HistoryGoLink(
                type="topic",
                id="nav_reformen",
                title="NAV-reformen",
                reason="Teksten handler om styring, organisering og måloppnåelse i offentlig forvaltning.",
            )
        ]

    return []


def analyze_message(request: AnalyzeRequest) -> CanonicalAhaAnalysis:
    message = request.message.strip()

    content_type = detect_content_type(message)
    domain = detect_domain(message)
    history_go_links = build_history_go_links(domain, message)

    warnings: list[str] = []
    if not message:
        warnings.append("Meldingen er tom; analysen bruker standard fallback.")
    elif len(message) < 20:
        warnings.append("Meldingen er veldig kort; analysen er ekstra usikker.")

    if content_type == "general":
        warnings.append("Lav presisjon: teksten er uklar og inneholder få sterke signaler.")

    return CanonicalAhaAnalysis(
        contentType=content_type,
        domain=domain,
        theme="foreløpig tema",
        mainTension="foreløpig hovedspenning",
        keyInsight="Foreløpig analyse fra Python AHA Engine.",
        fieldConnections=[],
        historyGoLinks=history_go_links,
        suggestedActions=[
            "Sammenlign med eksisterende JavaScript-analyse.",
            "Bruk fixture-settet for videre kalibrering.",
        ],
        confidence=Confidence(
            contentType=0.7 if content_type != "general" else 0.35,
            domain=0.7 if domain != "generic_academic" else 0.4,
            theme=0.2,
            mainTension=0.2,
            historyGoLinks=0.8 if history_go_links else 0.0,
        ),
        warnings=warnings,
    )
