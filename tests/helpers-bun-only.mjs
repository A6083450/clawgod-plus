#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const helpers = [
  { name: 'apply-claude-code-chrome-fix.sh', kind: 'sh', backup: 'backup-bridge-fallback', explicit: value => [value] },
  { name: 'apply-claude-code-chrome-fix.ps1', kind: 'ps1', backup: 'backup-bridge-fallback' },
  { name: 'apply-claude-code-computer-use-fix.sh', kind: 'sh', backup: 'backup-computer-use', explicit: value => [value] },
  {
    name: 'apply-claude-code-context-limit-patch/apply-claude-code-context-limit-patch.sh',
    kind: 'sh',
    backup: 'backup-ctxlimit',
    explicit: value => ['--cli-path', value],
  },
  {
    name: 'apply-claude-code-context-limit-patch/apply-claude-code-context-limit-patch.ps1',
    kind: 'ps1',
    backup: 'backup-ctxlimit',
  },
].map(helper => ({ ...helper, source: readFileSync(new URL(helper.name, root), 'utf8') }));
const ACORN_SHA512 = 'd883627a2de353f34bc25ffb7bbe277c84186720619fe3cbecc3c5885b379635e67019c8d8db7a24e21e8f82e1486e8038b4d13d642b40a684995d0867ed55b3';

const failures = [];
function check(label, fn) {
  try {
    fn();
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
}

async function checkAsync(label, fn) {
  try {
    await fn();
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
}

for (const helper of helpers) {
  check(`${helper.name} has no npm global probing`, () => {
    assert.ok(!/npm\s+root\s+-g/i.test(helper.source), 'found npm root -g');
  });
  check(`${helper.name} has no executable Node dependency`, () => {
    assert.ok(
      !/Get-Command\s+node\b|command\s+-v\s+node\b|^\s*&\s*(?:\$\w*Node\w*|node(?:\.exe)?)\b|\$\(\s*node(?:\.exe)?\s|^\s*node(?:\.exe)?\s/m.test(helper.source),
      'found executable Node call',
    );
    assert.ok(!/^#!.*\bnode\b/im.test(helper.source), 'found Node shebang');
  });
  check(`${helper.name} has no external Acorn downloader`, () => {
    assert.ok(!/\bcurl\b|\bwget\b|Invoke-WebRequest/i.test(helper.source), 'found curl, wget, or Invoke-WebRequest');
  });
  check(`${helper.name} pins the Acorn cache`, () => {
    assert.ok(/acorn-8\.16\.0\.cjs/i.test(helper.source), 'missing acorn-8.16.0.cjs cache');
    assert.ok(helper.source.includes(ACORN_SHA512), 'missing pinned Acorn 8.16.0 SHA-512');
    assert.match(helper.source, /clawgod-plus[\\/]acorn/i, 'Acorn must live in a user-private ClawGod cache');
    assert.doesNotMatch(helper.source, /TMPDIR[^\r\n]*acorn-8\.16\.0|Join-Path\s+\$env:TEMP\s+["']acorn-8\.16\.0/i, 'Acorn must not use a shared temporary cache');
    assert.ok((helper.source.match(new RegExp(ACORN_SHA512, 'g'))?.length || 0) >= 2, 'cache manager and patcher must independently verify Acorn before execution');
    assert.match(helper.source, /CryptoHasher\(['"]sha512['"]\)/, 'Acorn cache must be hash-verified');
    assert.match(helper.source, /lstatSync[\s\S]*isSymbolicLink[\s\S]*isFile/, 'Acorn cache must reject links and non-files');
  });
  check(`${helper.name} resolves Bun`, () => {
    assert.ok(
      (helper.kind === 'ps1' ? /function\s+Resolve-Bun/i : /resolve_bun\s*\(\)/).test(helper.source),
      `missing ${helper.kind === 'ps1' ? 'Resolve-Bun' : 'resolve_bun'}`,
    );
  });
  check(`${helper.name} auto-discovers only the ClawGod original bundle`, () => {
    assert.ok(/\.clawgod[\\/]cli\.original\.cjs/.test(helper.source), 'missing ClawGod original bundle path');
    assert.ok(
      !/\.claude[\\/]local[\\/]node_modules|ProgramFiles|\$env:APPDATA|usr\/local\/lib\/node_modules|usr\/lib\/node_modules/i.test(helper.source),
      'found a non-ClawGod automatic discovery path',
    );
  });
  check(`${helper.name} retains check, restore, backup, and failure markers`, () => {
    assert.match(helper.source, helper.kind === 'ps1' ? /-Check/ : /--check/);
    assert.match(helper.source, helper.kind === 'ps1' ? /-Restore/ : /--restore/);
    assert.match(helper.source, /BACKUP_SUFFIX/);
    assert.match(helper.source, /PARSE_ERROR|VERIFY_FAILED/);
  });
  if (helper.kind === 'ps1') {
    check(`${helper.name} preserves arbitrary literal paths and process exit codes`, () => {
      assert.match(helper.source, /Test-Path\s+-LiteralPath\s+\$CliPath/i);
      assert.match(helper.source, /\$exitCode\s*=\s*Invoke-[^\r\n]+[\s\S]*exit\s+\$exitCode/i);
    });
  }
}

function extractUnixChromePatcher() {
  const helper = helpers.find(entry => entry.name === 'apply-claude-code-chrome-fix.sh').source;
  const marker = 'cat > "$PATCH_SCRIPT" << \'PATCH_EOF\'';
  const start = helper.indexOf(marker);
  assert.notEqual(start, -1, 'Chrome helper must embed its patcher');
  const bodyStart = helper.indexOf('\n', start) + 1;
  const end = helper.indexOf('\nPATCH_EOF', bodyStart);
  assert.notEqual(end, -1, 'Chrome helper patcher must end');
  return helper.slice(bodyStart, end);
}

check('standalone patcher rejects malicious Acorn before require', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'clawgod malicious acorn '));
  assert.equal(realpathSync(dirname(fixtureRoot)), realpathSync(tmpdir()), 'malicious Acorn fixture must be under the system temporary directory');
  try {
    const patcher = join(fixtureRoot, 'patch.mjs');
    const acorn = join(fixtureRoot, 'acorn-8.16.0.cjs');
    const cli = join(fixtureRoot, 'cli.original.cjs');
    const sentinel = join(fixtureRoot, 'outside-sentinel');
    writeFileSync(patcher, extractUnixChromePatcher(), 'utf8');
    writeFileSync(acorn, 'require("fs").writeFileSync(process.env.OUTSIDE_SENTINEL,"executed");exports.parse=()=>({});\n', 'utf8');
    writeFileSync(cli, 'fixture bundle\n', 'utf8');
    const run = spawnSync(process.execPath, [patcher, acorn, cli], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      env: { HOME: fixtureRoot, PATH: fixtureRoot, OUTSIDE_SENTINEL: sentinel },
    });
    assert.notEqual(run.status, 0, 'a malicious Acorn artifact must fail closed');
    assert.equal(existsSync(sentinel), false, 'a malicious Acorn artifact must never execute');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

function extractCacheManager(helper) {
  if (helper.kind === 'sh') {
    const marker = 'cat > "$ACORN_CACHE_SCRIPT" <<\'ACORN_CACHE_EOF\'';
    const start = helper.source.indexOf(marker);
    assert.notEqual(start, -1, `${helper.name} must embed the Acorn cache manager`);
    const bodyStart = helper.source.indexOf('\n', start) + 1;
    const end = helper.source.indexOf('\nACORN_CACHE_EOF', bodyStart);
    assert.notEqual(end, -1, `${helper.name} Acorn cache manager must end`);
    return helper.source.slice(bodyStart, end);
  }
  const marker = "$acornCacheCode = @'\n";
  const start = helper.source.indexOf(marker);
  assert.notEqual(start, -1, `${helper.name} must embed the Acorn cache manager`);
  const bodyStart = start + marker.length;
  const end = helper.source.indexOf("\n'@", bodyStart);
  assert.notEqual(end, -1, `${helper.name} Acorn cache manager must end`);
  return helper.source.slice(bodyStart, end);
}

let cacheManagers = [];
check('all helpers embed one paired Acorn cache manager', () => {
  cacheManagers = helpers.map(helper => [helper.name, extractCacheManager(helper)]);
  const normalized = cacheManagers.map(([, source]) => source.replace(/\r\n/g, '\n').trim());
  for (let index = 1; index < normalized.length; index++) {
    assert.equal(normalized[index], normalized[0], `${cacheManagers[index][0]} cache manager must match ${cacheManagers[0][0]}`);
  }
});

if (cacheManagers.length > 0) {
  await checkAsync('Acorn cache manager replaces wrong files and rejects links without touching sentinels', async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'clawgod acorn cache '));
    assert.equal(realpathSync(dirname(fixtureRoot)), realpathSync(tmpdir()), 'Acorn cache fixture must be under the system temporary directory');
    const fixtureBytes = Buffer.from('exports.parse=function(){return {type:"Program",body:[]}};\n');
    const fixtureHash = new Bun.CryptoHasher('sha512').update(fixtureBytes).digest('hex');
    try {
      const base = join(fixtureRoot, 'cache base');
      const manager = join(fixtureRoot, 'manager.mjs');
      mkdirSync(base);
      const managerSource = cacheManagers[0][1]
        .replace('https://unpkg.com/acorn@8.16.0/dist/acorn.js', `data:text/javascript;base64,${fixtureBytes.toString('base64')}`)
        .replaceAll(ACORN_SHA512, fixtureHash);
      writeFileSync(manager, managerSource, 'utf8');
      const cacheDir = join(base, 'clawgod-plus', 'acorn');
      mkdirSync(cacheDir, { recursive: true });
      const cache = join(cacheDir, 'acorn-8.16.0.cjs');
      const sentinel = join(fixtureRoot, 'outside-sentinel');
      writeFileSync(sentinel, 'outside-must-not-change', 'utf8');
      writeFileSync(cache, 'require("fs").writeFileSync(process.env.OUTSIDE_SENTINEL,"executed");', 'utf8');

      const runManager = () => spawnSync(process.execPath, [manager, base], {
        cwd: fixtureRoot,
        encoding: 'utf8',
        env: { HOME: fixtureRoot, PATH: fixtureRoot, OUTSIDE_SENTINEL: sentinel },
      });
      const replaced = runManager();
      assert.equal(replaced.status, 0, replaced.stdout + replaced.stderr);
      assert.deepEqual(readFileSync(cache), fixtureBytes, 'a wrong regular cache file must be atomically replaced with verified bytes');
      assert.equal(readFileSync(sentinel, 'utf8'), 'outside-must-not-change', 'wrong cache content must never execute');

      writeFileSync(manager, managerSource.replace(/data:text\/javascript;base64,[^']+/, 'clawgod-test://download-must-not-run'), 'utf8');

      const reused = runManager();
      assert.equal(reused.status, 0, reused.stdout + reused.stderr);

      rmSync(cache);
      symlinkSync(sentinel, cache);
      const linked = runManager();
      assert.notEqual(linked.status, 0, 'a cache-file symlink must fail closed');
      assert.equal(readFileSync(sentinel, 'utf8'), 'outside-must-not-change', 'a cache-file symlink must not touch its target');
      assert.match(linked.stderr, /Unsafe Acorn cache file/, 'a cache-file symlink must be rejected before fetching');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
}

const chromePowerShell = helpers.find(helper => helper.name === 'apply-claude-code-chrome-fix.ps1');
check('Chrome PowerShell restore treats bracketed explicit basenames literally and cannot report false success', () => {
  const restoreStart = chromePowerShell.source.indexOf('    if ($Restore) {');
  const restoreEnd = chromePowerShell.source.indexOf('\n    Write-Host ""', restoreStart);
  assert.notEqual(restoreStart, -1, 'restore branch must exist');
  assert.notEqual(restoreEnd, -1, 'restore branch must end before normal patch setup');
  const restore = chromePowerShell.source.slice(restoreStart, restoreEnd);
  assert.ok(restore.includes('$base = Split-Path $cliPath -Leaf'), 'restore must retain the explicit basename, including [prod].cjs');

  const copy = 'Copy-Item -LiteralPath $latestBackup -Destination $cliPath -Force -ErrorAction Stop';
  const copyIndex = restore.indexOf(copy);
  const successIndex = restore.indexOf('Write-Success "Restored from backup: $latestBackup"');
  const catchIndex = restore.indexOf('} catch {');
  assert.notEqual(copyIndex, -1, 'restore copy must use literal source, explicit destination, and terminating errors');
  assert.ok(copyIndex < successIndex, 'success must be printed only after the literal copy completes');
  assert.ok(successIndex < catchIndex, 'successful copy and success output must be inside the guarded try block');

  const catchBlock = restore.slice(catchIndex);
  assert.match(catchBlock, /Write-FixError\s+"Failed to restore backup:/);
  assert.match(catchBlock, /return\s+1/);
});

function readZipEntries(zipPath) {
  if (zipPath instanceof URL) zipPath = fileURLToPath(zipPath);
  const bytes = readFileSync(zipPath);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  assert.notEqual(eocd, -1, `${basename(zipPath)} must contain EOCD`);
  const count = bytes.readUInt16LE(eocd + 10);
  let cursor = bytes.readUInt32LE(eocd + 16);
  const entries = [];
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50, `central directory entry ${index} must be valid`);
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const dosTime = bytes.readUInt16LE(cursor + 12);
    const dosDate = bytes.readUInt16LE(cursor + 14);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');

    assert.equal(bytes.readUInt32LE(localOffset), 0x04034b50, `${name} local header must be valid`);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
    assert.ok(data, `${name} must use a supported ZIP method`);
    assert.equal(data.length, uncompressedSize, `${name} uncompressed size must match`);
    entries.push({ name, data, flags, method, dosTime, dosDate });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const archives = [
  {
    zip: 'apply-claude-code-chrome-fix.zip',
    sources: ['apply-claude-code-chrome-fix.ps1', 'apply-claude-code-chrome-fix.sh'],
  },
  {
    zip: 'apply-claude-code-computer-use-fix.zip',
    sources: ['apply-claude-code-computer-use-fix.sh'],
  },
];

for (const archive of archives) {
  check(`${archive.zip} matches executable sources`, () => {
    const entries = readZipEntries(new URL(archive.zip, root));
    assert.deepEqual(entries.map(entry => entry.name), archive.sources, 'ZIP entry order must be stable');
    for (const [index, source] of archive.sources.entries()) {
      assert.ok(entries[index].data.equals(readFileSync(new URL(source, root))), `${source} bytes must match source`);
      assert.equal(entries[index].method, 0, `${source} must use stored ZIP method 0`);
      assert.notEqual(entries[index].flags & 0x0800, 0, `${source} must set the UTF-8 name flag`);
      assert.equal(entries[index].dosTime, 0, `${source} must use midnight DOS time`);
      assert.equal(entries[index].dosDate, 33, `${source} must use 1980-01-01 DOS date`);
    }
  });
}

check('rebuild-helper-zips.mjs --check validates without writes', () => {
  const before = archives.map(archive => readFileSync(new URL(archive.zip, root)));
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/rebuild-helper-zips.mjs', import.meta.url)), '--check'], {
    cwd: fileURLToPath(root),
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  for (const [index, archive] of archives.entries()) {
    assert.ok(before[index].equals(readFileSync(new URL(archive.zip, root))), `${archive.zip} must not be written by --check`);
  }
});

if (failures.length > 0) {
  console.error(`helper Bun-only checks failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const unixHelpers = helpers.filter(helper => helper.kind === 'sh');
const fixtureRoot = mkdtempSync(join(tmpdir(), 'clawgod-helper-bun-only-'));
assert.equal(realpathSync(dirname(fixtureRoot)), realpathSync(tmpdir()), 'helper behavior fixture must be under the system temporary directory');
try {
  const fakeBin = join(fixtureRoot, 'bin');
  const fakeBunBin = join(fixtureRoot, 'bun-bin');
  mkdirSync(fakeBin);
  mkdirSync(fakeBunBin);
  for (const [name, target] of Object.entries({
    basename: '/usr/bin/basename',
    bash: '/bin/bash',
    cat: '/bin/cat',
    chmod: '/bin/chmod',
    cp: '/bin/cp',
    date: '/bin/date',
    dirname: '/usr/bin/dirname',
    find: '/usr/bin/find',
    head: '/usr/bin/head',
    ls: '/bin/ls',
    mkdir: '/bin/mkdir',
    mktemp: '/usr/bin/mktemp',
    mv: '/bin/mv',
    rm: '/bin/rm',
    sed: '/usr/bin/sed',
    sort: '/usr/bin/sort',
    tail: '/usr/bin/tail',
    tr: '/usr/bin/tr',
    uname: '/usr/bin/uname',
    wc: '/usr/bin/wc',
  })) symlinkSync(target, join(fakeBin, name));
  const fakeBun = join(fakeBunBin, 'bun');
  writeFileSync(fakeBun, `#!/bin/sh
printf '%s\\n' "$@" >> "$FAKE_BUN_LOG"
case "$1" in
  *clawgod-acorn-cache-*.mjs) exit 0 ;;
esac
case "$FAKE_BUN_MODE" in
  already) printf '%s\\n' ALREADY_PATCHED; exit 0 ;;
  check) printf '%s\\n' NEEDS_PATCH; exit 1 ;;
  fail) printf '%s\\n' RUNTIME_FAILURE >&2; exit 7 ;;
esac
exit 9
`, 'utf8');
  chmodSync(fakeBun, 0o755);

  function makeEnvironment(label, mode = 'already', includeBun = true) {
    const home = join(fixtureRoot, label, 'home');
    const temp = join(fixtureRoot, label, 'tmp');
    mkdirSync(join(home, '.clawgod'), { recursive: true });
    mkdirSync(temp, { recursive: true });
    writeFileSync(join(temp, 'acorn-8.16.0.cjs'), 'exports.parse = function () {};\n', 'utf8');
    return {
      home,
      temp,
      log: join(fixtureRoot, label, 'bun.log'),
      env: {
        ...process.env,
        HOME: home,
        TMPDIR: temp,
        PATH: includeBun ? `${fakeBunBin}:${fakeBin}` : fakeBin,
        FAKE_BUN_LOG: join(fixtureRoot, label, 'bun.log'),
        FAKE_BUN_MODE: mode,
      },
    };
  }

  for (const [index, helper] of unixHelpers.entries()) {
    const script = new URL(helper.name, root);

    const auto = makeEnvironment(`auto-${index}`);
    const autoBundle = join(auto.home, '.clawgod', 'cli.original.cjs');
    writeFileSync(autoBundle, 'automatic fixture\n', 'utf8');
    const autoRun = spawnSync('/bin/bash', [script.pathname], { encoding: 'utf8', env: auto.env });
    assert.equal(autoRun.status, 0, `${helper.name} auto discovery: ${autoRun.stdout}${autoRun.stderr}`);
    assert.match(autoRun.stdout, new RegExp(autoBundle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(readFileSync(auto.log, 'utf8'), new RegExp(autoBundle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    const explicit = makeEnvironment(`explicit-${index}`);
    const explicitBundle = join(fixtureRoot, `arbitrary bundle ${index}.custom`);
    writeFileSync(explicitBundle, 'explicit fixture\n', 'utf8');
    const explicitRun = spawnSync('/bin/bash', [script.pathname, ...helper.explicit(explicitBundle)], { encoding: 'utf8', env: explicit.env });
    assert.equal(explicitRun.status, 0, `${helper.name} explicit path: ${explicitRun.stdout}${explicitRun.stderr}`);
    assert.match(readFileSync(explicit.log, 'utf8'), new RegExp(explicitBundle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    const checking = makeEnvironment(`check-${index}`, 'check');
    const checkBundle = join(fixtureRoot, `check bundle ${index}.custom`);
    writeFileSync(checkBundle, 'unchanged\n', 'utf8');
    const checkRun = spawnSync('/bin/bash', [script.pathname, '--check', ...helper.explicit(checkBundle)], { encoding: 'utf8', env: checking.env });
    assert.equal(checkRun.status, 1, `${helper.name} --check must preserve patch-needed exit 1`);
    assert.equal(readFileSync(checkBundle, 'utf8'), 'unchanged\n', `${helper.name} --check must not change the bundle`);

    const failing = makeEnvironment(`failure-${index}`, 'fail');
    const failureBundle = join(fixtureRoot, `failure bundle ${index}.custom`);
    writeFileSync(failureBundle, 'unchanged\n', 'utf8');
    const failureRun = spawnSync('/bin/bash', [script.pathname, ...helper.explicit(failureBundle)], { encoding: 'utf8', env: failing.env });
    assert.equal(failureRun.status, 7, `${helper.name} must propagate an unhandled Bun patcher failure`);

    const restore = makeEnvironment(`restore-${index}`, 'already');
    const restoreBundle = join(fixtureRoot, `restore bundle ${index}.custom`);
    const restoreBackup = `${restoreBundle}.${helper.backup}-2099-01-01T00-00-00`;
    writeFileSync(restoreBundle, 'patched\n', 'utf8');
    writeFileSync(restoreBackup, 'original\n', 'utf8');
    const restoreRun = spawnSync('/bin/bash', [script.pathname, '--restore', ...helper.explicit(restoreBundle)], { encoding: 'utf8', env: restore.env });
    assert.equal(restoreRun.status, 0, `${helper.name} restore: ${restoreRun.stdout}${restoreRun.stderr}`);
    assert.equal(readFileSync(restoreBundle, 'utf8'), 'original\n', `${helper.name} must restore an arbitrary explicit filename`);

    const noBun = makeEnvironment(`no-bun-${index}`, 'already', false);
    const noBunBundle = join(fixtureRoot, `no bun bundle ${index}.custom`);
    writeFileSync(noBunBundle, 'fixture\n', 'utf8');
    const noBunRun = spawnSync('/bin/bash', [script.pathname, ...helper.explicit(noBunBundle)], { encoding: 'utf8', env: noBun.env });
    assert.notEqual(noBunRun.status, 0, `${helper.name} must fail when Bun is unavailable`);
    assert.match(noBunRun.stdout + noBunRun.stderr, /Bun.*required|Install Bun/i, `${helper.name} must explain how to resolve missing Bun`);
  }
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log('helper Bun-only and ZIP parity checks passed');
