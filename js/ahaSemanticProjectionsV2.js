// ahaSemanticProjectionsV2.js
// AHA V2 block 8: one immutable semantic core, five read-only projections.
//
// The module never writes to Chamber, localStorage, repositories, Meta, lists,
// paths, mindmaps, canonical storage or remote backends. It only produces
// projection candidates that existing product surfaces may consume after later
// rollout gates.

(function (global) {
  "use strict";

  const PROJECTION_SCHEMA = "aha_semantic_projections_v2";
  const PROJECTION_VERSION = 2;
  const SURFACES = Object.freeze(["insights", "concepts", "lists", "paths", "mindmap"]);
  const PRIMARY_CONCEPT_FUNCTION_TOKENS = new Set([
    "alene", "andre", "bare", "begge", "derfor", "disse", "dette", "flere", "hvilke", "hvilken", "hvilket",
    "ingen", "likevel", "noen", "samme", "samtidig", "slik", "slike"
  ]);

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function arr(value) {
    return Array.isArray(value) ? value : [];
  }

  function text(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function normalize(value) {
    return text(value)
      .toLocaleLowerCase("no")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function hash(value) {
    let state = 2166136261;
    const input = String(value || "");
    for (let index = 0; index < input.length; index += 1) {
      state ^= input.charCodeAt(index);
      state = Math.imul(state, 16777619);
    }
    return (state >>> 0).toString(16).padStart(8, "0");
  }

  function round(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Number(Math.max(0, Math.min(1, number)).toFixed(6));
  }

  function average(values) {
    const numbers = arr(values).map(Number).filter(Number.isFinite);
    return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0;
  }

  function unique(values) {
    return [...new Set(arr(values).filter((value) => value != null))];
  }

  function relationApi() {
    return global.AHAInsightRelationClassifierV2 || null;
  }

  function saturationApi() {
    return global.AHAInsightSaturationV2 || null;
  }

  function unwrapCandidate(item) {
    return item?.candidate && typeof item.candidate === "object" ? item.candidate : (item || {});
  }

  function insightText(item) {
    const candidate = unwrapCandidate(item);
    return text(
      candidate.insight
      || item?.insight
      || item?.summary
      || item?.claim
      || item?.content
      || item?.text
      || item?.title
      || item?.activation_v2?.insight
    );
  }

  function insightTitle(value) {
    const words = text(value).split(/\s+/).filter(Boolean);
    const title = words.slice(0, 11).join(" ");
    return words.length > 11 ? `${title} …` : title;
  }

  function conciseUnitTitle(value, concepts, type) {
    const labels = arr(concepts).map((concept) => text(concept?.label)).filter(Boolean)
      .sort((left, right) => right.split(/\s+/).length - left.split(/\s+/).length || right.length - left.length)
      .filter((label, index, list) => list.findIndex((item) => normalize(item) === normalize(label)) === index)
      .slice(0, 2);
    const selectedLabels = labels.length >= 2 && labels.reduce((sum, label) => sum + label.split(/\s+/).length, 0) > 6
      ? labels.slice(0, 1)
      : labels;
    const typeLabel = ({
      tension: "Spenning", contrast: "Kontrast", mechanism: "Mekanisme", consequence: "Konsekvens",
      principle: "Prinsipp", pattern: "Mønster", generalization: "Hovedidé", observation: "Observasjon"
    })[normalize(type)] || "Innsikt";
    return selectedLabels.length ? `${typeLabel}: ${selectedLabels.join(" og ")}` : insightTitle(value);
  }

  function conceptInputLabel(entry) {
    if (typeof entry === "string") return text(entry);
    if (!entry || typeof entry !== "object") return "";
    return text(entry.label || entry.name || entry.term || entry.concept || entry.key || entry.text || entry.id);
  }

  function extractConcepts(item) {
    const candidate = unwrapCandidate(item);
    const sources = [
      item?.semantic_concepts,
      item?.concepts,
      item?.semantic_context?.concepts,
      item?.semantic?.concepts,
      item?.activation_v2?.concepts,
      candidate?.semantic_concepts,
      candidate?.concepts
    ];
    const byKey = new Map();
    sources.forEach((source) => arr(source).forEach((entry) => {
      const label = conceptInputLabel(entry);
      const key = normalize(label);
      if (!key) return;
      const existing = byKey.get(key);
      if (!existing || label.length > existing.label.length) byKey.set(key, { key, label });
    }));
    return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  function conceptTokens(value) {
    return normalize(value).split(/\s+/).filter(Boolean);
  }

  function sameConceptSupport(left, right) {
    const leftIds = arr(left?.insight_ids).map(text).filter(Boolean).sort();
    const rightIds = arr(right?.insight_ids).map(text).filter(Boolean).sort();
    return leftIds.length > 0 && leftIds.length === rightIds.length && leftIds.join("|") === rightIds.join("|");
  }

  function sameConceptSourceSupport(left, right) {
    if (!sameConceptSupport(left, right)) return false;
    const leftSourceIds = arr(left?.source_member_ids).map(text).filter(Boolean).sort();
    const rightSourceIds = arr(right?.source_member_ids).map(text).filter(Boolean).sort();
    return leftSourceIds.length > 0
      && leftSourceIds.length === rightSourceIds.length
      && leftSourceIds.join("|") === rightSourceIds.join("|");
  }

  function definiteInflectionBaseKey(value) {
    const tokens = conceptTokens(value);
    if (tokens.length !== 1) return "";
    const token = tokens[0];
    for (const suffix of ["ene", "en", "et"]) {
      if (!token.endsWith(suffix)) continue;
      const base = token.slice(0, -suffix.length);
      if (base.length >= 6) return base;
    }
    return "";
  }

  function conceptPhraseContains(container, contained) {
    const outer = conceptTokens(container?.label || container?.key);
    const inner = conceptTokens(contained?.label || contained?.key);
    if (!inner.length || inner.length >= outer.length) return false;
    for (let index = 0; index <= outer.length - inner.length; index += 1) {
      if (inner.every((token, offset) => token === outer[index + offset])) return true;
    }
    return false;
  }

  function conceptSupportOverlaps(left, right) {
    const leftIds = new Set(arr(left?.insight_ids).map(text).filter(Boolean));
    return arr(right?.insight_ids).map(text).filter(Boolean).some((id) => leftIds.has(id));
  }

  function branchConceptSubsumedBy(general, specific) {
    return general?.id !== specific?.id
      && conceptSupportOverlaps(general, specific)
      && conceptPhraseContains(specific, general);
  }

  function mindmapBranchCandidatePool(candidates) {
    const ordered = arr(candidates);
    const preferred = ordered.filter((concept) => !ordered.some((candidate) => (
      branchConceptSubsumedBy(concept, candidate)
    )));
    const minimumBranches = Math.min(2, ordered.length);
    if (preferred.length >= minimumBranches) return preferred;

    const restored = [...preferred];
    ordered.forEach((concept) => {
      if (restored.length >= minimumBranches) return;
      if (!restored.some((entry) => entry.id === concept.id)) restored.push(concept);
    });
    return restored;
  }

  function primaryConceptCandidateReason(concept, concepts) {
    const tokens = conceptTokens(concept?.label || concept?.key);
    if (tokens.length === 1 && PRIMARY_CONCEPT_FUNCTION_TOKENS.has(tokens[0])) return "standalone_function_token";
    const inflectionBaseKey = definiteInflectionBaseKey(concept?.label || concept?.key);
    const inflectionBase = inflectionBaseKey ? arr(concepts).find((candidate) => (
      candidate?.id !== concept?.id
      && candidate?.key === inflectionBaseKey
      && sameConceptSourceSupport(candidate, concept)
    )) : null;
    if (inflectionBase) return `inflection_variant_of:${inflectionBase.key}`;
    const moreSpecific = arr(concepts).find((candidate) => (
      candidate?.id !== concept?.id
      && sameConceptSupport(candidate, concept)
      && conceptPhraseContains(candidate, concept)
    ));
    if (moreSpecific) return `subsumed_by:${moreSpecific.key}`;
    return "eligible";
  }

  function primaryConceptCandidates(concepts) {
    return arr(concepts).filter((concept) => concept?.meta?.primary_candidate_eligible !== false);
  }

  function extractEvidence(item) {
    const candidate = unwrapCandidate(item);
    return [...arr(candidate?.evidence), ...arr(item?.evidence), ...arr(item?.activation_v2?.evidence)]
      .map((entry) => clone(entry))
      .filter(Boolean);
  }

  function extractSourceRefs(item) {
    const refs = [];
    const candidate = unwrapCandidate(item);
    const activation = item?.activation_v2 || {};
    [item, candidate, item?.provenance, activation].forEach((source) => {
      if (!source || typeof source !== "object") return;
      ["source_event_id", "source_id", "sourceId", "source_text_hash", "url", "uri"].forEach((field) => {
        const value = text(source[field]);
        if (value) refs.push({ field, value });
      });
      arr(source.source_ids).forEach((value) => {
        const cleaned = text(value);
        if (cleaned) refs.push({ field: "source_id", value: cleaned });
      });
      arr(source.source_refs).forEach((entry) => {
        const field = text(entry?.field);
        const value = text(entry?.value);
        if (field && value) refs.push({ field, value });
      });
    });
    const seen = new Set();
    return refs.filter((entry) => {
      const key = `${entry.field}:${entry.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => `${a.field}:${a.value}`.localeCompare(`${b.field}:${b.value}`));
  }

  function extractType(item) {
    const candidate = unwrapCandidate(item);
    return text(candidate?.type || item?.type || item?.functional_type || item?.activation_v2?.type || "insight");
  }

  function extractCausalStatus(item) {
    const candidate = unwrapCandidate(item);
    return text(
      candidate?.causal_status
      ?? candidate?.causalStatus
      ?? item?.causal_status
      ?? item?.causalStatus
      ?? item?.activation_v2?.causal_status
      ?? item?.causality?.status
      ?? "unknown"
    );
  }

  function extractSemanticProfile(item) {
    const candidate = unwrapCandidate(item);
    return {
      abstraction: text(candidate?.abstraction || item?.abstraction || item?.activation_v2?.abstraction),
      why_it_matters: text(candidate?.why_it_matters || candidate?.whyItMatters || item?.why_it_matters || item?.whyItMatters || item?.activation_v2?.why_it_matters),
      confidence: text(candidate?.confidence || item?.confidence || item?.activation_v2?.confidence),
      uncertainty: text(candidate?.uncertainty || item?.uncertainty || item?.activation_v2?.uncertainty)
    };
  }

  function emptyResult(reasons, inputCount = 0) {
    const result = {
      schema: PROJECTION_SCHEMA,
      version: PROJECTION_VERSION,
      mode: "shadow",
      status: "blocked",
      projection_id: null,
      input_count: inputCount,
      trusted_input_count: 0,
      excluded_input_count: inputCount,
      blocking_reasons: unique(reasons).sort(),
      exclusions: [],
      core: {
        insight_units: [],
        concept_nodes: [],
        equivalence_groups: [],
        resonance_edges: []
      },
      projections: {
        insights: [],
        concepts: [],
        lists: [],
        paths: [],
        mindmap: { nodes: [], edges: [], read_only: true }
      },
      context: {
        saturation_v2: null,
        meta_quality_v2: null
      },
      validation: { valid: false, errors: ["projection_blocked"] },
      policy: policy()
    };
    return clone(result);
  }

  function policy() {
    return {
      production_gate_authority: false,
      automatic_projection_authority: false,
      chamber_write: false,
      canonical_write: false,
      insights_write: false,
      concepts_write: false,
      lists_write: false,
      paths_write: false,
      mindmap_write: false,
      meta_write: false,
      persistent_write: false,
      remote_write: false
    };
  }

  function buildTrustedEntries(items) {
    const saturation = saturationApi();
    return arr(items).map((item, index) => {
      const readiness = saturation.describeReadiness(item);
      return {
        index,
        item,
        id: readiness.id,
        ready: readiness.ready === true,
        quality_score: readiness.quality_score == null ? null : Number(readiness.quality_score),
        readiness
      };
    });
  }

  function buildUnits(trustedEntries, relationSet) {
    const entryById = new Map(trustedEntries.map((entry) => [entry.id, entry]));
    const groupByMember = new Map();
    arr(relationSet?.equivalence_groups).forEach((group) => {
      arr(group.member_ids).forEach((memberId) => groupByMember.set(memberId, group));
    });

    const handled = new Set();
    const units = [];
    const memberToUnit = new Map();
    const equivalenceGroups = [];

    trustedEntries
      .slice()
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .forEach((entry) => {
        if (handled.has(entry.id)) return;
        const group = groupByMember.get(entry.id);
        const memberIds = group
          ? arr(group.member_ids).filter((id) => entryById.has(id)).sort()
          : [entry.id];
        memberIds.forEach((id) => handled.add(id));

        const memberEntries = memberIds.map((id) => entryById.get(id)).filter(Boolean);
        const representative = memberEntries.slice().sort((a, b) => {
          const qualityDiff = (Number(b.quality_score) || 0) - (Number(a.quality_score) || 0);
          return qualityDiff || String(a.id).localeCompare(String(b.id));
        })[0];
        const projectionUnitId = `insight_v2_${hash(memberIds.join("||"))}`;
        memberIds.forEach((id) => memberToUnit.set(id, projectionUnitId));

        const conceptMap = new Map();
        memberEntries.forEach(({ item }) => extractConcepts(item).forEach((concept) => {
          const existing = conceptMap.get(concept.key);
          if (!existing || concept.label.length > existing.label.length) conceptMap.set(concept.key, concept);
        }));
        const concepts = [...conceptMap.values()].sort((a, b) => a.key.localeCompare(b.key));
        const qualities = memberEntries.map((member) => member.quality_score).filter(Number.isFinite);
        const allEvidence = memberEntries.flatMap((member) => extractEvidence(member.item));
        const evidenceSeen = new Set();
        const evidence = allEvidence.filter((evidenceItem) => {
          const key = JSON.stringify(evidenceItem);
          if (evidenceSeen.has(key)) return false;
          evidenceSeen.add(key);
          return true;
        });
        const sourceRefs = memberEntries.flatMap((member) => extractSourceRefs(member.item));
        const sourceSeen = new Set();
        const sources = sourceRefs.filter((source) => {
          const key = `${source.field}:${source.value}`;
          if (sourceSeen.has(key)) return false;
          sourceSeen.add(key);
          return true;
        }).sort((a, b) => `${a.field}:${a.value}`.localeCompare(`${b.field}:${b.value}`));
        const repText = insightText(representative.item);
        const semanticProfile = extractSemanticProfile(representative.item);
        const types = unique(memberEntries.map((member) => extractType(member.item))).sort();
        const causalStatuses = unique(memberEntries.map((member) => extractCausalStatus(member.item))).sort();

        const unit = {
          id: projectionUnitId,
          canonical_member_id: representative.id,
          member_ids: memberIds,
          equivalence_collapsed: memberIds.length > 1,
          title: conciseUnitTitle(repText, concepts, extractType(representative.item)),
          insight: repText,
          summary: repText,
          type: extractType(representative.item),
          all_types: types,
          causal_status: extractCausalStatus(representative.item),
          all_causal_statuses: causalStatuses,
          semantic_profile: semanticProfile,
          quality: {
            representative_score: round(representative.quality_score),
            min_score: round(Math.min(...qualities)),
            mean_score: round(average(qualities)),
            max_score: round(Math.max(...qualities))
          },
          concepts,
          provenance: {
            evidence,
            source_refs: sources,
            source_member_ids: memberIds
          },
          meta: {
            source: "aha_semantic_v2",
            read_only: true,
            projection_candidate: true
          }
        };
        units.push(unit);

        if (memberIds.length > 1) {
          equivalenceGroups.push({
            id: group?.group_id || `equivalence_v2_${hash(memberIds.join("||"))}`,
            member_ids: memberIds,
            projection_insight_id: projectionUnitId,
            dedupe_eligible: true
          });
        }
      });

    units.sort((a, b) => a.id.localeCompare(b.id));
    equivalenceGroups.sort((a, b) => a.id.localeCompare(b.id));
    return { units, memberToUnit, equivalenceGroups };
  }

  function buildResonanceEdges(relationSet, memberToUnit) {
    const byKey = new Map();
    arr(relationSet?.resonance_edges).forEach((edge) => {
      const left = memberToUnit.get(edge.left_id);
      const right = memberToUnit.get(edge.right_id);
      if (!left || !right || left === right) return;
      const pair = [left, right].sort();
      const key = pair.join("||");
      const candidate = {
        id: `resonance_v2_${hash(key)}`,
        from: pair[0],
        to: pair[1],
        relation: "resonance",
        confidence: round(edge.confidence),
        dedupe_eligible: false,
        source_pair_ids: [edge.pair_id].filter(Boolean)
      };
      const existing = byKey.get(key);
      if (!existing) byKey.set(key, candidate);
      else {
        existing.confidence = Math.max(existing.confidence, candidate.confidence);
        existing.source_pair_ids = unique([...existing.source_pair_ids, ...candidate.source_pair_ids]).sort();
      }
    });
    return [...byKey.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  function buildConceptNodes(units) {
    const map = new Map();
    arr(units).forEach((unit) => arr(unit.concepts).forEach((concept) => {
      if (!map.has(concept.key)) {
        map.set(concept.key, {
          id: `concept_v2_${hash(concept.key)}`,
          key: concept.key,
          label: concept.label,
          insight_ids: [],
          source_member_ids: [],
          occurrence_count: 0,
          meta: { source: "aha_semantic_v2", read_only: true, projection_candidate: true }
        });
      }
      const node = map.get(concept.key);
      if (concept.label.length > node.label.length) node.label = concept.label;
      node.insight_ids.push(unit.id);
      node.source_member_ids.push(...unit.member_ids);
      node.occurrence_count += 1;
    }));
    const nodes = [...map.values()].map((node) => ({
      ...node,
      insight_ids: unique(node.insight_ids).sort(),
      source_member_ids: unique(node.source_member_ids).sort()
    })).sort((a, b) => a.key.localeCompare(b.key));
    return nodes.map((node) => {
      const reason = primaryConceptCandidateReason(node, nodes);
      return {
        ...node,
        meta: {
          ...node.meta,
          primary_candidate_eligible: reason === "eligible",
          primary_candidate_reason: reason
        }
      };
    });
  }

  function insightProjection(units, conceptNodes) {
    const conceptIdByKey = new Map(conceptNodes.map((concept) => [concept.key, concept.id]));
    return units.map((unit) => ({
      id: unit.id,
      title: unit.title,
      summary: unit.summary,
      insight: unit.insight,
      type: unit.type,
      causal_status: unit.causal_status,
      abstraction: unit.semantic_profile?.abstraction || "",
      why_it_matters: unit.semantic_profile?.why_it_matters || "",
      confidence: unit.semantic_profile?.confidence || "",
      uncertainty: unit.semantic_profile?.uncertainty || "",
      quality: clone(unit.quality),
      provenance: clone(unit.provenance),
      member_ids: [...unit.member_ids],
      equivalence_collapsed: unit.equivalence_collapsed,
      concept_keys: unit.concepts.map((concept) => concept.key),
      concept_ids: unit.concepts.map((concept) => conceptIdByKey.get(concept.key)).filter(Boolean),
      source: "aha_semantic_v2",
      local_only: true,
      meta: { read_only: true, projection_candidate: true }
    }));
  }

  function unitSourceTextHashes(unit) {
    return unique(arr(unit?.provenance?.source_refs)
      .filter((entry) => text(entry?.field) === "source_text_hash")
      .map((entry) => text(entry?.value))
      .filter((value) => /^[a-f0-9]{64}$/iu.test(value)))
      .sort();
  }

  function exactSupportingEvidenceQuotes(unit) {
    return unique(arr(unit?.provenance?.evidence)
      .filter((entry) => entry?.exact_source_match === true && text(entry?.role) === "supports")
      .map((entry) => text(entry?.quote || entry?.text))
      .filter((quote) => quote.length >= 40))
      .sort();
  }

  function strongestSharedEvidenceGroup(units) {
    const groups = new Map();
    arr(units).forEach((unit) => {
      unitSourceTextHashes(unit).forEach((sourceHash) => {
        exactSupportingEvidenceQuotes(unit).forEach((quote) => {
          const key = `${sourceHash}\u0000${quote}`;
          if (!groups.has(key)) groups.set(key, { source_hash: sourceHash, quote, unit_ids: [] });
          groups.get(key).unit_ids.push(unit.id);
        });
      });
    });
    return [...groups.values()]
      .map((group) => ({ ...group, unit_ids: unique(group.unit_ids).sort() }))
      .filter((group) => group.unit_ids.length >= 2)
      .sort((left, right) => (
        right.unit_ids.length - left.unit_ids.length
        || right.quote.length - left.quote.length
        || left.source_hash.localeCompare(right.source_hash)
        || left.quote.localeCompare(right.quote)
      ))[0] || null;
  }

  function listItem(unit, membership = {}) {
    const sharedEvidenceMeta = text(membership.basis) === "shared_evidence"
      ? {
        shared_source_text_hash: text(membership.shared_source_text_hash),
        shared_evidence_quote: text(membership.shared_evidence_quote)
      }
      : {};
    return {
      id: `list_item_v2_${hash(unit.id)}`,
      title: unit.title,
      type: "insight",
      source: "aha_semantic_v2",
      refId: unit.id,
      membership_reason: text(membership.reason),
      meta: {
        read_only: true,
        projection_candidate: true,
        quality_score: unit.quality.mean_score,
        concept_keys: unit.concepts.map((concept) => concept.key),
        semantic_basis: text(membership.basis),
        semantic_basis_label: text(membership.label),
        membership_reason: text(membership.reason),
        ...sharedEvidenceMeta
      }
    };
  }

  function buildListCandidates(units, concepts, resonanceEdges, projectionId) {
    if (!units.length) return [];
    const byInsight = new Map(units.map((unit) => [unit.id, unit]));
    const candidates = [];

    concepts.filter((concept) => concept.insight_ids.length >= 2).forEach((concept) => {
      const related = concept.insight_ids.map((id) => byInsight.get(id)).filter(Boolean)
        .sort((a, b) => (b.quality.mean_score - a.quality.mean_score) || a.id.localeCompare(b.id));
      candidates.push({
        id: `list_v2_${hash(`${projectionId}:concept:${concept.key}`)}`,
        title: `Utforsk ${concept.label}`,
        type: "concepts",
        description: `Kvalitetsgodkjente innsikter som belyser «${concept.label}» fra flere sider.`,
        tags: [concept.label, "AHA V2"],
        items: related.map((unit) => listItem(unit, {
          basis: "shared_concept",
          label: concept.label,
          reason: `Innsikten belyser «${concept.label}» direkte og er derfor et begrunnet medlem av dette temaet.`
        })),
        source: "aha_semantic_v2",
        local_only: true,
        meta: {
          createdBy: PROJECTION_SCHEMA,
          projection_id: projectionId,
          concept_id: concept.id,
          semantic_basis: "shared_concept",
          semantic_basis_label: concept.label,
          semantic_shape: "thematic_membership_v2",
          membership_rule: "every_member_explicitly_shares_the_named_concept",
          member_ref_ids: related.map((unit) => unit.id),
          read_only: true,
          candidate_only: true
        }
      });
    });

    arr(resonanceEdges).forEach((edge) => {
      const related = [byInsight.get(edge.from), byInsight.get(edge.to)].filter(Boolean);
      if (related.length !== 2) return;
      const labels = related.map((unit) => unit.title);
      candidates.push({
        id: `list_v2_${hash(`${projectionId}:resonance:${edge.id}`)}`,
        title: `Sammenheng: ${labels[0]} ↔ ${labels[1]}`,
        type: "concepts",
        description: "To selvstendige innsikter som resonerer semantisk uten å være duplikater.",
        tags: ["Resonans", "AHA V2"],
        items: related.map((unit) => listItem(unit, {
          basis: "resonance",
          label: "resonans",
          reason: "Innsikten er én side av en kildebundet resonans; den beholdes som selvstendig perspektiv og skal ikke dedupliseres."
        })),
        source: "aha_semantic_v2",
        local_only: true,
        meta: {
          createdBy: PROJECTION_SCHEMA,
          projection_id: projectionId,
          resonance_edge_id: edge.id,
          semantic_basis: "resonance",
          semantic_basis_label: "resonans",
          semantic_shape: "thematic_membership_v2",
          membership_rule: "exactly_two_distinct_insights_joined_by_typed_resonance",
          member_ref_ids: related.map((unit) => unit.id),
          dedupe_eligible: false,
          read_only: true,
          candidate_only: true
        }
      });
    });

    if (!candidates.length && units.length >= 2) {
      const sharedEvidence = strongestSharedEvidenceGroup(units);
      if (sharedEvidence) {
        const related = sharedEvidence.unit_ids.map((id) => byInsight.get(id)).filter(Boolean)
          .sort((a, b) => (b.quality.mean_score - a.quality.mean_score) || a.id.localeCompare(b.id));
        const evidenceLabel = sharedEvidence.quote.length > 96
          ? `${sharedEvidence.quote.slice(0, 93).replace(/\s+\S*$/u, "").trim()} …`
          : sharedEvidence.quote;
        candidates.push({
          id: `list_v2_${hash(`${projectionId}:shared_evidence:${sharedEvidence.source_hash}:${sharedEvidence.quote}`)}`,
          title: `Kildebelegg: ${evidenceLabel}`,
          type: "concepts",
          description: "Kvalitetsgodkjente innsikter som er eksplisitt bundet sammen av det samme eksakte kildeutdraget.",
          tags: ["Kildebelegg", "AHA V2"],
          items: related.map((unit) => listItem(unit, {
            basis: "shared_evidence",
            label: sharedEvidence.quote,
            shared_source_text_hash: sharedEvidence.source_hash,
            shared_evidence_quote: sharedEvidence.quote,
            reason: "Innsikten er et begrunnet medlem fordi den eksplisitt deler det samme eksakte kildeutdraget og samme kildehash med de øvrige innsiktene."
          })),
          source: "aha_semantic_v2",
          local_only: true,
          meta: {
            createdBy: PROJECTION_SCHEMA,
            projection_id: projectionId,
            semantic_basis: "shared_evidence",
            semantic_basis_label: sharedEvidence.quote,
            semantic_shape: "thematic_membership_v2",
            membership_rule: "every_member_explicitly_shares_the_same_exact_source_evidence",
            member_ref_ids: related.map((unit) => unit.id),
            shared_source_text_hash: sharedEvidence.source_hash,
            shared_evidence_quote: sharedEvidence.quote,
            read_only: true,
            candidate_only: true
          }
        });
      }
    }

    if (!candidates.length && units.length >= 2) {
      const focus = concepts.slice().sort((a, b) => b.occurrence_count - a.occurrence_count || a.key.localeCompare(b.key))[0];
      candidates.push({
        id: `list_v2_${hash(`${projectionId}:fallback`)}`,
        title: focus ? `Mulig sammenheng rundt ${focus.label}` : "Mulig semantisk sammenheng",
        type: "concepts",
        description: "Foreløpig kandidat som krever sterkere tematisk belegg før den kan bli et produktforslag.",
        tags: ["Krever vurdering", "AHA V2"],
        items: units.slice().sort((a, b) => (b.quality.mean_score - a.quality.mean_score) || a.id.localeCompare(b.id)).map((unit) => listItem(unit, {
          basis: "fallback_core",
          label: focus?.label || "",
          reason: "Innsikten tilhører den kildebundne kjernen, men den tematiske medlemsgrunnen er foreløpig ikke sterk nok."
        })),
        source: "aha_semantic_v2",
        local_only: true,
        meta: {
          createdBy: PROJECTION_SCHEMA,
          projection_id: projectionId,
          semantic_basis: "fallback_core",
          semantic_basis_label: focus?.label || "",
          semantic_shape: "thematic_membership_v2",
          membership_rule: "unqualified_core_candidate_requires_stronger_shared_basis",
          member_ref_ids: units.map((unit) => unit.id).sort(),
          read_only: true,
          candidate_only: true
        }
      });
    }

    const ranked = candidates.slice().sort((left, right) => {
      const leftFallback = left.meta?.semantic_basis === "fallback_core" ? 1 : 0;
      const rightFallback = right.meta?.semantic_basis === "fallback_core" ? 1 : 0;
      if (leftFallback !== rightFallback) return leftFallback - rightFallback;
      const memberDifference = arr(right.meta?.member_ref_ids).length - arr(left.meta?.member_ref_ids).length;
      if (memberDifference) return memberDifference;
      const leftResonance = left.meta?.semantic_basis === "resonance" ? 1 : 0;
      const rightResonance = right.meta?.semantic_basis === "resonance" ? 1 : 0;
      if (leftResonance !== rightResonance) return leftResonance - rightResonance;
      return left.id.localeCompare(right.id);
    });
    const seenMemberSets = new Set();
    return ranked.filter((candidate) => {
      const memberSet = arr(candidate.meta?.member_ref_ids).slice().sort().join("|");
      if (!memberSet || seenMemberSets.has(memberSet)) return false;
      seenMemberSets.add(memberSet);
      return true;
    }).slice(0, 3);
  }

  function semanticProfileText(unit) {
    return [
      unit?.insight,
      unit?.type,
      unit?.causal_status,
      unit?.semantic_profile?.abstraction,
      unit?.semantic_profile?.why_it_matters,
      unit?.semantic_profile?.confidence,
      unit?.semantic_profile?.uncertainty
    ].map(text).join(" ");
  }

  function stageScore(unit, stage) {
    const profile = normalize(semanticProfileText(unit));
    const type = normalize(unit?.type);
    const evidenceCount = arr(unit?.provenance?.evidence).length;
    let score = Number(unit?.quality?.mean_score) || 0;
    if (stage === "orientation") {
      if (["observation", "generalization", "principle"].includes(type)) score += 0.35;
      score += Math.min(0.2, unit?.concepts?.length * 0.05);
    } else if (stage === "claim_evidence") {
      score += Math.min(0.45, evidenceCount * 0.12);
      if (unit?.causal_status === "source_explicit") score += 0.1;
    } else if (stage === "tension_counterexample") {
      if (["tension", "contrast", "problem"].includes(type)) score += 0.7;
      if (/\b(men|samtidig|likevel|spenning|motsetning|begrensning|alternativ)\b/u.test(profile)) score += 0.4;
      if (unit?.causal_status === "interpretive") score += 0.15;
    } else if (stage === "uncertainty") {
      if (text(unit?.semantic_profile?.uncertainty)) score += 0.55;
      if (["low", "medium"].includes(text(unit?.semantic_profile?.confidence))) score += 0.2;
      if (unit?.causal_status === "interpretive") score += 0.25;
      if (/\b(usikker|uklar|mangler|kan ikke|begrensning|alternativ)\b/u.test(profile)) score += 0.35;
    } else {
      if (text(unit?.semantic_profile?.why_it_matters)) score += 0.45;
      if (text(unit?.semantic_profile?.abstraction)) score += 0.25;
      if (["principle", "consequence", "solution", "generalization"].includes(type)) score += 0.2;
    }
    return score;
  }

  function selectStageUnits(related) {
    const stages = ["orientation", "claim_evidence", "tension_counterexample", "uncertainty", "synthesis_next_inquiry"];
    const selected = stages.map((stage) => {
      const ranked = related.slice().sort((left, right) => stageScore(right, stage) - stageScore(left, stage) || left.id.localeCompare(right.id));
      return { stage, unit: ranked[0] };
    });
    if (unique(selected.map((entry) => entry.unit?.id).filter(Boolean)).length < 2 && related.length >= 2) {
      const contrast = related.slice().sort((left, right) => stageScore(right, "tension_counterexample") - stageScore(left, "tension_counterexample") || left.id.localeCompare(right.id))[1];
      selected[2] = { stage: "tension_counterexample", unit: contrast };
    }

    const targetDiversity = Math.min(3, related.length);
    while (unique(selected.map((entry) => entry.unit?.id).filter(Boolean)).length < targetDiversity) {
      const usage = new Map();
      selected.forEach((entry) => {
        const id = entry.unit?.id;
        if (id) usage.set(id, (usage.get(id) || 0) + 1);
      });
      const usedIds = new Set(usage.keys());
      const unused = related.filter((unit) => unit?.id && !usedIds.has(unit.id));
      const candidates = [];
      selected.forEach((entry, stageIndex) => {
        const current = entry.unit;
        if (!current?.id || (usage.get(current.id) || 0) <= 1) return;
        unused.forEach((unit) => candidates.push({
          stageIndex,
          unit,
          loss: stageScore(current, entry.stage) - stageScore(unit, entry.stage)
        }));
      });
      candidates.sort((left, right) => (
        left.loss - right.loss
        || left.stageIndex - right.stageIndex
        || left.unit.id.localeCompare(right.unit.id)
      ));
      const best = candidates[0];
      if (!best) break;
      selected[best.stageIndex] = {
        stage: selected[best.stageIndex].stage,
        unit: best.unit
      };
    }
    return selected;
  }

  function sourceBoundStageNarrative(stage, unit, related) {
    const focus = insightTitle(unit?.insight || "den kildebundne innsikten");
    const counterpart = related.find((entry) => entry.id !== unit?.id);
    const contrast = insightTitle(counterpart?.insight || focus);
    if (stage === "orientation") return `Start med «${focus}». Avgrens hovedspørsmålet, og identifiser hvilke begreper og kildebelegg som setter rammen.`;
    if (stage === "claim_evidence") return `Prøv «${focus}» mot det konkrete kildebelegget. Skill tydelig mellom observasjon, tolkning og påstandens faktiske rekkevidde.`;
    if (stage === "tension_counterexample") return `Sett «${focus}» opp mot «${contrast}». Forklar spenningen eller et moteksempel som kan endre den foreløpige forståelsen.`;
    if (stage === "uncertainty") return `Undersøk grensene for «${focus}». Marker manglende belegg, åpne antakelser og alternative forklaringer som fortsatt må prøves.`;
    return `Syntetiser det som holder mellom «${focus}» og «${contrast}», og formuler ett presist neste spørsmål som reduserer den viktigste usikkerheten.`;
  }

  function buildPathCandidates(listCandidates, units, projectionId) {
    const stages = [
      {
        id: "orientation",
        outcome: "Kunne formulere hovedspørsmålet og peke på relevant kildegrunnlag."
      },
      {
        id: "claim_evidence",
        outcome: "Kunne koble en påstand til konkret belegg uten å overdrive kildens rekkevidde."
      },
      {
        id: "tension_counterexample",
        outcome: "Kunne forklare den viktigste spenningen og beskrive hva et moteksempel ville endret."
      },
      {
        id: "uncertainty",
        outcome: "Kunne skille dokumentert kunnskap fra åpne spørsmål og begrunnet usikkerhet."
      },
      {
        id: "synthesis_next_inquiry",
        outcome: "Kunne formulere en kildeforankret syntese og et gjennomførbart neste spørsmål."
      }
    ];
    const byInsight = new Map(arr(units).map((unit) => [unit.id, unit]));
    const bestList = arr(listCandidates).filter((list) => arr(list.items).length >= 2).slice().sort((left, right) => {
      const leftFallback = left.meta?.semantic_basis === "fallback_core" ? 1 : 0;
      const rightFallback = right.meta?.semantic_basis === "fallback_core" ? 1 : 0;
      if (leftFallback !== rightFallback) return leftFallback - rightFallback;
      const leftResonance = left.meta?.semantic_basis === "resonance" ? 1 : 0;
      const rightResonance = right.meta?.semantic_basis === "resonance" ? 1 : 0;
      if (leftResonance !== rightResonance) return leftResonance - rightResonance;
      return arr(right.items).length - arr(left.items).length || left.id.localeCompare(right.id);
    })[0];
    return (bestList ? [bestList] : []).map((list) => {
      const related = arr(list.items).map((item) => byInsight.get(item.refId)).filter(Boolean);
      const selectedStages = selectStageUnits(related);
      return {
        id: `path_v2_${hash(`${projectionId}:${list.id}`)}`,
        title: `Undersøk: ${list.meta?.semantic_basis_label || list.title}`,
        type: "learning",
        mode: "learning",
        status: "candidate",
        description: list.description,
        goal: "Bygg en kildeforankret forklaring fra orientering og belegg via spenning og usikkerhet til en begrunnet syntese.",
        learningOutcome: "Kunne forklare sammenhengen med kildebelegg, teste et motperspektiv og formulere et presist neste spørsmål.",
        tags: [...arr(list.tags)],
        steps: stages.map((stage, index) => {
          const selected = selectedStages[index]?.unit;
          return {
            id: `path_step_v2_${hash(`${list.id}:${stage.id}:${selected?.id || "missing"}`)}`,
            title: `${index + 1}. ${stage.id === "orientation" ? "Orientering" : stage.id === "claim_evidence" ? "Påstand og belegg" : stage.id === "tension_counterexample" ? "Spenning eller moteksempel" : stage.id === "uncertainty" ? "Usikkerhet" : "Syntese og neste undersøkelse"}`,
            type: "insight",
            source: "aha_semantic_v2",
            refId: selected?.id || "",
            order: index,
            status: "planned",
            narrative: sourceBoundStageNarrative(stage.id, selected, related),
            learningOutcome: stage.outcome,
            meta: {
              projection_id: projectionId,
              stage: stage.id,
              semantic_role: stage.id,
              semantic_basis: list.meta?.semantic_basis || "",
              selection_reason: `best_source_bound_fit_for_${stage.id}`,
              source_bound_narrative: true,
              read_only: true,
              candidate_only: true
            }
          };
        }),
        source: "aha_semantic_v2",
        local_only: true,
        meta: {
          createdBy: PROJECTION_SCHEMA,
          projection_id: projectionId,
          semantic_shape: "ordered_inquiry_v2",
          source_list_candidate_id: list.id,
          semantic_basis: list.meta?.semantic_basis || "",
          semantic_basis_label: list.meta?.semantic_basis_label || "",
          stage_selection: "semantic_role_ranked_not_round_robin",
          read_only: true,
          candidate_only: true
        }
      };
    }).sort((a, b) => a.id.localeCompare(b.id));
  }

  const SEMANTIC_ROLE_BRANCH_LABELS = Object.freeze({
    tension: "Spenning",
    consequence: "Konsekvens",
    contrast: "Kontrast",
    mechanism: "Mekanisme",
    principle: "Prinsipp",
    pattern: "Mønster",
    observation: "Observasjon",
    solution: "Løsning",
    problem: "Problem",
    generalization: "Hovedidé"
  });

  function semanticRoleBranchCandidates(units, projectionId) {
    const groups = new Map();
    arr(units).forEach((unit) => {
      const role = normalize(unit?.type);
      const label = SEMANTIC_ROLE_BRANCH_LABELS[role];
      if (!label) return;
      if (!groups.has(role)) groups.set(role, []);
      groups.get(role).push(unit);
    });
    if (groups.size < 2) return [];
    return [...groups.entries()].map(([role, members]) => ({
      id: `semantic_role_v2_${hash(`${projectionId}:${role}`)}`,
      key: `semantic_role:${role}`,
      label: SEMANTIC_ROLE_BRANCH_LABELS[role],
      semantic_role: role,
      branch_basis: "semantic_role",
      insight_ids: members.map((unit) => unit.id).sort(),
      occurrence_count: members.length,
      quality_score: Math.max(...members.map((unit) => Number(unit?.quality?.mean_score) || 0))
    })).sort((left, right) => (
      right.occurrence_count - left.occurrence_count
      || right.quality_score - left.quality_score
      || left.semantic_role.localeCompare(right.semantic_role)
    ));
  }

  function buildMindmap(units, concepts, resonanceEdges, projectionId) {
    const selectableConcepts = primaryConceptCandidates(concepts);
    const rankedConcepts = selectableConcepts.slice().sort((a, b) => b.occurrence_count - a.occurrence_count || a.key.localeCompare(b.key));
    const repeatedConcepts = rankedConcepts.filter((concept) => concept.occurrence_count >= 2);
    const branchLimit = Math.min(7, units.length);
    const rawBranchCandidatePool = (repeatedConcepts.length >= 2 ? repeatedConcepts : rankedConcepts)
      .filter((concept) => concept.insight_ids.length > 0);
    const branchCandidatePool = mindmapBranchCandidatePool(rawBranchCandidatePool);
    const unitById = new Map(units.map((unit) => [unit.id, unit]));
    let assignedUnitIds = new Set();
    let assignments = new Map();

    // Prefer source concepts. Every normal branch gets a unique seed insight,
    // preserving the one-parent hierarchy contract.
    let selectedBranches = [];
    branchCandidatePool.forEach((concept) => {
      if (selectedBranches.length >= branchLimit) return;
      const available = concept.insight_ids.map((id) => unitById.get(id)).filter((unit) => unit && !assignedUnitIds.has(unit.id))
        .sort((left, right) => (right.quality.mean_score - left.quality.mean_score) || left.id.localeCompare(right.id));
      if (!available.length) return;
      const branch = { ...concept, branch_basis: "source_concept", semantic_role: "" };
      assignments.set(branch.id, [available[0].id]);
      assignedUnitIds.add(available[0].id);
      selectedBranches.push(branch);
    });

    const minimumBranches = Math.min(2, units.length);
    const roleCandidates = semanticRoleBranchCandidates(units, projectionId);
    const useSemanticRoleFallback = selectedBranches.length < minimumBranches && roleCandidates.length >= minimumBranches;

    if (useSemanticRoleFallback) {
      assignedUnitIds = new Set();
      assignments = new Map();
      selectedBranches = roleCandidates.slice(0, branchLimit);
      selectedBranches.forEach((branch) => {
        const memberIds = branch.insight_ids.filter((id) => unitById.has(id));
        if (!memberIds.length) return;
        assignments.set(branch.id, memberIds);
        memberIds.forEach((id) => assignedUnitIds.add(id));
      });
    } else {
      units.filter((unit) => !assignedUnitIds.has(unit.id)).forEach((unit) => {
        const supported = selectedBranches.filter((branch) => arr(branch.insight_ids).includes(unit.id));
        const target = (supported.length ? supported : selectedBranches).slice().sort((left, right) => {
          const load = arr(assignments.get(left.id)).length - arr(assignments.get(right.id)).length;
          return load || right.occurrence_count - left.occurrence_count || left.key.localeCompare(right.key);
        })[0];
        if (!target) return;
        assignments.get(target.id).push(unit.id);
        assignedUnitIds.add(unit.id);
      });
    }

    const selectedBranchIds = new Set(selectedBranches.map((branch) => branch.id));
    const selectedInsightIds = new Set([...assignedUnitIds]);
    const selectedUnits = units.filter((unit) => selectedInsightIds.has(unit.id));
    const rootLabels = selectedBranches.slice(0, 2).map((branch) => branch.label);
    const rootTitle = rootLabels.length >= 2
      ? `Sammenhengen mellom ${rootLabels[0]} og ${rootLabels[1]}`
      : rootLabels[0] ? `Perspektiver på ${rootLabels[0]}` : "Kildebundne perspektiver";
    const rootId = `theme_v2_${hash(`${projectionId}:${rootLabels.join("||") || "semantic-core"}`)}`;
    const nodes = [
      {
        id: rootId,
        title: rootTitle,
        type: "theme",
        source: "aha_semantic_v2",
        refId: projectionId,
        meta: {
          projection_id: projectionId,
          semantic_shape: "ranked_hierarchy_v2",
          central_idea: rootTitle,
          source_concept_ids: selectedBranches.filter((branch) => branch.branch_basis === "source_concept").slice(0, 2).map((branch) => branch.id),
          semantic_role_branches: selectedBranches.filter((branch) => branch.branch_basis === "semantic_role").map((branch) => branch.semantic_role),
          read_only: true,
          candidate_only: true,
          hierarchy_level: 0,
          root: true
        }
      },
      ...selectedUnits.map((unit) => ({
        id: unit.id,
        title: unit.title,
        type: "insight",
        source: "aha_semantic_v2",
        refId: unit.id,
        meta: {
          projection_id: projectionId,
          read_only: true,
          candidate_only: true,
          member_ids: [...unit.member_ids],
          equivalence_collapsed: unit.equivalence_collapsed,
          quality_score: unit.quality.mean_score,
          semantic_role: normalize(unit.type),
          primary_branch_id: selectedBranches.find((branch) => arr(assignments.get(branch.id)).includes(unit.id))?.id || "",
          hierarchy_level: 2
        }
      })),
      ...selectedBranches.map((branch) => ({
        id: branch.id,
        title: branch.label,
        type: "concept",
        source: "aha_semantic_v2",
        refId: branch.id,
        meta: {
          projection_id: projectionId,
          read_only: true,
          candidate_only: true,
          concept_key: branch.branch_basis === "source_concept" ? branch.key : "",
          semantic_role: branch.branch_basis === "semantic_role" ? branch.semantic_role : "",
          branch_basis: branch.branch_basis,
          occurrence_count: branch.occurrence_count,
          branch_reason: branch.branch_basis === "semantic_role"
            ? `Gren for den dokumenterte semantiske rollen «${branch.label}», med ${arr(assignments.get(branch.id)).length} tilordnet innsikt${arr(assignments.get(branch.id)).length === 1 ? "" : "er"}.`
            : `Gren for kildebegrepet «${branch.label}», med ${arr(assignments.get(branch.id)).length} tilordnet innsikt${arr(assignments.get(branch.id)).length === 1 ? "" : "er"}.`,
          hierarchy_level: 1,
          branch_rank: branch.branch_basis === "source_concept"
            ? rankedConcepts.findIndex((entry) => entry.id === branch.id)
            : selectedBranches.findIndex((entry) => entry.id === branch.id)
        }
      }))
    ].sort((a, b) => a.id.localeCompare(b.id));

    const edges = [];
    selectedBranches.forEach((branch) => edges.push({
      id: `edge_v2_${hash(`${rootId}:${branch.id}:theme_branch`)}`,
      from: rootId,
      to: branch.id,
      type: "theme_branch",
      label: "gren",
      meta: {
        projection_id: projectionId,
        semantic_basis: branch.branch_basis === "semantic_role" ? "ranked_semantic_role" : "ranked_source_concept",
        semantic_role: branch.branch_basis === "semantic_role" ? branch.semantic_role : "",
        branch_reason: branch.branch_basis === "semantic_role"
          ? `«${branch.label}» organiserer en egen kildebundet rollegren fordi concept-hierarkiet ellers har færre enn to ikke-redundante grener.`
          : `«${branch.label}» organiserer en egen kildebundet perspektivgren.`,
        read_only: true,
        candidate_only: true,
        hierarchy: true
      }
    }));
    selectedBranches.forEach((branch) => arr(assignments.get(branch.id)).forEach((unitId) => {
      if (!selectedInsightIds.has(unitId) || !selectedBranchIds.has(branch.id)) return;
      edges.push({
        id: `edge_v2_${hash(`${unitId}:${branch.id}:primary_branch`)}`,
        from: branch.id,
        to: unitId,
        type: "supports_insight",
        label: "belyser innsikt",
        meta: {
          projection_id: projectionId,
          semantic_basis: branch.branch_basis === "semantic_role" ? "primary_semantic_role_assignment" : "primary_concept_assignment",
          semantic_role: branch.branch_basis === "semantic_role" ? branch.semantic_role : "",
          read_only: true,
          candidate_only: true,
          hierarchy: true
        }
      });
    }));
    resonanceEdges.filter((edge) => selectedInsightIds.has(edge.from) && selectedInsightIds.has(edge.to)).forEach((edge) => edges.push({
      id: `edge_v2_${hash(`${edge.from}:${edge.to}:resonance`)}`,
      from: edge.from,
      to: edge.to,
      type: "resonates_with",
      label: "resonerer med",
      confidence: edge.confidence,
      meta: {
        projection_id: projectionId,
        read_only: true,
        candidate_only: true,
        dedupe_eligible: false,
        source_pair_ids: [...edge.source_pair_ids]
      }
    }));

    return {
      nodes,
      edges: edges.sort((a, b) => a.id.localeCompare(b.id)),
      read_only: true,
      meta: {
        createdBy: PROJECTION_SCHEMA,
        projection_id: projectionId,
        semantic_shape: "ranked_hierarchy_v2",
        branch_assignment: "one_primary_hierarchy_parent_per_insight",
        branch_strategy: useSemanticRoleFallback ? "semantic_role_fallback_under_concept_scarcity" : "ranked_source_concepts",
        candidate_only: true,
        root_id: rootId,
        hierarchy_levels: 3,
        branch_count: selectedBranches.length,
        branch_limit: 7,
        omitted_concept_count: useSemanticRoleFallback ? concepts.length : Math.max(0, concepts.length - selectedBranches.length)
      }
    };
  }

  function validate(result) {
    const errors = [];
    const projections = result?.projections || {};
    const insights = arr(projections.insights);
    const concepts = arr(projections.concepts);
    const insightIds = new Set(insights.map((item) => item.id));
    const conceptIds = new Set(concepts.map((item) => item.id));
    if (insightIds.size !== insights.length) errors.push("duplicate_projection_insight_id");
    if (conceptIds.size !== concepts.length) errors.push("duplicate_projection_concept_id");

    concepts.forEach((concept) => arr(concept.insight_ids).forEach((id) => {
      if (!insightIds.has(id)) errors.push(`concept_unresolved_insight:${concept.id}:${id}`);
    }));
    arr(result?.core?.resonance_edges).forEach((edge) => {
      if (!insightIds.has(edge.from) || !insightIds.has(edge.to)) errors.push(`resonance_unresolved_endpoint:${edge.id}`);
      if (edge.dedupe_eligible !== false) errors.push(`resonance_must_not_dedupe:${edge.id}`);
    });
    arr(projections.lists).forEach((list) => {
      if (list?.meta?.semantic_shape !== "thematic_membership_v2") errors.push(`list_semantic_shape_invalid:${list.id}`);
      const manifest = arr(list?.meta?.member_ref_ids).map(text).sort().join("|");
      const refs = arr(list.items).map((item) => text(item?.refId)).filter(Boolean).sort().join("|");
      if (manifest !== refs) errors.push(`list_member_manifest_mismatch:${list.id}`);
      const listBasis = text(list?.meta?.semantic_basis);
      if (listBasis === "shared_evidence") {
        const sourceHash = text(list?.meta?.shared_source_text_hash);
        const evidenceQuote = text(list?.meta?.shared_evidence_quote);
        if (!/^[a-f0-9]{64}$/iu.test(sourceHash) || evidenceQuote.length < 40) errors.push(`list_shared_evidence_metadata_invalid:${list.id}`);
      }
      arr(list.items).forEach((item) => {
        if (item.type === "insight" && !insightIds.has(item.refId)) errors.push(`list_unresolved_insight:${list.id}:${item.refId}`);
        if (!text(item?.membership_reason) || text(item?.membership_reason) !== text(item?.meta?.membership_reason)) errors.push(`list_membership_reason_invalid:${list.id}:${item.refId}`);
        if (listBasis === "shared_evidence" && (
          text(item?.meta?.shared_source_text_hash) !== text(list?.meta?.shared_source_text_hash)
          || text(item?.meta?.shared_evidence_quote) !== text(list?.meta?.shared_evidence_quote)
        )) errors.push(`list_shared_evidence_member_metadata_invalid:${list.id}:${item.refId}`);
      });
    });
    arr(projections.paths).forEach((path) => {
      if (path?.meta?.semantic_shape !== "ordered_inquiry_v2" || path?.meta?.stage_selection !== "semantic_role_ranked_not_round_robin") errors.push(`path_semantic_shape_invalid:${path.id}`);
      arr(path.steps).forEach((step) => {
        if (step.type === "insight" && !insightIds.has(step.refId)) errors.push(`path_unresolved_insight:${path.id}:${step.refId}`);
        if (text(step?.meta?.semantic_role) !== text(step?.meta?.stage) || !text(step?.meta?.selection_reason)) errors.push(`path_semantic_role_invalid:${path.id}:${step.id}`);
      });
    });

    const mindmapNodes = new Set(arr(projections.mindmap?.nodes).map((node) => node.id));
    arr(projections.mindmap?.edges).forEach((edge) => {
      if (!mindmapNodes.has(edge.from) || !mindmapNodes.has(edge.to)) errors.push(`mindmap_unresolved_endpoint:${edge.id}`);
    });
    const mindmapBranches = arr(projections.mindmap?.edges).filter((edge) => edge.type === "theme_branch");
    const mindmapNodeById = new Map(arr(projections.mindmap?.nodes).map((node) => [node.id, node]));
    if (mindmapBranches.length > 7) errors.push("mindmap_branch_limit_exceeded");
    mindmapBranches.forEach((edge) => {
      const branchNode = mindmapNodeById.get(edge.to);
      const basis = text(edge?.meta?.semantic_basis);
      if (basis === "ranked_semantic_role") {
        const role = normalize(edge?.meta?.semantic_role);
        if (!SEMANTIC_ROLE_BRANCH_LABELS[role] || branchNode?.meta?.branch_basis !== "semantic_role" || normalize(branchNode?.meta?.semantic_role) !== role) {
          errors.push(`mindmap_semantic_role_branch_invalid:${edge.to}`);
        }
      } else if (basis !== "ranked_source_concept") {
        errors.push(`mindmap_branch_basis_invalid:${edge.to}`);
      }
    });
    if (projections.mindmap?.meta?.semantic_shape !== "ranked_hierarchy_v2" || projections.mindmap?.meta?.branch_assignment !== "one_primary_hierarchy_parent_per_insight") errors.push("mindmap_semantic_shape_invalid");
    const hierarchyEdges = arr(projections.mindmap?.edges).filter((edge) => edge.type === "supports_insight");
    arr(projections.mindmap?.nodes).filter((node) => node.type === "insight").forEach((node) => {
      const parents = hierarchyEdges.filter((edge) => edge.to === node.id);
      if (parents.length !== 1) errors.push(`mindmap_insight_hierarchy_parent_invalid:${node.id}`);
      const parent = parents[0];
      if (parent?.meta?.semantic_basis === "primary_semantic_role_assignment") {
        const role = normalize(parent?.meta?.semantic_role);
        if (!SEMANTIC_ROLE_BRANCH_LABELS[role] || normalize(node?.meta?.semantic_role) !== role) {
          errors.push(`mindmap_semantic_role_assignment_invalid:${node.id}`);
        }
      }
    });

    return { valid: errors.length === 0, errors: unique(errors).sort() };
  }

  function project(input = {}) {
    const classifier = relationApi();
    const saturation = saturationApi();
    const items = arr(input.insights || input.v2_insights || input.items);
    if (!classifier?.classifySet || !saturation?.describeReadiness) {
      const reasons = [];
      if (!classifier?.classifySet) reasons.push("relation_classifier_v2_unavailable");
      if (!saturation?.describeReadiness) reasons.push("insight_saturation_v2_unavailable");
      return emptyResult(reasons, items.length);
    }

    const entries = buildTrustedEntries(items);
    const trusted = entries.filter((entry) => entry.ready);
    const exclusions = entries.filter((entry) => !entry.ready).map((entry) => ({
      id: entry.id,
      index: entry.index,
      quality_score: entry.quality_score,
      blocking_reasons: arr(entry.readiness?.blocking_reasons)
    }));
    if (!trusted.length) {
      const blocked = emptyResult(["no_projection_ready_insights"], items.length);
      blocked.exclusions = exclusions;
      return clone(blocked);
    }

    const trustedItems = trusted.map((entry) => entry.item);
    const relationSet = classifier.classifySet(trustedItems);
    const { units, memberToUnit, equivalenceGroups } = buildUnits(trusted, relationSet);
    const resonanceEdges = buildResonanceEdges(relationSet, memberToUnit);
    const concepts = buildConceptNodes(units);
    const seed = JSON.stringify({
      trusted_ids: trusted.map((entry) => entry.id).sort(),
      equivalence: equivalenceGroups.map((group) => [group.id, group.member_ids]),
      resonance: resonanceEdges.map((edge) => [edge.from, edge.to, edge.confidence])
    });
    const projectionId = `projection_v2_${hash(seed)}`;
    const projectedInsights = insightProjection(units, concepts);
    const listCandidates = buildListCandidates(units, concepts, resonanceEdges, projectionId);
    const pathCandidates = buildPathCandidates(listCandidates, units, projectionId);
    const mindmap = buildMindmap(units, concepts, resonanceEdges, projectionId);

    const result = {
      schema: PROJECTION_SCHEMA,
      version: PROJECTION_VERSION,
      mode: "shadow",
      status: exclusions.length ? "ready_with_exclusions" : "ready",
      projection_id: projectionId,
      input_count: items.length,
      trusted_input_count: trusted.length,
      excluded_input_count: exclusions.length,
      blocking_reasons: [],
      exclusions,
      core: {
        insight_units: clone(units),
        concept_nodes: clone(concepts),
        equivalence_groups: clone(equivalenceGroups),
        resonance_edges: clone(resonanceEdges)
      },
      projections: {
        insights: projectedInsights,
        concepts: clone(concepts),
        lists: listCandidates,
        paths: pathCandidates,
        mindmap
      },
      context: {
        saturation_v2: input.saturation?.schema === "aha_insight_saturation_v2" ? clone(input.saturation) : null,
        meta_quality_v2: input.meta?.schema === "aha_meta_quality_view_v2" ? clone(input.meta) : null
      },
      validation: { valid: false, errors: [] },
      policy: policy()
    };
    result.validation = validate(result);
    if (!result.validation.valid) {
      result.status = "blocked";
      result.blocking_reasons = ["projection_integrity_failed"];
    }
    return clone(result);
  }

  function surface(result, name) {
    if (!SURFACES.includes(name)) return null;
    return clone(result?.projections?.[name] ?? null);
  }

  function adapters(result) {
    return clone({
      schema: "aha_semantic_projection_adapters_v2",
      projection_id: result?.projection_id || null,
      insights: surface(result, "insights"),
      concepts: surface(result, "concepts"),
      lists: surface(result, "lists"),
      paths: surface(result, "paths"),
      mindmap: surface(result, "mindmap"),
      policy: policy()
    });
  }

  const api = Object.freeze({
    PROJECTION_SCHEMA,
    PROJECTION_VERSION,
    SURFACES,
    project,
    validate,
    surface,
    adapters
  });
  global.AHASemanticProjectionsV2 = api;
  global.AHAModuleApi?.register?.("semanticProjectionsV2", api, {
    version: 2,
    legacyGlobal: "AHASemanticProjectionsV2",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);