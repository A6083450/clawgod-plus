#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repatcherSource = readFileSync(new URL('../src/generic/runtime/repatcher.mjs', import.meta.url), 'utf8');
const vendorTransactionSource = readFileSync(new URL('../src/generic/runtime/vendor-transaction.mjs', import.meta.url), 'utf8');
const fixtureRoot = mkdtempSync(join(tmpdir(), `clawgod repatch "quoted" 'selection' `));
assert.equal(realpathSync(dirname(fixtureRoot)), realpathSync(tmpdir()), 'repatch fixture must be created directly under the system temporary directory');

try {
  const installedRoot = realpathSync(fixtureRoot);
  const fixtureHome = join(fixtureRoot, 'home');
  const fixtureBin = join(fixtureRoot, 'bin');
  const native = join(fixtureRoot, '2.1.226');
  const repatcher = join(fixtureRoot, 'repatch.mjs');
  const target = join(fixtureRoot, 'cli.original.cjs');
  const sourceVersion = join(fixtureRoot, '.source-version');
  const vendor = join(fixtureRoot, 'vendor');
  const oldNative = join(vendor, 'native-addon', 'arm64-darwin', 'native-addon.node');
  const oldOnly = join(vendor, 'old-only', 'nested', 'data.bin');
  const oldLink = join(vendor, 'old-link');
  const candidateNative = join(vendor, 'candidate-addon', 'arm64-darwin', 'candidate-addon.node');
  const ripgrep = join(vendor, 'ripgrep', 'bin', 'rg');
  const externalReplacement = join(vendor, 'external-replacement', 'data.bin');
  const enhancementsFile = join(installedRoot, 'enhancements.json');
  const patchArgs = join(fixtureRoot, 'patch-args.json');
  const savedConfig = '{\n  "schemaVersion": 1,\n  "mode": "custom",\n  "enabled": [\n    "agents"\n  ]\n}\n';
  const priorRuntime = 'prior installed runtime\n';
  const candidateRuntime = 'candidate runtime\n';
  const oldNativeBytes = Buffer.from([0x00, 0x11, 0x80, 0xff]);
  const oldOnlyBytes = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
  const candidateNativeBytes = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);
  const ripgrepBytes = Buffer.from([0x72, 0x67, 0x00, 0xff]);

  mkdirSync(fixtureHome);
  mkdirSync(fixtureBin);
  assert.equal(realpathSync(dirname(fixtureHome)), realpathSync(fixtureRoot), 'repatch HOME must stay under the fixture root');
  assert.equal(realpathSync(dirname(fixtureBin)), realpathSync(fixtureRoot), 'repatch PATH must stay under the fixture root');
  writeFileSync(native, 'fixture native', 'utf8');
  writeFileSync(repatcher, repatcherSource, 'utf8');
  writeFileSync(join(fixtureRoot, 'vendor-transaction.mjs'), vendorTransactionSource, 'utf8');
  writeFileSync(join(fixtureRoot, 'extract-natives.mjs'), `import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';\nimport { join } from 'node:path';\nconst output = process.argv.at(-1);\nconst native = join(output, 'vendor', 'candidate-addon', 'arm64-darwin', 'candidate-addon.node');\nwriteFileSync(join(output, 'cli.original.js'), 'candidate source');\nif (process.env.CANDIDATE_VENDOR_MISSING !== '1') {\n  mkdirSync(join(output, 'vendor', 'candidate-addon', 'arm64-darwin'), { recursive: true });\n  writeFileSync(native, Buffer.from([0xca, 0xfe, 0xba, 0xbe]));\n  chmodSync(native, 0o751);\n}\n`, 'utf8');
  writeFileSync(join(fixtureRoot, 'post-process.mjs'), `import { writeFileSync } from 'node:fs';\nimport { dirname, join } from 'node:path';\nwriteFileSync(join(dirname(import.meta.path), 'cli.original.cjs'), ${JSON.stringify(candidateRuntime)}, 'utf8');\n`, 'utf8');
  writeFileSync(join(fixtureRoot, 'patch.mjs'), `import { mkdirSync, writeFileSync } from 'node:fs';\nimport { dirname } from 'node:path';\nwriteFileSync(process.env.PATCH_ARGS, JSON.stringify(process.argv.slice(2)), 'utf8');\nif (process.env.PATCH_EXIT !== '0') { mkdirSync(dirname(process.env.EXTERNAL_REPLACEMENT), { recursive: true }); writeFileSync(process.env.EXTERNAL_REPLACEMENT, Buffer.from([0x55, 0xaa])); }\nprocess.exit(Number(process.env.PATCH_EXIT || 0));\n`, 'utf8');
  writeFileSync(target, priorRuntime, 'utf8');
  writeFileSync(sourceVersion, '2.1.225\n', 'utf8');
  writeFileSync(enhancementsFile, savedConfig, { mode: 0o600 });
  mkdirSync(dirname(oldNative), { recursive: true });
  mkdirSync(dirname(oldOnly), { recursive: true });
  mkdirSync(dirname(ripgrep), { recursive: true });
  writeFileSync(oldNative, oldNativeBytes, { mode: 0o640 });
  writeFileSync(oldOnly, oldOnlyBytes, { mode: 0o605 });
  symlinkSync('old-only/nested/data.bin', oldLink);
  writeFileSync(ripgrep, ripgrepBytes, { mode: 0o711 });
  const configBefore = statSync(enhancementsFile);
  const oldNativeBefore = lstatSync(oldNative);
  const ripgrepBefore = lstatSync(ripgrep);

  const run = (patchExit, extraEnv = {}) => spawnSync(process.execPath, [repatcher, native], {
    cwd: fixtureRoot,
    encoding: 'utf8',
    env: {
      HOME: fixtureHome,
      PATH: fixtureBin,
      TMPDIR: fixtureRoot,
      BUN_INSTALL_CACHE_DIR: join(fixtureRoot, 'bun-install-cache'),
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(fixtureRoot, 'bun-transpiler-cache'),
      XDG_CACHE_HOME: join(fixtureRoot, 'xdg-cache'),
      PATCH_ARGS: patchArgs,
      PATCH_EXIT: String(patchExit),
      EXTERNAL_REPLACEMENT: externalReplacement,
      ...extraEnv,
    },
  });

  const failed = run(41);
  assert.notEqual(failed.status, 0, 'repatch must propagate mandatory patch failure');
  assert.deepEqual(JSON.parse(readFileSync(patchArgs, 'utf8')), ['--enhancements-file', enhancementsFile], 'repatch must pass exact saved config argv');
  assert.equal(readFileSync(target, 'utf8'), priorRuntime, 'repatch must restore prior runtime after mandatory patch failure');
  assert.equal(readFileSync(sourceVersion, 'utf8'), '2.1.225\n', 'repatch must preserve prior source marker after mandatory patch failure');
  assert.deepEqual(readFileSync(oldNative), oldNativeBytes, 'failed repatch must preserve prior native bytes');
  assert.equal(statSync(oldNative).mode & 0o7777, 0o640, 'failed repatch must preserve prior native mode');
  assert.deepEqual(readFileSync(oldOnly), oldOnlyBytes, 'failed repatch must preserve nested old-only bytes');
  assert.equal(statSync(oldOnly).mode & 0o7777, 0o605, 'failed repatch must preserve nested old-only mode');
  assert.equal(readlinkSync(oldLink), 'old-only/nested/data.bin', 'failed repatch must preserve prior vendor symlink');
  assert.equal(existsSync(candidateNative), false, 'failed repatch must not publish candidate native modules');
  assert.deepEqual(readFileSync(ripgrep), ripgrepBytes, 'failed repatch must preserve managed ripgrep bytes');
  assert.equal(lstatSync(ripgrep).ino, ripgrepBefore.ino, 'failed repatch must not replace managed ripgrep');
  assert.deepEqual(readFileSync(externalReplacement), Buffer.from([0x55, 0xaa]), 'failed repatch must preserve an unknown live vendor replacement');
  assert.deepEqual(readdirSync(fixtureRoot).filter(name => name.startsWith('.runtime-rollback.')), [], 'failed repatch must remove staged candidate transaction data');

  const preflightFailed = run(0, { CANDIDATE_VENDOR_MISSING: '1' });
  assert.notEqual(preflightFailed.status, 0, 'repatch must propagate vendor preflight failure');
  assert.equal(readFileSync(target, 'utf8'), priorRuntime, 'vendor preflight failure must restore the prior runtime');
  assert.equal(readFileSync(sourceVersion, 'utf8'), '2.1.225\n', 'vendor preflight failure must restore the prior source marker');
  assert.deepEqual(readFileSync(oldNative), oldNativeBytes, 'vendor preflight failure must preserve prior native bytes');
  assert.equal(lstatSync(oldNative).ino, oldNativeBefore.ino, 'vendor preflight failure must preserve prior native identity');
  assert.deepEqual(readFileSync(ripgrep), ripgrepBytes, 'vendor preflight failure must preserve managed ripgrep bytes');
  assert.deepEqual(readdirSync(fixtureRoot).filter(name => name.startsWith('.runtime-rollback.')), [], 'verified vendor preflight rollback must clean transaction data');

  const passed = run(0);
  assert.equal(passed.status, 0, `${passed.stdout}${passed.stderr}`);
  assert.deepEqual(JSON.parse(readFileSync(patchArgs, 'utf8')), ['--enhancements-file', enhancementsFile], 'successful repatch must reuse exact saved config argv');
  assert.equal(readFileSync(target, 'utf8'), candidateRuntime, 'successful repatch must publish candidate runtime');
  assert.equal(readFileSync(sourceVersion, 'utf8'), '2.1.226\n', 'successful repatch must publish candidate source marker');
  assert.deepEqual(readFileSync(candidateNative), candidateNativeBytes, 'successful repatch must publish candidate native bytes');
  assert.equal(statSync(candidateNative).mode & 0o7777, 0o751, 'successful repatch must publish candidate native mode');
  assert.equal(existsSync(oldNative), false, 'successful repatch must remove prior native versions');
  assert.equal(existsSync(oldOnly), false, 'successful repatch must remove old-only vendor trees');
  assert.equal(existsSync(oldLink), false, 'successful repatch must remove old-only vendor symlinks');
  assert.deepEqual(readFileSync(ripgrep), ripgrepBytes, 'successful repatch must preserve managed ripgrep bytes');
  assert.equal(lstatSync(ripgrep).ino, ripgrepBefore.ino, 'successful repatch must not replace managed ripgrep');
  assert.deepEqual(readdirSync(fixtureRoot).filter(name => name.startsWith('.runtime-rollback.')), [], 'successful repatch must remove committed transaction data');
  const configAfter = statSync(enhancementsFile);
  assert.equal(readFileSync(enhancementsFile, 'utf8'), savedConfig, 'repatch must preserve saved config bytes');
  assert.equal(configAfter.mode & 0o7777, configBefore.mode & 0o7777, 'repatch must preserve saved config mode');
  assert.equal(configAfter.ino, configBefore.ino, 'repatch must preserve saved config identity');
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log('patcher repatch enhancement selection checks passed');
