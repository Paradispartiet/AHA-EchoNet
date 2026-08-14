// Builds precise, source-bound mind maps and goal-adaptive paths from the active AHA analysis.
// Existing local artifacts are upgraded in place; nothing is published, synced or trained automatically.
(function (global) {
  "use strict";

  const VERSION = "aha_adaptive_artifacts_v1";
  const AUTO_OUTPUT_KEY = "aha_chat_auto_outputs_v1";
  const GENERIC_TERMS = new Set([
    "analyse", "analysen", "tolkning", "tolkninger", "kildebelegg", "usikkerhet",
    "neste test", "neste steg", "hovedinnsikt", "innsikt", "tema", "perspektiv", "refleksjon"
  ]);
  const RELATIONS = Object.freeze({
    cause: "fører til",
    contrast: "står i kontrast til",
    support: "støtter",
    example: "er eksempel på",
    uncertainty: "gjør usikker"
  });
  const GOALS = Object.freeze({
    understand: "Forstå",
    investigate: "Undersøke",
    write: "Skrive",
    learn: "Lære",
    execute: "Gjennomføre"
  });

  const text = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const arr = (value) => Array.isArray(value) ? value : [];

  function parse(raw, fallback) {
    try { const value = JSON.parse(raw); return value == null ? fallback : value; } catch { return fallback; }
  }

  function storage() {
    try { return global.localStorage || null; } catch { return null; }
  }

  function normalize(value) {
    return text(value).toLowerCase().normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }

  function unique(values) {
    const seen = new Set();
    return arr(values).map(text).filter((value) => {
      const key = normalize(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function short(value, limit = 76) {
    const clean = text(value).replace(/^[«“"]|[»”"]$/g, "");
    if (clean.length <= limit) return clean;
    const slice = clean.slice(0, limit + 1);
    const boundary = slice.lastIndexOf(" ");
    return `${slice.slice(0, boundary > 35 ? boundary : limit).trim()}…`;
  }

  function stableHash(value) {
    const input = normalize(value);
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `analysis_${(hash >>> 0).toString(36)}`;
  }

  function activeCache(cacheArg) {
    if (cacheArg && typeof cacheArg === "object") return cacheArg;
    return parse(storage()?.getItem?.(AUTO_OUTPUT_KEY) || "null", null);
  }

  function evidenceClaims(payload) {
    return arr(payload?.analysisQuality?.claims)
      .filter((claim) => claim?.kind === "source_evidence" && text(claim.text));
  }

  function analysisParts(cacheArg) {
    const cache = activeCache(cacheArg);
    const payload = cache?.payload && typeof cache.payload === "object" ? cache.payload : (cache || {});
    const canonical = payload?.canonicalAnalysis && typeof payload.canonicalAnalysis === "object" ? payload.canonicalAnalysis : {};
    const seen = payload?.ahaSer && typeof payload.ahaSer === "object" ? payload.ahaSer : {};
    const theme = text(canonical.theme || seen.tema || "Aktiv AHA-analyse");
    const tension = text(canonical.mainTension || seen.hovedspenning);
    const keyInsight = text(canonical.keyInsight || seen.viktigsteInnsikt);
    const fields = unique(canonical.fieldConnections || []);
    const concepts = unique([
      ...arr(payload.concepts), ...arr(payload.keywords), ...arr(payload.list)
    ].map((item) => typeof item === "string" ? item : item?.term || item?.title || item?.label || item?.key))
      .filter((item) => !GENERIC_TERMS.has(normalize(item)));
    const actions = unique([
      ...arr(canonical.suggestedActions), ...arr(payload.path), seen.nesteSteg
    ]);
    const evidence = evidenceClaims(payload);
    const warnings = unique(canonical.warnings || []);
    const sourceText = text(cache?.sourceText || payload.sourceText);
    const sourceHash = text(cache?.sourceHash || cache?.sourceTextHash || canonical.sourceHash || canonical.sourceTextHash)
      || stableHash(`${sourceText}|${theme}|${keyInsight}`);
    return {
      cache, payload, canonical, theme, tension, keyInsight, fields, concepts, actions,
      evidence, warnings, sourceText, sourceHash,
      analysisId: text(cache?.analysisId || cache?.analysisRunId || cache?.runId || canonical.analysisRunId || canonical.runId)
    };
  }

  function splitTension(value) {
    return text(value).split(/\s+(?:kontra|versus|vs\.?|mot)\s+|\s*[↔–—]\s*/iu)
      .map((item) => short(item, 64)).filter(Boolean).slice(0, 2);
  }

  function causalPair(value) {
    const raw = text(value);
    let match = raw.match(/^(.{8,100}?)\s+(?:fører til|bidrar til|skaper|utløser)\s+(.{8,120}?)(?:[.!?]|$)/i);
    if (match) return { from: short(match[1], 64), to: short(match[2], 64), explanation: raw };
    match = raw.match(/^(.{8,120}?)\s+skyldes\s+(.{8,100}?)(?:[.!?]|$)/i);
    if (match) return { from: short(match[2], 64), to: short(match[1], 64), explanation: raw };
    match = raw.match(/^(.{8,120}?),?\s+fordi\s+(.{8,100}?)(?:[.!?]|$)/i);
    return match ? { from: short(match[2], 64), to: short(match[1], 64), explanation: raw } : null;
  }

  function exampleFrom(value) {
    const match = text(value).match(/(?:for eksempel|eksempelvis|blant annet|som når)\s+(.{8,100}?)(?:[.;!?]|$)/i);
    return match ? short(match[1], 64) : "";
  }

  function addTerm(terms, value, definition = "") {
    const term = short(value);
    if (!term || GENERIC_TERMS.has(normalize(term))) return "";
    if (!terms.some((item) => normalize(item.term) === normalize(term))) {
      terms.push({ term, definition: text(definition) || "Presist begrep i den aktive analysen." });
    }
    return term;
  }

  function addRelation(relations, from, to, type, explanation = "") {
    if (!RELATIONS[type] || !text(from) || !text(to) || normalize(from) === normalize(to)) return;
    const key = `${normalize(from)}|${normalize(to)}|${type}`;
    if (relations.some((item) => item._key === key)) return;
    relations.push({ _key: key, from: text(from), to: text(to), type, label: RELATIONS[type], explanation: text(explanation) });
  }

  function buildMindmapArtifact(cacheArg) {
    const parts = analysisParts(cacheArg);
    if (!parts.theme || (!parts.keyInsight && !parts.tension)) return null;
    const terms = [];
    const relations = [];
    const central = addTerm(terms, parts.keyInsight || parts.theme, parts.keyInsight || parts.theme);
    const tension = splitTension(parts.tension);
    tension.forEach((term) => addTerm(terms, term, parts.tension));
    if (tension.length === 2) addRelation(relations, tension[0], tension[1], "contrast", parts.tension);

    [...parts.fields, ...parts.concepts].slice(0, 7).forEach((term) => addTerm(terms, term));

    const causal = causalPair(parts.keyInsight) || causalPair(parts.tension) || causalPair(parts.sourceText);
    if (causal) {
      const cause = addTerm(terms, causal.from, causal.explanation);
      const effect = addTerm(terms, causal.to, causal.explanation);
      addRelation(relations, cause, effect, "cause", causal.explanation);
    }

    const evidence = parts.evidence[0]?.text;
    if (evidence && central) {
      const evidenceNode = addTerm(terms, short(evidence, 68), evidence);
      addRelation(relations, evidenceNode, central, "support", evidence);
    } else if (parts.fields[0] && central) {
      addRelation(relations, parts.fields[0], central, "support", parts.keyInsight);
    }

    const exampleClaim = parts.evidence.find((claim) => exampleFrom(claim.text));
    const example = exampleClaim ? exampleFrom(exampleClaim.text) : exampleFrom(parts.sourceText);
    if (example && central) {
      const exampleNode = addTerm(terms, example, exampleClaim?.text || example);
      addRelation(relations, exampleNode, central, "example", exampleClaim?.text || example);
    }

    parts.warnings.slice(0, 2).forEach((warning) => {
      const warningNode = addTerm(terms, short(warning, 68), warning);
      addRelation(relations, warningNode, central, "uncertainty", warning);
    });

    [...tension, ...parts.fields, ...parts.concepts].forEach((term) => {
      if (terms.length < 4) addTerm(terms, term);
    });

    return {
      title: `Tankekart: ${parts.theme}`,
      description: parts.keyInsight || parts.tension,
      terms: terms.slice(0, 10),
      relations: relations.map(({ _key, ...relation }) => relation).slice(0, 12),
      meta: {
        createdBy: VERSION,
        analysisSourceHash: parts.sourceHash,
        analysisId: parts.analysisId,
        keyInsight: parts.keyInsight,
        mainTension: parts.tension,
        relationTaxonomy: Object.keys(RELATIONS),
        genericNodesRemoved: true,
        local_only: true
      }
    };
  }

  function normalizeGoal(value) {
    const raw = normalize(value);
    const aliases = {
      forstå: "understand", understand: "understand", forklar: "understand",
      undersøk: "investigate", undersøke: "investigate", investigate: "investigate", research: "investigate",
      skriv: "write", skrive: "write", write: "write",
      lær: "learn", lære: "learn", learn: "learn", studer: "learn",
      gjør: "execute", gjennomfør: "execute", gjennomføre: "execute", execute: "execute", handle: "execute"
    };
    return GOALS[raw] ? raw : aliases[raw] || "";
  }

  function detectPathGoal(cacheArg, options = {}) {
    const parts = analysisParts(cacheArg);
    const explicit = normalizeGoal(options.goal || parts.payload?.pathGoal || parts.payload?.userGoal || parts.canonical?.userGoal);
    if (explicit) return explicit;
    const signal = normalize(`${parts.actions.join(" ")} ${parts.payload?.reflection || ""}`);
    if (/\b(skriv|utkast|artikkel|tekst|oppgave|disposisjon|publiser)\b/.test(signal)) return "write";
    if (/\b(gjennomfør|utfør|implementer|lag|bygg|planlegg|handle)\b/.test(signal)) return "execute";
    if (/\b(undersøk|etterprøv|test|sammenlign|finn belegg|kontroller|forskn)\b/.test(signal)) return "investigate";
    if (/\b(lær|øv|repeter|husk|flashcard|studer)\b/.test(signal)) return "learn";
    return "understand";
  }

  function step(title, narrative, outcome, criterion, sourceHash, index) {
    return {
      title, type: "analysis_step", source: "aha_analysis", refId: `${sourceHash}:step_${index + 1}`,
      status: "planned", narrative, learningOutcome: outcome,
      meta: { inline: true, analysisSourceHash: sourceHash, completionCriterion: criterion }
    };
  }

  function stepPlan(parts, goal) {
    const theme = parts.theme;
    const insight = parts.keyInsight || parts.tension || theme;
    const tension = parts.tension || "hva kilden støtter og ikke støtter";
    const evidence = parts.evidence[0]?.text || "det mest relevante kildebelegget";
    const plans = {
      understand: [
        ["Avgrens hovedtemaet", `Forklar hva «${theme}» betyr i akkurat denne teksten.`, "Kunne formulere temaet presist.", "Forklaringen nevner tekstens konkrete aktør, objekt eller sammenheng."],
        ["Skill belegg fra tolkning", `Plasser «${short(evidence, 120)}» som kildebelegg og «${short(insight, 120)}» som tolkning.`, "Kunne skille ordlyd fra analyse.", "Minst ett belegg og én tolkning er merket separat."],
        ["Forklar hovedspenningen", `Vis hva som står mot hverandre i «${tension}».`, "Kunne forklare hvorfor spenningen er analytisk relevant.", "Begge sider og forbindelsen mellom dem er forklart."],
        ["Formuler en foreløpig konklusjon", "Oppsummer hva kilden støtter, og hva som fortsatt er uavklart.", "Kunne konkludere uten å overdrive.", "Konklusjonen inneholder både belegg og forbehold."]
      ],
      investigate: [
        ["Formuler et etterprøvbart spørsmål", `Gjør «${tension}» om til et spørsmål som kan besvares med kilder.`, "Kunne avgrense undersøkelsen.", "Spørsmålet har fenomen, kontekst og avgrensning."],
        ["Samle støtte og motbelegg", `Finn minst ett belegg som støtter og ett som utfordrer «${short(insight, 120)}».`, "Kunne teste en tolkning symmetrisk.", "Støtte og motbelegg er dokumentert hver for seg."],
        ["Sammenlign alternative forklaringer", "Vurder minst to forklaringer mot samme belegg og marker hva hver forklarer best.", "Kunne unngå énsporet analyse.", "To forklaringer er vurdert etter samme kriterier."],
        ["Dokumenter funnet", "Skriv hva undersøkelsen endret, styrket eller lot stå uavklart.", "Kunne rapportere et etterprøvbart resultat.", "Resultat, usikkerhet og neste databehov er eksplisitt."]
      ],
      write: [
        ["Spiss tekstens påstand", `Gjør «${short(insight, 130)}» om til én etterprøvbar hovedpåstand.`, "Kunne formulere en presis tese.", "Tesen er én setning og kan støttes eller motsies."],
        ["Bygg en kildebundet disposisjon", `Lag avsnitt for belegg, tolkning, motargument og konklusjon rundt «${theme}».`, "Kunne organisere argumentasjonen logisk.", "Hvert avsnitt har funksjon og tilhørende belegg."],
        ["Skriv førsteutkastet", `Bruk «${short(evidence, 120)}» som belegg, ikke som erstatning for analyse.`, "Kunne skrive sammenhengende med tydelig kildebruk.", "Utkastet skiller sitat, parafrase og egen tolkning."],
        ["Revider for presisjon", "Fjern gjentakelser og tomme fraser; marker usikkerhet og avgrensninger eksplisitt.", "Kunne levere en stram og etterprøvbar tekst.", "Hver hovedpåstand har belegg eller tydelig forbehold."]
      ],
      learn: [
        ["Hent frem hovedbegrepene uten hjelp", `Skriv ned det du husker om «${theme}» før du ser på kartet.`, "Kunne hente frem sentrale begreper aktivt.", "Minst tre relevante begreper er hentet frem."],
        ["Forklar sammenhengene", `Forklar hvorfor «${tension}» er en reell spenning.`, "Kunne binde begreper sammen, ikke bare liste dem.", "Minst to relasjoner er forklart med egne ord."],
        ["Bruk innsikten på et nytt eksempel", `Anvend «${short(insight, 120)}» på en annen situasjon.`, "Kunne overføre forståelsen til en ny kontekst.", "Ett nytt eksempel og begrunnelsen er skrevet."],
        ["Test og planlegg repetisjon", "Lag tre kontrollspørsmål og bestem når du skal prøve dem igjen.", "Kunne oppdage kunnskapshull og repetere målrettet.", "Tre spørsmål og ett repetisjonstidspunkt er registrert."]
      ],
      execute: [
        ["Definer ønsket resultat", `Beskriv hva som konkret skal være annerledes når arbeidet med «${theme}» er ferdig.`, "Kunne formulere et observerbart resultat.", "Resultatet har kriterium og avgrensning."],
        ["Velg neste handling", `Gjør «${short(parts.actions[0] || insight, 120)}» om til én utførbar oppgave.`, "Kunne oversette innsikt til handling.", "Oppgaven har ansvar, første steg og ferdigkriterium."],
        ["Gjennomfør og dokumenter", "Utfør oppgaven og noter hva som faktisk skjedde, uten å omskrive forventning til resultat.", "Kunne skille plan fra observert effekt.", "Resultatet og relevant belegg er loggført."],
        ["Evaluer og juster", "Sammenlign resultatet med ferdigkriteriet og velg neste konkrete justering.", "Kunne lære av gjennomføringen.", "Avvik, læring og neste handling er registrert."]
      ]
    };
    return plans[goal] || plans.understand;
  }

  function buildPathArtifact(cacheArg, conceptList, options = {}) {
    const parts = analysisParts(cacheArg);
    if (!parts.theme || (!parts.keyInsight && !parts.tension)) return null;
    const goalMode = detectPathGoal(cacheArg, options);
    const steps = [];
    if (conceptList?.id && ["understand", "learn", "investigate"].includes(goalMode)) {
      steps.push({
        title: `Orienter deg i tankekartet om ${parts.theme}`,
        type: "concept_list", source: "aha_concept_lists", refId: conceptList.id,
        status: "planned", narrative: "Start med de presise begrepene og de navngitte relasjonene AHA fant.",
        learningOutcome: "Kunne peke ut sentrale begreper og relasjonstyper.",
        meta: { analysisSourceHash: parts.sourceHash, completionCriterion: "Kartets sentrale node og minst to relasjoner er forklart." }
      });
    }
    stepPlan(parts, goalMode).forEach((item, index) => {
      steps.push(step(item[0], item[1], item[2], item[3], parts.sourceHash, index));
    });
    const type = goalMode === "write" ? "publishing" : goalMode === "execute" ? "process" : "learning";
    const mode = ["write", "execute", "investigate"].includes(goalMode) ? "process" : "learning";
    const purpose = {
      understand: "forstå temaet med belegg og tydelige skiller",
      investigate: "undersøke hovedspenningen med støtte og motbelegg",
      write: "skrive en presis og kildebundet tekst",
      learn: "lære stoffet gjennom aktiv gjenhenting og anvendelse",
      execute: "gjennomføre en konkret handling og evaluere effekten"
    }[goalMode];
    return {
      title: `${GOALS[goalMode]}: ${parts.theme}`,
      type, mode, category: goalMode,
      description: parts.keyInsight || parts.tension,
      goal: `Bruk den aktive analysen til å ${purpose}.`,
      learningOutcome: stepPlan(parts, goalMode).slice(-1)[0][2],
      tags: ["AHA-analyse", parts.theme, GOALS[goalMode]],
      steps: steps.slice(0, 6),
      meta: {
        createdBy: VERSION, analysisSourceHash: parts.sourceHash, analysisId: parts.analysisId,
        keyInsight: parts.keyInsight, mainTension: parts.tension, goalMode, adaptive: true, local_only: true
      }
    };
  }

  function findArtifact(records, sourceHash, goalMode = "") {
    return arr(records).find((item) => {
      if (item?.deletedAt || item?.deleted_at) return false;
      if (text(item?.meta?.analysisSourceHash) !== sourceHash) return false;
      return !goalMode || text(item?.meta?.goalMode) === goalMode || !text(item?.meta?.goalMode);
    }) || null;
  }

  function saveMindmapFromActiveAnalysis(cacheArg) {
    const artifact = buildMindmapArtifact(cacheArg);
    const api = global.AHALists;
    if (!artifact) return { ok: false, reason: "no_active_analysis" };
    if (!api?.loadConceptLists || !api?.createConceptList) return { ok: false, reason: "lists_unavailable" };
    const records = api.loadConceptLists();
    const existing = findArtifact(records, artifact.meta.analysisSourceHash);
    if (!existing) {
      const created = api.createConceptList(artifact);
      return created ? { ok: true, artifact: created, existing: false } : { ok: false, reason: "save_failed" };
    }
    if (!api.saveConceptLists) return { ok: true, artifact: existing, existing: true };
    const updated = { ...existing, ...artifact, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
    api.saveConceptLists(records.map((item) => item.id === existing.id ? updated : item));
    return { ok: true, artifact: updated, existing: true, upgraded: true };
  }

  function savePathFromActiveAnalysis(cacheArg, options = {}) {
    const mindmap = saveMindmapFromActiveAnalysis(cacheArg);
    if (!mindmap.ok) return mindmap;
    const artifact = buildPathArtifact(cacheArg, mindmap.artifact, options);
    const api = global.AHAPaths;
    if (!artifact) return { ok: false, reason: "no_active_analysis" };
    if (!api?.loadPaths || !api?.createPath) return { ok: false, reason: "paths_unavailable" };
    const records = api.loadPaths();
    const existing = findArtifact(records, artifact.meta.analysisSourceHash, artifact.meta.goalMode);
    if (!existing) {
      const created = api.createPath(artifact);
      return created ? { ok: true, artifact: created, mindmap: mindmap.artifact, existing: false } : { ok: false, reason: "save_failed" };
    }
    if (!api.savePaths) return { ok: true, artifact: existing, mindmap: mindmap.artifact, existing: true };
    const updated = { ...existing, ...artifact, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
    api.savePaths(records.map((item) => item.id === existing.id ? updated : item));
    return { ok: true, artifact: updated, mindmap: mindmap.artifact, existing: true, upgraded: true };
  }

  function setStatus(message) {
    global.document?.querySelectorAll?.("[data-analysis-artifact-status]")?.forEach?.((node) => { node.textContent = message; });
  }

  function handleClick(event) {
    const button = event.target?.closest?.("[data-analysis-artifact]");
    if (!button) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    const isPath = button.dataset.analysisArtifact === "path";
    const goal = normalizeGoal(button.dataset.pathGoal);
    const result = isPath ? savePathFromActiveAnalysis(null, { goal }) : saveMindmapFromActiveAnalysis();
    const suffix = result?.artifact?.meta?.goalMode ? ` (${GOALS[result.artifact.meta.goalMode]})` : "";
    setStatus(result.ok
      ? (isPath ? `Den adaptive stien er klar under Stier${suffix}.` : "Det presise tankekartet er klart under Kart.")
      : "Kunne ikke lagre: analyser en tekst først.");
  }

  function install() {
    const artifacts = global.AHAAnalysisArtifacts;
    if (artifacts && artifacts.__ahaAdaptiveArtifacts !== VERSION) {
      artifacts.buildMindmapArtifact = buildMindmapArtifact;
      artifacts.buildPathArtifact = buildPathArtifact;
      artifacts.saveMindmapFromActiveAnalysis = saveMindmapFromActiveAnalysis;
      artifacts.savePathFromActiveAnalysis = savePathFromActiveAnalysis;
      artifacts.__ahaAdaptiveArtifacts = VERSION;
    }
    if (global.document?.addEventListener && !global.__ahaAdaptiveArtifactClickInstalled) {
      global.document.addEventListener("click", handleClick, true);
      global.__ahaAdaptiveArtifactClickInstalled = true;
    }
    return Boolean(artifacts);
  }

  const api = Object.freeze({
    VERSION, RELATIONS, GOALS, analysisParts, splitTension, causalPair, exampleFrom,
    buildMindmapArtifact, normalizeGoal, detectPathGoal, stepPlan, buildPathArtifact,
    saveMindmapFromActiveAnalysis, savePathFromActiveAnalysis, install
  });
  global.AHAAdaptiveArtifacts = api;
  global.AHAModuleApi?.register?.("analysis.adaptiveArtifacts", api, {
    version: 1, legacyGlobal: "AHAAdaptiveArtifacts", exports: Object.keys(api)
  });

  if (global.document?.readyState === "loading") global.document.addEventListener?.("DOMContentLoaded", install, { once: true });
  else install();
})(typeof window !== "undefined" ? window : globalThis);