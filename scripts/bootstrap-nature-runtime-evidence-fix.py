from __future__ import annotations

import json
from pathlib import Path

reviewed_text = (
    "Ett artsfunn er ikke det samme som en bestand. Næringsnett vurderes som økologisk "
    "næringsnett sammen med målt habitatkvalitet og populasjon og bestand før vi trekker "
    "en bestandskonklusjon."
)

cases_path = Path("data/evaluation/aha-fagverk-grounding-cases.v1.json")
cases = json.loads(cases_path.read_text(encoding="utf-8"))
matching = [case for case in cases["cases"] if case.get("id") == "nature_population_from_observation"]
if len(matching) != 1:
    raise SystemExit("Expected exactly one nature_population_from_observation case")
matching[0]["text"] = reviewed_text
cases_path.write_text(json.dumps(cases, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

path = Path("backend/aha_engine/tests/test_fagverk_grounding.py")
text = path.read_text(encoding="utf-8")
old = (
    '            "Et enkelt artsfunn dokumenterer ikke en stabil bestand. Habitatkvalitet, konnektivitet, "\n'
    '            "registreringsinnsats og utvikling over tid må vurderes før vi sier noe om økosystemets tilstand."'
)
new = (
    '            "Ett artsfunn er ikke det samme som en bestand. Næringsnett vurderes som økologisk "\n'
    '            "næringsnett sammen med målt habitatkvalitet og populasjon og bestand før vi trekker "\n'
    '            "en bestandskonklusjon."'
)
if text.count(old) != 1:
    raise SystemExit("Expected one legacy Nature analyzer fixture")
path.write_text(text.replace(old, new), encoding="utf-8")

path = Path("backend/aha_engine/tests/test_nature_fagverk_runtime.py")
text = path.read_text(encoding="utf-8")
old = '"Habitatkvalitet, næringsnett og økosystemtjenester viser økologisk funksjon i området."'
new = '"Næringsnett vurderes som økologisk næringsnett sammen med målt habitatkvalitet og populasjon og bestand."'
if text.count(old) != 1:
    raise SystemExit("Expected one weak Nature runtime example")
path.write_text(text.replace(old, new), encoding="utf-8")
