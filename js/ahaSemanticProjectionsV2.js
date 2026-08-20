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
        const types = unique(memberEntries.map((member) => extractType(member.item))).sort();
        const causalStatuses = unique(memberEntries.map((member) => extractCausalStatus(member.item))).sort();

        const unit = {
          id: projectionUnitId,
          canonical_member_id: representative.id,
          member_ids: memberIds,
          equivalence_collapsed: memberIds.length > 1,
          title: insightTitle(repText),
          insight: repText,
          summary: repText,
          type: extractType(representative.item),
          all_types: types,
          causal_status: extractCausalStatus(representative.item),
          all_causal_statuses: causalStatuses,
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
    return [...map.values()].map((node) => ({
      ...node,
      insight_ids: unique(node.insight_ids).sort(),
      source_member_ids: unique(node.source_member_ids).sort()
    })).sort((a, b) => a.key.localeCompare(b.key));
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

  function listItem(unit) {
    return {
      id: `list_item_v2_${hash(unit.id)}`,
      title: unit.title,
      type: "insight",
      source: "aha_semantic_v2",
      refId: unit.id,
      meta: {
        read_only: true,
        projection_candidate: true,
        quality_score: unit.quality.mean_score,
        concept_keys: unit.concepts.map((concept) => concept.key)
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
        items: related.map(listItem),
        source: "aha_semantic_v2",
        local_only: true,
        meta: {
          createdBy: PROJECTION_SCHEMA,
          projection_id: projectionId,
          concept_id: concept.id,
          semantic_basis: "shared_concept",
          semantic_basis_label: concept.label,
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
        items: related.map(listItem),
        source: "aha_semantic_v2",
        local_only: true,
        meta: {
          createdBy: PROJECTION_SCHEMA,
          projection_id: projectionId,
          resonance_edge_id: edge.id,
          semantic_basis: "resonance",
          semantic_basis_label: "resonans",
          dedupe_eligible: false,
          read_only: true,
          candidate_only: true
        }
      });
    });

    if (!candidates.length && units.length >= 2) {
      const focus = concepts.slice().sort((a, b) => b.occurrence_count - a.occurrence_count || a.key.localeCompare(b.key))[0];
      candidates.push({
        id: `list_v2_${hash(`${projectionId}:fallback`)}`,
        title: focus ? `Mulig sammenheng rundt ${focus.label}` : "Mulig semantisk sammenheng",
        type: "concepts",
        description: "Foreløpig kandidat som krever sterkere tematisk belegg før den kan bli et produktforslag.",
        tags: ["Krever vurdering", "AHA V2"],
        items: units.slice().sort((a, b) => (b.quality.mean_score - a.quality.mean_score) || a.id.localeCompare(b.id)).map(listItem),
        source: "aha_semantic_v2",
        local_only: true,
        meta: {
          createdBy: PROJECTION_SCHEMA,
          projection_id: projectionId,
          semantic_basis: "fallback_core",
          semantic_basis_label: focus?.label || "",
          read_only: true,
          candidate_only: true
        }
      });
    }

    return candidates.sort((a, b) => a.id.localeCompare(b.id));
  }

  function buildPathCandidates(listCandidates, projectionId) {
    return arr(listCandidates).filter((list) => arr(list.items).length >= 2).slice(0, 6).map((list) => ({
      id: `path_v2_${hash(`${projectionId}:${list.id}`)}`,
      title: `Undersøk: ${list.meta?.semantic_basis_label || list.title}`,
      type: "learning",
      mode: "learning",
      status: "candidate",
      description: list.description,
      goal: "Undersøk hvordan innsiktene henger sammen, hvor de skiller lag og hva som fortsatt er usikkert.",
      learningOutcome: "Kunne forklare sammenhengen med kildebelegg, en tydelig forskjell og et begrunnet neste spørsmål.",
      tags: [...arr(list.tags)],
      steps: arr(list.items).slice(0, 6).map((item, index, items) => {
        const last = index === items.length - 1;
        const stage = index === 0 ? "orientation" : (last ? "synthesis" : "comparison");
        return {
          id: `path_step_v2_${hash(`${list.id}:${item.refId}`)}`,
          title: item.title,
          type: "insight",
          source: "aha_semantic_v2",
          refId: item.refId,
          order: index,
          status: "planned",
          narrative: index === 0
            ? "Start med påstanden og kontroller hva kildene faktisk støtter."
            : (last
              ? "Sett innsikten opp mot de tidligere stegene og formuler hva som holder, hva som skiller seg og hva som bør undersøkes videre."
              : "Sammenlign innsikten med forrige steg: noter både den delte forbindelsen og den viktigste forskjellen."),
          learningOutcome: index === 0
            ? "Kunne gjengi påstanden og peke på kildegrunnlaget."
            : (last
              ? "Kunne formulere en begrunnet syntese og ett åpent spørsmål."
              : "Kunne forklare både sammenheng og forskjell mellom to innsikter."),
          meta: { projection_id: projectionId, stage, semantic_basis: list.meta?.semantic_basis || "", read_only: true, candidate_only: true }
        };
      }),
      source: "aha_semantic_v2",
      local_only: true,
      meta: { createdBy: PROJECTION_SCHEMA, projection_id: projectionId, read_only: true, candidate_only: true }
    })).sort((a, b) => a.id.localeCompare(b.id));
  }

  function buildMindmap(units, concepts, resonanceEdges, projectionId) {
    const rankedConcepts = concepts.slice().sort((a, b) => b.occurrence_count - a.occurrence_count || a.key.localeCompare(b.key));
    const rootConcept = rankedConcepts[0] || null;
    const rootId = `theme_v2_${hash(`${projectionId}:${rootConcept?.key || "semantic-core"}`)}`;
    const nodes = [
      {
        id: rootId,
        title: rootConcept ? `${rootConcept.label}: semantisk oversikt` : "Semantisk oversikt",
        type: "theme",
        source: "aha_semantic_v2",
        refId: projectionId,
        meta: { projection_id: projectionId, read_only: true, candidate_only: true, hierarchy_level: 0, root: true }
      },
      ...units.map((unit) => ({
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
          hierarchy_level: 2
        }
      })),
      ...concepts.map((concept) => ({
        id: concept.id,
        title: concept.label,
        type: "concept",
        source: "aha_semantic_v2",
        refId: concept.id,
        meta: {
          projection_id: projectionId,
          read_only: true,
          candidate_only: true,
          concept_key: concept.key,
          occurrence_count: concept.occurrence_count,
          hierarchy_level: 1,
          branch_rank: rankedConcepts.findIndex((entry) => entry.id === concept.id)
        }
      }))
    ].sort((a, b) => a.id.localeCompare(b.id));

    const edges = [];
    concepts.forEach((concept) => edges.push({
      id: `edge_v2_${hash(`${rootId}:${concept.id}:theme_branch`)}`,
      from: rootId,
      to: concept.id,
      type: "theme_branch",
      label: "gren",
      meta: { projection_id: projectionId, read_only: true, candidate_only: true, hierarchy: true }
    }));
    units.forEach((unit) => unit.concepts.forEach((concept) => {
      const conceptNode = concepts.find((node) => node.key === concept.key);
      if (!conceptNode) return;
      edges.push({
        id: `edge_v2_${hash(`${unit.id}:${conceptNode.id}:has_concept`)}`,
        from: conceptNode.id,
        to: unit.id,
        type: "supports_insight",
        label: "belyser innsikt",
        meta: { projection_id: projectionId, read_only: true, candidate_only: true, hierarchy: true }
      });
    }));
    resonanceEdges.forEach((edge) => edges.push({
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
        candidate_only: true,
        root_id: rootId,
        hierarchy_levels: 3,
        branch_count: concepts.length
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
    arr(projections.lists).forEach((list) => arr(list.items).forEach((item) => {
      if (item.type === "insight" && !insightIds.has(item.refId)) errors.push(`list_unresolved_insight:${list.id}:${item.refId}`);
    }));
    arr(projections.paths).forEach((path) => arr(path.steps).forEach((step) => {
      if (step.type === "insight" && !insightIds.has(step.refId)) errors.push(`path_unresolved_insight:${path.id}:${step.refId}`);
    }));

    const mindmapNodes = new Set(arr(projections.mindmap?.nodes).map((node) => node.id));
    arr(projections.mindmap?.edges).forEach((edge) => {
      if (!mindmapNodes.has(edge.from) || !mindmapNodes.has(edge.to)) errors.push(`mindmap_unresolved_endpoint:${edge.id}`);
    });
    insightIds.forEach((id) => {
      if (!mindmapNodes.has(id)) errors.push(`mindmap_missing_insight:${id}`);
    });
    conceptIds.forEach((id) => {
      if (!mindmapNodes.has(id)) errors.push(`mindmap_missing_concept:${id}`);
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
    const pathCandidates = buildPathCandidates(listCandidates, projectionId);
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
