#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';

const generated = readFileSync(new URL('../dist/win/install.ps1', import.meta.url), 'utf8');
const canonical = readFileSync(new URL('../src/template/install.ps1', import.meta.url), 'utf8');
const patchFallback = readFileSync(new URL('../src/generic/runtime/patch-fallback.cjs', import.meta.url), 'utf8');
const vendorTransaction = readFileSync(new URL('../src/generic/runtime/vendor-transaction.mjs', import.meta.url), 'utf8');

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

function transactionSpan(source, label) {
  source = source.replace(/\r\n/g, '\n');
  const marker = '$RuntimeTransactionCleanupSafe = $true\ntry {';
  const start = source.indexOf(marker);
  const end = source.indexOf('\n# --- Create default configs', start);
  assert.ok(start >= 0 && end > start, `${label} must retain the complete runtime transaction span`);
  const span = source.slice(start + '$RuntimeTransactionCleanupSafe = $true\n'.length, end);
  assert.match(span, /^try \{/, `${label} must start the span with the production transaction try`);
  assert.match(span, /\$RuntimeTransactionCommitted = \$true/, `${label} must retain production commit assignment`);
  assert.match(span, /Remove-Item -LiteralPath \$RuntimeRollbackDir -Recurse -Force -ErrorAction SilentlyContinue/, `${label} must retain post-commit transaction cleanup`);
  assert.match(span, /\} finally \{[\s\S]*?\$RuntimeHadPatchFallback/, `${label} must retain production state rollback finalizer`);
  return span;
}

const canonicalSpan = transactionSpan(canonical, 'src/template/install.ps1');
const generatedSpan = transactionSpan(generated, 'dist/win/install.ps1');
assert.match(generatedSpan, /\$RuntimeTransactionCommitted = \$true/, 'generated Windows transaction span must retain production commit assignment');
assert.match(generatedSpan, /\} finally \{[\s\S]*?\$RuntimeHadPatchFallback/, 'generated Windows transaction span must retain production rollback finalizer');
// The canonical span is extracted from the source template, whose byte-runtime
// variables are still `@@CLAWGOD_*_BASE64@@` placeholders. Drop those assignment
// lines so the harness's injected fake fetch/extract/post-process/patcher bytes
// (set above) survive into the native run instead of throwing on invalid base64.
const fixtureSpan = canonicalSpan
  .replace(/^[ \t]*\$[A-Za-z]+Bytes = \[Convert\]::FromBase64String\('@@CLAWGOD_[A-Z0-9_]+@@'\)\n/gm, '')
  .replace(
    'exit $patchStatus',
    'throw "Mandatory patching failed with status $patchStatus"',
  );
assert.notEqual(fixtureSpan, canonicalSpan, 'fixture must diverge from the canonical span (stripped placeholders + throw conversion)');
assert.match(fixtureSpan, /\$RuntimeTransactionCommitted = \$true/, 'fixture span must execute production commit assignment');
assert.match(fixtureSpan, /\} finally \{/, 'fixture span must execute production rollback finalizer');
const dedicatedTestSource = readFileSync(new URL(import.meta.url), 'utf8');
assert.match(
  dedicatedTestSource,
  /const candidateSource = candidateSourceForHost\('2\.1\.999'\);/,
  'candidate source expectation must derive PowerShell Set-Content bytes from the host platform',
);
assert.match(
  dedicatedTestSource,
  /assert\.deepEqual\(observed\.sourceBytes, candidateSourceBytes,/,
  'candidate source assertions must remain byte-level so Windows CRLF is verified',
);

const pwsh = findPwsh();
if (!pwsh) {
  console.log('PowerShell native patch fallback checks skipped: pwsh unavailable');
  process.exit(0);
}

const root = mkdtempSync(join(tmpdir(), 'clawgod-windows-patch-fallback-'));
try {
  const transactionScript = join(root, 'transaction.ps1');
  const fakeFetchPackage = `import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const output = process.argv[3];
mkdirSync(join(output, 'package'), { recursive: true });
writeFileSync(join(output, 'package', 'claude.exe'), Buffer.alloc((10 * 1024 * 1024) + 1));
console.log('VERSION=2.1.999');
`;
  const fakeExtractor = `import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const output = process.argv[3];
mkdirSync(join(output, 'vendor'), { recursive: true });
mkdirSync(join(output, 'chunks'), { recursive: true });
writeFileSync(join(output, 'cli.original.js'), 'fixture source');
writeFileSync(join(output, 'vendor', 'candidate-native.node'), Buffer.from([0xca, 0xfe, 0xba, 0xbe]));
writeFileSync(join(output, 'chunks', 'current.mjs'), 'candidate chunk\\n');
`;
  const fakePostProcessor = `import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
const output = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(output, 'cli.original.cjs'), 'candidate runtime\\n');
`;
  const fakePatcher = `import { writeFileSync } from 'node:fs';
writeFileSync(process.env.CLAWGOD_TEST_PATCH_ARGS, JSON.stringify(process.argv.slice(2)));
process.exit(Number(process.env.CLAWGOD_TEST_PATCH_EXIT));
`;
  const fakeCli = `const { mkdirSync, renameSync, writeFileSync } = require('node:fs');
if (process.env.CLAWGOD_TEST_VENDOR_CONFLICT === '1') {
  renameSync(process.env.CLAWGOD_TEST_VENDOR_DIR, process.env.CLAWGOD_TEST_DISPLACED_VENDOR);
  mkdirSync(process.env.CLAWGOD_TEST_VENDOR_DIR, { recursive: true });
  writeFileSync(process.env.CLAWGOD_TEST_REPLACEMENT_SENTINEL, Buffer.from([0x5a, 0x00, 0xa5]));
}
if (Number(process.env.CLAWGOD_TEST_SANITY_EXIT) !== 0) process.stderr.write('fixture runtime sanity failed\\n');
process.exit(Number(process.env.CLAWGOD_TEST_SANITY_EXIT));
`;

  writeFileSync(transactionScript, `$ErrorActionPreference = 'Stop'
$BunBin = $env:CLAWGOD_TEST_BUN
$ClawDir = $env:CLAWGOD_TEST_DIR
$BinDir = Join-Path $ClawDir 'bin'
$NativeBinLabel = $null
$NativeBin = $null
$NativeBinTmpDir = $null
$Version = 'latest'
$ClawSelfVersion = '2026.9.2-claude.2.1.258'
$NoUpgrade = [System.Convert]::ToBoolean($env:CLAWGOD_TEST_NO_UPGRADE)
$RuntimeTarget = Join-Path $ClawDir 'cli.original.cjs'
$RuntimeSourceVersion = Join-Path $ClawDir '.source-version'
$RuntimeRollbackDir = Join-Path $ClawDir '.runtime-rollback'
$RuntimeCandidateDir = Join-Path $RuntimeRollbackDir 'candidate'
$RuntimeCandidateVendor = $env:CLAWGOD_TEST_CANDIDATE_VENDOR
$RuntimeVendorDir = Join-Path $ClawDir 'vendor'
$RuntimePatchFallback = Join-Path $ClawDir 'patch-fallback.json'
$RuntimeHadTarget = Test-Path -LiteralPath $RuntimeTarget -PathType Leaf
$RuntimeHadSourceVersion = Test-Path -LiteralPath $RuntimeSourceVersion -PathType Leaf
$RuntimeHadPatchFallback = Test-Path -LiteralPath $RuntimePatchFallback -PathType Leaf
$RuntimeTransactionCommitted = $false
$RuntimeVendorPublishStarted = $false
$VendorRollbackComplete = $false
$RuntimeTransactionCleanupSafe = $true
$ProxyFetchBytes = [System.Text.Encoding]::UTF8.GetBytes('export {};')
$FetchPackageBytes = [System.Text.Encoding]::UTF8.GetBytes($env:CLAWGOD_TEST_FETCH_PACKAGE)
$ExtractorBytes = [System.Text.Encoding]::UTF8.GetBytes($env:CLAWGOD_TEST_EXTRACTOR)
$PostProcessorBytes = [System.Text.Encoding]::UTF8.GetBytes($env:CLAWGOD_TEST_POST_PROCESSOR)
$RepatcherBytes = [System.Text.Encoding]::UTF8.GetBytes('export {};')
$OpenAIProxyBytes = [System.Text.Encoding]::UTF8.GetBytes('module.exports = {};')
$WrapperBytes = [System.Text.Encoding]::UTF8.GetBytes($env:CLAWGOD_TEST_CLI)
$PatcherBytes = [System.Text.Encoding]::UTF8.GetBytes($env:CLAWGOD_TEST_PATCHER)
$SelfUpdateBytes = [System.Text.Encoding]::UTF8.GetBytes('module.exports = {};')
$PatchFallbackBytes = [System.Text.Encoding]::UTF8.GetBytes($env:CLAWGOD_TEST_PATCH_FALLBACK)
function Write-Dim { param([string]$Message) }
function Write-OK { param([string]$Message) }
function Write-Warn { param([string]$Message); [Console]::Error.WriteLine($Message) }
function Write-Err { param([string]$Message); [Console]::Error.WriteLine($Message) }
function Install-ChromeFixScript { return $true }
function Invoke-ChromePostInstallFix { [System.IO.File]::WriteAllText((Join-Path $ClawDir 'chrome-ran'), 'yes') }
function Install-UpdateRuntimeHelpers {
  [System.IO.File]::WriteAllBytes((Join-Path $ClawDir 'self-update.cjs'), $SelfUpdateBytes)
  [System.IO.File]::WriteAllBytes((Join-Path $ClawDir 'patch-fallback.cjs'), $PatchFallbackBytes)
}
$Caught = $null
try {
${fixtureSpan}
} catch {
  $Caught = $_.Exception.Message
}
[ordered]@{
  caught = $Caught
  committed = $RuntimeTransactionCommitted
  vendorStatus = $vendorStatus
  rollbackComplete = $VendorRollbackComplete
  cleanupSafe = $RuntimeTransactionCleanupSafe
  transactionExists = Test-Path -LiteralPath $RuntimeRollbackDir
} | ConvertTo-Json -Compress
`, 'utf8');

  const priorRuntime = 'prior runtime\n';
  const priorSource = '2.1.225\n';
  const priorFallback = JSON.stringify({
    schemaVersion: 1,
    sourceVersion: '2.1.225',
    clawgodVersion: '2026.9.2-claude.2.1.258',
    reason: 'bundle-patch-compatibility',
  }, null, 2) + '\n';
  const priorChunk = 'prior chunk\n';
  const candidateRuntime = 'candidate runtime\n';
  const candidateSourceForHost = value => `${value}${process.platform === 'win32' ? '\r\n' : '\n'}`;
  const candidateSource = candidateSourceForHost('2.1.999');
  assert.match(
    readFileSync(new URL('../src/template/install.ps1', import.meta.url), 'utf8'),
    /Set-Content -Path \(Join-Path \$ClawDir "\.source-version"\) -Value \$NativeBinLabel -Encoding ASCII/,
    'candidate source expectation must model the production ASCII Set-Content write',
  );
  const candidateSourceBytes = Buffer.from(candidateSource, 'ascii');
  const candidateChunk = 'candidate chunk\n';
  const oldNative = Buffer.from([0x00, 0x11, 0x80, 0xff]);
  const candidateNative = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);
  const ripgrep = Buffer.from([0x72, 0x67, 0x00, 0xff]);

  const content = path => existsSync(path) ? readFileSync(path) : null;
  function inspect(paths) {
    return {
      runtime: content(paths.runtime)?.toString('utf8') ?? null,
      source: content(paths.source)?.toString('utf8') ?? null,
      sourceBytes: content(paths.source),
      fallback: content(paths.fallback)?.toString('utf8') ?? null,
      chunk: content(paths.chunk)?.toString('utf8') ?? null,
      oldNative: content(paths.oldNative),
      candidateNative: content(paths.candidateNative),
      ripgrep: content(paths.ripgrep),
      transactionExists: existsSync(paths.rollback),
      chromeRan: existsSync(paths.chrome),
      vendorEntries: existsSync(paths.vendor) ? readdirSync(paths.vendor).toSorted() : null,
      evidence: existsSync(join(paths.rollback, 'vendor-rollback-conflict.json'))
        ? JSON.parse(readFileSync(join(paths.rollback, 'vendor-rollback-conflict.json'), 'utf8'))
        : null,
    };
  }

  function assertRestored(observed, label, { retained = false } = {}) {
    assert.equal(observed.runtime, priorRuntime, `${label}: rollback must restore prior runtime`);
    assert.equal(observed.source, priorSource, `${label}: rollback must restore prior source marker`);
    assert.equal(observed.fallback, priorFallback, `${label}: rollback must restore prior fallback state`);
    assert.equal(observed.chunk, priorChunk, `${label}: rollback must restore prior chunks`);
    assert.deepEqual(observed.oldNative, oldNative, `${label}: rollback must restore prior vendor bytes`);
    assert.equal(observed.candidateNative, null, `${label}: rollback must remove candidate vendor bytes from live vendor`);
    assert.deepEqual(observed.ripgrep, ripgrep, `${label}: rollback must preserve managed ripgrep bytes`);
    assert.equal(observed.transactionExists, retained, `${label}: transaction retention must match helper recovery status`);
  }

  function createCase(fixture) {
    const caseRoot = join(root, fixture.label);
    const clawDir = join(caseRoot, 'clawgod');
    const rollback = join(clawDir, '.runtime-rollback');
    const vendor = join(clawDir, 'vendor');
    const normalCandidateVendor = join(rollback, 'candidate', 'vendor');
    const candidateVendor = fixture.externalCandidate ? join(caseRoot, 'outside-candidate') : normalCandidateVendor;
    const runtime = join(clawDir, 'cli.original.cjs');
    const source = join(clawDir, '.source-version');
    const fallback = join(clawDir, 'patch-fallback.json');
    const chunk = join(clawDir, 'chunks', 'current.mjs');
    const oldNativePath = join(vendor, 'old-native.node');
    const candidateNativePath = join(vendor, 'candidate-native.node');
    const ripgrepPath = join(vendor, 'ripgrep');
    const chrome = join(clawDir, 'chrome-ran');
    const patchArgs = join(caseRoot, 'patch-args.json');
    const displacedVendor = join(caseRoot, 'displaced-vendor');
    const replacementSentinel = join(vendor, 'sentinel.bin');
    mkdirSync(clawDir, { recursive: true });
    mkdirSync(vendor, { recursive: true });
    writeFileSync(ripgrepPath, ripgrep);
    if (fixture.prior) {
      mkdirSync(join(clawDir, 'chunks'), { recursive: true });
      writeFileSync(runtime, priorRuntime, 'utf8');
      writeFileSync(source, priorSource, 'utf8');
      writeFileSync(fallback, priorFallback, 'utf8');
      writeFileSync(chunk, priorChunk, 'utf8');
      writeFileSync(oldNativePath, oldNative);
    }
    if (fixture.externalCandidate) {
      mkdirSync(candidateVendor, { recursive: true });
      writeFileSync(join(candidateVendor, 'candidate-native.node'), candidateNative);
    }
    writeFileSync(join(clawDir, 'vendor-transaction.mjs'), vendorTransaction, 'utf8');
    return {
      clawDir, rollback, vendor, candidateVendor, runtime, source, fallback, chunk,
      oldNative: oldNativePath, candidateNative: candidateNativePath, ripgrep: ripgrepPath,
      chrome, patchArgs, displacedVendor, replacementSentinel,
    };
  }

  for (const fixture of [
    { label: 'direct-unauthorized', prior: true, update: '', noUpgrade: false, patchExit: 42, success: false, allow: false },
    { label: 'authorized-fallback', prior: true, update: '1', noUpgrade: false, patchExit: 42, success: true, fallback: true, allow: true, chrome: false },
    { label: 'first-install', prior: false, update: '1', noUpgrade: false, patchExit: 42, success: false, allow: false, fresh: true },
    { label: 'no-upgrade', prior: true, update: '1', noUpgrade: true, patchExit: 42, success: false, allow: false },
    { label: 'patch-fatal', prior: true, update: '1', noUpgrade: false, patchExit: 41, success: false, allow: true },
    { label: 'full-patch-clear', prior: true, update: '1', noUpgrade: false, patchExit: 0, success: true, fallback: false, allow: true, chrome: true },
    { label: 'fallback-sanity-rollback', prior: true, update: '1', noUpgrade: false, patchExit: 42, sanityExit: 37, success: false, allow: true, status: 20 },
    { label: 'vendor-conflict', prior: true, update: '1', noUpgrade: false, patchExit: 42, sanityExit: 37, conflict: true, success: false, allow: true, status: 21 },
    { label: 'vendor-status-22', prior: true, update: '1', noUpgrade: false, patchExit: 42, externalCandidate: true, success: false, allow: true, status: 22, retained: true },
  ]) {
    const paths = createCase(fixture);
    const run = spawnSync(pwsh, ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', transactionScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: paths.clawDir,
        USERPROFILE: paths.clawDir,
        TEMP: root,
        TMP: root,
        CLAWGOD_TEST_BUN: process.execPath,
        CLAWGOD_TEST_DIR: paths.clawDir,
        CLAWGOD_TEST_CANDIDATE_VENDOR: paths.candidateVendor,
        CLAWGOD_TEST_NO_UPGRADE: String(fixture.noUpgrade),
        CLAWGOD_UPDATE_PATCH_FAIL_OPEN: fixture.update,
        CLAWGOD_TEST_FETCH_PACKAGE: fakeFetchPackage,
        CLAWGOD_TEST_EXTRACTOR: fakeExtractor,
        CLAWGOD_TEST_POST_PROCESSOR: fakePostProcessor,
        CLAWGOD_TEST_PATCHER: fakePatcher,
        CLAWGOD_TEST_CLI: fakeCli,
        CLAWGOD_TEST_PATCH_FALLBACK: patchFallback,
        CLAWGOD_TEST_PATCH_ARGS: paths.patchArgs,
        CLAWGOD_TEST_PATCH_EXIT: String(fixture.patchExit),
        CLAWGOD_TEST_SANITY_EXIT: String(fixture.sanityExit || 0),
        CLAWGOD_TEST_VENDOR_CONFLICT: fixture.conflict ? '1' : '0',
        CLAWGOD_TEST_VENDOR_DIR: paths.vendor,
        CLAWGOD_TEST_DISPLACED_VENDOR: paths.displacedVendor,
        CLAWGOD_TEST_REPLACEMENT_SENTINEL: paths.replacementSentinel,
      },
    });
    assert.equal(run.status, 0, `${fixture.label}: native harness must report after complete production finalizer:\n${run.stdout}${run.stderr}`);
    const resultLine = run.stdout.trim().split(/\r?\n/).findLast(line => line.startsWith('{'));
    assert.ok(resultLine, `${fixture.label}: native harness must emit transaction observations`);
    const result = JSON.parse(resultLine);
    const args = JSON.parse(readFileSync(paths.patchArgs, 'utf8'));
    const observed = inspect(paths);
    assert.equal(args.includes('--allow-compatibility-fallback'), fixture.allow, `${fixture.label}: argv authorization must honor env, NoUpgrade, and prior target`);

    if (fixture.success) {
      assert.equal(result.caught, null, `${fixture.label}: success must not throw`);
      assert.equal(result.committed, true, `${fixture.label}: production commit assignment must run`);
      assert.equal(result.transactionExists, false, `${fixture.label}: production commit cleanup must remove transaction`);
      assert.equal(observed.transactionExists, false, `${fixture.label}: committed transaction must not retain recovery data`);
      assert.equal(observed.runtime, candidateRuntime, `${fixture.label}: success must retain candidate runtime`);
      assert.deepEqual(observed.sourceBytes, candidateSourceBytes, `${fixture.label}: success must retain host-native candidate source bytes`);
      assert.equal(observed.source, candidateSource, `${fixture.label}: success must retain host-native candidate source text`);
      assert.equal(observed.chunk, candidateChunk, `${fixture.label}: success must retain candidate chunks`);
      assert.equal(observed.oldNative, null, `${fixture.label}: success must retire prior vendor bytes`);
      assert.deepEqual(observed.candidateNative, candidateNative, `${fixture.label}: success must publish candidate vendor bytes`);
      assert.deepEqual(observed.ripgrep, ripgrep, `${fixture.label}: success must preserve managed ripgrep`);
      assert.equal(observed.chromeRan, fixture.chrome, `${fixture.label}: Chrome behavior must match fallback state`);
      if (fixture.fallback) {
        assert.match(observed.fallback, /"reason": "bundle-patch-compatibility"/, `${fixture.label}: authorized fallback must write canonical state`);
        assert.match(observed.fallback, /"sourceVersion": "2\.1\.999"/, `${fixture.label}: fallback state must describe candidate version`);
      } else {
        assert.equal(observed.fallback, null, `${fixture.label}: full patch must clear old fallback state`);
      }
    } else if (fixture.fresh) {
      assert.ok(result.caught, `${fixture.label}: unauthorized first install must fail closed`);
      assert.equal(observed.runtime, null, `${fixture.label}: failed first install must not leave a runtime`);
      assert.equal(observed.source, null, `${fixture.label}: failed first install must not leave a source marker`);
      assert.equal(observed.fallback, null, `${fixture.label}: failed first install must not write fallback state`);
      assert.equal(observed.chunk, null, `${fixture.label}: failed first install must not leave chunks`);
      assert.deepEqual(observed.vendorEntries, ['ripgrep'], `${fixture.label}: failed first install must not publish candidate vendor bytes`);
      assert.equal(observed.transactionExists, false, `${fixture.label}: failed first install must clean recovery data`);
    } else if (fixture.status === 21) {
      assert.ok(result.caught, `${fixture.label}: vendor conflict must surface an error`);
      assert.equal(result.vendorStatus, 21, `${fixture.label}: vendor conflict must preserve status 21`);
      assert.equal(result.rollbackComplete, false, `${fixture.label}: status 21 must not claim a complete rollback`);
      assert.equal(observed.transactionExists, true, `${fixture.label}: status 21 must retain recovery transaction`);
      assert.ok(observed.evidence?.conflicts?.length, `${fixture.label}: status 21 must retain recovery evidence`);
      assert.deepEqual(content(paths.replacementSentinel), Buffer.from([0x5a, 0x00, 0xa5]), `${fixture.label}: conflict recovery must not mutate replacement vendor`);
      assert.equal(observed.runtime, candidateRuntime, `${fixture.label}: conflict boundary must not restore runtime into unknown vendor state`);
      assert.deepEqual(observed.sourceBytes, candidateSourceBytes, `${fixture.label}: conflict boundary must retain host-native candidate source bytes`);
      assert.equal(observed.source, candidateSource, `${fixture.label}: conflict boundary must not restore source into unknown vendor state`);
      assert.equal(observed.chunk, candidateChunk, `${fixture.label}: conflict boundary must not restore chunks into unknown vendor state`);
      assert.match(observed.fallback, /"sourceVersion": "2\.1\.999"/, `${fixture.label}: conflict boundary must retain written fallback state`);
    } else {
      assert.ok(result.caught, `${fixture.label}: failure must surface after production finalizer`);
      if (fixture.status) {
        assert.equal(result.vendorStatus, fixture.status, `${fixture.label}: publish-checked status must propagate`);
        assert.equal(result.rollbackComplete, true, `${fixture.label}: status ${fixture.status} must report completed rollback`);
      }
      assertRestored(observed, fixture.label, { retained: Boolean(fixture.retained) });
      assert.equal(observed.chromeRan, false, `${fixture.label}: failed transaction must not leave Chrome success marker`);
    }
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('PowerShell native patch fallback checks passed');
