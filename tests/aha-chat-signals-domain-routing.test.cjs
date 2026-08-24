const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {
  window: null,
  globalThis: null,
  AHAChatTextUtils: {
    cleanArticleText: (value) => String(value || ''),
    toSentences: (value) => String(value || '').split(/(?<=[.!?])\s+/).filter(Boolean),
    collectOpinionArticleEvidence: () => []
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/ahaChatSignals.js', 'utf8'), context, { filename: 'js/ahaChatSignals.js' });

const signals = context.AHAChatSignals;
const narrativeCare = 'Artikkelen drøfter romaner, litteraturvitenskap, sårbarhet og hvem som har eierskap til egen fortelling i historisk omsorgspraksis.';
assert.equal(signals.detectInstitutionalMediaHistorySignal(narrativeCare).strong, false, 'generic ownership must not become a media-domain anchor');
assert.equal(signals.detectLiteraryAttachmentSignal(narrativeCare).strong, false, 'a literary source without attachment theory must not enter the Knausgård attachment template');
assert.equal(signals.detectCanonicalAnalysisDomain(narrativeCare), '');

const mediaHistory = 'Morgenbladet er en avis med en lang redaksjonell historie. Artikkelen undersøker journalistikk, eierskap og offentlighet over tid.';
assert.equal(signals.detectInstitutionalMediaHistorySignal(mediaHistory).strong, true);
assert.equal(signals.detectCanonicalAnalysisDomain(mediaHistory), 'institutional_media_history');

const literaryAttachment = 'Analysen av Knausgårds roman Om våren bruker Bowlbys tilknytningsteori, deiksis, autofiksjon og løsrivelse som litteraturvitenskapelig ramme.';
assert.equal(signals.detectLiteraryAttachmentSignal(literaryAttachment).strong, true);
assert.equal(signals.detectCanonicalAnalysisDomain(literaryAttachment), 'literary_attachment');

console.log('aha-chat-signals-domain-routing.test.cjs passed');
