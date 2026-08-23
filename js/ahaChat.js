// Minimal bootstrap for AHA Chat with a fail-closed V2 release-quality guard.

(function (global) {
  "use strict";

  const RELEASE_GUARD_SCHEMA = "aha_v2_release_quality_guard_v1";
  const LONG_SOURCE_LIMIT = 7600;
  const SUBSTANTIVE_SOURCE_MIN = 1200;
  const providerCache = new WeakMap();

  const ACADEMIC_ROLE_SIGNALS = Object.freeze({
    research_question: /\b(?:problemstilling(?:en)?|forskningsspørsmål(?:et|ene)?|research question|formål(?:et)? med (?:studien|artikkelen)|hensikt(?:en)? med (?:studien|artikkelen)|vi undersøker|artikkelen undersøker|studien undersøker)\b/iu,
    method: /\b(?:metode(?:n|r)?|metodisk|datamateriale|materiale og metode|utvalg(?:et)?|informant(?:er|ene)?|intervju(?:er|ene)?|observasjon(?:er|ene)?|casestudie|case study|kvalitativ|kvantitativ|empiri(?:sk)?|analysemetode)\b/iu,
    framework: /\b(?:teori(?:en|er)?|teoretisk|rammeverk(?:et)?|perspektiv(?:et|er)?|begrep(?:et|er)?|conceptual framework|theoretical framework|analytisk tilnærming)\b/iu,
    findings: /\b(?:resultat(?:er|ene)?|funn(?:ene)?|analysen viser|studien viser|vi finner|vi fant|hovedtema(?:ene)?|temaene|informantene (?:beskriver|forteller)|deltakerne (?:beskriver|forteller))\b/iu,
    limitations: /\b(?:begrensning(?:er|ene)?|forbehold|usikkerhet|kan ikke fastslå|ikke nødvendigvis|videre forskning|limitations?)\b/iu,
    conclusion: /\b(?:konklusjon(?:en)?|avslutning|vi konkluderer|vi har vist|vi har argumentert|dette viser|samlet sett|overall|conclusion)\b/iu
  });
  const ACADEMIC_ROLE_ORDER = Object.freeze([
    "research_question", "method", "framework", "findings", "limitations", "conclusion"
  ]);
  const ROLE_HEADING_SIGNALS = Object.freeze({
    research_question: /^(?:problemstilling|forskningsspørsmål|research question)\b/iu,
    method: /^(?:metode|materiale og metode|method|methods)\b/iu,
    framework: /^(?:teori|teoretisk rammeverk|theory|theoretical framework)\b/iu,
    findings: /^(?:resultat|resultater|funn|results|findings)\b/iu,
    limitations: /^(?:begrensninger?|limitations?)\b/iu,
    conclusion: /^(?:konklusjon|avslutning|conclusion)\b/iu
  });

  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function text(value) {
    if (value == null) return "";
    if (["string", "number", "boolean"].includes(typeof value)) return String(value).replace(/\s+/g, " ").trim();
    const source = object(value);
    return text(source.insight || source.text || source.label || source.title || source.summary || source.term || source.value);
  }
  function normalize(value) {
    return text(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
  }
  function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== "object" || seen.has(value)) return value;
    seen.add(value);
    Object.keys(value).forEach((key) => deepFreeze(value[key], seen));
    return Object.freeze(value);
  }
  function uniqueText(values) {
    const seen = new Set();
    return array(values).map(text).filter((value) => {
      const key = normalize(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function splitSourceUnits(sourceText) {
    const source = String(sourceText || "").replace(/\r\n?/g, "\n");
    const paragraphs = source.split(/\n{2,}/).map((part) => part.trim()).filter((part) => part.length >= 40);
    if (paragraphs.length >= 6) return paragraphs;
    const sentences = [];
    const re = /[^.!?\n]+(?:[.!?]+|$)/gu;
    let match;
    while ((match = re.exec(source))) {
      const part = match[0].trim();
      if (part.length >= 35) sentences.push(part);
    }
    return sentences.length ? sentences : [source.trim()].filter(Boolean);
  }

  function rolesForUnit(unit) {
    const value = String(unit || "");
    return ACADEMIC_ROLE_ORDER.filter((role) => ACADEMIC_ROLE_SIGNALS[role].test(value));
  }

  function detectAcademicCoverage(sourceText) {
    const units = splitSourceUnits(sourceText);
    const counts = Object.fromEntries(ACADEMIC_ROLE_ORDER.map((role) => [role, 0]));
    units.forEach((unit) => rolesForUnit(unit).forEach((role) => { counts[role] += 1; }));
    const roles = ACADEMIC_ROLE_ORDER.filter((role) => counts[role] > 0);
    return deepFreeze({ schema: RELEASE_GUARD_SCHEMA, roles, counts, unit_count: units.length });
  }

  function roleUnitScore(unit, role, index) {
    const value = String(unit || "").trim();
    let score = ACADEMIC_ROLE_SIGNALS[role].test(value) ? 10 : 0;
    if (ROLE_HEADING_SIGNALS[role]?.test(value)) score += 8;
    const roleCount = rolesForUnit(value).length;
    score += Math.min(4, roleCount * 2);
    if (value.length >= 100 && value.length <= 1400) score += 2;
    score += Math.max(0, 2 - (index * 0.01));
    return score;
  }

  function focusAcademicSource(sourceText, limit = LONG_SOURCE_LIMIT) {
    const source = String(sourceText || "").trim();
    if (!source || source.length <= limit) return source;
    const coverage = detectAcademicCoverage(source);
    if (coverage.roles.length < 3) return source;
    const units = splitSourceUnits(source);
    if (units.length <= 1) return source.slice(0, limit);

    const chosen = [];
    const chosenKeys = new Set();
    let used = 0;
    const add = (unit) => {
      const value = String(unit || "").trim();
      const key = normalize(value);
      if (!value || chosenKeys.has(key)) return false;
      const extra = value.length + (chosen.length ? 2 : 0);
      if (used + extra > limit) return false;
      chosen.push(value);
      chosenKeys.add(key);
      used += extra;
      return true;
    };

    for (let index = 0; index < Math.min(4, units.length); index += 1) add(units[index]);
    for (let index = Math.max(0, units.length - 3); index < units.length; index += 1) add(units[index]);

    const interior = units.slice(4, Math.max(4, units.length - 3));
    ACADEMIC_ROLE_ORDER.forEach((role) => {
      const candidates = interior.map((unit, index) => ({ unit, index, score: roleUnitScore(unit, role, index) }))
        .filter((item) => item.score >= 10)
        .sort((left, right) => right.score - left.score || left.index - right.index);
      if (candidates.length) add(candidates[0].unit);
    });

    interior.map((unit, index) => {
      const roleCount = rolesForUnit(unit).length;
      const tension = /\b(?:men|mens|samtidig|derimot|likevel|kontrast|spenning|utfordring|problematisk)\b/iu.test(unit) ? 3 : 0;
      const conclusion = ACADEMIC_ROLE_SIGNALS.conclusion.test(unit) ? 4 : 0;
      const density = Math.min(3, normalize(unit).split(/\s+/).filter(Boolean).length / 45);
      return { unit, index, score: (roleCount * 6) + tension + conclusion + density };
    }).sort((left, right) => right.score - left.score || left.index - right.index)
      .forEach(({ unit }) => add(unit));

    return chosen.sort((left, right) => source.indexOf(left) - source.indexOf(right)).join("\n\n").slice(0, limit);
  }

  function collectBundleFields(value, out = []) {
    if (!value || typeof value !== "object") return out;
    if (value.schema === "aha_analysis_field_v2") { out.push(value); return out; }
    if (Array.isArray(value)) value.forEach((item) => collectBundleFields(item, out));
    else Object.values(value).forEach((item) => collectBundleFields(item, out));
    return out;
  }

  function isCoreReadinessField(field) {
    const id = text(field?.field_id);
    return id === "overview.theme"
      || id === "overview.strongest_insight"
      || id === "overview.central_tension"
      || id === "insights.item"
      || id === "sources.primary";
  }

  function fieldPassed(field) {
    return field?.quality?.status === "passed"
      && field?.provenance?.status === "verified"
      && ["verified", "not_applicable"].includes(text(field?.topic?.status));
  }

  function semanticGateState(bundle, semanticDocument) {
    const gate = object(semanticDocument?.synthesis_gate && Object.keys(object(semanticDocument.synthesis_gate)).length
      ? semanticDocument.synthesis_gate
      : bundle?.semantic_document?.synthesis_gate);
    const status = text(gate.status);
    const approvedCount = Number(gate.approved_count ?? bundle?.semantic_document?.approved_insight_ids?.length ?? 0);
    return {
      status,
      authoritative: gate.authoritative === true,
      approvedCount: Number.isFinite(approvedCount) ? approvedCount : 0,
      ready: gate.authoritative === true && Boolean(status) && !["not_run", "blocked"].includes(status) && approvedCount > 0
    };
  }

  function analyzeCoreReadiness(bundle, semanticDocument) {
    const fields = collectBundleFields(bundle?.surfaces);
    const coreFields = fields.filter(isCoreReadinessField);
    const coreBlocked = coreFields.filter((field) => !fieldPassed(field));
    const requiredSingles = ["overview.theme", "overview.strongest_insight", "sources.primary"];
    const missingRequired = requiredSingles.filter((fieldId) => !coreFields.some((field) => text(field?.field_id) === fieldId && fieldPassed(field)));
    const insightFields = coreFields.filter((field) => text(field?.field_id) === "insights.item");
    const allBlocked = fields.filter((field) => !fieldPassed(field));
    const coreBlockedIds = new Set(coreBlocked.map((field) => text(field?.item_id)).filter(Boolean));
    const optionalBlockedIds = allBlocked.map((field) => text(field?.item_id)).filter((id) => id && !coreBlockedIds.has(id));
    const gate = semanticGateState(bundle, semanticDocument);
    const ready = bundle?.status !== "invalid"
      && bundle?.validation?.valid !== false
      && gate.ready
      && missingRequired.length === 0
      && insightFields.length > 0
      && coreBlocked.length === 0;
    return { ready, gate, fields, coreBlocked, optionalBlockedIds, missingRequired };
  }

  function repairAnalysisBundleReadiness(bundle, input = {}, validator = null) {
    if (!bundle || bundle.schema !== "aha_analysis_bundle_v2") return bundle;
    const semanticDocument = input.semanticDocument || bundle.semantic_document;
    if (semanticDocument?.schema !== "aha_semantic_document_v2") return bundle;
    const repaired = clone(bundle);
    const readiness = analyzeCoreReadiness(repaired, semanticDocument);
    if (!repaired.quality || typeof repaired.quality !== "object") repaired.quality = {};
    repaired.quality.blocking_field_ids = readiness.coreBlocked.map((field) => text(field?.item_id)).filter(Boolean);
    repaired.quality.optional_withheld_field_ids = uniqueText(readiness.optionalBlockedIds);
    repaired.quality.required_missing_field_ids = readiness.missingRequired.slice();
    repaired.quality.release_readiness_schema = RELEASE_GUARD_SCHEMA;

    if (readiness.ready) {
      repaired.status = "ready";
      repaired.quality.status = "ready";
      repaired.quality.reasons = uniqueText([
        ...array(repaired.quality.reasons).filter((reason) => ![
          "item_level_evidence_or_topic_incomplete", "one_or_more_fields_rejected"
        ].includes(text(reason))),
        ...(readiness.optionalBlockedIds.length ? ["optional_enrichment_withheld_fail_closed"] : []),
        RELEASE_GUARD_SCHEMA
      ]);
    } else if (repaired.status !== "invalid") {
      repaired.status = "incomplete";
      repaired.quality.status = "incomplete";
      repaired.quality.reasons = uniqueText([
        ...array(repaired.quality.reasons),
        ...(readiness.gate.ready ? [] : ["authoritative_semantic_synthesis_not_ready"]),
        ...(readiness.coreBlocked.length || readiness.missingRequired.length ? ["core_analysis_readiness_blocked"] : []),
        RELEASE_GUARD_SCHEMA
      ]);
    }

    if (typeof validator === "function") {
      repaired.validation = clone(validator(repaired));
      if (repaired.validation?.valid !== true) return bundle;
    }
    return deepFreeze(repaired);
  }

  function repairAnalysisReadModel(model, bundle, validator = null) {
    if (!model || model.schema !== "aha_analysis_read_model_v2") return model;
    const repaired = clone(model);
    const readiness = analyzeCoreReadiness(bundle, bundle?.semantic_document);
    const blocked = uniqueText(repaired.blocked_field_ids);
    const blockingIds = new Set(readiness.coreBlocked.map((field) => text(field?.item_id)).filter(Boolean));
    const blockedCore = blocked.filter((id) => blockingIds.has(id));
    repaired.quality = {
      ...object(repaired.quality),
      blocking_field_count: blockedCore.length,
      optional_withheld_field_count: Math.max(0, blocked.length - blockedCore.length),
      release_readiness_schema: RELEASE_GUARD_SCHEMA
    };
    if (repaired.status !== "invalid" && bundle?.status === "ready" && blockedCore.length === 0) repaired.status = "ready";
    else if (repaired.status !== "invalid") repaired.status = "incomplete";
    if (typeof validator === "function") {
      repaired.validation = clone(validator(repaired));
      if (repaired.validation?.valid !== true) return model;
    }
    return deepFreeze(repaired);
  }

  function repairHydratedReadModel(model, validator = null) {
    if (!model || model.schema !== "aha_analysis_read_model_v2") return model;
    const repaired = clone(model);
    const quality = object(repaired.quality);
    if (repaired.status !== "invalid"
      && text(quality.source_bundle_status) === "ready"
      && Number(quality.blocking_field_count || 0) === 0
      && text(quality.release_readiness_schema) === RELEASE_GUARD_SCHEMA) {
      repaired.status = "ready";
    }
    if (typeof validator === "function") {
      repaired.validation = clone(validator(repaired));
      if (repaired.validation?.valid !== true) return model;
    }
    return deepFreeze(repaired);
  }

  function wrapInsightPipelineInstance(instance) {
    if (!instance || typeof instance.generateAIInsightCandidates !== "function") return instance;
    const generate = instance.generateAIInsightCandidates.bind(instance);
    return Object.freeze({
      ...instance,
      async generateAIInsightCandidates(sourceText, context) {
        const raw = String(sourceText || "");
        const coverage = raw.length >= SUBSTANTIVE_SOURCE_MIN ? detectAcademicCoverage(raw) : { roles: [] };
        const focused = raw.length > LONG_SOURCE_LIMIT && coverage.roles.length >= 3
          ? focusAcademicSource(raw)
          : raw;
        const nextContext = focused !== raw ? {
          ...object(context),
          source_coverage_contract: {
            schema: RELEASE_GUARD_SCHEMA,
            source_length: raw.length,
            focused_length: focused.length,
            academic_roles_present: coverage.roles.slice(),
            minimum_distinct_roles: Math.min(4, coverage.roles.length),
            require_cross_section_semantic_diversity: true,
            preserve_source_uncertainty: true
          }
        } : context;
        return generate(focused, nextContext);
      }
    });
  }

  function wrapAnalysisBundleProvider(provider) {
    if (!provider || typeof provider.build !== "function") return provider;
    return Object.freeze({
      ...provider,
      build(input = {}) {
        const bundle = provider.build(input);
        return repairAnalysisBundleReadiness(bundle, input, typeof provider.validate === "function" ? provider.validate.bind(provider) : null);
      }
    });
  }

  function wrapAnalysisReadModelProvider(provider) {
    if (!provider || typeof provider.build !== "function") return provider;
    return Object.freeze({
      ...provider,
      build(bundle) {
        const model = provider.build(bundle);
        return repairAnalysisReadModel(model, bundle, typeof provider.validate === "function" ? provider.validate.bind(provider) : null);
      },
      hydrate(value) {
        const model = typeof provider.hydrate === "function" ? provider.hydrate(value) : value;
        return repairHydratedReadModel(model, typeof provider.validate === "function" ? provider.validate.bind(provider) : null);
      }
    });
  }

  function cachedProvider(provider, kind, build) {
    if (!provider || (typeof provider !== "object" && typeof provider !== "function")) return provider;
    let cache = providerCache.get(provider);
    if (!cache) { cache = new Map(); providerCache.set(provider, cache); }
    if (!cache.has(kind)) cache.set(kind, build(provider));
    return cache.get(kind);
  }

  function wrapProviderByKey(key, provider) {
    if (key === "analysisBundleV2") return cachedProvider(provider, key, wrapAnalysisBundleProvider);
    if (key === "analysisReadModelV2") return cachedProvider(provider, key, wrapAnalysisReadModelProvider);
    return provider;
  }

  function wrapProviderByName(name, provider) {
    const key = String(name || "").replace(/^chat\./, "");
    return wrapProviderByKey(key, provider);
  }

  function wrapProviderLoader(base) {
    if (!base) return base;
    return Object.freeze({
      ...base,
      resolve(name, legacyGlobal, version) {
        return wrapProviderByName(name, base.resolve(name, legacyGlobal, version));
      },
      require(key) {
        return wrapProviderByKey(key, base.require(key));
      },
      instantiate(key, factoryDeps, options) {
        const instance = base.instantiate(key, factoryDeps, options);
        return key === "insightPipeline" ? wrapInsightPipelineInstance(instance) : instance;
      }
    });
  }

  const releaseQualityGuard = Object.freeze({
    schema: RELEASE_GUARD_SCHEMA,
    longSourceLimit: LONG_SOURCE_LIMIT,
    substantiveSourceMin: SUBSTANTIVE_SOURCE_MIN,
    detectAcademicCoverage,
    focusAcademicSource,
    analyzeCoreReadiness,
    repairAnalysisBundleReadiness,
    repairAnalysisReadModel,
    wrapInsightPipelineInstance,
    wrapProviderLoader
  });
  global.AHAV2ReleaseQualityGuard = releaseQualityGuard;

  const providerLoaderApi = global.AHAModuleApi?.resolve?.(
    "chat.providerLoader", "AHAChatProviderLoader", { version: 1 }
  ) || global.AHAChatProviderLoader;
  if (!providerLoaderApi) throw new Error("AHAChatProviderLoader må lastes før ahaChat.js.");

  const providerLoader = wrapProviderLoader(providerLoaderApi.create({
    moduleApi: global.AHAModuleApi,
    legacyRoot: global
  }));
  const applicationComposition = providerLoader.instantiate("applicationComposition", {
    providerLoader,
    environment: Object.freeze({
      getAgentApiBase: () => global.AHA_AGENT_API,
      fetchImpl: (...args) => global.fetch(...args),
      buildUserMetaProfile: (chamber, subjectId) =>
        global.MetaInsightsEngine?.buildUserMetaProfile?.(chamber, subjectId) || {},
      getMetaInsightsAgent: () => global.AHAMetaInsightsAgent,
      getExportBundleBuilder: () =>
        global.AHAChat?.buildAhaAnalysisExportBundle ||
        global.AHATestHooks?.buildAhaAnalysisExportBundle ||
        global.buildAhaAnalysisExportBundle
    })
  });
  applicationComposition.install();
})(window);
