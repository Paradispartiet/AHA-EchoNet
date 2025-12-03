// ahaChat.js
// Kobler AHA InsightsEngine til en enkel chat-side

const SUBJECT_ID = "sub_laring";
const STORAGE_KEY = "aha_insight_chamber_v1";

// ── Lagring ──────────────────────────────────

function loadChamberFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return InsightsEngine.createEmptyChamber();
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Kunne ikke laste innsiktskammer, lager nytt.", e);
    return InsightsEngine.createEmptyChamber();
  }
}

function saveChamberToStorage(chamber) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chamber));
  } catch (e) {
    console.warn("Kunne ikke lagre innsiktskammer.", e);
  }
}

// ── UI helpers ───────────────────────────────

function getCurrentThemeId() {
  const input = document.getElementById("theme-id");
  const val = input && input.value.trim();
  return val || "th_default";
}

function getOutEl() {
  return document.getElementById("out");
}

function clearOutput() {
  const el = getOutEl();
  if (el) el.textContent = "";
}

function log(msg) {
  const el = getOutEl();
  if (!el) return;
  el.textContent += msg + "\n";
}

function getPanelEl() {
  return document.getElementById("panel");
}

function clearPanel() {
  const el = getPanelEl();
  if (el) el.innerHTML = "";
}

function renderDimChip(label, count) {
  if (!count) return "";
  return `<span class="dim-chip">${label} <span class="dim-chip-count">${count}</span></span>`;
}

// Hovedpanelet for ett tema
function renderTopicPanel(themeId, stats, sem, dims, insights) {
  const panel = getPanelEl();
  if (!panel) return;

  const phase = stats.user_phase || "ukjent";
  const phaseLabelMap = {
    utforskning: "Utforskning",
    mønster: "Mønster",
    press: "Press",
    fastlåst: "Fastlåst",
    integrasjon: "Integrasjon"
  };
  const phaseLabel = phaseLabelMap[phase] || phase;
  const phaseClass = "phase-pill phase-" + phase;

  const saturation = stats.insight_saturation || 0;
  const density = stats.concept_density || 0;
  const total = stats.insight_count || insights.length || 0;

  const freqOfteAlltid =
    (sem.frequency.ofte || 0) + (sem.frequency.alltid || 0);
  const freqPct = total
    ? Math.round((freqOfteAlltid / total) * 100)
    : 0;

  const neg = sem.valence.negativ || 0;
  const pos = sem.valence.positiv || 0;
  const negPct = total ? Math.round((neg / total) * 100) : 0;
  const posPct = total ? Math.round((pos / total) * 100) : 0;

  const krav = sem.modality.krav || 0;
  const hindring = sem.modality.hindring || 0;

  const topInsights = insights.slice(0, 3);

  panel.innerHTML = `
    <div class="insight-panel">
      <div class="insight-panel-header">
        <div class="insight-panel-title">
          Tema: <span class="theme-id">${themeId}</span>
        </div>
        <div class="${phaseClass}">${phaseLabel}</div>
      </div>

      <div class="panel-grid">
        <div class="panel-card">
          <div class="stat-label">Metningsgrad</div>
          <div class="stat-value">${saturation} / 100</div>
          <div class="bar">
            <div class="bar-fill" style="width:${saturation}%;"></div>
          </div>
          <div class="stat-sub">
            Innsikter: ${total} · Tetthet: ${density}/100
          </div>
          <div class="stat-sub">
            Foreslått form: ${stats.artifact_type}
          </div>
        </div>

        <div class="panel-card">
          <div class="stat-label">Frekvens & følelse</div>
          <div class="stat-sub">
            «Ofte/alltid»: ${freqOfteAlltid} (${freqPct}% av innsikter)
          </div>
          <div class="stat-sub">
            Negativ valens: ${neg} (${negPct}%)
          </div>
          <div class="stat-sub">
            Positiv valens: ${pos} (${posPct}%)
          </div>
          ${
            krav + hindring > 0
              ? `<div class="stat-sub">Krav/hindring-setninger: ${
                  krav + hindring
                }</div>`
              : ""
          }
        </div>
      </div>

      <div class="panel-card panel-card-full">
        <div class="stat-label">Dimensjoner</div>
        <div class="dim-chips">
          ${renderDimChip("Følelser", dims.emosjon)}
          ${renderDimChip("Tanker", dims.tanke)}
          ${renderDimChip("Atferd", dims.atferd)}
          ${renderDimChip("Kropp", dims.kropp)}
          ${renderDimChip("Relasjoner", dims.relasjon)}
        </div>
      </div>

      ${
        topInsights.length
          ? `
      <div class="panel-card panel-card-full">
        <div class="stat-label">Toppinnsikter</div>
        <ul class="insight-list">
          ${topInsights
            .map(
              (ins, idx) => `
            <li>
              <div class="insight-title">${idx + 1}. ${
                ins.title
              }</div>
              ${
                ins.summary
                  ? `<div class="insight-meta">${ins.summary}</div>`
                  : ""
              }
            </li>`
            )
            .join("")}
        </ul>
      </div>`
          : ""
      }
    </div>
  `;
}

// ── AHA operations (bruker motoren) ──────────

function handleUserMessage(messageText) {
  const sentences = InsightsEngine.splitIntoSentences(messageText);
  const themeId = getCurrentThemeId();

  let chamber = loadChamberFromStorage();

  if (sentences.length === 0) {
    const signal = InsightsEngine.createSignalFromMessage(
      messageText,
      SUBJECT_ID,
      themeId
    );
    chamber = InsightsEngine.addSignalToChamber(chamber, signal);
    saveChamberToStorage(chamber);
    return 1;
  }

  sentences.forEach((sentence) => {
    const signal = InsightsEngine.createSignalFromMessage(
      sentence,
      SUBJECT_ID,
      themeId
    );
    chamber = InsightsEngine.addSignalToChamber(chamber, signal);
  });

  saveChamberToStorage(chamber);
  return sentences.length;
}

function buildTopicSummary(chamber, themeId) {
  const insights = InsightsEngine.getInsightsForTopic(
    chamber,
    SUBJECT_ID,
    themeId
  );

  if (insights.length === 0) {
    return "Ingen innsikter å oppsummere ennå.";
  }

  const stats = InsightsEngine.computeTopicStats(
    chamber,
    SUBJECT_ID,
    themeId
  );
  const sem = InsightsEngine.computeSemanticCounts(insights);
  const dims = InsightsEngine.computeDimensionsSummary(insights);

  const total = insights.length || 1;

  const lines = [];

  // 1) Overordnet status
  lines.push(
    `Dette temaet har ${stats.insight_count} innsikt(er) ` +
      `(metningsgrad ${stats.insight_saturation}/100, begrepstetthet ${stats.concept_density}/100).`
  );
  lines.push(
    `Motoren mener dette egner seg best som: ${stats.artifact_type}.`
  );

  // 2) Frekvens / hvor ofte skjer det
  const freqOfteAlltid = sem.frequency.ofte + sem.frequency.alltid;
  if (freqOfteAlltid > 0) {
    const andel = Math.round((freqOfteAlltid / total) * 100);
    lines.push(
      `${andel}% av innsiktene beskriver noe som skjer «ofte» eller «alltid» – altså et ganske stabilt mønster.`
    );
  }

  // 3) Valens / emosjonell farge
  const neg = sem.valence.negativ;
  const pos = sem.valence.positiv;
  if (neg > 0 || pos > 0) {
    const andelNeg = Math.round((neg / total) * 100);
    const andelPos = Math.round((pos / total) * 100);

    if (neg > 0 && pos === 0) {
      lines.push(
        `${andelNeg}% av innsiktene har negativ valens (stress, ubehag, vanskelige følelser).`
      );
    } else if (pos > 0 && neg === 0) {
      lines.push(
        `${andelPos}% av innsiktene har positiv valens – det er en del ressurser og lyspunkter her.`
      );
    } else {
      lines.push(
        `${andelNeg}% av innsiktene er negative og ${andelPos}% er positive – temaet rommer både vanskelige ting og ressurser.`
      );
    }
  }

  // 4) Krav / hindring
  const krav = sem.modality.krav;
  const hindring = sem.modality.hindring;
  if (krav + hindring > 0) {
    lines.push(
      `Mange setninger inneholder enten «må/burde/skal» eller «klarer ikke/får ikke til», ` +
        `som tyder på både indre krav og opplevd hindring i dette temaet.`
    );
  }

  // 5) Dimensjoner: hva handler det mest om?
  const dimLabels = [];
  if (dims.emosjon > 0) dimLabels.push("følelser (emosjon)");
  if (dims.atferd > 0) dimLabels.push("konkret atferd/handling");
  if (dims.tanke > 0) dimLabels.push("tanker og tolkninger");
  if (dims.kropp > 0) dimLabels.push("kroppslige reaksjoner");
  if (dims.relasjon > 0) dimLabels.push("relasjoner til andre");

  if (dimLabels.length > 0) {
    lines.push(
      "Innsiktene handler særlig om: " + dimLabels.join(", ") + "."
    );
  }

  // 6) Konklusjon / meta-insikt
  if (freqOfteAlltid > 0 && neg > 0) {
    lines.push(
      "Samlet sett beskriver du et mønster som både skjer ofte og oppleves som krevende – " +
        "altså et område hvor det kan være mye å hente på å utforske videre."
    );
  } else if (freqOfteAlltid > 0 && pos > 0 && neg === 0) {
    lines.push(
      "Samlet sett ser dette ut som et område der du har flere gode spor som gjentar seg ofte."
    );
  }

  return lines.join("\n");
}

function showNarrativeForCurrentTopic() {
  const chamber = loadChamberFromStorage();
  const themeId = getCurrentThemeId();
  clearOutput();

  const txt = InsightsEngine.createNarrativeForTopic(
    chamber,
    SUBJECT_ID,
    themeId
  );
  log(txt);
}

function showInsightsForCurrentTopic() {
  const chamber = loadChamberFromStorage();
  const themeId = getCurrentThemeId();
  const insights = InsightsEngine.getInsightsForTopic(
    chamber,
    SUBJECT_ID,
    themeId
  );

  clearOutput();
  clearPanel();

  if (insights.length === 0) {
    log("Ingen innsikter ennå for tema: " + themeId);
    return;
  }

  const stats = InsightsEngine.computeTopicStats(
    chamber,
    SUBJECT_ID,
    themeId
  );
  const sem = InsightsEngine.computeSemanticCounts(insights);
  const dims = InsightsEngine.computeDimensionsSummary(insights);

  // 1) Vis pent panel
  renderTopicPanel(themeId, stats, sem, dims, insights);

  // 2) Behold enkel tekstliste + meta-sammendrag i loggen som "debug"
  log("Innsikter for temaet: " + themeId);
  insights.forEach((ins, idx) => {
    const semLocal = ins.semantic || {};
    log(
      (idx + 1) +
        ". " +
        ins.title +
        " (score: " +
        ins.strength.total_score +
        ", freq: " +
        (semLocal.frequency || "ukjent") +
        ", valens: " +
        (semLocal.valence || "nøytral") +
        ")"
    );
  });

  log("");
  log("── Meta-sammendrag for temaet ──");
  const summary = buildTopicSummary(chamber, themeId);
  log(summary);
}

function showTopicStatus() {
  const chamber = loadChamberFromStorage();
  const themeId = getCurrentThemeId();
  const stats = InsightsEngine.computeTopicStats(
    chamber,
    SUBJECT_ID,
    themeId
  );

  clearOutput();
  log("Status for tema " + themeId + ":");
  log("- Innsikter: " + stats.insight_count);
  log("- Innsiktsmetningsgrad: " + stats.insight_saturation + "/100");
  log("- Begrepstetthet: " + stats.concept_density + "/100");
  if (stats.user_phase) {
    log("- Fase (lesning av prosess): " + stats.user_phase);
  }
  log("→ Foreslått form: " + stats.artifact_type);
}

function showSynthesisForCurrentTopic() {
  const chamber = loadChamberFromStorage();
  const themeId = getCurrentThemeId();
  const insights = InsightsEngine.getInsightsForTopic(
    chamber,
    SUBJECT_ID,
    themeId
  );
  const txt = InsightsEngine.createSynthesisText(
    insights,
    themeId
  );
  clearOutput();
  log(txt);
}

function showPathForCurrentTopic() {
  const chamber = loadChamberFromStorage();
  const themeId = getCurrentThemeId();
  const insights = InsightsEngine.getInsightsForTopic(
    chamber,
    SUBJECT_ID,
    themeId
  );

  const steps = InsightsEngine.createPathSteps(insights, 5);
  clearOutput();
  log("Foreslått sti for temaet " + themeId + ":");
  steps.forEach((s) => log(s));
}

function showSemanticSummaryForCurrentTopic() {
  const chamber = loadChamberFromStorage();
  const themeId = getCurrentThemeId();
  const insights = InsightsEngine.getInsightsForTopic(
    chamber,
    SUBJECT_ID,
    themeId
  );

  clearOutput();

  if (insights.length === 0) {
    log("Ingen innsikter å oppsummere ennå for tema: " + themeId);
    return;
  }

  const counts = InsightsEngine.computeSemanticCounts(insights);

  log("Semantisk sammendrag for tema " + themeId + ":");

  log("• Frekvens:");
  Object.entries(counts.frequency).forEach(([k, v]) => {
    if (v > 0) log("  - " + k + ": " + v);
  });

  log("• Valens:");
  Object.entries(counts.valence).forEach(([k, v]) => {
    if (v > 0) log("  - " + k + ": " + v);
  });

  log("• Modalitet:");
  Object.entries(counts.modality).forEach(([k, v]) => {
    if (v > 0) log("  - " + k + ": " + v);
  });

  log("• Tid:");
  Object.entries(counts.time_ref).forEach(([k, v]) => {
    if (v > 0) log("  - " + k + ": " + v);
  });

  log("• Tempo:");
  Object.entries(counts.tempo).forEach(([k, v]) => {
    if (v > 0) log("  - " + k + ": " + v);
  });

  log("• Metaspråk:");
  Object.entries(counts.meta).forEach(([k, v]) => {
    if (v > 0) log("  - " + k + ": " + v);
  });

  log("• Kontraster/absolutter:");
  log("  - Setninger med kontrastord: " + counts.contrast_count);
  log("  - Setninger med absolutter: " + counts.absolute_count);
}

function showAutoArtifactForCurrentTopic() {
  const chamber = loadChamberFromStorage();
  const themeId = getCurrentThemeId();
  const insights = InsightsEngine.getInsightsForTopic(
    chamber,
    SUBJECT_ID,
    themeId
  );
  const stats = InsightsEngine.computeTopicStats(
    chamber,
    SUBJECT_ID,
    themeId
  );

  clearOutput();

  if (insights.length === 0) {
    log("Ingen innsikter ennå – ingen artefakt å vise for tema: " + themeId);
    return;
  }

  log("Auto-artefakt for tema " + themeId + ":");
  log("Form (basert på stats): " + stats.artifact_type);
  log("");

  if (stats.artifact_type === "kort") {
    const first = insights[0];
    log("Viser ett enkelt innsiktskort:");
    log("- " + first.summary);
  } else if (stats.artifact_type === "liste") {
    log("Liste over innsikter:");
    insights.forEach((ins, idx) => {
      log(idx + 1 + ". " + ins.title);
    });
  } else if (stats.artifact_type === "sti") {
    log("Sti-beskrivelse:");
    const steps = InsightsEngine.createPathSteps(insights, 5);
    steps.forEach((s) => log(s));
  } else if (stats.artifact_type === "artikkel") {
    const draft = InsightsEngine.createArticleDraft(
      insights,
      stats,
      themeId
    );
    log(draft);
  } else {
    log("Ukjent artefakt-type, viser liste som fallback:");
    insights.forEach((ins, idx) => {
      log(idx + 1 + ". " + ins.title);
    });
  }
}

// ── AHA-agent – samme logikk, bare med motor ─

function suggestNextActionForCurrentTopic() {
  const chamber = loadChamberFromStorage();
  const themeId = getCurrentThemeId();
  const insights = InsightsEngine.getInsightsForTopic(
    chamber,
    SUBJECT_ID,
    themeId
  );

  clearOutput();

  if (insights.length === 0) {
    log(
      "AHA-agent: Du har ingen innsikter i dette temaet ennå (" +
        themeId +
        ")."
    );
    log("Skriv noen tanker først, så kan jeg foreslå neste steg.");
    return;
  }

  const stats = InsightsEngine.computeTopicStats(
    chamber,
    SUBJECT_ID,
    themeId
  );
  const counts = InsightsEngine.computeSemanticCounts(insights);

  const total = insights.length || 1;
  const freqAlltid = counts.frequency.alltid;
  const freqOfte = counts.frequency.ofte;
  const neg = counts.valence.negativ;
  const krav = counts.modality.krav;
  const hindring = counts.modality.hindring;

  log("AHA-agent – forslag for tema " + themeId + ":");
  log("");

  // 1) Beskrivelse
  log("1) Slik jeg leser innsiktskammeret ditt nå:");
  log(
    "- Du har " +
      stats.insight_count +
      " innsikter i dette temaet " +
      "(metningsgrad " +
      stats.insight_saturation +
      "/100, " +
      "begrepstetthet " +
      stats.concept_density +
      "/100)."
  );

  if (freqAlltid + freqOfte > 0) {
    const andel = Math.round(
      ((freqAlltid + freqOfte) / total) * 100
    );
    log(
      "- " +
        andel +
        "% av innsiktene beskriver noe som skjer «ofte» eller «alltid»."
    );
  }

  if (neg > 0) {
    const andelNeg = Math.round((neg / total) * 100);
    log(
      "- " +
        andelNeg +
        "% av innsiktene har negativ valens (stress, ubehag, vanskelige følelser)."
    );
  }

  if (krav + hindring > 0) {
    log(
      "- Flere setninger inneholder «må/burde/skal» eller «klarer ikke/får ikke til» – altså både krav og hindring."
    );
  }

  log("");

  // 2) Hovedmodus
  log("2) Hva motoren mener er neste naturlige steg:");

  if (stats.insight_saturation < 30) {
    log(
      "- Du er fortsatt i utforskningsfasen. Neste steg er å beskrive mønsteret enda litt mer: " +
        "hvordan kjennes det ut i kroppen, hva gjør du konkret, og hva skjer etterpå?"
    );
  } else if (
    stats.insight_saturation >= 30 &&
    stats.insight_saturation < 60
  ) {
    if (neg > 0 && (freqAlltid + freqOfte) > 0) {
      log(
        "- Du har nok innsikt til å lage en liten sti. Et naturlig neste steg er å velge ÉN situasjon " +
          "der dette skjer ofte, og definere et lite eksperiment du kan teste neste uke."
      );
    } else {
      log(
        "- Det er nok innsikt til å samle dette i en konkret liste eller sti. " +
          "Neste steg er å formulere 3–5 setninger som beskriver mønsteret ditt fra start til slutt."
      );
    }
  } else {
    if (stats.concept_density >= 60) {
      log(
        "- Temaet er ganske mettet og begrepstett. Neste steg er egentlig å skrive dette ut som en kort tekst " +
          "eller artikkel: Hva har du lært om deg selv her, og hvilke prinsipper tar du med deg videre?"
      );
    } else {
      log(
        "- Du har mange innsikter, men språket er fortsatt ganske hverdagslig. " +
          "Neste steg er å prøve å samle det til 3–4 nøkkelbegreper eller overskrifter som beskriver det viktigste."
      );
    }
  }

  log("");

  // 3) Mikro-handlinger
  log("3) Konkrete mikro-forslag du kan teste:");
  log(
    "- Skriv én setning som starter med «Når dette skjer, pleier jeg…»."
  );
  log(
    "- Skriv én setning som starter med «Et lite eksperiment jeg kunne testet er…»."
  );
  log(
    "- Skriv én setning som starter med «Hvis dette faktisk fungerte bedre, ville livet mitt blitt litt mer…»."
  );
}

// ── Dimensjoner ──────────────────────────────

function showDimensionSummaryForCurrentTopic() {
  const chamber = loadChamberFromStorage();
  const themeId = getCurrentThemeId();
  const insights = InsightsEngine.getInsightsForTopic(
    chamber,
    SUBJECT_ID,
    themeId
  );

  clearOutput();

  if (insights.length === 0) {
    log(
      "Ingen innsikter å analysere dimensjoner av ennå for tema: " +
        themeId
    );
    return;
  }

  const counts =
    InsightsEngine.computeDimensionsSummary(insights);

  log("Dimensjonsfordeling for tema " + themeId + ":");
  Object.entries(counts).forEach(([dim, v]) => {
    if (v > 0) log("- " + dim + ": " + v + " innsikt(er)");
  });
}

// ── Dialektikk (teser/kontrateser/syntese) ───

function showDialecticViewForCurrentTopic() {
  const chamber = loadChamberFromStorage();
  const themeId = getCurrentThemeId();
  const insights = InsightsEngine.getInsightsForTopic(
    chamber,
    SUBJECT_ID,
    themeId
  );

  clearOutput();

  if (insights.length === 0) {
    log(
      "Ingen innsikter å lage dialektikk av ennå for tema: " +
        themeId
    );
    return;
  }

  // Teser: negative/blandet + ofte/alltid
  const theses = insights.filter((ins) => {
    const sem = ins.semantic || {};
    return (
      (sem.valence === "negativ" ||
        sem.valence === "blandet") &&
      (sem.frequency === "ofte" ||
        sem.frequency === "alltid")
    );
  });

  // Kontrateser: positive/nøytrale + ofte/alltid
  const antitheses = insights.filter((ins) => {
    const sem = ins.semantic || {};
    return (
      (sem.valence === "positiv" ||
        sem.valence === "nøytral") &&
      (sem.frequency === "ofte" ||
        sem.frequency === "alltid")
    );
  });

  log("Dialektisk visning for tema " + themeId + ":");
  log("");

  log(
    "1) Teser (det som oppleves problematisk og skjer ofte/alltid):"
  );
  if (theses.length === 0) {
    log("- Ingen tydelige teser funnet.");
  } else {
    theses.slice(0, 5).forEach((ins, idx) => {
      log("  " + (idx + 1) + ". " + ins.summary);
    });
  }
  log("");

  log(
    "2) Kontrateser (ressurser / lyspunkter som også skjer ofte/alltid):"
  );
  if (antitheses.length === 0) {
    log("- Ingen tydelige kontrateser funnet.");
  } else {
    antitheses.slice(0, 5).forEach((ins, idx) => {
      log("  " + (idx + 1) + ". " + ins.summary);
    });
  }
  log("");

  log("3) Syntese (V1 – enkel tekst):");
  if (theses.length === 0 && antitheses.length === 0) {
    log(
      "- Motoren ser ikke noen sterke motsetninger ennå. Neste steg er å utforske både det vanskelige " +
        "og det som faktisk fungerer litt, slik at det blir noe å lage syntese av."
    );
  } else if (theses.length > 0 && antitheses.length === 0) {
    log(
      "- Foreløpig er bildet mest preget av det som er vanskelig. Syntesen nå er: «Dette er et tema der " +
        "det negative dominerer. Neste steg er å lete etter små unntak eller situasjoner der det går litt bedre, " +
        "for å ha noe å bygge videre på.»"
    );
  } else if (theses.length === 0 && antitheses.length > 0) {
    log(
      "- Her ser det ut som du allerede har en del ressurser og lyspunkter. Syntesen nå er: «Dette temaet " +
        "rommer flere gode erfaringer. Neste steg er å undersøke om det fortsatt finnes noe som skurrer, " +
        "eller om du faktisk kan begynne å bygge videre på det positive.»"
    );
  } else {
    log(
      "- Motoren ser både tydelige vanskeligheter og tydelige ressurser. En enkel syntese er: «Dette er et " +
        "område hvor du både sliter og samtidig har noen gode spor. Neste steg er å undersøke hvordan du kan " +
        "ta med deg det som fungerer inn i situasjonene som er vanskeligst.»"
    );
  }
}

// ── Tema-oversikt & eksport ──────────────────

function showAllTopicsOverview() {
  const chamber = loadChamberFromStorage();
  const overview = InsightsEngine.computeTopicsOverview(
    chamber
  );

  clearOutput();

  if (overview.length === 0) {
    log("Ingen innsikter lagret ennå – ingen tema å vise.");
    return;
  }

  log("Oversikt over temaer i innsiktskammeret:");
  overview.forEach((t) => {
    log(
      "- " +
        t.topic_id +
        " (" +
        t.subject_id +
        "): " +
        t.insight_count +
        " innsikter, metning " +
        t.insight_saturation +
        "/100, tetthet " +
        t.concept_density +
        "/100 → form: " +
        t.artifact_type
    );
  });
}

function exportChamberJson() {
  const chamber = loadChamberFromStorage();
  clearOutput();
  log("Eksport av innsiktskammer (JSON):");
  log(JSON.stringify(chamber, null, 2));
}

// ── Meta-motor: global brukerprofil ──────────

function showMetaProfileForUser() {
  const chamber = loadChamberFromStorage();

  clearOutput();

  if (typeof MetaInsightsEngine === "undefined") {
    log("MetaInsightsEngine er ikke lastet. Sjekk at metaInsightsEngine.js er inkludert i index.html.");
    return;
  }

  const profile = MetaInsightsEngine.buildUserMetaProfile(
    chamber,
    SUBJECT_ID
  );

  if (!profile) {
    log("Ingen meta-profil tilgjengelig ennå.");
    return;
  }

  log("META-PROFIL for " + SUBJECT_ID + ":\n");

  // Globalt bilde
  const g = profile.global;
  log("GLOBALT BILDE:");
  log(
    "- Gjennomsnittlig metning på tvers av tema: " +
      Math.round(g.avg_saturation) +
      " / 100"
  );
  log(
    "- Press-indeks (krav+hindring vs mulighet): " +
      g.pressure_index.toFixed(2)
  );
  log(
    "- Negativitetsindeks (andel negativ valens): " +
      g.negativity_index.toFixed(2)
  );
  log(
    "- Antall fastlåste tema: " +
      g.stuck_topics +
      ", integrasjons-tema: " +
      g.integration_topics
  );

  // Mønstre på tvers
  if (profile.patterns && profile.patterns.length > 0) {
    log("\nMØNSTRE PÅ TVERS AV TEMA:");
    profile.patterns.forEach((p) => {
      log(
        "• " +
          p.description +
          " (tema: " +
          p.themes.join(", ") +
          ")"
      );
    });
  } else {
    log("\nIngen tydelige kryss-tema-mønstre oppdaget ennå.");
  }

  // Litt temaoversikt m/fase
  if (profile.topics && profile.topics.length > 0) {
    log("\nTEMAER I PROFILEN:");
    profile.topics.forEach((t) => {
      log(
        "- " +
          t.theme_id +
          ": " +
          t.stats.insight_count +
          " innsikter, metning " +
          t.stats.insight_saturation +
          "/100, fase: " +
          (t.stats.user_phase || "ukjent")
      );
    });
  }

  // (Hvis du vil debugge alt, kan du åpne JSON også:)
  // log("\nRÅPROFIL (JSON):");
  // log(JSON.stringify(profile, null, 2));
}

// ── Setup ────────────────────────────────────

function setupUI() {
  const txt = document.getElementById("msg");
  const btnSend = document.getElementById("btn-send");
  const btnInsights = document.getElementById("btn-insights");
  const btnStatus = document.getElementById("btn-status");
  const btnSynth = document.getElementById("btn-synth");
  const btnPath = document.getElementById("btn-path");
  const btnSem = document.getElementById("btn-sem");
  const btnAuto = document.getElementById("btn-auto");
  const btnAgent = document.getElementById("btn-agent");
  const btnDim = document.getElementById("btn-dim");
  const btnDial = document.getElementById("btn-dial");
  const btnTopics = document.getElementById("btn-topics");
  const btnExport = document.getElementById("btn-export");
  const btnReset = document.getElementById("btn-reset");
  const btnNarr = document.getElementById("btn-narrative");
  const btnMeta = document.getElementById("btn-meta");

  btnSend.addEventListener("click", () => {
    const val = (txt.value || "").trim();
    if (!val) {
      alert("Skriv noe først 😊");
      return;
    }
    const n = handleUserMessage(val);
    log(
      "Melding lagt til i temaet «" +
        getCurrentThemeId() +
        "». (" +
        n +
        " setning(er) analysert)"
    );
    txt.value = "";
  });

  btnInsights.addEventListener("click", showInsightsForCurrentTopic);
  btnStatus.addEventListener("click", showTopicStatus);
  btnSynth.addEventListener("click", showSynthesisForCurrentTopic);
  btnPath.addEventListener("click", showPathForCurrentTopic);
  btnSem.addEventListener("click", showSemanticSummaryForCurrentTopic);
  btnAuto.addEventListener("click", showAutoArtifactForCurrentTopic);
  btnAgent.addEventListener("click", suggestNextActionForCurrentTopic);
  btnDim.addEventListener("click", showDimensionSummaryForCurrentTopic);
  btnDial.addEventListener("click", showDialecticViewForCurrentTopic);
  btnTopics.addEventListener("click", showAllTopicsOverview);
  btnExport.addEventListener("click", exportChamberJson);
  btnNarr.addEventListener("click", showNarrativeForCurrentTopic);
  if (btnMeta) {
    btnMeta.addEventListener("click", showMetaProfileForUser);
  }

  btnReset.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    clearOutput();
    log("Innsiktskammer nullstilt (alle tema slettet).");
  });

  clearOutput();
  log(
    "AHA Chat – Innsiktsmotor V1 + Metamotor klar. Velg tema-id, skriv en tanke og trykk «Send»."
  );
}

document.addEventListener("DOMContentLoaded", setupUI);
