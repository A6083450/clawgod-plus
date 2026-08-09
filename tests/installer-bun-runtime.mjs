#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const unix = readFileSync(new URL('../install.sh', import.meta.url), 'utf8');
const windows = readFileSync(new URL('../install.ps1', import.meta.url), 'utf8');

function assertTemporaryPath(path, label) {
  const temporaryRoots = [resolve(tmpdir()), realpathSync(tmpdir())];
  const resolvedPath = resolve(path);
  assert.ok(temporaryRoots.some(root => resolvedPath.startsWith(`${root}/`)), `${label} must stay under the system temporary directory`);
}

function isolatedUnixPath(root) {
  assertTemporaryPath(root, 'Unix behavior fixture');
  const bin = join(root, '.test-bin');
  mkdirSync(bin, { recursive: true });
  for (const [name, target] of Object.entries({
    basename: '/usr/bin/basename',
    cat: '/bin/cat',
    chmod: '/bin/chmod',
    cp: '/bin/cp',
    date: '/bin/date',
    dirname: '/usr/bin/dirname',
    file: '/usr/bin/file',
    grep: '/usr/bin/grep',
    head: '/usr/bin/head',
    ln: '/bin/ln',
    ls: '/bin/ls',
    mkdir: '/bin/mkdir',
    mv: '/bin/mv',
    readlink: '/usr/bin/readlink',
    rm: '/bin/rm',
    sed: '/usr/bin/sed',
    tr: '/usr/bin/tr',
  })) {
    const destination = join(bin, name);
    if (!existsSync(destination)) symlinkSync(target, destination);
  }
  return bin;
}

function unixTemplate(name, marker) {
  const start = unix.indexOf(marker);
  assert.notEqual(start, -1, `install.sh must generate ${name}`);
  const bodyStart = unix.indexOf('\n', start) + 1;
  const end = unix.indexOf(`\n${marker.match(/<< '([^']+)'/)?.[1]}`, bodyStart);
  assert.notEqual(end, -1, `install.sh ${name} template must end`);
  return unix.slice(bodyStart, end);
}

function powerShellTemplate(name, firstLine) {
  const marker = `@'\n${firstLine}`;
  const start = windows.indexOf(marker);
  assert.notEqual(start, -1, `install.ps1 must generate ${name}`);
  const bodyStart = start + 3;
  const end = windows.indexOf("\n'@", bodyStart);
  assert.notEqual(end, -1, `install.ps1 ${name} template must end`);
  return windows.slice(bodyStart, end);
}

function powerShellFunction(name) {
  const start = windows.indexOf(`function ${name} {`);
  assert.notEqual(start, -1, `install.ps1 must define ${name}`);
  const end = windows.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `install.ps1 must close ${name}`);
  return windows.slice(start, end + 3);
}

const executableNode = /(?:^|[;\r\n])\s*(?:&\s*)?(?:node(?:\.exe)?|\$NodeBin)\b(?:\s|$)|\bStart-Process\s+(?:-FilePath\s+)?(?:node(?:\.exe)?)\b/i;
const forbiddenNodeFixtures = [
  'node ./helper.mjs',
  'node.exe --version',
  '& node --version',
  'Start-Process node -ArgumentList "--version"',
  'Start-Process -FilePath node.exe -ArgumentList "--version"',
  '& $NodeBin ./helper.mjs',
];
const allowedNodeReferences = [
  "import { readFileSync } from 'node:fs';",
  'require("node:path")',
  'vendor/native-addon.node',
];

for (const fixture of forbiddenNodeFixtures) {
  assert.match(fixture, executableNode, `Node execution policy must reject: ${fixture}`);
}

for (const fixture of allowedNodeReferences) {
  assert.doesNotMatch(fixture, executableNode, `Node execution policy must allow: ${fixture}`);
}

for (const [name, source] of [['install.sh', unix], ['install.ps1', windows]]) {
  assert.doesNotMatch(source, /#!\/usr\/bin\/env node/, `${name}: generated scripts must use Bun shebangs`);
  assert.doesNotMatch(source, executableNode, `${name}: must not execute Node`);
  assert.match(source, /claude-mem-compat\.cjs["']?\s+uninstall/, `${name}: uninstall must still restore claude-mem`);
  assert.match(source, /Bun:|Bun version/, `${name}: Bun preflight must remain visible`);
}

const unixUninstall = unix.slice(
  unix.indexOf('if [ "$UNINSTALL" = "1" ]; then'),
  unix.indexOf('# ─── Bun prerequisite'),
);
const windowsUninstall = windows.slice(
  windows.indexOf('if ($Uninstall) {'),
  windows.indexOf('# ─── Bun prerequisite'),
);

const unixLauncherStart = unix.indexOf('LAUNCHER_CONTENT="');
const unixLauncherEnd = unix.indexOf('"\n\n\n# Back up original claude', unixLauncherStart);
const unixBackupStart = unix.indexOf('# Back up original claude (only once)');
const unixBackupEnd = unix.indexOf('# Write launcher to the SAME directory', unixBackupStart);
const unixWriteLauncherStart = unix.indexOf('write_launcher() {', unixBackupEnd);
const unixWriteLauncherEnd = unix.indexOf('\n}\n\nwrite_launcher "$CLAUDE_BIN"', unixWriteLauncherStart);
const unixCleanupStart = unixUninstall.indexOf('  CLAUDE_BIN=$(command -v claude 2>/dev/null || true)');
const unixCleanupEnd = unixUninstall.indexOf('  rm -rf "$CLAWGOD_DIR/node_modules"', unixCleanupStart);
assert.ok(unixLauncherStart >= 0 && unixLauncherEnd > unixLauncherStart, 'install.sh must retain the Unix launcher template');
assert.ok(unixBackupStart >= 0 && unixBackupEnd > unixBackupStart, 'install.sh must retain the Unix backup decision');
assert.ok(unixWriteLauncherStart >= 0 && unixWriteLauncherEnd > unixWriteLauncherStart, 'install.sh must retain the Unix launcher writer');
assert.ok(unixCleanupStart >= 0 && unixCleanupEnd > unixCleanupStart, 'install.sh must retain the Unix launcher cleanup');

const unixLauncherAssignment = unix.slice(unixLauncherStart, unixLauncherEnd + 1);
const unixBackupDecision = unix.slice(unixBackupStart, unixBackupEnd);
const unixWriteLauncher = unix.slice(unixWriteLauncherStart, unixWriteLauncherEnd + 3);
const unixCleanup = unixUninstall.slice(unixCleanupStart, unixCleanupEnd);

function unixLauncherHelpers() {
  const start = Math.max(0, unix.indexOf('has_clawgod_launcher_content() {')) || unix.indexOf('is_clawgod_launcher() {');
  if (start < 0) return '';
  const end = unix.indexOf('\necho ""', start);
  assert.notEqual(end, -1, 'install.sh must close launcher helper definitions');
  return unix.slice(start, end);
}

function renderUnixLauncher(home, bin, primary) {
  const fakeBun = join(home, 'fake-bun');
  writeFileSync(fakeBun, '#!/bin/sh\nexit 0\n', 'utf8');
  chmodSync(fakeBun, 0o755);
  const rendered = spawnSync('/bin/bash', ['-c', `${unixLauncherAssignment}\nprintf '%s' "$LAUNCHER_CONTENT"`], {
    encoding: 'utf8',
    env: { HOME: home, PATH: isolatedUnixPath(home), CLAWGOD_DIR: join(home, '.clawgod'), BUN_BIN: fakeBun, CLAUDE_BIN: primary },
  });
  assert.equal(rendered.status, 0, rendered.stderr);
  return rendered.stdout;
}

function writeUnixLauncher(primary, content) {
  const root = dirname(dirname(primary));
  const written = spawnSync('/bin/bash', ['-c', `${unixWriteLauncher}\nwrite_launcher "$TARGET"`], {
    encoding: 'utf8',
    env: { HOME: root, PATH: isolatedUnixPath(root), TARGET: primary, LAUNCHER_CONTENT: content },
  });
  assert.equal(written.status, 0, written.stderr);
}

function invokeUnixBackup(home, bin, primary) {
  return spawnSync('/bin/bash', ['-c', `info() { :; }\nwarn() { printf '%s\\n' "$*" >&2; }\nerr() { printf '%s\\n' "$*" >&2; }\n${unixLauncherHelpers()}\n${unixBackupDecision}`], {
    encoding: 'utf8',
    env: { HOME: home, BIN_DIR: bin, CLAUDE_BIN: primary, PATH: isolatedUnixPath(home) },
  });
}

function runUnixBackup(home, bin, primary) {
  const backup = invokeUnixBackup(home, bin, primary);
  assert.equal(backup.status, 0, backup.stderr);
}

function invokeUnixLauncherCleanup(home, bin, managedSentinel = '') {
  return spawnSync('/bin/bash', ['-c', `info() { :; }\nwarn() { printf '%s\\n' "$*" >&2; }\nerr() { printf '%s\\n' "$*" >&2; }\n${unixLauncherHelpers()}\n${unixCleanup}\nif [ -n "$MANAGED_SENTINEL" ]; then rm -f "$MANAGED_SENTINEL"; fi`], {
    encoding: 'utf8',
    env: { HOME: home, BIN_DIR: bin, PATH: isolatedUnixPath(home), MANAGED_SENTINEL: managedSentinel },
  });
}

function runUnixLauncherCleanup(home, bin) {
  const cleanup = invokeUnixLauncherCleanup(home, bin);
  assert.equal(cleanup.status, 0, cleanup.stderr);
}

function unixLauncherIsOwned(path) {
  const ownership = unixLauncherHelpers();
  assert.notEqual(ownership, '', 'install.sh must define a ClawGod launcher ownership check');
  const root = dirname(path);
  return spawnSync('/bin/bash', ['-c', `${ownership}\nis_clawgod_launcher "$TARGET"`], {
    encoding: 'utf8',
    env: { HOME: root, PATH: isolatedUnixPath(root), TARGET: path },
  }).status === 0;
}

{
  const home = mkdtempSync(join(tmpdir(), 'clawgod-launcher-fresh-'));
  try {
    const bin = join(home, '.local', 'bin');
    const primary = join(bin, 'claude');
    const alias = join(bin, 'clawgod');
    const original = join(bin, 'claude.orig');
    const launcher = renderUnixLauncher(home, bin, primary);
    writeUnixLauncher(primary, launcher);
    writeUnixLauncher(alias, launcher);

    runUnixBackup(home, bin, primary);
    runUnixLauncherCleanup(home, bin);

    assert.equal(existsSync(primary), false, 'fresh install, repeat install, then uninstall must not restore the ClawGod launcher as claude');
    assert.equal(existsSync(alias), false, 'fresh install uninstall must remove the ClawGod alias');
    assert.equal(existsSync(original), false, 'fresh install uninstall must leave no fabricated original backup');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = mkdtempSync(join(tmpdir(), 'clawgod-launcher-ownership-'));
  try {
    const bin = join(home, 'custom-bin');
    const primary = join(bin, 'claude');
    const legacy = join(bin, 'legacy-claude');
    const generic = join(bin, 'generic-claude');
    const markerOnly = join(bin, 'marker-only-claude');
    const symlink = join(bin, 'symlinked-claude');
    const launcher = renderUnixLauncher(home, bin, primary);
    mkdirSync(bin, { recursive: true });
    writeFileSync(primary, launcher, 'utf8');
    writeFileSync(legacy, launcher.replace('# CLAWGOD_LAUNCHER_V1\n', ''), 'utf8');
    writeFileSync(generic, '#!/bin/sh\necho clawgod is mentioned here\n', 'utf8');
    writeFileSync(markerOnly, '#!/bin/sh\n# CLAWGOD_LAUNCHER_V1\necho third-party launcher\n', 'utf8');
    symlinkSync(primary, symlink);

    assert.equal(unixLauncherIsOwned(primary), true, 'new marker must identify the current ClawGod launcher');
    assert.equal(unixLauncherIsOwned(legacy), true, 'the stable pre-marker launcher structure must remain compatible');
    assert.equal(unixLauncherIsOwned(generic), false, 'ordinary scripts mentioning clawgod must not be treated as launchers');
    assert.equal(unixLauncherIsOwned(markerOnly), false, 'a marker-only third-party script must not be treated as a ClawGod launcher');
    assert.equal(unixLauncherIsOwned(symlink), false, 'symlinks must remain eligible for original-command backup');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = mkdtempSync(join(tmpdir(), 'clawgod-launcher-marker-only-'));
  try {
    const bin = join(home, '.local', 'bin');
    const primary = join(bin, 'claude');
    const alias = join(bin, 'clawgod');
    const original = join(bin, 'claude.orig');
    const thirdParty = '#!/bin/sh\n# CLAWGOD_LAUNCHER_V1\necho third-party launcher\n';
    mkdirSync(bin, { recursive: true });
    writeFileSync(primary, thirdParty, 'utf8');
    writeFileSync(alias, thirdParty, 'utf8');

    runUnixBackup(home, bin, primary);
    writeUnixLauncher(primary, renderUnixLauncher(home, bin, primary));
    runUnixLauncherCleanup(home, bin);

    assert.equal(readFileSync(primary, 'utf8'), thirdParty, 'a marker-only primary must be backed up and restored, not deleted');
    assert.equal(readFileSync(alias, 'utf8'), thirdParty, 'a marker-only alias must not be deleted during uninstall');
    assert.equal(existsSync(original), false, 'restoring a third-party primary must consume its backup');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

for (const [name, createOriginal] of [
  ['official binary', (path) => copyFileSync('/bin/sh', path)],
  ['ordinary script containing clawgod text', (path) => writeFileSync(path, '#!/bin/sh\necho clawgod documentation\n', 'utf8')],
  ['symlink', (path, home) => {
    const target = join(home, 'official-claude');
    writeFileSync(target, '#!/bin/sh\necho official\n', 'utf8');
    symlinkSync(target, path);
    return target;
  }],
]) {
  const home = mkdtempSync(join(tmpdir(), 'clawgod-launcher-original-'));
  try {
    const bin = join(home, '.local', 'bin');
    const primary = join(bin, 'claude');
    const alias = join(bin, 'clawgod');
    mkdirSync(bin, { recursive: true });
    const target = createOriginal(primary, home);
    const originalContent = name === 'symlink' ? null : readFileSync(primary);
    runUnixBackup(home, bin, primary);
    const backup = join(bin, 'claude.orig');
    assert.equal(existsSync(backup), true, `${name} must be backed up instead of treated as a ClawGod launcher`);
    if (name === 'symlink') {
      assert.equal(lstatSync(backup).isSymbolicLink(), true, 'official symlink backup must remain a symlink');
      assert.equal(readlinkSync(backup), target, 'official symlink backup must preserve its target');
    }
    const launcher = renderUnixLauncher(home, bin, primary);
    writeUnixLauncher(primary, launcher);
    writeUnixLauncher(alias, launcher);
    runUnixLauncherCleanup(home, bin);
    assert.equal(existsSync(alias), false, `${name} uninstall must remove only the complete ClawGod alias`);
    assert.equal(existsSync(backup), false, `${name} uninstall must consume the original backup`);
    if (name === 'symlink') {
      assert.equal(lstatSync(primary).isSymbolicLink(), true, 'symlink original must remain a symlink after write-launcher and uninstall');
      assert.equal(readlinkSync(primary), target, 'symlink original must restore its original target after write-launcher and uninstall');
    } else {
      assert.deepEqual(readFileSync(primary), originalContent, `${name} must restore its original content after write-launcher and uninstall`);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = mkdtempSync(join(tmpdir(), 'clawgod-launcher-restore-'));
  try {
    const bin = join(home, '.local', 'bin');
    const primary = join(bin, 'claude');
    const alias = join(bin, 'clawgod');
    const original = join(bin, 'claude.orig');
    const official = '#!/bin/sh\necho official claude\n';
    mkdirSync(bin, { recursive: true });
    writeFileSync(primary, official, 'utf8');
    runUnixBackup(home, bin, primary);
    const launcher = renderUnixLauncher(home, bin, primary);
    writeUnixLauncher(primary, launcher);
    writeUnixLauncher(alias, launcher);
    runUnixLauncherCleanup(home, bin);

    assert.equal(readFileSync(primary, 'utf8'), official, 'uninstall must restore a real original claude command');
    assert.equal(existsSync(alias), false, 'uninstall must remove the ClawGod alias after restoring an original');
    assert.equal(existsSync(original), false, 'uninstall must consume the restored original backup');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = mkdtempSync(join(tmpdir(), 'clawgod-launcher-install-conflict-'));
  assertTemporaryPath(home, 'launcher install conflict fixture');
  try {
    const bin = join(home, '.local', 'bin');
    const primary = join(bin, 'claude');
    const original = join(bin, 'claude.orig');
    const thirdParty = Buffer.from('#!/bin/sh\necho user replacement\n');
    const official = Buffer.from('#!/bin/sh\necho preserved original\n');
    mkdirSync(bin, { recursive: true });
    writeFileSync(primary, thirdParty);
    writeFileSync(original, official);

    const install = invokeUnixBackup(home, bin, primary);
    assert.notEqual(install.status, 0, 'install must fail when a third-party current command and valid original backup both exist');
    assert.match(install.stderr, /conflict/i, 'install conflict must be actionable');
    assert.deepEqual(readFileSync(primary), thirdParty, 'install conflict must preserve the third-party current command byte-for-byte');
    assert.deepEqual(readFileSync(original), official, 'install conflict must preserve the valid original backup byte-for-byte');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

for (const originalState of ['valid', 'owned']) {
  const home = mkdtempSync(join(tmpdir(), `clawgod-launcher-symlink-conflict-${originalState}-`));
  assertTemporaryPath(home, 'launcher symlink conflict fixture');
  try {
    const bin = join(home, '.local', 'bin');
    const primary = join(bin, 'claude');
    const original = join(bin, 'claude.orig');
    const target = join(home, 'replacement target');
    const launcher = renderUnixLauncher(home, bin, primary);
    mkdirSync(bin, { recursive: true });
    writeFileSync(target, '#!/bin/sh\necho replacement\n', 'utf8');
    symlinkSync(target, primary);
    writeFileSync(original, originalState === 'valid' ? '#!/bin/sh\necho original\n' : launcher, 'utf8');
    const originalBefore = readFileSync(original);

    for (const operation of ['install', 'uninstall']) {
      const result = operation === 'install'
        ? invokeUnixBackup(home, bin, primary)
        : invokeUnixLauncherCleanup(home, bin);
      assert.notEqual(result.status, 0, `${operation} must reject a symlink current plus ${originalState} original conflict`);
      assert.equal(lstatSync(primary).isSymbolicLink(), true, `${operation} conflict must preserve current symlink type`);
      assert.equal(readlinkSync(primary), target, `${operation} conflict must preserve current symlink target`);
      assert.deepEqual(readFileSync(original), originalBefore, `${operation} conflict must preserve original bytes`);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = mkdtempSync(join(tmpdir(), 'clawgod-launcher-polluted-repeat-'));
  assertTemporaryPath(home, 'polluted repeat fixture');
  try {
    const bin = join(home, '.local', 'bin');
    const primary = join(bin, 'claude');
    const original = join(bin, 'claude.orig');
    const launcher = renderUnixLauncher(home, bin, primary);
    mkdirSync(bin, { recursive: true });
    writeFileSync(primary, launcher, 'utf8');
    writeFileSync(original, launcher, 'utf8');

    const repeat = invokeUnixBackup(home, bin, primary);
    assert.equal(repeat.status, 0, repeat.stderr);
    assert.equal(existsSync(original), false, 'repeat install must discard an installer-owned polluted original backup');
    assert.equal(readFileSync(primary, 'utf8'), launcher, 'repeat install cleanup must preserve the owned current launcher');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = mkdtempSync(join(tmpdir(), 'clawgod-launcher-uninstall-conflict-'));
  assertTemporaryPath(home, 'launcher uninstall conflict fixture');
  try {
    const bin = join(home, '.local', 'bin');
    const primary = join(bin, 'claude');
    const alias = join(bin, 'clawgod');
    const original = join(bin, 'claude.orig');
    const sentinel = join(home, '.clawgod', 'managed-sentinel');
    const thirdParty = Buffer.from('#!/bin/sh\necho replacement after install\n');
    const official = Buffer.from('#!/bin/sh\necho original before install\n');
    const launcher = renderUnixLauncher(home, bin, primary);
    mkdirSync(dirname(sentinel), { recursive: true });
    mkdirSync(bin, { recursive: true });
    writeFileSync(primary, thirdParty);
    writeFileSync(original, official);
    writeFileSync(alias, launcher, 'utf8');
    writeFileSync(sentinel, 'managed state\n', 'utf8');

    const uninstall = invokeUnixLauncherCleanup(home, bin, sentinel);
    assert.notEqual(uninstall.status, 0, 'uninstall must fail before cleanup when the current command is third-party');
    assert.match(uninstall.stderr, /conflict/i, 'uninstall conflict must be actionable');
    assert.deepEqual(readFileSync(primary), thirdParty, 'uninstall conflict must preserve the current third-party command');
    assert.deepEqual(readFileSync(original), official, 'uninstall conflict must preserve the original backup');
    assert.equal(readFileSync(alias, 'utf8'), launcher, 'uninstall conflict must preserve the managed alias before cleanup');
    assert.equal(existsSync(sentinel), true, 'uninstall conflict must stop before managed runtime cleanup');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = mkdtempSync(join(tmpdir(), 'clawgod-launcher-missing-current-'));
  assertTemporaryPath(home, 'missing-current restore fixture');
  try {
    const bin = join(home, '.local', 'bin');
    const primary = join(bin, 'claude');
    const original = join(bin, 'claude.orig');
    const target = join(home, 'official target');
    mkdirSync(bin, { recursive: true });
    writeFileSync(target, '#!/bin/sh\necho official\n', 'utf8');
    symlinkSync(target, original);

    runUnixLauncherCleanup(home, bin);
    assert.equal(lstatSync(primary).isSymbolicLink(), true, 'missing current command must restore a valid original symlink as a symlink');
    assert.equal(readlinkSync(primary), target, 'restored original symlink must preserve its exact target');
    assert.equal(existsSync(original), false, 'successful restoration must consume the original backup');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

for (const currentState of ['owned', 'missing']) {
  const home = mkdtempSync(join(tmpdir(), `clawgod-launcher-polluted-uninstall-${currentState}-`));
  assertTemporaryPath(home, 'polluted uninstall fixture');
  try {
    const bin = join(home, '.local', 'bin');
    const primary = join(bin, 'claude');
    const original = join(bin, 'claude.orig');
    const launcher = renderUnixLauncher(home, bin, primary);
    mkdirSync(bin, { recursive: true });
    if (currentState === 'owned') writeFileSync(primary, launcher, 'utf8');
    writeFileSync(original, launcher, 'utf8');

    runUnixLauncherCleanup(home, bin);
    assert.equal(existsSync(primary), false, `${currentState} current must never be replaced by an installer-owned polluted backup`);
    assert.equal(existsSync(original), false, 'polluted original backup must be removed during successful managed cleanup');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

const unixDiscoveryStart = unix.indexOf('# Detect where claude is actually installed');
const unixDiscoveryEnd = unix.indexOf('\n# ─── Download clawgod-import binary', unixDiscoveryStart);
assert.ok(unixDiscoveryStart >= 0 && unixDiscoveryEnd > unixDiscoveryStart, 'install.sh must retain stable Claude command discovery');
const unixDiscovery = unix.slice(unixDiscoveryStart, unixDiscoveryEnd);
assert.match(unix, /is_unstable_claude_path\(\)/, 'install.sh must define unstable Claude path detection');

for (const stableExists of [true, false]) {
for (const shimKind of ['system-temp', 'cmux']) {
  const home = mkdtempSync(join(tmpdir(), `clawgod-shim-first-${stableExists ? 'existing' : 'missing'}-${shimKind}-`));
  assertTemporaryPath(home, 'shim-first discovery fixture');
  try {
    const stableBin = join(home, '.local', 'bin');
    const stable = join(stableBin, 'claude');
    const systemTemp = join(home, 'resolved-system-temp');
    const shimDir = shimKind === 'system-temp' ? join(systemTemp, 'ordinary-shims') : join(home, 'cmux-cli-shims');
    const shim = join(shimDir, 'claude');
    const utilityBin = isolatedUnixPath(home);
    const fakeBun = join(home, 'fake bun');
    mkdirSync(stableBin, { recursive: true });
    mkdirSync(shimDir, { recursive: true });
    writeFileSync(shim, '#!/bin/sh\necho temporary shim\n', 'utf8');
    chmodSync(shim, 0o755);
    if (stableExists) writeFileSync(stable, '#!/bin/sh\necho stable user command\n', 'utf8');
    writeFileSync(fakeBun, '#!/bin/sh\nexit 0\n', 'utf8');
    chmodSync(fakeBun, 0o755);
    const beforeShim = readFileSync(shim);

    const discovery = spawnSync('/bin/bash', ['-c', `dim() { :; }\n${unixLauncherHelpers()}\n${unixDiscovery}\n${unixLauncherAssignment}\nprintf 'SELECTED=%s\\n' "$CLAUDE_BIN"\nprintf '%s' "$LAUNCHER_CONTENT"`], {
      encoding: 'utf8',
      env: {
        HOME: home,
        PATH: `${shimDir}:${utilityBin}`,
        TMPDIR: systemTemp,
        BIN_DIR: stableBin,
        CLAWGOD_DIR: join(home, '.clawgod'),
        BUN_BIN: fakeBun,
      },
    });
    assert.equal(discovery.status, 0, discovery.stderr);
    assert.match(discovery.stdout, new RegExp(`^SELECTED=${stable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), 'temporary shim must resolve to the stable bin target');
    assert.doesNotMatch(discovery.stdout, new RegExp(shimDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'persistent launcher must not embed an unstable shim path');
    assert.deepEqual(readFileSync(shim), beforeShim, 'temporary PATH shim must remain byte-identical');
    assert.equal(existsSync(stable), stableExists, 'discovery alone must not create or overwrite the stable launcher');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}
}

if (process.env.CLAWGOD_INSTALLER_FOCUS !== 'windows-cross-slot') {
  const home = mkdtempSync(join(tmpdir(), 'clawgod-stable-link-to-temp-'));
  assertTemporaryPath(home, 'stable-link-to-temp discovery fixture');
  try {
    const stableBin = join(home, '.local', 'bin');
    const pathBin = join(home, 'path-bin');
    const systemTemp = join(home, 'resolved-system-temp');
    const temporaryTarget = join(systemTemp, 'runtime-shims', 'claude');
    const linkedCandidate = join(pathBin, 'claude');
    const stable = join(stableBin, 'claude');
    const utilityBin = isolatedUnixPath(home);
    const fakeBun = join(home, 'fake bun');
    mkdirSync(dirname(temporaryTarget), { recursive: true });
    mkdirSync(pathBin, { recursive: true });
    mkdirSync(stableBin, { recursive: true });
    writeFileSync(temporaryTarget, '#!/bin/sh\necho temporary target\n', 'utf8');
    chmodSync(temporaryTarget, 0o755);
    symlinkSync(temporaryTarget, linkedCandidate);
    writeFileSync(stable, '#!/bin/sh\necho stable user command\n', 'utf8');
    writeFileSync(fakeBun, '#!/bin/sh\nexit 0\n', 'utf8');
    chmodSync(fakeBun, 0o755);

    const discovery = spawnSync('/bin/bash', ['-c', `dim() { :; }\n${unixLauncherHelpers()}\n${unixDiscovery}\n${unixLauncherAssignment}\nprintf 'SELECTED=%s\\n' "$CLAUDE_BIN"\nprintf '%s' "$LAUNCHER_CONTENT"`], {
      encoding: 'utf8',
      env: {
        HOME: home,
        PATH: `${pathBin}:${utilityBin}`,
        TMPDIR: systemTemp,
        BIN_DIR: stableBin,
        CLAWGOD_DIR: join(home, '.clawgod'),
        BUN_BIN: fakeBun,
      },
    });
    assert.equal(discovery.status, 0, discovery.stderr);
    assert.match(discovery.stdout, new RegExp(`^SELECTED=${stable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), 'a stable-directory symlink to a temporary target must be rejected');
    assert.equal(lstatSync(linkedCandidate).isSymbolicLink(), true, 'rejected candidate must remain a symlink');
    assert.equal(readlinkSync(linkedCandidate), temporaryTarget, 'rejected candidate must retain its temporary target');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

if (process.env.CLAWGOD_INSTALLER_FOCUS !== 'windows-cross-slot') {
  const home = mkdtempSync(join(tmpdir(), 'clawgod-dangling-discovery-'));
  assertTemporaryPath(home, 'dangling discovery fixture');
  try {
    const stableBin = join(home, '.local', 'bin');
    const pathBin = join(home, 'path-bin');
    const targetParent = join(home, 'stable-targets');
    const systemTemp = join(home, 'resolved-system-temp');
    const linkedCandidate = join(pathBin, 'claude');
    const intermediate = join(pathBin, 'claude-hop');
    const missingTarget = join(targetParent, 'missing-claude');
    const stable = join(stableBin, 'claude');
    const fakeBun = join(home, 'fake bun');
    mkdirSync(stableBin, { recursive: true });
    mkdirSync(pathBin, { recursive: true });
    mkdirSync(targetParent, { recursive: true });
    mkdirSync(systemTemp, { recursive: true });
    symlinkSync(intermediate, linkedCandidate);
    symlinkSync(missingTarget, intermediate);
    writeFileSync(stable, '#!/bin/sh\necho stable user command\n', 'utf8');
    writeFileSync(fakeBun, '#!/bin/sh\nexit 0\n', 'utf8');
    chmodSync(fakeBun, 0o755);
    assert.equal(existsSync(targetParent), true, 'dangling target parent must exist');
    assert.equal(existsSync(missingTarget), false, 'dangling target leaf must be absent');

    const discovery = spawnSync('/bin/bash', ['-c', `command() {
  if [ "$1" = "-v" ] && [ "$2" = "claude" ]; then
    printf '%s\\n' "$CANDIDATE"
    return 0
  fi
  builtin command "$@"
}
dim() { :; }
${unixLauncherHelpers()}
${unixDiscovery}
${unixLauncherAssignment}
printf 'SELECTED=%s\\n' "$CLAUDE_BIN"`], {
      encoding: 'utf8',
      env: {
        HOME: home,
        PATH: isolatedUnixPath(home),
        TMPDIR: systemTemp,
        BIN_DIR: stableBin,
        CLAWGOD_DIR: join(home, '.clawgod'),
        BUN_BIN: fakeBun,
        CANDIDATE: linkedCandidate,
      },
    });
    assert.equal(discovery.status, 0, discovery.stderr);
    assert.match(discovery.stdout, new RegExp(`^SELECTED=${stable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), 'a multi-hop symlink with a missing final leaf must fail closed to the stable launcher');
    assert.equal(lstatSync(linkedCandidate).isSymbolicLink(), true, 'dangling candidate must retain its symlink type');
    assert.equal(readlinkSync(linkedCandidate), intermediate, 'dangling candidate must retain its first-hop target');
    assert.equal(lstatSync(intermediate).isSymbolicLink(), true, 'dangling intermediate must retain its symlink type');
    assert.equal(readlinkSync(intermediate), missingTarget, 'dangling intermediate must retain its missing final target');

    const cycleA = join(pathBin, 'cycle-a');
    const cycleB = join(pathBin, 'cycle-b');
    symlinkSync(cycleB, cycleA);
    symlinkSync(cycleA, cycleB);
    const cycleProbe = spawnSync('/bin/bash', ['-c', `${unixLauncherHelpers()}\nis_unstable_claude_path "$CANDIDATE"`], {
      encoding: 'utf8',
      env: { HOME: home, PATH: isolatedUnixPath(home), TMPDIR: systemTemp, CANDIDATE: cycleA },
    });
    assert.equal(cycleProbe.status, 0, 'a symlink cycle must fail closed as unstable');

    const officialTarget = join(targetParent, 'official-claude');
    const officialLink = join(pathBin, 'official-claude');
    writeFileSync(officialTarget, '#!/bin/sh\necho official\n', 'utf8');
    chmodSync(officialTarget, 0o755);
    symlinkSync(officialTarget, officialLink);
    const stableProbe = spawnSync('/bin/bash', ['-c', `${unixLauncherHelpers()}\nis_unstable_claude_path "$CANDIDATE"`], {
      encoding: 'utf8',
      env: { HOME: home, PATH: isolatedUnixPath(home), TMPDIR: systemTemp, CANDIDATE: officialLink },
    });
    assert.equal(stableProbe.status, 1, 'a resolvable official symlink outside temporary paths must remain stable');
    assert.equal(lstatSync(officialLink).isSymbolicLink(), true, 'stable official candidate must remain a symlink');
    assert.equal(readlinkSync(officialLink), officialTarget, 'stable official candidate must retain its target');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

const windowsOwnershipContent = powerShellFunction('Test-ClawGodLauncherContent');
const windowsEntryOwnership = powerShellFunction('Test-ClawGodLauncher');
const windowsOwnership = windowsOwnershipContent + windowsEntryOwnership;
const windowsPathPresent = powerShellFunction('Test-ClaudePathPresent');
assert.match(windows, /function Test-ValidClaudeOriginal \{/, 'install.ps1 must distinguish valid original backups from owned polluted launchers');
assert.match(windows, /function Test-ClaudeLauncherConflict \{/, 'install.ps1 must centralize lossless launcher conflict detection');
assert.match(windowsPathPresent, /Get-Item\s+-LiteralPath\s+\$Path\s+-Force\s+-ErrorAction\s+Stop/, 'install.ps1 must detect path entries, including reparse points, without wildcard interpretation');
assert.match(windowsOwnershipContent, /Length\s+-gt\s+1048576[\s\S]*return \$false/, 'install.ps1 must reject binary-sized launcher ownership candidates before reading them as text');
const windowsConflict = powerShellFunction('Test-ClaudeLauncherConflict');
assert.match(windowsConflict, /Test-ClaudePathPresent \$Original/, 'Windows conflicts must detect original path entries through the reparse-aware helper');
assert.match(windowsConflict, /Test-ClaudePathPresent \$Current/, 'Windows conflicts must detect current path entries through the reparse-aware helper');
assert.doesNotMatch(windows, /Get-ChildItem\s+\$BinDir\s+-Filter\s+"claude\.\*\.exe"/, 'install.ps1 must not broadly delete timestamped or third-party claude executables');
const windowsUninstallConflict = windowsUninstall.indexOf('Test-ClaudeLauncherConflict');
const windowsCrossSlotConflict = windowsUninstall.indexOf('Test-ClaudeUninstallConflict');
const windowsUninstallCompat = windowsUninstall.indexOf('$claudeMemCompat');
assert.ok(windowsUninstallConflict >= 0 && windowsUninstallConflict < windowsUninstallCompat, 'Windows uninstall must reject launcher conflicts before managed compatibility cleanup');
if (process.env.CLAWGOD_INSTALLER_FOCUS !== 'unix-symlink') {
  assert.ok(windowsCrossSlotConflict >= 0 && windowsCrossSlotConflict < windowsUninstallCompat, 'Windows uninstall must reject cross-slot conflicts before managed compatibility cleanup');

  const windowsUninstallGuard = powerShellFunction('Test-ClaudeUninstallConflict');
  assert.match(windowsUninstallGuard, /Test-ValidClaudeOriginal \$OriginalCmd/, 'Windows uninstall guard must consider a valid cmd original');
  assert.match(windowsUninstallGuard, /Test-ValidClaudeOriginal \$OriginalExe/, 'Windows uninstall guard must consider a valid exe original');
  assert.match(windowsUninstallGuard, /Test-ClaudePathPresent \$CurrentCmd/, 'Windows uninstall guard must consider the current cmd slot');
  assert.match(windowsUninstallGuard, /Test-ClaudePathPresent \$CurrentExe/, 'Windows uninstall guard must consider the current exe slot');
}

function modelWindowsLifecycle(current, original, operation) {
  if (original !== 'missing' && current === 'third-party') return { status: 'conflict', current, original };
  if (operation === 'install') {
    if (original === 'owned') original = 'missing';
    if (current === 'third-party') original = 'valid';
    return { status: 'ok', current: 'owned', original };
  }
  if (original === 'valid') return { status: 'ok', current: 'third-party', original: 'missing' };
  return { status: 'ok', current: 'missing', original: 'missing' };
}

for (const operation of ['install', 'uninstall']) {
  assert.deepEqual(
    modelWindowsLifecycle('third-party', 'valid', operation),
    { status: 'conflict', current: 'third-party', original: 'valid' },
    `${operation}: third-party current plus valid original must be preserved as a conflict`,
  );
  assert.deepEqual(
    modelWindowsLifecycle('third-party', 'owned', operation),
    { status: 'conflict', current: 'third-party', original: 'owned' },
    `${operation}: third-party current plus polluted original must be preserved as a conflict`,
  );
}
assert.deepEqual(modelWindowsLifecycle('owned', 'owned', 'uninstall'), { status: 'ok', current: 'missing', original: 'missing' }, 'uninstall must never restore an owned polluted backup');
assert.deepEqual(modelWindowsLifecycle('missing', 'valid', 'uninstall'), { status: 'ok', current: 'third-party', original: 'missing' }, 'uninstall must restore a valid original when current is missing');
assert.deepEqual(modelWindowsLifecycle('owned', 'valid', 'uninstall'), { status: 'ok', current: 'third-party', original: 'missing' }, 'uninstall must replace only an owned current with a valid original');

function modelWindowsCrossSlotUninstall(state) {
  const hasValidOriginal = state.originalCmd === 'valid' || state.originalExe === 'valid';
  const hasThirdPartyCurrent = state.currentCmd === 'third-party' || state.currentExe === 'third-party';
  if (hasValidOriginal && hasThirdPartyCurrent) return { status: 'conflict', ...state };
  return {
    status: 'ok',
    currentCmd: state.originalCmd === 'valid' ? 'third-party' : 'missing',
    currentExe: state.originalExe === 'valid' ? 'third-party' : 'missing',
    originalCmd: 'missing',
    originalExe: 'missing',
  };
}

for (const state of [
  { currentCmd: 'third-party', currentExe: 'missing', originalCmd: 'missing', originalExe: 'valid' },
  { currentCmd: 'missing', currentExe: 'third-party', originalCmd: 'valid', originalExe: 'missing' },
]) {
  assert.deepEqual(
    modelWindowsCrossSlotUninstall(state),
    { status: 'conflict', ...state },
    'Windows uninstall must preserve all cmd/exe slots when any third-party current could conflict with any valid original',
  );
}

assert.deepEqual(
  modelWindowsCrossSlotUninstall({ currentCmd: 'owned', currentExe: 'missing', originalCmd: 'missing', originalExe: 'valid' }),
  { status: 'ok', currentCmd: 'missing', currentExe: 'third-party', originalCmd: 'missing', originalExe: 'missing' },
  'Windows uninstall may remove an owned cmd and restore a valid exe original',
);
assert.deepEqual(
  modelWindowsCrossSlotUninstall({ currentCmd: 'missing', currentExe: 'owned', originalCmd: 'valid', originalExe: 'missing' }),
  { status: 'ok', currentCmd: 'third-party', currentExe: 'missing', originalCmd: 'missing', originalExe: 'missing' },
  'Windows uninstall may remove an owned exe and restore a valid cmd original',
);

const windowsLauncherStart = windows.indexOf('$launcherContent = @"');
const windowsLauncherEnd = windows.indexOf('"@', windowsLauncherStart);
const windowsLauncher = windows.slice(windowsLauncherStart, windowsLauncherEnd + 2);
const windowsBackupStart = windows.indexOf('# Find and back up original claude');
const windowsBackupEnd = windows.indexOf('# Remove claude.exe so .cmd takes precedence', windowsBackupStart);
const windowsBackup = windows.slice(windowsBackupStart, windowsBackupEnd);
assert.match(windowsLauncher, /^\$launcherContent = @"\n@echo off\nrem CLAWGOD_LAUNCHER_V1\nsetlocal/m, 'install.ps1 must mark newly written launchers explicitly');
for (const legacySignal of [
  '@echo off',
  'setlocal',
  '.clawgod',
  'CLAUDE_CODE_EXECPATH=%~dp0claude\\.orig\\.exe',
  'CLAWGOD_AUTO_CHROME=1',
  'exit /b %ERRORLEVEL%',
]) {
  assert.ok(windowsOwnership.includes(legacySignal), `install.ps1 legacy ownership contract must require ${legacySignal}`);
}
assert.match(windowsOwnership, /rem CLAWGOD_LAUNCHER_V1/, 'install.ps1 ownership contract must recognize the explicit marker');
assert.match(windowsUninstall, /\(Test-ClaudePathPresent \$claudeCmd\) -and \(Test-ClawGodLauncher \$claudeCmd\)/, 'install.ps1 must only remove a verified primary launcher');
assert.match(windowsUninstall, /\(Test-Path \$clawgodCmd\) -and \(Test-ClawGodLauncher \$clawgodCmd\)/, 'install.ps1 must only remove a verified alias launcher');

function modelWindowsLauncherOwnership({ reparsePoint, content }) {
  if (reparsePoint) return false;
  return [
    /^@echo off$/m,
    /^setlocal$/m,
    /^if not exist ".*\\\.clawgod\\cli\.cjs" \($/m,
    /^set "CLAUDE_CODE_EXECPATH=%~dp0claude\.orig\.exe"$/m,
    /^set "CLAWGOD_AUTO_CHROME=1"$/m,
    /^exit \/b %ERRORLEVEL%$/m,
  ].every(pattern => pattern.test(content));
}

const windowsValidLauncher = [
  '@echo off',
  'rem CLAWGOD_LAUNCHER_V1',
  'setlocal',
  'if not exist "%USERPROFILE%\\.clawgod\\cli.cjs" (',
  'set "CLAUDE_CODE_EXECPATH=%~dp0claude.orig.exe"',
  'set "CLAWGOD_AUTO_CHROME=1"',
  'exit /b %ERRORLEVEL%',
].join('\n');
const windowsMarkerOnly = '@echo off\nrem CLAWGOD_LAUNCHER_V1\necho third-party launcher\n';
assert.equal(modelWindowsLauncherOwnership({ reparsePoint: false, content: windowsMarkerOnly }), false, 'marker-only Windows cmd content must remain third-party');
assert.equal(modelWindowsLauncherOwnership({ reparsePoint: true, content: windowsValidLauncher }), false, 'a reparse-point Windows launcher must remain third-party even with valid content');
assert.equal(modelWindowsLauncherOwnership({ reparsePoint: false, content: windowsValidLauncher }), true, 'complete Windows launcher structure must be owned');
assert.match(windowsOwnership, /\$hasStableStructure = \(/, 'install.ps1 must model ownership as full structure');
assert.match(windowsOwnership, /\$hasExplicitMarker -and -not \$hasStableStructure/, 'install.ps1 marker must not authorize incomplete launcher content');
assert.match(windowsOwnership, /return \$hasStableStructure/, 'install.ps1 must require complete launcher structure after marker handling');
assert.match(windowsEntryOwnership, /FileAttributes]::ReparsePoint/, 'install.ps1 entry ownership must reject reparse points');

function selectWindowsOriginal(candidates) {
  for (const candidate of candidates) {
    if (candidate.kind === 'cmd' && candidate.owned) continue;
    if (candidate.kind === 'cmd' || candidate.kind === 'exe') return candidate;
    if (candidate.kind === 'directory' && candidate.latestExe) return candidate.latestExe;
  }
  return null;
}

assert.deepEqual(
  selectWindowsOriginal([
    { kind: 'cmd', owned: true, name: 'claude.cmd' },
    { kind: 'directory', latestExe: { kind: 'exe', name: 'versions/claude.exe' } },
  ]),
  { kind: 'exe', name: 'versions/claude.exe' },
  'owned claude.cmd must not stop Windows original search before a versions executable is backed up',
);
assert.match(windowsEntryOwnership, /FileAttributes]::ReparsePoint/, 'install.ps1 ownership check must reject reparse points before launcher entry ownership');
assert.match(windowsBackup, /\(Test-Path \$loc -PathType Leaf\) -and \(Test-ClawGodLauncher \$loc\)\) \{ continue \}/, 'owned current launchers must be skipped while Windows searches for real originals');
assert.doesNotMatch(windowsBackup, /\$originalFound|break/, 'Windows original search must independently preserve cmd and exe candidates');
assert.match(windowsBackup, /\$loc -like "\*\.exe" -and -not \(Test-ClaudePathPresent \$claudeOrigExe\)/, 'Windows original exe backup must not overwrite an existing claude.orig.exe entry');
assert.match(windowsBackup, /\$loc -like "\*\.cmd" -and -not \(Test-ClaudePathPresent \$claudeOrigCmd\)/, 'Windows original cmd backup must not overwrite an existing claude.orig.cmd entry');
assert.match(windowsBackup, /Copy-Item \$latestExe\.FullName \$claudeOrigExe -Force/, 'versions executable must be backed up as claude.orig.exe after owned cmd is skipped');
assert.match(windowsUninstall, /Move-Item -Force \$claudeExeOrig \$claudeExe/, 'Windows uninstall must restore the backed-up versions executable');

for (const [name, uninstall] of [['install.sh', unixUninstall], ['install.ps1', windowsUninstall]]) {
  for (const artifact of ['.clawgod-version', '.update-check']) {
    assert.ok(uninstall.includes(artifact), `${name}: uninstall must remove ${artifact}`);
  }
  for (const preserved of ['provider.json', 'features.json', '.lean-disabled', '.lean-max']) {
    assert.doesNotMatch(uninstall, new RegExp(preserved.replace('.', '\\\.')), `${name}: uninstall must preserve ${preserved}`);
  }
}

assert.doesNotMatch(unix, /\$\(\$BUN_BIN\s+--version/, 'Unix Bun version probes must quote paths containing spaces');

const resolveBunStart = unix.indexOf('resolve_bun() {');
const normalPreflightStart = unix.indexOf('if ! resolve_bun; then', unix.indexOf('# ─── Bun prerequisite'));
const normalPreflightEnd = unix.indexOf('mkdir -p "$CLAWGOD_DIR"', normalPreflightStart);
assert.notEqual(resolveBunStart, -1, 'Unix installer must define resolve_bun');
assert.notEqual(normalPreflightStart, -1, 'Unix installer must resolve Bun before normal installation');
assert.notEqual(normalPreflightEnd, -1, 'Unix installer must retain its normal Bun preflight');

const spacedBunHome = mkdtempSync(join(tmpdir(), 'clawgod bun path '));
try {
  const bunDirectory = join(spacedBunHome, '.bun', 'bin');
  const fakeBun = join(bunDirectory, 'bun');
  mkdirSync(bunDirectory, { recursive: true });
  writeFileSync(fakeBun, '#!/bin/sh\n[ "$1" = "--version" ] && printf "1.3.14\\n"\n', 'utf8');
  chmodSync(fakeBun, 0o755);

  const preflightFixture = join(spacedBunHome, 'bun-preflight.sh');
  writeFileSync(preflightFixture, `#!/usr/bin/env bash
set -e
warn() { printf '%s\\n' "$*" >&2; }
info() { printf '%s\\n' "$*"; }
${unix.slice(resolveBunStart, unix.indexOf('\n}\n', resolveBunStart) + 3)}
${unix.slice(normalPreflightStart, normalPreflightEnd)}
printf 'resolved=%s\\n' "$BUN_BIN"
`, 'utf8');
  chmodSync(preflightFixture, 0o755);

  const preflight = spawnSync('bash', [preflightFixture], {
    encoding: 'utf8',
    env: { ...process.env, HOME: spacedBunHome, PATH: '/usr/bin:/bin' },
  });
  assert.equal(preflight.status, 0, `Bun preflight must support paths containing spaces:\n${preflight.stderr}`);
  assert.match(preflight.stdout, /resolved=.*clawgod bun path /, 'Bun preflight must retain the resolved spaced path');
} finally {
  rmSync(spacedBunHome, { recursive: true, force: true });
}

const resolveBun = powerShellFunction('Resolve-Bun');
const powerShellBunShim = /\.(?:cmd|bat|ps1)$/i;
for (const fixture of [
  'C:\\Users\\test\\AppData\\Roaming\\npm\\bun.cmd',
  'C:\\Users\\test\\AppData\\Roaming\\npm\\bun.bat',
  'C:\\Users\\test\\AppData\\Roaming\\npm\\bun.ps1',
]) {
  assert.match(fixture, powerShellBunShim, `Resolve-Bun must recognize wrapper shim fixture: ${fixture}`);
}
assert.doesNotMatch('C:\\Users\\test\\.bun\\bin\\bun.exe', powerShellBunShim, 'Resolve-Bun must retain native bun.exe candidates');
assert.match(resolveBun, /\$candidate -match '\\\.\(\?:cmd\|bat\|ps1\)\$'/, 'Resolve-Bun must replace cmd, bat, and ps1 shims');
assert.match(resolveBun, /\$candidate -notmatch '\\.exe\$'/, 'Resolve-Bun must only accept verified native executables');

const unixTemplates = {
  'claude-mem-compat.cjs': unixTemplate('claude-mem-compat.cjs', 'cat > "$CLAWGOD_DIR/claude-mem-compat.cjs" << \'CLAUDE_MEM_COMPAT_EOF\''),
  'extract-natives.mjs': unixTemplate('extract-natives.mjs', 'cat > "$CLAWGOD_DIR/extract-natives.mjs" << \'EXTRACTOR_EOF\''),
  'post-process.mjs': unixTemplate('post-process.mjs', 'cat > "$CLAWGOD_DIR/post-process.mjs" << \'POSTPROC_EOF\''),
  'repatch.mjs': unixTemplate('repatch.mjs', 'cat > "$CLAWGOD_DIR/repatch.mjs" << \'REPATCH_EOF\''),
  'patch.mjs': unixTemplate('patch.mjs', 'cat > "$CLAWGOD_DIR/patch.mjs" << \'PATCHER_EOF\''),
  'fetch-file.mjs': unixTemplate('fetch-file.mjs', 'cat > "$CLAWGOD_DIR/fetch-file.mjs" << \'FETCH_FILE_EOF\''),
};
const windowsTemplates = {
  'claude-mem-compat.cjs': powerShellTemplate('claude-mem-compat.cjs', '#!/usr/bin/env bun\nconst fs = require'),
  'extract-natives.mjs': powerShellTemplate('extract-natives.mjs', '#!/usr/bin/env bun\n/**\n * ClawGod Plus Bun section extractor'),
  'post-process.mjs': powerShellTemplate('post-process.mjs', "#!/usr/bin/env bun\nimport { readFileSync, writeFileSync, unlinkSync } from 'fs';"),
  'repatch.mjs': powerShellTemplate('repatch.mjs', "#!/usr/bin/env bun\n// Re-extract + post-process + patch the user's currently-installed"),
  'patch.mjs': powerShellTemplate('patch.mjs', '#!/usr/bin/env bun\n/**\n * ClawGod Plus Universal Patcher'),
  'fetch-file.mjs': powerShellTemplate('fetch-file.mjs', "#!/usr/bin/env bun\nimport { existsSync, renameSync, rmSync } from 'node:fs';"),
};

for (const [name, body] of Object.entries(unixTemplates)) {
  assert.match(body, /^#!\/usr\/bin\/env bun\n/, `install.sh ${name} must run with Bun`);
  assert.match(windowsTemplates[name], /^#!\/usr\/bin\/env bun\n/, `install.ps1 ${name} must run with Bun`);
}

const unixApplyStart = unix.indexOf('dim "Applying patches ..."');
const unixApplyEnd = unix.indexOf('\n# ─── Create default configs', unixApplyStart);
assert.ok(unixApplyStart >= 0 && unixApplyEnd > unixApplyStart, 'install.sh must retain the patch application gate');
const unixApplyBlock = unix.slice(unixApplyStart, unixApplyEnd);
const patchGateRoot = mkdtempSync(join(tmpdir(), 'clawgod patch gate '));
assert.equal(realpathSync(dirname(patchGateRoot)), realpathSync(tmpdir()), 'patch gate fixture must be created directly under the system temporary directory');
try {
  const home = join(patchGateRoot, 'home');
  const fixtureBin = join(patchGateRoot, 'bin');
  const fakeBun = join(fixtureBin, 'bun');
  const script = join(patchGateRoot, 'gate.sh');
  const continued = join(patchGateRoot, 'continued');
  const success = join(patchGateRoot, 'success');
  mkdirSync(home);
  mkdirSync(fixtureBin);
  writeFileSync(fakeBun, `#!${process.execPath}\nconsole.log('fixture patch output');process.exit(Number(process.env.PATCH_EXIT||0));\n`, 'utf8');
  chmodSync(fakeBun, 0o700);
  writeFileSync(script, `#!/bin/bash
set -e
BUN_BIN=${JSON.stringify(fakeBun)}
CLAWGOD_DIR=${JSON.stringify(home)}
dim() { :; }
warn() { printf '%s\n' "$*" >&2; }
run_claude_code_chrome_fix() { : > ${JSON.stringify(continued)}; }
${unixApplyBlock}
: > ${JSON.stringify(success)}
`, 'utf8');
  chmodSync(script, 0o700);

  const runGate = patchExit => spawnSync('/bin/bash', [script], {
    encoding: 'utf8',
    env: { HOME: home, PATH: fixtureBin, PATCH_EXIT: String(patchExit) },
  });
  const failed = runGate(41);
  assert.notEqual(failed.status, 0, 'install.sh must stop when patch.mjs exits nonzero');
  assert.equal(existsSync(continued), false, 'install.sh must stop before the Chrome/post-processing continuation on patch failure');
  assert.equal(existsSync(success), false, 'install.sh must not reach success continuation on patch failure');

  const passed = runGate(0);
  assert.equal(passed.status, 0, passed.stderr);
  assert.equal(existsSync(continued), true, 'install.sh must retain Chrome continuation after a successful patch');
  assert.equal(existsSync(success), true, 'install.sh must retain normal continuation after a successful patch');
} finally {
  rmSync(patchGateRoot, { recursive: true, force: true });
}

const windowsApplyStart = windows.indexOf('Write-Dim "Applying patches ..."');
const windowsApplyEnd = windows.indexOf('\n# ─── Create default configs', windowsApplyStart);
assert.ok(windowsApplyStart >= 0 && windowsApplyEnd > windowsApplyStart, 'install.ps1 must retain the patch application gate');
const windowsApplyBlock = windows.slice(windowsApplyStart, windowsApplyEnd);
assert.match(windowsApplyBlock, /\$patchOutput\s*=\s*&\s*\$BunBin/, 'install.ps1 must capture patch output');
assert.match(windowsApplyBlock, /\$patchStatus\s*=\s*\$LASTEXITCODE/, 'install.ps1 must preserve patch.mjs native exit status');
assert.match(windowsApplyBlock, /if\s*\(\$patchStatus\s*-ne\s*0\)/, 'install.ps1 must stop on patch.mjs failure');
assert.ok(windowsApplyBlock.indexOf('$patchStatus -ne 0') < windowsApplyBlock.indexOf('Invoke-ChromePostInstallFix'), 'install.ps1 must check patch status before Chrome/post-processing continuation');

const repatchRoot = mkdtempSync(join(tmpdir(), 'clawgod repatch gate '));
assert.equal(realpathSync(dirname(repatchRoot)), realpathSync(tmpdir()), 'repatch fixture must be created directly under the system temporary directory');
try {
  const native = join(repatchRoot, '2.1.226');
  const repatch = join(repatchRoot, 'repatch.mjs');
  writeFileSync(native, 'fixture native', 'utf8');
  writeFileSync(repatch, unixTemplates['repatch.mjs'], 'utf8');
  writeFileSync(join(repatchRoot, 'extract-natives.mjs'), 'process.exit(0);\n', 'utf8');
  writeFileSync(join(repatchRoot, 'post-process.mjs'), 'process.exit(0);\n', 'utf8');
  writeFileSync(join(repatchRoot, 'patch.mjs'), 'process.exit(Number(process.env.PATCH_EXIT||0));\n', 'utf8');
  const runRepatch = patchExit => spawnSync(process.execPath, [repatch, native], {
    cwd: repatchRoot,
    encoding: 'utf8',
    env: { HOME: repatchRoot, PATH: repatchRoot, PATCH_EXIT: String(patchExit) },
  });
  const failed = runRepatch(41);
  assert.notEqual(failed.status, 0, 'repatch.mjs must propagate a mandatory patch failure');
  assert.equal(existsSync(join(repatchRoot, '.source-version')), false, 'repatch.mjs must not record success after a mandatory patch failure');
  const passed = runRepatch(0);
  assert.equal(passed.status, 0, passed.stderr);
  assert.equal(readFileSync(join(repatchRoot, '.source-version'), 'utf8'), '2.1.226\n', 'repatch.mjs must retain its success marker after a zero-failure patch');
} finally {
  rmSync(repatchRoot, { recursive: true, force: true });
}

for (const [installerName, fetchFile] of [['install.sh', unixTemplates['fetch-file.mjs']], ['install.ps1', windowsTemplates['fetch-file.mjs']]]) {
  assert.match(fetchFile, /HTTPS_PROXY \|\| process\.env\.https_proxy/, `${installerName}: fetch-file must prefer HTTPS proxies`);
  assert.match(fetchFile, /HTTP_PROXY \|\| process\.env\.http_proxy/, `${installerName}: fetch-file must support HTTP proxies`);
  assert.match(fetchFile, /NO_PROXY \|\| process\.env\.no_proxy/, `${installerName}: fetch-file must honor NO_PROXY`);
  assert.match(fetchFile, /AbortSignal\.timeout\(300000\)/, `${installerName}: fetch-file must use the five-minute timeout`);
  assert.match(fetchFile, /redirects <= 5/, `${installerName}: fetch-file must cap redirects`);
  assert.match(fetchFile, /response\.status !== 200/, `${installerName}: fetch-file must reject non-200 responses`);
  assert.match(fetchFile, /renameSync\(temporary, destination\)/, `${installerName}: fetch-file must atomically replace completed downloads`);
}

const proxyProbeDirectory = mkdtempSync(join(tmpdir(), 'clawgod-fetch-proxy-'));
try {
  async function proxyFor(fetchFile, url, noProxy) {
    const probe = join(proxyProbeDirectory, `${Math.random().toString(16).slice(2)}.mjs`);
    const probeSource = fetchFile.replace(
      'const temporary = `${destination}.${process.pid}.tmp`;',
      `if (process.env.CLAWGOD_FETCH_FILE_PROBE === '1') {
  console.log(JSON.stringify({ proxy: proxyFor(url) || null }));
  process.exit(0);
}

const temporary = \`${'${destination}'}.${'${process.pid}'}.tmp\`;`,
    );
    assert.notEqual(probeSource, fetchFile, 'proxy probe must be injected into fetch-file.mjs');
    await Bun.write(probe, probeSource);
    const child = Bun.spawn([process.execPath, probe, url, join(proxyProbeDirectory, 'unused')], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        CLAWGOD_FETCH_FILE_PROBE: '1',
        HTTP_PROXY: 'http://proxy.test:3128',
        HTTPS_PROXY: 'http://proxy.test:3128',
        http_proxy: '',
        https_proxy: '',
        NO_PROXY: noProxy,
        no_proxy: '',
      },
    });
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    assert.equal(status, 0, stderr);
    return JSON.parse(stdout).proxy;
  }

  const proxyCases = [
    ['https://example.com/archive', '.example.com', null],
    ['https://api.example.com/archive', '.example.com', null],
    ['https://example.com:8443/archive', 'example.com:8443', null],
    ['https://example.com/archive', 'example.com:8443', 'http://proxy.test:3128'],
    ['http://[::1]:8080/archive', '::1', null],
    ['http://[::1]:8080/archive', '[::1]:8081', 'http://proxy.test:3128'],
  ];
  for (const [installerName, fetchFile] of [['install.sh', unixTemplates['fetch-file.mjs']], ['install.ps1', windowsTemplates['fetch-file.mjs']]]) {
    for (const [url, noProxy, expected] of proxyCases) {
      assert.equal(await proxyFor(fetchFile, url, noProxy), expected, `${installerName}: NO_PROXY=${noProxy} must select the expected proxy for ${url}`);
    }
  }
} finally {
  rmSync(proxyProbeDirectory, { recursive: true, force: true });
}

for (const [name, source] of [['install.sh', unix], ['install.ps1', windows]]) {
  assert.match(source, /fetch-file\.mjs/, `${name}: remote helpers must use fetch-file.mjs`);
  const chromeStart = source.indexOf(name === 'install.sh' ? 'install_chrome_fix_script' : 'function Install-ChromeFixScript');
  const chromeEnd = source.indexOf(name === 'install.sh' ? 'run_claude_code_chrome_fix' : 'function Invoke-ChromePostInstallFix');
  assert.ok(chromeStart >= 0 && chromeEnd > chromeStart, `${name}: Chrome helper must be defined`);
  const chromeHelper = source.slice(chromeStart, chromeEnd);
  assert.match(chromeHelper, /fetch-file\.mjs/, `${name}: Chrome helper download must use fetch-file.mjs`);
  assert.doesNotMatch(chromeHelper, /curl|Invoke-WebRequest/, `${name}: Chrome helper download must use fetch-file.mjs`);
  const importStart = source.indexOf(name === 'install.sh' ? 'Download clawgod-import binary' : 'Download clawgod-import binary');
  assert.notEqual(importStart, -1, `${name}: clawgod-import download must remain available`);
  const importDownload = source.slice(importStart, importStart + 1200);
  assert.match(importDownload, /fetch-file\.mjs/, `${name}: clawgod-import download must use fetch-file.mjs`);
  assert.doesNotMatch(importDownload, /curl|Invoke-WebRequest/, `${name}: clawgod-import download must use fetch-file.mjs`);
  if (name === 'install.sh') {
    assert.match(importDownload, /fetch-file\.mjs[^\n]+2>\/dev\/null/, 'install.sh must suppress the optional import downloader stack trace');
  } else {
    assert.match(importDownload, /fetch-file\.mjs[^\r\n]+2>\$null/, 'install.ps1 must suppress the optional import downloader stack trace');
  }
}

const unixImportStart = unix.indexOf('# ─── Download clawgod-import binary');
const unixImportEnd = unix.indexOf('\nLAUNCHER_CONTENT="', unixImportStart);
assert.ok(unixImportStart >= 0 && unixImportEnd > unixImportStart, 'install.sh must retain the optional import download block');
const unixImportBlock = unix.slice(unixImportStart, unixImportEnd);
const optionalImportRoot = mkdtempSync(join(tmpdir(), 'clawgod optional import '));
assertTemporaryPath(optionalImportRoot, 'optional import fixture');
try {
  const home = join(optionalImportRoot, 'home');
  const clawgod = join(home, '.clawgod');
  const fixtureBin = join(optionalImportRoot, 'bin');
  const fakeBun = join(fixtureBin, 'bun');
  mkdirSync(clawgod, { recursive: true });
  mkdirSync(fixtureBin, { recursive: true });
  writeFileSync(join(clawgod, 'fetch-file.mjs'), '// optional downloader fixture\n', 'utf8');
  writeFileSync(fakeBun, '#!/bin/sh\nprintf "%s\\n" "synthetic optional download stack" >&2\nexit 42\n', 'utf8');
  chmodSync(fakeBun, 0o700);
  const optionalFailure = spawnSync('/bin/bash', ['-c', `set -e\ninfo() { printf '%s\\n' "$*"; }\ndim() { printf '%s\\n' "$*"; }\n${unixImportBlock}`], {
    encoding: 'utf8',
    env: { HOME: home, PATH: '/usr/bin:/bin', CLAWGOD_DIR: clawgod, BIN_DIR: join(home, '.local', 'bin'), BUN_BIN: fakeBun },
  });
  assert.equal(optionalFailure.status, 0, 'an unavailable optional import tool must not fail installation');
  assert.equal(optionalFailure.stderr, '', 'an unavailable optional import tool must not print the Bun stack trace');
  assert.match(optionalFailure.stdout, /Provider import tool not yet available \(build pending\)/, 'an unavailable optional import tool must retain the concise status message');
  assert.equal(existsSync(join(clawgod, 'clawgod-import')), false, 'an unavailable optional import tool must not leave a destination');
} finally {
  rmSync(optionalImportRoot, { recursive: true, force: true });
}

const dir = mkdtempSync(join(tmpdir(), 'clawgod-fetch-file-'));
try {
  const fetchFile = join(dir, 'fetch-file.mjs');
  await Bun.write(fetchFile, unixTemplates['fetch-file.mjs']);
  chmodSync(fetchFile, 0o700);
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === '/redirect') return Response.redirect(new URL('/payload', url), 302);
      if (url.pathname === '/payload') return new Response('downloaded fixture');
      return new Response('not found', { status: 404 });
    },
  });
  try {
    async function runFetch(...args) {
      const child = Bun.spawn([process.execPath, fetchFile, ...args], { stdout: 'pipe', stderr: 'pipe' });
      const [status, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
      return { status, stderr };
    }

    const destination = join(dir, 'result.bin');
    const success = await runFetch(`http://127.0.0.1:${server.port}/redirect`, destination);
    assert.equal(success.status, 0, success.stderr);
    assert.equal(await Bun.file(destination).text(), 'downloaded fixture');
    assert.equal(readdirSync(dir).some(name => name.startsWith('result.bin.') && name.endsWith('.tmp')), false, 'completed downloads must not leave their temporary file behind');

    const failure = await runFetch(`http://127.0.0.1:${server.port}/missing`, destination);
    assert.notEqual(failure.status, 0, 'non-200 responses must fail');
    assert.equal(await Bun.file(destination).text(), 'downloaded fixture', 'failed downloads must not replace an existing destination');
  } finally {
    server.stop(true);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('installer Bun lifecycle checks passed');
