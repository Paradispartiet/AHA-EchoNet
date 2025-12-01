// /aha/core/insightsChamber.js

const STORAGE_KEY = 'aha_insight_chamber_v1';

/**
 * Tomt innsiktskammer
 */
export function createEmptyChamber() {
  return {
    insights: []
  };
}

/**
 * Last kammer fra localStorage, eller lag et nytt hvis ingen finnes.
 */
export function loadChamber() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyChamber();
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Kunne ikke laste innsiktskammer, lager nytt.', e);
    return createEmptyChamber();
  }
}

/**
 * Lagre kammer til localStorage
 */
export function saveChamber(chamber) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chamber));
  } catch (e) {
    console.warn('Kunne ikke lagre innsiktskammer.', e);
  }
}

// ─────────────────────────────────────────────────────────────
//  Enkle helper-funksjoner for V1
// ─────────────────────────────────────────────────────────────

function generateInsightId() {
  return 'ins_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Lag en veldig enkel tittel: første 8–10 ord av teksten.
 */
function generateTitleFromText(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const short = words.slice(0, 10).join(' ');
  return words.length > 10 ? short + ' …' : short;
}

/**
 * Veldig enkel tekstlikhet: Jaccard på ord
 * 0–1, der 1 er helt likt.
 */
function textSimilarity(a, b) {
  const tokensA = new Set(
    a.toLowerCase().split(/\W+/).filter(t => t.length > 2)
  );
  const tokensB = new Set(
    b.toLowerCase().split(/\W+/).filter(t => t.length > 2)
  );
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return intersection / union;
}

// ─────────────────────────────────────────────────────────────
//  Innsiktslogikk V1
// ─────────────────────────────────────────────────────────────

/**
 * Finn alle innsikter i et gitt subject + tema.
 */
export function getInsightsForTopic(chamber, subjectId, themeId) {
  return chamber.insights.filter(
    ins =>
      ins.subject_id === subjectId &&
      ins.theme_id === themeId
  );
}

/**
 * Forsterk en eksisterende innsikt med et nytt signal.
 */
function reinforceInsight(insight, signal) {
  insight.strength.evidence_count += 1;
  insight.last_updated = signal.timestamp;

  // Enkel V1-score: 10 poeng per signal, maks 100
  insight.strength.total_score = Math.min(
    100,
    insight.strength.evidence_count * 10
  );
}

/**
 * Lag en ny innsikt fra et signal.
 */
function createInsightFromSignal(signal) {
  const title = generateTitleFromText(signal.text);
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
    last_updated: signal.timestamp
  };
}

/**
 * Legg til et signal i kammeret:
 *  - prøv å finne en lignende innsikt i samme tema
 *  - hvis likhet høy nok → forsterk
 *  - ellers → lag ny innsikt
 */
export function addSignalToChamber(chamber, signal) {
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

  const THRESHOLD = 0.5; // V1: veldig enkel grense

  if (best && bestSim >= THRESHOLD) {
    reinforceInsight(best, signal);
  } else {
    const newInsight = createInsightFromSignal(signal);
    chamber.insights.push(newInsight);
  }

  return chamber;
}d
