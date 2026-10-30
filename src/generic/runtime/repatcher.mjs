#!/usr/bin/env bun
// Re-extract + post-process + patch the user's currently-installed native binary.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishVendorTransaction, validateRuntime } from './vendor-transaction.mjs';
import state from './runtime-state.cjs';

const here = dirname(fileURLToPath(import.meta.url));
const nativeBin = process.argv[2];
if (!nativeBin || !existsSync(nativeBin) || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(basename(nativeBin))) {
  console.error('repatch: native binary path must exist and its basename must identify the exact source version');
  process.exit(1);
}
const version = basename(nativeBin);
const runtime = process.execPath;
function run(label, args) {
  const result = spawnSync(runtime, args, { cwd: here, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`repatch: ${label} failed (${result.error?.message || `exit ${result.status}`})`);
}
let transactionDir, runtimeToken;
let safeToUnlock = true;
let vendorPublishAttempted = false;
let snapshotted = false;
const previousToken = process.env.CLAWGOD_RUNTIME_WRITE_TOKEN;
try {
  runtimeToken = state.acquireRuntime(here);
  process.env.CLAWGOD_RUNTIME_WRITE_TOKEN = runtimeToken;
  transactionDir = mkdtempSync(join(here, '.runtime-rollback.'));
  const candidateDir = join(transactionDir, 'candidate');
  const candidateVendor = join(candidateDir, 'vendor');
  state.snapshot(here, transactionDir);
  snapshotted = true;
  let cleanReady = false;
  if (existsSync(join(here, '.source-version')) && readFileSync(join(here, '.source-version'), 'utf8').trim() === version) {
    try { state.restoreClean(here, version); cleanReady = true; } catch {}
  }
  if (!cleanReady) {
    mkdirSync(candidateDir);
    run('extract', [join(here, 'extract-natives.mjs'), nativeBin, candidateDir]);
    const candidatePostProc = join(candidateDir, 'post-process.mjs');
    copyFileSync(join(here, 'post-process.mjs'), candidatePostProc);
    run('post-process', [candidatePostProc, here]);
    rmSync(join(here, 'cli.original.cjs'), { force: true });
    renameSync(join(candidateDir, 'cli.original.cjs'), join(here, 'cli.original.cjs'));
    for (const name of ['chunks', 'assets']) {
      rmSync(join(here, name), { recursive: true, force: true });
      if (existsSync(join(candidateDir, name))) renameSync(join(candidateDir, name), join(here, name));
    }
    state.saveClean(here, version);
  }
  const patchArgs = [join(here, 'patch.mjs'), '--enhancements-file', join(here, 'enhancements.json')];
  if (process.env.CLAWGOD_TOLERATE_STALE === '1' || process.argv.includes('--tolerate-stale')) patchArgs.push('--tolerate-stale');
  run('patcher', patchArgs);
  writeFileSync(join(here, '.source-version'), version + '\n');
  if (!cleanReady) {
    vendorPublishAttempted = true;
    publishVendorTransaction({
      liveVendor: join(here, 'vendor'), candidateVendor, transactionDir,
      validatePublished: () => validateRuntime(runtime, join(here, 'cli.cjs')),
    });
  } else {
    validateRuntime(runtime, join(here, 'cli.cjs'));
  }
  rmSync(transactionDir, { recursive: true, force: true });
  console.log(`[clawgod] re-patched to ${version}`);
} catch (error) {
  const vendorRestored = !vendorPublishAttempted || error?.rollbackComplete === true;
  if (transactionDir && vendorRestored) {
    try {
      if (snapshotted) state.restore(here, transactionDir);
      if (!vendorPublishAttempted || error?.cleanupSafe !== false) rmSync(transactionDir, { recursive: true, force: true });
      else console.error(`repatch: prior CLI restored; untrusted transaction data retained at ${transactionDir}`);
    } catch (rollbackError) {
      safeToUnlock = false;
      console.error(`repatch: runtime rollback failed; recovery data retained at ${transactionDir}: ${rollbackError.message}`);
    }
  } else if (transactionDir) {
    safeToUnlock = false;
    console.error(`repatch: vendor rollback conflict; prior CLI was not restored; recovery data retained at ${transactionDir}`);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (runtimeToken && safeToUnlock) state.releaseRuntime(here, runtimeToken);
  if (previousToken === undefined) delete process.env.CLAWGOD_RUNTIME_WRITE_TOKEN;
  else process.env.CLAWGOD_RUNTIME_WRITE_TOKEN = previousToken;
}
