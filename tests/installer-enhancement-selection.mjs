#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderGeneratedPair } from '../build.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const unixLifecyclePath = join(root, 'src/unix/lifecycle.sh');
const unixLauncherPath = join(root, 'src/unix/launcher.sh');
const windowsLifecyclePath = join(root, 'src/windows/lifecycle.ps1');
const windowsLauncherPath = join(root, 'src/windows/launcher.cmd');

for (const path of [unixLifecyclePath, unixLauncherPath, windowsLifecyclePath, windowsLauncherPath]) {
  assert.equal(existsSync(path), true, `missing canonical platform source: ${path}`);
}

const unixLifecycle = readFileSync(unixLifecyclePath, 'utf8');
const unixLauncher = readFileSync(unixLauncherPath, 'utf8');
const windowsLifecycle = readFileSync(windowsLifecyclePath, 'utf8');
const windowsLauncher = readFileSync(windowsLauncherPath, 'utf8');
const generated = await renderGeneratedPair();
const generatedUnix = generated.find(pair => pair.output === 'dist/unix/install.sh').content;
const generatedWindows = generated.find(pair => pair.output === 'dist/win/install.ps1').content;
const manifest = JSON.parse(readFileSync(join(root, 'src/generic/enhancements.json'), 'utf8'));
const generatedConfigWriteStart = generatedUnix.indexOf('cat > "$CLAWGOD_DIR/enhancement-config.mjs"');
const generatedBootstrapStart = generatedUnix.lastIndexOf('\n', generatedConfigWriteStart - 2) + 1;
const generatedBootstrapEnd = generatedUnix.indexOf('\n\ncat > "$CLAWGOD_DIR/fetch-file.mjs"', generatedBootstrapStart);
assert.ok(
  generatedConfigWriteStart >= 0 && generatedBootstrapStart >= 0 && generatedBootstrapEnd > generatedBootstrapStart,
  'install.sh must retain the generated selection bootstrap',
);
const generatedSelectionBootstrap = generatedUnix.slice(generatedBootstrapStart, generatedBootstrapEnd);

assert.ok(generatedUnix.includes(unixLauncher), 'install.sh must embed the canonical Unix launcher source exactly');
assert.ok(generatedWindows.includes(windowsLauncher), 'install.ps1 must embed the canonical Windows launcher source exactly');
assert.match(generatedUnix, /ClawGod Plus 增强选择/, 'install.sh must embed the quick enhancement prompt');

const expectedIds = [
  'chrome',
  'computer-use',
  'agents',
  'planning',
  'voice',
  'auto-mode',
  'unrestricted-tools',
  'paste-images',
  'privacy',
  'branding',
  'claude-hud',
  'claude-mem',
  'superpowers',
];
assert.deepEqual(manifest.map(entry => entry.id), expectedIds, 'selection fixtures must follow manifest order');

const allConfig = `{
  "schemaVersion": 1,
  "mode": "all",
  "enabled": []
}
`;
const noneConfig = `{
  "schemaVersion": 1,
  "mode": "custom",
  "enabled": []
}
`;
const chromeBrandingConfig = `{
  "schemaVersion": 1,
  "mode": "custom",
  "enabled": [
    "chrome",
    "branding"
  ]
}
`;
const withoutFirstTwoConfig = `{
  "schemaVersion": 1,
  "mode": "custom",
  "enabled": [
    "agents",
    "planning",
    "voice",
    "auto-mode",
    "unrestricted-tools",
    "paste-images",
    "privacy",
    "branding",
    "claude-hud",
    "claude-mem",
    "superpowers"
  ]
}
`;
const withoutFirstConfig = `{
  "schemaVersion": 1,
  "mode": "custom",
  "enabled": [
    "computer-use",
    "agents",
    "planning",
    "voice",
    "auto-mode",
    "unrestricted-tools",
    "paste-images",
    "privacy",
    "branding",
    "claude-hud",
    "claude-mem",
    "superpowers"
  ]
}
`;
const withoutSecondConfig = `{
  "schemaVersion": 1,
  "mode": "custom",
  "enabled": [
    "chrome",
    "agents",
    "planning",
    "voice",
    "auto-mode",
    "unrestricted-tools",
    "paste-images",
    "privacy",
    "branding",
    "claude-hud",
    "claude-mem",
    "superpowers"
  ]
}
`;
function assertTemporaryPath(path, label, {
  pathApi = { isAbsolute, relative, resolve, sep },
  temporaryRoots = [resolve(tmpdir()), realpathSync(tmpdir())],
} = {}) {
  const resolvedPath = pathApi.resolve(path);
  const contained = temporaryRoots.some(rootPath => {
    const relativePath = pathApi.relative(pathApi.resolve(rootPath), resolvedPath);
    return relativePath !== ''
      && relativePath !== '..'
      && !relativePath.startsWith(`..${pathApi.sep}`)
      && !pathApi.isAbsolute(relativePath);
  });
  assert.ok(contained, `${label} must remain temporary`);
}

{
  const windowsTemporaryRoot = 'C:\\Users\\runneradmin\\AppData\\Local\\Temp';
  for (const candidate of [
    'C:\\Users\\runneradmin\\AppData\\Local\\Temp\\clawgod-selection-123',
    'C:\\Users\\runneradmin\\AppData\\Local\\Temp\\nested\\clawgod-selection-456',
  ]) {
    assert.doesNotThrow(
      () => assertTemporaryPath(candidate, 'synthetic Windows selection fixture', {
        pathApi: win32,
        temporaryRoots: [windowsTemporaryRoot],
      }),
      `Windows temporary descendant must be accepted: ${candidate}`,
    );
  }
  for (const candidate of [
    windowsTemporaryRoot,
    'C:\\Users\\runneradmin\\AppData\\Local\\Temp-sibling\\clawgod-selection-123',
    'C:\\Users\\runneradmin\\AppData\\Local\\Temp\\..\\outside\\clawgod-selection-123',
    'D:\\Temp\\clawgod-selection-123',
  ]) {
    assert.throws(
      () => assertTemporaryPath(candidate, 'synthetic Windows selection escape', {
        pathApi: win32,
        temporaryRoots: [windowsTemporaryRoot],
      }),
      /must remain temporary/,
      `Windows temporary boundary must reject: ${candidate}`,
    );
  }
}

function fixturePath(fixtureRoot) {
  assertTemporaryPath(fixtureRoot, 'selection fixture');
  const bin = join(fixtureRoot, 'fixture-only-bin');
  mkdirSync(bin, { recursive: true });
  for (const [name, target] of Object.entries({
    basename: '/usr/bin/basename',
    cat: '/bin/cat',
    chmod: '/bin/chmod',
    dirname: '/usr/bin/dirname',
    mkdir: '/bin/mkdir',
    rm: '/bin/rm',
    dd: '/bin/dd',
    stty: '/bin/stty',
  })) {
    const destination = join(bin, name);
    if (!existsSync(destination) && existsSync(target)) symlinkSync(target, destination);
  }
  return bin;
}

function createUnixFixture(prefix) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), prefix));
  assertTemporaryPath(fixtureRoot, prefix);
  const home = join(fixtureRoot, 'home with spaces');
  mkdirSync(home, { mode: 0o700 });
  const script = join(fixtureRoot, 'local installer.sh');
  writeFileSync(script, `#!/bin/bash\nset -e\n${unixLifecycle}\nconfigure_enhancement_selection\n`, 'utf8');
  chmodSync(script, 0o700);
  return { fixtureRoot, home, script, path: fixturePath(fixtureRoot) };
}

function selectionEnvironment(fixture, extra = {}) {
  return {
    HOME: fixture.home,
    PATH: fixture.path,
    BUN_BIN: process.execPath,
    BUN_INSTALL_CACHE_DIR: join(fixture.fixtureRoot, 'bun-install-cache'),
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(fixture.fixtureRoot, 'bun-transpiler-cache'),
    XDG_CACHE_HOME: join(fixture.fixtureRoot, 'xdg-cache'),
    CLAWGOD_ENHANCEMENT_CONFIG_MODULE: join(root, 'src/generic/enhancement-config.mjs'),
    CLAWGOD_ENHANCEMENT_MANIFEST_FILE: join(root, 'src/generic/enhancements.json'),
    ...extra,
  };
}

function assertOnlyConfig(home, expected) {
  assert.deepEqual(readdirSync(home), ['.clawgod'], 'selection must not create unrelated HOME entries');
  const clawgod = join(home, '.clawgod');
  assert.deepEqual(readdirSync(clawgod), ['enhancements.json'], 'selection must clean all transaction artifacts');
  assert.equal(readFileSync(join(clawgod, 'enhancements.json'), 'utf8'), expected, 'selection must persist exact canonical bytes');
}

function runUnix(args, { input = '', env = {}, prefix = 'clawgod-selection-' } = {}) {
  const fixture = createUnixFixture(prefix);
  const run = spawnSync('/bin/bash', [fixture.script, ...args], {
    encoding: 'utf8',
    input,
    env: selectionEnvironment(fixture, env),
  });
  return { fixture, run };
}

function cleanup(result) {
  rmSync(result.fixture.fixtureRoot, { recursive: true, force: true });
}

{
  const fixture = createUnixFixture('clawgod-selection-generated-bootstrap-');
  const bootstrapScript = join(fixture.fixtureRoot, 'generated selection bootstrap.sh');
  writeFileSync(
    bootstrapScript,
    `#!/bin/bash\nset -e\numask 022\n${unixLifecycle}\n${generatedSelectionBootstrap}\n`,
    'utf8',
  );
  chmodSync(bootstrapScript, 0o700);
  try {
    const run = spawnSync('/bin/bash', [bootstrapScript], {
      encoding: 'utf8',
      env: selectionEnvironment(fixture, {
        CLAWGOD_ENHANCEMENT_CONFIG_MODULE: '',
        CLAWGOD_ENHANCEMENT_MANIFEST_FILE: '',
      }),
    });
    assert.equal(run.status, 0, run.stderr);
    const clawgod = join(fixture.home, '.clawgod');
    assert.equal(statSync(clawgod).mode & 0o7777, 0o700, 'generated bootstrap must create the managed directory as exact 0700 under umask 022');
    assert.deepEqual(
      readdirSync(clawgod).sort(),
      ['enhancement-config.mjs', 'enhancement-manifest.json', 'enhancements.json'],
      'generated bootstrap must create only its config engine, manifest, and saved selection',
    );
    assert.equal(readFileSync(join(clawgod, 'enhancements.json'), 'utf8'), allConfig);
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true });
  }
}

{
  const fixture = createUnixFixture('clawgod-selection-generated-legacy-directory-');
  const clawgod = join(fixture.home, '.clawgod');
  mkdirSync(clawgod, { mode: 0o755 });
  chmodSync(clawgod, 0o755);
  writeFileSync(join(clawgod, 'enhancements.json'), chromeBrandingConfig, { mode: 0o600 });
  writeFileSync(join(clawgod, 'user-kept.txt'), 'keep me\n', { mode: 0o600 });
  const bootstrapScript = join(fixture.fixtureRoot, 'generated legacy selection bootstrap.sh');
  writeFileSync(
    bootstrapScript,
    `#!/bin/bash\nset -e\numask 022\n${unixLifecycle}\n${generatedSelectionBootstrap}\n`,
    'utf8',
  );
  chmodSync(bootstrapScript, 0o700);
  try {
    const run = spawnSync('/bin/bash', [bootstrapScript], {
      encoding: 'utf8',
      env: selectionEnvironment(fixture, {
        CLAWGOD_ENHANCEMENT_CONFIG_MODULE: '',
        CLAWGOD_ENHANCEMENT_MANIFEST_FILE: '',
      }),
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(statSync(clawgod).mode & 0o7777, 0o700, 'generated bootstrap must safely migrate a legacy 0755 managed directory to 0700');
    assert.equal(readFileSync(join(clawgod, 'enhancements.json'), 'utf8'), chromeBrandingConfig, 'legacy migration must preserve the saved selection');
    assert.equal(readFileSync(join(clawgod, 'user-kept.txt'), 'utf8'), 'keep me\n', 'legacy migration must preserve unrelated user files');
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true });
  }
}

{
  const fixture = createUnixFixture('clawgod-selection-generated-unsafe-directory-');
  const clawgod = join(fixture.home, '.clawgod');
  mkdirSync(clawgod, { mode: 0o777 });
  chmodSync(clawgod, 0o777);
  writeFileSync(join(clawgod, 'user-kept.txt'), 'keep me\n', { mode: 0o600 });
  const bootstrapScript = join(fixture.fixtureRoot, 'generated unsafe selection bootstrap.sh');
  writeFileSync(
    bootstrapScript,
    `#!/bin/bash\nset -e\numask 022\n${unixLifecycle}\n${generatedSelectionBootstrap}\n`,
    'utf8',
  );
  chmodSync(bootstrapScript, 0o700);
  try {
    const run = spawnSync('/bin/bash', [bootstrapScript], {
      encoding: 'utf8',
      env: selectionEnvironment(fixture, {
        CLAWGOD_ENHANCEMENT_CONFIG_MODULE: '',
        CLAWGOD_ENHANCEMENT_MANIFEST_FILE: '',
      }),
    });
    assert.notEqual(run.status, 0, 'generated bootstrap must reject a non-legacy unsafe managed directory');
    assert.equal(statSync(clawgod).mode & 0o7777, 0o777, 'unsafe managed directory mode must not be silently repaired');
    assert.deepEqual(readdirSync(clawgod), ['user-kept.txt'], 'unsafe managed directory rejection must happen before writing embedded files');
    assert.equal(readFileSync(join(clawgod, 'user-kept.txt'), 'utf8'), 'keep me\n');
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true });
  }
}

{
  const result = runUnix(['--enhancements', 'branding,chrome']);
  try {
    assert.equal(result.run.status, 0, result.run.stderr);
    assertOnlyConfig(result.fixture.home, chromeBrandingConfig);
    assert.doesNotMatch(`${result.run.stdout}${result.run.stderr}`, /Choice:/, 'explicit CSV must not prompt');
  } finally {
    cleanup(result);
  }
}

{
  const result = runUnix(['--choose-enhancements', '--enhancements', 'none']);
  try {
    assert.equal(result.run.status, 0, result.run.stderr);
    assertOnlyConfig(result.fixture.home, noneConfig);
    assert.doesNotMatch(`${result.run.stdout}${result.run.stderr}`, /Choice:|interactive enhancement selection unavailable/i, 'explicit CSV must win over choose regardless of parser order');
  } finally {
    cleanup(result);
  }
}

{
  const fixture = createUnixFixture('clawgod-selection-explicit-over-saved-');
  try {
    const clawgod = join(fixture.home, '.clawgod');
    mkdirSync(clawgod, { mode: 0o700 });
    writeFileSync(join(clawgod, 'enhancements.json'), chromeBrandingConfig, { mode: 0o600 });
    const run = spawnSync('/bin/bash', [fixture.script, '--choose-enhancements', '--enhancements', 'none'], {
      encoding: 'utf8',
      env: selectionEnvironment(fixture),
    });
    const output = `${run.stdout}${run.stderr}`;
    assert.equal(run.status, 0, run.stderr);
    assertOnlyConfig(fixture.home, noneConfig);
    assert.doesNotMatch(output, /Choice:|interactive enhancement selection unavailable/i, 'Unix explicit CSV must override both saved config and choose');
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true });
  }
}

{
  const result = runUnix([], { input: 'n\n', prefix: 'clawgod-selection-ordinary-' });
  try {
    assert.equal(result.run.status, 0, result.run.stderr);
    assertOnlyConfig(result.fixture.home, allConfig);
    assert.doesNotMatch(`${result.run.stdout}${result.run.stderr}`, /Choice:/, 'ordinary install must never prompt');
  } finally {
    cleanup(result);
  }
}

{
  const result = runUnix(['--choose-enhancements'], { prefix: 'clawgod-selection-no-tty-' });
  try {
    assert.equal(result.run.status, 0, result.run.stderr);
    assertOnlyConfig(result.fixture.home, allConfig);
    const output = `${result.run.stdout}${result.run.stderr}`;
    assert.equal((output.match(/interactive enhancement selection unavailable/gi) || []).length, 1, 'explicit choose without TTY must warn exactly once');
    assert.doesNotMatch(output, /Choice:/, 'explicit choose without TTY must not prompt');
  } finally {
    cleanup(result);
  }
}

{
  const fixture = createUnixFixture('clawgod-selection-saved-');
  try {
    const clawgod = join(fixture.home, '.clawgod');
    const configPath = join(clawgod, 'enhancements.json');
    mkdirSync(clawgod, { mode: 0o700 });
    writeFileSync(configPath, chromeBrandingConfig, { mode: 0o600 });
    const before = statSync(configPath);
    const rerun = spawnSync('/bin/bash', [fixture.script], {
      encoding: 'utf8',
      env: selectionEnvironment(fixture),
    });
    assert.equal(rerun.status, 0, rerun.stderr);
    assertOnlyConfig(fixture.home, chromeBrandingConfig);
    const after = statSync(configPath);
    assert.equal(after.mode & 0o7777, before.mode & 0o7777, 'saved selection must preserve config mode');
    assert.equal(after.ino, before.ino, 'saved selection must preserve config identity');
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true });
  }
}

{
  const fixture = createUnixFixture('clawgod-selection-saved-no-tty-');
  try {
    const clawgod = join(fixture.home, '.clawgod');
    mkdirSync(clawgod, { mode: 0o700 });
    writeFileSync(join(clawgod, 'enhancements.json'), chromeBrandingConfig, { mode: 0o600 });
    const rerun = spawnSync('/bin/bash', [fixture.script, '--choose-enhancements'], {
      encoding: 'utf8',
      env: selectionEnvironment(fixture),
    });
    assert.equal(rerun.status, 0, rerun.stderr);
    assertOnlyConfig(fixture.home, chromeBrandingConfig);
    assert.equal((`${rerun.stdout}${rerun.stderr}`.match(/interactive enhancement selection unavailable/gi) || []).length, 1, 'saved fallback must warn exactly once');
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true });
  }
}

{
  const fixture = createUnixFixture('clawgod-selection-piped-installer-');
  try {
    const scriptSource = `#!/bin/bash\nset -e\n${unixLifecycle}\nconfigure_enhancement_selection\n`;
    const run = spawnSync('/bin/bash', ['-s', '--', '--choose-enhancements'], {
      encoding: 'utf8',
      input: scriptSource,
      env: selectionEnvironment(fixture),
    });
    assert.equal(run.status, 0, run.stderr);
    assertOnlyConfig(fixture.home, allConfig);
    assert.equal((`${run.stdout}${run.stderr}`.match(/interactive enhancement selection unavailable/gi) || []).length, 1, 'piped installer choose must warn exactly once');
    assert.doesNotMatch(`${run.stdout}${run.stderr}`, /Choice:/, 'piped installer must not prompt');
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true });
  }
}

function findScriptCommand() {
  for (const path of ['/usr/bin/script', '/bin/script']) {
    if (existsSync(path)) return path;
  }
  return null;
}

function countOccurrences(output, literal) {
  return output.split(literal).length - 1;
}

function runUnixTtyCase(label, lines, expected, {
  args = ['--choose-enhancements'],
  env = {},
  keys = null,
  expectedStatus = 0,
  expectedMenuCount = 1,
  expectedPromptCount = expectedMenuCount,
  expectedModeMenuCount = 0,
  expectedUnreadLine = null,
  expectedWarnings = [],
} = {}) {
  const fixture = createUnixFixture(`clawgod-selection-tty-${label}-`);
  const scriptCommand = findScriptCommand();
  assert.ok(scriptCommand, 'Unix interaction tests require the platform script utility for a controlling terminal');
  const runner = join(fixture.fixtureRoot, 'tty-runner');
  const installerCommand = `/bin/bash ${JSON.stringify(fixture.script)} ${args.map(value => JSON.stringify(value)).join(' ')}`;
  const runnerSource = expectedUnreadLine === null
    ? `#!/bin/bash\nexec ${installerCommand}\n`
    : `#!/bin/bash\n${installerCommand}\nIFS= read -r clawgod_test_unread < /dev/tty\nprintf 'CLAWGOD_TEST_UNREAD=%s\\n' "$clawgod_test_unread"\n`;
  writeFileSync(runner, runnerSource, 'utf8');
  chmodSync(runner, 0o700);
  try {
    const feed = keys === null ? `${lines.join('\n')}\n` : keys;
    const shellCommand = process.platform === 'darwin'
      ? '{ /bin/sleep 0.1; printf %s "$1"; /bin/sleep 0.1; } | "$2" -q -e /dev/null "$3"'
      : '{ /bin/sleep 0.1; printf %s "$1"; /bin/sleep 0.1; } | "$2" -q -e -c "$3" /dev/null';
    const run = spawnSync('/bin/bash', [
      '-c',
      shellCommand,
      'clawgod-tty-test',
      feed,
      scriptCommand,
      runner,
    ], {
      encoding: 'utf8',
      env: selectionEnvironment(fixture, env),
      timeout: 10_000,
    });
    const output = `${run.stdout}${run.stderr}`;
    assert.equal(run.status, expectedStatus, `${label}: ${output}`);
    assert.equal(countOccurrences(output, '  Enhancements'), expectedMenuCount, `${label}: exact menu count`);
    assert.equal(countOccurrences(output, '  ↑/↓ 移动'), expectedPromptCount, `${label}: exact prompt count`);
    assert.equal(countOccurrences(output, 'ClawGod Plus 增强选择'), expectedModeMenuCount, `${label}: exact quick-menu count`);
    for (const warning of expectedWarnings) {
      assert.equal(countOccurrences(output, warning), 1, `${label}: exact warning count for ${warning}`);
    }
    assert.equal(
      countOccurrences(output, 'Invalid enhancement choice:'),
      expectedWarnings.filter(warning => warning.startsWith('Invalid enhancement choice:')).length,
      `${label}: no unexpected invalid-choice warnings`,
    );
    assert.equal(
      countOccurrences(output, 'Interactive enhancement selection unavailable; using saved selection or all enhancements.'),
      expectedWarnings.filter(warning => warning.startsWith('Interactive enhancement selection unavailable;')).length,
      `${label}: no unexpected interaction warnings`,
    );
    if (expectedUnreadLine !== null) {
      assert.equal(countOccurrences(output, `CLAWGOD_TEST_UNREAD=${expectedUnreadLine}`), 1, `${label}: installer must leave terminal input unread`);
    }
    if (expectedMenuCount > 0) {
      const promptIndex = output.indexOf('  ↑/↓ 移动');
      const firstMenu = promptIndex === -1 ? output : output.slice(0, promptIndex);
      let cursor = -1;
      for (const [index, id] of expectedIds.entries()) {
        const next = firstMenu.indexOf(`${index + 1})`, cursor + 1);
        assert.ok(next > cursor, `${label}: prompt must keep manifest index ${index + 1}; output=${JSON.stringify(output)}`);
        assert.ok(firstMenu.indexOf(id, next) >= next, `${label}: prompt must show stable ID ${id}`);
        cursor = next;
      }
    }
    if (expectedStatus === 0) {
      assertOnlyConfig(fixture.home, expected);
    } else {
      assert.deepEqual(readdirSync(fixture.home), [], `${label}: cancelled install must not write any config`);
      assert.equal(countOccurrences(output, '已取消安装'), 1, `${label}: cancel must print hint once`);
    }
    return output;
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true });
  }
}

runUnixTtyCase('enter', [], allConfig, { keys: '\r', expectedMenuCount: 1 });
runUnixTtyCase('space-toggle-first', [], withoutFirstConfig, { keys: ' \r', expectedMenuCount: 2 });
runUnixTtyCase('arrow-toggle', [], withoutSecondConfig, { keys: '\x1b[B \r', expectedMenuCount: 3 });
runUnixTtyCase('uncheck-all', [], noneConfig, { keys: ' ' + '\x1b[B '.repeat(12) + '\r', expectedMenuCount: 26 });
runUnixTtyCase('cursor-wrap', [], withoutFirstConfig, {
  keys: '\x1b[B'.repeat(13) + ' \r',
  expectedMenuCount: 15,
});
runUnixTtyCase('eof-confirm', [], allConfig, { keys: '', expectedMenuCount: 1 });

{
  const output = runUnixTtyCase('arrow-cursor-frame', [], withoutSecondConfig, {
    keys: '\x1b[B \r',
    expectedMenuCount: 3,
  });
  assert.ok(output.includes('>  2) [ ] computer-use'), 'arrow-down frame must mark row 2 with >');
}
{
  const output = runUnixTtyCase('wrap-cursor-frame', [], withoutFirstConfig, {
    keys: '\x1b[B'.repeat(13) + ' \r',
    expectedMenuCount: 15,
  });
  assert.ok(output.includes('>  1) [ ] chrome'), 'wrapped cursor frame must mark row 1 with >');
}
runUnixTtyCase('ci', ['ci-input-must-remain-unread'], allConfig, {
  env: { CI: '1' },
  expectedMenuCount: 0,
  expectedUnreadLine: 'ci-input-must-remain-unread',
  expectedWarnings: ['Interactive enhancement selection unavailable; using saved selection or all enhancements.'],
});
runUnixTtyCase('auto-enter', [], allConfig, { args: [], keys: '\r', expectedMenuCount: 0, expectedModeMenuCount: 1 });
runUnixTtyCase('auto-all', [], allConfig, { args: [], keys: '1', expectedMenuCount: 0, expectedModeMenuCount: 1 });
runUnixTtyCase('auto-core', [], noneConfig, { args: [], keys: '2', expectedMenuCount: 0, expectedModeMenuCount: 1 });
runUnixTtyCase('auto-invalid', [], noneConfig, {
  args: [],
  keys: 'x2',
  expectedMenuCount: 0,
  expectedModeMenuCount: 2,
  expectedWarnings: ['Invalid enhancement choice: x'],
});
runUnixTtyCase('custom-escape-return', [], allConfig, {
  args: [],
  keys: '3\x1b\r',
  expectedMenuCount: 1,
  expectedModeMenuCount: 2,
});
runUnixTtyCase('mode-escape-exit', [], allConfig, {
  args: [],
  keys: '\x1b',
  expectedStatus: 130,
  expectedMenuCount: 0,
  expectedModeMenuCount: 1,
});
runUnixTtyCase('choose-escape-exit', [], allConfig, {
  args: ['--choose-enhancements'],
  keys: '\x1b',
  expectedStatus: 130,
  expectedMenuCount: 1,
});
runUnixTtyCase('auto-custom', [], withoutFirstTwoConfig, {
  args: [],
  keys: '3 \x1b[B \r',
  expectedMenuCount: 4,
  expectedModeMenuCount: 1,
});
runUnixTtyCase('auto-noninteractive-env', ['input-must-remain-unread'], allConfig, {
  args: [],
  env: { CLAWGOD_NONINTERACTIVE: '1' },
  expectedMenuCount: 0,
  expectedModeMenuCount: 0,
  expectedUnreadLine: 'input-must-remain-unread',
});

{
  const result = runUnix(['--choose-enhancements'], { env: { CI: '1' }, prefix: 'clawgod-selection-ci-' });
  try {
    assert.equal(result.run.status, 0, result.run.stderr);
    assertOnlyConfig(result.fixture.home, allConfig);
    assert.doesNotMatch(`${result.run.stdout}${result.run.stderr}`, /Choice:/, 'CI must not prompt');
  } finally {
    cleanup(result);
  }
}

assert.match(windowsLifecycle, /\[string\]\$Enhancements/, 'PowerShell lifecycle must expose -Enhancements <csv>');
assert.match(windowsLifecycle, /\[switch\]\$ChooseEnhancements/, 'PowerShell lifecycle must expose -ChooseEnhancements');
assert.match(windowsLifecycle, /Read-Host/, 'PowerShell direct local interaction must use Read-Host');
assert.match(windowsLifecycle, /IsInputRedirected/, 'PowerShell interaction must reject redirected input');
assert.match(windowsLifecycle, /\[int\]::TryParse/, 'PowerShell menu parsing must reject integer overflow without terminating interaction');
assert.match(windowsLifecycle, /ClawGod Plus 增强选择/, 'PowerShell lifecycle must embed the quick enhancement prompt');
const windowsExplicitBranch = windowsLifecycle.indexOf('if ($EnhancementsSpecified)');
const windowsChooseBranch = windowsLifecycle.indexOf('if ($ChooseEnhancements)', windowsExplicitBranch);
const windowsExplicitWrite = windowsLifecycle.indexOf('Write-EnhancementSelection -Explicit $Enhancements', windowsExplicitBranch);
const windowsAutoBranch = windowsLifecycle.indexOf('elseif (Test-EnhancementAutoPromptAvailable)', windowsChooseBranch);
assert.ok(windowsExplicitBranch >= 0 && windowsChooseBranch > windowsExplicitBranch, 'PowerShell explicit selection branch must precede choose');
assert.ok(
  windowsExplicitWrite >= windowsExplicitBranch && windowsExplicitWrite < windowsChooseBranch,
  'PowerShell explicit branch must persist its CSV before choose can run',
);
assert.ok(windowsAutoBranch > windowsChooseBranch, 'PowerShell auto prompt branch must follow explicit choose');
for (const id of expectedIds) assert.match(windowsLifecycle, new RegExp(`['\"]${id}['\"]`), `PowerShell menu must include ${id}`);

function findPwsh() {
  const pathValue = process.env.PATH || process.env.Path || '';
  for (const directory of pathValue.split(delimiter)) {
    for (const name of process.platform === 'win32' ? ['pwsh.exe', 'pwsh'] : ['pwsh']) {
      const candidate = join(directory, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function createPowerShellFixture(prefix, promptAnswers = null) {
  const fixture = createUnixFixture(prefix);
  const script = join(fixture.fixtureRoot, 'selection fixture.ps1');
  writeFileSync(script, `${windowsLifecycle}
function Write-Warn {
    param([string]$Message)
    [Console]::Error.WriteLine($Message)
}
$BunBin = $env:CLAWGOD_TEST_BUN
if ($env:CLAWGOD_TEST_PROMPT_ANSWERS) {
    $script:ClawGodTestPromptAnswers = @(ConvertFrom-Json $env:CLAWGOD_TEST_PROMPT_ANSWERS)
    $script:ClawGodTestPromptIndex = 0
    function Test-EnhancementInteractionAvailable { return $true }
    function Read-Host {
        param([string]$Prompt)
        if ($script:ClawGodTestPromptIndex -ge $script:ClawGodTestPromptAnswers.Count) {
            throw 'prompt fixture exhausted'
        }
        $answer = [string]$script:ClawGodTestPromptAnswers[$script:ClawGodTestPromptIndex]
        $script:ClawGodTestPromptIndex++
        Write-Host ('{0}:' -f $Prompt)
        return $answer
    }
}
Initialize-EnhancementSelection
`, 'utf8');
  return { ...fixture, script, promptAnswers };
}

function powerShellEnvironment(fixture, extra = {}) {
  const platformEnvironment = process.platform === 'win32'
    ? {
      SystemRoot: process.env.SystemRoot,
      COMSPEC: process.env.COMSPEC,
      PATHEXT: process.env.PATHEXT,
    }
    : {};
  return {
    ...platformEnvironment,
    HOME: fixture.home,
    USERPROFILE: fixture.home,
    PATH: fixture.path,
    CLAWGOD_TEST_BUN: process.execPath,
    BUN_INSTALL_CACHE_DIR: join(fixture.fixtureRoot, 'bun-install-cache'),
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(fixture.fixtureRoot, 'bun-transpiler-cache'),
    XDG_CACHE_HOME: join(fixture.fixtureRoot, 'xdg-cache'),
    CLAWGOD_ENHANCEMENT_CONFIG_MODULE: join(root, 'src/generic/enhancement-config.mjs'),
    CLAWGOD_ENHANCEMENT_MANIFEST_FILE: join(root, 'src/generic/enhancements.json'),
    ...(fixture.promptAnswers === null ? {} : { CLAWGOD_TEST_PROMPT_ANSWERS: JSON.stringify(fixture.promptAnswers) }),
    ...extra,
  };
}

function runPowerShell(pwsh, label, args, expected, { promptAnswers = null, prepare, env = {} } = {}) {
  const fixture = createPowerShellFixture(`clawgod-selection-pwsh-${label}-`, promptAnswers);
  try {
    if (prepare) prepare(fixture);
    const run = spawnSync(pwsh, ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fixture.script, ...args], {
      encoding: 'utf8',
      env: powerShellEnvironment(fixture, env),
    });
    assert.equal(run.status, 0, `${label}: ${run.stdout}${run.stderr}`);
    assertOnlyConfig(fixture.home, expected);
    return `${run.stdout}${run.stderr}`;
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true });
  }
}

const pwsh = findPwsh();
if (pwsh) {
  let output = runPowerShell(pwsh, 'explicit', ['-Enhancements', 'branding,chrome'], chromeBrandingConfig);
  assert.doesNotMatch(output, /Choice|interactive enhancement selection unavailable/i, 'PowerShell explicit CSV must not prompt');
  output = runPowerShell(pwsh, 'explicit-precedence', ['-ChooseEnhancements', '-Enhancements', 'none'], noneConfig, {
    prepare(fixture) {
      const clawgod = join(fixture.home, '.clawgod');
      mkdirSync(clawgod, { mode: 0o700 });
      writeFileSync(join(clawgod, 'enhancements.json'), chromeBrandingConfig, { mode: 0o600 });
    },
  });
  assert.doesNotMatch(output, /Choice|interactive enhancement selection unavailable/i, 'PowerShell explicit CSV must win over choose');

  runPowerShell(pwsh, 'ordinary', [], allConfig);
  output = runPowerShell(pwsh, 'auto-enter', [], allConfig, { promptAnswers: [''] });
  assert.doesNotMatch(output, /interactive enhancement selection unavailable/i, 'PowerShell auto prompt must not fall back');
  assert.equal(countOccurrences(output, 'ClawGod Plus 增强选择'), 1, 'PowerShell auto prompt exact quick-menu count');
  runPowerShell(pwsh, 'auto-core', [], noneConfig, { promptAnswers: ['2'] });
  runPowerShell(pwsh, 'auto-custom', [], withoutFirstTwoConfig, { promptAnswers: ['3', '1,2', ''] });
  runPowerShell(pwsh, 'auto-noninteractive', [], allConfig, {
    env: { CLAWGOD_NONINTERACTIVE: '1' },
    promptAnswers: [],
  });
  runPowerShell(pwsh, 'saved', [], chromeBrandingConfig, {
    prepare(fixture) {
      const clawgod = join(fixture.home, '.clawgod');
      mkdirSync(clawgod, { mode: 0o700 });
      writeFileSync(join(clawgod, 'enhancements.json'), chromeBrandingConfig, { mode: 0o600 });
    },
  });

  output = runPowerShell(pwsh, 'no-tty', ['-ChooseEnhancements'], allConfig);
  assert.equal((output.match(/interactive enhancement selection unavailable/gi) || []).length, 1, 'PowerShell choose without a console must warn exactly once');
  output = runPowerShell(pwsh, 'saved-no-tty', ['-ChooseEnhancements'], chromeBrandingConfig, {
    prepare(fixture) {
      const clawgod = join(fixture.home, '.clawgod');
      mkdirSync(clawgod, { mode: 0o700 });
      writeFileSync(join(clawgod, 'enhancements.json'), chromeBrandingConfig, { mode: 0o600 });
    },
  });
  assert.equal((output.match(/interactive enhancement selection unavailable/gi) || []).length, 1, 'PowerShell saved no-console fallback must warn exactly once');

  output = runPowerShell(pwsh, 'ci', ['-ChooseEnhancements'], allConfig, { env: { CI: '1' } });
  assert.equal((output.match(/interactive enhancement selection unavailable/gi) || []).length, 1, 'PowerShell CI choose must warn exactly once');

  for (const [label, promptAnswers, expected, warnings] of [
    ['enter', [''], allConfig, []],
    ['numbers', ['1,2', ''], withoutFirstTwoConfig, []],
    ['none', ['n', ''], noneConfig, []],
    ['none-all', ['n,a', ''], allConfig, []],
    ['invalid-valid', ['99', 'n', ''], noneConfig, ['Invalid enhancement choice: 99']],
    ['invalid-overflow', ['18446744073709551617', ''], allConfig, ['Invalid enhancement choice: 18446744073709551617']],
  ]) {
    output = runPowerShell(pwsh, `prompt-${label}`, ['-ChooseEnhancements'], expected, { promptAnswers });
    assert.doesNotMatch(output, /interactive enhancement selection unavailable/i, `PowerShell ${label} prompt must not fall back`);
    assert.equal(countOccurrences(output, '  Enhancements'), promptAnswers.length, `PowerShell ${label} exact menu count`);
    assert.equal(countOccurrences(output, '  Choice:'), promptAnswers.length, `PowerShell ${label} exact prompt count`);
    for (const warning of warnings) assert.equal(countOccurrences(output, warning), 1, `PowerShell ${label} exact warning count`);
    assert.equal(countOccurrences(output, 'Invalid enhancement choice:'), warnings.length, `PowerShell ${label} no unexpected invalid warnings`);
    if (label === 'enter') {
      let cursor = -1;
      for (const [index, id] of expectedIds.entries()) {
        const next = output.indexOf(`${index + 1})`, cursor + 1);
        assert.ok(next > cursor, `PowerShell prompt must keep manifest index ${index + 1}`);
        assert.ok(output.indexOf(id, next) >= next, `PowerShell prompt must show stable ID ${id}`);
        cursor = next;
      }
    }
  }
} else {
  console.log('PowerShell native enhancement selection checks skipped: pwsh unavailable');
}

console.log('installer enhancement selection checks passed');
