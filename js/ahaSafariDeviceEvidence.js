(function initAhaSafariDeviceEvidence(global) {
  "use strict";

  const VERSION = "aha_safari_device_evidence_v1";
  const STORAGE_KEY = VERSION;
  const REQUIRED_PROFILES = [
    "iphone_portrait",
    "iphone_landscape",
    "ipad_fullscreen",
    "ipad_split_view"
  ];
  const REQUIRED_CHECKS = [
    "home_to_chat",
    "chat_send_analyze",
    "chat_reload_persistence",
    "source_bound_export",
    "historygo_consent",
    "historygo_import",
    "historygo_reload_idempotency",
    "keyboard_scroll_safe_area",
    "touch_targets_navigation",
    "no_duplicate_outputs"
  ];

  function detectEnvironment(input) {
    const userAgent = String(input?.userAgent || "");
    const platform = String(input?.platform || "");
    const maxTouchPoints = Number(input?.maxTouchPoints || 0);
    const vendor = String(input?.vendor || "");
    const iphone = /iPhone|iPod/i.test(userAgent);
    const ipad = /iPad/i.test(userAgent) || (/Mac/i.test(platform) && maxTouchPoints > 1);
    const iosDevice = iphone || ipad;
    const competingIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(userAgent);
    const safariEngine = /Safari/i.test(userAgent) && /Apple/i.test(vendor || "Apple");
    const physicalSafari = iosDevice && safariEngine && !competingIosBrowser;
    return {
      iosDevice,
      deviceFamily: iphone ? "iphone" : (ipad ? "ipad" : "unknown"),
      physicalSafari,
      browserLabel: physicalSafari ? "Safari på iPhone/iPad" : (competingIosBrowser ? "Annen iOS-nettleser" : "Ikke bekreftet iOS Safari"),
      userAgent,
      platform,
      maxTouchPoints
    };
  }

  function buildEvidence(input) {
    const checks = [...new Set(Array.isArray(input?.checks) ? input.checks.map(String) : [])];
    const environment = detectEnvironment(input?.environment || {});
    const profile = String(input?.profile || "");
    const orientation = String(input?.orientation || "unknown");
    const allChecksPassed = REQUIRED_CHECKS.every((check) => checks.includes(check));
    const profileAllowed = REQUIRED_PROFILES.includes(profile);
    const expectedFamily = profile.startsWith("iphone_") ? "iphone" : (profile.startsWith("ipad_") ? "ipad" : "unknown");
    const profileMatchesDevice = expectedFamily !== "unknown" && environment.deviceFamily === expectedFamily;
    const expectedOrientation = profile === "iphone_portrait" ? "portrait" : (profile === "iphone_landscape" ? "landscape" : null);
    const orientationMatches = !expectedOrientation || orientation.startsWith(expectedOrientation);
    const physicalConfirmed = input?.physicalConfirmed === true;
    const passed = environment.physicalSafari && profileAllowed && profileMatchesDevice && orientationMatches && physicalConfirmed && allChecksPassed;
    return {
      version: VERSION,
      profile,
      passed,
      physicalConfirmed,
      profileMatchesDevice,
      orientationMatches,
      automatedApproval: false,
      performedAt: String(input?.performedAt || new Date().toISOString()),
      notes: String(input?.notes || "").trim(),
      checks: Object.fromEntries(REQUIRED_CHECKS.map((check) => [check, checks.includes(check)])),
      environment: {
        ...environment,
        viewport: input?.viewport || null,
        screen: input?.screen || null,
        orientation,
        safeArea: input?.safeArea || null
      }
    };
  }

  function summarize(records) {
    const latestByProfile = {};
    (Array.isArray(records) ? records : []).forEach((record) => {
      if (!validStoredEvidence(record)) return;
      if (!latestByProfile[record.profile] || String(record.performedAt) > String(latestByProfile[record.profile].performedAt)) {
        latestByProfile[record.profile] = record;
      }
    });
    const passedProfiles = REQUIRED_PROFILES.filter((profile) => latestByProfile[profile]?.passed === true);
    return {
      version: VERSION,
      passed: passedProfiles.length === REQUIRED_PROFILES.length,
      automatedApproval: false,
      passedProfiles,
      missingProfiles: REQUIRED_PROFILES.filter((profile) => !passedProfiles.includes(profile)),
      latestByProfile
    };
  }

  function validStoredEvidence(record) {
    return record?.version === VERSION
      && REQUIRED_PROFILES.includes(record?.profile)
      && record?.passed === true
      && record?.physicalConfirmed === true
      && record?.profileMatchesDevice === true
      && record?.orientationMatches === true
      && record?.automatedApproval === false
      && record?.environment?.physicalSafari === true
      && REQUIRED_CHECKS.every((check) => record?.checks?.[check] === true);
  }

  function parseStore(raw) {
    try {
      const parsed = JSON.parse(String(raw || ""));
      return parsed?.version === VERSION && Array.isArray(parsed.records) ? parsed : { version: VERSION, records: [] };
    } catch (_error) {
      return { version: VERSION, records: [] };
    }
  }

  function importPayload(currentStore, payload) {
    const records = Array.isArray(payload?.records) ? payload.records.filter(validStoredEvidence) : [];
    return { version: VERSION, records: [...parseStore(JSON.stringify(currentStore)).records, ...records] };
  }

  const api = { VERSION, STORAGE_KEY, REQUIRED_PROFILES, REQUIRED_CHECKS, detectEnvironment, buildEvidence, validStoredEvidence, summarize, parseStore, importPayload };
  global.AHASafariDeviceEvidence = api;

  const document = global.document;
  if (!document || typeof document.getElementById !== "function") return;

  function byId(id) { return document.getElementById(id); }
  function readStore() { return parseStore(global.localStorage?.getItem(STORAGE_KEY)); }
  function writeStore(store) { global.localStorage?.setItem(STORAGE_KEY, JSON.stringify(store)); }
  function metricPair(valueA, valueB) { return `${Number(valueA || 0)} × ${Number(valueB || 0)}`; }
  function safeArea() {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    document.body.appendChild(probe);
    const style = global.getComputedStyle(probe);
    const result = { top: style.paddingTop, right: style.paddingRight, bottom: style.paddingBottom, left: style.paddingLeft };
    probe.remove();
    return result;
  }

  function currentEnvironment() {
    return {
      userAgent: global.navigator?.userAgent,
      platform: global.navigator?.platform,
      maxTouchPoints: global.navigator?.maxTouchPoints,
      vendor: global.navigator?.vendor
    };
  }

  function renderSummary() {
    const summary = summarize(readStore().records);
    const labels = {
      iphone_portrait: "iPhone · stående",
      iphone_landscape: "iPhone · liggende",
      ipad_fullscreen: "iPad · fullskjerm",
      ipad_split_view: "iPad · Split View"
    };
    const list = byId("safari-profile-status-list");
    list.replaceChildren(...REQUIRED_PROFILES.map((profile) => {
      const item = document.createElement("li");
      item.textContent = `${summary.passedProfiles.includes(profile) ? "Bestått" : "Mangler"}: ${labels[profile]}`;
      return item;
    }));
    byId("safari-release-status").textContent = summary.passed
      ? "Den fysiske Safari-porten er komplett dokumentert på denne enheten."
      : `${summary.passedProfiles.length}/4 påkrevde fysiske testøkter er dokumentert.`;
  }

  function initPage() {
    const detected = detectEnvironment(currentEnvironment());
    const environmentStatus = byId("safari-environment-status");
    environmentStatus.textContent = detected.physicalSafari
      ? "Bekreftet: fysisk iPhone/iPad Safari kan registrere evidens."
      : "Blokkert: åpne denne siden i Safari på en fysisk iPhone eller iPad.";
    environmentStatus.classList.add(detected.physicalSafari ? "is-pass" : "is-blocked");
    byId("safari-browser-value").textContent = detected.browserLabel;
    byId("safari-viewport-value").textContent = metricPair(global.innerWidth, global.innerHeight);
    byId("safari-screen-value").textContent = metricPair(global.screen?.width, global.screen?.height);
    const insets = safeArea();
    byId("safari-safe-area-value").textContent = `${insets.top} · ${insets.right} · ${insets.bottom} · ${insets.left}`;
    byId("safari-user-agent-value").textContent = detected.userAgent;

    byId("safari-evidence-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const selectedChecks = [...document.querySelectorAll('input[name="check"]:checked')].map((input) => input.value);
      const evidence = buildEvidence({
        profile: byId("safari-device-profile").value,
        checks: selectedChecks,
        physicalConfirmed: byId("safari-physical-confirmation").checked,
        notes: byId("safari-evidence-notes").value,
        environment: currentEnvironment(),
        viewport: { width: global.innerWidth, height: global.innerHeight },
        screen: { width: global.screen?.width || 0, height: global.screen?.height || 0 },
        orientation: global.screen?.orientation?.type || (global.innerWidth > global.innerHeight ? "landscape" : "portrait"),
        safeArea: insets
      });
      const formStatus = byId("safari-form-status");
      if (!evidence.passed) {
        formStatus.textContent = "Ikke lagret som bestått: fysisk Safari, alle kontroller og fysisk bekreftelse er påkrevd.";
        return;
      }
      const store = readStore();
      store.records.push(evidence);
      writeStore(store);
      formStatus.textContent = "Testøkten er lagret lokalt som bestått.";
      renderSummary();
    });

    byId("safari-export-evidence").addEventListener("click", () => {
      const payload = { ...readStore(), summary: summarize(readStore().records), exportedAt: new Date().toISOString() };
      const url = global.URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "aha-safari-device-evidence-v1.json";
      anchor.click();
      global.URL.revokeObjectURL(url);
    });

    byId("safari-import-evidence").addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        try {
          const imported = JSON.parse(String(reader.result || ""));
          const before = readStore().records.length;
          const merged = importPayload(readStore(), imported);
          writeStore(merged);
          byId("safari-form-status").textContent = `${merged.records.length - before} gyldige testøkter ble importert lokalt.`;
          renderSummary();
        } catch (_error) {
          byId("safari-form-status").textContent = "JSON-filen kunne ikke leses som AHA Safari-evidens.";
        }
        event.target.value = "";
      });
      reader.readAsText(file);
    });

    renderSummary();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initPage, { once: true });
  else initPage();
})(typeof window !== "undefined" ? window : globalThis);
