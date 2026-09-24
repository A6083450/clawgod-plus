#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { seedPatcherAcorn } from './patcher-test-sources.mjs';
import { cometixPatches } from '../src/generic/patcher/enhancements/cometix.mjs';
const rootDir = mkdtempSync(join(tmpdir(), 'clawgod-voice-'));
seedPatcherAcorn(rootDir);
try {
  const descriptor = cometixPatches.find(p => p.id === 'voice-asr-backend');
  assert.ok(descriptor, 'original ASR patch belongs to voice enhancement');
  const source = `async function connect(callbacks,options,other){let msg="No OAuth token available",url="VOICE_STREAM_BASE_URL";return "stock"}
var command={name:"voice",availability:["claude-ai"]},other={name:"other",availability:["claude-ai"]};
function auth(){if(!account())return false;let token=credentials();return token!==null&&token.accessToken!==null}function account(){return false}function credentials(){return null}function call(){if(!auth())return{type:"text",value:"Voice mode requires a Claude.ai account. Please run /login to sign in."};return "allowed"}
function voiceAuthProbe(){try{if(!account())return false;return auth()}catch{return false}}function voiceFlag(){return feature("allow_voice_mode")}function voiceGate(){return voiceAuthProbe()&&voiceFlag()}function feature(){return false}
export {connect,command,other,call,voiceAuthProbe,voiceFlag};`;
  const result = await descriptor.apply(source, { rootDir });
  assert.equal(result.status, 'applied', result.detail);
  assert.equal((await descriptor.apply(result.code, {rootDir})).status, 'already');
  assert.equal((await descriptor.apply(source, {rootDir,dryRun:true})).code, source);
  const legacy = result.code.replace('/*__clawgod_cometix_voice-asr-backend_v2__*/','/*__clawgod_cometix_voice-asr-backend__*/')
    .replace(/(function voiceAuthProbe\(\)\{)if\(.*?return!0;/,'$1')
    .replace(/(function voiceFlag\(\)\{)if\(.*?return!0;/,'$1');
  const upgraded=await descriptor.apply(legacy,{rootDir});assert.equal(upgraded.status,'applied',upgraded.detail);
  assert.equal(upgraded.code.match(/async function __ccppAsrConnect/g).length,1,'upgrade must not duplicate the adapter');
  assert.match(upgraded.code,/function voiceAuthProbe\(\)\{if\(/);
  assert.equal((await descriptor.apply(upgraded.code,{rootDir})).status,'already');
  const fixtureRoot=join(rootDir,'fixture');mkdirSync(fixtureRoot);
  const vendor = join(fixtureRoot,'vendor','cometix-asr');
  mkdirSync(vendor,{recursive:true});
  writeFileSync(join(vendor,'index.js'), `exports.startSession=(config,cb)=>{globalThis.asrCallback=cb;globalThis.asrConfig=config;return 7};exports.feedPcm=(id,pcm)=>{globalThis.asrPcm=pcm};exports.finalizeSession=()=>{};exports.closeSession=()=>{globalThis.asrClosed=true};`);
  for (const [index,subdir] of ['', 'chunks'].entries()) {
    const dir=join(fixtureRoot,subdir);mkdirSync(dir,{recursive:true});
    const file=join(dir,'voice.mjs');writeFileSync(file,result.code);
    const mod=await import(pathToFileURL(file).href);
    const previews=[], errors=[];let ready=0;
    const api=await mod.connect({onReady(){ready++},onTranscript:(...v)=>previews.push(v),onError:(...v)=>errors.push(v)},{});
    assert.ok(api);assert.equal(globalThis.asrConfig,'{}');
    assert.equal(mod.voiceAuthProbe(),true,'recording UI auth probe must use the alternate transport');assert.equal(mod.voiceFlag(),true,'recording UI voice flag must be enabled');
    globalThis.asrCallback(null,JSON.stringify({type:'ready'}));
    globalThis.asrCallback(null,JSON.stringify({type:'ready'}));
    assert.equal(ready,1);
    assert.equal(mod.command.availability,undefined);assert.deepEqual(mod.other.availability,['claude-ai']);assert.equal(mod.call(),'allowed');
    api.send(Buffer.from([0,0]));assert.equal(globalThis.asrPcm.length,2);
    for(const text of ['你好','你好世界'])globalThis.asrCallback(null,JSON.stringify({type:'transcript',text,stage:'interim'}));
    const done=api.finalize();
    for(let i=0;i<2;i++)globalThis.asrCallback(null,JSON.stringify({type:'transcript',text:'你好世界',stage:'session_final'}));
    assert.equal(await done,'session_final');assert.deepEqual(previews,[['你好',false],['你好世界',false],['你好世界',true]]);
    api.close();assert.equal(api.isConnected(),false);assert.equal(globalThis.asrClosed,true);assert.deepEqual(errors,[]);
  }
  for(const [name,gates,env] of [['disabled',{'voice-asr-backend':false},''],['voice-disabled',{'enable-voice-mode':false},''],['stock',{},'0']]) {
    globalThis.__clawgodPatches=gates;process.env.CLAUDE_CODE_ASR=env;
    const file=join(fixtureRoot,name+'.mjs');writeFileSync(file,result.code);
    const mod=await import(pathToFileURL(file).href);
    assert.equal(await mod.connect({},{}),'stock');assert.deepEqual(mod.command.availability,['claude-ai']);assert.match(mod.call().value,/requires/);assert.equal(mod.voiceAuthProbe(),false);assert.equal(mod.voiceFlag(),false);
  }
  delete globalThis.__clawgodPatches;delete process.env.CLAUDE_CODE_ASR;
  rmSync(vendor,{recursive:true});
  // A fresh location bypasses require's module cache and must not silently use stock ASR.
  const absent=join(fixtureRoot,'missing');mkdirSync(absent);writeFileSync(join(absent,'voice.mjs'),result.code);
  const mod=await import(pathToFileURL(join(absent,'voice.mjs')).href);let error;
  assert.equal(await mod.connect({onError:(msg,detail)=>{error=detail}},{}),null);
  assert.equal(error.connectFailureCode,'cometix_asr_missing');
  console.log('PASS original voice ASR bridge: legacy/chunks, previews/final, conditional command auth, missing vendor');
} finally { delete globalThis.__clawgodPatches;delete process.env.CLAUDE_CODE_ASR;rmSync(rootDir,{recursive:true,force:true}); }
