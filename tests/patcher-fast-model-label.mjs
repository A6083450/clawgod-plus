#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const installSh = readFileSync(new URL('../install.sh', import.meta.url), 'utf8');
const installPs1 = readFileSync(new URL('../install.ps1', import.meta.url), 'utf8');

function extractUnixPatcher() {
  const marker = 'cat > "$CLAWGOD_DIR/patch.mjs" << \'PATCHER_EOF\'';
  const start = installSh.indexOf(marker);
  assert.notEqual(start, -1, 'install.sh must embed patch.mjs');
  const bodyStart = installSh.indexOf('\n', start) + 1;
  const end = installSh.indexOf('\nPATCHER_EOF', bodyStart);
  assert.notEqual(end, -1, 'install.sh patcher heredoc must end');
  return installSh.slice(bodyStart, end);
}

function extractPowerShellPatcher() {
  const marker = "$patcherCode = @'\n";
  const start = installPs1.indexOf(marker);
  assert.notEqual(start, -1, 'install.ps1 must embed patch.mjs');
  const bodyStart = start + marker.length;
  const end = installPs1.indexOf("\n'@\n\nSet-Content", bodyStart);
  assert.notEqual(end, -1, 'install.ps1 patcher here-string must end');
  return installPs1.slice(bodyStart, end);
}

const fixture = `
/* Version: 2.1.231 */
function NV(){return"Opus 5"}
globalThis.NV=NV;
`;

function evaluate(code, env = {}) {
  const context = { process: { env: { ...env } } };
  context.globalThis = context;
  runInNewContext(code, context);
  return context;
}

for (const [name, patcher] of [
  ['install.sh', extractUnixPatcher()],
  ['install.ps1', extractPowerShellPatcher()],
]) {
  const dir = mkdtempSync(join(tmpdir(), 'clawgod-fast-model-label-'));
  try {
    writeFileSync(join(dir, 'patch.mjs'), patcher, 'utf8');
    writeFileSync(join(dir, 'cli.original.cjs'), fixture, 'utf8');

    const first = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(first.status, 0, `${name}: ${first.stdout + first.stderr}`);

    const patched = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
    new Function(patched);
    assert.match(
      patched,
      /function NV\(\)\{return process\.env\.ANTHROPIC_MODEL\|\|"Opus 5"\/\*__clawgod_fast_model_label__\*\/\}/,
      `${name}: hardcoded "Opus 5" must become env-driven`,
    );
    assert.doesNotMatch(patched, /function NV\(\)\{return"Opus 5"\}/, `${name}: old hardcoded label must be gone`);

    // Runtime: fall back to "Opus 5" when no model override, otherwise show the real model.
    assert.equal(evaluate(patched).NV(), 'Opus 5', `${name}: no ANTHROPIC_MODEL must fall back to "Opus 5"`);
    assert.equal(
      evaluate(patched, { ANTHROPIC_MODEL: 'deepseek-v4-pro[1m]' }).NV(),
      'deepseek-v4-pro[1m]',
      `${name}: ANTHROPIC_MODEL must surface the provider model`,
    );

    const second = spawnSync(process.execPath, ['patch.mjs', '--dry-run'], { cwd: dir, encoding: 'utf8' });
    const secondOutput = second.stdout + second.stderr;
    assert.equal(second.status, 0, `${name}: ${secondOutput}`);
    assert.match(secondOutput, /Fast mode model label reflects provider model \(already applied, marker present\)/, `${name}: re-run must be idempotent`);
    assert.match(secondOutput, /Result: \d+ applied, \d+ skipped, 0 failed/, `${name}: no patch failures on re-run`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('patcher fast model label checks passed');
