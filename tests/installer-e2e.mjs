#!/usr/bin/env bun
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const forbiddenText = 'forbidden dependency invoked:';

if (process.env.CLAWGOD_E2E !== '1') {
  console.log('installer end-to-end test skipped: set CLAWGOD_E2E=1 to allow network downloads');
  process.exit(0);
}

assert.notEqual(process.platform, 'win32', 'tests/installer-e2e.mjs exercises the Unix installer');

const root = fileURLToPath(new URL('../', import.meta.url));
const tempParent = realpathSync(tmpdir());
const tempHome = mkdtempSync(join(tempParent, 'clawgod-installer-e2e-'));
const shimDir = join(tempHome, 'forbidden-bin');
const markerPath = join(tempHome, 'forbidden-dependency.log');
const settingsPath = join(tempHome, '.claude', 'settings.json');
const clawgodDir = join(tempHome, '.clawgod');
const launcherPath = join(tempHome, '.local', 'bin', 'clawgod');
const ripgrepPath = join(clawgodDir, 'vendor', 'ripgrep', 'bin', 'rg');
const expectedHarborKite = Buffer.from('1', 'utf8');

function assertExactTemporaryHome(path) {
  assert.equal(dirname(path), tempParent, 'temporary HOME must be an immediate child of the resolved system temp directory');
  assert.match(basename(path), /^clawgod-installer-e2e-[A-Za-z0-9]+$/, 'temporary HOME must be the exact mkdtempSync result');
  assert.equal(realpathSync(path), path, 'temporary HOME must not be replaced by a symlink');
}

function assertNoForbiddenDependency(output = '') {
  assert.doesNotMatch(output, /forbidden dependency invoked:/, 'installer output must not contain a forbidden dependency marker');
  assert.equal(existsSync(markerPath), false, 'installer must not invoke a forbidden dependency shim');
}

function run(label, executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    env: isolatedEnv,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);
  assertNoForbiddenDependency(output);
  assert.equal(result.error, undefined, `${label} must start successfully`);
  assert.equal(result.status, 0, `${label} exited ${result.status}\n${output}`);
  return output;
}

function readSettings() {
  return JSON.parse(readFileSync(settingsPath, 'utf8'));
}

function assertHarborKitePreserved(label) {
  const actual = readSettings().env?.CLAUDE_CODE_HARBOR_KITE;
  assert.equal(typeof actual, 'string', `${label}: Harbor Kite must remain a string setting`);
  assert.deepEqual(Buffer.from(actual, 'utf8'), expectedHarborKite, `${label}: Harbor Kite bytes must be preserved`);
}

function assertLeanOn() {
  const settings = readSettings();
  for (const key of ['disableWorkflows', 'disableRemoteControl', 'disableClaudeAiConnectors', 'disableArtifact']) {
    assert.equal(settings[key], true, `--lean-on must enable ${key}`);
  }
  assert.equal(existsSync(join(clawgodDir, '.lean-disabled')), false, '--lean-on must remove the lean-disabled marker');
}

function assertLeanOff() {
  const settings = readSettings();
  for (const key of ['disableWorkflows', 'disableRemoteControl', 'disableClaudeAiConnectors', 'disableArtifact']) {
    assert.equal(Object.hasOwn(settings, key), false, `--lean-off must remove ${key}`);
  }
  assert.equal(existsSync(join(clawgodDir, '.lean-disabled')), true, '--lean-off must create the lean-disabled marker');
}

const isolatedEnv = {
  HOME: tempHome,
  PATH: [shimDir, dirname(process.execPath), '/usr/bin', '/bin'].join(':'),
  CLAWGOD_BUN_BIN: process.execPath,
  CLAWGOD_FORBIDDEN_MARKER: markerPath,
  CI: 'true',
  LANG: 'C.UTF-8',
};

assertExactTemporaryHome(tempHome);

try {
  mkdirSync(shimDir, { recursive: true });
  for (const name of ['node', 'npm', 'rg', 'tar', 'unzip']) {
    const shimPath = join(shimDir, name);
    writeFileSync(
      shimPath,
      `#!/bin/sh\nprintf '%s\\n' '${forbiddenText} ${name}' >&2\nprintf '%s\\n' '${forbiddenText} ${name}' >> "$CLAWGOD_FORBIDDEN_MARKER"\nexit 97\n`,
      'utf8',
    );
    chmodSync(shimPath, 0o700);
  }

  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(
    settingsPath,
    '{\n  "env": {\n    "CLAUDE_CODE_HARBOR_KITE": "1"\n  },\n  "unrelatedInstallerE2EValue": "preserve-me"\n}\n',
    'utf8',
  );

  run('initial --lean-on install', '/bin/bash', [join(root, 'install.sh'), '--lean-on']);
  assertHarborKitePreserved('initial install');
  assertLeanOn();
  assert.match(
    readFileSync(join(clawgodDir, 'cli.original.cjs'), 'utf8'),
    /__clawgod_plain_bun_worker__/,
    'installed bundle must contain the targeted plain Bun worker resolver patch',
  );
  console.log('worker resolver patched for plain Bun');

  assert.equal(existsSync(ripgrepPath), true, 'initial install must create the private ripgrep binary');
  const rgVersion = run('private ripgrep version smoke', ripgrepPath, ['--version']);
  assert.match(rgVersion, /^ripgrep 15\.2\.0(?:\r?\n|$)/, 'private ripgrep must report exactly version 15.2.0');
  const searchFixture = join(tempHome, 'ripgrep-fixture.txt');
  writeFileSync(searchFixture, 'private ripgrep finds Harbor Kite\n', 'utf8');
  const searchOutput = run('private ripgrep search smoke', ripgrepPath, ['--fixed-strings', 'Harbor Kite', searchFixture]);
  assert.match(searchOutput, /private ripgrep finds Harbor Kite/, 'private ripgrep must search a real fixture');

  assert.equal(existsSync(launcherPath), true, 'initial install must create the clawgod launcher');
  const wrapperVersion = run('clawgod wrapper version smoke', launcherPath, ['--version']);
  assert.match(wrapperVersion, /\b\d+\.\d+\.\d+\b/, 'installed clawgod wrapper must print a semantic version');
  const sourceVersion = readFileSync(join(clawgodDir, '.source-version'), 'utf8').trim();
  assert.match(sourceVersion, /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, 'installer must record the resolved Claude source version');
  console.log(`installer source version: ${sourceVersion}`);

  run('no-upgrade --lean-off install', '/bin/bash', [join(root, 'install.sh'), '--no-upgrade', '--lean-off']);
  assertHarborKitePreserved('no-upgrade install');
  assertLeanOff();

  run('uninstall', '/bin/bash', [join(root, 'install.sh'), '--uninstall']);
  const removedArtifacts = [
    ripgrepPath,
    launcherPath,
    ...[
      'cli.cjs',
      'cli.original.cjs',
      'patch.mjs',
      'extract-natives.mjs',
      'post-process.mjs',
      'repatch.mjs',
      'openai-proxy.cjs',
      'fetch-file.mjs',
      'install-ripgrep.mjs',
      'apply-claude-code-chrome-fix.sh',
      'claude-mem-compat.cjs',
      '.source-version',
    ].map(path => join(clawgodDir, path)),
  ];
  for (const path of removedArtifacts) {
    assert.equal(existsSync(path), false, `uninstall must remove ${path}`);
  }
  assert.equal(existsSync(settingsPath), true, 'uninstall must retain unrelated Claude settings');
  assertHarborKitePreserved('uninstall');
  assert.equal(readSettings().unrelatedInstallerE2EValue, 'preserve-me', 'uninstall must retain unrelated settings values');
  assertNoForbiddenDependency();

  console.log('installer Bun-only end-to-end checks passed');
} finally {
  assertExactTemporaryHome(tempHome);
  rmSync(tempHome, { recursive: true, force: true });
}
