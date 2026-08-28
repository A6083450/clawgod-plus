#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { getPatcherSources, seedPatcherAcorn } from './patcher-test-sources.mjs';

const fixture = `
/* Version: 2.1.218 */
var dJt=200000,UAe=200000,xag=32000,kag=128000,Dag=1e6;
function Rxe(n){return n}
function hasLargeMessage(n){return n?Rxe(n)>200000:!1}
function unrelatedGreater(n){return n>200000}
function unrelatedGreaterEqual(n){return n>=200000}
function unchangedCatalog(){return {context:{window:200000,supports_1m_context:!0}}}
function loadSettingsEnv(e){Object.assign(process.env,e.env||{});return currentLimit()}
function nestedAssign(e){return Boolean(Object.assign(process.env,e.env||{}))}
function currentLimit(){return dJt}
globalThis.hasLargeMessage=hasLargeMessage;
globalThis.unrelatedGreater=unrelatedGreater;
globalThis.unrelatedGreaterEqual=unrelatedGreaterEqual;
globalThis.unchangedCatalog=unchangedCatalog;
globalThis.loadSettingsEnv=loadSettingsEnv;
globalThis.nestedAssign=nestedAssign;
globalThis.currentLimit=currentLimit;
`;

function evaluate(code, env = {}) {
  const context = { process: { env: { ...env } }, globalThis: {} };
  context.globalThis = context;
  runInNewContext(code, context);
  return context;
}

function disableAcorn(dir) {
  const acornDir = join(dir, 'node_modules', 'acorn');
  mkdirSync(acornDir, { recursive: true });
  writeFileSync(join(acornDir, 'index.js'), 'throw new Error("acorn disabled for test");\n', 'utf8');
  writeFileSync(
    join(dir, 'no-fetch.cjs'),
    'globalThis.fetch = undefined; import(process.argv[2]).catch((e) => { console.error(e); process.exit(1); });\n',
    'utf8',
  );
}

for (const [name, patcherSource] of await getPatcherSources()) {
  let acornSource;
  const unpatched = evaluate(fixture);
  assert.equal(unpatched.currentLimit(), 200000, `${name}: unpatched default limit starts at 200000`);
  assert.equal(
    unpatched.loadSettingsEnv({ env: { CLAUDE_CODE_CONTEXT_LIMIT: '1000000' } }),
    200000,
    `${name}: unpatched settings env must not update the already-initialized limit`,
  );

  const dir = mkdtempSync(join(tmpdir(), 'clawgod-context-limit-'));
  try {
    seedPatcherAcorn(dir);
    writeFileSync(join(dir, 'patch.mjs'), patcherSource, 'utf8');
    writeFileSync(join(dir, 'cli.original.cjs'), fixture, 'utf8');

    const first = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    const firstOutput = first.stdout + first.stderr;
    assert.equal(first.status, 0, `${name}: ${firstOutput}`);

    const cachedAcorn = join(dir, 'vendor', 'acorn.cjs');
    assert.equal(readFileSync(cachedAcorn, 'utf8').length > 0, true, `${name}: Acorn must be available for recovery`);
    acornSource = readFileSync(cachedAcorn, 'utf8');

    const patched = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
    new Function(patched);
    assert.match(
      patched,
      /var dJt=\(\+process\.env\.CLAUDE_CODE_CONTEXT_LIMIT\|\|\+process\.env\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\|\|200000\),UAe=\(\+process\.env\.CLAUDE_CODE_CONTEXT_LIMIT\|\|\+process\.env\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\|\|200000\),xag=32000,kag=128000,Dag=1e6/,
      `${name}: dual 200000 defaults must become env-driven`,
    );
    assert.match(
      patched,
      /Rxe\(n\)>\(\+process\.env\.CLAUDE_CODE_CONTEXT_LIMIT\|\|\+process\.env\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\|\|200000\)/,
      `${name}: large-message comparison must use the env-driven limit`,
    );
    assert.match(
      patched,
      /Object\.assign\(process\.env,e\.env\|\|\{\}\);;dJt=\(\+process\.env\.CLAUDE_CODE_CONTEXT_LIMIT\|\|\+process\.env\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\|\|200000\);UAe=\(\+process\.env\.CLAUDE_CODE_CONTEXT_LIMIT\|\|\+process\.env\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\|\|200000\);return currentLimit/,
      `${name}: standalone env loader must reassign context vars after settings env is loaded`,
    );
    assert.match(
      patched,
      /return Boolean\(Object\.assign\(process\.env,e\.env\|\|\{\}\)\)}/,
      `${name}: nested Object.assign(process.env, ...) calls must not be injected`,
    );
    assert.match(
      patched,
      /function unrelatedGreater\(n\)\{return n>200000\}/,
      `${name}: unrelated >200000 comparisons must remain unchanged`,
    );
    assert.match(
      patched,
      /function unrelatedGreaterEqual\(n\)\{return n>=200000\}/,
      `${name}: unrelated >=200000 comparisons must remain unchanged`,
    );
    assert.match(
      patched,
      /context:\{window:200000,supports_1m_context:!0\}/,
      `${name}: model catalog context metadata must not be rewritten`,
    );

    const patchedContext = evaluate(patched);
    assert.equal(patchedContext.currentLimit(), 200000, `${name}: patched default still falls back to 200000`);
    assert.equal(
      patchedContext.loadSettingsEnv({ env: { CLAUDE_CODE_CONTEXT_LIMIT: '1000000' } }),
      1000000,
      `${name}: patched settings env must update the effective context limit`,
    );
    assert.equal(patchedContext.hasLargeMessage(300000), false, `${name}: raised limit must affect large-message comparison`);
    assert.equal(patchedContext.unchangedCatalog().context.window, 200000, `${name}: catalog window remains metadata`);

    const second = spawnSync(process.execPath, ['patch.mjs', '--dry-run'], { cwd: dir, encoding: 'utf8' });
    const secondOutput = second.stdout + second.stderr;
    assert.equal(second.status, 0, `${name}: ${secondOutput}`);
    assert.match(secondOutput, /Context limit configurable \(already applied\)/, `${name}: re-run must be idempotent`);
    assert.match(secondOutput, /Result: \d+ applied, \d+ skipped, 0 failed/, `${name}: no patch failures on re-run`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const noAcornDir = mkdtempSync(join(tmpdir(), 'clawgod-context-limit-no-acorn-'));
  try {
    disableAcorn(noAcornDir);
    writeFileSync(join(noAcornDir, 'patch.mjs'), patcherSource, 'utf8');
    writeFileSync(join(noAcornDir, 'cli.original.cjs'), fixture, 'utf8');

    const run = spawnSync(process.execPath, ['no-fetch.cjs', './patch.mjs'], { cwd: noAcornDir, encoding: 'utf8' });
    const output = run.stdout + run.stderr;
    assert.equal(run.status, 0, `${name} no-acorn: ${output}`);

    const patched = readFileSync(join(noAcornDir, 'cli.original.cjs'), 'utf8');
    new Function(patched);
    assert.match(
      patched,
      /var dJt=\(\+process\.env\.CLAUDE_CODE_CONTEXT_LIMIT\|\|\+process\.env\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\|\|200000\),UAe=\(\+process\.env\.CLAUDE_CODE_CONTEXT_LIMIT\|\|\+process\.env\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\|\|200000\)/,
      `${name} no-acorn: dual defaults should still be patched`,
    );
    assert.match(
      patched,
      /Rxe\(n\)>\(\+process\.env\.CLAUDE_CODE_CONTEXT_LIMIT\|\|\+process\.env\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\|\|200000\)/,
      `${name} no-acorn: large-message comparison should still be patched`,
    );
    assert.match(
      patched,
      /function unrelatedGreater\(n\)\{return n>200000\}/,
      `${name} no-acorn: unrelated >200000 comparisons must remain unchanged`,
    );
    assert.match(
      patched,
      /function unrelatedGreaterEqual\(n\)\{return n>=200000\}/,
      `${name} no-acorn: unrelated >=200000 comparisons must remain unchanged`,
    );
    assert.doesNotMatch(
      patched,
      /Object\.assign\(process\.env,e\.env\|\|\{\}\);dJt=/,
      `${name} no-acorn: settings env reassignment should be skipped without AST`,
    );
    assert.match(
      patched,
      /return Boolean\(Object\.assign\(process\.env,e\.env\|\|\{\}\)\)}/,
      `${name} no-acorn: nested Object.assign(process.env, ...) calls must remain untouched`,
    );

    rmSync(join(noAcornDir, 'node_modules', 'acorn'), { recursive: true, force: true });
    const recoveredAcorn = join(noAcornDir, 'vendor', 'acorn.cjs');
    mkdirSync(join(noAcornDir, 'vendor'), { recursive: true });
    writeFileSync(recoveredAcorn, acornSource, 'utf8');
    const recovery = spawnSync(process.execPath, ['patch.mjs'], { cwd: noAcornDir, encoding: 'utf8' });
    const recoveryOutput = recovery.stdout + recovery.stderr;
    assert.equal(recovery.status, 0, `${name} recovered-acorn: ${recoveryOutput}`);

    const recovered = readFileSync(join(noAcornDir, 'cli.original.cjs'), 'utf8');
    assert.match(
      recovered,
      /Object\.assign\(process\.env,e\.env\|\|\{\}\);;dJt=\(\+process\.env\.CLAUDE_CODE_CONTEXT_LIMIT\|\|\+process\.env\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\|\|200000\);UAe=\(\+process\.env\.CLAUDE_CODE_CONTEXT_LIMIT\|\|\+process\.env\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\|\|200000\);return currentLimit/,
      `${name} recovered-acorn: re-run must inject the missing settings env reassignment`,
    );
    assert.equal(
      evaluate(recovered).loadSettingsEnv({ env: { CLAUDE_CODE_CONTEXT_LIMIT: '1000000' } }),
      1000000,
      `${name} recovered-acorn: settings env must update the effective context limit`,
    );
  } finally {
    rmSync(noAcornDir, { recursive: true, force: true });
  }
}

const fixture250 = `
/* Version: 2.1.250 */
var vGe=200000,UN=200000,l3=32000,c3=128000;
function uV(n){return n}
function hasLargeMessage(n){return n?uV(n)>200000:!1}
function unrelatedGreater(n){return n>200000}
function unchangedCatalog(){return {context:{window:200000,supports_1m_context:!0}}}
function loadSettingsEnv(e){Object.assign(process.env,e.env||{});return currentLimit()}
function nestedAssign(e){return Boolean(Object.assign(process.env,e.env||{}))}
function currentLimit(){return vGe}
globalThis.hasLargeMessage=hasLargeMessage;
globalThis.unrelatedGreater=unrelatedGreater;
globalThis.unchangedCatalog=unchangedCatalog;
globalThis.loadSettingsEnv=loadSettingsEnv;
globalThis.nestedAssign=nestedAssign;
globalThis.currentLimit=currentLimit;
`;

for (const [name, patcherSource] of await getPatcherSources()) {
  const dir = mkdtempSync(join(tmpdir(), 'clawgod-context-limit-250-'));
  try {
    seedPatcherAcorn(dir);
    writeFileSync(join(dir, 'patch.mjs'), patcherSource, 'utf8');
    writeFileSync(join(dir, 'cli.original.cjs'), fixture250, 'utf8');

    const first = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    const firstOutput = first.stdout + first.stderr;
    assert.equal(first.status, 0, `${name} 2.1.250: ${firstOutput}`);

    const patched = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
    new Function(patched);
    assert.match(
      patched,
      /var vGe=\(\+process\.env\.CLAUDE_CODE_CONTEXT_LIMIT\|\|\+process\.env\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\|\|200000\),UN=\(\+process\.env\.CLAUDE_CODE_CONTEXT_LIMIT\|\|\+process\.env\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\|\|200000\),l3=32000,c3=128000/,
      `${name} 2.1.250: four-variable defaults must become env-driven`,
    );
    assert.match(
      patched,
      /uV\(n\)>\(\+process\.env\.CLAUDE_CODE_CONTEXT_LIMIT\|\|\+process\.env\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\|\|200000\)/,
      `${name} 2.1.250: large-message comparison must use the env-driven limit`,
    );
    assert.match(
      patched,
      /Object\.assign\(process\.env,e\.env\|\|\{\}\);;vGe=\(\+process\.env\.CLAUDE_CODE_CONTEXT_LIMIT\|\|\+process\.env\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\|\|200000\);UN=\(\+process\.env\.CLAUDE_CODE_CONTEXT_LIMIT\|\|\+process\.env\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\|\|200000\);return currentLimit/,
      `${name} 2.1.250: settings env loader must reassign four-variable context defaults`,
    );
    assert.match(
      patched,
      /return Boolean\(Object\.assign\(process\.env,e\.env\|\|\{\}\)\)}/,
      `${name} 2.1.250: nested Object.assign(process.env, ...) calls must not be injected`,
    );
    assert.match(
      patched,
      /function unrelatedGreater\(n\)\{return n>200000\}/,
      `${name} 2.1.250: unrelated comparisons must remain unchanged`,
    );
    assert.match(
      patched,
      /context:\{window:200000,supports_1m_context:!0\}/,
      `${name} 2.1.250: model catalog context metadata must not be rewritten`,
    );

    const patchedContext = evaluate(patched);
    assert.equal(patchedContext.currentLimit(), 200000, `${name} 2.1.250: default still falls back to 200000`);
    assert.equal(
      patchedContext.loadSettingsEnv({ env: { CLAUDE_CODE_CONTEXT_LIMIT: '1000000' } }),
      1000000,
      `${name} 2.1.250: settings env must update the effective context limit`,
    );
    assert.equal(patchedContext.hasLargeMessage(300000), false, `${name} 2.1.250: raised limit must affect large-message comparison`);
    assert.equal(patchedContext.unchangedCatalog().context.window, 200000, `${name} 2.1.250: catalog window remains metadata`);

    const second = spawnSync(process.execPath, ['patch.mjs', '--dry-run'], { cwd: dir, encoding: 'utf8' });
    const secondOutput = second.stdout + second.stderr;
    assert.equal(second.status, 0, `${name} 2.1.250: ${secondOutput}`);
    assert.match(secondOutput, /Context limit configurable \(already applied\)/, `${name} 2.1.250: re-run must be idempotent`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('patcher context limit checks passed');
