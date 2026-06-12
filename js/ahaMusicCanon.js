// ahaMusicCanon.js
// Data-driven AHA Music Canon v1: curated seed graph, schema-light validation and UI rendering.

(function (global) {
  "use strict";

  const CANON_NODE_URL = "data/aha-music/canon/musicCanonNodes.json";
  const CANON_EDGE_URL = "data/aha-music/canon/musicCanonEdges.json";
  const CANON_SCHEMA_URL = "data/aha-music/canon/musicCanonSchema.json";
  const allowedNodeTypes = new Set([
    "era",
    "genre",
    "subgenre",
    "tradition",
    "rhythm",
    "harmony",
    "production",
    "technology",
    "instrument",
    "cultural_context",
    "science_concept",
    "music_theory",
    "movement"
  ]);
  const allowedRelationTypes = new Set([
    "developed_from",
    "influenced",
    "belongs_to",
    "parallel_to",
    "reaction_against",
    "uses_technique",
    "emerged_in",
    "transformed_into"
  ]);

  const sectionDefinitions = [
    {
      id: "eras",
      title: "Epoker",
      description: "Historiske tidsankere for senere kobling av musikk og metadata.",
      predicate: (node) => node.type === "era"
    },
    {
      id: "genres",
      title: "Sjangre og tradisjoner",
      description: "Kuraterte sjangre, tradisjoner og bevegelser fra startlisten.",
      predicate: (node) => ["genre", "subgenre", "tradition", "movement"].includes(node.type)
    },
    {
      id: "theory",
      title: "Vitenskap og musikkteori",
      description: "Begreper for rytme, harmoni, produksjon, teknologi, instrumenter og akustikk.",
      predicate: (node) => ["rhythm", "harmony", "production", "technology", "instrument", "science_concept", "music_theory"].includes(node.type)
    },
    {
      id: "context",
      title: "Kulturell kontekst",
      description: "Sosiale og kulturelle rammer som senere kan kobles til musikkbiblioteket.",
      predicate: (node) => node.type === "cultural_context"
    }
  ];

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function text(value, fallback = "") {
    const out = String(value ?? "").trim();
    return out || fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function humanize(value) {
    return text(value).replaceAll("_", " ");
  }

  function sortNodes(nodes) {
    return [...asArray(nodes)].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || text(a.name).localeCompare(text(b.name), "no"));
  }

  async function loadJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Kunne ikke laste ${url}`);
    return response.json();
  }

  async function loadCanonData() {
    const [nodes, edges, schema] = await Promise.all([
      loadJson(CANON_NODE_URL),
      loadJson(CANON_EDGE_URL),
      loadJson(CANON_SCHEMA_URL)
    ]);
    const validation = validateCanonData({ nodes, edges });
    return { nodes, edges, schema, validation };
  }

  function validateCanonNode(node, seenIds) {
    const errors = [];
    for (const key of ["id", "type", "name", "shortDescription", "region", "tags", "sortOrder"]) {
      if (node?.[key] === undefined) errors.push(`Node mangler ${key}`);
    }
    if (!/^[a-z0-9_]+$/.test(text(node?.id))) errors.push(`Ugyldig node-id: ${node?.id}`);
    if (seenIds.has(node.id)) errors.push(`Duplikat node-id: ${node.id}`);
    if (!allowedNodeTypes.has(node?.type)) errors.push(`Ugyldig node-type for ${node?.id}: ${node?.type}`);
    if (typeof node?.name !== "string" || !node.name.trim()) errors.push(`Node ${node?.id} må ha navn`);
    if (typeof node?.shortDescription !== "string" || !node.shortDescription.trim()) errors.push(`Node ${node?.id} må ha shortDescription`);
    if (node?.parentId !== null && node?.parentId !== undefined && typeof node.parentId !== "string") errors.push(`Node ${node?.id} må ha parentId som string eller null`);
    if (node?.eraRange !== null && node?.eraRange !== undefined && typeof node.eraRange !== "string") errors.push(`Node ${node?.id} må ha eraRange som string eller null`);
    if (typeof node?.region !== "string" || !node.region.trim()) errors.push(`Node ${node?.id} må ha region som tekst`);
    if (!Array.isArray(node?.tags) || node.tags.some((tag) => typeof tag !== "string")) errors.push(`Node ${node?.id} må ha tags-array med tekst`);
    if (!Number.isFinite(Number(node?.sortOrder))) errors.push(`Node ${node?.id} må ha sortOrder`);
    return errors;
  }

  function validateCanonEdge(edge, nodeIds, seenEdgeIds) {
    const errors = [];
    for (const key of ["id", "fromNodeId", "toNodeId", "relationType", "shortDescription", "confidence"]) {
      if (edge?.[key] === undefined) errors.push(`Kant mangler ${key}`);
    }
    if (!/^[a-z0-9_]+$/.test(text(edge?.id))) errors.push(`Ugyldig edge-id: ${edge?.id}`);
    if (seenEdgeIds.has(edge.id)) errors.push(`Duplikat edge-id: ${edge.id}`);
    if (!nodeIds.has(edge?.fromNodeId)) errors.push(`Kant ${edge?.id} har ukjent fromNodeId: ${edge?.fromNodeId}`);
    if (!nodeIds.has(edge?.toNodeId)) errors.push(`Kant ${edge?.id} har ukjent toNodeId: ${edge?.toNodeId}`);
    if (!allowedRelationTypes.has(edge?.relationType)) errors.push(`Ugyldig relationType for ${edge?.id}: ${edge?.relationType}`);
    return errors;
  }

  function validateCanonData(data) {
    const nodes = asArray(data?.nodes);
    const edges = asArray(data?.edges);
    const seenNodeIds = new Set();
    const errors = [];
    nodes.forEach((node) => {
      errors.push(...validateCanonNode(node, seenNodeIds));
      seenNodeIds.add(node?.id);
    });
    nodes.forEach((node) => {
      if (node?.parentId && !seenNodeIds.has(node.parentId)) errors.push(`Node ${node.id} har ukjent parentId: ${node.parentId}`);
    });
    const seenEdgeIds = new Set();
    edges.forEach((edge) => {
      errors.push(...validateCanonEdge(edge, seenNodeIds, seenEdgeIds));
      seenEdgeIds.add(edge?.id);
    });
    return { ok: errors.length === 0, errors, nodeCount: nodes.length, edgeCount: edges.length };
  }

  function relationRows(edges, nodesById) {
    if (!edges.length) return `<p class="aha-music-canon-muted">Ingen påvirkningslinjer i denne gruppen ennå.</p>`;
    return `<ol class="aha-music-canon-edge-list">${edges.map((edge) => {
      const from = nodesById.get(edge.fromNodeId);
      const to = nodesById.get(edge.toNodeId);
      return `<li><button type="button" data-canon-node-id="${escapeHtml(edge.fromNodeId)}">${escapeHtml(from?.name || edge.fromNodeId)}</button><span>${escapeHtml(edge.relationType)}</span><button type="button" data-canon-node-id="${escapeHtml(edge.toNodeId)}">${escapeHtml(to?.name || edge.toNodeId)}</button></li>`;
    }).join("")}</ol>`;
  }

  function renderNodeButton(node, selectedId) {
    const selected = node.id === selectedId ? " aria-pressed=\"true\" class=\"is-selected\"" : "";
    return `<button type="button" data-canon-node-id="${escapeHtml(node.id)}"${selected}>
      <strong>${escapeHtml(node.name)}</strong>
      <span>${escapeHtml(humanize(node.type))}${node.eraRange ? ` · ${escapeHtml(node.eraRange)}` : ""}</span>
    </button>`;
  }

  function relatedEdgesForNode(nodeId, edges) {
    const incoming = asArray(edges).filter((edge) => edge.toNodeId === nodeId);
    const outgoing = asArray(edges).filter((edge) => edge.fromNodeId === nodeId);
    return { incoming, outgoing, all: [...incoming, ...outgoing] };
  }

  function renderSelectedNode(node, data) {
    const nodesById = new Map(asArray(data.nodes).map((item) => [item.id, item]));
    const related = relatedEdgesForNode(node.id, data.edges);
    const relatedNodes = [...new Map(related.all.flatMap((edge) => [edge.fromNodeId, edge.toNodeId])
      .filter((id) => id !== node.id)
      .map((id) => [id, nodesById.get(id)]).filter((entry) => entry[1])).values()];
    return `<article class="aha-music-canon-detail-card">
      <p class="eyebrow">Valgt kanon-node</p>
      <h3>${escapeHtml(node.name)}</h3>
      <dl>
        <div><dt>Type</dt><dd>${escapeHtml(humanize(node.type))}</dd></div>
        <div><dt>Region</dt><dd>${escapeHtml(node.region)}</dd></div>
        <div><dt>Epoke</dt><dd>${escapeHtml(node.eraRange || "Ikke tidsfestet")}</dd></div>
      </dl>
      <p>${escapeHtml(node.shortDescription)}</p>
      <div class="aha-music-chips">${asArray(node.tags).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      <section>
        <h4>Relaterte noder</h4>
        ${relatedNodes.length ? `<div class="aha-music-canon-related">${relatedNodes.map((item) => renderNodeButton(item, node.id)).join("")}</div>` : `<p class="aha-music-canon-muted">Ingen relaterte noder i startgrafen.</p>`}
      </section>
      <section>
        <h4>Innkommende påvirkningslinjer</h4>
        ${relationRows(related.incoming, nodesById)}
      </section>
      <section>
        <h4>Utgående påvirkningslinjer</h4>
        ${relationRows(related.outgoing, nodesById)}
      </section>
      <section class="aha-music-canon-empty-link-state">
        <h4>Bibliotekkoblinger</h4>
        <p>Ingen sanger koblet ennå. Datamodellen er klargjort for senere track → canon nodes, artist → canon nodes og playlist → canon nodes-koblinger.</p>
      </section>
    </article>`;
  }

  function renderCanon(data, selectedId) {
    const mount = document.getElementById("aha-music-canon");
    if (!mount) return;
    const nodes = sortNodes(data.nodes);
    const edges = asArray(data.edges);
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const selected = nodesById.get(selectedId) || nodes[0];
    const validation = data.validation || validateCanonData(data);
    mount.innerHTML = `
      <div class="aha-module-actions aha-music-canon-head">
        <div>
          <p class="eyebrow">AHA Music Canon v1</p>
          <h2>Musikk-kanon</h2>
          <p>Kuraterte epoker, sjangre, tradisjoner, teori, vitenskap og kulturelle kontekster som importert musikk senere kan kobles mot.</p>
        </div>
        <span class="aha-music-canon-status ${validation.ok ? "is-ok" : "is-error"}">${validation.ok ? "Schema OK" : "Schema-feil"} · ${validation.nodeCount} noder · ${validation.edgeCount} kanter</span>
      </div>
      ${validation.ok ? "" : `<div class="aha-music-canon-errors">${validation.errors.map((error) => `<p>${escapeHtml(error)}</p>`).join("")}</div>`}
      <div class="aha-music-canon-layout">
        <div class="aha-music-canon-sections">
          ${sectionDefinitions.map((section) => {
            const sectionNodes = nodes.filter(section.predicate);
            return `<section class="aha-music-canon-section" aria-labelledby="canon-${section.id}-title">
              <h3 id="canon-${section.id}-title">${escapeHtml(section.title)}</h3>
              <p>${escapeHtml(section.description)}</p>
              <div class="aha-music-canon-node-grid">${sectionNodes.map((node) => renderNodeButton(node, selected.id)).join("")}</div>
            </section>`;
          }).join("")}
          <section class="aha-music-canon-section" aria-labelledby="canon-edges-title">
            <h3 id="canon-edges-title">Påvirkningslinjer</h3>
            <p>Startgrafen viser kun eksplisitt oppgitte relasjoner fra første kuraterte datasett.</p>
            ${relationRows(edges, nodesById)}
          </section>
        </div>
        <aside id="aha-music-canon-detail" class="aha-music-canon-detail" aria-live="polite">${renderSelectedNode(selected, data)}</aside>
      </div>`;
  }

  function bindCanonClicks(data) {
    const mount = document.getElementById("aha-music-canon");
    if (!mount) return;
    mount.addEventListener("click", (event) => {
      const button = event.target.closest("[data-canon-node-id]");
      if (!button) return;
      renderCanon(data, button.dataset.canonNodeId);
    });
  }

  async function init() {
    const mount = document.getElementById("aha-music-canon");
    if (!mount) return;
    mount.innerHTML = `<p class="aha-music-canon-muted">Laster AHA Music Canon…</p>`;
    try {
      const data = await loadCanonData();
      renderCanon(data);
      bindCanonClicks(data);
    } catch (error) {
      mount.innerHTML = `<article class="aha-module-empty"><h3>Kunne ikke laste musikk-kanonen</h3><p>${escapeHtml(error.message)}</p></article>`;
    }
  }

  global.AHAMusicCanon = {
    CANON_NODE_URL,
    CANON_EDGE_URL,
    CANON_SCHEMA_URL,
    allowedNodeTypes: [...allowedNodeTypes],
    allowedRelationTypes: [...allowedRelationTypes],
    loadCanonData,
    validateCanonData,
    renderCanon,
    relatedEdgesForNode
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
