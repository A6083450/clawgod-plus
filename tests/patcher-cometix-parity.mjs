#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { seedPatcherAcorn } from './patcher-test-sources.mjs';
import { createPatchSelection, enhancementManifest } from '../src/generic/patcher/registry.mjs';
import { resolveEnhancementSelection } from '../src/generic/enhancement-config.mjs';
import { runtimeFeatureMetadata } from '../src/generic/patcher/runtime-features.mjs';
import { cometixPatches } from '../src/generic/patcher/enhancements/cometix.mjs';

const rootDir = mkdtempSync(join(tmpdir(), 'clawgod-cometix-'));
seedPatcherAcorn(rootDir);
const evaluate = (source, env = {}, gates = {}) => {
  const ctx = { process: { env }, globalThis: {}, queueMicrotask, Map, Promise };
  ctx.globalThis = ctx;
  ctx.__clawgodPatches = gates;
  runInNewContext(source, ctx);
  return ctx;
};
async function patch(id, source) {
  const d = cometixPatches.find(d => d.id === id);
  assert.ok(d, id);
  const result = await d.apply(source, { rootDir });
  assert.equal(result.status, 'applied', `${id}: ${result.detail}`);
  assert.equal((await d.apply(result.code, { rootDir })).status, 'already', `${id} idempotent`);
  const dry = await d.apply(source, { rootDir, dryRun: true });
  assert.equal(dry.code, source, 'dry run does not mutate');
  return result.code;
}
try {
  assert.deepEqual(cometixPatches.map(p=>p.id), ['chrome-local-socket','classifier-fail-open','classifier-model','cleanup-period','computer-use','context-limit','disable-collapse-read-search','enable-keybindings','enable-voice-mode','file-read-limit','transcript-dialog-replay','unlock-ultracode','voice-asr-backend']);
  assert.equal(enhancementManifest.some(p => p.id === 'voice-asr-backend'), false, 'external ASR enhancement removed');
  assert.deepEqual(runtimeFeatureMetadata['voice-asr-backend'], ['voice-asr-backend'], 'original ASR runtime switch restored');
  assert.throws(() => createPatchSelection(['voice-asr-backend']), /Unknown enabled enhancement/);
  assert.equal(existsSync(new URL('../src/generic/runtime/voice-asr.mjs', import.meta.url)), false, 'external ASR adapter removed');
  assert.ok(createPatchSelection(['voice']).customPatches.some(p => p.id === 'enable-voice-mode'), 'ordinary voice enhancement retained');
  assert.deepEqual(createPatchSelection(['cleanup-period']).customPatches.filter(p=>p.id).map(p=>p.id),['context-limit','cleanup-period']);
  assert.deepEqual(resolveEnhancementSelection({stored:{schemaVersion:1,mode:'custom',enabled:['chrome','voice','claude-hud']}},enhancementManifest).enabled,['chrome','voice','claude-hud'],'old custom selection does not auto-enable new enhancements');
  const cleanup = await patch('cleanup-period', 'var days=30;function retention(s){return s.cleanupPeriodDays??days}');
  assert.equal(evaluate(cleanup).retention({}), 9999);
  assert.equal(evaluate(cleanup).retention({cleanupPeriodDays: 7}), 7);
  assert.equal(evaluate(cleanup, {}, {'cleanup-period':false}).retention({}), 30);
  const read = await patch('file-read-limit', 'var cap=25000;function defaultFileReadingLimits(s){return {maxTokens:s.maxTokens??cap}}');
  assert.equal(evaluate(read).defaultFileReadingLimits({}).maxTokens, 100000);
  assert.equal(evaluate(read, {}, {'file-read-limit':false}).defaultFileReadingLimits({}).maxTokens, 25000);
  const context = await patch('context-limit', 'function context(m,c){if(process.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS)return 200000;if(m==="long")return 1e6;return 200000}');
  assert.equal(evaluate(context, {CLAUDE_CODE_CONTEXT_LIMIT:'350000'}).context('any'), 350000);
  for (const value of ['-1','NaN','Infinity','0','']) assert.equal(evaluate(context,{CLAUDE_CODE_CONTEXT_LIMIT:value}).context('long'), 1e6);
  const classifier = await patch('classifier-model', 'function classify(model){return [{classifierModel:model,classifierStage:"xml_s1"},{classifierModel:model,classifierStage:"xml_s2"}]}');
  assert.equal(evaluate(classifier,{CLAUDE_CLASSIFIER_MODEL:'cheap'}).classify('base')[0].classifierModel,'cheap');
  assert.equal(evaluate(classifier,{CLAWGOD_CLASSIFIER_MODEL:'chosen',CLAUDE_CLASSIFIER_MODEL:'cheap'}).classify('base')[0].classifierModel,'chosen');
  const denySource = 'function verdict(){let log="denying with retry guidance";return {behavior:"deny",message:"classifier down: "+httpStatus+errorKind,decisionReason:{type:"classifier",classifier:"auto-mode"}}};function unsafe(){return {behavior:"deny",message:"unsafe",classifier:"auto-mode",noVerdict:false}};var httpStatus=503,errorKind="network";';
  const deny = await patch('classifier-fail-open', denySource);
  assert.equal(evaluate(deny).verdict().behavior,'ask');
  assert.equal(evaluate(deny).unsafe().behavior,'deny');
  assert.equal(evaluate(deny,{}, {'classifier-fail-open':false}).verdict().behavior,'deny');
  const ctrl = await patch('enable-keybindings', 'function flag(n,d){return d};function keys(){return {enabled:flag("tengu_keybinding_customization_release",!1),"ctrl+c":"app:interrupt"}}');
  assert.equal(evaluate(ctrl).keys()['ctrl+c'],'app:exit');
  assert.equal(evaluate(ctrl).keys().enabled,true);
  assert.equal(evaluate(ctrl,{}, {'enable-keybindings':false}).keys()['ctrl+c'],'app:interrupt');
  const ultra = await patch('unlock-ultracode','function capability(m){return ["claude-3-"].includes(m)&&flags("xhigh_effort")}function flags(){return false}');
  assert.equal(evaluate(ultra).capability('other'),true);
  assert.equal(evaluate(ultra,{}, {'unlock-ultracode':false}).capability('other'),false);
  const chrome = await patch('chrome-local-socket','function chrome(c){return c.bridgeConfig?bridge(c):c.getSocketPaths?socket(c):native(c)}function bridge(c){return "bridge"}function socket(c){return "socket"}function native(c){return "native"}');
  const client = {bridgeConfig:{},getSocketPaths:async()=>[]};
  assert.equal(evaluate(chrome).chrome(client),'socket');assert.equal(client.bridgeConfig,undefined);
  assert.equal(evaluate(chrome,{}, {'chrome-local-socket':false}).chrome({bridgeConfig:{}}),'bridge');
  const computer = await patch('computer-use','function managed(v){return true}function paid(){return false}function config(){return {enabled:false}}function canUse(){if(managed("hipaa"))return!1;return paid()&&config().enabled}');
  assert.equal(evaluate(computer,{CLAUDE_CODE_COMPUTER_USE:'1'}).canUse(),false,'HIPAA preserved');
  const permitted = computer.replace('return true','return false');
  assert.equal(evaluate(permitted,{CLAUDE_CODE_COMPUTER_USE:'1'}).canUse(),true);
  assert.equal(evaluate(permitted).canUse(),false,'env override only');
  const malformed = await cometixPatches.find(d=>d.id==='cleanup-period').apply('var a=30,b=30;function r(s){return [s.cleanupPeriodDays??a,s.cleanupPeriodDays??b]}',{rootDir});
  assert.equal(malformed.status,'failed','ambiguous binding fails closed');
  const split = await patch('cleanup-period','export const unrelated=1;\n/*__CLAWGOD_MODULE_BOUNDARY__*/\nimport {unrelated} from "./x.js";var days=30;function retention(s){return s.cleanupPeriodDays??days}');
  assert.ok(split.includes('9999'));

  const foldFixture = `
function fullscreen(){return false}
function classify(name,input,tools){if(fullscreen()&&name==="ToolSearch"||name==="Task")return{isCollapsible:true,isAbsorbedSilently:true,popsOutOnError:true};return{isCollapsible:true,isAbsorbedSilently:name==="REPL",isREPL:name==="REPL",isSearchOrReadCommand:tools}}
function admit(message,tools){let info=classify(message.name,{},tools);if(message.type==="grouped_tool_use"){}if(!info)return null;return{...info,toolUseIds:[],readPaths:[],isAbsorbedSilently:info.isAbsorbedSilently}}
function settle(message,tools,extra){if(message.type==="redacted_thinking"||message.type==="grouped_tool_use"||message.type==="recap_fold")return-1;return classify(message.name,{},tools).isCollapsible?-1:0}
`;
  const fold = await patch('disable-collapse-read-search',foldFixture);
  const foldedSplit = await patch('disable-collapse-read-search',foldFixture.replace('function settle','\n/*__CLAWGOD_MODULE_BOUNDARY__*/\nfunction settle'));
  assert.equal(evaluate(foldedSplit).settle({name:'Read'},[]),0,'settle scanner in a separate chunk must be patched');
  const folding = evaluate(fold);
  assert.equal(folding.admit({name:'Read'},[]),null);
  assert.equal(folding.admit({name:'REPL'},[]),null);
  assert.ok(folding.admit({name:'ToolSearch'},[]));
  assert.ok(folding.admit({name:'Task'},[]));
  assert.equal(folding.settle({name:'Read'},[]),0);
  assert.equal(folding.settle({name:'ToolSearch'},[]),-1);
  assert.ok(evaluate(fold,{}, {'disable-collapse-read-search':false}).admit({name:'Read'},[]));

  const voice = await patch('enable-voice-mode', `
function flags(){return false}function permitted(){return false}function voiceFlag(){return flags("allow_voice_mode")}function voiceGate(){return permitted()&&voiceFlag()}
function buildConfig(input){let{settingsData:settings,setSettingsData:setSettings,setAppState:setApp,changeLog:changes}=input;function save(value){return input.write("userSettings",value)}return[{id:"autoCompact",value:true}]}
`);
  const voiceCtx = evaluate(voice);assert.equal(voiceCtx.voiceGate(),true);
  let settings={voice:{language:'zh',enabled:false}},app={settings:{other:true}},recorded=0;
  const input={settingsData:settings,setSettingsData:fn=>{settings=fn(settings)},setAppState:fn=>{app=fn(app)},changeLog:{record(){recorded++}},write:async(scope,data)=>{assert.equal(scope,'userSettings');return {}}};
  const row=voiceCtx.buildConfig(input)[0];assert.equal(row.id,'voiceMode');
  await row.onChange('tap');assert.equal(settings.voice.mode,'tap');assert.equal(settings.voice.language,'zh');assert.equal(app.settings.other,true);assert.equal(recorded,1);
  assert.ok((await row.onChange('invalid')).error);
  const failedRow=voiceCtx.buildConfig({...input,write:async()=>({error:'disk full'})})[0];
  assert.equal((await failedRow.onChange('hold')).error,'disk full');assert.equal(recorded,1);
  assert.equal(evaluate(voice,{}, {'enable-voice-mode':false}).buildConfig(input)[0].id,'autoCompact');
  assert.equal(evaluate(voice,{}, {'enable-voice-mode':false}).voiceGate(),false);

  const channel = await patch('transcript-dialog-replay', `
function bus(){let listeners=new Set;return{subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},emit(value){for(let fn of listeners)fn(value)}}}
function dialogs(){let events=bus(),cancel=bus(),updates=bus(),pending=new Map,serial=0,subscribers=0;return{
subscribe(listener){subscribers+=1;let stop=events.subscribe(listener);return()=>{subscribers--;stop()}},onUpdate:updates.subscribe,
reply(reply){let resolve=pending.get(reply.id);if(!resolve)return;pending.delete(reply.id);resolve(reply)},
request(payload,options){let id="dialog-"+(++serial),resolve,promise=new Promise(r=>resolve=r),signal=options?.signal;if(signal?.aborted||subscribers===0)return queueMicrotask(()=>resolve({id,cancelled:!0})),{id,replied:promise};pending.set(id,resolve);if(signal)signal.addEventListener("abort",()=>{if(pending.delete(id))resolve({id,cancelled:!0})},{once:true});events.emit({id,payload,onFirstReveal:options?.onFirstReveal});return{id,replied:promise,update:(value)=>{if(pending.has(id))updates.emit({id,payload:value})}}}
}}
`);
  const dialogs=evaluate(channel).dialogs(), events=[];
  const pending=dialogs.request('test'); const stop=dialogs.subscribe(event=>events.push(event));
  await new Promise(resolve=>queueMicrotask(resolve));assert.equal(events.length,1);assert.equal(events[0].id,pending.id);
  dialogs.reply({id:pending.id,approved:true});assert.equal((await pending.replied).approved,true);stop();
  const nextEvents=[];dialogs.subscribe(event=>nextEvents.push(event));await new Promise(resolve=>queueMicrotask(resolve));assert.equal(nextEvents.length,0);
  const isolated=evaluate(channel).dialogs(), abort=new AbortController;
  const cancelled=isolated.request('cancel',{signal:abort.signal});isolated.subscribe(event=>nextEvents.push(event));abort.abort();
  assert.equal((await cancelled.replied).cancelled,true);await new Promise(resolve=>queueMicrotask(resolve));assert.equal(nextEvents.length,0,'abort before queued replay');
  const disposing=evaluate(channel).dialogs(), stale=[];
  disposing.request('detached');const unsubscribe=disposing.subscribe(event=>stale.push(event));unsubscribe();
  await new Promise(resolve=>queueMicrotask(resolve));assert.equal(stale.length,0,'unsubscribed listener must not receive deferred replay');
  const updating=evaluate(channel).dialogs(), latest=[];
  const request=updating.request('initial');request.update('updated');updating.subscribe(event=>latest.push(event));
  request.update('latest-before-replay');await new Promise(resolve=>queueMicrotask(resolve));
  assert.equal(latest[0].payload,'latest-before-replay','replay must use latest payload, including updates after subscription');
  const off=evaluate(channel,{}, {'transcript-dialog-replay':false}).dialogs();assert.equal((await off.request('off').replied).cancelled,true);

  console.log('Cometix patch parity checks passed');
} finally { rmSync(rootDir,{recursive:true,force:true}); }
