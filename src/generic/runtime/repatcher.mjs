#!/usr/bin/env bun
// Re-extract + post-process + patch the user's currently-installed
// native Claude binary. Invoked by cli.cjs when it detects that
// .source-version no longer matches the latest binary in versions/.
import { spawnSync } from 'child_process';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const nativeBin = process.argv[2];

if (!nativeBin || !existsSync(nativeBin)) {
  console.error('repatch: native binary path required and must exist');
  process.exit(1);
}

const runtime = process.execPath;

function run(label, args) {
  const r = spawnSync(runtime, args, { cwd: here, stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(`repatch: ${label} failed (exit ${r.status})`);
  }
}

function snapshotFile(path) {
  if (!existsSync(path)) return null;
  const status = statSync(path);
  return { bytes: readFileSync(path), mode: status.mode & 0o7777 };
}

function restoreFile(path, snapshot) {
  if (snapshot === null) {
    rmSync(path, { force: true });
    return;
  }
  writeFileSync(path, snapshot.bytes);
  chmodSync(path, snapshot.mode);
}

const extractor = join(here, 'extract-natives.mjs');
const postProc = join(here, 'post-process.mjs');
const patcher = join(here, 'patch.mjs');
const target = join(here, 'cli.original.cjs');
const sourceVersion = join(here, '.source-version');
const enhancementsFile = join(here, 'enhancements.json');
const targetSnapshot = snapshotFile(target);
const sourceVersionSnapshot = snapshotFile(sourceVersion);
const transactionDir = mkdtempSync(join(here, '.runtime-rollback.'));
const candidateDir = join(transactionDir, 'candidate');
const candidateVendor = join(candidateDir, 'vendor');
const oldVendor = join(transactionDir, 'old-vendor');
const vendorDir = join(here, 'vendor');
const publishedVendor = [];

function vendorEntries(path, skipRipgrep = false) {
  if (!existsSync(path)) return [];
  return readdirSync(path).filter(entry => !skipRipgrep || entry !== 'ripgrep');
}

function publishCandidateVendor() {
  mkdirSync(vendorDir, { recursive: true });
  mkdirSync(oldVendor);
  for (const entry of vendorEntries(vendorDir, true)) {
    renameSync(join(vendorDir, entry), join(oldVendor, entry));
  }
  for (const entry of vendorEntries(candidateVendor)) {
    const destination = join(vendorDir, entry);
    renameSync(join(candidateVendor, entry), destination);
    const status = lstatSync(destination);
    publishedVendor.push({ entry, dev: status.dev, ino: status.ino });
  }
}

function rollbackPublishedVendor() {
  let conflict = false;
  for (const published of publishedVendor.reverse()) {
    const path = join(vendorDir, published.entry);
    if (!existsSync(path)) continue;
    const status = lstatSync(path);
    if (status.dev !== published.dev || status.ino !== published.ino) {
      conflict = true;
      continue;
    }
    rmSync(path, { recursive: true, force: true });
  }
  for (const entry of vendorEntries(oldVendor)) {
    const destination = join(vendorDir, entry);
    if (existsSync(destination)) {
      conflict = true;
      continue;
    }
    renameSync(join(oldVendor, entry), destination);
  }
  return !conflict;
}

try {
  mkdirSync(candidateDir);
  rmSync(join(here, 'cli.original.js'), { force: true });

  run('extract', [extractor, nativeBin, candidateDir]);
  const candidatePostProc = join(candidateDir, 'post-process.mjs');
  copyFileSync(postProc, candidatePostProc);
  run('post-process', [candidatePostProc]);
  rmSync(target, { force: true });
  renameSync(join(candidateDir, 'cli.original.cjs'), target);
  run('patcher', [patcher, '--enhancements-file', enhancementsFile]);

  publishCandidateVendor();
  writeFileSync(sourceVersion, basename(nativeBin) + '\n');
  rmSync(transactionDir, { recursive: true, force: true });
  console.log(`[clawgod] re-patched to ${basename(nativeBin)}`);
} catch (error) {
  restoreFile(target, targetSnapshot);
  restoreFile(sourceVersion, sourceVersionSnapshot);
  const vendorRestored = rollbackPublishedVendor();
  if (vendorRestored) rmSync(transactionDir, { recursive: true, force: true });
  else console.error(`repatch: vendor rollback conflict; recovery data retained at ${transactionDir}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
