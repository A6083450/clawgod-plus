import { randomUUID } from 'node:crypto';
import * as defaultFileSystem from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';

export const ENHANCEMENT_CONFIG_DIRECTORY = '.clawgod';
export const ENHANCEMENT_CONFIG_FILENAME = 'enhancements.json';
export const ENHANCEMENT_CONFIG_DIRECTORY_MODE = 0o700;
export const ENHANCEMENT_CONFIG_FILE_MODE = 0o600;
export const ENHANCEMENT_CONFIG_SCHEMA_VERSION = 1;

const SAFE_JSON_FILENAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.json$/;
const SAFE_ENHANCEMENT_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MAX_CONFIG_BYTES = 64 * 1024;
const DEFAULT_LOCK_WAIT_MS = 5_000;
const LOCK_POLL_MS = 10;
const LOCK_OWNER_PATTERN = /^([1-9][0-9]*):([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\n$/;
const textDecoder = new TextDecoder('utf-8', { fatal: true });

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function canonicalManifestJson(entries) {
  return `[\n${entries.map(entry => `  { "id": ${JSON.stringify(entry.id)}, "kind": ${JSON.stringify(entry.kind)} }`).join(',\n')}\n]\n`;
}

function decodeSource(source, label) {
  if (typeof source === 'string') return source;
  if (source instanceof Uint8Array) {
    try {
      return textDecoder.decode(source);
    } catch {
      throw new Error(`Invalid ${label} UTF-8`);
    }
  }
  throw new TypeError(`${label} source must be a string or Uint8Array`);
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, expected, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value);
  const unknown = actual.filter(key => !expected.includes(key));
  if (unknown.length > 0) throw new Error(`${label} has unknown key: ${unknown[0]}`);
  const missing = expected.filter(key => !actual.includes(key));
  if (missing.length > 0) throw new Error(`${label} is missing required key: ${missing[0]}`);
}

function assertSafeFilename(filename, label) {
  if (typeof filename !== 'string' || !SAFE_JSON_FILENAME.test(filename)) {
    throw new Error(`Unsafe ${label} filename`);
  }
}

function assertSafeEnhancementId(id) {
  if (typeof id !== 'string') throw new TypeError('Enhancement ID must be a string');
  if (!SAFE_ENHANCEMENT_ID.test(id)) throw new Error(`Unsafe enhancement ID: ${id}`);
}

function manifestIds(manifest) {
  if (!Array.isArray(manifest) || manifest.length === 0) throw new TypeError('Enhancement manifest must be a non-empty array');
  const ids = [];
  const seen = new Set();
  for (const entry of manifest) {
    if (!isPlainRecord(entry)) throw new TypeError('Enhancement manifest entry must be an object');
    assertSafeEnhancementId(entry.id);
    if (seen.has(entry.id)) throw new Error(`Duplicate enhancement ID: ${entry.id}`);
    seen.add(entry.id);
    ids.push(entry.id);
  }
  return ids;
}

export function loadEnhancementManifest(source, { filename = ENHANCEMENT_CONFIG_FILENAME } = {}) {
  assertSafeFilename(filename, 'manifest');
  const text = decodeSource(source, 'enhancement manifest');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`Invalid enhancement manifest JSON: ${filename}`);
  }
  if (!Array.isArray(value)) throw new TypeError('Enhancement manifest must be an array');
  if (value.length === 0) throw new Error('Enhancement manifest must not be empty');

  const normalized = [];
  const seen = new Set();
  for (const entry of value) {
    assertExactKeys(entry, ['id', 'kind'], 'Enhancement manifest entry');
    assertSafeEnhancementId(entry.id);
    if (seen.has(entry.id)) throw new Error(`Duplicate enhancement ID: ${entry.id}`);
    seen.add(entry.id);
    if (entry.kind !== 'patch' && entry.kind !== 'plugin') {
      throw new Error(`Invalid enhancement kind for ${entry.id}`);
    }
    normalized.push({ id: entry.id, kind: entry.kind });
  }
  if (text !== canonicalManifestJson(normalized)) throw new Error(`Non-canonical enhancement manifest JSON: ${filename}`);
  return Object.freeze(normalized.map(entry => Object.freeze(entry)));
}

export function normalizeEnhancementSelection(enabled, manifest) {
  const ids = manifestIds(manifest);
  if (!Array.isArray(enabled)) throw new TypeError('Enhancement selection must be an array');
  const selected = new Set();
  for (const id of enabled) {
    assertSafeEnhancementId(id);
    if (selected.has(id)) throw new Error(`Duplicate enhancement ID: ${id}`);
    if (!ids.includes(id)) throw new Error(`Unknown enhancement ID: ${id}`);
    selected.add(id);
  }
  return ids.filter(id => selected.has(id));
}

export function validateStoredEnhancementConfig(value, manifest) {
  assertExactKeys(value, ['schemaVersion', 'mode', 'enabled'], 'Enhancement config');
  if (value.schemaVersion !== ENHANCEMENT_CONFIG_SCHEMA_VERSION) {
    throw new Error(`Unsupported enhancement config schemaVersion: ${String(value.schemaVersion)}`);
  }
  if (value.mode !== 'all' && value.mode !== 'custom') {
    throw new Error(`Invalid enhancement config mode: ${String(value.mode)}`);
  }
  const enabled = normalizeEnhancementSelection(value.enabled, manifest);
  if (value.mode === 'all' && enabled.length !== 0) {
    throw new Error('Enhancement config mode all requires an empty enabled array');
  }
  if (value.mode === 'custom' && enabled.length === manifest.length) {
    throw new Error('A complete enhancement selection must use mode all');
  }
  return {
    schemaVersion: ENHANCEMENT_CONFIG_SCHEMA_VERSION,
    mode: value.mode,
    enabled,
  };
}

export function serializeEnhancementConfig(value, manifest) {
  return canonicalJson(validateStoredEnhancementConfig(value, manifest));
}

export function parseStoredEnhancementConfig(source, manifest) {
  const text = decodeSource(source, 'enhancement config');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Invalid enhancement config JSON');
  }
  const config = validateStoredEnhancementConfig(value, manifest);
  if (text !== canonicalJson(config)) throw new Error('Non-canonical enhancement config JSON');
  return config;
}

export function selectionToStoredEnhancementConfig(selection, manifest) {
  if (!isPlainRecord(selection)) throw new TypeError('Enhancement selection must be an object');
  const unknown = Object.keys(selection).filter(key => !['schemaVersion', 'mode', 'enabled'].includes(key));
  if (unknown.length > 0) throw new Error(`Enhancement selection has unknown key: ${unknown[0]}`);
  if (Object.hasOwn(selection, 'schemaVersion')
    && selection.schemaVersion !== ENHANCEMENT_CONFIG_SCHEMA_VERSION) {
    throw new Error(`Unsupported enhancement selection schemaVersion: ${String(selection.schemaVersion)}`);
  }
  if (selection.mode !== 'all' && selection.mode !== 'custom') {
    throw new Error(`Invalid enhancement selection mode: ${String(selection.mode)}`);
  }
  const enabled = normalizeEnhancementSelection(selection.enabled, manifest);
  if (selection.mode === 'all' && enabled.length !== 0 && enabled.length !== manifest.length) {
    throw new Error('Enhancement selection mode all must contain none or every manifest ID');
  }
  if (selection.mode === 'all' || enabled.length === manifest.length) {
    return { schemaVersion: ENHANCEMENT_CONFIG_SCHEMA_VERSION, mode: 'all', enabled: [] };
  }
  return { schemaVersion: ENHANCEMENT_CONFIG_SCHEMA_VERSION, mode: 'custom', enabled };
}

export function parseExplicitEnhancementSelection(explicit, manifest) {
  if (typeof explicit !== 'string') throw new TypeError('Explicit enhancement selection must be a string');
  if (explicit.length === 0) throw new Error('Explicit enhancement selection must not be empty');
  if (explicit === 'none') {
    return { schemaVersion: ENHANCEMENT_CONFIG_SCHEMA_VERSION, mode: 'custom', enabled: [] };
  }
  const requested = explicit.split(',');
  if (requested.some(id => id.length === 0)) throw new Error('Invalid explicit CSV: empty enhancement ID');
  const enabled = normalizeEnhancementSelection(requested, manifest);
  return selectionToStoredEnhancementConfig({ mode: 'custom', enabled }, manifest);
}

export function resolveEnhancementSelection(input = {}, manifest) {
  if (!isPlainRecord(input)) throw new TypeError('Enhancement resolution input must be an object');
  const unknown = Object.keys(input).filter(key => key !== 'explicit' && key !== 'stored');
  if (unknown.length > 0) throw new Error(`Enhancement resolution has unknown key: ${unknown[0]}`);

  let config;
  if (Object.hasOwn(input, 'explicit') && input.explicit !== undefined) {
    config = parseExplicitEnhancementSelection(input.explicit, manifest);
  } else if (Object.hasOwn(input, 'stored') && input.stored !== undefined && input.stored !== null) {
    config = validateStoredEnhancementConfig(input.stored, manifest);
  } else {
    config = { schemaVersion: ENHANCEMENT_CONFIG_SCHEMA_VERSION, mode: 'all', enabled: [] };
  }
  return {
    mode: config.mode,
    enabled: config.mode === 'all' ? manifestIds(manifest) : [...config.enabled],
  };
}

export function enhancementConfigPath(homeDir, { filename = ENHANCEMENT_CONFIG_FILENAME } = {}) {
  if (typeof homeDir !== 'string' || !isAbsolute(homeDir)) throw new Error('Enhancement config requires an absolute HOME path');
  if (filename !== ENHANCEMENT_CONFIG_FILENAME) throw new Error('Unsafe enhancement config filename');
  return join(homeDir, ENHANCEMENT_CONFIG_DIRECTORY, filename);
}

function fileMode(status) {
  return status.mode & 0o777;
}

function permissionMode(status) {
  return status.mode & 0o7777;
}

function fileIdentity(status) {
  return { dev: status.dev, ino: status.ino };
}

function sameIdentity(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino;
}

async function lstatIfPresent(fileSystem, path) {
  try {
    return await fileSystem.lstat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function homeDirectoryStatusIsSafe(status, platform) {
  if (status.isSymbolicLink() || !status.isDirectory()) return false;
  if (platform === 'win32') return (fileMode(status) & 0o200) !== 0;
  return (fileMode(status) & 0o022) === 0;
}

function configDirectoryStatusIsSafe(status, platform) {
  if (status.isSymbolicLink() || !status.isDirectory()) return false;
  if (platform === 'win32') return (fileMode(status) & 0o200) !== 0;
  return permissionMode(status) === ENHANCEMENT_CONFIG_DIRECTORY_MODE;
}

function assertSafeHomeDirectoryStatus(status, platform) {
  if (!homeDirectoryStatusIsSafe(status, platform)) {
    throw new Error('Unsafe enhancement config HOME ancestor');
  }
}

function assertSafeConfigDirectoryStatus(status, label, platform) {
  if (!configDirectoryStatusIsSafe(status, platform)) {
    throw new Error(`Unsafe enhancement config ${label} ancestor`);
  }
}

function configModeMatches(mode, platform) {
  return platform === 'win32'
    ? (mode & 0o200) === (ENHANCEMENT_CONFIG_FILE_MODE & 0o200)
    : mode === ENHANCEMENT_CONFIG_FILE_MODE;
}

function assertSafeConfigStatus(status, label = 'leaf', platform = process.platform, expectedNlink = 1) {
  if (status.isSymbolicLink() || !status.isFile()) {
    throw new Error(`Unsafe enhancement config ${label}`);
  }
  if (status.nlink !== expectedNlink) {
    if (expectedNlink === 1) throw new Error('Enhancement config leaf must be a regular single-link file; hardlinks are unsafe');
    throw new Error(`Unexpected enhancement config ${label} link count`);
  }
  if (!configModeMatches(fileMode(status), platform)) {
    throw new Error('Unsafe enhancement config mode; expected 0600');
  }
}

async function inspectHome(fileSystem, homeDir, platform) {
  const status = await lstatIfPresent(fileSystem, homeDir);
  if (!status) throw new Error('Unsafe enhancement config HOME ancestor: directory is missing');
  assertSafeHomeDirectoryStatus(status, platform);
  return status;
}

async function inspectConfigDirectory(fileSystem, homeDir, { missing = 'allow', platform = process.platform } = {}) {
  const homeStatus = await inspectHome(fileSystem, homeDir, platform);
  const path = join(homeDir, ENHANCEMENT_CONFIG_DIRECTORY);
  const status = await lstatIfPresent(fileSystem, path);
  if (!status) {
    if (missing === 'reject') throw new Error('Enhancement config directory is missing');
    return { path, status: null, homeStatus };
  }
  assertSafeConfigDirectoryStatus(status, 'directory', platform);
  return { path, status, homeStatus };
}

async function assertReadDirectoryCurrent(fileSystem, homeDir, expected, platform) {
  let current;
  try {
    current = await inspectConfigDirectory(fileSystem, homeDir, { platform });
  } catch (error) {
    throw markRestorationIncomplete(error, [homeDir, expected.path]);
  }
  const homeChanged = !sameIdentity(fileIdentity(current.homeStatus), fileIdentity(expected.homeStatus));
  const directoryChanged = Boolean(current.status) !== Boolean(expected.status)
    || (current.status && !sameIdentity(fileIdentity(current.status), fileIdentity(expected.status)));
  if (homeChanged || directoryChanged) {
    throw markRestorationIncomplete(
      new Error('Enhancement config ancestor changed during read'),
      homeChanged ? [homeDir, expected.path] : [expected.path],
    );
  }
  return current;
}

async function readFileSnapshot(fileSystem, path, parentStatus, platform, expectedNlink = 1) {
  const before = await lstatIfPresent(fileSystem, path);
  if (!before) {
    return {
      path,
      present: false,
      parentIdentity: fileIdentity(parentStatus),
      identity: null,
      bytes: null,
      mode: null,
      nlink: null,
    };
  }
  assertSafeConfigStatus(before, 'leaf', platform, expectedNlink);
  if (before.size > MAX_CONFIG_BYTES) throw new Error('Enhancement config exceeds the maximum safe size');

  let handle;
  try {
    handle = await fileSystem.open(path, 'r');
    const opened = await handle.stat();
    assertSafeConfigStatus(opened, 'descriptor', platform, expectedNlink);
    if (!sameIdentity(fileIdentity(before), fileIdentity(opened))) {
      throw new Error('Enhancement config changed during update');
    }
    if (opened.size > MAX_CONFIG_BYTES) throw new Error('Enhancement config exceeds the maximum safe size');
    const bytes = await handle.readFile();
    const after = await fileSystem.lstat(path);
    assertSafeConfigStatus(after, 'leaf', platform, expectedNlink);
    if (!sameIdentity(fileIdentity(opened), fileIdentity(after))
      || fileMode(opened) !== fileMode(after)
      || opened.nlink !== after.nlink
      || opened.size !== after.size) {
      throw new Error('Enhancement config changed during update');
    }
    return {
      path,
      present: true,
      parentIdentity: fileIdentity(parentStatus),
      identity: fileIdentity(after),
      bytes,
      mode: fileMode(after),
      nlink: after.nlink,
    };
  } finally {
    if (handle) await handle.close();
  }
}

function snapshotsEqual(left, right) {
  if (left.present !== right.present || !sameIdentity(left.parentIdentity, right.parentIdentity)) return false;
  if (!left.present) return true;
  return sameIdentity(left.identity, right.identity)
    && left.mode === right.mode
    && left.nlink === right.nlink
    && Buffer.from(left.bytes).equals(Buffer.from(right.bytes));
}

function snapshotMatchesWithLinkCount(saved, current, expectedNlink) {
  return saved?.present === true
    && current?.present === true
    && sameIdentity(saved.parentIdentity, current.parentIdentity)
    && sameIdentity(saved.identity, current.identity)
    && saved.mode === current.mode
    && current.nlink === expectedNlink
    && Buffer.from(saved.bytes).equals(Buffer.from(current.bytes));
}

function snapshotMatchesIgnoringParent(saved, current, expectedNlink = saved?.nlink) {
  return saved?.present === true
    && current?.present === true
    && sameIdentity(saved.identity, current.identity)
    && saved.mode === current.mode
    && current.nlink === expectedNlink
    && Buffer.from(saved.bytes).equals(Buffer.from(current.bytes));
}

async function assertSnapshotCurrent(fileSystem, homeDir, snapshot, platform) {
  const directory = await inspectConfigDirectory(fileSystem, homeDir, { missing: 'reject', platform });
  if (!sameIdentity(fileIdentity(directory.status), snapshot.parentIdentity)) {
    throw new Error('Enhancement config ancestor changed during update');
  }
  const current = await readFileSnapshot(fileSystem, snapshot.path, directory.status, platform);
  if (!snapshotsEqual(snapshot, current)) throw new Error('Enhancement config changed during update');
  return current;
}

async function stagePrivateFile(fileSystem, path, bytes, platform) {
  let handle;
  let identity = null;
  try {
    handle = await fileSystem.open(path, 'wx', ENHANCEMENT_CONFIG_FILE_MODE);
    const created = await handle.stat();
    assertSafeConfigStatus(created, 'temporary file', platform);
    identity = fileIdentity(created);
    await handle.writeFile(bytes);
    await handle.sync();
    const opened = await handle.stat();
    assertSafeConfigStatus(opened, 'temporary file', platform);
    if (!sameIdentity(identity, fileIdentity(opened))) {
      throw new Error('Enhancement config temporary descriptor changed during write');
    }
    if (opened.size !== bytes.byteLength) throw new Error('Enhancement config temporary write was incomplete');
    await handle.close();
    handle = null;
    const status = await fileSystem.lstat(path);
    assertSafeConfigStatus(status, 'temporary file', platform);
    if (!sameIdentity(fileIdentity(opened), fileIdentity(status))) {
      throw new Error('Enhancement config temporary file changed during write');
    }
    return { path, identity: fileIdentity(status), mode: fileMode(status), nlink: status.nlink };
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
      handle = null;
    }
    if (!identity) throw markRestorationIncomplete(error, [path]);
    try {
      if (!await unlinkIfOwned(fileSystem, path, identity)) {
        throw markRestorationIncomplete(error, [path]);
      }
    } catch (cleanupError) {
      if (cleanupError?.restorationIncomplete) throw cleanupError;
      throw markRestorationIncomplete(error, [path]);
    }
    throw error;
  } finally {
    if (handle) await handle.close();
  }
}

async function syncDirectory(fileSystem, path, platform) {
  if (platform === 'win32') return;
  const handle = await fileSystem.open(path, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function createPrivateDirectory(fileSystem, path, platform, label) {
  try {
    await fileSystem.mkdir(path, { mode: ENHANCEMENT_CONFIG_DIRECTORY_MODE });
  } catch (error) {
    throw markRestorationIncomplete(error, [path]);
  }
  const status = await fileSystem.lstat(path);
  if (!configDirectoryStatusIsSafe(status, platform)) {
    throw markRestorationIncomplete(new Error(`Unsafe ${label} directory`), [path]);
  }
  return { path, status, identity: fileIdentity(status) };
}

async function moveKnownFileToPrivateDirectory(fileSystem, snapshot, directoryPath, platform, label) {
  const ownedDirectory = await createPrivateDirectory(fileSystem, directoryPath, platform, label);
  const destination = join(directoryPath, basename(directoryPath));
  try {
    const sourceParent = await fileSystem.lstat(dirname(snapshot.path));
    const current = await readFileSnapshot(fileSystem, snapshot.path, sourceParent, platform, snapshot.nlink);
    if (!snapshotsEqual(snapshot, current)) {
      throw new Error(`${label} source changed before quarantine`);
    }
    await fileSystem.rename(snapshot.path, destination);
    const directoryAfter = await fileSystem.lstat(directoryPath);
    if (!sameIdentity(ownedDirectory.identity, fileIdentity(directoryAfter))) {
      throw new Error(`${label} directory changed during quarantine`);
    }
    const moved = await readFileSnapshot(fileSystem, destination, directoryAfter, platform, snapshot.nlink);
    if (!snapshotMatchesIgnoringParent(snapshot, moved)) {
      let replacementRestored = false;
      try {
        replacementRestored = await restoreSnapshotExclusively(fileSystem, moved, snapshot.path, platform);
        if (replacementRestored) {
          await removeOwnedPrivateDirectory(fileSystem, ownedDirectory, platform, label);
        }
      } catch (restoreError) {
        throw markRestorationIncomplete(restoreError, [snapshot.path, destination, directoryPath]);
      }
      if (!replacementRestored) {
        throw markRestorationIncomplete(
          new Error(`${label} concurrent replacement could not be restored`),
          [snapshot.path, destination, directoryPath],
        );
      }
      throw markRestorationIncomplete(
        new Error(`${label} concurrent replacement detected during quarantine`),
        [snapshot.path],
      );
    }
    if (await lstatIfPresent(fileSystem, snapshot.path)) {
      throw new Error(`${label} source was replaced during quarantine`);
    }
    return { moved, ownedDirectory };
  } catch (error) {
    throw markRestorationIncomplete(error, [snapshot.path, destination, directoryPath]);
  }
}

async function removeKnownRegularFile(fileSystem, snapshot, platform, label) {
  const directoryPath = `${snapshot.path}.${process.pid}.${randomUUID()}.stale`;
  const { moved, ownedDirectory } = await moveKnownFileToPrivateDirectory(
    fileSystem,
    snapshot,
    directoryPath,
    platform,
    label,
  );
  try {
    await fileSystem.unlink(moved.path);
    await fileSystem.rmdir(ownedDirectory.path);
    await syncDirectory(fileSystem, dirname(snapshot.path), platform);
  } catch (error) {
    throw markRestorationIncomplete(error, [snapshot.path, moved.path, ownedDirectory.path]);
  }
  return true;
}

async function removeOwnedPrivateDirectory(fileSystem, ownedDirectory, platform, label) {
  if (!ownedDirectory) return;
  const status = await lstatIfPresent(fileSystem, ownedDirectory.path);
  if (!status) return;
  if (!configDirectoryStatusIsSafe(status, platform)
    || !sameIdentity(fileIdentity(status), ownedDirectory.identity)) {
    throw markRestorationIncomplete(new Error(`${label} directory changed during cleanup`), [ownedDirectory.path]);
  }
  try {
    await fileSystem.rmdir(ownedDirectory.path);
    await syncDirectory(fileSystem, dirname(ownedDirectory.path), platform);
  } catch (error) {
    throw markRestorationIncomplete(error, [ownedDirectory.path]);
  }
}

async function unlinkIfOwned(fileSystem, path, identity) {
  const status = await lstatIfPresent(fileSystem, path);
  if (!status) return true;
  if (!sameIdentity(fileIdentity(status), identity)) return false;
  await fileSystem.unlink(path);
  return true;
}

async function existingEvidencePaths(fileSystem, paths) {
  const evidence = [];
  for (const path of paths) {
    if (!path || evidence.includes(path)) continue;
    try {
      await fileSystem.lstat(path);
      evidence.push(path);
    } catch (error) {
      if (error?.code !== 'ENOENT') evidence.push(path);
    }
  }
  return evidence;
}

function markRestorationIncomplete(error, evidencePaths) {
  const failure = error instanceof Error ? error : new Error(String(error));
  const combinedEvidence = [...new Set([...(failure.evidencePaths || []), ...evidencePaths].filter(Boolean))];
  failure.restorationIncomplete = true;
  failure.evidencePaths = combinedEvidence;
  failure.evidencePath = combinedEvidence.at(-1);
  return failure;
}

async function createConfigDirectory(fileSystem, homeDir, observation, platform) {
  const currentHome = await inspectHome(fileSystem, homeDir, platform);
  if (!sameIdentity(fileIdentity(currentHome), fileIdentity(observation.homeStatus))) {
    throw new Error('Enhancement config HOME ancestor changed during update');
  }
  await fileSystem.mkdir(observation.path, { mode: ENHANCEMENT_CONFIG_DIRECTORY_MODE });
  const created = await fileSystem.lstat(observation.path);
  if (!configDirectoryStatusIsSafe(created, platform)) {
    throw new Error('Unsafe created enhancement config directory');
  }
  const homeAfter = await inspectHome(fileSystem, homeDir, platform);
  if (!sameIdentity(fileIdentity(homeAfter), fileIdentity(observation.homeStatus))) {
    throw new Error('Enhancement config HOME ancestor changed during update');
  }
  return { path: observation.path, identity: fileIdentity(created) };
}

async function removeCreatedConfigDirectory(fileSystem, created) {
  if (!created) return true;
  const status = await lstatIfPresent(fileSystem, created.path);
  if (!status) return true;
  if (status.isSymbolicLink() || !status.isDirectory() || !sameIdentity(fileIdentity(status), created.identity)) return false;
  try {
    await fileSystem.rmdir(created.path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    if (error?.code === 'ENOTEMPTY' || error?.code === 'EEXIST') return false;
    throw error;
  }
}

function configLockPath(configPath) {
  return join(dirname(configPath), `.${basename(configPath)}.lock`);
}

function configTransactionPaths(lock) {
  const lockName = basename(lock.path);
  const configPath = join(dirname(lock.path), lockName.slice(1, -'.lock'.length));
  const prefix = join(dirname(configPath), `.${basename(configPath)}.${lock.ownerPid}.${lock.token}`);
  const backupDirectory = `${prefix}.backup`;
  const failedDirectory = `${prefix}.failed`;
  const lockStaleDirectory = `${prefix}.lock.stale`;
  return {
    temporary: `${prefix}.tmp`,
    backupDirectory,
    backup: join(backupDirectory, basename(backupDirectory)),
    failedDirectory,
    failed: join(failedDirectory, basename(failedDirectory)),
    lockStaleDirectory,
    lockStale: join(lockStaleDirectory, basename(lockStaleDirectory)),
  };
}

function transactionOwnerFromStaleName(name, configName) {
  const prefix = `.${configName}.`;
  const suffix = '.lock.stale';
  if (!name.startsWith(prefix) || !name.endsWith(suffix)) return null;
  const owner = name.slice(prefix.length, -suffix.length);
  const separator = owner.indexOf('.');
  if (separator <= 0) return null;
  const ownerPid = owner.slice(0, separator);
  const token = owner.slice(separator + 1);
  return LOCK_OWNER_PATTERN.test(`${ownerPid}:${token}\n`) ? { ownerPid: Number(ownerPid), token } : null;
}

async function observeOrphanLockStaleEvidence(fileSystem, directoryPath, platform) {
  const observations = [];
  for (const name of await fileSystem.readdir(directoryPath)) {
    const owner = transactionOwnerFromStaleName(name, ENHANCEMENT_CONFIG_FILENAME);
    if (!owner) continue;
    const root = join(directoryPath, name);
    const evidencePaths = [root];
    const status = await lstatIfPresent(fileSystem, root);
    if (status && configDirectoryStatusIsSafe(status, platform)) {
      for (const entry of await fileSystem.readdir(root)) {
        evidencePaths.push(join(root, entry));
      }
    }
    observations.push({ ...owner, evidencePaths });
  }
  return observations;
}

async function waitForOrphanLockStaleEvidence(
  fileSystem,
  homeDir,
  expectedDirectory,
  deadline,
  platform,
  isProcessAlive,
) {
  while (true) {
    await assertReadDirectoryCurrent(fileSystem, homeDir, expectedDirectory, platform);
    const observations = await observeOrphanLockStaleEvidence(fileSystem, expectedDirectory.path, platform);
    await assertReadDirectoryCurrent(fileSystem, homeDir, expectedDirectory, platform);
    if (observations.length === 0) return;
    const states = await Promise.all(observations.map(async observation => ({
      observation,
      alive: await isProcessAlive(observation.ownerPid),
    })));
    const evidencePaths = observations.flatMap(observation => observation.evidencePaths);
    if (states.some(state => !state.alive)) {
      throw markRestorationIncomplete(
        new Error('Enhancement config transaction has orphan stale lock evidence'),
        evidencePaths,
      );
    }
    if (Date.now() >= deadline) {
      throw markRestorationIncomplete(
        new Error('Timed out waiting for live enhancement config stale lock cleanup'),
        evidencePaths,
      );
    }
    await new Promise(resolve => setTimeout(resolve, LOCK_POLL_MS));
  }
}

async function observeConfigLock(fileSystem, path, platform) {
  const parentStatus = await fileSystem.lstat(dirname(path));
  assertSafeConfigDirectoryStatus(parentStatus, 'lock directory', platform);
  const snapshot = await readFileSnapshot(fileSystem, path, parentStatus, platform);
  if (!snapshot.present) return null;
  const text = decodeSource(snapshot.bytes, 'enhancement config lock');
  const match = LOCK_OWNER_PATTERN.exec(text);
  if (!match) throw new Error('Invalid enhancement config transaction lock');
  const ownerPid = Number(match[1]);
  if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0) throw new Error('Invalid enhancement config transaction lock owner');
  return { ...snapshot, ownerPid, token: match[2] };
}

function defaultIsProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

async function removeObservedFile(fileSystem, snapshot, platform, label) {
  const transactionPaths = snapshot.ownerPid && snapshot.token ? configTransactionPaths(snapshot) : null;
  const quarantine = transactionPaths?.lockStaleDirectory
    || join(dirname(snapshot.path), `.${basename(snapshot.path)}.${process.pid}.${randomUUID()}.stale`);
  let moved;
  try {
    moved = await moveKnownFileToPrivateDirectory(fileSystem, snapshot, quarantine, platform, label);
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
  try {
    await fileSystem.unlink(moved.moved.path);
    await fileSystem.rmdir(moved.ownedDirectory.path);
    await syncDirectory(fileSystem, dirname(snapshot.path), platform);
  } catch (error) {
    try {
      await stagePrivateFile(fileSystem, snapshot.path, Buffer.from(snapshot.bytes), platform);
    } catch (restoreError) {
      if (restoreError?.code !== 'EEXIST') {
        throw markRestorationIncomplete(restoreError, [moved.moved.path, quarantine, snapshot.path]);
      }
    }
    throw markRestorationIncomplete(error, [moved.moved.path, quarantine, snapshot.path]);
  }
  return true;
}

async function reclaimDeadConfigLock(fileSystem, lock, platform, isProcessAlive) {
  if (await isProcessAlive(lock.ownerPid)) return false;
  const residuePaths = [];
  const transactionPaths = configTransactionPaths(lock);
  for (const path of [
    transactionPaths.temporary,
    transactionPaths.backupDirectory,
    transactionPaths.failedDirectory,
    transactionPaths.lockStaleDirectory,
  ]) {
    const status = await lstatIfPresent(fileSystem, path);
    if (!status) continue;
    residuePaths.push(path);
    if (!status.isDirectory()) continue;
    for (const name of await fileSystem.readdir(path)) {
      residuePaths.push(join(path, name));
    }
  }
  const legacyBackupName = basename(transactionPaths.backupDirectory);
  const rejectedPrefix = `${legacyBackupName}.rejected-`;
  for (const name of await fileSystem.readdir(dirname(lock.path))) {
    if (name.startsWith(rejectedPrefix)) residuePaths.push(join(dirname(lock.path), name));
  }
  if (residuePaths.length > 0) {
    throw markRestorationIncomplete(
      new Error('Dead enhancement config transaction has unresolved filesystem evidence'),
      [lock.path, ...residuePaths],
    );
  }
  if (!await removeObservedFile(fileSystem, lock, platform, 'Enhancement config transaction lock')) {
    throw new Error('Enhancement config transaction lock changed during reclamation');
  }
  return true;
}

async function acquireConfigLock(fileSystem, path, platform, isProcessAlive) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await stagePrivateFile(fileSystem, path, Buffer.from(`${process.pid}:${randomUUID()}\n`, 'utf8'), platform);
      const lock = await observeConfigLock(fileSystem, path, platform);
      if (!lock) throw new Error('Enhancement config ancestor changed during update');
      await syncDirectory(fileSystem, dirname(path), platform);
      return lock;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const lock = await observeConfigLock(fileSystem, path, platform);
      if (!await reclaimDeadConfigLock(fileSystem, lock, platform, isProcessAlive)) {
        throw new Error('Enhancement config update is already in progress');
      }
    }
  }
  throw new Error('Enhancement config transaction lock could not be acquired');
}

async function assertConfigLockCurrent(fileSystem, lock, platform) {
  const parentStatus = await fileSystem.lstat(dirname(lock.path));
  assertSafeConfigDirectoryStatus(parentStatus, 'lock directory', platform);
  if (!sameIdentity(fileIdentity(parentStatus), lock.parentIdentity)) {
    throw new Error('Enhancement config ancestor changed during update');
  }
  const current = await observeConfigLock(fileSystem, lock.path, platform);
  if (!current || !snapshotsEqual(current, lock)) {
    throw new Error('Enhancement config transaction lock changed during update');
  }
}

async function releaseConfigLock(fileSystem, lock, platform) {
  if (!lock) return true;
  return removeObservedFile(fileSystem, lock, platform, 'Enhancement config transaction lock');
}

async function waitForConfigUnlock(
  fileSystem,
  lockPath,
  deadline,
  platform,
  isProcessAlive,
  homeDir = null,
  expectedDirectory = null,
) {
  if (expectedDirectory) {
    await waitForOrphanLockStaleEvidence(
      fileSystem,
      homeDir,
      expectedDirectory,
      deadline,
      platform,
      isProcessAlive,
    );
  }
  const lock = await observeConfigLock(fileSystem, lockPath, platform);
  if (expectedDirectory) {
    await assertReadDirectoryCurrent(fileSystem, homeDir, expectedDirectory, platform);
  }
  if (!lock) {
    if (expectedDirectory) {
      await waitForOrphanLockStaleEvidence(
        fileSystem,
        homeDir,
        expectedDirectory,
        deadline,
        platform,
        isProcessAlive,
      );
    }
    return false;
  }
  if (await reclaimDeadConfigLock(fileSystem, lock, platform, isProcessAlive)) return false;
  if (Date.now() >= deadline) throw new Error('Timed out waiting for enhancement config update');
  await new Promise(resolve => setTimeout(resolve, LOCK_POLL_MS));
  return true;
}

async function rejectRollbackLink(fileSystem, source, target, platform, cause, expectedTarget = null) {
  const before = await lstatIfPresent(fileSystem, target);
  if (!before) throw markRestorationIncomplete(cause, [source.path, target]);
  const rejected = `${source.path}.rejected-${randomUUID()}`;
  try {
    await fileSystem.rename(target, rejected);
  } catch (error) {
    throw markRestorationIncomplete(error, [source.path, target, rejected]);
  }
  try {
    const movedStatus = await fileSystem.lstat(rejected);
    if (!sameIdentity(fileIdentity(before), fileIdentity(movedStatus))) {
      throw new Error('Rejected enhancement config rollback link changed during quarantine');
    }
    if (expectedTarget) {
      const parentStatus = await fileSystem.lstat(dirname(rejected));
      const moved = await readFileSnapshot(fileSystem, rejected, parentStatus, platform, expectedTarget.nlink);
      if (!snapshotMatchesIgnoringParent(expectedTarget, moved, expectedTarget.nlink)) {
        throw new Error('Rejected enhancement config rollback link changed during quarantine');
      }
    }
  } catch (error) {
    throw markRestorationIncomplete(error, [source.path, target, rejected]);
  }
  throw markRestorationIncomplete(cause, [source.path, rejected]);
}

async function restoreSnapshotExclusively(fileSystem, source, target, platform) {
  try {
    await fileSystem.link(source.path, target);
  } catch (error) {
    if (error?.code === 'EEXIST') return false;
    throw error;
  }
  const targetParentStatus = await fileSystem.lstat(dirname(target));
  let linkedTarget;
  try {
    linkedTarget = await readFileSnapshot(fileSystem, target, targetParentStatus, platform, 2);
  } catch (error) {
    return rejectRollbackLink(fileSystem, source, target, platform, error);
  }
  let linkedSource;
  try {
    const sourceParentStatus = await fileSystem.lstat(dirname(source.path));
    linkedSource = await readFileSnapshot(fileSystem, source.path, sourceParentStatus, platform, 2);
  } catch (error) {
    return rejectRollbackLink(fileSystem, source, target, platform, error, linkedTarget);
  }
  if (!snapshotMatchesIgnoringParent(source, linkedSource, 2)
    || !snapshotMatchesIgnoringParent(source, linkedTarget, 2)) {
    return rejectRollbackLink(
      fileSystem,
      source,
      target,
      platform,
      new Error('Enhancement config rollback source changed before restoration'),
      linkedTarget,
    );
  }
  if (!await unlinkIfOwned(fileSystem, source.path, source.identity)) {
    return rejectRollbackLink(
      fileSystem,
      source,
      target,
      platform,
      new Error('Enhancement config rollback source changed during restoration'),
    );
  }
  let restored;
  try {
    restored = await readFileSnapshot(fileSystem, target, targetParentStatus, platform);
  } catch (error) {
    return rejectRollbackLink(fileSystem, source, target, platform, error);
  }
  if (!snapshotMatchesIgnoringParent(source, restored, 1)) {
    return rejectRollbackLink(
      fileSystem,
      source,
      target,
      platform,
      new Error('Enhancement config rollback changed after restoration'),
      restored,
    );
  }
  return true;
}

function snapshotsMatch(left, right) {
  return left && right && snapshotsEqual(left, right);
}

export async function readEnhancementConfig({
  homeDir,
  manifest,
  filename = ENHANCEMENT_CONFIG_FILENAME,
  fileSystem = defaultFileSystem,
  platform = process.platform,
  waitForUnlockMs = DEFAULT_LOCK_WAIT_MS,
  isProcessAlive = defaultIsProcessAlive,
} = {}) {
  const path = enhancementConfigPath(homeDir, { filename });
  if (!Number.isSafeInteger(waitForUnlockMs) || waitForUnlockMs < 0) {
    throw new TypeError('Enhancement config lock wait must be a non-negative safe integer');
  }
  if (typeof isProcessAlive !== 'function') throw new TypeError('Enhancement config process probe must be a function');
  const lockPath = configLockPath(path);
  const deadline = Date.now() + waitForUnlockMs;
  while (true) {
    const directory = await inspectConfigDirectory(fileSystem, homeDir, { platform });
    if (!directory.status) {
      await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
      return null;
    }
    if (await waitForConfigUnlock(fileSystem, lockPath, deadline, platform, isProcessAlive, homeDir, directory)) {
      await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
      continue;
    }
    await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
    let snapshot;
    try {
      snapshot = await readFileSnapshot(fileSystem, path, directory.status, platform);
      await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
    } catch (error) {
      if (await waitForConfigUnlock(fileSystem, lockPath, deadline, platform, isProcessAlive, homeDir, directory)) {
        await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
        continue;
      }
      await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
      throw error;
    }
    if (await waitForConfigUnlock(fileSystem, lockPath, deadline, platform, isProcessAlive, homeDir, directory)) {
      await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
      continue;
    }
    await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
    if (!snapshot.present) {
      await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
      return null;
    }
    const config = parseStoredEnhancementConfig(snapshot.bytes, manifest);
    await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
    return config;
  }
}

export async function writeEnhancementConfig({
  homeDir,
  manifest,
  selection,
  filename = ENHANCEMENT_CONFIG_FILENAME,
  fileSystem = defaultFileSystem,
  platform = process.platform,
  isProcessAlive = defaultIsProcessAlive,
} = {}) {
  if (typeof isProcessAlive !== 'function') throw new TypeError('Enhancement config process probe must be a function');
  const path = enhancementConfigPath(homeDir, { filename });
  const config = selectionToStoredEnhancementConfig(selection, manifest);
  const bytes = serializeEnhancementConfig(config, manifest);
  let directory = await inspectConfigDirectory(fileSystem, homeDir, { platform });
  let createdDirectory = null;
  let original;
  let temporary = null;
  let lock = null;
  let backupPath = null;
  let backup = null;
  let backupDirectory = null;
  let publicationIdentity = null;
  let targetMutationStarted = false;
  let publicationCommitted = false;

  try {
    if (!directory.status) {
      createdDirectory = await createConfigDirectory(fileSystem, homeDir, directory, platform);
      directory = await inspectConfigDirectory(fileSystem, homeDir, { missing: 'reject', platform });
      if (!sameIdentity(fileIdentity(directory.status), createdDirectory.identity)) {
        throw new Error('Enhancement config directory changed during creation');
      }
    }

    lock = await acquireConfigLock(fileSystem, configLockPath(path), platform, isProcessAlive);

    original = await readFileSnapshot(fileSystem, path, directory.status, platform);
    if (original.present) parseStoredEnhancementConfig(original.bytes, manifest);

    const transactionPaths = configTransactionPaths(lock);
    const temporaryPath = transactionPaths.temporary;
    temporary = await stagePrivateFile(fileSystem, temporaryPath, Buffer.from(bytes, 'utf8'), platform);

    await assertConfigLockCurrent(fileSystem, lock, platform);
    await assertSnapshotCurrent(fileSystem, homeDir, original, platform);
    targetMutationStarted = true;
    if (original.present) {
      backupPath = transactionPaths.backup;
      const moved = await moveKnownFileToPrivateDirectory(
        fileSystem,
        original,
        transactionPaths.backupDirectory,
        platform,
        'Enhancement config backup publication',
      );
      backup = moved.moved;
      backupDirectory = moved.ownedDirectory;
    }

    try {
      await fileSystem.link(temporary.path, path);
    } catch (error) {
      if (error?.code === 'EEXIST') {
        throw new Error('Concurrent enhancement config replacement prevented publication');
      }
      throw error;
    }
    publicationIdentity = temporary.identity;
    if (!await unlinkIfOwned(fileSystem, temporary.path, temporary.identity)) {
      throw new Error('Enhancement config temporary publication changed during commit');
    }

    const publishedDirectory = await inspectConfigDirectory(fileSystem, homeDir, { missing: 'reject', platform });
    if (!sameIdentity(fileIdentity(publishedDirectory.status), original.parentIdentity)) {
      throw new Error('Enhancement config ancestor changed after publication');
    }
    const published = await readFileSnapshot(fileSystem, path, publishedDirectory.status, platform);
    if (!published.present
      || !sameIdentity(published.identity, temporary.identity)
      || !configModeMatches(published.mode, platform)
      || !Buffer.from(published.bytes).equals(Buffer.from(bytes))) {
      throw new Error('Enhancement config changed after publication by a concurrent replacement');
    }
    await syncDirectory(fileSystem, directory.path, platform);

    if (backup) {
      await removeKnownRegularFile(fileSystem, backup, platform, 'Enhancement config backup');
      await removeOwnedPrivateDirectory(fileSystem, backupDirectory, platform, 'Enhancement config backup');
    }
    backup = null;
    backupPath = null;
    backupDirectory = null;
    publicationCommitted = true;
    if (!await releaseConfigLock(fileSystem, lock, platform)) {
      throw markRestorationIncomplete(
        new Error('Enhancement config transaction lock changed during release'),
        [lock.path, path],
      );
    }
    lock = null;
    return { path, config, bytes };
  } catch (error) {
    const evidenceCandidates = [...(error?.evidencePaths || [])];
    let restorationIncomplete = error?.restorationIncomplete === true;
    const recordRestorationFailure = restoreError => {
      restorationIncomplete = true;
      evidenceCandidates.push(...(restoreError?.evidencePaths || []));
    };
    const currentDirectoryStatus = await lstatIfPresent(fileSystem, directory.path).catch(() => null);
    const directoryChanged = !directory.status
      || !currentDirectoryStatus
      || !configDirectoryStatusIsSafe(currentDirectoryStatus, platform)
      || !sameIdentity(fileIdentity(currentDirectoryStatus), fileIdentity(directory.status));
    if (directoryChanged) {
      restorationIncomplete = true;
      evidenceCandidates.push(directory.path);
    }

    if (!directoryChanged && backupPath && !backup) {
      try {
        const candidate = await readFileSnapshot(fileSystem, backupPath, currentDirectoryStatus, platform);
        if (candidate.present && snapshotsMatch(original, candidate)) backup = candidate;
        else {
          restorationIncomplete = true;
          evidenceCandidates.push(backupPath);
        }
      } catch {
        restorationIncomplete = true;
        evidenceCandidates.push(backupPath);
      }
    }

    if (temporary) {
      try {
        if (!await unlinkIfOwned(fileSystem, temporary.path, temporary.identity)) {
          restorationIncomplete = true;
          evidenceCandidates.push(temporary.path);
        }
      } catch {
        restorationIncomplete = true;
        evidenceCandidates.push(temporary.path);
      }
    }

    let currentTarget = null;
    if (!directoryChanged) {
      try {
        currentTarget = await readFileSnapshot(fileSystem, path, currentDirectoryStatus, platform);
      } catch {}
    }
    const targetIsPublication = currentTarget?.present
      && temporary
      && sameIdentity(currentTarget.identity, temporary.identity)
      && configModeMatches(currentTarget.mode, platform)
      && currentTarget.nlink === 1
      && Buffer.from(currentTarget.bytes).equals(Buffer.from(bytes));
    const targetIsOriginal = original && currentTarget && snapshotsEqual(original, currentTarget);

    if (targetMutationStarted && !publicationCommitted && !directoryChanged && !targetIsOriginal) {
      if (targetIsPublication) {
        const transactionPaths = configTransactionPaths(lock);
        let failedPath = transactionPaths.failed;
        let failedDirectory = null;
        let movedPublication = null;
        try {
          const moved = await moveKnownFileToPrivateDirectory(
            fileSystem,
            currentTarget,
            transactionPaths.failedDirectory,
            platform,
            'Enhancement config failed publication',
          );
          movedPublication = moved.moved;
          failedDirectory = moved.ownedDirectory;
          failedPath = movedPublication.path;
        } catch (moveError) {
          restorationIncomplete = true;
          evidenceCandidates.push(...(moveError?.evidencePaths || []), failedPath, path);
        }
        if (movedPublication && sameIdentity(movedPublication.identity, publicationIdentity)
          && configModeMatches(movedPublication.mode, platform)
          && movedPublication.nlink === 1
          && Buffer.from(movedPublication.bytes).equals(Buffer.from(bytes))) {
          let restored = !original?.present;
          if (original?.present && backup) {
            try {
              restored = await restoreSnapshotExclusively(fileSystem, backup, path, platform);
              if (restored) {
                backup = null;
                backupPath = null;
                await removeOwnedPrivateDirectory(fileSystem, backupDirectory, platform, 'Enhancement config backup');
                backupDirectory = null;
              }
            } catch (restoreError) {
              recordRestorationFailure(restoreError);
              restored = false;
            }
          }
          if (restored) {
            try {
              await removeKnownRegularFile(fileSystem, movedPublication, platform, 'Enhancement config failed publication');
              await removeOwnedPrivateDirectory(fileSystem, failedDirectory, platform, 'Enhancement config failed publication');
            } catch (cleanupError) {
              recordRestorationFailure(cleanupError);
              restored = false;
            }
          }
          if (!restored) {
            restorationIncomplete = true;
            evidenceCandidates.push(failedPath, path);
          }
        } else if (movedPublication) {
          restorationIncomplete = true;
          evidenceCandidates.push(failedPath);
          try {
            await restoreSnapshotExclusively(fileSystem, movedPublication, path, platform);
          } catch (restoreError) {
            recordRestorationFailure(restoreError);
          }
        }
      } else if (!currentTarget?.present && backup) {
        try {
          if (await restoreSnapshotExclusively(fileSystem, backup, path, platform)) {
            backup = null;
            backupPath = null;
            await removeOwnedPrivateDirectory(fileSystem, backupDirectory, platform, 'Enhancement config backup');
            backupDirectory = null;
          } else restorationIncomplete = true;
        } catch (restoreError) {
          recordRestorationFailure(restoreError);
        }
      } else {
        restorationIncomplete = true;
        evidenceCandidates.push(path);
      }
    }

    if (backup) {
      restorationIncomplete = true;
      evidenceCandidates.push(backup.path);
    }

    if (lock) {
      if (publicationCommitted || restorationIncomplete) {
        restorationIncomplete = true;
        evidenceCandidates.push(lock.path, path);
      } else {
        try {
          if (!await releaseConfigLock(fileSystem, lock, platform)) {
            restorationIncomplete = true;
            evidenceCandidates.push(lock.path);
          }
        } catch {
          restorationIncomplete = true;
          evidenceCandidates.push(lock.path);
        }
      }
      lock = null;
    }

    try {
      if (!await removeCreatedConfigDirectory(fileSystem, createdDirectory)) {
        restorationIncomplete = true;
        evidenceCandidates.push(createdDirectory.path);
      }
    } catch {
      restorationIncomplete = true;
      if (createdDirectory) evidenceCandidates.push(createdDirectory.path);
    }

    if (restorationIncomplete) {
      const evidencePaths = await existingEvidencePaths(fileSystem, evidenceCandidates);
      throw markRestorationIncomplete(error, evidencePaths.length > 0 ? evidencePaths : evidenceCandidates);
    }
    throw error;
  }
}
