// ahaOrganizationRoles.js
// Presentation-only role guide for Lists, Paths and Mindmap.

(function (global) {
  "use strict";

  const ROLE_SWITCHER_ID = "aha-organization-role-switcher";
  const ROLES = Object.freeze([
    Object.freeze({
      key: "lists",
      href: "lists.html",
      label: "Samle",
      action: "Lister",
      description: "Samle AHA-objekter du vil holde sammen. En liste har ingen innebygd rekkefølge."
    }),
    Object.freeze({
      key: "paths",
      href: "paths.html",
      label: "Ordne",
      action: "Stier",
      description: "Sett utvalgte innsikter, lister og notater i en bevisst rekkefølge. Stien kjører ikke automatisk."
    }),
    Object.freeze({
      key: "mindmap",
      href: "mindmap.html",
      label: "Se koblinger",
      action: "Tankekart",
      description: "Se referansene som allerede finnes mellom AHA-objekter. Tankekartet er avledet og read-only."
    })
  ]);

  function detectSurface() {
    if (!global.document?.getElementById) return "";
    if (global.document.getElementById("lists-module-title")) return "lists";
    if (global.document.getElementById("paths-module-title")) return "paths";
    if (global.document.getElementById("mindmap-node-list")) return "mindmap";
    return "";
  }

  function buildRoleModel(activeKey) {
    const active = ROLES.find((role) => role.key === activeKey) || null;
    return {
      activeKey: active?.key || "",
      activeDescription: active?.description || "",
      roles: ROLES.map((role) => ({
        ...role,
        current: role.key === activeKey
      })),
      local_only: true,
      presentation_only: true,
      creates_new_knowledge: false,
      writes_to_storage: false,
      runs_automation: false
    };
  }

  function renderRoleSwitcher(model) {
    if (!model?.activeKey || global.document.getElementById(ROLE_SWITCHER_ID)) return false;
    const shell = global.document.querySelector?.(".aha-module-shell");
    if (!shell?.insertAdjacentElement || !global.document.createElement) return false;

    const section = global.document.createElement("section");
    section.id = ROLE_SWITCHER_ID;
    section.className = "aha-panel";
    section.setAttribute("aria-labelledby", "aha-organization-role-title");

    const intro = global.document.createElement("div");
    intro.className = "aha-status-stack";

    const eyebrow = global.document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "Organiser i AHA";

    const title = global.document.createElement("h2");
    title.id = "aha-organization-role-title";
    title.textContent = "Samle · ordne · se koblinger";

    const description = global.document.createElement("p");
    description.className = "aha-module-purpose";
    description.textContent = model.activeDescription;

    const boundary = global.document.createElement("small");
    boundary.textContent = "Lister samler uten rekkefølge · Stier ordner i rekkefølge · Tankekart viser eksisterende koblinger og kan ikke redigere dem.";

    intro.appendChild(eyebrow);
    intro.appendChild(title);
    intro.appendChild(description);
    intro.appendChild(boundary);

    const nav = global.document.createElement("nav");
    nav.className = "aha-module-actions";
    nav.setAttribute("aria-label", "Velg organiseringsmåte");

    model.roles.forEach((role) => {
      const link = global.document.createElement("a");
      link.href = role.href;
      link.className = `aha-tile-btn${role.current ? " aha-tile-btn-primary" : ""}`;
      link.textContent = `${role.label}: ${role.action}`;
      if (role.current) link.setAttribute("aria-current", "page");
      nav.appendChild(link);
    });

    section.appendChild(intro);
    section.appendChild(nav);
    shell.insertAdjacentElement("afterend", section);
    return true;
  }

  function technicalMindmapLabel(text) {
    const value = String(text || "").trim().toLowerCase();
    return [
      "source:",
      "refid:",
      "source_key:",
      "read_only:",
      "local_only:",
      "published_external:",
      "echonet_shared:",
      "sync_enabled:"
    ].some((prefix) => value.startsWith(prefix));
  }

  function humanizeMindmap() {
    if (!global.document?.getElementById?.("mindmap-node-list")) return false;

    const search = global.document.getElementById("mindmap-search");
    if (search && search.placeholder !== "Søk i tittel og type") {
      search.placeholder = "Søk i tittel og type";
    }

    global.document.querySelectorAll?.("#mindmap-node-list .mindmap-card")?.forEach?.((card) => {
      card.querySelectorAll?.(".mindmap-meta")?.forEach?.((meta) => {
        const text = String(meta.textContent || "").trim();
        if (text.toLowerCase().startsWith("refid:")) {
          meta.hidden = true;
          meta.setAttribute?.("aria-hidden", "true");
          return;
        }
        const badge = meta.querySelector?.(".mindmap-badge");
        if (badge && !meta.dataset.ahaRoleHumanized) {
          const label = String(badge.textContent || "").trim();
          meta.textContent = "";
          const nextBadge = global.document.createElement("span");
          nextBadge.className = "mindmap-badge";
          nextBadge.textContent = label;
          meta.appendChild(nextBadge);
          meta.dataset.ahaRoleHumanized = "1";
        }
      });
    });

    global.document.querySelectorAll?.("#mindmap-details p")?.forEach?.((paragraph) => {
      if (technicalMindmapLabel(paragraph.textContent)) {
        paragraph.hidden = true;
        paragraph.setAttribute?.("aria-hidden", "true");
      }
    });

    return true;
  }

  function observeMindmap() {
    if (typeof global.MutationObserver !== "function") return;
    const targets = [
      global.document.getElementById("mindmap-node-list"),
      global.document.getElementById("mindmap-details")
    ].filter(Boolean);
    if (!targets.length) return;

    let scheduled = false;
    const refresh = () => {
      if (scheduled) return;
      scheduled = true;
      const run = () => {
        scheduled = false;
        humanizeMindmap();
      };
      if (typeof global.queueMicrotask === "function") global.queueMicrotask(run);
      else Promise.resolve().then(run);
    };

    const observer = new global.MutationObserver(refresh);
    targets.forEach((target) => observer.observe(target, { childList: true, subtree: true }));
  }

  function install() {
    const activeKey = detectSurface();
    if (!activeKey) return false;
    const model = buildRoleModel(activeKey);
    renderRoleSwitcher(model);
    if (activeKey === "mindmap") {
      humanizeMindmap();
      observeMindmap();
    }
    return true;
  }

  global.AHAOrganizationRoles = {
    ROLES,
    detectSurface,
    buildRoleModel,
    technicalMindmapLabel,
    humanizeMindmap,
    install
  };

  if (global.document?.readyState === "loading") {
    global.document.addEventListener?.("DOMContentLoaded", install);
  } else {
    install();
  }
})(window);
