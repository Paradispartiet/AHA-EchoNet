// ahaChat.js
// Kobler AHA InsightsEngine til en enkel chat-side

const SUBJECT_ID = "sub_laring";
const STORAGE_KEY = "aha_insight_chamber_v1";

// Enkel debug-hjelper som skriver JSON til debug-tekstfeltet i UI
function ahaDebug(obj, label) {
  try {
    const el = document.getElementById("aha-debug-output");
    if (!el) return;

    const header = label ? `# ${label}\n` : "";
    const body =
      obj == null
        ? "null"
        : typeof obj === "string"
        ? obj
        : JSON.stringify(obj, null, 2);

    el.value = header + body;
  } catch (e) {
    // Debug skal aldri kræsje appen
  }
}

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
function getFieldProfileForTheme(themeOrFieldId) {
  if (typeof HG_FIELD_PROFILES === "undefined") return null;
  return HG_FIELD_PROFILES[themeOrFieldId] || null;
}

// Hent valgt felt/fag (subject_id for emner)
function getCurrentFieldId() {
  const sel = document.getElementById("field-id");
  if (!sel) return null;
  const val = (sel.value || "").trim();
  return val || null;
}

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

let conceptsForTheme = [];
  if (
    typeof MetaInsightsEngine !== "undefined" &&
    typeof MetaInsightsEngine.buildConceptIndexForTheme === "function"
  ) {
    try {
      conceptsForTheme = MetaInsightsEngine.buildConceptIndexForTheme(
        chamber,
        SUBJECT_ID,
        themeId
      );
    } catch (e) {
      console.warn("Kunne ikke bygge begrepsindex for tema", e);
    }
  }

  
  const topInsights = (insights || [])
    .slice()
    .sort(
      (a, b) =>
        (b.strength?.total_score || 0) -
        (a.strength?.total_score || 0)
    )
    .slice(0, 5);

  // Felt-linse (fra select#field-id)
  const fieldId = getCurrentFieldId();
  let fieldProfile = null;
  if (fieldId && typeof HG_FIELD_PROFILES !== "undefined") {
    fieldProfile = HG_FIELD_PROFILES[fieldId] || null;
  }

  // Begrepsindex per tema (fra MetaInsightsEngine)
  let conceptsForTheme = [];
  if (typeof MetaInsightsEngine !== "undefined" &&
      typeof MetaInsightsEngine.buildConceptIndexForTheme === "function") {
    try {
      conceptsForTheme = MetaInsightsEngine.buildConceptIndexForTheme(
        chamber,
        SUBJECT_ID,
        themeId
      );
    } catch (e) {
      console.warn("Kunne ikke bygge begrepsindex for tema", e);
    }
  }
  
  return {
    // 🔹 beholdt fra gammel versjon
    user_id: SUBJECT_ID,
    theme_id: themeId,
    topic_stats: stats,
    topic_semantics: sem,
    topic_dimensions: dims,
    topic_narrative: narrative,
    top_insights: topInsights,
    meta_profile: metaProfile,

    // 🔹 nye felter fra “emne”-versjonen
    subject_id: SUBJECT_ID,
    field_id: fieldId,
    field_profile: fieldProfile,
    insights,                 // råliste med innsikter
    semantic_summary: sem,    // alias til topic_semantics
    dimensions_summary: dims, // alias til topic_dimensions
    narrative_summary: narrative // alias til topic_narrative
    // 🔹 NYTT: konseptlag for dette temaet
    concepts: conceptsForTheme
    };
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

  // Begrepsanalyse for dette temaet (POS-filter + multiword)
  let coreConcepts = [];
  let multiConcepts = [];

  if (
    typeof MetaInsightsEngine !== "undefined" &&
    Array.isArray(insights) &&
    insights.length
  ) {
    try {
      // Gjenbruker global buildConceptIndex, men nå på innsikter for dette temaet
      const conceptIndex = MetaInsightsEngine.buildConceptIndex(
        insights
      );

      coreConcepts = MetaInsightsEngine
        .posFilterConcepts(conceptIndex)
        .slice(0, 12); // topp 12 kjernebegreper

      multiConcepts = MetaInsightsEngine
        .extractMultiwordConcepts(conceptIndex)
        .slice(0, 10); // topp 10 multiword
    } catch (e) {
      console.warn("Begrepsanalyse feilet for tema", themeId, e);
    }
  }

  const conceptHtml =
    coreConcepts.length || multiConcepts.length
      ? `
      <div class="panel-card panel-card-full">
        <div class="stat-label">Begreper i dette temaet</div>

        ${
          coreConcepts.length
            ? `
        <div class="stat-sub">Kjernebegreper (substantiv-ish)</div>
        <div class="dim-chips">
          ${coreConcepts
            .map(
              (c) =>
                `<span class="dim-chip">${c.key}</span>`
            )
            .join("")}
        </div>`
            : ""
        }

        ${
          multiConcepts.length
            ? `
        <div class="stat-sub" style="margin-top:4px;">
          Sammensatte begreper (2–4 ord)
        </div>
        <div class="dim-chips">
          ${multiConcepts
            .map(
              (c) =>
                `<span class="dim-chip">${c.key}</span>`
            )
            .join("")}
        </div>`
            : ""
        }
      </div>`
      : "";

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

      ${conceptHtml}
    </div> <!-- slutt på .panel-grid -->
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
  log("- Innsikter: " + (stats.insight_count || 0));
  log(
    "- Innsiktsmetningsgrad: " +
      (stats.insight_saturation ?? 0) +
      "/100"
  );
  log(
    "- Begrepstetthet: " +
      (stats.concept_density ?? 0) +
      "/100"
  );
  if (stats.user_phase) {
    log("- Fase (lesning av prosess): " + stats.user_phase);
  }
  log("→ Foreslått form: " + stats.artifact_type);

  // ── NYTT: språk / logikk / meta-begreper ──

  if (typeof stats.avg_coherence === "number") {
    log(
      "- Tekstlig koherens (gj.snitt): " +
        stats.avg_coherence.toFixed(2)
    );
  }

  if (typeof stats.avg_terminology === "number") {
    log(
      "- Terminologi / faglig tetthet (gj.snitt): " +
        stats.avg_terminology.toFixed(2)
    );
  }

  if (stats.logical_patterns) {
    const lp = stats.logical_patterns;
    const c = (lp.causal || 0).toFixed(2);
    const i = (lp.inferential || 0).toFixed(2);
    const k = (lp.contrast || 0).toFixed(2);
    const b = (lp.balancing || 0).toFixed(2);

    log(
      "- Logiske mønstre (gj.snitt per innsikt): " +
        "årsak " +
        c +
        ", resonnement " +
        i +
        ", kontrast " +
        k +
        ", balansering " +
        b
    );
  }

  if (stats.meta_concepts) {
    const mc = stats.meta_concepts;
    const unique = mc.unique_count || 0;
    const topList = (mc.top || [])
      .slice(0, 5)
      .map((m) => m.key + "×" + m.count)
      .join(", ");

    log(
      "- Meta-begreper: " +
        unique +
        " unike" +
        (topList ? " (topp: " + topList + ")" : "")
    );
  }
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




function showConceptsForCurrentTopic() {
  const chamber = loadChamberFromStorage();
  const themeId = getCurrentThemeId();
  const insights = InsightsEngine.getInsightsForTopic(
    chamber,
    SUBJECT_ID,
    themeId
  );

  clearOutput();
  clearPanel();

  if (!insights || insights.length === 0) {
    log("Ingen innsikter ennå for tema: " + themeId);
    return;
  }

  // Bruk meta-motorens buildConceptIndex hvis den finnes
  let conceptIndex = [];
  if (
    typeof MetaInsightsEngine !== "undefined" &&
    typeof MetaInsightsEngine.buildConceptIndex === "function"
  ) {
    conceptIndex = MetaInsightsEngine.buildConceptIndex(insights);
  } else {
    // Fallback: bygg en enkel indeks lokalt
    const map = new Map();
    (insights || []).forEach((ins) => {
      (ins.concepts || []).forEach((c) => {
        if (!c || !c.key) return;
        let entry = map.get(c.key);
        if (!entry) {
          entry = {
            key: c.key,
            total_count: 0,
            examples: [],
          };
          map.set(c.key, entry);
        }
        entry.total_count += c.count || 1;
        (c.examples || []).forEach((ex) => {
          if (
            ex &&
            entry.examples.length < 3 &&
            !entry.examples.includes(ex)
          ) {
            entry.examples.push(ex);
          }
        });
      });
    });
    conceptIndex = Array.from(map.values()).sort(
      (a, b) => b.total_count - a.total_count
    );
  }

  if (!conceptIndex.length) {
    log("Ingen begreper funnet ennå for tema: " + themeId);
    return;
  }

  // Tekstlig liste i loggen
  log('Begreper i tema "' + themeId + '":\n');
  conceptIndex.slice(0, 40).forEach((c) => {
    log("• " + c.key + " (" + c.total_count + ")");
  });

  // Enkel visuell liste i panelet – nå klikkbar
  const panel = getPanelEl();
  if (panel) {
    panel.innerHTML = `
      <div class="insight-panel">
        <div class="insight-panel-header">
          <div class="insight-panel-title">
            Begreper i tema: <code>${themeId}</code>
          </div>
          <div class="insight-panel-subtitle">
            Klikk på et begrep for å se en tankerekke (begrepssti).
          </div>
        </div>
        <div class="concept-list">
          ${conceptIndex
            .slice(0, 40)
            .map(
              (c) => `
            <button
              class="concept-pill"
              data-concept="${c.key}"
              title="Brukt ${c.total_count} ganger"
            >
              ${c.key}
              <span class="concept-count">(${c.total_count})</span>
            </button>
          `
            )
            .join("")}
        </div>
        <div id="concept-path" class="concept-path">
          <p class="concept-path-hint">
            Velg et begrep over for å se hvordan du har brukt det over tid.
          </p>
        </div>
      </div>
    `;

    setupConceptPanelInteractions();
  }
}

let conceptPanelBound = false;

function setupConceptPanelInteractions() {
  const panel = getPanelEl();
  if (!panel || conceptPanelBound) return;

  panel.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".concept-pill");
    if (!btn) return;

    const conceptKey = btn.getAttribute("data-concept");
    if (!conceptKey) return;

    const chamber = loadChamberFromStorage();
    const themeId = getCurrentThemeId();
    const insights = InsightsEngine.getInsightsForTopic(
      chamber,
      SUBJECT_ID,
      themeId
    );

    // NY motor-funksjon – må være eksportert fra InsightsEngine
    const steps = InsightsEngine.createConceptPathForConcept(
      insights,
      conceptKey,
      6
    );

    const pathEl = document.getElementById("concept-path");
    if (!pathEl) return;

    if (!steps || !steps.length) {
      pathEl.innerHTML =
        '<p class="concept-path-empty">Fant ingen tydelig sti for begrepet.</p>';
      return;
    }

    pathEl.innerHTML = `
      <div class="concept-path-header">
        Tankerekke for begrepet: <code>${conceptKey}</code>
      </div>
      <ol class="concept-path-list">
        ${steps
          .map((s) => `<li class="concept-path-step">${s}</li>`)
          .join("")}
      </ol>
    `;
  });

  conceptPanelBound = true;
}

// ── Meta-motor: global brukerprofil ──────────

// ── Meta-motor: global brukerprofil ──────────

function showMetaProfileForUser() {
  const chamber = loadChamberFromStorage();

  clearOutput();
  clearPanel();

  if (typeof MetaInsightsEngine === "undefined") {
    log(
      "MetaInsightsEngine er ikke lastet. Sjekk at metaInsightsEngine.js er inkludert i index.html."
    );
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
  const g = profile.global || {};
  log("META-PROFIL for " + SUBJECT_ID + ":\n");
  log(
    "- Gjennomsnittlig metning på tvers av tema: " +
      Math.round(g.avg_saturation || 0) +
      " / 100"
  );
  log(
    "- Press-indeks (krav+hindring vs mulighet): " +
      (g.pressure_index ?? 0).toFixed(2)
  );
  log(
    "- Negativitetsindeks (andel negativ valens): " +
      (g.negativity_index ?? 0).toFixed(2)
  );
  log(
    "- Antall fastlåste tema: " +
      (g.stuck_topics || 0) +
      ", integrasjons-tema: " +
      (g.integration_topics || 0)
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

  // ── Fagprofil: samfunnsvitenskapelige spor ──
  const academic = profile.academic;
  if (academic && academic.clusters && academic.clusters.length) {
    const activeClusters = academic.clusters.filter((c) => c.score > 0);

    if (activeClusters.length > 0) {
      log("\nFAGPROFIL – samfunnsvitenskapelige teoriklynger:");

      activeClusters.slice(0, 6).forEach((c) => {
        const rel = Math.round((c.relative || 0) * 100);
        const hits = c.hits && c.hits.length
          ? " (begrep: " + c.hits.join(", ") + ")"
          : "";
        log("• " + c.label + " – " + rel + "% styrke" + hits);
      });

      if (academic.disciplines && academic.disciplines.length) {
        log("\nFordeling på fagtradisjoner:");
        academic.disciplines.forEach((d) => {
          const rel = Math.round((d.relative || 0) * 100);
          log("• " + d.id + ": " + rel + "%");
        });
      }
    } else {
      log("\nFAGPROFIL: Ingen tydelige teorispor ennå – for lite faglige begreper.");
    }
  } else {
    log("\nFAGPROFIL: Ikke nok data til å bygge fagprofil ennå.");
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

  const API_BASE = ""; // samme origin
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

// ── Emnekatalog UI ──────────────────────────

function setupEmneUI() {
  const fieldsEl = document.getElementById("emne-fields");
  const listEl = document.getElementById("emne-list");
  const txt = document.getElementById("msg");

  if (!fieldsEl || !listEl || !txt) return;
  if (typeof window.Emner === "undefined") {
    console.warn("Emner-loader (Emner) er ikke tilgjengelig.");
    return;
  }

  const EMNE_FIELDS = [
    { id: "musikk", label: "Musikk" },
    { id: "vitenskap", label: "Vitenskap" },
    { id: "litteratur", label: "Litteratur" },
    { id: "populaerkultur", label: "Popkultur" },
    { id: "naeringsliv", label: "Næringsliv" },
    { id: "sport", label: "Sport" },
    // legg til flere felt her hvis du vil
  ];

  let currentFieldId = null;

  function setActiveFieldButton(fieldId) {
    const buttons = fieldsEl.querySelectorAll(".emne-field-btn");
    buttons.forEach((btn) => {
      const id = btn.getAttribute("data-field-id");
      btn.classList.toggle("active", id === fieldId);
    });
  }

  async function loadEmnerForField(fieldId) {
    currentFieldId = fieldId;
    setActiveFieldButton(fieldId);

    listEl.innerHTML =
      '<div class="emne-list-loading">Laster emner for ' +
      fieldId +
      " …</div>";

    try {
      const emner = await window.Emner.loadForSubject(fieldId);
      if (!Array.isArray(emner) || emner.length === 0) {
        listEl.innerHTML =
          '<div class="emne-list-empty">Ingen emner registrert for dette feltet ennå.</div>';
        return;
      }

      const html = emner
        .map((emne) => {
          const emneId = emne.emne_id || emne.id || "";
          const title = emne.short_label || emne.title || emneId;
          const desc = emne.description || emne.ingress || "";

          return `
            <div class="emne-item" data-emne-id="${emneId}">
              <div class="emne-title">${title}</div>
              ${
                desc
                  ? `<div class="emne-desc">${desc}</div>`
                  : ""
              }
              <button type="button" class="emne-use-btn">
                Bruk emne i notat
              </button>
            </div>
          `;
        })
        .join("");

      listEl.innerHTML = html;

      listEl
        .querySelectorAll(".emne-use-btn")
        .forEach((btn) => {
          btn.addEventListener("click", (e) => {
            const item = e.target.closest(".emne-item");
            if (!item) return;
            const emneId = item.getAttribute("data-emne-id") || "";
            const titleEl = item.querySelector(".emne-title");
            const title = titleEl ? titleEl.textContent.trim() : emneId;

            const insert =
              "\n#" + (emneId || "emne") + " " + title + " ";

            txt.value = (txt.value || "").trim() + insert;
            txt.focus();
          });
        });
    } catch (err) {
      console.warn("Feil ved lasting av emner for", fieldId, err);
      listEl.innerHTML =
        '<div class="emne-list-error">Feil ved lasting av emner for dette feltet.</div>';
    }
  }

  // Sett opp felt-knapper
  fieldsEl.innerHTML = "";
  EMNE_FIELDS.forEach((f) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emne-field-btn";
    btn.textContent = f.label;
    btn.setAttribute("data-field-id", f.id);
    btn.addEventListener("click", () => {
      loadEmnerForField(f.id);
    });
    fieldsEl.appendChild(btn);
  });

  // Last første felt som start (hvis ønsket)
  if (EMNE_FIELDS.length > 0) {
    loadEmnerForField(EMNE_FIELDS[0].id);
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
  const btnConcepts = document.getElementById("btn-concepts");
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
    const fieldSelect = document.getElementById("field-id");
  // ...

    btnSend.addEventListener("click", async () => {
    const val = (txt.value || "").trim();
    if (!val) {
      alert("Skriv noe først 😊");
      return;
    }

    // 1) Legg meldingen inn i innsiktskammeret som før
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

    // 2) Emne-matching (valgfritt felt / fag)
    const subjectId =
      fieldSelect && fieldSelect.value
        ? fieldSelect.value.trim()
        : null;

    if (
      subjectId &&
      typeof matchEmneForText === "function"
    ) {
      try {
        const hit = await matchEmneForText(subjectId, val);
        if (hit) {
          log(
            "→ Emne (" +
              subjectId +
              "): " +
              hit.short_label +
              " [" +
              hit.emne_id +
              "]"
          );

          // 🔗 KOBLE EMNE-TREFFET INN I SISTE INNSIKT I DETTE TEMAET
          try {
            const chamber = loadChamberFromStorage();
            const themeId = getCurrentThemeId();
            const insightsForTopic =
              InsightsEngine.getInsightsForTopic(
                chamber,
                SUBJECT_ID,
                themeId
              ) || [];

            if (insightsForTopic.length > 0) {
              // Finn "siste" innsikt basert på last_updated / first_seen
              const latest = insightsForTopic
                .slice()
                .sort((a, b) => {
                  const aTime =
                    a.last_updated || a.first_seen || "";
                  const bTime =
                    b.last_updated || b.first_seen || "";
                  return bTime.localeCompare(aTime);
                })[0];

              // Legg til / utvid emne-tags
              if (!Array.isArray(latest.emne_tags)) {
                latest.emne_tags = [];
              }

              latest.emne_tags.push({
                subject_id: subjectId,
                emne_id: hit.emne_id,
                short_label: hit.short_label || hit.title,
                title: hit.title || hit.short_label,
                score: hit.score,
                matched_text: val,
                matched_at: new Date().toISOString(),
                source: "aha_msg_v1"
              });

              saveChamberToStorage(chamber);
              log("   ↳ Emne-treff koblet til siste innsikt i temaet.");
            } else {
              log(
                "   (Fant ingen innsikter å koble emne til ennå – skriv litt mer først.)"
              );
            }
          } catch (e) {
            console.warn("Klarte ikke å koble emne til innsikt:", e);
            log(
              "   (Teknisk feil ved kobling av emne til innsikt – se console.)"
            );
          }
        } else {
          log(
            "→ Fant ikke noe tydelig emne for " +
              subjectId +
              " i denne meldingen."
          );
        }
      } catch (e) {
        console.warn("Emne-matching feilet:", e);
        log("→ Klarte ikke å matche emne (se console).");
      }
    }
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

if (btnConcepts) {
  btnConcepts.addEventListener("click", showConceptsForCurrentTopic);
}
  
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

    // Sett opp Emnekatalog-UI
  try {
    setupEmneUI();
  } catch (e) {
    console.warn("Klarte ikke sette opp Emnekatalog-UI:", e);
  }

  clearOutput();
  clearPanel();
  log(
    "AHA Chat – Innsiktsmotor V1 + Metamotor + Emnekatalog klar. " +
      "Velg tema-id, skriv en tanke og trykk «Send» – bruk emnekatalogen for inspirasjon."
  );


  // NYTT: fyll tema-velgeren med faktiske tema
  refreshThemePicker();
}

document.addEventListener("DOMContentLoaded", setupUI);

document.addEventListener("DOMContentLoaded", () => {
  // ... her har du sikkert allerede annen init-kode ...

  const debugInsightsBtn = document.getElementById("aha-debug-insights-btn");
  const debugStatsBtn = document.getElementById("aha-debug-stats-btn");

  if (debugInsightsBtn) {
    debugInsightsBtn.addEventListener("click", () => {
      try {
        const themeId = getCurrentThemeId();
        const chamber = loadChamberFromStorage();
        const insights = InsightsEngine.getInsightsForTopic(
          chamber,
          SUBJECT_ID,
          themeId
        );

        ahaDebug(
          insights,
          `Rå innsikter for tema "${themeId}" (count=${insights.length})`
        );
      } catch (e) {
        ahaDebug(
          { error: e && e.message ? e.message : String(e) },
          "Feil ved henting av innsikter"
        );
      }
    });
  }

  if (debugStatsBtn) {
    debugStatsBtn.addEventListener("click", () => {
      try {
        const themeId = getCurrentThemeId();
        const chamber = loadChamberFromStorage();
        const stats = InsightsEngine.computeTopicStats(
          chamber,
          SUBJECT_ID,
          themeId
        );

        ahaDebug(
          stats,
          `Rå stats for tema "${themeId}"`
        );
      } catch (e) {
        ahaDebug(
          { error: e && e.message ? e.message : String(e) },
          "Feil ved henting av stats"
        );
      }
    });
  }
});
