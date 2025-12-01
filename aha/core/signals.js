// /aha/core/signals.js

// Enkel id-generator for V1
function generateSignalId() {
  return 'sig_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
}

// ISO-timestamp
function nowIso() {
  return new Date().toISOString();
}

/**
 * Lag et Signal-objekt fra en chat-melding.
 * V1: du sender inn subject_id og theme_id eksplisitt.
 */
export function createSignalFromMessage(messageText, subjectId, themeId) {
  return {
    id: generateSignalId(),
    timestamp: nowIso(),
    subject_id: subjectId,
    theme_id: themeId,
    text: messageText.trim()
  };
}
