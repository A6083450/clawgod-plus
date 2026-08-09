#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
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

const failures = [];
function check(label, fn) {
  try {
    fn();
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
      !/\.claude[\\/]local[\\/]node_modules|ProgramFiles|APPDATA|usr\/local\/lib\/node_modules|usr\/lib\/node_modules/i.test(helper.source),
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
try {
  const fakeBin = join(fixtureRoot, 'bin');
  mkdirSync(fakeBin);
  const fakeBun = join(fakeBin, 'bun');
  writeFileSync(fakeBun, `#!/bin/sh
printf '%s\\n' "$@" >> "$FAKE_BUN_LOG"
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
        PATH: includeBun ? `${fakeBin}:/usr/bin:/bin` : '/usr/bin:/bin',
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
    const autoRun = spawnSync('bash', [script.pathname], { encoding: 'utf8', env: auto.env });
    assert.equal(autoRun.status, 0, `${helper.name} auto discovery: ${autoRun.stdout}${autoRun.stderr}`);
    assert.match(autoRun.stdout, new RegExp(autoBundle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(readFileSync(auto.log, 'utf8'), new RegExp(autoBundle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    const explicit = makeEnvironment(`explicit-${index}`);
    const explicitBundle = join(fixtureRoot, `arbitrary bundle ${index}.custom`);
    writeFileSync(explicitBundle, 'explicit fixture\n', 'utf8');
    const explicitRun = spawnSync('bash', [script.pathname, ...helper.explicit(explicitBundle)], { encoding: 'utf8', env: explicit.env });
    assert.equal(explicitRun.status, 0, `${helper.name} explicit path: ${explicitRun.stdout}${explicitRun.stderr}`);
    assert.match(readFileSync(explicit.log, 'utf8'), new RegExp(explicitBundle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    const checking = makeEnvironment(`check-${index}`, 'check');
    const checkBundle = join(fixtureRoot, `check bundle ${index}.custom`);
    writeFileSync(checkBundle, 'unchanged\n', 'utf8');
    const checkRun = spawnSync('bash', [script.pathname, '--check', ...helper.explicit(checkBundle)], { encoding: 'utf8', env: checking.env });
    assert.equal(checkRun.status, 1, `${helper.name} --check must preserve patch-needed exit 1`);
    assert.equal(readFileSync(checkBundle, 'utf8'), 'unchanged\n', `${helper.name} --check must not change the bundle`);

    const failing = makeEnvironment(`failure-${index}`, 'fail');
    const failureBundle = join(fixtureRoot, `failure bundle ${index}.custom`);
    writeFileSync(failureBundle, 'unchanged\n', 'utf8');
    const failureRun = spawnSync('bash', [script.pathname, ...helper.explicit(failureBundle)], { encoding: 'utf8', env: failing.env });
    assert.equal(failureRun.status, 7, `${helper.name} must propagate an unhandled Bun patcher failure`);

    const restore = makeEnvironment(`restore-${index}`, 'already');
    const restoreBundle = join(fixtureRoot, `restore bundle ${index}.custom`);
    const restoreBackup = `${restoreBundle}.${helper.backup}-2099-01-01T00-00-00`;
    writeFileSync(restoreBundle, 'patched\n', 'utf8');
    writeFileSync(restoreBackup, 'original\n', 'utf8');
    const restoreRun = spawnSync('bash', [script.pathname, '--restore', ...helper.explicit(restoreBundle)], { encoding: 'utf8', env: restore.env });
    assert.equal(restoreRun.status, 0, `${helper.name} restore: ${restoreRun.stdout}${restoreRun.stderr}`);
    assert.equal(readFileSync(restoreBundle, 'utf8'), 'original\n', `${helper.name} must restore an arbitrary explicit filename`);

    const noBun = makeEnvironment(`no-bun-${index}`, 'already', false);
    const noBunBundle = join(fixtureRoot, `no bun bundle ${index}.custom`);
    writeFileSync(noBunBundle, 'fixture\n', 'utf8');
    const noBunRun = spawnSync('bash', [script.pathname, ...helper.explicit(noBunBundle)], { encoding: 'utf8', env: noBun.env });
    assert.notEqual(noBunRun.status, 0, `${helper.name} must fail when Bun is unavailable`);
    assert.match(noBunRun.stdout + noBunRun.stderr, /Bun.*required|Install Bun/i, `${helper.name} must explain how to resolve missing Bun`);
  }
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log('helper Bun-only and ZIP parity checks passed');
