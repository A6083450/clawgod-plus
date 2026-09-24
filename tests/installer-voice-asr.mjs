#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serializeEnhancementConfig } from '../src/generic/enhancement-config.mjs';
import { enhancementManifest } from '../src/generic/patcher/registry.mjs';
import { runtimeFeatureMetadata } from '../src/generic/patcher/runtime-features.mjs';
import { publishVendorTransaction } from '../src/generic/runtime/vendor-transaction.mjs';
import { installVoiceAsr, voiceAsrFiles, verifyVoiceAsrFile } from '../src/generic/runtime/install-voice-asr.mjs';
const root=mkdtempSync(join(tmpdir(),'clawgod-asr-install-'));
try {
  for(const target of ['darwin-arm64','darwin-x64','linux-x64','win32-x64'])assert.equal(voiceAsrFiles(target).length,4);
  assert.throws(()=>voiceAsrFiles('linux-arm64'),/unsupported/i);
  assert.throws(()=>verifyVoiceAsrFile('index.js',Buffer.from('untrusted')),/checksum/i);
  let fetches=0;
  const badFetch=async()=>{fetches++;return new Response('untrusted')};
  await assert.rejects(installVoiceAsr(root,{target:'linux-x64',download:badFetch}),/checksum/i);
  assert.equal(fetches,1);assert.deepEqual(readdirSync(join(root,'vendor')),[], 'failed staging removed');
  const dir=join(root,'vendor','cometix-asr');mkdirSync(dir);writeFileSync(join(dir,'index.js'),'user file');
  await assert.rejects(installVoiceAsr(root,{target:'linux-x64',download:badFetch}),/existing.*preserved/i);
  assert.equal(readFileSync(join(dir,'index.js'),'utf8'),'user file');assert.equal(fetches,1);
  rmSync(dir,{recursive:true});
  if(process.platform!=='win32') {
    const outside=join(root,'outside');mkdirSync(outside);symlinkSync(outside,dir);
    await assert.rejects(installVoiceAsr(root,{target:'linux-x64',download:badFetch}),/symlink|directory/i);
    assert.deepEqual(readdirSync(outside),[]);assert.equal(fetches,1);
    rmSync(dir);rmSync(join(root,'vendor'),{recursive:true});symlinkSync(outside,join(root,'vendor'));
    await assert.rejects(installVoiceAsr(root,{target:'linux-x64',download:badFetch}),/symlink|directory/i);
    assert.equal(fetches,1);
  }
  // Updating Claude's native runtime must not discard an already working optional addon.
  for (const fail of [false,true]) {
    const base=join(root,'transaction-'+fail),live=join(base,'vendor'),tx=join(base,'tx'),candidate=join(tx,'candidate');
    mkdirSync(join(live,'cometix-asr'),{recursive:true});mkdirSync(candidate,{recursive:true});
    writeFileSync(join(live,'cometix-asr','original'),'keep');writeFileSync(join(live,'old.node'),'old');writeFileSync(join(candidate,'new.node'),'new');
    const publish=()=>publishVendorTransaction({liveVendor:live,candidateVendor:candidate,transactionDir:tx,validatePublished:()=>{if(fail)throw Error('forced failure')}});
    if(fail)assert.throws(publish,/rollback complete/);else publish();
    rmSync(tx,{recursive:true});assert.equal(readFileSync(join(live,'cometix-asr','original'),'utf8'),'keep');
  }
  // Exercise the shipped CLI's real persisted-selection/runtime-gate path without downloads.
  const home=join(root,'home'), installed=join(home,'.clawgod');mkdirSync(installed,{recursive:true,mode:0o700});
  for(const [source,target] of [
    ['runtime/install-voice-asr.mjs','install-voice-asr.mjs'],['runtime/proxy-fetch.mjs','proxy-fetch.mjs'],
    ['enhancement-config.mjs','enhancement-config.mjs'],['enhancements.json','enhancement-manifest.json'],
  ])copyFileSync(new URL('../src/generic/'+source,import.meta.url),join(installed,target));
  const featureSource=readFileSync(new URL('../src/generic/runtime/feature-gates.cjs',import.meta.url),'utf8').replace('@@CLAWGOD_RUNTIME_FEATURE_METADATA@@',JSON.stringify(runtimeFeatureMetadata));
  writeFileSync(join(installed,'feature-gates.cjs'),featureSource);
  for(const [selection,patches,overrides] of [
    [{schemaVersion:1,mode:'custom',enabled:[]},{},{}],
    [{schemaVersion:1,mode:'all',enabled:[]},{},{CLAUDE_CODE_ASR:'0'}],
    [{schemaVersion:1,mode:'all',enabled:[]},{'voice-asr-backend':false},{}],
    [{schemaVersion:1,mode:'all',enabled:[]},{'voice-mode':false},{}],
    [{schemaVersion:1,mode:'all',enabled:[]},{},{CLAWGOD_FEATURE_VOICE_ASR_BACKEND:'false'}],
  ]) {
    writeFileSync(join(installed,'enhancements.json'),serializeEnhancementConfig(selection,enhancementManifest),{mode:0o600});writeFileSync(join(installed,'patches.json'),JSON.stringify(patches));
    const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.startsWith('CLAWGOD_FEATURE_')&&name!=='CLAUDE_CODE_ASR'));
    const child=Bun.spawnSync([process.execPath,join(installed,'install-voice-asr.mjs'),installed],{env:{...env,HOME:home,...overrides},stdout:'pipe',stderr:'pipe',timeout:5000});
    assert.equal(child.exitCode,0,child.stderr.toString());assert.match(child.stdout.toString(),/skipped/);
    assert.equal(readdirSync(installed).includes('vendor'),false);
  }
  console.log('PASS ASR installer: pinned files, integrity, unsupported target, no overwrite, symlink refusal');
} finally {rmSync(root,{recursive:true,force:true})}
