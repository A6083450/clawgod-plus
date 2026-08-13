#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const unixLauncher = readFileSync(new URL('../src/unix/launcher.sh', import.meta.url), 'utf8');
const powerShellInstaller = readFileSync(new URL('../src/template/install.ps1', import.meta.url), 'utf8');
const canonicalHelper = readFileSync(new URL('../src/generic/runtime/claude-mem-compat.cjs', import.meta.url), 'utf8');
const canonicalPluginDependenciesUrl = new URL('../src/generic/runtime/plugin-dependencies.mjs', import.meta.url);
const canonicalWrapper = readFileSync(new URL('../src/generic/runtime/wrapper.cjs', import.meta.url), 'utf8');
assert.match(canonicalHelper, /^#!\/usr\/bin\/env bun\n/, 'claude-mem compatibility helper must run with Bun');
assert.match(powerShellInstaller, /if \(\$LASTEXITCODE -ne 0\) \{ throw "claude-mem compatibility helper exited \$LASTEXITCODE" \}/, 'Windows uninstall must stop on helper failure');

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

for (const [installerName, helper] of [['canonical source', canonicalHelper]]) {
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
      'uninstall must preserve user changes while restoring ClawGod Plus-owned settings',
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
    writeFileSync(cli, canonicalWrapper, 'utf8');
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
      `#!/bin/sh\nexec "${process.execPath}" "$@"\n`,
      'utf8',
    );
    chmodSync(fakeBun, 0o755);

    const assignment = unixLauncher;
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
      `#!/bin/sh\nexec "${process.execPath}" "$@"\n`,
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
  const windowsHelper = canonicalHelper.replace("const isWindows = process.platform === 'win32';", 'const isWindows = true;');
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


{
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'clawgod-claude-mem-rewrite-'));
  try {
    const { rewriteClaudeMemFile } = await import(`${canonicalPluginDependenciesUrl.href}?test=${Date.now()}`);
    assert.equal(typeof rewriteClaudeMemFile, 'function', 'plugin-dependencies.mjs must export rewriteClaudeMemFile');

    const hookCommands = [
      'node "$_P/scripts/version-check.js"',
      'node "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" start',
      'node "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" hook claude-code context',
      'node "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" hook claude-code session-init',
      'node "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" hook claude-code observation',
      'node "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" hook claude-code file-context',
      'node "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" hook claude-code summarize',
    ];
    const hookPrefix = 'export PATH="$($SHELL -lc \'echo $PATH\' 2>/dev/null):$PATH"; _C="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"; _E="${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-}}"; _P="$_E"; [ -n "$_P" ] || exit 1; ';
    const hookNames = ['Setup', 'SessionStart', 'UserPromptSubmit', 'PostToolUse', 'PreToolUse', 'Stop', 'SubagentStop'];
    const hooksFixture = {
      description: 'Claude-mem memory system hooks; node is descriptive, node:fs and addon.node stay text',
      hooks: Object.fromEntries(hookNames.map((name, index) => [name, [{
        matcher: index === 0 ? '*' : undefined,
        hooks: [{ type: 'command', shell: 'bash', command: `${hookPrefix}${hookCommands[index]}`, timeout: 60 }],
      }]])),
    };
    const hooksRaw = `${JSON.stringify(hooksFixture, null, 2)}\n`;
    const bunPath = "/tmp/claude mem/it's [bun]?/bun";
    const quotedBun = "'/tmp/claude mem/it'\"'\"'s [bun]?/bun'";
    const rewrittenHooks = rewriteClaudeMemFile('hooks/hooks.json', hooksRaw, bunPath);
    assert.equal(rewrittenHooks.replacements, 7, 'all seven 13.14.0 hook entrypoints must be rewritten');
    const parsedHooks = JSON.parse(rewrittenHooks.text);
    assert.equal(parsedHooks.description, hooksFixture.description, 'descriptive node text and extension/import text must remain unchanged');
    for (const [index, name] of hookNames.entries()) {
      const command = parsedHooks.hooks[name][0].hooks[0].command;
      assert.equal(command, `${hookPrefix}${hookCommands[index].replace(/^node /, `${quotedBun} `)}`, `${name} must replace only its executable token`);
      assert.doesNotMatch(command, /(^|[;&|]\s*)node\s+(?=["']?\$_P\/scripts\/)/, `${name} must retain no executable Node entrypoint`);
    }

    const mcp = { mcpServers: { 'mcp-search': { type: 'stdio', command: 'node', args: ['-e', 'process.stdout.write(process.execPath)'] } } };
    const rewrittenMcp = rewriteClaudeMemFile('.mcp.json', `${JSON.stringify(mcp, null, 2)}\n`, process.execPath);
    assert.equal(rewrittenMcp.replacements, 1, 'the mcp-search command must be the only MCP replacement');
    assert.deepEqual(JSON.parse(rewrittenMcp.text), {
      mcpServers: { 'mcp-search': { type: 'stdio', command: process.execPath, args: ['-e', 'process.stdout.write(process.execPath)'] } },
    }, 'MCP rewriting must preserve the -e program and replace only the executable');
    const windowsBunPath = 'C:\\Program Files\\Bun\\bun.exe';
    const windowsHooks = rewriteClaudeMemFile('hooks/hooks.json', hooksRaw, windowsBunPath);
    assert.match(windowsHooks.text, /'C:\\\\Program Files\\\\Bun\\\\bun\.exe'/, 'Windows source behavior must embed a single-quoted absolute Bun hook executable');
    const windowsMcp = rewriteClaudeMemFile('.mcp.json', JSON.stringify(mcp), windowsBunPath);
    assert.equal(JSON.parse(windowsMcp.text).mcpServers['mcp-search'].command, windowsBunPath, 'Windows source behavior must persist the absolute Bun MCP executable');

    const missingVersion = structuredClone(hooksFixture);
    delete missingVersion.hooks.Setup;
    assert.throws(() => rewriteClaudeMemFile('hooks/hooks.json', JSON.stringify(missingVersion), process.execPath), /version-check|replacement|schema/i, 'hooks without version-check must fail closed');
    const missingRunner = structuredClone(hooksFixture);
    for (const name of hookNames.slice(1)) delete missingRunner.hooks[name];
    assert.throws(() => rewriteClaudeMemFile('hooks/hooks.json', JSON.stringify(missingRunner), process.execPath), /bun-runner|replacement|schema/i, 'hooks without bun-runner must fail closed');
    const duplicateExecutable = structuredClone(hooksFixture);
    duplicateExecutable.hooks.Setup[0].hooks[0].command += `; ${hookCommands[0]}`;
    assert.throws(() => rewriteClaudeMemFile('hooks/hooks.json', JSON.stringify(duplicateExecutable), process.execPath), /duplicate|unique|multiple/i, 'two identical executable tokens in one hook must fail closed');
    const unknownExecutable = structuredClone(hooksFixture);
    unknownExecutable.hooks.Setup[0].hooks[0].command += '; node "$_P/scripts/unknown.js"';
    assert.throws(() => rewriteClaudeMemFile('hooks/hooks.json', JSON.stringify(unknownExecutable), process.execPath), /unknown|remaining|executable|node/i, 'unknown plugin script entrypoints must fail closed');
    const quotedDecoyOnly = structuredClone(hooksFixture);
    quotedDecoyOnly.hooks.Setup[0].hooks[0].command = `${hookPrefix}printf '%s' 'text; node "$_P/scripts/version-check.js"'`;
    const newlineUnknownExecutable = structuredClone(hooksFixture);
    newlineUnknownExecutable.hooks.Setup[0].hooks[0].command += '\nnode "$_P/scripts/unknown.js"';
    const acceptedShellDecoys = [];
    for (const [label, fixture] of [
      ['single-quoted version-check decoy', quotedDecoyOnly],
      ['newline unknown executable', newlineUnknownExecutable],
    ]) {
      try {
        rewriteClaudeMemFile('hooks/hooks.json', JSON.stringify(fixture), process.execPath);
        acceptedShellDecoys.push(label);
      } catch {}
    }
    assert.deepEqual(acceptedShellDecoys, [], 'quoted text must not count as an executable and newline command boundaries must reject unknown scripts');
    const quotedTextWithRealExecutable = structuredClone(hooksFixture);
    quotedTextWithRealExecutable.hooks.Setup[0].hooks[0].command = `${hookPrefix}printf '%s' 'text; node "$_P/scripts/version-check.js"'; ${hookCommands[0]}`;
    const quotedTextResult = JSON.parse(rewriteClaudeMemFile('hooks/hooks.json', JSON.stringify(quotedTextWithRealExecutable), process.execPath).text);
    assert.match(quotedTextResult.hooks.Setup[0].hooks[0].command, /printf '%s' 'text; node "\$_P\/scripts\/version-check\.js"'/, 'ordinary quoted Node text must remain byte-identical');
    const descriptiveNode = structuredClone(hooksFixture);
    descriptiveNode.hooks.Setup[0].hooks[0].note = 'run node for node:fs while native.node remains unchanged';
    const descriptiveResult = JSON.parse(rewriteClaudeMemFile('hooks/hooks.json', JSON.stringify(descriptiveNode), process.execPath).text);
    assert.equal(descriptiveResult.hooks.Setup[0].hooks[0].note, descriptiveNode.hooks.Setup[0].hooks[0].note, 'non-command node text must not be edited');
    assert.throws(() => rewriteClaudeMemFile('hooks/hooks.json', '{broken json\n', process.execPath), /json/i, 'malformed hook JSON must fail closed');
    assert.throws(() => rewriteClaudeMemFile('.mcp.json', '{broken json\n', process.execPath), /json/i, 'malformed MCP JSON must fail closed');
    for (const [label, invalidMcp] of [
      ['missing server', { mcpServers: {} }],
      ['wrong type', { mcpServers: { 'mcp-search': { ...mcp.mcpServers['mcp-search'], type: 'http' } } }],
      ['wrong command', { mcpServers: { 'mcp-search': { ...mcp.mcpServers['mcp-search'], command: 'bun' } } }],
      ['missing eval program', { mcpServers: { 'mcp-search': { ...mcp.mcpServers['mcp-search'], args: ['script.cjs'] } } }],
    ]) {
      assert.throws(() => rewriteClaudeMemFile('.mcp.json', JSON.stringify(invalidMcp), process.execPath), /mcp-search|schema|command|args/i, `${label} MCP schema must fail closed`);
    }

    const smokeHome = join(fixtureRoot, 'smoke-home');
    const smokeClaude = join(fixtureRoot, 'smoke-claude');
    const smokePlugin = join(fixtureRoot, 'smoke-plugin');
    const smokeBin = join(fixtureRoot, 'smoke-bin');
    const smokeScripts = join(smokePlugin, 'scripts');
    const nodeMarker = join(fixtureRoot, 'forbidden-node-ran');
    mkdirSync(smokeHome, { recursive: true });
    mkdirSync(smokeClaude, { recursive: true });
    mkdirSync(smokeScripts, { recursive: true });
    mkdirSync(smokeBin, { recursive: true });
    writeFileSync(join(smokeScripts, 'version-check.js'), 'process.exit(0);\n', 'utf8');
    writeFileSync(join(smokeScripts, 'bun-runner.js'), `
const child = Bun.spawn({
  cmd: [process.execPath, process.argv[2], ...process.argv.slice(3)],
  stdin: 'inherit', stdout: 'inherit', stderr: 'inherit', env: process.env,
});
process.exit(await child.exited);
`, 'utf8');
    writeFileSync(join(smokeScripts, 'worker-service.cjs'), `
const input = new Uint8Array(await new Response(Bun.stdin.stream()).arrayBuffer());
await Bun.write(Bun.stdout, new Uint8Array([...new TextEncoder().encode(process.env.CLAUDE_MEM_SMOKE + ':' + process.argv.slice(2).join(' ') + ':'), ...input]));
await Bun.write(Bun.stderr, 'fixture-stderr');
process.exit(23);
`, 'utf8');
    writeFileSync(join(smokeBin, 'node'), `#!/bin/sh\nprintf forbidden > ${JSON.stringify(nodeMarker)}\nexit 90\n`, 'utf8');
    chmodSync(join(smokeBin, 'node'), 0o700);
    writeFileSync(join(smokeBin, 'bun'), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} "$@"\n`, 'utf8');
    chmodSync(join(smokeBin, 'bun'), 0o700);
    const smokeHooks = {
      hooks: {
        Setup: [{ hooks: [{ type: 'command', command: `_P="$PLUGIN_ROOT"; ${hookCommands[0]}` }] }],
        SessionStart: [{ hooks: [{ type: 'command', command: `_P="$PLUGIN_ROOT"; ${hookCommands[2]}` }] }],
      },
    };
    const smokeRewrite = rewriteClaudeMemFile('hooks/hooks.json', JSON.stringify(smokeHooks), process.execPath);
    const smokeCommand = JSON.parse(smokeRewrite.text).hooks.SessionStart[0].hooks[0].command;
    const smokeInput = Buffer.from('fixture-stdin\n');
    const smokeChild = Bun.spawn({
      cmd: ['/bin/sh', '-c', smokeCommand],
      cwd: fixtureRoot,
      env: {
        HOME: smokeHome,
        CLAUDE_CONFIG_DIR: smokeClaude,
        PATH: smokeBin,
        PLUGIN_ROOT: smokePlugin,
        CLAUDE_MEM_SMOKE: 'fixture-env',
      },
      stdin: new Blob([smokeInput]),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const smokeExit = await smokeChild.exited;
    const smokeStdout = Buffer.from(await new Response(smokeChild.stdout).arrayBuffer());
    const smokeStderr = Buffer.from(await new Response(smokeChild.stderr).arrayBuffer());
    assert.equal(smokeExit, 23, 'the rewritten hook must propagate the worker nonzero exit code');
    assert.deepEqual(smokeStdout, Buffer.concat([Buffer.from('fixture-env:hook claude-code context:'), smokeInput]), 'the rewritten hook must forward environment, argv, stdin, and stdout');
    assert.deepEqual(smokeStderr, Buffer.from('fixture-stderr'), 'the rewritten hook must forward stderr');
    assert.equal(existsSync(nodeMarker), false, 'the forbidden Node shim must not execute');

    const mcpSmoke = rewriteClaudeMemFile('.mcp.json', JSON.stringify(mcp), process.execPath);
    const mcpServer = JSON.parse(mcpSmoke.text).mcpServers['mcp-search'];
    const mcpRun = Bun.spawnSync([mcpServer.command, ...mcpServer.args], {
      cwd: fixtureRoot,
      env: { HOME: smokeHome, CLAUDE_CONFIG_DIR: smokeClaude, PATH: smokeBin },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    assert.equal(mcpRun.exitCode, 0, mcpRun.stderr.toString());
    assert.equal(mcpRun.stdout.toString(), process.execPath, 'the rewritten MCP command must execute the current Bun');
    assert.equal(existsSync(nodeMarker), false, 'MCP smoke must not execute the forbidden Node shim');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}


console.log('claude-mem compatibility checks passed');
