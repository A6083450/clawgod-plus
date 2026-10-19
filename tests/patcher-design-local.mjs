#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { getPatcherSources, seedPatcherAcorn } from './patcher-test-sources.mjs';

const fixture = readFileSync(new URL('./fixtures/design-local-2.1.303.js', import.meta.url), 'utf8');
for (const [label, source] of await getPatcherSources()) {
  const dir = mkdtempSync(join(tmpdir(), 'clawgod-design-local-'));
  try {
    seedPatcherAcorn(dir);
    writeFileSync(join(dir, 'patch.mjs'), source);
    writeFileSync(join(dir, 'cli.original.cjs'), '// Version: 2.1.303\n');
    mkdirSync(join(dir, 'chunks'));
    const chunk = join(dir, 'chunks', 'design.js');
    writeFileSync(chunk, fixture);
    const run = () => spawnSync(process.execPath, [join(dir, 'patch.mjs')], { encoding: 'utf8' });
    let result = run();
    assert.equal(result.status, 0, `${label}: ${result.stdout}${result.stderr}`);
    const patched = readFileSync(chunk, 'utf8');
    let spec;
    const evaluate = new Function('Nmt', 'oi', 'Bo', 'vs', 'at', 'hUe', patched);
    evaluate('design', value => { spec = value; }, () => null, {}, { login: {} }, 'cloud-policy');
    assert.equal(spec.isEnabled(), true, `${label}: /design must work without account capabilities`);
    assert.equal(spec.policyGate, undefined, `${label}: local design must not require a cloud policy`);
    assert.equal(spec.subcommands, undefined, `${label}: local design must not expose cloud login/sync commands`);
    const prompt = await spec.getPromptForCommand('本地中文海报');
    assert.match(prompt[0].text, /本地中文海报/);
    assert.match(prompt[0].text, /seed-canvas/);
    const files = typeof spec.files === 'function' ? await spec.files() : spec.files;
    assert.ok(files['seed-canvas.mjs'], `${label}: seed script must be bundled`);
    assert.ok(files['payload.template.html'], `${label}: editor payload must be bundled`);
    const skillDir = join(dir, 'skill');
    mkdirSync(skillDir);
    for (const [name, text] of Object.entries(files)) writeFileSync(join(skillDir, name), text);
    assert.equal(createHash('sha256').update(files['seed-canvas.mjs']).digest('hex'), '31a2a1528c7a30b624b7370cc542d8378a3643d97cc14ff3e6a4bce842878cd8');
    assert.equal(createHash('sha256').update(files['payload.template.html'].split('\n<!-- CLAWGOD_THIRD_PARTY_NOTICES\n')[0]).digest('hex'), '76a2b0a4e5d4efccc9b8c825ed70aa320179cbc95541755be2af50bfd6d36196');
    writeFileSync(join(dir, 'Main.dc.html'), '<!doctype html><html><head><meta charset="utf-8"><script src="./support.js"></script></head><body><x-dc><div><h1>本地中文海报</h1><p>&lt;/script&gt; 不得损坏状态</p></div></x-dc></body></html>');
    const seed = (...args) => spawnSync(process.execPath, [join(skillDir, 'seed-canvas.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
    const seeded = join(dir, 'local-poster.html');
    let seededRun = seed('--template', join(skillDir, 'payload.template.html'), '--out', seeded, '--title', '本地中文海报', '--artboard', 'Main.dc.html');
    assert.equal(seededRun.status, 0, `${label}: seed: ${seededRun.stdout}${seededRun.stderr}`);
    const doc = JSON.parse(readFileSync(seeded, 'utf8').match(/id="appifact-doc">\n([\s\S]*?)\n<\/script>/)[1]);
    assert.equal(doc.store, undefined, `${label}: output must not use an online live store`);
    for (const text of [files['payload.template.html'], readFileSync(seeded, 'utf8')]) {
      assert.ok(text.includes(files['LICENSE.md'].trim()), `${label}: template and generated HTML must retain bundled license notices`);
      assert.match(text, /Permission is hereby granted, free of charge/);
      assert.match(text, /Copyright \(c\) Tailwind Labs, Inc\./);
    }
    const check = seed('--check', seeded);
    assert.equal(check.status, 0, `${label}: check: ${check.stdout}${check.stderr}`);
    assert.match(check.stdout, /ok:/);
    const extracted = join(dir, 'extracted');
    seededRun = seed('--extract', seeded, '--to', extracted);
    assert.equal(seededRun.status, 0, `${label}: extract: ${seededRun.stdout}${seededRun.stderr}`);
    assert.equal(readFileSync(join(extracted, 'Main.dc.html'), 'utf8'), readFileSync(join(dir, 'Main.dc.html'), 'utf8'));
    const overwrite = seed('--extract', seeded, '--to', extracted);
    assert.notEqual(overwrite.status, 0, `${label}: extraction must refuse overwriting existing source files`);
    result = run();
    assert.equal(result.status, 0, `${label}: reapply: ${result.stdout}${result.stderr}`);
    assert.equal(readFileSync(chunk, 'utf8'), patched, `${label}: patch must be idempotent`);
    writeFileSync(chunk, 'const hub="Hub for Claude Design (claude.ai/design)";\n' + fixture.replace('survivesBundledKillSwitch:!0', 'survivesBundledKillSwitch:!1'));
    const shifted = readFileSync(chunk, 'utf8');
    result = run();
    assert.notEqual(result.status, 0, `${label}: recognizer drift must not silently skip local design`);
    assert.match(result.stdout + result.stderr, /Design canvas local fallback.*known resolver shape/);
    assert.equal(readFileSync(chunk, 'utf8'), shifted, `${label}: drift must leave the module untouched`);
    writeFileSync(chunk, 'const hub="Hub for Claude Design (claude.ai/design)";function legacyGate(){return account()&&capabilities()}export{legacyGate as isDesignCanvasSkillEnabled};');
    result = run();
    assert.equal(result.status, 0, `${label}: legacy canvas with hub text must remain supported: ${result.stdout}${result.stderr}`);
    const legacy = readFileSync(chunk, 'utf8');
    assert.match(legacy, /__clawgod_design_canvas__/, `${label}: legacy gate must still be patched`);
    assert.doesNotMatch(legacy, /__clawgod_design_local__/, `${label}: do not replace a still-supported legacy canvas`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log('patcher local design checks passed');
