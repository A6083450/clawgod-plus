#!/usr/bin/env bun
import assert from 'node:assert/strict';
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const forbiddenText = 'forbidden dependency invoked:';

// Stable enhancement manifest (order matters; must match src/generic/enhancements.json).
const ENHANCEMENT_IDS = Object.freeze([
  'chrome', 'computer-use', 'agents', 'planning', 'voice', 'auto-mode',
  'unrestricted-tools', 'paste-images', 'privacy', 'branding',
  'claude-hud', 'claude-mem', 'superpowers',
]);
const PLUGIN_ENHANCEMENT_IDS = Object.freeze(['claude-hud', 'claude-mem', 'superpowers']);
// '' = default all-enabled, 'none' = core-only, otherwise a CSV subset.
const e2eEnhancements = process.env.CLAWGOD_E2E_ENHANCEMENTS ?? '';

function requestedEnhancementIds() {
  if (e2eEnhancements === '' || e2eEnhancements === 'none') return [];
  return ENHANCEMENT_IDS.filter(id => e2eEnhancements.split(',').includes(id));
}

function pluginSummaryExpectation() {
  const enabled = e2eEnhancements === '' ? PLUGIN_ENHANCEMENT_IDS : requestedEnhancementIds().filter(id => PLUGIN_ENHANCEMENT_IDS.includes(id));
  return { ready: enabled.length, disabled: PLUGIN_ENHANCEMENT_IDS.length - enabled.length, warnings: 0 };
}

function enhancementConfigExpectation() {
  if (e2eEnhancements === '') return { mode: 'all', enabled: [] };
  return { mode: 'custom', enabled: requestedEnhancementIds() };
}

function enhancementSummaryExpectation() {
  return { enabled: e2eEnhancements === '' ? ENHANCEMENT_IDS.length : requestedEnhancementIds().length };
}

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

function validatePluginSummary(output, expected = pluginSummaryExpectation()) {
  const summaryLines = output.split(/\r?\n/).filter(line => line.includes('Optional plugins:'));
  assert.equal(summaryLines.length, 1, `expected exactly one optional plugin summary, found ${summaryLines.length}`);
  const match = /^Optional plugins: (\d+) ready, (\d+) disabled, (\d+) warnings?$/.exec(summaryLines[0].trim());
  assert.notEqual(match, null, 'optional plugin summary must use the canonical ready/disabled/warning format');
  const result = { ready: Number(match[1]), disabled: Number(match[2]), warnings: Number(match[3]) };
  assert.deepEqual(result, expected, 'optional plugin summary counts must match the enhancement selection');
  return result;
}

function validateEnhancementSummary(output) {
  const lines = output.split(/\r?\n/).filter(line => line.includes('Enhancements:'));
  assert.equal(lines.length, 1, `expected exactly one enhancements summary line, found ${lines.length}`);
  const match = /Enhancements: (\d+) enabled, (\d+) disabled/.exec(lines[0].trim());
  assert.notEqual(match, null, 'enhancements summary must use the canonical enabled/disabled format');
  const expected = enhancementSummaryExpectation();
  assert.equal(Number(match[1]), expected.enabled, 'enhancements enabled count must match the selection');
  assert.equal(Number(match[2]), ENHANCEMENT_IDS.length - expected.enabled, 'enhancements disabled count must be the complement');
  return `enhancements summary: ${match[1]} enabled, ${match[2]} disabled`;
}

function validateEnhancementConfigBytes(source, expected) {
  let config;
  try {
    config = JSON.parse(source);
  } catch {
    assert.fail('enhancement config must be valid JSON');
  }
  assert.equal(config !== null && typeof config === 'object' && !Array.isArray(config), true, 'enhancement config must be an object');
  assert.deepEqual(Object.keys(config).sort(), ['enabled', 'mode', 'schemaVersion'].sort(), 'enhancement config must contain exactly schemaVersion, mode, and enabled');
  assert.equal(config.schemaVersion, 1, 'enhancement config must use schemaVersion 1');
  assert.equal(config.mode, expected.mode, `enhancement config mode must be ${expected.mode}`);
  assert.deepEqual(config.enabled, expected.enabled, 'enhancement config enabled list must match the selection');
  return config;
}

function assertNoPrompt(output) {
  assert.doesNotMatch(output, /Choice:/, 'installer output must not emit an interactive selection prompt');
  return 'no prompt: selection resolved without interaction';
}

function quoteStatusLineContractPath(path) {
  assert.equal(typeof path, 'string', 'HUD statusLine paths must be strings');
  if (/^(?:[A-Za-z]:[\\/]|\\\\)/.test(path)) {
    assert.doesNotMatch(path, /["%!&|<>()^\r\n]/, 'HUD statusLine Windows paths must not contain cmd metacharacters');
    return `"${path}"`;
  }
  assert.equal(isAbsolute(path), true, 'HUD statusLine paths must be absolute');
  assert.doesNotMatch(path, /\0|\$\(|`|\*/, 'HUD statusLine paths must not contain shell expansion tokens');
  return `'${path.replaceAll("'", `'"'"'`)}'`;
}

function validateHudStatusLine(settings, bunPath, managedModulePath) {
  assert.equal(settings !== null && typeof settings === 'object' && !Array.isArray(settings), true, 'HUD settings must be an object');
  const executable = String(bunPath).replaceAll('\\', '/').split('/').at(-1)?.toLowerCase();
  assert.ok(executable === 'bun' || executable === 'bun.exe', 'HUD statusLine executable must be Bun');
  assert.deepEqual(
    settings.statusLine,
    {
      type: 'command',
      command: `${quoteStatusLineContractPath(bunPath)} ${quoteStatusLineContractPath(managedModulePath)}`,
    },
    'HUD statusLine must exactly invoke the managed module with Bun',
  );
  return 'HUD statusline: bun-only current-style=exact';
}

function executePersistedHudCommand({ settings, shell, cwd, env, inputBase64, expectedBase64, timeoutMs }) {
  assert.equal(settings?.statusLine?.type, 'command', 'HUD consumer requires a persisted command statusLine');
  assert.equal(typeof settings.statusLine.command, 'string', 'HUD consumer requires the persisted statusLine.command string');
  assert.equal(isAbsolute(shell), true, 'HUD consumer shell must be an absolute command host');
  assert.equal(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30_000, true, 'HUD consumer timeout must be bounded');
  const result = spawnSync(shell, ['-c', settings.statusLine.command], {
    cwd,
    env,
    input: Buffer.from(inputBase64, 'base64'),
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, `persisted HUD consumer must complete before timeout: ${result.error?.message ?? ''}`);
  assert.equal(result.status, 0, `persisted HUD consumer exited ${result.status}: ${Buffer.from(result.stderr ?? '').toString('utf8')}`);
  assert.deepEqual(Buffer.from(result.stdout ?? ''), Buffer.from(expectedBase64, 'base64'), 'persisted HUD consumer stdout must match raw ANSI bytes exactly');
  return 'HUD consumer: persisted-command raw-bytes=exact';
}

const canonicalPluginRetentionSpecs = [
  { key: 'hud', id: 'claude-hud@claude-hud', marketplace: 'claude-hud', plugin: 'claude-hud', version: '0.7.0' },
  { key: 'memory', id: 'claude-mem@thedotmack', marketplace: 'thedotmack', plugin: 'claude-mem', version: '13.14.0' },
  { key: 'superpowers', id: 'superpowers@superpowers-marketplace', marketplace: 'superpowers-marketplace', plugin: 'superpowers', version: '6.2.0' },
];

const strictSemverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function parseStrictSemver(value) {
  if (typeof value !== 'string') return null;
  const match = strictSemverPattern.exec(value);
  if (!match) return null;
  const [major, minor, patch, prereleaseText] = match.slice(1);
  const prerelease = prereleaseText ? prereleaseText.split('.').map(identifier => {
    if (!/^\d+$/.test(identifier)) return identifier;
    if (!/^(0|[1-9]\d*)$/.test(identifier)) return null;
    const numeric = Number(identifier);
    return Number.isSafeInteger(numeric) ? numeric : null;
  }) : [];
  if (prerelease.includes(null)) return null;
  const core = [major, minor, patch].map(Number);
  if (!core.every(Number.isSafeInteger)) return null;
  return { major: core[0], minor: core[1], patch: core[2], prerelease };
}

function compareStrictSemver(left, right) {
  const leftVersion = parseStrictSemver(left);
  const rightVersion = parseStrictSemver(right);
  if (!leftVersion || !rightVersion) return null;
  for (const key of ['major', 'minor', 'patch']) {
    if (leftVersion[key] !== rightVersion[key]) return leftVersion[key] < rightVersion[key] ? -1 : 1;
  }
  if (leftVersion.prerelease.length === 0 || rightVersion.prerelease.length === 0) {
    if (leftVersion.prerelease.length === rightVersion.prerelease.length) return 0;
    return leftVersion.prerelease.length === 0 ? 1 : -1;
  }
  const length = Math.min(leftVersion.prerelease.length, rightVersion.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = leftVersion.prerelease[index];
    const rightIdentifier = rightVersion.prerelease[index];
    if (leftIdentifier === rightIdentifier) continue;
    if (typeof leftIdentifier === 'number' && typeof rightIdentifier === 'number') return leftIdentifier < rightIdentifier ? -1 : 1;
    if (typeof leftIdentifier === 'number') return -1;
    if (typeof rightIdentifier === 'number') return 1;
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }
  if (leftVersion.prerelease.length === rightVersion.prerelease.length) return 0;
  return leftVersion.prerelease.length < rightVersion.prerelease.length ? -1 : 1;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode && left.nlink === right.nlink;
}

function assertTrustedDirectoryPath(tempHome, target, label) {
  const anchor = resolve(tempHome);
  const anchorStatus = lstatSync(anchor);
  assert.equal(anchorStatus.isDirectory() && !anchorStatus.isSymbolicLink(), true, `${label}: temporary HOME must be a real directory, not a symlink or reparse point`);
  assert.equal(realpathSync(anchor), anchor, `${label}: temporary HOME must be a real directory, not a symlink or reparse point`);
  const offset = relative(anchor, resolve(target));
  assert.ok(offset === '' || (!offset.startsWith(`..${sep}`) && offset !== '..' && !isAbsolute(offset)), `${label}: path must remain inside temporary HOME`);
  const snapshots = [[anchor, anchorStatus]];
  let current = anchor;
  for (const component of offset === '' ? [] : offset.split(sep)) {
    current = join(current, component);
    const status = lstatSync(current);
    assert.equal(status.isDirectory() && !status.isSymbolicLink(), true, `${label}: directory path contains a symlink, reparse point, or non-directory`);
    assert.equal(realpathSync(current), current, `${label}: directory path escapes its canonical location`);
    snapshots.push([current, status]);
  }
  for (const [path, before] of snapshots) {
    assert.equal(sameFileIdentity(before, lstatSync(path)), true, `${label}: directory identity changed during validation`);
  }
  return resolve(target);
}

function readTrustedJson(tempHome, path, label) {
  assertTrustedDirectoryPath(tempHome, dirname(path), `${label} parent`);
  const before = lstatSync(path);
  assert.equal(before.isFile() && !before.isSymbolicLink() && before.nlink === 1, true, `${label}: file must be regular, single-link, and not a symlink`);
  const descriptor = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(descriptor);
    assert.equal(sameFileIdentity(before, opened), true, `${label}: file identity changed before reading`);
    const value = JSON.parse(readFileSync(descriptor, 'utf8'));
    assert.equal(sameFileIdentity(opened, fstatSync(descriptor)), true, `${label}: file identity changed while reading`);
    assert.equal(sameFileIdentity(opened, lstatSync(path)), true, `${label}: path identity changed while reading`);
    return value;
  } finally {
    closeSync(descriptor);
  }
}

function selectCanonicalPluginRecord(installed, spec) {
  const records = installed.plugins[spec.id];
  assert.equal(Array.isArray(records), true, `retained plugin record is missing for ${spec.id}`);
  const userRecords = records.filter(record => record?.scope === 'user');
  assert.ok(userRecords.length > 0, `retained user plugin record is missing for ${spec.id}`);
  for (const record of userRecords) {
    assert.equal(typeof record.installPath, 'string', `retained installPath must be a string for ${spec.id}`);
    assert.notEqual(parseStrictSemver(record.version), null, `retained plugin version must be strict SemVer for ${spec.id}`);
  }
  return userRecords.sort((left, right) => compareStrictSemver(right.version, left.version))[0];
}

function validatePluginRetention(tempHome, expectedCanonicalIds, returnSelection = false) {
  assert.deepEqual(
    [...expectedCanonicalIds].sort(),
    canonicalPluginRetentionSpecs.map(spec => spec.id).sort(),
    'plugin retention must use the three canonical plugin IDs',
  );
  const pluginRoot = join(resolve(tempHome), '.claude', 'plugins');
  assertTrustedDirectoryPath(tempHome, pluginRoot, 'canonical plugin root');
  const installed = readTrustedJson(tempHome, join(pluginRoot, 'installed_plugins.json'), 'installed plugin state');
  assert.equal(installed !== null && typeof installed === 'object' && !Array.isArray(installed), true, 'installed plugin state must be an object');
  assert.equal(Number.isSafeInteger(installed.version) && installed.version === 2, true, 'installed plugin state must use numeric schema version 2');
  assert.equal(installed.plugins !== null && typeof installed.plugins === 'object' && !Array.isArray(installed.plugins), true, 'installed plugin state must contain a plugins object');
  const known = readTrustedJson(tempHome, join(pluginRoot, 'known_marketplaces.json'), 'known marketplace state');
  assert.equal(known !== null && typeof known === 'object' && !Array.isArray(known), true, 'known marketplace state must be an object');
  const selected = {};
  for (const spec of canonicalPluginRetentionSpecs) {
    const record = selectCanonicalPluginRecord(installed, spec);
    assert.ok(compareStrictSemver(record.version, spec.version) >= 0, `${spec.id} must be at its baseline or a preserved newer version`);
    const expectedInstallPath = join(pluginRoot, 'cache', spec.marketplace, spec.plugin, record.version);
    assert.equal(resolve(record.installPath), expectedInstallPath, `retained plugin installPath is not canonical for ${spec.id}`);
    assertTrustedDirectoryPath(tempHome, expectedInstallPath, `retained plugin cache for ${spec.id}`);
    const persistentSource = join(pluginRoot, 'clawgod-marketplaces', spec.marketplace, spec.version);
    assertTrustedDirectoryPath(tempHome, persistentSource, `retained persistent source for ${spec.id}`);
    assert.ok(readdirSync(persistentSource).length > 0, `retained persistent marketplace has no source for ${spec.id}`);
    const marketplace = known[spec.marketplace];
    assert.equal(marketplace !== null && typeof marketplace === 'object' && !Array.isArray(marketplace), true, `retained marketplace is missing for ${spec.id}`);
    assert.equal(typeof marketplace.installLocation, 'string', `retained marketplace must record an installLocation for ${spec.id}`);
    assert.equal(resolve(marketplace.installLocation), resolve(persistentSource), `retained marketplace must reference the canonical persistent source for ${spec.id}`);
    selected[spec.key] = record;
  }
  return returnSelection ? selected : 'plugin retention: hud=present memory=present superpowers=present';
}

function validateClaudeMemEntrypoints(hooksJson, mcpJson, bunPath) {
  const executable = String(bunPath).replaceAll('\\', '/').split('/').at(-1)?.toLowerCase();
  assert.ok(executable === 'bun' || executable === 'bun.exe', 'claude-mem entrypoint executable must be Bun');
  const quotedBun = `'${String(bunPath).replaceAll("'", `'"'"'`)}'`;
  assert.equal(hooksJson?.hooks !== null && typeof hooksJson?.hooks === 'object' && !Array.isArray(hooksJson?.hooks), true, 'claude-mem Hook JSON must contain a hooks object');
  const counts = { versionCheck: 0, bunRunner: 0 };
  for (const groups of Object.values(hooksJson.hooks)) {
    assert.equal(Array.isArray(groups), true, 'claude-mem Hook groups must be arrays');
    for (const group of groups) {
      assert.equal(Array.isArray(group?.hooks), true, 'claude-mem Hook group must contain command hooks');
      for (const hook of group.hooks) {
        assert.equal(hook?.type, 'command', 'claude-mem Hook entrypoints must be commands');
        assert.equal(typeof hook.command, 'string', 'claude-mem Hook command must be a string');
        assert.doesNotMatch(hook.command, /(?:^|[;&|]\s*)node\s+(?=["']?\$_P\/scripts\/)/, 'claude-mem Hook entrypoints must not retain Node');
        if (hook.command.includes('$_P/scripts/version-check.js')) {
          assert.ok(hook.command.includes(`${quotedBun} "$_P/scripts/version-check.js"`), 'claude-mem version-check Hook must run with Bun');
          counts.versionCheck += 1;
        }
        if (hook.command.includes('$_P/scripts/bun-runner.js')) {
          assert.ok(hook.command.includes(`${quotedBun} "$_P/scripts/bun-runner.js"`), 'claude-mem bun-runner Hook must run with Bun');
          counts.bunRunner += 1;
        }
      }
    }
  }
  assert.ok(counts.versionCheck > 0 && counts.bunRunner > 0, 'claude-mem Hook entrypoints must include both required Bun rewrites');
  const mcpSearch = mcpJson?.mcpServers?.['mcp-search'];
  assert.equal(mcpSearch?.type, 'stdio', 'claude-mem MCP entrypoint must use stdio');
  assert.equal(mcpSearch?.command, bunPath, 'claude-mem MCP entrypoint must use the selected Bun path');
  assert.equal(Array.isArray(mcpSearch?.args) && mcpSearch.args.length === 2 && mcpSearch.args[0] === '-e'
    && typeof mcpSearch.args[1] === 'string' && mcpSearch.args[1].length > 0, true, 'claude-mem MCP entrypoint arguments must be exactly [-e, program]');
  return 'claude-mem entrypoints: hooks=bun mcp=bun';
}

function executeClaudeMemConsumers(fixture) {
  const {
    hookCommand, mcpServer, shell, hookCwd, mcpCwd, hookEnv, mcpEnv, timeoutMs,
    hookInputBase64 = '', mcpInputBase64 = '',
    expectedHookStatus, expectedHookStdoutBase64, expectedHookStderrBase64,
    expectedMcpStatus, expectedMcpStdoutBase64, expectedMcpStderrBase64,
  } = fixture;
  assert.equal(typeof hookCommand, 'string', 'claude-mem consumer requires a saved Hook command');
  assert.equal(isAbsolute(shell), true, 'claude-mem Hook consumer requires an absolute shell host');
  assert.equal(mcpServer?.type, 'stdio', 'claude-mem MCP consumer requires a stdio server');
  assert.equal(typeof mcpServer.command, 'string', 'claude-mem MCP consumer requires a saved command');
  assert.equal(Array.isArray(mcpServer.args) && mcpServer.args.length === 2
    && mcpServer.args[0] === '-e' && typeof mcpServer.args[1] === 'string' && mcpServer.args[1].length > 0, true,
  'claude-mem MCP consumer requires exact [-e, program] args');
  assert.equal(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30_000, true, 'claude-mem consumer timeout must be bounded');
  const hook = spawnSync(shell, ['-c', hookCommand], {
    cwd: hookCwd ?? fixture.cwd,
    env: hookEnv ?? fixture.env,
    input: Buffer.from(hookInputBase64, 'base64'),
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(hook.error, undefined, `claude-mem Hook consumer must complete before timeout: ${hook.error?.message ?? ''}`);
  assert.equal(hook.status, expectedHookStatus, `claude-mem Hook consumer exited ${hook.status}`);
  assert.deepEqual(Buffer.from(hook.stdout ?? ''), Buffer.from(expectedHookStdoutBase64, 'base64'), 'claude-mem Hook stdout changed');
  assert.deepEqual(Buffer.from(hook.stderr ?? ''), Buffer.from(expectedHookStderrBase64, 'base64'), 'claude-mem Hook stderr changed');
  const mcp = spawnSync(mcpServer.command, mcpServer.args, {
    cwd: mcpCwd ?? fixture.cwd,
    env: mcpEnv ?? fixture.env,
    input: Buffer.from(mcpInputBase64, 'base64'),
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(mcp.error, undefined, `claude-mem MCP consumer must complete before timeout: ${mcp.error?.message ?? ''}`);
  assert.equal(mcp.status, expectedMcpStatus, `claude-mem MCP consumer exited ${mcp.status}`);
  assert.deepEqual(Buffer.from(mcp.stdout ?? ''), Buffer.from(expectedMcpStdoutBase64, 'base64'), 'claude-mem MCP stdout changed');
  assert.deepEqual(Buffer.from(mcp.stderr ?? ''), Buffer.from(expectedMcpStderrBase64, 'base64'), 'claude-mem MCP stderr changed');
  return 'claude-mem consumer: hook=bun mcp=bun node-shim=unused';
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

function validateUninstallCleanup({ managedRoot, settingsPath, expectedSettingsBase64, expectedSettings, externalPaths }) {
  const allowedPersistentEntries = new Set(['provider.json', 'features.json', 'enhancements.json', '.lean-disabled', '.lean-max']);
  const staleManaged = existsSync(managedRoot)
    ? readdirSync(managedRoot).filter(entry => !allowedPersistentEntries.has(entry))
    : [];
  assert.deepEqual(staleManaged, [], `managed runtime artifacts remain: ${staleManaged.join(', ')}`);
  for (const path of externalPaths) {
    assert.equal(existsSync(path), false, `external launcher or backup remains: ${path}`);
  }
  let settingsState;
  if (expectedSettingsBase64 !== undefined) {
    assert.deepEqual(readFileSync(settingsPath), Buffer.from(expectedSettingsBase64, 'base64'), 'uninstall must leave unrelated Claude settings byte-identical');
    settingsState = 'byte-identical';
  } else {
    assert.deepEqual(JSON.parse(readFileSync(settingsPath, 'utf8')), expectedSettings, 'uninstall must restore only the managed Claude settings field');
    settingsState = 'restored';
  }
  return `uninstall cleanup: managed-runtime=absent settings=${settingsState} external-launchers=absent`;
}

if (process.env.CLAWGOD_E2E_CONTRACT) {
  try {
    const input = process.env.CLAWGOD_E2E_CONTRACT_INPUT ?? '';
    let marker;
    if (process.env.CLAWGOD_E2E_CONTRACT === 'plugin-summary') {
      const fixture = JSON.parse(input);
      const result = validatePluginSummary(fixture.output, {
        ready: fixture.ready ?? 3,
        disabled: fixture.disabled ?? 0,
        warnings: fixture.warnings ?? 0,
      });
      marker = `plugin summary: ready=${result.ready} disabled=${result.disabled} warnings=${result.warnings}`;
    } else if (process.env.CLAWGOD_E2E_CONTRACT === 'enhancement-config') {
      const fixture = JSON.parse(input);
      const config = validateEnhancementConfigBytes(fixture.source, { mode: fixture.mode, enabled: fixture.enabled ?? [] });
      marker = `enhancement config: mode=${config.mode} enabled=${config.enabled.length}`;
    } else if (process.env.CLAWGOD_E2E_CONTRACT === 'no-prompt') {
      marker = assertNoPrompt(input);
    } else if (process.env.CLAWGOD_E2E_CONTRACT === 'hud-statusline') {
      const fixture = JSON.parse(input);
      marker = validateHudStatusLine(fixture.settings, fixture.bunPath, fixture.managedModulePath);
    } else if (process.env.CLAWGOD_E2E_CONTRACT === 'hud-consumer') {
      marker = executePersistedHudCommand(JSON.parse(input));
    } else if (process.env.CLAWGOD_E2E_CONTRACT === 'plugin-retention') {
      const fixture = JSON.parse(input);
      marker = validatePluginRetention(fixture.tempHome, fixture.expectedCanonicalIds);
    } else if (process.env.CLAWGOD_E2E_CONTRACT === 'plugin-selection') {
      const fixture = JSON.parse(input);
      marker = JSON.stringify(validatePluginRetention(fixture.tempHome, fixture.expectedCanonicalIds, true));
    } else if (process.env.CLAWGOD_E2E_CONTRACT === 'claude-mem-entrypoints') {
      const fixture = JSON.parse(input);
      marker = validateClaudeMemEntrypoints(fixture.hooksJson, fixture.mcpJson, fixture.bunPath);
    } else if (process.env.CLAWGOD_E2E_CONTRACT === 'claude-mem-consumer') {
      marker = executeClaudeMemConsumers(JSON.parse(input));
    } else if (process.env.CLAWGOD_E2E_CONTRACT === 'patch-summary') {
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
const claudeMemSentinelPath = join(tempHome, '.claude-mem', 'installer-e2e-memory-sentinel.json');
const claudeMemSentinel = Buffer.from('{"retain":"claude-mem user data"}\n', 'utf8');
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

function validateInstalledPluginState(label) {
  const pluginRoot = join(tempHome, '.claude', 'plugins');
  validatePluginRetention(tempHome, canonicalPluginRetentionSpecs.map(spec => spec.id));
  const installed = readTrustedJson(tempHome, join(pluginRoot, 'installed_plugins.json'), `${label} installed plugin state`);
  const settings = readSettings();
  const selected = new Map();
  for (const spec of canonicalPluginRetentionSpecs) {
    const record = selectCanonicalPluginRecord(installed, spec);
    assert.ok(compareStrictSemver(record.version, spec.version) >= 0, `${label}: ${spec.id} must be at baseline ${spec.version} or a preserved newer version`);
    assert.equal(settings.enabledPlugins?.[spec.id], true, `${label}: ${spec.id} must remain enabled`);
    selected.set(spec.key, record);
  }
  return selected;
}

function runHudGoldenFixture(settings) {
  const fixture = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'claude-hud-current-style.json'), 'utf8'));
  const projectDir = join(tempHome, 'my-project');
  const transcriptPath = join(projectDir, 'transcript.jsonl');
  mkdirSync(projectDir, { recursive: true });
  const base = Date.now();
  const transcript = fixture.transcript.map((entry, index) => ({
    ...entry,
    timestamp: new Date(base + index * 400).toISOString(),
  }));
  writeFileSync(transcriptPath, `${transcript.map(entry => JSON.stringify(entry)).join('\n')}\n`, 'utf8');
  const stdin = {
    ...fixture.stdin,
    cwd: projectDir,
    transcript_path: transcriptPath,
    workspace: { ...fixture.stdin.workspace, current_dir: projectDir, project_dir: projectDir },
  };
  // claude-hud probes `git` whenever a cwd is set (its optional git-status
  // feature). The probe is third-party plugin behavior, not a ClawGod runtime
  // dependency, and it degrades gracefully when git fails. Give this consumer
  // a benign failing `git` ahead of the forbidden shim so the probe cannot be
  // mistaken for a Bun-only contract violation; every other forbidden tool
  // remains shimmed for the HUD consumer.
  const benignGitDir = join(tempHome, 'hud-benign-bin');
  mkdirSync(benignGitDir, { recursive: true });
  writeFileSync(join(benignGitDir, 'git'), '#!/bin/sh\nprintf "%s\\n" "fatal: not a git repository" >&2\nexit 128\n', 'utf8');
  chmodSync(join(benignGitDir, 'git'), 0o700);
  const marker = executePersistedHudCommand({
    settings,
    shell: '/bin/sh',
    cwd: projectDir,
    env: { ...isolatedEnv, PATH: `${benignGitDir}:${isolatedEnv.PATH}` },
    inputBase64: Buffer.from(`${JSON.stringify(stdin)}\n`, 'utf8').toString('base64'),
    expectedBase64: Buffer.from(fixture.expectedStdout, 'utf8').toString('base64'),
    timeoutMs: 10_000,
  });
  assertNoForbiddenDependency();
  return marker;
}

function runClaudeMemConsumerSmoke(hooksJson, mcpJson, installPath, bunPath) {
  const hookCommands = [];
  for (const groups of Object.values(hooksJson.hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks) {
        if (hook.command.includes('$_P/scripts/bun-runner.js') && hook.command.includes(' hook claude-code context')) {
          hookCommands.push(hook.command);
        }
      }
    }
  }
  assert.equal(hookCommands.length, 1, 'claude-mem smoke requires exactly one saved context Hook command');
  const smokeRoot = join(tempHome, 'claude-mem-entrypoint-smoke');
  const safePluginRoot = join(smokeRoot, 'plugin');
  const safeScripts = join(safePluginRoot, 'scripts');
  const safeShell = join(smokeRoot, 'isolated-login-shell');
  const emptyMcpHome = join(smokeRoot, 'mcp-home');
  const emptyMcpConfig = join(smokeRoot, 'mcp-config');
  const emptyMcpCwd = join(smokeRoot, 'mcp-cwd');
  mkdirSync(safeScripts, { recursive: true });
  mkdirSync(emptyMcpHome, { recursive: true });
  mkdirSync(emptyMcpConfig, { recursive: true });
  mkdirSync(emptyMcpCwd, { recursive: true });
  writeFileSync(join(safeScripts, 'bun-runner.js'), readFileSync(join(installPath, 'scripts', 'bun-runner.js')));
  writeFileSync(join(safeScripts, 'worker-service.cjs'), `const chunks=[];for await(const chunk of Bun.stdin.stream())chunks.push(chunk);if(chunks.length===0)process.exit(65);process.stdout.write('safe-hook:' + process.execPath + '\\n');\n`);
  writeFileSync(safeShell, '#!/bin/sh\n[ "$1" = "-lc" ] || exit 97\nprintf "%s\\n" "$PATH"\n');
  chmodSync(safeShell, 0o700);
  const expectedHook = Buffer.from(`safe-hook:${realpathSync(bunPath)}\n`, 'utf8');
  const marker = executeClaudeMemConsumers({
    hookCommand: hookCommands[0],
    mcpServer: mcpJson.mcpServers['mcp-search'],
    shell: '/bin/bash',
    hookCwd: smokeRoot,
    mcpCwd: emptyMcpCwd,
    hookEnv: {
      ...isolatedEnv,
      HOME: tempHome,
      PATH: isolatedEnv.PATH,
      SHELL: safeShell,
      CLAUDE_CONFIG_DIR: join(tempHome, '.claude'),
      CLAUDE_PLUGIN_ROOT: safePluginRoot,
      PLUGIN_ROOT: safePluginRoot,
    },
    mcpEnv: {
      ...isolatedEnv,
      HOME: emptyMcpHome,
      PATH: isolatedEnv.PATH,
      CLAUDE_CONFIG_DIR: emptyMcpConfig,
      CLAUDE_PLUGIN_ROOT: join(smokeRoot, 'missing-plugin'),
      PLUGIN_ROOT: join(smokeRoot, 'missing-plugin'),
    },
    hookInputBase64: Buffer.from('{"hook_event_name":"SessionStart"}\n', 'utf8').toString('base64'),
    timeoutMs: 10_000,
    expectedHookStatus: 0,
    expectedHookStdoutBase64: expectedHook.toString('base64'),
    expectedHookStderrBase64: '',
    expectedMcpStatus: 1,
    expectedMcpStdoutBase64: '',
    expectedMcpStderrBase64: Buffer.from('claude-mem: mcp server not found\n', 'utf8').toString('base64'),
  });
  assertNoForbiddenDependency();
  return marker;
}

function selectionArgs() {
  return e2eEnhancements === '' ? [] : ['--enhancements', e2eEnhancements];
}

function assertEnhancementConfig(label) {
  const config = validateEnhancementConfigBytes(
    readFileSync(join(clawgodDir, 'enhancements.json'), 'utf8'),
    enhancementConfigExpectation(),
  );
  return `enhancement config ${label}: mode=${config.mode} enabled=${config.enabled.length}`;
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
  for (const name of ['node', 'npm', 'rg', 'tar', 'unzip', 'git']) {
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
  mkdirSync(dirname(claudeMemSentinelPath), { recursive: true });
  writeFileSync(claudeMemSentinelPath, claudeMemSentinel);

  const fullPluginValidation = e2eEnhancements === '';
  const initialInstallOutput = run('initial --lean-on install', '/bin/bash', [join(root, 'install.sh'), '--lean-on', ...selectionArgs()]);
  console.log(validatePatchSummary('unix initial', initialInstallOutput));
  console.log(validateEnhancementSummary(initialInstallOutput));
  validatePluginSummary(initialInstallOutput);
  console.log(assertNoPrompt(initialInstallOutput));
  assertHarborKitePreserved('initial install');
  assertLeanOn();
  console.log(assertEnhancementConfig('initial'));
  let managedHudModulePath = join(clawgodDir, 'claude-hud-statusline.mjs');
  let initialPlugins;
  if (fullPluginValidation) {
    initialPlugins = validateInstalledPluginState('initial install');
    console.log(validateHudStatusLine(readSettings(), isolatedRuntime.bunPath, managedHudModulePath));
    const memoryRecord = initialPlugins.get('memory');
    const initialMemoryHooks = JSON.parse(readFileSync(join(memoryRecord.installPath, 'hooks', 'hooks.json'), 'utf8'));
    const initialMemoryMcp = JSON.parse(readFileSync(join(memoryRecord.installPath, '.mcp.json'), 'utf8'));
    console.log(validateClaudeMemEntrypoints(initialMemoryHooks, initialMemoryMcp, isolatedRuntime.bunPath));
    console.log(runClaudeMemConsumerSmoke(initialMemoryHooks, initialMemoryMcp, memoryRecord.installPath, isolatedRuntime.bunPath));
    console.log(runHudGoldenFixture(readSettings()));
  }
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
  console.log(validateEnhancementSummary(noUpgradeOutput));
  validatePluginSummary(noUpgradeOutput);
  console.log(assertNoPrompt(noUpgradeOutput));
  assertHarborKitePreserved('no-upgrade install');
  assertLeanOff();
  console.log(assertEnhancementConfig('no-upgrade'));
  if (fullPluginValidation) {
    const noUpgradePlugins = validateInstalledPluginState('no-upgrade install');
    console.log(validateHudStatusLine(readSettings(), isolatedRuntime.bunPath, managedHudModulePath));
    const noUpgradeMemory = noUpgradePlugins.get('memory');
    console.log(validateClaudeMemEntrypoints(
      JSON.parse(readFileSync(join(noUpgradeMemory.installPath, 'hooks', 'hooks.json'), 'utf8')),
      JSON.parse(readFileSync(join(noUpgradeMemory.installPath, '.mcp.json'), 'utf8')),
      isolatedRuntime.bunPath,
    ));
  }

  const expectedSettingsAfterUninstall = structuredClone(readSettings());
  delete expectedSettingsAfterUninstall.statusLine;
  run('uninstall', '/bin/bash', [join(root, 'install.sh'), '--uninstall']);
  console.log(validateUninstallCleanup({
    managedRoot: clawgodDir,
    settingsPath,
    expectedSettings: expectedSettingsAfterUninstall,
    externalPaths: [
      join(tempHome, '.local', 'bin', 'claude'),
      join(tempHome, '.local', 'bin', 'claude.orig'),
      launcherPath,
      join(tempHome, '.claude-mem', 'clawgod-settings-backup.json'),
      join(tempHome, '.claude-mem', 'clawgod-settings-state.json'),
    ],
  }));
  if (fullPluginValidation) {
    console.log(validatePluginRetention(tempHome, canonicalPluginRetentionSpecs.map(spec => spec.id)));
  }
  assert.deepEqual(readFileSync(claudeMemSentinelPath), claudeMemSentinel, 'uninstall must retain claude-mem sentinel data');
  for (const path of [
    join(clawgodDir, 'plugin-dependencies.mjs'),
    join(clawgodDir, 'plugin-dependencies-state.json'),
    join(clawgodDir, 'claude-hud-statusline.mjs'),
    join(clawgodDir, 'cache', 'claude-plugins'),
    join(clawgodDir, 'staging', 'claude-plugins'),
  ]) assert.equal(existsSync(path), false, `uninstall must remove ClawGod plugin artifact: ${path}`);
  assertHarborKitePreserved('uninstall');
  assert.equal(readSettings().unrelatedInstallerE2EValue, 'preserve-me', 'uninstall must retain unrelated settings values');
  assertNoForbiddenDependency();

  console.log('installer Bun-only end-to-end checks passed');
} finally {
  assertExactTemporaryHome(tempHome);
  rmSync(tempHome, { recursive: true, force: true });
}
