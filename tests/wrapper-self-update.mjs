#!/usr/bin/env bun
import assert from 'node:assert/strict';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const wrapperSource = new URL('../src/generic/runtime/wrapper.cjs', import.meta.url);
const fallbackSource = new URL('../src/generic/runtime/patch-fallback.cjs', import.meta.url);

function makeExecutable(path, source) {
  writeFileSync(path, `#!${process.execPath}\n${source}`, 'utf8');
  chmodSync(path, 0o700);
}

function run(args, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'clawgod-wrapper-self-update-'));
  const home = join(root, 'home with spaces');
  const clawgod = join(home, '.clawgod');
  const ripgrepBin = join(clawgod, 'vendor', 'ripgrep', 'bin');
  const bin = join(root, 'bin');
  const updaterCapture = join(root, 'updater.json');
  const upstreamCapture = join(root, 'upstream.json');
  try {
    mkdirSync(ripgrepBin, { recursive: true });
    mkdirSync(bin, { recursive: true });
    copyFileSync(wrapperSource, join(clawgod, 'cli.cjs'));
    if (existsSync(fallbackSource)) copyFileSync(fallbackSource, join(clawgod, 'patch-fallback.cjs'));

    writeFileSync(join(clawgod, 'self-update.cjs'), `
const { writeFileSync } = require('node:fs');
module.exports = {
  runSelfUpdate(argv) {
    writeFileSync(process.env.UPDATER_CAPTURE, JSON.stringify(argv));
    return ${JSON.stringify(options.updaterOutcome ?? { status: 23, signal: null })};
  },
  exitWithOutcome(outcome) {
    if (outcome.signal) process.kill(process.pid, outcome.signal);
    process.exit(outcome.status);
  },
};
`, 'utf8');
    writeFileSync(join(clawgod, 'cli.original.cjs'), `
const { writeFileSync } = require('node:fs');
const path = process.env.UPSTREAM_CAPTURE;
let count = 0;
try { count = Number(JSON.parse(require('node:fs').readFileSync(path, 'utf8')).count); } catch {}
writeFileSync(path, JSON.stringify({ count: count + 1 }));
`, 'utf8');
    makeExecutable(join(bin, 'bun'), 'process.exit(0);');

    if (options.fallbackState !== undefined) {
      writeFileSync(join(clawgod, 'patch-fallback.json'), options.fallbackState, 'utf8');
    }

    const child = spawnSync(process.execPath, [join(clawgod, 'cli.cjs'), ...args], {
      cwd: root,
      encoding: 'utf8',
      env: {
        HOME: home,
        PATH: bin,
        UPDATER_CAPTURE: updaterCapture,
        UPSTREAM_CAPTURE: upstreamCapture,
        CLAWGOD_INTERNAL_RIPGREP_PATH_READY: ripgrepBin,
      },
    });
    return {
      updaterArgs: existsSync(updaterCapture) ? JSON.parse(readFileSync(updaterCapture, 'utf8')) : null,
      upstreamLoads: existsSync(upstreamCapture) ? JSON.parse(readFileSync(upstreamCapture, 'utf8')).count : 0,
      providerCreated: existsSync(join(clawgod, 'provider.json')),
      status: child.status,
      signal: child.signal,
      stderr: child.stderr,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

assert.deepEqual(
  run(['update', '--version', '2.1.258']).updaterArgs,
  ['update', '--version', '2.1.258'],
  'the top-level update command must delegate its complete argument vector to self-update',
);
assert.deepEqual(run(['upgrade']).updaterArgs, ['upgrade'], 'the top-level upgrade alias must delegate to self-update');
for (const args of [
  ['-p', 'please run update'],
  ['--version', 'update'],
]) {
  const result = run(args);
  assert.equal(result.upstreamLoads, 1, `${args.join(' ')} must remain an upstream invocation`);
  assert.equal(result.updaterArgs, null, `${args.join(' ')} must not invoke self-update`);
}

{
  const result = run(['update', '--version', '2.1.258'], { updaterOutcome: { status: 29, signal: null } });
  assert.equal(result.status, 29, 'the wrapper must preserve a self-update exit status through exitWithOutcome');
  assert.equal(result.providerCreated, false, 'the update path must not initialize provider state');
  assert.equal(result.upstreamLoads, 0, 'the update path must not load upstream Claude Code');
}
{
  const result = run(['upgrade'], { updaterOutcome: { status: 1, signal: 'SIGTERM' } });
  assert.equal(result.signal, 'SIGTERM', 'the wrapper must preserve a self-update signal through exitWithOutcome');
  assert.equal(result.providerCreated, false, 'a signaled update path must not initialize provider state');
  assert.equal(result.upstreamLoads, 0, 'a signaled update path must not load upstream Claude Code');
}

const validFallback = JSON.stringify({
  schemaVersion: 1,
  sourceVersion: '2.1.258',
  clawgodVersion: '2026.9.2-claude.2.1.258',
  reason: 'bundle-patch-compatibility',
}, null, 2) + '\n';
const warning = "[clawgod] Running Claude Code 2.1.258 without bundle enhancements because patch compatibility failed.\n[clawgod] Run 'claude update' to retry after a ClawGod update.\n";
{
  const result = run(['--version'], { fallbackState: validFallback });
  assert.equal(result.upstreamLoads, 1, 'a valid fallback state must not prevent normal upstream execution');
  assert.ok(result.stderr.includes(warning), 'a valid fallback state must print the exact recovery warning before normal execution');
}
{
  const result = run(['update'], { fallbackState: validFallback });
  assert.equal(result.stderr.includes(warning), false, 'the intercepted update path must not print a duplicate fallback warning');
}
for (const fallbackState of [
  '{ not JSON }\n',
  JSON.stringify({ schemaVersion: 99 }) + '\n',
]) {
  const result = run(['--version'], { fallbackState });
  assert.equal(result.upstreamLoads, 1, 'invalid fallback state must not block normal upstream execution');
  assert.equal(result.stderr.includes(warning), false, 'invalid fallback state must not produce a recovery warning');
}

console.log('wrapper self-update checks passed');
