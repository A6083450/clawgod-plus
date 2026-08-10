#!/usr/bin/env bun
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import * as defaultFileSystem from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GENERATED_HEADER = 'GENERATED FILE - edit src/ and run: bun build.mjs';
export const OUTPUTS = Object.freeze([
  Object.freeze({ template: 'src/template/install.sh', output: 'install.sh', mode: 0o755 }),
  Object.freeze({ template: 'src/template/install.ps1', output: 'install.ps1', mode: 0o644 }),
]);

const ROOT_DIR = fileURLToPath(new URL('.', import.meta.url));
const PLACEHOLDER_CANDIDATE_PATTERN = /@@CLAWGOD_([^\r\n]*?)@@/g;
const PLACEHOLDER_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const BUILD_LOCK_NAME = '.clawgod-installer-build.lock';
const TRANSACTION_FILE = '.clawgod-installer-build.transaction.json';
const TRANSACTION_COMMIT = '.clawgod-installer-build.transaction.commit';

export function placeholder(name) {
  return `@@CLAWGOD_${name}@@`;
}

export function modeForPlatform(mode, platform = process.platform) {
  if (platform !== 'win32') return mode & 0o777;
  return (mode & 0o200) === 0o200 ? 0o666 : 0o444;
}

function modeMatches(actual, expected, platform) {
  if (platform !== 'win32') return (actual & 0o777) === (expected & 0o777);
  return (actual & 0o200) === (expected & 0o200);
}

export function renderTemplate(template, replacements) {
  const declared = new Map(Object.entries(replacements));
  const occurrences = new Map();

  for (const match of template.matchAll(PLACEHOLDER_CANDIDATE_PATTERN)) {
    const name = match[1];
    if (!PLACEHOLDER_NAME_PATTERN.test(name)) {
      throw new Error(`Invalid placeholder: ${match[0]}`);
    }
    occurrences.set(name, (occurrences.get(name) || 0) + 1);
    if (!declared.has(name)) {
      throw new Error(`Undeclared placeholder: ${placeholder(name)}`);
    }
  }

  for (const name of declared.keys()) {
    const count = occurrences.get(name) || 0;
    if (count === 0) throw new Error(`Missing placeholder: ${placeholder(name)}`);
    if (count > 1) throw new Error(`Duplicate placeholder: ${placeholder(name)}`);
  }

  let rendered = template;
  for (const [name, replacementValue] of declared) {
    const token = placeholder(name);
    const value = String(replacementValue);
    rendered = value.endsWith('\n') && rendered.includes(`${token}\n`)
      ? rendered.replace(`${token}\n`, value)
      : rendered.replace(token, value);
  }

  const remaining = rendered.match(PLACEHOLDER_CANDIDATE_PATTERN);
  if (remaining) throw new Error(`Undeclared placeholder: ${remaining[0]}`);
  return rendered;
}

function addGeneratedHeader(output, content) {
  const header = `# ${GENERATED_HEADER}\n`;
  if (output.endsWith('.sh') && content.startsWith('#!')) {
    const lineEnd = content.indexOf('\n');
    return `${content.slice(0, lineEnd + 1)}${header}${content.slice(lineEnd + 1)}`;
  }
  return `${header}${content}`;
}

function resolveOutput(rootDir, output) {
  if (isAbsolute(output)) throw new Error(`Output path must be relative: ${output}`);
  const target = resolve(rootDir, output);
  const traversal = relative(rootDir, target);
  if (traversal === '..' || traversal.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    throw new Error(`Output path escapes build root: ${output}`);
  }
  return target;
}

export async function renderGeneratedPair({ rootDir = ROOT_DIR, fileSystem = defaultFileSystem } = {}) {
  const featuresJson = await fileSystem.readFile(join(rootDir, 'src/generic/features.json'), 'utf8');
  const runtimeSourceFiles = {
    FETCH_FILE_MJS: 'src/generic/runtime/fetch-file.mjs',
    FETCH_PACKAGE_MJS: 'src/generic/runtime/fetch-package.mjs',
    INSTALL_RIPGREP_MJS: 'src/generic/runtime/install-ripgrep.mjs',
    EXTRACTOR_MJS: 'src/generic/runtime/extractor.mjs',
    POST_PROCESSOR_MJS: 'src/generic/runtime/post-processor.mjs',
    REPATCHER_MJS: 'src/generic/runtime/repatcher.mjs',
    WRAPPER_CJS: 'src/generic/runtime/wrapper.cjs',
    OPENAI_PROXY_CJS: 'src/generic/runtime/openai-proxy.cjs',
    CLAUDE_MEM_COMPAT_CJS: 'src/generic/runtime/claude-mem-compat.cjs',
    PLUGIN_DEPENDENCIES_MJS: 'src/generic/runtime/plugin-dependencies.mjs',
    CLAUDE_HUD_STATUSLINE_MJS: 'src/generic/runtime/claude-hud-statusline.mjs',
  };
  const runtimeSources = Object.fromEntries(await Promise.all(
    Object.entries(runtimeSourceFiles).map(async ([name, path]) => [
      name,
      await fileSystem.readFile(join(rootDir, path), 'utf8'),
    ]),
  ));
  runtimeSources.PLUGIN_DEPENDENCIES_MJS = renderTemplate(
    runtimeSources.PLUGIN_DEPENDENCIES_MJS,
    { HUD_STATUSLINE_SOURCE_JSON: JSON.stringify(JSON.stringify(runtimeSources.CLAUDE_HUD_STATUSLINE_MJS)).slice(1, -1) },
  );
  return Promise.all(OUTPUTS.map(async entry => {
    const template = await fileSystem.readFile(join(rootDir, entry.template), 'utf8');
    const powerShell = entry.output.endsWith('.ps1');
    const replacements = {
      FEATURES_JSON: featuresJson,
      ...Object.fromEntries(Object.entries(runtimeSources)
        .filter(([name]) => name !== 'CLAUDE_HUD_STATUSLINE_MJS')
        .map(([name, source]) => [
          powerShell ? `${name}_BASE64` : name,
          powerShell ? Buffer.from(source, 'utf8').toString('base64') : source,
        ])),
    };
    const content = renderTemplate(template, replacements);
    return { ...entry, content: addGeneratedHeader(entry.output, content) };
  }));
}

async function removeIfPresent(fileSystem, path) {
  try {
    await fileSystem.rm(path, { force: true, recursive: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function unlinkIfPresent(fileSystem, path) {
  try {
    await fileSystem.unlink(path);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function lockKind(status) {
  if (status.isFile()) return 'file';
  if (status.isDirectory()) return 'directory';
  if (status.isSymbolicLink()) return 'symlink';
  return 'other';
}

function sameFileIdentity(left, right) {
  return left.kind === right.kind
    && left.dev === right.dev
    && left.ino === right.ino
    && left.birthtimeMs === right.birthtimeMs;
}

function lockIdentity(status) {
  return {
    kind: lockKind(status),
    dev: String(status.dev),
    ino: String(status.ino),
    birthtimeMs: status.birthtimeMs,
  };
}

function parseLockOwner(raw) {
  try {
    const owner = JSON.parse(raw);
    if (Number.isSafeInteger(owner?.pid)
      && owner.pid > 0
      && typeof owner?.token === 'string'
      && owner.token.length > 0) {
      return owner;
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  return null;
}

async function observeLockPath(fileSystem, path) {
  let status;
  try {
    status = await fileSystem.lstat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }

  const identity = lockIdentity(status);
  let owner = null;
  let detail = null;
  if (identity.kind === 'file') {
    let handle;
    try {
      handle = await fileSystem.open(path, 'r');
      const openedIdentity = lockIdentity(await handle.stat());
      const raw = await handle.readFile('utf8');
      const currentIdentity = lockIdentity(await fileSystem.lstat(path));
      if (!sameFileIdentity(identity, openedIdentity)
        || !sameFileIdentity(openedIdentity, currentIdentity)) return { raced: true };
      owner = parseLockOwner(raw);
      detail = raw;
    } catch (error) {
      if (error?.code === 'ENOENT') return { raced: true };
      throw error;
    } finally {
      await handle?.close();
    }
  } else if (identity.kind === 'directory') {
    try {
      const raw = await fileSystem.readFile(join(path, 'owner.json'), 'utf8');
      owner = parseLockOwner(raw);
      detail = raw;
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR' && !(error instanceof SyntaxError)) throw error;
    }
    let currentStatus;
    try {
      currentStatus = await fileSystem.lstat(path);
    } catch (error) {
      if (error?.code === 'ENOENT') return { raced: true };
      throw error;
    }
    if (!sameFileIdentity(identity, lockIdentity(currentStatus))) return { raced: true };
  } else if (identity.kind === 'symlink') {
    try {
      detail = await fileSystem.readlink(path);
      const currentIdentity = lockIdentity(await fileSystem.lstat(path));
      if (!sameFileIdentity(identity, currentIdentity)) return { raced: true };
    } catch (error) {
      if (error?.code === 'ENOENT') return { raced: true };
      throw error;
    }
  }

  return { ...identity, mtimeMs: status.mtimeMs, owner, detail, raced: false };
}

function sameLockObservation(left, right) {
  return Boolean(left && right && !left.raced && !right.raced)
    && sameFileIdentity(left, right)
    && left.detail === right.detail
    && left.owner?.token === right.owner?.token
    && left.owner?.pid === right.owner?.pid;
}

function lockIsStale(observation, staleMs, isOwnerAlive) {
  if (observation?.raced || !observation) return false;
  if (observation.owner) return !isOwnerAlive(observation.owner.pid);
  return Date.now() - observation.mtimeMs >= staleMs;
}

async function preserveUnverifiedQuarantine(fileSystem, quarantine, lockPath) {
  try {
    const observation = await observeLockPath(fileSystem, quarantine);
    if (observation?.kind === 'file') await fileSystem.link(quarantine, lockPath);
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'EEXIST') throw error;
  }
}

async function removeVerifiedQuarantine(fileSystem, quarantine, observation) {
  const current = await observeLockPath(fileSystem, quarantine);
  if (!sameLockObservation(observation, current)) {
    throw new Error(`Installer build lock quarantine ownership changed: ${quarantine}`);
  }
  if (observation.kind === 'directory') {
    await fileSystem.rm(quarantine, { recursive: true });
  } else {
    await fileSystem.unlink(quarantine);
  }
}

async function reclaimStaleLock(fileSystem, rootDir, lockPath, observation) {
  const quarantine = join(rootDir, `${BUILD_LOCK_NAME}.stale-${randomUUID()}`);
  try {
    await fileSystem.rename(lockPath, quarantine);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'EEXIST' || error?.code === 'ENOTEMPTY') return false;
    throw error;
  }

  const quarantined = await observeLockPath(fileSystem, quarantine);
  if (!sameLockObservation(observation, quarantined)) {
    await preserveUnverifiedQuarantine(fileSystem, quarantine, lockPath);
    throw new Error(`Installer build lock changed while being reclaimed: ${lockPath}`);
  }

  await removeVerifiedQuarantine(fileSystem, quarantine, quarantined);
  if (quarantined.kind === 'file' && quarantined.owner) {
    const ownerPath = join(rootDir, `${BUILD_LOCK_NAME}.owner-${quarantined.owner.token}`);
    const ownerAnchor = await observeLockPath(fileSystem, ownerPath);
    if (sameLockObservation(quarantined, ownerAnchor)) await unlinkIfPresent(fileSystem, ownerPath);
  }
  return true;
}

async function acquireBuildLock(rootDir, fileSystem, {
  retryDelayMs = 25,
  timeoutMs = 10000,
  staleMs = 30000,
  isOwnerAlive = processIsAlive,
} = {}) {
  const lockPath = join(rootDir, BUILD_LOCK_NAME);
  const token = randomUUID();
  const ownerPath = join(rootDir, `${BUILD_LOCK_NAME}.owner-${token}`);
  const owner = {
    pid: process.pid,
    token,
    startedAt: Date.now(),
  };
  const deadline = Date.now() + timeoutMs;
  let acquired = false;
  let expectedOwnerAnchor;

  await fileSystem.writeFile(ownerPath, JSON.stringify(owner), { flag: 'wx', mode: 0o600 });
  try {
    const ownerAnchor = await observeLockPath(fileSystem, ownerPath);
    if (ownerAnchor?.kind !== 'file'
      || ownerAnchor.owner?.token !== token
      || ownerAnchor.owner?.pid !== process.pid) {
      throw new Error(`Cannot verify installer build lock owner record: ${ownerPath}`);
    }
    expectedOwnerAnchor = ownerAnchor;

    while (true) {
      try {
        await fileSystem.link(ownerPath, lockPath);
        const published = await observeLockPath(fileSystem, lockPath);
        if (!sameLockObservation(ownerAnchor, published)) {
          throw new Error(`Cannot verify published installer build lock: ${lockPath}`);
        }
        acquired = true;
        return { lockPath, ownerPath, owner: ownerAnchor };
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      }

      const observation = await observeLockPath(fileSystem, lockPath);
      if (observation?.raced || !observation) {
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for installer build lock: ${lockPath}`);
        await new Promise(resolveDelay => setTimeout(resolveDelay, retryDelayMs));
        continue;
      }
      if (lockIsStale(observation, staleMs, isOwnerAlive)
        && await reclaimStaleLock(fileSystem, rootDir, lockPath, observation)) continue;

      if (Date.now() >= deadline) throw new Error(`Timed out waiting for installer build lock: ${lockPath}`);
      await new Promise(resolveDelay => setTimeout(resolveDelay, retryDelayMs));
    }
  } finally {
    if (!acquired) {
      const ownerAnchor = await observeLockPath(fileSystem, ownerPath);
      if (sameLockObservation(expectedOwnerAnchor, ownerAnchor)) {
        await unlinkIfPresent(fileSystem, ownerPath);
      }
    }
  }
}

async function releaseBuildLock(fileSystem, lock) {
  const ownerAnchor = await observeLockPath(fileSystem, lock.ownerPath);
  const published = await observeLockPath(fileSystem, lock.lockPath);
  if (!sameLockObservation(lock.owner, ownerAnchor)
    || !sameLockObservation(ownerAnchor, published)
    || ownerAnchor.owner?.pid !== process.pid) {
    throw new Error(`Installer build lock ownership changed: ${lock.lockPath}`);
  }

  const quarantine = `${lock.lockPath}.release-${randomUUID()}`;
  await fileSystem.rename(lock.lockPath, quarantine);
  const released = await observeLockPath(fileSystem, quarantine);
  if (!sameLockObservation(ownerAnchor, released)) {
    await preserveUnverifiedQuarantine(fileSystem, quarantine, lock.lockPath);
    throw new Error(`Installer build lock ownership changed during release: ${lock.lockPath}`);
  }
  await removeVerifiedQuarantine(fileSystem, quarantine, released);

  const finalOwnerAnchor = await observeLockPath(fileSystem, lock.ownerPath);
  if (!sameLockObservation(ownerAnchor, finalOwnerAnchor)) {
    throw new Error(`Installer build lock owner record changed during release: ${lock.ownerPath}`);
  }
  await fileSystem.unlink(lock.ownerPath);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function pathExists(fileSystem, path) {
  try {
    await fileSystem.lstat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function describePath(fileSystem, path) {
  try {
    const status = await fileSystem.lstat(path);
    if (status.isFile()) {
      return {
        kind: 'file',
        mode: status.mode & 0o777,
        sha256: sha256(await fileSystem.readFile(path)),
      };
    }
    if (status.isSymbolicLink()) {
      return { kind: 'symlink', target: await fileSystem.readlink(path) };
    }
    throw new Error(`Generated output target is not a regular file or symlink: ${path}`);
  } catch (error) {
    if (error?.code === 'ENOENT') return { kind: 'missing' };
    throw error;
  }
}

async function descriptorMatches(fileSystem, path, descriptor, platform) {
  if (descriptor.kind === 'missing') return !(await pathExists(fileSystem, path));
  try {
    const status = await fileSystem.lstat(path);
    if (descriptor.kind === 'file') {
      return status.isFile()
        && modeMatches(status.mode, descriptor.mode, platform)
        && sha256(await fileSystem.readFile(path)) === descriptor.sha256;
    }
    if (descriptor.kind === 'symlink') {
      return status.isSymbolicLink() && await fileSystem.readlink(path) === descriptor.target;
    }
    return false;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function transactionState(rootDir, transaction, entry) {
  const target = resolveOutput(rootDir, entry.output);
  return {
    ...entry,
    target,
    stage: join(dirname(target), `.${entry.output}.stage-${transaction.id}`),
    backup: join(dirname(target), `.${entry.output}.backup-${transaction.id}`),
  };
}

function validateTransaction(transaction) {
  if (transaction?.version !== 1
    || typeof transaction?.id !== 'string'
    || !Array.isArray(transaction?.outputs)
    || transaction.outputs.length !== 2) {
    throw new Error('Invalid generated installer transaction journal');
  }
  for (const entry of transaction.outputs) {
    if (typeof entry?.output !== 'string'
      || !Number.isInteger(entry?.mode)
      || typeof entry?.sha256 !== 'string'
      || !entry?.original
      || !['missing', 'file', 'symlink'].includes(entry.original.kind)) {
      throw new Error('Invalid generated installer transaction entry');
    }
  }
  return transaction;
}

async function readTransaction(fileSystem, rootDir) {
  const journalPath = join(rootDir, TRANSACTION_FILE);
  try {
    return validateTransaction(JSON.parse(await fileSystem.readFile(journalPath, 'utf8')));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeTransaction(fileSystem, rootDir, transaction) {
  const journalPath = join(rootDir, TRANSACTION_FILE);
  const temporary = join(rootDir, `${TRANSACTION_FILE}.${transaction.id}.tmp`);
  try {
    await fileSystem.writeFile(temporary, `${JSON.stringify(transaction, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await fileSystem.rename(temporary, journalPath);
  } catch (error) {
    await removeIfPresent(fileSystem, temporary);
    throw error;
  }
}

async function recoverPendingTransaction(fileSystem, rootDir, platform) {
  const journalPath = join(rootDir, TRANSACTION_FILE);
  const commitPath = join(rootDir, TRANSACTION_COMMIT);
  const transaction = await readTransaction(fileSystem, rootDir);
  if (!transaction) {
    if (await pathExists(fileSystem, commitPath)) await removeIfPresent(fileSystem, commitPath);
    return;
  }

  const states = transaction.outputs.map(entry => transactionState(rootDir, transaction, entry));
  const committed = await pathExists(fileSystem, commitPath);
  const recoveryErrors = [];

  if (committed) {
    for (const state of states) {
      try {
        const matches = await descriptorMatches(fileSystem, state.target, {
          kind: 'file',
          mode: state.mode,
          sha256: state.sha256,
        }, platform);
        if (!matches) throw new Error(`Committed generated output is not recoverable: ${state.output}`);
      } catch (error) {
        recoveryErrors.push(error);
      }
    }
    if (recoveryErrors.length === 0) {
      for (const state of states) {
        for (const path of [state.stage, state.backup]) {
          try {
            await removeIfPresent(fileSystem, path);
          } catch (error) {
            recoveryErrors.push(error);
          }
        }
      }
    }
  } else {
    for (const state of [...states].reverse()) {
      try {
        if (state.original.kind === 'missing') {
          await removeIfPresent(fileSystem, state.target);
        } else if (await pathExists(fileSystem, state.backup)) {
          await removeIfPresent(fileSystem, state.target);
          await fileSystem.rename(state.backup, state.target);
        } else if (!(await descriptorMatches(fileSystem, state.target, state.original, platform))) {
          throw new Error(`Original generated output backup is unavailable: ${state.output}`);
        }
      } catch (error) {
        recoveryErrors.push(error);
      }
      try {
        await removeIfPresent(fileSystem, state.stage);
      } catch (error) {
        recoveryErrors.push(error);
      }
    }
    for (const state of states) {
      try {
        if (!(await descriptorMatches(fileSystem, state.target, state.original, platform))) {
          throw new Error(`Original generated output was not restored: ${state.output}`);
        }
      } catch (error) {
        recoveryErrors.push(error);
      }
    }
  }

  if (recoveryErrors.length > 0) {
    throw new AggregateError(recoveryErrors, `Generated installer ${committed ? 'commit cleanup' : 'rollback'} failed`);
  }

  await removeIfPresent(fileSystem, journalPath);
  if (committed) await removeIfPresent(fileSystem, commitPath);
}

async function publishGeneratedPair(outputs, {
  rootDir = ROOT_DIR,
  fileSystem = defaultFileSystem,
  platform = process.platform,
} = {}) {
  if (!Array.isArray(outputs) || outputs.length !== 2) {
    throw new Error('writeGeneratedPair requires exactly two outputs');
  }

  await recoverPendingTransaction(fileSystem, rootDir, platform);

  const transactionId = `${process.pid}-${randomUUID()}`;
  const states = await Promise.all(outputs.map(async entry => {
    const target = resolveOutput(rootDir, entry.output);
    return {
      ...entry,
      target,
      stage: join(dirname(target), `.${entry.output}.stage-${transactionId}`),
      backup: join(dirname(target), `.${entry.output}.backup-${transactionId}`),
      original: await describePath(fileSystem, target),
    };
  }));
  const transaction = {
    version: 1,
    id: transactionId,
    outputs: states.map(state => ({
      output: state.output,
      mode: state.mode,
      sha256: sha256(state.content),
      original: state.original,
    })),
  };

  try {
    await writeTransaction(fileSystem, rootDir, transaction);
    for (const state of states) {
      const mode = modeForPlatform(state.mode, platform);
      await fileSystem.writeFile(state.stage, state.content, { flag: 'wx', mode });
      await fileSystem.chmod(state.stage, mode);
    }

    for (const state of states) {
      if (state.original.kind !== 'missing') {
        await fileSystem.rename(state.target, state.backup);
      }
    }

    for (const state of states) {
      await fileSystem.rename(state.stage, state.target);
    }

    await fileSystem.mkdir(join(rootDir, TRANSACTION_COMMIT));
    await recoverPendingTransaction(fileSystem, rootDir, platform);
  } catch (error) {
    try {
      await recoverPendingTransaction(fileSystem, rootDir, platform);
    } catch (recoveryError) {
      throw new AggregateError([error, recoveryError], 'Generated installer publication and rollback failed');
    }
    throw error;
  }
}

export async function writeGeneratedPair(outputs, {
  rootDir = ROOT_DIR,
  fileSystem = defaultFileSystem,
  platform = process.platform,
  lockOptions,
} = {}) {
  const lock = await acquireBuildLock(rootDir, fileSystem, lockOptions);
  let publicationError;
  try {
    return await publishGeneratedPair(outputs, { rootDir, fileSystem, platform });
  } catch (error) {
    publicationError = error;
    throw error;
  } finally {
    try {
      await releaseBuildLock(fileSystem, lock);
    } catch (releaseError) {
      if (publicationError) {
        throw new AggregateError([publicationError, releaseError], 'Generated installer publication and lock release failed');
      }
      throw releaseError;
    }
  }
}

export async function checkGeneratedPair(outputs, {
  rootDir = ROOT_DIR,
  fileSystem = defaultFileSystem,
  platform = process.platform,
} = {}) {
  for (const evidence of [BUILD_LOCK_NAME, TRANSACTION_FILE, TRANSACTION_COMMIT]) {
    if (await pathExists(fileSystem, join(rootDir, evidence))) {
      throw new Error(`Stale generated output: pending installer build transaction (${evidence})`);
    }
  }
  const stale = [];
  for (const entry of outputs) {
    const target = resolveOutput(rootDir, entry.output);
    try {
      const status = await fileSystem.lstat(target);
      if (!status.isFile()) {
        stale.push(entry.output);
        continue;
      }
      const content = await fileSystem.readFile(target, 'utf8');
      if (content !== entry.content || !modeMatches(status.mode, entry.mode, platform)) stale.push(entry.output);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      stale.push(entry.output);
    }
  }
  if (stale.length > 0) throw new Error(`Stale generated output: ${stale.join(', ')}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    throw new Error('Usage: bun build.mjs [--check]');
  }
  const outputs = await renderGeneratedPair();
  if (args[0] === '--check') {
    await checkGeneratedPair(outputs);
    return;
  }
  await writeGeneratedPair(outputs);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
