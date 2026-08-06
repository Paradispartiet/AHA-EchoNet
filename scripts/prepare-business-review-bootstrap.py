from pathlib import Path

path = Path("scripts/bootstrap-business-fagverk-review.py")
text = path.read_text(encoding="utf-8")
old = '''def replace_once(text: str, old: str, new: str) -> str:\n    if text.count(old) != 1:\n        raise SystemExit(f"Expected exactly one occurrence: {old!r}; got {text.count(old)}")\n    return text.replace(old, new)\n'''
new = '''def replace_once(text: str, old: str, new: str) -> str:\n    count = text.count(old)\n    if count < 1:\n        raise SystemExit(f"Expected at least one occurrence: {old!r}; got {count}")\n    return text.replace(old, new)\n'''
if text.count(old) != 1:
    raise SystemExit("Bootstrap replacement helper did not match exactly once")
text = text.replace(old, new)
redundant = "        ('expected_nature_status: correction.expected_nature_status', 'expected_business_status: correction.expected_business_status'),\n"
if text.count(redundant) != 1:
    raise SystemExit("Redundant comparator replacement did not match exactly once")
text = text.replace(redundant, "")
path.write_text(text, encoding="utf-8")
print("Prepared Business bootstrap for explicit multi-occurrence field replacements.")
