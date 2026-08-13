#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

const pluginSummary = runContract('plugin-summary', {
  output: [
    'claude-hud@claude-hud: ready - installed 0.7.0',
    'claude-mem@thedotmack: ready - installed 13.14.0',
    'superpowers@superpowers-marketplace: ready - installed 6.2.0',
    'Optional plugins: 3 ready, 0 disabled, 0 warnings',
    '',
  ].join('\n'),
  ready: 3,
  disabled: 0,
  warnings: 0,
});
assert.equal(pluginSummary.status, 0, pluginSummary.stderr);
assert.match(pluginSummary.stdout, /^plugin summary: ready=3 disabled=0 warnings=0$/m);

const subsetPluginSummary = runContract('plugin-summary', {
  output: [
    'claude-hud@claude-hud: ready - installed 0.7.0',
    'claude-mem@thedotmack: disabled - not selected',
    'superpowers@superpowers-marketplace: disabled - not selected',
    'Optional plugins: 1 ready, 2 disabled, 0 warnings',
    '',
  ].join('\n'),
  ready: 1,
  disabled: 2,
  warnings: 0,
});
assert.equal(subsetPluginSummary.status, 0, subsetPluginSummary.stderr);
assert.match(subsetPluginSummary.stdout, /^plugin summary: ready=1 disabled=2 warnings=0$/m);

const nonePluginSummary = runContract('plugin-summary', {
  output: 'Optional plugins: 0 ready, 3 disabled, 0 warnings\n',
  ready: 0,
  disabled: 3,
  warnings: 0,
});
assert.equal(nonePluginSummary.status, 0, nonePluginSummary.stderr);
assert.match(nonePluginSummary.stdout, /^plugin summary: ready=0 disabled=3 warnings=0$/m);

for (const [label, fixture] of [
  ['missing summary', { output: 'all plugin detail lines only\n', ready: 3, disabled: 0, warnings: 0 }],
  ['duplicate summary', { output: 'Optional plugins: 3 ready, 0 disabled, 0 warnings\nOptional plugins: 3 ready, 0 disabled, 0 warnings\n', ready: 3, disabled: 0, warnings: 0 }],
  ['two ready', { output: 'Optional plugins: 2 ready, 1 disabled, 0 warnings\n', ready: 3, disabled: 0, warnings: 0 }],
  ['warning summary', { output: 'Optional plugins: 2 ready, 0 disabled, 1 warning\n', ready: 3, disabled: 0, warnings: 0 }],
  ['legacy two-way summary', { output: 'Optional plugins: 3 ready, 0 warnings\n', ready: 3, disabled: 0, warnings: 0 }],
]) {
  const run = runContract('plugin-summary', fixture);
  assert.notEqual(run.status, 0, `${label} must fail plugin summary validation`);
  assert.match(run.stderr, /plugin|summary|ready|disabled|warning/i, `${label} must explain the plugin summary failure`);
}

const enhancementConfigAll = runContract('enhancement-config', {
  source: '{\n  "schemaVersion": 1,\n  "mode": "all",\n  "enabled": []\n}\n',
  mode: 'all',
  enabled: [],
});
assert.equal(enhancementConfigAll.status, 0, enhancementConfigAll.stderr);
assert.match(enhancementConfigAll.stdout, /^enhancement config: mode=all enabled=0$/m);

const enhancementConfigSubset = runContract('enhancement-config', {
  source: '{\n  "schemaVersion": 1,\n  "mode": "custom",\n  "enabled": [\n    "chrome",\n    "computer-use",\n    "claude-hud"\n  ]\n}\n',
  mode: 'custom',
  enabled: ['chrome', 'computer-use', 'claude-hud'],
});
assert.equal(enhancementConfigSubset.status, 0, enhancementConfigSubset.stderr);
assert.match(enhancementConfigSubset.stdout, /^enhancement config: mode=custom enabled=3$/m);

const enhancementConfigNone = runContract('enhancement-config', {
  source: '{\n  "schemaVersion": 1,\n  "mode": "custom",\n  "enabled": []\n}\n',
  mode: 'custom',
  enabled: [],
});
assert.equal(enhancementConfigNone.status, 0, enhancementConfigNone.stderr);
assert.match(enhancementConfigNone.stdout, /^enhancement config: mode=custom enabled=0$/m);

for (const [label, fixture] of [
  ['missing schemaVersion', { source: '{\n  "mode": "all",\n  "enabled": []\n}\n', mode: 'all', enabled: [] }],
  ['wrong schemaVersion', { source: '{\n  "schemaVersion": 2,\n  "mode": "all",\n  "enabled": []\n}\n', mode: 'all', enabled: [] }],
  ['wrong mode', { source: '{\n  "schemaVersion": 1,\n  "mode": "custom",\n  "enabled": []\n}\n', mode: 'all', enabled: [] }],
  ['wrong enabled list', { source: '{\n  "schemaVersion": 1,\n  "mode": "all",\n  "enabled": [\n    "chrome"\n  ]\n}\n', mode: 'all', enabled: [] }],
  ['extra key', { source: '{\n  "schemaVersion": 1,\n  "mode": "all",\n  "enabled": [],\n  "extra": true\n}\n', mode: 'all', enabled: [] }],
  ['invalid json', { source: 'not json', mode: 'all', enabled: [] }],
]) {
  const run = runContract('enhancement-config', fixture);
  assert.notEqual(run.status, 0, `${label} must fail enhancement config validation`);
  assert.match(run.stderr, /enhancement config|schemaVersion|mode|enabled|JSON/i, `${label} must explain the enhancement config failure`);
}

const noPrompt = runContract('no-prompt', 'installer output without an interactive selection prompt\n');
assert.equal(noPrompt.status, 0, noPrompt.stderr);
assert.match(noPrompt.stdout, /^no prompt: selection resolved without interaction$/m);
const promptedOutput = runContract('no-prompt', '  Choice: select enhancements to install\n');
assert.notEqual(promptedOutput.status, 0, 'an interactive Choice: prompt must fail the no-prompt contract');
assert.match(promptedOutput.stderr, /prompt|Choice/i);

const contractBunPath = '/tmp/clawgod-contract/bin/bun';
const contractHudModulePath = '/tmp/clawgod-contract/home/.clawgod/claude-hud-statusline.mjs';
const managedHudSettings = {
  unrelated: { preserve: true },
  statusLine: { type: 'command', command: `'${contractBunPath}' '${contractHudModulePath}'` },
};
const hudStatusLine = runContract('hud-statusline', {
  settings: managedHudSettings,
  bunPath: contractBunPath,
  managedModulePath: contractHudModulePath,
});
assert.equal(hudStatusLine.status, 0, hudStatusLine.stderr);
assert.match(hudStatusLine.stdout, /^HUD statusline: bun-only current-style=exact$/m);

for (const [label, statusLine] of [
  ['missing statusLine', undefined],
  ['Node command', { type: 'command', command: `node '${contractHudModulePath}'` }],
  ['Bash command', { type: 'command', command: `bash -c "'${contractBunPath}' '${contractHudModulePath}'"` }],
  ['wrong managed module', { type: 'command', command: `'${contractBunPath}' '/tmp/clawgod-contract/home/.clawgod/other.mjs'` }],
]) {
  const settings = { unrelated: { preserve: true } };
  if (statusLine !== undefined) settings.statusLine = statusLine;
  const run = runContract('hud-statusline', { settings, bunPath: contractBunPath, managedModulePath: contractHudModulePath });
  assert.notEqual(run.status, 0, `${label} must fail HUD statusLine validation`);
  assert.match(run.stderr, /HUD|statusLine|Bun|command|module/i, `${label} must explain the HUD validation failure`);
}

const hudConsumerRoot = mkdtempSync(join(realpathSync(tmpdir()), 'clawgod-hud-consumer-contract-'));
try {
  const consumerBin = join(hudConsumerRoot, 'bin');
  const consumerBun = join(consumerBin, 'bun');
  const nodeMarker = join(hudConsumerRoot, 'node-shim-used');
  const consumerModule = join(hudConsumerRoot, 'statusline-consumer.mjs');
  const expectedBytes = Buffer.from('\u001b[32mpersisted-consumer\u001b[0m\n', 'utf8');
  mkdirSync(consumerBin);
  symlinkSync(process.execPath, consumerBun);
  writeFileSync(join(consumerBin, 'node'), `#!/bin/sh\nprintf used > '${nodeMarker}'\nexit 97\n`);
  chmodSync(join(consumerBin, 'node'), 0o700);
  writeFileSync(consumerModule, `if (process.env.CLAWGOD_CONSUMER_TOKEN !== 'from-persisted-command') process.exit(64);\nawait Bun.write(Bun.stdout, Uint8Array.from(${JSON.stringify([...expectedBytes])}));\n`);
  const command = `CLAWGOD_CONSUMER_TOKEN=from-persisted-command '${consumerBun}' '${consumerModule}'`;
  const consumer = runContract('hud-consumer', {
    settings: { statusLine: { type: 'command', command } },
    shell: '/bin/sh',
    cwd: hudConsumerRoot,
    env: { HOME: hudConsumerRoot, PATH: `${consumerBin}:/usr/bin:/bin` },
    inputBase64: Buffer.from('{"fixture":true}\n').toString('base64'),
    expectedBase64: expectedBytes.toString('base64'),
    timeoutMs: 5_000,
  });
  assert.equal(consumer.status, 0, consumer.stderr);
  assert.match(consumer.stdout, /^HUD consumer: persisted-command raw-bytes=exact$/m);
  assert.equal(existsSync(nodeMarker), false, 'the persisted HUD consumer must not invoke the Node shim');
} finally {
  rmSync(hudConsumerRoot, { recursive: true, force: true });
}

const canonicalPluginIds = [
  'claude-hud@claude-hud',
  'claude-mem@thedotmack',
  'superpowers@superpowers-marketplace',
];
const retentionSpecs = [
  { id: canonicalPluginIds[0], marketplace: 'claude-hud', plugin: 'claude-hud', version: '0.7.0' },
  { id: canonicalPluginIds[1], marketplace: 'thedotmack', plugin: 'claude-mem', version: '13.14.0' },
  { id: canonicalPluginIds[2], marketplace: 'superpowers-marketplace', plugin: 'superpowers', version: '6.2.0' },
];
const retentionHome = mkdtempSync(join(realpathSync(tmpdir()), 'clawgod-plugin-retention-contract-'));
const retentionOutside = mkdtempSync(join(realpathSync(tmpdir()), 'clawgod-plugin-retention-outside-'));
const retentionPluginRoot = join(retentionHome, '.claude', 'plugins');
const retentionInstalledPath = join(retentionPluginRoot, 'installed_plugins.json');
function writeRetentionFixture() {
  rmSync(retentionPluginRoot, { recursive: true, force: true });
  const plugins = {};
  const knownMarketplaces = {};
  for (const spec of retentionSpecs) {
    const installPath = join(retentionPluginRoot, 'cache', spec.marketplace, spec.plugin, spec.version);
    mkdirSync(installPath, { recursive: true });
    const persistentSource = join(retentionPluginRoot, 'clawgod-marketplaces', spec.marketplace, spec.version);
    mkdirSync(persistentSource, { recursive: true });
    writeFileSync(join(persistentSource, 'source-marker.txt'), `${spec.id}\n`);
    plugins[spec.id] = [{ scope: 'user', version: spec.version, installPath }];
    knownMarketplaces[spec.marketplace] = {
      source: { source: 'directory', path: persistentSource },
      installLocation: persistentSource,
    };
  }
  writeFileSync(retentionInstalledPath, `${JSON.stringify({ version: 2, plugins }, null, 2)}\n`);
  writeFileSync(join(retentionPluginRoot, 'known_marketplaces.json'), `${JSON.stringify(knownMarketplaces, null, 2)}\n`);
}
function mutateRetentionState(mutate) {
  const installed = JSON.parse(readFileSync(retentionInstalledPath, 'utf8'));
  mutate(installed);
  writeFileSync(retentionInstalledPath, `${JSON.stringify(installed, null, 2)}\n`);
}
function assertRetentionRejected(label, expected = /plugin|cache|marketplace|schema|path|version|unsafe|canonical/i) {
  const run = runContract('plugin-retention', { tempHome: retentionHome, expectedCanonicalIds: canonicalPluginIds });
  assert.notEqual(run.status, 0, `${label} must fail retention validation`);
  assert.match(run.stderr, expected, `${label} must explain the retention failure`);
}
try {
  writeRetentionFixture();
  const retained = runContract('plugin-retention', { tempHome: retentionHome, expectedCanonicalIds: canonicalPluginIds });
  assert.equal(retained.status, 0, retained.stderr);
  assert.match(retained.stdout, /^plugin retention: hud=present memory=present superpowers=present$/m);

  const wrongIdState = JSON.parse(String(await Bun.file(retentionInstalledPath).text()));
  wrongIdState.plugins['claude-hud@wrong-marketplace'] = wrongIdState.plugins[canonicalPluginIds[0]];
  delete wrongIdState.plugins[canonicalPluginIds[0]];
  writeFileSync(retentionInstalledPath, `${JSON.stringify(wrongIdState, null, 2)}\n`);
  const wrongId = runContract('plugin-retention', { tempHome: retentionHome, expectedCanonicalIds: canonicalPluginIds });
  assert.notEqual(wrongId.status, 0, 'a wrong canonical plugin ID must fail retention validation');
  assert.match(wrongId.stderr, /plugin|canonical|ID|claude-hud/i);

  writeRetentionFixture();
  rmSync(join(retentionPluginRoot, 'cache', 'thedotmack', 'claude-mem', '13.14.0'), { recursive: true });
  const missingCache = runContract('plugin-retention', { tempHome: retentionHome, expectedCanonicalIds: canonicalPluginIds });
  assert.notEqual(missingCache.status, 0, 'a removed plugin cache must fail retention validation');
  assert.match(missingCache.stderr, /cache|claude-mem|plugin/i);

  writeRetentionFixture();
  const knownAfterRemoval = JSON.parse(readFileSync(join(retentionPluginRoot, 'known_marketplaces.json'), 'utf8'));
  delete knownAfterRemoval['superpowers-marketplace'];
  writeFileSync(join(retentionPluginRoot, 'known_marketplaces.json'), `${JSON.stringify(knownAfterRemoval, null, 2)}\n`);
  const missingMarketplace = runContract('plugin-retention', { tempHome: retentionHome, expectedCanonicalIds: canonicalPluginIds });
  assert.notEqual(missingMarketplace.status, 0, 'a removed marketplace registration must fail retention validation');
  assert.match(missingMarketplace.stderr, /marketplace|superpowers|plugin/i);

  writeRetentionFixture();
  rmSync(join(retentionPluginRoot, 'clawgod-marketplaces', 'superpowers-marketplace', '6.2.0'), { recursive: true });
  const missingPersistentSource = runContract('plugin-retention', { tempHome: retentionHome, expectedCanonicalIds: canonicalPluginIds });
  assert.notEqual(missingPersistentSource.status, 0, 'a removed persistent marketplace source must fail retention validation');
  assert.match(missingPersistentSource.stderr, /persistent source|superpowers|plugin/i);

  writeRetentionFixture();
  mutateRetentionState(installed => { installed.version = '2'; });
  assertRetentionRejected('a string schema');

  writeRetentionFixture();
  mutateRetentionState(installed => {
    installed.plugins[canonicalPluginIds[0]][0].installPath = join(retentionPluginRoot, 'cache', 'claude-hud', 'claude-hud');
  });
  assertRetentionRejected('the canonical cache root itself as installPath');

  writeRetentionFixture();
  mutateRetentionState(installed => { installed.plugins[canonicalPluginIds[0]][0].version = '0.8.0-rc.1'; });
  assertRetentionRejected('a version/path mismatch');

  writeRetentionFixture();
  const fourPartPath = join(retentionPluginRoot, 'cache', 'claude-hud', 'claude-hud', '0.7.0.1');
  mkdirSync(fourPartPath, { recursive: true });
  mutateRetentionState(installed => {
    installed.plugins[canonicalPluginIds[0]][0].version = '0.7.0.1';
    installed.plugins[canonicalPluginIds[0]][0].installPath = fourPartPath;
  });
  assertRetentionRejected('a four-part plugin version');

  writeRetentionFixture();
  const prereleasePath = join(retentionPluginRoot, 'cache', 'claude-hud', 'claude-hud', '0.8.0-rc.1');
  mkdirSync(prereleasePath, { recursive: true });
  mutateRetentionState(installed => {
    installed.plugins[canonicalPluginIds[0]][0].version = '0.8.0-rc.1';
    installed.plugins[canonicalPluginIds[0]][0].installPath = prereleasePath;
  });
  const higherPrerelease = runContract('plugin-retention', { tempHome: retentionHome, expectedCanonicalIds: canonicalPluginIds });
  assert.equal(higherPrerelease.status, 0, higherPrerelease.stderr);
  const prereleaseSelection = runContract('plugin-selection', { tempHome: retentionHome, expectedCanonicalIds: canonicalPluginIds });
  assert.equal(prereleaseSelection.status, 0, prereleaseSelection.stderr);
  assert.equal(JSON.parse(prereleaseSelection.stdout).hud.version, '0.8.0-rc.1', 'shared selection must return the legal higher prerelease');

  writeRetentionFixture();
  const pluginRootTarget = join(retentionOutside, 'plugins-root-target');
  rmSync(pluginRootTarget, { recursive: true, force: true });
  renameSync(retentionPluginRoot, pluginRootTarget);
  symlinkSync(pluginRootTarget, retentionPluginRoot, process.platform === 'win32' ? 'junction' : 'dir');
  assertRetentionRejected('a symlinked plugin root');

  writeRetentionFixture();
  const cacheTarget = join(retentionOutside, 'cache-ancestor-target');
  rmSync(cacheTarget, { recursive: true, force: true });
  renameSync(join(retentionPluginRoot, 'cache'), cacheTarget);
  symlinkSync(cacheTarget, join(retentionPluginRoot, 'cache'), process.platform === 'win32' ? 'junction' : 'dir');
  assertRetentionRejected('a symlinked cache ancestor');

  writeRetentionFixture();
  const installLeaf = join(retentionPluginRoot, 'cache', 'claude-hud', 'claude-hud', '0.7.0');
  const installLeafTarget = join(retentionOutside, 'install-leaf-target');
  rmSync(installLeafTarget, { recursive: true, force: true });
  renameSync(installLeaf, installLeafTarget);
  symlinkSync(installLeafTarget, installLeaf, process.platform === 'win32' ? 'junction' : 'dir');
  assertRetentionRejected('a symlinked installPath leaf');

  writeRetentionFixture();
  const hardlinkPath = join(retentionOutside, 'installed_plugins-hardlink.json');
  rmSync(hardlinkPath, { force: true });
  linkSync(retentionInstalledPath, hardlinkPath);
  assertRetentionRejected('a hardlinked installed plugin state');

  writeRetentionFixture();
  const outsideInstall = join(retentionOutside, 'outside-install');
  mkdirSync(outsideInstall, { recursive: true });
  mutateRetentionState(installed => { installed.plugins[canonicalPluginIds[0]][0].installPath = outsideInstall; });
  assertRetentionRejected('an external temporary install path');
} finally {
  rmSync(retentionHome, { recursive: true, force: true });
  rmSync(retentionOutside, { recursive: true, force: true });
}

const claudeMemPrefix = 'export PATH="$($SHELL -lc \'echo $PATH\' 2>/dev/null):$PATH"; _P="${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-}}"; ';
const managedClaudeMemHooks = {
  description: 'Claude-mem memory system hooks',
  hooks: {
    Setup: [{ matcher: '*', hooks: [{ type: 'command', shell: 'bash', command: `${claudeMemPrefix}'${contractBunPath}' "$_P/scripts/version-check.js"` }] }],
    SessionStart: [{ hooks: [{ type: 'command', shell: 'bash', command: `${claudeMemPrefix}'${contractBunPath}' "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" start` }] }],
    PostToolUse: [{ hooks: [{ type: 'command', shell: 'bash', command: `${claudeMemPrefix}'${contractBunPath}' "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" hook claude-code observation` }] }],
  },
};
const managedClaudeMemMcp = {
  mcpServers: {
    'mcp-search': { type: 'stdio', command: contractBunPath, args: ['-e', 'process.stdout.write(process.execPath)'] },
  },
};
const claudeMemEntrypoints = runContract('claude-mem-entrypoints', {
  hooksJson: managedClaudeMemHooks,
  mcpJson: managedClaudeMemMcp,
  bunPath: contractBunPath,
});
assert.equal(claudeMemEntrypoints.status, 0, claudeMemEntrypoints.stderr);
assert.match(claudeMemEntrypoints.stdout, /^claude-mem entrypoints: hooks=bun mcp=bun$/m);

const claudeMemConsumerRoot = mkdtempSync(join(realpathSync(tmpdir()), 'clawgod-claude-mem-consumer-contract-'));
try {
  const consumerBin = join(claudeMemConsumerRoot, 'bin');
  const consumerBun = join(consumerBin, 'bun');
  const nodeMarker = join(claudeMemConsumerRoot, 'node-shim-used');
  const pluginRoot = join(claudeMemConsumerRoot, 'plugin');
  const versionCheck = join(pluginRoot, 'scripts', 'version-check.js');
  mkdirSync(consumerBin);
  mkdirSync(join(pluginRoot, 'scripts'), { recursive: true });
  symlinkSync(process.execPath, consumerBun);
  writeFileSync(join(consumerBin, 'node'), `#!/bin/sh\nprintf used > '${nodeMarker}'\nexit 97\n`);
  chmodSync(join(consumerBin, 'node'), 0o700);
  writeFileSync(versionCheck, `process.stdout.write('hook:' + process.execPath + '\\n');\n`);
  const hookCommand = `_P='${pluginRoot}'; '${consumerBun}' "$_P/scripts/version-check.js"`;
  const mcpProgram = `process.stdout.write('mcp:' + process.execPath + '\\n')`;
  const consumer = runContract('claude-mem-consumer', {
    hookCommand,
    mcpServer: { type: 'stdio', command: consumerBun, args: ['-e', mcpProgram] },
    shell: '/bin/sh',
    cwd: claudeMemConsumerRoot,
    env: { HOME: claudeMemConsumerRoot, PATH: `${consumerBin}:/usr/bin:/bin` },
    timeoutMs: 5_000,
    expectedHookStatus: 0,
    expectedHookStdoutBase64: Buffer.from(`hook:${realpathSync(consumerBun)}\n`).toString('base64'),
    expectedHookStderrBase64: '',
    expectedMcpStatus: 0,
    expectedMcpStdoutBase64: Buffer.from(`mcp:${realpathSync(consumerBun)}\n`).toString('base64'),
    expectedMcpStderrBase64: '',
  });
  assert.equal(consumer.status, 0, consumer.stderr);
  assert.match(consumer.stdout, /^claude-mem consumer: hook=bun mcp=bun node-shim=unused$/m);
  assert.equal(existsSync(nodeMarker), false, 'the claude-mem consumers must not invoke the Node shim');
} finally {
  rmSync(claudeMemConsumerRoot, { recursive: true, force: true });
}

for (const [label, mutate] of [
  ['partial Hook rewrite', ({ hooksJson }) => { hooksJson.hooks.PostToolUse[0].hooks[0].command = `${claudeMemPrefix}node "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" hook claude-code observation`; }],
  ['missing required Hook rewrite', ({ hooksJson }) => { delete hooksJson.hooks.SessionStart; delete hooksJson.hooks.PostToolUse; }],
  ['Node MCP command', ({ mcpJson }) => { mcpJson.mcpServers['mcp-search'].command = 'node'; }],
  ['wrong Bun path', ({ mcpJson }) => { mcpJson.mcpServers['mcp-search'].command = '/tmp/other/bin/bun'; }],
  ['empty MCP program', ({ mcpJson }) => { mcpJson.mcpServers['mcp-search'].args = ['-e', '']; }],
  ['extra MCP argument', ({ mcpJson }) => { mcpJson.mcpServers['mcp-search'].args.push('--unexpected'); }],
  ['wrong MCP eval flag', ({ mcpJson }) => { mcpJson.mcpServers['mcp-search'].args[0] = '--eval'; }],
]) {
  const fixture = { hooksJson: structuredClone(managedClaudeMemHooks), mcpJson: structuredClone(managedClaudeMemMcp), bunPath: contractBunPath };
  mutate(fixture);
  const run = runContract('claude-mem-entrypoints', fixture);
  assert.notEqual(run.status, 0, `${label} must fail claude-mem entrypoint validation`);
  assert.match(run.stderr, /claude-mem|Hook|MCP|Bun|entrypoint/i, `${label} must explain the claude-mem validation failure`);
}

for (const output of [
  'ripgrep 15.2.0\n',
  'ripgrep 15.2.0 (rev e89fff89ac)\n',
  'ripgrep 15.2.0 (rev E89FFF89AC)\r\nfeatures:+pcre2\r\n',
]) {
  const run = runContract('ripgrep-version', output);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^private ripgrep version: 15\.2\.0$/m);
}
for (const output of [
  'ripgrep 15.2.00\n',
  'ripgrep 15.2.1\n',
  'prefix ripgrep 15.2.0\n',
  'ripgrep 15.2.0suffix\n',
  'ripgrep 15.2.0 (rev not-hex)\n',
]) {
  const run = runContract('ripgrep-version', output);
  assert.notEqual(run.status, 0, `invalid ripgrep output must fail: ${JSON.stringify(output)}`);
  assert.match(run.stderr, /ripgrep|version/i);
}

const isolationRoot = mkdtempSync(join(realpathSync(tmpdir()), 'clawgod-e2e-path-contract-'));
try {
  const isolationHome = join(isolationRoot, 'home');
  const hostBunDir = join(isolationRoot, 'host-bun');
  const hostBun = join(hostBunDir, 'bun');
  mkdirSync(isolationHome);
  mkdirSync(hostBunDir);
  symlinkSync(process.execPath, hostBun);
  const hostClaude = join(hostBunDir, 'claude');
  writeFileSync(hostClaude, '#!/bin/sh\nexit 97\n', 'utf8');
  chmodSync(hostClaude, 0o700);
  const run = runContract('environment-isolation', {
    fixtureRoot: isolationRoot,
    tempHome: isolationHome,
    bunExecutable: hostBun,
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^environment isolation: bun=sandboxed claude=(?:unresolved|sandboxed)$/m);
} finally {
  rmSync(isolationRoot, { recursive: true, force: true });
}

const cleanSummary = runContract('patch-summary', {
  label: 'initial',
  output: 'patch start\n  Result: 42 applied, 7 skipped, 0 failed\npatch complete\n',
});
assert.equal(cleanSummary.status, 0, cleanSummary.stderr);
assert.match(cleanSummary.stdout, /^patch summary initial: 42 applied, 7 skipped, 0 failed$/m);

const whitespaceSummary = runContract('patch-summary', {
  label: 'initial',
  output: '\t Result: 42 applied, 7 skipped, 0 failed \t\n',
});
assert.equal(whitespaceSummary.status, 0, whitespaceSummary.stderr);
assert.match(whitespaceSummary.stdout, /^patch summary initial: 42 applied, 7 skipped, 0 failed$/m);

for (const [label, output] of [
  ['missing summary', 'patch complete without a summary\n'],
  ['failed summary', '  Result: 41 applied, 7 skipped, 1 failed\n'],
  ['ambiguous summaries', '  Result: 42 applied, 7 skipped, 0 failed\n  Result: 42 applied, 7 skipped, 0 failed\n'],
  ['clean plus malformed summary', '  Result: 42 applied, 7 skipped, 0 failed\n  Result: patcher aborted\n'],
  ['malformed summary only', '  Result: 42 applied, 7 skipped, zero failed\n'],
  ['prefixed summary', 'patcher Result: 42 applied, 7 skipped, 0 failed\n'],
  ['summary with trailing token', '  Result: 42 applied, 7 skipped, 0 failed unexpectedly\n'],
]) {
  const run = runContract('patch-summary', { label: 'no-upgrade', output });
  assert.notEqual(run.status, 0, `${label} must fail the E2E patch gate`);
  assert.match(run.stderr, /Result line|patch summary|failed/i, `${label} must explain the patch gate failure`);
}

const equalVersion = runContract('version-equality', {
  wrapperOutput: '2.1.220 (Claude Code)\n',
  sourceVersion: ' \n2.1.220\t',
});
assert.equal(equalVersion.status, 0, equalVersion.stderr);
assert.match(equalVersion.stdout, /^version equality: wrapper=2\.1\.220 source=2\.1\.220$/m);

for (const fixture of [
  { wrapperOutput: '2.1.219 (Claude Code)\n', sourceVersion: '2.1.220' },
  { wrapperOutput: 'Claude Code version unknown\n', sourceVersion: '2.1.220' },
  { wrapperOutput: '2.1.220 and 9.9.9\n', sourceVersion: '2.1.220' },
  { wrapperOutput: '2.1.220 2.1.220\n', sourceVersion: '2.1.220' },
  { wrapperOutput: '2.1.220.9\n', sourceVersion: '2.1.220' },
  { wrapperOutput: '2.1.220-beta.1\n', sourceVersion: '2.1.220' },
  { wrapperOutput: '2.1.220-beta.1\n', sourceVersion: '2.1.220-beta.1' },
  { wrapperOutput: '2.1.220\n', sourceVersion: '2.1.220.9' },
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
