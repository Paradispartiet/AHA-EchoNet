// ahaInsightSaturationV2.js
// Pure/shadow saturation assessment for AHA V2 block 7.
//
// Saturation is marginal: a corpus is not considered saturated because it is
// large. It is only allowed to approach saturation when new, review-ready
// insights repeatedly resolve to verified equivalence against already
// review-ready knowledge. Resonance remains semantic novelty.

(function (global) {
  "use strict";

  const SATURATION_SCHEMA = "aha_insight_saturation_v2";
  const STATES = Object.freeze([
    "unavailable",
    "no_signal",
    "quality_blocked",
    "insufficient_signal",
    "growing",
    "approaching_saturation",
    "saturated"
  ]);
  const MIN_INCOMING_QUALITY_COVERAGE = 0.6;
  const MIN_BASELINE_QUALITY_COVERAGE = 0.5;
  const MIN_SIGNAL_COUNT = 3;
  const MIN_SATURATED_SIGNAL_COUNT = 4;
  const MIN_BASELINE_READY_COUNT = 3;
  const APPROACHING_THRESHOLD = 0.45;
  const SATURATED_THRESHOLD = 0.70;
  const MIN_SATURATED_MEAN_QUALITY = 0.70;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function round(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Number(Math.max(0, Math.min(1, number)).toFixed(6));
  }

  function average(values) {
    const numbers = safeArray(values).map(Number).filter(Number.isFinite);
    return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0;
  }

  function relationClassifier() {
    return global.AHAInsightRelationClassifierV2 || null;
  }

  function normalizeBlockingReasons(reasons) {
    const normalized = new Set();
    safeArray(reasons).forEach((reason) => {
      const value = String(reason || "").trim();
      if (!value) return;
      normalized.add(value.replace(/^(?:left|right)_/, ""));
    });
    return [...normalized].sort();
  }

  function describeReadiness(item) {
    const classifier = relationClassifier();
    if (!classifier?.classifyPair) {
      return {
        id: String(item?.id || item?.insight_id || item?.candidate_signature || "unknown"),
        ready: false,
        quality_ready: false,
        quality_score: null,
        provenance_ready: false,
        causal_status: "unknown",
        blocking_reasons: ["relation_classifier_unavailable"]
      };
    }
    const self = classifier.classifyPair(item, item);
    const side = self.left || {};
    return clone({
      id: self.left_id,
      ready: self.dedupe_eligible === true,
      quality_ready: side.quality_ready === true,
      quality_score: side.quality_score == null ? null : Number(side.quality_score),
      provenance_ready: side.provenance_ready === true,
      causal_status: side.causal_status || "unknown",
      blocking_reasons: normalizeBlockingReasons(self.dedupe_blocking_reasons)
    });
  }

  function classifyAgainst(item, comparisonItems) {
    const classifier = relationClassifier();
    const results = [];
    safeArray(comparisonItems).forEach((other) => {
      const pair = classifier.classifyPair(item, other);
      results.push(pair);
    });
    return results;
  }

  function strongestRelation(pairs) {
    const list = safeArray(pairs);
    const duplicate = list.find((pair) => pair.dedupe_eligible === true);
    if (duplicate) return { kind: "verified_equivalent", pair: duplicate };
    const unverifiedEquivalent = list
      .filter((pair) => pair.relation === "equivalent")
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
    if (unverifiedEquivalent) return { kind: "unverified_equivalent", pair: unverifiedEquivalent };
    const resonance = list
      .filter((pair) => pair.relation === "resonant")
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
    if (resonance) return { kind: "resonant", pair: resonance };
    return { kind: "distinct", pair: null };
  }

  function stateFor(metrics) {
    if (metrics.incoming_count === 0) return "no_signal";
    if (metrics.incoming_quality_coverage < MIN_INCOMING_QUALITY_COVERAGE) return "quality_blocked";
    if (metrics.existing_count > 0 && metrics.existing_quality_coverage < MIN_BASELINE_QUALITY_COVERAGE) return "quality_blocked";
    if (metrics.incoming_ready_count < MIN_SIGNAL_COUNT) return "insufficient_signal";
    if (metrics.existing_ready_count < MIN_BASELINE_READY_COUNT) return "growing";
    if (
      metrics.incoming_ready_count >= MIN_SATURATED_SIGNAL_COUNT
      && metrics.saturation_score >= SATURATED_THRESHOLD
      && metrics.mean_incoming_quality >= MIN_SATURATED_MEAN_QUALITY
      && metrics.incoming_quality_coverage >= 0.8
    ) return "saturated";
    if (metrics.saturation_score >= APPROACHING_THRESHOLD) return "approaching_saturation";
    return "growing";
  }

  function guidanceFor(state) {
    if (state === "saturated") return "prioritize_resonance_integration_over_duplicate_generation";
    if (state === "approaching_saturation") return "prioritize_distinct_or_resonant_candidates";
    if (state === "quality_blocked") return "improve_quality_provenance_or_causal_resolution_before_saturation_claims";
    if (state === "insufficient_signal") return "collect_more_review_ready_signal";
    if (state === "growing") return "continue_semantic_exploration";
    return "no_saturation_action";
  }

  function assess(input = {}, options = {}) {
    const classifier = relationClassifier();
    const existing = safeArray(input.existing_insights || input.existing || input.baseline_insights);
    const incoming = safeArray(input.incoming_insights || input.incoming || input.candidates);

    if (!classifier?.classifyPair) {
      return clone({
        schema: SATURATION_SCHEMA,
        version: 2,
        mode: "shadow",
        state: "unavailable",
        ready_for_meta: false,
        blocking_reasons: ["relation_classifier_unavailable"],
        metrics: {
          existing_count: existing.length,
          existing_ready_count: 0,
          existing_quality_coverage: 0,
          incoming_count: incoming.length,
          incoming_ready_count: 0,
          incoming_quality_coverage: 0,
          mean_incoming_quality: 0,
          verified_duplicate_existing_count: 0,
          duplicate_batch_count: 0,
          unverified_equivalence_count: 0,
          resonant_count: 0,
          distinct_count: 0,
          marginal_novelty_rate: 0,
          verified_duplicate_rate: 0,
          batch_redundancy_rate: 0,
          saturation_score: 0
        },
        candidate_roles: [],
        policy: policy()
      });
    }

    const existingReadiness = existing.map(describeReadiness);
    const incomingReadiness = incoming.map(describeReadiness);
    const existingReady = existing.filter((_, index) => existingReadiness[index].ready);
    const incomingReadyIndices = incomingReadiness
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.ready)
      .map(({ index }) => index);

    const candidateRoles = [];
    const priorReadyIncoming = [];
    incoming.forEach((item, index) => {
      const readiness = incomingReadiness[index];
      if (!readiness.ready) {
        candidateRoles.push({
          id: readiness.id,
          role: "quality_blocked",
          ready: false,
          quality_score: readiness.quality_score,
          relation_pair_id: null,
          relation_confidence: 0,
          blocking_reasons: readiness.blocking_reasons
        });
        return;
      }

      const againstExisting = classifyAgainst(item, existingReady);
      const baselineRelation = strongestRelation(againstExisting);
      if (baselineRelation.kind === "verified_equivalent") {
        candidateRoles.push({
          id: readiness.id,
          role: "verified_equivalent_existing",
          ready: true,
          quality_score: readiness.quality_score,
          relation_pair_id: baselineRelation.pair.pair_id,
          relation_confidence: baselineRelation.pair.confidence,
          blocking_reasons: []
        });
        priorReadyIncoming.push(item);
        return;
      }

      const againstBatch = classifyAgainst(item, priorReadyIncoming);
      const batchRelation = strongestRelation(againstBatch);
      if (batchRelation.kind === "verified_equivalent") {
        candidateRoles.push({
          id: readiness.id,
          role: "verified_equivalent_batch",
          ready: true,
          quality_score: readiness.quality_score,
          relation_pair_id: batchRelation.pair.pair_id,
          relation_confidence: batchRelation.pair.confidence,
          blocking_reasons: []
        });
        priorReadyIncoming.push(item);
        return;
      }

      const allRelations = [...againstExisting, ...againstBatch];
      const semanticRelation = strongestRelation(allRelations);
      if (semanticRelation.kind === "unverified_equivalent") {
        candidateRoles.push({
          id: readiness.id,
          role: "unverified_equivalent",
          ready: true,
          quality_score: readiness.quality_score,
          relation_pair_id: semanticRelation.pair.pair_id,
          relation_confidence: semanticRelation.pair.confidence,
          blocking_reasons: normalizeBlockingReasons(semanticRelation.pair.dedupe_blocking_reasons)
        });
      } else if (semanticRelation.kind === "resonant") {
        candidateRoles.push({
          id: readiness.id,
          role: "resonant_novel",
          ready: true,
          quality_score: readiness.quality_score,
          relation_pair_id: semanticRelation.pair.pair_id,
          relation_confidence: semanticRelation.pair.confidence,
          blocking_reasons: []
        });
      } else {
        candidateRoles.push({
          id: readiness.id,
          role: "distinct_novel",
          ready: true,
          quality_score: readiness.quality_score,
          relation_pair_id: null,
          relation_confidence: 0,
          blocking_reasons: []
        });
      }
      priorReadyIncoming.push(item);
    });

    const incomingReadyCount = incomingReadyIndices.length;
    const existingReadyCount = existingReady.length;
    const roleCount = (role) => candidateRoles.filter((entry) => entry.role === role).length;
    const verifiedDuplicateExistingCount = roleCount("verified_equivalent_existing");
    const duplicateBatchCount = roleCount("verified_equivalent_batch");
    const unverifiedEquivalenceCount = roleCount("unverified_equivalent");
    const resonantCount = roleCount("resonant_novel");
    const distinctCount = roleCount("distinct_novel");
    const noveltyCount = resonantCount + distinctCount;
    const readyDenominator = Math.max(1, incomingReadyCount);
    const verifiedDuplicateRate = verifiedDuplicateExistingCount / readyDenominator;
    const batchRedundancyRate = duplicateBatchCount / readyDenominator;
    // Knowledge saturation is driven primarily by verified repetition against
    // the existing corpus. Within-batch repetition is a weaker signal.
    const saturationScore = existingReadyCount >= MIN_BASELINE_READY_COUNT
      ? Math.min(1, verifiedDuplicateRate + (0.25 * batchRedundancyRate))
      : 0;

    const metrics = {
      existing_count: existing.length,
      existing_ready_count: existingReadyCount,
      existing_quality_coverage: round(existingReadyCount / Math.max(1, existing.length)),
      incoming_count: incoming.length,
      incoming_ready_count: incomingReadyCount,
      incoming_quality_coverage: round(incomingReadyCount / Math.max(1, incoming.length)),
      mean_incoming_quality: round(average(incomingReadiness.filter((entry) => entry.ready).map((entry) => entry.quality_score))),
      verified_duplicate_existing_count: verifiedDuplicateExistingCount,
      duplicate_batch_count: duplicateBatchCount,
      unverified_equivalence_count: unverifiedEquivalenceCount,
      resonant_count: resonantCount,
      distinct_count: distinctCount,
      marginal_novelty_rate: round(noveltyCount / readyDenominator),
      verified_duplicate_rate: round(verifiedDuplicateRate),
      batch_redundancy_rate: round(batchRedundancyRate),
      unresolved_equivalence_rate: round(unverifiedEquivalenceCount / readyDenominator),
      saturation_score: round(saturationScore)
    };
    const state = stateFor(metrics);
    const trustedTotal = existingReadyCount + incomingReadyCount;
    const readyForMeta = trustedTotal >= 3 && !["unavailable", "quality_blocked"].includes(state);
    const blockingReasons = [];
    if (state === "quality_blocked" && metrics.incoming_quality_coverage < MIN_INCOMING_QUALITY_COVERAGE) blockingReasons.push("incoming_quality_coverage_below_threshold");
    if (state === "quality_blocked" && metrics.existing_count > 0 && metrics.existing_quality_coverage < MIN_BASELINE_QUALITY_COVERAGE) blockingReasons.push("baseline_quality_coverage_below_threshold");
    if (state === "insufficient_signal") blockingReasons.push("insufficient_review_ready_incoming_signal");

    return clone({
      schema: SATURATION_SCHEMA,
      version: 2,
      mode: "shadow",
      state,
      ready_for_meta: readyForMeta,
      guidance: guidanceFor(state),
      blocking_reasons: blockingReasons,
      thresholds: {
        min_incoming_quality_coverage: MIN_INCOMING_QUALITY_COVERAGE,
        min_baseline_quality_coverage: MIN_BASELINE_QUALITY_COVERAGE,
        min_signal_count: MIN_SIGNAL_COUNT,
        min_saturated_signal_count: MIN_SATURATED_SIGNAL_COUNT,
        min_baseline_ready_count: MIN_BASELINE_READY_COUNT,
        approaching_saturation: APPROACHING_THRESHOLD,
        saturated: SATURATED_THRESHOLD,
        min_saturated_mean_quality: MIN_SATURATED_MEAN_QUALITY
      },
      metrics,
      candidate_roles: candidateRoles,
      policy: policy()
    });
  }

  function policy() {
    return {
      production_gate_authority: false,
      stop_generation_authority: false,
      dedupe_write: false,
      canonical_write: false,
      chamber_write: false,
      meta_write: false,
      projection_write: false,
      persistent_write: false
    };
  }

  const api = Object.freeze({
    SATURATION_SCHEMA,
    STATES,
    assess,
    describeReadiness
  });
  global.AHAInsightSaturationV2 = api;
  global.AHAModuleApi?.register?.("insightSaturationV2", api, {
    version: 2,
    legacyGlobal: "AHAInsightSaturationV2",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
