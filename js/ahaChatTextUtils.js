(function(global){
  "use strict";

  function isBoilerplateLine(trimmed) {
    const text = String(trimmed || "").trim();
    if (!text) return true;
    const lowered = text.toLowerCase();
    if (/^les\s+også\s*:/i.test(text)) return true;
    if (/^illustrasjon\s*:/i.test(text)) return true;
    if (/^(annonsørinnhold|annonsorinnhold|logo|sponset|annonse)$/i.test(text)) return true;
    if (text.length <= 48 && /(annonsørinnhold|annonsorinnhold|logo|sponset|annonse|kjøp nå|kjop na)/i.test(lowered)) return true;
    return false;
  }

  function stripInlineBoilerplate(text) {
    let value = String(text || "");
    value = value.replace(/\b(annonsørinnhold|annonsorinnhold|sponset)\b/ig, " ");
    value = value.replace(/\blogo\b/ig, " ");
    value = value.replace(/illustrasjon\s*:[^.!?\n]{0,120}/ig, " ");
    value = value.replace(/\s{2,}/g, " ").trim();
    return value;
  }

  function fixSplitNorwegianWords(text) {
    let value = String(text || "");
    const fixes = [
      [/\bkonfl\s+ikt(\w*)\b/gi, "konflikt$1"],
      [/\bkon\s+flikter\b/gi, "konflikter"],
      [/\bprofi\s+leres\b/gi, "profileres"],
      [/\bpro\s+fileres\b/gi, "profileres"],
      [/\bfinn\s+es\b/gi, "finnes"],
      [/\binn\s+flytelse\b/gi, "innflytelse"],
      [/\bfle\s+re\b/gi, "flere"],
      [/\bsikker\s+het\b/gi, "sikkerhet"],
      [/\but\s+vikling\b/gi, "utvikling"],
      [/\bty\s+delig\b/gi, "tydelig"],
      [/\biføl\s+ge\b/gi, "ifølge"],
      [/\bmilj\s+ødegradering\b/gi, "miljødegradering"],
      [/\bressurs\s+knapphet\b/gi, "ressursknapphet"],
      [/\bkonfl\s+iktnivå\b/gi, "konfliktnivå"]
    ];
    fixes.forEach(([re, repl]) => {
      value = value.replace(re, repl);
    });
    return value;
  }

  function dedupeSentenceLikeContent(text) {
    const parts = String(text || "")
      .split(/(?<=[.!?])\s+|\n+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const out = [];
    const seen = new Set();
    parts.forEach((part) => {
      const key = part.toLowerCase().replace(/\s+/g, " ").replace(/["'“”«»]/g, "").trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(part);
    });
    return out.join("\n");
  }

  function cleanArticleText(raw) {
    if (global.AHAAnalysisText?.cleanTextForAnalysis) {
      const precleaned = global.AHAAnalysisText.cleanTextForAnalysis(raw);
      const deduped = dedupeSentenceLikeContent(precleaned);
      return fixSplitNorwegianWords(deduped);
    }
    const lines = String(raw || "").split(/\r?\n/);
    const cleaned = [];
    const seen = new Set();
    lines.forEach((line) => {
      const trimmed = String(line || "").trim();
      if (!trimmed) return;
      if (isBoilerplateLine(trimmed)) return;
      const stripped = stripInlineBoilerplate(trimmed);
      if (!stripped || isBoilerplateLine(stripped)) return;
      const compact = stripped.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(compact)) return;
      seen.add(compact);
      cleaned.push(stripped);
    });
    const merged = dedupeSentenceLikeContent(cleaned.join("\n"));
    return fixSplitNorwegianWords(merged);
  }

  function toSentences(text) {
    return String(text || "").split(/(?<=[.!?])\s+|\n+/).map((part) => part.trim()).filter(Boolean);
  }

  function collectOpinionArticleEvidence(raw, sentences) {
    const text = cleanArticleText(raw);
    const lowered = String(text || "").toLowerCase();
    const normalize = (v) => ` ${String(v || "").toLowerCase()} `;
    const normalizedText = ` ${lowered} `;
    const hasAny = (signals) => signals.some((signal) => normalizedText.includes(normalize(signal)));
    const findLine = (signals) => (sentences || []).find((line) => {
      const normalized = normalize(line);
      return signals.some((signal) => normalized.includes(normalize(signal)));
    }) || "";
    const signals = {
      government: ["regjering", "storting", "statsråd", "statsrad", "departement", "kommisjon", "omstillingskommisjon", "kommune", "lokalsamfunn", "sentralmakt"],
      party: ["mdg", "arbeiderpartiet", "høyre", "hoyre", "sv", "venstre", "sp", "frp", "rødt", "rodt"],
      policyProposal: ["plan", "mandat", "kommisjon", "omstilling", "arealnøytralitet", "arealnoytralitet", "sirkulærøkonomi", "sirkulaerokonomi", "grønn vekst", "gronn vekst", "grønne jobber", "gronne jobber", "naturens premisser"],
      climateTransition: ["omstilling", "grønn omstilling", "gronn omstilling", "bærekraft", "baerekraft", "bærekraftig samfunn", "grønt skifte", "fremtidsrettet", "naturens tålegrenser", "naturens talegrenser"],
      oilFossil: ["olje", "oljeavhengig", "fossilt", "fossil", "oljesokkelen", "oljeindustri", "forurense", "utslippsregnskap"],
      natureProtection: ["natur", "naturhensyn", "villrein", "villaks", "urørt natur", "urort natur", "arealnøytralitet", "arealnoytralitet", "nedbygging", "bygge ned", "naturens premisser"],
      indigenousRights: ["samiske rettigheter", "samisk kultur", "samer", "urfolk"],
      energyPolicy: ["fornybar", "solceller", "vindkraft", "kraft", "elektrifisere", "fastlandsindustrien"],
      circularEconomy: ["sirkulærøkonomi", "sirkulaerokonomi", "gjenbruk", "reparasjon", "arbeidsplasser", "verdiskaping"],
      localCommunities: ["lokalsamfunn", "kommuneøkonomi", "folk i nord", "nord", "finmarking", "oslo", "sentralmakt"],
      economicConsequence: ["økonomi", "okonomi", "arbeidsplasser", "verdiskaping", "kostnad", "kostnader", "konsekvens"],
      politicalCritique: ["kritikk", "undergraver", "svekker", "feiler", "ikke godt nok", "dobbelt signal", "naiv", "uansvarlig"],
      rhetoricalQuestions: ["hva er det egentlig", "hva skal vi bli", "hvorfor", "?"],
      articleBoilerplate: ["les også", "annonsørinnhold", "illustrasjon", "logo"]
    };
    const actorDefs = ["MDG","Arbeiderpartiet","Høyre","SV","Venstre","Sp","Frp","Rødt","regjeringen","Støre-regjeringen","omstillingskommisjonen","John Arne Markussen","kulturministeren","Finansdepartementet","stortinget","statsråd","kommisjon","kommune","lokalsamfunn"];
    const actors = actorDefs.filter((name) => normalizedText.includes(normalize(name)));
    const evidence = {
      hasGovernment: hasAny(signals.government), hasPoliticalActor: hasAny(signals.government) || actors.length > 0, hasParty: hasAny(signals.party), hasPolicyProposal: hasAny(signals.policyProposal), hasClimateTransition: hasAny(signals.climateTransition), hasOilFossil: hasAny(signals.oilFossil), hasNatureProtection: hasAny(signals.natureProtection), hasIndigenousRights: hasAny(signals.indigenousRights), hasEnergyPolicy: hasAny(signals.energyPolicy), hasCircularEconomy: hasAny(signals.circularEconomy), hasLocalCommunities: hasAny(signals.localCommunities), hasEconomicConsequence: hasAny(signals.economicConsequence), hasPoliticalCritique: hasAny(signals.politicalCritique), hasRhetoricalQuestions: hasAny(signals.rhetoricalQuestions), hasArticleBoilerplate: hasAny(signals.articleBoilerplate),
      actors,
      matchedThemes: [],
      textSnippets: {
        claim: findLine([].concat(signals.policyProposal, signals.climateTransition, signals.oilFossil)) || (sentences[0] || ""),
        conflict: findLine(signals.politicalCritique),
        nature: findLine(signals.natureProtection),
        energy: findLine(signals.energyPolicy),
        local: findLine(signals.localCommunities)
      }
    };
    const themes = [];
    if (evidence.hasClimateTransition) themes.push("klima-omstilling");
    if (evidence.hasOilFossil) themes.push("olje-fossil");
    if (evidence.hasNatureProtection) themes.push("natur-areal");
    if (evidence.hasIndigenousRights) themes.push("samiske-rettigheter");
    if (evidence.hasEnergyPolicy) themes.push("energi-industri");
    if (evidence.hasCircularEconomy) themes.push("sirkulaerokonomi");
    if (evidence.hasLocalCommunities) themes.push("lokalsamfunn-makt");
    evidence.matchedThemes = themes;
    return evidence;
  }

  global.AHAChatTextUtils = {
    cleanArticleText,
    toSentences,
    dedupeSentenceLikeContent,
    fixSplitNorwegianWords,
    isBoilerplateLine,
    stripInlineBoilerplate,
    collectOpinionArticleEvidence
  };
})(window);
