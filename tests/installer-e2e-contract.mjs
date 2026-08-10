#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

const pluginSummary = runContract('plugin-summary', [
  'claude-hud@claude-hud: ready - installed 0.7.0',
  'claude-mem@thedotmack: ready - installed 13.14.0',
  'superpowers@superpowers-marketplace: ready - installed 6.2.0',
  'Optional plugins: 3 ready, 0 warnings',
  '',
].join('\n'));
assert.equal(pluginSummary.status, 0, pluginSummary.stderr);
assert.match(pluginSummary.stdout, /^plugin summary: ready=3 warnings=0$/m);

for (const [label, output] of [
  ['missing summary', 'all plugin detail lines only\n'],
  ['duplicate summary', 'Optional plugins: 3 ready, 0 warnings\nOptional plugins: 3 ready, 0 warnings\n'],
  ['two ready', 'Optional plugins: 2 ready, 0 warnings\n'],
  ['warning summary', 'Optional plugins: 2 ready, 1 warning\n'],
]) {
  const run = runContract('plugin-summary', output);
  assert.notEqual(run.status, 0, `${label} must fail plugin summary validation`);
  assert.match(run.stderr, /plugin|summary|ready|warning/i, `${label} must explain the plugin summary failure`);
}

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
const retentionPluginRoot = join(retentionHome, '.claude', 'plugins');
const retentionInstalledPath = join(retentionPluginRoot, 'installed_plugins.json');
function writeRetentionFixture() {
  const plugins = {};
  for (const spec of retentionSpecs) {
    const installPath = join(retentionPluginRoot, 'cache', spec.marketplace, spec.plugin, spec.version);
    mkdirSync(installPath, { recursive: true });
    mkdirSync(join(retentionPluginRoot, 'marketplaces', spec.marketplace), { recursive: true });
    mkdirSync(join(retentionPluginRoot, 'clawgod-marketplaces', spec.marketplace, spec.version), { recursive: true });
    plugins[spec.id] = [{ scope: 'user', version: spec.version, installPath }];
  }
  writeFileSync(retentionInstalledPath, `${JSON.stringify({ version: 2, plugins }, null, 2)}\n`);
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
  rmSync(join(retentionPluginRoot, 'marketplaces', 'superpowers-marketplace'), { recursive: true });
  const missingMarketplace = runContract('plugin-retention', { tempHome: retentionHome, expectedCanonicalIds: canonicalPluginIds });
  assert.notEqual(missingMarketplace.status, 0, 'a removed marketplace must fail retention validation');
  assert.match(missingMarketplace.stderr, /marketplace|superpowers|plugin/i);
} finally {
  rmSync(retentionHome, { recursive: true, force: true });
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

for (const [label, mutate] of [
  ['partial Hook rewrite', ({ hooksJson }) => { hooksJson.hooks.PostToolUse[0].hooks[0].command = `${claudeMemPrefix}node "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" hook claude-code observation`; }],
  ['missing required Hook rewrite', ({ hooksJson }) => { delete hooksJson.hooks.SessionStart; delete hooksJson.hooks.PostToolUse; }],
  ['Node MCP command', ({ mcpJson }) => { mcpJson.mcpServers['mcp-search'].command = 'node'; }],
  ['wrong Bun path', ({ mcpJson }) => { mcpJson.mcpServers['mcp-search'].command = '/tmp/other/bin/bun'; }],
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
