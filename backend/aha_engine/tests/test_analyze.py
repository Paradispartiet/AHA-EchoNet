from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_endpoint() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "aha-engine"}


def test_analyze_endpoint_returns_canonical_shape() -> None:
    payload = {
        "message": "Hvordan påvirker urbanisering lokale demokratiske prosesser?",
        "assistantReply": None,
        "historyGoContext": {},
    }

    response = client.post("/api/aha/analyze", json=payload)
    assert response.status_code == 200

    body = response.json()
    expected_keys = {
        "contentType",
        "domain",
        "theme",
        "mainTension",
        "keyInsight",
        "fieldConnections",
        "historyGoLinks",
        "suggestedActions",
        "confidence",
        "warnings",
    }
    assert set(body.keys()) == expected_keys
    assert isinstance(body["historyGoLinks"], list)

    for value in body["confidence"].values():
        assert 0 <= value <= 1


def test_analyze_short_message_adds_warning() -> None:
    payload = {
        "message": "Hei",
        "assistantReply": None,
        "historyGoContext": {},
    }

    response = client.post("/api/aha/analyze", json=payload)
    assert response.status_code == 200

    warnings = response.json()["warnings"]
    assert any("kort" in warning.lower() for warning in warnings)
