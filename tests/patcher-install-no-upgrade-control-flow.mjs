#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { appendFileSync, chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderGeneratedPair } from '../build.mjs';

const generated = await renderGeneratedPair();
const installer = generated.find(pair => pair.output === 'dist/unix/install.sh').content;
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
const latestUpdateRunsClaudeDownloadBeforePluginEnsure = installer.includes('VERSION="${CLAWGOD_VERSION:-}"')
  && installer.includes('[ -z "$VERSION" ] && VERSION="latest"')
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
const fixtureSelfVersion = '2026.9.2-claude.2.1.258';
const lifecycleSpan = installer.slice(0, optionalEnd).replace(
  'CLAWGOD_SELF_VERSION="0.0.0-dev"  # injected by release workflow from git tag',
  `CLAWGOD_SELF_VERSION="${fixtureSelfVersion}"  # fixture release-format version`,
);
assert.doesNotMatch(lifecycleSpan, /CLAWGOD_SELF_VERSION="0\.0\.0-dev"/, 'lifecycle fixture must use a release-format ClawGod version for fallback state validation');

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
    ['dirname', '/usr/bin/dirname'],
    ['grep', '/usr/bin/grep'],
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
  const fakeCp = join(fakeBin, 'cp');
  writeFileSync(fakeCp, `#!${process.execPath}
import { basename } from 'node:path';
import { spawnSync } from 'node:child_process';
const operands = process.argv.slice(2).filter(value => value !== '--' && !value.startsWith('-'));
if (process.env.PATCH_FALLBACK_SNAPSHOT_FAULT === '1'
  && operands.at(-2)?.endsWith('/patch-fallback.json')
  && operands.at(-1)?.includes('/.runtime-rollback.')) {
  process.exit(74);
}
const child = spawnSync('/bin/cp', process.argv.slice(2), { stdio: 'inherit' });
process.exit(child.status ?? 1);
`, 'utf8');
  chmodSync(fakeCp, 0o755);
  const fakeMv = join(fakeBin, 'mv');
  writeFileSync(fakeMv, `#!${process.execPath}
import { basename, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const operands = process.argv.slice(2).filter(value => value !== '--');
const [source, destination] = operands;
if (process.env.VENDOR_PUBLISH_FAULT === '1' && source?.includes('/candidate/vendor/')) {
  if (existsSync(process.env.VENDOR_PUBLISH_MARKER)) process.exit(73);
  const moved = spawnSync('/bin/mv', process.argv.slice(2), { stdio: 'inherit' });
  if (moved.status !== 0) process.exit(moved.status ?? 1);
  const published = join(destination, basename(source));
  rmSync(published, { recursive: true, force: true });
  mkdirSync(process.env.UNKNOWN_REPLACEMENT_DIR, { recursive: true });
  writeFileSync(process.env.UNKNOWN_REPLACEMENT_PATH, Buffer.from([0x99, 0x00, 0xfe]));
  writeFileSync(process.env.VENDOR_PUBLISH_MARKER, readFileSync(process.env.UNKNOWN_REPLACEMENT_PATH));
  process.exit(0);
}
const child = spawnSync('/bin/mv', process.argv.slice(2), { stdio: 'inherit' });
process.exit(child.status ?? 1);
`, 'utf8');
  chmodSync(fakeMv, 0o755);
  writeFileSync(fakeBun, `#!${process.execPath}
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { appendFileSync, chmodSync, mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
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
  writeFileSync(destination, destination.endsWith('.sh')
    ? '#!/bin/sh\\nprintf "%s\\\\n" invoked > "$CHROME_MARKER"\\nexit 0\\n'
    : 'fixture binary\\n');
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
  const native = join(output, 'vendor', 'candidate-addon', 'arm64-darwin', 'candidate-addon.node');
  writeFileSync(join(output, 'cli.original.js'), '(function(exports,require,module,__filename,__dirname){})');
  if (process.env.CANDIDATE_VENDOR_SYMLINK === '1') {
    symlinkSync(process.env.EXTERNAL_VENDOR_ROOT, join(output, 'vendor'));
  } else {
    mkdirSync(dirname(native), { recursive: true });
    writeFileSync(native, Buffer.from([0xca, 0xfe, 0xba, 0xbe]));
    chmodSync(native, 0o751);
  }
  if (process.env.VENDOR_PUBLISH_FAULT === '1') {
    const blocked = join(output, 'vendor', 'zz-blocked', 'arm64-darwin', 'zz-blocked.node');
    mkdirSync(dirname(blocked), { recursive: true });
    writeFileSync(blocked, Buffer.from([0xba, 0xdd, 0xca, 0xfe]));
  }
} else if (name === 'patch-fallback.cjs') {
  const child = spawnSync(process.execPath, [target, ...args], { env: process.env, stdio: 'inherit' });
  process.exit(child.status ?? 1);
} else if (name === 'vendor-transaction.mjs') {
  appendFileSync(process.env.VENDOR_PUBLISH_CALLS, 'publish-checked\\n');
  if (process.env.VENDOR_PREFLIGHT_FAULT === '1') {
    writeFileSync(join(args[3], 'old-vendor'), 'preflight blocker\\n');
    const child = spawnSync(process.execPath, [target, ...args], { env: process.env, stdio: 'inherit' });
    process.exit(child.status ?? 1);
  }
  if (process.env.OLD_VENDOR_SYMLINK === '1') {
    symlinkSync(process.env.EXTERNAL_VENDOR_ROOT, join(args[3], 'old-vendor'));
    const child = spawnSync(process.execPath, [target, ...args], { env: process.env, stdio: 'inherit' });
    process.exit(child.status ?? 1);
  }
  if (process.env.VENDOR_PUBLISH_FAULT !== '1') {
    const child = spawnSync(process.execPath, [target, ...args], { env: process.env, stdio: 'inherit' });
    process.exit(child.status ?? 1);
  }
  const { publishVendorTransaction } = await import(pathToFileURL(target).href);
  try {
    publishVendorTransaction({
      liveVendor: args[1],
      candidateVendor: args[2],
      transactionDir: args[3],
      afterPublish: ({ path, publishedCount }) => {
        if (publishedCount !== 1) return;
        if (process.env.VENDOR_ROOT_REPLACE_FAULT === '1') {
          renameSync(args[1], process.env.DISPLACED_VENDOR_ROOT);
          renameSync(process.env.EXTERNAL_VENDOR_ROOT, args[1]);
          rmSync(join(args[2], 'zz-blocked'), { recursive: true, force: true });
          return;
        }
        rmSync(path, { recursive: true, force: true });
        mkdirSync(process.env.UNKNOWN_REPLACEMENT_DIR, { recursive: true });
        writeFileSync(process.env.UNKNOWN_REPLACEMENT_PATH, Buffer.from([0x99, 0x00, 0xfe]));
        rmSync(join(args[2], 'zz-blocked'), { recursive: true, force: true });
      },
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
} else if (name === 'post-process.mjs') {
  const root = dirname(target);
  writeFileSync(join(root, 'cli.original.cjs'), '(function(exports,require,module,__filename,__dirname){})');
  rmSync(join(root, 'cli.original.js'), { force: true });
} else if (name === 'patch.mjs') {
  console.log('fixture patch applied');
  writeFileSync(process.env.PATCH_ARGS_MARKER, JSON.stringify(args) + '\\n');
  if (process.env.PATCH_EXIT !== '0') {
    mkdirSync(dirname(process.env.EXTERNAL_REPLACEMENT), { recursive: true });
    writeFileSync(process.env.EXTERNAL_REPLACEMENT, Buffer.from([0x55, 0xaa]));
  }
  process.exit(Number(process.env.PATCH_EXIT || 0));
} else if (name === 'cli.cjs' && args[0] === '--version') {
  appendFileSync(process.env.RUNTIME_CHECK_CALLS, 'check\\n');
  if (process.env.SANITY_PANIC === '1') process.stderr.write('Expected CommonJS module to have a function wrapper\\n');
  else console.log('2.1.999');
  process.exit(Number(process.env.SANITY_EXIT || 0));
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
    const chromeMarker = join(root, 'chrome-ran.txt');
    const vendorPublishCalls = join(root, 'vendor-publish-calls.txt');
    const runtimeCheckCalls = join(root, 'runtime-check-calls.txt');
    const configPath = join(home, '.clawgod', 'enhancements.json');
    const target = join(home, '.clawgod', 'cli.original.cjs');
    const chunks = join(home, '.clawgod', 'chunks');
    const priorChunk = join(chunks, 'prior-chunk.mjs');
    const fallbackState = join(home, '.clawgod', 'patch-fallback.json');
    const sourceVersion = join(home, '.clawgod', '.source-version');
    const vendor = join(home, '.clawgod', 'vendor');
    const oldNative = join(vendor, 'native-addon', 'arm64-darwin', 'native-addon.node');
    const oldOnly = join(vendor, 'old-only', 'nested', 'data.bin');
    const candidateNative = join(vendor, 'candidate-addon', 'arm64-darwin', 'candidate-addon.node');
    const blockedNative = join(vendor, 'zz-blocked', 'arm64-darwin', 'zz-blocked.node');
    const ripgrep = join(vendor, 'ripgrep', 'bin', 'rg');
    const externalReplacement = join(vendor, 'external-replacement', 'data.bin');
    const publishMarker = join(root, 'vendor-publish.marker');
    const externalVendorRoot = join(root, 'external-vendor');
    const externalSentinel = join(externalVendorRoot, 'sentinel.bin');
    const displacedVendorRoot = join(root, 'displaced-live-vendor');
    const savedConfig = '{\n  "schemaVersion": 1,\n  "mode": "custom",\n  "enabled": [\n    "agents",\n    "branding"\n  ]\n}\n';
    mkdirSync(join(home, '.clawgod'), { recursive: true, mode: 0o700 });
    mkdirSync(temp, { recursive: true });
    assertTemporaryPath(root, dir, `${label} case root`);
    assertTemporaryPath(home, root, `${label} HOME`);
    assertTemporaryPath(temp, root, `${label} TMPDIR`);
    writeFileSync(configPath, savedConfig, { mode: 0o600 });
    mkdirSync(dirname(oldNative), { recursive: true });
    mkdirSync(dirname(oldOnly), { recursive: true });
    mkdirSync(dirname(ripgrep), { recursive: true });
    writeFileSync(oldNative, Buffer.from([0x00, 0x11, 0x80, 0xff]), { mode: 0o640 });
    writeFileSync(oldOnly, Buffer.from([0xde, 0xad, 0xbe, 0xef]), { mode: 0o605 });
    writeFileSync(ripgrep, Buffer.from([0x72, 0x67, 0x00, 0xff]), { mode: 0o711 });
    if (options.liveVendorSymlink) {
      writeFileSync(join(vendor, 'sentinel.bin'), Buffer.from([0x5a, 0x00, 0xa5]), { mode: 0o604 });
      renameSync(vendor, externalVendorRoot);
      symlinkSync(externalVendorRoot, vendor);
    } else if (options.candidateVendorSymlink || options.oldVendorSymlink || options.rootReplacementFault) {
      mkdirSync(externalVendorRoot);
      writeFileSync(externalSentinel, Buffer.from([0x5a, 0x00, 0xa5]), { mode: 0o604 });
    }
    const configBefore = statSync(configPath);
    const oldNativeBefore = lstatSync(oldNative);
    const ripgrepBefore = lstatSync(ripgrep);
    const externalSentinelBefore = existsSync(externalSentinel) ? lstatSync(externalSentinel) : null;
    const externalEntriesBefore = existsSync(externalVendorRoot) ? readdirSync(externalVendorRoot).sort() : null;
    if (args.includes('--no-upgrade')) {
      writeFileSync(target, options.priorRuntime || 'existing clean CLI fixture\n');
      writeFileSync(sourceVersion, '2.1.225\n', 'utf8');
    } else if (options.priorRuntime) {
      writeFileSync(target, options.priorRuntime, 'utf8');
      writeFileSync(sourceVersion, '2.1.225\n', 'utf8');
    }
    if (options.priorChunks) {
      mkdirSync(chunks, { recursive: true });
      writeFileSync(priorChunk, 'prior chunk fixture\n', 'utf8');
    }
    if (options.priorFallback) {
      writeFileSync(fallbackState, JSON.stringify({
        schemaVersion: 1,
        sourceVersion: '2.1.225',
        clawgodVersion: fixtureSelfVersion,
        reason: 'bundle-patch-compatibility',
      }, null, 2) + '\n', { mode: 0o600 });
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
        SANITY_EXIT: String(options.sanityExit || 0),
        SANITY_PANIC: options.sanityPanic ? '1' : '0',
        CLAWGOD_UPDATE_PATCH_FAIL_OPEN: options.updateFailOpen ? '1' : '',
        CHROME_MARKER: chromeMarker,
        VENDOR_PUBLISH_CALLS: vendorPublishCalls,
        RUNTIME_CHECK_CALLS: runtimeCheckCalls,
        PATCH_FALLBACK_SNAPSHOT_FAULT: options.fallbackSnapshotFault ? '1' : '0',
        EXTERNAL_REPLACEMENT: externalReplacement,
        VENDOR_PUBLISH_FAULT: options.publishFault || options.rootReplacementFault ? '1' : '0',
        VENDOR_PREFLIGHT_FAULT: options.preflightFault ? '1' : '0',
        VENDOR_ROOT_REPLACE_FAULT: options.rootReplacementFault ? '1' : '0',
        CANDIDATE_VENDOR_SYMLINK: options.candidateVendorSymlink ? '1' : '0',
        OLD_VENDOR_SYMLINK: options.oldVendorSymlink ? '1' : '0',
        EXTERNAL_VENDOR_ROOT: externalVendorRoot,
        EXTERNAL_SENTINEL_PATH: externalSentinel,
        DISPLACED_VENDOR_ROOT: displacedVendorRoot,
        VENDOR_PUBLISH_MARKER: publishMarker,
        UNKNOWN_REPLACEMENT_DIR: dirname(candidateNative),
        UNKNOWN_REPLACEMENT_PATH: candidateNative,
      },
    });
    const configAfter = statSync(configPath);
    const transactionDirectories = readdirSync(join(home, '.clawgod')).filter(name => name.startsWith('.runtime-rollback.'));
    const evidence = transactionDirectories.length === 1
      ? join(home, '.clawgod', transactionDirectories[0], 'vendor-rollback-conflict.json')
      : null;
    const observedExternalRoot = options.rootReplacementFault ? vendor : externalVendorRoot;
    const observedExternalSentinel = join(observedExternalRoot, 'sentinel.bin');
    return {
      run,
      pluginHealth,
      claudeResolver,
      patchArgs: existsSync(patchArgs) ? JSON.parse(readFileSync(patchArgs, 'utf8')) : null,
      chromeMarker: existsSync(chromeMarker) ? readFileSync(chromeMarker, 'utf8') : null,
      vendorPublishCalls: existsSync(vendorPublishCalls) ? readFileSync(vendorPublishCalls, 'utf8').trimEnd().split('\n') : [],
      runtimeCheckCalls: existsSync(runtimeCheckCalls) ? readFileSync(runtimeCheckCalls, 'utf8').trimEnd().split('\n') : [],
      chunks: existsSync(priorChunk) ? readFileSync(priorChunk, 'utf8') : null,
      fallbackState: existsSync(fallbackState) ? JSON.parse(readFileSync(fallbackState, 'utf8')) : null,
      configPath,
      configBytes: readFileSync(configPath, 'utf8'),
      configBefore,
      configAfter,
      runtime: existsSync(target) ? readFileSync(target, 'utf8') : null,
      sourceVersion: existsSync(sourceVersion) ? readFileSync(sourceVersion, 'utf8') : null,
      vendor: {
        oldNative: existsSync(oldNative) ? { bytes: readFileSync(oldNative), mode: statSync(oldNative).mode & 0o7777, ino: lstatSync(oldNative).ino } : null,
        oldOnly: existsSync(oldOnly) ? { bytes: readFileSync(oldOnly), mode: statSync(oldOnly).mode & 0o7777 } : null,
        candidate: existsSync(candidateNative) ? { bytes: readFileSync(candidateNative), mode: statSync(candidateNative).mode & 0o7777 } : null,
        blocked: existsSync(blockedNative) ? readFileSync(blockedNative) : null,
        ripgrep: existsSync(ripgrep) ? { bytes: readFileSync(ripgrep), mode: statSync(ripgrep).mode & 0o7777, ino: lstatSync(ripgrep).ino } : null,
        oldNativeBefore,
        ripgrepBefore,
        externalReplacement: existsSync(externalReplacement) ? readFileSync(externalReplacement) : null,
      },
      transactionDirectories,
      recoveryEvidence: evidence && existsSync(evidence) ? JSON.parse(readFileSync(evidence, 'utf8')) : null,
      external: {
        sentinel: existsSync(observedExternalSentinel) ? {
          bytes: readFileSync(observedExternalSentinel),
          mode: statSync(observedExternalSentinel).mode & 0o7777,
          ino: lstatSync(observedExternalSentinel).ino,
          type: lstatSync(observedExternalSentinel).isFile() ? 'file' : 'other',
        } : null,
        sentinelBefore: externalSentinelBefore,
        entriesBefore: externalEntriesBefore,
        entries: existsSync(observedExternalRoot) ? readdirSync(observedExternalRoot).sort() : null,
        displacedEntries: existsSync(displacedVendorRoot) ? readdirSync(displacedVendorRoot).sort() : null,
      },
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
      assert.deepEqual(result.vendor.oldNative.bytes, Buffer.from([0x00, 0x11, 0x80, 0xff]), '--no-upgrade must preserve prior native bytes');
      assert.equal(result.vendor.oldNative.mode, 0o640, '--no-upgrade must preserve prior native mode');
      assert.equal(result.vendor.oldNative.ino, result.vendor.oldNativeBefore.ino, '--no-upgrade must not move prior native modules');
      assert.equal(result.vendor.candidate, null, '--no-upgrade must not publish candidate native modules');
    } else {
      assert.equal(readFileSync(result.claudeResolver, 'utf8'), `${fixture.expectedResolver}\n`, `${fixture.label}: the real parser must feed only the Claude package resolver`);
      assert.equal(result.vendor.oldNative, null, `${fixture.label}: successful upgrade must remove prior native versions`);
      assert.equal(result.vendor.oldOnly, null, `${fixture.label}: successful upgrade must remove old-only vendor trees`);
      assert.deepEqual(result.vendor.candidate.bytes, Buffer.from([0xca, 0xfe, 0xba, 0xbe]), `${fixture.label}: successful upgrade must publish candidate native bytes`);
      assert.equal(result.vendor.candidate.mode, 0o751, `${fixture.label}: successful upgrade must publish candidate native mode`);
    }
    assert.deepEqual(result.vendor.ripgrep.bytes, Buffer.from([0x72, 0x67, 0x00, 0xff]), `${fixture.label}: managed ripgrep bytes must remain unchanged`);
    assert.equal(result.vendor.ripgrep.ino, result.vendor.ripgrepBefore.ino, `${fixture.label}: managed ripgrep identity must remain unchanged`);
  }

  const assertPriorRuntimeRestored = (result, label, { fallback = null } = {}) => {
    assert.equal(result.runtime, 'prior installed runtime\n', `${label}: failed transaction must restore the prior runtime`);
    assert.equal(result.sourceVersion, '2.1.225\n', `${label}: failed transaction must restore the prior source marker`);
    assert.deepEqual(result.vendor.oldNative?.bytes, Buffer.from([0x00, 0x11, 0x80, 0xff]), `${label}: failed transaction must restore prior native bytes`);
    assert.deepEqual(result.vendor.oldOnly?.bytes, Buffer.from([0xde, 0xad, 0xbe, 0xef]), `${label}: failed transaction must restore old-only vendor bytes`);
    assert.equal(result.vendor.candidate, null, `${label}: failed transaction must not leave candidate native modules live`);
    assert.deepEqual(result.fallbackState, fallback, `${label}: failed transaction must restore the prior fallback state`);
  };
  const priorFallbackState = {
    schemaVersion: 1,
    sourceVersion: '2.1.225',
    clawgodVersion: fixtureSelfVersion,
    reason: 'bundle-patch-compatibility',
  };

  const fallbackSnapshotFailure = runLifecycleCase('fallback-snapshot-failure', [], {
    priorRuntime: 'prior installed runtime\n',
    priorChunks: true,
    priorFallback: true,
    fallbackSnapshotFault: true,
  });
  assert.notEqual(fallbackSnapshotFailure.run.status, 0, 'fallback-state snapshot failure must abort before mutation');
  assert.equal(fallbackSnapshotFailure.runtime, 'prior installed runtime\n', 'fallback-state snapshot failure must preserve the prior runtime');
  assert.equal(fallbackSnapshotFailure.chunks, 'prior chunk fixture\n', 'fallback-state snapshot failure must preserve live chunks before transaction activation');
  assert.deepEqual(fallbackSnapshotFailure.fallbackState, priorFallbackState, 'fallback-state snapshot failure must preserve the prior fallback state');

  const directCompatibilityFailure = runLifecycleCase('direct-compatibility-failure', [], {
    patchExit: 42,
    priorRuntime: 'prior installed runtime\n',
  });
  assert.notEqual(directCompatibilityFailure.run.status, 0, 'direct install must fail closed for an unauthorized compatibility fallback');
  assert.deepEqual(directCompatibilityFailure.patchArgs, ['--enhancements-file', directCompatibilityFailure.configPath], 'direct install must not authorize the compatibility fallback patch argument');
  assertPriorRuntimeRestored(directCompatibilityFailure, 'direct compatibility failure');

  const updateCompatibilityFallback = runLifecycleCase('update-compatibility-fallback', [], {
    updateFailOpen: true,
    patchExit: 42,
    priorRuntime: 'prior installed runtime\n',
  });
  assert.equal(updateCompatibilityFallback.run.status, 0, `authorized updater fallback must finish successfully: ${updateCompatibilityFallback.run.stdout}${updateCompatibilityFallback.run.stderr}`);
  assert.deepEqual(updateCompatibilityFallback.patchArgs, ['--enhancements-file', updateCompatibilityFallback.configPath, '--allow-compatibility-fallback'], 'authorized updater fallback must opt in through the exact patcher argv');
  assert.equal(updateCompatibilityFallback.runtime, '(function(exports,require,module,__filename,__dirname){})', 'authorized updater fallback must commit the candidate runtime');
  assert.equal(updateCompatibilityFallback.sourceVersion, '2.1.225\n', 'authorized updater fallback must commit the candidate source marker');
  assert.deepEqual(updateCompatibilityFallback.vendor.candidate?.bytes, Buffer.from([0xca, 0xfe, 0xba, 0xbe]), 'authorized updater fallback must commit candidate native modules');
  assert.equal(updateCompatibilityFallback.vendor.oldNative, null, 'authorized updater fallback must retire prior native modules');
  assert.deepEqual(updateCompatibilityFallback.fallbackState, {
    schemaVersion: 1,
    sourceVersion: '2.1.225',
    clawgodVersion: fixtureSelfVersion,
    reason: 'bundle-patch-compatibility',
  }, 'authorized updater fallback must persist valid release-format compatibility state');
  assert.equal(updateCompatibilityFallback.chromeMarker, null, 'authorized updater fallback must skip the Chrome helper');
  assert.match(`${updateCompatibilityFallback.run.stdout}${updateCompatibilityFallback.run.stderr}`, /compatibility fallback/i, 'authorized updater fallback must emit a prominent compatibility warning');

  const firstInstallCompatibilityFailure = runLifecycleCase('first-install-compatibility-failure', [], {
    updateFailOpen: true,
    patchExit: 42,
  });
  assert.notEqual(firstInstallCompatibilityFailure.run.status, 0, 'first install must fail closed even when the compatibility environment is spoofed');
  assert.deepEqual(firstInstallCompatibilityFailure.patchArgs, ['--enhancements-file', firstInstallCompatibilityFailure.configPath], 'first install must not authorize the compatibility fallback patch argument');
  assert.equal(firstInstallCompatibilityFailure.runtime, null, 'first install compatibility failure must not retain a launcher-ready runtime');
  assert.equal(firstInstallCompatibilityFailure.fallbackState, null, 'first install compatibility failure must not write fallback state');

  const noUpgradeCompatibilityFailure = runLifecycleCase('no-upgrade-compatibility-failure', ['--no-upgrade'], {
    updateFailOpen: true,
    patchExit: 42,
    priorRuntime: 'prior installed runtime\n',
  });
  assert.notEqual(noUpgradeCompatibilityFailure.run.status, 0, '--no-upgrade must fail closed for a compatibility fallback');
  assert.deepEqual(noUpgradeCompatibilityFailure.patchArgs, ['--enhancements-file', noUpgradeCompatibilityFailure.configPath], '--no-upgrade must never pass the fallback authorization flag');
  assertPriorRuntimeRestored(noUpgradeCompatibilityFailure, '--no-upgrade compatibility failure');

  const noUpgradeSanityFailure = runLifecycleCase('no-upgrade-sanity-failure', ['--no-upgrade'], {
    sanityExit: 37,
    priorRuntime: 'prior installed runtime\n',
    priorFallback: true,
  });
  assert.notEqual(noUpgradeSanityFailure.run.status, 0, '--no-upgrade must fail when its directly verified runtime cannot load');
  assertPriorRuntimeRestored(noUpgradeSanityFailure, '--no-upgrade sanity failure', { fallback: priorFallbackState });
  assert.deepEqual(noUpgradeSanityFailure.transactionDirectories, [], '--no-upgrade sanity rollback must clean a verified transaction');

  const fatalAuthorizedPatcher = runLifecycleCase('fatal-authorized-patcher', [], {
    updateFailOpen: true,
    patchExit: 41,
    priorRuntime: 'prior installed runtime\n',
    priorFallback: true,
  });
  assert.notEqual(fatalAuthorizedPatcher.run.status, 0, 'non-42 patch failure must remain fatal even when fallback is authorized');
  assert.deepEqual(fatalAuthorizedPatcher.patchArgs, ['--enhancements-file', fatalAuthorizedPatcher.configPath, '--allow-compatibility-fallback'], 'authorized updater must still provide the fallback opt-in for a fatal patcher result');
  assertPriorRuntimeRestored(fatalAuthorizedPatcher, 'fatal authorized patcher', { fallback: priorFallbackState });

  const fullPatchClearsFallback = runLifecycleCase('full-patch-clears-fallback', [], {
    updateFailOpen: true,
    priorRuntime: 'prior installed runtime\n',
    priorFallback: true,
  });
  assert.equal(fullPatchClearsFallback.run.status, 0, `full patch must succeed: ${fullPatchClearsFallback.run.stdout}${fullPatchClearsFallback.run.stderr}`);
  assert.equal(fullPatchClearsFallback.fallbackState, null, 'full patch success must clear an old fallback state');
  assert.equal(fullPatchClearsFallback.chromeMarker, 'invoked\n', 'full patch success must run the Chrome helper before commit');

  const fallbackSanityFailure = runLifecycleCase('fallback-sanity-failure', [], {
    updateFailOpen: true,
    patchExit: 42,
    sanityExit: 37,
    priorRuntime: 'prior installed runtime\n',
    priorFallback: true,
  });
  assert.notEqual(fallbackSanityFailure.run.status, 0, 'fallback runtime sanity failure must fail the update');
  assertPriorRuntimeRestored(fallbackSanityFailure, 'fallback sanity failure', { fallback: priorFallbackState });
  assert.deepEqual(fallbackSanityFailure.transactionDirectories, [], 'fallback sanity rollback must clean a verified transaction');

  const fullPatchSanityFailure = runLifecycleCase('full-patch-sanity-failure', [], {
    updateFailOpen: true,
    sanityExit: 37,
    priorRuntime: 'prior installed runtime\n',
    priorFallback: true,
  });
  assert.notEqual(fullPatchSanityFailure.run.status, 0, 'full patch runtime sanity failure must fail the update');
  assertPriorRuntimeRestored(fullPatchSanityFailure, 'full patch sanity failure', { fallback: priorFallbackState });

  const candidateCanaryFailure = runLifecycleCase('candidate-canary-failure', [], {
    sanityExit: 37,
    sanityPanic: true,
    priorRuntime: 'prior installed runtime\n',
    priorFallback: true,
  });
  assert.notEqual(candidateCanaryFailure.run.status, 0, 'candidate runtime panic must fail checked publication');
  assertPriorRuntimeRestored(candidateCanaryFailure, 'candidate canary failure', { fallback: priorFallbackState });
  assert.equal(candidateCanaryFailure.vendorPublishCalls.length, 1, 'candidate runtime panic must invoke publish-checked exactly once');
  assert.equal(candidateCanaryFailure.runtimeCheckCalls.length, 1, 'candidate runtime panic must run exactly one checked runtime verification');
  assert.match(`${candidateCanaryFailure.run.stdout}${candidateCanaryFailure.run.stderr}`, /bun upgrade --canary/, 'candidate runtime panic must display shared Bun canary guidance');

  const fallbackVendorRollback = runLifecycleCase('fallback-vendor-rollback', [], {
    updateFailOpen: true,
    patchExit: 42,
    sanityExit: 37,
    priorRuntime: 'prior installed runtime\n',
    priorFallback: true,
  });
  assert.notEqual(fallbackVendorRollback.run.status, 0, 'fallback checked vendor sanity failure must fail the update');
  assertPriorRuntimeRestored(fallbackVendorRollback, 'fallback checked vendor rollback', { fallback: priorFallbackState });
  assert.deepEqual(fallbackVendorRollback.transactionDirectories, [], 'fallback checked vendor rollback must clean a verified transaction');

  const fallbackVendorConflict = runLifecycleCase('fallback-vendor-conflict', [], {
    updateFailOpen: true,
    patchExit: 42,
    priorRuntime: 'prior installed runtime\n',
    publishFault: true,
  });
  assert.notEqual(fallbackVendorConflict.run.status, 0, 'fallback vendor publication conflict must fail the update');
  assert.notEqual(fallbackVendorConflict.runtime, 'prior installed runtime\n', 'fallback vendor conflict must preserve the existing no-prior-runtime-restore boundary');
  assert.equal(fallbackVendorConflict.transactionDirectories.length, 1, 'fallback vendor conflict must retain recovery transaction evidence');
  assert.equal(fallbackVendorConflict.recoveryEvidence?.conflicts?.[0]?.reason, 'published-entry-identity-changed', 'fallback vendor conflict must retain the established identity-conflict evidence');

  const failed = runLifecycleCase('mandatory-patch-failure', [], {
    patchExit: 41,
    priorRuntime: 'prior installed runtime\n',
  });
  assert.notEqual(failed.run.status, 0, 'enabled mandatory patch failure must return nonzero');
  assert.deepEqual(failed.patchArgs, ['--enhancements-file', failed.configPath], 'failed patch must still use the exact saved config path');
  assert.equal(failed.runtime, 'prior installed runtime\n', 'enabled mandatory patch failure must restore the prior installed runtime');
  assert.equal(failed.sourceVersion, '2.1.225\n', 'enabled mandatory patch failure must restore the prior source marker');
  assert.deepEqual(failed.vendor.oldNative.bytes, Buffer.from([0x00, 0x11, 0x80, 0xff]), 'failed patch must restore prior native bytes');
  assert.equal(failed.vendor.oldNative.mode, 0o640, 'failed patch must restore prior native mode');
  assert.deepEqual(failed.vendor.oldOnly.bytes, Buffer.from([0xde, 0xad, 0xbe, 0xef]), 'failed patch must restore nested old-only vendor bytes');
  assert.equal(failed.vendor.oldOnly.mode, 0o605, 'failed patch must restore nested old-only vendor mode');
  assert.equal(failed.vendor.candidate, null, 'failed patch must not leave candidate native modules');
  assert.deepEqual(failed.vendor.ripgrep.bytes, Buffer.from([0x72, 0x67, 0x00, 0xff]), 'failed patch must preserve managed ripgrep bytes');
  assert.equal(failed.vendor.ripgrep.ino, failed.vendor.ripgrepBefore.ino, 'failed patch must preserve managed ripgrep identity');
  assert.deepEqual(failed.vendor.externalReplacement, Buffer.from([0x55, 0xaa]), 'failed patch rollback must preserve an unknown live vendor replacement');
  assert.deepEqual(failed.transactionDirectories, [], 'failed patch must remove staged candidate transaction data');
  assert.equal(failed.configBytes, '{\n  "schemaVersion": 1,\n  "mode": "custom",\n  "enabled": [\n    "agents",\n    "branding"\n  ]\n}\n', 'failed patch must preserve saved config bytes');
  assert.equal(failed.configAfter.ino, failed.configBefore.ino, 'failed patch must preserve saved config identity');

  const preflightFailed = runLifecycleCase('vendor-preflight-failure', [], {
    priorRuntime: 'prior installed runtime\n',
    preflightFault: true,
  });
  assert.notEqual(preflightFailed.run.status, 0, 'vendor preflight failure must return nonzero');
  assert.equal(preflightFailed.runtime, 'prior installed runtime\n', 'pre-mutation vendor failure must restore the prior CLI');
  assert.equal(preflightFailed.sourceVersion, '2.1.225\n', 'pre-mutation vendor failure must restore the prior source marker');
  assert.deepEqual(preflightFailed.vendor.oldNative.bytes, Buffer.from([0x00, 0x11, 0x80, 0xff]), 'pre-mutation vendor failure must preserve prior native bytes');
  assert.equal(preflightFailed.vendor.oldNative.ino, preflightFailed.vendor.oldNativeBefore.ino, 'pre-mutation vendor failure must preserve prior native identity');
  assert.equal(preflightFailed.vendor.candidate, null, 'pre-mutation vendor failure must not publish candidate modules');
  assert.deepEqual(preflightFailed.vendor.ripgrep.bytes, Buffer.from([0x72, 0x67, 0x00, 0xff]), 'pre-mutation vendor failure must preserve ripgrep bytes');
  assert.equal(preflightFailed.vendor.ripgrep.ino, preflightFailed.vendor.ripgrepBefore.ino, 'pre-mutation vendor failure must preserve ripgrep identity');
  assert.deepEqual(preflightFailed.transactionDirectories, [], 'verified pre-mutation rollback must clean staged transaction data');

  for (const fixture of [
    { label: 'live-vendor-symlink', option: 'liveVendorSymlink' },
    { label: 'candidate-vendor-symlink', option: 'candidateVendorSymlink' },
    { label: 'old-vendor-symlink', option: 'oldVendorSymlink' },
  ]) {
    const symlinkFailed = runLifecycleCase(fixture.label, [], {
      priorRuntime: 'prior installed runtime\n',
      [fixture.option]: true,
    });
    assert.notEqual(symlinkFailed.run.status, 0, `${fixture.label}: symlink root must be rejected`);
    assert.equal(symlinkFailed.runtime, 'prior installed runtime\n', `${fixture.label}: pre-mutation rejection must restore prior CLI`);
    assert.equal(symlinkFailed.sourceVersion, '2.1.225\n', `${fixture.label}: pre-mutation rejection must restore prior source marker`);
    assert.deepEqual(symlinkFailed.external.sentinel?.bytes, Buffer.from([0x5a, 0x00, 0xa5]), `${fixture.label}: external sentinel bytes must remain unchanged`);
    assert.equal(symlinkFailed.external.sentinel?.mode, 0o604, `${fixture.label}: external sentinel mode must remain unchanged`);
    assert.equal(symlinkFailed.external.sentinel?.ino, symlinkFailed.external.sentinelBefore?.ino, `${fixture.label}: external sentinel identity must remain unchanged`);
    assert.equal(symlinkFailed.external.sentinel?.type, 'file', `${fixture.label}: external sentinel type must remain a file`);
    assert.deepEqual(symlinkFailed.external.entries, symlinkFailed.external.entriesBefore, `${fixture.label}: helper must not mutate the external directory`);
    assert.equal(symlinkFailed.transactionDirectories.length, fixture.option === 'liveVendorSymlink' ? 0 : 1, `${fixture.label}: unsafe transaction roots must be retained instead of recursively cleaned`);
  }

  const rootReplaced = runLifecycleCase('live-vendor-root-replacement', [], {
    priorRuntime: 'prior installed runtime\n',
    rootReplacementFault: true,
  });
  assert.notEqual(rootReplaced.run.status, 0, 'live vendor identity replacement must fail publication');
  assert.notEqual(rootReplaced.runtime, 'prior installed runtime\n', 'root identity conflict must not restore the prior CLI');
  assert.deepEqual(rootReplaced.external.sentinel?.bytes, Buffer.from([0x5a, 0x00, 0xa5]), 'replacement-root sentinel bytes must remain unchanged');
  assert.equal(rootReplaced.external.sentinel?.mode, 0o604, 'replacement-root sentinel mode must remain unchanged');
  assert.equal(rootReplaced.external.sentinel?.ino, rootReplaced.external.sentinelBefore?.ino, 'replacement-root sentinel identity must remain unchanged');
  assert.equal(rootReplaced.external.sentinel?.type, 'file', 'replacement-root sentinel type must remain a file');
  assert.deepEqual(rootReplaced.external.entries, rootReplaced.external.entriesBefore, 'rollback must not add entries to an unknown replacement root');
  assert.equal(rootReplaced.transactionDirectories.length, 1, 'root identity conflict must retain transaction evidence');

  const publishFailed = runLifecycleCase('vendor-publish-failure', ['--version', '2.1.999'], {
    priorRuntime: 'prior installed runtime\n',
    publishFault: true,
  });
  assert.notEqual(publishFailed.run.status, 0, 'mid-publish failure must return nonzero');
  assert.notEqual(publishFailed.runtime, 'prior installed runtime\n', 'vendor conflict must not restore the prior CLI against an incomplete vendor');
  assert.notEqual(publishFailed.sourceVersion, '2.1.225\n', 'vendor conflict must not restore the prior source marker');
  assert.deepEqual(publishFailed.vendor.oldNative.bytes, Buffer.from([0x00, 0x11, 0x80, 0xff]), 'vendor conflict recovery must restore prior native bytes');
  assert.equal(publishFailed.vendor.oldNative.mode, 0o640, 'vendor conflict recovery must restore prior native mode');
  assert.equal(publishFailed.vendor.oldNative.ino, publishFailed.vendor.oldNativeBefore.ino, 'vendor conflict recovery must restore prior native identity');
  assert.deepEqual(publishFailed.vendor.oldOnly.bytes, Buffer.from([0xde, 0xad, 0xbe, 0xef]), 'vendor conflict recovery must restore nested old-only bytes');
  assert.equal(publishFailed.vendor.oldOnly.mode, 0o605, 'vendor conflict recovery must restore nested old-only mode');
  assert.deepEqual(publishFailed.vendor.candidate?.bytes, Buffer.from([0x99, 0x00, 0xfe]), 'unknown live replacement must remain at its original path');
  assert.equal(publishFailed.vendor.blocked, null, 'failed candidate entry must not appear live');
  assert.deepEqual(publishFailed.vendor.ripgrep.bytes, Buffer.from([0x72, 0x67, 0x00, 0xff]), 'mid-publish failure must preserve managed ripgrep bytes');
  assert.equal(publishFailed.vendor.ripgrep.ino, publishFailed.vendor.ripgrepBefore.ino, 'mid-publish failure must preserve managed ripgrep identity');
  assert.equal(publishFailed.transactionDirectories.length, 1, 'vendor conflict must retain one recovery transaction');
  assert.equal(publishFailed.recoveryEvidence?.conflicts?.[0]?.reason, 'published-entry-identity-changed', 'vendor conflict must retain explicit identity evidence');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('patcher install --no-upgrade control-flow checks passed');
