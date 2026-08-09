#!/usr/bin/env bun
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const forbiddenText = 'forbidden dependency invoked:';

function createIsolatedRuntime(tempHome, bunExecutable = process.execPath) {
  const shimDir = join(tempHome, 'forbidden-bin');
  const markerPath = join(tempHome, 'forbidden-dependency.log');
  const bunDir = join(tempHome, 'bun-bin');
  const bunPath = join(bunDir, 'bun');
  mkdirSync(bunDir, { recursive: true });
  symlinkSync(bunExecutable, bunPath);
  return {
    shimDir,
    markerPath,
    bunPath,
    env: {
      HOME: tempHome,
      PATH: [shimDir, bunDir, '/usr/bin', '/bin'].join(':'),
      CLAWGOD_BUN_BIN: bunPath,
      CLAWGOD_FORBIDDEN_MARKER: markerPath,
      CI: 'true',
      LANG: 'C.UTF-8',
    },
  };
}

function resolveCommand(command, env) {
  return spawnSync('/bin/sh', ['-c', 'command -v "$1"', 'clawgod-e2e-resolve', command], {
    encoding: 'utf8',
    env,
  });
}

function pathIsInside(root, path) {
  const offset = relative(root, path);
  return offset === '' || (!offset.startsWith(`..${sep}`) && offset !== '..' && !isAbsolute(offset));
}

function validateEnvironmentIsolation(tempHome, runtime, bunExecutable = process.execPath) {
  const bunResolution = resolveCommand('bun', runtime.env);
  assert.equal(bunResolution.status, 0, `sandbox PATH must resolve Bun: ${bunResolution.stderr}`);
  const resolvedBun = bunResolution.stdout.trim();
  assert.equal(pathIsInside(tempHome, resolvedBun), true, `sandbox PATH exposed Bun outside temporary HOME: ${resolvedBun}`);
  assert.equal(realpathSync(resolvedBun), realpathSync(bunExecutable), 'sandbox Bun entry must run the selected Bun executable');
  const claudeResolution = resolveCommand('claude', runtime.env);
  if (claudeResolution.status === 0) {
    const resolvedClaude = claudeResolution.stdout.trim();
    assert.equal(pathIsInside(tempHome, resolvedClaude), true, `sandbox PATH exposed claude outside temporary HOME: ${resolvedClaude}`);
  }
  return `environment isolation: bun=sandboxed claude=${claudeResolution.status === 0 ? 'sandboxed' : 'unresolved'}`;
}

function validateRipgrepVersion(output) {
  assert.match(
    output,
    /^ripgrep 15\.2\.0(?: \(rev [0-9A-Fa-f]+\))?(?:\r?\n|$)/,
    'private ripgrep must report version 15.2.0 with only an optional official revision',
  );
  return 'private ripgrep version: 15.2.0';
}

function validatePatchSummary(label, output) {
  const resultLines = output.split(/\r?\n/).filter(line => line.includes('Result:'));
  assert.equal(resultLines.length, 1, `${label}: expected exactly one Result line, found ${resultLines.length}`);
  const summary = /^\s*Result: (\d+) applied, (\d+) skipped, 0 failed\s*$/.exec(resultLines[0]);
  assert.notEqual(summary, null, `${label}: Result line must be a canonical patch summary with 0 failed`);
  const [, applied, skipped] = summary;
  return `patch summary ${label}: ${applied} applied, ${skipped} skipped, 0 failed`;
}

function validateVersionEquality(wrapperOutput, sourceVersion) {
  const sourceMatch = /^\s*(\d+\.\d+\.\d+)\s*$/.exec(sourceVersion);
  assert.notEqual(sourceMatch, null, 'source version must contain exactly one x.y.z token with optional surrounding whitespace');
  const normalizedSourceVersion = sourceMatch[1];
  const wrapperVersions = [...wrapperOutput.matchAll(/(?:^|\s)(\d+\.\d+\.\d+)(?=\s|$)/g)].map(match => match[1]);
  assert.equal(wrapperVersions.length, 1, `wrapper output must contain exactly one semantic version, found ${wrapperVersions.length}`);
  assert.equal(wrapperVersions[0], normalizedSourceVersion, `wrapper version ${wrapperVersions[0]} must equal source version ${normalizedSourceVersion}`);
  return `version equality: wrapper=${wrapperVersions[0]} source=${normalizedSourceVersion}`;
}

function validateWorkerResolver(source) {
  const marker = '/*__clawgod_plain_bun_worker__*/';
  const markerCount = source.split(marker).length - 1;
  assert.equal(markerCount, 1, `plain Bun worker marker must occur exactly once, found ${markerCount}`);
  const markerIndex = source.indexOf(marker);
  const precedingContext = source.slice(Math.max(0, markerIndex - 240), markerIndex);
  assert.match(
    precedingContext,
    /cli\\\.cjs\$\/\.test\([\w$]+\)\)return\{cmd:process\.execPath,prefixArgs:\[[\w$]+\](?:,target:[\w$]+)?\}$/,
    'plain Bun worker marker must immediately follow the cli.cjs resolver return branch',
  );
  return 'worker resolver: marker-count=1 context=cli.cjs-return';
}

function validateUninstallCleanup({ managedRoot, settingsPath, expectedSettingsBase64, externalPaths }) {
  const allowedPersistentEntries = new Set(['provider.json', 'features.json', '.lean-disabled', '.lean-max']);
  const staleManaged = existsSync(managedRoot)
    ? readdirSync(managedRoot).filter(entry => !allowedPersistentEntries.has(entry))
    : [];
  assert.deepEqual(staleManaged, [], `managed runtime artifacts remain: ${staleManaged.join(', ')}`);
  for (const path of externalPaths) {
    assert.equal(existsSync(path), false, `external launcher or backup remains: ${path}`);
  }
  assert.deepEqual(
    readFileSync(settingsPath),
    Buffer.from(expectedSettingsBase64, 'base64'),
    'uninstall must leave unrelated Claude settings byte-identical',
  );
  return 'uninstall cleanup: managed-runtime=absent settings=byte-identical external-launchers=absent';
}

if (process.env.CLAWGOD_E2E_CONTRACT) {
  try {
    const input = process.env.CLAWGOD_E2E_CONTRACT_INPUT ?? '';
    let marker;
    if (process.env.CLAWGOD_E2E_CONTRACT === 'patch-summary') {
      const fixture = JSON.parse(input);
      marker = validatePatchSummary(fixture.label, fixture.output);
    } else if (process.env.CLAWGOD_E2E_CONTRACT === 'version-equality') {
      const fixture = JSON.parse(input);
      marker = validateVersionEquality(fixture.wrapperOutput, fixture.sourceVersion);
    } else if (process.env.CLAWGOD_E2E_CONTRACT === 'worker-resolver') {
      marker = validateWorkerResolver(input);
    } else if (process.env.CLAWGOD_E2E_CONTRACT === 'uninstall-cleanup') {
      marker = validateUninstallCleanup(JSON.parse(input));
    } else if (process.env.CLAWGOD_E2E_CONTRACT === 'ripgrep-version') {
      marker = validateRipgrepVersion(input);
    } else if (process.env.CLAWGOD_E2E_CONTRACT === 'environment-isolation') {
      const fixture = JSON.parse(input);
      const contractParent = realpathSync(tmpdir());
      assert.equal(dirname(fixture.fixtureRoot), contractParent, 'environment isolation fixture must be an immediate child of the system temp directory');
      assert.match(basename(fixture.fixtureRoot), /^clawgod-e2e-path-contract-[A-Za-z0-9]+$/, 'environment isolation fixture must be the exact mkdtempSync result');
      assert.equal(realpathSync(fixture.fixtureRoot), fixture.fixtureRoot, 'environment isolation fixture must not be replaced by a symlink');
      assert.equal(dirname(fixture.tempHome), fixture.fixtureRoot, 'contract HOME must be an immediate child of the validated fixture root');
      assert.equal(realpathSync(fixture.tempHome), fixture.tempHome, 'contract HOME must not be replaced by a symlink');
      assert.equal(pathIsInside(fixture.fixtureRoot, fixture.bunExecutable), true, 'contract Bun entry must be lexically contained by the fixture');
      assert.equal(realpathSync(fixture.bunExecutable), realpathSync(process.execPath), 'contract Bun entry must target the current Bun executable');
      const runtime = createIsolatedRuntime(fixture.tempHome, fixture.bunExecutable);
      marker = validateEnvironmentIsolation(fixture.tempHome, runtime, fixture.bunExecutable);
    } else {
      throw new Error(`unknown E2E contract: ${process.env.CLAWGOD_E2E_CONTRACT}`);
    }
    console.log(marker);
    process.exit(0);
  } catch (error) {
    console.error(error?.stack ?? error);
    process.exit(1);
  }
}

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

assertExactTemporaryHome(tempHome);
let isolatedEnv;

try {
  const isolatedRuntime = createIsolatedRuntime(tempHome);
  assert.equal(isolatedRuntime.shimDir, shimDir);
  assert.equal(isolatedRuntime.markerPath, markerPath);
  isolatedEnv = isolatedRuntime.env;
  console.log(validateEnvironmentIsolation(tempHome, isolatedRuntime));

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

  const initialInstallOutput = run('initial --lean-on install', '/bin/bash', [join(root, 'install.sh'), '--lean-on']);
  console.log(validatePatchSummary('unix initial', initialInstallOutput));
  assertHarborKitePreserved('initial install');
  assertLeanOn();
  console.log(validateWorkerResolver(readFileSync(join(clawgodDir, 'cli.original.cjs'), 'utf8')));

  assert.equal(existsSync(ripgrepPath), true, 'initial install must create the private ripgrep binary');
  const rgVersion = run('private ripgrep version smoke', ripgrepPath, ['--version']);
  console.log(validateRipgrepVersion(rgVersion));
  const searchFixture = join(tempHome, 'ripgrep-fixture.txt');
  writeFileSync(searchFixture, 'private ripgrep finds Harbor Kite\n', 'utf8');
  const searchOutput = run('private ripgrep search smoke', ripgrepPath, ['--fixed-strings', 'Harbor Kite', searchFixture]);
  assert.match(searchOutput, /private ripgrep finds Harbor Kite/, 'private ripgrep must search a real fixture');

  assert.equal(existsSync(launcherPath), true, 'initial install must create the clawgod launcher');
  const wrapperVersion = run('clawgod wrapper version smoke', launcherPath, ['--version']);
  const sourceVersion = readFileSync(join(clawgodDir, '.source-version'), 'utf8').trim();
  console.log(validateVersionEquality(wrapperVersion, sourceVersion));
  console.log(`installer source version: ${sourceVersion}`);

  const noUpgradeOutput = run('no-upgrade --lean-off install', '/bin/bash', [join(root, 'install.sh'), '--no-upgrade', '--lean-off']);
  console.log(validatePatchSummary('unix no-upgrade', noUpgradeOutput));
  assertHarborKitePreserved('no-upgrade install');
  assertLeanOff();

  const settingsBeforeUninstall = readFileSync(settingsPath);
  run('uninstall', '/bin/bash', [join(root, 'install.sh'), '--uninstall']);
  console.log(validateUninstallCleanup({
    managedRoot: clawgodDir,
    settingsPath,
    expectedSettingsBase64: settingsBeforeUninstall.toString('base64'),
    externalPaths: [
      join(tempHome, '.local', 'bin', 'claude'),
      join(tempHome, '.local', 'bin', 'claude.orig'),
      launcherPath,
      join(tempHome, '.claude-mem', 'clawgod-settings-backup.json'),
      join(tempHome, '.claude-mem', 'clawgod-settings-state.json'),
    ],
  }));
  assertHarborKitePreserved('uninstall');
  assert.equal(readSettings().unrelatedInstallerE2EValue, 'preserve-me', 'uninstall must retain unrelated settings values');
  assertNoForbiddenDependency();

  console.log('installer Bun-only end-to-end checks passed');
} finally {
  assertExactTemporaryHome(tempHome);
  rmSync(tempHome, { recursive: true, force: true });
}
