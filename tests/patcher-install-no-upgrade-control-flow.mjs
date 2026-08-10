#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const installer = readFileSync(new URL('../install.sh', import.meta.url), 'utf8');
const branchMarker = 'if [ "$NO_UPGRADE" = "1" ]; then';
const branchStart = installer.indexOf(branchMarker);
assert.notEqual(branchStart, -1, 'install.sh must retain the --no-upgrade branch');

function extractFunction(name) {
  const start = installer.indexOf(`${name}() {`);
  assert.notEqual(start, -1, `install.sh must define ${name}`);
  const end = installer.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `install.sh ${name} definition must end`);
  return { start, source: installer.slice(start, end + 3) };
}

const installHelper = extractFunction('install_chrome_fix_script');
const runHelper = extractFunction('run_claude_code_chrome_fix');
assert.ok(installHelper.start < branchStart, 'Chrome fix installer helper must be defined before --no-upgrade branching');
assert.ok(runHelper.start < branchStart, 'Chrome fix runner must be defined before --no-upgrade branching');

const normalInstallCall = installer.indexOf('if install_chrome_fix_script; then', branchStart);
assert.ok(normalInstallCall > branchStart, 'normal install must still eagerly select/install the Chrome helper');

function extractTemplate(name, marker) {
  const start = installer.indexOf(`cat > "$CLAWGOD_DIR/${name}" << '${marker}'`);
  assert.notEqual(start, -1, `install.sh must generate ${name}`);
  const bodyStart = installer.indexOf('\n', start) + 1;
  const end = installer.indexOf(`\n${marker}`, bodyStart);
  assert.notEqual(end, -1, `install.sh ${name} template must end`);
  return installer.slice(bodyStart, end);
}

const pluginModule = extractTemplate('plugin-dependencies.mjs', 'PLUGIN_DEPENDENCIES_EOF');
const normalBranchStart = installer.indexOf('\nelse\n', branchStart);
const branchEnd = installer.indexOf('fi  # end --no-upgrade skip', normalBranchStart);
const claudeDownload = installer.indexOf('"$NPM_PKG@$VERSION" "$NATIVE_BIN_TMPDIR"', normalBranchStart);
const pluginEnsure = installer.indexOf('"$CLAWGOD_DIR/plugin-dependencies.mjs" ensure', branchEnd);
const latestUpdateRunsClaudeDownloadBeforePluginEnsure = installer.includes('VERSION="${CLAWGOD_VERSION:-latest}"')
  && claudeDownload > normalBranchStart && claudeDownload < branchEnd && pluginEnsure > branchEnd;
const explicitVersionFlowsToClaudePackageResolverOnly = installer.includes('--version) VERSION="$2"; shift 2 ;;')
  && installer.includes('"$NPM_PKG@$VERSION" "$NATIVE_BIN_TMPDIR"')
  && !pluginModule.includes('CLAWGOD_VERSION');
const noUpgradeSkipsClaudePackageDownloadButStillRunsPluginHealthCheck = branchStart < normalBranchStart
  && claudeDownload > normalBranchStart && claudeDownload < branchEnd && pluginEnsure > branchEnd;
assert.ok(latestUpdateRunsClaudeDownloadBeforePluginEnsure);
assert.ok(explicitVersionFlowsToClaudePackageResolverOnly);
assert.ok(noUpgradeSkipsClaudePackageDownloadButStillRunsPluginHealthCheck);
assert.doesNotMatch(pluginModule, /CLAWGOD_VERSION|--version\s+2\.|version\s*=\s*['"]latest['"]/);

const optionalStart = installer.indexOf('# --- Ensure optional Claude plugins');
const optionalEnd = installer.indexOf('\ninstall_claude_mem_compat_helper', optionalStart);
assert.ok(optionalStart >= 0 && optionalEnd > optionalStart, 'install.sh must retain an extractable plugin health-check stage');
const lifecycleSpan = installer.slice(0, optionalEnd);

function assertTemporaryPath(path, parent, label) {
  const resolvedParent = realpathSync(parent);
  const resolvedPath = realpathSync(path);
  const child = relative(resolvedParent, resolvedPath);
  assert.ok(child && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child), `${label} must stay under its fixture root`);
}

const dir = mkdtempSync(join(tmpdir(), `clawgod lifecycle "quoted" 'update' `));
assert.equal(realpathSync(dirname(dir)), realpathSync(tmpdir()), 'lifecycle fixture must be created directly under the system temporary directory');
try {
  const fakeBin = join(dir, 'bin');
  const fakeBun = join(fakeBin, 'bun');
  mkdirSync(fakeBin);
  const fakeUname = join(fakeBin, 'uname');
  writeFileSync(fakeUname, '#!/bin/sh\n[ "$1" = "-s" ] && printf "Darwin\\n" || printf "arm64\\n"\n');
  chmodSync(fakeUname, 0o755);
  for (const [name, target] of [
    ['awk', '/usr/bin/awk'],
    ['basename', '/usr/bin/basename'],
    ['cat', '/bin/cat'],
    ['chmod', '/bin/chmod'],
    ['cp', '/bin/cp'],
    ['dirname', '/usr/bin/dirname'],
    ['head', '/usr/bin/head'],
    ['mkdir', '/bin/mkdir'],
    ['mktemp', '/usr/bin/mktemp'],
    ['rm', '/bin/rm'],
    ['sed', '/usr/bin/sed'],
    ['sort', '/usr/bin/sort'],
    ['stat', '/usr/bin/stat'],
    ['touch', '/usr/bin/touch'],
    ['tr', '/usr/bin/tr'],
  ]) symlinkSync(target, join(fakeBin, name));
  writeFileSync(fakeBun, `#!${process.execPath}
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
const [target, ...args] = process.argv.slice(2);
if (target === '--version') {
  console.log('1.3.14');
  process.exit(0);
}
if (target === '-e') {
  const child = spawnSync(process.execPath, ['-e', ...args], { env: process.env, stdio: 'inherit' });
  process.exit(child.status ?? 1);
}
const name = basename(target || '');
if (name === 'install-ripgrep.mjs') {
  console.log('ripgrep 15.2.0: fixture');
} else if (name === 'fetch-file.mjs') {
  const destination = args[1];
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, destination.endsWith('.sh') ? '#!/bin/sh\\nexit 0\\n' : 'fixture binary\\n');
  chmodSync(destination, 0o700);
} else if (name === 'fetch-package.mjs') {
  const [spec, output] = args;
  const version = spec.slice(spec.lastIndexOf('@') + 1);
  mkdirSync(join(output, 'package'), { recursive: true });
  writeFileSync(join(output, 'package', 'claude'), new Uint8Array((10 * 1024 * 1024) + 1));
  writeFileSync(process.env.CLAUDE_RESOLVER_MARKER, spec + '\\n');
  console.log('VERSION=' + version);
} else if (name === 'extract-natives.mjs') {
  const output = args[1];
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'cli.original.js'), '(function(exports,require,module,__filename,__dirname){})');
} else if (name === 'post-process.mjs') {
  const root = dirname(target);
  writeFileSync(join(root, 'cli.original.cjs'), '(function(exports,require,module,__filename,__dirname){})');
  rmSync(join(root, 'cli.original.js'), { force: true });
} else if (name === 'patch.mjs') {
  console.log('fixture patch applied');
  writeFileSync(process.env.PATCH_ARGS_MARKER, JSON.stringify(args) + '\\n');
  process.exit(Number(process.env.PATCH_EXIT || 0));
} else if (name === 'cli.cjs' && args[0] === '--version') {
  console.log('2.1.999');
} else if (name === 'plugin-dependencies.mjs' && args[0] === 'ensure') {
  writeFileSync(process.env.PLUGIN_HEALTH_MARKER, JSON.stringify({ args, clawgodVersion: process.env.CLAWGOD_VERSION || null }) + '\\n');
} else {
  console.error('unexpected fake Bun boundary: ' + JSON.stringify({ target, args }));
  process.exit(97);
}
`, 'utf8');
  chmodSync(fakeBun, 0o755);

  function runLifecycleCase(label, args, options = {}) {
    const root = join(dir, label);
    const home = join(root, 'home');
    const temp = join(root, 'tmp');
    const script = join(root, 'installer-lifecycle.sh');
    const pluginHealth = join(root, 'plugin-health.json');
    const claudeResolver = join(root, 'claude-resolver.txt');
    const patchArgs = join(root, 'patch-args.json');
    const configPath = join(home, '.clawgod', 'enhancements.json');
    const target = join(home, '.clawgod', 'cli.original.cjs');
    const sourceVersion = join(home, '.clawgod', '.source-version');
    const savedConfig = '{\n  "schemaVersion": 1,\n  "mode": "custom",\n  "enabled": [\n    "agents",\n    "branding"\n  ]\n}\n';
    mkdirSync(join(home, '.clawgod'), { recursive: true, mode: 0o700 });
    mkdirSync(temp, { recursive: true });
    assertTemporaryPath(root, dir, `${label} case root`);
    assertTemporaryPath(home, root, `${label} HOME`);
    assertTemporaryPath(temp, root, `${label} TMPDIR`);
    writeFileSync(configPath, savedConfig, { mode: 0o600 });
    const configBefore = statSync(configPath);
    if (args.includes('--no-upgrade')) {
      writeFileSync(target, 'existing clean CLI fixture\n');
    } else if (options.priorRuntime) {
      writeFileSync(target, options.priorRuntime, 'utf8');
      writeFileSync(sourceVersion, '2.1.225\n', 'utf8');
    }
    writeFileSync(script, lifecycleSpan, 'utf8');
    chmodSync(script, 0o700);
    const run = spawnSync('/bin/bash', [script, ...args], {
      cwd: root,
      encoding: 'utf8',
      env: {
        HOME: home,
        TMPDIR: temp,
        PATH: fakeBin,
        PLUGIN_HEALTH_MARKER: pluginHealth,
        CLAUDE_RESOLVER_MARKER: claudeResolver,
        PATCH_ARGS_MARKER: patchArgs,
        PATCH_EXIT: String(options.patchExit || 0),
      },
    });
    const configAfter = statSync(configPath);
    return {
      run,
      pluginHealth,
      claudeResolver,
      patchArgs: existsSync(patchArgs) ? JSON.parse(readFileSync(patchArgs, 'utf8')) : null,
      configPath,
      configBytes: readFileSync(configPath, 'utf8'),
      configBefore,
      configAfter,
      runtime: existsSync(target) ? readFileSync(target, 'utf8') : null,
      sourceVersion: existsSync(sourceVersion) ? readFileSync(sourceVersion, 'utf8') : null,
    };
  }

  const lifecycleCases = [
    { label: 'default-latest', args: [], expectedResolver: '@anthropic-ai/claude-code-darwin-arm64@latest' },
    { label: 'explicit-version', args: ['--version', '2.1.777'], expectedResolver: '@anthropic-ai/claude-code-darwin-arm64@2.1.777' },
    { label: 'no-upgrade', args: ['--no-upgrade'], expectedResolver: null },
  ];
  for (const fixture of lifecycleCases) {
    const result = runLifecycleCase(fixture.label, fixture.args);
    assert.equal(result.run.status, 0, `${fixture.label}: ${result.run.stdout}${result.run.stderr}`);
    assert.deepEqual(result.patchArgs, ['--enhancements-file', result.configPath], `${fixture.label}: patcher argv must contain the exact saved config path`);
    assert.equal(result.configBytes, '{\n  "schemaVersion": 1,\n  "mode": "custom",\n  "enabled": [\n    "agents",\n    "branding"\n  ]\n}\n', `${fixture.label}: version flow must preserve saved config bytes`);
    assert.equal(result.configAfter.mode & 0o7777, result.configBefore.mode & 0o7777, `${fixture.label}: version flow must preserve saved config mode`);
    assert.equal(result.configAfter.ino, result.configBefore.ino, `${fixture.label}: version flow must preserve saved config identity`);
    assert.doesNotMatch(`${result.run.stdout}${result.run.stderr}`, /Choice:|Interactive enhancement/, `${fixture.label}: update inheritance must never prompt`);
    assert.equal(existsSync(result.pluginHealth), true, `${fixture.label}: plugin ensure must remain reachable from the real installer entry`);
    assert.deepEqual(JSON.parse(readFileSync(result.pluginHealth, 'utf8')), { args: ['ensure'], clawgodVersion: null }, `${fixture.label}: Claude version selection must not flow into plugin ensure`);
    if (fixture.expectedResolver === null) {
      assert.equal(existsSync(result.claudeResolver), false, '--no-upgrade must skip the Claude package resolver boundary');
    } else {
      assert.equal(readFileSync(result.claudeResolver, 'utf8'), `${fixture.expectedResolver}\n`, `${fixture.label}: the real parser must feed only the Claude package resolver`);
    }
  }

  const failed = runLifecycleCase('mandatory-patch-failure', [], {
    patchExit: 41,
    priorRuntime: 'prior installed runtime\n',
  });
  assert.notEqual(failed.run.status, 0, 'enabled mandatory patch failure must return nonzero');
  assert.deepEqual(failed.patchArgs, ['--enhancements-file', failed.configPath], 'failed patch must still use the exact saved config path');
  assert.equal(failed.runtime, 'prior installed runtime\n', 'enabled mandatory patch failure must restore the prior installed runtime');
  assert.equal(failed.sourceVersion, '2.1.225\n', 'enabled mandatory patch failure must restore the prior source marker');
  assert.equal(failed.configBytes, '{\n  "schemaVersion": 1,\n  "mode": "custom",\n  "enabled": [\n    "agents",\n    "branding"\n  ]\n}\n', 'failed patch must preserve saved config bytes');
  assert.equal(failed.configAfter.ino, failed.configBefore.ino, 'failed patch must preserve saved config identity');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('patcher install --no-upgrade control-flow checks passed');
