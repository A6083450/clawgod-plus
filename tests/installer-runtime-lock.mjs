#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderGeneratedPair } from '../build.mjs';

const generated = await renderGeneratedPair();
const unix = generated.find(pair => pair.output === 'dist/unix/install.sh').content;
const windows = generated.find(pair => pair.output === 'dist/win/install.ps1').content;
assert.equal((unix.match(/^CLAWGOD_RUNTIME_GUARD_VERSION=1$/gm) || []).length, 1);
assert.equal((windows.match(/^\$ClawRuntimeGuardVersion = 1\r?$/gm) || []).length, 1);
const firstWrite = unix.indexOf('\ncp "$RUNTIME_STATE_HELPER" "$CLAWGOD_DIR/runtime-state.cjs"');
assert.ok(firstWrite > 0, 'fixture must retain the real installer preflight through its first managed write');
const root = mkdtempSync(join(tmpdir(), 'clawgod-installer-runtime-lock-'));
try {
  const bin = join(root, 'bin');
  mkdirSync(bin);
  symlinkSync(process.execPath, join(bin, 'bun'));
  for (const [name, path] of Object.entries({ cat: '/bin/cat', chmod: '/bin/chmod', cp: '/bin/cp', dirname: '/usr/bin/dirname', grep: '/usr/bin/grep', head: '/usr/bin/head', mkdir: '/bin/mkdir', mktemp: '/usr/bin/mktemp', rm: '/bin/rm', sed: '/usr/bin/sed', sort: '/usr/bin/sort', tr: '/usr/bin/tr' })) {
    symlinkSync(path, join(bin, name));
  }
  for (const [label, args] of [['install', []], ['no-upgrade', ['--no-upgrade']], ['uninstall', ['--uninstall']]]) {
    const home = join(root, label);
    const runtime = join(home, '.clawgod');
    const temp = join(home, 'tmp');
    const stage = join(home, 'next-stage');
    const installer = join(home, 'install.sh');
    mkdirSync(join(runtime, 'chunks'), { recursive: true, mode: 0o700 });
    mkdirSync(temp);
    writeFileSync(join(runtime, 'runtime-state.cjs'), 'prior helper\n');
    writeFileSync(join(runtime, 'chunks', 'lazy.mjs'), 'prior lazy chunk\n');
    // No reader registration: legacy wrappers must be protected by process discovery too.
    writeFileSync(join(runtime, 'cli.cjs'), 'const timer = setInterval(() => {}, 1000); process.stdin.resume(); process.stdin.once("data", () => { clearInterval(timer); process.exit(0); }); console.log("ready");\n');
    writeFileSync(installer, unix.slice(0, firstWrite) + '\nprintf reached > "$NEXT_STAGE"\nRUNTIME_WRITE_RELEASE_SAFE=1\n');
    chmodSync(installer, 0o700);
    const env = { HOME: home, TMPDIR: temp, PATH: bin, NEXT_STAGE: stage };
    const dummy = spawn(process.execPath, [join(runtime, 'cli.cjs')], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    try {
      await once(dummy.stdout, 'data');
      const blocked = spawnSync('/bin/bash', [installer, ...args], { env, cwd: home, encoding: 'utf8', timeout: 30000 });
      assert.notEqual(blocked.status, 0, `${label}: real installer preflight must reject an active legacy cli.cjs`);
      assert.match(blocked.stdout + blocked.stderr, /\/exit|正在使用运行时/, `${label}: rejection must explain how to leave active sessions`);
      assert.equal(dummy.exitCode, null, `${label}: installer must not kill the active runtime`);
      assert.equal(existsSync(stage), false, `${label}: blocked preflight must not reach runtime writes`);
      assert.equal(readFileSync(join(runtime, 'runtime-state.cjs'), 'utf8'), 'prior helper\n', `${label}: preflight cannot overwrite the installed helper`);
      assert.equal(readFileSync(join(runtime, 'chunks', 'lazy.mjs'), 'utf8'), 'prior lazy chunk\n', `${label}: preflight must preserve lazy imports`);
      assert.deepEqual(readdirSync(temp), [], `${label}: failed lock acquisition must clean its temporary helper`);
      const exited = once(dummy, 'exit');
      dummy.stdin.end('exit\n');
      await exited;
      const allowed = spawnSync('/bin/bash', [installer, ...args], { env, cwd: home, encoding: 'utf8', timeout: 30000 });
      assert.equal(allowed.status, 0, `${label}: installer must proceed after /exit: ${allowed.stdout}${allowed.stderr}`);
      assert.equal(existsSync(stage), label !== 'uninstall', `${label}: next stage must be reachable only after active runtime exits`);
      assert.equal(existsSync(join(runtime, '.runtime-write.lock')), false, `${label}: successful preflight rollback/uninstall must release its write lock`);
      assert.deepEqual(readdirSync(temp), [], `${label}: completion must clean its temporary helper`);
    } finally {
      if (dummy.exitCode === null) {
        const exited = once(dummy, 'exit');
        dummy.stdin.end('exit\n');
        await exited;
      }
    }
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

assert.ok(windows.indexOf('Enter-RuntimeWriteLock') < windows.indexOf('if ($Uninstall)'), 'Windows lock helper must be defined before uninstall');
console.log('installer runtime-lock preflight checks passed');
