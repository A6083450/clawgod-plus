#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const modulePath = fileURLToPath(new URL('../src/generic/runtime/patch-fallback.cjs', import.meta.url));
const {
  PATCH_FALLBACK_FILENAME,
  clearPatchFallback,
  readPatchFallback,
  validatePatchFallback,
  writePatchFallback,
} = require(modulePath);

const valid = {
  schemaVersion: 1,
  sourceVersion: '2.1.258',
  clawgodVersion: '2026.9.2-claude.2.1.258',
  reason: 'bundle-patch-compatibility',
};

assert.equal(PATCH_FALLBACK_FILENAME, 'patch-fallback.json', 'the state file must use the managed fallback filename');
assert.equal(validatePatchFallback(valid), true, 'the documented fallback state must validate');
assert.equal(
  validatePatchFallback({ ...valid, sourceVersion: '2.1.258.1', clawgodVersion: '2026.9.2-claude.2.1.258.1' }),
  true,
  'the documented version grammar must retain its optional fourth source segment',
);

for (const [label, value] of [
  ['unknown key', { ...valid, unexpected: true }],
  ['wrong schema version', { ...valid, schemaVersion: 2 }],
  ['string schema version', { ...valid, schemaVersion: '1' }],
  ['wrong reason', { ...valid, reason: 'other' }],
  ['non-string source version', { ...valid, sourceVersion: 2 }],
  ['non-string clawgod version', { ...valid, clawgodVersion: {} }],
  ['source newline', { ...valid, sourceVersion: '2.1.258\n' }],
  ['clawgod newline', { ...valid, clawgodVersion: '2026.9.2-claude.2.1.258\n' }],
  ['path-like source version', { ...valid, sourceVersion: '../2.1.258' }],
  ['slash source version', { ...valid, sourceVersion: '2.1/258' }],
  ['path-like clawgod version', { ...valid, clawgodVersion: '2026.9.2-claude../2.1.258' }],
  ['slash clawgod version', { ...valid, clawgodVersion: '2026.9.2/claude.2.1.258' }],
  ['too many source segments', { ...valid, sourceVersion: '2.1.258.1.2' }],
  ['too many clawgod source segments', { ...valid, clawgodVersion: '2026.9.2-claude.2.1.258.1.2' }],
]) {
  assert.equal(validatePatchFallback(value), false, `${label} must not be accepted as fallback state`);
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'clawgod-patch-fallback-'));
const clawgodDir = join(fixtureRoot, '.clawgod');
const statePath = join(clawgodDir, PATCH_FALLBACK_FILENAME);
try {
  mkdirSync(clawgodDir, { recursive: true });

  assert.equal(readPatchFallback(clawgodDir), null, 'a missing fallback state must read as null');
  assert.deepEqual(writePatchFallback(clawgodDir, valid), valid, 'writing must return the validated canonical state');
  assert.equal(
    readFileSync(statePath, 'utf8'),
    JSON.stringify(valid, null, 2) + '\n',
    'writing must preserve the canonical pretty-printed state bytes',
  );
  if (process.platform !== 'win32') {
    assert.equal(statSync(statePath).mode & 0o777, 0o600, 'state files must be private on POSIX');
  }
  assert.deepEqual(
    readdirSync(clawgodDir).filter(name => /^\.patch-fallback\..+\.tmp$/.test(name)),
    [],
    'a completed write must not leave a temporary state file',
  );

  const firstIdentity = statSync(statePath).ino;
  const replacement = { ...valid, sourceVersion: '2.1.259', clawgodVersion: '2026.9.2-claude.2.1.259' };
  assert.deepEqual(writePatchFallback(clawgodDir, replacement), replacement, 'a replacement write must return its new state');
  assert.notEqual(statSync(statePath).ino, firstIdentity, 'overwriting state must atomically replace it by rename');
  assert.deepEqual(readPatchFallback(clawgodDir), replacement, 'reading must return a complete valid replacement state');

  clearPatchFallback(clawgodDir);
  assert.equal(existsSync(statePath), false, 'clear must remove the managed state file');
  clearPatchFallback(clawgodDir);
  assert.equal(existsSync(statePath), false, 'clear must be idempotent when state is already absent');

  writeFileSync(statePath, '{ this is not JSON }\n');
  assert.equal(readPatchFallback(clawgodDir), null, 'corrupt JSON must read as null rather than throwing');
  writeFileSync(statePath, JSON.stringify({ ...valid, unknown: true }) + '\n');
  assert.equal(readPatchFallback(clawgodDir), null, 'unknown-schema JSON must read as null rather than being trusted');

  const cliWrite = spawnSync(process.execPath, [modulePath, 'write', clawgodDir, valid.sourceVersion, valid.clawgodVersion], { encoding: 'utf8' });
  assert.equal(cliWrite.status, 0, `the write CLI must succeed for valid arguments: ${cliWrite.stderr}`);
  assert.deepEqual(readPatchFallback(clawgodDir), valid, 'the write CLI must produce the same canonical state');

  const cliClear = spawnSync(process.execPath, [modulePath, 'clear', clawgodDir], { encoding: 'utf8' });
  assert.equal(cliClear.status, 0, `the clear CLI must succeed: ${cliClear.stderr}`);
  assert.equal(existsSync(statePath), false, 'the clear CLI must remove fallback state');

  for (const [label, args] of [
    ['missing action', []],
    ['missing write argument', ['write', clawgodDir, valid.sourceVersion]],
    ['unexpected clear argument', ['clear', clawgodDir, 'extra']],
    ['unknown action', ['remove', clawgodDir]],
  ]) {
    const result = spawnSync(process.execPath, [modulePath, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2, `${label} must use the CLI usage exit status`);
  }

  const invalidWrite = spawnSync(process.execPath, [modulePath, 'write', clawgodDir, '../2.1.258', valid.clawgodVersion], { encoding: 'utf8' });
  assert.notEqual(invalidWrite.status, 0, 'invalid state data must fail the write CLI');
  assert.notEqual(invalidWrite.status, 42, 'invalid state data must never use patch-failure exit code 42');

  const notDirectory = join(fixtureRoot, 'not-a-directory');
  writeFileSync(notDirectory, 'fixture');
  const blockingDirectory = join(fixtureRoot, 'blocking-directory');
  mkdirSync(join(blockingDirectory, PATCH_FALLBACK_FILENAME), { recursive: true });
  for (const [label, args] of [
    ['write failure', ['write', notDirectory, valid.sourceVersion, valid.clawgodVersion]],
    ['clear failure', ['clear', blockingDirectory]],
  ]) {
    const result = spawnSync(process.execPath, [modulePath, ...args], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, `${label} must return a nonzero status`);
    assert.notEqual(result.status, 42, `${label} must never use patch-failure exit code 42`);
  }
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log('patch fallback state checks passed');
