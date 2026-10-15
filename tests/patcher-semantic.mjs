#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { getPatcherSources } from './patcher-test-sources.mjs';

const source = `
// function userType(){return"external"} name:"ultraplan"
const decoy='function userType(){return"external"}';
function userType () { return 'external'; }
function standalone () { return Bun.isStandaloneExecutable === true; }
function voice () { return !flag('tengu_amber_quartz_disabled', false); }
const config={pixelValidation:123, 'enabled':false};
const command={isEnabled(){'use strict';return this.allowed}, availability:['claude-ai'], extra:{name:'nested'}, 'name':'ultraplan', allowed:false};
const neighbor={name:'other',isEnabled:()=>false};
class GrowthBook {
  environmentOverridesParsed=false;environmentOverrides={};
  deps={readEnvironmentOverrides(){return '{"flag":true}'}};
  getEnvironmentOverrides(){
    if(this.environmentOverridesParsed)return this.environmentOverrides;
    return this.environmentOverridesParsed=true,this.environmentOverrides;
    const renamed=this.deps.readEnvironmentOverrides();
    this.environmentOverrides=JSON.parse(renamed);
    return this.environmentOverrides;
  }
}
function dateText (input) {let info=probe(),mark=apostrophe(info?.known??false,info?.labKw??false),formatted=info?.cnTZ?input.replaceAll('-', '/'):input;return\`Today\${mark}s date is \${formatted}.\`}
function remoteEligibilityDetails(){remoteLog('Remote settings: checking eligibility');return{eligible:remoteUpstream()}}
function remoteSettingsEligibility(){let cached=readRemoteCache();if(cached!==void 0)return cached;let{eligible}=remoteEligibilityDetails();return eligible}
`;
const root = mkdtempSync(join(tmpdir(), 'clawgod-semantic-'));
try {
  for (const [label, runner] of await getPatcherSources()) {
    const dir = join(root, label.replaceAll(' ', '-'));
    mkdirSync(join(dir, 'chunks'), { recursive: true });
    const entry = join(dir, 'cli.original.cjs'), chunk = join(dir, 'chunks', 'feature.js');
    const patcher = join(dir, 'patch.mjs');
    writeFileSync(patcher, runner);
    writeFileSync(entry, 'export {}; function remoteEligibilityDetails(){return {eligible:true}}');
    writeFileSync(chunk, source);
    const run = (...args) => spawnSync(process.execPath, [patcher, ...args], { encoding: 'utf8', timeout: 30000, env: { ...process.env, HTTPS_PROXY: 'http://127.0.0.1:1' } });
    for (const arg of ['--dry-run', '--verify']) {
      const result = run(arg);
      assert.equal(result.status, 0, `${label}: ${result.stdout}${result.stderr}`);
      assert.equal(readFileSync(chunk, 'utf8'), source);
    }
    const result = run();
    assert.equal(result.status, 0, `${label}: ${result.stdout}${result.stderr}`);
    const patched = readFileSync(chunk, 'utf8');
    assert.match(patched, /return ["']ant["']/, `${label}: semantic user type must be patched`);
    assert.ok(patched.includes("const decoy='function userType(){return\"external\"}';"), '字符串假锚点不可改写');
    assert.ok(patched.includes('// function userType(){return"external"} name:"ultraplan"'), '注释假锚点不可改写');
    for (const toggle of [undefined, true, false]) {
      let calls = 0;
      const context = {
        Bun: { isStandaloneExecutable: false }, flag: () => { calls++; return true; },
        probe: () => ({ cnTZ: true, known: true }), apostrophe: () => '’',
        remoteLog() {}, remoteUpstream: () => true, readRemoteCache: () => undefined,
        ...(toggle === undefined ? {} : { __clawgodPatches: Object.fromEntries(['voice-mode', 'computer-use-default', 'ultraplan', 'geo-stego-date', 'remote-settings-off'].map(id => [id, toggle])) }),
      };
      const values = runInNewContext(`${patched};const gb=new GrowthBook();[userType(),standalone(),voice(),config.enabled,command.isEnabled(),command.availability,neighbor.isEnabled(),gb.getEnvironmentOverrides().flag,gb.getEnvironmentOverrides().flag,dateText('2026-10-15'),remoteSettingsEligibility()]`, context);
      assert.deepEqual(JSON.parse(JSON.stringify(values)), ['ant', false, toggle !== false, toggle !== false, toggle !== false, toggle === false ? ['claude-ai'] : null, false, true, true, toggle === false ? 'Today’s date is 2026/10/15.' : "Today's date is 2026-10-15.", toggle === false]);
      assert.equal(calls, toggle === false ? 1 : 0);
    }
    const repeated = run();
    assert.equal(repeated.status, 0);
    assert.equal(readFileSync(chunk, 'utf8'), patched, '重复补丁不能嵌套 gate');
    assert.match(repeated.stdout, /Written:.*\(\+0 bytes\)/, '模块分隔符不是写入文件的新增字节');

    const drift = "const command={name:'ultraplan',isEnabled:futureGate};function userType(){return 'external'}";
    writeFileSync(chunk, drift);
    assert.equal(run().status, 1);
    assert.equal(readFileSync(chunk, 'utf8'), drift);
    const tolerated = run('--tolerate-stale');
    assert.equal(tolerated.status, 0, tolerated.stdout + tolerated.stderr);
    assert.match(tolerated.stdout, /AST matcher stale.*tolerated/);
    assert.match(readFileSync(chunk, 'utf8'), /return ["']ant["']/);

    for (const malformed of ["const command={name:'ultraplan',isEnabled:()=>false;", 'function plain(){ const x = ; }']) {
      writeFileSync(chunk, malformed);
      for (const args of [[], ['--tolerate-stale'], ['--dry-run'], ['--verify']]) {
        const failure = run(...args);
        assert.equal(failure.status, 1, failure.stdout + failure.stderr);
        assert.equal(readFileSync(chunk, 'utf8'), malformed);
      }
    }
    for (const args of [[], ['--dry-run'], ['--verify']]) {
      writeFileSync(chunk, 'function WE(){return Bun.isStandaloneExecutable===!0}function W1t(){if(WE())return{cmd:process.execPath,prefixArgs:[]};let t=process.argv[1];if(!t)return{cmd:process.execPath,prefixArgs:[]};return{cmd:process.execPath,prefixArgs:[t],env:{}}}');
      const staleResolver = run(...args, '--tolerate-stale');
      assert.equal(staleResolver.status, 0, staleResolver.stdout + staleResolver.stderr);
      assert.match(staleResolver.stdout, /known resolver shape.*tolerated/);
    }
    writeFileSync(chunk, 'const contextDefault = 200000; function userType(){return "external"}');
    assert.equal(run().status, 1);
    assert.equal(run('--tolerate-stale').status, 0, 'custom recognizer 漂移也能显式跳过');
    writeFileSync(chunk, 'function a(){if(!parsed)parsed=!0;return flags} function b(){if(!done)done=!0;return other}');
    assert.equal(run('--tolerate-stale').status, 1, '歧义不能被 stale 容错跳过');
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log('semantic patcher source/bundle checks passed');
