#!/usr/bin/env bun
import { lstatSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const VENDOR_PUBLISH_ROLLED_BACK = 20;
export const VENDOR_PUBLISH_CONFLICT = 21;
export const VENDOR_PUBLISH_ROLLED_BACK_RETAINED = 22;
const CONFLICT_EVIDENCE = 'vendor-rollback-conflict.json';

function status(path) {
  try {
    const value = lstatSync(path);
    return {
      dev: value.dev,
      ino: value.ino,
      type: value.isDirectory() ? 'directory' : value.isSymbolicLink() ? 'symlink' : value.isFile() ? 'file' : 'other',
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function sameIdentity(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino && left?.type === right?.type;
}

function bindDirectory(path, label) {
  const identity = status(path);
  if (identity?.type !== 'directory') throw new Error(`vendor transaction: ${label} must be a real directory`);
  return { path, label, identity };
}

function verifyBinding(binding) {
  const actual = status(binding.path);
  if (!sameIdentity(actual, binding.identity)) {
    const error = new Error(`vendor transaction: ${binding.label} identity changed`);
    error.rootConflict = { root: binding.label, reason: 'root-identity-changed', expected: binding.identity, actual };
    throw error;
  }
}

function strictDescendant(root, path, label) {
  const rootPath = resolve(root);
  const childPath = resolve(path);
  const child = relative(rootPath, childPath);
  if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error(`vendor transaction: ${label} must be inside transaction directory`);
  }
  return { rootPath, childPath, parts: child.split(sep) };
}

function bindDescendant(rootBinding, path, label) {
  verifyBinding(rootBinding);
  const { rootPath, parts } = strictDescendant(rootBinding.path, path, label);
  const bindings = [];
  let current = rootPath;
  for (const part of parts) {
    current = join(current, part);
    bindings.push(bindDirectory(current, `${label} component ${part}`));
  }
  return bindings;
}

function verifyRoots(roots, includeCandidate = true) {
  for (const binding of [roots.transaction, roots.liveParent, roots.live, roots.old]) verifyBinding(binding);
  if (includeCandidate) for (const binding of roots.candidate) verifyBinding(binding);
  const ripgrep = status(join(roots.live.path, 'ripgrep'));
  if (!sameIdentity(ripgrep, roots.ripgrep)) {
    const error = new Error('vendor transaction: managed ripgrep identity changed');
    error.rootConflict = { root: 'ripgrep', reason: 'managed-ripgrep-identity-changed', expected: roots.ripgrep, actual: ripgrep };
    throw error;
  }
}

function collectRootConflicts(roots, includeCandidate = true) {
  const conflicts = [];
  try {
    verifyRoots(roots, includeCandidate);
  } catch (error) {
    conflicts.push(error?.rootConflict || { root: 'unknown', reason: 'root-validation-failed', error: String(error) });
  }
  return conflicts;
}

function boundEntries(binding, roots, skipRipgrep = false) {
  verifyRoots(roots);
  if (binding.identity === null) return [];
  const names = readdirSync(binding.path).filter(name => !skipRipgrep || name !== 'ripgrep').sort();
  verifyRoots(roots);
  return names;
}

function moveAndRecord(source, destination, name) {
  const identity = status(join(source, name));
  renameSync(join(source, name), join(destination, name));
  return { name, identity };
}

function writeEvidence(roots, cause, conflicts) {
  try {
    verifyBinding(roots.transaction);
    writeFileSync(join(roots.transaction.path, CONFLICT_EVIDENCE), JSON.stringify({
      cause: cause instanceof Error ? cause.message : String(cause),
      conflicts,
    }, null, 2) + '\n');
    verifyBinding(roots.transaction);
  } catch {
    // A replaced transaction root is not a safe evidence destination.
  }
}

function transactionCleanupSafe(transaction, candidateVendor, oldVendor) {
  try {
    verifyBinding(transaction);
    const { rootPath, parts } = strictDescendant(transaction.path, candidateVendor, 'candidate vendor');
    let current = rootPath;
    for (const part of parts) {
      current = join(current, part);
      if (status(current)?.type === 'symlink') return false;
    }
    return status(oldVendor)?.type !== 'symlink';
  } catch {
    return false;
  }
}

function rollback({ roots, published, oldEntries, cause }) {
  const conflicts = collectRootConflicts(roots);
  const criticalRoots = new Set(['transaction', 'live vendor parent', 'live vendor', 'old vendor']);
  let canMutate = !conflicts.some(conflict => criticalRoots.has(conflict.root));
  let failed;

  if (canMutate) {
    const failedPath = join(roots.transaction.path, 'failed-vendor');
    try {
      if (status(failedPath) !== null) throw new Error('failed vendor path already exists');
      mkdirSync(failedPath);
      failed = bindDirectory(failedPath, 'failed vendor');
    } catch (error) {
      conflicts.push({ root: 'failed vendor', reason: 'failed-vendor-setup-failed', error: String(error) });
      canMutate = false;
    }
  }

  const verifyRollbackRoots = () => {
    verifyRoots(roots, false);
    verifyBinding(failed);
  };

  if (canMutate) {
    for (const entry of published.toReversed()) {
      try {
        verifyRollbackRoots();
        const livePath = join(roots.live.path, entry.name);
        const liveIdentity = status(livePath);
        if (liveIdentity === null) continue;
        if (!sameIdentity(liveIdentity, entry.identity)) {
          conflicts.push({ entry: entry.name, reason: 'published-entry-identity-changed', expected: entry.identity, actual: liveIdentity });
          continue;
        }
        renameSync(livePath, join(failed.path, entry.name));
        verifyRollbackRoots();
      } catch (error) {
        conflicts.push(error?.rootConflict || { entry: entry.name, reason: 'could-not-isolate-published-entry', error: String(error) });
        canMutate = false;
        break;
      }
    }
  }

  if (canMutate) {
    for (const entry of oldEntries) {
      try {
        verifyRollbackRoots();
        const source = join(roots.old.path, entry.name);
        const destination = join(roots.live.path, entry.name);
        if (status(source) === null) {
          if (!sameIdentity(status(destination), entry.identity)) conflicts.push({ entry: entry.name, reason: 'old-entry-not-restored' });
          continue;
        }
        if (status(destination) !== null) {
          conflicts.push({ entry: entry.name, reason: 'old-entry-destination-occupied', actual: status(destination) });
          continue;
        }
        renameSync(source, destination);
        verifyRollbackRoots();
        if (!sameIdentity(status(destination), entry.identity)) conflicts.push({ entry: entry.name, reason: 'old-entry-identity-changed' });
      } catch (error) {
        conflicts.push(error?.rootConflict || { entry: entry.name, reason: 'could-not-restore-old-entry', error: String(error) });
        canMutate = false;
        break;
      }
    }
  }

  conflicts.push(...collectRootConflicts(roots));
  if (conflicts.length === 0) return true;
  writeEvidence(roots, cause, conflicts);
  return false;
}

export function publishVendorTransaction({ liveVendor, candidateVendor, transactionDir, afterPublish }) {
  const oldVendor = join(transactionDir, 'old-vendor');
  const oldEntries = [];
  const published = [];
  let mutationStarted = false;
  let transaction;
  let roots;

  try {
    transaction = bindDirectory(transactionDir, 'transaction');
    const liveParent = bindDirectory(dirname(liveVendor), 'live vendor parent');
    const live = bindDirectory(liveVendor, 'live vendor');
    const ripgrep = status(join(liveVendor, 'ripgrep'));
    const candidate = bindDescendant(transaction, candidateVendor, 'candidate vendor');
    if (status(oldVendor) !== null) throw new Error('vendor transaction: old vendor path must not already exist');
    mkdirSync(oldVendor);
    const old = bindDirectory(oldVendor, 'old vendor');
    roots = { transaction, liveParent, live, candidate, old, ripgrep };

    const candidateRoot = candidate.at(-1);
    if (boundEntries(candidateRoot, roots).includes('ripgrep')) {
      throw new Error('vendor transaction: candidate must not contain managed ripgrep');
    }
    for (const name of boundEntries(live, roots, true)) {
      verifyRoots(roots);
      const entry = moveAndRecord(live.path, old.path, name);
      mutationStarted = true;
      oldEntries.push(entry);
      verifyRoots(roots);
    }
    for (const name of boundEntries(candidateRoot, roots)) {
      verifyRoots(roots);
      const entry = moveAndRecord(candidateRoot.path, live.path, name);
      mutationStarted = true;
      published.push(entry);
      verifyRoots(roots);
      afterPublish?.({ ...entry, path: join(live.path, name), publishedCount: published.length });
      verifyRoots(roots);
    }
    verifyRoots(roots);
  } catch (cause) {
    let rollbackComplete = false;
    if (!mutationStarted) {
      try {
        if (!transaction) throw new Error('transaction root was not trusted');
        verifyBinding(transaction);
        rollbackComplete = true;
      } catch {
        rollbackComplete = false;
      }
    } else if (roots) {
      rollbackComplete = rollback({ roots, published, oldEntries, cause });
    }
    const error = new Error(`vendor transaction: publish failed; rollback ${rollbackComplete ? 'complete' : 'conflicted'}: ${cause instanceof Error ? cause.message : String(cause)}`);
    error.cause = cause;
    error.rollbackComplete = rollbackComplete;
    error.cleanupSafe = rollbackComplete && transactionCleanupSafe(transaction, candidateVendor, oldVendor);
    throw error;
  }
}

if (import.meta.main) {
  const [command, liveVendor, candidateVendor, transactionDir] = process.argv.slice(2);
  if (command !== 'publish' || !liveVendor || !candidateVendor || !transactionDir) {
    console.error(`usage: ${basename(process.argv[1])} publish <live-vendor> <candidate-vendor> <transaction-dir>`);
    process.exit(2);
  }
  try {
    publishVendorTransaction({ liveVendor, candidateVendor, transactionDir });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(error?.rollbackComplete
      ? error.cleanupSafe ? VENDOR_PUBLISH_ROLLED_BACK : VENDOR_PUBLISH_ROLLED_BACK_RETAINED
      : VENDOR_PUBLISH_CONFLICT);
  }
}
