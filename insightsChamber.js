// insightsChamber.js
// ─────────────────────────────────────────────
// AHA InsightsEngine – ren innsiktsmotor (ingen DOM)
// ─────────────────────────────────────────────
//
// Typer (mental modell):
//
// type Signal = {
//   id: string;
//   timestamp: string;
//   subject_id: string;
//   theme_id: string;
//   text: string;
// };
//
// type Insight = {
//   id: string;
//   subject_id: string;
//   theme_id: string;
//   title: string;
//   summary: string;
//   strength: { evidence_count: number; total_score: number };
//   first_seen: string;
//   last_updated: string;
//   semantic: { ... };
//   dimensions: string[]; // ["emosjon","tanke", ...]
// };
//
// type InsightChamber = { insights: Insight[] };
//
// type TopicStats = {
//   topic_id: string;
//   subject_id: string;
//   insight_saturation: number;
//   concept_density: number;
//   artifact_type: "kort" | "liste" | "sti" | "artikkel";
//   insight_count: number;
// };
// ─────────────────────────────────────────────

(function (global) {
  "use strict";

  // ── Utils ──────────────────────────────────

  function nowIso() {
    return new Date().toISOString();
  }

  function generateSignalId() {
    return "sig_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
  }

  function generateInsightId() {
    return "ins_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
  }

  function generateTitleFromText(text) {
    const words = text.split(/\s+/).filter(Boolean);
    const short = words.slice(0, 10).join(" ");
    return words.length > 10 ? short + " …" : short;
  }

  // ── Tekstlikhet (Jaccard) ───────────────────

  function textSimilarity(a, b) {
    const tokensA = new Set(
      a.toLowerCase().split(/\W+/).filter((t) => t.length > 2)
    );
    const tokensB = new Set(
      b.toLowerCase().split(/\W+/).filter((t) => t.length > 2)
    );
    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let intersection = 0;
    for (const t of tokensA) if (tokensB.has(t)) intersection++;
    const union = tokensA.size + tokensB.size - intersection;
    return intersection / union;
  }

  // ── Semantisk analyse ──────────────────────

  function analyzeSentenceSemantics(text) {
    const lower = text.toLowerCase();
    const containsAny = (list) => list.some((w) => lower.includes(w));

    // Intensitet
    let intensity = "middels";
    if (
      containsAny([
        "helt",
        "ekstremt",
        "kjempe",
        "totalt",
        "utrolig",
        "veldig"
      ])
    ) {
      intensity = "høy";
    } else if (containsAny(["litt", "noe", "ganske"])) {
      intensity = "lav";
    }

    // Frekvens
    let frequency = "ukjent";
    if (containsAny(["alltid", "hver gang", "hele tiden"])) {
      frequency = "alltid";
    } else if (containsAny(["ofte", "stadig", "som regel", "vanligvis"])) {
      frequency = "ofte";
    } else if (containsAny(["sjelden", "aldri", "nesten aldri"])) {
      frequency = "sjelden";
    }

    // Modalitet (krav/mulighet/hindring)
    let modality = "nøytral";
    if (containsAny(["må ", "måtte", "burde", "skulle"])) {
      modality = "krav";
    } else if (containsAny(["kan ", "har lyst", "vil ", "ønsker"])) {
      modality = "mulighet";
    }
    if (
      containsAny([
        "klarer ikke",
        "får ikke til",
        "får det ikke til",
        "får ikke lov"
      ])
    ) {
      modality = "hindring";
    }

    // Tid
    let timeRefs = [];
    if (
      containsAny(["nå", "for tiden", "i det siste", "hver dag"])
    ) {
      timeRefs.push("nå");
    }
    if (
      containsAny([
        "før",
        "tidligere",
        "da jeg var liten",
        "en gang",
        "før i tiden"
      ])
    ) {
      timeRefs.push("fortid");
    }
    if (
      containsAny([
        "skal",
        "kommer til",
        "neste gang",
        "fremover",
        "etterpå"
      ])
    ) {
      timeRefs.push("fremtid");
    }
    let time_ref = "blandet";
    if (timeRefs.length === 0) time_ref = "nå";
    else if (timeRefs.length === 1) time_ref = timeRefs[0];

    // Subjekt / ansvar
    let subject_type = "diffus";
    if (/\bjeg\b/.test(lower)) {
      subject_type = "jeg";
    } else if (
      /\bde\b|\bandre\b|\bfolk\b|\balle\b/.test(lower)
    ) {
      subject_type = "andre";
    }

    // Valens
    const positiveWords = [
      "godt",
      "bra",
      "lett",
      "digg",
      "gøy",
      "rolig",
      "fornøyd",
      "stolt",
      "trygg",
      "håpefull",
      "optimistisk"
    ];
    const negativeWords = [
      "vondt",
      "tungt",
      "stressa",
      "stresset",
      "urolig",
      "skam",
      "skamfull",
      "skyld",
      "redd",
      "engstelig",
      "bekymret",
      "lei meg",
      "trist",
      "sliten",
      "utmattet"
    ];

    let posCount = 0;
    let negCount = 0;
    positiveWords.forEach((w) => {
      if (lower.includes(w)) posCount++;
    });
    negativeWords.forEach((w) => {
      if (lower.includes(w)) negCount++;
    });

    let valence = "nøytral";
    if (posCount > negCount && posCount > 0) valence = "positiv";
    else if (negCount > posCount && negCount > 0) valence = "negativ";
    else if (posCount > 0 && negCount > 0) valence = "blandet";

    // Tempo
    let tempo = "ukjent";
    if (containsAny(["plutselig", "brått", "med en gang"])) {
      tempo = "plutselig";
    } else if (
      containsAny(["gradvis", "etter hvert", "litt etter litt"])
    ) {
      tempo = "gradvis";
    } else if (containsAny(["sakte", "roligere"])) {
      tempo = "sakte";
    }

    // Metaspråk / meta
    let meta = "ingen";
    if (
      containsAny([
        "egentlig",
        "faktisk",
        "tydeligvis",
        "visstnok",
        "på en måte"
      ])
    ) {
      meta = "meta";
    } else if (
      containsAny(["kanskje", "virker som", "føles som"])
    ) {
      meta = "usikker";
    }

    // Kontraster
    const has_contrast = containsAny([
      " men ",
      "men ",
      " samtidig",
      "likevel",
      "selv om",
      "på den ene siden",
      "på den andre siden"
    ]);

    // Absolutter
    const has_absolute = containsAny([
      "alltid",
      "aldri",
      "hver gang",
      "hele tiden",
      "ingen",
      "alle"
    ]);

    return {
      intensity,
      frequency,
      valence,
      modality,
      subject_type,
      time_ref,
      tempo,
      meta,
      has_contrast,
      has_absolute
    };
  }

  // ── Narrativ analyse (V1) ──────────────────
  // Forsøker å fange:
  // - aktør (jeg/vi/man/alle)
  // - normbrudd (snyte, ta mer enn kvoten, jukse osv.)
  // - begrunnelse/bagatellisering ("det har ikke så mye å si", "bare litt")
  // - systemeffekt ("når alle", "til slutt går det galt")
  // - moralsk tone (kritikk av egoisme, normbrudd osv.)
  function analyzeNarrative(text) {
    const lower = text.toLowerCase();
    const containsAny = (list) => list.some((w) => lower.includes(w));

    // Aktør
    let actor = null;
    if (/\bjeg\b/.test(lower)) actor = "jeg";
    else if (/\bvi\b/.test(lower)) actor = "vi";
    else if (/\bman\b/.test(lower)) actor = "man";
    else if (/\balle\b/.test(lower) || /\bfolk\b/.test(lower)) actor = "alle";
    else if (/\bde\b/.test(lower)) actor = "de";

    // Normbrudd – ting som peker på å bryte regler / ta mer enn egen del
    let norm_break = null;
    if (
      containsAny([
        "snyter på skatten",
        "snyte på skatten",
        "snyter",
        "snyte",
        "jukser",
        "jukse",
        "over kvoten",
        "mer enn kvoten",
        "ta mer enn",
        "tar mer enn",
        "skipper unna",
        "snike",
        "sniker meg unna",
        "bryter reglene"
      ])
    ) {
      norm_break = "normbrudd";
    }

    // Begrunnelse / bagatellisering
    let justification = null;
    if (
      containsAny([
        "har ikke så mye å si",
        "har ikke så mye og si",
        "det har ikke så mye å si",
        "det spiller ingen rolle",
        "spiller ingen rolle",
        "bare litt",
        "bare denne gangen",
        "alle gjør det",
        "alle gjør jo det",
        "hva gjør det vel"
      ])
    ) {
      justification = "bagatellisering";
    }

    // Systemeffekt – at det blir alvorlig når mange gjør det samme
    let systemic_effect = null;
    if (
      containsAny([
        "når alle tenker slikt",
        "når alle tenker sånn",
        "når alle gjør det",
        "hvis alle gjør det",
        "hvis alle tenker sånn",
        "hvis alle tenker slikt",
        "til slutt går det galt",
        "til slutt forsvinner",
        "systemet kollapser",
        "kollapser",
        "går tomt",
        "blir ødelagt"
      ])
    ) {
      systemic_effect = "systemeffekt";
    }

    // Moralsk tone – eksplisitt kritikk av egoisme / hensynsløshet
    let moral_tone = null;
    if (
      containsAny([
        "egoisme",
        "egoistisk",
        "hensynsløs",
        "usolidarisk",
        "urettferdig"
      ])
    ) {
      moral_tone = "kritisk";
    } else if (
      containsAny([
        "bør",
        "må",
        "riktig",
        "rettferdig",
        "ta hensyn",
        "vise hensyn"
      ])
    ) {
      moral_tone = "normativ";
    }

    return {
      actor,
      norm_break,
      justification,
      systemic_effect,
      moral_tone
    };
  }
  
  // ── Dimensjoner ────────────────────────────

  function analyzeDimensions(text) {
    const lower = text.toLowerCase();
    const containsAny = (list) => list.some((w) => lower.includes(w));
    const dims = new Set();

    // Emosjon
    if (
      containsAny([
        "redd",
        "engstelig",
        "bekymret",
        "stressa",
        "stresset",
        "urolig",
        "lei meg",
        "skam",
        "skamfull",
        "skyld",
        "flau",
        "trist",
        "glad",
        "fornøyd",
        "stolt",
        "urolig",
        "rolig"
      ])
    ) {
      dims.add("emosjon");
    }

    // Atferd
    if (
      containsAny([
        "utsetter",
        "rømmer",
        "prokrastinerer",
        "scroller",
        "ligger på sofaen",
        "ser på",
        "åpner",
        "lukker",
        "gjør ingenting",
        "overjobber",
        "jobber masse",
        "skriver",
        "ringer",
        "sletter",
        "ignorerer"
      ])
    ) {
      dims.add("atferd");
    }

    // Tanke
    if (
      containsAny([
        "tenker",
        "tror",
        "føles som",
        "virker som",
        "jeg sier til meg selv",
        "overtenker",
        "grubler",
        "forestiller meg",
        "bekymrer meg",
        "vurderer",
        "planlegger"
      ])
    ) {
      dims.add("tanke");
    }

    // Kropp
    if (
      containsAny([
        "i kroppen",
        "spenning",
        "spenninger",
        "stram",
        "hodepine",
        "smerte",
        "puste",
        "puster",
        "magesmerter",
        "klump i magen",
        "sliten",
        "utmattet",
        "kvalm",
        "svimmel",
        "hjertet banker"
      ])
    ) {
      dims.add("kropp");
    }

    // Relasjon
    if (
      containsAny([
        "andre",
        "de",
        "folk",
        "venner",
        "familie",
        "sjefen",
        "kollega",
        "partner",
        "kjæreste",
        "barn",
        "foreldre",
        "læreren",
        "klassen"
      ])
    ) {
      dims.add("relasjon");
    }

    // Hvis vi ikke finner noe, anta "tanke"
    if (dims.size === 0) {
      dims.add("tanke");
    }

    return Array.from(dims);
  }

  // ── Innsiktskammer / Insight-objekter ──────

  function createEmptyChamber() {
    return { insights: [] };
  }

  function createSignalFromMessage(messageText, subjectId, themeId) {
    return {
      id: generateSignalId(),
      timestamp: nowIso(),
      subject_id: subjectId,
      theme_id: themeId,
      text: messageText.trim()
    };
  }

    function createInsightFromSignal(signal) {
    const title = generateTitleFromText(signal.text);
    const semantic = analyzeSentenceSemantics(signal.text);
    const dimensions = analyzeDimensions(signal.text);
    const narrative = analyzeNarrative(signal.text); // ⬅ NY LINJE

    return {
      id: generateInsightId(),
      subject_id: signal.subject_id,
      theme_id: signal.theme_id,
      title,
      summary: signal.text,
      strength: {
        evidence_count: 1,
        total_score: 10
      },
      first_seen: signal.timestamp,
      last_updated: signal.timestamp,
      semantic,
      dimensions,
      narrative // ⬅ NY LINJE
    };
  }

  function getInsightsForTopic(chamber, subjectId, themeId) {
    return chamber.insights.filter(
      (ins) =>
        ins.subject_id === subjectId &&
        ins.theme_id === themeId
    );
  }

  function reinforceInsight(insight, signal) {
    insight.strength.evidence_count += 1;
    insight.last_updated = signal.timestamp;
    insight.strength.total_score = Math.min(
      100,
      insight.strength.evidence_count * 10
    );
  }

  function addSignalToChamber(chamber, signal) {
    const candidates = getInsightsForTopic(
      chamber,
      signal.subject_id,
      signal.theme_id
    );

    let best = null;
    let bestSim = 0;
    for (const ins of candidates) {
      const sim = textSimilarity(signal.text, ins.summary);
      if (sim > bestSim) {
        bestSim = sim;
        best = ins;
      }
    }

    const THRESHOLD = 0.5;
    if (best && bestSim >= THRESHOLD) {
      reinforceInsight(best, signal);
    } else {
      chamber.insights.push(createInsightFromSignal(signal));
    }

    return chamber;
  }

  // ── Tekst → setninger ──────────────────────

  function splitIntoSentences(text) {
    return text
      .split(/[.!?]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 15);
  }

  // ── TopicStats: metning + tetthet ──────────

  const STOPWORDS = new Set([
    "og",
    "i",
    "på",
    "som",
    "for",
    "med",
    "til",
    "det",
    "den",
    "de",
    "er",
    "en",
    "et",
    "å",
    "jeg",
    "du",
    "vi",
    "dere",
    "han",
    "hun",
    "oss",
    "av",
    "fra",
    "men",
    "om",
    "så"
  ]);

  function tokenize(text) {
    return text.toLowerCase().split(/\W+/).filter(Boolean);
  }

  function filterStopwords(tokens) {
    return tokens.filter(
      (t) => t.length > 2 && !STOPWORDS.has(t)
    );
  }

  function computeConceptDensity(insights) {
    const combined = insights
      .map((ins) => `${ins.title}. ${ins.summary}`)
      .join(" ");

    const tokens = filterStopwords(tokenize(combined));
    if (tokens.length === 0) return 0;

    const unique = new Set(tokens);
    const rawDensity = unique.size / tokens.length;
    const normalized = Math.max(
      0,
      Math.min(1, rawDensity / 0.25)
    );
    return Math.round(normalized * 100);
  }

  // smartere innsiktsmetning (V2)
  function computeInsightSaturation(insights) {
    const n = insights.length;
    if (n === 0) return 0;

    // base: antall innsikter
    let base = Math.min(10, n) * 7; // 0–70

    const dimsSeen = new Set();
    const timeSeen = new Set();
    const valenceSeen = new Set();

    insights.forEach((ins) => {
      (ins.dimensions || []).forEach((d) => dimsSeen.add(d));
      if (ins.semantic) {
        if (ins.semantic.time_ref)
          timeSeen.add(ins.semantic.time_ref);
        if (ins.semantic.valence)
          valenceSeen.add(ins.semantic.valence);
      }
    });

    const dimBonus = Math.min(dimsSeen.size, 5) * 4; // maks +20
    const timeBonus = Math.min(timeSeen.size, 3) * 3; // maks +9
    const valBonus = Math.min(valenceSeen.size, 4) * 1; // maks +4

    const total = base + dimBonus + timeBonus + valBonus;
    return Math.max(0, Math.min(100, total));
  }

  function decideArtifactType(saturation, density) {
    if (saturation < 30 && density < 30) return "kort";
    if (saturation >= 30 && saturation < 60 && density < 60)
      return "liste";
    if (saturation >= 30 && saturation < 60 && density >= 60)
      return "sti";
    if (saturation >= 60 && density >= 60) return "artikkel";
    if (saturation >= 60 && density < 60) return "sti";
    return "kort";
  }

  function computeTopicStats(chamber, subjectId, themeId) {
    const insights = getInsightsForTopic(
      chamber,
      subjectId,
      themeId
    );
    const saturation = computeInsightSaturation(insights);
    const density = computeConceptDensity(insights);
    const artifactType = decideArtifactType(
      saturation,
      density
    );

    return {
      topic_id: themeId,
      subject_id: subjectId,
      insight_saturation: saturation,
      concept_density: density,
      artifact_type: artifactType,
      insight_count: insights.length
    };
  }

  // ── Semantisk telling ──────────────────────

  function computeSemanticCounts(insights) {
    const counts = {
      frequency: { ukjent: 0, sjelden: 0, ofte: 0, alltid: 0 },
      valence: {
        negativ: 0,
        positiv: 0,
        blandet: 0,
        nøytral: 0
      },
      modality: {
        krav: 0,
        mulighet: 0,
        hindring: 0,
        nøytral: 0
      },
      time_ref: { nå: 0, fortid: 0, fremtid: 0, blandet: 0 },
      tempo: { ukjent: 0, plutselig: 0, gradvis: 0, sakte: 0 },
      meta: { ingen: 0, meta: 0, usikker: 0 },
      contrast_count: 0,
      absolute_count: 0
    };

    insights.forEach((ins) => {
      const sem = ins.semantic || {};

      if (
        sem.frequency &&
        counts.frequency[sem.frequency] !== undefined
      ) {
        counts.frequency[sem.frequency]++;
      } else {
        counts.frequency.ukjent++;
      }

      if (
        sem.valence &&
        counts.valence[sem.valence] !== undefined
      ) {
        counts.valence[sem.valence]++;
      } else {
        counts.valence.nøytral++;
      }

      if (
        sem.modality &&
        counts.modality[sem.modality] !== undefined
      ) {
        counts.modality[sem.modality]++;
      } else {
        counts.modality.nøytral++;
      }

      if (
        sem.time_ref &&
        counts.time_ref[sem.time_ref] !== undefined
      ) {
        counts.time_ref[sem.time_ref]++;
      } else {
        counts.time_ref.blandet++;
      }

      if (
        sem.tempo &&
        counts.tempo[sem.tempo] !== undefined
      ) {
        counts.tempo[sem.tempo]++;
      } else {
        counts.tempo.ukjent++;
      }

      if (sem.meta && counts.meta[sem.meta] !== undefined) {
        counts.meta[sem.meta]++;
      } else {
        counts.meta.ingen++;
      }

      if (sem.has_contrast) counts.contrast_count++;
      if (sem.has_absolute) counts.absolute_count++;
    });

    return counts;
  }

  // ── Dimensjons-sammendrag ──────────────────

  function computeDimensionsSummary(insights) {
    const counts = {
      emosjon: 0,
      atferd: 0,
      tanke: 0,
      kropp: 0,
      relasjon: 0
    };

    insights.forEach((ins) => {
      (ins.dimensions || []).forEach((d) => {
        if (counts[d] !== undefined) counts[d]++;
      });
    });

    return counts;
  }

  // ── Sti-steps ──────────────────────────────

  function createPathSteps(insights, maxSteps) {
    const limit = maxSteps || 5;
    if (insights.length === 0) {
      return ["Ingen innsikter å lage sti av ennå."];
    }

    const sorted = [...insights].sort((a, b) =>
      a.first_seen.localeCompare(b.first_seen)
    );

    const limited = sorted.slice(0, limit);

    return limited.map((ins, idx) => {
      return idx + 1 + ". " + ins.summary;
    });
  }

  // ── Syntese-tekst ──────────────────────────

  function createSynthesisText(insights, themeId) {
    if (insights.length === 0) {
      return "Ingen innsikter å lage syntese av ennå.";
    }
    const bullets = insights.map((ins) => "- " + ins.summary);
    const intro = "Syntese for temaet " + themeId + ":\n";
    const body = bullets.join("\n");
    return intro + body;
  }

  // ── Artikkelutkast ─────────────────────────

  function createArticleDraft(insights, stats, themeId) {
    if (insights.length === 0) {
      return "Ingen innsikter å lage artikkel av ennå.";
    }

    const intro =
      "Artikkelutkast for tema " +
      themeId +
      " (basert på " +
      stats.insight_count +
      " innsikter, metning " +
      stats.insight_saturation +
      "/100, begrepstetthet " +
      stats.concept_density +
      "/100):\n\n";

    const sorted = [...insights].sort(
      (a, b) => b.strength.total_score - a.strength.total_score
    );
    const limited = sorted.slice(0, 5);

    const body = limited
      .map((ins, idx) => idx + 1 + ") " + ins.summary)
      .join("\n");

    const outro =
      "\n\n→ Dette er et råutkast. AHA-agenten kan senere hjelpe deg å skrive det om til flytende tekst.";

    return intro + body + outro;
  }

  // ── Tema-oversikt ──────────────────────────

  function computeTopicsOverview(chamber) {
    const ins = chamber.insights;
    if (ins.length === 0) return [];

    const keys = new Set();
    ins.forEach((i) => {
      keys.add(i.subject_id + "||" + i.theme_id);
    });

    const result = [];
    keys.forEach((key) => {
      const [subjectId, themeId] = key.split("||");
      const stats = computeTopicStats(
        chamber,
        subjectId,
        themeId
      );
      result.push({
        subject_id: subjectId,
        topic_id: themeId,
        insight_count: stats.insight_count,
        insight_saturation: stats.insight_saturation,
        concept_density: stats.concept_density,
        artifact_type: stats.artifact_type
      });
    });

    return result;
  }

  // ── Narrativ analysemotor V1 ─────────────────

  function createNarrativeForTopic(chamber, subjectId, themeId) {
    const insights = getInsightsForTopic(chamber, subjectId, themeId);
    if (!insights || insights.length === 0) {
      return "Ingen narrativ innsikt ennå – skriv noen setninger først.";
    }

    const stats = computeTopicStats(chamber, subjectId, themeId);
    const sem = computeSemanticCounts(insights);
    const dims = computeDimensionsSummary(insights);
    const total = insights.length || 1;

    const lines = [];

    // 1) Åpning / hovedtema
    lines.push(`Narrativ innsikt for tema «${themeId}»:`);
    lines.push("");

    // Hovedfarge ut fra dimensjoner
    const dimLabels = [];
    if (dims.emosjon > 0) dimLabels.push("følelser");
    if (dims.atferd > 0) dimLabels.push("konkrete handlinger");
    if (dims.tanke > 0) dimLabels.push("tanker og tolkninger");
    if (dims.kropp > 0) dimLabels.push("kroppslige reaksjoner");
    if (dims.relasjon > 0) dimLabels.push("relasjoner til andre");

    if (dimLabels.length > 0) {
      lines.push(
        "Du beskriver dette temaet først og fremst gjennom " +
        dimLabels.join(", ") +
        "."
      );
    } else {
      lines.push(
        "Du beskriver dette temaet mest gjennom generelle tanker og observasjoner."
      );
    }

    // 2) Typisk mønster (frekvens + valens)
    const freqOfteAlltid = sem.frequency.ofte + sem.frequency.alltid;
    const neg = sem.valence.negativ;
    const pos = sem.valence.positiv;

    if (freqOfteAlltid > 0) {
      const andel = Math.round((freqOfteAlltid / total) * 100);
      lines.push(
        `${andel}% av innsiktene dine handler om noe som skjer «ofte» eller «alltid». ` +
        "Det tyder på at dette oppleves som et stabilt mønster hos deg."
      );
    } else {
      lines.push(
        "Det du beskriver høres mer ut som enkeltsituasjoner enn et veldig stabilt mønster."
      );
    }

    if (neg > 0 || pos > 0) {
      const andelNeg = Math.round((neg / total) * 100);
      const andelPos = Math.round((pos / total) * 100);

      if (neg > 0 && pos === 0) {
        lines.push(
          `${andelNeg}% av innsiktene har en tydelig negativ farge – stress, ubehag eller vanskelige følelser dominerer.`
        );
      } else if (pos > 0 && neg === 0) {
        lines.push(
          `${andelPos}% av innsiktene har en positiv farge – det er mye ressurs og mestring i dette temaet.`
        );
      } else {
        lines.push(
          `${andelNeg}% av innsiktene er preget av det som er vanskelig, ` +
          `mens ${andelPos}% peker mot noe som faktisk fungerer eller gir energi.`
        );
      }
    }

    // 3) Indre logikk: krav / hindring / meta / absolutter
    const krav = sem.modality.krav;
    const hindring = sem.modality.hindring;
    const meta = sem.meta.meta + sem.meta.usikker;
    const kontrast = sem.contrast_count;
    const absolutt = sem.absolute_count;

    if (krav + hindring > 0) {
      lines.push(
        "Språket ditt inneholder en del «må/burde/skal» eller «klarer ikke/får ikke til» – " +
        "det tyder på både indre krav og opplevelse av å stå fast."
      );
    }

    if (meta > 0) {
      lines.push(
        "Du bruker også metaspråk som «egentlig», «kanskje» eller «føles som», " +
        "som viser at du prøver å forstå mønsteret ditt litt utenfra."
      );
    }

    if (kontrast > 0 || absolutt > 0) {
      const biter = [];
      if (kontrast > 0) {
        biter.push("kontraster som «men», «samtidig» eller «likevel»");
      }
      if (absolutt > 0) {
        biter.push("absoluttspråk som «alltid», «aldri» eller «ingen»");
      }
      lines.push(
        "Motoren finner også " +
        biter.join(" og ") +
        ", som ofte henger sammen med sterke følelser og litt svart–hvitt-tenkning."
      );
    }

    // 4) Representativ situasjon (plukker én eller to setninger)
    let repNeg = null;
    let repPos = null;

    insights.forEach((ins) => {
      const sem = ins.semantic || {};
      if (!repNeg && (sem.valence === "negativ" || sem.valence === "blandet")) {
        repNeg = ins.summary;
      }
      if (!repPos && sem.valence === "positiv") {
        repPos = ins.summary;
      }
    });

    if (repNeg) {
      lines.push("");
      lines.push("Et eksempel på hvordan dette kan høres ut hos deg:");
      lines.push(`«${repNeg}»`);
    }

    if (repPos) {
      lines.push("");
      lines.push("Samtidig finnes det også spor av noe som fungerer bedre:");
      lines.push(`«${repPos}»`);
    }

    // 5) Retning / neste kapittel basert på stats
    lines.push("");
    lines.push(
      `Metningsgrad ${stats.insight_saturation}/100 og begrepstetthet ${stats.concept_density}/100 ` +
      `tilsier at dette temaet nå egner seg som «${stats.artifact_type}».`
    );

    if (stats.insight_saturation < 30) {
      lines.push(
        "Narrativt sett er du fortsatt i en utforskningsfase: du samler bruddstykker, " +
        "og neste steg er å beskrive flere konkrete situasjoner."
      );
    } else if (stats.insight_saturation < 60) {
      lines.push(
        "Narrativt sett begynner det å tegne seg et mønster. Neste steg er å samle trådene i en liten «sti» " +
        "eller liste over hvordan dette typisk starter, hva du gjør, og hva som skjer etterpå."
      );
    } else {
      lines.push(
        "Narrativt sett er dette et ganske modent tema hos deg. Du kunne skrevet en kort tekst eller artikkel " +
        "om hva du har lært her, og hvilke prinsipper du vil ta med deg videre."
      );
    }

    return lines.join("\n");
  }
  
  // ── Public API ─────────────────────────────

  const InsightsEngine = {
    // modeller
    createEmptyChamber,
    createSignalFromMessage,
    addSignalToChamber,
    splitIntoSentences,
    getInsightsForTopic,
    computeTopicStats,
    computeSemanticCounts,
    computeDimensionsSummary,
    createPathSteps,
    createSynthesisText,
    createArticleDraft,
    computeTopicsOverview,
    createNarrativeForTopic
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = InsightsEngine;
  } else {
    global.InsightsEngine = InsightsEngine;
  }
})(this);
