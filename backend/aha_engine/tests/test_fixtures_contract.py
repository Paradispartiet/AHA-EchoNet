from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)

CANONICAL_TOP_LEVEL_KEYS = {
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

CANONICAL_CONFIDENCE_KEYS = {
    "contentType",
    "domain",
    "theme",
    "mainTension",
    "historyGoLinks",
}


def _repo_root() -> Path:
    current = Path(__file__).resolve()
    for parent in [current, *current.parents]:
        if (parent / "docs" / "fixtures" / "aha-analysis").is_dir():
            return parent
    raise RuntimeError("Could not find repository root containing docs/fixtures/aha-analysis")


def _fixture_files() -> list[Path]:
    fixture_dir = _repo_root() / "docs" / "fixtures" / "aha-analysis"
    return sorted(path for path in fixture_dir.iterdir() if path.suffix == ".json")


def test_fixture_contract_compatibility() -> None:
    # Python AHA Engine is currently a placeholder. These fixture tests verify
    # contract compatibility only. Semantic parity with expectedCanonicalAnalysis
    # will be introduced in a later PR.
    fixture_files = _fixture_files()
    assert len(fixture_files) == 8

    for fixture_path in fixture_files:
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
        input_text = fixture["inputText"]
        expected_analysis = fixture["expectedCanonicalAnalysis"]

        payload = {
            "message": input_text,
            "assistantReply": None,
            "historyGoContext": {},
        }

        response = client.post("/api/aha/analyze", json=payload)
        assert response.status_code == 200, fixture_path.name

        body = response.json()

        assert set(expected_analysis.keys()) == CANONICAL_TOP_LEVEL_KEYS, fixture_path.name
        assert set(body.keys()) == CANONICAL_TOP_LEVEL_KEYS, fixture_path.name

        assert isinstance(body["contentType"], str) and body["contentType"].strip(), fixture_path.name
        assert isinstance(body["domain"], str) and body["domain"].strip(), fixture_path.name
        assert isinstance(body["theme"], str) and body["theme"].strip(), fixture_path.name
        assert isinstance(body["mainTension"], str) and body["mainTension"].strip(), fixture_path.name
        assert isinstance(body["keyInsight"], str) and body["keyInsight"].strip(), fixture_path.name

        assert isinstance(body["fieldConnections"], list), fixture_path.name
        assert isinstance(body["historyGoLinks"], list), fixture_path.name
        assert isinstance(body["suggestedActions"], list), fixture_path.name
        assert isinstance(body["confidence"], dict), fixture_path.name
        assert isinstance(body["warnings"], list), fixture_path.name

        confidence = body["confidence"]
        assert set(expected_analysis["confidence"].keys()) == CANONICAL_CONFIDENCE_KEYS, fixture_path.name
        assert set(confidence.keys()) == CANONICAL_CONFIDENCE_KEYS, fixture_path.name
        for value in confidence.values():
            assert isinstance(value, (int, float)), fixture_path.name
            assert 0 <= value <= 1, fixture_path.name

        for link in body["historyGoLinks"]:
            assert isinstance(link, dict), fixture_path.name
            assert {"type", "id", "title", "reason"}.issubset(link.keys()), fixture_path.name
