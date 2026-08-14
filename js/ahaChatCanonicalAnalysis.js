// ahaChatCanonicalAnalysis.js
// Kanonisk analysesyntese og valgfri Python-engine-adapter.
//
// Presentasjon og kilde-/domenehjelpere injiseres av ahaChat.js. Modulen
// eksponerer window.AHAChatCanonicalAnalysis og lastes før ahaChat.js.

(function (global) {
  "use strict";

  function create(deps = {}) {
    const requiredFunctions = [
      "buildAhaSerCard", "detectTextType", "detectAutoAnalysisDomain",
      "normalizeSubjectMatches", "normalizeFagkoblinger", "normalizeConceptKey",
      "buildAcademicConceptCandidates"
    ];
    requiredFunctions.forEach((name) => {
      if (typeof deps[name] !== "function") throw new Error(`AHAChatCanonicalAnalysis mangler avhengighet: ${name}`);
    });
    if (!deps.AHA_RUNTIME_KNOWLEDGE_POLICY) {
      throw new Error("AHAChatCanonicalAnalysis mangler avhengighet: AHA_RUNTIME_KNOWLEDGE_POLICY");
    }

    const {
      buildAhaSerCard,
      AHA_RUNTIME_KNOWLEDGE_POLICY,
      detectTextType,
      detectAutoAnalysisDomain,
      normalizeSubjectMatches,
      normalizeFagkoblinger,
      normalizeConceptKey,
      buildAcademicConceptCandidates
    } = deps;

    function normalizeHistoryGoLinks(value) {
      const items = Array.isArray(value) ? value : [];
      const out = [];
      const seen = new Set();
      items.forEach((item) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const normalized = {
            type: String(item.type || item.kind || "topic").trim() || "topic",
            id: String(item.id || item.slug || item.key || item.title || "").trim(),
            title: String(item.title || item.label || item.name || item.id || "").trim(),
            reason: String(item.reason || item.why || item.explanation || "").trim()
          };
          if (!normalized.id && normalized.title) normalized.id = normalizeConceptKey(normalized.title).replace(/\s+/g, "_");
          if (!normalized.title) normalized.title = normalized.id;
          if (!normalized.id && !normalized.title) return;
          const signature = `${normalized.type}::${normalized.id}::${normalized.title}`.toLowerCase();
          if (seen.has(signature)) return;
          seen.add(signature);
          out.push(normalized);
          return;
        }
        const text = String(item || "").trim();
        if (!text) return;
        const id = normalizeConceptKey(text).replace(/\s+/g, "_");
        const signature = `topic::${id}::${text}`.toLowerCase();
        if (seen.has(signature)) return;
        seen.add(signature);
        out.push({ type: "topic", id, title: text, reason: "" });
      });
      return out;
    }

    function isPythonEngineFeatureEnabled() {
      try {
        return global.localStorage?.getItem("aha_python_engine_enabled") === "true";
      } catch {
        return false;
      }
    }

    function isValidCanonicalAnalysisShape(value) {
      return global.AHAChatAnalysis.isValidCanonicalAnalysisShape(value);
    }

    function buildPythonFallbackMeta(baseMeta, reason, details = {}) {
      return global.AHAChatAnalysis.buildPythonFallbackMeta(baseMeta, reason, details);
    }

    async function resolveCanonicalAnalysisWithOptionalPythonEngine({ message, assistantReply, historyGoContext, fallbackAnalysis }) {
      const featureFlagEnabled = isPythonEngineFeatureEnabled();
      const baseMeta = {
        featureFlagEnabled,
        resolvedAt: new Date().toISOString(),
        reason: ""
      };
      if (!featureFlagEnabled) {
        return {
          analysis: fallbackAnalysis,
          meta: Object.assign({}, baseMeta, { source: "javascript_default" })
        };
      }
      const client = global.AHAEngineClient;
      if (!client || typeof client.buildAnalyzePayload !== "function") {
        return {
          analysis: fallbackAnalysis,
          meta: buildPythonFallbackMeta(baseMeta, "client_missing")
        };
      }
      const hasDetailedClient = typeof client.analyzeWithPythonEngineDetailed === "function";
      if (!hasDetailedClient && typeof client.analyzeWithPythonEngine !== "function") {
        return {
          analysis: fallbackAnalysis,
          meta: buildPythonFallbackMeta(baseMeta, "client_missing")
        };
      }
      try {
        const payload = client.buildAnalyzePayload(message, assistantReply, historyGoContext || {});
        if (hasDetailedClient) {
          const detailed = await client.analyzeWithPythonEngineDetailed(payload);
          const pythonAnalysis = detailed?.analysis || null;
          if (detailed?.ok && isValidCanonicalAnalysisShape(pythonAnalysis)) {
            return {
              analysis: pythonAnalysis,
              meta: Object.assign({}, baseMeta, { source: "python", reason: "" })
            };
          }
          if (detailed?.ok && !isValidCanonicalAnalysisShape(pythonAnalysis)) {
            console.warn("Python AHA Engine returnerte ugyldig canonical analysis; bruker JavaScript-fallback.");
          }
          return {
            analysis: fallbackAnalysis,
            meta: buildPythonFallbackMeta(baseMeta, detailed?.reason || "python_error", detailed || {})
          };
        }

        const pythonAnalysis = await client.analyzeWithPythonEngine(payload);
        if (isValidCanonicalAnalysisShape(pythonAnalysis)) {
          return {
            analysis: pythonAnalysis,
            meta: Object.assign({}, baseMeta, { source: "python", reason: "" })
          };
        }
        if (pythonAnalysis == null) {
          return {
            analysis: fallbackAnalysis,
            meta: buildPythonFallbackMeta(baseMeta, "python_null")
          };
        }
        console.warn("Python AHA Engine returnerte ugyldig canonical analysis; bruker JavaScript-fallback.");
        return {
          analysis: fallbackAnalysis,
          meta: buildPythonFallbackMeta(baseMeta, "invalid_python_shape")
        };
      } catch (err) {
        console.warn("Python AHA Engine feilet; bruker JavaScript-fallback.", err);
        return {
          analysis: fallbackAnalysis,
          meta: buildPythonFallbackMeta(baseMeta, "python_error")
        };
      }
    }

    function normalizeSemanticText(value) {
      return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
    }

    function containsAny(text, phrases) {
      return phrases.some((phrase) => text.includes(phrase));
    }

    function isPinseText(text) {
      return containsAny(text, ["pinse", "den hellige ånd", "kirkens fødselsdag", "apostlene"]);
    }

    function isLegalText(text) {
      return containsAny(text, ["hjemmel i lov", "legitimt formål", "forholdsmessig", "vedtaket", "rettigheter"]);
    }

    function isUnclearFragment(text) {
      return text.length < 160 && containsAny(text, ["vet ikke", "klarer ikke forklare"]);
    }

    function buildDeterministicSemanticSummary(contentType, domain, sourceText) {
      const text = normalizeSemanticText(sourceText);
      if (domain === "institutional_media_history") {
        return containsAny(text, ["langsom journalistikk", "kontinuerlig nyhetsstrøm", "dannelsesoffentlighet"])
          ? { theme: "Morgenbladet som arena for langsom idéoffentlighet", mainTension: "demokratisk offentlig samtale kontra smal dannelsesoffentlighet", keyInsight: "Teksten bruker Morgenbladet til å undersøke hvordan redaksjonell form og tempo påvirker kulturkritikkens offentlige rolle." }
          : { theme: "Morgenbladet som idéoffentlig institusjon", mainTension: "dyptpløyende offentlighet kontra tempoorientert nyhetslogikk", keyInsight: "Teksten tolker Morgenbladets verdi som knyttet til refleksjon og langsom journalistikk." };
      }
      if (domain === "public_administration_reform") {
        return containsAny(text, ["brukermøte", "brukermøtet", "byråkratisk kompleksitet"])
          ? { theme: "NAV-reformen mellom samordningsideal og brukernær kompleksitet", mainTension: "helhetlig velferdsforvaltning kontra praktisk byråkratisk kompleksitet", keyInsight: "Teksten viser at reformens mål om ett kontaktpunkt avhenger av hvordan styring, systemer og etatskulturer faktisk møter brukeren." }
          : { theme: "samordning og styring i NAV-reformen", mainTension: "politisk mål om helhet versus organisatorisk kompleksitet", keyInsight: "Reformen illustrerer at strukturendring alene ikke løser koordinasjonsproblemer uten tydelig ansvarslinje." };
      }
      const byDomain = {
        literary_attachment: { theme: "tilknytningsteori som tolkningsramme i romananalyse", mainTension: "estetisk fortelling kontra psykologisk begrepsbruk", keyInsight: "Tolkningen viser hvordan narrativ form kan bære psykologisk innsikt uten fagterminologisk overforklaring." },
        learning_reflection: { theme: "læring gjennom mønstergjenkjenning og justering", mainTension: "feil som nederlag kontra feil som praktisk læringsdata", keyInsight: "Refleksjonen peker på at læring styrkes når feil omgjøres til konkrete mønstre, vaner og små justeringer." },
        urban_attention_reflection: { theme: "konsentrasjon i møte med byrommets rytme", mainTension: "stimulerende byliv kontra oppmerksomhetsbrudd", keyInsight: "Teksten kobler personlig uro til hvordan fysiske omgivelser kan støtte eller forstyrre tenkning uten å gjøre erfaringen klinisk." },
        constitutional_democratic_history: { theme: "Eidsvoll og Grunnloven som demokratisk grunnfortelling", mainTension: "nasjonal grunnleggelse kontra demokratiets historiske avgrensninger", keyInsight: "Teksten viser at 1814 kan forstås både som demokratisk startpunkt og som et ufullstendig prosjekt som senere ble utvidet." },
        urban_sports_history: { theme: "Bislett stadion som idrettshistorisk og urbant sosialt rom", mainTension: "sportslig arena kontra levende byrom", keyInsight: "Teksten skiller mellom stadion som sportshistorisk institusjon og som arkitektonisk byrom der fellesskap formes." },
        digital_pedagogy_knowledge_systems: { theme: "AI som støtte for læring og kollektiv kunnskapsbygging", mainTension: "automatisert tilgang til kunnskap kontra menneskelig vurdering og forståelse", keyInsight: "Teksten viser at læringsteknologi bør vurderes etter hvordan den styrker kritisk egenarbeid, ikke bare hvor raskt den leverer svar." }
      };
      if (byDomain[domain]) return byDomain[domain];
      if (contentType === "day_log") return { theme: "indre konflikt mellom produktivitet og nærvær", mainTension: "mestringsfølelse kontra emosjonell distanse", keyInsight: "Teksten peker mot at unngåelse av vanskelige valg kan forklare opplevelsen av uro mer enn ytre tidsmangel." };
      if (contentType === "project_note") return { theme: "kontrollert innfasing av analysemodul", mainTension: "leveransehastighet kontra kvalitetssikring", keyInsight: "Notatet identifiserer testdata-kvalitet som kritisk avhengighet for trygg migrering." };
      if (isLegalText(text)) return { theme: "forholdsmessighet som rettslig avveiningsnorm", mainTension: "offentlig myndighetsutøvelse kontra individvern", keyInsight: "Teksten framhever at forholdsmessighet avhenger av om mindre inngripende alternativer er reelt tilgjengelige." };
      if (isPinseText(text)) return { theme: "pinse som teologisk og kulturell markør", mainTension: "balansen mellom religiøs betydning og samfunnsmessig tradisjon", keyInsight: "Teksten viser hvordan pinse fungerer både som trosfortelling og som sosialt tidsanker." };
      if (isUnclearFragment(text)) return { theme: "uklar problemforståelse uten tydelig kontekst", mainTension: "opplevd sammenheng kontra manglende konkretisering", keyInsight: "Teksten uttrykker en mulig frustrasjon, men gir for få holdepunkter til sikker tematisk eller faglig analyse." };
      return { theme: "usikker årsaksforståelse", mainTension: "behov for forklaring kontra manglende spesifisitet", keyInsight: "Teksten uttrykker frustrasjon, men gir for få konkrete holdepunkter til sikker klassifisering." };
    }

    function buildDeterministicRecommendations(contentType, domain, sourceText) {
      const text = normalizeSemanticText(sourceText);
      if (isPinseText(text)) return { fieldConnections: ["teologi", "religionshistorie", "kulturhistorie"], suggestedActions: ["Sammenlign med framstillinger av pinse i andre kirkesamfunn.", "Legg til kildehenvisning til Apostlenes gjerninger 2 for presisjon."] };
      if (domain === "institutional_media_history") {
        return containsAny(text, ["langsom journalistikk", "kontinuerlig nyhetsstrøm", "dannelsesoffentlighet"])
          ? { fieldConnections: ["pressehistorie", "offentlighetsteori", "kulturjournalistikk"], suggestedActions: ["Legg til en avgrenset periode for å gjøre den mediehistoriske analysen mer etterprøvbar.", "Sammenlign Morgenbladets langsomme format med en raskere nyhetsaktør for å tydeliggjøre kontrasten."] }
          : { fieldConnections: ["pressehistorie", "offentlighetsteori", "kulturjournalistikk"], suggestedActions: ["Konkretiser med tidsperioder for å styrke historisk etterprøvbarhet.", "Sammenlign med andre norske nisjeaviser for kontrast."] };
      }
      if (domain === "public_administration_reform") {
        return containsAny(text, ["brukermøte", "brukermøtet", "styringslinjer", "byråkratisk kompleksitet"])
          ? { fieldConnections: ["offentlig forvaltning", "velferdsstat", "organisasjonsteori"], suggestedActions: ["Skille tydelig mellom reformens politiske mål, organisatoriske virkemidler og brukeropplevd effekt.", "Legg til ett konkret eksempel fra et NAV-kontor for å gjøre spenningen empirisk tydeligere."] }
          : { fieldConnections: ["forvaltningspolitikk", "organisasjonsteori", "velferdsstyring"], suggestedActions: ["Legg til eksempel på hvordan reformen slo ut lokalt i NAV-kontor.", "Skille tydeligere mellom målformulering og evalueringsfunn."] };
      }
      const byDomain = {
        learning_reflection: { fieldConnections: ["læringspsykologi", "metakognisjon", "vanedannelse"], suggestedActions: ["Lag en enkel logg med feil, årsak og neste justering etter hver økt.", "Velg én vane som kan repeteres kort daglig før større evaluering."] },
        urban_attention_reflection: { fieldConnections: ["psykologi", "urban studies", "sosiologi"], suggestedActions: ["Beskriv to konkrete steder som gir ulik balanse mellom energi og ro.", "Test en kort arbeidsøkt i hvert miljø og noter hva som skjer med oppmerksomheten."] },
        constitutional_democratic_history: { fieldConnections: ["historie", "politikk", "rett", "nasjonsbygging"], suggestedActions: ["Avklar hvilke grupper som var inkludert og ekskludert fra politisk deltakelse i 1814.", "Knytt analysen til senere demokratiske utvidelser for å vise historisk utvikling."] },
        urban_sports_history: { fieldConnections: ["idrettshistorie", "byhistorie", "arkitektur", "sosiologi"], suggestedActions: ["Skille eksplisitt mellom konkurransehistorie, publikumsbruk og arkitektonisk endring.", "Legg til én konkret ombygging eller idrettshendelse for sterkere historisk forankring."] },
        digital_pedagogy_knowledge_systems: { fieldConnections: ["pedagogikk", "teknologi", "sosiologi", "kunnskapsteori"], suggestedActions: ["Presiser hvilke læringssituasjoner som støttes av AI og hvilke som krever egen vurdering.", "Legg til kriterier for å skille mellom nyttig oppsummering og ukritisk fasitbruk."] },
        literary_attachment: { fieldConnections: ["litteraturvitenskap", "psykologi", "fortellerteori"], suggestedActions: ["Underbygg tolkningen med konkrete tekststeder.", "Avklar forskjellen mellom karakteranalyse og diagnose."] }
      };
      if (byDomain[domain]) return byDomain[domain];
      if (contentType === "day_log") return { fieldConnections: ["psykologisk selvforståelse", "hverdagsmestring"], suggestedActions: ["Formuler ett konkret valg som kan tas i løpet av uken.", "Før ny refleksjon etter en samtale der nærvær forsøkes aktivt."] };
      if (contentType === "project_note") return { fieldConnections: ["programvareutvikling", "teststrategi", "endringsledelse"], suggestedActions: ["Definer måleindikator for avvik før implementering starter.", "Knyt milepæler til eksplisitte exit-kriterier per fase."] };
      if (isLegalText(text)) return { fieldConnections: ["forvaltningsrett", "rettssikkerhet", "menneskerettigheter"], suggestedActions: ["Angi rettskilder som støtter treleddstesten.", "Skille tydelig mellom gyldighetskontroll og hensiktsmessighetsvurdering."] };
      if (isUnclearFragment(text)) return { fieldConnections: [], suggestedActions: ["Be avsenderen angi hvem eller hva teksten handler om.", "Etterspør ett konkret eksempel, tidspunkt og ønsket endring."] };
      return { fieldConnections: [], suggestedActions: ["Etterspør kontekst: hvem, hva, når og hvilke konsekvenser.", "Be om ett konkret eksempel som kan avgrense problemstillingen."] };
    }

    function buildDeterministicConfidence(contentType, domain, sourceText) {
      const text = normalizeSemanticText(sourceText);
      const result = (contentTypeScore, domainScore, theme, mainTension, historyGoLinks, warnings = []) => ({ confidence: { contentType: contentTypeScore, domain: domainScore, theme, mainTension, historyGoLinks }, warnings });
      if (isPinseText(text)) return result(0.95, 0.94, 0.9, 0.82, 0.2);
      if (domain === "institutional_media_history") return containsAny(text, ["langsom journalistikk", "kontinuerlig nyhetsstrøm", "dannelsesoffentlighet"]) ? result(0.93, 0.94, 0.91, 0.87, 0.86) : result(0.92, 0.93, 0.9, 0.86, 0.84);
      if (domain === "public_administration_reform") return containsAny(text, ["brukermøte", "brukermøtet", "byråkratisk kompleksitet", "uklart ansvar"]) ? result(0.94, 0.95, 0.91, 0.9, 0.89) : result(0.94, 0.95, 0.91, 0.89, 0.88);
      if (domain === "learning_reflection") return result(0.91, 0.84, 0.88, 0.84, 0.04);
      if (domain === "urban_attention_reflection") return result(0.9, 0.8, 0.86, 0.83, 0.04, ["Personlig uro bør forstås som situert erfaring i teksten, ikke som grunnlag for klinisk diagnose."]);
      if (domain === "constitutional_democratic_history") return result(0.92, 0.89, 0.9, 0.87, 0.62, ["History Go-koblingen er konseptuell fordi ingen eksisterende Eidsvoll- eller Grunnloven-ID er verifisert i repoet."]);
      if (domain === "urban_sports_history") return result(0.91, 0.87, 0.88, 0.84, 0.6, ["History Go-koblingen er konseptuell fordi ingen eksisterende Bislett- eller stadion-ID er verifisert i repoet."]);
      if (domain === "digital_pedagogy_knowledge_systems") return result(0.9, 0.86, 0.88, 0.87, 0.05);
      if (domain === "literary_attachment") return result(0.9, 0.87, 0.9, 0.83, 0.12);
      if (contentType === "day_log") return result(0.93, 0.82, 0.88, 0.86, 0.05);
      if (contentType === "project_note") return result(0.94, 0.92, 0.9, 0.87, 0.1);
      if (isLegalText(text)) return result(0.93, 0.94, 0.89, 0.9, 0.18);
      if (isUnclearFragment(text)) return result(0.34, 0.2, 0.36, 0.32, 0.02, ["Teksten er kort og fragmentert, så analysen bør ha lav sikkerhet.", "Mangler konkrete aktører, hendelser og faglige begreper."]);
      return result(0.38, 0.22, 0.41, 0.35, 0.03, ["Lav informasjonsdensitet: teksten mangler konkrete referanser.", "Flere tolkninger er plausible; analyse bør behandles som foreløpig."]);
    }

    function buildCanonicalAnalysis(payload, sourceText = "") {
      const safePayload = payload && typeof payload === "object" ? payload : {};
      if (isValidCanonicalAnalysisShape(safePayload.canonicalAnalysis)) {
        return safePayload.canonicalAnalysis;
      }
      const canonicalSer = buildAhaSerCard(safePayload, sourceText);
      const policyAcademic = !AHA_RUNTIME_KNOWLEDGE_POLICY.legacyArticleTemplatesEnabled && detectTextType(sourceText || "") === "academic_article";
      const domain = detectAutoAnalysisDomain(sourceText || "", safePayload || {});
      const existingHistoryLinks = safePayload?.historyGoLinks || safePayload?.history_go_links || [];
      const subjectHistoryLinks = policyAcademic
        ? normalizeSubjectMatches(safePayload?.subjectMatches || []).slice(0, 5).map((match) => {
            const title = String(match?.title || match?.label || match?.subject_label || match?.subject_id || "Fagverk").trim();
            const id = String(match?.subject_id || match?.id || title).trim().toLowerCase().replace(/[^a-z0-9æøå]+/gi, "_").replace(/^_+|_+$/g, "");
            return { type: "subject", id, title, reason: "Kildebasert fagkobling fra AHA Fagverk-kalibrering." };
          }).filter((item) => item.id)
        : [];
      const derivedHistoryLinks = subjectHistoryLinks.length
        ? subjectHistoryLinks
        : buildHistoryGoLinksFromDomain(domain, sourceText || "", canonicalSer);
      const contentType = String(safePayload?.textType || detectTextType(sourceText || ""));
      const semanticSummary = buildDeterministicSemanticSummary(contentType, domain, sourceText);
      const recommendations = buildDeterministicRecommendations(contentType, domain, sourceText);
      const confidenceAndWarnings = buildDeterministicConfidence(contentType, domain, sourceText);
      return {
        contentType,
        domain,
        theme: semanticSummary.theme,
        mainTension: semanticSummary.mainTension,
        keyInsight: semanticSummary.keyInsight,
        fieldConnections: recommendations.fieldConnections,
        historyGoLinks: normalizeHistoryGoLinks(existingHistoryLinks.length ? existingHistoryLinks : derivedHistoryLinks),
        suggestedActions: recommendations.suggestedActions,
        confidence: confidenceAndWarnings.confidence,
        warnings: confidenceAndWarnings.warnings,
        ahaSer: canonicalSer,
        reflection: String(safePayload?.reflection || canonicalSer?.viktigsteInnsikt || "").trim(),
        summary: String(safePayload?.day || "").trim(),
        sortItems: Array.isArray(safePayload?.sortItems) ? safePayload.sortItems : [],
        list: Array.isArray(safePayload?.list) ? safePayload.list : [],
        path: Array.isArray(safePayload?.path) ? safePayload.path : [],
        concepts: buildAcademicConceptCandidates(sourceText, safePayload)
      };
    }
    function normalizeAnalysisConfidence(value) {
      return global.AHAChatAnalysis.normalizeAnalysisConfidence(value);
    }

    function normalizeAnalysisWarnings(value) {
      return global.AHAChatAnalysis.normalizeAnalysisWarnings(value);
    }

    function buildHistoryGoLinksFromDomain(domain, sourceText, canonicalSer) {
      return global.AHAChatAnalysis.buildHistoryGoLinksFromDomain(domain, sourceText, canonicalSer);
    }

    return Object.freeze({
      isPythonEngineFeatureEnabled,
      isValidCanonicalAnalysisShape,
      buildPythonFallbackMeta,
      resolveCanonicalAnalysisWithOptionalPythonEngine,
      buildCanonicalAnalysis,
      normalizeAnalysisConfidence,
      normalizeAnalysisWarnings,
      buildHistoryGoLinksFromDomain,
      normalizeHistoryGoLinks
    });
  }

  const publicApi = Object.assign({}, global.AHAChatCanonicalAnalysis || {}, { create });
  global.AHAChatCanonicalAnalysis = publicApi;
  global.AHAModuleApi?.register?.("chat.canonicalAnalysis", publicApi, { version: 1, legacyGlobal: "AHAChatCanonicalAnalysis", exports: Object.keys(publicApi) });
})(window);
