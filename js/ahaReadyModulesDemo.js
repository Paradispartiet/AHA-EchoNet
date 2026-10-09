// AHA Ready Modules Demo V1
// Read-only guide through the canonical ready product path.
(function (global) {
  "use strict";

  const VERSION = "aha_ready_modules_demo_v1";

  const DEMO_PATH = Object.freeze([
    {
      id: "home",
      label: "Start",
      title: "Start i AHA Home",
      href: "index.html",
      moduleId: null,
      description: "Se hva som er viktig nå og hvor AHA mener du bør fortsette."
    },
    {
      id: "chat",
      label: "Chat",
      title: "Snakk med AHA",
      href: "chat.html",
      moduleId: "chat",
      description: "Still et spørsmål eller arbeid med en tekst i hovedsamtalen."
    },
    {
      id: "library",
      label: "Bibliotek",
      title: "Finn igjen det du har bygget",
      href: "search.html",
      moduleId: "search",
      description: "Søk i lokale AHA-objekter og bla i biblioteket ditt."
    },
    {
      id: "personal-ai",
      label: "Personal AI",
      title: "Se hva AHA kan bruke",
      href: "personal-ai.html",
      moduleId: "personal-ai",
      description: "Kontroller personlig grunnlag, retrieval og svarberedskap."
    },
    {
      id: "profile",
      label: "Mitt AHA",
      title: "Se din lokale oversikt",
      href: "profile.html",
      moduleId: "profile",
      description: "Se aktivitet, innsikter, personvernstatus og History Go-importstatus."
    }
  ]);

  function registry(options = {}) {
    return Array.isArray(options.modules)
      ? options.modules
      : (Array.isArray(global.AHA_MODULES) ? global.AHA_MODULES : []);
  }

  function buildDemoPath(options = {}) {
    const modules = registry(options);
    const byId = new Map(modules.map((module) => [module.id, module]));

    const steps = DEMO_PATH.map((step, index) => {
      const module = step.moduleId ? byId.get(step.moduleId) : null;
      const ready = step.moduleId ? module?.status === "active" : true;
      return {
        ...step,
        position: index + 1,
        ready,
        registry_status: step.moduleId ? String(module?.status || "missing") : "product-root",
        registry_title: step.moduleId ? String(module?.title || "") : "AHA Home"
      };
    });

    return {
      version: VERSION,
      local_only: true,
      read_only: true,
      stores_progress: false,
      all_ready: steps.every((step) => step.ready),
      steps,
      blocked_steps: steps.filter((step) => !step.ready),
      summary: steps.every((step) => step.ready)
        ? "Femtrinns demo er klar på den lokale AHA-baselinen."
        : "Demoen kan ikke regnes som klar fordi ett eller flere steg ikke er aktive."
    };
  }

  global.AHAReadyModulesDemo = { VERSION, DEMO_PATH, buildDemoPath };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.AHAReadyModulesDemo;
  }
})(typeof window !== "undefined" ? window : globalThis);
