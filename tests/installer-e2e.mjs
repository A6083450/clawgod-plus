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

function validatePluginSummary(output) {
  const summaryLines = output.split(/\r?\n/).filter(line => line.includes('Optional plugins:'));
  assert.equal(summaryLines.length, 1, `expected exactly one optional plugin summary, found ${summaryLines.length}`);
  const match = /^Optional plugins: (\d+) ready, (\d+) warnings?$/.exec(summaryLines[0].trim());
  assert.notEqual(match, null, 'optional plugin summary must use the canonical ready/warning format');
  const result = { ready: Number(match[1]), warnings: Number(match[2]) };
  assert.deepEqual(result, { ready: 3, warnings: 0 }, 'all three optional plugins must be ready without warnings');
  return result;
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

const canonicalPluginRetentionSpecs = [
  { key: 'hud', id: 'claude-hud@claude-hud', marketplace: 'claude-hud', plugin: 'claude-hud', version: '0.7.0' },
  { key: 'memory', id: 'claude-mem@thedotmack', marketplace: 'thedotmack', plugin: 'claude-mem', version: '13.14.0' },
  { key: 'superpowers', id: 'superpowers@superpowers-marketplace', marketplace: 'superpowers-marketplace', plugin: 'superpowers', version: '6.2.0' },
];

function validatePluginRetention(tempHome, expectedCanonicalIds) {
  assert.deepEqual(
    [...expectedCanonicalIds].sort(),
    canonicalPluginRetentionSpecs.map(spec => spec.id).sort(),
    'plugin retention must use the three canonical plugin IDs',
  );
  const pluginRoot = join(tempHome, '.claude', 'plugins');
  const installed = JSON.parse(readFileSync(join(pluginRoot, 'installed_plugins.json'), 'utf8'));
  assert.equal(installed?.version, 2, 'installed plugin state must use schema version 2');
  for (const spec of canonicalPluginRetentionSpecs) {
    const records = installed?.plugins?.[spec.id];
    assert.equal(Array.isArray(records), true, `retained plugin record is missing for ${spec.id}`);
    const record = records.find(candidate => candidate?.scope === 'user' && typeof candidate.version === 'string' && typeof candidate.installPath === 'string');
    assert.notEqual(record, undefined, `retained user plugin record is missing for ${spec.id}`);
    const cacheRoot = join(pluginRoot, 'cache', spec.marketplace, spec.plugin);
    assert.equal(existsSync(record.installPath), true, `retained plugin cache is missing for ${spec.id}`);
    assert.equal(pathIsInside(realpathSync(cacheRoot), realpathSync(record.installPath)), true, `retained plugin cache is not canonical for ${spec.id}`);
    assert.equal(existsSync(join(pluginRoot, 'marketplaces', spec.marketplace)), true, `retained marketplace is missing for ${spec.id}`);
    const persistentMarketplace = join(pluginRoot, 'clawgod-marketplaces', spec.marketplace);
    assert.equal(existsSync(persistentMarketplace), true, `retained persistent marketplace is missing for ${spec.id}`);
    assert.ok(readdirSync(persistentMarketplace).length > 0, `retained persistent marketplace has no source for ${spec.id}`);
  }
  return 'plugin retention: hud=present memory=present superpowers=present';
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
  assert.equal(Array.isArray(mcpSearch?.args) && mcpSearch.args[0] === '-e' && typeof mcpSearch.args[1] === 'string', true, 'claude-mem MCP entrypoint arguments must retain the managed script');
  return 'claude-mem entrypoints: hooks=bun mcp=bun';
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
  const allowedPersistentEntries = new Set(['provider.json', 'features.json', '.lean-disabled', '.lean-max']);
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
      const result = validatePluginSummary(input);
      marker = `plugin summary: ready=${result.ready} warnings=${result.warnings}`;
    } else if (process.env.CLAWGOD_E2E_CONTRACT === 'hud-statusline') {
      const fixture = JSON.parse(input);
      marker = validateHudStatusLine(fixture.settings, fixture.bunPath, fixture.managedModulePath);
    } else if (process.env.CLAWGOD_E2E_CONTRACT === 'plugin-retention') {
      const fixture = JSON.parse(input);
      marker = validatePluginRetention(fixture.tempHome, fixture.expectedCanonicalIds);
    } else if (process.env.CLAWGOD_E2E_CONTRACT === 'claude-mem-entrypoints') {
      const fixture = JSON.parse(input);
      marker = validateClaudeMemEntrypoints(fixture.hooksJson, fixture.mcpJson, fixture.bunPath);
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

function compareStableVersions(left, right) {
  const parse = value => {
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
    assert.notEqual(match, null, `plugin version must be stable strict SemVer: ${value}`);
    return match.slice(1).map(Number);
  };
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function validateInstalledPluginState(label) {
  const pluginRoot = join(tempHome, '.claude', 'plugins');
  const installed = JSON.parse(readFileSync(join(pluginRoot, 'installed_plugins.json'), 'utf8'));
  assert.equal(installed?.version, 2, `${label}: installed plugin state must use schema version 2`);
  const settings = readSettings();
  const selected = new Map();
  for (const spec of canonicalPluginRetentionSpecs) {
    const records = installed?.plugins?.[spec.id];
    assert.equal(Array.isArray(records), true, `${label}: canonical plugin record is missing for ${spec.id}`);
    const record = records
      .filter(candidate => candidate?.scope === 'user' && typeof candidate.version === 'string' && typeof candidate.installPath === 'string')
      .sort((left, right) => compareStableVersions(right.version, left.version))[0];
    assert.notEqual(record, undefined, `${label}: valid user plugin record is missing for ${spec.id}`);
    assert.ok(compareStableVersions(record.version, spec.version) >= 0, `${label}: ${spec.id} must be at baseline ${spec.version} or a preserved newer version`);
    assert.equal(settings.enabledPlugins?.[spec.id], true, `${label}: ${spec.id} must remain enabled`);
    assert.equal(existsSync(record.installPath), true, `${label}: canonical cache is missing for ${spec.id}`);
    assert.equal(existsSync(join(pluginRoot, 'marketplaces', spec.marketplace)), true, `${label}: marketplace is missing for ${spec.id}`);
    assert.equal(existsSync(join(pluginRoot, 'clawgod-marketplaces', spec.marketplace, spec.version)), true, `${label}: persistent local source is missing for ${spec.id}`);
    selected.set(spec.key, record);
  }
  return selected;
}

function runHudGoldenFixture(bunPath, managedModulePath) {
  const fixture = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'claude-hud-current-style.json'), 'utf8'));
  const projectDir = join(tempHome, 'my-project');
  const transcriptPath = join(projectDir, 'transcript.jsonl');
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(transcriptPath, `${fixture.transcript.map(entry => JSON.stringify(entry)).join('\n')}\n`, 'utf8');
  const stdin = {
    ...fixture.stdin,
    cwd: projectDir,
    transcript_path: transcriptPath,
    workspace: { ...fixture.stdin.workspace, current_dir: projectDir, project_dir: projectDir },
  };
  const result = spawnSync(bunPath, [managedModulePath], {
    cwd: projectDir,
    env: isolatedEnv,
    input: `${JSON.stringify(stdin)}\n`,
    maxBuffer: 16 * 1024 * 1024,
  });
  const stderr = Buffer.from(result.stderr ?? '').toString('utf8');
  assertNoForbiddenDependency(stderr);
  assert.equal(result.error, undefined, 'managed HUD golden fixture must start successfully');
  assert.equal(result.status, 0, `managed HUD golden fixture exited ${result.status}: ${stderr}`);
  assert.deepEqual(Buffer.from(result.stdout ?? ''), Buffer.from(fixture.expectedStdout, 'utf8'), 'managed HUD stdout must match the committed ANSI fixture byte-for-byte');
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

  const initialInstallOutput = run('initial --lean-on install', '/bin/bash', [join(root, 'install.sh'), '--lean-on']);
  console.log(validatePatchSummary('unix initial', initialInstallOutput));
  validatePluginSummary(initialInstallOutput);
  assertHarborKitePreserved('initial install');
  assertLeanOn();
  const initialPlugins = validateInstalledPluginState('initial install');
  const managedHudModulePath = join(clawgodDir, 'claude-hud-statusline.mjs');
  console.log(validateHudStatusLine(readSettings(), isolatedRuntime.bunPath, managedHudModulePath));
  const memoryRecord = initialPlugins.get('memory');
  console.log(validateClaudeMemEntrypoints(
    JSON.parse(readFileSync(join(memoryRecord.installPath, 'hooks', 'hooks.json'), 'utf8')),
    JSON.parse(readFileSync(join(memoryRecord.installPath, '.mcp.json'), 'utf8')),
    isolatedRuntime.bunPath,
  ));
  runHudGoldenFixture(isolatedRuntime.bunPath, managedHudModulePath);
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
  validatePluginSummary(noUpgradeOutput);
  assertHarborKitePreserved('no-upgrade install');
  assertLeanOff();
  const noUpgradePlugins = validateInstalledPluginState('no-upgrade install');
  console.log(validateHudStatusLine(readSettings(), isolatedRuntime.bunPath, managedHudModulePath));
  const noUpgradeMemory = noUpgradePlugins.get('memory');
  console.log(validateClaudeMemEntrypoints(
    JSON.parse(readFileSync(join(noUpgradeMemory.installPath, 'hooks', 'hooks.json'), 'utf8')),
    JSON.parse(readFileSync(join(noUpgradeMemory.installPath, '.mcp.json'), 'utf8')),
    isolatedRuntime.bunPath,
  ));

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
  console.log(validatePluginRetention(tempHome, canonicalPluginRetentionSpecs.map(spec => spec.id)));
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
