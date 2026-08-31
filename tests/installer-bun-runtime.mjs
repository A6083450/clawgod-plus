#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPatcherBundle, renderTemplate } from '../build.mjs';
import { publishVendorTransaction } from '../src/generic/runtime/vendor-transaction.mjs';

const vendorTransactionPath = fileURLToPath(new URL('../src/generic/runtime/vendor-transaction.mjs', import.meta.url));
const unix = readFileSync(new URL('../dist/unix/install.sh', import.meta.url), 'utf8');
const windows = readFileSync(new URL('../dist/win/install.ps1', import.meta.url), 'utf8');
const windowsTemplate = readFileSync(new URL('../src/template/install.ps1', import.meta.url), 'utf8');
const canonicalPlatform = Object.fromEntries(
  ['unix/lifecycle.sh', 'unix/launcher.sh', 'windows/lifecycle.ps1', 'windows/launcher.cmd'].map(name => [
    name,
    readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8'),
  ]),
);
const canonicalRuntime = Object.fromEntries(
  ['proxy-fetch.mjs', 'fetch-file.mjs', 'fetch-package.mjs', 'install-ripgrep.mjs', 'extractor.mjs', 'post-processor.mjs', 'repatcher.mjs', 'vendor-transaction.mjs', 'wrapper.cjs', 'openai-proxy.cjs', 'claude-mem-compat.cjs', 'plugin-dependencies.mjs', 'claude-hud-statusline.mjs'].map(name => [
    name,
    readFileSync(new URL(`../src/generic/runtime/${name}`, import.meta.url), 'utf8'),
  ]),
);
canonicalRuntime['plugin-dependencies.mjs'] = renderTemplate(canonicalRuntime['plugin-dependencies.mjs'], {
  HUD_STATUSLINE_SOURCE_JSON: JSON.stringify(JSON.stringify(canonicalRuntime['claude-hud-statusline.mjs'])).slice(1, -1),
});
canonicalRuntime['patcher.mjs'] = await buildPatcherBundle();

for (const [name, source] of Object.entries(canonicalPlatform)) {
  const generated = name.startsWith('unix/') ? unix : windows;
  assert.ok(generated.includes(source), `${name} must be embedded exactly in its generated installer`);
}

function assertTemporaryPath(path, label) {
  const temporaryRoots = [resolve(tmpdir()), realpathSync(tmpdir())];
  const resolvedPath = resolve(path);
  assert.ok(temporaryRoots.some(root => resolvedPath.startsWith(`${root}/`)), `${label} must stay under the system temporary directory`);
}

function writeVendorRootRacePreload(path) {
  writeFileSync(path, `import { createRequire, syncBuiltinESMExports } from 'node:module';
const require = createRequire(import.meta.url);
const fs = require('node:fs');
const { join } = require('node:path');
const originalLstatSync = fs.lstatSync;
let injected = false;
let cleanupAssessmentTransactionChecks = 0;

fs.lstatSync = function (path, ...args) {
  const pathString = String(path);
  const stack = String(new Error().stack);
  const boundary = process.env.VENDOR_RACE_BOUNDARY;
  const inCleanup = stack.includes('transactionCleanupSafe');
  const inAssessment = stack.includes('assessPreMutationRollback');
  if (boundary === 'cleanup-final-transaction'
    && inCleanup
    && inAssessment
    && pathString === process.env.VENDOR_RACE_TRANSACTION_ROOT) {
    cleanupAssessmentTransactionChecks += 1;
  }
  const shouldInject = (boundary === 'preflight' && pathString === process.env.VENDOR_RACE_OLD_ROOT)
    || (boundary === 'cleanup' && inCleanup && pathString === process.env.VENDOR_RACE_OLD_ROOT)
    || (boundary === 'cleanup-final-live' && inCleanup && inAssessment && pathString === process.env.VENDOR_RACE_RIPGREP)
    || (boundary === 'cleanup-final-transaction' && cleanupAssessmentTransactionChecks === 2);
  if (!injected && boundary === 'forged-preflight' && pathString === process.env.VENDOR_RACE_OLD_ROOT) {
    injected = true;
    const error = new Error('fixture preflight failure');
    error.rootConflict = { root: 'live vendor', reason: 'forged-root-conflict' };
    throw error;
  }
  if (!injected && shouldInject) {
    injected = true;
    fs.renameSync(process.env.VENDOR_RACE_TARGET_ROOT, process.env.VENDOR_RACE_DISPLACED_ROOT);
    fs.renameSync(process.env.VENDOR_RACE_REPLACEMENT_ROOT, process.env.VENDOR_RACE_TARGET_ROOT);
    if (process.env.VENDOR_RACE_PRESERVE_RIPGREP === '1') {
      fs.renameSync(
        join(process.env.VENDOR_RACE_DISPLACED_ROOT, 'ripgrep'),
        join(process.env.VENDOR_RACE_TARGET_ROOT, 'ripgrep'),
      );
    }
  }
  return originalLstatSync.call(this, path, ...args);
};

syncBuiltinESMExports();
`, 'utf8');
}

function runVendorRootRace({ root, boundary, replacementTarget = 'live', candidateRipgrep = false, oldRootBlocker = false, preserveRipgrepIdentity = false }) {
  const transaction = join(root, 'transaction');
  const candidate = join(transaction, 'candidate', 'vendor');
  const oldRoot = join(transaction, 'old-vendor');
  const live = join(root, 'runtime', 'vendor');
  const replacement = join(root, 'replacement-vendor');
  const displaced = join(root, 'displaced-vendor');
  const preload = join(root, 'root-race-preload.mjs');
  const liveNative = join(live, 'old-native.node');
  const liveRipgrep = join(live, 'ripgrep');
  const replacementSentinel = join(replacement, 'sentinel.bin');

  mkdirSync(candidate, { recursive: true });
  mkdirSync(live, { recursive: true });
  mkdirSync(replacement);
  if (candidateRipgrep) writeFileSync(join(candidate, 'ripgrep'), Buffer.from([0x63, 0x61, 0x6e, 0x64]));
  if (oldRootBlocker) writeFileSync(oldRoot, 'preflight blocker\n', 'utf8');
  writeFileSync(liveNative, Buffer.from([0x00, 0x11, 0x80, 0xff]), { mode: 0o640 });
  writeFileSync(liveRipgrep, Buffer.from([0x72, 0x67, 0x00, 0xff]), { mode: 0o711 });
  writeFileSync(replacementSentinel, Buffer.from([0x5a, 0x00, 0xa5]), { mode: 0o604 });
  const nativeBefore = lstatSync(liveNative);
  const ripgrepBefore = lstatSync(liveRipgrep);
  const sentinelBefore = lstatSync(replacementSentinel);
  const transactionBefore = lstatSync(transaction);
  const replacementBefore = lstatSync(replacement);
  const targetRoot = replacementTarget === 'old' ? oldRoot : replacementTarget === 'transaction' ? transaction : live;
  writeVendorRootRacePreload(preload);

  const run = spawnSync(process.execPath, [
    '--preload', preload,
    vendorTransactionPath, 'publish', live, candidate, transaction,
  ], {
    cwd: root,
    encoding: 'utf8',
    env: {
      HOME: root,
      TMPDIR: root,
      PATH: dirname(process.execPath),
      VENDOR_RACE_BOUNDARY: boundary,
      VENDOR_RACE_OLD_ROOT: oldRoot,
      VENDOR_RACE_TRANSACTION_ROOT: transaction,
      VENDOR_RACE_RIPGREP: liveRipgrep,
      VENDOR_RACE_TARGET_ROOT: targetRoot,
      VENDOR_RACE_DISPLACED_ROOT: displaced,
      VENDOR_RACE_REPLACEMENT_ROOT: replacement,
      VENDOR_RACE_PRESERVE_RIPGREP: preserveRipgrepIdentity ? '1' : '0',
    },
  });

  return {
    run,
    transaction,
    candidate,
    oldRoot,
    live,
    targetRoot,
    replacementTarget,
    preserveRipgrepIdentity,
    displaced,
    nativeBefore,
    ripgrepBefore,
    sentinelBefore,
    transactionBefore,
    replacementBefore,
  };
}

const vendorTransactionRoot = mkdtempSync(join(tmpdir(), 'clawgod-vendor-transaction-'));
try {
  const missingLiveCase = join(vendorTransactionRoot, 'missing-live');
  const missingLiveTransaction = join(missingLiveCase, 'transaction');
  const missingLiveCandidate = join(missingLiveTransaction, 'candidate', 'vendor');
  const missingLive = join(missingLiveCase, 'runtime', 'vendor');
  mkdirSync(missingLiveCandidate, { recursive: true });
  mkdirSync(dirname(missingLive), { recursive: true });
  let missingLiveError;
  try {
    publishVendorTransaction({ liveVendor: missingLive, candidateVendor: missingLiveCandidate, transactionDir: missingLiveTransaction });
  } catch (error) {
    missingLiveError = error;
  }
  assert.equal(missingLiveError?.rollbackComplete, true, 'missing live root must report verified pre-mutation rollback');
  assert.equal(existsSync(missingLive), false, 'missing live root rejection must not create vendor state');

  const missingCandidateCase = join(vendorTransactionRoot, 'missing-candidate');
  const missingCandidateTransaction = join(missingCandidateCase, 'transaction');
  const missingCandidate = join(missingCandidateTransaction, 'candidate', 'vendor');
  const missingCandidateLive = join(missingCandidateCase, 'runtime', 'vendor');
  mkdirSync(join(missingCandidateTransaction, 'candidate'), { recursive: true });
  mkdirSync(missingCandidateLive, { recursive: true });
  writeFileSync(join(missingCandidateLive, 'ripgrep'), Buffer.from([0x72, 0x67]));
  let missingCandidateError;
  try {
    publishVendorTransaction({ liveVendor: missingCandidateLive, candidateVendor: missingCandidate, transactionDir: missingCandidateTransaction });
  } catch (error) {
    missingCandidateError = error;
  }
  assert.equal(missingCandidateError?.rollbackComplete, true, 'missing candidate root must report verified pre-mutation rollback');
  assert.deepEqual(readdirSync(missingCandidateLive), ['ripgrep'], 'missing candidate rejection must not mutate live vendor');

  const symlinkCase = join(vendorTransactionRoot, 'candidate-symlink');
  const symlinkTransaction = join(symlinkCase, 'transaction');
  const symlinkCandidate = join(symlinkTransaction, 'candidate', 'vendor');
  const symlinkLive = join(symlinkCase, 'runtime', 'vendor');
  const symlinkExternal = join(symlinkCase, 'external');
  const symlinkSentinel = join(symlinkExternal, 'sentinel.bin');
  mkdirSync(join(symlinkTransaction, 'candidate'), { recursive: true });
  mkdirSync(symlinkLive, { recursive: true });
  mkdirSync(symlinkExternal);
  writeFileSync(join(symlinkLive, 'ripgrep'), Buffer.from([0x72, 0x67]));
  writeFileSync(symlinkSentinel, Buffer.from([0x5a, 0x00, 0xa5]), { mode: 0o604 });
  const symlinkSentinelBefore = lstatSync(symlinkSentinel);
  symlinkSync(symlinkExternal, symlinkCandidate);
  let symlinkError;
  try {
    publishVendorTransaction({ liveVendor: symlinkLive, candidateVendor: symlinkCandidate, transactionDir: symlinkTransaction });
  } catch (error) {
    symlinkError = error;
  }
  assert.equal(symlinkError?.rollbackComplete, true, 'candidate symlink rejection must report verified pre-mutation rollback');
  assert.equal(symlinkError?.cleanupSafe, false, 'candidate symlink rejection must retain unsafe transaction data');
  assert.deepEqual(readdirSync(symlinkExternal), ['sentinel.bin'], 'candidate symlink rejection must not mutate the external directory');
  assert.deepEqual(readFileSync(symlinkSentinel), Buffer.from([0x5a, 0x00, 0xa5]), 'candidate symlink rejection must preserve external bytes');
  assert.equal(lstatSync(symlinkSentinel).ino, symlinkSentinelBefore.ino, 'candidate symlink rejection must preserve external identity');
  assert.deepEqual(readdirSync(symlinkLive), ['ripgrep'], 'candidate symlink rejection must not mutate live vendor');

  const raceCase = join(vendorTransactionRoot, 'root-race');
  const raceTransaction = join(raceCase, 'transaction');
  const raceCandidate = join(raceTransaction, 'candidate', 'vendor');
  const raceLive = join(raceCase, 'runtime', 'vendor');
  const raceReplacement = join(raceCase, 'replacement');
  const raceDisplaced = join(raceCase, 'displaced');
  const raceSentinel = join(raceReplacement, 'sentinel.bin');
  mkdirSync(join(raceCandidate, 'a-first'), { recursive: true });
  mkdirSync(join(raceCandidate, 'z-second'), { recursive: true });
  mkdirSync(raceLive, { recursive: true });
  mkdirSync(raceReplacement);
  writeFileSync(join(raceCandidate, 'a-first', 'native.node'), Buffer.from([0x01]));
  writeFileSync(join(raceCandidate, 'z-second', 'native.node'), Buffer.from([0x02]));
  writeFileSync(join(raceLive, 'old-native.node'), Buffer.from([0x03]));
  writeFileSync(join(raceLive, 'ripgrep'), Buffer.from([0x72, 0x67]));
  writeFileSync(raceSentinel, Buffer.from([0x5a, 0x00, 0xa5]), { mode: 0o604 });
  const raceSentinelBefore = lstatSync(raceSentinel);
  let raceError;
  try {
    publishVendorTransaction({
      liveVendor: raceLive,
      candidateVendor: raceCandidate,
      transactionDir: raceTransaction,
      afterPublish: ({ publishedCount }) => {
        if (publishedCount !== 1) return;
        renameSync(raceLive, raceDisplaced);
        renameSync(raceReplacement, raceLive);
      },
    });
  } catch (error) {
    raceError = error;
  }
  assert.equal(raceError?.rollbackComplete, false, 'live root identity replacement must report a rollback conflict');
  assert.deepEqual(readdirSync(raceLive), ['sentinel.bin'], 'root conflict rollback must not mutate the unknown replacement directory');
  assert.deepEqual(readFileSync(join(raceLive, 'sentinel.bin')), Buffer.from([0x5a, 0x00, 0xa5]), 'root conflict rollback must preserve replacement bytes');
  assert.equal(lstatSync(join(raceLive, 'sentinel.bin')).ino, raceSentinelBefore.ino, 'root conflict rollback must preserve replacement identity');
  assert.equal(existsSync(join(raceTransaction, 'vendor-rollback-conflict.json')), true, 'root conflict must retain recovery evidence');

  const preflightRootRace = runVendorRootRace({
    root: join(vendorTransactionRoot, 'pre-mutation-bound-root-race'),
    boundary: 'preflight',
    oldRootBlocker: true,
  });
  const cleanupRootRace = runVendorRootRace({
    root: join(vendorTransactionRoot, 'cleanup-bound-root-race'),
    boundary: 'cleanup',
    replacementTarget: 'old',
    candidateRipgrep: true,
  });
  const cleanupLiveRootRace = runVendorRootRace({
    root: join(vendorTransactionRoot, 'cleanup-live-root-race'),
    boundary: 'cleanup',
    replacementTarget: 'live',
    candidateRipgrep: true,
  });
  const cleanupFinalLiveRootRace = runVendorRootRace({
    root: join(vendorTransactionRoot, 'cleanup-final-live-root-race'),
    boundary: 'cleanup-final-live',
    replacementTarget: 'live',
    candidateRipgrep: true,
    preserveRipgrepIdentity: true,
  });
  const cleanupFinalTransactionRootRace = runVendorRootRace({
    root: join(vendorTransactionRoot, 'cleanup-final-transaction-root-race'),
    boundary: 'cleanup-final-transaction',
    replacementTarget: 'transaction',
    candidateRipgrep: true,
  });
  const forgedRootConflict = runVendorRootRace({
    root: join(vendorTransactionRoot, 'forged-root-conflict'),
    boundary: 'forged-preflight',
    oldRootBlocker: true,
  });
  assert.deepEqual(
    [
      preflightRootRace.run.status,
      cleanupRootRace.run.status,
      cleanupLiveRootRace.run.status,
      cleanupFinalLiveRootRace.run.status,
      cleanupFinalTransactionRootRace.run.status,
      forgedRootConflict.run.status,
    ],
    [21, 22, 21, 21, 21, 20],
    `bound-root races must distinguish live conflicts from retained transaction-owned conflicts and ignore forged metadata:\n${preflightRootRace.run.stderr}${cleanupRootRace.run.stderr}${cleanupLiveRootRace.run.stderr}${cleanupFinalLiveRootRace.run.stderr}${cleanupFinalTransactionRootRace.run.stderr}${forgedRootConflict.run.stderr}`,
  );
  assert.match(forgedRootConflict.run.stderr, /fixture preflight failure/, 'forged-metadata fixture must execute its injected unbranded error');

  const preflightEvidence = join(preflightRootRace.transaction, 'vendor-rollback-conflict.json');
  assert.equal(existsSync(preflightEvidence), true, 'pre-mutation root conflict must retain recovery evidence in the trusted transaction root');
  assert.ok(
    JSON.parse(readFileSync(preflightEvidence, 'utf8')).conflicts.some(conflict => conflict.root === 'live vendor'),
    'pre-mutation recovery evidence must identify the replaced live root',
  );
  for (const [label, fixture] of [
    ['pre-mutation', preflightRootRace],
    ['cleanup-old', cleanupRootRace],
    ['cleanup-live', cleanupLiveRootRace],
    ['cleanup-final-live', cleanupFinalLiveRootRace],
    ['cleanup-final-transaction', cleanupFinalTransactionRootRace],
  ]) {
    const replacementSentinel = join(fixture.targetRoot, 'sentinel.bin');
    const preservedLive = fixture.replacementTarget === 'live' ? fixture.displaced : fixture.live;
    const preservedNative = join(preservedLive, 'old-native.node');
    const preservedRipgrep = fixture.preserveRipgrepIdentity
      ? join(fixture.targetRoot, 'ripgrep')
      : join(preservedLive, 'ripgrep');
    const expectedReplacementEntries = fixture.preserveRipgrepIdentity
      ? ['ripgrep', 'sentinel.bin']
      : ['sentinel.bin'];
    assert.equal(existsSync(fixture.transaction), true, `${label}: unsafe transaction data must be retained`);
    const replacementAfter = lstatSync(fixture.targetRoot);
    assert.equal(replacementAfter.dev, fixture.replacementBefore.dev, `${label}: helper must preserve replacement root device`);
    assert.equal(replacementAfter.ino, fixture.replacementBefore.ino, `${label}: helper must preserve replacement root identity`);
    assert.equal(replacementAfter.isDirectory(), true, `${label}: helper must preserve replacement root type`);
    assert.equal(replacementAfter.mode & 0o7777, fixture.replacementBefore.mode & 0o7777, `${label}: helper must preserve replacement root mode`);
    assert.deepEqual(readdirSync(fixture.targetRoot).toSorted(), expectedReplacementEntries, `${label}: helper must not add files to the unknown replacement root`);
    assert.deepEqual(readFileSync(replacementSentinel), Buffer.from([0x5a, 0x00, 0xa5]), `${label}: replacement sentinel bytes must remain unchanged`);
    assert.equal(lstatSync(replacementSentinel).ino, fixture.sentinelBefore.ino, `${label}: replacement sentinel identity must remain unchanged`);
    assert.equal(lstatSync(replacementSentinel).mode & 0o7777, 0o604, `${label}: replacement sentinel mode must remain unchanged`);
    assert.deepEqual(readFileSync(preservedNative), Buffer.from([0x00, 0x11, 0x80, 0xff]), `${label}: live native bytes must remain unchanged`);
    assert.equal(lstatSync(preservedNative).ino, fixture.nativeBefore.ino, `${label}: live native identity must remain unchanged`);
    assert.deepEqual(readFileSync(preservedRipgrep), Buffer.from([0x72, 0x67, 0x00, 0xff]), `${label}: live ripgrep bytes must remain unchanged`);
    assert.equal(lstatSync(preservedRipgrep).ino, fixture.ripgrepBefore.ino, `${label}: live ripgrep identity must remain unchanged`);
    assert.equal(existsSync(join(fixture.targetRoot, 'vendor-rollback-conflict.json')), false, `${label}: helper must never write evidence into an unknown replacement root`);
  }
  const displacedTransaction = lstatSync(cleanupFinalTransactionRootRace.displaced);
  assert.equal(displacedTransaction.dev, cleanupFinalTransactionRootRace.transactionBefore.dev, 'final transaction replacement must retain the original transaction device');
  assert.equal(displacedTransaction.ino, cleanupFinalTransactionRootRace.transactionBefore.ino, 'final transaction replacement must retain the original transaction identity');
  assert.equal(displacedTransaction.isDirectory(), true, 'final transaction replacement must retain the original transaction type');
  assert.equal(displacedTransaction.mode & 0o7777, cleanupFinalTransactionRootRace.transactionBefore.mode & 0o7777, 'final transaction replacement must retain the original transaction mode');
  assert.deepEqual(
    readFileSync(join(cleanupFinalTransactionRootRace.displaced, 'candidate', 'vendor', 'ripgrep')),
    Buffer.from([0x63, 0x61, 0x6e, 0x64]),
    'final transaction replacement must retain original candidate recovery bytes',
  );
  assert.equal(existsSync(join(forgedRootConflict.transaction, 'vendor-rollback-conflict.json')), false, 'unbranded error metadata must not forge recovery evidence');
  assert.deepEqual(readFileSync(join(forgedRootConflict.live, 'old-native.node')), Buffer.from([0x00, 0x11, 0x80, 0xff]), 'unbranded error metadata must preserve prior native bytes');
  assert.equal(lstatSync(join(forgedRootConflict.live, 'old-native.node')).ino, forgedRootConflict.nativeBefore.ino, 'unbranded error metadata must preserve prior native identity');
  assert.deepEqual(readFileSync(join(forgedRootConflict.live, 'ripgrep')), Buffer.from([0x72, 0x67, 0x00, 0xff]), 'unbranded error metadata must preserve managed ripgrep bytes');
  assert.equal(lstatSync(join(forgedRootConflict.live, 'ripgrep')).ino, forgedRootConflict.ripgrepBefore.ino, 'unbranded error metadata must preserve managed ripgrep identity');

  const evidenceLeafCase = join(vendorTransactionRoot, 'evidence-leaf-symlink');
  const evidenceLeafTransaction = join(evidenceLeafCase, 'transaction');
  const evidenceLeafCandidate = join(evidenceLeafTransaction, 'candidate', 'vendor');
  const evidenceLeafLive = join(evidenceLeafCase, 'runtime', 'vendor');
  const evidenceLeafReplacement = join(evidenceLeafCase, 'replacement-vendor');
  const evidenceLeafDisplaced = join(evidenceLeafCase, 'displaced-vendor');
  const evidenceLeafExternal = join(evidenceLeafCase, 'external-evidence-target.bin');
  const evidenceLeafPath = join(evidenceLeafTransaction, 'vendor-rollback-conflict.json');
  mkdirSync(evidenceLeafCandidate, { recursive: true });
  mkdirSync(evidenceLeafLive, { recursive: true });
  mkdirSync(evidenceLeafReplacement);
  writeFileSync(join(evidenceLeafCandidate, 'candidate.node'), Buffer.from([0xca, 0xfe]));
  writeFileSync(join(evidenceLeafLive, 'old-native.node'), Buffer.from([0x00, 0x11, 0x80, 0xff]), { mode: 0o640 });
  writeFileSync(join(evidenceLeafLive, 'ripgrep'), Buffer.from([0x72, 0x67, 0x00, 0xff]), { mode: 0o711 });
  writeFileSync(join(evidenceLeafReplacement, 'sentinel.bin'), Buffer.from([0x5a, 0x00, 0xa5]), { mode: 0o604 });
  writeFileSync(evidenceLeafExternal, Buffer.from([0xde, 0xad, 0xbe, 0xef]), { mode: 0o600 });
  const evidenceLeafExternalBefore = lstatSync(evidenceLeafExternal);
  symlinkSync(evidenceLeafExternal, evidenceLeafPath);
  let evidenceLeafError;
  try {
    publishVendorTransaction({
      liveVendor: evidenceLeafLive,
      candidateVendor: evidenceLeafCandidate,
      transactionDir: evidenceLeafTransaction,
      afterPublish: () => {
        renameSync(evidenceLeafLive, evidenceLeafDisplaced);
        renameSync(evidenceLeafReplacement, evidenceLeafLive);
      },
    });
  } catch (error) {
    evidenceLeafError = error;
  }
  assert.equal(evidenceLeafError?.rollbackComplete, false, 'evidence leaf fixture must retain the live-root rollback conflict');
  assert.deepEqual(readFileSync(evidenceLeafExternal), Buffer.from([0xde, 0xad, 0xbe, 0xef]), 'conflict evidence must not follow a pre-existing symlink leaf');
  assert.equal(lstatSync(evidenceLeafExternal).ino, evidenceLeafExternalBefore.ino, 'conflict evidence must preserve external target identity');
  assert.equal(lstatSync(evidenceLeafExternal).mode & 0o7777, 0o600, 'conflict evidence must preserve external target mode');
  assert.equal(lstatSync(evidenceLeafPath).isSymbolicLink(), true, 'conflict evidence must preserve a pre-existing symlink leaf');
  assert.equal(readlinkSync(evidenceLeafPath), evidenceLeafExternal, 'conflict evidence must not replace a pre-existing symlink leaf');

  const candidateRootCase = join(vendorTransactionRoot, 'candidate-root-conflict');
  const candidateRootTransaction = join(candidateRootCase, 'transaction');
  const candidateRoot = join(candidateRootTransaction, 'candidate', 'vendor');
  const candidateRootDisplaced = join(candidateRootCase, 'displaced-candidate');
  const candidateRootReplacement = join(candidateRootCase, 'replacement-candidate');
  const candidateRootLive = join(candidateRootCase, 'runtime', 'vendor');
  const candidateRootOldNative = join(candidateRootLive, 'old-native.node');
  const candidateRootRipgrep = join(candidateRootLive, 'ripgrep');
  const candidateRootSentinel = join(candidateRootReplacement, 'sentinel.bin');
  mkdirSync(candidateRoot, { recursive: true });
  mkdirSync(candidateRootLive, { recursive: true });
  mkdirSync(candidateRootReplacement);
  writeFileSync(join(candidateRoot, 'candidate.node'), Buffer.from([0xca, 0xfe]));
  writeFileSync(candidateRootOldNative, Buffer.from([0x00, 0x11, 0x80, 0xff]), { mode: 0o640 });
  writeFileSync(candidateRootRipgrep, Buffer.from([0x72, 0x67, 0x00, 0xff]), { mode: 0o711 });
  writeFileSync(candidateRootSentinel, Buffer.from([0x5a, 0x00, 0xa5]), { mode: 0o604 });
  const candidateRootOldNativeBefore = lstatSync(candidateRootOldNative);
  const candidateRootRipgrepBefore = lstatSync(candidateRootRipgrep);
  const candidateRootSentinelBefore = lstatSync(candidateRootSentinel);
  let candidateRootError;
  try {
    publishVendorTransaction({
      liveVendor: candidateRootLive,
      candidateVendor: candidateRoot,
      transactionDir: candidateRootTransaction,
      afterPublish: () => {
        renameSync(candidateRoot, candidateRootDisplaced);
        renameSync(candidateRootReplacement, candidateRoot);
      },
    });
  } catch (error) {
    candidateRootError = error;
  }
  assert.equal(candidateRootError?.rollbackComplete, true, 'a transaction-owned candidate root conflict must preserve completed live rollback');
  assert.equal(candidateRootError?.cleanupSafe, false, 'a transaction-owned candidate root conflict must retain transaction recovery data');
  assert.deepEqual(readdirSync(candidateRootLive).toSorted(), ['old-native.node', 'ripgrep'], 'candidate root conflict rollback must restore the exact prior live entry set');
  assert.deepEqual(readFileSync(candidateRootOldNative), Buffer.from([0x00, 0x11, 0x80, 0xff]), 'candidate root conflict rollback must restore prior native bytes');
  assert.equal(lstatSync(candidateRootOldNative).ino, candidateRootOldNativeBefore.ino, 'candidate root conflict rollback must restore prior native identity');
  assert.deepEqual(readFileSync(candidateRootRipgrep), Buffer.from([0x72, 0x67, 0x00, 0xff]), 'candidate root conflict rollback must preserve managed ripgrep bytes');
  assert.equal(lstatSync(candidateRootRipgrep).ino, candidateRootRipgrepBefore.ino, 'candidate root conflict rollback must preserve managed ripgrep identity');
  assert.deepEqual(readFileSync(join(candidateRoot, 'sentinel.bin')), Buffer.from([0x5a, 0x00, 0xa5]), 'candidate root conflict rollback must not mutate replacement bytes');
  assert.equal(lstatSync(join(candidateRoot, 'sentinel.bin')).ino, candidateRootSentinelBefore.ino, 'candidate root conflict rollback must preserve replacement identity');
  assert.equal(existsSync(join(candidateRootTransaction, 'vendor-rollback-conflict.json')), true, 'candidate root conflict must retain recovery evidence');

  const unknownEntryCase = join(vendorTransactionRoot, 'unknown-live-entry');
  const unknownEntryTransaction = join(unknownEntryCase, 'transaction');
  const unknownEntryCandidate = join(unknownEntryTransaction, 'candidate', 'vendor');
  const unknownEntryLive = join(unknownEntryCase, 'runtime', 'vendor');
  const unknownEntryOldNative = join(unknownEntryLive, 'old-native.node');
  const unknownEntryRipgrep = join(unknownEntryLive, 'ripgrep');
  const unknownEntryRogue = join(unknownEntryLive, 'rogue.node');
  mkdirSync(unknownEntryCandidate, { recursive: true });
  mkdirSync(unknownEntryLive, { recursive: true });
  writeFileSync(join(unknownEntryCandidate, 'candidate.node'), Buffer.from([0xca, 0xfe]));
  writeFileSync(unknownEntryOldNative, Buffer.from([0x00, 0x11, 0x80, 0xff]), { mode: 0o640 });
  writeFileSync(unknownEntryRipgrep, Buffer.from([0x72, 0x67, 0x00, 0xff]), { mode: 0o711 });
  const unknownEntryOldNativeBefore = lstatSync(unknownEntryOldNative);
  const unknownEntryRipgrepBefore = lstatSync(unknownEntryRipgrep);
  let unknownEntryRogueBefore;
  let unknownEntryError;
  try {
    publishVendorTransaction({
      liveVendor: unknownEntryLive,
      candidateVendor: unknownEntryCandidate,
      transactionDir: unknownEntryTransaction,
      afterPublish: () => {
        writeFileSync(unknownEntryRogue, Buffer.from([0x13, 0x37]), { mode: 0o601 });
        unknownEntryRogueBefore = lstatSync(unknownEntryRogue);
        throw new Error('fixture publication interruption');
      },
    });
  } catch (error) {
    unknownEntryError = error;
  }
  assert.equal(unknownEntryError?.rollbackComplete, false, 'an unknown live entry must make rollback incomplete');
  assert.equal(unknownEntryError?.cleanupSafe, false, 'an unknown live entry must retain transaction recovery data');
  assert.deepEqual(readFileSync(unknownEntryOldNative), Buffer.from([0x00, 0x11, 0x80, 0xff]), 'unknown-entry rollback must restore prior native bytes');
  assert.equal(lstatSync(unknownEntryOldNative).ino, unknownEntryOldNativeBefore.ino, 'unknown-entry rollback must restore prior native identity');
  assert.deepEqual(readFileSync(unknownEntryRipgrep), Buffer.from([0x72, 0x67, 0x00, 0xff]), 'unknown-entry rollback must preserve managed ripgrep bytes');
  assert.equal(lstatSync(unknownEntryRipgrep).ino, unknownEntryRipgrepBefore.ino, 'unknown-entry rollback must preserve managed ripgrep identity');
  assert.deepEqual(readFileSync(unknownEntryRogue), Buffer.from([0x13, 0x37]), 'unknown-entry rollback must not overwrite unknown bytes');
  assert.equal(lstatSync(unknownEntryRogue).ino, unknownEntryRogueBefore.ino, 'unknown-entry rollback must not replace unknown identity');
  assert.equal(lstatSync(unknownEntryRogue).mode & 0o7777, 0o601, 'unknown-entry rollback must preserve unknown mode');
  assert.equal(existsSync(join(unknownEntryTransaction, 'vendor-rollback-conflict.json')), true, 'unknown-entry rollback must retain recovery evidence');
} finally {
  rmSync(vendorTransactionRoot, { recursive: true, force: true });
}

function isolatedUnixPath(root) {
  assertTemporaryPath(root, 'Unix behavior fixture');
  const bin = join(root, '.test-bin');
  mkdirSync(bin, { recursive: true });
  for (const [name, target] of Object.entries({
    basename: '/usr/bin/basename',
    cat: '/bin/cat',
    chmod: '/bin/chmod',
    cp: '/bin/cp',
    date: '/bin/date',
    dirname: '/usr/bin/dirname',
    file: '/usr/bin/file',
    grep: '/usr/bin/grep',
    head: '/usr/bin/head',
    ln: '/bin/ln',
    ls: '/bin/ls',
    mkdir: '/bin/mkdir',
    mv: '/bin/mv',
    readlink: '/usr/bin/readlink',
    rm: '/bin/rm',
    sed: '/usr/bin/sed',
    tr: '/usr/bin/tr',
  })) {
    const destination = join(bin, name);
    if (!existsSync(destination)) symlinkSync(target, destination);
  }
  return bin;
}

function unixTemplate(name, marker) {
  const start = unix.indexOf(marker);
  assert.notEqual(start, -1, `install.sh must generate ${name}`);
  const bodyStart = unix.indexOf('\n', start) + 1;
  const end = unix.indexOf(`\n${marker.match(/<< '([^']+)'/)?.[1]}`, bodyStart);
  assert.notEqual(end, -1, `install.sh ${name} template must end`);
  return unix.slice(bodyStart, end);
}

function powerShellRuntimePayload(name) {
  const marker = `$${name} = [Convert]::FromBase64String('`;
  const start = windows.indexOf(marker);
  assert.notEqual(start, -1, `install.ps1 must declare canonical byte payload $${name}`);
  const bodyStart = start + marker.length;
  const end = windows.indexOf("')", bodyStart);
  assert.notEqual(end, -1, `install.ps1 canonical byte payload $${name} must end`);
  const encoded = windows.slice(bodyStart, end);
  assert.match(encoded, /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, `$${name} must be canonical base64`);
  assert.equal(Buffer.from(encoded, 'base64').toString('base64'), encoded, `$${name} must round-trip as canonical base64`);
  return Buffer.from(encoded, 'base64');
}

function powerShellFunction(name) {
  const start = windows.indexOf(`function ${name} {`);
  assert.notEqual(start, -1, `install.ps1 must define ${name}`);
  const end = windows.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `install.ps1 must close ${name}`);
  return windows.slice(start, end + 3);
}

function powerShellApplyBlock(source, label) {
  const start = source.indexOf('Write-Dim "Applying patches ..."');
  const end = source.indexOf('\n# --- Create default configs', start);
  assert.ok(start >= 0 && end > start, `${label} must retain the patch application gate`);
  return source.slice(start, end);
}

function assertPowerShellVendorStatusScope(source, label) {
  const block = powerShellApplyBlock(source, label);
  const probe = '$VendorNativePreferenceWasDefined = Test-Path Variable:PSNativeCommandUseErrorActionPreference';
  const save = 'if ($VendorNativePreferenceWasDefined) { $VendorNativePreferenceValue = $PSNativeCommandUseErrorActionPreference }';
  const disable = 'if ($VendorNativePreferenceWasDefined) { $PSNativeCommandUseErrorActionPreference = $false }';
  const call = '& $BunBin (Join-Path $ClawDir "vendor-transaction.mjs") publish $RuntimeVendorDir $RuntimeCandidateVendor $RuntimeRollbackDir';
  const capture = '$vendorStatus = $LASTEXITCODE';
  const restore = 'if ($VendorNativePreferenceWasDefined) { $PSNativeCommandUseErrorActionPreference = $VendorNativePreferenceValue }';
  const remove = 'else { Remove-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue }';
  const failureGate = 'if ($vendorStatus -ne 0) {';
  const rollbackStatus = '$VendorRollbackComplete = $vendorStatus -eq 20 -or $vendorStatus -eq 22';
  const retainedStatus = 'if ($vendorStatus -eq 22) { $RuntimeTransactionCleanupSafe = $false }';
  const promote = 'throw "Native vendor publication failed."';
  const positions = [probe, save, '    try {', disable, call, capture, '    } finally {', restore, remove, failureGate, rollbackStatus, retainedStatus, promote]
    .map(needle => block.indexOf(needle));
  assert.ok(positions.every(position => position >= 0), `${label} must preserve native-command state, capture rollback status, and promote vendor failure`);
  assert.deepEqual(positions, positions.toSorted((left, right) => left - right), `${label} native-command status handling must stay in execution order`);
  assert.equal(block.indexOf(call, positions[4] + call.length), -1, `${label} must invoke the vendor transaction helper exactly once`);
  assert.equal(block.indexOf(capture, positions[5] + capture.length), -1, `${label} must capture native vendor status exactly once`);
  assert.equal((block.match(/\$vendorStatus\s*=/g) || []).length, 1, `${label} must assign native vendor status exactly once`);
  assert.equal(block.slice(positions[4] + call.length, positions[5]).trim(), '', `${label} must capture native vendor status immediately after helper publication`);
  assert.equal((block.match(/\$PSNativeCommandUseErrorActionPreference\s*=\s*\$false/g) || []).length, 1, `${label} must disable native-command throwing only once`);
  const preferenceScope = block.slice(positions[2], positions[8] + remove.length);
  assert.equal((preferenceScope.match(/\$PSNativeCommandUseErrorActionPreference\s*=/g) || []).length, 2, `${label} must only disable and restore the native-command error preference`);
  assert.doesNotMatch(preferenceScope, /\$ErrorActionPreference\s*=/, `${label} must not weaken ErrorActionPreference around vendor publication`);
  return block;
}

function findPwsh() {
  const pathValue = process.env.PATH || process.env.Path || '';
  for (const directory of pathValue.split(delimiter)) {
    for (const name of process.platform === 'win32' ? ['pwsh.exe', 'pwsh'] : ['pwsh']) {
      const candidate = join(directory, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const executableNode = /(?:^|[;\r\n])\s*(?:&\s*)?(?:node(?:\.exe)?|\$NodeBin)\b(?:\s|$)|\bStart-Process\s+(?:-FilePath\s+)?(?:node(?:\.exe)?)\b/i;
const forbiddenNodeFixtures = [
  'node ./helper.mjs',
  'node.exe --version',
  '& node --version',
  'Start-Process node -ArgumentList "--version"',
  'Start-Process -FilePath node.exe -ArgumentList "--version"',
  '& $NodeBin ./helper.mjs',
];
const allowedNodeReferences = [
  "import { readFileSync } from 'node:fs';",
  'require("node:path")',
  'vendor/native-addon.node',
];

for (const fixture of forbiddenNodeFixtures) {
  assert.match(fixture, executableNode, `Node execution policy must reject: ${fixture}`);
}

for (const fixture of allowedNodeReferences) {
  assert.doesNotMatch(fixture, executableNode, `Node execution policy must allow: ${fixture}`);
}

for (const [name, source] of [['install.sh', unix], ['install.ps1', windows]]) {
  assert.doesNotMatch(source, /#!\/usr\/bin\/env node/, `${name}: generated scripts must use Bun shebangs`);
  assert.doesNotMatch(source, executableNode, `${name}: must not execute Node`);
  assert.match(source, /claude-mem-compat\.cjs["']?\s+uninstall/, `${name}: uninstall must still restore claude-mem`);
  assert.match(source, /Bun:|Bun version/, `${name}: Bun preflight must remain visible`);
}

const unixUninstall = unix.slice(
  unix.indexOf('if [ "$UNINSTALL" = "1" ]; then'),
  unix.indexOf('# ─── Bun prerequisite'),
);
const windowsUninstall = windows.slice(
  windows.indexOf('if ($Uninstall) {'),
  windows.indexOf('# --- Bun prerequisite'),
);

const unixLauncherStart = unix.indexOf('LAUNCHER_CONTENT="');
const unixLauncherEnd = unix.indexOf('"\n\n\n# Back up original claude', unixLauncherStart);
const unixBackupStart = unix.indexOf('# Back up original claude (only once)');
const unixBackupEnd = unix.indexOf('# Write launcher to the SAME directory', unixBackupStart);
const unixWriteLauncherStart = unix.indexOf('write_launcher() {', unixBackupEnd);
const unixWriteLauncherEnd = unix.indexOf('\n}\n\nwrite_launcher "$CLAUDE_BIN"', unixWriteLauncherStart);
const unixCleanupStart = unixUninstall.indexOf('  CLAUDE_BIN=$(command -v claude 2>/dev/null || true)');
const unixCleanupEnd = unixUninstall.indexOf('  rm -rf "$CLAWGOD_DIR/node_modules"', unixCleanupStart);
assert.ok(unixLauncherStart >= 0 && unixLauncherEnd > unixLauncherStart, 'install.sh must retain the Unix launcher template');
assert.ok(unixBackupStart >= 0 && unixBackupEnd > unixBackupStart, 'install.sh must retain the Unix backup decision');
assert.ok(unixWriteLauncherStart >= 0 && unixWriteLauncherEnd > unixWriteLauncherStart, 'install.sh must retain the Unix launcher writer');
assert.ok(unixCleanupStart >= 0 && unixCleanupEnd > unixCleanupStart, 'install.sh must retain the Unix launcher cleanup');

const unixLauncherAssignment = unix.slice(unixLauncherStart, unixLauncherEnd + 1);
const unixBackupDecision = unix.slice(unixBackupStart, unixBackupEnd);
const unixWriteLauncher = unix.slice(unixWriteLauncherStart, unixWriteLauncherEnd + 3);
const unixCleanup = unixUninstall.slice(unixCleanupStart, unixCleanupEnd);

function unixLauncherHelpers() {
  const start = Math.max(0, unix.indexOf('has_clawgod_launcher_content() {')) || unix.indexOf('is_clawgod_launcher() {');
  if (start < 0) return '';
  const end = unix.indexOf('\necho ""', start);
  assert.notEqual(end, -1, 'install.sh must close launcher helper definitions');
  return unix.slice(start, end);
}

function renderUnixLauncher(home, bin, primary) {
  const fakeBun = join(home, 'fake-bun');
  writeFileSync(fakeBun, '#!/bin/sh\nexit 0\n', 'utf8');
  chmodSync(fakeBun, 0o755);
  const rendered = spawnSync('/bin/bash', ['-c', `${unixLauncherAssignment}\nprintf '%s' "$LAUNCHER_CONTENT"`], {
    encoding: 'utf8',
    env: { HOME: home, PATH: isolatedUnixPath(home), CLAWGOD_DIR: join(home, '.clawgod'), BUN_BIN: fakeBun, CLAUDE_BIN: primary },
  });
  assert.equal(rendered.status, 0, rendered.stderr);
  return rendered.stdout;
}

function writeUnixLauncher(primary, content) {
  const root = dirname(dirname(primary));
  const written = spawnSync('/bin/bash', ['-c', `${unixWriteLauncher}\nwrite_launcher "$TARGET"`], {
    encoding: 'utf8',
    env: { HOME: root, PATH: isolatedUnixPath(root), TARGET: primary, LAUNCHER_CONTENT: content },
  });
  assert.equal(written.status, 0, written.stderr);
}

function invokeUnixBackup(home, bin, primary) {
  return spawnSync('/bin/bash', ['-c', `info() { :; }\nwarn() { printf '%s\\n' "$*" >&2; }\nerr() { printf '%s\\n' "$*" >&2; }\n${unixLauncherHelpers()}\n${unixBackupDecision}`], {
    encoding: 'utf8',
    env: { HOME: home, BIN_DIR: bin, CLAUDE_BIN: primary, PATH: isolatedUnixPath(home) },
  });
}

function runUnixBackup(home, bin, primary) {
  const backup = invokeUnixBackup(home, bin, primary);
  assert.equal(backup.status, 0, backup.stderr);
}

function invokeUnixLauncherCleanup(home, bin, managedSentinel = '') {
  return spawnSync('/bin/bash', ['-c', `info() { :; }\nwarn() { printf '%s\\n' "$*" >&2; }\nerr() { printf '%s\\n' "$*" >&2; }\n${unixLauncherHelpers()}\n${unixCleanup}\nif [ -n "$MANAGED_SENTINEL" ]; then rm -f "$MANAGED_SENTINEL"; fi`], {
    encoding: 'utf8',
    env: { HOME: home, BIN_DIR: bin, PATH: isolatedUnixPath(home), MANAGED_SENTINEL: managedSentinel },
  });
}

function runUnixLauncherCleanup(home, bin) {
  const cleanup = invokeUnixLauncherCleanup(home, bin);
  assert.equal(cleanup.status, 0, cleanup.stderr);
}

function unixLauncherIsOwned(path) {
  const ownership = unixLauncherHelpers();
  assert.notEqual(ownership, '', 'install.sh must define a ClawGod launcher ownership check');
  const root = dirname(path);
  return spawnSync('/bin/bash', ['-c', `${ownership}\nis_clawgod_launcher "$TARGET"`], {
    encoding: 'utf8',
    env: { HOME: root, PATH: isolatedUnixPath(root), TARGET: path },
  }).status === 0;
}

{
  const home = mkdtempSync(join(tmpdir(), 'clawgod-launcher-fresh-'));
  try {
    const bin = join(home, '.local', 'bin');
    const primary = join(bin, 'claude');
    const alias = join(bin, 'clawgod');
    const original = join(bin, 'claude.orig');
    const launcher = renderUnixLauncher(home, bin, primary);
    writeUnixLauncher(primary, launcher);
    writeUnixLauncher(alias, launcher);

    runUnixBackup(home, bin, primary);
    runUnixLauncherCleanup(home, bin);

    assert.equal(existsSync(primary), false, 'fresh install, repeat install, then uninstall must not restore the ClawGod launcher as claude');
    assert.equal(existsSync(alias), false, 'fresh install uninstall must remove the ClawGod alias');
    assert.equal(existsSync(original), false, 'fresh install uninstall must leave no fabricated original backup');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = mkdtempSync(join(tmpdir(), 'clawgod-launcher-ownership-'));
  try {
    const bin = join(home, 'custom-bin');
    const primary = join(bin, 'claude');
    const legacy = join(bin, 'legacy-claude');
    const generic = join(bin, 'generic-claude');
    const markerOnly = join(bin, 'marker-only-claude');
    const symlink = join(bin, 'symlinked-claude');
    const launcher = renderUnixLauncher(home, bin, primary);
    mkdirSync(bin, { recursive: true });
    writeFileSync(primary, launcher, 'utf8');
    writeFileSync(legacy, launcher.replace('# CLAWGOD_LAUNCHER_V1\n', ''), 'utf8');
    writeFileSync(generic, '#!/bin/sh\necho clawgod is mentioned here\n', 'utf8');
    writeFileSync(markerOnly, '#!/bin/sh\n# CLAWGOD_LAUNCHER_V1\necho third-party launcher\n', 'utf8');
    symlinkSync(primary, symlink);

    assert.equal(unixLauncherIsOwned(primary), true, 'new marker must identify the current ClawGod launcher');
    assert.equal(unixLauncherIsOwned(legacy), true, 'the stable pre-marker launcher structure must remain compatible');
    assert.equal(unixLauncherIsOwned(generic), false, 'ordinary scripts mentioning clawgod must not be treated as launchers');
    assert.equal(unixLauncherIsOwned(markerOnly), false, 'a marker-only third-party script must not be treated as a ClawGod launcher');
    assert.equal(unixLauncherIsOwned(symlink), false, 'symlinks must remain eligible for original-command backup');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = mkdtempSync(join(tmpdir(), 'clawgod-launcher-marker-only-'));
  try {
    const bin = join(home, '.local', 'bin');
    const primary = join(bin, 'claude');
    const alias = join(bin, 'clawgod');
    const original = join(bin, 'claude.orig');
    const thirdParty = '#!/bin/sh\n# CLAWGOD_LAUNCHER_V1\necho third-party launcher\n';
    mkdirSync(bin, { recursive: true });
    writeFileSync(primary, thirdParty, 'utf8');
    writeFileSync(alias, thirdParty, 'utf8');

    runUnixBackup(home, bin, primary);
    writeUnixLauncher(primary, renderUnixLauncher(home, bin, primary));
    runUnixLauncherCleanup(home, bin);

    assert.equal(readFileSync(primary, 'utf8'), thirdParty, 'a marker-only primary must be backed up and restored, not deleted');
    assert.equal(readFileSync(alias, 'utf8'), thirdParty, 'a marker-only alias must not be deleted during uninstall');
    assert.equal(existsSync(original), false, 'restoring a third-party primary must consume its backup');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

for (const [name, createOriginal] of [
  ['official binary', (path) => copyFileSync('/bin/sh', path)],
  ['ordinary script containing clawgod text', (path) => writeFileSync(path, '#!/bin/sh\necho clawgod documentation\n', 'utf8')],
  ['symlink', (path, home) => {
    const target = join(home, 'official-claude');
    writeFileSync(target, '#!/bin/sh\necho official\n', 'utf8');
    symlinkSync(target, path);
    return target;
  }],
]) {
  const home = mkdtempSync(join(tmpdir(), 'clawgod-launcher-original-'));
  try {
    const bin = join(home, '.local', 'bin');
    const primary = join(bin, 'claude');
    const alias = join(bin, 'clawgod');
    mkdirSync(bin, { recursive: true });
    const target = createOriginal(primary, home);
    const originalContent = name === 'symlink' ? null : readFileSync(primary);
    runUnixBackup(home, bin, primary);
    const backup = join(bin, 'claude.orig');
    assert.equal(existsSync(backup), true, `${name} must be backed up instead of treated as a ClawGod launcher`);
    if (name === 'symlink') {
      assert.equal(lstatSync(backup).isSymbolicLink(), true, 'official symlink backup must remain a symlink');
      assert.equal(readlinkSync(backup), target, 'official symlink backup must preserve its target');
    }
    const launcher = renderUnixLauncher(home, bin, primary);
    writeUnixLauncher(primary, launcher);
    writeUnixLauncher(alias, launcher);
    runUnixLauncherCleanup(home, bin);
    assert.equal(existsSync(alias), false, `${name} uninstall must remove only the complete ClawGod alias`);
    assert.equal(existsSync(backup), false, `${name} uninstall must consume the original backup`);
    if (name === 'symlink') {
      assert.equal(lstatSync(primary).isSymbolicLink(), true, 'symlink original must remain a symlink after write-launcher and uninstall');
      assert.equal(readlinkSync(primary), target, 'symlink original must restore its original target after write-launcher and uninstall');
    } else {
      assert.deepEqual(readFileSync(primary), originalContent, `${name} must restore its original content after write-launcher and uninstall`);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = mkdtempSync(join(tmpdir(), 'clawgod-launcher-restore-'));
  try {
    const bin = join(home, '.local', 'bin');
    const primary = join(bin, 'claude');
    const alias = join(bin, 'clawgod');
    const original = join(bin, 'claude.orig');
    const official = '#!/bin/sh\necho official claude\n';
    mkdirSync(bin, { recursive: true });
    writeFileSync(primary, official, 'utf8');
    runUnixBackup(home, bin, primary);
    const launcher = renderUnixLauncher(home, bin, primary);
    writeUnixLauncher(primary, launcher);
    writeUnixLauncher(alias, launcher);
    runUnixLauncherCleanup(home, bin);

    assert.equal(readFileSync(primary, 'utf8'), official, 'uninstall must restore a real original claude command');
    assert.equal(existsSync(alias), false, 'uninstall must remove the ClawGod alias after restoring an original');
    assert.equal(existsSync(original), false, 'uninstall must consume the restored original backup');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = mkdtempSync(join(tmpdir(), 'clawgod-launcher-install-conflict-'));
  assertTemporaryPath(home, 'launcher install conflict fixture');
  try {
    const bin = join(home, '.local', 'bin');
    const primary = join(bin, 'claude');
    const original = join(bin, 'claude.orig');
    const thirdParty = Buffer.from('#!/bin/sh\necho user replacement\n');
    const official = Buffer.from('#!/bin/sh\necho preserved original\n');
    mkdirSync(bin, { recursive: true });
    writeFileSync(primary, thirdParty);
    writeFileSync(original, official);

    const install = invokeUnixBackup(home, bin, primary);
    assert.notEqual(install.status, 0, 'install must fail when a third-party current command and valid original backup both exist');
    assert.match(install.stderr, /conflict/i, 'install conflict must be actionable');
    assert.deepEqual(readFileSync(primary), thirdParty, 'install conflict must preserve the third-party current command byte-for-byte');
    assert.deepEqual(readFileSync(original), official, 'install conflict must preserve the valid original backup byte-for-byte');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

for (const originalState of ['valid', 'owned']) {
  const home = mkdtempSync(join(tmpdir(), `clawgod-launcher-symlink-conflict-${originalState}-`));
  assertTemporaryPath(home, 'launcher symlink conflict fixture');
  try {
    const bin = join(home, '.local', 'bin');
    const primary = join(bin, 'claude');
    const original = join(bin, 'claude.orig');
    const target = join(home, 'replacement target');
    const launcher = renderUnixLauncher(home, bin, primary);
    mkdirSync(bin, { recursive: true });
    writeFileSync(target, '#!/bin/sh\necho replacement\n', 'utf8');
    symlinkSync(target, primary);
    writeFileSync(original, originalState === 'valid' ? '#!/bin/sh\necho original\n' : launcher, 'utf8');
    const originalBefore = readFileSync(original);

    for (const operation of ['install', 'uninstall']) {
      const result = operation === 'install'
        ? invokeUnixBackup(home, bin, primary)
        : invokeUnixLauncherCleanup(home, bin);
      assert.notEqual(result.status, 0, `${operation} must reject a symlink current plus ${originalState} original conflict`);
      assert.equal(lstatSync(primary).isSymbolicLink(), true, `${operation} conflict must preserve current symlink type`);
      assert.equal(readlinkSync(primary), target, `${operation} conflict must preserve current symlink target`);
      assert.deepEqual(readFileSync(original), originalBefore, `${operation} conflict must preserve original bytes`);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = mkdtempSync(join(tmpdir(), 'clawgod-launcher-polluted-repeat-'));
  assertTemporaryPath(home, 'polluted repeat fixture');
  try {
    const bin = join(home, '.local', 'bin');
    const primary = join(bin, 'claude');
    const original = join(bin, 'claude.orig');
    const launcher = renderUnixLauncher(home, bin, primary);
    mkdirSync(bin, { recursive: true });
    writeFileSync(primary, launcher, 'utf8');
    writeFileSync(original, launcher, 'utf8');

    const repeat = invokeUnixBackup(home, bin, primary);
    assert.equal(repeat.status, 0, repeat.stderr);
    assert.equal(existsSync(original), false, 'repeat install must discard an installer-owned polluted original backup');
    assert.equal(readFileSync(primary, 'utf8'), launcher, 'repeat install cleanup must preserve the owned current launcher');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = mkdtempSync(join(tmpdir(), 'clawgod-launcher-uninstall-conflict-'));
  assertTemporaryPath(home, 'launcher uninstall conflict fixture');
  try {
    const bin = join(home, '.local', 'bin');
    const primary = join(bin, 'claude');
    const alias = join(bin, 'clawgod');
    const original = join(bin, 'claude.orig');
    const sentinel = join(home, '.clawgod', 'managed-sentinel');
    const thirdParty = Buffer.from('#!/bin/sh\necho replacement after install\n');
    const official = Buffer.from('#!/bin/sh\necho original before install\n');
    const launcher = renderUnixLauncher(home, bin, primary);
    mkdirSync(dirname(sentinel), { recursive: true });
    mkdirSync(bin, { recursive: true });
    writeFileSync(primary, thirdParty);
    writeFileSync(original, official);
    writeFileSync(alias, launcher, 'utf8');
    writeFileSync(sentinel, 'managed state\n', 'utf8');

    const uninstall = invokeUnixLauncherCleanup(home, bin, sentinel);
    assert.notEqual(uninstall.status, 0, 'uninstall must fail before cleanup when the current command is third-party');
    assert.match(uninstall.stderr, /conflict/i, 'uninstall conflict must be actionable');
    assert.deepEqual(readFileSync(primary), thirdParty, 'uninstall conflict must preserve the current third-party command');
    assert.deepEqual(readFileSync(original), official, 'uninstall conflict must preserve the original backup');
    assert.equal(readFileSync(alias, 'utf8'), launcher, 'uninstall conflict must preserve the managed alias before cleanup');
    assert.equal(existsSync(sentinel), true, 'uninstall conflict must stop before managed runtime cleanup');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

{
  const home = mkdtempSync(join(tmpdir(), 'clawgod-launcher-missing-current-'));
  assertTemporaryPath(home, 'missing-current restore fixture');
  try {
    const bin = join(home, '.local', 'bin');
    const primary = join(bin, 'claude');
    const original = join(bin, 'claude.orig');
    const target = join(home, 'official target');
    mkdirSync(bin, { recursive: true });
    writeFileSync(target, '#!/bin/sh\necho official\n', 'utf8');
    symlinkSync(target, original);

    runUnixLauncherCleanup(home, bin);
    assert.equal(lstatSync(primary).isSymbolicLink(), true, 'missing current command must restore a valid original symlink as a symlink');
    assert.equal(readlinkSync(primary), target, 'restored original symlink must preserve its exact target');
    assert.equal(existsSync(original), false, 'successful restoration must consume the original backup');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

for (const currentState of ['owned', 'missing']) {
  const home = mkdtempSync(join(tmpdir(), `clawgod-launcher-polluted-uninstall-${currentState}-`));
  assertTemporaryPath(home, 'polluted uninstall fixture');
  try {
    const bin = join(home, '.local', 'bin');
    const primary = join(bin, 'claude');
    const original = join(bin, 'claude.orig');
    const launcher = renderUnixLauncher(home, bin, primary);
    mkdirSync(bin, { recursive: true });
    if (currentState === 'owned') writeFileSync(primary, launcher, 'utf8');
    writeFileSync(original, launcher, 'utf8');

    runUnixLauncherCleanup(home, bin);
    assert.equal(existsSync(primary), false, `${currentState} current must never be replaced by an installer-owned polluted backup`);
    assert.equal(existsSync(original), false, 'polluted original backup must be removed during successful managed cleanup');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

const unixDiscoveryStart = unix.indexOf('# Detect where claude is actually installed');
const unixDiscoveryEnd = unix.indexOf('\n# ─── Download clawgod-import binary', unixDiscoveryStart);
assert.ok(unixDiscoveryStart >= 0 && unixDiscoveryEnd > unixDiscoveryStart, 'install.sh must retain stable Claude command discovery');
const unixDiscovery = unix.slice(unixDiscoveryStart, unixDiscoveryEnd);
assert.match(unix, /is_unstable_claude_path\(\)/, 'install.sh must define unstable Claude path detection');

for (const stableExists of [true, false]) {
for (const shimKind of ['system-temp', 'cmux']) {
  const home = mkdtempSync(join(tmpdir(), `clawgod-shim-first-${stableExists ? 'existing' : 'missing'}-${shimKind}-`));
  assertTemporaryPath(home, 'shim-first discovery fixture');
  try {
    const stableBin = join(home, '.local', 'bin');
    const stable = join(stableBin, 'claude');
    const systemTemp = join(home, 'resolved-system-temp');
    const shimDir = shimKind === 'system-temp' ? join(systemTemp, 'ordinary-shims') : join(home, 'cmux-cli-shims');
    const shim = join(shimDir, 'claude');
    const utilityBin = isolatedUnixPath(home);
    const fakeBun = join(home, 'fake bun');
    mkdirSync(stableBin, { recursive: true });
    mkdirSync(shimDir, { recursive: true });
    writeFileSync(shim, '#!/bin/sh\necho temporary shim\n', 'utf8');
    chmodSync(shim, 0o755);
    if (stableExists) writeFileSync(stable, '#!/bin/sh\necho stable user command\n', 'utf8');
    writeFileSync(fakeBun, '#!/bin/sh\nexit 0\n', 'utf8');
    chmodSync(fakeBun, 0o755);
    const beforeShim = readFileSync(shim);

    const discovery = spawnSync('/bin/bash', ['-c', `dim() { :; }\n${unixLauncherHelpers()}\n${unixDiscovery}\n${unixLauncherAssignment}\nprintf 'SELECTED=%s\\n' "$CLAUDE_BIN"\nprintf '%s' "$LAUNCHER_CONTENT"`], {
      encoding: 'utf8',
      env: {
        HOME: home,
        PATH: `${shimDir}:${utilityBin}`,
        TMPDIR: systemTemp,
        BIN_DIR: stableBin,
        CLAWGOD_DIR: join(home, '.clawgod'),
        BUN_BIN: fakeBun,
      },
    });
    assert.equal(discovery.status, 0, discovery.stderr);
    assert.match(discovery.stdout, new RegExp(`^SELECTED=${stable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), 'temporary shim must resolve to the stable bin target');
    assert.doesNotMatch(discovery.stdout, new RegExp(shimDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'persistent launcher must not embed an unstable shim path');
    assert.deepEqual(readFileSync(shim), beforeShim, 'temporary PATH shim must remain byte-identical');
    assert.equal(existsSync(stable), stableExists, 'discovery alone must not create or overwrite the stable launcher');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}
}

if (process.env.CLAWGOD_INSTALLER_FOCUS !== 'windows-cross-slot') {
  const home = mkdtempSync(join(tmpdir(), 'clawgod-stable-link-to-temp-'));
  assertTemporaryPath(home, 'stable-link-to-temp discovery fixture');
  try {
    const stableBin = join(home, '.local', 'bin');
    const pathBin = join(home, 'path-bin');
    const systemTemp = join(home, 'resolved-system-temp');
    const temporaryTarget = join(systemTemp, 'runtime-shims', 'claude');
    const linkedCandidate = join(pathBin, 'claude');
    const stable = join(stableBin, 'claude');
    const utilityBin = isolatedUnixPath(home);
    const fakeBun = join(home, 'fake bun');
    mkdirSync(dirname(temporaryTarget), { recursive: true });
    mkdirSync(pathBin, { recursive: true });
    mkdirSync(stableBin, { recursive: true });
    writeFileSync(temporaryTarget, '#!/bin/sh\necho temporary target\n', 'utf8');
    chmodSync(temporaryTarget, 0o755);
    symlinkSync(temporaryTarget, linkedCandidate);
    writeFileSync(stable, '#!/bin/sh\necho stable user command\n', 'utf8');
    writeFileSync(fakeBun, '#!/bin/sh\nexit 0\n', 'utf8');
    chmodSync(fakeBun, 0o755);

    const discovery = spawnSync('/bin/bash', ['-c', `dim() { :; }\n${unixLauncherHelpers()}\n${unixDiscovery}\n${unixLauncherAssignment}\nprintf 'SELECTED=%s\\n' "$CLAUDE_BIN"\nprintf '%s' "$LAUNCHER_CONTENT"`], {
      encoding: 'utf8',
      env: {
        HOME: home,
        PATH: `${pathBin}:${utilityBin}`,
        TMPDIR: systemTemp,
        BIN_DIR: stableBin,
        CLAWGOD_DIR: join(home, '.clawgod'),
        BUN_BIN: fakeBun,
      },
    });
    assert.equal(discovery.status, 0, discovery.stderr);
    assert.match(discovery.stdout, new RegExp(`^SELECTED=${stable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), 'a stable-directory symlink to a temporary target must be rejected');
    assert.equal(lstatSync(linkedCandidate).isSymbolicLink(), true, 'rejected candidate must remain a symlink');
    assert.equal(readlinkSync(linkedCandidate), temporaryTarget, 'rejected candidate must retain its temporary target');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

if (process.env.CLAWGOD_INSTALLER_FOCUS !== 'windows-cross-slot') {
  const home = mkdtempSync(join(tmpdir(), 'clawgod-dangling-discovery-'));
  assertTemporaryPath(home, 'dangling discovery fixture');
  try {
    const stableBin = join(home, '.local', 'bin');
    const pathBin = join(home, 'path-bin');
    const targetParent = join(home, 'stable-targets');
    const systemTemp = join(home, 'resolved-system-temp');
    const linkedCandidate = join(pathBin, 'claude');
    const intermediate = join(pathBin, 'claude-hop');
    const missingTarget = join(targetParent, 'missing-claude');
    const stable = join(stableBin, 'claude');
    const fakeBun = join(home, 'fake bun');
    mkdirSync(stableBin, { recursive: true });
    mkdirSync(pathBin, { recursive: true });
    mkdirSync(targetParent, { recursive: true });
    mkdirSync(systemTemp, { recursive: true });
    symlinkSync(intermediate, linkedCandidate);
    symlinkSync(missingTarget, intermediate);
    writeFileSync(stable, '#!/bin/sh\necho stable user command\n', 'utf8');
    writeFileSync(fakeBun, '#!/bin/sh\nexit 0\n', 'utf8');
    chmodSync(fakeBun, 0o755);
    assert.equal(existsSync(targetParent), true, 'dangling target parent must exist');
    assert.equal(existsSync(missingTarget), false, 'dangling target leaf must be absent');

    const discovery = spawnSync('/bin/bash', ['-c', `command() {
  if [ "$1" = "-v" ] && [ "$2" = "claude" ]; then
    printf '%s\\n' "$CANDIDATE"
    return 0
  fi
  builtin command "$@"
}
dim() { :; }
${unixLauncherHelpers()}
${unixDiscovery}
${unixLauncherAssignment}
printf 'SELECTED=%s\\n' "$CLAUDE_BIN"`], {
      encoding: 'utf8',
      env: {
        HOME: home,
        PATH: isolatedUnixPath(home),
        TMPDIR: systemTemp,
        BIN_DIR: stableBin,
        CLAWGOD_DIR: join(home, '.clawgod'),
        BUN_BIN: fakeBun,
        CANDIDATE: linkedCandidate,
      },
    });
    assert.equal(discovery.status, 0, discovery.stderr);
    assert.match(discovery.stdout, new RegExp(`^SELECTED=${stable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), 'a multi-hop symlink with a missing final leaf must fail closed to the stable launcher');
    assert.equal(lstatSync(linkedCandidate).isSymbolicLink(), true, 'dangling candidate must retain its symlink type');
    assert.equal(readlinkSync(linkedCandidate), intermediate, 'dangling candidate must retain its first-hop target');
    assert.equal(lstatSync(intermediate).isSymbolicLink(), true, 'dangling intermediate must retain its symlink type');
    assert.equal(readlinkSync(intermediate), missingTarget, 'dangling intermediate must retain its missing final target');

    const cycleA = join(pathBin, 'cycle-a');
    const cycleB = join(pathBin, 'cycle-b');
    symlinkSync(cycleB, cycleA);
    symlinkSync(cycleA, cycleB);
    const cycleProbe = spawnSync('/bin/bash', ['-c', `${unixLauncherHelpers()}\nis_unstable_claude_path "$CANDIDATE"`], {
      encoding: 'utf8',
      env: { HOME: home, PATH: isolatedUnixPath(home), TMPDIR: systemTemp, CANDIDATE: cycleA },
    });
    assert.equal(cycleProbe.status, 0, 'a symlink cycle must fail closed as unstable');

    const officialTarget = join(targetParent, 'official-claude');
    const officialLink = join(pathBin, 'official-claude');
    writeFileSync(officialTarget, '#!/bin/sh\necho official\n', 'utf8');
    chmodSync(officialTarget, 0o755);
    symlinkSync(officialTarget, officialLink);
    const stableProbe = spawnSync('/bin/bash', ['-c', `${unixLauncherHelpers()}\nis_unstable_claude_path "$CANDIDATE"`], {
      encoding: 'utf8',
      env: { HOME: home, PATH: isolatedUnixPath(home), TMPDIR: systemTemp, CANDIDATE: officialLink },
    });
    assert.equal(stableProbe.status, 1, 'a resolvable official symlink outside temporary paths must remain stable');
    assert.equal(lstatSync(officialLink).isSymbolicLink(), true, 'stable official candidate must remain a symlink');
    assert.equal(readlinkSync(officialLink), officialTarget, 'stable official candidate must retain its target');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

const windowsOwnershipContent = powerShellFunction('Test-ClawGodLauncherContent');
const windowsEntryOwnership = powerShellFunction('Test-ClawGodLauncher');
const windowsOwnership = windowsOwnershipContent + windowsEntryOwnership;
const windowsPathPresent = powerShellFunction('Test-ClaudePathPresent');
assert.match(windows, /function Test-ValidClaudeOriginal \{/, 'install.ps1 must distinguish valid original backups from owned polluted launchers');
assert.match(windows, /function Test-ClaudeLauncherConflict \{/, 'install.ps1 must centralize lossless launcher conflict detection');
assert.match(windowsPathPresent, /Get-Item\s+-LiteralPath\s+\$Path\s+-Force\s+-ErrorAction\s+Stop/, 'install.ps1 must detect path entries, including reparse points, without wildcard interpretation');
assert.match(windowsOwnershipContent, /Length\s+-gt\s+1048576[\s\S]*return \$false/, 'install.ps1 must reject binary-sized launcher ownership candidates before reading them as text');
const windowsConflict = powerShellFunction('Test-ClaudeLauncherConflict');
assert.match(windowsConflict, /Test-ClaudePathPresent \$Original/, 'Windows conflicts must detect original path entries through the reparse-aware helper');
assert.match(windowsConflict, /Test-ClaudePathPresent \$Current/, 'Windows conflicts must detect current path entries through the reparse-aware helper');
assert.doesNotMatch(windows, /Get-ChildItem\s+\$BinDir\s+-Filter\s+"claude\.\*\.exe"/, 'install.ps1 must not broadly delete timestamped or third-party claude executables');
const windowsUninstallConflict = windowsUninstall.indexOf('Test-ClaudeLauncherConflict');
const windowsCrossSlotConflict = windowsUninstall.indexOf('Test-ClaudeUninstallConflict');
const windowsUninstallCompat = windowsUninstall.indexOf('$claudeMemCompat');
assert.ok(windowsUninstallConflict >= 0 && windowsUninstallConflict < windowsUninstallCompat, 'Windows uninstall must reject launcher conflicts before managed compatibility cleanup');
if (process.env.CLAWGOD_INSTALLER_FOCUS !== 'unix-symlink') {
  assert.ok(windowsCrossSlotConflict >= 0 && windowsCrossSlotConflict < windowsUninstallCompat, 'Windows uninstall must reject cross-slot conflicts before managed compatibility cleanup');

  const windowsUninstallGuard = powerShellFunction('Test-ClaudeUninstallConflict');
  assert.match(windowsUninstallGuard, /Test-ValidClaudeOriginal \$OriginalCmd/, 'Windows uninstall guard must consider a valid cmd original');
  assert.match(windowsUninstallGuard, /Test-ValidClaudeOriginal \$OriginalExe/, 'Windows uninstall guard must consider a valid exe original');
  assert.match(windowsUninstallGuard, /Test-ClaudePathPresent \$CurrentCmd/, 'Windows uninstall guard must consider the current cmd slot');
  assert.match(windowsUninstallGuard, /Test-ClaudePathPresent \$CurrentExe/, 'Windows uninstall guard must consider the current exe slot');
}

function modelWindowsLifecycle(current, original, operation) {
  if (original !== 'missing' && current === 'third-party') return { status: 'conflict', current, original };
  if (operation === 'install') {
    if (original === 'owned') original = 'missing';
    if (current === 'third-party') original = 'valid';
    return { status: 'ok', current: 'owned', original };
  }
  if (original === 'valid') return { status: 'ok', current: 'third-party', original: 'missing' };
  return { status: 'ok', current: 'missing', original: 'missing' };
}

for (const operation of ['install', 'uninstall']) {
  assert.deepEqual(
    modelWindowsLifecycle('third-party', 'valid', operation),
    { status: 'conflict', current: 'third-party', original: 'valid' },
    `${operation}: third-party current plus valid original must be preserved as a conflict`,
  );
  assert.deepEqual(
    modelWindowsLifecycle('third-party', 'owned', operation),
    { status: 'conflict', current: 'third-party', original: 'owned' },
    `${operation}: third-party current plus polluted original must be preserved as a conflict`,
  );
}
assert.deepEqual(modelWindowsLifecycle('owned', 'owned', 'uninstall'), { status: 'ok', current: 'missing', original: 'missing' }, 'uninstall must never restore an owned polluted backup');
assert.deepEqual(modelWindowsLifecycle('missing', 'valid', 'uninstall'), { status: 'ok', current: 'third-party', original: 'missing' }, 'uninstall must restore a valid original when current is missing');
assert.deepEqual(modelWindowsLifecycle('owned', 'valid', 'uninstall'), { status: 'ok', current: 'third-party', original: 'missing' }, 'uninstall must replace only an owned current with a valid original');

function modelWindowsCrossSlotUninstall(state) {
  const hasValidOriginal = state.originalCmd === 'valid' || state.originalExe === 'valid';
  const hasThirdPartyCurrent = state.currentCmd === 'third-party' || state.currentExe === 'third-party';
  if (hasValidOriginal && hasThirdPartyCurrent) return { status: 'conflict', ...state };
  return {
    status: 'ok',
    currentCmd: state.originalCmd === 'valid' ? 'third-party' : 'missing',
    currentExe: state.originalExe === 'valid' ? 'third-party' : 'missing',
    originalCmd: 'missing',
    originalExe: 'missing',
  };
}

for (const state of [
  { currentCmd: 'third-party', currentExe: 'missing', originalCmd: 'missing', originalExe: 'valid' },
  { currentCmd: 'missing', currentExe: 'third-party', originalCmd: 'valid', originalExe: 'missing' },
]) {
  assert.deepEqual(
    modelWindowsCrossSlotUninstall(state),
    { status: 'conflict', ...state },
    'Windows uninstall must preserve all cmd/exe slots when any third-party current could conflict with any valid original',
  );
}

assert.deepEqual(
  modelWindowsCrossSlotUninstall({ currentCmd: 'owned', currentExe: 'missing', originalCmd: 'missing', originalExe: 'valid' }),
  { status: 'ok', currentCmd: 'missing', currentExe: 'third-party', originalCmd: 'missing', originalExe: 'missing' },
  'Windows uninstall may remove an owned cmd and restore a valid exe original',
);
assert.deepEqual(
  modelWindowsCrossSlotUninstall({ currentCmd: 'missing', currentExe: 'owned', originalCmd: 'valid', originalExe: 'missing' }),
  { status: 'ok', currentCmd: 'third-party', currentExe: 'missing', originalCmd: 'missing', originalExe: 'missing' },
  'Windows uninstall may remove an owned exe and restore a valid cmd original',
);

const windowsLauncherStart = windows.indexOf('$launcherContent = @"');
const windowsLauncherEnd = windows.indexOf('"@', windowsLauncherStart);
const windowsLauncher = windows.slice(windowsLauncherStart, windowsLauncherEnd + 2);
const windowsBackupStart = windows.indexOf('# Find and back up original claude');
const windowsBackupEnd = windows.indexOf('# Remove claude.exe so .cmd takes precedence', windowsBackupStart);
const windowsBackup = windows.slice(windowsBackupStart, windowsBackupEnd);
assert.match(windowsLauncher, /^\$launcherContent = @"\n@echo off\nrem CLAWGOD_LAUNCHER_V1\nsetlocal/m, 'install.ps1 must mark newly written launchers explicitly');
for (const legacySignal of [
  '@echo off',
  'setlocal',
  '.clawgod',
  'CLAUDE_CODE_EXECPATH=%~dp0claude\\.orig\\.exe',
  'CLAWGOD_AUTO_CHROME=1',
  'exit /b %ERRORLEVEL%',
]) {
  assert.ok(windowsOwnership.includes(legacySignal), `install.ps1 legacy ownership contract must require ${legacySignal}`);
}
assert.match(windowsOwnership, /rem CLAWGOD_LAUNCHER_V1/, 'install.ps1 ownership contract must recognize the explicit marker');
assert.match(windowsUninstall, /\(Test-ClaudePathPresent \$claudeCmd\) -and \(Test-ClawGodLauncher \$claudeCmd\)/, 'install.ps1 must only remove a verified primary launcher');
assert.match(windowsUninstall, /\(Test-Path \$clawgodCmd\) -and \(Test-ClawGodLauncher \$clawgodCmd\)/, 'install.ps1 must only remove a verified alias launcher');

function modelWindowsLauncherOwnership({ reparsePoint, content }) {
  if (reparsePoint) return false;
  return [
    /^@echo off$/m,
    /^setlocal$/m,
    /^if not exist ".*\\\.clawgod\\cli\.cjs" \($/m,
    /^set "CLAUDE_CODE_EXECPATH=%~dp0claude\.orig\.exe"$/m,
    /^set "CLAWGOD_AUTO_CHROME=1"$/m,
    /^exit \/b %ERRORLEVEL%$/m,
  ].every(pattern => pattern.test(content));
}

const windowsValidLauncher = [
  '@echo off',
  'rem CLAWGOD_LAUNCHER_V1',
  'setlocal',
  'if not exist "%USERPROFILE%\\.clawgod\\cli.cjs" (',
  'set "CLAUDE_CODE_EXECPATH=%~dp0claude.orig.exe"',
  'set "CLAWGOD_AUTO_CHROME=1"',
  'exit /b %ERRORLEVEL%',
].join('\n');
const windowsMarkerOnly = '@echo off\nrem CLAWGOD_LAUNCHER_V1\necho third-party launcher\n';
assert.equal(modelWindowsLauncherOwnership({ reparsePoint: false, content: windowsMarkerOnly }), false, 'marker-only Windows cmd content must remain third-party');
assert.equal(modelWindowsLauncherOwnership({ reparsePoint: true, content: windowsValidLauncher }), false, 'a reparse-point Windows launcher must remain third-party even with valid content');
assert.equal(modelWindowsLauncherOwnership({ reparsePoint: false, content: windowsValidLauncher }), true, 'complete Windows launcher structure must be owned');
assert.match(windowsOwnership, /\$hasStableStructure = \(/, 'install.ps1 must model ownership as full structure');
assert.match(windowsOwnership, /\$hasExplicitMarker -and -not \$hasStableStructure/, 'install.ps1 marker must not authorize incomplete launcher content');
assert.match(windowsOwnership, /return \$hasStableStructure/, 'install.ps1 must require complete launcher structure after marker handling');
assert.match(windowsEntryOwnership, /FileAttributes]::ReparsePoint/, 'install.ps1 entry ownership must reject reparse points');

function selectWindowsOriginal(candidates) {
  for (const candidate of candidates) {
    if (candidate.kind === 'cmd' && candidate.owned) continue;
    if (candidate.kind === 'cmd' || candidate.kind === 'exe') return candidate;
    if (candidate.kind === 'directory' && candidate.latestExe) return candidate.latestExe;
  }
  return null;
}

assert.deepEqual(
  selectWindowsOriginal([
    { kind: 'cmd', owned: true, name: 'claude.cmd' },
    { kind: 'directory', latestExe: { kind: 'exe', name: 'versions/claude.exe' } },
  ]),
  { kind: 'exe', name: 'versions/claude.exe' },
  'owned claude.cmd must not stop Windows original search before a versions executable is backed up',
);
assert.match(windowsEntryOwnership, /FileAttributes]::ReparsePoint/, 'install.ps1 ownership check must reject reparse points before launcher entry ownership');
assert.match(windowsBackup, /\(Test-Path \$loc -PathType Leaf\) -and \(Test-ClawGodLauncher \$loc\)\) \{ continue \}/, 'owned current launchers must be skipped while Windows searches for real originals');
assert.doesNotMatch(windowsBackup, /\$originalFound|break/, 'Windows original search must independently preserve cmd and exe candidates');
assert.match(windowsBackup, /\$loc -like "\*\.exe" -and -not \(Test-ClaudePathPresent \$claudeOrigExe\)/, 'Windows original exe backup must not overwrite an existing claude.orig.exe entry');
assert.match(windowsBackup, /\$loc -like "\*\.cmd" -and -not \(Test-ClaudePathPresent \$claudeOrigCmd\)/, 'Windows original cmd backup must not overwrite an existing claude.orig.cmd entry');
assert.match(windowsBackup, /Copy-Item \$latestExe\.FullName \$claudeOrigExe -Force/, 'versions executable must be backed up as claude.orig.exe after owned cmd is skipped');
assert.match(windowsUninstall, /Move-Item -Force \$claudeExeOrig \$claudeExe/, 'Windows uninstall must restore the backed-up versions executable');

for (const [name, uninstall] of [['install.sh', unixUninstall], ['install.ps1', windowsUninstall]]) {
  for (const artifact of ['.clawgod-version', '.update-check', 'enhancement-config.mjs', 'enhancement-manifest.json']) {
    assert.ok(uninstall.includes(artifact), `${name}: uninstall must remove ${artifact}`);
  }
  for (const preserved of ['provider.json', 'features.json', 'enhancements.json', '.lean-disabled', '.lean-max']) {
    assert.doesNotMatch(uninstall, new RegExp(preserved.replace('.', '\\\.')), `${name}: uninstall must preserve ${preserved}`);
  }
}

assert.doesNotMatch(unix, /\$\(\$BUN_BIN\s+--version/, 'Unix Bun version probes must quote paths containing spaces');

const resolveBunStart = unix.indexOf('resolve_bun() {');
const normalPreflightStart = unix.indexOf('if ! resolve_bun; then', unix.indexOf('# ─── Bun prerequisite'));
const normalPreflightEnd = unix.indexOf('prepare_enhancement_config_directory', normalPreflightStart);
assert.notEqual(resolveBunStart, -1, 'Unix installer must define resolve_bun');
assert.notEqual(normalPreflightStart, -1, 'Unix installer must resolve Bun before normal installation');
assert.notEqual(normalPreflightEnd, -1, 'Unix installer must retain its normal Bun preflight');

const spacedBunHome = mkdtempSync(join(tmpdir(), 'clawgod bun path '));
try {
  const bunDirectory = join(spacedBunHome, '.bun', 'bin');
  const fakeBun = join(bunDirectory, 'bun');
  mkdirSync(bunDirectory, { recursive: true });
  writeFileSync(fakeBun, '#!/bin/sh\n[ "$1" = "--version" ] && printf "1.3.14\\n"\n', 'utf8');
  chmodSync(fakeBun, 0o755);

  const preflightFixture = join(spacedBunHome, 'bun-preflight.sh');
  writeFileSync(preflightFixture, `#!/usr/bin/env bash
set -e
warn() { printf '%s\\n' "$*" >&2; }
info() { printf '%s\\n' "$*"; }
${unix.slice(resolveBunStart, unix.indexOf('\n}\n', resolveBunStart) + 3)}
${unix.slice(normalPreflightStart, normalPreflightEnd)}
printf 'resolved=%s\\n' "$BUN_BIN"
`, 'utf8');
  chmodSync(preflightFixture, 0o755);

  const preflight = spawnSync('bash', [preflightFixture], {
    encoding: 'utf8',
    env: { ...process.env, HOME: spacedBunHome, PATH: '/usr/bin:/bin' },
  });
  assert.equal(preflight.status, 0, `Bun preflight must support paths containing spaces:\n${preflight.stderr}`);
  assert.match(preflight.stdout, /resolved=.*clawgod bun path /, 'Bun preflight must retain the resolved spaced path');
} finally {
  rmSync(spacedBunHome, { recursive: true, force: true });
}

const resolveBun = powerShellFunction('Resolve-Bun');
const powerShellBunShim = /\.(?:cmd|bat|ps1)$/i;
for (const fixture of [
  'C:\\Users\\test\\AppData\\Roaming\\npm\\bun.cmd',
  'C:\\Users\\test\\AppData\\Roaming\\npm\\bun.bat',
  'C:\\Users\\test\\AppData\\Roaming\\npm\\bun.ps1',
]) {
  assert.match(fixture, powerShellBunShim, `Resolve-Bun must recognize wrapper shim fixture: ${fixture}`);
}
assert.doesNotMatch('C:\\Users\\test\\.bun\\bin\\bun.exe', powerShellBunShim, 'Resolve-Bun must retain native bun.exe candidates');
assert.match(resolveBun, /\$candidate -match '\\\.\(\?:cmd\|bat\|ps1\)\$'/, 'Resolve-Bun must replace cmd, bat, and ps1 shims');
assert.match(resolveBun, /\$candidate -notmatch '\\.exe\$'/, 'Resolve-Bun must only accept verified native executables');

const unixTemplates = {
  'extract-natives.mjs': unixTemplate('extract-natives.mjs', 'cat > "$CLAWGOD_DIR/extract-natives.mjs" << \'EXTRACTOR_EOF\''),
  'post-process.mjs': unixTemplate('post-process.mjs', 'cat > "$CLAWGOD_DIR/post-process.mjs" << \'POSTPROC_EOF\''),
  'repatch.mjs': unixTemplate('repatch.mjs', 'cat > "$CLAWGOD_DIR/repatch.mjs" << \'REPATCH_EOF\''),
  'vendor-transaction.mjs': unixTemplate('vendor-transaction.mjs', 'cat > "$CLAWGOD_DIR/vendor-transaction.mjs" << \'VENDOR_TRANSACTION_EOF\''),
  'patch.mjs': unixTemplate('patch.mjs', 'cat > "$CLAWGOD_DIR/patch.mjs" << \'PATCHER_EOF\''),
  'proxy-fetch.mjs': unixTemplate('proxy-fetch.mjs', 'cat > "$CLAWGOD_DIR/proxy-fetch.mjs" << \'PROXY_FETCH_EOF\''),
  'fetch-file.mjs': unixTemplate('fetch-file.mjs', 'cat > "$CLAWGOD_DIR/fetch-file.mjs" << \'FETCH_FILE_EOF\''),
};
const windowsTemplates = {
  'extract-natives.mjs': powerShellRuntimePayload('ExtractorBytes').toString('utf8').trimEnd(),
  'post-process.mjs': powerShellRuntimePayload('PostProcessorBytes').toString('utf8').trimEnd(),
  'repatch.mjs': powerShellRuntimePayload('RepatcherBytes').toString('utf8').trimEnd(),
  'vendor-transaction.mjs': powerShellRuntimePayload('VendorTransactionBytes').toString('utf8').trimEnd(),
  'patch.mjs': powerShellRuntimePayload('PatcherBytes').toString('utf8').trimEnd(),
  'proxy-fetch.mjs': powerShellRuntimePayload('ProxyFetchBytes').toString('utf8').trimEnd(),
  'fetch-file.mjs': powerShellRuntimePayload('FetchFileBytes').toString('utf8').trimEnd(),
};

const runtimeDefinitions = [
  ['proxy-fetch.mjs', 'proxy-fetch.mjs', 'ProxyFetchBytes', 'cat > "$CLAWGOD_DIR/proxy-fetch.mjs" << \'PROXY_FETCH_EOF\''],
  ['fetch-file.mjs', 'fetch-file.mjs', 'FetchFileBytes', 'cat > "$CLAWGOD_DIR/fetch-file.mjs" << \'FETCH_FILE_EOF\''],
  ['fetch-package.mjs', 'fetch-package.mjs', 'FetchPackageBytes', 'cat > "$FETCH_SCRIPT" << \'FETCH_PACKAGE_EOF\''],
  ['install-ripgrep.mjs', 'install-ripgrep.mjs', 'InstallRipgrepBytes', 'cat > "$CLAWGOD_DIR/install-ripgrep.mjs" << \'INSTALL_RIPGREP_EOF\''],
  ['extract-natives.mjs', 'extractor.mjs', 'ExtractorBytes', 'cat > "$CLAWGOD_DIR/extract-natives.mjs" << \'EXTRACTOR_EOF\''],
  ['post-process.mjs', 'post-processor.mjs', 'PostProcessorBytes', 'cat > "$CLAWGOD_DIR/post-process.mjs" << \'POSTPROC_EOF\''],
  ['repatch.mjs', 'repatcher.mjs', 'RepatcherBytes', 'cat > "$CLAWGOD_DIR/repatch.mjs" << \'REPATCH_EOF\''],
  ['vendor-transaction.mjs', 'vendor-transaction.mjs', 'VendorTransactionBytes', 'cat > "$CLAWGOD_DIR/vendor-transaction.mjs" << \'VENDOR_TRANSACTION_EOF\''],
  ['patch.mjs', 'patcher.mjs', 'PatcherBytes', 'cat > "$CLAWGOD_DIR/patch.mjs" << \'PATCHER_EOF\''],
  ['cli.cjs', 'wrapper.cjs', 'WrapperBytes', 'cat > "$CLAWGOD_DIR/cli.cjs" << \'WRAPPER_EOF\''],
  ['openai-proxy.cjs', 'openai-proxy.cjs', 'OpenAIProxyBytes', 'cat > "$CLAWGOD_DIR/openai-proxy.cjs" << \'PROXY_EOF\''],
  ['claude-mem-compat.cjs', 'claude-mem-compat.cjs', 'ClaudeMemCompatBytes', 'cat > "$CLAWGOD_DIR/claude-mem-compat.cjs" << \'CLAUDE_MEM_COMPAT_EOF\''],
  ['plugin-dependencies.mjs', 'plugin-dependencies.mjs', 'PluginDependenciesBytes', 'cat > "$CLAWGOD_DIR/plugin-dependencies.mjs" << \'PLUGIN_DEPENDENCIES_EOF\''],
];

assert.match(unix, /cp "\$CLAWGOD_DIR\/proxy-fetch\.mjs" "\$NATIVE_BIN_TMPDIR\/proxy-fetch\.mjs"/, 'install.sh must place the shared proxy module beside temporary fetch-package.mjs');
assert.match(windows, /WriteAllBytes\(\(Join-Path \$NativeBinTmpDir "proxy-fetch\.mjs"\), \$ProxyFetchBytes\)/, 'install.ps1 must place the shared proxy module beside temporary fetch-package.mjs');
assert.match(unix, /rm -rf[^\n]+"\$CLAWGOD_DIR\/proxy-fetch\.mjs"/, 'install.sh uninstall must remove the shared proxy module');
assert.match(windows, /foreach \(\$f in @\([^\r\n]+"proxy-fetch\.mjs"/, 'install.ps1 uninstall must remove the shared proxy module');

for (const [generatedName, canonicalName, powerShellVariable, unixMarker] of runtimeDefinitions) {
  const canonical = Buffer.from(canonicalRuntime[canonicalName]);
  const powerShellBytes = powerShellRuntimePayload(powerShellVariable);
  const unixBytes = Buffer.from(`${unixTemplate(generatedName, unixMarker)}\n`);
  assert.deepEqual(
    [unixBytes, powerShellBytes],
    [canonical, canonical],
    `both generated installers must write the canonical ${canonicalName} bytes`,
  );
  assert.equal(canonical.at(-1), 0x0a, `${canonicalName} must retain one LF terminal newline`);
  assert.equal(canonical.includes(0x0d), false, `${canonicalName} canonical bytes must not contain CR`);
  assert.equal(canonical.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false, `${canonicalName} canonical bytes must not contain a UTF-8 BOM`);
  assert.match(
    windows,
    new RegExp(`\\[System\\.IO\\.File\\]::WriteAllBytes\\([^\\n]*\\$${powerShellVariable}\\)`),
    `install.ps1 must write $${powerShellVariable} without text transcoding`,
  );
}

const canonicalHudBytes = Buffer.from(canonicalRuntime['claude-hud-statusline.mjs']);
assert.equal(canonicalHudBytes.at(-1), 0x0a, 'claude-hud-statusline.mjs must retain one LF terminal newline');
assert.equal(canonicalHudBytes.includes(0x0d), false, 'claude-hud-statusline.mjs canonical bytes must not contain CR');
assert.equal(canonicalHudBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false, 'claude-hud-statusline.mjs canonical bytes must not contain a UTF-8 BOM');

const powerShellByteFixture = mkdtempSync(join(tmpdir(), 'clawgod-powershell-runtime-bytes-'));
assertTemporaryPath(powerShellByteFixture, 'PowerShell runtime byte fixture');
try {
  for (const [generatedName, canonicalName, powerShellVariable] of runtimeDefinitions) {
    const destination = join(powerShellByteFixture, generatedName);
    writeFileSync(destination, powerShellRuntimePayload(powerShellVariable));
    assert.deepEqual(readFileSync(destination), Buffer.from(canonicalRuntime[canonicalName]), `${generatedName} decoded WriteAllBytes payload must be canonical`);
  }
} finally {
  rmSync(powerShellByteFixture, { recursive: true, force: true });
}

function peBunFixture(modules) {
  const data = [];
  const records = [];
  let cursor = 0;
  for (const module of modules) {
    const name = Buffer.from(module.name);
    const content = Buffer.from(module.content);
    const nameOffset = cursor;
    data.push(name);
    cursor += name.length;
    const contentOffset = cursor;
    data.push(content);
    cursor += content.length;
    const record = Buffer.alloc(52);
    record.writeUInt32LE(nameOffset, 0);
    record.writeUInt32LE(name.length, 4);
    record.writeUInt32LE(contentOffset, 8);
    record.writeUInt32LE(content.length, 12);
    record.writeUInt8(module.loader, 49);
    records.push(record);
  }
  const table = Buffer.concat(records);
  const offsets = Buffer.alloc(32);
  offsets.writeUInt32LE(cursor, 8);
  offsets.writeUInt32LE(table.length, 12);
  offsets.writeUInt32LE(0, 16);
  const payload = Buffer.concat([...data, table, offsets, Buffer.from('\n---- Bun! ----\n')]);
  const section = Buffer.alloc(8 + payload.length);
  section.writeBigUInt64LE(BigInt(payload.length), 0);
  payload.copy(section, 8);

  const peOffset = 0x80;
  const optionalHeaderSize = 0x20;
  const sectionTable = peOffset + 0x18 + optionalHeaderSize;
  const rawOffset = 0x200;
  const binary = Buffer.alloc(rawOffset + section.length);
  binary.write('MZ', 0, 'ascii');
  binary.writeUInt32LE(peOffset, 0x3c);
  binary.write('PE\0\0', peOffset, 'ascii');
  binary.writeUInt16LE(0x8664, peOffset + 0x04);
  binary.writeUInt16LE(1, peOffset + 0x06);
  binary.writeUInt16LE(optionalHeaderSize, peOffset + 0x14);
  binary.writeUInt16LE(0x20b, peOffset + 0x18);
  binary.write('.bun', sectionTable, 'ascii');
  binary.writeUInt32LE(section.length, sectionTable + 0x10);
  binary.writeUInt32LE(rawOffset, sectionTable + 0x14);
  section.copy(binary, rawOffset);
  return binary;
}

const extractorFixture = mkdtempSync(join(tmpdir(), 'clawgod-canonical-extractor-'));
assertTemporaryPath(extractorFixture, 'canonical extractor fixture');
try {
  const binary = join(extractorFixture, 'fixture.exe');
  const output = join(extractorFixture, 'output');
  const cliBytes = Buffer.from('(function(exports,require,module,__filename,__dirname){return 7})');
  const napiBytes = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);
  writeFileSync(binary, peBunFixture([
    { name: 'entry.js', content: cliBytes, loader: 1 },
    { name: 'native/image.node', content: napiBytes, loader: 10 },
  ]));
  const extractorPath = fileURLToPath(new URL('../src/generic/runtime/extractor.mjs', import.meta.url));
  const extracted = spawnSync(process.execPath, [extractorPath, binary, output], { encoding: 'utf8' });
  assert.equal(extracted.status, 0, extracted.stderr);
  assert.deepEqual(readFileSync(join(output, 'cli.original.js')), cliBytes, 'canonical extractor must emit the entry module bytes');
  assert.deepEqual(readFileSync(join(output, 'vendor', 'image', 'x64-win32', 'image.node')), napiBytes, 'canonical extractor must emit the napi module bytes');

  assert.match(extracted.stdout, /^Modules: \d+/m, 'extractor default must print the Modules summary');
  assert.match(extracted.stdout, /^Extracted: \d+ cli\.js/m, 'extractor default must print the Extracted summary');
  assert.doesNotMatch(extracted.stdout, /^  (cli\.js|chunk|asset|napi)\s+\d/m, 'extractor default must not print per-module lines');

  const verboseOutput = join(extractorFixture, 'verbose-output');
  const verbose = spawnSync(process.execPath, [extractorPath, binary, verboseOutput, '--verbose'], { encoding: 'utf8' });
  assert.equal(verbose.status, 0, verbose.stderr);
  assert.match(verbose.stdout, /^  (cli\.js|napi)\s+\d/m, 'extractor --verbose must print per-module lines');
  assert.deepEqual(readFileSync(join(verboseOutput, 'cli.original.js')), cliBytes, 'extractor --verbose must still emit identical entry bytes');

  const noNapiBinary = join(extractorFixture, 'no-napi.exe');
  const noNapiOutput = join(extractorFixture, 'no-napi-output');
  writeFileSync(noNapiBinary, peBunFixture([{ name: 'entry.js', content: cliBytes, loader: 1 }]));
  const noNapiExtracted = spawnSync(process.execPath, [extractorPath, noNapiBinary, noNapiOutput], { encoding: 'utf8' });
  assert.equal(noNapiExtracted.status, 0, noNapiExtracted.stderr);
  assert.equal(lstatSync(join(noNapiOutput, 'vendor')).isDirectory(), true, 'canonical extractor must emit a real vendor root when no napi modules exist');

  const invalidOutput = join(extractorFixture, 'invalid-output');
  const invalidBinary = join(extractorFixture, 'invalid.exe');
  writeFileSync(invalidBinary, 'not a native binary');
  const invalid = spawnSync(process.execPath, [extractorPath, invalidBinary, invalidOutput], { encoding: 'utf8' });
  assert.notEqual(invalid.status, 0, 'canonical extractor must reject an invalid native binary');
  assert.equal(existsSync(invalidOutput), false, 'canonical extractor must not create output after parse failure');
} finally {
  rmSync(extractorFixture, { recursive: true, force: true });
}

const postProcessorFixture = mkdtempSync(join(tmpdir(), 'clawgod-canonical-post-processor-'));
assertTemporaryPath(postProcessorFixture, 'canonical post-processor fixture');
try {
  const script = join(postProcessorFixture, 'post-processor.mjs');
  writeFileSync(script, canonicalRuntime['post-processor.mjs']);
  writeFileSync(join(postProcessorFixture, 'cli.original.js'), `// @bun @bytecode @bun-cjs
(function(exports,require,module,__filename,__dirname){
const native=require('/$bunfs/root/image-processor.node');
const leaked=x.fileURLToPath("file:///home/runner/work/claude-cli-internal/claude-cli-internal/src/index.ts");
})`);
  const processed = spawnSync(process.execPath, [script], { cwd: postProcessorFixture, encoding: 'utf8' });
  assert.equal(processed.status, 0, processed.stderr);
  assert.equal(existsSync(join(postProcessorFixture, 'cli.original.js')), false, 'canonical post-processor must remove the extracted source after success');
  const output = readFileSync(join(postProcessorFixture, 'cli.original.cjs'), 'utf8');
  assert.match(output, /^\(function/, 'canonical post-processor must strip leading Bun pragmas');
  assert.match(output, /vendor.*image-processor.*x64.*win32.*image-processor\.node/s, 'canonical post-processor must rewrite bunfs native module lookup');
  assert.match(output, /const leaked=__filename;/, 'canonical post-processor must rewrite build-time file paths');
  assert.match(output, /\}\)\(exports, require, module, __filename, __dirname\)$/, 'canonical post-processor must invoke the outer CommonJS wrapper');

  const missingFixture = join(postProcessorFixture, 'missing');
  mkdirSync(missingFixture);
  const missingScript = join(missingFixture, 'post-processor.mjs');
  writeFileSync(missingScript, canonicalRuntime['post-processor.mjs']);
  const missing = spawnSync(process.execPath, [missingScript], { cwd: missingFixture, encoding: 'utf8' });
  assert.notEqual(missing.status, 0, 'canonical post-processor must fail when cli.original.js is missing');
  assert.equal(existsSync(join(missingFixture, 'cli.original.cjs')), false, 'failed canonical post-processing must not create output');
} finally {
  rmSync(postProcessorFixture, { recursive: true, force: true });
}

for (const [name, body] of Object.entries(unixTemplates)) {
  assert.match(body, /^#!\/usr\/bin\/env bun\n/, `install.sh ${name} must run with Bun`);
  assert.match(windowsTemplates[name], /^#!\/usr\/bin\/env bun\n/, `install.ps1 ${name} must run with Bun`);
}

for (const [name, patcher] of [
  ['install.sh', unixTemplates['patch.mjs']],
  ['install.ps1', windowsTemplates['patch.mjs']],
]) {
  for (const removedFeature of [
    'Fast mode model label reflects provider model',
    'Fast Messages protocol',
    'Fast mode org check bypass',
    'applyFastMessagesProtocolPatch',
    'applyFastModeOrgCheckPatch',
    '__clawgod_fast_model_label__',
    '__clawgod_fast_messages_protocol__',
    '__clawgod_fast_mode_org_check_bypass__',
    'fast-mode-2026-02-01',
    'CLAUDE_CODE_SKIP_FAST_MODE_ORG_CHECK',
  ]) {
    assert.doesNotMatch(patcher, new RegExp(removedFeature), `${name} must not embed ${removedFeature}`);
  }
}

const lifecyclePositions = {
  unix: {
    bun: unix.indexOf('info "Bun: $("$BUN_BIN" --version)"'),
    fetch: unix.indexOf('cat > "$CLAWGOD_DIR/fetch-file.mjs"'),
    module: unix.indexOf('cat > "$CLAWGOD_DIR/plugin-dependencies.mjs"'),
    smoke: unix.indexOf('info "Bun loads cli.original.cjs"'),
    launcher: unix.indexOf('info "Command \'clawgod\' → patched'),
    ensure: unix.indexOf('"$CLAWGOD_DIR/plugin-dependencies.mjs" ensure'),
    memory: unix.indexOf('"$CLAWGOD_DIR/claude-mem-compat.cjs" install'),
  },
  windows: {
    bun: windows.indexOf('Write-OK "Bun: $(& $BunBin --version)"'),
    fetch: windows.indexOf('Install-FetchFileHelper', windows.indexOf('# --- Bun prerequisite')),
    module: windows.indexOf('# --- Optional Claude plugin dependencies'),
    smoke: windows.indexOf('Write-OK "Bun loads cli.original.cjs"'),
    launcher: windows.indexOf('Write-OK "Commands \'claude\' + \'clawgod\' -> patched"'),
    ensure: windows.indexOf('(Join-Path $ClawDir "plugin-dependencies.mjs") ensure'),
    memory: windows.indexOf('(Join-Path $ClawDir "claude-mem-compat.cjs") install'),
  },
};
for (const [name, positions] of Object.entries(lifecyclePositions)) {
  assert.ok(positions.bun >= 0 && positions.bun < positions.fetch, `${name}: fetch helper must be generated after Bun is available`);
  assert.ok(positions.fetch < positions.module, `${name}: plugin manager must be generated after fetch-file.mjs`);
  assert.ok(positions.smoke >= 0 && positions.smoke < positions.launcher, `${name}: launcher creation must follow the cli.original.cjs smoke test`);
  assert.ok(positions.launcher < positions.ensure, `${name}: plugin ensure must run after launcher creation`);
  assert.ok(positions.ensure < positions.memory, `${name}: plugin ensure must run before claude-mem worker restart compatibility`);
}

const unixOptionalStart = unix.indexOf('# --- Ensure optional Claude plugins');
const unixOptionalEnd = unix.indexOf('\ninstall_claude_mem_compat_helper', unixOptionalStart);
assert.ok(unixOptionalStart >= 0 && unixOptionalEnd > unixOptionalStart, 'install.sh must retain an extractable optional plugin stage');
const unixOptionalBlock = unix.slice(unixOptionalStart, unixOptionalEnd);
const optionalLifecycleRoot = mkdtempSync(join(tmpdir(), 'clawgod plugin lifecycle '));
assertTemporaryPath(optionalLifecycleRoot, 'plugin lifecycle fixture');
try {
  const home = join(optionalLifecycleRoot, 'home');
  const clawgodDir = join(home, '.clawgod');
  const fixtureBin = join(optionalLifecycleRoot, 'bin');
  const fakeBun = join(fixtureBin, 'bun');
  mkdirSync(clawgodDir, { recursive: true });
  mkdirSync(fixtureBin, { recursive: true });
  writeFileSync(join(clawgodDir, 'plugin-dependencies.mjs'), '// lifecycle fixture\n');
  writeFileSync(fakeBun, '#!/bin/sh\n[ "$2" = "ensure" ] || exit 91\nprintf "fixture ensure warning\\n"\nexit 23\n');
  chmodSync(fakeBun, 0o700);
  const optional = spawnSync('/bin/bash', ['-c', `set -e\nwarn() { printf '%s\\n' "$*" >&2; }\n${unixOptionalBlock}\nprintf 'ClawGod Plus installed!\\n'`], {
    encoding: 'utf8',
    env: { HOME: home, CLAWGOD_DIR: clawgodDir, BUN_BIN: fakeBun, PATH: fixtureBin },
  });
  assert.equal(optional.status, 0, optional.stderr);
  assert.match(optional.stderr, /Optional Claude plugin setup could not complete; ClawGod Plus core install will continue/);
  assert.match(optional.stdout, /ClawGod Plus installed!/, 'an optional ensure warning must not skip the final core success message');
} finally {
  rmSync(optionalLifecycleRoot, { recursive: true, force: true });
}

const unixPluginRestoreStart = unixUninstall.indexOf('  # Restore optional Claude plugin integrations');
const unixPluginRestoreEnd = unixUninstall.indexOf('  if [ -f "$CLAWGOD_DIR/claude-mem-compat.cjs" ]; then', unixPluginRestoreStart);
assert.ok(unixPluginRestoreStart >= 0 && unixPluginRestoreEnd > unixPluginRestoreStart, 'install.sh must retain an extractable fail-closed plugin restore guard');
const unixPluginRestoreBlock = unixUninstall.slice(unixPluginRestoreStart, unixPluginRestoreEnd);
const windowsPluginRestoreStart = windowsUninstall.indexOf('    # Restore optional Claude plugin integrations');
const windowsPluginRestoreEnd = windowsUninstall.indexOf('    $claudeMemCompat = Join-Path $ClawDir "claude-mem-compat.cjs"', windowsPluginRestoreStart);
assert.ok(windowsPluginRestoreStart >= 0 && windowsPluginRestoreEnd > windowsPluginRestoreStart, 'install.ps1 must retain an extractable fail-closed plugin restore guard');
const windowsPluginRestoreBlock = windowsUninstall.slice(windowsPluginRestoreStart, windowsPluginRestoreEnd);
const uninstallLifecycleRoot = mkdtempSync(join(tmpdir(), 'clawgod plugin uninstall '));
assertTemporaryPath(uninstallLifecycleRoot, 'plugin uninstall fixture');
try {
  function runUnixPluginGuard(label, { module, state, restoreExit = 0 }) {
    const root = join(uninstallLifecycleRoot, label);
    const home = join(root, 'home');
    const clawgodDir = join(home, '.clawgod');
    const fixtureBin = join(root, 'bin');
    const fakeBun = join(fixtureBin, 'bun');
    const restored = join(root, 'restored');
    const continued = join(root, 'continued');
    const artifacts = {
      module: join(clawgodDir, 'plugin-dependencies.mjs'),
      state: join(clawgodDir, 'plugin-dependencies-state.json'),
      hud: join(clawgodDir, 'claude-hud-statusline.mjs'),
      memory: join(clawgodDir, 'claude-mem-compat.cjs'),
      launcher: join(root, 'bin-home', 'claude'),
      runtime: join(clawgodDir, 'cli.cjs'),
    };
    mkdirSync(clawgodDir, { recursive: true });
    mkdirSync(fixtureBin, { recursive: true });
    for (const artifact of [artifacts.hud, artifacts.memory, artifacts.launcher, artifacts.runtime]) {
      mkdirSync(dirname(artifact), { recursive: true });
      writeFileSync(artifact, 'managed fixture\n');
    }
    if (module) writeFileSync(artifacts.module, '// plugin manager fixture\n');
    if (state) writeFileSync(artifacts.state, '{"schemaVersion":1}\n');
    writeFileSync(fakeBun, `#!/bin/sh\n[ "$2" = "uninstall" ] || exit 92\nprintf 'called\\n' > ${JSON.stringify(restored)}\nexit ${restoreExit}\n`);
    chmodSync(fakeBun, 0o700);
    const run = spawnSync('/bin/bash', ['-c', `set -e\nwarn() { printf '%s\\n' "$*" >&2; }\n${unixPluginRestoreBlock}\nprintf 'continued\\n' > "$CONTINUED"\nrm -f "$CLAWGOD_DIR/claude-mem-compat.cjs" "$LAUNCHER" "$CLAWGOD_DIR/cli.cjs" "$CLAWGOD_DIR/plugin-dependencies.mjs" "$CLAWGOD_DIR/plugin-dependencies-state.json" "$CLAWGOD_DIR/claude-hud-statusline.mjs"`], {
      encoding: 'utf8',
      env: {
        HOME: home,
        CLAWGOD_DIR: clawgodDir,
        BUN_BIN: fakeBun,
        PATH: `${fixtureBin}:${isolatedUnixPath(root)}`,
        CONTINUED: continued,
        LAUNCHER: artifacts.launcher,
      },
    });
    return { run, restored, continued, artifacts };
  }

  const both = runUnixPluginGuard('state-and-module', { module: true, state: true });
  assert.equal(both.run.status, 0, both.run.stderr);
  assert.equal(existsSync(both.restored), true, 'state+module must run optional plugin restoration');
  assert.equal(existsSync(both.continued), true, 'successful state+module restoration must continue uninstall');

  const stateOnly = runUnixPluginGuard('state-only', { module: false, state: true });
  assert.notEqual(stateOnly.run.status, 0, 'state without its restoration module must fail closed');
  assert.match(stateOnly.run.stderr, /Could not restore optional Claude plugin integrations; ClawGod Plus was not uninstalled/);
  assert.equal(existsSync(stateOnly.restored), false, 'state-only must not invoke a missing restoration module');
  assert.equal(existsSync(stateOnly.continued), false, 'state-only must not reach claude-mem, launcher, or runtime cleanup');
  for (const artifact of [stateOnly.artifacts.state, stateOnly.artifacts.hud, stateOnly.artifacts.memory, stateOnly.artifacts.launcher, stateOnly.artifacts.runtime]) {
    assert.equal(existsSync(artifact), true, `state-only must retain ${artifact}`);
  }

  const moduleOnly = runUnixPluginGuard('module-only', { module: true, state: false });
  assert.equal(moduleOnly.run.status, 0, moduleOnly.run.stderr);
  assert.equal(existsSync(moduleOnly.restored), true, 'module-only generation residue must run the no-state cleanup path');
  assert.equal(existsSync(moduleOnly.continued), true, 'module-only generation residue may continue uninstall');

  const neither = runUnixPluginGuard('neither', { module: false, state: false });
  assert.equal(neither.run.status, 0, neither.run.stderr);
  assert.equal(existsSync(neither.restored), false, 'no plugin artifacts must not run restoration');
  assert.equal(existsSync(neither.continued), true, 'no plugin artifacts may continue uninstall');

  const failedRestore = runUnixPluginGuard('restore-conflict', { module: true, state: true, restoreExit: 42 });
  assert.notEqual(failedRestore.run.status, 0, 'plugin restoration failure must abort uninstall');
  assert.match(failedRestore.run.stderr, /Could not restore optional Claude plugin integrations; ClawGod Plus was not uninstalled/);
  assert.equal(existsSync(failedRestore.continued), false, 'failed restoration must not reach later cleanup');
  for (const artifact of Object.values(failedRestore.artifacts)) {
    assert.equal(existsSync(artifact), true, `failed restoration must retain ${artifact}`);
  }
} finally {
  rmSync(uninstallLifecycleRoot, { recursive: true, force: true });
}

assert.match(
  windowsPluginRestoreBlock,
  /if \(\(Test-Path \$pluginState\) -and -not \(Test-Path \$pluginDependencies\)\) \{[\s\S]*Could not restore optional Claude plugin integrations; ClawGod Plus was not uninstalled[\s\S]*exit 1[\s\S]*\}\s*if \(Test-Path \$pluginDependencies\)/,
  'PowerShell must implement the same state-only fail-closed and module-present restore/cleanup truth table',
);

for (const [name, uninstall] of [['install.sh', unixUninstall], ['install.ps1', windowsUninstall]]) {
  const pluginRestore = uninstall.indexOf('plugin-dependencies.mjs');
  const claudeMemRestore = uninstall.indexOf('claude-mem-compat.cjs');
  const launcherRestore = uninstall.indexOf(name === 'install.sh' ? 'Original claude restored' : 'Original claude restored');
  const cleanup = uninstall.indexOf(name === 'install.sh' ? 'rm -rf "$CLAWGOD_DIR/node_modules"' : 'foreach ($f in @(');
  assert.ok(pluginRestore >= 0 && pluginRestore < claudeMemRestore, `${name}: plugin restoration must run before claude-mem compatibility restore`);
  assert.ok(pluginRestore < launcherRestore, `${name}: plugin restoration must run before launcher restore`);
  assert.ok(pluginRestore < cleanup, `${name}: plugin restoration must run before managed runtime cleanup`);
  const cleanupArtifacts = name === 'install.sh'
    ? ['plugin-dependencies.mjs', 'claude-hud-statusline.mjs', 'plugin-dependencies-state.json', '"$CLAWGOD_DIR/cache"', '"$CLAWGOD_DIR/staging"']
    : ['plugin-dependencies.mjs', 'claude-hud-statusline.mjs', 'plugin-dependencies-state.json', '"cache"', '"staging"'];
  for (const artifact of cleanupArtifacts) {
    const expression = name === 'install.ps1' ? artifact.replaceAll('/', '\\') : artifact;
    assert.ok(uninstall.indexOf(expression, cleanup) >= cleanup, `${name}: successful cleanup must remove ${expression}`);
  }
  for (const preserved of ['clawgod-marketplaces', 'installed_plugins.json', 'known_marketplaces.json', 'enabledPlugins']) {
    assert.doesNotMatch(uninstall.slice(cleanup), new RegExp(preserved.replace('.', '\\.')), `${name}: managed cleanup must preserve ${preserved}`);
  }
}

const unixApplyStart = unix.indexOf('dim "Applying patches ..."');
const unixApplyEnd = unix.indexOf('\n# ─── Create default configs', unixApplyStart);
assert.ok(unixApplyStart >= 0 && unixApplyEnd > unixApplyStart, 'install.sh must retain the patch application gate');
const unixApplyBlock = unix.slice(unixApplyStart, unixApplyEnd);
const patchGateRoot = mkdtempSync(join(tmpdir(), 'clawgod patch gate '));
assert.equal(realpathSync(dirname(patchGateRoot)), realpathSync(tmpdir()), 'patch gate fixture must be created directly under the system temporary directory');
try {
  const home = join(patchGateRoot, 'home');
  const fixtureBin = join(patchGateRoot, 'bin');
  const fakeBun = join(fixtureBin, 'bun');
  const script = join(patchGateRoot, 'gate.sh');
  const continued = join(patchGateRoot, 'continued');
  const success = join(patchGateRoot, 'success');
  mkdirSync(home);
  mkdirSync(fixtureBin);
  writeFileSync(fakeBun, `#!${process.execPath}\nconsole.log('fixture patch output');process.exit(Number(process.env.PATCH_EXIT||0));\n`, 'utf8');
  chmodSync(fakeBun, 0o700);
  writeFileSync(script, `#!/bin/bash
set -e
BUN_BIN=${JSON.stringify(fakeBun)}
CLAWGOD_DIR=${JSON.stringify(home)}
dim() { :; }
warn() { printf '%s\n' "$*" >&2; }
commit_runtime_transaction() { :; }
run_claude_code_chrome_fix() { : > ${JSON.stringify(continued)}; }
${unixApplyBlock}
: > ${JSON.stringify(success)}
`, 'utf8');
  chmodSync(script, 0o700);

  const runGate = patchExit => spawnSync('/bin/bash', [script], {
    encoding: 'utf8',
    env: { HOME: home, PATH: fixtureBin, PATCH_EXIT: String(patchExit) },
  });
  const failed = runGate(41);
  assert.notEqual(failed.status, 0, 'install.sh must stop when patch.mjs exits nonzero');
  assert.equal(existsSync(continued), false, 'install.sh must stop before the Chrome/post-processing continuation on patch failure');
  assert.equal(existsSync(success), false, 'install.sh must not reach success continuation on patch failure');

  const passed = runGate(0);
  assert.equal(passed.status, 0, passed.stderr);
  assert.equal(existsSync(continued), true, 'install.sh must retain Chrome continuation after a successful patch');
  assert.equal(existsSync(success), true, 'install.sh must retain normal continuation after a successful patch');
} finally {
  rmSync(patchGateRoot, { recursive: true, force: true });
}

const canonicalWindowsApplyBlock = assertPowerShellVendorStatusScope(windowsTemplate, 'src/template/install.ps1');
const windowsApplyBlock = assertPowerShellVendorStatusScope(windows, 'install.ps1');
assert.equal(windowsApplyBlock, canonicalWindowsApplyBlock, 'generated install.ps1 must preserve the canonical vendor status scope exactly');
const preferenceMutation = windowsTemplate.replace(
  'if ($VendorNativePreferenceWasDefined) { $PSNativeCommandUseErrorActionPreference = $false }',
  '',
);
assert.notEqual(preferenceMutation, windowsTemplate, 'native-command preference mutation must remove production handling');
assert.throws(
  () => assertPowerShellVendorStatusScope(preferenceMutation, 'mutated src/template/install.ps1'),
  /must preserve native-command state/,
  'removing scoped native-command preference handling must fail the semantic contract',
);
const missingPreferenceMutation = windowsTemplate.replace(
  'else { Remove-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue }',
  '',
);
assert.notEqual(missingPreferenceMutation, windowsTemplate, 'missing-variable mutation must remove production cleanup');
assert.throws(
  () => assertPowerShellVendorStatusScope(missingPreferenceMutation, 'mutated missing-variable src/template/install.ps1'),
  /must preserve native-command state/,
  'removing the PowerShell 5.1 missing-variable cleanup path must fail the semantic contract',
);
const statusGapMutation = windowsTemplate.replace(
  '& $BunBin (Join-Path $ClawDir "vendor-transaction.mjs") publish $RuntimeVendorDir $RuntimeCandidateVendor $RuntimeRollbackDir\n        $vendorStatus = $LASTEXITCODE',
  '& $BunBin (Join-Path $ClawDir "vendor-transaction.mjs") publish $RuntimeVendorDir $RuntimeCandidateVendor $RuntimeRollbackDir\n        & $BunBin --version\n        $vendorStatus = $LASTEXITCODE',
);
assert.notEqual(statusGapMutation, windowsTemplate, 'native-status gap mutation must insert a clobbering command');
assert.throws(
  () => assertPowerShellVendorStatusScope(statusGapMutation, 'mutated native-status-gap src/template/install.ps1'),
  /must capture native vendor status immediately/,
  'inserting a native command before LASTEXITCODE capture must fail the semantic contract',
);
const statusOverwriteMutation = windowsTemplate.replace(
  '$vendorStatus = $LASTEXITCODE',
  '$vendorStatus = $LASTEXITCODE\n        $vendorStatus = 0',
);
assert.notEqual(statusOverwriteMutation, windowsTemplate, 'native-status overwrite mutation must replace production handling');
assert.throws(
  () => assertPowerShellVendorStatusScope(statusOverwriteMutation, 'mutated native-status-overwrite src/template/install.ps1'),
  /must assign native vendor status exactly once/,
  'overwriting captured LASTEXITCODE must fail the semantic contract',
);
const retainedStatusMutation = windowsTemplate.replace(
  'if ($vendorStatus -eq 22) { $RuntimeTransactionCleanupSafe = $false }',
  '',
);
assert.notEqual(retainedStatusMutation, windowsTemplate, 'retained-status mutation must remove production cleanup protection');
assert.throws(
  () => assertPowerShellVendorStatusScope(retainedStatusMutation, 'mutated retained-status src/template/install.ps1'),
  /must preserve native-command state/,
  'removing exit 22 transaction retention must fail the semantic contract',
);
const nativePromotionMutation = windowsTemplate.replace(
  'throw "Native vendor publication failed."',
  '',
);
assert.notEqual(nativePromotionMutation, windowsTemplate, 'native-promotion mutation must remove production failure promotion');
assert.throws(
  () => assertPowerShellVendorStatusScope(nativePromotionMutation, 'mutated native-promotion src/template/install.ps1'),
  /must preserve native-command state/,
  'removing manual native failure promotion must fail the semantic contract',
);
assert.match(windowsApplyBlock, /\$patchOutput\s*=\s*&\s*\$BunBin/, 'install.ps1 must capture patch output');
assert.match(
  windowsApplyBlock,
  /\(Join-Path \$ClawDir "patch\.mjs"\)\s+--enhancements-file\s+\(Join-Path \$ClawDir "enhancements\.json"\)/,
  'install.ps1 must pass the exact saved enhancement config path to patch.mjs',
);
assert.match(windowsApplyBlock, /\$patchStatus\s*=\s*\$LASTEXITCODE/, 'install.ps1 must preserve patch.mjs native exit status');
assert.match(windowsApplyBlock, /if\s*\(\$patchStatus\s*-ne\s*0\)/, 'install.ps1 must stop on patch.mjs failure');
assert.ok(windowsApplyBlock.indexOf('$patchStatus -ne 0') < windowsApplyBlock.indexOf('Invoke-ChromePostInstallFix'), 'install.ps1 must check patch status before Chrome/post-processing continuation');
assert.match(windows, /\$RuntimeCandidateDir\s*=\s*Join-Path\s+\$RuntimeRollbackDir\s+"candidate"/, 'install.ps1 must stage candidate runtime files in its same-filesystem transaction');
assert.match(windows, /&\s+\$BunBin\s+\$extractorPath\s+\$NativeBin\s+\$RuntimeCandidateDir/, 'install.ps1 must extract candidate native modules outside the live vendor');
assert.match(windowsApplyBlock, /vendor-transaction\.mjs"\) publish \$RuntimeVendorDir \$RuntimeCandidateVendor \$RuntimeRollbackDir/, 'install.ps1 must publish candidate native modules through the shared transaction helper only after mandatory patches pass');
assert.match(windowsApplyBlock, /\$VendorRollbackComplete\s*=\s*\$vendorStatus\s*-eq\s*20\s*-or\s*\$vendorStatus\s*-eq\s*22/, 'install.ps1 must restore the prior CLI only after the shared helper reports verified rollback');
assert.doesNotMatch(windowsApplyBlock, /Move-Item[\s\S]*\$RuntimeCandidateVendor/, 'install.ps1 must not maintain a second native publication implementation');

const pwsh = findPwsh();
if (pwsh) {
  const nativeStatusRoot = mkdtempSync(join(tmpdir(), 'clawgod-powershell-vendor-status-'));
  assertTemporaryPath(nativeStatusRoot, 'PowerShell vendor status fixture');
  try {
    for (const expectedStatus of [20, 22]) {
      const caseRoot = join(nativeStatusRoot, `status-${expectedStatus}`);
      const clawDir = join(caseRoot, 'clawgod');
      const transaction = join(clawDir, '.runtime-rollback');
      const liveVendor = join(clawDir, 'vendor');
      const candidateVendor = expectedStatus === 20
        ? join(transaction, 'candidate', 'vendor')
        : join(caseRoot, 'outside-candidate');
      const target = join(clawDir, 'cli.original.cjs');
      const script = join(caseRoot, 'vendor-status.ps1');
      mkdirSync(transaction, { recursive: true });
      mkdirSync(candidateVendor, { recursive: true });
      mkdirSync(liveVendor, { recursive: true });
      writeFileSync(join(liveVendor, 'ripgrep'), Buffer.from([0x72, 0x67]));
      if (expectedStatus === 20) writeFileSync(join(candidateVendor, 'ripgrep'), Buffer.from([0x63, 0x61, 0x6e, 0x64]));
      writeFileSync(join(clawDir, 'vendor-transaction.mjs'), canonicalRuntime['vendor-transaction.mjs'], 'utf8');
      writeFileSync(join(clawDir, 'patch.mjs'), 'process.exit(0);\n', 'utf8');
      writeFileSync(join(clawDir, 'enhancements.json'), '{}\n', 'utf8');
      writeFileSync(target, 'candidate runtime\n', 'utf8');
      writeFileSync(join(transaction, 'cli.original.cjs'), 'prior runtime\n', 'utf8');
      writeFileSync(script, `$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$BunBin = $env:CLAWGOD_TEST_BUN
$ClawDir = $env:CLAWGOD_TEST_DIR
$RuntimeTarget = Join-Path $ClawDir 'cli.original.cjs'
$RuntimeSourceVersion = Join-Path $ClawDir '.source-version'
$RuntimeRollbackDir = $env:CLAWGOD_TEST_TRANSACTION
$RuntimeCandidateVendor = $env:CLAWGOD_TEST_CANDIDATE
$RuntimeVendorDir = Join-Path $ClawDir 'vendor'
$RuntimeHadTarget = $true
$RuntimeHadSourceVersion = $false
$RuntimeTransactionCommitted = $false
$RuntimeVendorPublishStarted = $false
$VendorRollbackComplete = $false
$RuntimeTransactionCleanupSafe = $true
$NoUpgrade = $false
function Write-Dim { param([string]$Message) }
function Write-Err { param([string]$Message); [Console]::Error.WriteLine($Message) }
function Invoke-ChromePostInstallFix {}
$Caught = $false
try {
    try {
${windowsApplyBlock}
} catch {
    $Caught = $true
}
[ordered]@{
    status = $vendorStatus
    nativePreference = $PSNativeCommandUseErrorActionPreference
    nativePreferenceDefined = Test-Path Variable:PSNativeCommandUseErrorActionPreference
    errorActionPreference = [string]$ErrorActionPreference
    rollbackComplete = $VendorRollbackComplete
    cleanupSafe = $RuntimeTransactionCleanupSafe
    caught = $Caught
    target = [System.IO.File]::ReadAllText($RuntimeTarget)
    transactionExists = Test-Path -LiteralPath $RuntimeRollbackDir
} | ConvertTo-Json -Compress
`, 'utf8');

      const run = spawnSync(pwsh, ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: caseRoot,
          USERPROFILE: caseRoot,
          CLAWGOD_TEST_BUN: process.execPath,
          CLAWGOD_TEST_DIR: clawDir,
          CLAWGOD_TEST_TRANSACTION: transaction,
          CLAWGOD_TEST_CANDIDATE: candidateVendor,
        },
      });
      assert.equal(run.status, 0, `PowerShell helper status ${expectedStatus} fixture must complete:\n${run.stdout}${run.stderr}`);
      const resultLine = run.stdout.trim().split(/\r?\n/).findLast(line => line.startsWith('{'));
      assert.ok(resultLine, `PowerShell helper status ${expectedStatus} fixture must emit JSON:\n${run.stdout}${run.stderr}`);
      const result = JSON.parse(resultLine);
      assert.equal(result.status, expectedStatus, `PowerShell must capture helper exit ${expectedStatus}`);
      assert.equal(result.nativePreference, true, `PowerShell must restore native-command preference after helper exit ${expectedStatus}`);
      assert.equal(result.nativePreferenceDefined, true, `PowerShell must restore native-command preference existence after helper exit ${expectedStatus}`);
      assert.equal(result.errorActionPreference, 'Stop', `PowerShell must not weaken ErrorActionPreference around helper exit ${expectedStatus}`);
      assert.equal(result.rollbackComplete, true, `PowerShell helper exit ${expectedStatus} must restore the prior CLI`);
      assert.equal(result.cleanupSafe, expectedStatus === 20, `PowerShell helper exit ${expectedStatus} must preserve cleanup semantics`);
      assert.equal(result.caught, true, `PowerShell helper exit ${expectedStatus} must reach caller failure handling`);
      assert.equal(result.target, 'prior runtime\n', `PowerShell helper exit ${expectedStatus} must restore prior CLI bytes`);
      assert.equal(result.transactionExists, expectedStatus === 22, `PowerShell helper exit ${expectedStatus} must ${expectedStatus === 22 ? 'retain' : 'clean'} transaction data`);
    }
  } finally {
    rmSync(nativeStatusRoot, { recursive: true, force: true });
  }
} else {
  console.log('PowerShell native vendor status checks skipped: pwsh unavailable');
}

const repatchRoot = mkdtempSync(join(tmpdir(), `clawgod repatch "quoted" 'gate' `));
assert.equal(realpathSync(dirname(repatchRoot)), realpathSync(tmpdir()), 'repatch fixture must be created directly under the system temporary directory');
try {
  const installedRoot = realpathSync(repatchRoot);
  const native = join(repatchRoot, '2.1.226');
  const repatch = join(repatchRoot, 'repatch.mjs');
  const fixtureHome = join(repatchRoot, 'home');
  const fixtureBin = join(repatchRoot, 'bin');
  const target = join(repatchRoot, 'cli.original.cjs');
  const sourceVersion = join(repatchRoot, '.source-version');
  const vendor = join(repatchRoot, 'vendor');
  const oldNative = join(vendor, 'native-addon', 'arm64-darwin', 'native-addon.node');
  const oldOnly = join(vendor, 'old-only', 'nested', 'data.bin');
  const candidateNative = join(vendor, 'candidate-addon', 'arm64-darwin', 'candidate-addon.node');
  const ripgrep = join(vendor, 'ripgrep', 'bin', 'rg');
  const enhancementsFile = join(installedRoot, 'enhancements.json');
  const patchArgs = join(repatchRoot, 'patch-args.json');
  const savedConfig = '{\n  "schemaVersion": 1,\n  "mode": "custom",\n  "enabled": [\n    "agents"\n  ]\n}\n';
  const priorRuntime = 'prior installed runtime\n';
  const candidateRuntime = 'candidate runtime\n';
  mkdirSync(fixtureHome);
  mkdirSync(fixtureBin);
  assertTemporaryPath(fixtureHome, 'repatch HOME');
  assertTemporaryPath(fixtureBin, 'repatch PATH');
  writeFileSync(native, 'fixture native', 'utf8');
  writeFileSync(repatch, canonicalRuntime['repatcher.mjs'], 'utf8');
  writeFileSync(join(repatchRoot, 'vendor-transaction.mjs'), canonicalRuntime['vendor-transaction.mjs'], 'utf8');
  writeFileSync(join(repatchRoot, 'extract-natives.mjs'), `import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';\nimport { join } from 'node:path';\nconst output = process.argv.at(-1);\nconst native = join(output, 'vendor', 'candidate-addon', 'arm64-darwin', 'candidate-addon.node');\nmkdirSync(join(output, 'vendor', 'candidate-addon', 'arm64-darwin'), { recursive: true });\nwriteFileSync(join(output, 'cli.original.js'), 'candidate source');\nwriteFileSync(native, Buffer.from([0xca, 0xfe, 0xba, 0xbe]));\nchmodSync(native, 0o751);\n`, 'utf8');
  writeFileSync(join(repatchRoot, 'post-process.mjs'), `import { writeFileSync } from 'node:fs';\nimport { dirname, join } from 'node:path';\nwriteFileSync(join(dirname(import.meta.path), 'cli.original.cjs'), ${JSON.stringify(candidateRuntime)}, 'utf8');\n`, 'utf8');
  writeFileSync(join(repatchRoot, 'patch.mjs'), `import { writeFileSync } from 'node:fs';\nwriteFileSync(process.env.PATCH_ARGS, JSON.stringify(process.argv.slice(2)), 'utf8');\nprocess.exit(Number(process.env.PATCH_EXIT||0));\n`, 'utf8');
  writeFileSync(target, priorRuntime, 'utf8');
  writeFileSync(sourceVersion, '2.1.225\n', 'utf8');
  writeFileSync(enhancementsFile, savedConfig, { mode: 0o600 });
  mkdirSync(dirname(oldNative), { recursive: true });
  mkdirSync(dirname(oldOnly), { recursive: true });
  mkdirSync(dirname(ripgrep), { recursive: true });
  writeFileSync(oldNative, Buffer.from([0x00, 0x11, 0x80, 0xff]), { mode: 0o640 });
  writeFileSync(oldOnly, Buffer.from([0xde, 0xad, 0xbe, 0xef]), { mode: 0o605 });
  writeFileSync(ripgrep, Buffer.from([0x72, 0x67, 0x00, 0xff]), { mode: 0o711 });
  const configBefore = statSync(enhancementsFile);
  const ripgrepBefore = lstatSync(ripgrep);
  const runRepatch = patchExit => spawnSync(process.execPath, [repatch, native], {
    cwd: repatchRoot,
    encoding: 'utf8',
    env: {
      HOME: fixtureHome,
      PATH: fixtureBin,
      TMPDIR: repatchRoot,
      BUN_INSTALL_CACHE_DIR: join(repatchRoot, 'bun-install-cache'),
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(repatchRoot, 'bun-transpiler-cache'),
      XDG_CACHE_HOME: join(repatchRoot, 'xdg-cache'),
      PATCH_ARGS: patchArgs,
      PATCH_EXIT: String(patchExit),
    },
  });
  const failed = runRepatch(41);
  assert.notEqual(failed.status, 0, 'repatch.mjs must propagate a mandatory patch failure');
  assert.deepEqual(JSON.parse(readFileSync(patchArgs, 'utf8')), ['--enhancements-file', enhancementsFile], 'repatch.mjs must pass the exact saved config path as argv');
  assert.equal(readFileSync(target, 'utf8'), priorRuntime, 'repatch.mjs must restore the prior runtime after mandatory patch failure');
  assert.equal(readFileSync(sourceVersion, 'utf8'), '2.1.225\n', 'repatch.mjs must preserve the prior source marker after mandatory patch failure');
  assert.deepEqual(readFileSync(oldNative), Buffer.from([0x00, 0x11, 0x80, 0xff]), 'repatch.mjs must preserve prior native bytes after mandatory patch failure');
  assert.equal(statSync(oldNative).mode & 0o7777, 0o640, 'repatch.mjs must preserve prior native mode after mandatory patch failure');
  assert.deepEqual(readFileSync(oldOnly), Buffer.from([0xde, 0xad, 0xbe, 0xef]), 'repatch.mjs must preserve nested old-only vendor bytes after mandatory patch failure');
  assert.equal(existsSync(candidateNative), false, 'repatch.mjs must not publish candidate native modules on mandatory patch failure');
  assert.deepEqual(readFileSync(ripgrep), Buffer.from([0x72, 0x67, 0x00, 0xff]), 'repatch.mjs must preserve managed ripgrep bytes on failure');
  assert.equal(lstatSync(ripgrep).ino, ripgrepBefore.ino, 'repatch.mjs must preserve managed ripgrep identity on failure');
  const passed = runRepatch(0);
  assert.equal(passed.status, 0, passed.stderr);
  assert.deepEqual(JSON.parse(readFileSync(patchArgs, 'utf8')), ['--enhancements-file', enhancementsFile], 'successful repatch must use the same exact config argv');
  assert.equal(readFileSync(target, 'utf8'), candidateRuntime, 'successful repatch must retain the candidate runtime');
  assert.equal(readFileSync(sourceVersion, 'utf8'), '2.1.226\n', 'repatch.mjs must retain its success marker after a zero-failure patch');
  assert.deepEqual(readFileSync(candidateNative), Buffer.from([0xca, 0xfe, 0xba, 0xbe]), 'successful repatch must publish candidate native bytes');
  assert.equal(statSync(candidateNative).mode & 0o7777, 0o751, 'successful repatch must publish candidate native mode');
  assert.equal(existsSync(oldNative), false, 'successful repatch must remove prior native versions');
  assert.equal(existsSync(oldOnly), false, 'successful repatch must remove old-only vendor trees');
  assert.equal(lstatSync(ripgrep).ino, ripgrepBefore.ino, 'successful repatch must preserve managed ripgrep identity');
  const configAfter = statSync(enhancementsFile);
  assert.equal(readFileSync(enhancementsFile, 'utf8'), savedConfig, 'repatch must not alter saved config bytes');
  assert.equal(configAfter.mode & 0o7777, configBefore.mode & 0o7777, 'repatch must not alter saved config mode');
  assert.equal(configAfter.ino, configBefore.ino, 'repatch must not replace saved config identity');
} finally {
  rmSync(repatchRoot, { recursive: true, force: true });
}

const canonicalProxyFetch = canonicalRuntime['proxy-fetch.mjs'];
const canonicalFetchFile = canonicalRuntime['fetch-file.mjs'];
assert.match(canonicalProxyFetch, /env\.HTTPS_PROXY \|\| env\.https_proxy/, 'shared downloader must prefer HTTPS proxies');
assert.match(canonicalProxyFetch, /env\.HTTP_PROXY \|\| env\.http_proxy/, 'shared downloader must support HTTP proxies');
assert.match(canonicalProxyFetch, /env\.NO_PROXY \|\| env\.no_proxy/, 'shared downloader must honor NO_PROXY');
assert.match(canonicalProxyFetch, /\/usr\/sbin\/scutil.*--proxy/, 'shared downloader must discover the macOS system proxy');
assert.match(canonicalProxyFetch, /AbortSignal\.timeout\(300000\)/, 'shared downloader must use the five-minute timeout');
assert.match(canonicalProxyFetch, /redirects <= 5/, 'shared downloader must cap redirects');
assert.match(canonicalProxyFetch, /response\.status !== 200/, 'shared downloader must reject non-200 responses');
assert.match(canonicalFetchFile, /from '\.\/proxy-fetch\.mjs'/, 'fetch-file must use the shared proxy implementation');
assert.match(canonicalFetchFile, /renameSync\(temporary, destination\)/, 'fetch-file must atomically replace completed downloads');

const proxyModuleUrl = new URL(`../src/generic/runtime/proxy-fetch.mjs?test=${Date.now()}`, import.meta.url);
const { proxyFor: selectProxy } = await import(proxyModuleUrl.href);
const proxyCases = [
  ['https://example.com/archive', '.example.com', undefined],
  ['https://api.example.com/archive', '.example.com', undefined],
  ['https://example.com:8443/archive', 'example.com:8443', undefined],
  ['https://example.com/archive', 'example.com:8443', 'http://proxy.test:3128'],
  ['http://[::1]:8080/archive', '::1', undefined],
  ['http://[::1]:8080/archive', '[::1]:8081', 'http://proxy.test:3128'],
];
for (const [url, noProxy, expected] of proxyCases) {
  assert.equal(selectProxy(url, {
    HTTP_PROXY: 'http://proxy.test:3128',
    HTTPS_PROXY: 'http://proxy.test:3128',
    NO_PROXY: noProxy,
  }), expected, `NO_PROXY=${noProxy} must select the expected proxy for ${url}`);
}

for (const [name, source] of [['install.sh', unix], ['install.ps1', windows]]) {
  assert.match(source, /fetch-file\.mjs/, `${name}: remote helpers must use fetch-file.mjs`);
  const chromeStart = source.indexOf(name === 'install.sh' ? 'install_chrome_fix_script' : 'function Install-ChromeFixScript');
  const chromeEnd = source.indexOf(name === 'install.sh' ? 'run_claude_code_chrome_fix' : 'function Invoke-ChromePostInstallFix');
  assert.ok(chromeStart >= 0 && chromeEnd > chromeStart, `${name}: Chrome helper must be defined`);
  const chromeHelper = source.slice(chromeStart, chromeEnd);
  assert.match(chromeHelper, /fetch-file\.mjs/, `${name}: Chrome helper download must use fetch-file.mjs`);
  assert.doesNotMatch(chromeHelper, /curl|Invoke-WebRequest/, `${name}: Chrome helper download must use fetch-file.mjs`);
  const importStart = source.indexOf(name === 'install.sh' ? 'Download clawgod-import binary' : 'Download clawgod-import binary');
  assert.notEqual(importStart, -1, `${name}: clawgod-import download must remain available`);
  const importDownload = source.slice(importStart, importStart + 1200);
  assert.match(importDownload, /fetch-file\.mjs/, `${name}: clawgod-import download must use fetch-file.mjs`);
  assert.doesNotMatch(importDownload, /curl|Invoke-WebRequest/, `${name}: clawgod-import download must use fetch-file.mjs`);
  if (name === 'install.sh') {
    assert.match(importDownload, /fetch-file\.mjs[^\n]+2>\/dev\/null/, 'install.sh must suppress the optional import downloader stack trace');
  } else {
    assert.match(importDownload, /fetch-file\.mjs[^\r\n]+2>\$null/, 'install.ps1 must suppress the optional import downloader stack trace');
  }
}

const unixImportStart = unix.indexOf('# ─── Download clawgod-import binary');
const unixImportEnd = unix.indexOf('\nLAUNCHER_CONTENT="', unixImportStart);
assert.ok(unixImportStart >= 0 && unixImportEnd > unixImportStart, 'install.sh must retain the optional import download block');
const unixImportBlock = unix.slice(unixImportStart, unixImportEnd);
const optionalImportRoot = mkdtempSync(join(tmpdir(), 'clawgod optional import '));
assertTemporaryPath(optionalImportRoot, 'optional import fixture');
try {
  const home = join(optionalImportRoot, 'home');
  const clawgod = join(home, '.clawgod');
  const fixtureBin = join(optionalImportRoot, 'bin');
  const fakeBun = join(fixtureBin, 'bun');
  mkdirSync(clawgod, { recursive: true });
  mkdirSync(fixtureBin, { recursive: true });
  writeFileSync(join(clawgod, 'fetch-file.mjs'), '// optional downloader fixture\n', 'utf8');
  writeFileSync(fakeBun, '#!/bin/sh\nprintf "%s\\n" "synthetic optional download stack" >&2\nexit 42\n', 'utf8');
  chmodSync(fakeBun, 0o700);
  const optionalFailure = spawnSync('/bin/bash', ['-c', `set -e\ninfo() { printf '%s\\n' "$*"; }\ndim() { printf '%s\\n' "$*"; }\n${unixImportBlock}`], {
    encoding: 'utf8',
    env: { HOME: home, PATH: '/usr/bin:/bin', CLAWGOD_DIR: clawgod, BIN_DIR: join(home, '.local', 'bin'), BUN_BIN: fakeBun },
  });
  assert.equal(optionalFailure.status, 0, 'an unavailable optional import tool must not fail installation');
  assert.equal(optionalFailure.stderr, '', 'an unavailable optional import tool must not print the Bun stack trace');
  assert.match(optionalFailure.stdout, /Provider import tool not yet available \(build pending\)/, 'an unavailable optional import tool must retain the concise status message');
  assert.equal(existsSync(join(clawgod, 'clawgod-import')), false, 'an unavailable optional import tool must not leave a destination');
} finally {
  rmSync(optionalImportRoot, { recursive: true, force: true });
}

const dir = mkdtempSync(join(tmpdir(), 'clawgod-fetch-file-'));
try {
  const fetchFile = join(dir, 'fetch-file.mjs');
  const proxyFetch = join(dir, 'proxy-fetch.mjs');
  await Bun.write(fetchFile, canonicalFetchFile);
  await Bun.write(proxyFetch, canonicalProxyFetch);
  chmodSync(fetchFile, 0o700);
  chmodSync(proxyFetch, 0o700);
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === '/redirect') return Response.redirect(new URL('/payload', url), 302);
      if (url.pathname === '/payload') return new Response('downloaded fixture');
      return new Response('not found', { status: 404 });
    },
  });
  try {
    async function runFetch(...args) {
      const child = Bun.spawn([process.execPath, fetchFile, ...args], { stdout: 'pipe', stderr: 'pipe' });
      const [status, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
      return { status, stderr };
    }

    const destination = join(dir, 'result.bin');
    const success = await runFetch(`http://127.0.0.1:${server.port}/redirect`, destination);
    assert.equal(success.status, 0, success.stderr);
    assert.equal(await Bun.file(destination).text(), 'downloaded fixture');
    assert.equal(readdirSync(dir).some(name => name.startsWith('result.bin.') && name.endsWith('.tmp')), false, 'completed downloads must not leave their temporary file behind');

    const failure = await runFetch(`http://127.0.0.1:${server.port}/missing`, destination);
    assert.notEqual(failure.status, 0, 'non-200 responses must fail');
    assert.equal(await Bun.file(destination).text(), 'downloaded fixture', 'failed downloads must not replace an existing destination');
  } finally {
    server.stop(true);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('installer Bun lifecycle checks passed');
