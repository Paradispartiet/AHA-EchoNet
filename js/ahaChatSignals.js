(function(global){
  "use strict";

  const cleanArticleText = global.AHAChatTextUtils.cleanArticleText;
  const toSentences = global.AHAChatTextUtils.toSentences;
  const collectOpinionArticleEvidence = global.AHAChatTextUtils.collectOpinionArticleEvidence;

  function detectLiteraryAttachmentSignal(text) { const lower = String(text || "").toLowerCase(); let score = 0; const terms = ["knausgård","om våren","om året","min kamp","linda boström","oktoberbarn","tilknytningsteori","tilknytning","bowlby","attachment theory","arbeidsmodell","internal working models","autofiksjon","deiksis","deiktisk","litteraturvitenskap","roman","performativ","nymaterialisme","posthumanisme","løsrivelse","sårbarhet","valborg","mellommenneskelige relasjoner"]; terms.forEach((term)=>{ if(lower.includes(term)) score+=1; }); return { score, strong: score >= 4 }; }

  function detectInstitutionalMediaHistorySignal(text) {
    const src = String(text || "").toLowerCase();
    const isNewspaperText = /\b(avis|avisa|avisen|dagsavis|ukeavis|vekeavis|nisjeavis|kulturavis|kommentaravis|redaktør|redaktor|redaksjon)\b/i.test(src);
    const isMediaText = /\b(presse|journalistikk|mediehus|medium|medier|kringkaster|allmennkringkaster|redaksjonell)\b/i.test(src);
    const isInstitutionText = /\b(institusjon|organisasjon|stiftelse|universitet|museum|bibliotek|forlag|konsern|selskap)\b/i.test(src);
    const institutionTerms = isNewspaperText || isMediaText || isInstitutionText || /\b(morgenbladet|tidsskrift|eierskap|mandat|profil|offentlig rolle)\b/i.test(src);
    const historicalTerms = /\b(ble grunnlagt|grunnlagt|opprettet|etablert|historie|historisk|gjennom|fra .* til|tidligere|senere|på 18\d{2}|på 19\d{2}|på 20\d{2}|i 18\d{2}|i 19\d{2}|i 20\d{2}|over tid)\b/i.test(src);
    const profileTerms = /\b(konservativ|liberal|uavhengig|politisk profil|nisjeavis|kulturavis|kommentaravis|offentlighet)\b/i.test(src);
    const personDiaryNoise = /\b(jeg|meg|min|mitt|mamma|pappa|kjæreste)\b/i.test(src);
    const geopoliticalSignal = detectGeopoliticalPowerSignal(src);
    const score = (institutionTerms ? 2 : 0) + (historicalTerms ? 2 : 0) + (profileTerms ? 1 : 0) - (personDiaryNoise ? 1 : 0) - (geopoliticalSignal.strong ? 3 : 0);
    return { strong: score >= 3, institutionTerms, historicalTerms, profileTerms, isMediaText, isNewspaperText, isInstitutionText };
  }


  function detectGeopoliticalPowerSignal(text) {
    const src = cleanArticleText(text || "").toLowerCase();
    const hasStandaloneKI = /(^|[^a-zæøå0-9])ki([^a-zæøå0-9]|$)/i.test(src);
    const isNegatedAiMention = /\b(ikke|utan|uten)\b[^.!?\n]{0,80}\b(ki|kunstig intelligens|artificial intelligence)\b/i.test(src);
    const terms = [
      ["usa",1.6], ["kina",1.6], ["gdp",1.2], ["bnp",1.2], ["ppp",1.2], ["kjøpekraftsparitet",1.2], ["militær",1.2], ["forsvarsbudsjett",1.2],
      ["demografi",1.0], ["taiwan",1.4], ["xi",0.8], ["trump",0.8], ["allierte",1.0], ["atomarsenal",1.2], ["kunstig intelligens",1.0], ["artificial intelligence",1.0], ["stormaktsrivalisering",1.4]
    ];
    const matchedTerms = terms
      .filter(([term]) => src.includes(term))
      .filter(([term]) => !isNegatedAiMention || (term !== "kunstig intelligens" && term !== "artificial intelligence"))
      .map(([term, weight]) => [term, weight]);
    if (hasStandaloneKI && !isNegatedAiMention) matchedTerms.push(["ki", 0.8]);
    const score = matchedTerms.reduce((sum, [, w]) => sum + w, 0);
    const matchedLabels = matchedTerms.map(([t]) => t);
    const hasUSChinaCore = matchedLabels.includes("usa") && matchedLabels.includes("kina");
    const hasPowerDimension = matchedLabels.some((t) => ["bnp", "gdp", "ppp", "kjøpekraftsparitet", "militær", "forsvarsbudsjett", "demografi", "taiwan", "allierte", "atomarsenal", "ki", "kunstig intelligens", "artificial intelligence"].includes(t));
    return { strong: score >= 5.0 && hasUSChinaCore && hasPowerDimension, score, matchedTerms: matchedLabels };
  }
  function detectPublicAdministrationReformSignal(text) {
    const normalizedText = cleanArticleText(text || "").toLowerCase();
    const terms = [["nav",2.2],["nav-reformen",2.2],["nav-kontor",2.0],["nav-kontorene",2.0],["aetat",1.6],["trygdeetaten",1.6],["sosialtjenesten",1.4],["stat og kommune",2.0],["partnerskap",1.2],["lokalkontor",1.6],["arbeids- og velferdsdirektoratet",1.8],["arbeidsrettet oppfølging",2.0],["flere i arbeid",1.6],["færre på trygd",1.6],["måloppnåelse",1.3],["omstillingsprosess",1.4],["organisasjonsreform",1.8],["innholdsreform",1.8],["statlig styring",1.8],["kommunale mål",1.5],["kommunale virkemidler",1.5],["ytelsessaksbehandling",1.8],["arbeidsavklaringspenger",1.5],["arbeidsevnevurdering",1.4],["forenklingsarbeid",1.4],["standardisering",1.0],["byråkrati",1.0],["reformevaluering",1.5],["effektforskning",1.3],["prosessevaluering",1.3],["kontorstørrelse",1.2],["lokal organisering",1.4],["virksomhetsutvikling",1.3]];
    const matchedTerms = terms.filter(([term]) => normalizedText.includes(term));
    const score = matchedTerms.reduce((sum, [, weight]) => sum + weight, 0);
    const hasNAVCore = matchedTerms.some(([term]) => ["nav", "nav-reformen", "nav-kontor", "nav-kontorene"].includes(term));
    const hasGovernanceCore = matchedTerms.some(([term]) => ["stat og kommune","statlig styring","kommunale mål","kommunale virkemidler","partnerskap"].includes(term));
    const strong = score >= 5.2 && matchedTerms.length >= 3 && (hasNAVCore || hasGovernanceCore);
    return { strong, score, matchedTerms: matchedTerms.map(([term]) => term) };
  }

  function inferReligiousLexiconEvidence(rawText = "") {
    const text = cleanArticleText(rawText).toLowerCase();
    if (!text) return { score: 0, strong: false, markers: [] };
    const markerDefs = [
      { key: "definisjon", weight: 1, test: /\ber\b.{0,35}\b(en|et)\b|\bdefineres\b|\bbetyr\b|\bkalles\b|\bkommer av\b|\betymologi\b/i },
      { key: "bibel", weight: 2, test: /det nye testamentet|det gamle testamentet|apostlene|apostelgjerningene/i },
      { key: "pinsenarrativ", weight: 2, test: /den hellige ånd|tungetale|nådegave|tydning|babels tårn|kirkens fødselsdag/i },
      { key: "kalender", weight: 1.5, test: /gregoriansk kalender|juliansk kalender|treenighetssøndag/i },
      { key: "historie_tradisjon", weight: 1.5, test: /historisk|tradisjon|feiring|kirkesamfunn|høytid|høytidens/i },
      { key: "pinse", weight: 2, test: /\bpinse\b|\bpentekost[eé]\b/i }
    ];
    const hits = markerDefs.filter((m) => m.test.test(text));
    const score = hits.reduce((sum, hit) => sum + hit.weight, 0);
    return { score, strong: score >= 4 && hits.length >= 3, markers: hits.map((h) => h.key) };
  }

  function detectTextType(raw) {
    const text = cleanArticleText(raw).toLowerCase();
    if (!text) return "general";
    const opinionEvidence = collectOpinionArticleEvidence(text, toSentences(text));
    let opinionScore = 0;
    if (opinionEvidence.hasPoliticalActor) opinionScore += 2;
    if (opinionEvidence.hasParty) opinionScore += 1;
    if (opinionEvidence.hasPolicyProposal) opinionScore += 1;
    if (opinionEvidence.hasClimateTransition) opinionScore += 2;
    if (opinionEvidence.hasOilFossil) opinionScore += 2;
    if (opinionEvidence.hasNatureProtection) opinionScore += 2;
    if (opinionEvidence.hasIndigenousRights) opinionScore += 1;
    if (opinionEvidence.hasEnergyPolicy) opinionScore += 1;
    if (opinionEvidence.hasCircularEconomy) opinionScore += 1;
    if (opinionEvidence.hasLocalCommunities) opinionScore += 1;
    if (opinionEvidence.hasPoliticalCritique) opinionScore += 1;
    if (opinionEvidence.hasRhetoricalQuestions) opinionScore += 1;
    const daySignals = /(i dag|idag|dagen min|jeg våknet|jeg hentet|jeg leverte|på jobb|etterpå|i kveld|i morges|vi dro|jeg gjorde|formiddag|ettermiddag)/i;
    const literaryDiarySignals = /(jeg trodde|jeg burde|jeg er lei|jeg skjønner|jeg tenkte|her om dagen|i forrigårs|fortsatt|neste uke|ringe|savn|sinne|kjærlighet|skyld|skam|fremmedhet|forfatter|poetisk|skrive|leve vilt|reise|nomad|kurbad|hageanlegg|leilighet|telefon|park|møte)/i;
    const diaryLifeSignals = /(mamma|pappa|søster|bror|venn|kjæreste|samboer|barn|familie|forhold|kropp|hjerte|gråt|trist|glad|redd|angst|ensom|savner|kranglet|drømte|spiste|sov|dusjet|trente)/i;
    const literaryFragmentSignals = /(scene|stemning|rytme|lys|mørke|rommet|gaten|kropp|språk|vind|lukt|hud|sans)/i;
    const theoryStrongSignals = /(teori|modell|bevissthet|hypotese|begrep|premiss|epistem)/i;
    const theoryWeakSignals = /(kunnskap|system|metode)/i;
    const sentenceCount = toSentences(text).length;
    const pronounCount = (text.match(/\bjeg\b/g) || []).length;
    const hasDiaryShape = pronounCount >= 2 && sentenceCount >= 3;
    const hasAbstractHeader = /(^|\n)\s*sammendrag\b/i.test(raw || "");
    const hasKeywordsHeader = /(^|\n)\s*nøkkelord\s*:/i.test(raw || "");
    const academicSignals = { theorists: /(homer-?dixon|peluso|watts|boserup|kaplan|gleditsch|salehyan|barnett|said)/i.test(text), years: /\b(19|20)\d{2}\b/.test(text), coreTerms: /(ressursknapphet|politisk økologi|miljødegradering|knapphetsskolen|sahel|mali|miljøsikkerhet|environmental security|pinse|pentekost[eé]|den hellige ånd|tungetale|babels tårn|treenighetssøndag|gregoriansk kalender|juliansk kalender)/i.test(text), citations: /\bifølge\b|\bviser til\b|\(([A-ZÆØÅ][A-Za-zÆØÅæøå-]+(?:\s*&\s*[A-ZÆØÅ][A-Za-zÆØÅæøå-]+)?\s+(?:19|20)\d{2}[a-z]?)\)/.test(raw || ""), articleMarkers: /(i denne artikkelen|casestudier|internasjonal forskning|klimadata|kritikk av|presenterer jeg|denne artikkelen drøfter|vi drøfter|vi diskuterer|analyse|implikasjoner)/i.test(text), modelDebate: /(på den ene siden|på den andre siden|kritiserer|forklaringsmodell|alternativ forklaring|drøfter|innvending)/i.test(text), abstractAndKeywords: hasAbstractHeader && hasKeywordsHeader, abstractAndArticle: hasAbstractHeader && /i denne artikkelen|denne artikkelen drøfter|vi drøfter|vi diskuterer/i.test(text), mixedMethods: /kvalitative og kvantitative data|kvalitative data|kvantitative data|empiriske data/i.test(text), publicAdminTerms: /nav-reformen|navreformen|nav-kontor|navkontor|lokalkontor|måloppnåelse|organisering|implementering|statlig styring|kommunale målsetninger|virkemidler|prosessevaluering|effektevaluering|organisasjonsreform|velferdsdirektorat|stat og kommune|partnerskap mellom stat og kommune|omstilling|reform/i.test(text) };
    const academicScore = Object.entries(academicSignals).reduce((sum, [key, hit]) => !hit ? sum : sum + ((key === "abstractAndKeywords" || key === "abstractAndArticle" || key === "mixedMethods") ? 2 : (key === "publicAdminTerms" ? 1.5 : 1)), 0);
    const lexiconSignal = inferReligiousLexiconEvidence(raw || text);
    const hasAcademicHardOverride = academicScore >= 5 && (academicSignals.coreTerms || academicSignals.theorists || academicSignals.publicAdminTerms || academicSignals.abstractAndKeywords || academicSignals.mixedMethods);
    const hasAcademicComboOverride = (academicSignals.abstractAndKeywords && academicSignals.articleMarkers) || academicSignals.abstractAndArticle || (academicSignals.mixedMethods && (academicSignals.articleMarkers || academicSignals.publicAdminTerms)) || (/nav-reformen|navreformen/i.test(text) && hasKeywordsHeader && /i denne artikkelen/i.test(text));
    if (hasAcademicHardOverride || hasAcademicComboOverride || lexiconSignal.strong) return "academic_article";
    const institutionalHistorySignal = detectInstitutionalMediaHistorySignal(raw);
    if (institutionalHistorySignal.strong) return "academic_article";
    const hasStrongOpinion = opinionScore >= 5 || ((opinionEvidence.hasPoliticalActor || opinionEvidence.hasParty) && (opinionEvidence.hasClimateTransition || opinionEvidence.hasOilFossil || opinionEvidence.hasNatureProtection));
    if (hasStrongOpinion) return "opinion_article";
    const strongProjectSignals = /(repo|repository|kode|koding|prompt|merge|pull request|\bpr\b|branch|commit|backend|frontend|\bui\b|\bux\b|\bapi\b|database|javascript|css|html|supabase|vercel|github|fil\b)/i;
    if (strongProjectSignals.test(text)) return "project_note";
    if (theoryStrongSignals.test(text)) return "theory_idea";
    if (theoryWeakSignals.test(text) && !hasDiaryShape && !literaryDiarySignals.test(text)) return "theory_idea";
    if (daySignals.test(text)) return "day_log";
    if (literaryFragmentSignals.test(text) && sentenceCount >= 2) return "literary_fragment";
    const hasPersonalDiarySignals = daySignals.test(text) || diaryLifeSignals.test(text);
    const hasConcreteSelfExperience = pronounCount >= 4 && sentenceCount >= 5 && literaryDiarySignals.test(text);
    if (hasConcreteSelfExperience && hasPersonalDiarySignals && !hasAcademicHardOverride) return "literary_diary";
    return "general";
  }

  global.AHAChatSignals = {
    detectGeopoliticalPowerSignal,
    detectTextType,
    inferReligiousLexiconEvidence,
    detectLiteraryAttachmentSignal,
    detectPublicAdministrationReformSignal,
    detectInstitutionalMediaHistorySignal
  };
})(window);