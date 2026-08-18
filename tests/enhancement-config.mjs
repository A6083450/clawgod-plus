#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderGeneratedPair } from '../build.mjs';
import {
  ENHANCEMENT_CONFIG_DIRECTORY_MODE,
  ENHANCEMENT_CONFIG_FILE_MODE,
  enhancementConfigPath,
  loadEnhancementManifest,
  normalizeEnhancementSelection,
  parseExplicitEnhancementSelection,
  parseStoredEnhancementConfig,
  readEnhancementConfig,
  resolveEnhancementSelection,
  selectionToStoredEnhancementConfig,
  serializeEnhancementConfig,
  validateStoredEnhancementConfig,
  writeEnhancementConfig,
} from '../src/generic/enhancement-config.mjs';

const EXPECTED_IDS = [
  'chrome',
  'computer-use',
  'design-canvas',
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
const EXPECTED_MANIFEST = [
  { id: 'chrome', kind: 'patch' },
  { id: 'computer-use', kind: 'patch' },
  { id: 'design-canvas', kind: 'patch' },
  { id: 'agents', kind: 'patch' },
  { id: 'planning', kind: 'patch' },
  { id: 'voice', kind: 'patch' },
  { id: 'auto-mode', kind: 'patch' },
  { id: 'unrestricted-tools', kind: 'patch' },
  { id: 'paste-images', kind: 'patch' },
  { id: 'privacy', kind: 'patch' },
  { id: 'branding', kind: 'patch' },
  { id: 'claude-hud', kind: 'plugin' },
  { id: 'claude-mem', kind: 'plugin' },
  { id: 'superpowers', kind: 'plugin' },
];
const CONFIG_ALL = { schemaVersion: 1, mode: 'all', enabled: [] };
const CONFIG_CUSTOM = { schemaVersion: 1, mode: 'custom', enabled: ['chrome', 'branding'] };
const ALL_BYTES = `${JSON.stringify(CONFIG_ALL, null, 2)}\n`;
const CUSTOM_BYTES = `${JSON.stringify(CONFIG_CUSTOM, null, 2)}\n`;
const REAL_HOME = realpathSync(homedir());
const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function canonicalManifestJson(entries) {
  return `[\n${entries.map(entry => `  { "id": ${JSON.stringify(entry.id)}, "kind": ${JSON.stringify(entry.kind)} }`).join(',\n')}\n]\n`;
}

function manifestFrom(entries = EXPECTED_MANIFEST, filename = 'enhancements.json') {
  return loadEnhancementManifest(canonicalManifestJson(entries), { filename });
}

function makeHome(label) {
  const home = mkdtempSync(join(tmpdir(), `clawgod-enhancement-${label}-`));
  chmodSync(home, 0o700);
  assert.notEqual(realpathSync(home), REAL_HOME, 'fixtures must never use the real HOME');
  return home;
}

async function withHome(label, callback) {
  const home = makeHome(label);
  try {
    return await callback(home);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

function prepareExisting(home, bytes = ALL_BYTES, mode = 0o600) {
  const configDirectory = join(home, '.clawgod');
  mkdirSync(configDirectory, { mode: 0o700 });
  chmodSync(configDirectory, 0o700);
  const path = join(configDirectory, 'enhancements.json');
  writeFileSync(path, bytes, { mode });
  chmodSync(path, mode);
  return path;
}

function proxyFileSystem(overrides) {
  return new Proxy(fsPromises, {
    get(target, property) {
      if (Object.hasOwn(overrides, property)) return overrides[property];
      return Reflect.get(target, property);
    },
  });
}

function syntheticWindowsStatus(status) {
  const syntheticMode = status.isDirectory() ? 0o777 : 0o666;
  return new Proxy(status, {
    get(target, property) {
      if (property === 'mode') return (target.mode & ~0o777) | syntheticMode;
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function syntheticWindowsFileSystem() {
  return proxyFileSystem({
    lstat: async path => syntheticWindowsStatus(await fsPromises.lstat(path)),
    open: async (...args) => {
      const handle = await fsPromises.open(...args);
      return new Proxy(handle, {
        get(fileHandle, property) {
          if (property === 'stat') return async () => syntheticWindowsStatus(await fileHandle.stat());
          const value = Reflect.get(fileHandle, property);
          return typeof value === 'function' ? value.bind(fileHandle) : value;
        },
      });
    },
  });
}

const manifestSource = readFileSync(new URL('../src/generic/enhancements.json', import.meta.url), 'utf8');
const manifest = loadEnhancementManifest(manifestSource, { filename: 'enhancements.json' });
assert.deepEqual(manifest, EXPECTED_MANIFEST, 'the shared manifest must preserve the exact Task 6 entries and order');
assert.equal(Object.isFrozen(manifest), true, 'the validated manifest must be immutable');
assert.equal(manifest.every(Object.isFrozen), true, 'validated manifest entries must be immutable');

for (const [label, source, pattern] of [
  ['malformed JSON', '[', /invalid.*manifest.*JSON/i],
  ['non-canonical JSON', JSON.stringify(EXPECTED_MANIFEST), /non-canonical.*manifest/i],
  ['wrong top-level type', canonicalJson({ entries: EXPECTED_MANIFEST }), /manifest.*array/i],
  ['empty manifest', canonicalJson([]), /manifest.*empty/i],
  ['unknown entry key', canonicalJson([{ id: 'chrome', kind: 'patch', label: 'Chrome' }]), /unknown.*key/i],
  ['missing entry key', canonicalJson([{ id: 'chrome' }]), /keys|kind/i],
  ['unsafe ID filename', canonicalJson([{ id: '../chrome', kind: 'patch' }]), /unsafe.*enhancement.*id/i],
  ['wrong kind', canonicalJson([{ id: 'chrome', kind: 'runtime' }]), /kind/i],
  ['duplicate ID', canonicalJson([{ id: 'chrome', kind: 'patch' }, { id: 'chrome', kind: 'plugin' }]), /duplicate.*chrome/i],
]) {
  assert.throws(
    () => loadEnhancementManifest(source, { filename: 'enhancements.json' }),
    pattern,
    `${label} must fail closed`,
  );
}
for (const unsafeFilename of ['', '.', '..', '../enhancements.json', 'sub/enhancements.json', 'enhancements.JSON', 'enhancements.json\0']) {
  assert.throws(
    () => loadEnhancementManifest(canonicalJson(EXPECTED_MANIFEST), { filename: unsafeFilename }),
    /unsafe.*manifest.*filename/i,
    `unsafe manifest filename ${JSON.stringify(unsafeFilename)} must be rejected`,
  );
}

const futureManifest = manifestFrom([...EXPECTED_MANIFEST, { id: 'future-tool', kind: 'plugin' }]);
const cases = [
  ['missing defaults to all', {}, { mode: 'all', enabled: EXPECTED_IDS }],
  ['saved all includes future IDs', { stored: { schemaVersion: 1, mode: 'all', enabled: [] }, useManifest: futureManifest }, { mode: 'all', enabled: [...EXPECTED_IDS, 'future-tool'] }],
  ['custom keeps only saved order', { stored: { schemaVersion: 1, mode: 'custom', enabled: ['branding', 'chrome'] } }, { mode: 'custom', enabled: ['chrome', 'branding'] }],
  ['explicit overrides saved', { explicit: 'computer-use,chrome', stored: { schemaVersion: 1, mode: 'custom', enabled: ['branding'] } }, { mode: 'custom', enabled: ['chrome', 'computer-use'] }],
  ['explicit none means core only', { explicit: 'none' }, { mode: 'custom', enabled: [] }],
];
for (const [label, input, expected] of cases) {
  const { useManifest = manifest, ...selection } = input;
  assert.deepEqual(resolveEnhancementSelection(selection, useManifest), expected, label);
}

assert.deepEqual(
  normalizeEnhancementSelection(['branding', 'computer-use', 'chrome'], manifest),
  ['chrome', 'computer-use', 'branding'],
  'selection normalization must use canonical manifest order',
);
assert.deepEqual(
  parseExplicitEnhancementSelection(EXPECTED_IDS.slice().reverse().join(','), manifest),
  CONFIG_ALL,
  'an explicit complete set must persist as mode all with an empty enabled array',
);
assert.deepEqual(
  parseExplicitEnhancementSelection('branding,chrome', manifest),
  CONFIG_CUSTOM,
  'an explicit subset must persist in manifest order',
);
assert.throws(
  () => selectionToStoredEnhancementConfig({ schemaVersion: 999, mode: 'custom', enabled: [] }, manifest),
  /schemaVersion/i,
  'a supplied unsupported schemaVersion must not be silently rewritten',
);

for (const [label, value, pattern] of [
  ['selection must be an array', 'chrome', /selection.*array/i],
  ['selection item must be a string', [1], /enhancement.*id.*string/i],
  ['selection duplicates', ['chrome', 'chrome'], /duplicate.*chrome/i],
  ['selection unknown ID', ['not-real'], /unknown.*not-real/i],
  ['selection unsafe ID', ['../chrome'], /unsafe.*enhancement.*id/i],
]) {
  assert.throws(() => normalizeEnhancementSelection(value, manifest), pattern, label);
}

for (const [label, value, pattern] of [
  ['explicit must be a string', ['chrome'], /explicit.*string/i],
  ['empty explicit value', '', /explicit.*empty/i],
  ['empty CSV item', 'chrome,,branding', /empty.*enhancement.*id|invalid.*CSV/i],
  ['CSV duplicates', 'chrome,chrome', /duplicate.*chrome/i],
  ['CSV unknown ID', 'chrome,unknown', /unknown.*unknown/i],
  ['CSV unsafe ID', '../chrome', /unsafe.*enhancement.*id/i],
  ['none cannot be combined', 'none,chrome', /unknown.*none|invalid.*none/i],
  ['whitespace is not silently trimmed', 'chrome, branding', /unsafe.*enhancement.*id|unknown/i],
]) {
  assert.throws(() => parseExplicitEnhancementSelection(value, manifest), pattern, label);
}

const storedCases = [
  ['unknown key', { ...CONFIG_ALL, extra: true }, /unknown.*key/i],
  ['missing key', { schemaVersion: 1, mode: 'all' }, /keys|enabled/i],
  ['wrong schema number', { ...CONFIG_ALL, schemaVersion: 2 }, /schemaVersion/i],
  ['wrong schema type', { ...CONFIG_ALL, schemaVersion: '1' }, /schemaVersion/i],
  ['wrong mode', { ...CONFIG_ALL, mode: 'default' }, /mode/i],
  ['all stores no IDs', { ...CONFIG_ALL, enabled: ['chrome'] }, /mode.*all.*empty/i],
  ['enabled must be an array', { ...CONFIG_ALL, mode: 'custom', enabled: 'chrome' }, /selection.*array|enabled.*array/i],
  ['enabled IDs must be strings', { ...CONFIG_ALL, mode: 'custom', enabled: [1] }, /enhancement.*id.*string/i],
  ['duplicate enabled ID', { ...CONFIG_ALL, mode: 'custom', enabled: ['chrome', 'chrome'] }, /duplicate.*chrome/i],
  ['unknown enabled ID', { ...CONFIG_ALL, mode: 'custom', enabled: ['unknown'] }, /unknown.*unknown/i],
  ['unsafe enabled ID', { ...CONFIG_ALL, mode: 'custom', enabled: ['../chrome'] }, /unsafe.*enhancement.*id/i],
];
for (const [label, value, pattern] of storedCases) {
  assert.throws(() => validateStoredEnhancementConfig(value, manifest), pattern, label);
}
assert.deepEqual(
  validateStoredEnhancementConfig({ schemaVersion: 1, mode: 'custom', enabled: ['branding', 'chrome'] }, manifest),
  CONFIG_CUSTOM,
  'object validation must normalize custom IDs without mutating the caller value',
);
assert.equal(serializeEnhancementConfig(CONFIG_ALL, manifest), ALL_BYTES, 'all mode must have deterministic canonical bytes');
assert.equal(serializeEnhancementConfig(CONFIG_CUSTOM, manifest), CUSTOM_BYTES, 'custom mode must have deterministic canonical bytes');
assert.deepEqual(parseStoredEnhancementConfig(CUSTOM_BYTES, manifest), CONFIG_CUSTOM, 'canonical stored JSON must parse');

for (const [label, source] of [
  ['malformed JSON', '{'],
  ['compact JSON', JSON.stringify(CONFIG_ALL)],
  ['missing final newline', JSON.stringify(CONFIG_ALL, null, 2)],
  ['different key order', '{\n  "mode": "all",\n  "schemaVersion": 1,\n  "enabled": []\n}\n'],
  ['non-canonical enabled order', canonicalJson({ schemaVersion: 1, mode: 'custom', enabled: ['branding', 'chrome'] })],
]) {
  assert.throws(
    () => parseStoredEnhancementConfig(source, manifest),
    /invalid.*JSON|non-canonical/i,
    `${label} must not be silently corrected`,
  );
}

assert.equal(ENHANCEMENT_CONFIG_DIRECTORY_MODE, 0o700, 'the persisted configuration directory must be private');
assert.equal(ENHANCEMENT_CONFIG_FILE_MODE, 0o600, 'the persisted configuration file must be private');
assert.throws(
  () => enhancementConfigPath('relative-home'),
  /absolute.*HOME/i,
  'relative HOME paths must be rejected',
);
const unsafePathHome = makeHome('unsafe-path');
try {
  for (const filename of ['../enhancements.json', 'nested/enhancements.json', 'provider.json', 'enhancements.JSON']) {
    assert.throws(
      () => enhancementConfigPath(unsafePathHome, { filename }),
      /unsafe.*config.*filename/i,
      `unsafe config filename ${filename} must be rejected`,
    );
  }
} finally {
  rmSync(unsafePathHome, { recursive: true, force: true });
}

await withHome('missing-read', async home => {
  assert.equal(await readEnhancementConfig({ homeDir: home, manifest }), null, 'a missing config must remain distinguishable from mode all');
  assert.deepEqual(readdirSync(home), [], 'a read must not create the config directory');
});

await withHome('write-all', async home => {
  const result = await writeEnhancementConfig({ homeDir: home, manifest, selection: { mode: 'all', enabled: EXPECTED_IDS } });
  const path = join(home, '.clawgod', 'enhancements.json');
  assert.deepEqual(result, { path, config: CONFIG_ALL, bytes: ALL_BYTES }, 'write result must report canonical persisted state');
  assert.equal(readFileSync(path, 'utf8'), ALL_BYTES, 'mode all must store an empty enabled array in exact canonical bytes');
  assert.equal(lstatSync(path).mode & 0o777, 0o600, 'new config mode must be 0600');
  assert.equal(lstatSync(dirname(path)).mode & 0o777, 0o700, 'new config directory mode must be 0700');
  assert.deepEqual(readdirSync(dirname(path)), ['enhancements.json'], 'successful publication must remove every temporary artifact');
  assert.deepEqual(await readEnhancementConfig({ homeDir: home, manifest }), CONFIG_ALL, 'the file layer must round-trip canonical all mode');
});

await withHome('write-custom', async home => {
  await writeEnhancementConfig({ homeDir: home, manifest, selection: { mode: 'custom', enabled: ['branding', 'chrome'] } });
  const path = join(home, '.clawgod', 'enhancements.json');
  assert.equal(readFileSync(path, 'utf8'), CUSTOM_BYTES, 'custom mode must persist normalized manifest order');
  assert.deepEqual(await readEnhancementConfig({ homeDir: home, manifest }), CONFIG_CUSTOM);
});

await withHome('synthetic-windows-modes', async home => {
  const fileSystem = syntheticWindowsFileSystem();
  await writeEnhancementConfig({
    homeDir: home,
    manifest,
    selection: CONFIG_CUSTOM,
    fileSystem,
    platform: 'win32',
  });
  assert.deepEqual(
    await readEnhancementConfig({ homeDir: home, manifest, fileSystem, platform: 'win32' }),
    CONFIG_CUSTOM,
    'synthetic Windows 0666/0777 modes must use the writable-bit compatibility policy',
  );
});

await withHome('dead-owner-lock', async home => {
  const target = prepareExisting(home);
  const lockPath = join(dirname(target), '.enhancements.json.lock');
  writeFileSync(lockPath, '99999999:00000000-0000-4000-8000-000000000000\n', { mode: 0o600 });
  await writeEnhancementConfig({
    homeDir: home,
    manifest,
    selection: CONFIG_CUSTOM,
    isProcessAlive: () => false,
  });
  assert.equal(readFileSync(target, 'utf8'), CUSTOM_BYTES, 'a verified dead-owner lock must be reclaimed before publication');
  assert.deepEqual(readdirSync(dirname(target)), ['enhancements.json'], 'dead-lock quarantine must be removed after verified reclamation');
});

await withHome('dead-owner-after-rename', async home => {
  const target = prepareExisting(home);
  const token = '00000000-0000-4000-8000-000000000001';
  const lockPath = join(dirname(target), '.enhancements.json.lock');
  const backupPath = join(dirname(target), `.enhancements.json.99999999.${token}.backup`);
  writeFileSync(lockPath, `99999999:${token}\n`, { mode: 0o600 });
  renameSync(target, backupPath);

  await assert.rejects(
    readEnhancementConfig({
      homeDir: home,
      manifest,
      waitForUnlockMs: 0,
      isProcessAlive: () => false,
    }),
    error => error?.restorationIncomplete === true
      && error.evidencePaths.includes(lockPath)
      && error.evidencePaths.includes(backupPath),
    'a crash after moving the original must preserve the dead lock and backup evidence instead of returning default all',
  );
  assert.equal(existsSync(lockPath), true);
  assert.equal(existsSync(backupPath), true);
  assert.equal(existsSync(target), false);
});

await withHome('dead-owner-after-publication', async home => {
  const target = prepareExisting(home, CUSTOM_BYTES);
  const token = '00000000-0000-4000-8000-000000000002';
  const lockPath = join(dirname(target), '.enhancements.json.lock');
  const backupPath = join(dirname(target), `.enhancements.json.99999999.${token}.backup`);
  writeFileSync(lockPath, `99999999:${token}\n`, { mode: 0o600 });
  writeFileSync(backupPath, ALL_BYTES, { mode: 0o600 });

  await assert.rejects(
    readEnhancementConfig({
      homeDir: home,
      manifest,
      waitForUnlockMs: 0,
      isProcessAlive: () => false,
    }),
    error => error?.restorationIncomplete === true
      && error.evidencePaths.includes(lockPath)
      && error.evidencePaths.includes(backupPath),
    'a crash after publication must preserve the dead lock and backup until the transaction can be audited',
  );
  assert.equal(readFileSync(target, 'utf8'), CUSTOM_BYTES);
  assert.equal(existsSync(lockPath), true);
  assert.equal(existsSync(backupPath), true);
});

await withHome('same-directory', async home => {
  const target = prepareExisting(home);
  let publication;
  const fileSystem = proxyFileSystem({
    rename: async (source, destination) => {
      if (destination === target && basename(source).includes('.tmp')) {
        publication = { source, destination, sourceMode: lstatSync(source).mode & 0o777 };
        assert.equal(dirname(source), dirname(destination), 'atomic publication must originate in the target directory');
      }
      return fsPromises.rename(source, destination);
    },
    link: async (source, destination) => {
      if (destination === target && basename(source).includes('.tmp')) {
        publication = { source, destination, sourceMode: lstatSync(source).mode & 0o777 };
        assert.equal(dirname(source), dirname(destination), 'exclusive publication must originate in the target directory');
      }
      return fsPromises.link(source, destination);
    },
  });
  await writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM, fileSystem });
  assert.deepEqual(publication, { source: publication.source, destination: target, sourceMode: 0o600 });
  assert.equal(readFileSync(target, 'utf8'), CUSTOM_BYTES);
  assert.deepEqual(readdirSync(dirname(target)), ['enhancements.json'], 'backup and temporary files must be removed after commit');
});

await withHome('lock-release-after-commit', async home => {
  const target = prepareExisting(home);
  const lockPath = join(dirname(target), '.enhancements.json.lock');
  let injected = false;
  const fileSystem = proxyFileSystem({
    rename: async (source, destination) => {
      if (!injected && source === lockPath && destination.endsWith('.stale')) {
        injected = true;
        const failure = new Error('injected lock release failure');
        failure.code = 'EIO';
        throw failure;
      }
      return fsPromises.rename(source, destination);
    },
  });
  let failure;
  try {
    await writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM, fileSystem });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure?.restorationIncomplete, true, 'a lock release failure after durable commit must report incomplete cleanup');
  assert.match(failure?.message || '', /injected lock release failure/);
  assert.equal(readFileSync(target, 'utf8'), CUSTOM_BYTES, 'the verified publication must remain canonical after rollback is no longer possible');
  assert.equal(existsSync(lockPath), true, 'the failed lock cleanup must remain as evidence');
  assert.equal(readdirSync(dirname(target)).some(name => name.endsWith('.failed')), false, 'a committed publication must not be moved to rollback evidence');
});

await withHome('lock-stale-unlink-evidence', async home => {
  const target = prepareExisting(home);
  let staleLockPath = null;
  const fileSystem = proxyFileSystem({
    unlink: async path => {
      const name = basename(path);
      if (!staleLockPath
        && (name.includes('.enhancements.json.lock') || name.includes('.lock.stale'))
        && name.includes('.stale')) {
        staleLockPath = path;
        const failure = new Error('injected stale lock unlink failure');
        failure.code = 'EIO';
        throw failure;
      }
      return fsPromises.unlink(path);
    },
  });
  let failure;
  try {
    await writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM, fileSystem });
  } catch (error) {
    failure = error;
  }
  assert.equal(typeof staleLockPath, 'string', 'the fixture must fail after the lock has moved to stale quarantine');
  assert.equal(failure?.restorationIncomplete, true, 'stale lock cleanup failure must be marked incomplete');
  assert.equal(failure?.evidencePaths?.includes(staleLockPath), true, 'the exact stale lock path must be disclosed');
  assert.equal(readFileSync(target, 'utf8'), CUSTOM_BYTES, 'post-commit lock cleanup failure must retain canonical new bytes');
  assert.equal(existsSync(staleLockPath), true, 'the stale lock must remain as recovery evidence');

  let readFailure;
  try {
    await readEnhancementConfig({ homeDir: home, manifest, waitForUnlockMs: 0, isProcessAlive: () => false });
  } catch (error) {
    readFailure = error;
  }
  assert.equal(readFailure?.restorationIncomplete, true, 'later reads must fail closed while stale lock evidence remains');
  assert.equal(readFailure?.evidencePaths?.includes(staleLockPath), true, 'later reads must disclose the exact stale lock evidence');
  assert.equal(readFileSync(target, 'utf8'), CUSTOM_BYTES, 'later reads must not roll back a durable publication');
});

await withHome('lock-stale-disappears-before-enumeration', async home => {
  prepareExisting(home);
  const staleRoot = join(
    home,
    '.clawgod',
    `.enhancements.json.${process.pid}.12345678-1234-4123-8123-123456789abc.lock.stale`,
  );
  mkdirSync(staleRoot, { mode: 0o700 });
  writeFileSync(join(staleRoot, 'evidence'), 'stale lock evidence\n', { mode: 0o600 });
  let removed = false;
  const fileSystem = proxyFileSystem({
    readdir: async (path, ...args) => {
      if (!removed && path === staleRoot) {
        removed = true;
        rmSync(staleRoot, { recursive: true, force: true });
      }
      return fsPromises.readdir(path, ...args);
    },
  });
  assert.deepEqual(
    await readEnhancementConfig({ homeDir: home, manifest, fileSystem, waitForUnlockMs: 0 }),
    CONFIG_ALL,
    'a stale lock directory removed after observation must be retried as no evidence',
  );
  assert.equal(removed, true, 'the fixture must remove stale lock evidence between lstat and readdir');
});

await withHome('lock-stale-disappears-after-enumeration', async home => {
  prepareExisting(home);
  const staleRoot = join(
    home,
    '.clawgod',
    `.enhancements.json.${process.pid}.12345678-1234-4123-8123-123456789abc.lock.stale`,
  );
  mkdirSync(staleRoot, { mode: 0o700 });
  writeFileSync(join(staleRoot, 'evidence'), 'stale lock evidence\n', { mode: 0o600 });
  let removed = false;
  const fileSystem = proxyFileSystem({
    readdir: async (path, ...args) => {
      const entries = await fsPromises.readdir(path, ...args);
      if (!removed && path === staleRoot) {
        removed = true;
        rmSync(staleRoot, { recursive: true, force: true });
      }
      return entries;
    },
  });
  assert.deepEqual(
    await readEnhancementConfig({ homeDir: home, manifest, fileSystem, waitForUnlockMs: 0 }),
    CONFIG_ALL,
    'a stale lock directory removed after enumeration must be retried as no evidence',
  );
  assert.equal(removed, true, 'the fixture must remove stale lock evidence between readdir and identity verification');
});

await withHome('lock-stale-replaced-before-enumeration', async home => {
  prepareExisting(home);
  const staleRoot = join(
    home,
    '.clawgod',
    `.enhancements.json.${process.pid}.12345678-1234-4123-8123-123456789abc.lock.stale`,
  );
  mkdirSync(staleRoot, { mode: 0o700 });
  writeFileSync(join(staleRoot, 'evidence'), 'stale lock evidence\n', { mode: 0o600 });
  let replaced = false;
  const fileSystem = proxyFileSystem({
    readdir: async (path, ...args) => {
      if (!replaced && path === staleRoot) {
        replaced = true;
        rmSync(staleRoot, { recursive: true, force: true });
        mkdirSync(staleRoot, { mode: 0o700 });
        writeFileSync(join(staleRoot, 'replacement'), 'replacement evidence\n', { mode: 0o600 });
      }
      return fsPromises.readdir(path, ...args);
    },
  });
  await assert.rejects(
    readEnhancementConfig({ homeDir: home, manifest, fileSystem, waitForUnlockMs: 0 }),
    /stale lock evidence changed during observation/i,
    'replacement after stale lock observation must fail closed',
  );
  assert.equal(replaced, true, 'the fixture must replace stale lock evidence between lstat and readdir');
});

await withHome('lock-stale-enumeration-error', async home => {
  prepareExisting(home);
  const staleRoot = join(
    home,
    '.clawgod',
    `.enhancements.json.${process.pid}.12345678-1234-4123-8123-123456789abc.lock.stale`,
  );
  mkdirSync(staleRoot, { mode: 0o700 });
  const expected = new Error('injected stale lock enumeration failure');
  expected.code = 'EIO';
  const fileSystem = proxyFileSystem({
    readdir: async (path, ...args) => {
      if (path === staleRoot) throw expected;
      return fsPromises.readdir(path, ...args);
    },
  });
  await assert.rejects(
    readEnhancementConfig({ homeDir: home, manifest, fileSystem, waitForUnlockMs: 0 }),
    error => error === expected,
    'non-ENOENT stale lock enumeration errors must propagate unchanged',
  );
});

await withHome('live-lock-stale-reader', async home => {
  prepareExisting(home);
  let concurrentRead = null;
  let readSettled = false;
  const fileSystem = proxyFileSystem({
    unlink: async path => {
      if (!concurrentRead && basename(path).includes('.lock.stale')) {
        concurrentRead = readEnhancementConfig({ homeDir: home, manifest })
          .finally(() => { readSettled = true; });
        await Bun.sleep(25);
        assert.equal(readSettled, false, 'a reader must wait while a live writer removes stale lock quarantine');
      }
      return fsPromises.unlink(path);
    },
  });
  await writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM, fileSystem });
  assert.deepEqual(await concurrentRead, CONFIG_CUSTOM, 'the waiting reader must return the committed config');
});

await withHome('lock-stale-marker-double-failure', async home => {
  const target = prepareExisting(home);
  const lockPath = join(dirname(target), '.enhancements.json.lock');
  let staleLockPath = null;
  let markerFailureInjected = false;
  const fileSystem = proxyFileSystem({
    unlink: async path => {
      const name = basename(path);
      if (!staleLockPath && name.includes('.lock.stale')) {
        staleLockPath = path;
        const failure = new Error('injected stale lock unlink failure');
        failure.code = 'EIO';
        throw failure;
      }
      return fsPromises.unlink(path);
    },
    open: async (path, flags, ...args) => {
      if (staleLockPath && !markerFailureInjected && path === lockPath && flags === 'wx') {
        markerFailureInjected = true;
        const failure = new Error('injected lock marker restoration failure');
        failure.code = 'EIO';
        throw failure;
      }
      return fsPromises.open(path, flags, ...args);
    },
  });
  let failure;
  try {
    await writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM, fileSystem });
  } catch (error) {
    failure = error;
  }
  assert.equal(markerFailureInjected, true, 'the fixture must fail canonical marker restoration after stale unlink failure');
  assert.equal(failure?.restorationIncomplete, true);
  assert.equal(failure?.evidencePaths?.includes(staleLockPath), true);
  assert.equal(existsSync(lockPath), false, 'the double failure must leave the canonical lock absent');
  assert.equal(readFileSync(target, 'utf8'), CUSTOM_BYTES, 'the durable publication must remain canonical');

  let readResult;
  let readFailure;
  try {
    readResult = await readEnhancementConfig({ homeDir: home, manifest, waitForUnlockMs: 0, isProcessAlive: () => false });
  } catch (error) {
    readFailure = error;
  }
  assert.equal(readResult, undefined, 'orphan stale evidence must prevent a config return');
  assert.equal(readFailure?.restorationIncomplete, true, 'an orphan stale namespace must fail later reads closed');
  assert.equal(readFailure?.evidencePaths?.includes(staleLockPath), true, 'the orphan stale lock must be disclosed');
});

await withHome('backup-cleanup-replacement', async home => {
  const target = prepareExisting(home);
  const displacedOwnedBackup = join(home, 'owned-backup-evidence.json');
  const foreignBytes = 'foreign backup replacement must survive\n';
  let foreignPath = null;
  let injected = false;
  const fileSystem = proxyFileSystem({
    rename: async (source, destination) => {
      await fsPromises.rename(source, destination);
      if (!injected && basename(source).endsWith('.backup')) {
        injected = true;
        foreignPath = source;
        writeFileSync(source, foreignBytes, { mode: 0o600 });
      }
    },
    unlink: async path => {
      if (!injected && basename(path).endsWith('.backup')) {
        injected = true;
        foreignPath = path;
        renameSync(path, displacedOwnedBackup);
        writeFileSync(path, foreignBytes, { mode: 0o600 });
      }
      return fsPromises.unlink(path);
    },
  });
  let failure;
  try {
    await writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM, fileSystem });
  } catch (error) {
    failure = error;
  }
  assert.equal(injected, true, 'the fixture must replace the backup at the removal boundary');
  assert.equal(failure?.restorationIncomplete, true, 'backup cleanup replacement must fail with retained evidence');
  assert.equal(readFileSync(foreignPath, 'utf8'), foreignBytes, 'foreign backup replacement must not be deleted');
  assert.equal(failure?.evidencePaths?.includes(foreignPath), true, 'the foreign replacement path must be disclosed');
  if (existsSync(displacedOwnedBackup)) {
    assert.equal(readFileSync(displacedOwnedBackup, 'utf8'), ALL_BYTES, 'the fixture-displaced owned backup remains intact');
  }
});

await withHome('lock-quarantine-no-overwrite', async home => {
  const target = prepareExisting(home);
  const lockPath = join(dirname(target), '.enhancements.json.lock');
  const foreignBytes = 'pre-existing quarantine destination\n';
  let collisionRoot = null;
  let collisionEvidence = null;
  const fileSystem = proxyFileSystem({
    mkdir: async (path, options) => {
      const name = basename(path);
      if (!collisionRoot
        && (name.includes('.enhancements.json.lock') || name.includes('.lock.stale'))
        && name.includes('.stale')) {
        collisionRoot = path;
        collisionEvidence = join(path, 'foreign.txt');
        mkdirSync(path, { mode: 0o700 });
        writeFileSync(collisionEvidence, foreignBytes, { mode: 0o600 });
      }
      return fsPromises.mkdir(path, options);
    },
    rename: async (source, destination) => {
      if (!collisionRoot && source === lockPath && basename(destination).includes('.stale')) {
        collisionRoot = destination;
        collisionEvidence = destination;
        writeFileSync(destination, foreignBytes, { mode: 0o600 });
      }
      return fsPromises.rename(source, destination);
    },
  });
  let failure;
  try {
    await writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM, fileSystem });
  } catch (error) {
    failure = error;
  }
  assert.equal(typeof collisionEvidence, 'string', 'the fixture must occupy the quarantine destination before publication');
  assert.equal(failure?.restorationIncomplete, true, 'a quarantine collision must fail closed after durable publication');
  assert.equal(readFileSync(collisionEvidence, 'utf8'), foreignBytes, 'an existing quarantine destination must never be overwritten');
  assert.equal(readFileSync(target, 'utf8'), CUSTOM_BYTES, 'a post-commit quarantine collision must retain canonical new bytes');
  assert.equal(
    failure?.evidencePaths?.some(path => path === collisionRoot || path === collisionEvidence),
    true,
    'the quarantine collision must be disclosed as evidence',
  );
});

await withHome('backup-publication-no-overwrite', async home => {
  const target = prepareExisting(home);
  const foreignBytes = 'pre-existing backup destination\n';
  let collisionRoot = null;
  let collisionEvidence = null;
  const fileSystem = proxyFileSystem({
    mkdir: async (path, options) => {
      if (!collisionRoot && basename(path).endsWith('.backup')) {
        collisionRoot = path;
        collisionEvidence = join(path, 'foreign.txt');
        mkdirSync(path, { mode: 0o700 });
        writeFileSync(collisionEvidence, foreignBytes, { mode: 0o600 });
      }
      return fsPromises.mkdir(path, options);
    },
    rename: async (source, destination) => {
      if (!collisionRoot && source === target && basename(destination).endsWith('.backup')) {
        collisionRoot = destination;
        collisionEvidence = destination;
        writeFileSync(destination, foreignBytes, { mode: 0o600 });
      }
      return fsPromises.rename(source, destination);
    },
  });
  let failure;
  try {
    await writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM, fileSystem });
  } catch (error) {
    failure = error;
  }
  assert.equal(typeof collisionEvidence, 'string', 'the fixture must occupy the backup destination');
  assert.equal(failure?.restorationIncomplete, true, 'an occupied backup destination must fail closed');
  assert.equal(readFileSync(collisionEvidence, 'utf8'), foreignBytes, 'backup publication must not overwrite foreign evidence');
  assert.equal(readFileSync(target, 'utf8'), ALL_BYTES, 'backup collision must preserve the original canonical config');
  assert.equal(
    failure?.evidencePaths?.some(path => path === collisionRoot || path === collisionEvidence),
    true,
    'backup collision evidence must be disclosed',
  );
});

await withHome('failed-publication-no-overwrite', async home => {
  const target = prepareExisting(home);
  const configDirectory = dirname(target);
  const foreignBytes = 'pre-existing failed destination\n';
  let publicationLinked = false;
  let commitSyncFailed = false;
  let collisionRoot = null;
  let collisionEvidence = null;
  const fileSystem = proxyFileSystem({
    link: async (source, destination) => {
      await fsPromises.link(source, destination);
      if (destination === target && basename(source).endsWith('.tmp')) publicationLinked = true;
    },
    open: async (path, flags, ...args) => {
      if (publicationLinked && !commitSyncFailed && path === configDirectory && flags === 'r') {
        commitSyncFailed = true;
        throw new Error('injected commit directory sync failure');
      }
      return fsPromises.open(path, flags, ...args);
    },
    mkdir: async (path, options) => {
      if (!collisionRoot && basename(path).endsWith('.failed')) {
        collisionRoot = path;
        collisionEvidence = join(path, 'foreign.txt');
        mkdirSync(path, { mode: 0o700 });
        writeFileSync(collisionEvidence, foreignBytes, { mode: 0o600 });
      }
      return fsPromises.mkdir(path, options);
    },
    rename: async (source, destination) => {
      if (!collisionRoot && source === target && basename(destination).endsWith('.failed')) {
        collisionRoot = destination;
        collisionEvidence = destination;
        writeFileSync(destination, foreignBytes, { mode: 0o600 });
      }
      return fsPromises.rename(source, destination);
    },
  });
  let failure;
  try {
    await writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM, fileSystem });
  } catch (error) {
    failure = error;
  }
  assert.equal(commitSyncFailed, true, 'the fixture must fail after canonical publication verification');
  assert.equal(typeof collisionEvidence, 'string', 'the fixture must occupy the failed-publication destination');
  assert.equal(failure?.restorationIncomplete, true, 'an occupied failed-publication destination must fail closed');
  assert.equal(readFileSync(collisionEvidence, 'utf8'), foreignBytes, 'failed publication must not overwrite foreign evidence');
  assert.equal(readFileSync(target, 'utf8'), CUSTOM_BYTES, 'a failed-evidence collision must preserve the verified canonical publication');
  assert.equal(
    failure?.evidencePaths?.some(path => path === collisionRoot || path === collisionEvidence),
    true,
    'failed-publication collision evidence must be disclosed',
  );
});

await withHome('partial-stage-failure', async home => {
  const target = prepareExisting(home);
  let injected = false;
  const fileSystem = proxyFileSystem({
    open: async (path, flags, ...args) => {
      const handle = await fsPromises.open(path, flags, ...args);
      if (flags !== 'wx' || injected) return handle;
      injected = true;
      return new Proxy(handle, {
        get(fileHandle, property) {
          if (property === 'writeFile') {
            return async bytes => {
              await fileHandle.writeFile(bytes);
              throw new Error('injected partial stage failure');
            };
          }
          const value = Reflect.get(fileHandle, property);
          return typeof value === 'function' ? value.bind(fileHandle) : value;
        },
      });
    },
  });
  await assert.rejects(
    writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM, fileSystem }),
    /injected partial stage failure/,
  );
  assert.equal(readFileSync(target, 'utf8'), ALL_BYTES, 'a partial stage failure must preserve the original config');
  assert.deepEqual(readdirSync(dirname(target)), ['enhancements.json'], 'a still-owned partial stage must be removed');
});

await withHome('publication-window-replacement', async home => {
  const target = prepareExisting(home);
  const fixtureDisplacedOriginal = join(home, 'fixture-displaced-original.json');
  const concurrentConfig = { schemaVersion: 1, mode: 'custom', enabled: ['chrome'] };
  const concurrentBytes = canonicalJson(concurrentConfig);
  let injected = false;
  const fileSystem = proxyFileSystem({
    rename: async (source, destination) => {
      const oldBlindPublication = destination === target && basename(source).includes('.tmp');
      const guardedOriginalMove = source === target && basename(destination).includes('.backup');
      if (!injected && (oldBlindPublication || guardedOriginalMove)) {
        injected = true;
        renameSync(target, fixtureDisplacedOriginal);
        writeFileSync(target, concurrentBytes, { mode: 0o600 });
      }
      return fsPromises.rename(source, destination);
    },
  });
  await assert.rejects(
    writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM, fileSystem }),
    /concurrent.*replacement|changed during update/i,
    'a replacement in the final publication window must fail closed',
  );
  assert.equal(readFileSync(target, 'utf8'), concurrentBytes, 'the final-window concurrent config must not be overwritten');
  assert.equal(readFileSync(fixtureDisplacedOriginal, 'utf8'), ALL_BYTES, 'the fixture-displaced original must remain intact');
});

await withHome('concurrent-reader', async home => {
  const target = prepareExisting(home);
  let concurrentRead = null;
  let readSettled = false;
  const fileSystem = proxyFileSystem({
    link: async (source, destination) => {
      if (destination === target && basename(source).includes('.tmp')) {
        concurrentRead = readEnhancementConfig({ homeDir: home, manifest })
          .finally(() => { readSettled = true; });
        await Bun.sleep(25);
        assert.equal(readSettled, false, 'a reader must wait while the canonical path is transactionally unavailable');
      }
      return fsPromises.link(source, destination);
    },
  });
  await writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM, fileSystem });
  assert.deepEqual(await concurrentRead, CONFIG_CUSTOM, 'a waiting reader must observe the committed config, never a transient missing default');
});

await withHome('symlink-leaf', async home => {
  const directory = join(home, '.clawgod');
  mkdirSync(directory, { mode: 0o700 });
  const sentinel = join(home, 'outside.json');
  writeFileSync(sentinel, 'outside-must-not-change\n', { mode: 0o600 });
  symlinkSync(sentinel, join(directory, 'enhancements.json'));
  await assert.rejects(
    writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_ALL }),
    /unsafe.*config.*(?:leaf|file)|symbolic/i,
    'a symlink config leaf must fail closed',
  );
  assert.equal(readFileSync(sentinel, 'utf8'), 'outside-must-not-change\n');
});

await withHome('hardlink-leaf', async home => {
  const target = prepareExisting(home);
  const other = join(home, 'other-link.json');
  linkSync(target, other);
  await assert.rejects(
    writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM }),
    /hardlink|single-link|link count/i,
    'a hardlinked config leaf must fail closed',
  );
  assert.equal(readFileSync(other, 'utf8'), ALL_BYTES);
});

await withHome('wrong-mode', async home => {
  const target = prepareExisting(home, ALL_BYTES, 0o644);
  await assert.rejects(
    readEnhancementConfig({ homeDir: home, manifest }),
    /config.*mode.*0600|unsafe.*mode/i,
    'a non-private config mode must fail closed',
  );
  assert.equal(lstatSync(target).mode & 0o777, 0o644, 'reading must not silently repair mode');
});

await withHome('unsafe-ancestor-mode', async home => {
  const target = prepareExisting(home);
  chmodSync(dirname(target), 0o777);
  await assert.rejects(
    writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM }),
    /unsafe.*ancestor|directory.*mode/i,
    'a group/world-writable .clawgod ancestor must fail closed',
  );
  assert.equal(readFileSync(target, 'utf8'), ALL_BYTES);
});

if (process.platform !== 'win32') {
  for (const mode of [0o755, 0o4700, 0o1700]) {
    await withHome(`exact-config-directory-mode-${mode.toString(8)}`, async home => {
      const target = prepareExisting(home);
      const configDirectory = dirname(target);
      if (mode > 0o777) {
        const chmod = spawnSync('chmod', [mode.toString(8), configDirectory], { encoding: 'utf8' });
        assert.equal(chmod.status, 0, chmod.stderr || `failed to create mode ${mode.toString(8)} fixture`);
      } else {
        chmodSync(configDirectory, mode);
      }
      assert.equal(lstatSync(configDirectory).mode & 0o7777, mode, 'the fixture must set the requested real filesystem mode');
      let failure;
      try {
        await readEnhancementConfig({ homeDir: home, manifest });
      } catch (error) {
        failure = error;
      }
      assert.match(failure?.message || '', /unsafe.*directory ancestor/i, `existing mode ${mode.toString(8)} must fail closed`);
      assert.equal(
        lstatSync(configDirectory).mode & 0o7777,
        mode,
        `existing mode ${mode.toString(8)} must not be silently repaired`,
      );
      assert.equal(readFileSync(target, 'utf8'), ALL_BYTES);
    });
  }
}

await withHome('unsafe-ancestor-link', async home => {
  const outside = makeHome('ancestor-outside');
  try {
    writeFileSync(join(outside, 'enhancements.json'), ALL_BYTES, { mode: 0o600 });
    symlinkSync(outside, join(home, '.clawgod'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(
      readEnhancementConfig({ homeDir: home, manifest }),
      /unsafe.*ancestor|symbolic/i,
      'a symlinked config ancestor must fail closed',
    );
    assert.equal(readFileSync(join(outside, 'enhancements.json'), 'utf8'), ALL_BYTES);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

await withHome('read-directory-replacement', async home => {
  const target = prepareExisting(home);
  const configDirectory = dirname(target);
  const displacedDirectory = join(home, 'displaced-clawgod-read');
  const preparedReplacement = join(home, 'prepared-clawgod-read');
  mkdirSync(preparedReplacement, { mode: 0o700 });
  writeFileSync(join(preparedReplacement, 'enhancements.json'), CUSTOM_BYTES, { mode: 0o600 });
  let parentReads = 0;
  let swapped = false;
  const fileSystem = proxyFileSystem({
    lstat: async path => {
      if (path === configDirectory && ++parentReads === 2) {
        renameSync(configDirectory, displacedDirectory);
        renameSync(preparedReplacement, configDirectory);
        swapped = true;
      }
      return fsPromises.lstat(path);
    },
  });
  let result;
  let failure;
  try {
    result = await readEnhancementConfig({ homeDir: home, manifest, fileSystem });
  } catch (error) {
    failure = error;
  }
  assert.equal(swapped, true, 'the fixture must replace the config directory during lock observation');
  assert.equal(result, undefined, 'a replacement directory config must never be accepted');
  assert.equal(failure?.restorationIncomplete, true, 'directory replacement during read must fail closed');
  assert.match(failure?.message || '', /ancestor changed during read/i);
  assert.equal(failure?.evidencePaths?.includes(configDirectory), true, 'the replacement directory must be disclosed');
  assert.equal(readFileSync(join(configDirectory, 'enhancements.json'), 'utf8'), CUSTOM_BYTES);
  assert.equal(readFileSync(join(displacedDirectory, 'enhancements.json'), 'utf8'), ALL_BYTES);
});

await withHome('read-directory-replacement-dead-lock', async home => {
  const target = prepareExisting(home);
  const configDirectory = dirname(target);
  const displacedDirectory = join(home, 'displaced-clawgod-dead-lock');
  const preparedReplacement = join(home, 'prepared-clawgod-dead-lock');
  const replacementLock = join(preparedReplacement, '.enhancements.json.lock');
  const lockBytes = '99999999:00000000-0000-4000-8000-000000000010\n';
  mkdirSync(preparedReplacement, { mode: 0o700 });
  writeFileSync(join(preparedReplacement, 'enhancements.json'), CUSTOM_BYTES, { mode: 0o600 });
  writeFileSync(replacementLock, lockBytes, { mode: 0o600 });
  let parentReads = 0;
  const fileSystem = proxyFileSystem({
    lstat: async path => {
      if (path === configDirectory && ++parentReads === 2) {
        renameSync(configDirectory, displacedDirectory);
        renameSync(preparedReplacement, configDirectory);
      }
      return fsPromises.lstat(path);
    },
  });
  let failure;
  try {
    await readEnhancementConfig({
      homeDir: home,
      manifest,
      fileSystem,
      waitForUnlockMs: 0,
      isProcessAlive: () => false,
    });
  } catch (error) {
    failure = error;
  }
  const replacementLockAfterSwap = join(configDirectory, basename(replacementLock));
  assert.equal(failure?.restorationIncomplete, true, 'directory replacement with a dead lock must fail closed');
  assert.match(failure?.message || '', /ancestor changed during read/i);
  assert.equal(readFileSync(replacementLockAfterSwap, 'utf8'), lockBytes, 'the replacement directory lock must not be reclaimed');
  assert.equal(readFileSync(join(configDirectory, 'enhancements.json'), 'utf8'), CUSTOM_BYTES);
  assert.equal(readFileSync(join(displacedDirectory, 'enhancements.json'), 'utf8'), ALL_BYTES);
});

await withHome('ancestor-replacement-race', async home => {
  const target = prepareExisting(home);
  const configDirectory = dirname(target);
  const displacedDirectory = join(home, 'displaced-clawgod');
  let parentReads = 0;
  const fileSystem = proxyFileSystem({
    lstat: async path => {
      if (path === configDirectory && ++parentReads === 3) {
        renameSync(configDirectory, displacedDirectory);
        mkdirSync(configDirectory, { mode: 0o700 });
      }
      return fsPromises.lstat(path);
    },
  });
  let failure;
  try {
    await writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM, fileSystem });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure?.restorationIncomplete, true, 'an ancestor replacement with displaced stages must report incomplete restoration');
  assert.match(failure?.message || '', /ancestor changed during update/i);
  assert.equal(
    failure?.evidencePaths?.includes(configDirectory),
    true,
    'the replaced logical ancestor must be reported as the evidence anchor',
  );
  const displacedEntries = readdirSync(displacedDirectory);
  assert.equal(displacedEntries.includes('enhancements.json'), true, 'the displaced original must remain intact');
  assert.equal(displacedEntries.some(name => name.endsWith('.tmp')), true, 'the inaccessible staged publication must remain as evidence');
  assert.deepEqual(readdirSync(configDirectory), [], 'the concurrent replacement directory must not be modified');
});

await withHome('rename-failure', async home => {
  const target = prepareExisting(home);
  const beforeMode = lstatSync(target).mode & 0o777;
  const fileSystem = proxyFileSystem({
    rename: async (source, destination) => {
      if (destination === target && basename(source).includes('.tmp')) throw new Error('injected publication failure');
      return fsPromises.rename(source, destination);
    },
    link: async (source, destination) => {
      if (destination === target && basename(source).includes('.tmp')) throw new Error('injected publication failure');
      return fsPromises.link(source, destination);
    },
  });
  await assert.rejects(
    writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM, fileSystem }),
    /injected publication failure/,
  );
  assert.equal(readFileSync(target, 'utf8'), ALL_BYTES, 'pre-publication failure must preserve original bytes');
  assert.equal(lstatSync(target).mode & 0o777, beforeMode, 'pre-publication failure must preserve original mode');
  assert.deepEqual(readdirSync(dirname(target)), ['enhancements.json'], 'ordinary rollback must remove staged backup and temporary files');
});

await withHome('rollback-backup-replacement', async home => {
  const target = prepareExisting(home);
  const displacedOriginal = join(home, 'displaced-original-evidence.json');
  const attackerBytes = canonicalJson({ schemaVersion: 1, mode: 'custom', enabled: ['branding'] });
  let rollbackInjected = false;
  const fileSystem = proxyFileSystem({
    link: async (source, destination) => {
      if (destination === target && basename(source).endsWith('.tmp')) {
        throw new Error('injected publication failure');
      }
      if (!rollbackInjected && destination === target && basename(source).endsWith('.backup')) {
        rollbackInjected = true;
        renameSync(source, displacedOriginal);
        writeFileSync(source, attackerBytes, { mode: 0o600 });
      }
      return fsPromises.link(source, destination);
    },
  });
  let failure;
  try {
    await writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM, fileSystem });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure?.restorationIncomplete, true, 'a replaced rollback source must report incomplete restoration');
  assert.equal(existsSync(target), false, 'an unverified rollback hardlink must not remain at the canonical path');
  assert.equal(readFileSync(displacedOriginal, 'utf8'), ALL_BYTES, 'the displaced original must remain intact as evidence');
  assert.equal(existsSync(join(dirname(target), '.enhancements.json.lock')), true, 'an incomplete rollback must retain the transaction lock');
  await assert.rejects(
    readEnhancementConfig({ homeDir: home, manifest, waitForUnlockMs: 0, isProcessAlive: () => false }),
    error => error?.restorationIncomplete === true,
    'a later reader must not reclaim an incomplete rollback lock and resolve the missing target as default all',
  );
});

await withHome('rollback-backup-byte-drift', async home => {
  const target = prepareExisting(home);
  let rollbackInjected = false;
  const fileSystem = proxyFileSystem({
    link: async (source, destination) => {
      if (destination === target && basename(source).endsWith('.tmp')) {
        throw new Error('injected publication failure');
      }
      if (!rollbackInjected && destination === target && basename(source).endsWith('.backup')) {
        rollbackInjected = true;
        writeFileSync(source, 'mutated same inode\n');
      }
      return fsPromises.link(source, destination);
    },
  });
  let failure;
  try {
    await writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM, fileSystem });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure?.restorationIncomplete, true, 'rollback source byte drift must report incomplete restoration');
  assert.equal(existsSync(target), false, 'byte-drifted rollback content must not remain canonical');
  assert.equal(existsSync(join(dirname(target), '.enhancements.json.lock')), true, 'byte-drift evidence must remain guarded by the transaction lock');
  await assert.rejects(
    readEnhancementConfig({ homeDir: home, manifest, waitForUnlockMs: 0, isProcessAlive: () => false }),
    error => error?.restorationIncomplete === true,
    'byte-drift evidence must keep future reads fail closed after the writer process is gone',
  );
});

await withHome('rollback-post-unlink-drift-evidence', async home => {
  const target = prepareExisting(home);
  const lockPath = join(dirname(target), '.enhancements.json.lock');
  let rollbackUnlinked = false;
  const fileSystem = proxyFileSystem({
    link: async (source, destination) => {
      if (destination === target && basename(source).endsWith('.tmp')) {
        throw new Error('injected publication failure');
      }
      return fsPromises.link(source, destination);
    },
    unlink: async path => {
      await fsPromises.unlink(path);
      if (!rollbackUnlinked && basename(path).endsWith('.backup')) {
        rollbackUnlinked = true;
        writeFileSync(target, 'post-unlink byte drift\n');
      }
    },
  });
  let failure;
  try {
    await writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM, fileSystem });
  } catch (error) {
    failure = error;
  }
  const rejectedPath = failure?.evidencePaths?.find(path => basename(path).includes('.backup.rejected-'));
  assert.equal(failure?.restorationIncomplete, true, 'post-unlink rollback drift must report incomplete restoration');
  assert.equal(typeof rejectedPath, 'string', 'the top-level failure must disclose the quarantined rollback evidence');
  assert.equal(readFileSync(rejectedPath, 'utf8'), 'post-unlink byte drift\n');
  assert.equal(existsSync(target), false, 'post-unlink drift must not remain canonical');
  assert.equal(existsSync(lockPath), true, 'post-unlink drift must retain the transaction lock');

  let readFailure;
  try {
    await readEnhancementConfig({ homeDir: home, manifest, waitForUnlockMs: 0, isProcessAlive: () => false });
  } catch (error) {
    readFailure = error;
  }
  assert.equal(readFailure?.restorationIncomplete, true, 'a dead-owner read must preserve post-unlink evidence');
  assert.equal(readFailure?.evidencePaths?.includes(rejectedPath), true, 'dead-owner recovery must disclose the same rejected evidence');
  assert.equal(readFileSync(rejectedPath, 'utf8'), 'post-unlink byte drift\n');
});

await withHome('mode-race', async home => {
  const target = prepareExisting(home);
  let reads = 0;
  const fileSystem = proxyFileSystem({
    open: async (path, flags, ...args) => {
      if (path === target && flags === 'r' && ++reads === 2) chmodSync(target, 0o640);
      return fsPromises.open(path, flags, ...args);
    },
  });
  await assert.rejects(
    writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM, fileSystem }),
    /changed during update|mode.*drift|unsafe.*mode/i,
    'mode drift before publication must be detected',
  );
  assert.equal(readFileSync(target, 'utf8'), ALL_BYTES);
  assert.equal(lstatSync(target).mode & 0o777, 0o640, 'a concurrent mode change must not be overwritten');
});

await withHome('replacement-race', async home => {
  const target = prepareExisting(home);
  const displaced = join(home, 'displaced-original.json');
  let reads = 0;
  const fileSystem = proxyFileSystem({
    open: async (path, flags, ...args) => {
      if (path === target && flags === 'r' && ++reads === 2) {
        renameSync(target, displaced);
        writeFileSync(target, CUSTOM_BYTES, { mode: 0o600 });
      }
      return fsPromises.open(path, flags, ...args);
    },
  });
  await assert.rejects(
    writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_ALL, fileSystem }),
    /changed during update|concurrent.*replacement/i,
    'a replacement before publication must be detected',
  );
  assert.equal(readFileSync(target, 'utf8'), CUSTOM_BYTES, 'the concurrent replacement must survive');
  assert.equal(readFileSync(displaced, 'utf8'), ALL_BYTES, 'the displaced original remains owned by the fixture');
});

await withHome('post-publication-race', async home => {
  const target = prepareExisting(home);
  const attackerEvidence = join(home, 'published-by-engine.json');
  const fileSystem = proxyFileSystem({
    rename: async (source, destination) => {
      await fsPromises.rename(source, destination);
      if (destination === target && basename(source).includes('.tmp')) {
        renameSync(target, attackerEvidence);
        writeFileSync(target, ALL_BYTES, { mode: 0o600 });
      }
    },
    link: async (source, destination) => {
      await fsPromises.link(source, destination);
      if (destination === target && basename(source).includes('.tmp')) {
        renameSync(target, attackerEvidence);
        writeFileSync(target, ALL_BYTES, { mode: 0o600 });
      }
    },
  });
  let failure;
  try {
    await writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM, fileSystem });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure?.restorationIncomplete, true, 'a post-publication replacement must report incomplete restoration');
  assert.match(failure?.message || '', /changed after publication|concurrent.*replacement/i);
  assert.equal(readFileSync(target, 'utf8'), ALL_BYTES, 'the post-publication replacement must not be overwritten');
  assert.equal(readFileSync(attackerEvidence, 'utf8'), CUSTOM_BYTES, 'the engine publication remains available as fixture evidence');
  const backup = failure?.evidencePaths?.find(path => basename(path).includes('.backup'));
  assert.equal(typeof backup, 'string', 'the original config backup path must be reported as evidence');
  assert.equal(readFileSync(backup, 'utf8'), ALL_BYTES, 'the original bytes must be retained as rollback evidence');
});

await withHome('post-publication-mode-drift', async home => {
  const target = prepareExisting(home);
  const fileSystem = proxyFileSystem({
    rename: async (source, destination) => {
      await fsPromises.rename(source, destination);
      if (destination === target && basename(source).includes('.tmp')) chmodSync(target, 0o640);
    },
    link: async (source, destination) => {
      await fsPromises.link(source, destination);
      if (destination === target && basename(source).includes('.tmp')) chmodSync(target, 0o640);
    },
  });
  let failure;
  try {
    await writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_CUSTOM, fileSystem });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure?.restorationIncomplete, true, 'post-publication mode drift must reject ordinary rollback');
  assert.equal(readFileSync(target, 'utf8'), CUSTOM_BYTES, 'mode-drifted publication bytes must remain untouched as evidence');
  assert.equal(lstatSync(target).mode & 0o777, 0o640, 'the concurrent mode drift must not be overwritten');
  const backup = failure?.evidencePaths?.find(path => basename(path).includes('.backup'));
  assert.equal(readFileSync(backup, 'utf8'), ALL_BYTES, 'the prior config must remain available as rollback evidence');
});

await withHome('created-parent-rollback', async home => {
  const configDirectory = join(home, '.clawgod');
  const fileSystem = proxyFileSystem({
    open: async (path, flags, ...args) => {
      if (dirname(path) === configDirectory && flags === 'wx') throw new Error('injected stage creation failure');
      return fsPromises.open(path, flags, ...args);
    },
  });
  await assert.rejects(
    writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_ALL, fileSystem }),
    /injected stage creation failure/,
  );
  assert.equal(existsSync(configDirectory), false, 'an empty transaction-created parent must roll back');
});

await withHome('created-parent-evidence', async home => {
  const configDirectory = join(home, '.clawgod');
  const concurrent = join(configDirectory, 'concurrent.txt');
  const fileSystem = proxyFileSystem({
    open: async (path, flags, ...args) => {
      if (dirname(path) === configDirectory && flags === 'wx') {
        writeFileSync(concurrent, 'retain me\n', { mode: 0o600 });
        throw new Error('injected failure with concurrent evidence');
      }
      return fsPromises.open(path, flags, ...args);
    },
  });
  let failure;
  try {
    await writeEnhancementConfig({ homeDir: home, manifest, selection: CONFIG_ALL, fileSystem });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure?.restorationIncomplete, true, 'non-empty parent rollback must report incomplete restoration');
  assert.equal(failure?.evidencePath, configDirectory, 'the retained parent must be reported as evidence');
  assert.equal(readFileSync(concurrent, 'utf8'), 'retain me\n');
});

const buildFixture = mkdtempSync(join(tmpdir(), 'clawgod-enhancement-build-'));
try {
  cpSync(join(REPOSITORY_ROOT, 'src'), join(buildFixture, 'src'), { recursive: true });
  writeFileSync(
    join(buildFixture, 'src', 'generic', 'enhancements.json'),
    JSON.stringify(EXPECTED_MANIFEST),
    'utf8',
  );
  await assert.rejects(
    renderGeneratedPair({ rootDir: buildFixture }),
    /non-canonical.*manifest/i,
    'the real renderer must validate the manifest before producing installers',
  );
} finally {
  rmSync(buildFixture, { recursive: true, force: true });
}

console.log('enhancement config checks passed');
