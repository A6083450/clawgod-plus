#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repatcherSource = readFileSync(new URL('../src/generic/runtime/repatcher.mjs', import.meta.url), 'utf8');
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
  const enhancementsFile = join(installedRoot, 'enhancements.json');
  const patchArgs = join(fixtureRoot, 'patch-args.json');
  const savedConfig = '{\n  "schemaVersion": 1,\n  "mode": "custom",\n  "enabled": [\n    "agents"\n  ]\n}\n';
  const priorRuntime = 'prior installed runtime\n';
  const candidateRuntime = 'candidate runtime\n';

  mkdirSync(fixtureHome);
  mkdirSync(fixtureBin);
  assert.equal(realpathSync(dirname(fixtureHome)), realpathSync(fixtureRoot), 'repatch HOME must stay under the fixture root');
  assert.equal(realpathSync(dirname(fixtureBin)), realpathSync(fixtureRoot), 'repatch PATH must stay under the fixture root');
  writeFileSync(native, 'fixture native', 'utf8');
  writeFileSync(repatcher, repatcherSource, 'utf8');
  writeFileSync(join(fixtureRoot, 'extract-natives.mjs'), 'process.exit(0);\n', 'utf8');
  writeFileSync(join(fixtureRoot, 'post-process.mjs'), `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(target)}, ${JSON.stringify(candidateRuntime)}, 'utf8');\n`, 'utf8');
  writeFileSync(join(fixtureRoot, 'patch.mjs'), `import { writeFileSync } from 'node:fs';\nwriteFileSync(process.env.PATCH_ARGS, JSON.stringify(process.argv.slice(2)), 'utf8');\nprocess.exit(Number(process.env.PATCH_EXIT || 0));\n`, 'utf8');
  writeFileSync(target, priorRuntime, 'utf8');
  writeFileSync(sourceVersion, '2.1.225\n', 'utf8');
  writeFileSync(enhancementsFile, savedConfig, { mode: 0o600 });
  const configBefore = statSync(enhancementsFile);

  const run = patchExit => spawnSync(process.execPath, [repatcher, native], {
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
    },
  });

  const failed = run(41);
  assert.notEqual(failed.status, 0, 'repatch must propagate mandatory patch failure');
  assert.deepEqual(JSON.parse(readFileSync(patchArgs, 'utf8')), ['--enhancements-file', enhancementsFile], 'repatch must pass exact saved config argv');
  assert.equal(readFileSync(target, 'utf8'), priorRuntime, 'repatch must restore prior runtime after mandatory patch failure');
  assert.equal(readFileSync(sourceVersion, 'utf8'), '2.1.225\n', 'repatch must preserve prior source marker after mandatory patch failure');

  const passed = run(0);
  assert.equal(passed.status, 0, `${passed.stdout}${passed.stderr}`);
  assert.deepEqual(JSON.parse(readFileSync(patchArgs, 'utf8')), ['--enhancements-file', enhancementsFile], 'successful repatch must reuse exact saved config argv');
  assert.equal(readFileSync(target, 'utf8'), candidateRuntime, 'successful repatch must publish candidate runtime');
  assert.equal(readFileSync(sourceVersion, 'utf8'), '2.1.226\n', 'successful repatch must publish candidate source marker');
  const configAfter = statSync(enhancementsFile);
  assert.equal(readFileSync(enhancementsFile, 'utf8'), savedConfig, 'repatch must preserve saved config bytes');
  assert.equal(configAfter.mode & 0o7777, configBefore.mode & 0o7777, 'repatch must preserve saved config mode');
  assert.equal(configAfter.ino, configBefore.ino, 'repatch must preserve saved config identity');
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log('patcher repatch enhancement selection checks passed');
