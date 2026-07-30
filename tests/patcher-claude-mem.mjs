#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const unixInstaller = readFileSync(new URL('../install.sh', import.meta.url), 'utf8');
const powerShellInstaller = readFileSync(new URL('../install.ps1', import.meta.url), 'utf8');

function extractUnixHelper() {
  const marker = 'cat > "$CLAWGOD_DIR/claude-mem-compat.cjs" << \'CLAUDE_MEM_COMPAT_EOF\'';
  const start = unixInstaller.indexOf(marker);
  assert.notEqual(start, -1, 'install.sh must embed the claude-mem compatibility helper');
  const bodyStart = unixInstaller.indexOf('\n', start) + 1;
  const end = unixInstaller.indexOf('\nCLAUDE_MEM_COMPAT_EOF', bodyStart);
  assert.notEqual(end, -1, 'install.sh claude-mem compatibility helper must end');
  return unixInstaller.slice(bodyStart, end);
}

function extractPowerShellHelper() {
  const marker = "$ClaudeMemCompatSource = @'\n";
  const start = powerShellInstaller.indexOf(marker);
  assert.notEqual(start, -1, 'install.ps1 must embed the claude-mem compatibility helper');
  const bodyStart = start + marker.length;
  const end = powerShellInstaller.indexOf("\n'@\n", bodyStart);
  assert.notEqual(end, -1, 'install.ps1 claude-mem compatibility helper must end');
  return powerShellInstaller.slice(bodyStart, end);
}

const unixHelper = extractUnixHelper();
const powerShellHelper = extractPowerShellHelper();
assert.equal(powerShellHelper, unixHelper, 'Unix and Windows installers must ship the same helper');
assert.match(powerShellInstaller, /if \(\$LASTEXITCODE -ne 0\) \{ throw "claude-mem compatibility helper exited \$LASTEXITCODE" \}/, 'Windows uninstall must stop on helper failure');
assert.match(unixInstaller, /if ! node "\$CLAWGOD_DIR\/claude-mem-compat\.cjs" uninstall; then[\s\S]*?exit 1/, 'Unix uninstall must stop on helper failure');

function makeHome(helper) {
  const home = mkdtempSync(join(tmpdir(), 'clawgod-claude-mem-'));
  mkdirSync(join(home, '.clawgod'), { recursive: true });
  mkdirSync(join(home, '.local', 'bin'), { recursive: true });
  writeFileSync(join(home, '.clawgod', 'claude-mem-compat.cjs'), helper, 'utf8');
  return home;
}

function runHelper(home, command = 'install', extraEnv = {}) {
  return spawnSync(process.execPath, [join(home, '.clawgod', 'claude-mem-compat.cjs'), command], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      CLAWGOD_CLAUDE_BIN: join(home, '.local', 'bin', process.platform === 'win32' ? 'claude.cmd' : 'claude'),
      CLAWGOD_SKIP_CLAUDE_MEM_RESTART: '1',
      ...extraEnv,
    },
  });
}

for (const [installerName, helper] of [['install.sh', unixHelper], ['install.ps1', powerShellHelper]]) {
{
  const home = makeHome(helper);
  try {
    const run = runHelper(home);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(existsSync(join(home, '.claude-mem')), false, 'users without claude-mem must not be modified');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = makeHome(helper);
  try {
    const memDir = join(home, '.claude-mem');
    mkdirSync(memDir, { recursive: true });
    const original = {
      CLAUDE_MEM_PROVIDER: 'claude',
      CLAUDE_MEM_MODEL: 'claude-haiku-4-5-20251001',
      CLAUDE_MEM_CLAUDE_AUTH_METHOD: 'subscription',
      CLAUDE_CODE_PATH: '',
      custom: 'preserved',
    };
    writeFileSync(join(memDir, 'settings.json'), `${JSON.stringify(original, null, 2)}\n`, 'utf8');
    writeFileSync(
      join(home, '.clawgod', 'provider.json'),
      `${JSON.stringify({ apiKey: 'provider-secret', baseURL: 'https://gateway.example.test' })}\n`,
      'utf8',
    );
    const stableLauncher = join(home, '.local', 'bin', process.platform === 'win32' ? 'claude.cmd' : 'claude');
    const temporaryShim = join(home, 'tmp', 'cmux-cli-shims', process.platform === 'win32' ? 'claude.cmd' : 'claude');
    mkdirSync(join(home, 'tmp', 'cmux-cli-shims'), { recursive: true });
    writeFileSync(stableLauncher, 'stable launcher\n', 'utf8');
    writeFileSync(temporaryShim, 'temporary shim\n', 'utf8');

    const first = runHelper(home, 'install', {
      CLAWGOD_CLAUDE_BIN: temporaryShim,
      CLAWGOD_CLAUDE_MEM_SKIP_CLEANUP: '1',
    });
    assert.equal(first.status, 0, first.stderr);
    const configured = JSON.parse(readFileSync(join(memDir, 'settings.json'), 'utf8'));
    assert.equal(configured.CLAUDE_MEM_PROVIDER, 'claude');
    assert.equal(configured.CLAUDE_MEM_MODEL, 'haiku');
    assert.equal(configured.CLAUDE_MEM_CLAUDE_AUTH_METHOD, 'gateway');
    assert.equal(configured.CLAUDE_CODE_PATH, join(home, '.clawgod', process.platform === 'win32' ? 'claude-mem.cmd' : 'claude-mem'));
    assert.match(readFileSync(configured.CLAUDE_CODE_PATH, 'utf8'), new RegExp(stableLauncher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(readFileSync(configured.CLAUDE_CODE_PATH, 'utf8'), /cmux-cli-shims/);
    assert.equal(configured.custom, 'preserved');
    assert.equal(existsSync(join(memDir, '.env')), false, 'compatibility must not copy provider secrets into claude-mem');
    assert.deepEqual(
      JSON.parse(readFileSync(join(memDir, 'clawgod-settings-backup.json'), 'utf8')),
      {
        CLAUDE_MEM_MODEL: original.CLAUDE_MEM_MODEL,
        CLAUDE_MEM_CLAUDE_AUTH_METHOD: original.CLAUDE_MEM_CLAUDE_AUTH_METHOD,
        CLAUDE_CODE_PATH: original.CLAUDE_CODE_PATH,
      },
    );

    const once = readFileSync(join(memDir, 'settings.json'), 'utf8');
    const second = runHelper(home, 'install', { CLAWGOD_CLAUDE_MEM_SKIP_CLEANUP: '1' });
    assert.equal(second.status, 0, second.stderr);
    assert.equal(readFileSync(join(memDir, 'settings.json'), 'utf8'), once, 'reinstall must be idempotent');

    const edited = { ...configured, CLAUDE_MEM_MODEL: 'user-choice' };
    writeFileSync(join(memDir, 'settings.json'), `${JSON.stringify(edited, null, 2)}\n`, 'utf8');
    const upgradeAfterUserChange = runHelper(home, 'install', { CLAWGOD_CLAUDE_MEM_SKIP_CLEANUP: '1' });
    assert.equal(upgradeAfterUserChange.status, 0, upgradeAfterUserChange.stderr);
    assert.equal(JSON.parse(readFileSync(join(memDir, 'settings.json'), 'utf8')).CLAUDE_MEM_MODEL, 'user-choice', 'upgrade must preserve user changes made after install');

    const preserveUninstall = runHelper(home, 'uninstall');
    assert.equal(preserveUninstall.status, 0, preserveUninstall.stderr);
    assert.deepEqual(
      JSON.parse(readFileSync(join(memDir, 'settings.json'), 'utf8')),
      { ...edited, CLAUDE_MEM_CLAUDE_AUTH_METHOD: original.CLAUDE_MEM_CLAUDE_AUTH_METHOD, CLAUDE_CODE_PATH: original.CLAUDE_CODE_PATH },
      'uninstall must preserve user changes while restoring ClawGod-owned settings',
    );

    writeFileSync(join(memDir, 'settings.json'), `${JSON.stringify(configured, null, 2)}\n`, 'utf8');
    writeFileSync(join(memDir, 'clawgod-settings-backup.json'), `${JSON.stringify({ CLAUDE_MEM_MODEL: original.CLAUDE_MEM_MODEL, CLAUDE_MEM_CLAUDE_AUTH_METHOD: original.CLAUDE_MEM_CLAUDE_AUTH_METHOD, CLAUDE_CODE_PATH: original.CLAUDE_CODE_PATH }, null, 2)}\n`, 'utf8');
    writeFileSync(join(memDir, 'clawgod-settings-state.json'), `${JSON.stringify({ CLAUDE_MEM_MODEL: configured.CLAUDE_MEM_MODEL, CLAUDE_MEM_CLAUDE_AUTH_METHOD: configured.CLAUDE_MEM_CLAUDE_AUTH_METHOD, CLAUDE_CODE_PATH: configured.CLAUDE_CODE_PATH }, null, 2)}\n`, 'utf8');
    const uninstall = runHelper(home, 'uninstall');
    assert.equal(uninstall.status, 0, uninstall.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(memDir, 'settings.json'), 'utf8')), original);
    assert.equal(existsSync(join(memDir, 'clawgod-settings-backup.json')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = makeHome(helper);
  try {
    const memDir = join(home, '.claude-mem');
    mkdirSync(memDir, { recursive: true });
    writeFileSync(join(memDir, 'settings.json'), '{invalid json\n', 'utf8');
    writeFileSync(join(memDir, 'clawgod-settings-backup.json'), '{}\n', 'utf8');
    writeFileSync(join(memDir, 'clawgod-settings-state.json'), '{}\n', 'utf8');
    const launcher = join(home, '.clawgod', process.platform === 'win32' ? 'claude-mem.cmd' : 'claude-mem');
    writeFileSync(launcher, 'compat launcher\n', 'utf8');
    const uninstall = runHelper(home, 'uninstall');
    assert.notEqual(uninstall.status, 0, `${installerName}: uninstall must stop when claude-mem settings cannot be restored`);
    assert.equal(existsSync(join(memDir, 'clawgod-settings-backup.json')), true);
    assert.equal(existsSync(join(memDir, 'clawgod-settings-state.json')), true);
    assert.equal(existsSync(launcher), true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = makeHome(helper);
  try {
    const memDir = join(home, '.claude-mem');
    mkdirSync(memDir, { recursive: true });
    const launcher = join(home, '.clawgod', process.platform === 'win32' ? 'claude-mem.cmd' : 'claude-mem');
    writeFileSync(join(memDir, 'settings.json'), '{"CLAUDE_CODE_PATH":"managed-launcher"}\n', 'utf8');
    writeFileSync(join(memDir, 'clawgod-settings-backup.json'), '{}\n', 'utf8');
    writeFileSync(launcher, 'compat launcher\n', 'utf8');
    const uninstall = runHelper(home, 'uninstall');
    assert.notEqual(uninstall.status, 0, `${installerName}: uninstall must stop when compatibility state is missing`);
    assert.equal(existsSync(join(memDir, 'clawgod-settings-backup.json')), true);
    assert.equal(existsSync(launcher), true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = makeHome(helper);
  try {
    const memDir = join(home, '.claude-mem');
    mkdirSync(memDir, { recursive: true });
    const original = { CLAUDE_MEM_PROVIDER: 'claude', CLAUDE_MEM_MODEL: 'claude-haiku-4-5-20251001' };
    writeFileSync(join(memDir, 'settings.json'), `${JSON.stringify(original, null, 2)}\n`, 'utf8');
    writeFileSync(join(home, '.clawgod', 'provider.json'), '{"apiKey":"","baseURL":"https://api.anthropic.com"}\n', 'utf8');
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(join(home, '.claude', 'settings.json'), '{"env":{"ANTHROPIC_AUTH_TOKEN":"settings-secret","ANTHROPIC_BASE_URL":"https://settings-gateway.example.test"}}\n', 'utf8');
    const run = runHelper(home, 'install', { CLAWGOD_CLAUDE_MEM_SKIP_CLEANUP: '1' });
    assert.equal(run.status, 0, run.stderr);
    const configured = JSON.parse(readFileSync(join(memDir, 'settings.json'), 'utf8'));
    assert.equal(configured.CLAUDE_MEM_MODEL, 'haiku');
    assert.equal(configured.CLAUDE_MEM_CLAUDE_AUTH_METHOD, 'gateway');
    assert.equal(existsSync(join(memDir, '.env')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = makeHome(helper);
  try {
    const memDir = join(home, '.claude-mem');
    mkdirSync(memDir, { recursive: true });
    const original = { CLAUDE_MEM_PROVIDER: 'claude', CLAUDE_MEM_MODEL: 'claude-haiku-4-5-20251001' };
    writeFileSync(join(memDir, 'settings.json'), `${JSON.stringify(original, null, 2)}\n`, 'utf8');
    writeFileSync(join(home, '.clawgod', 'provider.json'), '{"apiKey":"","baseURL":"https://api.anthropic.com"}\n', 'utf8');
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(join(home, '.claude', 'settings.json'), '{}\n', 'utf8');
    const run = runHelper(home);
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(memDir, 'settings.json'), 'utf8')), original);
    assert.equal(existsSync(join(memDir, 'clawgod-settings-backup.json')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = makeHome(helper);
  try {
    const memDir = join(home, '.claude-mem');
    mkdirSync(memDir, { recursive: true });
    writeFileSync(join(memDir, 'settings.json'), '{invalid json\n', 'utf8');
    writeFileSync(join(home, '.clawgod', 'provider.json'), '{"apiKey":"provider-secret","baseURL":"https://gateway.example.test"}\n', 'utf8');
    const run = runHelper(home);
    assert.notEqual(run.status, 0, `${installerName}: corrupt claude-mem settings must fail closed`);
    assert.equal(readFileSync(join(memDir, 'settings.json'), 'utf8'), '{invalid json\n');
    assert.equal(existsSync(join(memDir, 'clawgod-settings-backup.json')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = makeHome(helper);
  try {
    const memDir = join(home, '.claude-mem');
    mkdirSync(memDir, { recursive: true });
    const original = { CLAUDE_MEM_PROVIDER: 'gemini', CLAUDE_MEM_MODEL: 'gemini-2.5-flash-lite' };
    writeFileSync(join(memDir, 'settings.json'), `${JSON.stringify(original, null, 2)}\n`, 'utf8');
    writeFileSync(join(home, '.clawgod', 'provider.json'), '{"apiKey":"provider-secret","baseURL":"https://gateway.example.test"}\n', 'utf8');
    const run = runHelper(home);
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(memDir, 'settings.json'), 'utf8')), original);
    assert.equal(existsSync(join(memDir, 'clawgod-settings-backup.json')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = makeHome(helper);
  try {
    const bin = join(home, '.local', 'bin');
    const launcher = join(bin, 'claude');
    const cli = join(home, '.clawgod', 'cli.cjs');
    const fakeBun = join(bin, 'fake-bun');
    const capture = join(home, 'capture.json');
    writeFileSync(cli, '', 'utf8');
    const wrapperStart = unixInstaller.indexOf("cat > \"$CLAWGOD_DIR/cli.cjs\" << 'WRAPPER_EOF'");
    const wrapperBody = unixInstaller.indexOf('\n', wrapperStart) + 1;
    const wrapperEnd = unixInstaller.indexOf('\nWRAPPER_EOF', wrapperBody);
    assert.notEqual(wrapperStart, -1);
    assert.notEqual(wrapperEnd, -1);
    writeFileSync(cli, unixInstaller.slice(wrapperBody, wrapperEnd), 'utf8');
    writeFileSync(
      join(home, '.clawgod', 'provider.json'),
      `${JSON.stringify({ apiKey: 'provider-secret', baseURL: 'https://gateway.example.test', smallModel: 'provider-haiku' })}\n`,
      'utf8',
    );
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(
      join(home, '.claude', 'settings.json'),
      `${JSON.stringify({ env: { ANTHROPIC_DEFAULT_HAIKU_MODEL: 'settings-haiku', ANTHROPIC_AUTH_TOKEN: 'settings-secret', ANTHROPIC_BASE_URL: 'https://settings-gateway.example.test' } })}\n`,
      'utf8',
    );
    mkdirSync(join(home, '.claude-mem'), { recursive: true });
    writeFileSync(join(home, '.claude-mem', 'settings.json'), '{}\n', 'utf8');
    writeFileSync(
      fakeBun,
      `#!/bin/sh\nnode -e 'require("node:fs").writeFileSync(process.env.CAPTURE_FILE, JSON.stringify({ argv: process.argv.slice(1), baseURL: process.env.ANTHROPIC_BASE_URL, token: process.env.ANTHROPIC_AUTH_TOKEN, haiku: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL }))' "$@"\n`,
      'utf8',
    );
    chmodSync(fakeBun, 0o755);

    const start = unixInstaller.indexOf('LAUNCHER_CONTENT="');
    const end = unixInstaller.indexOf('"\n\n\n# Back up original claude', start);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    const assignment = unixInstaller.slice(start, end + 1);
    const rendered = spawnSync('bash', ['-c', `${assignment}\nprintf '%s' "$LAUNCHER_CONTENT"`], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home, CLAWGOD_DIR: join(home, '.clawgod'), BUN_BIN: fakeBun, CLAUDE_BIN: launcher },
    });
    assert.equal(rendered.status, 0, rendered.stderr);
    writeFileSync(launcher, rendered.stdout, 'utf8');
    chmodSync(launcher, 0o755);

    writeFileSync(
      join(home, '.clawgod', 'cli.original.cjs'),
      `require("node:fs").writeFileSync(process.env.CAPTURE_FILE, JSON.stringify({ argv: process.argv.slice(2), baseURL: process.env.ANTHROPIC_BASE_URL, token: process.env.ANTHROPIC_AUTH_TOKEN, haiku: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL }))\n`,
      'utf8',
    );
    writeFileSync(
      fakeBun,
      '#!/bin/sh\nexec node "$@"\n',
      'utf8',
    );
    chmodSync(fakeBun, 0o755);
    const run = spawnSync(launcher, ['--input-format', 'stream-json'], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home, CAPTURE_FILE: capture, CLAWGOD_CLAUDE_MEM: '1' },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(readFileSync(capture, 'utf8')), {
      argv: ['--input-format', 'stream-json'],
      baseURL: 'https://gateway.example.test',
      token: 'provider-secret',
      haiku: 'settings-haiku',
    });

    const probe = spawnSync(launcher, ['--permission-mode', 'dontAsk', '--version'], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home, CAPTURE_FILE: capture, CLAWGOD_CLAUDE_MEM: '1' },
    });
    assert.equal(probe.status, 0, probe.stderr);
    assert.deepEqual(
      JSON.parse(readFileSync(capture, 'utf8')).argv,
      ['--permission-mode', 'dontAsk', '--version'],
      `${installerName}: claude-mem capability probes must not auto-enable Chrome`,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = makeHome(helper);
  try {
    const memDir = join(home, '.claude-mem');
    mkdirSync(memDir, { recursive: true });
    writeFileSync(join(memDir, 'settings.json'), '{"CLAUDE_MEM_PROVIDER":"claude"}\n', 'utf8');
    writeFileSync(
      join(memDir, 'supervisor.json'),
      `${JSON.stringify({ processes: { worker: { pid: process.pid }, 'chroma-mcp': { pid: 222 } } })}\n`,
      'utf8',
    );
    const caseVariant = join(memDir, 'chroma').replace(/claude-mem/g, 'CLAUDE-MEM');
    const psFixture = [
      ' 111 1 uvx chroma-mcp --client-type persistent --data-dir ' + join(memDir, 'chroma'),
      ' 222 999 uvx chroma-mcp --client-type persistent --data-dir ' + join(memDir, 'chroma'),
      ' 333 1 uvx chroma-mcp --client-type persistent --data-dir ' + join(home, 'other-chroma'),
      ' 444 1 uvx chroma-mcp --client-type persistent --data-dir ' + join(memDir, 'chroma-old'),
      ' 555 1 uvx chroma-mcp --client-type persistent --data-dir ' + caseVariant,
    ].join('\n');
    const run = runHelper(home, 'cleanup', {
      CLAWGOD_CLAUDE_MEM_PS_FIXTURE: psFixture,
      CLAWGOD_CLAUDE_MEM_DRY_RUN: '1',
    });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout), { stalePids: [111], keptPid: 222 });

    writeFileSync(join(memDir, 'supervisor.json'), '{"processes":{}}\n', 'utf8');
    const noCurrent = runHelper(home, 'cleanup', {
      CLAWGOD_CLAUDE_MEM_PS_FIXTURE: psFixture,
      CLAWGOD_CLAUDE_MEM_DRY_RUN: '1',
    });
    assert.equal(noCurrent.status, 0, noCurrent.stderr);
    assert.deepEqual(JSON.parse(noCurrent.stdout), { stalePids: [], keptPid: null }, `${installerName}: cleanup must fail closed without a verified current Chroma PID`);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

}


{
  const windowsHelper = powerShellHelper.replace("const isWindows = process.platform === 'win32';", 'const isWindows = true;');
  const home = makeHome(windowsHelper);
  try {
    const memDir = join(home, '.claude-mem');
    mkdirSync(memDir, { recursive: true });
    writeFileSync(join(memDir, 'settings.json'), '{"CLAUDE_MEM_PROVIDER":"claude"}\n', 'utf8');
    writeFileSync(join(home, '.clawgod', 'provider.json'), '{"apiKey":"provider-secret","baseURL":"https://gateway.example.test"}\n', 'utf8');
    const mainBin = join(home, '.local', 'bin', 'claude.cmd');
    const run = runHelper(home, 'install', {
      CLAWGOD_CLAUDE_BIN: mainBin,
      CLAWGOD_CLAUDE_MEM_SKIP_CLEANUP: '1',
    });
    assert.equal(run.status, 0, run.stderr);
    const settings = JSON.parse(readFileSync(join(memDir, 'settings.json'), 'utf8'));
    assert.equal(settings.CLAUDE_CODE_PATH, join(home, '.clawgod', 'claude-mem.cmd'));
    assert.equal(
      readFileSync(settings.CLAUDE_CODE_PATH, 'utf8'),
      `@echo off\r\nset "CLAWGOD_CLAUDE_MEM=1"\r\ncall "${mainBin}" %*\r\nexit /b %ERRORLEVEL%\r\n`,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}


console.log('claude-mem compatibility checks passed');
