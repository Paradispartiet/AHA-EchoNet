// ahaMindmap.js
// Fase 3G: første fungerende AHA Tankekart/Graph-modul (localStorage-first, read-only).

(function (global) {
  "use strict";

  const STORAGE_KEYS = {
    insights: "aha_insight_chamber_v1",
    sourceEvents: "aha_source_events_v1",
    lists: "aha_lists_v1",
    paths: "aha_paths_v1",
    articles: "aha_articles_v1",
    notes: "aha_notes_v1",
    feed: "aha_feed_posts_v1",
    gallery: "aha_gallery_v1",
    insta: "aha_insta_posts_v1",
    groups: "aha_groups_v1"
  };

  const TYPE_LABELS = {
    insight: "Innsikt",
    source_event: "Kildehendelse",
    list: "Liste",
    path: "Sti",
    article: "Artikkel",
    note: "Notat",
    feed_post: "Feed-post",
    gallery_item: "Galleriobjekt",
    insta_post: "Insta-post",
    group: "Gruppe"
  };

  let graphState = { nodes: [], edges: [], selectedNodeId: "" };

  function safeParse(raw, fallback) {
    try {
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function asArray(value) { return Array.isArray(value) ? value : []; }

  function asText(value, fallback) {
    const text = String(value ?? "").trim();
    return text || fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function loadByKey(key, fallback) {
    return safeParse(localStorage.getItem(key) || JSON.stringify(fallback), fallback);
  }

  function addNode(nodes, nodeIndex, node) {
    if (!node || !node.id) return;
    if (nodeIndex.has(node.id)) return;
    nodes.push(node);
    nodeIndex.set(node.id, node);
  }

  function nodeId(type, source, refId) {
    return `${type}::${source}::${refId}`;
  }

  function buildNodes(raw) {
    const nodes = [];
    const nodeIndex = new Map();
    const refIndex = new Map();

    function registerRef(node) {
      const key = `${node.source}::${node.refId}::${node.type}`;
      refIndex.set(key, node.id);
    }

    asArray(raw.sourceEvents).forEach((event, index) => {
      const refId = asText(event?.id || event?.event_id || event?.source_event_id, `source_event_idx_${index}`);
      const node = {
        id: nodeId("source_event", "aha_source_events", refId),
        title: asText(event?.source_type || event?.source_app, "Source event"),
        type: "source_event",
        source: "aha_source_events",
        refId,
        href: "insights.html",
        meta: { index }
      };
      addNode(nodes, nodeIndex, node);
      registerRef(node);
    });

    asArray(raw.insights?.insights).forEach((insight, index) => {
      const refId = asText(insight?.id, `insight_idx_${index}`);
      const node = {
        id: nodeId("insight", "aha_insights", refId),
        title: asText(insight?.title || insight?.heading || insight?.label || insight?.summary, "Innsikt"),
        type: "insight",
        source: "aha_insights",
        refId,
        href: "insights.html",
        meta: { index }
      };
      addNode(nodes, nodeIndex, node);
      registerRef(node);
    });

    asArray(raw.lists).filter((list) => !list?.deletedAt).forEach((list) => {
      const refId = asText(list?.id, "");
      if (!refId) return;
      const node = { id: nodeId("list", "aha_lists", refId), title: asText(list?.title, "Liste"), type: "list", source: "aha_lists", refId, href: "lists.html", meta: {} };
      addNode(nodes, nodeIndex, node);
      registerRef(node);
    });

    asArray(raw.paths).filter((path) => !path?.deletedAt).forEach((path) => {
      const refId = asText(path?.id, "");
      if (!refId) return;
      const node = { id: nodeId("path", "aha_paths", refId), title: asText(path?.title, "Sti"), type: "path", source: "aha_paths", refId, href: "paths.html", meta: {} };
      addNode(nodes, nodeIndex, node);
      registerRef(node);
    });

    asArray(raw.articles).filter((article) => !article?.deletedAt).forEach((article) => {
      const refId = asText(article?.id, "");
      if (!refId) return;
      const publicationLayer = asText(article?.publicationLayer || (article?.meta?.createdFromGroupId ? "group" : "personal"), "personal");
      const node = { id: nodeId("article", "aha_avisa", refId), title: asText(article?.title, "Artikkel"), type: "article", source: "aha_avisa", refId, href: "avisa.html", meta: { publicationLayer } };
      addNode(nodes, nodeIndex, node);
      registerRef(node);
    });

    asArray(raw.notes).filter((note) => !note?.deleted_at).forEach((note) => {
      const refId = asText(note?.id, "");
      if (!refId) return;
      const node = { id: nodeId("note", "aha_notes", refId), title: asText(note?.title, "Notat"), type: "note", source: "aha_notes", refId, href: "notes.html", meta: {} };
      addNode(nodes, nodeIndex, node);
      registerRef(node);
    });

    asArray(raw.feed).filter((post) => !post?.deleted_at).forEach((post) => {
      const refId = asText(post?.id, "");
      if (!refId) return;
      const text = asText(post?.text, "");
      const title = text ? `${text.slice(0, 60)}${text.length > 60 ? "…" : ""}` : "Feed-post";
      const node = { id: nodeId("feed_post", "aha_feed", refId), title, type: "feed_post", source: "aha_feed", refId, href: "feed.html", meta: {} };
      addNode(nodes, nodeIndex, node);
      registerRef(node);
    });

    asArray(raw.gallery).filter((item) => !item?.deleted_at).forEach((item) => {
      const refId = asText(item?.id, "");
      if (!refId) return;
      const node = { id: nodeId("gallery_item", "aha_gallery", refId), title: asText(item?.title, "Galleriobjekt"), type: "gallery_item", source: "aha_gallery", refId, href: "gallery.html", meta: {} };
      addNode(nodes, nodeIndex, node);
      registerRef(node);
    });

    asArray(raw.insta).filter((post) => !post?.deleted_at).forEach((post) => {
      const refId = asText(post?.id, "");
      if (!refId) return;
      const node = { id: nodeId("insta_post", "aha_insta", refId), title: asText(post?.title || post?.caption, "Insta-post"), type: "insta_post", source: "aha_insta", refId, href: "insta.html", meta: {} };
      addNode(nodes, nodeIndex, node);
      registerRef(node);
    });

    asArray(raw.groups).filter((group) => !group?.deletedAt && !group?.deleted_at).forEach((group) => {
      const refId = asText(group?.id, "");
      if (!refId) return;
      const node = { id: nodeId("group", "aha_groups", refId), title: asText(group?.title, "Gruppe"), type: "group", source: "aha_groups", refId, href: "groups.html", meta: {} };
      addNode(nodes, nodeIndex, node);
      registerRef(node);
    });

    return { nodes, nodeIndex, refIndex };
  }

  function resolveRef(refIndex, ref) {
    const source = asText(ref?.source, "");
    const refId = asText(ref?.refId || ref?.ref_id, "");
    const type = asText(ref?.type, "");
    if (!source || !refId) return "";
    const exact = refIndex.get(`${source}::${refId}::${type}`);
    if (exact) return exact;
    for (const [key, nodeIdValue] of refIndex.entries()) {
      const parts = key.split("::");
      if (parts[0] === source && parts[1] === refId) return nodeIdValue;
    }
    return "";
  }

  function buildEdges(raw, nodeBundle) {
    const edges = [];
    let edgeIndex = 0;

    function addEdge(from, to, type, label, meta) {
      if (!from || !to) return;
      edges.push({ id: `edge_${type}_${edgeIndex++}`, from, to, type, label, meta: meta || {} });
    }

    const sourceByRef = new Map();
    nodeBundle.nodes.forEach((node) => {
      if (node.type === "source_event") sourceByRef.set(node.refId, node.id);
    });

    asArray(raw.insights?.insights).forEach((insight, index) => {
      const insightRefId = asText(insight?.id, `insight_idx_${index}`);
      const insightNodeId = nodeId("insight", "aha_insights", insightRefId);
      const sourceRefId = asText(insight?.source_event_id || insight?.sourceEventId || insight?.source_id || insight?.sourceId || insight?.event_id || insight?.eventId, "");
      addEdge(sourceByRef.get(sourceRefId), insightNodeId, "source_to_insight", "kilde til innsikt", {});
    });

    asArray(raw.lists).filter((list) => !list?.deletedAt).forEach((list) => {
      const fromId = nodeId("list", "aha_lists", asText(list?.id, ""));
      asArray(list?.items).forEach((item) => {
        const toId = resolveRef(nodeBundle.refIndex, item);
        const edgeType = item?.source === "aha_source_events" ? "related_by_ref" : "list_contains";
        addEdge(fromId, toId, edgeType, "inneholder", { itemId: item?.id || "" });
      });
    });

    asArray(raw.paths).filter((path) => !path?.deletedAt).forEach((path) => {
      const fromId = nodeId("path", "aha_paths", asText(path?.id, ""));
      asArray(path?.steps).forEach((step) => {
        const toId = resolveRef(nodeBundle.refIndex, step);
        addEdge(fromId, toId, "path_contains", "steg", { stepId: step?.id || "" });
      });
    });

    asArray(raw.articles).filter((article) => !article?.deletedAt).forEach((article) => {
      const fromId = nodeId("article", "aha_avisa", asText(article?.id, ""));
      asArray(article?.references).forEach((ref) => {
        const toId = resolveRef(nodeBundle.refIndex, ref);
        addEdge(fromId, toId, "article_references", "referanse", { referenceId: ref?.id || "" });
      });
    });

    asArray(raw.groups).filter((group) => !group?.deletedAt && !group?.deleted_at).forEach((group) => {
      const fromId = nodeId("group", "aha_groups", asText(group?.id, ""));
      asArray(group?.references).forEach((ref) => {
        const toId = resolveRef(nodeBundle.refIndex, ref);
        addEdge(fromId, toId, "group_references", "gruppe-referanse", { referenceId: ref?.id || "" });
      });
    });

    return edges;
  }

  function collectGraphData() {
    const raw = {
      insights: loadByKey(STORAGE_KEYS.insights, { insights: [] }),
      sourceEvents: loadByKey(STORAGE_KEYS.sourceEvents, []),
      lists: loadByKey(STORAGE_KEYS.lists, []),
      paths: loadByKey(STORAGE_KEYS.paths, []),
      articles: loadByKey(STORAGE_KEYS.articles, []),
      notes: loadByKey(STORAGE_KEYS.notes, []),
      feed: loadByKey(STORAGE_KEYS.feed, []),
      gallery: loadByKey(STORAGE_KEYS.gallery, []),
      insta: loadByKey(STORAGE_KEYS.insta, []),
      groups: loadByKey(STORAGE_KEYS.groups, [])
    };

    const nodeBundle = buildNodes(raw);
    const edges = buildEdges(raw, nodeBundle);
    return { nodes: nodeBundle.nodes, edges };
  }

  function render() {
    const nodeTypeFilter = asText(document.getElementById("mindmap-node-type")?.value, "all");
    const edgeTypeFilter = asText(document.getElementById("mindmap-edge-type")?.value, "all");
    const query = asText(document.getElementById("mindmap-search")?.value, "").toLowerCase();

    const edgeByNode = new Map();
    graphState.nodes.forEach((node) => edgeByNode.set(node.id, { in: 0, out: 0 }));
    graphState.edges.forEach((edge) => {
      if (edgeByNode.has(edge.from)) edgeByNode.get(edge.from).out += 1;
      if (edgeByNode.has(edge.to)) edgeByNode.get(edge.to).in += 1;
    });

    const visibleNodes = graphState.nodes.filter((node) => {
      if (nodeTypeFilter !== "all" && node.type !== nodeTypeFilter) return false;
      if (!query) return true;
      const haystack = `${node.title} ${node.type} ${node.source} ${node.refId}`.toLowerCase();
      return haystack.includes(query);
    });

    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = graphState.edges.filter((edge) => {
      if (edgeTypeFilter !== "all" && edge.type !== edgeTypeFilter) return false;
      return visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to);
    });

    const nodeTypes = new Set(graphState.nodes.map((node) => node.type));
    const edgeTypes = new Set(graphState.edges.map((edge) => edge.type));

    const statsNodes = document.getElementById("mindmap-stats-nodes");
    const statsEdges = document.getElementById("mindmap-stats-edges");
    const statsNodeTypes = document.getElementById("mindmap-stats-node-types");
    const statsEdgeTypes = document.getElementById("mindmap-stats-edge-types");

    if (statsNodes) statsNodes.textContent = String(visibleNodes.length);
    if (statsEdges) statsEdges.textContent = String(visibleEdges.length);
    if (statsNodeTypes) statsNodeTypes.textContent = String(nodeTypes.size);
    if (statsEdgeTypes) statsEdgeTypes.textContent = String(edgeTypes.size);

    const nodeList = document.getElementById("mindmap-node-list");
    if (nodeList) {
      nodeList.innerHTML = visibleNodes.length
        ? visibleNodes.map((node) => {
          const counts = edgeByNode.get(node.id) || { in: 0, out: 0 };
          return `
            <article class="mindmap-card ${graphState.selectedNodeId === node.id ? "is-selected" : ""}" data-node-id="${escapeHtml(node.id)}">
              <h3>${escapeHtml(node.title)}</h3>
              <p class="mindmap-meta"><span class="mindmap-badge">${escapeHtml(TYPE_LABELS[node.type] || node.type)}</span> ${escapeHtml(node.source)}</p>
              <p class="mindmap-meta">refId: ${escapeHtml(node.refId)}</p>
              <p class="mindmap-meta">Inn: ${counts.in} · Ut: ${counts.out}</p>
              <a href="${escapeHtml(node.href)}">Åpne modul</a>
            </article>
          `;
        }).join("")
        : '<article class="mindmap-card"><p>Ingen noder matcher filteret.</p></article>';
    }

    const byId = new Map(graphState.nodes.map((node) => [node.id, node]));
    const edgeList = document.getElementById("mindmap-edge-list");
    if (edgeList) {
      edgeList.innerHTML = visibleEdges.length
        ? visibleEdges.map((edge) => {
          const fromNode = byId.get(edge.from);
          const toNode = byId.get(edge.to);
          return `
            <article class="mindmap-card">
              <p><strong>${escapeHtml(fromNode?.title || edge.from)}</strong> → <strong>${escapeHtml(toNode?.title || edge.to)}</strong></p>
              <p class="mindmap-meta"><span class="mindmap-badge">${escapeHtml(edge.type)}</span> ${escapeHtml(edge.label)}</p>
            </article>
          `;
        }).join("")
        : '<article class="mindmap-card"><p>Ingen koblinger matcher filteret.</p></article>';
    }

    renderDetails(edgeByNode);
    bindNodeClicks();
  }

  function renderDetails(edgeByNode) {
    const panel = document.getElementById("mindmap-details");
    if (!panel) return;

    if (!graphState.selectedNodeId) {
      panel.innerHTML = "<p>Velg en node for å se detaljer.</p>";
      return;
    }

    const selected = graphState.nodes.find((node) => node.id === graphState.selectedNodeId);
    if (!selected) {
      panel.innerHTML = "<p>Valgt node finnes ikke lenger i gjeldende filter/data.</p>";
      return;
    }

    const counts = edgeByNode.get(selected.id) || { in: 0, out: 0 };
    panel.innerHTML = `
      <h3>${escapeHtml(selected.title)}</h3>
      <p><strong>Type:</strong> ${escapeHtml(selected.type)}</p>
      <p><strong>Source:</strong> ${escapeHtml(selected.source)}</p>
      <p><strong>refId:</strong> ${escapeHtml(selected.refId)}</p>
      <p><strong>Incoming edges:</strong> ${escapeHtml(String(counts.in))}</p>
      <p><strong>Outgoing edges:</strong> ${escapeHtml(String(counts.out))}</p>
      <p><a href="${escapeHtml(selected.href)}">Åpne modul</a></p>
    `;
  }

  function bindNodeClicks() {
    document.querySelectorAll("[data-node-id]").forEach((el) => {
      el.addEventListener("click", function onNodeClick() {
        graphState.selectedNodeId = String(el.getAttribute("data-node-id") || "");
        render();
      });
    });
  }

  function refresh() {
    const graph = collectGraphData();
    graphState.nodes = graph.nodes;
    graphState.edges = graph.edges;

    const nodeSelect = document.getElementById("mindmap-node-type");
    const edgeSelect = document.getElementById("mindmap-edge-type");
    if (nodeSelect && nodeSelect.options.length <= 1) {
      const types = Array.from(new Set(graphState.nodes.map((n) => n.type))).sort();
      types.forEach((type) => {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = TYPE_LABELS[type] || type;
        nodeSelect.appendChild(option);
      });
    }
    if (edgeSelect && edgeSelect.options.length <= 1) {
      const types = Array.from(new Set(graphState.edges.map((e) => e.type))).sort();
      types.forEach((type) => {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = type;
        edgeSelect.appendChild(option);
      });
    }

    if (!graphState.selectedNodeId && graphState.nodes.length) graphState.selectedNodeId = graphState.nodes[0].id;
    render();
  }

  function bindUi() {
    document.getElementById("mindmap-refresh")?.addEventListener("click", refresh);
    document.getElementById("mindmap-node-type")?.addEventListener("change", render);
    document.getElementById("mindmap-edge-type")?.addEventListener("change", render);
    document.getElementById("mindmap-search")?.addEventListener("input", render);
  }

  global.AHAMindmap = {
    collectGraphData,
    buildNodes,
    buildEdges,
    render,
    refresh
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function onReady() {
      bindUi();
      refresh();
    });
  } else {
    bindUi();
    refresh();
  }
})(window);
