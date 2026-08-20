#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const unix = await Bun.file(new URL('../src/template/install.sh', import.meta.url)).text();
const windows = await Bun.file(new URL('../src/template/install.ps1', import.meta.url)).text();
const canonicalModulePath = fileURLToPath(new URL('../src/generic/runtime/plugin-dependencies.mjs', import.meta.url));
const canonicalHudStatusLinePath = fileURLToPath(new URL('../src/generic/runtime/claude-hud-statusline.mjs', import.meta.url));
const canonicalHudStatusLine = readFileSync(canonicalHudStatusLinePath, 'utf8');
const canonicalEnhancementConfigPath = fileURLToPath(new URL('../src/generic/enhancement-config.mjs', import.meta.url));
const canonicalEnhancementManifest = readFileSync(new URL('../src/generic/enhancements.json', import.meta.url), 'utf8');

function records(id, version) {
  return { plugins: { [id]: [{ scope: 'user', version }] } };
}

function archiveSpec(base, bytes, overrides = {}) {
  return {
    ...base,
    bytes: bytes.byteLength,
    sha256: new Bun.CryptoHasher('sha256').update(bytes).digest('hex'),
    ...overrides,
  };
}

async function pluginArchive(base, overrides = {}) {
  const root = overrides.root || `fixture-${base.key}`;
  const source = overrides.source ?? (base.key === 'memory' ? './plugin/' : './');
  const pluginRoot = source.replace(/^\.\//, '').replace(/\/$/, '');
  const pluginPrefix = pluginRoot ? `${root}/${pluginRoot}` : root;
  const marketplace = {
    name: overrides.marketplaceName ?? base.archiveMarketplace ?? base.marketplace,
    plugins: [{ name: base.plugin, source }],
  };
  if (overrides.owner !== undefined) marketplace.owner = overrides.owner;
  if (overrides.entryVersion !== undefined) marketplace.plugins[0].version = overrides.entryVersion;
  const plugin = {
    name: overrides.pluginName ?? base.plugin,
    version: overrides.pluginVersion ?? base.version,
  };
  return new Bun.Archive({
    [`${root}/.claude-plugin/marketplace.json`]: JSON.stringify(marketplace),
    [`${pluginPrefix}/.claude-plugin/plugin.json`]: JSON.stringify(plugin),
    [`${root}/README.md`]: 'fixture only\n',
    ...(overrides.entries || {}),
  }, { compress: 'gzip' }).bytes();
}

function writeTarString(header, offset, length, value) {
  const bytes = Buffer.from(value);
  assert.ok(bytes.length <= length, `tar fixture field is too long: ${value}`);
  bytes.copy(header, offset);
}

function tarHeader({ name, type = '0', size = 0, mode = 0o755, modeField, sizeField, checksumStyle, linkname }) {
  const header = Buffer.alloc(512);
  writeTarString(header, 0, 100, name);
  writeTarString(header, 100, 8, modeField ?? `${mode.toString(8).padStart(7, '0')}\0`);
  writeTarString(header, 108, 8, '0000000\0');
  writeTarString(header, 116, 8, '0000000\0');
  writeTarString(header, 124, 12, sizeField ?? `${size.toString(8).padStart(11, '0')}\0`);
  writeTarString(header, 136, 12, '00000000000\0');
  header.fill(0x20, 148, 156);
  writeTarString(header, 156, 1, type);
  if (linkname !== undefined) writeTarString(header, 157, 100, linkname);
  writeTarString(header, 257, 6, 'ustar\0');
  writeTarString(header, 263, 2, '00');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  const checksumField = checksumStyle === 'tab'
    ? `\t${checksum.toString(8).padStart(6, '0')}\0`
    : `${checksum.toString(8).padStart(6, '0')}\0 `;
  writeTarString(header, 148, 8, checksumField);
  return header;
}

function rawTarBytes(entries, options = {}) {
  const chunks = [];
  for (const entry of entries) {
    const data = Buffer.from(entry.data || '');
    chunks.push(tarHeader({ ...entry, size: entry.size ?? data.length }));
    chunks.push(data);
    const padding = (512 - (data.length % 512)) % 512;
    if (padding) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc((options.terminatorBlocks ?? 2) * 512));
  if (options.tail) chunks.push(Buffer.from(options.tail));
  return Buffer.concat(chunks);
}

function rawTar(entries, options) {
  return Bun.gzipSync(rawTarBytes(entries, options));
}

function paxRecord(key, value) {
  const body = `${key}=${value}\n`;
  let length = body.length + 2;
  while (`${length} ${body}`.length !== length) length = `${length} ${body}`.length;
  return `${length} ${body}`;
}

async function rejectsArchive(extractPluginArchive, bytes, base, fixtureRoot, label, expected) {
  const destination = join(fixtureRoot, `reject-${label.replace(/[^a-z0-9]+/gi, '-')}`);
  await assert.rejects(
    extractPluginArchive(bytes, archiveSpec(base, bytes), destination),
    expected,
    `${label} must be rejected`,
  );
}

function snapshotTree(path) {
  if (!existsSync(path)) return { present: false };
  const status = lstatSync(path);
  if (status.isSymbolicLink()) return { present: true, type: 'link', target: readlinkSync(path), mode: status.mode & 0o777 };
  if (status.isFile()) return { present: true, type: 'file', bytes: readFileSync(path).toString('base64'), mode: status.mode & 0o777 };
  assert.equal(status.isDirectory(), true, `${path} must be a regular filesystem entry`);
  return {
    present: true,
    type: 'directory',
    mode: status.mode & 0o777,
    entries: Object.fromEntries(readdirSync(path).sort().map(name => [name, snapshotTree(join(path, name))])),
  };
}

function snapshotContentTree(path) {
  const status = lstatSync(path);
  if (status.isSymbolicLink()) return { type: 'link', target: readlinkSync(path) };
  if (status.isFile()) return { type: 'file', bytes: readFileSync(path).toString('base64'), mode: status.mode & 0o777 };
  assert.equal(status.isDirectory(), true, `${path} must be a regular filesystem entry`);
  return {
    type: 'directory',
    entries: Object.fromEntries(readdirSync(path).sort().map(name => [name, snapshotContentTree(join(path, name))])),
  };
}

function walkTextFiles(path, values = []) {
  const status = lstatSync(path);
  if (status.isDirectory()) {
    for (const name of readdirSync(path)) walkTextFiles(join(path, name), values);
  } else if (status.isFile()) {
    values.push(readFileSync(path, 'utf8'));
  }
  return values;
}

assert.match(unix, /PLUGIN_DEPENDENCIES_EOF\nchmod 700 "\$CLAWGOD_DIR\/plugin-dependencies\.mjs"/, 'install.sh must write plugin-dependencies.mjs with mode 0700');
assert.match(windows, /\[System\.IO\.File\]::WriteAllBytes\([^\n]*\$PluginDependenciesBytes\)/, 'install.ps1 must write plugin-dependencies.mjs without text transcoding');
assert.match(unix, /\$BUN_BIN[^\n]*plugin-dependencies\.mjs" ensure/, 'install.sh must invoke the generated plugin manager');
assert.match(windows, /& \$BunBin[^\r\n]*plugin-dependencies\.mjs"\) ensure/, 'install.ps1 must invoke the generated plugin manager');

const expected = {
  hud: {
    key: 'hud', id: 'claude-hud@claude-hud', marketplace: 'claude-hud', plugin: 'claude-hud',
    version: '0.7.0', bytes: 754443,
    sha256: '59bd3ec17e7b9181d8069c93cc7c5e1db8b1d33e6a94e4041f6589dd8b87c912',
    url: 'https://github.com/jarrodwatts/claude-hud/archive/refs/tags/v0.7.0.tar.gz',
  },
  memory: {
    key: 'memory', id: 'claude-mem@thedotmack', marketplace: 'thedotmack', plugin: 'claude-mem',
    version: '13.14.0', bytes: 11817347,
    sha256: 'a64f7dd038308da0db52f10d8f4fc2b3b3acfec5d9ddfdcfea9f6e473e54bed0',
    url: 'https://github.com/thedotmack/claude-mem/archive/refs/tags/v13.14.0.tar.gz',
  },
  superpowers: {
    key: 'superpowers', id: 'superpowers@superpowers-marketplace', marketplace: 'superpowers-marketplace', plugin: 'superpowers',
    archiveMarketplace: 'superpowers-dev',
    version: '6.2.0', bytes: 516401,
    sha256: '468246a7b4981d4c014c2b58d9ee538700ffded075279d5810059cdc1abeb5f3',
    url: 'https://github.com/obra/superpowers/archive/refs/tags/v6.2.0.tar.gz',
  },
};

const fixtureRoot = realpathSync(mkdtempSync(join(tmpdir(), 'clawgod-plugin-deps-')));
const fixtureHome = join(fixtureRoot, 'home');
const fixtureClaudeConfig = join(fixtureRoot, 'claude-config');
const fixtureBin = join(fixtureRoot, 'bin');
const environmentKeys = ['HOME', 'CLAUDE_CONFIG_DIR', 'PATH'];
const savedEnvironment = new Map(environmentKeys.map(key => [key, Object.hasOwn(process.env, key) ? process.env[key] : undefined]));
try {
  mkdirSync(fixtureHome, { recursive: true });
  mkdirSync(fixtureClaudeConfig, { recursive: true });
  mkdirSync(fixtureBin, { recursive: true });
  process.env.HOME = fixtureHome;
  process.env.CLAUDE_CONFIG_DIR = fixtureClaudeConfig;
  process.env.PATH = fixtureBin;

  const pluginDependencies = await import(`${pathToFileURL(canonicalModulePath).href}?test=${Date.now()}`);
  assert.deepEqual(
    Object.fromEntries(environmentKeys.map(key => [key, process.env[key]])),
    { HOME: fixtureHome, CLAUDE_CONFIG_DIR: fixtureClaudeConfig, PATH: fixtureBin },
    'plugin-dependencies.mjs must be imported with only fixture environment paths',
  );
  const {
    HUD_CONFIG_TEXT,
    PLUGIN_BASELINES,
    classifyPlugin,
    compareSemver,
    configureClaudeMemBun,
    configureHud,
    downloadAndStage,
    ensurePluginDependencies,
    ensureMarketplacePlugin,
    extractPluginArchive,
    parseSemver,
    quoteStatusLineArg,
    renderHudStatusLineModule,
    restoreManagedIntegrations,
    restoreHud,
    shouldConfigurePluginDependency,
    selectInstalledRecord,
    sha256,
    validateArchive,
  } = pluginDependencies;

  assert.equal(typeof extractPluginArchive, 'function', 'plugin-dependencies.mjs must export extractPluginArchive');
  assert.equal(typeof downloadAndStage, 'function', 'plugin-dependencies.mjs must export downloadAndStage');
  assert.equal(typeof ensurePluginDependencies, 'function', 'plugin-dependencies.mjs must export ensurePluginDependencies');
  assert.equal(typeof ensureMarketplacePlugin, 'function', 'plugin-dependencies.mjs must export ensureMarketplacePlugin');
  assert.equal(typeof shouldConfigurePluginDependency, 'function', 'plugin-dependencies.mjs must export its marketplace configuration gate');
  assert.equal(typeof configureClaudeMemBun, 'function', 'plugin-dependencies.mjs must export configureClaudeMemBun');
  assert.equal(typeof configureHud, 'function', 'plugin-dependencies.mjs must export configureHud');
  assert.equal(typeof renderHudStatusLineModule, 'function', 'plugin-dependencies.mjs must export renderHudStatusLineModule');
  assert.equal(
    renderHudStatusLineModule({ claudeConfigDir: '/fixture/claude-config' }),
    canonicalHudStatusLine.replace('"/__CLAWGOD_HUD_CLAUDE_CONFIG_DIR__"', '"/fixture/claude-config"'),
    'the plugin manager must render the canonical HUD runner instead of duplicating its logic',
  );
  assert.equal(typeof restoreHud, 'function', 'plugin-dependencies.mjs must export restoreHud for lifecycle composition');
  assert.equal(typeof restoreManagedIntegrations, 'function', 'plugin-dependencies.mjs must export shared managed integration restore');

  function makeLifecycleFixture(label, hudVersion = PLUGIN_BASELINES.hud.version) {
    const root = join(fixtureRoot, `lifecycle-${label}`);
    const home = join(root, 'home');
    const claudeConfigDir = join(root, 'claude-config');
    const clawgodDir = join(root, 'clawgod');
    const pluginRoot = join(claudeConfigDir, 'plugins');
    const hudInstall = join(pluginRoot, 'cache', 'claude-hud', 'claude-hud', PLUGIN_BASELINES.hud.version);
    const memoryInstall = join(pluginRoot, 'cache', 'thedotmack', 'claude-mem', PLUGIN_BASELINES.memory.version);
    const superpowersInstall = join(pluginRoot, 'cache', 'superpowers-marketplace', 'superpowers', PLUGIN_BASELINES.superpowers.version);
    mkdirSync(join(hudInstall, 'src'), { recursive: true });
    mkdirSync(join(memoryInstall, 'hooks'), { recursive: true });
    mkdirSync(superpowersInstall, { recursive: true });
    mkdirSync(clawgodDir, { recursive: true });
    writeFileSync(join(hudInstall, 'src', 'index.ts'), 'console.log("hud fixture");\n');
    writeFileSync(join(memoryInstall, 'hooks', 'hooks.json'), claudeMemHookRaw());
    writeFileSync(join(memoryInstall, '.mcp.json'), claudeMemMcpRaw());
    writeFileSync(join(pluginRoot, 'installed_plugins.json'), `${JSON.stringify({
      version: 2,
      plugins: {
        [PLUGIN_BASELINES.hud.id]: [{ scope: 'user', version: hudVersion, installPath: hudInstall }],
        [PLUGIN_BASELINES.memory.id]: [{ scope: 'user', version: PLUGIN_BASELINES.memory.version, installPath: memoryInstall }],
        [PLUGIN_BASELINES.superpowers.id]: [{ scope: 'user', version: PLUGIN_BASELINES.superpowers.version, installPath: superpowersInstall }],
      },
    }, null, 2)}\n`);
    const lifecycleModule = join(clawgodDir, 'plugin-dependencies.mjs');
    copyFileSync(canonicalModulePath, lifecycleModule);
    chmodSync(lifecycleModule, 0o700);
    copyFileSync(canonicalHudStatusLinePath, join(clawgodDir, 'claude-hud-statusline.mjs'));
    copyFileSync(canonicalEnhancementConfigPath, join(clawgodDir, 'enhancement-config.mjs'));
    writeFileSync(join(clawgodDir, 'enhancement-manifest.json'), canonicalEnhancementManifest);
    writeFileSync(join(clawgodDir, 'cli.original.cjs'), 'process.exit(67);\n');
    writeFileSync(join(clawgodDir, 'fetch-file.mjs'), 'process.exit(68);\n');
    return {
      root,
      home,
      claudeConfigDir,
      clawgodDir,
      lifecycleModule,
      hudConfig: join(pluginRoot, 'claude-hud', 'config.json'),
      statePath: join(clawgodDir, 'plugin-dependencies-state.json'),
      statusLineModule: join(clawgodDir, 'claude-hud-statusline.mjs'),
      env: {
        HOME: home,
        CLAUDE_CONFIG_DIR: claudeConfigDir,
        CLAWGOD_DIR: clawgodDir,
        CLAWGOD_BUN_BIN: process.execPath,
        PATH: fixtureBin,
      },
    };
  }

  function runLifecycleCommand(fixture, command) {
    return Bun.spawnSync({
      cmd: [process.execPath, fixture.lifecycleModule, command],
      cwd: fixture.root,
      env: fixture.env,
      stdout: 'pipe',
      stderr: 'pipe',
    });
  }

  function outputLines(result) {
    return new TextDecoder().decode(result.stdout).trim().split('\n').filter(Boolean);
  }

  const claudeMemHookCommands = [
    'node "$_P/scripts/version-check.js"',
    'node "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" start',
    'node "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" hook claude-code context',
    'node "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" hook claude-code session-init',
    'node "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" hook claude-code observation',
    'node "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" hook claude-code file-context',
    'node "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" hook claude-code summarize',
  ];
  const claudeMemHookNames = ['Setup', 'SessionStart', 'UserPromptSubmit', 'PostToolUse', 'PreToolUse', 'Stop', 'SubagentStop'];
  const claudeMemHookPrefix = 'export PATH="$($SHELL -lc \'echo $PATH\' 2>/dev/null):$PATH"; _C="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"; _E="${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-}}"; _P="$_E"; [ -n "$_P" ] || exit 1; ';
  function claudeMemHookRaw(description = 'Claude-mem memory system hooks') {
    return `${JSON.stringify({
      description,
      hooks: Object.fromEntries(claudeMemHookNames.map((name, index) => [name, [{
        matcher: index === 0 ? '*' : undefined,
        hooks: [{ type: 'command', shell: 'bash', command: `${claudeMemHookPrefix}${claudeMemHookCommands[index]}`, timeout: 60 }],
      }]])),
    }, null, 2)}\n`;
  }
  function claudeMemMcpRaw(program = 'process.stdout.write(process.execPath)') {
    return `${JSON.stringify({ mcpServers: { 'mcp-search': { type: 'stdio', command: 'node', args: ['-e', program] } } }, null, 2)}\n`;
  }
  function fixtureHash(bytes) {
    return new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
  }

  const readyLifecycle = makeLifecycleFixture('ready');
  const readyEnsure = runLifecycleCommand(readyLifecycle, 'ensure');
  assert.equal(readyEnsure.exitCode, 0, new TextDecoder().decode(readyEnsure.stderr));
  assert.deepEqual(outputLines(readyEnsure).slice(-1), ['Optional plugins: 3 ready, 0 disabled, 0 warnings'], new TextDecoder().decode(readyEnsure.stdout));
  assert.equal(outputLines(readyEnsure).length, 4, 'ensure must print exactly three plugin lines and one summary');
  for (const id of Object.values(PLUGIN_BASELINES).map(spec => spec.id)) {
    assert.equal(outputLines(readyEnsure).filter(line => line.includes(id)).length, 1, `${id} must have exactly one result line`);
  }

  const warningLifecycle = makeLifecycleFixture('warning', 'latest');
  const warningEnsure = runLifecycleCommand(warningLifecycle, 'ensure');
  assert.equal(warningEnsure.exitCode, 0, new TextDecoder().decode(warningEnsure.stderr));
  assert.deepEqual(outputLines(warningEnsure).slice(-1), ['Optional plugins: 2 ready, 0 disabled, 1 warnings']);
  assert.equal(outputLines(warningEnsure).length, 4, 'a warning must retain exactly three plugin lines and one summary');
  assert.equal(existsSync(warningLifecycle.hudConfig), false, 'a marketplace warning must skip only its dependent HUD configuration');
  const warningState = JSON.parse(readFileSync(warningLifecycle.statePath, 'utf8'));
  assert.equal(Object.keys(warningState.claudeMem.files).length, 2, 'a HUD warning must not stop claude-mem configuration');

  function writeEnhancementSelection(fixture, mode, enabled = []) {
    writeFileSync(join(fixture.clawgodDir, 'enhancements.json'), `${JSON.stringify({ schemaVersion: 1, mode, enabled }, null, 2)}\n`);
  }

  const hudOnlyLifecycle = makeLifecycleFixture('selection-hud-only');
  writeEnhancementSelection(hudOnlyLifecycle, 'custom', ['claude-hud']);
  const hudOnlyEnsure = runLifecycleCommand(hudOnlyLifecycle, 'ensure');
  assert.equal(hudOnlyEnsure.exitCode, 0, new TextDecoder().decode(hudOnlyEnsure.stderr));
  assert.deepEqual(outputLines(hudOnlyEnsure).slice(-1), ['Optional plugins: 1 ready, 2 disabled, 0 warnings'], new TextDecoder().decode(hudOnlyEnsure.stdout));
  assert.equal(outputLines(hudOnlyEnsure).length, 4, 'HUD-only selection must print exactly three plugin lines and one summary');
  assert.match(outputLines(hudOnlyEnsure).find(line => line.includes(PLUGIN_BASELINES.hud.id)), /: ready\b/, 'HUD-only selection must leave HUD ready');
  assert.match(outputLines(hudOnlyEnsure).find(line => line.includes(PLUGIN_BASELINES.memory.id)), /: disabled\b.*restored/, 'HUD-only selection must disable and restore claude-mem');
  assert.match(outputLines(hudOnlyEnsure).find(line => line.includes(PLUGIN_BASELINES.superpowers.id)), /: disabled\b.*retained/, 'HUD-only selection must disable and retain superpowers');

  const noneLifecycle = makeLifecycleFixture('selection-none');
  writeEnhancementSelection(noneLifecycle, 'custom', []);
  const noneEnsure = runLifecycleCommand(noneLifecycle, 'ensure');
  assert.equal(noneEnsure.exitCode, 0, new TextDecoder().decode(noneEnsure.stderr));
  assert.deepEqual(outputLines(noneEnsure).slice(-1), ['Optional plugins: 0 ready, 3 disabled, 0 warnings'], new TextDecoder().decode(noneEnsure.stdout));
  assert.equal(outputLines(noneEnsure).length, 4, 'empty selection must print exactly three plugin lines and one summary');
  assert.match(outputLines(noneEnsure).find(line => line.includes(PLUGIN_BASELINES.hud.id)), /: disabled\b.*restored/, 'empty selection must disable and restore HUD');
  assert.match(outputLines(noneEnsure).find(line => line.includes(PLUGIN_BASELINES.memory.id)), /: disabled\b.*restored/, 'empty selection must disable and restore claude-mem');
  assert.match(outputLines(noneEnsure).find(line => line.includes(PLUGIN_BASELINES.superpowers.id)), /: disabled\b.*retained/, 'empty selection must disable and retain superpowers');

  const corruptConfigLifecycle = makeLifecycleFixture('selection-corrupt-config');
  writeFileSync(join(corruptConfigLifecycle.clawgodDir, 'enhancements.json'), '{"schemaVersion":1,"mode":"custom","enabled":["claude-hud"],\n');
  const corruptConfigEnsure = runLifecycleCommand(corruptConfigLifecycle, 'ensure');
  assert.equal(corruptConfigEnsure.exitCode, 0, new TextDecoder().decode(corruptConfigEnsure.stderr));
  assert.deepEqual(
    outputLines(corruptConfigEnsure).slice(-1),
    ['Optional plugins: 0 ready, 3 disabled, 1 warnings'],
    new TextDecoder().decode(corruptConfigEnsure.stdout),
  );
  const corruptConfigSelectionWarning = outputLines(corruptConfigEnsure).find(line => line.includes('plugin-selection'));
  assert.ok(corruptConfigSelectionWarning, 'corrupt enhancement config must surface a selection warning');
  assert.match(corruptConfigSelectionWarning, /: warning\b/, 'the selection warning must be reported as a warning');
  assert.match(corruptConfigSelectionWarning, /enhancement config is invalid/i, 'the selection warning must describe the corrupt config');
  for (const id of [PLUGIN_BASELINES.hud.id, PLUGIN_BASELINES.memory.id, PLUGIN_BASELINES.superpowers.id]) {
    assert.match(
      outputLines(corruptConfigEnsure).find(line => line.includes(id)),
      /: disabled\b/,
      `${id} must fail closed as disabled when enhancement config is corrupt`,
    );
  }

  const deselectLifecycle = makeLifecycleFixture('selection-deselect-restores');
  const memoryHookPath = join(deselectLifecycle.claudeConfigDir, 'plugins', 'cache', 'thedotmack', 'claude-mem', PLUGIN_BASELINES.memory.version, 'hooks', 'hooks.json');
  const memoryMcpPath = join(deselectLifecycle.claudeConfigDir, 'plugins', 'cache', 'thedotmack', 'claude-mem', PLUGIN_BASELINES.memory.version, '.mcp.json');
  const superpowersInstallPath = join(deselectLifecycle.claudeConfigDir, 'plugins', 'cache', 'superpowers-marketplace', 'superpowers', PLUGIN_BASELINES.superpowers.version);
  writeFileSync(join(superpowersInstallPath, 'user-sentinel.txt'), 'user superpowers data\n');
  const originalMemoryHook = readFileSync(memoryHookPath);
  const originalMemoryMcp = readFileSync(memoryMcpPath);
  const superpowersBefore = snapshotTree(superpowersInstallPath);
  const deselectFirst = runLifecycleCommand(deselectLifecycle, 'ensure');
  assert.equal(deselectFirst.exitCode, 0, new TextDecoder().decode(deselectFirst.stderr));
  assert.deepEqual(outputLines(deselectFirst).slice(-1), ['Optional plugins: 3 ready, 0 disabled, 0 warnings'], new TextDecoder().decode(deselectFirst.stdout));
  assert.equal(existsSync(deselectLifecycle.hudConfig), true, 'all-enabled ensure must configure the HUD');
  assert.notDeepEqual(readFileSync(memoryHookPath), originalMemoryHook, 'all-enabled ensure must rewrite claude-mem hooks');
  writeEnhancementSelection(deselectLifecycle, 'custom', []);
  const deselectSecond = runLifecycleCommand(deselectLifecycle, 'ensure');
  assert.equal(deselectSecond.exitCode, 0, new TextDecoder().decode(deselectSecond.stderr));
  assert.deepEqual(outputLines(deselectSecond).slice(-1), ['Optional plugins: 0 ready, 3 disabled, 0 warnings'], new TextDecoder().decode(deselectSecond.stdout));
  assert.equal(existsSync(deselectLifecycle.hudConfig), false, 'deselection must restore the originally absent HUD config');
  assert.deepEqual(readFileSync(memoryHookPath), originalMemoryHook, 'deselection must restore owned claude-mem hooks');
  assert.deepEqual(readFileSync(memoryMcpPath), originalMemoryMcp, 'deselection must restore owned claude-mem MCP');
  assert.deepEqual(snapshotTree(superpowersInstallPath), superpowersBefore, 'superpowers deselection must retain the user installation');

  const cleanupLifecycle = makeLifecycleFixture('successful-uninstall-temp-cleanup');
  const cleanupEnsure = runLifecycleCommand(cleanupLifecycle, 'ensure');
  assert.equal(cleanupEnsure.exitCode, 0, new TextDecoder().decode(cleanupEnsure.stderr));
  const stateTemp = join(cleanupLifecycle.clawgodDir, '.plugin-dependencies-state.json.123.00000000-0000-4000-8000-000000000001.tmp');
  const moduleTemp = join(cleanupLifecycle.clawgodDir, '.claude-hud-statusline.mjs.456.00000000-0000-4000-8000-000000000002.tmp');
  const lookalikeTemp = join(cleanupLifecycle.clawgodDir, '.plugin-dependencies-state.json.123.00000000-0000-4000-8000-000000000003.tmp.user');
  const symlinkTemp = join(cleanupLifecycle.clawgodDir, '.plugin-dependencies-state.json.124.00000000-0000-4000-8000-000000000004.tmp');
  const hardlinkTemp = join(cleanupLifecycle.clawgodDir, '.claude-hud-statusline.mjs.457.00000000-0000-4000-8000-000000000005.tmp');
  const directoryTemp = join(cleanupLifecycle.clawgodDir, '.claude-hud-statusline.mjs.458.00000000-0000-4000-8000-000000000006.tmp');
  const hardlinkSource = join(cleanupLifecycle.clawgodDir, 'preserve-hardlink-source');
  writeFileSync(stateTemp, 'orphaned state write\n');
  writeFileSync(moduleTemp, 'orphaned module write\n');
  writeFileSync(lookalikeTemp, 'user lookalike\n');
  symlinkSync(lookalikeTemp, symlinkTemp);
  writeFileSync(hardlinkSource, 'shared inode\n');
  linkSync(hardlinkSource, hardlinkTemp);
  mkdirSync(directoryTemp);
  const successfulUninstall = runLifecycleCommand(cleanupLifecycle, 'uninstall');
  assert.equal(successfulUninstall.exitCode, 0, new TextDecoder().decode(successfulUninstall.stderr));
  assert.equal(existsSync(stateTemp), false, 'successful uninstall must remove an orphaned atomic ownership-state temp file');
  assert.equal(existsSync(moduleTemp), false, 'successful uninstall must remove an orphaned atomic HUD-module temp file');
  for (const preserved of [lookalikeTemp, symlinkTemp, hardlinkTemp, hardlinkSource, directoryTemp]) {
    assert.equal(existsSync(preserved), true, `successful uninstall must reject unsafe or non-matching residue ${preserved}`);
  }

  const failedStateTemp = join(readyLifecycle.clawgodDir, '.plugin-dependencies-state.json.789.00000000-0000-4000-8000-000000000007.tmp');
  const failedModuleTemp = join(readyLifecycle.clawgodDir, '.claude-hud-statusline.mjs.790.00000000-0000-4000-8000-000000000008.tmp');
  writeFileSync(failedStateTemp, 'preserve failed state write\n');
  writeFileSync(failedModuleTemp, 'preserve failed module write\n');
  writeFileSync(readyLifecycle.hudConfig, '{"user":"changed after management"}\n');
  const failedUninstall = runLifecycleCommand(readyLifecycle, 'uninstall');
  assert.notEqual(failedUninstall.exitCode, 0, 'uninstall must fail closed when managed integration restoration conflicts');
  assert.equal(existsSync(readyLifecycle.lifecycleModule), true, 'failed restoration must retain the plugin manager module');
  assert.equal(existsSync(readyLifecycle.statusLineModule), true, 'failed restoration must retain the HUD status-line module');
  assert.equal(existsSync(readyLifecycle.statePath), true, 'failed restoration must retain ownership state');
  assert.equal(existsSync(failedStateTemp), true, 'failed restoration must retain orphaned state-write evidence');
  assert.equal(existsSync(failedModuleTemp), true, 'failed restoration must retain orphaned module-write evidence');

  function makeClaudeMemFixture(label, options = {}) {
    const root = join(fixtureRoot, `claude-mem-${label}`);
    const home = join(root, 'home');
    const claudeConfigDir = join(root, 'claude-config');
    const clawgodDir = join(root, 'clawgod');
    const pluginRoot = join(claudeConfigDir, 'plugins');
    const cacheRoot = join(pluginRoot, 'cache', 'thedotmack', 'claude-mem');
    const installedPath = join(pluginRoot, 'installed_plugins.json');
    const statePath = join(clawgodDir, 'plugin-dependencies-state.json');
    mkdirSync(home, { recursive: true });
    mkdirSync(cacheRoot, { recursive: true });
    mkdirSync(clawgodDir, { recursive: true });
    const records = [];
    const pathsByVersion = new Map();
    function addVersion(version, rawOptions = {}) {
      const installPath = join(cacheRoot, version);
      const hookPath = join(installPath, 'hooks', 'hooks.json');
      const mcpPath = join(installPath, '.mcp.json');
      mkdirSync(dirname(hookPath), { recursive: true });
      const hookRaw = rawOptions.hookRaw || claudeMemHookRaw(rawOptions.description);
      const mcpRaw = rawOptions.mcpRaw || claudeMemMcpRaw(rawOptions.program);
      writeFileSync(hookPath, hookRaw, 'utf8');
      writeFileSync(mcpPath, mcpRaw, 'utf8');
      const record = { scope: 'user', version, installPath };
      records.push(record);
      pathsByVersion.set(version, { installPath, hookPath, mcpPath, hookRaw, mcpRaw });
      writeFileSync(installedPath, `${JSON.stringify({ version: 2, plugins: { 'claude-mem@thedotmack': records } }, null, 2)}\n`);
      return pathsByVersion.get(version);
    }
    for (const version of options.versions || ['13.14.0']) addVersion(version);
    const context = {
      home,
      claudeConfigDir,
      clawgodDir,
      bunPath: options.bunPath || process.execPath,
      env: { HOME: home, CLAUDE_CONFIG_DIR: claudeConfigDir, PATH: join(root, 'fixture-only-bin') },
    };
    return { root, home, claudeConfigDir, clawgodDir, pluginRoot, cacheRoot, installedPath, statePath, records, pathsByVersion, addVersion, context };
  }
  function emptyManagedState() {
    return { schemaVersion: 1, hud: {}, claudeMem: { files: {} } };
  }

  const selectedClaudeMem = makeClaudeMemFixture('selected-highest', { versions: ['13.14.0', '13.15.0'] });
  const lowerClaudeMem = selectedClaudeMem.pathsByVersion.get('13.14.0');
  const higherClaudeMem = selectedClaudeMem.pathsByVersion.get('13.15.0');
  const lowerBefore = snapshotTree(lowerClaudeMem.installPath);
  const initialClaudeMemState = emptyManagedState();
  const selectedClaudeMemResult = await configureClaudeMemBun(selectedClaudeMem.context, initialClaudeMemState);
  assert.equal(selectedClaudeMemResult.ready, true, 'the highest valid user claude-mem install must be Bun-configured');
  assert.equal(selectedClaudeMemResult.version, '13.15.0', 'the highest strict-SemVer claude-mem install must be selected');
  assert.deepEqual(snapshotTree(lowerClaudeMem.installPath), lowerBefore, 'lower cached claude-mem versions must not be changed during selection');
  assert.doesNotMatch(readFileSync(higherClaudeMem.hookPath, 'utf8'), /(^|[;&|]\s*)node\s+(?=["']?\$_P\/scripts\/)/m, 'selected hooks must retain no recognized executable Node entry');
  assert.equal(JSON.parse(readFileSync(higherClaudeMem.mcpPath, 'utf8')).mcpServers['mcp-search'].command, process.execPath, 'selected MCP must run with the absolute Bun path');
  const selectedState = JSON.parse(readFileSync(selectedClaudeMem.statePath, 'utf8'));
  const selectedTargets = [resolve(higherClaudeMem.hookPath), resolve(higherClaudeMem.mcpPath)];
  assert.deepEqual(Object.keys(selectedState.claudeMem.files).sort(), [...selectedTargets].sort(), 'ownership records must be keyed by normalized absolute target path');
  for (const [relativePath, targetPath, originalRaw] of [
    ['hooks/hooks.json', resolve(higherClaudeMem.hookPath), higherClaudeMem.hookRaw],
    ['.mcp.json', resolve(higherClaudeMem.mcpPath), higherClaudeMem.mcpRaw],
  ]) {
    const record = selectedState.claudeMem.files[targetPath];
    assert.deepEqual(Object.keys(record).sort(), ['managedSha256', 'originalBase64', 'originalSha256', 'pluginVersion', 'relativePath'].sort());
    assert.equal(record.relativePath, relativePath);
    assert.equal(record.pluginVersion, '13.15.0');
    assert.equal(record.originalBase64, Buffer.from(originalRaw).toString('base64'));
    assert.equal(record.originalSha256, fixtureHash(Buffer.from(originalRaw)));
    assert.equal(record.managedSha256, fixtureHash(readFileSync(targetPath)));
  }
  const managedHookOnce = readFileSync(higherClaudeMem.hookPath);
  const managedMcpOnce = readFileSync(higherClaudeMem.mcpPath);
  const stateOnce = readFileSync(selectedClaudeMem.statePath);
  const rerunClaudeMem = await configureClaudeMemBun(selectedClaudeMem.context, emptyManagedState());
  assert.equal(rerunClaudeMem.ready, true, 'a fully managed claude-mem rerun must be a successful no-op');
  assert.deepEqual(readFileSync(higherClaudeMem.hookPath), managedHookOnce);
  assert.deepEqual(readFileSync(higherClaudeMem.mcpPath), managedMcpOnce);
  assert.deepEqual(readFileSync(selectedClaudeMem.statePath), stateOnce, 'a fully managed rerun must not churn ownership bytes');

  const noOpRaceOutcomes = [];
  for (const mutation of ['shared-restore', 'state-delete', 'state-replace', 'target-transfer']) {
    const fixture = makeClaudeMemFixture(`no-op-race-${mutation}`);
    const paths = fixture.pathsByVersion.get('13.14.0');
    const originalHook = readFileSync(paths.hookPath);
    const originalMcp = readFileSync(paths.mcpPath);
    const initialResult = await configureClaudeMemBun(fixture.context, emptyManagedState());
    assert.equal(initialResult.ready, true);
    const managedHook = readFileSync(paths.hookPath);
    const managedMcp = readFileSync(paths.mcpPath);
    const managedState = readFileSync(fixture.statePath);
    let injected = false;
    let externalState = null;
    let sharedRestoreRun = null;
    let concurrentCallerState = null;
    const callerState = new Proxy(emptyManagedState(), {
      ownKeys(target) {
        if (!injected) {
          injected = true;
          if (mutation === 'shared-restore') {
            const childContext = {
              home: fixture.home,
              claudeConfigDir: fixture.claudeConfigDir,
              clawgodDir: fixture.clawgodDir,
              bunPath: process.execPath,
              env: fixture.context.env,
            };
            const source = `const helper = await import(${JSON.stringify(`${pathToFileURL(canonicalModulePath).href}?no-op-shared-restore=${Date.now()}`)}); const result = await helper.restoreManagedIntegrations(${JSON.stringify(childContext)}); process.stdout.write(JSON.stringify(result));`;
            sharedRestoreRun = Bun.spawnSync([process.execPath, '-e', source], {
              cwd: fixture.root,
              env: fixture.context.env,
              stdout: 'pipe',
              stderr: 'pipe',
            });
            if (sharedRestoreRun.exitCode === 0) {
              externalState = readFileSync(fixture.statePath);
              concurrentCallerState = JSON.parse(externalState);
            }
          } else if (mutation === 'state-delete') {
            rmSync(fixture.statePath);
            concurrentCallerState = { schemaVersion: 1, hud: {}, claudeMem: { files: {} } };
          } else if (mutation === 'state-replace') {
            const replacement = join(fixture.clawgodDir, 'external-state-replacement');
            externalState = Buffer.from('{"schemaVersion":2,"external":true}\n');
            writeFileSync(replacement, externalState);
            renameSync(replacement, fixture.statePath);
            concurrentCallerState = { schemaVersion: 2, external: true };
          } else {
            const replacement = join(fixture.root, 'external-hook-replacement');
            writeFileSync(replacement, 'external no-op hook owner\n');
            renameSync(replacement, paths.hookPath);
            concurrentCallerState = JSON.parse(managedState);
            delete concurrentCallerState.claudeMem.files[resolve(paths.hookPath)];
          }
          for (const key of Reflect.ownKeys(target)) delete target[key];
          Object.assign(target, structuredClone(concurrentCallerState));
        }
        return Reflect.ownKeys(target);
      },
    });
    const result = await configureClaudeMemBun(fixture.context, callerState);
    assert.equal(injected, true, `${mutation}: the race must execute after no-op planning and before return`);
    assert.deepEqual(JSON.parse(JSON.stringify(callerState)), concurrentCallerState, `${mutation}: a warning must preserve the caller state established by the concurrent action`);
    if (mutation === 'shared-restore') {
      assert.equal(sharedRestoreRun?.exitCode, 0, sharedRestoreRun?.stderr.toString());
      assert.deepEqual(JSON.parse(sharedRestoreRun.stdout.toString()).restored.sort(), [resolve(paths.hookPath), resolve(paths.mcpPath)].sort());
      assert.deepEqual(readFileSync(paths.hookPath), originalHook, 'a shared restore in the no-op return window must remain restored');
      assert.deepEqual(readFileSync(paths.mcpPath), originalMcp, 'a shared restore in the no-op return window must retain the original MCP bytes');
      assert.deepEqual(readFileSync(fixture.statePath), externalState, 'the shared restore ownership state must not be rewritten');
    } else if (mutation === 'state-delete') {
      assert.equal(existsSync(fixture.statePath), false, 'an externally deleted ownership state must remain missing');
      assert.deepEqual(readFileSync(paths.hookPath), managedHook);
      assert.deepEqual(readFileSync(paths.mcpPath), managedMcp);
    } else if (mutation === 'state-replace') {
      assert.deepEqual(readFileSync(fixture.statePath), externalState, 'externally replaced ownership state must be preserved');
      assert.deepEqual(readFileSync(paths.hookPath), managedHook);
      assert.deepEqual(readFileSync(paths.mcpPath), managedMcp);
    } else {
      assert.equal(readFileSync(paths.hookPath, 'utf8'), 'external no-op hook owner\n', 'an externally transferred no-op target must be preserved');
      assert.deepEqual(readFileSync(paths.mcpPath), managedMcp);
      assert.deepEqual(readFileSync(fixture.statePath), managedState, 'target transfer must not rewrite ownership state');
    }
    noOpRaceOutcomes.push({ mutation, status: result.status, ready: result.ready, version: result.version });
  }
  assert.deepEqual(noOpRaceOutcomes, [
    { mutation: 'shared-restore', status: 'warning', ready: false, version: null },
    { mutation: 'state-delete', status: 'warning', ready: false, version: null },
    { mutation: 'state-replace', status: 'warning', ready: false, version: null },
    { mutation: 'target-transfer', status: 'warning', ready: false, version: null },
  ], 'a fully managed no-op rerun must fail closed when state or target ownership transfers before return');

  const updatedHookRaw = claudeMemHookRaw('plugin update becomes the new restore point');
  const updatedMcpRaw = claudeMemMcpRaw('process.stdout.write("plugin-update:" + process.execPath)');
  writeFileSync(higherClaudeMem.hookPath, updatedHookRaw);
  writeFileSync(higherClaudeMem.mcpPath, updatedMcpRaw);
  const updatedClaudeMem = await configureClaudeMemBun(selectedClaudeMem.context, emptyManagedState());
  assert.equal(updatedClaudeMem.ready, true, 'plugin/user updates at the selected path must be revalidated and managed');
  const updatedState = JSON.parse(readFileSync(selectedClaudeMem.statePath, 'utf8'));
  assert.equal(updatedState.claudeMem.files[resolve(higherClaudeMem.hookPath)].originalBase64, Buffer.from(updatedHookRaw).toString('base64'), 'hook updates must replace the restore point');
  assert.equal(updatedState.claudeMem.files[resolve(higherClaudeMem.mcpPath)].originalBase64, Buffer.from(updatedMcpRaw).toString('base64'), 'MCP updates must replace the restore point');

  const multiVersionClaudeMem = makeClaudeMemFixture('append-new-version');
  const firstVersionPaths = multiVersionClaudeMem.pathsByVersion.get('13.14.0');
  await configureClaudeMemBun(multiVersionClaudeMem.context, emptyManagedState());
  const firstVersionManagedHook = readFileSync(firstVersionPaths.hookPath);
  const nextVersionPaths = multiVersionClaudeMem.addVersion('13.15.0', { description: 'new cached version' });
  const nextVersionResult = await configureClaudeMemBun(multiVersionClaudeMem.context, emptyManagedState());
  assert.equal(nextVersionResult.ready, true);
  const multiVersionState = JSON.parse(readFileSync(multiVersionClaudeMem.statePath, 'utf8'));
  assert.equal(Object.keys(multiVersionState.claudeMem.files).length, 4, 'a new version path must append two ownership records');
  assert.deepEqual(readFileSync(firstVersionPaths.hookPath), firstVersionManagedHook, 'older still-managed cached versions must remain untouched');
  assert.equal(multiVersionState.claudeMem.files[resolve(nextVersionPaths.hookPath)].pluginVersion, '13.15.0');
  const multiVersionRestore = await restoreManagedIntegrations(multiVersionClaudeMem.context);
  assert.deepEqual(multiVersionRestore.conflicts, []);
  assert.deepEqual(multiVersionRestore.restored.sort(), [
    resolve(firstVersionPaths.hookPath), resolve(firstVersionPaths.mcpPath),
    resolve(nextVersionPaths.hookPath), resolve(nextVersionPaths.mcpPath),
  ].sort(), 'uninstall must restore every still-owned cached claude-mem version');
  assert.equal(readFileSync(firstVersionPaths.hookPath, 'utf8'), firstVersionPaths.hookRaw);
  assert.equal(readFileSync(firstVersionPaths.mcpPath, 'utf8'), firstVersionPaths.mcpRaw);
  assert.equal(readFileSync(nextVersionPaths.hookPath, 'utf8'), nextVersionPaths.hookRaw);
  assert.equal(readFileSync(nextVersionPaths.mcpPath, 'utf8'), nextVersionPaths.mcpRaw);

  const unknownStateClaudeMem = makeClaudeMemFixture('unknown-state');
  writeFileSync(unknownStateClaudeMem.statePath, '{"schemaVersion":2,"hud":{},"claudeMem":{"files":{}}}\n');
  const unknownStateBefore = snapshotTree(unknownStateClaudeMem.root);
  const unknownStateResult = await configureClaudeMemBun(unknownStateClaudeMem.context, emptyManagedState());
  assert.equal(unknownStateResult.status, 'warning');
  assert.equal(unknownStateResult.ready, false);
  assert.match(unknownStateResult.detail, /preserved but not Bun-verified/i);
  assert.deepEqual(snapshotTree(unknownStateClaudeMem.root), unknownStateBefore, 'unknown ownership schema must preserve every byte');

  const ambiguousStateClaudeMem = makeClaudeMemFixture('ambiguous-state-target');
  const foreignTarget = resolve(ambiguousStateClaudeMem.root, 'foreign-cache', 'hooks', 'hooks.json');
  const foreignBytes = Buffer.from(claudeMemHookRaw('foreign ownership record'));
  mkdirSync(dirname(foreignTarget), { recursive: true });
  writeFileSync(foreignTarget, foreignBytes);
  writeFileSync(ambiguousStateClaudeMem.statePath, `${JSON.stringify({
    schemaVersion: 1,
    hud: {},
    claudeMem: {
      files: {
        [foreignTarget]: {
          relativePath: 'hooks/hooks.json',
          pluginVersion: '13.14.0',
          originalBase64: foreignBytes.toString('base64'),
          originalSha256: fixtureHash(foreignBytes),
          managedSha256: fixtureHash(foreignBytes),
        },
      },
    },
  }, null, 2)}\n`);
  const ambiguousStateBefore = snapshotTree(ambiguousStateClaudeMem.root);
  const ambiguousStateResult = await configureClaudeMemBun(ambiguousStateClaudeMem.context, emptyManagedState());
  assert.equal(ambiguousStateResult.status, 'warning', 'an ownership record outside the canonical cache must be ambiguous');
  assert.match(ambiguousStateResult.detail, /preserved but not Bun-verified/i);
  assert.deepEqual(snapshotTree(ambiguousStateClaudeMem.root), ambiguousStateBefore, 'ambiguous ownership targets must preserve every byte');

  for (const [label, mutate] of [
    ['malformed-mcp', fixture => writeFileSync(fixture.pathsByVersion.get('13.14.0').mcpPath, '{broken json\n')],
    ['missing-command', fixture => {
      const paths = fixture.pathsByVersion.get('13.14.0');
      const value = JSON.parse(paths.hookRaw);
      delete value.hooks.Setup[0].hooks[0].command;
      writeFileSync(paths.hookPath, JSON.stringify(value));
    }],
    ['target-symlink', fixture => {
      const paths = fixture.pathsByVersion.get('13.14.0');
      const outside = join(fixture.root, 'outside-hooks.json');
      writeFileSync(outside, paths.hookRaw);
      rmSync(paths.hookPath);
      symlinkSync(outside, paths.hookPath);
    }],
  ]) {
    const fixture = makeClaudeMemFixture(label);
    mutate(fixture);
    const before = snapshotTree(fixture.root);
    const result = await configureClaudeMemBun(fixture.context, emptyManagedState());
    assert.equal(result.status, 'warning', `${label} must produce a plugin warning`);
    assert.equal(result.ready, false, `${label} must not be reported Bun-ready`);
    assert.match(result.detail, /preserved but not Bun-verified/i, `${label} must report preservation without Bun verification`);
    assert.deepEqual(snapshotTree(fixture.root), before, `${label} must preserve the fixture tree`);
  }

  const escapedClaudeMem = makeClaudeMemFixture('root-escape');
  const escapedInstall = join(escapedClaudeMem.root, 'outside-install');
  mkdirSync(join(escapedInstall, 'hooks'), { recursive: true });
  writeFileSync(join(escapedInstall, 'hooks', 'hooks.json'), claudeMemHookRaw());
  writeFileSync(join(escapedInstall, '.mcp.json'), claudeMemMcpRaw());
  writeFileSync(escapedClaudeMem.installedPath, `${JSON.stringify({ version: 2, plugins: { 'claude-mem@thedotmack': [{ scope: 'user', version: '99.0.0', installPath: escapedInstall }] } }, null, 2)}\n`);
  const escapedBefore = snapshotTree(escapedClaudeMem.root);
  const escapedResult = await configureClaudeMemBun(escapedClaudeMem.context, emptyManagedState());
  assert.equal(escapedResult.status, 'warning', 'a claude-mem cache-root escape must warn');
  assert.match(escapedResult.detail, /preserved but not Bun-verified/i);
  assert.deepEqual(snapshotTree(escapedClaudeMem.root), escapedBefore, 'a cache-root escape must write nothing');

  const rollbackClaudeMem = makeClaudeMemFixture('second-write-rollback');
  const rollbackPaths = rollbackClaudeMem.pathsByVersion.get('13.14.0');
  const rollbackHookBefore = readFileSync(rollbackPaths.hookPath);
  const rollbackMcpBefore = readFileSync(rollbackPaths.mcpPath);
  rollbackClaudeMem.context.onClaudeMemWriting = ({ relativePath }) => {
    if (relativePath === '.mcp.json') throw new Error('fixture second integration write failure');
  };
  const rollbackResult = await configureClaudeMemBun(rollbackClaudeMem.context, emptyManagedState());
  assert.equal(rollbackResult.status, 'warning', 'a second integration write failure must warn');
  assert.deepEqual(readFileSync(rollbackPaths.hookPath), rollbackHookBefore, 'the first integration file must roll back to original bytes');
  assert.deepEqual(readFileSync(rollbackPaths.mcpPath), rollbackMcpBefore, 'the failed second integration file must retain original bytes');
  assert.equal(existsSync(rollbackClaudeMem.statePath), false, 'rolled-back ownership state must not remain');

  const concurrentClaudeMem = makeClaudeMemFixture('concurrent-edit');
  const concurrentPaths = concurrentClaudeMem.pathsByVersion.get('13.14.0');
  const concurrentBytes = Buffer.from(claudeMemHookRaw('concurrent plugin edit'));
  concurrentClaudeMem.context.onClaudeMemWriting = ({ relativePath }) => {
    if (relativePath === 'hooks/hooks.json') writeFileSync(concurrentPaths.hookPath, concurrentBytes);
  };
  const concurrentResult = await configureClaudeMemBun(concurrentClaudeMem.context, emptyManagedState());
  assert.equal(concurrentResult.status, 'warning', 'an in-place edit before the first integration write must warn');
  assert.deepEqual(readFileSync(concurrentPaths.hookPath), concurrentBytes, 'a concurrent plugin edit must not be overwritten');
  assert.equal(existsSync(concurrentClaudeMem.statePath), false, 'ownership state must roll back after concurrent edit detection');

  const metadataRaceOutcomes = [];
  for (const phase of ['before-first-target-write', 'after-last-target-write']) {
    const fixture = makeClaudeMemFixture(`metadata-race-${phase}`);
    const selectedPaths = fixture.pathsByVersion.get('13.14.0');
    const originalHook = readFileSync(selectedPaths.hookPath);
    const originalMcp = readFileSync(selectedPaths.mcpPath);
    let insertedPaths = null;
    const insertHigherVersion = () => {
      if (!insertedPaths) insertedPaths = fixture.addVersion('13.15.0', { description: `concurrent ${phase}` });
    };
    if (phase === 'before-first-target-write') {
      fixture.context.onClaudeMemWriting = ({ relativePath }) => {
        if (relativePath === 'hooks/hooks.json') insertHigherVersion();
      };
    } else {
      fixture.context.onClaudeMemWritten = ({ relativePath }) => {
        if (relativePath === '.mcp.json') insertHigherVersion();
      };
    }
    const result = await configureClaudeMemBun(fixture.context, emptyManagedState());
    metadataRaceOutcomes.push({ phase, status: result.status, ready: result.ready, version: result.version });
    assert.deepEqual(readFileSync(selectedPaths.hookPath), originalHook, `${phase}: stale selected hook writes must roll back`);
    assert.deepEqual(readFileSync(selectedPaths.mcpPath), originalMcp, `${phase}: stale selected MCP writes must roll back`);
    assert.equal(existsSync(fixture.statePath), false, `${phase}: stale ownership state must roll back`);
    assert.equal(readFileSync(insertedPaths.hookPath, 'utf8'), insertedPaths.hookRaw, `${phase}: the concurrent higher-version hook must be preserved`);
    assert.equal(readFileSync(insertedPaths.mcpPath, 'utf8'), insertedPaths.mcpRaw, `${phase}: the concurrent higher-version MCP must be preserved`);
  }
  assert.deepEqual(metadataRaceOutcomes, [
    { phase: 'before-first-target-write', status: 'warning', ready: false, version: null },
    { phase: 'after-last-target-write', status: 'warning', ready: false, version: null },
  ], 'authoritative installed metadata changes must prevent stale ready results');

  const selectionIdentityRace = makeClaudeMemFixture('selected-cache-identity-race');
  const selectionIdentityPaths = selectionIdentityRace.pathsByVersion.get('13.14.0');
  const displacedSelection = join(selectionIdentityRace.root, 'displaced-selected-version');
  const replacementHook = Buffer.from('external replacement hook\n');
  const replacementMcp = Buffer.from('external replacement MCP\n');
  selectionIdentityRace.context.onClaudeMemWriting = ({ relativePath }) => {
    if (relativePath !== 'hooks/hooks.json') return;
    renameSync(selectionIdentityPaths.installPath, displacedSelection);
    mkdirSync(join(selectionIdentityPaths.installPath, 'hooks'), { recursive: true });
    writeFileSync(selectionIdentityPaths.hookPath, replacementHook);
    writeFileSync(selectionIdentityPaths.mcpPath, replacementMcp);
  };
  const selectionIdentityResult = await configureClaudeMemBun(selectionIdentityRace.context, emptyManagedState());
  assert.equal(selectionIdentityResult.status, 'warning', 'a selected canonical cache identity change must warn');
  assert.equal(selectionIdentityResult.ready, false);
  assert.deepEqual(readFileSync(selectionIdentityPaths.hookPath), replacementHook, 'the external replacement hook must be preserved');
  assert.deepEqual(readFileSync(selectionIdentityPaths.mcpPath), replacementMcp, 'the external replacement MCP must be preserved');
  assert.equal(existsSync(selectionIdentityRace.statePath), false, 'the transaction-owned state must roll back after selected identity transfer');

  const ownershipRaceOutcomes = [];
  for (const mutation of ['replace-schema', 'delete-after-targets', 'shared-restore', 'transfer-target-and-state']) {
    const fixture = makeClaudeMemFixture(`ownership-race-${mutation}`);
    const paths = fixture.pathsByVersion.get('13.14.0');
    const originalHook = readFileSync(paths.hookPath);
    const originalMcp = readFileSync(paths.mcpPath);
    let externalStateBytes = null;
    let sharedRestoreRun = null;
    if (mutation === 'replace-schema') {
      fixture.context.onClaudeMemWriting = ({ relativePath }) => {
        if (relativePath !== 'hooks/hooks.json') return;
        const replacement = join(fixture.clawgodDir, 'external-state-replacement');
        externalStateBytes = Buffer.from('{"schemaVersion":2,"external":true}\n');
        writeFileSync(replacement, externalStateBytes);
        renameSync(replacement, fixture.statePath);
      };
    } else if (mutation === 'delete-after-targets') {
      fixture.context.onClaudeMemWritten = ({ relativePath }) => {
        if (relativePath === '.mcp.json') rmSync(fixture.statePath);
      };
    } else if (mutation === 'shared-restore') {
      fixture.context.onClaudeMemWriting = ({ relativePath }) => {
        if (relativePath !== 'hooks/hooks.json' || sharedRestoreRun) return;
        const childContext = {
          home: fixture.home,
          claudeConfigDir: fixture.claudeConfigDir,
          clawgodDir: fixture.clawgodDir,
          bunPath: process.execPath,
          env: fixture.context.env,
        };
        const source = `const helper = await import(${JSON.stringify(`${pathToFileURL(canonicalModulePath).href}?shared-restore=${Date.now()}`)}); const result = await helper.restoreManagedIntegrations(${JSON.stringify(childContext)}); process.stdout.write(JSON.stringify(result));`;
        sharedRestoreRun = Bun.spawnSync([process.execPath, '-e', source], {
          cwd: fixture.root,
          env: fixture.context.env,
          stdout: 'pipe',
          stderr: 'pipe',
        });
        if (sharedRestoreRun.exitCode === 0) externalStateBytes = readFileSync(fixture.statePath);
      };
    } else {
      fixture.context.onClaudeMemWritten = ({ relativePath }) => {
        if (relativePath !== '.mcp.json') return;
        const replacementHookPath = join(fixture.root, 'external-hook-replacement');
        const replacementStatePath = join(fixture.clawgodDir, 'external-state-replacement');
        writeFileSync(replacementHookPath, 'external hook owner\n');
        renameSync(replacementHookPath, paths.hookPath);
        externalStateBytes = Buffer.from('{"schemaVersion":2,"external":true}\n');
        writeFileSync(replacementStatePath, externalStateBytes);
        renameSync(replacementStatePath, fixture.statePath);
      };
    }
    const result = await configureClaudeMemBun(fixture.context, emptyManagedState());
    if (mutation === 'shared-restore') {
      assert.equal(sharedRestoreRun?.exitCode, 0, sharedRestoreRun?.stderr.toString());
      assert.deepEqual(JSON.parse(sharedRestoreRun.stdout.toString()).conflicts.sort(), [resolve(paths.hookPath), resolve(paths.mcpPath)].sort(), 'concurrent shared restore must transfer both not-yet-written targets');
    }
    ownershipRaceOutcomes.push({ mutation, status: result.status, ready: result.ready, version: result.version });
    if (mutation === 'transfer-target-and-state') {
      assert.equal(readFileSync(paths.hookPath, 'utf8'), 'external hook owner\n', 'an externally transferred target must not be rolled back');
    } else {
      assert.deepEqual(readFileSync(paths.hookPath), originalHook, `${mutation}: targets without a durable restore point must retain original bytes`);
    }
    assert.deepEqual(readFileSync(paths.mcpPath), originalMcp, `${mutation}: MCP without a durable restore point must retain original bytes`);
    if (mutation === 'delete-after-targets') {
      assert.equal(existsSync(fixture.statePath), false, 'an externally deleted state file must remain missing');
    } else {
      assert.deepEqual(readFileSync(fixture.statePath), externalStateBytes, `${mutation}: external ownership state must be preserved`);
    }
  }
  assert.deepEqual(ownershipRaceOutcomes, [
    { mutation: 'replace-schema', status: 'warning', ready: false, version: null },
    { mutation: 'delete-after-targets', status: 'warning', ready: false, version: null },
    { mutation: 'shared-restore', status: 'warning', ready: false, version: null },
    { mutation: 'transfer-target-and-state', status: 'warning', ready: false, version: null },
  ], 'ownership state replacement, deletion, and concurrent shared restore must fail closed');

  const restoreClaudeMem = makeClaudeMemFixture('restore-owned');
  const restorePaths = restoreClaudeMem.pathsByVersion.get('13.14.0');
  const restoreHookOriginal = readFileSync(restorePaths.hookPath);
  const restoreMcpOriginal = readFileSync(restorePaths.mcpPath);
  await configureClaudeMemBun(restoreClaudeMem.context, emptyManagedState());
  const restoreOwned = await restoreManagedIntegrations(restoreClaudeMem.context);
  assert.deepEqual(restoreOwned.restored.sort(), [resolve(restorePaths.hookPath), resolve(restorePaths.mcpPath)].sort(), 'still-owned claude-mem files must be restored');
  assert.deepEqual(restoreOwned.conflicts, []);
  assert.deepEqual(readFileSync(restorePaths.hookPath), restoreHookOriginal);
  assert.deepEqual(readFileSync(restorePaths.mcpPath), restoreMcpOriginal);
  assert.deepEqual(JSON.parse(readFileSync(restoreClaudeMem.statePath, 'utf8')).claudeMem.files, {}, 'successfully restored ownership records must be deleted');

  const conflictClaudeMem = makeClaudeMemFixture('restore-conflicts');
  const conflictPaths = conflictClaudeMem.pathsByVersion.get('13.14.0');
  await configureClaudeMemBun(conflictClaudeMem.context, emptyManagedState());
  const laterHookEdit = Buffer.from(claudeMemHookRaw('later user edit'));
  writeFileSync(conflictPaths.hookPath, laterHookEdit);
  rmSync(conflictPaths.mcpPath);
  const restoreConflicts = await restoreManagedIntegrations(conflictClaudeMem.context);
  assert.deepEqual(restoreConflicts.restored, []);
  assert.deepEqual(restoreConflicts.conflicts.sort(), [resolve(conflictPaths.hookPath), resolve(conflictPaths.mcpPath)].sort(), 'edited and missing managed files must both be conflicts');
  assert.deepEqual(readFileSync(conflictPaths.hookPath), laterHookEdit, 'later user/plugin edits must be preserved');
  assert.equal(existsSync(conflictPaths.mcpPath), false, 'a missing managed file must remain missing');
  assert.deepEqual(JSON.parse(readFileSync(conflictClaudeMem.statePath, 'utf8')).claudeMem.files, {}, 'confirmed ownership transfers must delete their records');

  const expectedHudConfig = `{
  "language": "zh",
  "lineLayout": "compact",
  "pathLevels": 1,
  "elementOrder": ["project", "tools", "context", "usage", "memory", "environment", "agents", "todos", "sessionTime"],
  "gitStatus": {
    "enabled": true,
    "showDirty": true,
    "showAheadBehind": true,
    "showFileStats": true
  },
  "display": {
    "showModel": true,
    "showAddedDirs": true,
    "addedDirsLayout": "line",
    "showContextBar": true,
    "contextValue": "tokens",
    "showConfigCounts": true,
    "showCost": true,
    "showDuration": true,
    "showSpeed": true,
    "showUsage": true,
    "showTools": true,
    "showAgents": true,
    "showTodos": true,
    "showTokenBreakdown": true,
    "usageBarEnabled": true
  },
  "colors": {
    "context": "green",
    "usage": "brightBlue",
    "warning": "yellow",
    "usageWarning": "brightMagenta",
    "critical": "red",
    "model": "cyan",
    "project": "yellow",
    "git": "magenta",
    "gitBranch": "cyan",
    "label": "#ff4fc2",
    "custom": "#FF6600"
  }
}
`;
  assert.equal(HUD_CONFIG_TEXT, expectedHudConfig, 'the managed HUD profile must match the approved JSON bytes exactly');

  const goldenFixture = JSON.parse(readFileSync(new URL('./fixtures/claude-hud-current-style.json', import.meta.url), 'utf8'));
  assert.deepEqual(goldenFixture.stdin, {
    model: { display_name: 'Opus' },
    context_window: {
      context_window_size: 200000,
      current_usage: { input_tokens: 45000, cache_creation_input_tokens: 5000, cache_read_input_tokens: 2000 },
    },
    workspace: { added_dirs: [] },
  }, 'the HUD golden stdin must remain fixed');
  assert.equal(goldenFixture.transcript.flatMap(entry => entry.message.content).filter(block => block.type === 'tool_use' && block.name === 'Skill').length, 2);
  assert.equal(goldenFixture.transcript.flatMap(entry => entry.message.content).filter(block => block.type === 'tool_use' && block.name.startsWith('mcp__')).length, 3);
  assert.equal(goldenFixture.expectedStdout, '\x1b[0m\x1b[36m[Opus]\x1b[0m \x1b[32m███\x1b[2m░░░░░░░\x1b[0m \x1b[32m52k/200k\x1b[0m | \x1b[33mmy-project\x1b[0m | \x1b[38;2;255;79;194m⏱️  <1m\x1b[0m\n\x1b[0m\x1b[33m◐\x1b[0m \x1b[36mmcp__linear__get_issue\x1b[0m | \x1b[33m◐\x1b[0m \x1b[36mmcp__slack__search_messages\x1b[0m | \x1b[32m✓\x1b[0m Skill \x1b[38;2;255;79;194m×2\x1b[0m | \x1b[32m✓\x1b[0m Read \x1b[38;2;255;79;194m×1\x1b[0m | \x1b[32m✓\x1b[0m Edit \x1b[38;2;255;79;194m×1\x1b[0m | \x1b[32m✓\x1b[0m mcp__github__get_pull_request \x1b[38;2;255;79;194m×1\x1b[0m\n\x1b[0m\x1b[32m✓\x1b[0m \x1b[35mexplore\x1b[0m \x1b[38;2;255;79;194m[haiku]\x1b[0m\x1b[38;2;255;79;194m: Finding auth code\x1b[0m \x1b[38;2;255;79;194m(<1s)\x1b[0m\n\x1b[0m\x1b[33m▸\x1b[0m Add tests \x1b[38;2;255;79;194m(0/2)\x1b[0m\n', 'the approved HUD stdout must remain byte-exact');

  function makeHudFixture(label, options = {}) {
    const root = join(fixtureRoot, `hud-${label}`);
    const home = join(root, 'home');
    const claudeConfigDir = join(root, options.configName || 'claude config');
    const clawgodDir = join(root, options.clawgodName || "clawgod's managed [dir]?");
    const pluginRoot = join(claudeConfigDir, 'plugins');
    const hudConfigDir = join(pluginRoot, 'claude-hud');
    const hudCacheRoot = join(pluginRoot, 'cache', 'claude-hud', 'claude-hud');
    const settingsPath = join(claudeConfigDir, 'settings.json');
    const configPath = join(hudConfigDir, 'config.json');
    const statePath = join(clawgodDir, 'plugin-dependencies-state.json');
    const modulePath = join(clawgodDir, 'claude-hud-statusline.mjs');
    mkdirSync(home, { recursive: true });
    if (options.configParent !== false) mkdirSync(hudConfigDir, { recursive: true });
    mkdirSync(hudCacheRoot, { recursive: true });
    mkdirSync(clawgodDir, { recursive: true });
    const versions = options.versions || ['0.7.0'];
    const records = [];
    for (const version of versions) {
      const installPath = join(hudCacheRoot, version);
      mkdirSync(join(installPath, 'src'), { recursive: true });
      writeFileSync(join(installPath, 'src', 'index.ts'), 'process.exit(0);\n');
      records.push({ scope: 'user', version, installPath });
    }
    writeFileSync(join(pluginRoot, 'installed_plugins.json'), JSON.stringify({
      version: 2,
      plugins: { 'claude-hud@claude-hud': records },
    }, null, 2) + '\n');
    const context = {
      home,
      claudeConfigDir,
      clawgodDir,
      bunPath: options.bunPath || process.execPath,
      env: { HOME: home, CLAUDE_CONFIG_DIR: claudeConfigDir, PATH: join(root, 'fixture-only-bin') },
    };
    return { root, home, claudeConfigDir, clawgodDir, pluginRoot, hudCacheRoot, settingsPath, configPath, statePath, modulePath, context };
  }

  const emptyHud = makeHudFixture('empty');
  const emptyState = { schemaVersion: 1, hud: {}, claudeMem: { files: {} } };
  const emptyResult = await configureHud(emptyHud.context, emptyState);
  assert.equal(emptyResult.ready, true, 'a valid installed HUD must be configured');
  assert.equal(readFileSync(emptyHud.configPath, 'utf8'), expectedHudConfig, 'an absent HUD config must receive the exact profile');
  const emptySettings = JSON.parse(readFileSync(emptyHud.settingsPath, 'utf8'));
  assert.deepEqual(emptySettings, {
    statusLine: {
      type: 'command',
      command: `${quoteStatusLineArg(emptyHud.context.bunPath)} ${quoteStatusLineArg(emptyHud.modulePath)}`,
    },
  }, 'an absent settings file must gain only the direct Bun status line');
  assert.equal(isAbsolute(emptyHud.context.bunPath), true, 'the test Bun path must be absolute');
  assert.equal(lstatSync(emptyHud.statePath).mode & 0o777, 0o600, 'new ownership state must be private');
  assert.equal(lstatSync(emptyHud.settingsPath).mode & 0o777, 0o600, 'new settings must be private');
  const recordedEmptyState = JSON.parse(readFileSync(emptyHud.statePath, 'utf8'));
  assert.equal(recordedEmptyState.schemaVersion, 1);
  assert.equal(recordedEmptyState.hud.config.originalPresent, false);
  assert.equal(recordedEmptyState.hud.statusLine.originalPresent, false);
  assert.deepEqual(recordedEmptyState.claudeMem, { files: {} });
  assert.equal(readFileSync(emptyHud.modulePath, 'utf8'), renderHudStatusLineModule(emptyHud.context), 'the managed status-line module must be deterministic');

  const absentConfigParentHud = makeHudFixture('absent-config-parent', { configParent: false });
  const absentConfigParentState = { schemaVersion: 1, hud: {}, claudeMem: { files: {} } };
  const absentConfigParentResult = await configureHud(absentConfigParentHud.context, absentConfigParentState);
  assert.equal(absentConfigParentResult.ready, true, 'an absent HUD config directory must be created safely');
  assert.equal(readFileSync(absentConfigParentHud.configPath, 'utf8'), expectedHudConfig, 'fresh configuration must create the exact HUD profile');

  const existingHud = makeHudFixture('existing');
  const originalConfig = Buffer.from('{"user":"config"}\n');
  const originalStatusLine = { type: 'command', command: "'/user/status line' --flag" };
  writeFileSync(existingHud.configPath, originalConfig, { mode: 0o640 });
  writeFileSync(existingHud.settingsPath, JSON.stringify({ theme: 'dark', statusLine: originalStatusLine }, null, 4) + '\n', { mode: 0o640 });
  const existingState = { schemaVersion: 1, hud: {}, claudeMem: { files: {} } };
  const existingResult = await configureHud(existingHud.context, existingState);
  assert.equal(existingResult.ready, true, 'a pre-existing user HUD config must not block configuration');
  assert.match(existingResult.detail, /kept existing user config/i, 'a preserved user HUD config must be reported');
  assert.deepEqual(readFileSync(existingHud.configPath), originalConfig, 'a pre-existing user HUD config must be preserved byte-for-byte');
  assert.equal(lstatSync(existingHud.configPath).mode & 0o777, 0o640, 'a preserved user HUD config must keep its mode');
  assert.equal(lstatSync(existingHud.settingsPath).mode & 0o777, 0o640, 'settings replacement must preserve mode');
  assert.deepEqual(existingState.hud.config, { userOwned: true }, 'a pre-existing user HUD config must be marked user-owned');
  assert.deepEqual(existingState.hud.statusLine.originalValue, originalStatusLine, 'existing statusLine must be the field restore point');
  assert.equal(JSON.parse(readFileSync(existingHud.settingsPath, 'utf8')).theme, 'dark', 'unrelated settings must survive configuration');
  const restorePoint = structuredClone(existingState.hud);
  const restartedExistingState = { schemaVersion: 1, hud: {}, claudeMem: { files: {} } };
  await configureHud(existingHud.context, restartedExistingState);
  assert.deepEqual(restartedExistingState.hud.config, { userOwned: true }, 'a process-restart rerun must retain the user-owned config marker');
  assert.deepEqual(readFileSync(existingHud.configPath), originalConfig, 'a process-restart rerun must still preserve the user HUD config');
  assert.deepEqual(restartedExistingState.hud.statusLine.originalValue, restorePoint.statusLine.originalValue, 'a process-restart rerun must load and retain the persisted statusLine restore point');
  Object.assign(existingState, restartedExistingState);

  async function assertInvalidHudStatePreserved(label, mutateRaw) {
    const fixture = makeHudFixture(`invalid-state-${label}`);
    const initialState = { schemaVersion: 1, hud: {}, claudeMem: { files: {} } };
    await configureHud(fixture.context, initialState);
    const raw = readFileSync(fixture.statePath, 'utf8');
    const changed = mutateRaw(raw);
    writeFileSync(fixture.statePath, changed);
    const before = snapshotTree(fixture.root);
    const result = await configureHud(fixture.context, { schemaVersion: 1, hud: {}, claudeMem: { files: {} } });
    assert.equal(result.status, 'warning', `${label} ownership state must be rejected`);
    assert.deepEqual(snapshotTree(fixture.root), before, `${label} ownership state must leave every byte, mode, and path unchanged`);
  }
  const mutateState = mutation => raw => {
    const value = JSON.parse(raw);
    mutation(value);
    return JSON.stringify(value, null, 2) + '\n';
  };
  await assertInvalidHudStatePreserved('unknown-schema', mutateState(value => { value.schemaVersion = 2; }));
  await assertInvalidHudStatePreserved('malformed-json', () => '{invalid state\n');
  await assertInvalidHudStatePreserved('missing-config-field', mutateState(value => { delete value.hud.config.originalPresent; }));
  await assertInvalidHudStatePreserved('non-boolean', mutateState(value => { value.hud.config.originalPresent = 'false'; }));
  await assertInvalidHudStatePreserved('short-hash', mutateState(value => { value.hud.config.managedSha256 = 'abc'; }));
  await assertInvalidHudStatePreserved('uppercase-hash', mutateState(value => { value.hud.statusLine.managedSha256 = value.hud.statusLine.managedSha256.toUpperCase(); }));
  await assertInvalidHudStatePreserved('invalid-base64', mutateState(value => { value.hud.config.originalPresent = true; value.hud.config.originalBase64 = '$not-base64$'; }));
  await assertInvalidHudStatePreserved('noncanonical-base64', mutateState(value => { value.hud.config.originalPresent = true; value.hud.config.originalBase64 = 'YQ'; }));
  await assertInvalidHudStatePreserved('absent-config-with-bytes', mutateState(value => { value.hud.config.originalPresent = false; value.hud.config.originalBase64 = 'YQ=='; }));
  await assertInvalidHudStatePreserved('absent-status-with-value', mutateState(value => { value.hud.statusLine.originalPresent = false; value.hud.statusLine.originalValue = { user: true }; }));
  await assertInvalidHudStatePreserved('invalid-managed-value', mutateState(value => { value.hud.statusLine.managedValue = ['command']; }));
  await assertInvalidHudStatePreserved('mismatched-status-fingerprint', mutateState(value => { value.hud.statusLine.managedValue.command += ' changed'; }));
  await assertInvalidHudStatePreserved('user-owned-false', mutateState(value => { value.hud.config = { userOwned: false }; }));
  await assertInvalidHudStatePreserved('user-owned-non-boolean', mutateState(value => { value.hud.config = { userOwned: 'true' }; }));
  await assertInvalidHudStatePreserved('user-owned-extra-key', mutateState(value => { value.hud.config = { userOwned: true, managedSha256: value.hud.statusLine.managedSha256 }; }));
  await assertInvalidHudStatePreserved('invalid-claude-mem-files', mutateState(value => { value.claudeMem.files = []; }));

  const forgedCommandHud = makeHudFixture('invalid-state-self-consistent-command');
  const forgedCommandState = { schemaVersion: 1, hud: {}, claudeMem: { files: {} } };
  await configureHud(forgedCommandHud.context, forgedCommandState);
  const forgedPersisted = JSON.parse(readFileSync(forgedCommandHud.statePath, 'utf8'));
  forgedPersisted.hud.statusLine.managedValue.command = 'bash -c evil';
  forgedPersisted.hud.statusLine.managedSha256 = sha256(Buffer.from(JSON.stringify(forgedPersisted.hud.statusLine.managedValue)));
  writeFileSync(forgedCommandHud.statePath, JSON.stringify(forgedPersisted, null, 2) + '\n');
  const forgedCommandBefore = snapshotTree(forgedCommandHud.root);
  const forgedCommandResult = await configureHud(forgedCommandHud.context, { schemaVersion: 1, hud: {}, claudeMem: { files: {} } });
  assert.equal(forgedCommandResult.status, 'warning', 'a self-consistent non-managed statusLine command must be rejected');
  assert.deepEqual(snapshotTree(forgedCommandHud.root), forgedCommandBefore, 'a forged managed command must not replace the true restore point');

  const invalidMissingParentHud = makeHudFixture('invalid-state-missing-config-parent', { configParent: false });
  writeFileSync(invalidMissingParentHud.statePath, '{"schemaVersion":2,"hud":{},"claudeMem":{"files":{}}}\n');
  const invalidMissingParentBefore = snapshotTree(invalidMissingParentHud.root);
  const invalidMissingParentResult = await configureHud(invalidMissingParentHud.context, { schemaVersion: 1, hud: {}, claudeMem: { files: {} } });
  assert.equal(invalidMissingParentResult.status, 'warning', 'invalid state must be rejected before creating a missing HUD config parent');
  assert.deepEqual(snapshotTree(invalidMissingParentHud.root), invalidMissingParentBefore, 'invalid state must perform zero writes when the HUD config parent is absent');

  const changedBunHud = makeHudFixture('managed-command-bun-path-change');
  const changedBunState = { schemaVersion: 1, hud: {}, claudeMem: { files: {} } };
  await configureHud(changedBunHud.context, changedBunState);
  const changedBunRestorePoint = structuredClone(changedBunState.hud.statusLine.originalValue);
  changedBunHud.context.bunPath = join(changedBunHud.root, 'new Bun path', 'bun');
  const changedBunResult = await configureHud(changedBunHud.context, { schemaVersion: 1, hud: {}, claudeMem: { files: {} } });
  assert.equal(changedBunResult.ready, true, 'a previous direct Bun command must remain valid after the Bun path changes');
  const changedBunPersisted = JSON.parse(readFileSync(changedBunHud.statePath, 'utf8'));
  assert.deepEqual(changedBunPersisted.hud.statusLine.originalValue, changedBunRestorePoint, 'a Bun path change must retain the true statusLine restore point');

  const invalidRestoreHud = makeHudFixture('invalid-state-restore');
  const invalidRestoreState = { schemaVersion: 1, hud: {}, claudeMem: { files: {} } };
  await configureHud(invalidRestoreHud.context, invalidRestoreState);
  const invalidRestorePersisted = JSON.parse(readFileSync(invalidRestoreHud.statePath, 'utf8'));
  invalidRestorePersisted.schemaVersion = 2;
  writeFileSync(invalidRestoreHud.statePath, JSON.stringify(invalidRestorePersisted, null, 2) + '\n');
  const invalidRestoreBefore = snapshotTree(invalidRestoreHud.root);
  const invalidRestoreResult = await restoreHud(invalidRestoreHud.context, invalidRestoreState);
  assert.equal(invalidRestoreResult.failures?.length, 1, 'restore must reject unsupported persisted ownership state');
  assert.deepEqual(snapshotTree(invalidRestoreHud.root), invalidRestoreBefore, 'invalid persisted restore state must leave every byte, mode, and path unchanged');

  const changedConfig = Buffer.from('{"user":"changed-after-management"}\n');
  const changedStatusLine = { type: 'command', command: "'/new/user/status line'" };
  writeFileSync(existingHud.configPath, changedConfig);
  const changedSettings = JSON.parse(readFileSync(existingHud.settingsPath, 'utf8'));
  changedSettings.statusLine = changedStatusLine;
  changedSettings.later = true;
  writeFileSync(existingHud.settingsPath, JSON.stringify(changedSettings, null, 2) + '\n');
  await configureHud(existingHud.context, existingState);
  assert.deepEqual(readFileSync(existingHud.configPath), changedConfig, 'a user config edit must survive reconfiguration');
  assert.deepEqual(existingState.hud.config, { userOwned: true }, 'a user-owned config must remain user-owned after edits');
  assert.deepEqual(existingState.hud.statusLine.originalValue, changedStatusLine, 'a user statusLine edit must become the new restore point');
  assert.equal(JSON.parse(readFileSync(existingHud.settingsPath, 'utf8')).later, true, 'later unrelated settings must survive reconfiguration');
  const restored = await restoreHud(existingHud.context, existingState);
  assert.deepEqual(restored.conflicts, [], 'a user-owned config must restore without conflicts');
  assert.deepEqual(restored.restored, ['statusLine'], 'uninstall must restore only the managed statusLine');
  assert.deepEqual(readFileSync(existingHud.configPath), changedConfig, 'uninstall must leave user-owned config bytes untouched');
  assert.deepEqual(JSON.parse(readFileSync(existingHud.settingsPath, 'utf8')).statusLine, changedStatusLine, 'uninstall must restore only the user statusLine field');
  assert.equal(JSON.parse(readFileSync(existingHud.settingsPath, 'utf8')).later, true, 'uninstall must retain unrelated settings');

  const sharedRestoreHud = makeHudFixture('shared-restore-entrypoint');
  const sharedRestoreConfig = Buffer.from('{"shared":"original"}\n');
  const sharedRestoreStatus = { type: 'command', command: 'shared-original' };
  writeFileSync(sharedRestoreHud.configPath, sharedRestoreConfig);
  writeFileSync(sharedRestoreHud.settingsPath, `${JSON.stringify({ keep: true, statusLine: sharedRestoreStatus }, null, 2)}\n`);
  await configureHud(sharedRestoreHud.context, emptyManagedState());
  const sharedRestoreResult = await restoreManagedIntegrations(sharedRestoreHud.context);
  assert.deepEqual(sharedRestoreResult.conflicts, [], 'the shared restore entrypoint must restore owned HUD fields without conflicts');
  assert.deepEqual(sharedRestoreResult.restored.sort(), ['statusLine'], 'the shared restore entrypoint must leave the user-owned HUD config unrestored');
  assert.deepEqual(readFileSync(sharedRestoreHud.configPath), sharedRestoreConfig);
  assert.deepEqual(JSON.parse(readFileSync(sharedRestoreHud.settingsPath, 'utf8')), { keep: true, statusLine: sharedRestoreStatus });

  const laterEditHud = makeHudFixture('later-edit');
  const laterEditState = { schemaVersion: 1, hud: {}, claudeMem: { files: {} } };
  await configureHud(laterEditHud.context, laterEditState);
  writeFileSync(laterEditHud.configPath, '{"later":"config"}\n');
  const laterEditSettings = JSON.parse(readFileSync(laterEditHud.settingsPath, 'utf8'));
  laterEditSettings.statusLine = { type: 'command', command: 'user-later-command' };
  laterEditSettings.unrelated = 7;
  writeFileSync(laterEditHud.settingsPath, JSON.stringify(laterEditSettings, null, 2) + '\n');
  const laterEditBefore = snapshotTree(laterEditHud.root);
  const conflictRestore = await restoreHud(laterEditHud.context, laterEditState);
  assert.deepEqual(conflictRestore.conflicts.sort(), ['hud config', 'statusLine'], 'uninstall must report both later user edits');
  assert.deepEqual(snapshotTree(laterEditHud.root), laterEditBefore, 'uninstall must preserve conflicting user edits byte-for-byte');

  const managedEditHud = makeHudFixture('managed-config-user-edit');
  const managedEditState = { schemaVersion: 1, hud: {}, claudeMem: { files: {} } };
  await configureHud(managedEditHud.context, managedEditState);
  assert.equal(readFileSync(managedEditHud.configPath, 'utf8'), expectedHudConfig, 'a fresh config must start managed');
  const managedEditConfig = Buffer.from('{"user":"took-over-managed"}\n');
  writeFileSync(managedEditHud.configPath, managedEditConfig);
  const managedEditResult = await configureHud(managedEditHud.context, { schemaVersion: 1, hud: {}, claudeMem: { files: {} } });
  assert.equal(managedEditResult.ready, true, 'a user edit of the managed config must not block reconfiguration');
  assert.match(managedEditResult.detail, /kept existing user config/i, 'taking over the managed config must be reported');
  assert.deepEqual(readFileSync(managedEditHud.configPath), managedEditConfig, 'a user edit of the managed config must never be overwritten');
  const managedEditPersisted = JSON.parse(readFileSync(managedEditHud.statePath, 'utf8'));
  assert.deepEqual(managedEditPersisted.hud.config, { userOwned: true }, 'a user-edited managed config must become user-owned');
  const managedEditRestore = await restoreHud(managedEditHud.context, managedEditState);
  assert.deepEqual(managedEditRestore.conflicts, [], 'a user-taken-over config must not report a restore conflict');
  assert.deepEqual(managedEditRestore.restored, ['statusLine'], 'uninstall must restore only the statusLine for a user-taken-over config');
  assert.deepEqual(readFileSync(managedEditHud.configPath), managedEditConfig, 'uninstall must preserve a user-taken-over config');

  const deletedConfigHud = makeHudFixture('user-owned-config-deleted');
  const deletedConfigState = { schemaVersion: 1, hud: {}, claudeMem: { files: {} } };
  writeFileSync(deletedConfigHud.configPath, '{"user":"will-vanish"}\n');
  await configureHud(deletedConfigHud.context, deletedConfigState);
  assert.deepEqual(deletedConfigState.hud.config, { userOwned: true }, 'a pre-existing config must be marked user-owned');
  rmSync(deletedConfigHud.configPath);
  const deletedConfigResult = await configureHud(deletedConfigHud.context, { schemaVersion: 1, hud: {}, claudeMem: { files: {} } });
  assert.equal(deletedConfigResult.ready, true, 'a deleted user-owned config must allow managed recreation');
  assert.equal(readFileSync(deletedConfigHud.configPath, 'utf8'), expectedHudConfig, 'a deleted user-owned config must receive the managed profile');
  const deletedConfigPersisted = JSON.parse(readFileSync(deletedConfigHud.statePath, 'utf8'));
  assert.equal(deletedConfigPersisted.hud.config.originalPresent, false, 'a recreated config must have no user restore point');

  const unrelatedHud = makeHudFixture('unrelated-on-uninstall');
  const unrelatedState = { schemaVersion: 1, hud: {}, claudeMem: { files: {} } };
  await configureHud(unrelatedHud.context, unrelatedState);
  const unrelatedSettings = JSON.parse(readFileSync(unrelatedHud.settingsPath, 'utf8'));
  unrelatedSettings.addedLater = { preserve: true };
  writeFileSync(unrelatedHud.settingsPath, JSON.stringify(unrelatedSettings, null, 2) + '\n');
  await restoreHud(unrelatedHud.context, unrelatedState);
  assert.deepEqual(JSON.parse(readFileSync(unrelatedHud.settingsPath, 'utf8')), { addedLater: { preserve: true } }, 'an originally absent settings file with later keys must lose only managed statusLine');

  for (const failureLabel of ['HUD config', 'settings', 'ownership state']) {
    const fixture = makeHudFixture(`restore-transaction-${failureLabel.replaceAll(' ', '-')}`);
    const originalConfig = Buffer.from(`{"restore":"${failureLabel}"}\n`);
    const originalStatus = { type: 'command', command: `user-${failureLabel}` };
    if (failureLabel !== 'HUD config') writeFileSync(fixture.configPath, originalConfig);
    writeFileSync(fixture.settingsPath, JSON.stringify({ keep: failureLabel, statusLine: originalStatus }, null, 2) + '\n');
    const state = { schemaVersion: 1, hud: {}, claudeMem: { files: {} } };
    await configureHud(fixture.context, state);
    const managedTree = snapshotTree(fixture.root);
    fixture.context.onHudRestoring = ({ label }) => {
      if (label === failureLabel) throw new Error(`fixture restore failure: ${label}`);
    };
    const failed = await restoreHud(fixture.context, state);
    assert.equal(failed.failures?.length, 1, `${failureLabel} restore failure must be reported`);
    assert.deepEqual(snapshotTree(fixture.root), managedTree, `${failureLabel} restore failure must reverse every completed restore write`);
    delete fixture.context.onHudRestoring;
    const retried = await restoreHud(fixture.context, state);
    assert.deepEqual(retried.failures, [], `${failureLabel} restore must remain retryable`);
    if (failureLabel === 'HUD config') assert.equal(existsSync(fixture.configPath), false, 'a managed config with no user original must be removed on restore');
    else assert.deepEqual(readFileSync(fixture.configPath), originalConfig, `${failureLabel} retry must leave user-owned config bytes untouched`);
    assert.deepEqual(JSON.parse(readFileSync(fixture.settingsPath, 'utf8')).statusLine, originalStatus, `${failureLabel} retry must restore statusLine`);
  }

  const restoreConflictHud = makeHudFixture('restore-rollback-identity');
  writeFileSync(restoreConflictHud.settingsPath, JSON.stringify({ statusLine: { type: 'command', command: 'identity-original' } }, null, 2) + '\n');
  const restoreConflictState = { schemaVersion: 1, hud: {}, claudeMem: { files: {} } };
  await configureHud(restoreConflictHud.context, restoreConflictState);
  restoreConflictHud.context.onHudRestored = ({ label }) => {
    if (label !== 'settings') return;
    const replacement = join(restoreConflictHud.root, 'restore-settings-replacement');
    writeFileSync(replacement, readFileSync(restoreConflictHud.settingsPath));
    renameSync(replacement, restoreConflictHud.settingsPath);
  };
  restoreConflictHud.context.onHudRestoring = ({ label }) => {
    if (label === 'HUD config') throw new Error('fixture restore failure after concurrent replacement');
  };
  const restoreConflictResult = await restoreHud(restoreConflictHud.context, restoreConflictState);
  assert.equal(restoreConflictResult.failures?.length, 1, 'restore rollback ownership conflict must be reported');
  assert.match(restoreConflictResult.failures[0], /rollback incomplete/i, 'restore rollback identity mismatch must be explicit');
  assert.equal(existsSync(restoreConflictHud.statePath), true, 'restore rollback conflict must retain ownership state for retry');
  assert.equal(existsSync(restoreConflictHud.modulePath), true, 'restore rollback conflict must retain managed support for retry');

  async function assertUnsafeHudPreserved(label, mutate) {
    const fixture = makeHudFixture(`unsafe-${label}`);
    writeFileSync(fixture.configPath, '{"before":"config"}\n');
    writeFileSync(fixture.settingsPath, '{"before":"settings"}\n');
    mutate(fixture);
    const before = snapshotTree(fixture.root);
    const state = { schemaVersion: 1, hud: {}, claudeMem: { files: {} } };
    const result = await configureHud(fixture.context, state);
    assert.equal(result.status, 'warning', `${label} must produce a HUD warning`);
    assert.deepEqual(snapshotTree(fixture.root), before, `${label} must leave every byte unchanged`);
  }
  await assertUnsafeHudPreserved('invalid-settings', fixture => writeFileSync(fixture.settingsPath, '{invalid json\n'));
  await assertUnsafeHudPreserved('config-link', fixture => {
    const target = join(fixture.root, 'outside-config');
    writeFileSync(target, 'outside\n');
    rmSync(fixture.configPath);
    symlinkSync(target, fixture.configPath);
  });
  await assertUnsafeHudPreserved('settings-link', fixture => {
    const target = join(fixture.root, 'outside-settings');
    writeFileSync(target, '{}\n');
    rmSync(fixture.settingsPath);
    symlinkSync(target, fixture.settingsPath);
  });
  await assertUnsafeHudPreserved('ancestor-link', fixture => {
    const actual = join(fixture.root, 'actual-clawgod');
    renameSync(fixture.clawgodDir, actual);
    symlinkSync(actual, fixture.clawgodDir, process.platform === 'win32' ? 'junction' : 'dir');
  });
  await assertUnsafeHudPreserved('cache-ancestor-link', fixture => {
    const cachePath = join(fixture.pluginRoot, 'cache');
    const actual = join(fixture.root, 'actual-plugin-cache');
    renameSync(cachePath, actual);
    symlinkSync(actual, cachePath, process.platform === 'win32' ? 'junction' : 'dir');
  });
  await assertUnsafeHudPreserved('unsafe-permission', fixture => chmodSync(fixture.settingsPath, 0o666));

  const lateFailureHud = makeHudFixture('late-write-failure');
  writeFileSync(lateFailureHud.configPath, '{"original":"config"}\n');
  writeFileSync(lateFailureHud.settingsPath, JSON.stringify({ statusLine: { type: 'command', command: 'original' }, keep: true }, null, 2) + '\n');
  const lateFailureBefore = snapshotTree(lateFailureHud.root);
  lateFailureHud.context.onHudWriting = ({ label }) => {
    if (label === 'settings') throw new Error('fixture late settings failure');
  };
  const lateFailureResult = await configureHud(lateFailureHud.context, { schemaVersion: 1, hud: {}, claudeMem: { files: {} } });
  assert.equal(lateFailureResult.status, 'warning', 'a late HUD write failure must remain optional');
  assert.deepEqual(snapshotTree(lateFailureHud.root), lateFailureBefore, 'a late HUD write failure must roll back every earlier managed write');

  const concurrentEditHud = makeHudFixture('concurrent-in-place-edit');
  writeFileSync(concurrentEditHud.configPath, '{"original":"config"}\n');
  writeFileSync(concurrentEditHud.settingsPath, JSON.stringify({ keep: 'before' }, null, 2) + '\n');
  const concurrentEditExpectedSettings = JSON.stringify({ keep: 'before', concurrent: 'preserve' }, null, 2) + '\n';
  concurrentEditHud.context.onHudWriting = ({ label }) => {
    if (label === 'settings') writeFileSync(concurrentEditHud.settingsPath, concurrentEditExpectedSettings);
  };
  const concurrentEditResult = await configureHud(concurrentEditHud.context, { schemaVersion: 1, hud: {}, claudeMem: { files: {} } });
  assert.equal(concurrentEditResult.status, 'warning', 'an in-place settings edit during configuration must fail closed');
  assert.equal(readFileSync(concurrentEditHud.settingsPath, 'utf8'), concurrentEditExpectedSettings, 'an in-place concurrent edit must not be overwritten');
  assert.equal(readFileSync(concurrentEditHud.configPath, 'utf8'), '{"original":"config"}\n', 'a user-owned config must survive a concurrent settings edit rollback');
  assert.equal(existsSync(concurrentEditHud.statePath), false, 'rolled-back ownership state must not remain');
  assert.equal(existsSync(concurrentEditHud.modulePath), false, 'rolled-back status-line module must not remain');

  for (const mutation of ['same-bytes-new-inode', 'chmod', 'hardlink']) {
    const fixture = makeHudFixture(`rollback-identity-${mutation}`);
    let replacementPath = null;
    fixture.context.onHudWritten = ({ label }) => {
      if (label !== 'HUD config') return;
      if (mutation === 'same-bytes-new-inode') {
        replacementPath = join(fixture.root, 'same-bytes-replacement');
        writeFileSync(replacementPath, readFileSync(fixture.configPath));
        renameSync(replacementPath, fixture.configPath);
      } else if (mutation === 'chmod') {
        chmodSync(fixture.configPath, 0o640);
      } else {
        replacementPath = join(fixture.root, 'managed-config-hardlink');
        linkSync(fixture.configPath, replacementPath);
      }
    };
    fixture.context.onHudWriting = ({ label }) => {
      if (label === 'settings') throw new Error(`fixture ${mutation} rollback trigger`);
    };
    const result = await configureHud(fixture.context, { schemaVersion: 1, hud: {}, claudeMem: { files: {} } });
    assert.equal(result.status, 'warning', `${mutation} rollback conflict must warn`);
    assert.match(result.detail, /rollback incomplete/i, `${mutation} rollback conflict must be explicit`);
    assert.equal(existsSync(fixture.statePath), true, `${mutation} rollback conflict must retain ownership state for retry`);
    assert.equal(existsSync(fixture.modulePath), true, `${mutation} rollback conflict must retain the managed runner for retry`);
    assert.equal(readFileSync(fixture.configPath, 'utf8'), expectedHudConfig, `${mutation} concurrent managed bytes must be preserved`);
    if (mutation === 'same-bytes-new-inode') assert.equal(existsSync(replacementPath), false, 'replacement must occupy the canonical path');
    if (mutation === 'chmod') assert.equal(lstatSync(fixture.configPath).mode & 0o777, 0o640, 'concurrent chmod must survive rollback');
    if (mutation === 'hardlink') assert.equal(lstatSync(fixture.configPath).nlink, 2, 'concurrent hardlink must survive rollback');
  }

  const unixQuoted = quoteStatusLineArg("/tmp/Bun path/it's [valid]?/bun", 'linux');
  assert.equal(unixQuoted, "'/tmp/Bun path/it'\"'\"'s [valid]?/bun'", 'Unix quoting must preserve spaces, quotes, brackets, and question marks');
  assert.equal(quoteStatusLineArg('C:\\Program Files\\Bun\\bun.exe', 'win32'), '"C:\\Program Files\\Bun\\bun.exe"', 'Windows paths must be double quoted');
  assert.throws(() => quoteStatusLineArg('C:\\bad"path\\bun.exe', 'win32'), /unsafe Windows status-line path/i, 'Windows command quotes must reject embedded quotes');
  for (const unsafeWindowsPath of ['C:\\%TEMP%\\bun.exe', 'C:\\!BUN!\\bun.exe', 'C:\\bad&path\\bun.exe']) {
    assert.throws(() => quoteStatusLineArg(unsafeWindowsPath, 'win32'), /unsafe Windows status-line path/i, `Windows command paths must reject cmd metacharacters: ${unsafeWindowsPath}`);
  }
  for (const forbidden of ['node ', 'node.exe ', 'bash -c', ' ls ', ' head ', '$(', '`', '*']) {
    assert.equal(emptySettings.statusLine.command.toLowerCase().includes(forbidden), false, `statusLine command must not contain ${forbidden}`);
  }
  for (const [label, bunPath] of [
    ['Node executable', '/usr/bin/node'],
    ['bash command fragment', '/tmp/bash -c/bun'],
    ['command substitution', '/tmp/$(touch marker)/bun'],
    ['backtick substitution', '/tmp/`touch marker`/bun'],
    ['glob token', '/tmp/bun*/bun'],
    ['ls executable', '/usr/bin/ls'],
    ['head executable', '/usr/bin/head'],
  ]) {
    const unsafeCommandHud = makeHudFixture(`unsafe-command-${label.replaceAll(' ', '-')}`, { bunPath });
    const before = snapshotTree(unsafeCommandHud.root);
    const result = await configureHud(unsafeCommandHud.context, { schemaVersion: 1, hud: {}, claudeMem: { files: {} } });
    assert.equal(result.status, 'warning', `${label} must be rejected before HUD configuration`);
    assert.deepEqual(snapshotTree(unsafeCommandHud.root), before, `${label} must not change HUD state`);
  }

  async function runManagedHud(label, records, setup, installedVersion = 2) {
    const fixture = makeHudFixture(`runner-${label}`, { versions: [], clawgodName: 'clawgod-runner' });
    setup?.(fixture);
    writeFileSync(join(fixture.pluginRoot, 'installed_plugins.json'), JSON.stringify({
      version: installedVersion,
      plugins: { 'claude-hud@claude-hud': records(fixture) },
    }, null, 2) + '\n');
    writeFileSync(fixture.modulePath, renderHudStatusLineModule(fixture.context));
    const input = Buffer.from('{"fixture":"stdin bytes"}\n');
    const child = Bun.spawn({
      cmd: [process.execPath, fixture.modulePath],
      cwd: fixture.root,
      env: fixture.context.env,
      stdin: new Blob([input]),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    return {
      fixture,
      input,
      exitCode: await child.exited,
      stdout: Buffer.from(await new Response(child.stdout).arrayBuffer()),
      stderr: Buffer.from(await new Response(child.stderr).arrayBuffer()),
    };
  }
  function fakeHudEntry(fixture, version, marker, exitCode) {
    const installPath = join(fixture.hudCacheRoot, version);
    mkdirSync(join(installPath, 'src'), { recursive: true });
    writeFileSync(join(installPath, 'src', 'index.ts'), `const bytes = new Uint8Array(await new Response(Bun.stdin.stream()).arrayBuffer());\nawait Bun.write(Bun.stdout, ${JSON.stringify(marker)} + new TextDecoder().decode(bytes));\nawait Bun.write(Bun.stderr, ${JSON.stringify(`stderr:${marker}`)});\nprocess.exit(${exitCode});\n`);
    return { scope: 'user', version, installPath };
  }
  const persistedForwardFixture = makeHudFixture('persisted-command-forward', { versions: [], clawgodName: 'clawgod-runner' });
  const binaryInput = Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x41, 0x00, 0xc3]);
  const binaryStdoutPrefix = Buffer.from([0x00, 0x81, 0xff, 0x53]);
  const binaryStderr = Buffer.from([0xfe, 0x00, 0x45, 0x80]);
  const higherRecord = fakeHudEntry(persistedForwardFixture, '0.10.0', 'unused', 37);
  const olderRecord = fakeHudEntry(persistedForwardFixture, '0.7.0', 'older', 11);
  writeFileSync(join(higherRecord.installPath, 'src', 'index.ts'), `
const input = new Uint8Array(await new Response(Bun.stdin.stream()).arrayBuffer());
if (process.env.HUD_FORWARD_SENTINEL !== 'forwarded-exactly') process.exit(91);
await Bun.write(Bun.stdout, new Uint8Array([...${JSON.stringify([...binaryStdoutPrefix])}, ...input]));
await Bun.write(Bun.stderr, new Uint8Array(${JSON.stringify([...binaryStderr])}));
process.exit(37);
`);
  writeFileSync(join(persistedForwardFixture.pluginRoot, 'installed_plugins.json'), JSON.stringify({
    version: 2,
    plugins: { 'claude-hud@claude-hud': [olderRecord, higherRecord] },
  }, null, 2) + '\n');
  const persistedState = { schemaVersion: 1, hud: {}, claudeMem: { files: {} } };
  const persistedResult = await configureHud(persistedForwardFixture.context, persistedState);
  assert.equal(persistedResult.ready, true, 'the persisted forwarding fixture must configure');
  const persistedCommand = JSON.parse(readFileSync(persistedForwardFixture.settingsPath, 'utf8')).statusLine.command;
  assert.equal(persistedCommand, `${quoteStatusLineArg(process.execPath)} ${quoteStatusLineArg(persistedForwardFixture.modulePath)}`, 'the executed command must be the exact persisted Unix statusLine');
  const persistedChild = Bun.spawn({
    cmd: ['/bin/sh', '-c', persistedCommand],
    cwd: persistedForwardFixture.root,
    env: { ...persistedForwardFixture.context.env, HUD_FORWARD_SENTINEL: 'forwarded-exactly' },
    stdin: new Blob([binaryInput]),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const persistedExit = await persistedChild.exited;
  const persistedStdout = Buffer.from(await new Response(persistedChild.stdout).arrayBuffer());
  const persistedStderr = Buffer.from(await new Response(persistedChild.stderr).arrayBuffer());
  assert.equal(persistedExit, 37, 'the exact persisted command must forward the selected HUD exit code');
  assert.deepEqual(persistedStdout, Buffer.concat([binaryStdoutPrefix, binaryInput]), 'the persisted command must forward invalid UTF-8 and NUL stdin/stdout bytes exactly');
  assert.deepEqual(persistedStderr, binaryStderr, 'the persisted command must forward raw binary stderr exactly');

  const escaped = await runManagedHud('escaped', fixture => [{ scope: 'user', version: '9.0.0', installPath: join(fixture.root, 'outside-hud') }], fixture => {
    mkdirSync(join(fixture.root, 'outside-hud', 'src'), { recursive: true });
    writeFileSync(join(fixture.root, 'outside-hud', 'src', 'index.ts'), 'process.exit(0);\n');
  });
  assert.notEqual(escaped.exitCode, 0, 'a cache-root escape must fail');
  assert.match(escaped.stderr.toString(), /valid user HUD|canonical cache/i);

  const linked = await runManagedHud('linked-entry', fixture => {
    const installPath = join(fixture.hudCacheRoot, '1.0.0');
    const outside = join(fixture.root, 'outside-entry.ts');
    mkdirSync(join(installPath, 'src'), { recursive: true });
    writeFileSync(outside, 'process.exit(0);\n');
    symlinkSync(outside, join(installPath, 'src', 'index.ts'));
    return [{ scope: 'user', version: '1.0.0', installPath }];
  });
  assert.notEqual(linked.exitCode, 0, 'a symlinked HUD entry must fail');
  assert.match(linked.stderr.toString(), /valid user HUD|regular/i);

  const hardlinked = await runManagedHud('hardlinked-entry', fixture => {
    const record = fakeHudEntry(fixture, '1.0.0', 'hardlinked:', 0);
    linkSync(join(record.installPath, 'src', 'index.ts'), join(fixture.root, 'entry-hardlink.ts'));
    return [record];
  });
  assert.notEqual(hardlinked.exitCode, 0, 'a hardlinked HUD entry must fail');
  assert.match(hardlinked.stderr.toString(), /valid user HUD|regular|link/i);

  const substituted = await runManagedHud('substituted-source', fixture => {
    const installPath = join(fixture.hudCacheRoot, '1.0.0');
    const outsideSource = join(fixture.root, 'outside-source');
    mkdirSync(outsideSource, { recursive: true });
    writeFileSync(join(outsideSource, 'index.ts'), 'process.exit(0);\n');
    mkdirSync(installPath, { recursive: true });
    symlinkSync(outsideSource, join(installPath, 'src'), process.platform === 'win32' ? 'junction' : 'dir');
    return [{ scope: 'user', version: '1.0.0', installPath }];
  });
  assert.notEqual(substituted.exitCode, 0, 'a substituted HUD source directory must fail');
  assert.match(substituted.stderr.toString(), /valid user HUD|canonical cache/i);

  const unsupportedSchema = await runManagedHud('unsupported-schema', fixture => [fakeHudEntry(fixture, '1.0.0', 'schema:', 0)], undefined, 1);
  assert.notEqual(unsupportedSchema.exitCode, 0, 'an unsupported installed_plugins schema must fail');
  assert.match(unsupportedSchema.stderr.toString(), /schema|valid user HUD/i);

  for (const version of ['9007199254740992.0.0', '1.0.0-9007199254740992']) {
    const unsafeVersion = await runManagedHud(`unsafe-version-${version.replaceAll('.', '-')}`, fixture => [fakeHudEntry(fixture, version, 'unsafe-version:', 0)]);
    assert.notEqual(unsafeVersion.exitCode, 0, `${version} must fail strict safe-integer SemVer validation`);
    assert.match(unsafeVersion.stderr.toString(), /valid user HUD/i);
  }

  const inPlaceFixture = makeHudFixture('runner-in-place-entry-substitution', { versions: [], clawgodName: 'clawgod-runner' });
  const inPlaceRecord = fakeHudEntry(inPlaceFixture, '1.0.0', 'unused', 9);
  const originalEntry = "await Bun.write(Bun.stdout, 'ORIGINAL'); process.exit(9);\n";
  const replacedEntry = "await Bun.write(Bun.stdout, 'REPLACED'); process.exit(0);\n";
  assert.equal(Buffer.byteLength(originalEntry), Buffer.byteLength(replacedEntry), 'the in-place substitution fixture must retain file size');
  writeFileSync(join(inPlaceRecord.installPath, 'src', 'index.ts'), originalEntry);
  writeFileSync(join(inPlaceFixture.pluginRoot, 'installed_plugins.json'), JSON.stringify({
    version: 2,
    plugins: { 'claude-hud@claude-hud': [inPlaceRecord] },
  }, null, 2) + '\n');
  const inPlaceModule = renderHudStatusLineModule(inPlaceFixture.context)
    .replace('readFileSync, realpathSync', 'readFileSync, realpathSync, writeFileSync')
    .replace('  revalidate(selected);', `  writeFileSync(selected.entry, ${JSON.stringify(replacedEntry)});\n  revalidate(selected);`);
  assert.match(inPlaceModule, /writeFileSync\(selected\.entry/, 'the race fixture must mutate the entry after initial validation');
  writeFileSync(inPlaceFixture.modulePath, inPlaceModule);
  const inPlaceChild = Bun.spawn({
    cmd: [process.execPath, inPlaceFixture.modulePath],
    cwd: inPlaceFixture.root,
    env: inPlaceFixture.context.env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const inPlaceExit = await inPlaceChild.exited;
  const inPlaceStdout = Buffer.from(await new Response(inPlaceChild.stdout).arrayBuffer());
  assert.notEqual(inPlaceExit, 0, 'an in-place HUD entry substitution must fail before execution');
  assert.notDeepEqual(inPlaceStdout, Buffer.from('REPLACED'), 'substituted same-inode entry bytes must never execute');

  for (const [label, recordsFactory] of [
    ['malformed', () => [{ scope: 'user', version: 'latest', installPath: 7 }]],
    ['missing', () => []],
  ]) {
    const failed = await runManagedHud(label, recordsFactory);
    assert.notEqual(failed.exitCode, 0, `${label} HUD state must fail`);
    assert.match(failed.stderr.toString(), /valid user HUD/i);
  }

  assert.deepEqual(PLUGIN_BASELINES, expected, 'managed plugin baselines must retain their verified source metadata');

  assert.equal(classifyPlugin({}, PLUGIN_BASELINES.hud), 'missing');
  assert.equal(classifyPlugin(records('claude-hud@claude-hud', '0.6.0'), PLUGIN_BASELINES.hud), 'older');
  assert.equal(classifyPlugin(records('claude-hud@claude-hud', '0.7.0'), PLUGIN_BASELINES.hud), 'satisfied');
  assert.equal(classifyPlugin(records('claude-hud@claude-hud', '0.8.0'), PLUGIN_BASELINES.hud), 'satisfied');
  assert.equal(classifyPlugin(records('claude-hud@claude-hud', '0.7.0-beta.1'), PLUGIN_BASELINES.hud), 'older');
  assert.equal(classifyPlugin(records('claude-hud@claude-hud', 'latest'), PLUGIN_BASELINES.hud), 'invalid');
  assert.equal(classifyPlugin({ plugins: { 'claude-hud@claude-hud': [{ scope: 'project', version: '1.0.0' }] } }, PLUGIN_BASELINES.hud), 'missing', 'project records must not satisfy the user dependency');

  assert.deepEqual(parseSemver('13.14.0-rc.2'), { major: 13, minor: 14, patch: 0, prerelease: ['rc', 2] }, 'strict SemVer must parse prereleases');
  for (const malformed of ['01.2.3', '1.02.3', '1.2.03', '1.2', '1.2.3+build.1', '1.2.3-', '1.2.3-01', 'v1.2.3']) {
    assert.equal(parseSemver(malformed), null, `${malformed} must not be coerced into a version`);
  }
  assert.equal(compareSemver('1.0.0-alpha.2', '1.0.0-alpha.10'), -1, 'numeric prerelease identifiers must compare numerically');
  assert.equal(compareSemver('1.0.0-1', '1.0.0-alpha'), -1, 'numeric prerelease identifiers must sort before strings');
  assert.equal(compareSemver('1.0.0', '1.0.0-rc.1'), 1, 'stable versions must sort after the same core prerelease');
  assert.equal(compareSemver('1.0.0+build.1', '1.0.0'), null, 'build metadata must be rejected rather than coerced');

  const multiVersion = {
    plugins: {
      'claude-hud@claude-hud': [
        { scope: 'user', version: '0.6.0' },
        { scope: 'user', version: '0.8.0-beta.1' },
        { scope: 'user', version: '0.8.0' },
        { scope: 'local', version: '9.9.9' },
      ],
    },
  };
  assert.equal(selectInstalledRecord(multiVersion, 'claude-hud@claude-hud').version, '0.8.0', 'the highest valid user version must be selected');

  const duplicateSuperpowers = {
    plugins: {
      'superpowers@superpowers-marketplace': [{ scope: 'user', version: '6.1.0' }],
      'superpowers@claude-plugins-official': [{ scope: 'user', version: '99.0.0', metadata: { keep: true } }],
    },
  };
  const officialBefore = JSON.stringify(duplicateSuperpowers.plugins['superpowers@claude-plugins-official']);
  assert.equal(classifyPlugin(duplicateSuperpowers, PLUGIN_BASELINES.superpowers), 'older', 'only the configured Superpowers plugin id may satisfy the dependency');
  assert.equal(JSON.stringify(duplicateSuperpowers.plugins['superpowers@claude-plugins-official']), officialBefore, 'the official Superpowers record must remain byte-identical');

  const validArchives = {};
  const verifiedSourceTrees = {};
  assert.equal(sha256(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'SHA-256 must match the standard abc vector');
  for (const key of ['hud', 'memory', 'superpowers']) {
    const base = PLUGIN_BASELINES[key];
    const bytes = await pluginArchive(base, key === 'superpowers'
      ? { owner: { name: 'Jesse Vincent', email: 'jesse@fsck.com' } }
      : {});
    validArchives[key] = bytes;
    const spec = archiveSpec(base, bytes);
    assert.equal(sha256(bytes), spec.sha256, `${key} fixtures must use the exported SHA-256 implementation`);
    validateArchive(bytes, spec);
    const sourceRoot = await extractPluginArchive(bytes, spec, join(fixtureRoot, `valid-${key}`));
    assert.equal(existsSync(join(sourceRoot, '.claude-plugin', 'marketplace.json')), true, `${key} must return its single repository root`);
    verifiedSourceTrees[key] = snapshotContentTree(sourceRoot);
  }

  const hudSpec = archiveSpec(PLUGIN_BASELINES.hud, validArchives.hud);
  const roundTwoContainmentFailures = [];
  for (const [label, unsafeSpec] of [
    ['extract key separator', { ...hudSpec, key: '../hud' }],
    ['extract version separator', { ...hudSpec, version: '../0.7.0' }],
  ]) {
    try {
      await extractPluginArchive(validArchives.hud, unsafeSpec, join(fixtureRoot, label.replaceAll(' ', '-')));
      roundTwoContainmentFailures.push(`${label}: accepted`);
    } catch (error) {
      if (!/invalid.*(?:key|version)|filename component/i.test(error.message)) {
        roundTwoContainmentFailures.push(`${label}: ${error.message}`);
      }
    }
  }

  const existingAncestorTarget = join(fixtureRoot, 'existing-ancestor-target');
  const existingAncestorLink = join(fixtureRoot, 'existing-ancestor-link');
  const existingLinkedDestination = join(existingAncestorLink, 'nested', 'destination');
  const actualLinkedDestination = join(existingAncestorTarget, 'nested', 'destination');
  mkdirSync(actualLinkedDestination, { recursive: true });
  symlinkSync(existingAncestorTarget, existingAncestorLink, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    await extractPluginArchive(validArchives.hud, hudSpec, existingLinkedDestination);
    roundTwoContainmentFailures.push('existing destination symlink ancestor: accepted');
  } catch (error) {
    if (!/unsafe.*destination|destination.*(?:link|ancestor)/i.test(error.message)) {
      roundTwoContainmentFailures.push(`existing destination symlink ancestor: ${error.message}`);
    }
  }
  if (readdirSync(actualLinkedDestination).length !== 0) {
    roundTwoContainmentFailures.push('existing destination symlink ancestor: wrote through link');
  }

  const outsideDestination = join(fixtureRoot, 'outside-destination');
  const linkedDestination = join(fixtureRoot, 'linked-destination');
  mkdirSync(outsideDestination);
  symlinkSync(outsideDestination, linkedDestination, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(
    extractPluginArchive(validArchives.hud, hudSpec, linkedDestination),
    /unsafe.*destination|destination.*link/i,
    'an extraction destination symlink must be rejected before staging files',
  );
  assert.throws(() => validateArchive('not bytes', hudSpec), /archive bytes are invalid/i);
  assert.throws(() => validateArchive(validArchives.hud, { ...hudSpec, bytes: hudSpec.bytes + 1 }), /archive size mismatch/i);
  assert.throws(() => validateArchive(validArchives.hud, { ...hudSpec, sha256: '0'.repeat(64) }), /archive SHA-256 mismatch/i);
  const oversizedArchive = new Uint8Array(64 * 1024 * 1024 + 1);
  assert.throws(
    () => validateArchive(oversizedArchive, archiveSpec(PLUGIN_BASELINES.hud, oversizedArchive)),
    /archive exceeds safety limit/i,
    'compressed archives over 64 MiB must be rejected before extraction',
  );

  const metadataMarketplace = JSON.stringify({ name: 'claude-hud', plugins: [{ name: 'claude-hud', source: './' }] });
  const metadataPlugin = JSON.stringify({ name: 'claude-hud', version: '0.7.0' });
  const validMetadataArchive = rawTar([
    { name: 'global-pax', type: 'g', data: paxRecord('comment', 'fixture') },
    { name: 'local-pax', type: 'x', data: paxRecord('path', 'metadata-repo/.claude-plugin/marketplace.json') },
    { name: 'ignored-marketplace-name', data: metadataMarketplace },
    { name: '././@LongLink', type: 'L', data: Buffer.from('metadata-repo/.claude-plugin/plugin.json\0') },
    { name: 'ignored-plugin-name', data: metadataPlugin },
    { name: 'metadata-repo/README.md', data: 'fixture only\n' },
  ]);
  const metadataRoot = await extractPluginArchive(
    validMetadataArchive,
    archiveSpec(PLUGIN_BASELINES.hud, validMetadataArchive),
    join(fixtureRoot, 'valid-metadata'),
  );
  assert.equal(readFileSync(join(metadataRoot, 'README.md'), 'utf8'), 'fixture only\n', 'valid PAX and GNU long-name metadata must extract safely');

  const executableArchive = rawTar([
    { name: 'executable-repo/.claude-plugin/marketplace.json', data: JSON.stringify({ name: 'superpowers-dev', plugins: [{ name: 'superpowers', source: './' }] }), mode: 0o644 },
    { name: 'executable-repo/.claude-plugin/plugin.json', data: JSON.stringify({ name: 'superpowers', version: '6.2.0' }), mode: 0o644 },
    { name: 'executable-repo/hooks/run-hook.cmd', data: '#!/bin/sh\nexit 0\n', mode: 0o755 },
    { name: 'executable-repo/README.md', data: 'not executable\n', mode: 0o644 },
  ]);
  const executableRoot = await extractPluginArchive(
    executableArchive,
    archiveSpec(PLUGIN_BASELINES.superpowers, executableArchive),
    join(fixtureRoot, 'valid-executable'),
  );
  assert.equal(statSync(join(executableRoot, 'hooks', 'run-hook.cmd')).mode & 0o777, 0o700, 'tar executable bits must produce an executable staged hook');
  assert.equal(statSync(join(executableRoot, 'README.md')).mode & 0o777, 0o600, 'non-executable tar files must remain private and non-executable');

  const invalidEntries = [
    ['traversal', '../escape', '0'],
    ['absolute', '/tmp/escape', '0'],
    ['windows absolute', 'C:/escape', '0'],
    ['device', 'repo/device', '3'],
  ];
  const outsideSentinel = join(fixtureRoot, 'escape');
  for (const [label, name, type] of invalidEntries) {
    const bytes = rawTar([{ name, type }]);
    await rejectsArchive(extractPluginArchive, bytes, PLUGIN_BASELINES.hud, fixtureRoot, label, /unsafe|unsupported|link|device/i);
    assert.equal(existsSync(outsideSentinel), false, `${label} must not create an outside sentinel`);
  }

  const linkArchive = rawTar([
    { name: 'link-repo/.claude-plugin/marketplace.json', data: JSON.stringify({ name: 'claude-hud', plugins: [{ name: 'claude-hud', source: './' }] }), mode: 0o644 },
    { name: 'link-repo/.claude-plugin/plugin.json', data: JSON.stringify({ name: 'claude-hud', version: '0.7.0' }), mode: 0o644 },
    { name: 'link-repo/README.md', data: 'fixture only\n', mode: 0o644 },
    { name: 'link-repo/target.txt', data: 'symlink target content\n', mode: 0o644 },
    { name: 'link-repo/hard-target.txt', data: 'hardlink target content\n', mode: 0o644 },
    { name: 'link-repo/symlink.txt', type: '2', linkname: 'target.txt' },
    { name: 'link-repo/hardlink.txt', type: '1', linkname: 'link-repo/hard-target.txt' },
  ]);
  const linkRoot = await extractPluginArchive(
    linkArchive,
    archiveSpec(PLUGIN_BASELINES.hud, linkArchive),
    join(fixtureRoot, 'valid-links'),
  );
  assert.equal(readFileSync(join(linkRoot, 'symlink.txt'), 'utf8'), 'symlink target content\n', 'a symbolic link must extract as a copy of its resolved target');
  assert.equal(readFileSync(join(linkRoot, 'hardlink.txt'), 'utf8'), 'hardlink target content\n', 'a hard link must extract as a copy of its referenced archive path');
  for (const name of ['symlink.txt', 'hardlink.txt']) {
    const status = lstatSync(join(linkRoot, name));
    assert.equal(status.isSymbolicLink(), false, `${name} must not remain a symbolic link`);
    assert.equal(status.isFile(), true, `${name} must be a regular file`);
    assert.equal(status.nlink, 1, `${name} must not share an inode with its target`);
  }

  const unsafeLinks = [
    ['symlink absolute target', 'link-repo/abs.txt', '2', '/etc/passwd'],
    ['symlink escaping target', 'link-repo/esc.txt', '2', '../../escape'],
    ['hardlink unseen target', 'link-repo/hard-unseen.txt', '1', 'link-repo/does-not-exist.txt'],
    ['hardlink traversal target', 'link-repo/hard-trav.txt', '1', '../escape'],
  ];
  for (const [label, name, type, linkname] of unsafeLinks) {
    const bytes = rawTar([{ name, type, linkname }]);
    await rejectsArchive(extractPluginArchive, bytes, PLUGIN_BASELINES.hud, fixtureRoot, label, /unsafe|escape|unseen|link|device/i);
  }

  const secondRoot = await pluginArchive(PLUGIN_BASELINES.hud, { entries: { 'other-root/README.md': 'second root' } });
  await rejectsArchive(extractPluginArchive, secondRoot, PLUGIN_BASELINES.hud, fixtureRoot, 'second repository root', /single.*repository|top-level/i);

  const duplicatePath = rawTar([
    { name: 'repo/file.txt', data: 'first' },
    { name: 'repo//file.txt', data: 'second' },
  ]);
  await rejectsArchive(extractPluginArchive, duplicatePath, PLUGIN_BASELINES.hud, fixtureRoot, 'duplicate normalized path', /duplicate.*path/i);

  const tooManyEntries = rawTar(Array.from({ length: 50_001 }, (_, index) => ({ name: `repo/d${index}`, type: '5' })));
  await rejectsArchive(extractPluginArchive, tooManyEntries, PLUGIN_BASELINES.hud, fixtureRoot, 'entry count limit', /too many.*entries|entry.*limit/i);

  const oversizedEntry = rawTar([{ name: 'repo/large.bin', size: 64 * 1024 * 1024 + 1 }]);
  await rejectsArchive(extractPluginArchive, oversizedEntry, PLUGIN_BASELINES.hud, fixtureRoot, 'single entry size limit', /entry.*safety limit|entry.*large/i);

  const decompressionBomb = Bun.gzipSync(new Uint8Array(512 * 1024 * 1024 + 1));
  await rejectsArchive(
    extractPluginArchive,
    decompressionBomb,
    PLUGIN_BASELINES.hud,
    fixtureRoot,
    'bounded gzip output',
    /decompressed.*safety limit|gzip output.*limit/i,
  );

  const malformedMetadata = [
    ['malformed PAX metadata', rawTar([
      { name: 'pax-header', type: 'x', data: 'not-a-pax-record\n' },
      { name: 'repo/file', data: 'content' },
    ])],
    ['malformed GNU long-name metadata', rawTar([
      { name: '././@LongLink', type: 'L', data: 'repo/file-without-nul' },
      { name: 'ignored', data: 'content' },
    ])],
  ];
  for (const [label, bytes] of malformedMetadata) {
    await rejectsArchive(extractPluginArchive, bytes, PLUGIN_BASELINES.hud, fixtureRoot, label, /malformed.*metadata|metadata.*malformed/i);
  }

  const strictMarketplace = JSON.stringify({ name: 'claude-hud', plugins: [{ name: 'claude-hud', source: './' }] });
  const strictPlugin = JSON.stringify({ name: 'claude-hud', version: '0.7.0' });
  const strictTail = [
    { name: 'strict-repo/.claude-plugin/marketplace.json', data: strictMarketplace },
    { name: 'strict-repo/.claude-plugin/plugin.json', data: strictPlugin },
    { name: 'strict-repo/README.md', data: 'strict fixture\n' },
  ];
  const parserDifferentials = [
    ['NUL-tailed mode field', rawTar([
      { ...strictTail[0], modeField: '000755\0x' },
      ...strictTail.slice(1),
    ])],
    ['NUL-tailed size field', rawTar([
      ...strictTail.slice(0, 2),
      { ...strictTail[2], sizeField: '0000000017\0x' },
    ])],
    ['tab-prefixed checksum field', rawTar([
      { ...strictTail[0], checksumStyle: 'tab' },
      ...strictTail.slice(1),
    ])],
    ['embedded NUL GNU long name', rawTar([
      { name: '././@LongLink', type: 'L', data: Buffer.from('strict-repo/.claude-plugin/marketplace.json\0ignored\0') },
      { name: 'ignored-marketplace', data: strictMarketplace },
      ...strictTail.slice(1),
    ])],
    ['stacked local PAX metadata', rawTar([
      { name: 'pax-one', type: 'x', data: paxRecord('comment', 'first') },
      { name: 'pax-two', type: 'x', data: paxRecord('path', 'strict-repo/.claude-plugin/marketplace.json') },
      { name: 'ignored-marketplace', data: strictMarketplace },
      ...strictTail.slice(1),
    ])],
    ['GNU name across global PAX metadata', rawTar([
      { name: '././@LongLink', type: 'L', data: Buffer.from('strict-repo/.claude-plugin/marketplace.json\0') },
      { name: 'global-pax', type: 'g', data: paxRecord('comment', 'intervening') },
      { name: 'ignored-marketplace', data: strictMarketplace },
      ...strictTail.slice(1),
    ])],
  ];
  const acceptedParserDifferentials = [];
  for (const [label, bytes] of parserDifferentials) {
    try {
      await extractPluginArchive(bytes, archiveSpec(PLUGIN_BASELINES.hud, bytes), join(fixtureRoot, `strict-${label.replace(/[^a-z0-9]+/gi, '-')}`));
      acceptedParserDifferentials.push(label);
    } catch (error) {
      if (!/malformed.*(?:tar|metadata)|metadata.*malformed/i.test(error.message)) throw error;
    }
  }
  assert.deepEqual(acceptedParserDifferentials, [], 'strict tar parsing must reject every numeric and metadata differential');

  const strictArchive = rawTar(strictTail);
  const checksumMutation = Buffer.from(Bun.gunzipSync(strictArchive));
  checksumMutation[0] ^= 1;
  await rejectsArchive(
    extractPluginArchive,
    Bun.gzipSync(checksumMutation),
    PLUGIN_BASELINES.hud,
    fixtureRoot,
    'tar checksum mutation',
    /checksum mismatch/i,
  );
  const truncatedTar = rawTarBytes(strictTail);
  await rejectsArchive(
    extractPluginArchive,
    Bun.gzipSync(truncatedTar.subarray(0, truncatedTar.length - 513)),
    PLUGIN_BASELINES.hud,
    fixtureRoot,
    'truncated tar padding',
    /truncated|terminator|checksum|malformed/i,
  );
  const terminatorDifferentials = [
    ['single zero terminator block', rawTar(strictTail, { terminatorBlocks: 1 })],
    ['partial zero tail', rawTar(strictTail, { tail: Buffer.from([0]) })],
  ];
  const acceptedTerminatorDifferentials = [];
  for (const [label, bytes] of terminatorDifferentials) {
    try {
      await extractPluginArchive(bytes, archiveSpec(PLUGIN_BASELINES.hud, bytes), join(fixtureRoot, `terminator-${label.replace(/[^a-z0-9]+/gi, '-')}`));
      acceptedTerminatorDifferentials.push(label);
    } catch (error) {
      if (!/terminator|padding|block-aligned|malformed/i.test(error.message)) throw error;
    }
  }
  assert.deepEqual(acceptedTerminatorDifferentials, [], 'tar parsing must require two complete zero blocks and block-aligned trailing padding');

  for (const [label, overrides, expected] of [
    ['marketplace name mismatch', { marketplaceName: 'wrong-marketplace' }, /marketplace name mismatch/i],
    ['plugin name mismatch', { pluginName: 'wrong-plugin' }, /plugin manifest mismatch/i],
    ['plugin version mismatch', { pluginVersion: '0.0.0' }, /plugin manifest mismatch/i],
    ['claude-mem source mismatch', { source: './' }, /declared.*plugin.*source|plugin.*source/i],
    ['Superpowers source mismatch', { source: './plugin/' }, /declared.*source|plugin.*source/i],
    ['Superpowers empty source alias', { source: '' }, /declared.*source|plugin.*source/i],
  ]) {
    const base = label.startsWith('claude-mem') ? PLUGIN_BASELINES.memory
      : label.startsWith('Superpowers') ? PLUGIN_BASELINES.superpowers
        : PLUGIN_BASELINES.hud;
    const bytes = await pluginArchive(base, overrides);
    await rejectsArchive(extractPluginArchive, bytes, base, fixtureRoot, label, expected);
  }

  const clawgodDir = join(fixtureHome, '.clawgod');
  const cacheDir = join(clawgodDir, 'cache', 'claude-plugins');
  mkdirSync(cacheDir, { recursive: true });
  const fetchFilePath = join(clawgodDir, 'fetch-file.mjs');
  const fetchLog = join(fixtureRoot, 'fetch-log.json');
  writeFileSync(fetchFilePath, `#!/usr/bin/env bun
import { copyFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
if (process.env.FIXTURE_FETCH_FAIL === '1') {
  console.error('fixture downloader failure: https://secret.example.test/proxy?token=do-not-leak');
  process.exit(23);
}
copyFileSync(process.env.FIXTURE_ARCHIVE, process.argv[3]);
if (process.env.FIXTURE_ATTACK_CACHE_DIR) {
  renameSync(process.env.FIXTURE_ATTACK_CACHE_DIR, process.env.FIXTURE_ATTACK_CACHE_BACKUP);
  symlinkSync(process.env.FIXTURE_ATTACK_CACHE_BACKUP, process.env.FIXTURE_ATTACK_CACHE_DIR, process.platform === 'win32' ? 'junction' : 'dir');
}
writeFileSync(process.env.FIXTURE_FETCH_LOG, JSON.stringify(process.env));
`);
  chmodSync(fetchFilePath, 0o700);
  const context = {
    home: fixtureHome,
    claudeConfigDir: fixtureClaudeConfig,
    clawgodDir,
    bunPath: process.execPath,
    claudeCliPath: join(fixtureBin, 'claude'),
    fetchFilePath,
    env: {
      HOME: fixtureHome,
      CLAUDE_CONFIG_DIR: fixtureClaudeConfig,
      PATH: fixtureBin,
      FIXTURE_ARCHIVE: join(fixtureRoot, 'download.tar.gz'),
      FIXTURE_FETCH_LOG: fetchLog,
    },
    spawnSyncImpl: Bun.spawnSync,
  };
  const cachePath = join(cacheDir, `${hudSpec.key}-${hudSpec.version}.tar.gz`);
  writeFileSync(cachePath, validArchives.hud);
  const cached = await downloadAndStage(hudSpec, context);
  assert.equal(cached.cached, true, 'a fully verified archive must be reused from cache');
  assert.equal(cached.archivePath, cachePath, 'cache reuse must report the versioned archive path');
  assert.equal(existsSync(fetchLog), false, 'a valid cached archive must not spawn the downloader');

  writeFileSync(cachePath, 'corrupt cache');
  writeFileSync(context.env.FIXTURE_ARCHIVE, validArchives.hud);
  const replaced = await downloadAndStage(hudSpec, context);
  assert.equal(replaced.cached, false, 'a corrupt cache must be downloaded again');
  assert.deepEqual(readFileSync(cachePath), Buffer.from(validArchives.hud), 'a verified temporary download must atomically replace corrupt cache bytes');
  const fetchedEnvironment = JSON.parse(readFileSync(fetchLog, 'utf8'));
  for (const [key, value] of Object.entries(context.env)) {
    assert.equal(fetchedEnvironment[key], value, `the managed fetcher must receive context.env ${key}`);
  }

  const containmentFailures = [];
  for (const [label, maliciousSpec] of [
    ['key separator', { ...hudSpec, key: '../hud' }],
    ['version separator', { ...hudSpec, version: '../0.7.0' }],
  ]) {
    const componentRoot = join(fixtureRoot, `component-${label.replace(' ', '-')}`);
    mkdirSync(componentRoot);
    try {
      await downloadAndStage(maliciousSpec, { ...context, clawgodDir: componentRoot });
      containmentFailures.push(`${label}: accepted`);
    } catch (error) {
      if (!/invalid.*(?:key|version)|filename component/i.test(error.message)) containmentFailures.push(`${label}: ${error.message}`);
    }
  }

  const symlinkCacheTarget = join(fixtureRoot, 'symlink-cache-target.tar.gz');
  writeFileSync(symlinkCacheTarget, validArchives.hud);
  rmSync(cachePath, { force: true });
  symlinkSync(symlinkCacheTarget, cachePath);
  try {
    const result = await downloadAndStage(hudSpec, context);
    if (result.cached || lstatSync(cachePath).isSymbolicLink() || statSync(cachePath).nlink !== 1) {
      containmentFailures.push('cache symlink leaf: reused or retained');
    }
  } catch (error) {
    containmentFailures.push(`cache symlink leaf: ${error.message}`);
  }

  const hardlinkCacheTarget = join(fixtureRoot, 'hardlink-cache-target.tar.gz');
  writeFileSync(hardlinkCacheTarget, validArchives.hud);
  rmSync(cachePath, { force: true });
  linkSync(hardlinkCacheTarget, cachePath);
  try {
    const result = await downloadAndStage(hudSpec, context);
    if (result.cached || statSync(cachePath).nlink !== 1 || statSync(hardlinkCacheTarget).nlink !== 1) {
      containmentFailures.push('cache hardlink leaf: reused or retained');
    }
  } catch (error) {
    containmentFailures.push(`cache hardlink leaf: ${error.message}`);
  }

  const cacheAncestorRoot = join(fixtureRoot, 'cache-ancestor-root');
  const cacheAncestorOutside = join(fixtureRoot, 'cache-ancestor-outside');
  mkdirSync(cacheAncestorRoot);
  mkdirSync(cacheAncestorOutside);
  symlinkSync(cacheAncestorOutside, join(cacheAncestorRoot, 'cache'), process.platform === 'win32' ? 'junction' : 'dir');
  try {
    await downloadAndStage(hudSpec, { ...context, clawgodDir: cacheAncestorRoot });
    containmentFailures.push('cache symlink ancestor: accepted');
  } catch (error) {
    if (!/unsafe.*directory|symlink.*ancestor/i.test(error.message)) containmentFailures.push(`cache symlink ancestor: ${error.message}`);
  }

  const stagingAncestorRoot = join(fixtureRoot, 'staging-ancestor-root');
  const stagingAncestorOutside = join(fixtureRoot, 'staging-ancestor-outside');
  mkdirSync(join(stagingAncestorRoot, 'cache', 'claude-plugins'), { recursive: true });
  writeFileSync(join(stagingAncestorRoot, 'cache', 'claude-plugins', `${hudSpec.key}-${hudSpec.version}.tar.gz`), validArchives.hud);
  mkdirSync(stagingAncestorOutside);
  symlinkSync(stagingAncestorOutside, join(stagingAncestorRoot, 'staging'), process.platform === 'win32' ? 'junction' : 'dir');
  try {
    await downloadAndStage(hudSpec, { ...context, clawgodDir: stagingAncestorRoot });
    containmentFailures.push('staging symlink ancestor: accepted');
  } catch (error) {
    if (!/unsafe.*directory|symlink.*ancestor/i.test(error.message)) containmentFailures.push(`staging symlink ancestor: ${error.message}`);
  }

  const concurrentRoot = join(fixtureRoot, 'concurrent-root');
  const concurrentCache = join(concurrentRoot, 'cache', 'claude-plugins');
  const concurrentBackup = join(fixtureRoot, 'concurrent-cache-backup');
  mkdirSync(concurrentCache, { recursive: true });
  writeFileSync(join(concurrentCache, `${hudSpec.key}-${hudSpec.version}.tar.gz`), 'corrupt');
  try {
    await downloadAndStage(hudSpec, {
      ...context,
      clawgodDir: concurrentRoot,
      env: {
        ...context.env,
        FIXTURE_ATTACK_CACHE_DIR: concurrentCache,
        FIXTURE_ATTACK_CACHE_BACKUP: concurrentBackup,
      },
    });
    containmentFailures.push('concurrent cache ancestor replacement: accepted');
  } catch (error) {
    if (!/unsafe.*directory|changed during download|cache.*replaced/i.test(error.message)) {
      containmentFailures.push(`concurrent cache ancestor replacement: ${error.message}`);
    }
  }
  assert.deepEqual(containmentFailures, [], 'cache and staging containment must reject every path, leaf, and replacement differential');

  const regularReplacementRoot = join(fixtureRoot, 'regular-replacement-root');
  const regularReplacementCache = join(regularReplacementRoot, 'cache', 'claude-plugins');
  const regularReplacementBackup = join(fixtureRoot, 'regular-replacement-cache-backup');
  mkdirSync(regularReplacementCache, { recursive: true });
  writeFileSync(join(regularReplacementCache, `${hudSpec.key}-${hudSpec.version}.tar.gz`), 'corrupt');
  let regularReplacementTriggered = false;
  const regularReplacementSpec = { ...hudSpec };
  Object.defineProperty(regularReplacementSpec, 'sha256', {
    enumerable: true,
    get() {
      if (!regularReplacementTriggered) {
        regularReplacementTriggered = true;
        renameSync(regularReplacementCache, regularReplacementBackup);
        mkdirSync(regularReplacementCache, { recursive: true });
        const temporaryName = readdirSync(regularReplacementBackup).find(name => name.startsWith(`.${hudSpec.key}-${hudSpec.version}-`));
        assert.ok(temporaryName, 'the real fetch path must create its private temporary directory before hash validation');
        const replacementTemporary = join(regularReplacementCache, temporaryName);
        mkdirSync(replacementTemporary);
        copyFileSync(
          join(regularReplacementBackup, temporaryName, 'download.tar.gz'),
          join(replacementTemporary, 'download.tar.gz'),
        );
      }
      return hudSpec.sha256;
    },
  });
  try {
    await downloadAndStage(regularReplacementSpec, { ...context, clawgodDir: regularReplacementRoot });
    roundTwoContainmentFailures.push('regular cache directory replacement: accepted');
  } catch (error) {
    if (!/cache.*directory.*changed|cache.*replaced|unsafe.*cache/i.test(error.message)) {
      roundTwoContainmentFailures.push(`regular cache directory replacement: ${error.message}`);
    }
  }
  assert.equal(regularReplacementTriggered, true, 'the regular-directory replacement fixture must run during archive validation');
  assert.deepEqual(roundTwoContainmentFailures, [], 'exported extraction and regular-directory replacement must fail closed');

  const previousArchive = await pluginArchive(PLUGIN_BASELINES.hud, { root: 'previous-valid-cache' });
  writeFileSync(cachePath, previousArchive);
  context.env.FIXTURE_FETCH_FAIL = '1';
  await assert.rejects(
    downloadAndStage(hudSpec, context),
    error => {
      assert.match(error.message, /hud: download failed/i);
      assert.ok(
        error.message.includes(`download failed from ${hudSpec.url} (exit code 23)`),
        'download errors must name the exact source URL and exit code',
      );
      assert.match(error.message, /check your network connection/i, 'download errors must include troubleshooting guidance');
      assert.doesNotMatch(error.message, /\b(?:secret|proxy|token|stack)\b/i, 'downloader errors must be credential-free');
      assert.doesNotMatch(error.message, /fixture downloader failure/i, 'downloader stderr must not leak into managed errors');
      assert.equal(error.message.split('\n').length, 1, 'downloader errors must be one line');
      return true;
    },
    'a failed downloader must report one sanitized line',
  );
  assert.deepEqual(readFileSync(cachePath), Buffer.from(previousArchive), 'a downloader failure must leave the previous cache bytes untouched');

  const fakeCliPath = join(fixtureRoot, 'fake-cli.original.cjs');
  writeFileSync(fakeCliPath, `#!/usr/bin/env bun
import { appendFileSync, cpSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const config = process.env.CLAUDE_CONFIG_DIR;
const pluginRoot = join(config, 'plugins');
const knownPath = join(pluginRoot, 'known_marketplaces.json');
const installedPath = join(pluginRoot, 'installed_plugins.json');
const settingsPath = join(config, 'settings.json');
const args = process.argv.slice(2);
appendFileSync(process.env.FIXTURE_CLI_LOG, JSON.stringify({ args, disabled: process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, execPath: process.execPath, script: process.argv[1] }) + '\\n');

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\\n');
}
function failAfter(step) {
  if (process.env.FIXTURE_CLI_FAIL === step) process.exit(41);
}

if (args[0] !== 'plugin') process.exit(64);
if (args[1] === 'marketplace' && args[2] === 'remove') {
  const marketplace = args[3];
  const known = readJson(knownPath, {});
  delete known[marketplace];
  writeJson(knownPath, known);
  rmSync(join(pluginRoot, 'marketplaces', marketplace), { recursive: true, force: true });
  failAfter('marketplace-remove');
  process.exit(0);
}
  if (args[1] === 'marketplace' && args[2] === 'add' && args[4] === '--scope' && args[5] === 'user') {
  const source = args[3];
  const manifest = readJson(join(source, '.claude-plugin', 'marketplace.json'), null);
  if (!manifest?.name) process.exit(65);
  const install = join(pluginRoot, 'marketplaces', manifest.name);
  rmSync(install, { recursive: true, force: true });
  mkdirSync(dirname(install), { recursive: true });
  cpSync(source, install, { recursive: true, errorOnExist: true, force: false });
  const known = readJson(knownPath, {});
  known[manifest.name] = { source: { source: 'directory', path: source }, installLocation: install };
  writeJson(knownPath, known);
  if (process.env.FIXTURE_ATTACK_MARKETPLACE_PARENT) {
    const parent = dirname(install);
    renameSync(parent, process.env.FIXTURE_ATTACK_MARKETPLACE_BACKUP);
    symlinkSync(process.env.FIXTURE_ATTACK_MARKETPLACE_OUTSIDE, parent, process.platform === 'win32' ? 'junction' : 'dir');
  }
  if (process.env.FIXTURE_REPLACE_MARKETPLACE_PARENT_REGULAR === '1') {
    const parent = dirname(install);
    renameSync(parent, process.env.FIXTURE_REPLACE_MARKETPLACE_PARENT_BACKUP);
    mkdirSync(parent);
  }
  if (process.env.FIXTURE_CREATE_MARKETPLACE_SIBLING === '1') {
    writeFileSync(join(dirname(install), 'concurrent-sibling.txt'), 'preserve concurrent data\\n');
  }
  if (process.env.FIXTURE_ATTACK_PLUGIN_ROOT === '1') {
    renameSync(pluginRoot, process.env.FIXTURE_ATTACK_PLUGIN_ROOT_BACKUP);
    symlinkSync(process.env.FIXTURE_ATTACK_PLUGIN_ROOT_BACKUP, pluginRoot, process.platform === 'win32' ? 'junction' : 'dir');
    writeFileSync(
      join(process.env.FIXTURE_ATTACK_PLUGIN_ROOT_BACKUP, 'marketplaces', manifest.name, 'outside-sentinel.txt'),
      'do not delete through plugin-root replacement\\n',
    );
  }
  failAfter('marketplace-add');
  process.exit(0);
}
if ((args[1] === 'install' || args[1] === 'update') && args[3] === '--scope' && args[4] === 'user') {
  const id = args[2];
  const separator = id.lastIndexOf('@');
  const plugin = id.slice(0, separator);
  const marketplace = id.slice(separator + 1);
  const known = readJson(knownPath, {});
  const source = known[marketplace]?.source?.path;
  const manifest = source ? readJson(join(source, '.claude-plugin', 'marketplace.json'), null) : null;
  const entry = manifest?.plugins?.find(candidate => candidate.name === plugin);
  if (!entry || !source) process.exit(66);
  const pluginSource = join(source, entry.source.replace(/^\\.\\//, ''));
  const pluginManifest = readJson(join(pluginSource, '.claude-plugin', 'plugin.json'), null);
  const version = entry.version || pluginManifest?.version;
  if (!version) process.exit(66);
  const installPath = join(pluginRoot, 'cache', marketplace, plugin, version);
  rmSync(installPath, { recursive: true, force: true });
  mkdirSync(dirname(installPath), { recursive: true });
  cpSync(pluginSource, installPath, { recursive: true, errorOnExist: true, force: false });
  const installed = readJson(installedPath, { version: 2, plugins: {} });
  installed.version ??= 2;
  installed.plugins ??= {};
  const previousRecord = (installed.plugins[id] || []).find(record => record.scope === 'user');
  if (process.env.FIXTURE_MUTATE_OLD_CACHE === '1' && previousRecord?.installPath) {
    writeFileSync(join(previousRecord.installPath, 'old-cache.txt'), 'mutated old cache must be rolled back\\n');
  }
  installed.plugins[id] = (installed.plugins[id] || []).filter(record => record.scope !== 'user');
  const recordedInstallPath = process.env.FIXTURE_RECORD_CACHE_ROOT === '1'
    ? join(pluginRoot, 'cache')
    : installPath;
  installed.plugins[id].push({ scope: 'user', version, installPath: recordedInstallPath });
  writeJson(installedPath, installed);
  if (process.env.FIXTURE_SKIP_ENABLE !== '1') {
    const settings = readJson(settingsPath, {});
    settings.enabledPlugins ??= {};
    settings.enabledPlugins[id] = true;
    writeJson(settingsPath, settings);
  }
  if (process.env.FIXTURE_MALFORMED_AFTER === 'installed') writeFileSync(installedPath, '{malformed installed state\\n');
  if (process.env.FIXTURE_MALFORMED_AFTER === 'settings') writeFileSync(settingsPath, '{malformed settings state\\n');
  if (process.env.FIXTURE_CREATE_UNKNOWN_CACHE === '1') {
    const unknownParent = process.env.FIXTURE_UNKNOWN_CACHE_LOCATION === 'version' ? installPath : dirname(installPath);
    writeFileSync(join(unknownParent, 'concurrent-unknown.txt'), 'preserve unknown concurrent cache data\\n');
  }
  if (process.env.FIXTURE_ATTACK_CACHE_ROOT === '1') {
    const cacheRoot = join(pluginRoot, 'cache');
    renameSync(cacheRoot, process.env.FIXTURE_ATTACK_CACHE_ROOT_BACKUP);
    symlinkSync(process.env.FIXTURE_ATTACK_CACHE_ROOT_BACKUP, cacheRoot, process.platform === 'win32' ? 'junction' : 'dir');
    writeFileSync(join(process.env.FIXTURE_ATTACK_CACHE_ROOT_BACKUP, 'outside-sentinel.txt'), 'do not trust relocated cache\\n');
  }
  failAfter(args[1]);
  process.exit(0);
}
process.exit(67);
`);
  chmodSync(fakeCliPath, 0o700);

  function olderVersion(spec) {
    return spec.key === 'memory' ? '13.13.0' : spec.key === 'superpowers' ? '6.1.0' : '0.6.0';
  }

  function transactionSnapshot(fixture) {
    return Object.fromEntries(Object.entries(fixture.paths).map(([key, path]) => [key, snapshotTree(path)]));
  }

  function assertTransactionSnapshot(fixture, expectedSnapshot, message) {
    assert.deepEqual(transactionSnapshot(fixture), expectedSnapshot, message);
  }

  function makeTransactionFixture(label, spec, classification, options = {}) {
    const root = join(fixtureRoot, `transaction-${label}`);
    const home = join(root, 'home');
    const claudeConfigDir = join(root, 'claude-config');
    const pluginRoot = join(claudeConfigDir, 'plugins');
    const clawgodDir = join(root, 'clawgod');
    const cacheDirectory = join(clawgodDir, 'cache', 'claude-plugins');
    const persistentSource = join(pluginRoot, 'clawgod-marketplaces', spec.marketplace, spec.version);
    const marketplaceInstall = join(pluginRoot, 'marketplaces', spec.marketplace);
    const knownPath = join(pluginRoot, 'known_marketplaces.json');
    const installedPath = join(pluginRoot, 'installed_plugins.json');
    const settingsPath = join(claudeConfigDir, 'settings.json');
    const pluginCache = join(pluginRoot, 'cache', spec.marketplace, spec.plugin);
    const cliLog = join(root, 'cli-log.jsonl');
    const fetchLogPath = join(root, 'fetch-used');
    const fetchPath = join(root, 'unreachable-fetch.mjs');
    mkdirSync(home, { recursive: true });
    mkdirSync(pluginRoot, { recursive: true });
    mkdirSync(cacheDirectory, { recursive: true });
    mkdirSync(join(root, 'bin'), { recursive: true });
    const bytes = options.archiveBytes || validArchives[spec.key];
    const archivePath = join(cacheDirectory, `${spec.key}-${spec.version}.tar.gz`);
    if (options.archive !== false) writeFileSync(archivePath, bytes);
    writeFileSync(fetchPath, `await Bun.write(${JSON.stringify(fetchLogPath)}, 'called'); process.exit(79);\n`);

    const plugins = {
      'unrelated@fixture': [{ scope: 'user', version: '1.0.0', metadata: { preserve: true } }],
      ...(spec.key === 'superpowers' ? {
        'superpowers@claude-plugins-official': [{ scope: 'user', version: '99.0.0', metadata: { exact: 'official-record' } }],
      } : {}),
    };
    if (classification !== 'missing') {
      const version = classification === 'older' ? olderVersion(spec)
        : classification === 'satisfied' ? spec.version
          : classification === 'newer' ? '99.0.0' : 'latest';
      plugins[spec.id] = [{ scope: 'user', version, installPath: join(pluginCache, version), metadata: { preserve: classification } }];
      mkdirSync(join(pluginCache, version), { recursive: true });
      writeFileSync(join(pluginCache, version, 'old-cache.txt'), `old cache ${classification}\n`);
    } else {
      mkdirSync(join(pluginCache, 'legacy'), { recursive: true });
      writeFileSync(join(pluginCache, 'legacy', 'keep.txt'), 'unrelated legacy cache\n');
    }
    if (options.staleBaselineCache) {
      mkdirSync(join(pluginCache, spec.version), { recursive: true });
      writeFileSync(join(pluginCache, spec.version, 'stale.txt'), 'restore stale baseline cache\n');
    }
    writeFileSync(installedPath, `{\n  "version": 2,\n  "plugins": ${JSON.stringify(plugins, null, 4)}\n}\n`);
    chmodSync(installedPath, 0o640);
    writeFileSync(settingsPath, JSON.stringify({ enabledPlugins: { 'unrelated@fixture': true, [spec.id]: false } }, null, 4) + '\n');
    chmodSync(settingsPath, 0o600);
    const known = { 'unrelated-marketplace': { source: { source: 'github', repo: 'fixture/keep' } } };
    if (options.known !== false) {
      known[spec.marketplace] = { source: { source: 'directory', path: '/old/stale/source' }, installLocation: marketplaceInstall, marker: 'old-known-entry' };
      mkdirSync(marketplaceInstall, { recursive: true });
      writeFileSync(join(marketplaceInstall, 'old-marketplace.txt'), 'restore old marketplace\n');
    }
    writeFileSync(knownPath, JSON.stringify(known, null, 3) + '\n');
    chmodSync(knownPath, 0o644);
    if (options.oldPersistent) {
      mkdirSync(persistentSource, { recursive: true });
      writeFileSync(join(persistentSource, 'old-source.txt'), 'restore old persistent source\n');
    }
    if (spec.key === 'superpowers') {
      const officialCache = join(pluginRoot, 'cache', 'claude-plugins-official', 'superpowers', '99.0.0');
      mkdirSync(officialCache, { recursive: true });
      writeFileSync(join(officialCache, 'official.txt'), 'official bytes must remain exact\n');
    }
    const fixtureContext = {
      home,
      claudeConfigDir,
      clawgodDir,
      bunPath: process.execPath,
      claudeCliPath: fakeCliPath,
      fetchFilePath: fetchPath,
      env: {
        HOME: home,
        CLAUDE_CONFIG_DIR: claudeConfigDir,
        PATH: join(root, 'bin'),
        FIXTURE_CLI_LOG: cliLog,
        ...(options.failStep ? { FIXTURE_CLI_FAIL: options.failStep } : {}),
        ...(options.unknownCacheOnFailure ? { FIXTURE_CREATE_UNKNOWN_CACHE: '1' } : {}),
        ...(options.unknownCacheLocation ? { FIXTURE_UNKNOWN_CACHE_LOCATION: options.unknownCacheLocation } : {}),
        ...(options.recordCacheRoot ? { FIXTURE_RECORD_CACHE_ROOT: '1' } : {}),
        ...(options.skipEnable ? { FIXTURE_SKIP_ENABLE: '1' } : {}),
        ...(options.malformedAfter ? { FIXTURE_MALFORMED_AFTER: options.malformedAfter } : {}),
        ...(options.createMarketplaceSibling ? { FIXTURE_CREATE_MARKETPLACE_SIBLING: '1' } : {}),
        ...(options.mutateOldCache ? { FIXTURE_MUTATE_OLD_CACHE: '1' } : {}),
        ...(options.attackMarketplaceParent ? {
          FIXTURE_ATTACK_MARKETPLACE_PARENT: '1',
          FIXTURE_ATTACK_MARKETPLACE_BACKUP: join(root, 'marketplaces-displaced'),
          FIXTURE_ATTACK_MARKETPLACE_OUTSIDE: join(root, 'marketplaces-outside'),
        } : {}),
        ...(options.replaceMarketplaceParentRegular ? {
          FIXTURE_REPLACE_MARKETPLACE_PARENT_REGULAR: '1',
          FIXTURE_REPLACE_MARKETPLACE_PARENT_BACKUP: join(root, 'marketplaces-regular-displaced'),
        } : {}),
        ...(options.attackPluginRoot ? {
          FIXTURE_ATTACK_PLUGIN_ROOT: '1',
          FIXTURE_ATTACK_PLUGIN_ROOT_BACKUP: join(root, 'plugins-displaced'),
        } : {}),
        ...(options.attackCacheRoot ? {
          FIXTURE_ATTACK_CACHE_ROOT: '1',
          FIXTURE_ATTACK_CACHE_ROOT_BACKUP: join(root, 'cache-displaced'),
        } : {}),
      },
      spawnSyncImpl: Bun.spawnSync,
    };
    return {
      root, home, claudeConfigDir, pluginRoot, clawgodDir, persistentSource, marketplaceInstall,
      knownPath, installedPath, settingsPath, pluginCache, cliLog, fetchLogPath,
      context: fixtureContext,
      paths: {
        pluginRoot,
        known: knownPath,
        installed: installedPath,
        settings: settingsPath,
        marketplace: marketplaceInstall,
        cache: pluginCache,
        persistent: persistentSource,
      },
    };
  }

  function readCliLog(fixture) {
    if (!existsSync(fixture.cliLog)) return [];
    return readFileSync(fixture.cliLog, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  }

  const installFixture = makeTransactionFixture('missing-install', hudSpec, 'missing', { known: false });
  const installResult = await ensureMarketplacePlugin(hudSpec, installFixture.context);
  assert.deepEqual(installResult, {
    key: 'hud', id: hudSpec.id, version: hudSpec.version, status: 'installed', ready: true,
    detail: 'installed 0.7.0',
  }, 'a missing plugin must install the exact baseline');
  assert.deepEqual(readCliLog(installFixture), [
    { args: ['plugin', 'marketplace', 'add', installFixture.persistentSource, '--scope', 'user'], disabled: '1', execPath: process.execPath, script: fakeCliPath },
    { args: ['plugin', 'install', hudSpec.id, '--scope', 'user'], disabled: '1', execPath: process.execPath, script: fakeCliPath },
  ], 'a missing plugin must add its persistent marketplace and install only the canonical id');
  const installedHud = JSON.parse(readFileSync(installFixture.installedPath, 'utf8'));
  assert.equal(installedHud.plugins[hudSpec.id].find(record => record.scope === 'user').version, hudSpec.version);
  assert.deepEqual(JSON.parse(readFileSync(installFixture.settingsPath, 'utf8')).enabledPlugins, {
    'unrelated@fixture': true,
    [hudSpec.id]: true,
  }, 'installation must enable only the canonical dependency while preserving unrelated settings');
  assert.equal(existsSync(installFixture.persistentSource), true, 'the persistent marketplace source must remain after success');
  assert.equal(walkTextFiles(installFixture.persistentSource).some(value => value.includes('.staged') || value.includes('/staging/')), false, 'persistent source bytes must not reference temporary staging paths');
  const installedHudPath = installedHud.plugins[hudSpec.id].find(record => record.scope === 'user').installPath;
  assert.equal(realpathSync(installedHudPath).startsWith(`${realpathSync(join(installFixture.pluginRoot, 'cache'))}/`), true, 'the installed plugin must remain under the canonical cache root');
  rmSync(installFixture.clawgodDir, { recursive: true, force: true });
  assert.equal(existsSync(installFixture.persistentSource), true, 'the marketplace source must survive removal of ClawGod state');

  const updateFixture = makeTransactionFixture('older-update', hudSpec, 'older', { oldPersistent: true });
  const updateResult = await ensureMarketplacePlugin(hudSpec, updateFixture.context);
  assert.equal(updateResult.status, 'upgraded', 'an older user plugin must be upgraded to the baseline');
  assert.deepEqual(readCliLog(updateFixture).map(entry => entry.args), [
    ['plugin', 'marketplace', 'remove', hudSpec.marketplace],
    ['plugin', 'marketplace', 'add', updateFixture.persistentSource, '--scope', 'user'],
    ['plugin', 'update', hudSpec.id, '--scope', 'user'],
  ], 'an older plugin must replace the stale canonical marketplace before update');
  assert.equal(existsSync(join(updateFixture.marketplaceInstall, 'old-marketplace.txt')), false, 'a stale canonical marketplace install must not survive success');

  const superSpec = archiveSpec(PLUGIN_BASELINES.superpowers, validArchives.superpowers);
  const superFixture = makeTransactionFixture('superpowers-wrapper', superSpec, 'missing', { known: false });
  const officialRecordBefore = JSON.stringify(JSON.parse(readFileSync(superFixture.installedPath, 'utf8')).plugins['superpowers@claude-plugins-official']);
  const officialCacheBefore = snapshotTree(join(superFixture.pluginRoot, 'cache', 'claude-plugins-official', 'superpowers'));
  const superResult = await ensureMarketplacePlugin(superSpec, superFixture.context);
  assert.equal(superResult.status, 'installed');
  assert.deepEqual(JSON.parse(readFileSync(join(superFixture.persistentSource, '.claude-plugin', 'marketplace.json'), 'utf8')), {
    name: 'superpowers-marketplace',
    owner: { name: 'Jesse Vincent', email: 'jesse@fsck.com' },
    plugins: [{ name: 'superpowers', version: '6.2.0', source: './plugin' }],
  }, 'Superpowers wrapper manifest must preserve the source marketplace owner');
  assert.deepEqual(snapshotContentTree(join(superFixture.persistentSource, 'plugin')), verifiedSourceTrees.superpowers, 'the complete verified Superpowers repository must remain nested byte-for-byte with exact file modes');
  const installedSuperpowers = JSON.parse(readFileSync(superFixture.installedPath, 'utf8'));
  assert.equal(JSON.stringify(installedSuperpowers.plugins['superpowers@claude-plugins-official']), officialRecordBefore, 'the official Superpowers record must remain byte-identical');
  assert.deepEqual(snapshotTree(join(superFixture.pluginRoot, 'cache', 'claude-plugins-official', 'superpowers')), officialCacheBefore, 'the official Superpowers cache must remain byte-identical');
  assert.equal(readCliLog(superFixture).some(entry => entry.args.join(' ').includes('superpowers@claude-plugins-official')), false, 'no command may target official Superpowers');

  const lockfileArchive = await pluginArchive(PLUGIN_BASELINES.hud, {
    root: 'lockfile-repo',
    entries: {
      'lockfile-repo/package.json': JSON.stringify({ name: 'claude-hud', version: '0.7.0', main: 'dist/index.js' }),
      'lockfile-repo/package-lock.json': '{"name":"claude-hud","lockfileVersion":3}\n',
      'lockfile-repo/bun.lock': '{ "lockfileVersion": 1 }\n',
    },
  });
  const lockfileSpec = archiveSpec(PLUGIN_BASELINES.hud, lockfileArchive);
  const lockfileFixture = makeTransactionFixture('lockfile-strip', lockfileSpec, 'missing', { known: false, archiveBytes: lockfileArchive });
  const lockfileResult = await ensureMarketplacePlugin(lockfileSpec, lockfileFixture.context);
  assert.equal(lockfileResult.status, 'installed', 'a plugin source carrying an npm lockfile must still install');
  assert.equal(existsSync(join(lockfileFixture.persistentSource, 'package.json')), true, 'package.json must be retained in the managed source');
  assert.equal(existsSync(join(lockfileFixture.persistentSource, 'bun.lock')), true, 'bun.lock must be retained in the managed source');
  for (const lockfile of ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml']) {
    assert.equal(existsSync(join(lockfileFixture.persistentSource, lockfile)), false, `${lockfile} must be stripped from the managed plugin source`);
  }

  for (const [classification, expectedStatus, expectedReady] of [
    ['satisfied', 'preserved', true],
    ['newer', 'preserved', true],
    ['invalid', 'warning', false],
  ]) {
    const preserveFixture = makeTransactionFixture(`preserve-${classification}`, hudSpec, classification, { archive: false, oldPersistent: true });
    const before = transactionSnapshot(preserveFixture);
    const result = await ensureMarketplacePlugin(hudSpec, preserveFixture.context);
    assert.equal(result.status, expectedStatus, `${classification} versions must return ${expectedStatus}`);
    assert.equal(result.ready, expectedReady, `${classification} readiness must be explicit`);
    assertTransactionSnapshot(preserveFixture, before, `${classification} versions must preserve marketplace, cache, settings, source, and installation record bytes`);
    assert.equal(existsSync(preserveFixture.cliLog), false, `${classification} versions must spawn no CLI command`);
    assert.equal(existsSync(preserveFixture.fetchLogPath), false, `${classification} versions must not fetch archives`);
  }

  const noncanonicalSpec = { ...hudSpec, id: 'claude-hud@wrong-marketplace' };
  const noncanonicalFixture = makeTransactionFixture('noncanonical-id', noncanonicalSpec, 'missing', { archive: false });
  const noncanonicalBefore = transactionSnapshot(noncanonicalFixture);
  const noncanonicalResult = await ensureMarketplacePlugin(noncanonicalSpec, noncanonicalFixture.context);
  assert.equal(noncanonicalResult.status, 'warning', 'a noncanonical plugin id must be rejected');
  assert.equal(noncanonicalResult.ready, false, 'a noncanonical plugin id must not report readiness');
  assertTransactionSnapshot(noncanonicalFixture, noncanonicalBefore, 'a noncanonical plugin id must preserve every byte and mode');
  assert.equal(existsSync(noncanonicalFixture.cliLog), false, 'a noncanonical plugin id must spawn no CLI command');
  assert.equal(existsSync(noncanonicalFixture.fetchLogPath), false, 'a noncanonical plugin id must not fetch archives');

  const protectedOfficialSpec = {
    ...superSpec,
    id: 'superpowers@claude-plugins-official',
    marketplace: 'claude-plugins-official',
  };
  const protectedOfficialFixture = makeTransactionFixture('protected-official-tuple', superSpec, 'missing', { known: false });
  const protectedOfficialInstalled = JSON.parse(readFileSync(protectedOfficialFixture.installedPath, 'utf8'));
  delete protectedOfficialInstalled.plugins['superpowers@claude-plugins-official'];
  writeFileSync(protectedOfficialFixture.installedPath, `${JSON.stringify(protectedOfficialInstalled, null, 2)}\n`);
  chmodSync(protectedOfficialFixture.installedPath, 0o640);
  const protectedOfficialBefore = transactionSnapshot(protectedOfficialFixture);
  const protectedOfficialResult = await ensureMarketplacePlugin(protectedOfficialSpec, protectedOfficialFixture.context);
  assert.equal(protectedOfficialResult.status, 'warning', 'a self-consistent protected official Superpowers tuple must be rejected');
  assert.equal(protectedOfficialResult.ready, false, 'a protected official Superpowers tuple must not report readiness');
  assertTransactionSnapshot(protectedOfficialFixture, protectedOfficialBefore, 'a protected official Superpowers tuple must preserve every byte and mode');
  assert.equal(existsSync(protectedOfficialFixture.cliLog), false, 'a protected official Superpowers tuple must spawn no CLI command');
  assert.equal(existsSync(protectedOfficialFixture.fetchLogPath), false, 'a protected official Superpowers tuple must not fetch archives');

  for (const [field, value] of [
    ['key', 'hud-copy'],
    ['id', 'claude-hud-copy@claude-hud'],
    ['marketplace', 'claude-hud-copy'],
    ['plugin', 'claude-hud-copy'],
    ['version', '0.7.1'],
  ]) {
    const tupleFixture = makeTransactionFixture(`noncanonical-tuple-${field}`, hudSpec, 'missing', { known: false });
    const tupleBefore = transactionSnapshot(tupleFixture);
    const tupleResult = await ensureMarketplacePlugin({ ...hudSpec, [field]: value }, tupleFixture.context);
    assert.equal(tupleResult.status, 'warning', `a noncanonical ${field} must be rejected`);
    assert.equal(tupleResult.ready, false, `a noncanonical ${field} must not report readiness`);
    assertTransactionSnapshot(tupleFixture, tupleBefore, `a noncanonical ${field} must preserve every byte and mode`);
    assert.equal(existsSync(tupleFixture.cliLog), false, `a noncanonical ${field} must spawn no CLI command`);
    assert.equal(existsSync(tupleFixture.fetchLogPath), false, `a noncanonical ${field} must not fetch archives`);
  }

  const freshConfigFixture = makeTransactionFixture('fresh-config-fetch-failure', hudSpec, 'missing', { archive: false, known: false });
  rmSync(freshConfigFixture.pluginRoot, { recursive: true, force: true });
  const freshConfigBefore = transactionSnapshot(freshConfigFixture);
  const freshConfigResult = await ensureMarketplacePlugin(hudSpec, freshConfigFixture.context);
  assert.equal(freshConfigResult.status, 'warning', 'a pre-mutation failure in a fresh config must return an ordinary warning');
  assert.equal(freshConfigResult.ready, false, 'a pre-mutation failure in a fresh config must not report readiness');
  assertTransactionSnapshot(freshConfigFixture, freshConfigBefore, 'a pre-mutation failure must preserve an absent plugins tree');
  assert.equal(existsSync(freshConfigFixture.pluginRoot), false, 'a pre-mutation failure must not create the absent plugins tree');
  assert.equal(existsSync(freshConfigFixture.cliLog), false, 'a pre-mutation failure must spawn no CLI command');
  assert.equal(existsSync(freshConfigFixture.fetchLogPath), true, 'the fresh-config fixture must reach its failing fetch helper');

  const malformedSpecFixture = makeTransactionFixture('malformed-spec', hudSpec, 'missing', { archive: false });
  const malformedSpecBefore = transactionSnapshot(malformedSpecFixture);
  const malformedSpecResult = await ensureMarketplacePlugin({ ...hudSpec, key: '../hud' }, malformedSpecFixture.context);
  assert.equal(malformedSpecResult.status, 'warning', 'a malformed plugin spec must warn without throwing');
  assert.equal(malformedSpecResult.ready, false, 'a malformed plugin spec must not report readiness');
  assertTransactionSnapshot(malformedSpecFixture, malformedSpecBefore, 'a malformed plugin spec must preserve every byte and mode');
  assert.equal(existsSync(malformedSpecFixture.cliLog), false, 'a malformed plugin spec must spawn no CLI command');
  assert.equal(existsSync(malformedSpecFixture.fetchLogPath), false, 'a malformed plugin spec must not fetch archives');

  for (const malformedTarget of ['installed', 'known', 'settings']) {
    const malformedFixture = makeTransactionFixture(`malformed-${malformedTarget}`, hudSpec, 'missing', { archive: false });
    writeFileSync(malformedFixture.paths[malformedTarget], '{not valid json\n');
    const before = transactionSnapshot(malformedFixture);
    const result = await ensureMarketplacePlugin(hudSpec, malformedFixture.context);
    assert.equal(result.status, 'warning', `malformed ${malformedTarget} state must warn without throwing`);
    assertTransactionSnapshot(malformedFixture, before, `malformed ${malformedTarget} state must preserve every byte and mode`);
    assert.equal(existsSync(malformedFixture.cliLog), false, `malformed ${malformedTarget} state must spawn no CLI command`);
    assert.equal(existsSync(malformedFixture.fetchLogPath), false, `malformed ${malformedTarget} state must not fetch archives`);
  }

  const unsafeCacheFixture = makeTransactionFixture('unsafe-cache-snapshot', hudSpec, 'older', { oldPersistent: true });
  const unsafeCacheOutside = join(unsafeCacheFixture.root, 'unsafe-cache-outside');
  mkdirSync(unsafeCacheOutside);
  writeFileSync(join(unsafeCacheOutside, 'outside-sentinel.txt'), 'cache snapshot must not alter this target\n');
  symlinkSync(unsafeCacheOutside, join(unsafeCacheFixture.pluginCache, 'unsafe-link'), process.platform === 'win32' ? 'junction' : 'dir');
  const unsafeCacheBefore = transactionSnapshot(unsafeCacheFixture);
  const unsafeCacheOutsideBefore = snapshotTree(unsafeCacheOutside);
  const unsafeCacheResult = await ensureMarketplacePlugin(hudSpec, unsafeCacheFixture.context);
  assert.equal(unsafeCacheResult.status, 'warning', 'an unsafe cache snapshot must warn without throwing');
  assert.equal(unsafeCacheResult.ready, false, 'an unsafe cache snapshot must not report readiness');
  assertTransactionSnapshot(unsafeCacheFixture, unsafeCacheBefore, 'failed cache snapshot preparation must restore exact directory trees');
  assert.deepEqual(snapshotTree(unsafeCacheOutside), unsafeCacheOutsideBefore, 'cache snapshot preparation must not write through a link');
  assert.equal(existsSync(unsafeCacheFixture.cliLog), false, 'an unsafe cache snapshot must spawn no plugin CLI');

  const cacheBackupCollisionFixture = makeTransactionFixture('cache-backup-collision', hudSpec, 'missing', { oldPersistent: true });
  rmSync(cacheBackupCollisionFixture.pluginCache, { recursive: true, force: true });
  const cacheBackupCollision = `${cacheBackupCollisionFixture.pluginCache}.${process.pid}.backup`;
  mkdirSync(cacheBackupCollision);
  writeFileSync(join(cacheBackupCollision, 'collision-sentinel.txt'), 'preserve pre-existing backup collision\n');
  const cacheBackupCollisionBefore = transactionSnapshot(cacheBackupCollisionFixture);
  const cacheBackupCollisionResult = await ensureMarketplacePlugin(hudSpec, cacheBackupCollisionFixture.context);
  assert.equal(cacheBackupCollisionResult.status, 'warning', 'a cache backup collision must warn without throwing');
  assert.equal(cacheBackupCollisionResult.ready, false, 'a cache backup collision must not report readiness');
  assertTransactionSnapshot(cacheBackupCollisionFixture, cacheBackupCollisionBefore, 'cache backup collision must not leave a transaction-created cache directory');
  assert.equal(existsSync(cacheBackupCollisionFixture.cliLog), false, 'a cache backup collision must spawn no plugin CLI');

  for (const [failStep, classification, staleBaselineCache, oldPersistent, knownMarketplace] of [
    ['marketplace-remove', 'older', false, true, true],
    ['marketplace-add', 'older', false, true, true],
    ['install', 'missing', true, false, false],
    ['update', 'older', false, true, true],
  ]) {
    const rollbackFixture = makeTransactionFixture(`rollback-${failStep}`, hudSpec, classification, {
      failStep,
      oldPersistent,
      known: knownMarketplace,
      staleBaselineCache,
      mutateOldCache: failStep === 'update',
    });
    const before = transactionSnapshot(rollbackFixture);
    const result = await ensureMarketplacePlugin(hudSpec, rollbackFixture.context);
    assert.equal(result.status, 'warning', `${failStep} failure must be reported as a warning`);
    assert.equal(result.ready, false, `${failStep} failure must not report readiness`);
    assertTransactionSnapshot(rollbackFixture, before, `${failStep} failure must restore exact JSON modes/bytes and directory trees`);
  }

  const cacheRootRecordFixture = makeTransactionFixture('rollback-cache-root-record', hudSpec, 'missing', {
    known: false,
    recordCacheRoot: true,
    staleBaselineCache: true,
  });
  const cacheRootRecordBefore = transactionSnapshot(cacheRootRecordFixture);
  const cacheRootRecordResult = await ensureMarketplacePlugin(hudSpec, cacheRootRecordFixture.context);
  assert.equal(cacheRootRecordResult.status, 'warning', 'an install record at the cache root must fail verification');
  assert.equal(cacheRootRecordResult.ready, false, 'an install record at the cache root must not report readiness');
  assertTransactionSnapshot(cacheRootRecordFixture, cacheRootRecordBefore, 'cache-root verification failure must restore exact JSON modes/bytes and directory trees');

  const unknownCacheFixture = makeTransactionFixture('rollback-unknown-cache', hudSpec, 'missing', {
    failStep: 'install',
    known: false,
    unknownCacheOnFailure: true,
  });
  await assert.rejects(
    ensureMarketplacePlugin(hudSpec, unknownCacheFixture.context),
    error => {
      assert.equal(error?.restorationIncomplete, true, 'unknown cache insertion must mark restoration incomplete');
      assert.equal(typeof error?.evidencePath, 'string', 'unknown cache insertion must retain an evidence path');
      assert.equal(
        readFileSync(join(error.evidencePath, 'concurrent-unknown.txt'), 'utf8'),
        'preserve unknown concurrent cache data\n',
        'unknown concurrent cache data must survive in the failed live tree',
      );
      return true;
    },
    'an unknown concurrent cache insertion must preserve evidence and reject ordinary rollback',
  );

  const nestedUnknownCacheFixture = makeTransactionFixture('rollback-nested-unknown-cache', hudSpec, 'missing', {
    failStep: 'install',
    known: false,
    unknownCacheOnFailure: true,
    unknownCacheLocation: 'version',
  });
  await assert.rejects(
    ensureMarketplacePlugin(hudSpec, nestedUnknownCacheFixture.context),
    error => {
      assert.equal(error?.restorationIncomplete, true, 'nested unknown cache insertion must mark restoration incomplete');
      assert.equal(
        readFileSync(join(error.evidencePath, hudSpec.version, 'concurrent-unknown.txt'), 'utf8'),
        'preserve unknown concurrent cache data\n',
        'nested unknown cache data must survive in the failed live tree',
      );
      return true;
    },
    'an unknown insertion within the baseline version must preserve evidence and reject ordinary rollback',
  );

  const postQuarantineFixture = makeTransactionFixture('rollback-post-quarantine-insertion', hudSpec, 'missing', {
    failStep: 'install',
    known: false,
  });
  postQuarantineFixture.context.onCacheQuarantined = ({ pluginCache }) => {
    mkdirSync(pluginCache, { recursive: true });
    writeFileSync(join(pluginCache, 'post-quarantine.txt'), 'preserve insertion after quarantine\n');
  };
  await assert.rejects(
    ensureMarketplacePlugin(hudSpec, postQuarantineFixture.context),
    error => {
      assert.equal(error?.restorationIncomplete, true, 'post-quarantine insertion must mark restoration incomplete');
      const evidencePaths = Array.isArray(error?.evidencePaths) ? error.evidencePaths : [];
      const concurrentEvidence = evidencePaths.find(path => existsSync(join(path, 'post-quarantine.txt')));
      assert.equal(typeof concurrentEvidence, 'string', 'post-quarantine insertion must retain an evidence path');
      return true;
    },
    'an insertion after cache quarantine must survive and reject ordinary rollback',
  );

  const postQuarantineModeFixture = makeTransactionFixture('rollback-post-quarantine-mode-change', hudSpec, 'missing', {
    failStep: 'install',
    known: false,
  });
  postQuarantineModeFixture.context.onCacheQuarantined = ({ pluginCache }) => {
    chmodSync(join(pluginCache, 'legacy', 'keep.txt'), 0o600);
  };
  await assert.rejects(
    ensureMarketplacePlugin(hudSpec, postQuarantineModeFixture.context),
    error => {
      assert.equal(error?.restorationIncomplete, true, 'a mode change after cache quarantine must mark restoration incomplete');
      const evidencePaths = Array.isArray(error?.evidencePaths) ? error.evidencePaths : [];
      const changedEvidence = evidencePaths.find(path => {
        const changedPath = join(path, 'legacy', 'keep.txt');
        return existsSync(changedPath) && (lstatSync(changedPath).mode & 0o777) === 0o600;
      });
      assert.equal(typeof changedEvidence, 'string', 'a mode-changed cache tree must remain available as evidence');
      return true;
    },
    'a mode change after cache quarantine must preserve evidence and reject ordinary rollback',
  );

  const lateCanonicalInsertionFixture = makeTransactionFixture('rollback-late-canonical-insertion', hudSpec, 'missing', {
    failStep: 'install',
    known: false,
  });
  let lateCanonicalHookRan = false;
  lateCanonicalInsertionFixture.context.onCacheFailedInspected = ({ pluginCache }) => {
    lateCanonicalHookRan = true;
    writeFileSync(join(pluginCache, 'late-concurrent.txt'), 'preserve late canonical insertion\n');
  };
  let lateCanonicalError;
  try {
    await ensureMarketplacePlugin(hudSpec, lateCanonicalInsertionFixture.context);
    assert.fail('a late canonical insertion must reject ordinary rollback');
  } catch (error) {
    lateCanonicalError = error;
  }
  assert.equal(lateCanonicalError?.restorationIncomplete, true, 'a late canonical insertion must mark restoration incomplete');
  assert.equal(lateCanonicalHookRan, true, 'the late canonical insertion fixture must run after failed-tree inspection');
  const lateEvidencePaths = [lateCanonicalInsertionFixture.pluginCache, ...(lateCanonicalError?.evidencePaths || [])];
  assert.equal(
    lateEvidencePaths.some(path => path && existsSync(join(path, 'late-concurrent.txt'))),
    true,
    'a late canonical insertion must survive incomplete rollback',
  );

  const lateFrozenInsertionFixture = makeTransactionFixture('rollback-late-frozen-insertion', hudSpec, 'missing', {
    failStep: 'install',
    known: false,
  });
  let lateFrozenHookRan = false;
  lateFrozenInsertionFixture.context.onCacheFailedInspected = ({ failedPath }) => {
    lateFrozenHookRan = true;
    writeFileSync(join(failedPath, 'late-frozen.txt'), 'preserve late frozen insertion\n');
  };
  let lateFrozenError;
  try {
    await ensureMarketplacePlugin(hudSpec, lateFrozenInsertionFixture.context);
    assert.fail('a late frozen-tree insertion must reject ordinary rollback');
  } catch (error) {
    lateFrozenError = error;
  }
  assert.equal(lateFrozenError?.restorationIncomplete, true, 'a late frozen-tree insertion must mark restoration incomplete');
  assert.equal(lateFrozenHookRan, true, 'the late frozen-tree insertion fixture must run after inspection');
  assert.equal(
    (lateFrozenError?.evidencePaths || []).some(path => existsSync(join(path, 'late-frozen.txt'))),
    true,
    'a late frozen-tree insertion must survive incomplete rollback',
  );

  const postInventoryFixture = makeTransactionFixture('rollback-post-inventory-insertion', hudSpec, 'missing', {
    failStep: 'install',
    known: false,
  });
  let postInventoryHookRan = false;
  postInventoryFixture.context.onCacheCleanupInventoried = ({ cleanupPath }) => {
    postInventoryHookRan = true;
    writeFileSync(join(cleanupPath, 'post-inventory.txt'), 'preserve insertion after cleanup inventory\n');
  };
  await assert.rejects(
    ensureMarketplacePlugin(hudSpec, postInventoryFixture.context),
    error => {
      assert.equal(error?.restorationIncomplete, true, 'a post-inventory insertion must mark restoration incomplete');
      const evidencePaths = Array.isArray(error?.evidencePaths) ? error.evidencePaths : [];
      assert.equal(
        evidencePaths.some(path => existsSync(join(path, 'post-inventory.txt'))),
        true,
        'a post-inventory insertion must survive in an evidence tree',
      );
      return true;
    },
    'an insertion after the final cleanup inventory must survive and reject ordinary rollback',
  );
  assert.equal(postInventoryHookRan, true, 'the post-inventory cleanup race hook must run');

  const enableFailureFixture = makeTransactionFixture('rollback-enable-verification', hudSpec, 'missing', {
    known: false,
    skipEnable: true,
    staleBaselineCache: true,
  });
  const enableFailureBefore = transactionSnapshot(enableFailureFixture);
  const enableFailureResult = await ensureMarketplacePlugin(hudSpec, enableFailureFixture.context);
  assert.equal(enableFailureResult.status, 'warning', 'a plugin left disabled by the CLI must fail verification');
  assert.equal(enableFailureResult.ready, false, 'a plugin left disabled by the CLI must not report readiness');
  assertTransactionSnapshot(enableFailureFixture, enableFailureBefore, 'enable verification failure must restore exact JSON modes/bytes and directory trees');

  for (const malformedAfter of ['installed', 'settings']) {
    const malformedAfterFixture = makeTransactionFixture(`rollback-malformed-after-${malformedAfter}`, hudSpec, 'missing', {
      known: false,
      malformedAfter,
      staleBaselineCache: true,
    });
    const malformedAfterBefore = transactionSnapshot(malformedAfterFixture);
    const malformedAfterResult = await ensureMarketplacePlugin(hudSpec, malformedAfterFixture.context);
    assert.equal(malformedAfterResult.status, 'warning', `malformed post-command ${malformedAfter} state must fail verification`);
    assert.equal(malformedAfterResult.ready, false, `malformed post-command ${malformedAfter} state must not report readiness`);
    assertTransactionSnapshot(malformedAfterFixture, malformedAfterBefore, `malformed post-command ${malformedAfter} state must roll back exact bytes, modes, and directory trees`);
  }

  const forbiddenCommands = ['git', 'node', 'npm', 'npx', 'curl', 'wget'];
  for (const fixture of [installFixture, updateFixture, superFixture]) {
    for (const entry of readCliLog(fixture)) {
      assert.equal(forbiddenCommands.some(command => entry.args.includes(command)), false, 'the transaction CLI must not invoke PATH tools or network commands');
    }
  }

  const linkedSourceFixture = makeTransactionFixture('linked-persistent-ancestor', hudSpec, 'missing', { known: false });
  const linkedOutside = join(linkedSourceFixture.root, 'outside-source');
  const linkedSourceParent = join(linkedSourceFixture.pluginRoot, 'clawgod-marketplaces');
  mkdirSync(linkedOutside);
  symlinkSync(linkedOutside, linkedSourceParent, process.platform === 'win32' ? 'junction' : 'dir');
  const linkedOutsideBefore = snapshotTree(linkedOutside);
  const linkedResult = await ensureMarketplacePlugin(hudSpec, linkedSourceFixture.context);
  assert.equal(linkedResult.status, 'warning', 'a linked persistent-source ancestor must fail closed');
  assert.deepEqual(snapshotTree(linkedOutside), linkedOutsideBefore, 'a linked persistent-source ancestor must receive no writes');
  assert.equal(existsSync(linkedSourceFixture.cliLog), false, 'a linked persistent-source ancestor must spawn no plugin CLI');

  const linkedSourceLeafFixture = makeTransactionFixture('linked-persistent-leaf', hudSpec, 'missing', { known: false });
  const linkedSourceLeafOutside = join(linkedSourceLeafFixture.root, 'outside-source-leaf');
  mkdirSync(dirname(linkedSourceLeafFixture.persistentSource), { recursive: true });
  mkdirSync(linkedSourceLeafOutside);
  writeFileSync(join(linkedSourceLeafOutside, 'outside-sentinel.txt'), 'do not replace or write through this link\n');
  symlinkSync(linkedSourceLeafOutside, linkedSourceLeafFixture.persistentSource, process.platform === 'win32' ? 'junction' : 'dir');
  const linkedSourceLeafBefore = transactionSnapshot(linkedSourceLeafFixture);
  const linkedSourceLeafOutsideBefore = snapshotTree(linkedSourceLeafOutside);
  const linkedSourceLeafResult = await ensureMarketplacePlugin(hudSpec, linkedSourceLeafFixture.context);
  assert.equal(linkedSourceLeafResult.status, 'warning', 'a linked persistent-source leaf must fail closed');
  assertTransactionSnapshot(linkedSourceLeafFixture, linkedSourceLeafBefore, 'a linked persistent-source leaf must remain byte-identical');
  assert.deepEqual(snapshotTree(linkedSourceLeafOutside), linkedSourceLeafOutsideBefore, 'a linked persistent-source leaf target must receive no writes');
  assert.equal(existsSync(linkedSourceLeafFixture.cliLog), false, 'a linked persistent-source leaf must spawn no plugin CLI');

  const stagedLeafFixture = makeTransactionFixture('linked-staged-leaf', hudSpec, 'missing', { known: false });
  const stagedParent = join(stagedLeafFixture.pluginRoot, 'clawgod-marketplaces', hudSpec.marketplace);
  const stagedOutside = join(stagedLeafFixture.root, 'outside-staged-leaf');
  mkdirSync(stagedParent, { recursive: true });
  mkdirSync(stagedOutside);
  const stagedLeaf = `${stagedLeafFixture.persistentSource}.${process.pid}.staged`;
  symlinkSync(stagedOutside, stagedLeaf, process.platform === 'win32' ? 'junction' : 'dir');
  const stagedOutsideBefore = snapshotTree(stagedOutside);
  const stagedLeafResult = await ensureMarketplacePlugin(hudSpec, stagedLeafFixture.context);
  assert.equal(stagedLeafResult.status, 'warning', 'a pre-existing staged source leaf must fail closed');
  assert.equal(lstatSync(stagedLeaf).isSymbolicLink(), true, 'the transaction must not unlink an unowned staged source leaf');
  assert.deepEqual(snapshotTree(stagedOutside), stagedOutsideBefore, 'a staged source link target must receive no writes');

  const persistentParentSwapFixture = makeTransactionFixture('persistent-parent-regular-swap', hudSpec, 'missing', {
    known: false,
    oldPersistent: true,
  });
  const persistentParent = dirname(persistentParentSwapFixture.persistentSource);
  const displacedPersistentParent = join(persistentParentSwapFixture.root, 'persistent-parent-displaced');
  persistentParentSwapFixture.context.onPersistentTransactionPrepared = transaction => {
    renameSync(transaction.parent, displacedPersistentParent);
    mkdirSync(transaction.parent, { recursive: true });
    writeFileSync(join(transaction.parent, 'replacement-sentinel.txt'), 'preserve replacement parent\n');
    mkdirSync(transaction.target);
    writeFileSync(join(transaction.target, 'replacement-target.txt'), 'force the staged rename to fail\n');
    symlinkSync(
      join(displacedPersistentParent, `${hudSpec.version}.${process.pid}.staged`),
      `${transaction.target}.${process.pid}.staged`,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  };
  await assert.rejects(
    ensureMarketplacePlugin(hudSpec, persistentParentSwapFixture.context),
    error => {
      assert.equal(error?.restorationIncomplete, true, 'a persistent parent replacement must retain the incomplete-restoration marker');
      assert.equal(error?.transaction?.hadExisting, true, 'a persistent parent replacement must retain its acquired rollback handle');
      assert.equal(error?.cause?.restorationIncomplete, true, 'cleanup must not replace the marked persistent restoration error');
      return true;
    },
    'a persistent parent replacement after backup acquisition must preserve the transaction handle and fail explicitly',
  );
  assert.equal(
    readFileSync(join(persistentParent, 'replacement-sentinel.txt'), 'utf8'),
    'preserve replacement parent\n',
    'rollback must preserve a regular replacement persistent parent',
  );
  assert.equal(existsSync(join(displacedPersistentParent, `${hudSpec.version}.${process.pid}.backup`)), true, 'the displaced persistent backup must remain as evidence');
  assert.equal(existsSync(join(displacedPersistentParent, `${hudSpec.version}.${process.pid}.staged`)), true, 'the displaced staged source must remain as evidence');

  const publicationRaceFixture = makeTransactionFixture('creation-publication-no-clobber', hudSpec, 'missing', {
    failStep: 'install',
    known: false,
  });
  const publicationPath = join(publicationRaceFixture.pluginRoot, 'clawgod-marketplaces');
  let publicationHookRan = false;
  let suppliedIdentity = null;
  publicationRaceFixture.context.onManagedDirectoryPublishing = ({ path }) => {
    if (path !== publicationPath) return;
    publicationHookRan = true;
    mkdirSync(path);
    const status = lstatSync(path);
    suppliedIdentity = { dev: status.dev, ino: status.ino };
  };
  let publicationError = null;
  try {
    await ensureMarketplacePlugin(hudSpec, publicationRaceFixture.context);
  } catch (error) {
    publicationError = error;
  }
  const publishedStatus = existsSync(publicationPath) ? lstatSync(publicationPath) : null;
  assert.deepEqual({
    hookRan: publicationHookRan,
    restorationIncomplete: publicationError?.restorationIncomplete === true,
    suppliedPreserved: suppliedIdentity !== null && publishedStatus?.dev === suppliedIdentity.dev && publishedStatus?.ino === suppliedIdentity.ino,
    evidenceReported: publicationError?.evidencePaths?.includes(publicationPath) === true,
  }, {
    hookRan: true,
    restorationIncomplete: true,
    suppliedPreserved: true,
    evidenceReported: true,
  }, 'pre-publication must never overwrite or adopt an empty concurrently supplied directory');

  const creationRaceOutcomes = {};
  for (const targetKind of ['persistent', 'marketplace']) {
    const creationRaceFixture = makeTransactionFixture(`creation-identity-${targetKind}`, hudSpec, 'missing', {
      failStep: 'install',
      known: false,
    });
    const managedPath = targetKind === 'persistent'
      ? join(creationRaceFixture.pluginRoot, 'clawgod-marketplaces')
      : join(creationRaceFixture.pluginRoot, 'marketplaces');
    const displacedPath = join(creationRaceFixture.root, `${targetKind}-created-object`);
    let hookRan = false;
    creationRaceFixture.context.onManagedDirectoryInstalled = ({ path }) => {
      if (path !== managedPath) return;
      hookRan = true;
      renameSync(path, displacedPath);
      mkdirSync(path);
    };
    let creationError = null;
    try {
      await ensureMarketplacePlugin(hudSpec, creationRaceFixture.context);
    } catch (error) {
      creationError = error;
    }
    creationRaceOutcomes[targetKind] = {
      hookRan,
      restorationIncomplete: creationError?.restorationIncomplete === true,
      replacementPreserved: existsSync(managedPath),
      createdObjectPreserved: existsSync(displacedPath),
    };
  }
  assert.deepEqual(creationRaceOutcomes, {
    persistent: {
      hookRan: true,
      restorationIncomplete: true,
      replacementPreserved: true,
      createdObjectPreserved: true,
    },
    marketplace: {
      hookRan: true,
      restorationIncomplete: true,
      replacementPreserved: true,
      createdObjectPreserved: true,
    },
  }, 'a substituted regular directory must never be recorded or removed as transaction-created');

  const concurrentFixture = makeTransactionFixture('concurrent-marketplace-parent', hudSpec, 'older', {
    failStep: 'marketplace-add',
    oldPersistent: true,
    attackMarketplaceParent: true,
  });
  mkdirSync(concurrentFixture.context.env.FIXTURE_ATTACK_MARKETPLACE_OUTSIDE);
  writeFileSync(join(concurrentFixture.context.env.FIXTURE_ATTACK_MARKETPLACE_OUTSIDE, 'outside-sentinel.txt'), 'do not delete through replacement link\n');
  await assert.rejects(
    ensureMarketplacePlugin(hudSpec, concurrentFixture.context),
    error => error?.restorationIncomplete === true,
    'a concurrent marketplace-parent replacement must retain incomplete-restoration evidence',
  );
  assert.equal(readFileSync(join(concurrentFixture.context.env.FIXTURE_ATTACK_MARKETPLACE_OUTSIDE, 'outside-sentinel.txt'), 'utf8'), 'do not delete through replacement link\n', 'rollback must not recurse through a concurrently replaced parent');

  const regularMarketplaceParentFixture = makeTransactionFixture('regular-marketplace-parent-replacement', hudSpec, 'missing', {
    failStep: 'marketplace-add',
    known: false,
    replaceMarketplaceParentRegular: true,
  });
  const regularMarketplaceParent = join(regularMarketplaceParentFixture.pluginRoot, 'marketplaces');
  await assert.rejects(
    ensureMarketplacePlugin(hudSpec, regularMarketplaceParentFixture.context),
    error => error?.restorationIncomplete === true,
    'a regular replacement of a transaction-created marketplace parent must fail explicitly',
  );
  assert.equal(existsSync(regularMarketplaceParent), true, 'cleanup must not remove a regular replacement parent');
  assert.equal(
    existsSync(join(regularMarketplaceParentFixture.context.env.FIXTURE_REPLACE_MARKETPLACE_PARENT_BACKUP, hudSpec.marketplace)),
    true,
    'the displaced marketplace tree must remain as evidence',
  );

  const pluginRootSwapFixture = makeTransactionFixture('concurrent-plugin-root', hudSpec, 'older', {
    failStep: 'marketplace-add',
    oldPersistent: true,
    attackPluginRoot: true,
  });
  await assert.rejects(
    ensureMarketplacePlugin(hudSpec, pluginRootSwapFixture.context),
    error => error?.restorationIncomplete === true,
    'a concurrent plugin-root replacement must retain incomplete-restoration evidence',
  );
  assert.equal(
    readFileSync(join(pluginRootSwapFixture.context.env.FIXTURE_ATTACK_PLUGIN_ROOT_BACKUP, 'marketplaces', hudSpec.marketplace, 'outside-sentinel.txt'), 'utf8'),
    'do not delete through plugin-root replacement\n',
    'rollback must not recurse through a replaced plugin-root ancestor',
  );

  const concurrentSiblingFixture = makeTransactionFixture('concurrent-marketplace-sibling', hudSpec, 'missing', {
    failStep: 'marketplace-add',
    known: false,
    createMarketplaceSibling: true,
  });
  await assert.rejects(
    ensureMarketplacePlugin(hudSpec, concurrentSiblingFixture.context),
    error => error?.restorationIncomplete === true,
    'a concurrent entry in a transaction-created parent must retain incomplete-restoration evidence',
  );
  assert.equal(readFileSync(join(concurrentSiblingFixture.pluginRoot, 'marketplaces', 'concurrent-sibling.txt'), 'utf8'), 'preserve concurrent data\n', 'rollback must preserve an unrelated concurrent sibling');

  const cacheRootSwapFixture = makeTransactionFixture('concurrent-cache-root', hudSpec, 'missing', {
    known: false,
    attackCacheRoot: true,
  });
  await assert.rejects(
    ensureMarketplacePlugin(hudSpec, cacheRootSwapFixture.context),
    error => error?.restorationIncomplete === true,
    'a relocated cache root must not be accepted as a ready installation',
  );
  assert.equal(
    readFileSync(join(cacheRootSwapFixture.context.env.FIXTURE_ATTACK_CACHE_ROOT_BACKUP, 'outside-sentinel.txt'), 'utf8'),
    'do not trust relocated cache\n',
    'verification and rollback must not delete through a relocated cache root',
  );

  const cleanupWarningFixture = makeTransactionFixture('concurrent-cleanup-warning', hudSpec, 'older', {
    oldPersistent: true,
    attackMarketplaceParent: true,
  });
  mkdirSync(cleanupWarningFixture.context.env.FIXTURE_ATTACK_MARKETPLACE_OUTSIDE);
  writeFileSync(join(cleanupWarningFixture.context.env.FIXTURE_ATTACK_MARKETPLACE_OUTSIDE, 'outside-sentinel.txt'), 'do not delete through cleanup replacement link\n');
  const cleanupWarningResult = await ensureMarketplacePlugin(hudSpec, cleanupWarningFixture.context);
  assert.equal(cleanupWarningResult.status, 'warning', 'backup cleanup failure must be reported as a warning');
  assert.equal(cleanupWarningResult.ready, true, 'backup cleanup failure must not roll back a verified plugin');
  assert.equal(cleanupWarningResult.version, hudSpec.version, 'backup cleanup warning must retain the verified baseline version');
  assert.equal(shouldConfigurePluginDependency(cleanupWarningResult), false, 'any marketplace warning must block dependent configuration even when the plugin is ready');
  assert.equal(readFileSync(join(cleanupWarningFixture.context.env.FIXTURE_ATTACK_MARKETPLACE_OUTSIDE, 'outside-sentinel.txt'), 'utf8'), 'do not delete through cleanup replacement link\n', 'cleanup must not recurse through a concurrently replaced parent');
} finally {
  for (const [key, value] of savedEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(fixtureRoot, { recursive: true, force: true });
}

for (const [key, value] of savedEnvironment) {
  const actual = Object.hasOwn(process.env, key) ? process.env[key] : undefined;
  assert.equal(actual, value, `${key} must be restored after the fixture import`);
}

console.log('installer plugin dependency tests passed');
