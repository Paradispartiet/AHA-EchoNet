// ahaProjectionProductReadModelV2.js
// Read-only coordinator. It accepts explicit input, calls the existing V2 gate,
// and returns one shared product model without touching runtime stores.
(function (global) {
  "use strict";

  const MODULE_SCHEMA = "aha_projection_product_read_model_builder_v2";
  const MODULE_VERSION = 2;

  function normalize(value) {
    return String(value == null ? "" : value)
      .toLocaleLowerCase("no")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const TOPIC_STOPWORDS = new Set((
    "og i på av til er et en jeg vi det som med for den de å om men at fra har hadde blir ble kan skal må " +
    "eller ikke når etter før ved også dette disse seg sine sin sitt være var mens mot mellom bare selv " +
    "alene andre begge bedre derfor både samtidig antall prosent dagen dager samme flere færre mye noe noen " +
    "viser vise melder meldte peker pekte beskriver beskrev advarer advarte bruker brukes brukte gjør gjorde " +
    "avslører virker gir ga øker økte falt faller stiger steg står sto får fikk vite foreslår rapporterer " +
    "varierer målt målte ordnes gjøres formes former bevarer fortelles prøver fanger fanget isolere prioritere " +
    "prioriterer vektes konkurrerer sparer optimaliseres oppstår strukturerer presser skjule skjuler hjelper " +
    "begrenses begrenser forstår leser usikker forklare mangler går virker sov husket haster mister gjort " +
    "studien gruppene deltakere byrådet kommunen tiltaket effekten effektene avgjørelsen begrunnelsen " +
    "sykehuset lærere tillitsvalgte innbyggerne reisende byggets arrangementer team problemet målingen målinger " +
    "oppgavene verktøy digitale offentlig organ skoler kortere høyere roligere uendret foreløpig tilfeldige " +
    "vanskeligere viktigere innstilte mildere sterkest krevende valgfrie felles aktive raske uventede dårlig " +
    "klare direkte faktisk utvidede lokale tette hyppig gjentatt spontan muntlige enkel konkrete grunnleggende " +
    "små store tre få gratis kvelden pausen semester videre samme lett senere forskere utvalgte søkbare bestemte"
  ).split(/\s+/).filter(Boolean).map(normalize));

  const LOW_INFORMATION_CONCEPTS = new Set((
    "alene andre begge bedre derfor både samtidig antall prosent dagen dager samme bruker gjør steg " +
    "beskriver advarer avslører byggets barnets felles valgfrie noen effekten problemet målingen studien " +
    "deltakere gruppene reisende lærere tillitsvalgte sykehuset byrådet kommunen tiltaket innbyggerne"
  ).split(/\s+/).filter(Boolean).map(normalize));

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
    if (token.norm.length < 4 || TOPIC_STOPWORDS.has(token.norm)) return false;
    return true;
  }

  function segments(value) {
    return String(value || "")
      .split(/\s*(?:[.!?]+|,\s*(?:men|mens)\s+|\s+(?:men|mens|samtidig|likevel|derfor)\s+)\s*/giu)
      .map((part) => part.replace(/^[\s,;:]+|[\s,;:]+$/g, "").trim())
      .filter(Boolean);
  }

  function overlapsUsed(normValue, used) {
    if (!normValue) return true;
    for (const existing of used) {
      if (!existing) continue;
      if (existing === normValue || existing.includes(normValue) || normValue.includes(existing)) return true;
    }
    return false;
  }

  function bestSegmentTerm(value, used = new Set()) {
    const sourceTokens = tokens(value);

    for (let index = 0; index < sourceTokens.length - 1; index += 1) {
      const left = sourceTokens[index];
      const right = sourceTokens[index + 1];
      if (!isTopicToken(left) || !isTopicToken(right)) continue;
      if (!left.norm.endsWith("s")) continue;
      const pairNorm = `${left.norm} ${right.norm}`;
      if (!overlapsUsed(pairNorm, used)) {
        return { label: `${left.display} ${right.display}`, norm: pairNorm };
      }
    }

    for (const token of sourceTokens) {
      if (!isTopicToken(token) || overlapsUsed(token.norm, used)) continue;
      return { label: token.display, norm: token.norm };
    }
    return null;
  }

  function chooseTopic(texts, options = {}) {
    const used = new Set(Array.from(options.exclude || []).map(normalize));
    const picked = [];
    const maxParts = Math.max(1, Number(options.maxParts || 2));
    const uniqueTexts = [];
    const seenTexts = new Set();

    (Array.isArray(texts) ? texts : []).forEach((value) => {
      const cleaned = String(value || "").replace(/\s+/g, " ").trim();
      const key = normalize(cleaned);
      if (!cleaned || seenTexts.has(key)) return;
      seenTexts.add(key);
      uniqueTexts.push(cleaned);
    });

    for (const text of uniqueTexts) {
      for (const segment of segments(text)) {
        const term = bestSegmentTerm(segment, used);
        if (!term) continue;
        picked.push(term);
        used.add(term.norm);
        if (picked.length >= maxParts) break;
      }
      if (picked.length >= maxParts) break;
    }

    if (!picked.length) {
      return { label: "kildens hovedspørsmål", terms: [] };
    }
    const label = picked
      .map((term, index) => index === 0 ? sentenceCase(term.label) : term.label.toLocaleLowerCase("no"))
      .join(" · ");
    return { label, terms: picked };
  }

  function linkedInsightTexts(model, refs) {
    const insights = Array.isArray(model?.surfaces?.insights) ? model.surfaces.insights : [];
    const byId = new Map(insights.map((insight) => [String(insight.id || ""), insightText(insight)]));
    const requested = Array.isArray(refs) && refs.length
      ? [...new Set(refs.map((ref) => String(ref || "")).filter(Boolean))].sort((left, right) => left.localeCompare(right, "no"))
      : [...byId.keys()].sort((left, right) => left.localeCompare(right, "no"));
    return requested.map((ref) => byId.get(ref)).filter(Boolean);
  }

  function refineLists(model) {
    const lists = Array.isArray(model?.surfaces?.lists) ? model.surfaces.lists : [];
    lists.forEach((list) => {
      const refs = (Array.isArray(list.items) ? list.items : []).map((item) => item?.refId || item?.ref_id).filter(Boolean);
      const texts = linkedInsightTexts(model, refs);
      const topic = chooseTopic(texts, { maxParts: Math.min(2, Math.max(1, texts.length)) });
      list.title = `Tematisk: ${topic.label}`;
      list.description = `Disse ${Math.max(1, refs.length)} kildestøttede innsiktene er samlet under temaet «${topic.label}» fordi de belyser samme spørsmål fra ulike sider.`;
      if (list.meta && typeof list.meta === "object") {
        list.meta.product_topic = topic.label;
        list.meta.language_refined_v2 = true;
      }
    });
  }

  function refinePaths(model) {
    const paths = Array.isArray(model?.surfaces?.paths) ? model.surfaces.paths : [];
    const insights = Array.isArray(model?.surfaces?.insights) ? model.surfaces.insights : [];
    const insightById = new Map(insights.map((insight) => [String(insight.id || ""), insightText(insight)]));

    paths.forEach((path) => {
      const refs = (Array.isArray(path.steps) ? path.steps : []).map((step) => step?.refId || step?.ref_id).filter(Boolean);
      const texts = linkedInsightTexts(model, refs);
      const topic = chooseTopic(texts, { maxParts: 2 });
      path.title = `Undersøk: ${topic.label}`;
      path.description = `En kildebundet læringssti om «${topic.label}», fra påstand og belegg til spenning, usikkerhet og neste spørsmål.`;
      path.goal = "Bygg en etterprøvbar forståelse av hovedspørsmålet uten å gå lenger enn kildene tillater.";

      const distinctTexts = [...new Set(texts)];
      (Array.isArray(path.steps) ? path.steps : []).forEach((step, index) => {
        const referenced = insightById.get(String(step?.refId || step?.ref_id || "")) || distinctTexts[index % Math.max(1, distinctTexts.length)] || "";
        const other = distinctTexts.find((value) => value && value !== referenced) || referenced;
        const quote = short(referenced, 86);
        const otherQuote = short(other, 76);
        const stage = String(step?.meta?.stage || "");

        if (stage === "orientation") {
          step.title = "1. Avgrens hovedspørsmålet";
          step.narrative = `Start med «${quote}». Avgrens hva utsagnet faktisk sier, og finn kildegrunnlaget før du tolker videre.`;
          step.learningOutcome = "Kunne formulere hva materialet faktisk hevder og peke på utsagnet som forankrer det.";
        } else if (stage === "claim_evidence") {
          step.title = "2. Koble utsagnet til belegg";
          step.narrative = `Bruk «${quote}» som kontrollpunkt. Skill mellom selve utsagnet, belegget i kilden og det som bare ville være en videre tolkning.`;
          step.learningOutcome = "Kunne knytte en konkret påstand til belegg uten å overdrive kildens rekkevidde.";
        } else if (stage === "tension_counterexample") {
          step.title = "3. Test spenningen i materialet";
          step.narrative = `Sett «${quote}» opp mot «${otherQuote}». Undersøk om de peker i ulike retninger, avgrenser hverandre eller åpner for et moteksempel.`;
          step.learningOutcome = "Kunne forklare den viktigste spenningen i materialet med to konkrete holdepunkter.";
        } else if (stage === "uncertainty") {
          step.title = "4. Marker det materialet ikke avgjør";
          step.narrative = `Ta utgangspunkt i «${quote}». Marker hva materialet fortsatt ikke kan avgjøre, og hvilke alternative forklaringer som fortsatt er åpne.`;
          step.learningOutcome = "Kunne skille dokumentert kunnskap fra begrunnet usikkerhet og åpne spørsmål.";
        } else if (stage === "synthesis_next_inquiry") {
          step.title = "5. Syntetiser og velg neste undersøkelse";
          step.narrative = "Sammenfatt hva som faktisk holder etter de foregående kontrollene, og formuler ett presist spørsmål som kan redusere den viktigste usikkerheten.";
          step.learningOutcome = "Kunne formulere en kildeforankret syntese og ett gjennomførbart neste spørsmål.";
        }
      });
      if (path.meta && typeof path.meta === "object") {
        path.meta.product_topic = topic.label;
        path.meta.language_refined_v2 = true;
      }
    });
  }

  function cleanConceptLabel(label, sourceTexts, used) {
    const original = String(label || "").replace(/\s+/g, " ").trim();
    const originalNorm = normalize(original);
    const sourceTokens = tokens(original);
    const content = sourceTokens.filter(isTopicToken);
    const hasNoise = sourceTokens.some((token) => TOPIC_STOPWORDS.has(token.norm));
    const explicitlyLow = LOW_INFORMATION_CONCEPTS.has(originalNorm);

    if (!explicitlyLow && content.length && !hasNoise) {
      const selected = [];
      for (const token of content) {
        if (overlapsUsed(token.norm, used)) continue;
        selected.push(token);
        if (selected.length >= 2) break;
      }
      if (selected.length) {
        return selected.map((token, index) => index ? token.display.toLocaleLowerCase("no") : sentenceCase(token.display)).join(" · ");
      }
    }

    if (!explicitlyLow && content.length) {
      const selected = [];
      for (const token of content) {
        if (overlapsUsed(token.norm, used)) continue;
        selected.push(token);
        if (selected.length >= 2) break;
      }
      if (selected.length) {
        return selected.map((token, index) => index ? token.display.toLocaleLowerCase("no") : sentenceCase(token.display)).join(" · ");
      }
    }

    const fallback = chooseTopic(sourceTexts, { maxParts: 1, exclude: used });
    if (fallback.terms.length) return fallback.label;
    return original || "Kildeinnsikt";
  }

  function refineMindmap(model) {
    const mindmap = model?.surfaces?.mindmap;
    if (!mindmap || !Array.isArray(mindmap.nodes) || !Array.isArray(mindmap.edges)) return;
    const insights = Array.isArray(model?.surfaces?.insights) ? model.surfaces.insights : [];
    const insightById = new Map(insights.map((insight) => [String(insight.id || ""), insightText(insight)]));
    const allTexts = linkedInsightTexts(model, []);
    const topic = chooseTopic(allTexts, { maxParts: 2 });
    const used = new Set(topic.terms.map((term) => term.norm));

    mindmap.nodes.forEach((node) => {
      if (node?.meta?.root === true || String(node?.type || "") === "theme") {
        node.label = `Tema: ${topic.label}`;
        node.title = node.label;
        if (node.meta && typeof node.meta === "object") {
          node.meta.product_topic = topic.label;
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
      const nextLabel = cleanConceptLabel(node.label || node.title, sourceTexts, used);
      node.label = sentenceCase(nextLabel);
      node.title = node.label;
      tokens(nextLabel).filter(isTopicToken).forEach((token) => used.add(token.norm));
      if (node.meta && typeof node.meta === "object") node.meta.language_refined_v2 = true;
    });
  }

  function refsSignature(values) {
    const refs = [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "")).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, "no"));
    return refs.length ? refs.join("|") : "";
  }

  function dedupeArtifacts(items, refsForItem) {
    const seen = new Set();
    const result = [];
    let removed = 0;
    (Array.isArray(items) ? items : []).forEach((item) => {
      const signature = refsSignature(refsForItem(item));
      if (signature && seen.has(signature)) {
        removed += 1;
        return;
      }
      if (signature) seen.add(signature);
      result.push(item);
    });
    return { items: result, removed };
  }

  function refineProductLanguage(model) {
    if (!model || typeof model !== "object" || !model.surfaces) return model;
    const refined = clone(model);
    if (!Array.isArray(refined?.surfaces?.insights) || !refined.surfaces.insights.length) return refined;

    refineLists(refined);
    refinePaths(refined);
    refineMindmap(refined);

    const lists = dedupeArtifacts(refined.surfaces.lists, (list) => (list?.items || []).map((item) => item?.refId || item?.ref_id));
    const paths = dedupeArtifacts(refined.surfaces.paths, (path) => (path?.steps || []).map((step) => step?.refId || step?.ref_id));
    refined.surfaces.lists = lists.items;
    refined.surfaces.paths = paths.items;
    refined.product_language = {
      schema: "aha_projection_product_language_v2",
      version: 2,
      status: "contextualized",
      source: "read_model_insight_content",
      topic_strategy: "source_segment_terms",
      duplicate_lists_removed: lists.removed,
      duplicate_paths_removed: paths.removed,
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
