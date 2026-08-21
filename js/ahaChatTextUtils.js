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

  function shortHash(input) {
    let hash = 5381;
    const value = String(input || "");
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) + hash) + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function takeKeywords(text, maxItems) {
    const tokens = String(text || "").toLowerCase().match(/[a-zæøå0-9]{2,}/g) || [];
    const stop = new Set(["litt","henne","han","hun","hadde","har","var","være","vært","blir","ble","blitt","dette","denne","disse","fordi","kanskje","hvorfor","etter","veldig","ikke","bare","også","med","som","skal","mellom","uten","noen","noe","alle","der","her","nå","fortsatt","først","tredje","runden","gammel","gamle","unge","godt","dårlig","helt","ennå","eller","men","jeg","meg","min","mine","du","deg","din","de","dem","den","det","en","ei","et","på","i","av","til","fra","og","å","norske","norsk","moderne","viktig","viktigste","store","små","nye","gamle","tydelig","særlig","mildt","sagt"]);
    const weakVerbs = new Set(["gjorde","gjør","gjort","tenkte","tenker","synes","sier","sa","våknet","hentet","leverte","dro","kom","går","gikk"]);
    const whitelist = new Set(["kurbad","hageanlegg","dame","telefon","kongo","relasjon","kjærlighet","skyld","skam","fremmedhet","ensomhet","uro","observasjon","nomade","nomadisme","begjær","forfatter","forfatterliv","reise","frihet","kontroll","rus","kropp","språk","møte","minner","konflikt","lengsel","by","park","sted","leilighet","samtale","vennskap","risiko","momsfritak","mediepolitikk","redaktørstyrte","medier","ytringsfrihet","medieøkonomi","journalistikk","regjering","kulturminister","finansdepartementet","annonseinntekter","plattformer","offentlighet","handlingsrom","schibsted","medietilsynet"]);
    const counts = new Map();
    const scores = new Map();
    tokens.forEach((token) => {
      if (token.length < 4) return;
      if (stop.has(token)) return;
      if (weakVerbs.has(token)) return;
      const freq = (counts.get(token) || 0) + 1;
      counts.set(token, freq);
      let score = freq;
      if (whitelist.has(token)) score += 3;
      if (token.length >= 8) score += 1;
      scores.set(token, score);
    });
    return Array.from(scores.entries()).sort((a,b)=>b[1]-a[1]).slice(0, maxItems).map(([word]) => word);
  }

  function sourceHash(text) {
    const source = String(text || "");
    if (!source.trim()) return "";
    const semanticDocument = global.AHAModuleApi?.resolve?.("semanticDocument", "AHASemanticDocument", { version: 1 })
      || global.AHASemanticDocument;
    if (typeof semanticDocument?.sha256Hex !== "function") {
      throw new Error("AHAChatTextUtils krever SemanticDocument SHA-256 for source identity.");
    }
    const digest = String(semanticDocument.sha256Hex(source) || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("SemanticDocument returned an invalid SHA-256 source identity.");
    return digest;
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

  const publicApi = {
    cleanArticleText,
    toSentences,
    shortHash,
    takeKeywords,
    sourceHash,
    dedupeSentenceLikeContent,
    fixSplitNorwegianWords,
    isBoilerplateLine,
    stripInlineBoilerplate,
    collectOpinionArticleEvidence
  };
  global.AHAChatTextUtils = publicApi;
  global.AHAModuleApi?.register?.("chat.textUtils", publicApi, { version: 1, legacyGlobal: "AHAChatTextUtils", exports: Object.keys(publicApi) });
})(window);
