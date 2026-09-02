#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const unix = readFileSync(new URL('../src/template/install.sh', import.meta.url), 'utf8');
const windows = readFileSync(new URL('../src/template/install.ps1', import.meta.url), 'utf8');

const smokeStart = unix.indexOf('warn_bun_canary_guidance() {');
const smokeEnd = unix.indexOf('\ncommit_runtime_transaction() {', smokeStart);
assert.ok(smokeStart >= 0 && smokeEnd > smokeStart, 'install.sh must retain its post-install smoke block');
const unixSmoke = unix.slice(smokeStart, smokeEnd);

const fixtureRoot = mkdtempSync(join(tmpdir(), 'clawgod strict smoke '));
assert.equal(realpathSync(dirname(fixtureRoot)), realpathSync(tmpdir()), 'smoke fixture must be created directly under the system temporary directory');
try {
  const home = join(fixtureRoot, 'home');
  const fixtureBin = join(fixtureRoot, 'fixture-bin');
  const clawDir = join(home, '.clawgod');
  const fakeBun = join(fixtureBin, 'bun');
  const script = join(fixtureRoot, 'smoke.sh');
  const sentinel = join(fixtureRoot, 'launcher-mutated');
  mkdirSync(fixtureBin);
  mkdirSync(clawDir, { recursive: true });
  symlinkSync('/usr/bin/grep', join(fixtureBin, 'grep'));
  writeFileSync(join(clawDir, 'cli.cjs'), 'fixture\n', 'utf8');
  writeFileSync(fakeBun, `#!/bin/sh
if [ "$1" = "--version" ]; then printf '1.3.14\\n'; exit 0; fi
case "$SMOKE_MODE" in
  success) printf '2.1.224\\n'; exit 0 ;;
  generic) printf 'generic load failure\\n' >&2; exit 17 ;;
  panic) printf 'Expected CommonJS module to have a function wrapper\\n' >&2; exit 134 ;;
esac
exit 19
`, 'utf8');
  chmodSync(fakeBun, 0o755);
  writeFileSync(script, `#!/bin/bash
set -e
dim() { :; }
info() { printf 'INFO:%s\\n' "$*"; }
warn() { printf 'WARN:%s\\n' "$*" >&2; }
err() { printf 'ERROR:%s\\n' "$*" >&2; }
${unixSmoke}
verify_runtime
printf 'mutated\\n' > "$LAUNCHER_SENTINEL"
`, 'utf8');
  chmodSync(script, 0o755);

  function runSmoke(mode, bunBin = fakeBun) {
    assert.ok(home.startsWith(fixtureRoot), 'smoke HOME must stay inside the fixture root');
    assert.ok(fixtureBin.startsWith(fixtureRoot), 'smoke PATH must stay inside the fixture root');
    rmSync(sentinel, { force: true });
    return spawnSync('/bin/bash', [script], {
      encoding: 'utf8',
      env: {
        HOME: home,
        PATH: fixtureBin,
        CLAWGOD_DIR: clawDir,
        BUN_BIN: bunBin,
        SMOKE_MODE: mode,
        LAUNCHER_SENTINEL: sentinel,
      },
    });
  }

  const success = runSmoke('success');
  assert.equal(success.status, 0, success.stdout + success.stderr);
  assert.equal(existsSync(sentinel), true, 'successful smoke must continue to launcher mutation');
  assert.match(success.stdout, /Bun loads cli\.original\.cjs/, 'successful smoke must report success');

  const generic = runSmoke('generic');
  assert.equal(generic.status, 17, 'generic smoke failure must preserve its exit status');
  assert.equal(existsSync(sentinel), false, 'generic smoke failure must stop before launcher mutation');
  assert.match(generic.stderr + generic.stdout, /generic load failure/, 'generic smoke failure must render useful output');

  const spawnFailure = runSmoke('success', join(fixtureBin, 'missing-bun'));
  assert.notEqual(spawnFailure.status, 0, 'smoke spawn failure must fail closed');
  assert.equal(existsSync(sentinel), false, 'smoke spawn failure must stop before launcher mutation');

  const panic = runSmoke('panic');
  assert.notEqual(panic.status, 0, 'known Bun panic must fail closed');
  assert.equal(existsSync(sentinel), false, 'known Bun panic must stop before launcher mutation');
  assert.match(panic.stderr + panic.stdout, /bun upgrade --canary/, 'known Bun panic must retain canary guidance');
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

const windowsSmokeStart = windows.indexOf('Write-Dim "Verifying Bun can load patched cli.original.cjs ..."');
const windowsSmokeEnd = windows.indexOf('\n# --- Replace claude command', windowsSmokeStart);
assert.ok(windowsSmokeStart >= 0 && windowsSmokeEnd > windowsSmokeStart, 'install.ps1 must retain its post-install smoke block');
const windowsSmoke = windows.slice(windowsSmokeStart, windowsSmokeEnd);
assert.match(windowsSmoke, /\$sanityStatus\s*=\s*\$LASTEXITCODE/, 'install.ps1 must capture the native smoke exit status');
assert.match(windowsSmoke, /catch\s*\{[\s\S]*\$sanityStatus\s*=\s*1/, 'install.ps1 must map spawn exceptions to failure');
const windowsPanicGuard = windowsSmoke.indexOf('$sanityOut -match "Expected CommonJS module to have a function wrapper"');
const windowsGenericGuard = windowsSmoke.indexOf('$sanityStatus -ne 0');
const windowsSuccess = windowsSmoke.indexOf('Write-OK "Bun loads cli.original.cjs"');
assert.ok(windowsPanicGuard >= 0 && windowsGenericGuard > windowsPanicGuard, 'install.ps1 must keep special panic guidance before its generic status guard');
assert.ok(windowsSuccess > windowsGenericGuard, 'install.ps1 must report smoke success only after requiring exit zero');

console.log('strict post-install smoke status checks passed');
