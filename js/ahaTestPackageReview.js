// AHA Test Package Review V1: local, human-led, no uploads or automatic approval.
(function (global) {
  "use strict";
  const SCHEMA = "aha_analysis_test_package_v1";
  const CRITERIA = [
    ["source_accuracy", "Kildekorrekthet"],
    ["novel_understanding", "Ny forståelse"],
    ["explanatory_value", "Forklaringskraft"],
    ["causal_discipline", "Kausal disiplin"],
    ["relevance", "Relevans"],
    ["next_inquiry", "Nyttig videre undersøkelse"]
  ];
  const RATINGS = ["ikke_vurdert", "svak", "delvis", "god"];
  const text = v => String(v == null ? "" : v).trim();
  const object = v => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const array = v => Array.isArray(v) ? v : [];
  const snippet = (v, max = 650) => text(v).length > max ? text(v).slice(0, max) + "…" : text(v);
  const candidateText = c => text(c.summary || c.insight || c.text || c.claim || "");
  const runId = p => text(p?.identity?.analysis_run_id);

  async function sha256(value, subtle = global.crypto?.subtle) {
    if (!subtle?.digest) throw new Error("SHA-256 er ikke tilgjengelig i denne nettleseren.");
    const bytes = new TextEncoder().encode(value);
    const buffer = await subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(buffer)).map(v => v.toString(16).padStart(2, "0")).join("");
  }

  async function validatePackage(value, options = {}) {
    const p = object(value);
    if (p.schema !== SCHEMA) throw new Error("Filen er ikke en AHA-testpakke.");
    const identity = object(p.identity);
    const source = object(p.source);
    if (!/^[a-f0-9]{64}$/i.test(text(identity.source_sha256)) || !text(identity.analysis_run_id) || !text(source.text)) {
      throw new Error("Testpakken mangler kilde, gyldig SHA-256 eller run-ID.");
    }
    const digest = await sha256(source.text, options.subtle);
    if (digest !== text(identity.source_sha256).toLowerCase() || digest !== text(source.sha256).toLowerCase()) {
      throw new Error("Originalteksten og kildekontrollsummen stemmer ikke. Testpakken er ugyldig.");
    }
    const nested = object(p.analysis?.authoritative_bundle_v2?.identity);
    if (Object.keys(nested).length) {
      if (text(nested.analysis_run_id) !== text(identity.analysis_run_id)
        || text(nested.source_sha256) !== digest
        || (text(identity.analysis_id) && text(nested.analysis_id) !== text(identity.analysis_id))
        || (text(identity.source_id) && text(nested.source_id) !== text(identity.source_id))) {
        throw new Error("AnalysisBundle og testpakken viser til ulike analysekjøringer.");
      }
    }
    return p;
  }

  function claimedQuotes(candidate) {
    const raw = array(candidate?.evidence_quotes).concat(array(candidate?.evidence));
    const quotes = raw.map(x => typeof x === "string" ? x : text(x?.quote || x?.source_quote || x?.excerpt || x?.text))
      .map(x => text(x)).filter(Boolean);
    return [...new Set(quotes)];
  }

  function quoteAudit(p) {
    const src = text(p?.source?.text);
    return array(p?.candidate_audit?.candidates).map((candidate, index) => {
      const quotes = claimedQuotes(candidate).map(quote => ({
        quote,
        found: src.includes(quote),
        offset: src.indexOf(quote)
      }));
      return {
        index, title: text(candidate.title), total: quotes.length,
        found: quotes.filter(q => q.found).length,
        missing: quotes.filter(q => !q.found).length,
        quotes
      };
    });
  }

  function summarize(p) {
    const audit = quoteAudit(p);
    return {
      run_id: runId(p),
      source_sha256: text(p.identity?.source_sha256),
      candidates: audit.length,
      quote_count: audit.reduce((n, x) => n + x.total, 0),
      literal_quotes_found: audit.reduce((n, x) => n + x.found, 0),
      literal_quotes_missing: audit.reduce((n, x) => n + x.missing, 0),
      candidates_without_quotes: audit.filter(x => !x.total).length,
      prefilter_rejections: array(p.candidate_audit?.prefilter_rejections).length,
      missing_data: array(p.coverage?.missing).slice(),
      automatic_approval: false
    };
  }

  function comparePackages(previous, current) {
    if (text(previous?.identity?.source_sha256) !== text(current?.identity?.source_sha256)) {
      throw new Error("Ulike kilder. Sammenligning krever nøyaktig samme originaltekst.");
    }
    if (runId(previous) === runId(current)) {
      throw new Error("Dette er samme analysekjøring. Velg to forskjellige kjøringer.");
    }
    const a = summarize(previous), b = summarize(current);
    return {
      source_sha256: a.source_sha256,
      previous_run_id: a.run_id,
      current_run_id: b.run_id,
      before: a, after: b,
      changes: {
        candidates: b.candidates - a.candidates,
        quotes_missing: b.literal_quotes_missing - a.literal_quotes_missing,
        quotes_found: b.literal_quotes_found - a.literal_quotes_found,
        prefilter_rejections: b.prefilter_rejections - a.prefilter_rejections
      },
      note: "Antall kandidater eller sitater måler ikke i seg selv vitenskapelig kvalitet."
    };
  }

  function blankReview() {
    return Object.fromEntries(CRITERIA.map(([key]) => [key, "ikke_vurdert"]));
  }

  function buildReviewDocument(p, selectedRatings = [], selectedNotes = []) {
    const checks = quoteAudit(p);
    return {
      schema: "aha_test_package_human_review_v1",
      created_at: new Date().toISOString(),
      source_sha256: text(p.identity?.source_sha256),
      analysis_run_id: runId(p),
      approval_status: "not_approved",
      automatic_training: false,
      candidates: array(p.candidate_audit?.candidates).map((c, i) => {
        const ratings = blankReview();
        for (const [key] of CRITERIA) {
          const v = selectedRatings[i]?.[key];
          if (RATINGS.includes(v)) ratings[key] = v;
        }
        return {
          index: i,
          title: text(c.title),
          summary: candidateText(c),
          evidence_literal_status: checks[i]?.missing ? "missing_quotes" :
            checks[i]?.total ? "all_quotes_present_claim_not_verified" : "no_quotes",
          ratings,
          notes: text(selectedNotes[i] || ""),
          scientifically_approved: false
        };
      }),
      review_status: "human_assessment_draft",
      warning: "Menneskelige vurderinger er ikke automatisk godkjenning, og ordrett sitat betyr ikke faglig støtte."
    };
  }

  function el(tag, cls, content) {
    const node = global.document.createElement(tag);
    if (cls) node.className = cls;
    if (content != null) node.textContent = String(content);
    return node;
  }
  function add(parent, tag, cls, content) { const node = el(tag, cls, content); parent.appendChild(node); return node; }

  function downloadFile(value, filename) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    try {
      const anchor = el("a");
      anchor.href = url;
      anchor.download = filename;
      global.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally { URL.revokeObjectURL(url); }
  }

  function init() {
    const inputA = global.document.getElementById("testpakke-input-a");
    const inputB = global.document.getElementById("testpakke-input-b");
    const clear = global.document.getElementById("testpakke-clear");
    const status = global.document.getElementById("testpakke-status");
    const report = global.document.getElementById("testpakke-results");
    const action = global.document.getElementById("testpakke-download-review");
    let primary = null, comparison = null, ratings = [], notes = [];

    const writeStatus = (value, isError = false) => {
      status.textContent = value;
      status.setAttribute("data-error", String(isError));
    };
    async function loadFile(file) {
      if (!file) return null;
      if (file.size > 30 * 1024 * 1024) throw new Error("Filen er for stor. Maks 30 MB.");
      let data;
      try { data = JSON.parse(await file.text()); }
      catch { throw new Error("Kunne ikke lese JSON-filen."); }
      return validatePackage(data);
    }
    function renderPackage(p, name, isPrimary) {
      const container = add(report, "section", "aha-panel testpakke-review-panel");
      add(container, "h2", "", name);
      const summary = summarize(p);
      add(container, "p", "testpakke-muted", "Kjøring: " + summary.run_id + " · SHA-256: " + summary.source_sha256.slice(0, 16) + "…");
      const stats = add(container, "div", "testpakke-stats");
      [["Modellkandidater", summary.candidates], ["Ordrette sitater", summary.literal_quotes_found],
       ["Ikke funnet", summary.literal_quotes_missing], ["Prefilter-avvisninger", summary.prefilter_rejections]]
        .forEach(([label,value]) => {
          const cell = add(stats, "div", "testpakke-stat");
          add(cell, "strong", "", value);
          add(cell, "span", "", label);
        });
      const missing = array(p?.coverage?.missing);
      const coverage = add(container, "details", "testpakke-details");
      add(coverage, "summary", "", "Begrensninger og manglende data (" + missing.length + ")");
      add(coverage, "p", "testpakke-muted", missing.length ? missing.join(" · ") : "Ingen mangler rapportert – verifiser likevel hva som faktisk var lagret.");
      if (p?.candidate_audit?.runtime_trace?.provider_model) {
        add(container, "p", "testpakke-muted", "Modell: " + text(p.candidate_audit.runtime_trace.provider_model));
      }
      const checks = quoteAudit(p);
      if (!checks.length) add(container, "p", "testpakke-muted", "Ingen lagrede kandidater for denne kjøringen. Dette er ikke et bestått kvalitetsresultat.");
      array(p.candidate_audit?.candidates).forEach((c,i) => {
        const card=add(container, "article", "testpakke-candidate");
        add(card,"h3","", String(i+1)+". "+(text(c.title)||"Kandidat uten tittel"));
        add(card,"p","",snippet(candidateText(c),1500)||"Ingen påstand lagret");
        if (text(c.why_it_matters)) add(card,"p","testpakke-muted","Betydning: "+snippet(c.why_it_matters,850));
        if (text(c.uncertainty || c.uncertainty_text)) add(card,"p","testpakke-muted","Usikkerhet: "+snippet(c.uncertainty || c.uncertainty_text,850));
        if (text(c.next_test)) add(card,"p","testpakke-muted","Neste undersøkelse: "+snippet(c.next_test,850));
        if (text(c.rejection_reason)) add(card,"p","testpakke-warning","Avvist kandidat: "+snippet(c.rejection_reason,140));
        const evidence=add(card,"details","testpakke-details");
        add(evidence,"summary","","Kildesitater: "+checks[i].found+" funnet · "+checks[i].missing+" mangler");
        if (!checks[i].total) add(evidence,"p","testpakke-warning","Ingen ordrette sitater lagret.");
        checks[i].quotes.forEach(q=>{
          add(evidence,"p",q.found?"testpakke-muted":"testpakke-warning",
            (q.found?"Finnes ordrett i kilden: ":"IKKE funnet i kilden: ")+snippet(q.quote,600));
        });
        if (!isPrimary) return;
        const form=add(card,"div","testpakke-rating-grid");
        ratings[i] ||= blankReview();
        for (const [key,label] of CRITERIA) {
          const wrap=add(form,"label","","");
          add(wrap,"span","",label);
          const select=add(wrap,"select");
          for (const [value,caption] of [
            ["ikke_vurdert","Ikke vurdert"],["svak","Svak"],["delvis","Delvis"],["god","God"]]) {
            const option=add(select,"option","",caption); option.value=value;
          }
          select.value=ratings[i][key];
          select.addEventListener("change",()=>{ ratings[i][key]=select.value; });
        }
        const noteLabel=add(card,"label","testpakke-note","");
        add(noteLabel,"span","","Begrunn vurderingen / funn som bør forbedres");
        const area=add(noteLabel,"textarea"); area.rows=3; area.value=notes[i]||"";
        area.addEventListener("input",()=>{ notes[i]=area.value; });
      });
      const rejects=array(p?.candidate_audit?.prefilter_rejections);
      if(rejects.length) {
        const list=add(container,"details","testpakke-details");
        add(list,"summary","","Avvist før visning ("+rejects.length+")");
        rejects.forEach(x=>add(list,"p","testpakke-muted",snippet(x.title,150)+" – "+snippet(x.reason,120)+" (fullstendig innhold ikke bevart)"));
      }
    }
    function render() {
      report.replaceChildren();
      action.disabled=!primary;
      if(!primary) { writeStatus("Velg en eksportert AHA-testpakke for å begynne.");return; }
      renderPackage(primary,"Testpakke til vurdering",true);
      if(comparison) {
        const delta=comparePackages(primary,comparison);
        const cmp=add(report,"section","aha-panel testpakke-review-panel");
        add(cmp,"h2","","Sammenligning – samme originaltekst");
        add(cmp,"p","testpakke-muted","Endringene beskriver datamengde, ikke dokumentert kvalitetsforbedring.");
        add(cmp,"p","", "Kandidater: "+(delta.changes.candidates>=0?"+":"")+delta.changes.candidates+
          " · Manglende sitater: "+(delta.changes.quotes_missing>=0?"+":"")+delta.changes.quotes_missing+
          " · Prefilter-avvisninger: "+(delta.changes.prefilter_rejections>=0?"+":"")+delta.changes.prefilter_rejections);
        renderPackage(comparison,"Ny kjøring til sammenligning",false);
      }
      writeStatus("Testpakken er validert lokalt. Ingen data er sendt til en server.");
    }
    inputA.addEventListener("change",async()=>{
      try {
        const p=await loadFile(inputA.files?.[0]);
        primary=p; comparison=null; inputB.value=""; ratings=[];notes=[];render();
      } catch(e) {primary=null;comparison=null;ratings=[];notes=[];render();writeStatus(e.message,true);}
    });
    inputB.addEventListener("change",async()=>{
      try {
        if(!primary) throw new Error("Velg den første testpakken først.");
        const p=await loadFile(inputB.files?.[0]);
        if (p) comparePackages(primary,p);
        comparison=p; render();
      }catch(e){comparison=null;render();writeStatus(e.message,true);}
    });
    clear.addEventListener("click",()=>{
      primary=null;comparison=null;ratings=[];notes=[];
      inputA.value="";inputB.value="";report.replaceChildren();render();
    });
    action.addEventListener("click",()=>{
      if(!primary)return;
      const review=buildReviewDocument(primary,ratings,notes);
      if(comparison) review.comparison=comparePackages(primary,comparison);
      downloadFile(review,"aha-vurdering-"+runId(primary).replace(/[^a-z0-9_-]/gi,"_").slice(0,65)+".json");
      writeStatus("Vurderingen ble lastet ned lokalt. Ingen kandidat er automatisk godkjent.");
    });
    render();
  }
  const api=Object.freeze({validatePackage,sha256,claimedQuotes,quoteAudit,summarize,comparePackages,blankReview,buildReviewDocument});
  global.AHATestPackageReview=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(global.document){
    if(global.document.readyState==="loading")global.document.addEventListener("DOMContentLoaded",init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
