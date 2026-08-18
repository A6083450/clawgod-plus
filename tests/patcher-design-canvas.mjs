#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { getPatcherSources, seedPatcherAcorn } from './patcher-test-sources.mjs';
import { patchRegistries } from '../src/generic/patcher/registry.mjs';

// ─── Static wiring assertions ─────────────────────────────────────────

const unixInstaller = readFileSync(new URL('../src/template/install.sh', import.meta.url), 'utf8');
const powerShellInstaller = readFileSync(new URL('../src/template/install.ps1', import.meta.url), 'utf8');
const wrapper = readFileSync(new URL('../src/generic/runtime/wrapper.cjs', import.meta.url), 'utf8');
const extractor = readFileSync(new URL('../src/generic/runtime/extractor.mjs', import.meta.url), 'utf8');
const repatcher = readFileSync(new URL('../src/generic/runtime/repatcher.mjs', import.meta.url), 'utf8');
const featuresJson = readFileSync(new URL('../src/generic/features.json', import.meta.url), 'utf8');
const enhancementsJson = readFileSync(new URL('../src/generic/enhancements.json', import.meta.url), 'utf8');
const registrySource = readFileSync(new URL('../src/generic/patcher/registry.mjs', import.meta.url), 'utf8');

assert.match(unixInstaller, /rm -rf "\$CLAWGOD_DIR\/assets"/, 'unix uninstall must remove the extracted assets directory');
assert.match(unixInstaller, /mv "\$RUNTIME_CANDIDATE_DIR\/assets" "\$CLAWGOD_DIR\/assets"/, 'unix installer must publish extracted assets into ~/.clawgod');
assert.match(powerShellInstaller, /"assets","\.source-version"/, 'windows uninstall must remove the extracted assets directory');
assert.match(powerShellInstaller, /Move-Item -LiteralPath \$candidateAssets -Destination \$assetsTarget -Force/, 'windows installer must publish extracted assets into ~/.clawgod');
assert.match(wrapper, /CLAWGOD_DESIGN_PAYLOAD/, 'wrapper must export CLAWGOD_DESIGN_PAYLOAD');
assert.match(wrapper, /payload\.template\.html\.asset/, 'wrapper must point the design payload env at the extracted asset');
assert.match(extractor, /m\.loader === 'file' \|\| m\.name\.endsWith\('\.asset'\)/, 'extractor must keep loader=file assets');
assert.match(repatcher, /candidateAssets/, 'repatch must publish extracted assets on version drift');
assert.equal(JSON.parse(featuresJson)['tengu_ethereal_nova'], true, 'features.json must enable tengu_ethereal_nova');
assert.equal(JSON.parse(featuresJson)['tengu_omelette_fouet'], true, 'features.json must enable tengu_omelette_fouet');
assert.equal(JSON.parse(featuresJson)['tengu_slate_quill'], true, 'features.json must enable tengu_slate_quill');
assert.match(enhancementsJson, /\{ "id": "design-canvas", "kind": "patch" \}/, 'design-canvas must be registered as a patch enhancement');
assert.match(registrySource, /designCanvasRegistry/, 'patcher registry must import designCanvasRegistry');

const designCanvasRegistry = patchRegistries.find((registry) => registry.id === 'design-canvas');
assert.ok(designCanvasRegistry, 'design-canvas registry must be part of the patcher registries');
assert.equal(designCanvasRegistry.patches.length, 2, 'design-canvas must ship exactly the gate and payload patches');

// ─── Synthetic fixture (2.1.234 shape) ────────────────────────────────

const fixture = `
// Version: 2.1.234 design canvas shape
function yt(){}
function KJ(){return ez()!==null?iCe():(rQt()&&iCe()&&a7o())}
function Bla(){return KJ()&&tt("tengu_ethereal_nova",!1)}
function Xte(){return"capabilities"in tLe().shape}
var s0g={};yt(s0g,{DESIGN_CANVAS_COMMAND_NAME:()=>o0g,isDesignCanvasSkillEnabled:()=>i0g,registerDesignCanvasSkill:()=>ngE});function i0g(){return Bla()&&Xte()}
function t_i(){if(!Is("allow_design_sync"))return!1;if(ia())return!1;if(!Sd())return!1;return tt(B5S,!1)}
var Uas="/$bunfs/root/payload.template.html.asset";
var QEg="payload.template.html",e0g="seed-canvas.mjs";
globalThis.isDesignCanvasSkillEnabled=i0g;
globalThis.payloadPath=()=>Uas;
`;

const patcherSources = await getPatcherSources();
for (const [installerName, patcherSource] of patcherSources) {
  const name = `${installerName} design canvas`;
  const dir = mkdtempSync(join(tmpdir(), 'clawgod-design-canvas-'));
  try {
    seedPatcherAcorn(dir);
    writeFileSync(join(dir, 'patch.mjs'), patcherSource, 'utf8');
    writeFileSync(join(dir, 'cli.original.cjs'), fixture, 'utf8');

    const run = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    const output = run.stdout + run.stderr;
    assert.equal(run.status, 0, `${name}: ${output}`);
    assert.match(output, /Result: \d+ applied, \d+ skipped, 0 failed/, `${name}: expected applied summary`);

    const patched = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
    assert.equal(
      patched.match(/\/\*__clawgod_design_canvas__\*\//g)?.length,
      1,
      `${name}: canvas enable marker must be present exactly once`,
    );
    assert.equal(
      patched.match(/\/\*__clawgod_design_payload__\*\//g)?.length,
      1,
      `${name}: payload path marker must be present exactly once`,
    );
    assert.match(
      patched,
      /function i0g\(\)\{return!0\/\*__clawgod_design_canvas__\*\/\}/,
      `${name}: canvas gate must be rewritten to always-on`,
    );
    assert.doesNotMatch(
      patched,
      /function i0g\(\)\{return Bla\(\)&&Xte\(\)\}/,
      `${name}: canvas gate must no longer consult the login/subscription chain`,
    );

    // Behavior: the gate is always-on without claude.ai state, and the
    // payload path honours CLAWGOD_DESIGN_PAYLOAD with the bunfs fallback.
    const plain = { process: { env: {} } };
    runInNewContext(patched, plain);
    assert.equal(plain.isDesignCanvasSkillEnabled(), true, `${name}: canvas command must be enabled without a claude.ai login`);
    assert.equal(plain.payloadPath(), '/$bunfs/root/payload.template.html.asset', `${name}: payload path must fall back to the bunfs embed path`);
    const withPayload = {
      process: { env: { CLAWGOD_DESIGN_PAYLOAD: '/installed/assets/payload.template.html.asset' } },
    };
    runInNewContext(patched, withPayload);
    assert.equal(withPayload.payloadPath(), '/installed/assets/payload.template.html.asset', `${name}: payload path must honour CLAWGOD_DESIGN_PAYLOAD`);

    const rerun = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(rerun.status, 0, `${name} idempotence: ${rerun.stdout}${rerun.stderr}`);
    assert.equal(
      readFileSync(join(dir, 'cli.original.cjs'), 'utf8'),
      patched,
      `${name}: applying the patcher twice must not change the output again`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // Shifted shape: an altered gate body must make the optional patch
  // skip without failing the run or touching the target.
  const shiftedName = `${installerName} design canvas shifted shape`;
  const shiftedDir = mkdtempSync(join(tmpdir(), 'clawgod-design-canvas-shifted-'));
  try {
    seedPatcherAcorn(shiftedDir);
    writeFileSync(join(shiftedDir, 'patch.mjs'), patcherSource, 'utf8');
    writeFileSync(
      join(shiftedDir, 'cli.original.cjs'),
      fixture.replace(
        'isDesignCanvasSkillEnabled:()=>i0g,registerDesignCanvasSkill:()=>ngE});function i0g(){return Bla()&&Xte()}',
        'isDesignCanvasSkillEnabled:()=>i0g,registerDesignCanvasSkill:()=>ngE});function i0g(){return Bla()||Xte()}',
      ),
      'utf8',
    );
    const run = spawnSync(process.execPath, ['patch.mjs'], { cwd: shiftedDir, encoding: 'utf8' });
    const output = run.stdout + run.stderr;
    assert.equal(run.status, 0, `${shiftedName}: optional mismatch must not fail the patcher: ${output}`);
    assert.match(output, /Design canvas enable \(skip claude\.ai login\/subscription gate\).*skipped/s, `${shiftedName}: shifted canvas gate must be reported as skipped`);
  } finally {
    rmSync(shiftedDir, { recursive: true, force: true });
  }
}

// ─── Windows embed-path shape (B:/~BUN/root/...) ───────────────────────

const windowsFixture = `
// Version: 2.1.234 design canvas shape (win32)
function yt(){}
function KJ(){return ez()!==null?iCe():(rQt()&&iCe()&&a7o())}
function Bla(){return KJ()&&tt("tengu_ethereal_nova",!1)}
function Xte(){return"capabilities"in tLe().shape}
var s0g={};yt(s0g,{DESIGN_CANVAS_COMMAND_NAME:()=>o0g,isDesignCanvasSkillEnabled:()=>i0g,registerDesignCanvasSkill:()=>ngE});function i0g(){return Bla()&&Xte()}
var Bas="B:/~BUN/root/payload.template.html.asset";
globalThis.isDesignCanvasSkillEnabled=i0g;
globalThis.payloadPath=()=>Bas;
`;

for (const [installerName, patcherSource] of patcherSources) {
  const name = `${installerName} design canvas win32`;
  const dir = mkdtempSync(join(tmpdir(), 'clawgod-design-canvas-win32-'));
  try {
    seedPatcherAcorn(dir);
    writeFileSync(join(dir, 'patch.mjs'), patcherSource, 'utf8');
    writeFileSync(join(dir, 'cli.original.cjs'), windowsFixture, 'utf8');
    const run = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(run.status, 0, `${name}: ${run.stdout}${run.stderr}`);
    const patched = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
    assert.equal(
      patched.match(/\/\*__clawgod_design_payload__\*\//g)?.length,
      1,
      `${name}: Windows B:/~BUN embed path must be rewritten exactly once`,
    );
    assert.match(
      patched,
      /var Bas=process\.env\.CLAWGOD_DESIGN_PAYLOAD\|\|"B:\/~BUN\/root\/payload\.template\.html\.asset"\/\*__clawgod_design_payload__\*\//,
      `${name}: Windows fallback must keep the original B:/~BUN path`,
    );
    const withPayload = {
      process: { env: { CLAWGOD_DESIGN_PAYLOAD: 'C:/installed/assets/payload.template.html.asset' } },
    };
    runInNewContext(patched, withPayload);
    assert.equal(withPayload.payloadPath(), 'C:/installed/assets/payload.template.html.asset', `${name}: Windows payload path must honour CLAWGOD_DESIGN_PAYLOAD`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ─── Optional real-bundle cross-check (local install) ─────────────────

const realBundle = join(homedir(), '.clawgod', 'cli.original.cjs');
if (existsSync(realBundle)) {
  const content = readFileSync(realBundle, 'utf8');
  for (const patch of designCanvasRegistry.patches) {
    if (content.includes(patch.appliedMarker)) {
      assert.equal(
        content.match(new RegExp(patch.appliedMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length,
        1,
        `real bundle: '${patch.name}' must stay applied exactly once`,
      );
      continue;
    }
    const matches = [...content.matchAll(patch.pattern)];
    assert.equal(
      matches.length,
      1,
      `real bundle: '${patch.name}' recognizer must match exactly once (got ${matches.length})`,
    );
    const replaced = content.replace(patch.pattern, patch.replacer);
    assert.notEqual(replaced, content, `real bundle: '${patch.name}' must change the bundle`);
    assert.ok(
      replaced.includes(patch.appliedMarker),
      `real bundle: '${patch.name}' replacement must carry its applied marker`,
    );
  }
}

console.log('patcher design canvas checks passed');
