from __future__ import annotations

from app.schemas import AnalyzeRequest, CanonicalAhaAnalysis, Confidence


def analyze_message(request: AnalyzeRequest) -> CanonicalAhaAnalysis:
    message = request.message.strip()

    warnings = ["Placeholder-analyse: Python Engine er ikke kalibrert ennå."]
    if not message:
        warnings.append("Meldingen er tom; analysen bruker standard fallback.")
    elif len(message) < 20:
        warnings.append("Meldingen er veldig kort; analysen er ekstra usikker.")

    return CanonicalAhaAnalysis(
        contentType="general",
        domain="generic_academic",
        theme="foreløpig tema",
        mainTension="foreløpig hovedspenning",
        keyInsight="Foreløpig analyse fra Python AHA Engine.",
        fieldConnections=[],
        historyGoLinks=[],
        suggestedActions=[
            "Sammenlign med eksisterende JavaScript-analyse.",
            "Bruk fixture-settet for videre kalibrering.",
        ],
        confidence=Confidence(
            contentType=0.3,
            domain=0.3,
            theme=0.2,
            mainTension=0.2,
            historyGoLinks=0.0,
        ),
        warnings=warnings,
    )
