// /app/ahaChat.js

import { createSignalFromMessage } from '../aha/core/signals.js';
import {
  loadChamber,
  saveChamber,
  addSignalToChamber,
  getInsightsForTopic
} from '../aha/core/insightsChamber.js';
import { computeTopicStats } from '../aha/core/topicStats.js';

// For V1 bestemmer vi subject + tema hardkodet:
const SUBJECT_ID = 'sub_laring';
const THEME_ID = 'th_motstand_prokrastinering';

/**
 * Kall denne hver gang brukeren har skrevet noe meningsfullt om temaet.
 */
export function handleUserMessage(messageText) {
  // 1) lag signal
  const signal = createSignalFromMessage(
    messageText,
    SUBJECT_ID,
    THEME_ID
  );

  // 2) last kammer
  let chamber = loadChamber();

  // 3) oppdater kammer med signal
  chamber = addSignalToChamber(chamber, signal);

  // 4) lagre igjen
  saveChamber(chamber);
}

/**
 * Kall denne f.eks. når brukeren skriver /innsikt
 */
export function showInsightsForCurrentTopic() {
  const chamber = loadChamber();
  const insights = getInsightsForTopic(
    chamber,
    SUBJECT_ID,
    THEME_ID
  );

  if (insights.length === 0) {
    console.log('Ingen innsikter ennå for dette temaet.');
    return;
  }

  console.log('Innsikter for temaet:', THEME_ID);
  insights.forEach((ins, idx) => {
    console.log(
      `${idx + 1}. ${ins.title} (score: ${ins.strength.total_score})`
    );
  });
}

/**
 * Kall denne f.eks. når brukeren skriver /tema
 */
export function showTopicStatus() {
  const chamber = loadChamber();
  const stats = computeTopicStats(
    chamber,
    SUBJECT_ID,
    THEME_ID
  );

  console.log(`Status for tema ${THEME_ID}:`);
  console.log(
    `- Innsikter: ${stats.insight_count}`
  );
  console.log(
    `- Innsiktsmetningsgrad: ${stats.insight_saturation}/100`
  );
  console.log(
    `- Begrepstetthet: ${stats.concept_density}/100`
  );
  console.log(
    `→ Foreslått form: ${stats.artifact_type}`
  );
}
