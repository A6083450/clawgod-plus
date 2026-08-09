#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const e2e = new URL('./installer-e2e.mjs', import.meta.url);

function runContract(contract, input) {
  const env = {
    ...process.env,
    CLAWGOD_E2E_CONTRACT: contract,
    CLAWGOD_E2E_CONTRACT_INPUT: typeof input === 'string' ? input : JSON.stringify(input),
  };
  delete env.CLAWGOD_E2E;
  return spawnSync(process.execPath, [e2e.pathname], { encoding: 'utf8', env });
}

const cleanSummary = runContract('patch-summary', {
  label: 'initial',
  output: 'patch start\n  Result: 42 applied, 7 skipped, 0 failed\npatch complete\n',
});
assert.equal(cleanSummary.status, 0, cleanSummary.stderr);
assert.match(cleanSummary.stdout, /^patch summary initial: 42 applied, 7 skipped, 0 failed$/m);

for (const [label, output] of [
  ['missing summary', 'patch complete without a summary\n'],
  ['failed summary', '  Result: 41 applied, 7 skipped, 1 failed\n'],
  ['ambiguous summaries', '  Result: 42 applied, 7 skipped, 0 failed\n  Result: 42 applied, 7 skipped, 0 failed\n'],
]) {
  const run = runContract('patch-summary', { label: 'no-upgrade', output });
  assert.notEqual(run.status, 0, `${label} must fail the E2E patch gate`);
  assert.match(run.stderr, /patch summary|failed/i, `${label} must explain the patch gate failure`);
}

const equalVersion = runContract('version-equality', {
  wrapperOutput: '2.1.220 (Claude Code)\n',
  sourceVersion: '2.1.220',
});
assert.equal(equalVersion.status, 0, equalVersion.stderr);
assert.match(equalVersion.stdout, /^version equality: wrapper=2\.1\.220 source=2\.1\.220$/m);

for (const fixture of [
  { wrapperOutput: '2.1.219 (Claude Code)\n', sourceVersion: '2.1.220' },
  { wrapperOutput: 'Claude Code version unknown\n', sourceVersion: '2.1.220' },
  { wrapperOutput: '2.1.220 and 9.9.9\n', sourceVersion: '2.1.220' },
]) {
  const run = runContract('version-equality', fixture);
  assert.notEqual(run.status, 0, 'missing, ambiguous, or mismatched wrapper versions must fail');
  assert.match(run.stderr, /version/i);
}

const workerResolver = 'let t=process.argv[1];if(t&&/(?:^|[\\/])cli\\.cjs$/.test(t))return{cmd:process.execPath,prefixArgs:[t],target:t}/*__clawgod_plain_bun_worker__*/;if(WE())return{cmd:process.execPath,prefixArgs:[],target:process.execPath};';
const worker = runContract('worker-resolver', workerResolver);
assert.equal(worker.status, 0, worker.stderr);
assert.match(worker.stdout, /^worker resolver: marker-count=1 context=cli\.cjs-return$/m);

for (const fixture of [
  `${workerResolver}${workerResolver}`,
  'const marker = "/*__clawgod_plain_bun_worker__*/";',
  workerResolver.replace('cli\\.cjs', 'other\\.cjs'),
]) {
  const run = runContract('worker-resolver', fixture);
  assert.notEqual(run.status, 0, 'duplicate or context-free worker markers must fail');
  assert.match(run.stderr, /worker|marker|context/i);
}

const cleanupRoot = mkdtempSync(join(tmpdir(), 'clawgod-e2e-contract-'));
try {
  const managedRoot = join(cleanupRoot, '.clawgod');
  const settingsPath = join(cleanupRoot, '.claude', 'settings.json');
  const primaryLauncher = join(cleanupRoot, '.local', 'bin', 'claude');
  const aliasLauncher = join(cleanupRoot, '.local', 'bin', 'clawgod');
  mkdirSync(managedRoot, { recursive: true });
  mkdirSync(join(cleanupRoot, '.claude'), { recursive: true });
  for (const name of ['provider.json', 'features.json', '.lean-disabled']) {
    writeFileSync(join(managedRoot, name), '{}\n', 'utf8');
  }
  const settings = Buffer.from('{"unrelated":"preserve-byte-for-byte"}\n', 'utf8');
  writeFileSync(settingsPath, settings);

  const clean = runContract('uninstall-cleanup', {
    managedRoot,
    settingsPath,
    expectedSettingsBase64: settings.toString('base64'),
    externalPaths: [primaryLauncher, aliasLauncher, `${primaryLauncher}.orig`],
  });
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /^uninstall cleanup: managed-runtime=absent settings=byte-identical external-launchers=absent$/m);

  writeFileSync(join(managedRoot, 'cli.cjs'), 'stale managed runtime\n', 'utf8');
  const staleManaged = runContract('uninstall-cleanup', {
    managedRoot,
    settingsPath,
    expectedSettingsBase64: settings.toString('base64'),
    externalPaths: [primaryLauncher, aliasLauncher],
  });
  assert.notEqual(staleManaged.status, 0, 'a stale managed runtime artifact must fail cleanup validation');
  assert.match(staleManaged.stderr, /cli\.cjs|managed/i);

  rmSync(join(managedRoot, 'cli.cjs'));
  mkdirSync(join(cleanupRoot, '.local', 'bin'), { recursive: true });
  writeFileSync(primaryLauncher, 'stale launcher\n', 'utf8');
  const staleLauncher = runContract('uninstall-cleanup', {
    managedRoot,
    settingsPath,
    expectedSettingsBase64: settings.toString('base64'),
    externalPaths: [primaryLauncher, aliasLauncher],
  });
  assert.notEqual(staleLauncher.status, 0, 'a stale external launcher must fail cleanup validation');
  assert.match(staleLauncher.stderr, /launcher|claude/i);

  rmSync(primaryLauncher);
  writeFileSync(settingsPath, '{"unrelated":"changed"}\n', 'utf8');
  const changedSettings = runContract('uninstall-cleanup', {
    managedRoot,
    settingsPath,
    expectedSettingsBase64: settings.toString('base64'),
    externalPaths: [primaryLauncher, aliasLauncher],
  });
  assert.notEqual(changedSettings.status, 0, 'byte-changed unrelated settings must fail cleanup validation');
  assert.match(changedSettings.stderr, /settings|byte/i);
} finally {
  rmSync(cleanupRoot, { recursive: true, force: true });
}

console.log('installer E2E offline contract checks passed');
