// ahaProjectionProductReadModelV2.js
// Read-only coordinator. It accepts explicit input, calls the existing V2 gate,
// and returns one shared product model without touching runtime stores.
(function (global) {
  "use strict";

  const MODULE_SCHEMA = "aha_projection_product_read_model_builder_v2";
  const MODULE_VERSION = 2;

  const TOPIC_STOPWORDS = new Set((
    "og i på av til er et en det som med for den de å om men at fra har hadde blir ble kan skal må " +
    "eller ikke når etter før ved også dette disse seg sine sin sitt være var mens mot mellom bare " +
    "alene andre begge bedre derfor både bade samtidig antall prosent dagen dager samme flere færre " +
    "viser melder peker beskriver advarer bruker brukes gjør gjorde avslører avslorer virker gir ga øker " +
    "falt steg står sto får vite foreslår foreslar rapporterer varierer målt målte ordnes gjøres formes " +
    "studien gruppene deltakere byrådet byradet kommunen tiltaket effekten effektene avgjørelsen begrunnelsen " +
    "sykehuset lærere laerere tillitsvalgte innbyggerne reisende byggets arrangementer noen"
  ).split(/\s+/).filter(Boolean));

  const LOW_INFORMATION_CONCEPTS = new Set((
    "alene andre begge bedre derfor både bade samtidig antall prosent dagen dager samme bruker gjør steg " +
    "beskriver advarer avslører avslorer byggets barnets"
  ).split(/\s+/).filter(Boolean));

  const NOUNISH_SUFFIX = /(ing|ning|het|else|skap|asjon|sjon|itet|isme|tid|bruk|marked|arbeid|lån|laan|resultat|temperatur|vekst|behov|situasjon|faktor|forskjell|spørsmål|sporsmal|belegg|fravær|fravaer|inntekt|kvalitet|oppmerksomhet|konsentrasjon|standardisering|fleksibilitet|punktlighet|strømbruk|strombruk|turisme)$/u;

  function integrationApi() {
    return global.AHAV2ProductIntegrationGate || null;
  }

  function contractApi() {
    return global.AHAProjectionProductContractV2 || null;
  }

  function qualityApi() {
    return global.AHAProjectionArtifactQualityV2 || null;
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalize(value) {
    return String(value == null ? "" : value)
      .toLocaleLowerCase("no")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function sentenceCase(value) {
    const cleaned = String(value || "").replace(/\s+/g, " ").trim();
    return cleaned ? cleaned.charAt(0).toLocaleUpperCase("no") + cleaned.slice(1) : "";
  }

  function short(value, max = 92) {
    const cleaned = String(value || "").replace(/\s+/g, " ").trim();
    if (cleaned.length <= max) return cleaned;
    return `${cleaned.slice(0, Math.max(1, max - 2)).trimEnd()} …`;
  }

  function insightText(insight) {
    return String(insight?.insight || insight?.summary || insight?.title || "").replace(/\s+/g, " ").trim();
  }

  function tokens(value) {
    const source = String(value || "");
    const result = [];
    const expression = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu;
    let match;
    let ordinal = 0;
    while ((match = expression.exec(source)) !== null) {
      result.push({
        display: match[0],
        norm: normalize(match[0]),
        start: match.index,
        end: match.index + match[0].length,
        ordinal: ordinal++
      });
    }
    return result;
  }

  function isTopicToken(token) {
    if (!token?.norm || /^\d+$/u.test(token.norm)) return false;
    if (token.norm.length < 3 || TOPIC_STOPWORDS.has(token.norm)) return false;
    return true;
  }

  function singleScore(token) {
    let score = Math.min(3.4, token.norm.length / 4);
    if (token.ordinal <= 4) score += 0.8;
    if (NOUNISH_SUFFIX.test(token.norm)) score += 1.15;
    if (token.norm.length >= 9) score += 0.45;
    return score;
  }

  function topicCandidates(value) {
    const source = String(value || "");
    const all = tokens(source);
    const content = all.filter(isTopicToken);
    const candidates = content.map((token) => ({
      label: token.display,
      norm: token.norm,
      score: singleScore(token)
    }));

    for (let index = 0; index < content.length - 1; index += 1) {
      const left = content[index];
      const right = content[index + 1];
      if (right.ordinal - left.ordinal > 2) continue;
      const label = source.slice(left.start, right.end).replace(/\s+/g, " ").trim();
      const norm = normalize(label);
      if (!norm || label.length > 44) continue;
      let score = singleScore(left) + singleScore(right) + 1.25;
      if (/s$/u.test(left.norm)) score += 0.75;
      candidates.push({ label, norm, score });
    }

    const byNorm = new Map();
    candidates.forEach((candidate) => {
      const existing = byNorm.get(candidate.norm);
      if (!existing || candidate.score > existing.score) byNorm.set(candidate.norm, candidate);
    });
    return [...byNorm.values()].sort((left, right) => (
      right.score - left.score
      || right.label.length - left.label.length
      || left.norm.localeCompare(right.norm, "no")
    ));
  }

  function chooseTopic(texts, options = {}) {
    const excluded = new Set(Array.from(options.exclude || []).map(normalize));
    const candidates = [];
    [...new Set((Array.isArray(texts) ? texts : []).map((value) => String(value || "").trim()).filter(Boolean))]
      .sort((left, right) => normalize(left).localeCompare(normalize(right), "no"))
      .forEach((value) => topicCandidates(value).slice(0, 5).forEach((candidate, rank) => {
        if (excluded.has(candidate.norm)) return;
        candidates.push({ ...candidate, score: candidate.score - (rank * 0.22) });
      }));

    candidates.sort((left, right) => (
      right.score - left.score
      || right.label.length - left.label.length
      || left.norm.localeCompare(right.norm, "no")
    ));

    const picked = [];
    const used = new Set(excluded);
    for (const candidate of candidates) {
      if (used.has(candidate.norm)) continue;
      if ([...used].some((value) => value && (candidate.norm.includes(value) || value.includes(candidate.norm)))) continue;
      picked.push(candidate);
      used.add(candidate.norm);
      if (picked.length >= (options.maxParts || 2)) break;
    }

    if (!picked.length) return "kildens hovedspørsmål";
    return picked.map((candidate, index) => index ? candidate.label.toLocaleLowerCase("no") : candidate.label).join(" og ");
  }

  function linkedInsightTexts(model, refs) {
    const insights = Array.isArray(model?.surfaces?.insights) ? model.surfaces.insights : [];
    const byId = new Map(insights.map((insight) => [String(insight.id || ""), insightText(insight)]));
    const selected = (Array.isArray(refs) ? refs : []).map((ref) => byId.get(String(ref || ""))).filter(Boolean);
    return selected.length ? selected : insights.map(insightText).filter(Boolean);
  }

  function refineLists(model) {
    const lists = Array.isArray(model?.surfaces?.lists) ? model.surfaces.lists : [];
    lists.forEach((list) => {
      const refs = (Array.isArray(list.items) ? list.items : []).map((item) => item?.refId || item?.ref_id).filter(Boolean);
      const texts = linkedInsightTexts(model, refs);
      const topic = chooseTopic(texts, { maxParts: Math.min(2, Math.max(1, texts.length)) });
      list.title = `Tematisk: ${sentenceCase(topic)}`;
      list.description = `Temaet «${topic}» samler ${Math.max(1, refs.length)} kildestøttede innsikter som belyser samme spørsmål fra ulike sider.`;
      if (list.meta && typeof list.meta === "object") {
        list.meta.product_topic = topic;
        list.meta.language_refined_v2 = true;
      }
    });
  }

  function refinePaths(model) {
    const paths = Array.isArray(model?.surfaces?.paths) ? model.surfaces.paths : [];
    const insightById = new Map((Array.isArray(model?.surfaces?.insights) ? model.surfaces.insights : [])
      .map((insight) => [String(insight.id || ""), insightText(insight)]));

    paths.forEach((path) => {
      const refs = (Array.isArray(path.steps) ? path.steps : []).map((step) => step?.refId || step?.ref_id).filter(Boolean);
      const texts = linkedInsightTexts(model, refs);
      const topic = chooseTopic(texts, { maxParts: 2 });
      path.title = `Undersøk ${sentenceCase(topic)}`;
      path.description = `En kildebundet læringssti gjennom ${topic}, fra påstand og belegg til spenning, usikkerhet og neste spørsmål.`;
      path.goal = `Bygg en etterprøvbar forståelse av ${topic} uten å gå lenger enn kildene tillater.`;

      const distinctTexts = [...new Set(texts)];
      (Array.isArray(path.steps) ? path.steps : []).forEach((step, index) => {
        const referenced = insightById.get(String(step?.refId || step?.ref_id || "")) || distinctTexts[index % Math.max(1, distinctTexts.length)] || "";
        const other = distinctTexts.find((value) => value && value !== referenced) || referenced;
        const quote = short(referenced, 86);
        const otherQuote = short(other, 76);
        const stage = String(step?.meta?.stage || "");

        if (stage === "orientation") {
          step.title = `1. Avgrens ${sentenceCase(topic)}`;
          step.narrative = `Start med «${quote}». Avgrens hva utsagnet faktisk sier om ${topic}, og finn kildegrunnlaget før du tolker videre.`;
          step.learningOutcome = `Kunne formulere hovedspørsmålet om ${topic} og peke på utsagnet som forankrer det.`;
        } else if (stage === "claim_evidence") {
          step.title = "2. Koble utsagnet til belegg";
          step.narrative = `Bruk «${quote}» som kontrollpunkt. Skill mellom selve utsagnet, belegget i kilden og det som bare ville være en videre tolkning.`;
          step.learningOutcome = `Kunne knytte en konkret påstand om ${topic} til belegg uten å overdrive kildens rekkevidde.`;
        } else if (stage === "tension_counterexample") {
          step.title = "3. Test spenningen i materialet";
          step.narrative = `Sett «${quote}» opp mot «${otherQuote}». Undersøk om de peker i ulike retninger, avgrenser hverandre eller åpner for et moteksempel.`;
          step.learningOutcome = `Kunne forklare den viktigste spenningen i materialet om ${topic} med to konkrete holdepunkter.`;
        } else if (stage === "uncertainty") {
          step.title = `4. Avklar hva ${sentenceCase(topic)} ikke avgjør`;
          step.narrative = `Ta utgangspunkt i «${quote}». Marker hva materialet fortsatt ikke kan avgjøre, og hvilke alternative forklaringer som fortsatt er åpne.`;
          step.learningOutcome = `Kunne skille dokumentert kunnskap om ${topic} fra begrunnet usikkerhet og åpne spørsmål.`;
        } else if (stage === "synthesis_next_inquiry") {
          step.title = "5. Syntetiser og velg neste undersøkelse";
          step.narrative = `Sammenfatt hva som faktisk holder om ${topic} etter de foregående kontrollene, og formuler ett presist spørsmål som kan redusere den viktigste usikkerheten.`;
          step.learningOutcome = `Kunne formulere en kildeforankret syntese av ${topic} og ett gjennomførbart neste spørsmål.`;
        }
      });
      if (path.meta && typeof path.meta === "object") {
        path.meta.product_topic = topic;
        path.meta.language_refined_v2 = true;
      }
    });
  }

  function restoreSourceLabel(label, texts) {
    const target = normalize(label);
    if (!target) return String(label || "");
    for (const value of texts) {
      const found = tokens(value).find((token) => token.norm === target);
      if (found) return found.display;
    }
    return String(label || "");
  }

  function refineMindmap(model) {
    const mindmap = model?.surfaces?.mindmap;
    if (!mindmap || !Array.isArray(mindmap.nodes) || !Array.isArray(mindmap.edges)) return;
    const insights = Array.isArray(model?.surfaces?.insights) ? model.surfaces.insights : [];
    const insightById = new Map(insights.map((insight) => [String(insight.id || ""), insightText(insight)]));
    const allTexts = insights.map(insightText).filter(Boolean);
    const topic = chooseTopic(allTexts, { maxParts: 2 });
    const used = new Set([normalize(topic)]);

    mindmap.nodes.forEach((node) => {
      if (node?.meta?.root === true || String(node?.type || "") === "theme") {
        node.label = `Tema: ${sentenceCase(topic)}`;
        node.title = node.label;
        if (node.meta && typeof node.meta === "object") {
          node.meta.product_topic = topic;
          node.meta.language_refined_v2 = true;
        }
      }
    });

    mindmap.nodes.filter((node) => String(node?.type || "") === "concept").forEach((node) => {
      const linkedIds = mindmap.edges
        .filter((edge) => String(edge?.from || "") === String(node.id || "") && String(edge?.type || "") === "supports_insight")
        .map((edge) => String(edge?.to || ""));
      const linkedTexts = linkedIds.map((id) => insightById.get(id)).filter(Boolean);
      const sourceTexts = linkedTexts.length ? linkedTexts : allTexts;
      const restored = restoreSourceLabel(node.label || node.title, sourceTexts);
      const normalizedRestored = normalize(restored);
      let nextLabel = restored;

      if (LOW_INFORMATION_CONCEPTS.has(normalizedRestored) || normalizedRestored.length < 4) {
        nextLabel = chooseTopic(sourceTexts, { maxParts: 1, exclude: used });
      }
      if (!nextLabel || normalize(nextLabel) === "kildens hovedspørsmål") nextLabel = restored;
      node.label = sentenceCase(nextLabel);
      node.title = node.label;
      used.add(normalize(nextLabel));
      if (node.meta && typeof node.meta === "object") node.meta.language_refined_v2 = true;
    });
  }

  function refineProductLanguage(model) {
    if (!model || typeof model !== "object" || !model.surfaces) return model;
    const refined = clone(model);
    if (!Array.isArray(refined?.surfaces?.insights) || !refined.surfaces.insights.length) return refined;
    refineLists(refined);
    refinePaths(refined);
    refineMindmap(refined);
    refined.product_language = {
      schema: "aha_projection_product_language_v2",
      version: 1,
      status: "contextualized",
      source: "read_model_insight_content",
      read_only: true
    };
    return refined;
  }

  function withProductQuality(model) {
    const quality = qualityApi();
    return quality?.filterReadModel ? quality.filterReadModel(model) : model;
  }

  function unavailable(reasons) {
    const contract = contractApi();
    if (contract?.blocked) return contract.blocked(reasons);
    return {
      schema: "aha_projection_product_read_model_v2",
      version: MODULE_VERSION,
      mode: "read_only",
      status: "blocked",
      blocking_reasons: Array.isArray(reasons) ? reasons : [String(reasons || "read_model_unavailable")],
      surfaces: { insights: [], concepts: [], lists: [], paths: [], mindmap: { nodes: [], edges: [], read_only: true } },
      validation: { valid: false, errors: ["read_model_dependencies_unavailable"] },
      policy: {}
    };
  }

  function fromIntegration(integration) {
    const contract = contractApi();
    if (!contract?.build) return unavailable(["projection_product_contract_v2_unavailable"]);
    return withProductQuality(refineProductLanguage(contract.build(integration)));
  }

  function build(input = {}) {
    const integration = integrationApi();
    const contract = contractApi();
    const missing = [];
    if (!integration?.preview) missing.push("v2_product_integration_gate_unavailable");
    if (!contract?.build) missing.push("projection_product_contract_v2_unavailable");
    if (missing.length) return unavailable(missing);
    return withProductQuality(refineProductLanguage(contract.build(integration.preview(input))));
  }

  function surface(model, name) {
    const contract = contractApi();
    return contract?.surface ? contract.surface(model, name) : null;
  }

  const api = Object.freeze({ MODULE_SCHEMA, MODULE_VERSION, build, fromIntegration, surface, withProductQuality, refineProductLanguage });
  global.AHAProjectionProductReadModelV2 = api;
  global.AHAModuleApi?.register?.("projectionProductReadModelV2", api, {
    version: MODULE_VERSION,
    legacyGlobal: "AHAProjectionProductReadModelV2",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
