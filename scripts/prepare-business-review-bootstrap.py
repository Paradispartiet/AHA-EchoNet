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

anchor_free_replacements = {
    "Kapital og virksomhet omtales uten kontantstrøm eller beregning.": "Kapital og virksomhet omtales generelt uten dokumentert metode.",
    "Data og analyse nevnes uten modell eller usikkerhet.": "Data og analyse nevnes generelt uten dokumentert metode.",
    "Handel og ressurser omtales uten ledetid eller kostnad.": "Handel og ressurser omtales generelt uten dokumentert metode.",
    "Regulering og risiko nevnes uten eksternalitet eller vesentlighet.": "Regulering og risiko nevnes generelt uten dokumentert metode.",
    "Marked og kunder omtales uten segment eller konvertering.": "Marked og kunder omtales generelt uten dokumentert metode.",
    "Økonomi og måling nevnes uten periodisering eller avstemming.": "Økonomi og måling nevnes generelt uten dokumentert metode.",
    "Teknologi og strategi omtales uten nettverkseffekt eller styringsregel.": "Teknologi og strategi omtales generelt uten dokumentert metode.",
}
for source, target in anchor_free_replacements.items():
    if text.count(source) != 1:
        raise SystemExit(f"Expected one abstention fixture text: {source}")
    text = text.replace(source, target)

path.write_text(text, encoding="utf-8")
print("Prepared Business bootstrap replacements and anchor-free abstention fixtures.")
