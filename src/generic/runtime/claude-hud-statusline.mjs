#!/usr/bin/env bun
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

const claudeConfigDir = "/__CLAWGOD_HUD_CLAUDE_CONFIG_DIR__";
const pluginId = 'claude-hud@claude-hud';
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
function parseVersion(value) {
  const match = typeof value === 'string' ? semverPattern.exec(value) : null;
  if (!match) return null;
  const core = match.slice(1, 4).map(Number);
  if (!core.every(Number.isSafeInteger)) return null;
  const prerelease = match[4] ? match[4].split('.').map(identifier => {
    if (!/^\d+$/.test(identifier)) return identifier;
    if (!/^(0|[1-9]\d*)$/.test(identifier)) return null;
    const numeric = Number(identifier);
    return Number.isSafeInteger(numeric) ? numeric : null;
  }) : [];
  return prerelease.includes(null) ? null : { core, prerelease };
}
function compare(left, right) {
  const a = parseVersion(left); const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index++) if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index];
  if (!a.prerelease.length || !b.prerelease.length) return a.prerelease.length ? -1 : b.prerelease.length ? 1 : 0;
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
    if (a.prerelease[index] === undefined) return -1;
    if (b.prerelease[index] === undefined) return 1;
    if (a.prerelease[index] === b.prerelease[index]) continue;
    if (typeof a.prerelease[index] === 'number' && typeof b.prerelease[index] !== 'number') return -1;
    if (typeof a.prerelease[index] !== 'number' && typeof b.prerelease[index] === 'number') return 1;
    return a.prerelease[index] < b.prerelease[index] ? -1 : 1;
  }
  return 0;
}
function contained(root, path) {
  const child = relative(root, path);
  return child === '' || (!child.startsWith('..' + sep) && child !== '..' && !isAbsolute(child));
}
function captureDirectoryChain(root, target) {
  if (!contained(root, target)) return null;
  const identities = [];
  let current = root;
  for (const part of ['', ...relative(root, target).split(sep).filter(Boolean)]) {
    if (part) current = join(current, part);
    try {
      const status = lstatSync(current);
      if (status.isSymbolicLink() || !status.isDirectory()) return null;
      identities.push({ path: current, dev: status.dev, ino: status.ino, mode: status.mode, nlink: status.nlink });
    } catch { return null; }
  }
  return identities;
}
function validEntry(record, cacheRoot) {
  if (record?.scope !== 'user' || !parseVersion(record.version) || typeof record.installPath !== 'string' || !isAbsolute(record.installPath)) return null;
  try {
    if (!contained(cacheRoot, record.installPath)) return null;
    const cacheStatus = lstatSync(cacheRoot); const installStatus = lstatSync(record.installPath);
    if (cacheStatus.isSymbolicLink() || !cacheStatus.isDirectory() || installStatus.isSymbolicLink() || !installStatus.isDirectory()) return null;
    const realCache = realpathSync(cacheRoot); const realInstall = realpathSync(record.installPath);
    if (realCache === realInstall || !contained(realCache, realInstall)) return null;
    const source = join(record.installPath, 'src'); const candidate = join(source, 'index.ts');
    const directories = captureDirectoryChain(claudeConfigDir, source);
    if (!directories) return null;
    const sourceStatus = lstatSync(source); const entryStatus = lstatSync(candidate);
    if (sourceStatus.isSymbolicLink() || !sourceStatus.isDirectory() || entryStatus.isSymbolicLink() || !entryStatus.isFile() || entryStatus.nlink !== 1) return null;
    const entry = realpathSync(candidate);
    return contained(realInstall, entry) ? {
      record, entry, directories,
      entryIdentity: {
        dev: entryStatus.dev, ino: entryStatus.ino, mode: entryStatus.mode, nlink: entryStatus.nlink,
        size: entryStatus.size, mtimeMs: entryStatus.mtimeMs,
        sha256: new Bun.CryptoHasher('sha256').update(readFileSync(entry)).digest('hex'),
      },
    } : null;
  } catch { return null; }
}
function revalidate(selected) {
  for (const expected of selected.directories) {
    const status = lstatSync(expected.path);
    if (status.isSymbolicLink() || !status.isDirectory() || status.dev !== expected.dev || status.ino !== expected.ino
      || status.mode !== expected.mode || status.nlink !== expected.nlink) throw new Error('HUD directory changed before execution');
  }
  const status = lstatSync(selected.entry);
  const expected = selected.entryIdentity;
  if (status.isSymbolicLink() || !status.isFile() || status.nlink !== 1 || status.dev !== expected.dev || status.ino !== expected.ino
    || status.mode !== expected.mode || status.nlink !== expected.nlink || status.size !== expected.size || status.mtimeMs !== expected.mtimeMs
    || realpathSync(selected.entry) !== selected.entry
    || new Bun.CryptoHasher('sha256').update(readFileSync(selected.entry)).digest('hex') !== expected.sha256) {
    throw new Error('HUD entry changed before execution');
  }
}
let selected;
try {
  const installedPath = join(claudeConfigDir, 'plugins', 'installed_plugins.json');
  const installedStatus = lstatSync(installedPath);
  if (installedStatus.isSymbolicLink() || !installedStatus.isFile()) throw new Error('installed plugin state is unsafe');
  const installed = JSON.parse(readFileSync(installedPath, 'utf8'));
  if (installed?.version !== 2 || !installed.plugins || typeof installed.plugins !== 'object' || Array.isArray(installed.plugins)) {
    throw new Error('unsupported installed plugin schema');
  }
  const records = Array.isArray(installed?.plugins?.[pluginId]) ? installed.plugins[pluginId] : [];
  const cacheRoot = join(claudeConfigDir, 'plugins', 'cache', 'claude-hud', 'claude-hud');
  selected = records.map(record => validEntry(record, cacheRoot)).filter(Boolean).sort((a, b) => compare(b.record.version, a.record.version))[0];
  if (!selected) throw new Error('no valid user HUD installation in the canonical cache');
  revalidate(selected);
} catch (error) {
  console.error('claude-hud: ' + (error instanceof Error ? error.message : 'no valid user HUD installation'));
  process.exit(1);
}
const child = Bun.spawn({
  cmd: [process.execPath, selected.entry],
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
  env: process.env,
});
process.exit(await child.exited);
