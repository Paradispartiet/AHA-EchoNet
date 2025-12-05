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


function refreshThemePicker() {
  const select = document.getElementById("theme-picker");
  if (!select) return;

  const chamber = loadChamberFromStorage();
  const overview = InsightsEngine.computeTopicsOverview(chamber);

  // Tøm gammel liste
  select.innerHTML = "";

  // Default-valg
  const optDefault = document.createElement("option");
  optDefault.value = "";
  optDefault.textContent = overview.length
    ? "(velg tema …)"
    : "(ingen tema ennå)";
  select.appendChild(optDefault);

  // Fyll inn alle tema
  overview.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.topic_id; // = theme_id
    opt.textContent =
      t.topic_id + " (" + t.insight_count + " innsikter)";
    select.appendChild(opt);
  });
}

// ─ UI helpers ───────────────────────────────

// Pek på tema-scrollen (select#theme-picker i index.html)
const themePicker = document.getElementById("theme-picker");

// Hent gjeldende tema-id:
// 1) fra scrollen hvis noe er valgt
// 2) hvis ikke, fra tekstfeltet #theme-id (fallback)
// 3) ellers "th_default"
function getCurrentThemeId() {
  if (themePicker && themePicker.value) {
    return themePicker.value;
  }

  const input = document.getElementById("theme-id");
  const val = input && input.value.trim();
  return val || "th_default";
}

// Fyll scrollen med alle temaer som faktisk finnes i kammeret
function refreshThemePicker() {
  if (!themePicker) return;

  const chamber = loadChamberFromStorage();
  const overview =
    InsightsEngine.computeTopicsOverview(chamber) || [];

  // husk hva som er valgt nå (hvis noe)
  const current = themePicker.value;

  // nullstill
  themePicker.innerHTML = "";

  if (!overview.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(ingen tema ennå)";
    themePicker.appendChild(opt);
    return;
  }

  overview.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.topic_id;
    opt.textContent = `${t.topic_id} (${t.insight_count})`;
    themePicker.appendChild(opt);
  });

  // prøv å beholde tidligere valg
  if (current) {
    const stillExists = overview.some(
      (t) => t.topic_id === current
    );
    if (stillExists) {
      themePicker.value = current;
    }
  }

  // hvis ingenting valgt, velg første
  if (!themePicker.value && overview.length > 0) {
    themePicker.value = overview[0].topic_id;
  }
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

// ── Panel-hjelpere ──────────────────────────

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

// Visuelt panel for ett tema (brukes av "Vis innsikter")
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

// Panel for "Tema-status"
function renderStatusPanel(themeId, stats) {
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

  panel.innerHTML = `
    <div class="insight-panel">
      <div class="insight-panel-header">
        <div class="insight-panel-title">
          Status for tema: <span class="theme-id">${themeId}</span>
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
            Innsikter: ${stats.insight_count}
          </div>
        </div>

        <div class="panel-card">
          <div class="stat-label">Begrepstetthet</div>
          <div class="stat-value">${density} / 100</div>
          <div class="bar">
            <div class="bar-fill" style="width:${density}%;"></div>
          </div>
          <div class="stat-sub">
            Foreslått form: ${stats.artifact_type}
          </div>
        </div>
      </div>
    </div>
  `;
}

// Panel for Meta-profil (globalt bilde)
function renderMetaPanel(profile) {
  const panel = getPanelEl();
  if (!panel) return;

  const g = profile.global || {
    avg_saturation: 0,
    pressure_index: 0,
    negativity_index: 0,
    stuck_topics: 0,
    integration_topics: 0
  };

  const avgSat = Math.round(g.avg_saturation || 0);
  const press = g.pressure_index || 0;
  const negIdx = g.negativity_index || 0;

  const phases = g.phases || {};

  const topicsHtml =
    profile.topics && profile.topics.length
      ? profile.topics
          .map((t) => {
            const phase = t.stats.user_phase || "ukjent";
            const phaseClass = "phase-pill phase-" + phase;
            return `
          <li>
            <div class="insight-title">${t.theme_id}</div>
            <div class="insight-meta">
              Innsikter: ${t.stats.insight_count},
              metning: ${t.stats.insight_saturation}/100,
              tetthet: ${t.stats.concept_density}/100
            </div>
            <div class="${phaseClass}" style="margin-top:4px; display:inline-block;">
              ${phase}
            </div>
          </li>
        `;
          })
          .join("")
      : "<li>Ingen tema ennå.</li>";

  const patternsHtml =
    profile.patterns && profile.patterns.length
      ? profile.patterns
          .map(
            (p) => `
        <li>
          <div class="insight-title">${p.description}</div>
          <div class="insight-meta">Tema: ${p.themes.join(", ")}</div>
        </li>
      `
          )
          .join("")
      : "<li>Ingen tydelige kryss-tema-mønstre ennå.</li>";

  panel.innerHTML = `
    <div class="insight-panel">
      <div class="insight-panel-header">
        <div class="insight-panel-title">
          Meta-profil for <span class="theme-id">${profile.subject_id}</span>
        </div>
      </div>

      <div class="panel-grid">
        <div class="panel-card">
          <div class="stat-label">Metning (globalt)</div>
          <div class="stat-value">${avgSat} / 100</div>
          <div class="bar">
            <div class="bar-fill" style="width:${avgSat}%;"></div>
          </div>
          <div class="stat-sub">
            Fastlåste tema: ${g.stuck_topics || 0},
            integrasjons-tema: ${g.integration_topics || 0}
          </div>
        </div>

        <div class="panel-card">
          <div class="stat-label">Trykk & stemning</div>
          <div class="stat-sub">
            Press-indeks (krav/hindring vs mulighet): ${press.toFixed(2)}
          </div>
          <div class="stat-sub">
            Negativitetsindeks (andel negativ valens): ${negIdx.toFixed(2)}
          </div>
          <div class="stat-sub" style="margin-top:4px;">
            Faser:
            utforskning: ${phases.utforskning || 0},
            mønster: ${phases.mønster || 0},
            press: ${phases.press || 0},
            fastlåst: ${phases.fastlåst || 0},
            integrasjon: ${phases.integrasjon || 0}
          </div>
        </div>
      </div>

      <div class="panel-card panel-card-full">
        <div class="stat-label">Temaer</div>
        <ul class="insight-list">
          ${topicsHtml}
        </ul>
      </div>

      <div class="panel-card panel-card-full">
        <div class="stat-label">Kryss-tema-mønstre</div>
        <ul class="insight-list">
          ${patternsHtml}
        </ul>
      </div>
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

    // 🔄 oppdater tema-scrollen når noe nytt er lagt til
    refreshThemePicker();

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

  // 🔄 oppdater tema-scrollen også her
  refreshThemePicker();

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

  // 1) Overordnet bilde: hvor mye har du sagt + fase
  const sat = stats.insight_saturation || 0;
  const phase = stats.user_phase || null;

  if (sat < 20) {
    lines.push(
      "Dette ser ut som et tema du så vidt har begynt å utforske – det er lite samlet materiale ennå."
    );
  } else if (sat < 60) {
    lines.push(
      "Her begynner det å tegne seg et mønster – du har skrevet en del, men det er fortsatt i bevegelse."
    );
  } else {
    lines.push(
      "Her har du ganske høy metningsgrad – du har sagt mye om dette, og det ser ut som et tydelig mønster i livet ditt."
    );
  }

  if (phase) {
    const phaseTextMap = {
      utforskning:
        "Motoren leser deg som i en utforskningsfase: du undersøker, beskriver og prøver å forstå hva som egentlig skjer.",
      mønster:
        "Motoren leser deg som i mønsterfasen: du har begynt å se gjentakelser og kan nesten beskrive dette som en regel.",
      press:
        "Motoren leser mye indre trykk her – mye «må/burde» og opplevelse av krav rundt dette temaet.",
      fastlåst:
        "Motoren leser dette som mer fastlåst: mye trykk og ubehag, og lite opplevelse av handlingsrom akkurat nå.",
      integrasjon:
        "Motoren leser deg som i integrasjonsfase: du er i ferd med å flette det du har forstått inn i hverdagen."
    };
    const phaseText = phaseTextMap[phase];
    if (phaseText) lines.push(phaseText);
  }

  // 2) Hvor ofte skjer det – er dette enkelthendelser eller mønster?
  const freqOfteAlltid =
    (sem.frequency.ofte || 0) + (sem.frequency.alltid || 0);
  if (freqOfteAlltid > 0) {
    const andel = Math.round((freqOfteAlltid / total) * 100);
    if (andel >= 60) {
      lines.push(
        "Det du beskriver her skjer for det meste «ofte» eller «alltid» – altså et ganske stabilt mønster, ikke bare enkelthendelser."
      );
    } else {
      lines.push(
        "Noe av dette skjer «ofte» eller «alltid», men ikke alt – det er både tydelige mønstre og mer sporadiske situasjoner."
      );
    }
  }

  // 3) Emosjonell farge: hvordan kjennes dette temaet ut?
  const neg = sem.valence.negativ || 0;
  const pos = sem.valence.positiv || 0;
  if (neg > 0 || pos > 0) {
    const andelNeg = Math.round((neg / total) * 100);
    const andelPos = Math.round((pos / total) * 100);

    if (neg > 0 && pos === 0) {
      lines.push(
        "Språket ditt her er nesten bare negativt – du beskriver dette området som ganske tungt eller krevende."
      );
    } else if (pos > 0 && neg === 0) {
      lines.push(
        "Her bruker du mest positive formuleringer – dette ser ut som et område med ressurser, lyspunkter eller flyt."
      );
    } else {
      lines.push(
        `Du har både negative og positive beskrivelser her (ca. ${andelNeg}% negative og ${andelPos}% positive) – temaet rommer både det som er vanskelig og det som faktisk fungerer.`
      );
    }
  }

  // 4) Krav / hindring – opplevd trykk
  const krav = sem.modality.krav || 0;
  const hindring = sem.modality.hindring || 0;
  if (krav + hindring > 0) {
    if (krav > 0 && hindring > 0) {
      lines.push(
        "Du bruker en del språk som «må/burde/skal» sammen med «klarer ikke/får ikke til» – både indre krav og opplevd hindring er tydelig til stede."
      );
    } else if (krav > 0) {
      lines.push(
        "Det er en del «må/burde/skal» i språket ditt – mye fokus på krav og forventninger til deg selv."
      );
    } else if (hindring > 0) {
      lines.push(
        "Du beskriver flere «klarer ikke/får ikke til»-situasjoner – mer fokus på hindringer enn på muligheter."
      );
    }
  }

  // 5) Hva handler det mest om? (dimensjoner)
  const fokus = [];
  if (dims.emosjon > 0) fokus.push("følelser");
  if (dims.tanke > 0) fokus.push("tanker og tolkninger");
  if (dims.atferd > 0) fokus.push("konkrete handlinger");
  if (dims.kropp > 0) fokus.push("kroppslige reaksjoner");
  if (dims.relasjon > 0) fokus.push("relasjoner til andre");

  if (fokus.length === 1) {
    lines.push("Du skriver mest om " + fokus[0] + " i dette temaet.");
  } else if (fokus.length > 1) {
    const last = fokus.pop();
    lines.push(
      "Du beskriver dette temaet mest gjennom " +
        fokus.join(", ") +
        " og " +
        last +
        "."
    );
  }

  // 6) Et lite meta-blikk: hvor ligger potensialet?
  if (sat < 30) {
    lines.push(
      "Motorens lesning: dette er et tema som kan ha godt av litt mer utforskning før du prøver å endre noe konkret."
    );
  } else if (sat >= 30 && sat < 60) {
    if (neg > 0 && freqOfteAlltid > 0) {
      lines.push(
        "Motorens lesning: du har nok materiale her til å lage en liten «sti» – velge én typisk situasjon og teste et lite eksperiment."
      );
    } else {
      lines.push(
        "Motorens lesning: du er midt i et område hvor det gir mening å samle trådene til noen få setninger eller en enkel plan."
      );
    }
  } else {
    if (stats.concept_density >= 60) {
      lines.push(
        "Motorens lesning: dette begynner å ligne en ferdig innsikt – det kan være nyttig å skrive en kort tekst om hva du faktisk har lært her."
      );
    } else {
      lines.push(
        "Motorens lesning: du har mye materiale, men språket er fortsatt ganske hverdagslig – neste steg kan være å kondensere det til noen få klare begreper eller overskrifter."
      );
    }
  }

  return lines.join("\n\n");
}


// ── Narrativ innsikt ─────────────────────────

function showNarrativeForCurrentTopic() {
  const chamber = loadChamberFromStorage();
  const themeId = getCurrentThemeId();
  clearOutput();
  clearPanel();

  const txt = InsightsEngine.createNarrativeForTopic(
    chamber,
    SUBJECT_ID,
    themeId
  );
  log(txt);
}

// ── Innsikter pr tema ────────────────────────

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

  // Panel-visning
  renderTopicPanel(themeId, stats, sem, dims, insights);

  // Tekstlig liste + meta-sammendrag
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

// ── Tema-status ──────────────────────────────

function showTopicStatus() {
  const chamber = loadChamberFromStorage();
  const themeId = getCurrentThemeId();
  const stats = InsightsEngine.computeTopicStats(
    chamber,
    SUBJECT_ID,
    themeId
  );

  clearOutput();
  clearPanel();

  renderStatusPanel(themeId, stats);

  log("Status for tema " + themeId + ":");
  log("- Innsikter: " + stats.insight_count);
  log("- Innsiktsmetningsgrad: " + stats.insight_saturation + "/100");
  log("- Begrepstetthet: " + stats.concept_density + "/100");
  if (stats.user_phase) {
    log("- Fase (lesning av prosess): " + stats.user_phase);
  }
  log("→ Foreslått form: " + stats.artifact_type);
}

// ── Syntese / sti / semantikk / auto-artefakt ─────────

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
  clearPanel();
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
  clearPanel();
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
  clearPanel();

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
  clearPanel();

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

// ── AHA-agent ────────────────────────────────

function suggestNextActionForCurrentTopic() {
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
        "- Temaet er ganske mettet og begrepstettt. Neste steg er egentlig å skrive dette ut som en kort tekst " +
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
  clearPanel();

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

// ── Dialektikk ───────────────────────────────

function showDialecticViewForCurrentTopic() {
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
  clearPanel();

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
  clearPanel();
  log("Eksport av innsiktskammer (JSON):");
  log(JSON.stringify(chamber, null, 2));
}


// ── Bygg state-pakke til AHA-AI for ett tema ─────────────

function buildAIStateForTheme(themeId) {
  const chamber = loadChamberFromStorage();

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
  const sem = InsightsEngine.computeSemanticCounts(insights);
  const dims = InsightsEngine.computeDimensionsSummary(insights);
  const narrative = InsightsEngine.createNarrativeForTopic(
    chamber,
    SUBJECT_ID,
    themeId
  );

  // Meta-profil på tvers av tema – hvis meta-motoren er lastet
  let metaProfile = null;
  if (typeof MetaInsightsEngine !== "undefined") {
    try {
      metaProfile = MetaInsightsEngine.buildUserMetaProfile(
        chamber,
        SUBJECT_ID
      );
    } catch (e) {
      console.warn("MetaInsightsEngine feilet:", e);
    }
  }

  // Ta med topp 5 innsikter sortert på styrke
  const topInsights = (insights || [])
    .slice()
    .sort(
      (a, b) =>
        (b.strength?.total_score || 0) -
        (a.strength?.total_score || 0)
    )
    .slice(0, 5);

  return {
    user_id: SUBJECT_ID,
    theme_id: themeId,
    topic_stats: stats,
    topic_semantics: sem,
    topic_dimensions: dims,
    topic_narrative: narrative,
    top_insights: topInsights,
    meta_profile: metaProfile,
  };
}




// ── Meta-motor: global brukerprofil ──────────

function showMetaProfileForUser() {
  const chamber = loadChamberFromStorage();

  clearOutput();
  clearPanel();

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

  // Panelvisning
  renderMetaPanel(profile);

  // Enkel tekstlig oppsummering
  const g = profile.global;
  log("META-PROFIL for " + SUBJECT_ID + ":\n");
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
}

  // Toppbegreper – enkel liste
  if (profile.concepts && profile.concepts.length > 0) {
    log("\nToppbegreper på tvers av tema:");
    profile.concepts.slice(0, 20).forEach((c) => {
      const themeStr = (c.themes || []).join(", ");
      log(
        "• " +
          c.key +
          " (" +
          c.total_count +
          ") – tema: " +
          themeStr
      );
    });
  } else {
    log("\nIngen begreper registrert ennå (skriv litt mer tekst).");
  }

// ── Import fra History Go (delt localStorage) ─────────────────

// Tar inn payload fra History Go og lager signaler i AHA-kammeret
function importHistoryGoData(payload) {
  if (!payload) return;

  const chamber = loadChamberFromStorage();
  const subjectId = "sub_historygo";

  const notes = Array.isArray(payload.notes) ? payload.notes : [];
  const dialogs = Array.isArray(payload.dialogs) ? payload.dialogs : [];

  // 1) Notater → signaler
  notes.forEach((n) => {
    if (!n.text) return;
    const themeId = n.categoryId || n.category || "ukjent";

    const sig = InsightsEngine.createSignalFromMessage(
      n.text,
      subjectId,
      themeId
    );
    // Overstyr timestamp hvis vi har noe bedre
    sig.timestamp = n.createdAt || payload.exported_at || sig.timestamp;
    InsightsEngine.addSignalToChamber(chamber, sig);
  });

  // 2) Dialoger → bare bruker-tekst inn
  dialogs.forEach((dlg) => {
    const themeId = dlg.categoryId || "ukjent";

    (dlg.turns || [])
      .filter((t) => t.from === "user" && t.text)
      .forEach((t) => {
        const sig = InsightsEngine.createSignalFromMessage(
          t.text,
          subjectId,
          themeId
        );
        sig.timestamp = dlg.created_at || payload.exported_at || sig.timestamp;
        InsightsEngine.addSignalToChamber(chamber, sig);
      });
  });

  saveChamberToStorage(chamber);
}

// Leser buffer fra lokalStorage og kaller importHistoryGoData
function importHistoryGoDataFromSharedStorage() {
  clearOutput();
  const raw = localStorage.getItem("aha_import_payload_v1");
  if (!raw) {
    log(
      "Fant ingen History Go-data å importere (aha_import_payload_v1 er tom)."
    );
    return;
  }

  try {
    const payload = JSON.parse(raw);
    importHistoryGoData(payload);
    log("Importerte History Go-data fra lokal storage.");
    if (payload.exported_at) {
      log("Eksportert fra History Go: " + payload.exported_at);
    }
  } catch (e) {
    log("Klarte ikke å lese History Go-data: " + e.message);
  }
}

// ── Vis svar fra AHA-AI i panelet / loggen ───────────────

function renderAHAAgentResponse(res) {
  clearOutput();

  if (!res) {
    log("AHA-AI: Fikk ikke noe svar.");
    return;
  }

  log("AHA-AI for tema " + (res.theme_id || getCurrentThemeId()) + ":");
  log("");

  if (res.summary) {
    log("SAMMENDRAG:");
    log(res.summary);
    log("");
  }

  if (Array.isArray(res.what_i_see) && res.what_i_see.length > 0) {
    log("DET JEG SER:");
    res.what_i_see.forEach((line, idx) => {
      log("  " + (idx + 1) + ". " + line);
    });
    log("");
  }

  if (Array.isArray(res.next_steps) && res.next_steps.length > 0) {
    log("NESTE STEG:");
    res.next_steps.forEach((line, idx) => {
      log("  " + (idx + 1) + ". " + line);
    });
    log("");
  }

  if (res.one_question) {
    log("SPØRSMÅL TIL DEG:");
    log(res.one_question);
    log("");
  }

  if (res.tone) {
    log("(Tone: " + res.tone + ")");
  }
}

// ── Kall AHA-AI for gjeldende tema ───────────────────────

async function callAHAAgentForCurrentTopic() {
  const themeId = getCurrentThemeId();
  const state = buildAIStateForTheme(themeId);

  clearOutput();
  log("AHA-AI: Leser innsiktskammeret for tema " + themeId + " …");
  log("");

  const API_BASE = "https://fluffy-funicular-g4vqgqx4jgj93vrqp-3001.app.github.dev";

  try {
    const res = await fetch(API_BASE + "/api/aha-agent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(state),
    });

    if (!res.ok) {
      throw new Error("HTTP " + res.status + " " + res.statusText);
    }

    const data = await res.json();
    renderAHAAgentResponse(data);
  } catch (e) {
    log("Feil ved kall til AHA-AI: " + e.message);
    log("");
    log("DEBUG – state som ble sendt:");
    log(JSON.stringify(state, null, 2));
  }
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
  const btnAI = document.getElementById("btn-ai"); // NY
    const btnImportHG = document.getElementById("btn-import-hg");
  const themePicker = document.getElementById("theme-picker");
  // ...

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

    refreshThemePicker();
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
  if (btnAI) {
    btnAI.addEventListener("click", callAHAAgentForCurrentTopic);
  }
  if (btnImportHG) {
    btnImportHG.addEventListener("click", importHistoryGoDataFromSharedStorage);
  }

  if (themePicker) {
    themePicker.addEventListener("change", () => {
      const val = themePicker.value;
      if (!val) return;

      const input = document.getElementById("theme-id");
      if (input) {
        input.value = val;
      }
      log("Tema byttet til «" + val + "» via tema-velgeren.");
    });
  }
  
  btnReset.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    clearOutput();
    clearPanel();
    log("Innsiktskammer nullstilt (alle tema slettet).");
  });

    clearOutput();
  clearPanel();
  log(
    "AHA Chat – Innsiktsmotor V1 + Metamotor + AHA-AI klar. " +
      "Velg tema-id, skriv en tanke og trykk «Send»."
  );

  // NYTT: fyll tema-velgeren med faktiske tema
  refreshThemePicker();
}

document.addEventListener("DOMContentLoaded", setupUI);
