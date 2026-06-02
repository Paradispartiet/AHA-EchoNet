// ahaChatSubjects.js
// Ren fag-/emne-anriking (subject matches) for AHA Chat, skilt ut fra ahaChat.js.
// Normaliserer subject-lenker og fagkoblinger, og utleder ekstra fagkoblinger for
// kjente domener (klima/konflikt, offentlig forvaltning).
//
// Selvinneholdt: ingen DOM, lagring eller chamber-tilgang. Henter tekst-/signal-
// hjelpere fra eksisterende namespace (AHAChatTextUtils, AHAChatSignals) ved
// kjøretid. Eksponerer window.AHAChatSubjects. Lastes etter ahaChatTextUtils.js og
// ahaChatSignals.js, før ahaChat.js.

(function (global) {
  "use strict";

  const PUBLIC_ADMIN_GENERIC_SUBJECTS = new Set(["klima og omstilling", "klima og konflikt", "sahel og mali", "afrikastudier", "miljøsikkerhet", "narrativer i internasjonal politikk"]);

  function normalizeSubjectLinks(subjectMatches) {
    const seen = new Set();
    const list = Array.isArray(subjectMatches) ? subjectMatches : [];
    return list.map((match) => {
      const normalized = {};
      if (match && typeof match === "object") {
        if (match.id != null) normalized.id = match.id;
        if (match.title != null) normalized.title = String(match.title);
        else if (match.subject_label != null) normalized.title = String(match.subject_label);
        if (match.subject_id != null) normalized.subject_id = match.subject_id;
        else if (match.emne_id != null) normalized.subject_id = match.emne_id;
        if (match.score != null && Number.isFinite(Number(match.score))) normalized.score = Number(match.score);
        if (Array.isArray(match.matched_terms)) normalized.matched_terms = match.matched_terms.map((term) => String(term));
      }
      return normalized;
    }).filter((item) => {
      const key = `${String(item.subject_id || "")}|${String(item.title || "").toLowerCase()}`;
      if (!key || key === "|") return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 12);
  }

  function enrichSubjectMatchesForClimateConflict(text, subjectMatches) {
    const normalizedText = global.AHAChatTextUtils.cleanArticleText(text || "").toLowerCase();
    const list = Array.isArray(subjectMatches) ? subjectMatches.slice() : [];
    const seen = new Set(list.map((item) => `${String(item?.subject_id || "")}|${String(item?.title || "").toLowerCase()}`));
    const hasAny = (terms) => (terms || []).some((term) => normalizedText.includes(String(term || "").toLowerCase()));
    const addLink = (title, terms) => {
      const key = `|${String(title || "").toLowerCase()}`;
      if (!title || seen.has(key)) return;
      seen.add(key);
      list.push({ title, subject_label: title, type: "derived", score: 1.6, matched_terms: terms.filter(Boolean) });
    };

    const hasSahelMali = hasAny(["sahel", "mali"]);
    const hasClimate = hasAny(["klimaendringer", "global klimaendring", "menneskeskapte klimaendringer", "klimadrevet"]);
    const hasConflict = hasAny(["konflikt", "konflikter", "klimakrig", "ressurskonflikt"]);
    const hasStrongContext = hasAny(["ressursknapphet","politisk økologi","knapphetsskolen","pastoralister","marginalisering","klimadata","nedbørsdata","empirisk forskning","narrativ"]);
    const strongClimateConflictSignal = hasSahelMali && hasClimate && hasConflict && hasStrongContext;
    if (hasSahelMali && hasClimate && hasConflict) {
      addLink("Klima og konflikt", ["Sahel", "Mali", "klimaendringer", "konflikt"]);
      addLink("Sahel og Mali", ["Sahel", "Mali"]);
      addLink("Afrikastudier", ["Sahel", "Mali"]);
      addLink("Utviklingsstudier", ["konflikt", "marginalisering"]);
    }

    if (hasAny(["politisk økologi", "political ecology", "knapphetsskolen", "environmental security", "miljøsikkerhet"])) {
      addLink("Politisk økologi", ["politisk økologi", "knapphetsskolen"]);
      addLink("Miljøsikkerhet", ["miljøsikkerhet", "environmental security"]);
      addLink("Ressurskonflikter", ["ressursknapphet", "konflikt"]);
    }
    if (hasAny(["forskning", "empiri", "empirisk forskning", "narrativ", "politikk", "klimadata", "nedbørsdata"])) {
      addLink("Vitenskap og politikk", ["forskning", "empiri", "politikk"]);
      addLink("Narrativer i internasjonal politikk", ["narrativ", "internasjonal politikk"]);
    }
    if (hasAny(["pastoralister", "marginalisering", "statens politikk", "ekskludering"])) {
      addLink("Stat, marginalisering og pastoralister", ["pastoralister", "marginalisering", "statens politikk"]);
    }

    if (strongClimateConflictSignal) {
      const preferred = new Set(["Klima og konflikt","Sahel og Mali","Afrikastudier","Utviklingsstudier","Politisk økologi","Miljøsikkerhet","Ressurskonflikter","Vitenskap og politikk","Narrativer i internasjonal politikk","Stat, marginalisering og pastoralister"]);
      const weakForContext = new Set(["lek, læring og kreativitet", "energi og industri"]);
      const filtered = list.filter((item) => {
        const title = String(item?.title || item?.subject_label || "").trim();
        const lowerTitle = title.toLowerCase();
        if (!weakForContext.has(lowerTitle)) return true;
        return preferred.has(title) || Number(item?.score || 0) >= 1.15;
      });
      filtered.sort((a, b) => {
        const aTitle = String(a?.title || a?.subject_label || "").trim();
        const bTitle = String(b?.title || b?.subject_label || "").trim();
        const aPreferred = preferred.has(aTitle) ? 1 : 0;
        const bPreferred = preferred.has(bTitle) ? 1 : 0;
        if (aPreferred !== bPreferred) return bPreferred - aPreferred;
        const aDerived = String(a?.type || "").toLowerCase() === "derived" ? 1 : 0;
        const bDerived = String(b?.type || "").toLowerCase() === "derived" ? 1 : 0;
        if (aDerived !== bDerived) return bDerived - aDerived;
        return Number(b?.score || 0) - Number(a?.score || 0);
      });
      return filtered.slice(0, 12);
    }
    return list.slice(0, 12);
  }

  function enrichSubjectMatchesForPublicAdministration(text, subjectMatches) {
    const list = Array.isArray(subjectMatches) ? subjectMatches.slice() : [];
    const signal = global.AHAChatSignals.detectPublicAdministrationReformSignal(text);
    if (!signal.strong) return list.slice(0, 12);
    const preferred = ["Offentlig forvaltning","Organisasjonsteori","Velferdsstat","NAV og arbeidslinja","Reform og implementering","Statlig styring","Kommunal forvaltning","Arbeids- og sosialpolitikk","Partnerskap stat–kommune","Bakkebyråkrati","Reformevaluering","Offentlig organisering"];
    const seen = new Set(list.map((item) => String(item?.title || item?.subject_label || "").trim().toLowerCase()));
    preferred.forEach((title, index) => {
      if (seen.has(title.toLowerCase())) return;
      list.push({ title, subject_label: title, type: "derived", score: 1.95 - (index * 0.03), matched_terms: signal.matchedTerms.slice(0, 5) });
    });
    return list
      .filter((item) => !PUBLIC_ADMIN_GENERIC_SUBJECTS.has(String(item?.title || item?.subject_label || "").trim().toLowerCase()) || Number(item?.score || 0) >= 1.8)
      .sort((a, b) => {
        const aTitle = String(a?.title || a?.subject_label || "").trim();
        const bTitle = String(b?.title || b?.subject_label || "").trim();
        const aPref = preferred.includes(aTitle) ? 1 : 0;
        const bPref = preferred.includes(bTitle) ? 1 : 0;
        if (aPref !== bPref) return bPref - aPref;
        return Number(b?.score || 0) - Number(a?.score || 0);
      })
      .slice(0, 12);
  }

  function normalizeFagkoblinger(value) {
    if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
    const text = String(value || "").trim();
    if (!text) return [];
    return text.split(/[·,]/).map((item) => item.trim()).filter(Boolean);
  }

  function isAcademicLikeType(type) {
    const key = String(type || "").trim().toLowerCase();
    return key === "academic_article" || key === "theory_idea";
  }

  function isDayLogType(type) {
    return String(type || "").trim().toLowerCase() === "day_log";
  }

  global.AHAChatSubjects = Object.assign({}, global.AHAChatSubjects || {}, {
    normalizeSubjectLinks,
    enrichSubjectMatchesForClimateConflict,
    enrichSubjectMatchesForPublicAdministration,
    normalizeFagkoblinger,
    isAcademicLikeType,
    isDayLogType
  });
})(window);
