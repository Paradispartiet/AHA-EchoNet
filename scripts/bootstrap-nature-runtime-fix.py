from pathlib import Path

path = Path("tests/aha-fagverk-subject-approvals.test.cjs")
text = path.read_text(encoding="utf-8")
replacements = {
    "assert.deepEqual(Object.keys(runtimeActive.active_subjects), ['historie', 'politikk']);": "assert.deepEqual(Object.keys(runtimeActive.active_subjects), ['historie', 'natur', 'politikk']);",
    "assert.equal(runtimeActive.effective_entry_count, 37);": "assert.equal(runtimeActive.effective_entry_count, 47);",
}
for old, new in replacements.items():
    if text.count(old) != 1:
        raise SystemExit(f"Expected exactly one occurrence of: {old}")
    text = text.replace(old, new)
path.write_text(text, encoding="utf-8")
