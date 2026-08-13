// ahaChatConceptPolicy.js
// DOM-fri begrepskanonisering og grafprioritering for AHA Chat.

(function (global) {
  "use strict";

  const WEAK_CONCEPT_WORDS = new Set(["illustrasjon","logo","annonsørinnhold","annonsorinnhold","annonse","sponset","les","også","ogsa","les også","les ogsa","årets","arets","populære","populaere","kjole","kjoler","bryllupsgjesten","sesongens","favoritter","finnes","egen","form","lærer","mennesker","blir","ikke","bare","over","ligger","lavt","noen","helt","ennå","norske","norsk","moderne","viktig","viktigste","store","små","nye","gamle","tydelig","særlig","mildt","sagt","refleksjon","innsikt","samtale","analyse","nødvendighet","nodvendighet"]);

  function create(deps = {}) {
    const {
      normalizeAfterworkConcept,
      normalizeConceptSurface,
      normalizeVisibleAcademicLabel,
      isGenericDisplayConcept,
      detectPublicAdministrationReformSignal,
      extractAcademicPhraseConcepts
    } = deps;

  function getCanonicalConceptLabel(value) {
    return canonicalizeDisplayConcept(normalizeVisibleAcademicLabel(normalizeConceptSurface(value))).trim();
  }

  function getCanonicalConceptKey(value) {
    return normalizeAfterworkConcept(getCanonicalConceptLabel(value));
  }

  function normalizeConceptKey(value) {
    return getCanonicalConceptKey(value);
  }

  function isBlockedStandaloneConcept(value) {
    const key = getCanonicalConceptKey(value);
    return [
      "retning",
      "retninger",
      "størrelse",
      "oppmerksomhet",
      "mulighet",
      "virksomhet",
      "påtilknytning",
      "navkontore"
    ].includes(key);
  }

  function isWeakConceptWord(value) {
    return WEAK_CONCEPT_WORDS.has(String(value || "").toLowerCase());
  }

  function prioritizeVisibleConceptEdges(edges, theoryLinks, context) {
    const list = (Array.isArray(edges) ? edges : []).map((edge) => ({ ...edge }));
    const ctx = context && typeof context === "object" ? context : {};
    const sourceText = String(ctx?.text || "");
    const normalizedText = normalizeConceptKey(sourceText);
    const theoryTokens = new Set((Array.isArray(theoryLinks) ? theoryLinks : []).flatMap((link) => [link?.name, link?.relation, link?.thinker, link?.theory]).map((v) => normalizeConceptKey(v)).filter(Boolean));
    const edgePhrasePairs = [
      { from: "ressursknapphet", to: "knapphetsskolen", left: ["ressursknapphet"], right: ["knapphetsskolen", "scarcity school"] },
      { from: "politisk økologi", to: "ressursknapphet", left: ["politisk økologi", "political ecology"], right: ["ressursknapphet"] },
      { from: "politisk økologi", to: "makt- og produksjonsforhold", left: ["politisk økologi", "political ecology"], right: ["makt- og produksjonsforhold", "maktforhold", "produksjonsforhold", "maktperspektiv"] },
      { from: "dominerende narrativ", to: "empirisk forskning", left: ["dominerende narrativ", "narrativ"], right: ["empirisk forskning", "empiri", "klimadata", "nedbørsdata"] },
      { from: "klimaforklaring", to: "politisk-historisk forklaring", left: ["klimaendringer", "klimaforklaring", "klimadrevet"], right: ["politisk og historisk", "politisk-historisk", "statens politikk", "marginalisering"] },
      { from: "marginalisering", to: "pastoralister", left: ["marginalisering"], right: ["pastoralister"] },
      { from: "marginalisering av pastoralister", to: "statens politikk", left: ["marginalisering av pastoralister", "marginalisering"], right: ["statens politikk"], requires: ["pastoralister"] },
      { from: "miljøsikkerhet", to: "politisk økologi", left: ["miljøsikkerhet", "environmental security"], right: ["politisk økologi", "political ecology"] },
      { from: "malthusiansk forklaring", to: "empirisk casestudie", left: ["malthusiansk", "knapphetsskolen", "ressursknapphet"], right: ["casestudier", "mali", "empirisk forskning"] },
      { from: "omstillingskostnader", to: "strukturelle utfordringer", left: ["omstillingskostnader", "omstillingsprosess"], right: ["strukturelle utfordringer"] },
      { from: "statlig styring", to: "kommunale målsetninger", left: ["statlig styring", "statlige mål"], right: ["kommunale målsetninger", "kommunale virkemidler"] },
      { from: "organisasjonsreform", to: "innholdsreform", left: ["organisasjonsreform"], right: ["innholdsreform"] },
      { from: "arbeidsrettet oppfølging", to: "ytelsessaksbehandling", left: ["arbeidsrettet oppfølging"], right: ["ytelsessaksbehandling", "arbeidsavklaringspenger"] },
      { from: "standardisering", to: "byråkrati", left: ["standardisering"], right: ["byråkrati"] }
    ];
    const conceptPool = new Set();
    const addConcept = (value) => {
      if (value == null) return;
      const term = typeof value === "string" ? value : (value?.label || value?.name || value?.title || value?.key || value?.term || value?.value || "");
      const normalized = normalizeConceptKey(term);
      if (normalized) conceptPool.add(normalized);
    };
    list.forEach((edge) => {
      conceptPool.add(normalizeConceptKey(edge?.from));
      conceptPool.add(normalizeConceptKey(edge?.to));
    });
    theoryTokens.forEach((token) => conceptPool.add(token));
    (Array.isArray(ctx?.concepts) ? ctx.concepts : []).forEach(addConcept);
    (Array.isArray(ctx?.keywords) ? ctx.keywords : []).forEach(addConcept);
    (Array.isArray(ctx?.phraseConcepts) ? ctx.phraseConcepts : []).forEach(addConcept);
    (Array.isArray(ctx?.subjectLinks) ? ctx.subjectLinks : []).forEach(addConcept);
    (Array.isArray(theoryLinks) ? theoryLinks : []).forEach((link) => {
      addConcept(link?.name); addConcept(link?.relation); addConcept(link?.thinker); addConcept(link?.theory);
      extractAcademicPhraseConcepts(link?.connection || "").forEach((phrase) => conceptPool.add(normalizeConceptKey(phrase)));
    });
    extractAcademicPhraseConcepts(sourceText).forEach((phrase) => conceptPool.add(normalizeConceptKey(phrase)));
    const derivedEdges = [];
    const hasAny = (variants) => variants.some((variant) => conceptPool.has(normalizeConceptKey(variant)) || normalizedText.includes(normalizeConceptKey(variant)));
    const isPublicAdmin = detectPublicAdministrationReformSignal(sourceText).strong;
    edgePhrasePairs.forEach((rule) => {
      const isPublicRule = ["omstillingskostnader", "statlig styring", "organisasjonsreform", "arbeidsrettet oppfølging", "standardisering"].includes(rule.from);
      if (isPublicRule && !isPublicAdmin) return;
      if (!hasAny(rule.left) || !hasAny(rule.right)) return;
      if (Array.isArray(rule.requires) && !hasAny(rule.requires)) return;
      const from = rule.from;
      const to = rule.to;
      const key = [from, to].sort((a, b) => a.localeCompare(b)).join("::");
      const exists = list.some((edge) => [normalizeConceptKey(edge?.from), normalizeConceptKey(edge?.to)].sort((a, b) => a.localeCompare(b)).join("::") === key);
      if (!exists) derivedEdges.push({ from, to, weight: 1.25, type: "co_occurs", derived_visible: true });
    });
    derivedEdges.slice(0, 5).forEach((edge) => list.push(edge));

    const conceptKeys = new Set(list.flatMap((edge) => [normalizeConceptKey(edge?.from), normalizeConceptKey(edge?.to)]));
    const weakSingles = new Set();
    if (conceptKeys.has("politisk økologi")) weakSingles.add("økologi");
    if (conceptKeys.has("ressursknapphet") || conceptKeys.has("knapphetsskolen")) weakSingles.add("knapphet");
    if (conceptKeys.has("politisk-historisk forklaring") || conceptKeys.has("politisk og historisk")) { weakSingles.add("politisk"); weakSingles.add("historisk"); }
    if (conceptKeys.has("malthusiansk forklaring")) weakSingles.add("malthusiansk");
    if (conceptKeys.has("marginalisering av pastoralister")) {
      weakSingles.add("marginalisering");
      weakSingles.add("pastoralister");
    }
    if (conceptKeys.has("strukturelle utfordringer") || conceptKeys.has("manglende måloppnåelse")) weakSingles.add("måloppnåelse");
    if (conceptKeys.has("statlig styring")) weakSingles.add("styring");
    if (conceptKeys.has("kommunale målsetninger")) weakSingles.add("retning");
    if (conceptKeys.has("kontorstørrelse")) weakSingles.add("størrelse");
    if (conceptKeys.has("arbeidsrettet oppfølging")) weakSingles.add("oppfølging");
    if (conceptKeys.has("standardisering og byråkrati")) weakSingles.add("standardisering");
    return list
      .map((edge) => {
        const from = normalizeConceptKey(edge?.from);
        const to = normalizeConceptKey(edge?.to);
        const fromWords = from.split(/\s+/).length;
        const toWords = to.split(/\s+/).length;
        const phraseBoost = (fromWords > 1 ? 0.2 : 0) + (toWords > 1 ? 0.2 : 0) + (edge?.derived_visible ? 0.35 : 0);
        const weakPenalty = (weakSingles.has(from) || weakSingles.has(to)) ? 0.35 : 0;
        return { ...edge, _displayScore: Number(edge?.weight || 0) + phraseBoost - weakPenalty };
      })
      .sort((a, b) => (b._displayScore - a._displayScore) || ((b?.weight || 0) - (a?.weight || 0)));
  }

  function applyPhraseConceptDisplayPreference(items, keyGetter) {
    const list = Array.isArray(items) ? items.slice() : [];
    const keys = new Set(list.map((item) => normalizeAfterworkConcept(keyGetter(item))));
    const shouldHide = new Set();
    if (keys.has("politisk økologi")) shouldHide.add("økologi");
    if (keys.has("ressursknapphet") || keys.has("knapphetsskolen")) shouldHide.add("knapphet");
    if (keys.has("politisk-historisk forklaring") || keys.has("politisk og historisk")) {
      shouldHide.add("politisk");
      shouldHide.add("historisk");
    }
    if (keys.has("malthusiansk forklaring")) shouldHide.add("malthusiansk");
    if (keys.has("strukturelle utfordringer") || keys.has("manglende måloppnåelse")) shouldHide.add("måloppnåelse");
    if (keys.has("statlig styring")) shouldHide.add("styring");
    if (keys.has("kommunale målsetninger")) shouldHide.add("retning");
    if (keys.has("kontorstørrelse")) shouldHide.add("størrelse");
    if (keys.has("arbeidsrettet oppfølging")) shouldHide.add("oppfølging");
    if (keys.has("standardisering og byråkrati")) shouldHide.add("standardisering");
    return list.filter((item) => !shouldHide.has(normalizeAfterworkConcept(keyGetter(item))));
  }

  function filterConceptLabels(concepts) {
    const seen = new Set();
    return (Array.isArray(concepts) ? concepts : [])
      .map((c) => typeof c === "string" ? c : (c?.label || c?.key || c?.term || ""))
      .map((c) => getCanonicalConceptLabel(String(c || "").trim()))
      .filter((c) => c && !WEAK_CONCEPT_WORDS.has(c.toLowerCase()))
      .filter((c) => !isBlockedStandaloneConcept(c))
      .filter((c) => !isGenericDisplayConcept(c))
      .filter((c, _, arr) => {
        const keys = new Set(arr.map((term) => normalizeAfterworkConcept(term)));
        const normalized = normalizeAfterworkConcept(c);
        if (keys.has("politisk økologi") && normalized === "økologi") return false;
        if ((keys.has("ressursknapphet") || keys.has("knapphetsskolen")) && normalized === "knapphet") return false;
        if ((keys.has("politisk-historisk forklaring") || keys.has("politisk og historisk")) && (normalized === "politisk" || normalized === "historisk")) return false;
        if (keys.has("malthusiansk forklaring") && normalized === "malthusiansk") return false;
        return true;
      })
      .filter((c) => {
        const key = c.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }
  function canonicalizeDisplayConcept(term) {
    const raw = normalizeConceptSurface(term);
    const key = normalizeAfterworkConcept(raw);
    if (/^nav[-\s]?kontor(ene|er|e)?$/.test(key) || ["navkontor","navkontorer","navkontore","lokalkontor","lokalkontorene"].includes(key)) return "NAV-kontor";
    if (["nav-reformen", "nav reformen", "navreformen"].includes(key) || (key === "reformen" && /nav/.test(normalizeAfterworkConcept(raw)))) return "NAV-reformen";
    if (["stat og kommune","stat-kommune","stat–kommune","statlig og kommunal","statlige og kommunale mål","kommunale målsetninger","kommunale mål","partnerskap mellom stat og kommune","kommunalt partnerskap"].includes(key)) return "Stat–kommune-samspill";
    if (["arbeidsrettet oppfølging","arbeidsrettet virksomhet","arbeidsrettede oppfølgingen","oppfølging mot arbeid","arbeidsmarkedstilknytning"].includes(key)) return "Arbeidsrettet oppfølging";
    if (["måloppnåelse","manglende måloppnåelse","reformens mål","mål om flere i arbeid","flere i arbeid og aktivitet","færre på trygd"].includes(key)) return "Måloppnåelse";
    if (["strukturell utfordring","strukturelle utfordringer","strukturelle vansker","strukturelle problemer","strukturelle årsaker","organisatoriske utfordringer","varige strukturelle utfordringer"].includes(key)) return "Strukturelle utfordringer";
    if (["standardisering og byråkrati","byråkrati og standardisering"].includes(key)) return "Standardisering og byråkrati";
    if (["omstillingsprosess","omstillingskostnad","omstillingskostnader","implementeringsstøy","midlertidig omstilling","omstillingsproblemer"].includes(key)) return "Omstillingsprosess";
    if (["kommunale målsetninger","kommunale mål","statlige og kommunale mål","statlig styring vs kommunale mål","statlig og kommunal","stat og kommune","stat-kommune","stat–kommune","kommunalt partnerskap","partnerskap mellom stat og kommune"].includes(key)) return "Stat–kommune-samspill";
    return raw;
  }

    return Object.freeze({
      normalizeConceptKey,
      getCanonicalConceptLabel,
      getCanonicalConceptKey,
      isBlockedStandaloneConcept,
      isWeakConceptWord,
      prioritizeVisibleConceptEdges,
      applyPhraseConceptDisplayPreference,
      filterConceptLabels,
      canonicalizeDisplayConcept
    });
  }

  const api = Object.freeze({ create });
  global.AHAChatConceptPolicy = api;
  global.AHAModuleApi?.register?.("chat.conceptPolicy", api, {
    version: 1,
    legacyGlobal: "AHAChatConceptPolicy",
    exports: ["create"]
  });
})(typeof window !== "undefined" ? window : globalThis);
