const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
function ctx(){ const store=new Map(); const c={ console, Date, Math, JSON, localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}, document:null }; c.window=c; c.globalThis=c; vm.createContext(c); return c; }
function run(c,file){ vm.runInContext(fs.readFileSync(file,'utf8'), c, {filename:file}); }
const c=ctx();
run(c,'js/ahaChatPersistence.js');
assert.deepEqual(c.AHAChatPersistence.loadSessions(), [], 'empty storage loads as []');
const session=c.AHAChatPersistence.getOrCreateCurrentSession({now:'2026-01-01T00:00:00.000Z'});
assert.equal(session.type,'aha_chat_session');
const user=c.AHAChatPersistence.appendUserMessage('Dette er en viktig prosjektbeslutning om AHA og begreper som bør huskes.', {project:'AHA', concepts:['chat-minne']});
assert.equal(user.role,'user');
const assistant=c.AHAChatPersistence.appendAssistantMessage('Dette er et godt evaluert AHA-svar som oppsummerer beslutningen og neste steg for prosjektet.', {concepts:['beslutning']});
c.AHAChatPersistence.attachAnswerPackage(assistant.id,{id:'pkg1',status:{ready:true,intent:'project'}});
c.AHAChatPersistence.attachAnswerEvaluation(assistant.id,{id:'eval1',score:82,status:'good',summary:'ok'});
const stats=c.AHAChatPersistence.collectChatStats();
assert.equal(stats.sessions,1); assert.equal(stats.messages,2); assert.equal(stats.userMessages,1); assert.equal(stats.assistantMessages,1); assert.equal(stats.withAnswerPackage,1); assert.equal(stats.withEvaluation,1);
c.AHAChatPersistence.appendUserMessage('kort');
c.AHAChatPersistence.appendAssistantMessage('AHA analyserer teksten …');
const selected=c.AHAChatPersistence.selectMessagesForIntake({minLength:20});
assert.ok(selected.items.length >= 2); assert.ok(selected.reasons.short >= 1); assert.ok(selected.reasons.technical >= 1);
const candidates=c.AHAChatPersistence.buildChatIntakeCandidates({minLength:20});
assert.ok(candidates.items.every(i=>i.source==='aha_chat' && i.status==='review'));
assert.ok(candidates.items.every(i=>i.consent.useForTrainingCorpus===false), 'chat must not become training corpus automatically');

run(c,'js/ahaDataIntake.js');
run(c,'js/ahaSourceConnectors.js');
const status=c.AHASourceConnectors.collectConnectorStatus();
assert.equal(status.connectors.find(x=>x.source==='aha_chat').status, 'active');
const scan=c.AHASourceConnectors.scanSource('aha_chat');
assert.ok(scan.added >= 2, 'scanSource pushes chat candidates to Data Intake');
assert.equal(c.AHADataIntake.collectIntakeStats().trainingReady, 0, 'chat candidates are not training-ready before approval');

assert.ok(fs.readFileSync('intake.html','utf8').includes('Skann Chat'));
assert.ok(fs.readFileSync('chat.html','utf8').includes('js/ahaChatPersistence.js'));
const chatSource = fs.readFileSync('js/ahaChat.js','utf8');
assert.match(chatSource, /const savingEnabled = isAhaSavingEnabled\(\);[\s\S]*persistedUserMessage = savingEnabled \? global\.AHAChatPersistence\?\.appendUserMessage/, 'user chat persistence must respect the save-new-insights toggle');
assert.match(chatSource, /persistedAssistantMessage = savingEnabled \? global\.AHAChatPersistence\?\.appendAssistantMessage/, 'assistant chat persistence must respect the save-new-insights toggle');
assert.ok(chatSource.includes('if (savingEnabled) global.AHAChatPersistence?.appendAssistantMessage?.("AHA-agenten er ikke tilgjengelig akkurat nå."'), 'assistant error persistence must respect the save-new-insights toggle');
assert.ok(fs.readFileSync('js/ahaProductIntegration.js','utf8').includes('chatPersistenceAvailable'));
assert.ok(fs.readFileSync('js/ahaPersonalAiControl.js','utf8').includes('chatPersistence'));
assert.ok(fs.readFileSync('js/metaInsightsAgent.js','utf8').includes('chatPersistencePack'));
console.log('AHA Chat Persistence + Connector tests passed');
