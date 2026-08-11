#!/usr/bin/env bun
import { existsSync, lstatSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export const VENDOR_ROLLBACK_COMPLETE = '.vendor-rollback-complete';
const CONFLICT_EVIDENCE = 'vendor-rollback-conflict.json';

function status(path) {
  try {
    const value = lstatSync(path);
    return { dev: value.dev, ino: value.ino, type: value.isDirectory() ? 'directory' : value.isSymbolicLink() ? 'symlink' : 'file' };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function sameIdentity(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino && left?.type === right?.type;
}

function entries(path, skipRipgrep = false) {
  if (!existsSync(path)) return [];
  return readdirSync(path).filter(name => !skipRipgrep || name !== 'ripgrep').sort();
}

function moveAndRecord(source, destination, name) {
  const identity = status(join(source, name));
  renameSync(join(source, name), join(destination, name));
  return { name, identity };
}

function rollback({ liveVendor, transactionDir, oldVendor, published, oldEntries, ripgrepIdentity, cause }) {
  const failedVendor = join(transactionDir, 'failed-vendor');
  const conflicts = [];
  mkdirSync(failedVendor, { recursive: true });

  for (const entry of published.toReversed()) {
    const livePath = join(liveVendor, entry.name);
    const liveIdentity = status(livePath);
    if (liveIdentity === null) continue;
    if (!sameIdentity(liveIdentity, entry.identity)) {
      conflicts.push({ entry: entry.name, reason: 'published-entry-identity-changed', expected: entry.identity, actual: liveIdentity });
      continue;
    }
    try {
      renameSync(livePath, join(failedVendor, entry.name));
    } catch (error) {
      conflicts.push({ entry: entry.name, reason: 'could-not-isolate-published-entry', error: String(error) });
    }
  }

  for (const entry of oldEntries) {
    const source = join(oldVendor, entry.name);
    const destination = join(liveVendor, entry.name);
    if (status(source) === null) {
      if (!sameIdentity(status(destination), entry.identity)) {
        conflicts.push({ entry: entry.name, reason: 'old-entry-not-restored' });
      }
      continue;
    }
    if (status(destination) !== null) {
      conflicts.push({ entry: entry.name, reason: 'old-entry-destination-occupied', actual: status(destination) });
      continue;
    }
    try {
      renameSync(source, destination);
      if (!sameIdentity(status(destination), entry.identity)) {
        conflicts.push({ entry: entry.name, reason: 'old-entry-identity-changed' });
      }
    } catch (error) {
      conflicts.push({ entry: entry.name, reason: 'could-not-restore-old-entry', error: String(error) });
    }
  }

  const currentRipgrep = status(join(liveVendor, 'ripgrep'));
  if (!sameIdentity(currentRipgrep, ripgrepIdentity)) {
    conflicts.push({ entry: 'ripgrep', reason: 'managed-ripgrep-identity-changed', expected: ripgrepIdentity, actual: currentRipgrep });
  }

  if (conflicts.length === 0) {
    writeFileSync(join(transactionDir, VENDOR_ROLLBACK_COMPLETE), 'complete\n');
    return true;
  }
  writeFileSync(join(transactionDir, CONFLICT_EVIDENCE), JSON.stringify({
    cause: cause instanceof Error ? cause.message : String(cause),
    conflicts,
  }, null, 2) + '\n');
  return false;
}

export function publishVendorTransaction({ liveVendor, candidateVendor, transactionDir, afterPublish }) {
  const oldVendor = join(transactionDir, 'old-vendor');
  const oldEntries = [];
  const published = [];
  mkdirSync(liveVendor, { recursive: true });
  mkdirSync(oldVendor, { recursive: true });
  const ripgrepIdentity = status(join(liveVendor, 'ripgrep'));

  try {
    if (entries(candidateVendor).includes('ripgrep')) {
      throw new Error('vendor transaction: candidate must not contain managed ripgrep');
    }
    for (const name of entries(liveVendor, true)) {
      oldEntries.push(moveAndRecord(liveVendor, oldVendor, name));
    }
    for (const name of entries(candidateVendor)) {
      const entry = moveAndRecord(candidateVendor, liveVendor, name);
      published.push(entry);
      afterPublish?.({ ...entry, path: join(liveVendor, name), publishedCount: published.length });
    }
  } catch (cause) {
    const rollbackComplete = rollback({ liveVendor, transactionDir, oldVendor, published, oldEntries, ripgrepIdentity, cause });
    const error = new Error(`vendor transaction: publish failed; rollback ${rollbackComplete ? 'complete' : 'conflicted'}: ${cause instanceof Error ? cause.message : String(cause)}`);
    error.cause = cause;
    error.rollbackComplete = rollbackComplete;
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
    process.exit(1);
  }
}
