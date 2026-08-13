#!/usr/bin/env bun
/**
 * @typedef {{
 *   home: string,
 *   claudeConfigDir: string,
 *   clawgodDir: string,
 *   bunPath: string,
 *   claudeCliPath: string,
 *   fetchFilePath: string,
 *   env: Record<string, string | undefined>,
 *   spawnSyncImpl: typeof Bun.spawnSync,
 *   onManagedDirectoryPublishing?: (transaction: object) => void,
 *   onManagedDirectoryInstalled?: (transaction: object) => void,
 *   onPersistentTransactionPrepared?: (transaction: object) => void,
 *   onCacheQuarantined?: (transaction: object) => void,
 *   onCacheFailedInspected?: (transaction: object) => void,
 *   onCacheCleanupInventoried?: (transaction: object) => void,
 *   onHudWriting?: (write: { label: string }) => void,
 *   onHudWritten?: (write: { label: string }) => void,
 *   onHudRestoring?: (write: { label: string }) => void,
 *   onHudRestored?: (write: { label: string }) => void,
 *   onClaudeMemWriting?: (write: { relativePath: string }) => void,
 *   onClaudeMemWritten?: (write: { relativePath: string }) => void,
 * }} PluginContext
 */

import { chmodSync, closeSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, unlinkSync, writeSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PLUGIN_BASELINES = Object.freeze({
  hud: Object.freeze({
    key: 'hud', id: 'claude-hud@claude-hud', marketplace: 'claude-hud', plugin: 'claude-hud',
    version: '0.7.0', bytes: 754443,
    sha256: '59bd3ec17e7b9181d8069c93cc7c5e1db8b1d33e6a94e4041f6589dd8b87c912',
    url: 'https://hub.211107.xyz/https://github.com/jarrodwatts/claude-hud/archive/refs/tags/v0.7.0.tar.gz',
  }),
  memory: Object.freeze({
    key: 'memory', id: 'claude-mem@thedotmack', marketplace: 'thedotmack', plugin: 'claude-mem',
    version: '13.14.0', bytes: 11817347,
    sha256: 'a64f7dd038308da0db52f10d8f4fc2b3b3acfec5d9ddfdcfea9f6e473e54bed0',
    url: 'https://hub.211107.xyz/https://github.com/thedotmack/claude-mem/archive/refs/tags/v13.14.0.tar.gz',
  }),
  superpowers: Object.freeze({
    key: 'superpowers', id: 'superpowers@superpowers-marketplace', marketplace: 'superpowers-marketplace', plugin: 'superpowers',
    archiveMarketplace: 'superpowers-dev',
    version: '6.2.0', bytes: 516401,
    sha256: '468246a7b4981d4c014c2b58d9ee538700ffded075279d5810059cdc1abeb5f3',
    url: 'https://hub.211107.xyz/https://github.com/obra/superpowers/archive/refs/tags/v6.2.0.tar.gz',
  }),
});

export const PLUGIN_ENHANCEMENT_IDS = Object.freeze({
  hud: 'claude-hud',
  memory: 'claude-mem',
  superpowers: 'superpowers',
});

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 512 * 1024 * 1024;
const MAX_ENTRIES = 50_000;
const TAR_BLOCK_BYTES = 512;
const textDecoder = new TextDecoder('utf-8', { fatal: true });

export const HUD_CONFIG_TEXT = `{
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

function pathIsContained(root, path) {
  const child = relative(root, path);
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child));
}

function hudDirectoryChainIsSafe(root, target) {
  if (!pathIsContained(root, target)) return false;
  let current = root;
  for (const part of ['', ...relative(root, target).split(sep).filter(Boolean)]) {
    if (part) current = join(current, part);
    try {
      const status = lstatSync(current);
      if (status.isSymbolicLink() || !status.isDirectory()) return false;
    } catch { return false; }
  }
  return true;
}

function hudFileSnapshot(root, path, label, parseJson = false) {
  if (!isAbsolute(root) || !isAbsolute(path) || !pathIsContained(root, path)) {
    throw new Error(`hud: unsafe ${label} path`);
  }
  const pathParts = relative(root, dirname(path)).split(sep).filter(Boolean);
  let current = root;
  for (const part of ['', ...pathParts]) {
    if (part) current = join(current, part);
    let status;
    try { status = lstatSync(current); } catch { throw new Error(`hud: unsafe ${label} ancestor`); }
    if (status.isSymbolicLink() || !status.isDirectory() || (status.mode & 0o022) !== 0) {
      throw new Error(`hud: unsafe ${label} ancestor`);
    }
  }
  const parentStatus = lstatSync(dirname(path));
  let status;
  try { status = lstatSync(path); } catch (error) {
    if (error?.code === 'ENOENT') {
      return { path, present: false, bytes: null, mode: null, nlink: null, identity: null, parentIdentity: { dev: parentStatus.dev, ino: parentStatus.ino } };
    }
    throw new Error(`hud: unsafe ${label}`);
  }
  if (status.isSymbolicLink() || !status.isFile() || (status.mode & 0o022) !== 0) {
    throw new Error(`hud: unsafe ${label}`);
  }
  const bytes = readFileSync(path);
  let value;
  if (parseJson) {
    try { value = JSON.parse(textDecoder.decode(bytes)); } catch { throw new Error(`hud: invalid ${label} JSON`); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`hud: invalid ${label} JSON`);
  }
  return {
    path, present: true, bytes, value, mode: status.mode & 0o777, nlink: status.nlink,
    identity: { dev: status.dev, ino: status.ino },
    parentIdentity: { dev: parentStatus.dev, ino: parentStatus.ino },
  };
}

function assertHudSnapshotCurrent(snapshot, root, label) {
  const current = hudFileSnapshot(root, snapshot.path, label, false);
  if (current.present !== snapshot.present
    || (current.present && (current.identity.dev !== snapshot.identity.dev || current.identity.ino !== snapshot.identity.ino))
    || (current.present && (current.mode !== snapshot.mode || current.nlink !== snapshot.nlink || !Buffer.from(current.bytes).equals(Buffer.from(snapshot.bytes))))
    || current.parentIdentity.dev !== snapshot.parentIdentity.dev
    || current.parentIdentity.ino !== snapshot.parentIdentity.ino) {
    throw new Error(`hud: ${label} changed during update`);
  }
}

function atomicHudWrite(root, snapshot, bytes, targetMode, label) {
  const temporary = join(dirname(snapshot.path), `.${basename(snapshot.path)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  let descriptor = null;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    let offset = 0;
    while (offset < bytes.byteLength) offset += writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    chmodSync(temporary, targetMode);
    assertHudSnapshotCurrent(snapshot, root, label);
    const temporaryStatus = lstatSync(temporary);
    if (temporaryStatus.isSymbolicLink() || !temporaryStatus.isFile()) throw new Error(`hud: unsafe temporary ${label}`);
    renameSync(temporary, snapshot.path);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    try { unlinkSync(temporary); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
}

function planHudConfigSnapshot(root, path) {
  const parent = dirname(path);
  try {
    return { snapshot: hudFileSnapshot(root, path, 'HUD config'), missingParent: null };
  } catch (error) {
    try { lstatSync(parent); throw error; } catch (parentError) {
      if (parentError?.code !== 'ENOENT') throw error;
    }
    const grandparent = dirname(parent);
    if (!hudDirectoryChainIsSafe(root, grandparent)) throw new Error('hud: unsafe HUD config ancestor');
    const status = lstatSync(grandparent);
    return { snapshot: null, missingParent: { path: parent, parentIdentity: { dev: status.dev, ino: status.ino } } };
  }
}

function createHudConfigParent(root, plan) {
  if (!plan.missingParent) return { snapshot: plan.snapshot, createdParent: null };
  const parent = plan.missingParent.path;
  const grandparent = dirname(parent);
  if (!hudDirectoryChainIsSafe(root, grandparent)) throw new Error('hud: unsafe HUD config ancestor');
  const status = lstatSync(grandparent);
  if (status.dev !== plan.missingParent.parentIdentity.dev || status.ino !== plan.missingParent.parentIdentity.ino) {
    throw new Error('hud: HUD config ancestor changed during update');
  }
  try { lstatSync(parent); throw new Error('hud: HUD config parent changed during update'); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  mkdirSync(parent, 0o700);
  const created = lstatSync(parent);
  if (created.isSymbolicLink() || !created.isDirectory()) throw new Error('hud: unsafe created HUD config parent');
  return { snapshot: hudFileSnapshot(root, join(parent, 'config.json'), 'HUD config'), createdParent: { path: parent, dev: created.dev, ino: created.ino } };
}

function removeCreatedHudConfigParent(createdParent) {
  if (!createdParent) return;
  const status = lstatSync(createdParent.path);
  if (status.isSymbolicLink() || !status.isDirectory() || status.dev !== createdParent.dev || status.ino !== createdParent.ino) {
    throw new Error('hud: created HUD config parent changed during rollback');
  }
  rmdirSync(createdParent.path);
}

function rollbackHudWrite(write) {
  const current = hudFileSnapshot(write.root, write.snapshot.path, write.label);
  try { assertHudSnapshotCurrent(write.postWrite, write.root, write.label); }
  catch {
    throw new Error(`hud: ${write.label} changed before rollback`);
  }
  if (write.snapshot.present) {
    atomicHudWrite(write.root, current, write.snapshot.bytes, write.snapshot.mode, write.label);
  } else {
    atomicHudRemove(write.root, current, write.label);
  }
}

function rollbackClaudeMemWrites(writes) {
  const transferred = [];
  const errors = [];
  for (const write of [...writes].reverse()) {
    try { assertHudSnapshotCurrent(write.postWrite, write.root, write.label); }
    catch {
      transferred.push(write.label);
      continue;
    }
    try { rollbackHudWrite(write); }
    catch (error) { errors.push(error); }
  }
  return { transferred, errors };
}

function atomicHudRemove(root, snapshot, label) {
  assertHudSnapshotCurrent(snapshot, root, label);
  if (snapshot.present) unlinkSync(snapshot.path);
}

function jsonFingerprint(value) {
  return sha256(new TextEncoder().encode(JSON.stringify(value)));
}

function fileFingerprint(bytes) {
  return sha256(bytes instanceof Uint8Array ? bytes : new TextEncoder().encode(bytes));
}

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isPlainRecord(value) && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function isCanonicalBase64(value) {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false;
  return Buffer.from(value, 'base64').toString('base64') === value;
}

function validateClaudeMemOwnership(files) {
  if (!isPlainRecord(files)) throw new Error('claude-mem: unsupported or malformed ownership state');
  const hashPattern = /^[0-9a-f]{64}$/;
  const seen = new Set();
  for (const [targetPath, record] of Object.entries(files)) {
    if (!isAbsolute(targetPath) || resolve(targetPath) !== targetPath || seen.has(targetPath)
      || !hasExactKeys(record, ['relativePath', 'pluginVersion', 'originalBase64', 'originalSha256', 'managedSha256'])
      || (record.relativePath !== 'hooks/hooks.json' && record.relativePath !== '.mcp.json')
      || !parseSemver(record.pluginVersion)
      || !isCanonicalBase64(record.originalBase64)
      || !hashPattern.test(record.originalSha256)
      || record.originalSha256 !== fileFingerprint(Buffer.from(record.originalBase64, 'base64'))
      || !hashPattern.test(record.managedSha256)) {
      throw new Error('claude-mem: unsupported or malformed ownership state');
    }
    const suffix = record.relativePath === 'hooks/hooks.json'
      ? join('hooks', 'hooks.json') : '.mcp.json';
    if ((record.relativePath === 'hooks/hooks.json' && !targetPath.endsWith(`${sep}${suffix}`))
      || (record.relativePath === '.mcp.json' && basename(targetPath) !== suffix)) {
      throw new Error('claude-mem: unsupported or malformed ownership state');
    }
    seen.add(targetPath);
  }
}

function validateClaudeMemOwnershipContext(files, context) {
  const cacheRoot = resolve(context.claudeConfigDir, 'plugins', 'cache', 'thedotmack', 'claude-mem');
  for (const [targetPath, record] of Object.entries(files)) {
    if (compareSemver(record.pluginVersion, PLUGIN_BASELINES.memory.version) < 0) {
      throw new Error('claude-mem: ambiguous ownership state');
    }
    const expected = record.relativePath === 'hooks/hooks.json'
      ? resolve(cacheRoot, record.pluginVersion, 'hooks', 'hooks.json')
      : resolve(cacheRoot, record.pluginVersion, '.mcp.json');
    if (targetPath !== expected || !pathIsContained(cacheRoot, targetPath)) {
      throw new Error('claude-mem: ambiguous ownership state');
    }
  }
}

function managedStatusLineCommandIsValid(command, modulePath, platform = process.platform) {
  if (typeof command !== 'string' || typeof modulePath !== 'string') return false;
  let moduleArgument;
  try { moduleArgument = quoteStatusLineArg(modulePath, platform); } catch { return false; }
  const suffix = ` ${moduleArgument}`;
  if (!command.endsWith(suffix)) return false;
  const bunArgument = command.slice(0, -suffix.length);
  let bunPath;
  if (platform === 'win32') {
    if (bunArgument.length < 2 || bunArgument[0] !== '"' || bunArgument.at(-1) !== '"') return false;
    bunPath = bunArgument.slice(1, -1);
  } else {
    if (bunArgument.length < 2 || bunArgument[0] !== "'" || bunArgument.at(-1) !== "'") return false;
    bunPath = bunArgument.slice(1, -1).replaceAll(`'"'"'`, "'");
  }
  try {
    if (quoteStatusLineArg(bunPath, platform) !== bunArgument) return false;
  } catch { return false; }
  const executable = bunPath.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase();
  return executable === 'bun' || executable === 'bun.exe';
}

function validateManagedHudState(value, allowInitial = false, managedContext = null) {
  if (!hasExactKeys(value, ['schemaVersion', 'hud', 'claudeMem']) || value.schemaVersion !== 1
    || !isPlainRecord(value.claudeMem) || !isPlainRecord(value.claudeMem.files) || !isPlainRecord(value.hud)) {
    throw new Error('hud: unsupported or malformed ownership state');
  }
  validateClaudeMemOwnership(value.claudeMem.files);
  if (Object.keys(value.hud).length === 0) return structuredClone(value);
  const config = value.hud.config;
  const statusLine = value.hud.statusLine;
  const hashPattern = /^[0-9a-f]{64}$/;
  if (!hasExactKeys(value.hud, ['config', 'statusLine'])
    || !hasExactKeys(config, ['originalPresent', 'originalBase64', 'managedSha256'])
    || typeof config.originalPresent !== 'boolean'
    || !isCanonicalBase64(config.originalBase64)
    || (!config.originalPresent && config.originalBase64 !== '')
    || !hashPattern.test(config.managedSha256)
    || config.managedSha256 !== fileFingerprint(HUD_CONFIG_TEXT)
    || !hasExactKeys(statusLine, ['originalPresent', 'originalValue', 'managedValue', 'managedSha256'])
    || typeof statusLine.originalPresent !== 'boolean'
    || (!statusLine.originalPresent && statusLine.originalValue !== null)
    || !hasExactKeys(statusLine.managedValue, ['type', 'command'])
    || statusLine.managedValue.type !== 'command'
    || typeof statusLine.managedValue.command !== 'string'
    || !managedStatusLineCommandIsValid(statusLine.managedValue.command, managedContext?.modulePath, managedContext?.platform)
    || !hashPattern.test(statusLine.managedSha256)
    || statusLine.managedSha256 !== jsonFingerprint(statusLine.managedValue)) {
    throw new Error('hud: unsupported or malformed ownership state');
  }
  return structuredClone(value);
}

function currentHudState(state, persisted, context, modulePath) {
  return validateManagedHudState(state, !persisted, { modulePath, platform: context.platform || process.platform });
}

function validateHudInstallPath(record, cacheRoot, claudeConfigDir) {
  if (record?.scope !== 'user' || !parseSemver(record.version) || typeof record.installPath !== 'string' || !isAbsolute(record.installPath)) return null;
  try {
    if (!pathIsContained(cacheRoot, record.installPath)
      || !hudDirectoryChainIsSafe(claudeConfigDir, cacheRoot)
      || !hudDirectoryChainIsSafe(cacheRoot, record.installPath)) return null;
    const cacheStatus = lstatSync(cacheRoot);
    const installStatus = lstatSync(record.installPath);
    if (cacheStatus.isSymbolicLink() || !cacheStatus.isDirectory() || installStatus.isSymbolicLink() || !installStatus.isDirectory()) return null;
    const realCache = realpathSync(cacheRoot);
    const realInstall = realpathSync(record.installPath);
    if (!pathIsContained(realCache, realInstall) || realInstall === realCache) return null;
    const source = join(record.installPath, 'src');
    const entry = join(source, 'index.ts');
    const sourceStatus = lstatSync(source);
    const entryStatus = lstatSync(entry);
    if (sourceStatus.isSymbolicLink() || !sourceStatus.isDirectory() || entryStatus.isSymbolicLink() || !entryStatus.isFile() || entryStatus.nlink !== 1) return null;
    const realEntry = realpathSync(entry);
    if (!pathIsContained(realInstall, realEntry)) return null;
    return { record, entry: realEntry };
  } catch {
    return null;
  }
}

function selectedHudInstall(installed, claudeConfigDir) {
  const records = Array.isArray(installed?.plugins?.['claude-hud@claude-hud'])
    ? installed.plugins['claude-hud@claude-hud'] : [];
  const cacheRoot = join(claudeConfigDir, 'plugins', 'cache', 'claude-hud', 'claude-hud');
  const valid = records.map(record => validateHudInstallPath(record, cacheRoot, claudeConfigDir)).filter(Boolean);
  valid.sort((left, right) => compareSemver(right.record.version, left.record.version));
  return valid[0] || null;
}

function validateClaudeMemInstallPath(record, cacheRoot, claudeConfigDir) {
  if (record?.scope !== 'user' || !parseSemver(record.version) || typeof record.installPath !== 'string' || !isAbsolute(record.installPath)) return null;
  const expectedPath = resolve(cacheRoot, record.version);
  if (resolve(record.installPath) !== expectedPath) return null;
  try {
    if (!pathIsContained(cacheRoot, expectedPath)
      || !hudDirectoryChainIsSafe(claudeConfigDir, cacheRoot)
      || !hudDirectoryChainIsSafe(cacheRoot, expectedPath)) return null;
    const cacheStatus = lstatSync(cacheRoot);
    const installStatus = lstatSync(expectedPath);
    if (cacheStatus.isSymbolicLink() || !cacheStatus.isDirectory() || installStatus.isSymbolicLink() || !installStatus.isDirectory()) return null;
    const realCache = realpathSync(cacheRoot);
    const realInstall = realpathSync(expectedPath);
    if (!pathIsContained(realCache, realInstall) || realInstall === realCache || realInstall !== expectedPath) return null;
    return { record, installPath: expectedPath };
  } catch {
    return null;
  }
}

function selectedClaudeMemInstall(installed, claudeConfigDir) {
  const records = Array.isArray(installed?.plugins?.['claude-mem@thedotmack'])
    ? installed.plugins['claude-mem@thedotmack'] : [];
  const cacheRoot = join(claudeConfigDir, 'plugins', 'cache', 'thedotmack', 'claude-mem');
  const valid = records.map(record => validateClaudeMemInstallPath(record, cacheRoot, claudeConfigDir)).filter(Boolean);
  valid.sort((left, right) => compareSemver(right.record.version, left.record.version));
  return valid[0] || null;
}

function captureClaudeMemSelection(installedSnapshot, selected, context) {
  const directories = [];
  let current = context.claudeConfigDir;
  for (const part of ['', ...relative(context.claudeConfigDir, selected.installPath).split(sep).filter(Boolean)]) {
    if (part) current = join(current, part);
    const status = lstatSync(current);
    if (status.isSymbolicLink() || !status.isDirectory()) throw new Error('claude-mem: unsafe selected cache identity');
    directories.push({ path: current, dev: status.dev, ino: status.ino, mode: status.mode, nlink: status.nlink });
  }
  return { installedSnapshot, directories };
}

function assertClaudeMemSelectionCurrent(selection, context) {
  assertHudSnapshotCurrent(selection.installedSnapshot, context.claudeConfigDir, 'installed plugin state');
  for (const expected of selection.directories) {
    const status = lstatSync(expected.path);
    if (status.isSymbolicLink() || !status.isDirectory() || status.dev !== expected.dev || status.ino !== expected.ino
      || status.mode !== expected.mode || status.nlink !== expected.nlink) {
      throw new Error('claude-mem: selected cache identity changed during update');
    }
  }
}

export function quoteStatusLineArg(path, platform = process.platform) {
  if (typeof path !== 'string' || path.includes('\0') || path.includes('*') || path.includes('$(') || path.includes('`')) {
    throw new Error('hud: unsafe status-line path');
  }
  if (platform === 'win32') {
    if (!/^(?:[A-Za-z]:[\\/]|\\\\)/.test(path) || /["%!&|<>()^\r\n]/.test(path)) {
      throw new Error('hud: unsafe Windows status-line path');
    }
    return `"${path}"`;
  }
  if (!isAbsolute(path)) throw new Error('hud: status-line path must be absolute');
  return `'${path.replaceAll("'", `'"'"'`)}'`;
}

function claudeMemBunPath(path) {
  if (typeof path !== 'string' || path.includes('\0') || path.includes('\r') || path.includes('\n')
    || (!isAbsolute(path) && !/^[A-Za-z]:[\\/]/.test(path))) {
    throw new Error('claude-mem: Bun path must be absolute');
  }
  const executable = path.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase();
  if (executable !== 'bun' && executable !== 'bun.exe') throw new Error('claude-mem: executable is not Bun');
  return path;
}

function quoteClaudeMemHookBun(path) {
  return `'${claudeMemBunPath(path).replaceAll("'", `'"'"'`)}'`;
}

function parseClaudeMemJson(relativePath, raw) {
  if (typeof raw !== 'string') throw new Error(`claude-mem: invalid ${relativePath} JSON`);
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error(`claude-mem: invalid ${relativePath} JSON`); }
  if (!isPlainRecord(value)) throw new Error(`claude-mem: invalid ${relativePath} schema`);
  return value;
}

function claudeMemPluginNodePositions(command) {
  const positions = [];
  let quote = null;
  let atCommandStart = true;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (quote === "'") {
      if (character === "'") quote = null;
      continue;
    }
    if (quote === '"') {
      if (character === '\\') index += 1;
      else if (character === '"') quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      if (atCommandStart) atCommandStart = false;
      quote = character;
      continue;
    }
    if (character === '\\') {
      if (atCommandStart) atCommandStart = false;
      index += 1;
      continue;
    }
    if (character === ';' || character === '&' || character === '|' || character === '\n') {
      atCommandStart = true;
      continue;
    }
    if (atCommandStart && /\s/.test(character)) continue;
    if (!atCommandStart) continue;
    const candidate = command.slice(index);
    if (/^node\s+(?=["']?\$_P\/scripts\/)/.test(candidate)) positions.push(index);
    atCommandStart = false;
  }
  if (quote !== null) throw new Error('claude-mem: unterminated shell quote');
  return positions;
}

export function rewriteClaudeMemFile(relativePath, raw, bunPath) {
  if (relativePath !== 'hooks/hooks.json' && relativePath !== '.mcp.json') {
    throw new Error('claude-mem: unsupported integration path');
  }
  const value = parseClaudeMemJson(relativePath, raw);
  claudeMemBunPath(bunPath);
  if (relativePath === '.mcp.json') {
    const server = isPlainRecord(value.mcpServers) ? value.mcpServers['mcp-search'] : null;
    if (!isPlainRecord(server) || server.type !== 'stdio' || server.command !== 'node'
      || !Array.isArray(server.args) || server.args.length < 2 || server.args[0] !== '-e' || typeof server.args[1] !== 'string') {
      throw new Error('claude-mem: invalid mcp-search schema');
    }
    server.command = bunPath;
    return { text: JSON.stringify(value, null, 2) + '\n', replacements: 1 };
  }

  if (!isPlainRecord(value.hooks)) throw new Error('claude-mem: invalid hooks schema');
  const known = [
    { token: 'node "$_P/scripts/version-check.js"', label: 'version-check' },
    { token: 'node "$_P/scripts/bun-runner.js"', label: 'bun-runner' },
  ];
  const counts = { 'version-check': 0, 'bun-runner': 0 };
  const quotedBun = quoteClaudeMemHookBun(bunPath);
  for (const groups of Object.values(value.hooks)) {
    if (!Array.isArray(groups)) throw new Error('claude-mem: invalid hooks schema');
    for (const group of groups) {
      if (!isPlainRecord(group) || !Array.isArray(group.hooks)) throw new Error('claude-mem: invalid hooks schema');
      for (const hook of group.hooks) {
        if (!isPlainRecord(hook) || typeof hook.command !== 'string') throw new Error('claude-mem: invalid hook command schema');
        const replacements = [];
        const commandCounts = { 'version-check': 0, 'bun-runner': 0 };
        for (const position of claudeMemPluginNodePositions(hook.command)) {
          const entry = known.find(candidate => hook.command.startsWith(candidate.token, position)
            && (hook.command[position + candidate.token.length] === undefined
              || /[\s;&|]/.test(hook.command[position + candidate.token.length])));
          if (!entry) throw new Error('claude-mem: remaining unknown Node executable');
          commandCounts[entry.label] += 1;
          if (commandCounts[entry.label] > 1) throw new Error(`claude-mem: duplicate ${entry.label} executable`);
          replacements.push({ position, entry });
        }
        for (const replacement of replacements.reverse()) {
          const before = hook.command.slice(0, replacement.position);
          const after = hook.command.slice(replacement.position + replacement.entry.token.length);
          hook.command = `${before}${quotedBun}${replacement.entry.token.slice(4)}${after}`;
          counts[replacement.entry.label] += 1;
        }
      }
    }
  }
  if (counts['version-check'] < 1 || counts['bun-runner'] < 1) {
    throw new Error('claude-mem: missing required hook replacement');
  }
  return { text: JSON.stringify(value, null, 2) + '\n', replacements: counts['version-check'] + counts['bun-runner'] };
}

export async function configureClaudeMemBun(context, state) {
  const spec = PLUGIN_BASELINES.memory;
  const completedWrites = [];
  let ownershipWrite = null;
  try {
    claudeMemBunPath(context.bunPath);
    const installedPath = join(context.claudeConfigDir, 'plugins', 'installed_plugins.json');
    const installedSnapshot = hudFileSnapshot(context.claudeConfigDir, installedPath, 'installed plugin state', true);
    if (!installedSnapshot.present || installedSnapshot.value.version !== 2 || !isPlainRecord(installedSnapshot.value.plugins)) {
      throw new Error('claude-mem: unsupported installed plugin schema');
    }
    const selected = selectedClaudeMemInstall(installedSnapshot.value, context.claudeConfigDir);
    if (!selected || compareSemver(selected.record.version, spec.version) < 0) {
      throw new Error('claude-mem: no valid baseline user installation');
    }
    const selection = captureClaudeMemSelection(installedSnapshot, selected, context);
    const statePath = join(context.clawgodDir, 'plugin-dependencies-state.json');
    const stateSnapshot = hudFileSnapshot(context.clawgodDir, statePath, 'ownership state', true);
    const nextState = validateManagedHudState(
      stateSnapshot.present ? stateSnapshot.value : state,
      !stateSnapshot.present,
      { modulePath: join(context.clawgodDir, 'claude-hud-statusline.mjs'), platform: context.platform || process.platform },
    );
    validateClaudeMemOwnershipContext(nextState.claudeMem.files, context);
    const definitions = [
      { relativePath: 'hooks/hooks.json', targetPath: resolve(selected.installPath, 'hooks', 'hooks.json') },
      { relativePath: '.mcp.json', targetPath: resolve(selected.installPath, '.mcp.json') },
    ];
    const plans = [];
    for (const definition of definitions) {
      const snapshot = hudFileSnapshot(selected.installPath, definition.targetPath, definition.relativePath);
      if (!snapshot.present) throw new Error(`claude-mem: missing ${definition.relativePath}`);
      const currentHash = fileFingerprint(snapshot.bytes);
      const prior = nextState.claudeMem.files[definition.targetPath];
      if (prior && currentHash === prior.managedSha256) {
        plans.push({ ...definition, snapshot, bytes: snapshot.bytes, write: false });
        continue;
      }
      const rewritten = rewriteClaudeMemFile(definition.relativePath, textDecoder.decode(snapshot.bytes), context.bunPath);
      const managedBytes = Buffer.from(rewritten.text);
      nextState.claudeMem.files[definition.targetPath] = {
        relativePath: definition.relativePath,
        pluginVersion: selected.record.version,
        originalBase64: snapshot.bytes.toString('base64'),
        originalSha256: currentHash,
        managedSha256: fileFingerprint(managedBytes),
      };
      plans.push({ ...definition, snapshot, bytes: managedBytes, write: true });
    }
    if (plans.every(plan => !plan.write)) {
      const callerStateUpdate = state && typeof state === 'object'
        ? { keys: Object.keys(state), value: structuredClone(nextState) }
        : null;
      assertHudSnapshotCurrent(stateSnapshot, context.clawgodDir, 'ownership state');
      for (const plan of plans) {
        assertHudSnapshotCurrent(plan.snapshot, selected.installPath, `claude-mem ${plan.relativePath}`);
      }
      assertClaudeMemSelectionCurrent(selection, context);
      if (callerStateUpdate) {
        for (const key of callerStateUpdate.keys) delete state[key];
        Object.assign(state, callerStateUpdate.value);
      }
      return pluginResult(spec, 'configured', true, selected.record.version, `configured ${selected.record.version}`);
    }

    const writes = [{
      root: context.clawgodDir,
      snapshot: stateSnapshot,
      bytes: Buffer.from(JSON.stringify(nextState, null, 2) + '\n'),
      mode: stateSnapshot.present ? stateSnapshot.mode : 0o600,
      label: 'ownership state',
      relativePath: null,
    }, ...plans.filter(plan => plan.write).map(plan => ({
      root: selected.installPath,
      snapshot: plan.snapshot,
      bytes: plan.bytes,
      mode: plan.snapshot.mode,
      label: `claude-mem ${plan.relativePath}`,
      relativePath: plan.relativePath,
    }))];
    for (const write of writes) {
      if (write.relativePath) context.onClaudeMemWriting?.({ relativePath: write.relativePath });
      assertClaudeMemSelectionCurrent(selection, context);
      if (write.relativePath && ownershipWrite) {
        assertHudSnapshotCurrent(ownershipWrite.postWrite, ownershipWrite.root, ownershipWrite.label);
      }
      atomicHudWrite(write.root, write.snapshot, write.bytes, write.mode, write.label);
      const completedWrite = { ...write, postWrite: hudFileSnapshot(write.root, write.snapshot.path, write.label) };
      completedWrites.push(completedWrite);
      if (!write.relativePath) ownershipWrite = completedWrite;
      if (write.relativePath) context.onClaudeMemWritten?.({ relativePath: write.relativePath });
    }
    assertClaudeMemSelectionCurrent(selection, context);
    assertHudSnapshotCurrent(ownershipWrite.postWrite, ownershipWrite.root, ownershipWrite.label);
    if (state && typeof state === 'object') {
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, structuredClone(nextState));
    }
    return pluginResult(spec, 'configured', true, selected.record.version, `configured ${selected.record.version}`);
  } catch (error) {
    const rollback = rollbackClaudeMemWrites(completedWrites);
    const primary = error instanceof Error ? error.message : 'claude-mem configuration failed';
    const message = rollback.errors.length > 0
      ? `rollback incomplete: ${rollback.errors[0].message}`
      : rollback.transferred.length > 0
        ? `${primary}; ownership transferred: ${rollback.transferred.join(', ')}`
        : primary;
    return pluginResult(spec, 'warning', false, null, `preserved but not Bun-verified: ${message}`);
  }
}

function hudStatusLineCommand(context, modulePath) {
  const executable = context.bunPath.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase();
  if (executable !== 'bun' && executable !== 'bun.exe') throw new Error('hud: statusLine executable is not Bun');
  const command = `${quoteStatusLineArg(context.bunPath, context.platform)} ${quoteStatusLineArg(modulePath, context.platform)}`;
  const lowered = command.toLowerCase();
  if (lowered.includes('bash -c') || lowered.includes(' ls ') || lowered.includes(' head ')
    || command.includes('$(') || command.includes('`') || command.includes('*')) {
    throw new Error('hud: unsafe statusLine command');
  }
  return command;
}

const HUD_STATUSLINE_SOURCE_JSON = "@@CLAWGOD_HUD_STATUSLINE_SOURCE_JSON@@";
const HUD_STATUSLINE_SOURCE_TOKEN = '@@' + 'CLAWGOD_HUD_STATUSLINE_SOURCE_JSON' + '@@';

function hudStatusLineSource() {
  if (HUD_STATUSLINE_SOURCE_JSON === HUD_STATUSLINE_SOURCE_TOKEN) {
    return readFileSync(new URL('./claude-hud-statusline.mjs', import.meta.url), 'utf8');
  }
  return JSON.parse(HUD_STATUSLINE_SOURCE_JSON);
}

export function renderHudStatusLineModule(context) {
  if (!isAbsolute(context.claudeConfigDir)) throw new Error('hud: Claude config path must be absolute');
  return hudStatusLineSource().replace("\"/__CLAWGOD_HUD_CLAUDE_CONFIG_DIR__\"", JSON.stringify(context.claudeConfigDir));
}

export async function configureHud(context, state) {
  const spec = PLUGIN_BASELINES.hud;
  let createdParent = null;
  const completedWrites = [];
  try {
    const installedPath = join(context.claudeConfigDir, 'plugins', 'installed_plugins.json');
    const installedSnapshot = hudFileSnapshot(context.claudeConfigDir, installedPath, 'installed plugin state', true);
    if (!installedSnapshot.present) throw new Error('hud: installed plugin state is missing');
    if (installedSnapshot.value.version !== 2 || !isPlainRecord(installedSnapshot.value.plugins)) {
      throw new Error('hud: unsupported installed plugin schema');
    }
    const selected = selectedHudInstall(installedSnapshot.value, context.claudeConfigDir);
    if (!selected || compareSemver(selected.record.version, spec.version) < 0) throw new Error('hud: no valid baseline user HUD installation');

    const configPath = join(context.claudeConfigDir, 'plugins', 'claude-hud', 'config.json');
    const settingsPath = join(context.claudeConfigDir, 'settings.json');
    const modulePath = join(context.clawgodDir, 'claude-hud-statusline.mjs');
    const statePath = join(context.clawgodDir, 'plugin-dependencies-state.json');
    const settingsSnapshot = hudFileSnapshot(context.claudeConfigDir, settingsPath, 'settings', true);
    const moduleSnapshot = hudFileSnapshot(context.clawgodDir, modulePath, 'status-line module');
    const stateSnapshot = hudFileSnapshot(context.clawgodDir, statePath, 'ownership state', true);
    const nextState = currentHudState(stateSnapshot.present ? stateSnapshot.value : state, stateSnapshot.present, context, modulePath);
    const configPlan = planHudConfigSnapshot(context.claudeConfigDir, configPath);
    const preparedConfig = createHudConfigParent(context.claudeConfigDir, configPlan);
    const configSnapshot = preparedConfig.snapshot;
    createdParent = preparedConfig.createdParent;
    const settings = settingsSnapshot.present ? settingsSnapshot.value : {};
    const priorConfig = nextState.hud.config;
    if (!priorConfig?.managedSha256 || !configSnapshot.present || fileFingerprint(configSnapshot.bytes) !== priorConfig.managedSha256) {
      nextState.hud.config = {
        originalPresent: configSnapshot.present,
        originalBase64: configSnapshot.present ? configSnapshot.bytes.toString('base64') : '',
        managedSha256: fileFingerprint(HUD_CONFIG_TEXT),
      };
    } else {
      nextState.hud.config.managedSha256 = fileFingerprint(HUD_CONFIG_TEXT);
    }

    const moduleText = renderHudStatusLineModule(context);
    const command = hudStatusLineCommand(context, modulePath);
    const managedValue = { type: 'command', command };
    const currentPresent = Object.hasOwn(settings, 'statusLine');
    const currentValue = settings.statusLine;
    const priorStatus = nextState.hud.statusLine;
    if (!priorStatus?.managedSha256 || !currentPresent || jsonFingerprint(currentValue) !== priorStatus.managedSha256) {
      nextState.hud.statusLine = {
        originalPresent: currentPresent,
        originalValue: currentPresent ? structuredClone(currentValue) : null,
        managedValue,
        managedSha256: jsonFingerprint(managedValue),
      };
    } else {
      nextState.hud.statusLine.managedValue = managedValue;
      nextState.hud.statusLine.managedSha256 = jsonFingerprint(managedValue);
    }
    const nextSettings = { ...settings, statusLine: managedValue };
    const stateText = JSON.stringify(nextState, null, 2) + '\n';

    const writes = [
      { root: context.clawgodDir, snapshot: stateSnapshot, bytes: Buffer.from(stateText), mode: stateSnapshot.present ? stateSnapshot.mode : 0o600, label: 'ownership state' },
      { root: context.clawgodDir, snapshot: moduleSnapshot, bytes: Buffer.from(moduleText), mode: moduleSnapshot.present ? moduleSnapshot.mode : 0o700, label: 'status-line module' },
      { root: context.claudeConfigDir, snapshot: configSnapshot, bytes: Buffer.from(HUD_CONFIG_TEXT), mode: configSnapshot.present ? configSnapshot.mode : 0o600, label: 'HUD config' },
      { root: context.claudeConfigDir, snapshot: settingsSnapshot, bytes: Buffer.from(JSON.stringify(nextSettings, null, 2) + '\n'), mode: settingsSnapshot.present ? settingsSnapshot.mode : 0o600, label: 'settings' },
    ];
    for (const write of writes) {
      context.onHudWriting?.({ label: write.label });
      atomicHudWrite(write.root, write.snapshot, write.bytes, write.mode, write.label);
      completedWrites.push({ ...write, postWrite: hudFileSnapshot(write.root, write.snapshot.path, write.label) });
      context.onHudWritten?.({ label: write.label });
    }
    if (state && typeof state === 'object') {
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, structuredClone(nextState));
    }
    return pluginResult(spec, 'configured', true, selected.record.version, `configured ${selected.record.version}`);
  } catch (error) {
    const rollbackErrors = [];
    for (const write of completedWrites.reverse()) {
      try { rollbackHudWrite(write); }
      catch (rollbackError) { rollbackErrors.push(rollbackError); break; }
    }
    if (rollbackErrors.length === 0) {
      try { removeCreatedHudConfigParent(createdParent); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (rollbackErrors.length > 0) return pluginResult(spec, 'warning', false, null, `hud: rollback incomplete: ${rollbackErrors[0].message}`);
    return pluginResult(spec, 'warning', false, null, error.message);
  }
}

export async function restoreHud(context, state) {
  const completedWrites = [];
  try {
    const statePath = join(context.clawgodDir, 'plugin-dependencies-state.json');
    const modulePath = join(context.clawgodDir, 'claude-hud-statusline.mjs');
    const configPath = join(context.claudeConfigDir, 'plugins', 'claude-hud', 'config.json');
    const settingsPath = join(context.claudeConfigDir, 'settings.json');
    const stateSnapshot = hudFileSnapshot(context.clawgodDir, statePath, 'ownership state', true);
    if (!stateSnapshot.present) return { restored: [], conflicts: [], failures: [] };
    const ownershipState = currentHudState(stateSnapshot.value, true, context, modulePath);
    if (Object.keys(ownershipState.hud).length === 0) return { restored: [], conflicts: [], failures: [] };
    const ownership = ownershipState.hud;
    const configSnapshot = hudFileSnapshot(context.claudeConfigDir, configPath, 'HUD config');
    const settingsSnapshot = hudFileSnapshot(context.claudeConfigDir, settingsPath, 'settings', true);
    const restored = [];
    const conflicts = [];
    const ownsConfig = configSnapshot.present && fileFingerprint(configSnapshot.bytes) === ownership.config.managedSha256;
    if (!ownsConfig) conflicts.push('hud config');
    const settings = settingsSnapshot.present ? settingsSnapshot.value : {};
    const ownsStatusLine = Object.hasOwn(settings, 'statusLine')
      && jsonFingerprint(settings.statusLine) === ownership.statusLine.managedSha256;
    if (!ownsStatusLine) conflicts.push('statusLine');
    if (!ownsConfig && !ownsStatusLine) return { restored, conflicts, failures: [] };

    const operations = [];
    if (ownsStatusLine) {
      const nextSettings = { ...settings };
      if (ownership.statusLine.originalPresent) nextSettings.statusLine = structuredClone(ownership.statusLine.originalValue);
      else delete nextSettings.statusLine;
      operations.push({
        root: context.claudeConfigDir,
        snapshot: settingsSnapshot,
        bytes: Buffer.from(JSON.stringify(nextSettings, null, 2) + '\n'),
        mode: settingsSnapshot.mode || 0o600,
        remove: !ownership.statusLine.originalPresent && Object.keys(nextSettings).length === 0,
        label: 'settings',
        restoredLabel: 'statusLine',
      });
    }
    if (ownsConfig) {
      operations.push({
        root: context.claudeConfigDir,
        snapshot: configSnapshot,
        bytes: Buffer.from(ownership.config.originalBase64, 'base64'),
        mode: configSnapshot.mode,
        remove: !ownership.config.originalPresent,
        label: 'HUD config',
        restoredLabel: 'hud config',
      });
    }
    operations.push({
      root: context.clawgodDir,
      snapshot: stateSnapshot,
      bytes: stateSnapshot.bytes,
      mode: stateSnapshot.mode,
      remove: false,
      label: 'ownership state',
      restoredLabel: null,
    });

    for (const operation of operations) {
      context.onHudRestoring?.({ label: operation.label });
      if (operation.remove) atomicHudRemove(operation.root, operation.snapshot, operation.label);
      else atomicHudWrite(operation.root, operation.snapshot, operation.bytes, operation.mode, operation.label);
      completedWrites.push({
        ...operation,
        postWrite: hudFileSnapshot(operation.root, operation.snapshot.path, operation.label),
      });
      if (operation.restoredLabel) restored.push(operation.restoredLabel);
      context.onHudRestored?.({ label: operation.label });
    }
    return { restored, conflicts, failures: [] };
  } catch (error) {
    const rollbackErrors = [];
    for (const write of completedWrites.reverse()) {
      try { rollbackHudWrite(write); }
      catch (rollbackError) { rollbackErrors.push(rollbackError); break; }
    }
    const message = rollbackErrors.length > 0
      ? `hud: rollback incomplete: ${rollbackErrors[0].message}`
      : (error instanceof Error ? error.message : 'hud: restore failed');
    return { restored: [], conflicts: [], failures: [message] };
  }
}

export async function restoreClaudeMemIntegrations(context) {
  const completedWrites = [];
  try {
    const statePath = join(context.clawgodDir, 'plugin-dependencies-state.json');
    const stateSnapshot = hudFileSnapshot(context.clawgodDir, statePath, 'ownership state', true);
    if (!stateSnapshot.present) return { restored: [], conflicts: [], failures: [] };
    const modulePath = join(context.clawgodDir, 'claude-hud-statusline.mjs');
    const ownershipState = currentHudState(stateSnapshot.value, true, context, modulePath);
    const entries = Object.entries(ownershipState.claudeMem.files);
    if (entries.length === 0) return { restored: [], conflicts: [], failures: [] };
    const nextState = structuredClone(ownershipState);
    const cacheRoot = resolve(context.claudeConfigDir, 'plugins', 'cache', 'thedotmack', 'claude-mem');
    const restored = [];
    const conflicts = [];
    const operations = [];
    for (const [targetPath, record] of entries) {
      const expected = record.relativePath === 'hooks/hooks.json'
        ? resolve(cacheRoot, record.pluginVersion, 'hooks', 'hooks.json')
        : resolve(cacheRoot, record.pluginVersion, '.mcp.json');
      if (targetPath !== expected || !pathIsContained(cacheRoot, targetPath)) {
        throw new Error('claude-mem: ownership target escaped the canonical cache');
      }
      let status;
      try { status = lstatSync(targetPath); }
      catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        conflicts.push(targetPath);
        delete nextState.claudeMem.files[targetPath];
        continue;
      }
      if (status.isSymbolicLink() || !status.isFile() || !hudDirectoryChainIsSafe(context.claudeConfigDir, dirname(targetPath))) {
        conflicts.push(targetPath);
        delete nextState.claudeMem.files[targetPath];
        continue;
      }
      let snapshot;
      try { snapshot = hudFileSnapshot(context.claudeConfigDir, targetPath, record.relativePath); }
      catch {
        conflicts.push(targetPath);
        delete nextState.claudeMem.files[targetPath];
        continue;
      }
      if (fileFingerprint(snapshot.bytes) !== record.managedSha256) {
        conflicts.push(targetPath);
        delete nextState.claudeMem.files[targetPath];
        continue;
      }
      operations.push({
        root: context.claudeConfigDir,
        snapshot,
        bytes: Buffer.from(record.originalBase64, 'base64'),
        mode: snapshot.mode,
        label: `claude-mem ${record.relativePath}`,
        restoredLabel: targetPath,
      });
      delete nextState.claudeMem.files[targetPath];
    }
    for (const operation of operations) {
      atomicHudWrite(operation.root, operation.snapshot, operation.bytes, operation.mode, operation.label);
      completedWrites.push({ ...operation, postWrite: hudFileSnapshot(operation.root, operation.snapshot.path, operation.label) });
      restored.push(operation.restoredLabel);
    }
    const stateBytes = Buffer.from(JSON.stringify(nextState, null, 2) + '\n');
    if (!Buffer.from(stateSnapshot.bytes).equals(stateBytes)) {
      const stateWrite = {
        root: context.clawgodDir,
        snapshot: stateSnapshot,
        bytes: stateBytes,
        mode: stateSnapshot.mode,
        label: 'ownership state',
      };
      atomicHudWrite(stateWrite.root, stateWrite.snapshot, stateWrite.bytes, stateWrite.mode, stateWrite.label);
      completedWrites.push({ ...stateWrite, postWrite: hudFileSnapshot(stateWrite.root, stateWrite.snapshot.path, stateWrite.label) });
    }
    return { restored, conflicts, failures: [] };
  } catch (error) {
    const rollbackErrors = [];
    for (const write of completedWrites.reverse()) {
      try { rollbackHudWrite(write); }
      catch (rollbackError) { rollbackErrors.push(rollbackError); break; }
    }
    const message = rollbackErrors.length > 0
      ? `claude-mem: rollback incomplete: ${rollbackErrors[0].message}`
      : (error instanceof Error ? error.message : 'claude-mem: restore failed');
    return { restored: [], conflicts: [], failures: [message] };
  }
}

export async function restoreManagedIntegrations(context) {
  const hud = await restoreHud(context);
  if (hud.failures.length > 0) return { restored: [], conflicts: hud.failures.map(message => `hud: ${message}`) };
  const memory = await restoreClaudeMemIntegrations(context);
  return {
    restored: [...hud.restored, ...memory.restored],
    conflicts: [...hud.conflicts, ...memory.conflicts, ...memory.failures],
  };
}

export function sha256(bytes) {
  return new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
}

export function validateArchive(bytes, spec) {
  if (!(bytes instanceof Uint8Array)) throw new Error(`${spec.key}: archive bytes are invalid`);
  if (bytes.byteLength !== spec.bytes) throw new Error(`${spec.key}: archive size mismatch`);
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error(`${spec.key}: archive exceeds safety limit`);
  if (sha256(bytes) !== spec.sha256) throw new Error(`${spec.key}: archive SHA-256 mismatch`);
}

function decodeTarText(bytes, label, spec) {
  const nul = bytes.indexOf(0);
  const value = nul === -1 ? bytes : bytes.subarray(0, nul);
  try {
    return textDecoder.decode(value);
  } catch {
    throw new Error(`${spec.key}: malformed ${label} metadata`);
  }
}

function parseTarNumber(bytes, label, spec) {
  if (bytes.some(byte => byte > 0x7f)) throw new Error(`${spec.key}: malformed tar ${label}`);
  const field = String.fromCharCode(...bytes);
  const nul = field.indexOf('\0');
  let value;
  if (nul === -1) {
    if (!/^ *[0-7]+ *$/.test(field)) throw new Error(`${spec.key}: malformed tar ${label}`);
    value = field.trim();
  } else {
    if (!/^ *[0-7]+ *\0 *$/.test(field)) throw new Error(`${spec.key}: malformed tar ${label}`);
    value = field.slice(0, nul).trim();
  }
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${spec.key}: malformed tar ${label}`);
  return parsed;
}

function verifyTarChecksum(header, spec) {
  const expected = parseTarNumber(header.subarray(148, 156), 'checksum', spec);
  let actual = 0;
  for (let index = 0; index < header.length; index++) {
    actual += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  if (actual !== expected) throw new Error(`${spec.key}: tar header checksum mismatch`);
}

function parsePax(bytes, spec) {
  const values = {};
  let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(0x20, offset);
    if (space <= offset) throw new Error(`${spec.key}: malformed PAX metadata`);
    let lengthText;
    try {
      lengthText = textDecoder.decode(bytes.subarray(offset, space));
    } catch {
      throw new Error(`${spec.key}: malformed PAX metadata`);
    }
    if (!/^[1-9]\d*$/.test(lengthText)) throw new Error(`${spec.key}: malformed PAX metadata`);
    const length = Number(lengthText);
    const end = offset + length;
    if (!Number.isSafeInteger(length) || end > bytes.length || bytes[end - 1] !== 0x0a) {
      throw new Error(`${spec.key}: malformed PAX metadata`);
    }
    const bodyStart = space + 1;
    const bodyEnd = end - 1;
    const equals = bytes.indexOf(0x3d, bodyStart);
    if (equals <= bodyStart || equals >= bodyEnd) throw new Error(`${spec.key}: malformed PAX metadata`);
    let key;
    let value;
    try {
      key = textDecoder.decode(bytes.subarray(bodyStart, equals));
      value = textDecoder.decode(bytes.subarray(equals + 1, bodyEnd));
    } catch {
      throw new Error(`${spec.key}: malformed PAX metadata`);
    }
    if (Object.hasOwn(values, key)) throw new Error(`${spec.key}: malformed PAX metadata`);
    values[key] = value;
    offset = end;
  }
  return values;
}

function paxSize(value, fallback, spec) {
  if (value === undefined) return fallback;
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error(`${spec.key}: malformed PAX metadata`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${spec.key}: malformed PAX metadata`);
  return parsed;
}

function normalizeArchivePath(value, spec) {
  if (typeof value !== 'string' || value.includes('\0')) throw new Error(`${spec.key}: unsafe archive path`);
  const portable = value.replace(/\\/g, '/');
  if (!portable || portable.startsWith('/') || /^[A-Za-z]:/.test(portable)) {
    throw new Error(`${spec.key}: unsafe archive path`);
  }
  const parts = portable.split('/');
  if (parts.includes('..')) throw new Error(`${spec.key}: unsafe archive path`);
  const normalized = parts.filter(part => part && part !== '.').join('/');
  if (!normalized) throw new Error(`${spec.key}: unsafe archive path`);
  return normalized;
}

async function gunzipBounded(bytes, spec) {
  const chunks = [];
  let total = 0;
  let reader;
  try {
    reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += chunk.byteLength;
      if (total > MAX_EXPANDED_BYTES) {
        try { await reader.cancel(); } catch {}
        throw new Error(`${spec.key}: decompressed archive exceeds safety limit`);
      }
      chunks.push(chunk);
    }
  } catch (error) {
    if (error?.message === `${spec.key}: decompressed archive exceeds safety limit`) throw error;
    throw new Error(`${spec.key}: archive gzip is invalid`);
  }
  const tar = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    tar.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return tar;
}

async function parseTar(bytes, spec) {
  const tar = await gunzipBounded(bytes, spec);
  const entries = [];
  const seenPaths = new Set();
  const roots = new Set();
  let entryCount = 0;
  let expandedBytes = 0;
  let offset = 0;
  let globalPax = {};
  let localPax = null;
  let longName = null;
  let terminated = false;

  while (offset + TAR_BLOCK_BYTES <= tar.byteLength) {
    const header = tar.subarray(offset, offset + TAR_BLOCK_BYTES);
    if (header.every(byte => byte === 0)) {
      const terminatorEnd = offset + 2 * TAR_BLOCK_BYTES;
      if (terminatorEnd > tar.byteLength
        || !tar.subarray(offset + TAR_BLOCK_BYTES, terminatorEnd).every(byte => byte === 0)
        || tar.byteLength % TAR_BLOCK_BYTES !== 0
        || tar.subarray(terminatorEnd).some(byte => byte !== 0)) {
        throw new Error(`${spec.key}: malformed tar terminator or padding`);
      }
      terminated = true;
      break;
    }
    verifyTarChecksum(header, spec);
    offset += TAR_BLOCK_BYTES;
    entryCount += 1;
    if (entryCount > MAX_ENTRIES) throw new Error(`${spec.key}: archive has too many entries`);

    const typeByte = header[156];
    const type = typeByte === 0 ? '0' : String.fromCharCode(typeByte);
    if (!['0', '5', 'x', 'g', 'L'].includes(type)) {
      throw new Error(`${spec.key}: unsupported tar link or device entry`);
    }
    const metadata = type === 'x' || type === 'g' || type === 'L';
    if (metadata && (localPax !== null || longName !== null)) {
      throw new Error(`${spec.key}: malformed archive metadata`);
    }
    const headerSize = parseTarNumber(header.subarray(124, 136), 'size', spec);
    const mode = parseTarNumber(header.subarray(100, 108), 'mode', spec);
    const effectivePax = { ...globalPax, ...(localPax || {}) };
    const size = metadata ? headerSize : paxSize(effectivePax.size, headerSize, spec);
    if (size > MAX_ENTRY_BYTES) throw new Error(`${spec.key}: archive entry exceeds safety limit`);
    expandedBytes += size;
    if (!Number.isSafeInteger(expandedBytes) || expandedBytes > MAX_EXPANDED_BYTES) {
      throw new Error(`${spec.key}: archive expanded data exceeds safety limit`);
    }
    const dataEnd = offset + size;
    const paddedEnd = offset + Math.ceil(size / TAR_BLOCK_BYTES) * TAR_BLOCK_BYTES;
    if (dataEnd > tar.byteLength || paddedEnd > tar.byteLength) throw new Error(`${spec.key}: truncated tar entry`);
    const data = tar.subarray(offset, dataEnd);
    offset = paddedEnd;

    if (type === 'x' || type === 'g') {
      const pax = parsePax(data, spec);
      if (type === 'g') globalPax = { ...globalPax, ...pax };
      else localPax = pax;
      continue;
    }
    if (type === 'L') {
      if (data.length === 0 || data[data.length - 1] !== 0 || data.subarray(0, -1).includes(0)) {
        throw new Error(`${spec.key}: malformed GNU long-name metadata`);
      }
      longName = decodeTarText(data.subarray(0, -1), 'GNU long-name', spec);
      continue;
    }

    const rawName = decodeTarText(header.subarray(0, 100), 'tar path', spec);
    const prefix = decodeTarText(header.subarray(345, 500), 'tar prefix', spec);
    const headerName = prefix ? `${prefix}/${rawName}` : rawName;
    const paxPath = effectivePax.path;
    if (longName !== null && paxPath !== undefined) throw new Error(`${spec.key}: malformed archive path metadata`);
    const path = normalizeArchivePath(longName ?? paxPath ?? headerName, spec);
    longName = null;
    localPax = null;
    if (seenPaths.has(path)) throw new Error(`${spec.key}: duplicate archive path`);
    seenPaths.add(path);
    roots.add(path.split('/')[0]);
    entries.push({ path, type, data, executable: (mode & 0o111) !== 0 });
  }

  if (!terminated) throw new Error(`${spec.key}: malformed tar terminator`);
  if (localPax !== null || longName !== null) throw new Error(`${spec.key}: malformed archive metadata`);
  if (roots.size !== 1) throw new Error(`${spec.key}: archive must contain a single top-level repository directory`);
  return { entries, root: roots.values().next().value };
}

function ensureDirectory(root, relativePath, spec) {
  let current = root;
  for (const part of relativePath.split('/').filter(Boolean)) {
    current = join(current, part);
    if (existsSync(current)) {
      const status = lstatSync(current);
      if (status.isSymbolicLink() || !status.isDirectory()) {
        throw new Error(`${spec.key}: unsafe extraction parent`);
      }
    } else {
      mkdirSync(current);
    }
  }
  return current;
}

function safeDirectoryStatus(path, spec) {
  let status;
  try {
    status = lstatSync(path);
  } catch {
    throw new Error(`${spec.key}: unsafe managed directory`);
  }
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(`${spec.key}: unsafe managed directory`);
  }
  return status;
}

function ensureDestinationDirectory(destination, spec) {
  const ancestors = [];
  let current = destination;
  while (true) {
    ancestors.unshift(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  for (const path of ancestors) {
    let status;
    try {
      status = lstatSync(path);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw new Error(`${spec.key}: unsafe extraction destination`);
      try {
        mkdirSync(path, 0o700);
        status = lstatSync(path);
      } catch {
        throw new Error(`${spec.key}: unsafe extraction destination`);
      }
    }
    if (status.isSymbolicLink() || !status.isDirectory()) {
      throw new Error(`${spec.key}: unsafe extraction destination`);
    }
  }
  return destination;
}

function ensureTrustedDirectory(root, parts, spec) {
  safeDirectoryStatus(root, spec);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    if (existsSync(current)) safeDirectoryStatus(current, spec);
    else {
      mkdirSync(current, 0o700);
      safeDirectoryStatus(current, spec);
    }
  }
  return current;
}

function managedDirectoryFailure(spec, message, cause, evidencePaths = []) {
  const failure = new Error(`${spec.key}: ${message}`);
  failure.restorationIncomplete = true;
  failure.cause = cause;
  failure.evidencePaths = evidencePaths;
  failure.evidencePath = evidencePaths.at(-1);
  return failure;
}

function createTrackedDirectory(target, spec, context, label) {
  const parent = dirname(target);
  const parentTrust = captureDirectoryTrust(parent, spec);
  const parentIdentity = directoryIdentity(parent, spec);
  try {
    assertDirectoryTrust(parentTrust, spec, label);
    assertDirectoryIdentity(parent, parentIdentity, spec, label);
    context.onManagedDirectoryPublishing?.({ path: target, label });
    mkdirSync(target, 0o700);
    const identity = directoryIdentity(target, spec);
    const trust = captureDirectoryTrust(target, spec);
    assertDirectoryTrust(parentTrust, spec, label);
    assertDirectoryIdentity(parent, parentIdentity, spec, label);
    assertDirectoryTrust(trust, spec, label);
    assertDirectoryIdentity(target, identity, spec, label);
    context.onManagedDirectoryInstalled?.({ path: target, identity, label });
    assertDirectoryTrust(parentTrust, spec, label);
    assertDirectoryIdentity(parent, parentIdentity, spec, label);
    assertDirectoryTrust(trust, spec, label);
    assertDirectoryIdentity(target, identity, spec, label);
    return { path: target, identity, parentTrust, trust };
  } catch (error) {
    if (error?.restorationIncomplete) throw error;
    const evidencePaths = [];
    let evidenceCause = null;
    try { lstatSync(target); evidencePaths.push(target); } catch (evidenceError) {
      if (evidenceError?.code !== 'ENOENT') evidenceCause = evidenceError;
    }
    const failure = managedDirectoryFailure(spec, `${label} creation restoration incomplete`, error, evidencePaths);
    if (evidenceCause) failure.evidenceCause = evidenceCause;
    throw failure;
  }
}

function trackedDirectoryGuard(path, createdParents, spec, label) {
  const created = createdParents.find(entry => entry.path === path);
  const identity = created?.identity || directoryIdentity(path, spec);
  const trust = created?.trust || captureDirectoryTrust(path, spec);
  try {
    assertDirectoryTrust(trust, spec, label);
    assertDirectoryIdentity(path, identity, spec, label);
  } catch (error) {
    if (created) {
      throw managedDirectoryFailure(spec, `${label} creation identity changed`, error, [path].filter(candidate => existsSync(candidate)));
    }
    throw error;
  }
  return { identity, trust };
}

function ensureTrackedDirectory(root, parts, spec, context, label) {
  safeDirectoryStatus(root, spec);
  let current = root;
  const createdParents = [];
  try {
    for (const part of parts) {
      const target = join(current, part);
      if (existsSync(target)) safeDirectoryStatus(target, spec);
      else createdParents.push(createTrackedDirectory(target, spec, context, label));
      current = target;
    }
    for (const created of createdParents) trackedDirectoryGuard(created.path, [created], spec, label);
    return { path: current, createdParents };
  } catch (error) {
    try {
      cleanupCreatedParents(createdParents, spec);
    } catch (cleanupError) {
      if (!error?.restorationIncomplete) {
        throw managedDirectoryFailure(spec, `${label} creation restoration incomplete`, cleanupError, createdParents.map(entry => entry.path));
      }
      error.cleanupCause = cleanupError;
    }
    throw error;
  }
}

function validateFilenameComponent(value, label) {
  if (typeof value !== 'string' || value.length > 128
    || value === '.' || value === '..'
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw new Error(`plugin: invalid ${label} filename component`);
  }
}

function validateSpecFilenameComponents(spec) {
  validateFilenameComponent(spec?.key, 'key');
  validateFilenameComponent(spec?.version, 'version');
}

function directoryIdentity(path, spec) {
  const status = safeDirectoryStatus(path, spec);
  return { dev: status.dev, ino: status.ino };
}

function assertTrustedDirectoryIdentity(root, parts, expected, spec) {
  const path = ensureTrustedDirectory(root, parts, spec);
  const actual = directoryIdentity(path, spec);
  if (actual.dev !== expected.dev || actual.ino !== expected.ino) {
    throw new Error(`${spec.key}: cache directory changed`);
  }
  return path;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeMs === right.mtimeMs;
}

function readSingleLinkFile(path) {
  let pathBefore;
  try {
    pathBefore = lstatSync(path);
  } catch {
    return null;
  }
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink() || pathBefore.nlink !== 1) return null;
  let descriptor;
  try {
    descriptor = openSync(path, 'r');
    const descriptorBefore = fstatSync(descriptor);
    if (!descriptorBefore.isFile() || descriptorBefore.nlink !== 1 || !sameFileIdentity(pathBefore, descriptorBefore)) return null;
    const bytes = new Uint8Array(readFileSync(descriptor));
    const descriptorAfter = fstatSync(descriptor);
    const pathAfter = lstatSync(path);
    if (descriptorAfter.nlink !== 1 || pathAfter.nlink !== 1
      || !sameFileIdentity(descriptorBefore, descriptorAfter)
      || !sameFileIdentity(descriptorAfter, pathAfter)) return null;
    return { bytes, identity: pathAfter };
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writeExclusive(path, bytes, executable, spec) {
  let descriptor;
  try {
    descriptor = openSync(path, 'wx', executable ? 0o700 : 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset);
  } catch {
    throw new Error(`${spec.key}: archive file could not be created safely`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readJson(path, spec) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`${spec.key}: plugin metadata is invalid`);
  }
}

function containedRelativeSource(sourceRoot, source, spec) {
  if (typeof source !== 'string' || source.includes('\0')) throw new Error(`${spec.key}: plugin source is invalid`);
  const portable = source.replace(/\\/g, '/');
  if (portable.startsWith('/') || /^[A-Za-z]:/.test(portable)) throw new Error(`${spec.key}: plugin source is invalid`);
  const parts = portable.split('/');
  if (parts.includes('..')) throw new Error(`${spec.key}: plugin source is invalid`);
  const normalized = parts.filter(part => part && part !== '.').join('/');
  if (spec.key === 'memory' && normalized !== 'plugin') throw new Error(`${spec.key}: declared plugin source must be plugin/`);
  if (spec.key === 'superpowers' && source !== './') throw new Error(`${spec.key}: declared plugin source must be ./`);
  const pluginRoot = normalized ? join(sourceRoot, ...normalized.split('/')) : sourceRoot;
  let status;
  try {
    status = lstatSync(pluginRoot);
  } catch {
    throw new Error(`${spec.key}: plugin source is missing`);
  }
  if (status.isSymbolicLink() || !status.isDirectory()) throw new Error(`${spec.key}: plugin source is invalid`);
  return pluginRoot;
}

export async function extractPluginArchive(bytes, spec, destination) {
  validateSpecFilenameComponents(spec);
  validateArchive(bytes, spec);
  const archive = await parseTar(bytes, spec);
  ensureDestinationDirectory(destination, spec);
  const destinationStatus = lstatSync(destination);
  if (destinationStatus.isSymbolicLink() || !destinationStatus.isDirectory()) {
    throw new Error(`${spec.key}: unsafe extraction destination`);
  }
  const stagingRoot = mkdtempSync(join(destination, `.${spec.key}-${spec.version}-`));
  try {
    for (const entry of archive.entries) {
      const parent = ensureDirectory(stagingRoot, dirname(entry.path).replace(/\\/g, '/'), spec);
      const target = join(parent, entry.path.split('/').at(-1));
      if (entry.type === '5') ensureDirectory(stagingRoot, entry.path, spec);
      else writeExclusive(target, entry.data, entry.executable, spec);
    }
    const sourceRoot = join(stagingRoot, archive.root);
    const manifest = readJson(join(sourceRoot, '.claude-plugin', 'marketplace.json'), spec);
    const expectedArchiveMarketplace = spec.archiveMarketplace || spec.marketplace;
    if (manifest.name !== expectedArchiveMarketplace) throw new Error(`${spec.key}: marketplace name mismatch`);
    const entry = manifest.plugins?.find(plugin => plugin.name === spec.plugin);
    if (!entry) throw new Error(`${spec.key}: plugin entry is missing`);
    const pluginRoot = containedRelativeSource(sourceRoot, entry.source, spec);
    const pluginManifest = readJson(join(pluginRoot, '.claude-plugin', 'plugin.json'), spec);
    if (pluginManifest.name !== spec.plugin || pluginManifest.version !== spec.version) {
      throw new Error(`${spec.key}: plugin manifest mismatch`);
    }
    return sourceRoot;
  } catch (error) {
    rmSync(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function downloadAndStage(spec, context) {
  validateSpecFilenameComponents(spec);
  const cacheDirectory = ensureTrustedDirectory(context.clawgodDir, ['cache', 'claude-plugins'], spec);
  const cacheDirectoryIdentity = directoryIdentity(cacheDirectory, spec);
  const archivePath = join(cacheDirectory, `${spec.key}-${spec.version}.tar.gz`);
  const stagingDirectory = ensureTrustedDirectory(context.clawgodDir, ['staging', 'claude-plugins'], spec);
  let archiveBytes = null;
  let cacheIdentity = null;
  assertTrustedDirectoryIdentity(context.clawgodDir, ['cache', 'claude-plugins'], cacheDirectoryIdentity, spec);
  const cachedFile = readSingleLinkFile(archivePath);
  assertTrustedDirectoryIdentity(context.clawgodDir, ['cache', 'claude-plugins'], cacheDirectoryIdentity, spec);
  if (cachedFile) {
    try {
      archiveBytes = cachedFile.bytes;
      validateArchive(archiveBytes, spec);
      cacheIdentity = cachedFile.identity;
    } catch {
      archiveBytes = null;
      cacheIdentity = null;
    }
  }
  let cached = archiveBytes !== null;
  if (!cached) {
    const temporaryDirectory = mkdtempSync(join(cacheDirectory, `.${spec.key}-${spec.version}-`));
    const temporaryArchive = join(temporaryDirectory, 'download.tar.gz');
    try {
      let result;
      try {
        result = Bun.spawnSync({
          cmd: [context.bunPath, context.fetchFilePath, spec.url, temporaryArchive],
          env: context.env,
          stdout: 'pipe',
          stderr: 'pipe',
        });
      } catch {
        throw new Error(`${spec.key}: download failed`);
      }
      if (result.exitCode !== 0) throw new Error(`${spec.key}: download failed`);
      assertTrustedDirectoryIdentity(context.clawgodDir, ['cache', 'claude-plugins'], cacheDirectoryIdentity, spec);
      const temporaryFile = readSingleLinkFile(temporaryArchive);
      if (!temporaryFile) throw new Error(`${spec.key}: download failed`);
      archiveBytes = temporaryFile.bytes;
      validateArchive(archiveBytes, spec);
      assertTrustedDirectoryIdentity(context.clawgodDir, ['cache', 'claude-plugins'], cacheDirectoryIdentity, spec);
      renameSync(temporaryArchive, archivePath);
      assertTrustedDirectoryIdentity(context.clawgodDir, ['cache', 'claude-plugins'], cacheDirectoryIdentity, spec);
      const installedFile = readSingleLinkFile(archivePath);
      if (!installedFile) throw new Error(`${spec.key}: cache replacement is unsafe`);
      validateArchive(installedFile.bytes, spec);
      archiveBytes = installedFile.bytes;
      cacheIdentity = installedFile.identity;
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
  const sourceRoot = await extractPluginArchive(archiveBytes, spec, stagingDirectory);
  assertTrustedDirectoryIdentity(context.clawgodDir, ['cache', 'claude-plugins'], cacheDirectoryIdentity, spec);
  const finalCacheFile = readSingleLinkFile(archivePath);
  assertTrustedDirectoryIdentity(context.clawgodDir, ['cache', 'claude-plugins'], cacheDirectoryIdentity, spec);
  if (!finalCacheFile || !sameFileIdentity(cacheIdentity, finalCacheFile.identity)) {
    throw new Error(`${spec.key}: cache changed during use`);
  }
  validateArchive(finalCacheFile.bytes, spec);
  return { sourceRoot, archivePath, cached };
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseSemver(value) {
  if (typeof value !== 'string') return null;
  const match = SEMVER.exec(value);
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

export function compareSemver(left, right) {
  const leftVersion = parseSemver(left);
  const rightVersion = parseSemver(right);
  if (!leftVersion || !rightVersion) return null;
  for (const key of ['major', 'minor', 'patch']) {
    if (leftVersion[key] !== rightVersion[key]) return leftVersion[key] < rightVersion[key] ? -1 : 1;
  }
  if (leftVersion.prerelease.length === 0 || rightVersion.prerelease.length === 0) {
    if (leftVersion.prerelease.length === rightVersion.prerelease.length) return 0;
    return leftVersion.prerelease.length === 0 ? 1 : -1;
  }
  const length = Math.min(leftVersion.prerelease.length, rightVersion.prerelease.length);
  for (let index = 0; index < length; index++) {
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

export function selectInstalledRecord(installed, id) {
  const records = Array.isArray(installed?.plugins?.[id]) ? installed.plugins[id] : [];
  let selected = null;
  for (const record of records) {
    if (record?.scope !== 'user' || !parseSemver(record.version)) continue;
    if (!selected || compareSemver(record.version, selected.version) > 0) selected = record;
  }
  return selected;
}

export function classifyPlugin(installed, spec) {
  const records = Array.isArray(installed?.plugins?.[spec.id]) ? installed.plugins[spec.id] : [];
  const userRecords = records.filter(record => record?.scope === 'user');
  if (userRecords.length === 0) return 'missing';
  const selected = selectInstalledRecord(installed, spec.id);
  if (!selected || !parseSemver(selected.version)) return 'invalid';
  const comparison = compareSemver(selected.version, spec.version);
  if (comparison === null) return 'invalid';
  return comparison < 0 ? 'older' : 'satisfied';
}

function snapshotFile(path, spec) {
  const parentTrust = captureDirectoryTrust(dirname(path), spec);
  let status;
  try {
    status = lstatSync(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return { present: false, parentTrust };
    throw new Error(`${spec.key}: plugin state could not be read`);
  }
  if (!status.isFile() || status.isSymbolicLink() || status.nlink !== 1) {
    throw new Error(`${spec.key}: plugin state file is unsafe`);
  }
  const file = readSingleLinkFile(path);
  if (!file) throw new Error(`${spec.key}: plugin state file changed while reading`);
  return { present: true, bytes: file.bytes, mode: status.mode & 0o777, parentTrust };
}

function parseStateSnapshot(snapshot, fallback, spec, label) {
  if (!snapshot.present) return fallback;
  try {
    const value = JSON.parse(textDecoder.decode(snapshot.bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    return value;
  } catch {
    throw new Error(`${spec.key}: ${label} is malformed`);
  }
}

function assertDirectoryIdentity(path, expected, spec, label) {
  const actual = directoryIdentity(path, spec);
  if (actual.dev !== expected.dev || actual.ino !== expected.ino) {
    throw new Error(`${spec.key}: ${label} directory changed`);
  }
}

function captureDirectoryTrust(path, spec) {
  const requested = resolve(path);
  const suffix = [];
  let existing = requested;
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) throw new Error(`${spec.key}: unsafe managed directory`);
    suffix.unshift(basename(existing));
    existing = parent;
  }
  const paths = [];
  let current = existing;
  while (true) {
    paths.unshift(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const chain = paths.map(chainPath => ({ path: chainPath, identity: directoryIdentity(chainPath, spec) }));
  return { requested, suffix, chain };
}

function directoryTrustPresent(trust, spec, label) {
  if (!trust || !Array.isArray(trust.chain) || trust.chain.length === 0) {
    throw new Error(`${spec.key}: ${label} directory trust is missing`);
  }
  for (const entry of trust.chain) assertDirectoryIdentity(entry.path, entry.identity, spec, label);
  let current = trust.chain[trust.chain.length - 1].path;
  for (const part of trust.suffix) {
    current = join(current, part);
    let status;
    try {
      status = lstatSync(current);
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
    if (status.isSymbolicLink() || !status.isDirectory()) throw new Error(`${spec.key}: unsafe managed directory`);
  }
  if (resolve(current) !== trust.requested) throw new Error(`${spec.key}: ${label} directory changed`);
  return true;
}

function assertDirectoryTrust(trust, spec, label) {
  if (!directoryTrustPresent(trust, spec, label)) {
    throw new Error(`${spec.key}: ${label} directory is absent`);
  }
}

function safeRemoveExact(target, parent, name, recursive, spec, parentTrust) {
  if (dirname(target) !== parent || basename(target) !== name) {
    throw new Error(`${spec.key}: unsafe transaction cleanup target`);
  }
  assertDirectoryTrust(parentTrust, spec, 'transaction cleanup parent');
  let status;
  try {
    status = lstatSync(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  assertDirectoryTrust(parentTrust, spec, 'transaction cleanup parent');
  if (status.isSymbolicLink()) rmSync(target, { force: true });
  else if (status.isDirectory()) {
    if (!recursive) throw new Error(`${spec.key}: unsafe transaction cleanup type`);
    rmSync(target, { recursive: true, force: true });
  } else if (status.isFile()) rmSync(target, { force: true });
  else throw new Error(`${spec.key}: unsafe transaction cleanup type`);
}

function restoreFile(path, snapshot, spec) {
  const parent = dirname(path);
  if (!snapshot.present) {
    if (!directoryTrustPresent(snapshot.parentTrust, spec, 'plugin state parent')) return;
    safeRemoveExact(path, parent, basename(path), false, spec, snapshot.parentTrust);
    return;
  }
  assertDirectoryTrust(snapshot.parentTrust, spec, 'plugin state parent');
  const staged = `${path}.${process.pid}.restore`;
  if (existsSync(staged)) throw new Error(`${spec.key}: restoration staging path already exists`);
  try {
    writeExclusive(staged, snapshot.bytes, false, spec);
    chmodSync(staged, snapshot.mode);
    const current = existsSync(path) ? lstatSync(path) : null;
    if (current?.isDirectory()) throw new Error(`${spec.key}: plugin state path became a directory`);
    renameSync(staged, path);
  } finally {
    if (existsSync(staged)) safeRemoveExact(staged, parent, basename(staged), false, spec, snapshot.parentTrust);
  }
}

function copyValidatedDirectory(source, destination, spec) {
  const sourceIdentity = directoryIdentity(source, spec);
  mkdirSync(destination, 0o700);
  const destinationStatus = lstatSync(destination);
  if (destinationStatus.isSymbolicLink() || !destinationStatus.isDirectory()) {
    throw new Error(`${spec.key}: persistent source staging is unsafe`);
  }
  for (const name of readdirSync(source).sort()) {
    if (!name || name === '.' || name === '..' || name.length > 255 || name.includes('/') || name.includes('\\') || name.includes('\0')) {
      throw new Error(`${spec.key}: invalid staged source entry`);
    }
    const sourcePath = join(source, name);
    const destinationPath = join(destination, name);
    const status = lstatSync(sourcePath);
    if (status.isSymbolicLink()) throw new Error(`${spec.key}: staged source contains a link`);
    if (status.isDirectory()) copyValidatedDirectory(sourcePath, destinationPath, spec);
    else if (status.isFile() && status.nlink === 1) {
      const file = readSingleLinkFile(sourcePath);
      if (!file) throw new Error(`${spec.key}: staged source file changed while copying`);
      writeExclusive(destinationPath, file.bytes, (status.mode & 0o111) !== 0, spec);
    } else throw new Error(`${spec.key}: staged source contains an unsafe entry`);
  }
  assertDirectoryIdentity(source, sourceIdentity, spec, 'staged source');
}

function prepareDirectoryReplacement(target, spec, label, parentGuard = null) {
  const parent = dirname(target);
  const parentTrust = parentGuard?.trust || captureDirectoryTrust(parent, spec);
  const parentIdentity = parentGuard?.identity || directoryIdentity(parent, spec);
  assertDirectoryTrust(parentTrust, spec, label);
  assertDirectoryIdentity(parent, parentIdentity, spec, label);
  const backup = `${target}.${process.pid}.backup`;
  if (existsSync(backup)) throw new Error(`${spec.key}: ${label} backup already exists`);
  const transaction = { target, parent, parentTrust, parentIdentity, backup, hadExisting: false, label };
  if (existsSync(target)) {
    const status = lstatSync(target);
    if (status.isSymbolicLink() || !status.isDirectory()) throw new Error(`${spec.key}: unsafe ${label} directory`);
    renameSync(target, backup);
    transaction.hadExisting = true;
    try {
      assertDirectoryTrust(parentTrust, spec, label);
      assertDirectoryIdentity(parent, parentIdentity, spec, label);
    } catch (error) {
      const failure = new Error(`${spec.key}: ${label} restoration incomplete`);
      failure.restorationIncomplete = true;
      failure.cause = error;
      failure.transaction = transaction;
      throw failure;
    }
  }
  return transaction;
}

function restoreDirectoryReplacement(transaction, spec) {
  assertDirectoryTrust(transaction.parentTrust, spec, transaction.label);
  assertDirectoryIdentity(transaction.parent, transaction.parentIdentity, spec, transaction.label);
  safeRemoveExact(transaction.target, transaction.parent, basename(transaction.target), true, spec, transaction.parentTrust);
  if (transaction.hadExisting) {
    const backupStatus = lstatSync(transaction.backup);
    if (backupStatus.isSymbolicLink() || !backupStatus.isDirectory()) {
      throw new Error(`${spec.key}: unsafe ${transaction.label} backup`);
    }
    renameSync(transaction.backup, transaction.target);
  }
}

function cleanupDirectoryReplacement(transaction, spec) {
  if (!transaction.hadExisting) return;
  assertDirectoryTrust(transaction.parentTrust, spec, transaction.label);
  assertDirectoryIdentity(transaction.parent, transaction.parentIdentity, spec, transaction.label);
  safeRemoveExact(transaction.backup, transaction.parent, basename(transaction.backup), true, spec, transaction.parentTrust);
}

function materializePersistentSource(sourceRoot, spec, context) {
  const trackedParents = ensureTrackedDirectory(
    context.claudeConfigDir,
    ['plugins', 'clawgod-marketplaces', spec.marketplace],
    spec,
    context,
    'persistent marketplace parent',
  );
  const sourceParent = trackedParents.path;
  const createdParents = trackedParents.createdParents;
  const sourceParentGuard = trackedDirectoryGuard(sourceParent, createdParents, spec, 'persistent marketplace parent');
  const persistentSource = join(sourceParent, spec.version);
  const staged = `${persistentSource}.${process.pid}.staged`;
  if (existsSync(staged)) throw new Error(`${spec.key}: persistent source staging path already exists`);
  const parentIdentity = sourceParentGuard.identity;
  const parentTrust = sourceParentGuard.trust;
  let completed = false;
  let transaction = null;
  let result = null;
  let failure = null;
  try {
    if (spec.key === 'superpowers') {
      mkdirSync(staged, 0o700);
      safeDirectoryStatus(staged, spec);
      const manifestDirectory = join(staged, '.claude-plugin');
      mkdirSync(manifestDirectory, 0o700);
      writeExclusive(
        join(manifestDirectory, 'marketplace.json'),
        new TextEncoder().encode(JSON.stringify({
          name: 'superpowers-marketplace',
          plugins: [{ name: 'superpowers', version: '6.2.0', source: './plugin' }],
        })),
        false,
        spec,
      );
      copyValidatedDirectory(sourceRoot, join(staged, 'plugin'), spec);
    } else copyValidatedDirectory(sourceRoot, staged, spec);
    assertDirectoryIdentity(sourceParent, parentIdentity, spec, 'persistent source');
    transaction = prepareDirectoryReplacement(persistentSource, spec, 'persistent source', sourceParentGuard);
    try {
      context.onPersistentTransactionPrepared?.(transaction);
      renameSync(staged, persistentSource);
      assertDirectoryIdentity(sourceParent, parentIdentity, spec, 'persistent source');
      safeDirectoryStatus(persistentSource, spec);
      transaction.createdParents = createdParents;
      const manifest = readJson(join(persistentSource, '.claude-plugin', 'marketplace.json'), spec);
      const entry = manifest.plugins?.find(candidate => candidate.name === spec.plugin);
      if (!entry) throw new Error(`${spec.key}: persistent plugin entry is missing`);
      const pluginSource = spec.key === 'superpowers'
        ? join(persistentSource, 'plugin')
        : containedRelativeSource(persistentSource, entry.source, spec);
      result = { persistentSource, pluginSource, transaction };
      completed = true;
    } catch (error) {
      try { restoreDirectoryReplacement(transaction, spec); } catch (restoreError) {
        const restorationFailure = new Error(`${spec.key}: persistent source restoration incomplete`);
        restorationFailure.restorationIncomplete = true;
        restorationFailure.cause = restoreError;
        restorationFailure.transaction = transaction;
        throw restorationFailure;
      }
      throw error;
    }
  } catch (error) {
    failure = error;
    if (!transaction && error?.transaction) transaction = error.transaction;
  }

  const cleanupErrors = [];
  try {
    if (existsSync(staged)) {
      assertDirectoryIdentity(sourceParent, parentIdentity, spec, 'persistent source');
      safeRemoveExact(staged, sourceParent, basename(staged), true, spec, parentTrust);
    }
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (!completed) {
    try { cleanupCreatedParents(createdParents, spec); } catch (error) { cleanupErrors.push(error); }
  }
  if (failure || cleanupErrors.length > 0) {
    const primary = failure?.restorationIncomplete ? failure : cleanupErrors.find(error => error?.restorationIncomplete) || failure || cleanupErrors[0];
    if (primary?.restorationIncomplete) {
      primary.transaction = primary.transaction || transaction;
      throw primary;
    }
    throw primary;
  }
  return result;
}

function copyDirectorySnapshot(source, destination, spec) {
  const sourceStatus = safeDirectoryStatus(source, spec);
  const sourceIdentity = { dev: sourceStatus.dev, ino: sourceStatus.ino };
  mkdirSync(destination, sourceStatus.mode & 0o777);
  chmodSync(destination, sourceStatus.mode & 0o777);
  for (const name of readdirSync(source).sort()) {
    const sourcePath = join(source, name);
    const destinationPath = join(destination, name);
    const status = lstatSync(sourcePath);
    if (status.isSymbolicLink()) throw new Error(`${spec.key}: plugin cache contains a link`);
    if (status.isDirectory()) copyDirectorySnapshot(sourcePath, destinationPath, spec);
    else if (status.isFile() && status.nlink === 1) {
      const file = readSingleLinkFile(sourcePath);
      if (!file) throw new Error(`${spec.key}: plugin cache changed while snapshotting`);
      writeExclusive(destinationPath, file.bytes, (status.mode & 0o111) !== 0, spec);
      chmodSync(destinationPath, status.mode & 0o777);
    } else throw new Error(`${spec.key}: plugin cache contains an unsafe entry`);
  }
  assertDirectoryIdentity(source, sourceIdentity, spec, 'plugin cache');
}

function recordCacheEntries(directory, entries, spec, prefix = '') {
  for (const name of readdirSync(directory)) {
    const relativePath = prefix ? `${prefix}/${name}` : name;
    const path = join(directory, name);
    const status = lstatSync(path);
    if (status.isSymbolicLink()) throw new Error(`${spec.key}: plugin cache contains a link`);
    if (status.isDirectory()) {
      entries.set(relativePath, `directory:${status.mode & 0o777}`);
      recordCacheEntries(path, entries, spec, relativePath);
    } else if (status.isFile() && status.nlink === 1) {
      const file = readSingleLinkFile(path);
      if (!file) throw new Error(`${spec.key}: plugin cache changed while inventorying`);
      entries.set(relativePath, `file:${status.mode & 0o777}:${sha256(file.bytes)}`);
    } else throw new Error(`${spec.key}: plugin cache contains an unsafe entry`);
  }
}

function cacheEntrySignature(path, status, spec) {
  if (status.isSymbolicLink()) return 'unsafe';
  if (status.isDirectory()) return `directory:${status.mode & 0o777}`;
  if (!status.isFile() || status.nlink !== 1) return 'unsafe';
  const file = readSingleLinkFile(path);
  if (!file) throw new Error(`${spec.key}: plugin cache changed while inventorying`);
  return `file:${status.mode & 0o777}:${sha256(file.bytes)}`;
}

function cacheTreeMatches(directory, expected, expectedRootSignature, spec) {
  if (!existsSync(directory)) return false;
  const rootStatus = lstatSync(directory);
  if (cacheEntrySignature(directory, rootStatus, spec) !== expectedRootSignature) return false;
  const actual = new Map();
  recordCacheEntries(directory, actual, spec);
  if (actual.size !== expected.size) return false;
  for (const [path, signature] of expected) if (actual.get(path) !== signature) return false;
  return true;
}

function captureCacheCleanupNode(path, spec) {
  const before = lstatSync(path);
  const signature = cacheEntrySignature(path, before, spec);
  if (signature === 'unsafe') throw new Error(`${spec.key}: plugin cache cleanup contains an unsafe entry`);
  const node = {
    type: before.isDirectory() ? 'directory' : 'file',
    identity: { dev: before.dev, ino: before.ino },
    signature,
    children: [],
  };
  const names = node.type === 'directory' ? readdirSync(path).sort() : [];
  for (const name of names) {
    node.children.push({ name, node: captureCacheCleanupNode(join(path, name), spec) });
  }
  const after = lstatSync(path);
  const afterSignature = cacheEntrySignature(path, after, spec);
  const afterNames = node.type === 'directory' ? readdirSync(path).sort() : [];
  if (after.dev !== node.identity.dev || after.ino !== node.identity.ino
    || afterSignature !== signature || afterNames.length !== names.length
    || afterNames.some((name, index) => name !== names[index])) {
    throw new Error(`${spec.key}: plugin cache changed while capturing cleanup inventory`);
  }
  return node;
}

function cacheCleanupNodeMatches(path, node, spec) {
  if (!existsSync(path)) return false;
  const status = lstatSync(path);
  return status.dev === node.identity.dev && status.ino === node.identity.ino
    && cacheEntrySignature(path, status, spec) === node.signature;
}

function removeCapturedCacheNode(path, node, spec) {
  if (!cacheCleanupNodeMatches(path, node, spec)) {
    throw managedDirectoryFailure(spec, 'plugin cache restoration incomplete; cleanup entry changed', null, [path]);
  }
  if (node.type === 'directory') {
    for (const child of node.children) removeCapturedCacheNode(join(path, child.name), child.node, spec);
    if (!cacheCleanupNodeMatches(path, node, spec)) {
      throw managedDirectoryFailure(spec, 'plugin cache restoration incomplete; cleanup directory changed', null, [path]);
    }
  }

  const parent = dirname(path);
  const parentTrust = captureDirectoryTrust(parent, spec);
  const parentIdentity = directoryIdentity(parent, spec);
  const quarantine = mkdtempSync(join(parent, `.clawgod-remove-${process.pid}-`));
  chmodSync(quarantine, 0o700);
  const quarantineIdentity = directoryIdentity(quarantine, spec);
  const moved = join(quarantine, 'entry');
  try {
    assertDirectoryTrust(parentTrust, spec, 'plugin cache cleanup parent');
    assertDirectoryIdentity(parent, parentIdentity, spec, 'plugin cache cleanup parent');
    renameSync(path, moved);
    assertDirectoryIdentity(parent, parentIdentity, spec, 'plugin cache cleanup parent');
    assertDirectoryIdentity(quarantine, quarantineIdentity, spec, 'plugin cache cleanup quarantine');
    if (existsSync(path) || !cacheCleanupNodeMatches(moved, node, spec)) {
      throw managedDirectoryFailure(
        spec,
        'plugin cache restoration incomplete; cleanup entry was replaced',
        null,
        [quarantine, moved, path].filter(candidate => existsSync(candidate)),
      );
    }
    if (node.type === 'directory') rmdirSync(moved);
    else unlinkSync(moved);
    assertDirectoryIdentity(quarantine, quarantineIdentity, spec, 'plugin cache cleanup quarantine');
    rmdirSync(quarantine);
  } catch (error) {
    if (error?.restorationIncomplete) throw error;
    throw managedDirectoryFailure(
      spec,
      'plugin cache restoration incomplete; cleanup race preserved',
      error,
      [quarantine, moved, path].filter(candidate => existsSync(candidate)),
    );
  }
}

function unexpectedCachePaths(directory, transaction, spec, prefix = '', unexpected = []) {
  for (const name of readdirSync(directory)) {
    const relativePath = prefix ? `${prefix}/${name}` : name;
    const path = join(directory, name);
    const status = lstatSync(path);
    const baselinePrefix = `${transaction.version}/`;
    const expectedPath = relativePath === transaction.version ? ''
      : relativePath.startsWith(baselinePrefix) ? relativePath.slice(baselinePrefix.length) : null;
    const expectedSignature = expectedPath === '' ? transaction.expectedVersionRootSignature
      : expectedPath === null ? null : transaction.expectedVersionEntries.get(expectedPath);
    if (!transaction.preExistingEntries.has(relativePath)
      && (expectedSignature === null || expectedSignature === undefined || cacheEntrySignature(path, status, spec) !== expectedSignature)) {
      unexpected.push(relativePath);
      continue;
    }
    if (status.isDirectory() && !status.isSymbolicLink()) {
      unexpectedCachePaths(path, transaction, spec, relativePath, unexpected);
    }
  }
  return unexpected;
}

function prepareCacheTransaction(pluginRoot, spec, installed, pluginSource, context) {
  const cacheRoot = join(pluginRoot, 'cache');
  const marketplaceCache = join(cacheRoot, spec.marketplace);
  const pluginCache = join(marketplaceCache, spec.plugin);
  const backup = `${pluginCache}.${process.pid}.backup`;
  const backupPreExisting = existsSync(backup);
  let marketplaceCacheTrust = null;
  let createdParents = [];
  try {
    const trackedCache = ensureTrackedDirectory(
      pluginRoot,
      ['cache', spec.marketplace, spec.plugin],
      spec,
      context,
      'plugin cache parent',
    );
    createdParents = trackedCache.createdParents;
    const hadExisting = !createdParents.some(entry => entry.path === pluginCache);
    const pluginCacheGuard = trackedDirectoryGuard(pluginCache, createdParents, spec, 'plugin cache');
    const marketplaceCacheGuard = trackedDirectoryGuard(marketplaceCache, createdParents, spec, 'plugin cache parent');
    const pluginCacheIdentity = pluginCacheGuard.identity;
    const pluginCacheTrust = pluginCacheGuard.trust;
    marketplaceCacheTrust = marketplaceCacheGuard.trust;
    const preExistingEntries = new Map();
    recordCacheEntries(pluginCache, preExistingEntries, spec);
    const preExistingRootSignature = cacheEntrySignature(pluginCache, lstatSync(pluginCache), spec);
    const expectedVersionEntries = new Map();
    recordCacheEntries(pluginSource, expectedVersionEntries, spec);
    const expectedVersionRootSignature = cacheEntrySignature(pluginSource, lstatSync(pluginSource), spec);
    if (backupPreExisting) throw new Error(`${spec.key}: plugin cache backup already exists`);
    if (hadExisting) copyDirectorySnapshot(pluginCache, backup, spec);
    assertDirectoryTrust(pluginCacheTrust, spec, 'plugin cache');
    assertDirectoryIdentity(pluginCache, pluginCacheIdentity, spec, 'plugin cache');
    assertDirectoryTrust(marketplaceCacheTrust, spec, 'plugin cache parent');
    return {
      pluginCache, pluginCacheIdentity, pluginCacheTrust, marketplaceCache, marketplaceCacheTrust,
      backup, hadExisting, createdParents, preExistingEntries, preExistingRootSignature,
      expectedVersionEntries, expectedVersionRootSignature,
      version: spec.version,
    };
  } catch (error) {
    const restorationErrors = [];
    try {
      if (!backupPreExisting && marketplaceCacheTrust && existsSync(backup)) {
        safeRemoveExact(backup, marketplaceCache, basename(backup), true, spec, marketplaceCacheTrust);
      }
    } catch (restoreError) { restorationErrors.push(restoreError); }
    try { cleanupCreatedParents(createdParents, spec); } catch (restoreError) { restorationErrors.push(restoreError); }
    if (restorationErrors.length > 0) {
      const failure = new Error(`${spec.key}: plugin cache preparation restoration incomplete`);
      failure.restorationIncomplete = true;
      failure.cause = restorationErrors[0];
      throw failure;
    }
    throw error;
  }
}

function restoreCacheTransaction(transaction, spec, context) {
  assertDirectoryTrust(transaction.pluginCacheTrust, spec, 'plugin cache');
  assertDirectoryIdentity(transaction.pluginCache, transaction.pluginCacheIdentity, spec, 'plugin cache');
  const failedPath = `${transaction.pluginCache}.${process.pid}.failed`;
  const cleanupPath = `${transaction.pluginCache}.${process.pid}.cleanup`;
  const concurrentPath = `${transaction.pluginCache}.${process.pid}.concurrent`;
  if (existsSync(failedPath) || existsSync(cleanupPath) || existsSync(concurrentPath)) {
    const failure = new Error(`${spec.key}: plugin cache restoration incomplete; evidence path exists`);
    failure.restorationIncomplete = true;
    failure.evidencePath = transaction.pluginCache;
    throw failure;
  }
  assertDirectoryTrust(transaction.marketplaceCacheTrust, spec, 'plugin cache parent');
  renameSync(transaction.pluginCache, failedPath);
  if (transaction.hadExisting) copyDirectorySnapshot(transaction.backup, transaction.pluginCache, spec);
  context.onCacheQuarantined?.({ pluginCache: transaction.pluginCache, failedPath });

  const canonicalChanged = transaction.hadExisting
    ? !cacheTreeMatches(transaction.pluginCache, transaction.preExistingEntries, transaction.preExistingRootSignature, spec)
    : existsSync(transaction.pluginCache);
  if (canonicalChanged) {
    const evidencePaths = [failedPath];
    if (existsSync(transaction.pluginCache)) {
      renameSync(transaction.pluginCache, concurrentPath);
      evidencePaths.push(concurrentPath);
    }
    if (transaction.hadExisting) renameSync(transaction.backup, transaction.pluginCache);
    const failure = new Error(`${spec.key}: plugin cache restoration incomplete; concurrent data preserved`);
    failure.restorationIncomplete = true;
    failure.evidencePath = evidencePaths.at(-1);
    failure.evidencePaths = evidencePaths;
    throw failure;
  }

  const unexpected = unexpectedCachePaths(failedPath, transaction, spec);
  context.onCacheFailedInspected?.({ pluginCache: transaction.pluginCache, failedPath, unexpectedPaths: unexpected });

  assertDirectoryTrust(transaction.marketplaceCacheTrust, spec, 'plugin cache parent');
  renameSync(failedPath, cleanupPath);
  const lateUnexpected = unexpectedCachePaths(cleanupPath, transaction, spec);
  const canonicalChangedAfterInspection = transaction.hadExisting
    ? !cacheTreeMatches(transaction.pluginCache, transaction.preExistingEntries, transaction.preExistingRootSignature, spec)
    : existsSync(transaction.pluginCache);
  if (canonicalChangedAfterInspection) {
    const evidencePaths = [cleanupPath];
    if (existsSync(transaction.pluginCache)) {
      renameSync(transaction.pluginCache, concurrentPath);
      evidencePaths.push(concurrentPath);
    }
    if (transaction.hadExisting) renameSync(transaction.backup, transaction.pluginCache);
    const failure = new Error(`${spec.key}: plugin cache restoration incomplete; late concurrent data preserved`);
    failure.restorationIncomplete = true;
    failure.evidencePath = evidencePaths.at(-1);
    failure.evidencePaths = evidencePaths;
    throw failure;
  }
  if (unexpected.length > 0 || lateUnexpected.length > 0 || existsSync(failedPath)) {
    const evidencePaths = [cleanupPath, transaction.pluginCache];
    if (existsSync(failedPath)) evidencePaths.push(failedPath);
    if (transaction.hadExisting) evidencePaths.push(transaction.backup);
    const failure = new Error(`${spec.key}: plugin cache restoration incomplete; unknown paths preserved`);
    failure.restorationIncomplete = true;
    failure.evidencePath = cleanupPath;
    failure.evidencePaths = evidencePaths;
    failure.unexpectedPaths = [...new Set([...unexpected, ...lateUnexpected])];
    throw failure;
  }

  let cleanupInventory;
  try {
    cleanupInventory = captureCacheCleanupNode(cleanupPath, spec);
    context.onCacheCleanupInventoried?.({ cleanupPath });
    removeCapturedCacheNode(cleanupPath, cleanupInventory, spec);
  } catch (error) {
    if (error?.restorationIncomplete) throw error;
    throw managedDirectoryFailure(
      spec,
      'plugin cache restoration incomplete; cleanup inventory changed',
      error,
      [cleanupPath].filter(path => existsSync(path)),
    );
  }
  const canonicalChangedAfterCleanup = transaction.hadExisting
    ? !cacheTreeMatches(transaction.pluginCache, transaction.preExistingEntries, transaction.preExistingRootSignature, spec)
    : existsSync(transaction.pluginCache);
  if (canonicalChangedAfterCleanup || existsSync(failedPath) || existsSync(cleanupPath)) {
    const evidencePaths = [failedPath, cleanupPath].filter(path => existsSync(path));
    if (canonicalChangedAfterCleanup && existsSync(transaction.pluginCache)) {
      renameSync(transaction.pluginCache, concurrentPath);
      evidencePaths.push(concurrentPath);
    }
    if (transaction.hadExisting) renameSync(transaction.backup, transaction.pluginCache);
    const failure = new Error(`${spec.key}: plugin cache restoration incomplete; cleanup race preserved`);
    failure.restorationIncomplete = true;
    failure.evidencePath = evidencePaths.at(-1) || transaction.pluginCache;
    failure.evidencePaths = evidencePaths;
    throw failure;
  }
  if (transaction.hadExisting) cleanupCacheTransaction(transaction, spec);
}

function cleanupCacheTransaction(transaction, spec) {
  if (!transaction.hadExisting) return;
  safeRemoveExact(
    transaction.backup,
    transaction.marketplaceCache,
    basename(transaction.backup),
    true,
    spec,
    transaction.marketplaceCacheTrust,
  );
}

function cleanupCreatedParents(createdParents, spec) {
  for (let index = createdParents.length - 1; index >= 0; index--) {
    const { path, identity, parentTrust } = createdParents[index];
    try {
      const status = lstatSync(path);
      if (status.isSymbolicLink() || !status.isDirectory()) throw new Error(`${spec.key}: unsafe created parent`);
      assertDirectoryTrust(parentTrust, spec, 'created parent');
      assertDirectoryIdentity(path, identity, spec, 'created parent');
      rmdirSync(path);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      const failure = new Error(`${spec.key}: created parent restoration incomplete`);
      failure.restorationIncomplete = true;
      failure.cause = error;
      throw failure;
    }
  }
}

function cleanupCreatedCacheParents(cacheTransaction, spec) {
  cleanupCreatedParents(cacheTransaction.createdParents, spec);
}

function runPluginCli(args, spec, context) {
  let result;
  try {
    result = context.spawnSyncImpl({
      cmd: [context.bunPath, context.claudeCliPath, ...args],
      env: { ...context.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch {
    throw new Error(`${spec.key}: plugin command failed`);
  }
  if (result.exitCode !== 0) throw new Error(`${spec.key}: plugin command failed`);
}

function verifyPluginInstallation(spec, context, pluginRoot, cacheTransaction) {
  assertDirectoryTrust(cacheTransaction.pluginCacheTrust, spec, 'plugin cache');
  assertDirectoryIdentity(cacheTransaction.pluginCache, cacheTransaction.pluginCacheIdentity, spec, 'plugin cache');
  const installed = parseStateSnapshot(snapshotFile(join(pluginRoot, 'installed_plugins.json'), spec), {}, spec, 'installed plugin state');
  const records = Array.isArray(installed?.plugins?.[spec.id]) ? installed.plugins[spec.id] : [];
  const record = records.find(candidate => candidate?.scope === 'user' && candidate.version === spec.version);
  if (!record || typeof record.installPath !== 'string') throw new Error(`${spec.key}: installed version was not verified`);
  const cacheRoot = realpathSync(join(pluginRoot, 'cache'));
  const installPath = realpathSync(record.installPath);
  if (!installPath.startsWith(`${cacheRoot}${sep}`)) {
    throw new Error(`${spec.key}: installed plugin escaped the canonical cache`);
  }
  const settings = parseStateSnapshot(snapshotFile(join(context.claudeConfigDir, 'settings.json'), spec), {}, spec, 'plugin settings');
  if (settings?.enabledPlugins?.[spec.id] !== true) throw new Error(`${spec.key}: installed plugin is not enabled`);
}

function pluginResult(spec, status, ready, version, detail) {
  return { key: spec.key, id: spec.id, version, status, ready, detail };
}

export async function ensureMarketplacePlugin(spec, context) {
  try {
    validateSpecFilenameComponents(spec);
    validateFilenameComponent(spec?.marketplace, 'marketplace');
    validateFilenameComponent(spec?.plugin, 'plugin');
  } catch (error) {
    return pluginResult(spec || {}, 'warning', false, null, error.message);
  }
  const baseline = PLUGIN_BASELINES[spec.key];
  if (!baseline || ['key', 'id', 'marketplace', 'plugin', 'version'].some(field => spec[field] !== baseline[field])) {
    return pluginResult(spec, 'warning', false, null, 'plugin spec is not canonical');
  }
  const pluginRoot = join(context.claudeConfigDir, 'plugins');
  const installedPlugins = join(pluginRoot, 'installed_plugins.json');
  let installedSnapshot;
  let installed;
  try {
    installedSnapshot = snapshotFile(installedPlugins, spec);
    installed = parseStateSnapshot(installedSnapshot, { version: 2, plugins: {} }, spec, 'installed plugin state');
  } catch (error) {
    return pluginResult(spec, 'warning', false, null, error.message);
  }
  const classification = classifyPlugin(installed, spec);
  const selected = selectInstalledRecord(installed, spec.id);
  if (classification === 'satisfied') {
    return pluginResult(spec, 'preserved', true, selected.version, `preserved ${selected.version}`);
  }
  if (classification === 'invalid') {
    return pluginResult(spec, 'warning', false, null, 'installed version is invalid; preserved existing state');
  }

  const knownMarketplaces = join(pluginRoot, 'known_marketplaces.json');
  const settingsPath = join(context.claudeConfigDir, 'settings.json');
  let knownSnapshot;
  let settingsSnapshot;
  let known;
  try {
    knownSnapshot = snapshotFile(knownMarketplaces, spec);
    settingsSnapshot = snapshotFile(settingsPath, spec);
    known = parseStateSnapshot(knownSnapshot, {}, spec, 'known marketplace state');
    parseStateSnapshot(settingsSnapshot, {}, spec, 'plugin settings');
  } catch (error) {
    return pluginResult(spec, 'warning', false, selected?.version || null, error.message);
  }

  let persistentTransaction = null;
  let marketplaceTransaction = null;
  let cacheTransaction = null;
  try {
    const stagedSource = await downloadAndStage(spec, context);
    const materialized = materializePersistentSource(stagedSource.sourceRoot, spec, context);
    persistentTransaction = materialized.transaction;
    const trackedMarketplace = ensureTrackedDirectory(
      pluginRoot,
      ['marketplaces'],
      spec,
      context,
      'marketplace parent',
    );
    const marketplaceParent = trackedMarketplace.path;
    const marketplaceCreatedParents = trackedMarketplace.createdParents;
    const marketplaceParentGuard = trackedDirectoryGuard(marketplaceParent, marketplaceCreatedParents, spec, 'marketplace parent');
    marketplaceTransaction = prepareDirectoryReplacement(
      join(marketplaceParent, spec.marketplace),
      spec,
      'marketplace',
      marketplaceParentGuard,
    );
    marketplaceTransaction.createdParents = marketplaceCreatedParents;
    cacheTransaction = prepareCacheTransaction(pluginRoot, spec, installed, materialized.pluginSource, context);

    if (Object.hasOwn(known, spec.marketplace)) {
      runPluginCli(['plugin', 'marketplace', 'remove', spec.marketplace], spec, context);
    }
    runPluginCli(['plugin', 'marketplace', 'add', materialized.persistentSource, '--scope', 'user'], spec, context);
    runPluginCli(
      classification === 'missing'
        ? ['plugin', 'install', spec.id, '--scope', 'user']
        : ['plugin', 'update', spec.id, '--scope', 'user'],
      spec,
      context,
    );
    verifyPluginInstallation(spec, context, pluginRoot, cacheTransaction);
  } catch (error) {
    if (!persistentTransaction && error?.transaction) persistentTransaction = error.transaction;
    const restorationErrors = [];
    for (const restore of [
      () => restoreFile(knownMarketplaces, knownSnapshot, spec),
      () => restoreFile(installedPlugins, installedSnapshot, spec),
      () => restoreFile(settingsPath, settingsSnapshot, spec),
      () => marketplaceTransaction && restoreDirectoryReplacement(marketplaceTransaction, spec),
      () => cacheTransaction && restoreCacheTransaction(cacheTransaction, spec, context),
      () => marketplaceTransaction && cleanupCreatedParents(marketplaceTransaction.createdParents, spec),
      () => cacheTransaction && cleanupCreatedCacheParents(cacheTransaction, spec),
      () => persistentTransaction && restoreDirectoryReplacement(persistentTransaction, spec),
      () => persistentTransaction && cleanupCreatedParents(persistentTransaction.createdParents || [], spec),
    ]) {
      try { restore(); } catch (restoreError) { restorationErrors.push(restoreError); }
    }
    if (restorationErrors.length > 0 || error?.restorationIncomplete) {
      const failure = new Error(`${spec.key}: plugin transaction restoration incomplete`);
      failure.restorationIncomplete = true;
      const primary = error?.restorationIncomplete ? error : restorationErrors.find(candidate => candidate?.restorationIncomplete) || restorationErrors[0] || error;
      failure.cause = primary;
      failure.transaction = primary?.transaction || persistentTransaction || null;
      if (primary?.evidencePath) failure.evidencePath = primary.evidencePath;
      if (primary?.evidencePaths) failure.evidencePaths = primary.evidencePaths;
      if (primary?.unexpectedPaths) failure.unexpectedPaths = primary.unexpectedPaths;
      throw failure;
    }
    return pluginResult(spec, 'warning', false, selected?.version || null, error.message);
  }

  const cleanupErrors = [];
  for (const cleanup of [
    () => cleanupDirectoryReplacement(marketplaceTransaction, spec),
    () => cleanupCacheTransaction(cacheTransaction, spec),
    () => cleanupDirectoryReplacement(persistentTransaction, spec),
  ]) {
    try { cleanup(); } catch (error) { cleanupErrors.push(error); }
  }
  if (cleanupErrors.length > 0) {
    return pluginResult(spec, 'warning', true, spec.version, 'installed plugin verified; transaction backup cleanup failed');
  }
  return pluginResult(
    spec,
    classification === 'missing' ? 'installed' : 'upgraded',
    true,
    spec.version,
    `${classification === 'missing' ? 'installed' : 'upgraded'} ${spec.version}`,
  );
}

function warningResult(spec, error) {
  const detail = error instanceof Error ? error.message : 'plugin setup failed';
  return pluginResult(spec, 'warning', false, null, detail);
}

export function shouldConfigurePluginDependency(result) {
  return result?.ready === true && result.status !== 'warning';
}

export function enabledPluginKeys(selection) {
  if (!selection || !Array.isArray(selection.enabled)) {
    return new Set(Object.keys(PLUGIN_ENHANCEMENT_IDS));
  }
  const enabled = new Set(selection.enabled);
  const keys = new Set();
  for (const [key, enhancementId] of Object.entries(PLUGIN_ENHANCEMENT_IDS)) {
    if (enabled.has(enhancementId)) keys.add(key);
  }
  return keys;
}

function disabledPluginSelection(summary, error) {
  const detail = error instanceof Error ? error.message : String(error);
  return { enabled: [], warning: `${summary}: ${detail}` };
}

async function resolvePluginSelection(context) {
  const clawgodDir = resolve(context.clawgodDir);
  const manifestPath = process.env.CLAWGOD_ENHANCEMENT_MANIFEST_FILE || join(clawgodDir, 'enhancement-manifest.json');
  const configModulePath = process.env.CLAWGOD_ENHANCEMENT_CONFIG_MODULE || join(clawgodDir, 'enhancement-config.mjs');
  const configPath = join(clawgodDir, 'enhancements.json');
  let engine;
  try {
    engine = await import(pathToFileURL(configModulePath).href);
  } catch {
    return null;
  }
  let manifest;
  try {
    manifest = engine.loadEnhancementManifest(readFileSync(manifestPath, 'utf8'), { filename: 'enhancements.json' });
  } catch {
    return null;
  }
  let raw;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { ...engine.resolveEnhancementSelection({}, manifest), warning: null };
    }
    return disabledPluginSelection('enhancement config is unreadable; optional plugins disabled', error);
  }
  let stored;
  try {
    stored = engine.parseStoredEnhancementConfig(raw, manifest);
  } catch (error) {
    return disabledPluginSelection('enhancement config is invalid; optional plugins disabled', error);
  }
  return { ...engine.resolveEnhancementSelection({ stored }, manifest), warning: null };
}

async function deselectedPluginResult(spec, context) {
  if (spec.key === 'superpowers') {
    return pluginResult(spec, 'disabled', false, null, 'management disabled; user installation retained');
  }
  let restoration;
  try {
    restoration = spec.key === 'hud'
      ? await restoreHud(context)
      : await restoreClaudeMemIntegrations(context);
  } catch (error) {
    return warningResult(spec, error);
  }
  if (restoration.failures.length > 0) {
    return warningResult(spec, new Error(`deselection restoration failed: ${restoration.failures[0]}`));
  }
  return pluginResult(
    spec,
    'disabled',
    false,
    null,
    `management disabled; restored ${restoration.restored.length} owned field(s)`,
  );
}

export async function ensurePluginDependencies(context, selection) {
  const specs = [PLUGIN_BASELINES.hud, PLUGIN_BASELINES.memory, PLUGIN_BASELINES.superpowers];
  const enabled = enabledPluginKeys(selection);
  const state = { schemaVersion: 1, hud: {}, claudeMem: { files: {} } };
  const results = [];
  if (selection?.warning) {
    results.push(pluginResult({ key: 'selection', id: 'plugin-selection' }, 'warning', false, null, selection.warning));
  }
  for (const spec of specs) {
    if (!enabled.has(spec.key)) {
      results.push(await deselectedPluginResult(spec, context));
      continue;
    }
    let marketplace;
    try {
      marketplace = await ensureMarketplacePlugin(spec, context);
    } catch (error) {
      marketplace = warningResult(spec, error);
    }
    if (!shouldConfigurePluginDependency(marketplace) || spec.key === 'superpowers') {
      results.push(marketplace);
      continue;
    }
    try {
      results.push(spec.key === 'hud'
        ? await configureHud(context, state)
        : await configureClaudeMemBun(context, state));
    } catch (error) {
      results.push(warningResult(spec, error));
    }
  }
  return results;
}

function pluginContext() {
  const home = process.env.HOME || homedir();
  const clawgodDir = process.env.CLAWGOD_DIR || join(home, '.clawgod');
  return {
    home,
    claudeConfigDir: process.env.CLAUDE_CONFIG_DIR || join(home, '.claude'),
    clawgodDir,
    bunPath: process.env.CLAWGOD_BUN_BIN || process.execPath,
    claudeCliPath: join(clawgodDir, 'cli.original.cjs'),
    fetchFilePath: join(clawgodDir, 'fetch-file.mjs'),
    env: process.env,
    spawnSyncImpl: Bun.spawnSync,
  };
}

function printPluginResults(results) {
  let ready = 0;
  let disabled = 0;
  let warnings = 0;
  for (const result of results) {
    const label = result.status === 'disabled'
      ? 'disabled'
      : (result.status === 'warning' || !result.ready) ? 'warning' : 'ready';
    if (label === 'disabled') disabled += 1;
    else if (label === 'warning') warnings += 1;
    else ready += 1;
    const detail = String(result.detail || '').replace(/\s+/g, ' ').trim();
    console.log(`${result.id}: ${label}${detail ? ` - ${detail}` : ''}`);
  }
  console.log(`Optional plugins: ${ready} ready, ${disabled} disabled, ${warnings} warnings`);
}

const MANAGED_ATOMIC_RESIDUE = /^\.(?:plugin-dependencies-state\.json|claude-hud-statusline\.mjs)\.\d+\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/;

function cleanupManagedAtomicResidue(context) {
  const root = resolve(context.clawgodDir);
  let rootIdentity;
  try {
    const status = lstatSync(root);
    if (status.isSymbolicLink() || !status.isDirectory()) return;
    rootIdentity = { dev: status.dev, ino: status.ino };
  } catch { return; }
  let entries;
  try { entries = readdirSync(root); } catch { return; }
  for (const name of entries) {
    if (!MANAGED_ATOMIC_RESIDUE.test(name)) continue;
    const path = join(root, name);
    let status;
    try { status = lstatSync(path); } catch { continue; }
    if (status.isSymbolicLink() || !status.isFile() || status.nlink !== 1) continue;
    let currentRoot;
    let current;
    try {
      currentRoot = lstatSync(root);
      current = lstatSync(path);
    } catch { continue; }
    if (currentRoot.isSymbolicLink() || !currentRoot.isDirectory()
      || currentRoot.dev !== rootIdentity.dev || currentRoot.ino !== rootIdentity.ino
      || current.isSymbolicLink() || !current.isFile() || current.nlink !== 1
      || current.dev !== status.dev || current.ino !== status.ino) continue;
    try { unlinkSync(path); } catch {}
  }
}

async function runPluginDependenciesCli(command) {
  const context = pluginContext();
  if (command === 'ensure') {
    const selection = await resolvePluginSelection(context);
    printPluginResults(await ensurePluginDependencies(context, selection));
    return;
  }
  if (command === 'uninstall') {
    const restoration = await restoreManagedIntegrations(context);
    if (restoration.conflicts.length > 0) {
      throw new Error(`optional plugin restoration conflicts: ${restoration.conflicts.join(', ')}`);
    }
    cleanupManagedAtomicResidue(context);
    return;
  }
  throw new Error('usage: plugin-dependencies.mjs <ensure|uninstall>');
}

if (import.meta.main) {
  try {
    await runPluginDependenciesCli(process.argv[2]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'optional plugin lifecycle failed');
    process.exitCode = 1;
  }
}
