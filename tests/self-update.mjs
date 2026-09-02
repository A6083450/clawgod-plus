#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  exitWithOutcome,
  parseUpdateArgs,
  runSelfUpdate,
} = require('../src/generic/runtime/self-update.cjs');

const UPDATE_ENV_KEYS = [
  'CLAWGOD_NONINTERACTIVE',
  'CLAWGOD_UPDATE_PATCH_FAIL_OPEN',
  'CLAWGOD_VERSION',
  'CLAWGOD_NO_UPGRADE',
  'CLAWGOD_LEAN_OFF',
  'CLAWGOD_LEAN_ON',
  'CLAWGOD_LEAN_MAX',
];

function assertTemporaryPath(path, parent, label) {
  const resolvedParent = realpathSync(parent);
  const resolvedPath = realpathSync(path);
  const child = relative(resolvedParent, resolvedPath);
  assert.ok(child && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child), `${label} must stay under its fixture root`);
}

function makeExecutable(path, source) {
  writeFileSync(path, `#!${process.execPath}\n${source}`, 'utf8');
  chmodSync(path, 0o700);
}

function updateEnvSnapshot() {
  return Object.fromEntries(UPDATE_ENV_KEYS.map(key => [key, null]));
}

function readCapture(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

function withUpdateFixture(label, options, callback) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'clawgod self update '));
  assertTemporaryPath(fixtureRoot, tmpdir(), `${label} fixture`);
  const home = join(fixtureRoot, 'home with spaces');
  const clawgod = join(home, '.clawgod');
  const bin = join(fixtureRoot, 'fixture bin');
  const updateTmp = join(fixtureRoot, 'private tmp');
  const fetchCapture = join(fixtureRoot, 'fetch.json');
  const runCapture = join(fixtureRoot, 'run.json');
  const installerFixture = join(fixtureRoot, options.windows ? 'remote installer.ps1' : 'remote installer.sh');
  mkdirSync(clawgod, { recursive: true });
  mkdirSync(bin, { recursive: true });
  mkdirSync(updateTmp, { recursive: true });
  for (const path of [home, clawgod, bin, updateTmp]) assertTemporaryPath(path, fixtureRoot, `${label} ${basename(path)}`);
  writeFileSync(installerFixture, 'fixture installer', 'utf8');

  if (!options.missingFetch) makeExecutable(join(clawgod, 'fetch-file.mjs'), `
import { copyFileSync } from 'node:fs';
const updateKeys = ${JSON.stringify(UPDATE_ENV_KEYS)};
const updateEnv = Object.fromEntries(updateKeys.map(key => [key, Object.hasOwn(process.env, key) ? process.env[key] : null]));
const [url, destination] = process.argv.slice(2);
await Bun.write(process.env.FETCH_CAPTURE, JSON.stringify({ url, destination, updateEnv }));
if (process.env.FETCH_EXIT) process.exit(Number(process.env.FETCH_EXIT));
copyFileSync(process.env.INSTALLER_FIXTURE, destination);
`);
  if (!options.missingProxyFetch) writeFileSync(join(clawgod, 'proxy-fetch.mjs'), '// proxy companion fixture\n', 'utf8');

  const runnerName = options.windows ? 'powershell' : 'bash';
  if (!options.spawnFailure) {
    makeExecutable(join(bin, runnerName), `
import { basename } from 'node:path';
const updateKeys = ${JSON.stringify(UPDATE_ENV_KEYS)};
const updateEnv = Object.fromEntries(updateKeys.map(key => [key, Object.hasOwn(process.env, key) ? process.env[key] : null]));
const args = process.argv.slice(2);
await Bun.write(process.env.RUN_CAPTURE, JSON.stringify({ invokedAs: basename(process.argv[1]), args, updateEnv }));
if (process.env.REQUIRE_POWERSHELL_BYPASS === '1') {
  const expected = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', args[4]];
  if (args.length !== expected.length || args.some((value, index) => value !== expected[index])) process.exit(91);
}
process.exit(Number(process.env.RUN_EXIT || 0));
`);
  }
  for (const forbidden of ['curl', 'wget', 'irm', 'Invoke-WebRequest']) {
    makeExecutable(join(bin, forbidden), 'process.stderr.write("forbidden downloader invoked\\n");process.exit(97);');
  }

  if (options.localInstaller) {
    const installerVersion = Object.hasOwn(options, 'localInstallerVersion')
      ? options.localInstallerVersion
      : options.localVersion;
    const installerVersionLine = options.windows
      ? `$ClawSelfVersion = "${installerVersion}"`
      : `CLAWGOD_SELF_VERSION="${installerVersion}"`;
    const installerSource = installerVersion === null
      ? 'local installer without a version declaration\n'
      : `${installerVersionLine}\n${options.duplicateInstallerDeclaration ? `${installerVersionLine}\n` : ''}local installer\n`;
    writeFileSync(join(clawgod, options.windows ? 'install.ps1' : 'install.sh'), installerSource, 'utf8');
    if (options.localVersion !== undefined) writeFileSync(join(clawgod, '.clawgod-version'), `${options.localVersion}\n`, 'utf8');
  }

  const stderrChunks = [];
  const environment = {
    HOME: home,
    PATH: bin,
    FETCH_CAPTURE: fetchCapture,
    RUN_CAPTURE: runCapture,
    INSTALLER_FIXTURE: installerFixture,
    FETCH_EXIT: options.fetchExit === undefined ? '' : String(options.fetchExit),
    RUN_EXIT: options.runExit === undefined ? '' : String(options.runExit),
    REQUIRE_POWERSHELL_BYPASS: options.windows ? '1' : '',
    CLAWGOD_VERSION: 'stale-version',
    CLAWGOD_NONINTERACTIVE: 'stale-noninteractive',
    CLAWGOD_UPDATE_PATCH_FAIL_OPEN: 'stale-fail-open',
    CLAWGOD_NO_UPGRADE: 'stale-no-upgrade',
    CLAWGOD_LEAN_OFF: 'stale-lean-off',
    CLAWGOD_LEAN_ON: 'stale-lean-on',
    CLAWGOD_LEAN_MAX: 'stale-lean-max',
  };

  const fixture = {
    fixtureRoot,
    home,
    clawgod,
    updateTmp,
    fetchCapture,
    runCapture,
    stderrChunks,
    options: {
      platform: options.windows ? 'win32' : 'darwin',
      homeDir: home,
      temporaryRoot: updateTmp,
      execPath: process.execPath,
      env: environment,
      stderr: { write(chunk) { stderrChunks.push(String(chunk)); } },
      spawn: options.spawn || spawnSync,
    },
    fetch() { return readCapture(fetchCapture); },
    invoked() { return readCapture(runCapture); },
    temporaryEntries() { return readdirSync(updateTmp).filter(name => name.startsWith('clawgod-update-')); },
  };

  try {
    return callback(fixture);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

assert.deepEqual(
  parseUpdateArgs(['upgrade', '--version', '2.1.220', '--no-upgrade', '--lean-off', '--lean-on', '--lean-max']),
  {
    command: 'upgrade',
    explicitVersion: true,
    version: '2.1.220',
    noUpgrade: true,
    leanOff: true,
    leanOn: true,
    leanMax: true,
  },
  'argument parsing must preserve the update command, version, and installer flags',
);
assert.deepEqual(
  parseUpdateArgs(['update']),
  {
    command: 'update',
    explicitVersion: false,
    version: 'latest',
    noUpgrade: false,
    leanOff: false,
    leanOn: false,
    leanMax: false,
  },
  'argument parsing must default an unversioned update to latest',
);
assert.throws(
  () => parseUpdateArgs(['update', '--version']),
  /--version.*non-empty value/,
  'a missing version value must not silently request latest',
);
assert.throws(
  () => parseUpdateArgs(['install']),
  /self-update requires update or upgrade as the first argument/,
  'self-update parsing must reject unrelated commands',
);

for (const version of [
  '1.7.7',
  '2026.8.17-claude.2.1.233',
  '2026.8.18-claude.2.1.234.2',
]) {
  withUpdateFixture(`trusted ${version}`, {
    localInstaller: true,
    localVersion: version,
  }, fixture => {
    const outcome = runSelfUpdate(['update', '--version', version], fixture.options);
    assert.deepEqual(outcome, { status: 0, signal: null }, `${version} trusted local update must succeed`);
    assert.equal(fixture.fetch(), null, `${version} must not fetch when its managed installer declaration is trusted`);
    assert.deepEqual(
      fixture.invoked(),
      {
        invokedAs: 'bash',
        args: [join(fixture.clawgod, 'install.sh')],
        updateEnv: {
          ...updateEnvSnapshot(),
          CLAWGOD_NONINTERACTIVE: '1',
          CLAWGOD_UPDATE_PATCH_FAIL_OPEN: '1',
          CLAWGOD_VERSION: version,
        },
      },
      `${version} must run the trusted Unix installer with a sanitized child environment`,
    );
    assert.deepEqual(fixture.temporaryEntries(), [], `${version} must leave no update directory`);
  });
}

const windowsTrustedVersion = '2026.8.18-claude.2.1.234.2';
withUpdateFixture('Windows trusted local installer', {
  windows: true,
  localInstaller: true,
  localVersion: windowsTrustedVersion,
}, fixture => {
  const outcome = runSelfUpdate(['upgrade', '--version', windowsTrustedVersion], fixture.options);
  assert.deepEqual(outcome, { status: 0, signal: null }, 'a matching Windows managed installer must succeed locally');
  assert.equal(fixture.fetch(), null, 'a matching Windows managed installer must skip remote fetching');
  assert.deepEqual(
    fixture.invoked(),
    {
      invokedAs: 'powershell',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(fixture.clawgod, 'install.ps1')],
      updateEnv: {
        ...updateEnvSnapshot(),
        CLAWGOD_NONINTERACTIVE: '1',
        CLAWGOD_UPDATE_PATCH_FAIL_OPEN: '1',
        CLAWGOD_VERSION: windowsTrustedVersion,
      },
    },
    'a matching Windows managed installer must retain the exact local PowerShell command',
  );
  assert.deepEqual(fixture.temporaryEntries(), [], 'a matching Windows managed installer must not create a download directory');
});

for (const [label, localInstallerVersion, duplicateInstallerDeclaration] of [
  ['malformed declaration', '../local', false],
  ['missing declaration', null, false],
  ['mismatched declaration', '2026.8.17-claude.2.1.233.1', false],
  ['duplicate declaration', windowsTrustedVersion, true],
]) {
  withUpdateFixture(`Windows ${label}`, {
    windows: true,
    localInstaller: true,
    localVersion: windowsTrustedVersion,
    localInstallerVersion,
    duplicateInstallerDeclaration,
  }, fixture => {
    const outcome = runSelfUpdate(['upgrade', '--version', windowsTrustedVersion], fixture.options);
    assert.deepEqual(outcome, { status: 0, signal: null }, `Windows ${label} must refresh successfully`);
    const fetch = fixture.fetch();
    assert.ok(fetch, `Windows ${label} must not be trusted as a managed local installer`);
    assert.equal(fetch.url, 'https://github.com/A6083450/clawgod-plus/releases/latest/download/install.ps1');
    assert.deepEqual(
      fixture.invoked()?.args,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fetch.destination],
      `Windows ${label} must invoke the managed remote PowerShell installer`,
    );
    assert.deepEqual(fixture.temporaryEntries(), [], `Windows ${label} must clean its download directory`);
  });
}

withUpdateFixture('unversioned forced refresh', {
  localInstaller: true,
  localVersion: '2026.8.18-claude.2.1.234.2',
}, fixture => {
  const outcome = runSelfUpdate(['update'], fixture.options);
  assert.deepEqual(outcome, { status: 0, signal: null });
  const fetch = fixture.fetch();
  assert.ok(fetch, 'an unversioned update must refresh from the Latest Release installer');
  assert.equal(fetch.url, 'https://github.com/A6083450/clawgod-plus/releases/latest/download/install.sh');
  assert.match(fetch.destination, /clawgod-update-/);
  assert.deepEqual(fetch.updateEnv, {
    ...updateEnvSnapshot(),
    CLAWGOD_NONINTERACTIVE: '1',
    CLAWGOD_UPDATE_PATCH_FAIL_OPEN: '1',
    CLAWGOD_VERSION: 'latest',
  });
  assert.deepEqual(
    fixture.invoked(),
    {
      invokedAs: 'bash',
      args: [fetch.destination],
      updateEnv: fetch.updateEnv,
    },
    'an unversioned Unix update must invoke its freshly downloaded installer',
  );
  assert.deepEqual(fixture.temporaryEntries(), [], 'unversioned refresh must clean its temporary directory');
});

for (const [label, localVersion, localInstallerVersion, duplicateInstallerDeclaration] of [
  ['development marker', '0.0.0-dev', undefined, false],
  ['missing marker', undefined, undefined, false],
  ['malformed marker', '../local', undefined, false],
  ['mismatched declaration', '2026.8.18-claude.2.1.234.2', '2026.8.17-claude.2.1.234.1', false],
  ['missing declaration', '2026.8.18-claude.2.1.234.2', null, false],
  ['duplicate declaration', '2026.8.18-claude.2.1.234.2', '2026.8.18-claude.2.1.234.2', true],
]) {
  withUpdateFixture(label, {
    localInstaller: true,
    localVersion,
    localInstallerVersion,
    duplicateInstallerDeclaration,
  }, fixture => {
    const outcome = runSelfUpdate(['upgrade', '--version', '2.1.220'], fixture.options);
    assert.deepEqual(outcome, { status: 0, signal: null }, `${label} refresh must succeed`);
    assert.ok(fixture.fetch(), `${label} must not be trusted as a managed local installer`);
    assert.deepEqual(fixture.temporaryEntries(), [], `${label} refresh must clean its temporary directory`);
  });
}

withUpdateFixture('Windows remote update flags', { windows: true }, fixture => {
  const outcome = runSelfUpdate([
    'upgrade',
    '--version',
    '2.1.220 candidate',
    '--no-upgrade',
    '--lean-off',
    '--lean-on',
    '--lean-max',
  ], fixture.options);
  assert.deepEqual(outcome, { status: 0, signal: null });
  const fetch = fixture.fetch();
  assert.ok(fetch, 'Windows update must fetch its installer');
  assert.equal(fetch.url, 'https://github.com/A6083450/clawgod-plus/releases/latest/download/install.ps1');
  assert.deepEqual(fetch.updateEnv, {
    ...updateEnvSnapshot(),
    CLAWGOD_NONINTERACTIVE: '1',
    CLAWGOD_UPDATE_PATCH_FAIL_OPEN: '1',
    CLAWGOD_VERSION: '2.1.220 candidate',
    CLAWGOD_NO_UPGRADE: '1',
    CLAWGOD_LEAN_OFF: '1',
    CLAWGOD_LEAN_ON: '1',
    CLAWGOD_LEAN_MAX: '1',
  });
  assert.deepEqual(
    fixture.invoked(),
    {
      invokedAs: 'powershell',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fetch.destination],
      updateEnv: fetch.updateEnv,
    },
    'Windows update must use the exact PowerShell command and sanitized child environment',
  );
  assert.deepEqual(fixture.temporaryEntries(), [], 'Windows refresh must clean its temporary directory');
});

withUpdateFixture('download nonzero', { fetchExit: 29 }, fixture => {
  const outcome = runSelfUpdate(['update'], fixture.options);
  assert.deepEqual(outcome, { status: 29, signal: null }, 'download exit status must be returned unchanged');
  assert.equal(fixture.invoked(), null, 'a failed download must not invoke an installer');
  assert.deepEqual(fixture.temporaryEntries(), [], 'a failed download must clean its temporary directory');
});

withUpdateFixture('installer nonzero', { runExit: 23 }, fixture => {
  const outcome = runSelfUpdate(['update'], fixture.options);
  assert.deepEqual(outcome, { status: 23, signal: null }, 'installer exit status must be returned unchanged');
  assert.deepEqual(fixture.temporaryEntries(), [], 'a failed installer must clean its temporary directory');
});

withUpdateFixture('missing fetch helper', { missingFetch: true }, fixture => {
  const outcome = runSelfUpdate(['update'], fixture.options);
  assert.deepEqual(outcome, { status: 1, signal: null });
  assert.equal(fixture.fetch(), null, 'a missing fetch helper must block managed downloading');
  assert.match(fixture.stderrChunks.join(''), /managed fetch-file\.mjs is missing; reinstall ClawGod Plus/);
  assert.deepEqual(fixture.temporaryEntries(), [], 'a missing helper must not leave a temporary directory');
});

withUpdateFixture('missing proxy companion', { missingProxyFetch: true }, fixture => {
  const outcome = runSelfUpdate(['update'], fixture.options);
  assert.deepEqual(outcome, { status: 1, signal: null });
  assert.equal(fixture.fetch(), null, 'a missing proxy companion must block managed downloading');
  assert.match(fixture.stderrChunks.join(''), /managed proxy-fetch\.mjs is missing; reinstall ClawGod Plus/);
  assert.deepEqual(fixture.temporaryEntries(), [], 'a missing companion must not leave a temporary directory');
});

withUpdateFixture('spawn error', { spawnFailure: true }, fixture => {
  const outcome = runSelfUpdate(['update'], fixture.options);
  assert.deepEqual(outcome, { status: 1, signal: null }, 'a spawn error must produce a safe failure outcome');
  assert.match(fixture.stderrChunks.join(''), /\[clawgod\] update failed: /, 'a spawn error must explain the update failure');
  assert.deepEqual(fixture.temporaryEntries(), [], 'a spawn error must clean its temporary directory');
});

withUpdateFixture('download signal', {}, fixture => {
  const outcome = runSelfUpdate(['update'], {
    ...fixture.options,
    spawn() { return { status: null, signal: 'SIGTERM' }; },
  });
  assert.deepEqual(outcome, { status: 1, signal: 'SIGTERM' }, 'a downloader signal must be preserved for the CLI boundary');
  assert.deepEqual(fixture.temporaryEntries(), [], 'a signaled download must clean its temporary directory');
});

withUpdateFixture('installer signal', {}, fixture => {
  let calls = 0;
  const outcome = runSelfUpdate(['update'], {
    ...fixture.options,
    spawn() {
      calls += 1;
      return calls === 1 ? { status: 0, signal: null } : { status: null, signal: 'SIGINT' };
    },
  });
  assert.deepEqual(outcome, { status: 1, signal: 'SIGINT' }, 'an installer signal must be preserved for the CLI boundary');
  assert.deepEqual(fixture.temporaryEntries(), [], 'a signaled installer must clean its temporary directory');
});

withUpdateFixture('missing exit status', {}, fixture => {
  const outcome = runSelfUpdate(['update'], {
    ...fixture.options,
    spawn() { return { status: null, signal: null }; },
  });
  assert.deepEqual(outcome, { status: 1, signal: null }, 'a missing child status must become a safe failure outcome');
  assert.match(fixture.stderrChunks.join(''), /managed installer download did not return an exit status/);
  assert.deepEqual(fixture.temporaryEntries(), [], 'a missing child status must clean its temporary directory');
});

{
  const exits = [];
  exitWithOutcome({ status: 23, signal: null }, {
    exit(status) { exits.push(status); },
    kill() { throw new Error('normal status must not kill'); },
  });
  assert.deepEqual(exits, [23], 'a normal outcome must exit with its status');
}

{
  const calls = [];
  exitWithOutcome({ status: 1, signal: 'SIGTERM' }, {
    pid: 1234,
    exit(status) { calls.push(['exit', status]); },
    kill(pid, signal) { calls.push(['kill', pid, signal]); return true; },
  });
  assert.deepEqual(calls, [['kill', 1234, 'SIGTERM']], 'a signal outcome must re-raise its signal before exiting');
}

{
  const calls = [];
  exitWithOutcome({ status: 1, signal: 'SIGTERM' }, {
    pid: 1234,
    exit(status) { calls.push(['exit', status]); },
    kill() { throw new Error('cannot signal'); },
  });
  assert.deepEqual(calls, [['exit', 1]], 'a failed signal re-raise must exit safely');
}

console.log('self-update checks passed');
