#!/usr/bin/env bun
import { lstatSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const VENDOR_PUBLISH_ROLLED_BACK = 20;
export const VENDOR_PUBLISH_CONFLICT = 21;
export const VENDOR_PUBLISH_ROLLED_BACK_RETAINED = 22;
const CONFLICT_EVIDENCE = 'vendor-rollback-conflict.json';
const ROOT_CONFLICT = Symbol('vendor-root-conflict');

function status(path) {
  try {
    const value = lstatSync(path);
    return {
      dev: value.dev,
      ino: value.ino,
      type: value.isDirectory() ? 'directory' : value.isSymbolicLink() ? 'symlink' : value.isFile() ? 'file' : 'other',
      mode: value.mode,
      nlink: value.nlink,
      ctimeMs: value.ctimeMs,
      mtimeMs: value.mtimeMs,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function sameIdentity(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino && left?.type === right?.type;
}

function rootConflictError(message, conflict) {
  const error = new Error(message);
  error.rootConflict = conflict;
  error[ROOT_CONFLICT] = true;
  return error;
}

function internalRootConflict(error) {
  return error?.[ROOT_CONFLICT] === true ? error.rootConflict : null;
}

function bindDirectory(path, label) {
  const identity = status(path);
  if (identity?.type !== 'directory') throw new Error(`vendor transaction: ${label} must be a real directory`);
  return { path, label, identity };
}

function verifyBinding(binding) {
  const actual = status(binding.path);
  if (!sameIdentity(actual, binding.identity)) {
    throw rootConflictError(
      `vendor transaction: ${binding.label} identity changed`,
      { root: binding.label, reason: 'root-identity-changed', expected: binding.identity, actual },
    );
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

function bindDescendant(rootBinding, path, label, bindings = []) {
  verifyBinding(rootBinding);
  const { rootPath, parts } = strictDescendant(rootBinding.path, path, label);
  let current = rootPath;
  for (const part of parts) {
    current = join(current, part);
    bindings.push(bindDirectory(current, `${label} component ${part}`));
  }
  return bindings;
}

function verifyBoundRoots(roots, includeCandidate = true) {
  for (const binding of [roots.transaction, roots.liveParent, roots.live, roots.old]) {
    if (binding) verifyBinding(binding);
  }
  if (includeCandidate) for (const binding of roots.candidate) verifyBinding(binding);
  if (roots.ripgrepBound) {
    const ripgrep = status(join(roots.live.path, 'ripgrep'));
    if (!sameIdentity(ripgrep, roots.ripgrep)) {
      throw rootConflictError(
        'vendor transaction: managed ripgrep identity changed',
        { root: 'ripgrep', reason: 'managed-ripgrep-identity-changed', expected: roots.ripgrep, actual: ripgrep },
      );
    }
  }
}

function verifyRoots(roots, includeCandidate = true) {
  if (!roots.transaction || !roots.liveParent || !roots.live || !roots.old || !roots.ripgrepBound || roots.candidate.length === 0) {
    throw new Error('vendor transaction: root binding set is incomplete');
  }
  verifyBoundRoots(roots, includeCandidate);
}

function collectRootConflicts(roots, includeCandidate = true) {
  const conflicts = [];
  try {
    verifyRoots(roots, includeCandidate);
  } catch (error) {
    conflicts.push(internalRootConflict(error) || { root: 'unknown', reason: 'root-validation-failed', error: String(error) });
  }
  return conflicts;
}

function candidateOwnedRoot(root) {
  return root?.startsWith('candidate vendor component ');
}

function transactionOwnedRoot(root) {
  return root === 'old vendor' || candidateOwnedRoot(root);
}

function assessPreMutationRollback(roots, cause) {
  const conflicts = [];
  let rollbackComplete = true;
  let cleanupAllowed = true;

  const record = (error, fallbackRoot, owned) => {
    const conflict = internalRootConflict(error) || { root: fallbackRoot, reason: 'root-validation-failed', error: String(error) };
    if (!conflicts.some(existing => existing.root === conflict.root && existing.reason === conflict.reason)) conflicts.push(conflict);
    cleanupAllowed = false;
    if (!owned) rollbackComplete = false;
  };
  const verify = (binding, owned = false) => {
    if (!binding) return true;
    try {
      verifyBinding(binding);
      return true;
    } catch (error) {
      record(error, binding.label, owned);
      return false;
    }
  };

  const verifyPass = () => {
    if (!verify(roots.transaction)) return;
    let candidateParentTrusted = true;
    for (const binding of roots.candidate) {
      if (!candidateParentTrusted) break;
      candidateParentTrusted = verify(binding, true);
    }
    verify(roots.old, true);

    const liveParentTrusted = verify(roots.liveParent);
    const liveTrusted = liveParentTrusted && verify(roots.live);
    if (liveTrusted && roots.ripgrepBound) {
      try {
        const actual = status(join(roots.live.path, 'ripgrep'));
        if (!sameIdentity(actual, roots.ripgrep)) {
          throw rootConflictError(
            'vendor transaction: managed ripgrep identity changed',
            { root: 'ripgrep', reason: 'managed-ripgrep-identity-changed', expected: roots.ripgrep, actual },
          );
        }
      } catch (error) {
        record(error, 'ripgrep', false);
      }
    }

    const finalLiveParentTrusted = verify(roots.liveParent);
    if (finalLiveParentTrusted) verify(roots.live);
    verify(roots.transaction);
  };

  if (!roots.transaction) {
    record(new Error('transaction root was not trusted'), 'transaction', false);
  } else {
    verifyPass();
    verifyPass();
  }

  const causeConflict = internalRootConflict(cause);
  if (causeConflict && !conflicts.some(conflict =>
    conflict.root === causeConflict.root && conflict.reason === causeConflict.reason)) {
    conflicts.push(causeConflict);
    cleanupAllowed = false;
    if (!transactionOwnedRoot(causeConflict.root)) rollbackComplete = false;
  }
  if (conflicts.length > 0) writeEvidence(roots, cause, conflicts);
  return { rollbackComplete, cleanupAllowed };
}

function boundEntries(binding, roots, skipRipgrep = false, includeCandidate = true) {
  verifyRoots(roots, includeCandidate);
  if (binding.identity === null) return [];
  const names = readdirSync(binding.path).filter(name => !skipRipgrep || name !== 'ripgrep').sort();
  verifyRoots(roots, includeCandidate);
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
    }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    verifyBinding(roots.transaction);
  } catch {
    // A replaced transaction root is not a safe evidence destination.
  }
}

function transactionCleanupSafe(roots, candidateVendor, oldVendor) {
  let pathShapeSafe = true;
  let cleanupCause;
  try {
    const transaction = roots.transaction;
    verifyBinding(transaction);
    const { rootPath, parts } = strictDescendant(transaction.path, candidateVendor, 'candidate vendor');
    let current = rootPath;
    for (const part of parts) {
      current = join(current, part);
      if (status(current)?.type === 'symlink') {
        pathShapeSafe = false;
        break;
      }
    }
    if (status(oldVendor)?.type === 'symlink') pathShapeSafe = false;
  } catch (error) {
    pathShapeSafe = false;
    cleanupCause = error;
  }
  const assessment = assessPreMutationRollback(
    roots,
    cleanupCause || new Error('vendor transaction: cleanup root validation failed'),
  );
  return {
    rollbackComplete: assessment.rollbackComplete,
    cleanupSafe: pathShapeSafe && assessment.cleanupAllowed,
  };
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
        // dev+ino 在 inode 回收复用（tmpfs/ext4 均可能）下会把替换对象误判为
        // 原对象；mtime 跨平台 rename 不变、对象替换后必然变化，作为身份佐证
        // （ctime 不可用：APFS 的 rename 会更新 ctime，ext4 不会，语义不一致）。
        if (!sameIdentity(liveIdentity, entry.identity)
          || liveIdentity.mtimeMs !== entry.identity.mtimeMs) {
          conflicts.push({ entry: entry.name, reason: 'published-entry-identity-changed', expected: entry.identity, actual: liveIdentity });
          continue;
        }
        renameSync(livePath, join(failed.path, entry.name));
        verifyRollbackRoots();
      } catch (error) {
        conflicts.push(internalRootConflict(error) || { entry: entry.name, reason: 'could-not-isolate-published-entry', error: String(error) });
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
        conflicts.push(internalRootConflict(error) || { entry: entry.name, reason: 'could-not-restore-old-entry', error: String(error) });
        canMutate = false;
        break;
      }
    }
  }

  conflicts.push(...collectRootConflicts(roots));
  if (conflicts.every(conflict => candidateOwnedRoot(conflict.root))) {
    try {
      const expectedNames = [
        ...oldEntries.map(entry => entry.name),
        ...(roots.ripgrep === null ? [] : ['ripgrep']),
      ].toSorted();
      const actualNames = boundEntries(roots.live, roots, false, false).toSorted();
      if (!actualNames.every((name, index) => name === expectedNames[index]) || actualNames.length !== expectedNames.length) {
        conflicts.push({ root: 'live vendor entries', reason: 'live-entry-set-changed', expected: expectedNames, actual: actualNames });
      }
    } catch (error) {
      conflicts.push(internalRootConflict(error) || { root: 'live vendor entries', reason: 'live-entry-validation-failed', error: String(error) });
    }
  }
  const rollbackComplete = conflicts.every(conflict => candidateOwnedRoot(conflict.root));
  if (conflicts.length > 0) writeEvidence(roots, cause, conflicts);
  return rollbackComplete;
}

export function publishVendorTransaction({ liveVendor, candidateVendor, transactionDir, afterPublish }) {
  const oldVendor = join(transactionDir, 'old-vendor');
  const oldEntries = [];
  const published = [];
  let mutationStarted = false;
  const roots = {
    transaction: null,
    liveParent: null,
    live: null,
    candidate: [],
    old: null,
    ripgrep: undefined,
    ripgrepBound: false,
  };

  try {
    roots.transaction = bindDirectory(transactionDir, 'transaction');
    roots.liveParent = bindDirectory(dirname(liveVendor), 'live vendor parent');
    roots.live = bindDirectory(liveVendor, 'live vendor');
    roots.ripgrep = status(join(liveVendor, 'ripgrep'));
    roots.ripgrepBound = true;
    bindDescendant(roots.transaction, candidateVendor, 'candidate vendor', roots.candidate);
    if (status(oldVendor) !== null) throw new Error('vendor transaction: old vendor path must not already exist');
    mkdirSync(oldVendor);
    roots.old = bindDirectory(oldVendor, 'old vendor');

    const candidateRoot = roots.candidate.at(-1);
    if (boundEntries(candidateRoot, roots).includes('ripgrep')) {
      throw new Error('vendor transaction: candidate must not contain managed ripgrep');
    }
    for (const name of boundEntries(roots.live, roots, true)) {
      verifyRoots(roots);
      const entry = moveAndRecord(roots.live.path, roots.old.path, name);
      mutationStarted = true;
      oldEntries.push(entry);
      verifyRoots(roots);
    }
    for (const name of boundEntries(candidateRoot, roots)) {
      verifyRoots(roots);
      const entry = moveAndRecord(candidateRoot.path, roots.live.path, name);
      mutationStarted = true;
      published.push(entry);
      verifyRoots(roots);
      afterPublish?.({ ...entry, path: join(roots.live.path, name), publishedCount: published.length });
      verifyRoots(roots);
    }
    verifyRoots(roots);
  } catch (cause) {
    let rollbackComplete = false;
    let cleanupAllowed = true;
    if (!mutationStarted) {
      const assessment = assessPreMutationRollback(roots, cause);
      rollbackComplete = assessment.rollbackComplete;
      cleanupAllowed = assessment.cleanupAllowed;
    } else {
      rollbackComplete = rollback({ roots, published, oldEntries, cause });
    }
    let cleanupSafe = false;
    if (rollbackComplete && cleanupAllowed) {
      const cleanup = transactionCleanupSafe(roots, candidateVendor, oldVendor);
      rollbackComplete = cleanup.rollbackComplete;
      cleanupSafe = cleanup.cleanupSafe;
    }
    const error = new Error(`vendor transaction: publish failed; rollback ${rollbackComplete ? 'complete' : 'conflicted'}: ${cause instanceof Error ? cause.message : String(cause)}`);
    error.cause = cause;
    error.rollbackComplete = rollbackComplete;
    error.cleanupSafe = cleanupSafe;
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
