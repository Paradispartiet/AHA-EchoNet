#!/usr/bin/env node
// Read-only human review worksheet for the bounded AHA research excerpt evaluation.
// This renders the model's evidence but never assigns scientific approval or novelty.
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_REPORT = path.resolve("test-results/aha-research-excerpt-live-evaluation.json");
const DEFAULT_MARKDOWN = path.resolve("test-results/aha-research-excerpt-review.md");
const REPORT_SCHEMA = "aha_research_excerpt_live_evaluation_v1";

function plain(value, limit = 800) {
  const normalized = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized || "Ikke oppgitt";
  return normalized.slice(0, limit - 1) + "…";
}
function markdown(value, limit = 800) {
  return plain(value, limit)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll(String.fromCharCode(96), "'")
    .replace(/[\\*_\[\]{}|#]/g, "\\$&");
}
function sourceLink(value) {
  try {
    const link = new URL(String(value || ""));
    if (link.protocol !== "https:" || !link.hostname) return "Ingen sikker kildelenke";
    return "<" + link.href.replaceAll("<", "%3C").replaceAll(">", "%3E") + ">";
  } catch {
    return "Ingen sikker kildelenke";
  }
}
function lineText(label, value) {
  return "- **" + label + ":** " + markdown(value) + "\n";
}

function renderReview(report) {
  let out = "# AHA 1.0 – faglig vurderingsark for forskningsutdrag\n\n";
  out += "**Dette er ikke vitenskapelig godkjenning.** Målingene gjelder kun korte, ikke-sammenhengende utdrag. ";
  out += "En korrekt ordrett kildehenvisning beviser verken korrekt fortolkning eller en ny innsikt.\n\n";
  if (!report || report.schema !== REPORT_SCHEMA || !Array.isArray(report.outcomes)) {
    return out + "## Ingen evaluerbar live-rapport\n\n" +
      "Live-evalueringen mangler, er ufullstendig eller har feil skjema. Ingen modellkandidater kan vurderes. " +
      "Kontroller jobbstatus og JSON-rapport før eventuelle nye modellkall.\n";
  }
  out += "- **Utdragstilfeller:** " + Number(report.corpus_case_count || 0) + "\n";
  out += "- **Reserverte HTTP-kall:** " + Number(report.model_requests_reserved || 0) + "\n";
  out += "- **Registrerte modellforsøk:** " + Number(report.model_attempts_accounted || 0) + "\n";
  out += "- **Vitenskapelig vurdert:** Nei. **Automatisk kunnskapslagring:** Nei.\n\n";
  if (!report.outcomes.length) {
    return out + "Ingen tilfeller er evaluert; dette er ikke en bestått test.\n";
  }

  for (let i = 0; i < report.outcomes.length; i += 1) {
    const entry = report.outcomes[i] || {};
    const result = entry.evaluation;
    out += "## " + (i + 1) + ". " + markdown(entry.id, 160) + "\n\n";
    out += "- **Kilde:** " + sourceLink(entry.article_url) + "\n";
    out += lineText("DOI", entry.doi);
    out += lineText("Kjørestatus", entry.status);
    out += lineText("Kildeobservasjon (tilsendt utdrag)", result?.provided_observation);
    out += lineText("Begrensning (tilsendt utdrag)", result?.provided_limitation);
    if (!result || !Array.isArray(result.candidates)) {
      out += "\n**Ingen evaluerbare kandidater.** Dette skal verken gis kvalitetspoeng eller tolkes som godkjent avholdenhet.\n\n";
      continue;
    }
    out += "\n- **Modellkandidater:** " + result.candidates.length + "\n";
    out += "- **Kontraktgodkjente:** " + Number(result.contract_valid_count || 0) + "\n";
    out += "- **Kausale advarsler:** " + Number(result.causal_overreach_flag_count || 0) + "\n\n";
    if (!result.candidates.length) {
      out += "Modellen avstod fra å foreslå innsikter. Avholdenhet er tillatt; kvalitet må vurderes i kontekst.\n\n";
      continue;
    }
    for (let k = 0; k < result.candidates.length; k += 1) {
      const c = result.candidates[k] || {};
      out += "### Kandidat " + (k + 1) + " – venter på faglig vurdering\n\n";
      out += lineText("Innsikt", c.insight);
      out += lineText("Abstraksjon", c.abstraction);
      out += lineText("Hvorfor den betyr noe", c.why_it_matters);
      out += lineText("Usikkerhet", c.uncertainty_text);
      out += lineText("Konfidens", c.confidence);
      out += lineText("Kausal status", c.causal_status);
      out += "- **Maskinell kontraktkontroll:** " + (c.contract_valid === true ? "Bestått" : "Ikke bestått") +
        ". Dette er ikke vitenskapelig kvalitet.\n";
      out += "- **Ordrett belegg:**\n";
      for (const e of Array.isArray(c.evidence_review_material) ? c.evidence_review_material : []) {
        out += "  - " + markdown(e?.role, 80) + ": «" + markdown(e?.quote, 500) + "» – " +
          (e?.exact_in_supplied_excerpt === true ? "finnes i utdraget" : "IKKE verifisert i utdraget") + "\n";
      }
      if (Array.isArray(c.validation_errors) && c.validation_errors.length) {
        out += "- **Kontraktavvik:** " + c.validation_errors.map(e => markdown(e, 100)).join("; ") + "\n";
      }
      out += "\n**Faglig vurdering (ikke utfylt):**\n";
      out += "- [ ] Stemmer påstanden med hele artikkelen, metode og resultater?\n";
      out += "- [ ] Tilfører den forståelse utover de to siterte utsagnene?\n";
      out += "- [ ] Er den mer enn en omskriving eller banal sammenstilling?\n";
      out += "- [ ] Leder funn og begrensning til et relevant, artikkelspesifikt neste spørsmål?\n";
      out += "- [ ] Er alternative forklaringer, manglende kontekst og kausal usikkerhet tydelige?\n\n";
      out += "**Vurdering:** Avventende. Ingen kandidat er automatisk godkjent.\n\n";
    }
  }
  out += "---\n\n**Videre arbeid:** Bruk konkrete vurderte feil til å endre prompt, utvalg eller stier. " +
    "Ikke oppgrader modellkandidater til godkjent kunnskap på grunnlag av denne rapporten.\n";
  return out;
}

function main() {
  const reportPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_REPORT;
  const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : DEFAULT_MARKDOWN;
  let report = null;
  try { report = JSON.parse(fs.readFileSync(reportPath, "utf8")); } catch {
    // Missing/partial JSON remains an explicit unavailable report, not success.
  }
  const output = renderReview(report);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, "utf8");
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, output + "\n", "utf8");
  }
  console.log("AHA_RESEARCH_REVIEW_REPORT " + JSON.stringify({
    report_found: report?.schema === REPORT_SCHEMA && Array.isArray(report?.outcomes),
    review_markdown: outputPath,
    science_approved: false
  }));
}
if (require.main === module) main();
module.exports = { renderReview, plain, markdown, sourceLink };
