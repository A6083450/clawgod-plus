#!/usr/bin/env bun
// Re-extract + post-process + patch the user's currently-installed
// native Claude binary. Invoked by cli.cjs when it detects that
// .source-version no longer matches the latest binary in versions/.
import { spawnSync } from 'child_process';
import { chmodSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
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

try {
  const vendorDir = join(here, 'vendor');
  if (existsSync(vendorDir)) {
    for (const entry of readdirSync(vendorDir)) {
      if (entry !== 'ripgrep') rmSync(join(vendorDir, entry), { recursive: true, force: true });
    }
  }
  rmSync(join(here, 'cli.original.js'), { force: true });

  run('extract', [extractor, nativeBin, here]);
  run('post-process', [postProc]);
  run('patcher', [patcher, '--enhancements-file', enhancementsFile]);

  writeFileSync(sourceVersion, basename(nativeBin) + '\n');
  console.log(`[clawgod] re-patched to ${basename(nativeBin)}`);
} catch (error) {
  restoreFile(target, targetSnapshot);
  restoreFile(sourceVersion, sourceVersionSnapshot);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
