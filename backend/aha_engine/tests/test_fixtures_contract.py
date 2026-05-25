from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def _repo_root() -> Path:
    current = Path(__file__).resolve()
    for parent in [current, *current.parents]:
        if (parent / "docs" / "fixtures" / "aha-analysis").is_dir():
            return parent
    raise RuntimeError("Could not find repository root containing docs/fixtures/aha-analysis")


def _fixture_files() -> list[Path]:
    fixture_dir = _repo_root() / "docs" / "fixtures" / "aha-analysis"
    return sorted(path for path in fixture_dir.iterdir() if path.suffix == ".json")


def test_fixture_semantic_baseline() -> None:
    # PR 7 verifies first semantic baseline only: contentType, domain, and strong History Go link ids. Full semantic parity comes later.
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
        assert body["contentType"] == expected_analysis["contentType"], fixture_path.name
        assert body["domain"] == expected_analysis["domain"], fixture_path.name

        expected_links = expected_analysis.get("historyGoLinks", [])
        returned_links = body.get("historyGoLinks", [])

        if expected_links:
            assert returned_links, fixture_path.name
            expected_ids = {link["id"] for link in expected_links}
            returned_ids = {link.get("id") for link in returned_links}
            assert expected_ids.intersection(returned_ids), fixture_path.name
