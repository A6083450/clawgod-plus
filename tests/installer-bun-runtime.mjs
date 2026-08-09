#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const unix = readFileSync(new URL('../install.sh', import.meta.url), 'utf8');
const windows = readFileSync(new URL('../install.ps1', import.meta.url), 'utf8');

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

function unixOwnershipHelper() {
  const start = unix.indexOf('is_clawgod_launcher() {');
  if (start < 0) return '';
  const end = unix.indexOf('\n}\n', start);
  assert.notEqual(end, -1, 'install.sh must close is_clawgod_launcher');
  return unix.slice(start, end + 3);
}

function renderUnixLauncher(home, bin, primary) {
  const fakeBun = join(home, 'fake-bun');
  writeFileSync(fakeBun, '#!/bin/sh\nexit 0\n', 'utf8');
  chmodSync(fakeBun, 0o755);
  const rendered = spawnSync('bash', ['-c', `${unixLauncherAssignment}\nprintf '%s' "$LAUNCHER_CONTENT"`], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, CLAWGOD_DIR: join(home, '.clawgod'), BUN_BIN: fakeBun, CLAUDE_BIN: primary },
  });
  assert.equal(rendered.status, 0, rendered.stderr);
  return rendered.stdout;
}

function writeUnixLauncher(primary, content) {
  const written = spawnSync('bash', ['-c', `${unixWriteLauncher}\nwrite_launcher "$TARGET"`], {
    encoding: 'utf8',
    env: { ...process.env, TARGET: primary, LAUNCHER_CONTENT: content },
  });
  assert.equal(written.status, 0, written.stderr);
}

function runUnixBackup(home, bin, primary) {
  const backup = spawnSync('bash', ['-c', `info() { :; }\n${unixOwnershipHelper()}\n${unixBackupDecision}`], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, BIN_DIR: bin, CLAUDE_BIN: primary, PATH: '/usr/bin:/bin' },
  });
  assert.equal(backup.status, 0, backup.stderr);
}

function runUnixLauncherCleanup(home, bin) {
  const cleanup = spawnSync('bash', ['-c', `info() { :; }\n${unixOwnershipHelper()}\n${unixCleanup}`], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, BIN_DIR: bin, PATH: '/usr/bin:/bin' },
  });
  assert.equal(cleanup.status, 0, cleanup.stderr);
}

function unixLauncherIsOwned(path) {
  const ownership = unixOwnershipHelper();
  assert.notEqual(ownership, '', 'install.sh must define a ClawGod launcher ownership check');
  return spawnSync('bash', ['-c', `${ownership}\nis_clawgod_launcher "$TARGET"`], {
    encoding: 'utf8',
    env: { ...process.env, TARGET: path },
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
    const symlink = join(bin, 'symlinked-claude');
    const launcher = renderUnixLauncher(home, bin, primary);
    mkdirSync(bin, { recursive: true });
    writeFileSync(primary, launcher, 'utf8');
    writeFileSync(legacy, launcher.replace('# CLAWGOD_LAUNCHER_V1\n', ''), 'utf8');
    writeFileSync(generic, '#!/bin/sh\necho clawgod is mentioned here\n', 'utf8');
    symlinkSync(primary, symlink);

    assert.equal(unixLauncherIsOwned(primary), true, 'new marker must identify the current ClawGod launcher');
    assert.equal(unixLauncherIsOwned(legacy), true, 'the stable pre-marker launcher structure must remain compatible');
    assert.equal(unixLauncherIsOwned(generic), false, 'ordinary scripts mentioning clawgod must not be treated as launchers');
    assert.equal(unixLauncherIsOwned(symlink), false, 'symlinks must remain eligible for original-command backup');
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
    mkdirSync(bin, { recursive: true });
    const target = createOriginal(primary, home);
    runUnixBackup(home, bin, primary);
    const backup = join(bin, 'claude.orig');
    assert.equal(existsSync(backup), true, `${name} must be backed up instead of treated as a ClawGod launcher`);
    if (name === 'symlink') {
      assert.equal(lstatSync(backup).isSymbolicLink(), true, 'official symlink backup must remain a symlink');
      assert.equal(readlinkSync(backup), target, 'official symlink backup must preserve its target');
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

const windowsOwnership = powerShellFunction('Test-ClawGodLauncher');
const windowsLauncherStart = windows.indexOf('$launcherContent = @"');
const windowsLauncherEnd = windows.indexOf('"@', windowsLauncherStart);
const windowsLauncher = windows.slice(windowsLauncherStart, windowsLauncherEnd + 2);
const windowsBackupStart = windows.indexOf('# Find and back up original claude');
const windowsBackupEnd = windows.indexOf('# Clean up leftover timestamped/old exes', windowsBackupStart);
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
assert.match(windowsBackup, /\$loc -like "\*\.cmd".*-not \(Test-ClawGodLauncher \$loc\)/, 'install.ps1 must not back up its own cmd launcher');
assert.match(windowsUninstall, /\(Test-Path \$claudeCmd\) -and \(Test-ClawGodLauncher \$claudeCmd\)/, 'install.ps1 must only remove a verified primary launcher');
assert.match(windowsUninstall, /\(Test-Path \$clawgodCmd\) -and \(Test-ClawGodLauncher \$clawgodCmd\)/, 'install.ps1 must only remove a verified alias launcher');

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
