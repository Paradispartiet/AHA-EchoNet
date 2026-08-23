from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[4]
CANONICAL_INDEX_PATH = REPO_ROOT / "data" / "integrations" / "runtime" / "history-go-fagverk-canonical-index.v2.json"
BRIDGE_PATH = REPO_ROOT / "data" / "integrations" / "history-go-fagverk-bridge.v2.json"
CALIBRATION_MANIFEST_PATH = REPO_ROOT / "data" / "integrations" / "history-go-fagverk-release.runtime-active.json"


def _read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _unique(values: list[Any] | tuple[Any, ...] | None) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values or []:
        cleaned = str(value or "").strip()
        key = cleaned.casefold()
        if cleaned and key not in seen:
            seen.add(key)
            out.append(cleaned)
    return out


def _resolve_repo_path(relative_path: str) -> Path:
    candidate = (REPO_ROOT / str(relative_path or "")).resolve()
    if REPO_ROOT not in candidate.parents and candidate != REPO_ROOT:
        raise ValueError(f"Fagverk calibration path escapes repository root: {relative_path}")
    return candidate


def _validate(index: dict[str, Any], bridge: dict[str, Any]) -> None:
    if index.get("schema") != "aha_history_go_fagverk_canonical_index_v2":
        raise ValueError("Unsupported canonical History-Go Fagverk index schema")
    if index.get("authority") != "derived_cache_only":
        raise ValueError("Canonical Fagverk index must remain a derived cache")
    if bridge.get("schema") != "aha_history_go_fagverk_bridge_v2" or bridge.get("authority") != "history_go_canonical_fagverk":
        raise ValueError("Canonical History-Go Fagverk bridge missing")
    expected = bridge.get("expected") or {}
    source = index.get("canonical_source") or {}
    if source.get("source_ref") != (bridge.get("canonical_source") or {}).get("source_ref"):
        raise ValueError("Canonical Fagverk source ref mismatch")
    if source.get("registry_content_sha256") != expected.get("registry_sha256"):
        raise ValueError("Canonical Fagverk registry digest mismatch")
    if source.get("subject_inventory_content_sha256") != expected.get("subject_inventory_sha256"):
        raise ValueError("Canonical Fagverk inventory digest mismatch")
    if source.get("fag_manifest_content_sha256") != expected.get("fag_manifest_sha256"):
        raise ValueError("Canonical Fagverk manifest digest mismatch")
    summary = index.get("summary") or {}
    if int(summary.get("root_subject_count", -1)) != int(expected.get("root_subject_count", -2)):
        raise ValueError("Canonical Fagverk root subject count mismatch")
    if int(summary.get("specialization_count", -1)) != int(expected.get("specialization_count", -2)):
        raise ValueError("Canonical Fagverk specialization count mismatch")
    if int(summary.get("missing_file_count", -1)) != 0:
        raise ValueError("Canonical Fagverk index is incomplete")


def _emne_terms(emne: dict[str, Any]) -> tuple[list[str], list[str], list[str]]:
    title_terms = _unique([emne.get("title")])
    concept_terms = _unique([
        *(emne.get("core_concepts") or []),
        *(emne.get("keywords") or []),
        *(emne.get("thinkers") or []),
    ])
    support_terms = _unique(emne.get("methods") or [])
    return title_terms, concept_terms, support_terms


def _chapter_entry(subject: dict[str, Any], chapter: dict[str, Any]) -> dict[str, Any]:
    emne_by_id = {str(item.get("emne_id") or ""): item for item in subject.get("emner") or []}
    linked = [emne_by_id[emne_id] for emne_id in chapter.get("emne_ids") or [] if emne_id in emne_by_id]
    title_terms = _unique([chapter.get("title"), chapter.get("subtitle"), *(item.get("title") for item in linked)])
    concept_terms = _unique([
        chapter.get("primary_domain_id"),
        *(term for item in linked for term in (item.get("core_concepts") or [])),
        *(term for item in linked for term in (item.get("keywords") or [])),
        *(term for item in linked for term in (item.get("thinkers") or [])),
    ])
    support_terms = _unique([term for item in linked for term in (item.get("methods") or [])])
    return {
        "subject_id": subject["subject_id"],
        "chapter_id": str(chapter.get("chapter_id") or ""),
        "primary_domain_id": str(chapter.get("primary_domain_id") or subject["subject_id"]),
        "title": str(chapter.get("title") or chapter.get("chapter_id") or subject["subject_label"]),
        "source_path": str(chapter.get("source_path") or "data/fagverk/fagverk_registry.json"),
        "title_terms": title_terms,
        "concept_terms": concept_terms,
        "support_terms": support_terms,
        "provenance": {
            "authority": "history_go_canonical_fagverk",
            "deployment_index": "data/integrations/runtime/history-go-fagverk-canonical-index.v2.json",
            "source_ref": subject["source_ref"],
            "package": "chapter_registry",
        },
    }


def _emne_entry(subject: dict[str, Any], emne: dict[str, Any]) -> dict[str, Any]:
    title_terms, concept_terms, support_terms = _emne_terms(emne)
    return {
        "subject_id": subject["subject_id"],
        "chapter_id": str(emne.get("emne_id") or ""),
        "primary_domain_id": subject["subject_id"],
        "title": str(emne.get("title") or emne.get("emne_id") or subject["subject_label"]),
        "source_path": str(emne.get("source_path") or (subject.get("package") or {}).get("emner_path") or ""),
        "title_terms": title_terms,
        "concept_terms": concept_terms,
        "support_terms": support_terms,
        "provenance": {
            "authority": "history_go_canonical_fagverk",
            "deployment_index": "data/integrations/runtime/history-go-fagverk-canonical-index.v2.json",
            "source_ref": subject["source_ref"],
            "package": "emner",
        },
    }


def _method_entry(subject: dict[str, Any], method: dict[str, Any]) -> dict[str, Any]:
    return {
        "subject_id": subject["subject_id"],
        "chapter_id": f"method:{str(method.get('method_id') or '')}",
        "primary_domain_id": subject["subject_id"],
        "title": str(method.get("title") or method.get("short_label") or method.get("method_id") or subject["subject_label"]),
        "source_path": str(method.get("source_path") or (subject.get("package") or {}).get("methods_path") or ""),
        "title_terms": _unique([method.get("title"), method.get("short_label")]),
        "concept_terms": _unique(method.get("data_forms") or []),
        "support_terms": _unique(method.get("emne_affinities") or []),
        "provenance": {
            "authority": "history_go_canonical_fagverk",
            "deployment_index": "data/integrations/runtime/history-go-fagverk-canonical-index.v2.json",
            "source_ref": subject["source_ref"],
            "package": "methods",
        },
    }


def _load_calibration_policies(canonical_subject_ids: set[str]) -> dict[str, Any]:
    if not CALIBRATION_MANIFEST_PATH.exists():
        return {}
    manifest = _read_json(CALIBRATION_MANIFEST_PATH)
    if manifest.get("schema") != "aha_history_go_fagverk_runtime_active_v2":
        return {}
    policies: dict[str, Any] = {}
    for subject_id, config in sorted((manifest.get("active_subjects") or {}).items()):
        if subject_id not in canonical_subject_ids:
            continue
        policy_path = str(config.get("policy_path") or "")
        if not policy_path:
            continue
        policy = _read_json(_resolve_repo_path(policy_path))
        if policy.get("schema") != "aha_history_go_fagverk_runtime_subject_policy_v1" or policy.get("subject_id") != subject_id:
            continue
        policy = dict(policy)
        policy["authority"] = "aha_matcher_calibration_only"
        policy["canonical_knowledge_source_ref"] = None
        policies[subject_id] = policy
    return policies


@lru_cache(maxsize=1)
def load_canonical_fagverk_corpus() -> dict[str, Any]:
    index = _read_json(CANONICAL_INDEX_PATH)
    bridge = _read_json(BRIDGE_PATH)
    _validate(index, bridge)
    entries: list[dict[str, Any]] = []
    subject_ids: set[str] = set()
    for subject in index.get("subjects") or []:
        subject_id = str(subject.get("subject_id") or "")
        if not subject_id:
            continue
        subject_ids.add(subject_id)
        chapters = subject.get("chapters") or []
        if chapters:
            entries.extend(_chapter_entry(subject, chapter) for chapter in chapters)
        else:
            entries.extend(_emne_entry(subject, emne) for emne in subject.get("emner") or [])
        entries.extend(_method_entry(subject, method) for method in subject.get("methods") or [])
    return {
        "schema": "aha_history_go_fagverk_corpus_v1",
        "version": "3.0.0",
        "status": "canonical_history_go_deployment_index_v2",
        "source_repo": (index.get("canonical_source") or {}).get("repository"),
        "source_ref": (index.get("canonical_source") or {}).get("source_ref"),
        "entries": entries,
        "subject_policies": _load_calibration_policies(subject_ids),
        "canonical_index": {
            "schema": index.get("schema"),
            "subject_count": (index.get("summary") or {}).get("subject_count"),
            "root_subject_count": (index.get("summary") or {}).get("root_subject_count"),
            "specialization_count": (index.get("summary") or {}).get("specialization_count"),
            "emne_count": (index.get("summary") or {}).get("emne_count"),
            "method_count": (index.get("summary") or {}).get("method_count"),
            "chapter_count": (index.get("summary") or {}).get("chapter_count"),
        },
    }
