#!/usr/bin/env bun
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const unix = readFileSync(new URL('../install.sh', import.meta.url), 'utf8');
const windows = readFileSync(new URL('../install.ps1', import.meta.url), 'utf8');

function unixTemplate() {
  const marker = 'cat > "$CLAWGOD_DIR/install-ripgrep.mjs" << \'INSTALL_RIPGREP_EOF\'';
  const start = unix.indexOf(marker);
  assert.notEqual(start, -1, 'install.sh must generate install-ripgrep.mjs');
  const bodyStart = unix.indexOf('\n', start) + 1;
  const end = unix.indexOf('\nINSTALL_RIPGREP_EOF', bodyStart);
  assert.notEqual(end, -1, 'install.sh install-ripgrep.mjs template must end');
  return unix.slice(bodyStart, end);
}

function powerShellTemplate() {
  const section = windows.indexOf('# --- Managed ripgrep');
  assert.notEqual(section, -1, 'install.ps1 must generate install-ripgrep.mjs');
  const bodyStart = windows.indexOf('#!/usr/bin/env bun', section);
  const end = windows.indexOf("\n'@ | Set-Content (Join-Path $ClawDir \"install-ripgrep.mjs\")", bodyStart);
  assert.notEqual(end, -1, 'install.ps1 install-ripgrep.mjs template must end');
  return windows.slice(bodyStart, end);
}

function unixWrapper() {
  const marker = 'cat > "$CLAWGOD_DIR/cli.cjs" << \'WRAPPER_EOF\'';
  const start = unix.indexOf(marker);
  assert.notEqual(start, -1, 'install.sh must embed cli.cjs');
  const bodyStart = unix.indexOf('\n', start) + 1;
  const end = unix.indexOf('\nWRAPPER_EOF', bodyStart);
  assert.notEqual(end, -1, 'install.sh cli.cjs template must end');
  return unix.slice(bodyStart, end);
}

function powerShellWrapper() {
  const section = windows.indexOf('# ─── Write wrapper (cli.cjs, runs under Bun)');
  assert.notEqual(section, -1, 'install.ps1 must embed cli.cjs');
  const bodyStart = windows.indexOf('#!/usr/bin/env bun', section);
  const end = windows.indexOf("\n'@ | Set-Content (Join-Path $ClawDir \"cli.cjs\")", bodyStart);
  assert.notEqual(end, -1, 'install.ps1 cli.cjs template must end');
  return windows.slice(bodyStart, end);
}

function unixRepatch() {
  const marker = 'cat > "$CLAWGOD_DIR/repatch.mjs" << \'REPATCH_EOF\'';
  const start = unix.indexOf(marker);
  assert.notEqual(start, -1, 'install.sh must embed repatch.mjs');
  const bodyStart = unix.indexOf('\n', start) + 1;
  const end = unix.indexOf('\nREPATCH_EOF', bodyStart);
  assert.notEqual(end, -1, 'install.sh repatch.mjs template must end');
  return unix.slice(bodyStart, end);
}

function powerShellRepatch() {
  const section = windows.indexOf('# ─── Write re-patch helper');
  assert.notEqual(section, -1, 'install.ps1 must embed repatch.mjs');
  const bodyStart = windows.indexOf('#!/usr/bin/env bun', section);
  const end = windows.indexOf("\n'@ | Set-Content (Join-Path $ClawDir \"repatch.mjs\")", bodyStart);
  assert.notEqual(end, -1, 'install.ps1 repatch.mjs template must end');
  return windows.slice(bodyStart, end);
}

const expectedAssets = {
  'darwin-arm64': ['ripgrep-15.2.0-aarch64-apple-darwin.tar.gz', '3750b2e93f37e0c692657da574d7019a101c0084da05a790c83fd335bad973e4'],
  'darwin-x64': ['ripgrep-15.2.0-x86_64-apple-darwin.tar.gz', 'af7825fcc69a2afc7a7aea55fc9af90e26421d8f20fe59df32e233c0b8a231c1'],
  'linux-arm64': ['ripgrep-15.2.0-aarch64-unknown-linux-musl.tar.gz', '800b1e7206afe799dfb5a6901f23147cfaabe0e52210538100f61e86e1740915'],
  'linux-x64': ['ripgrep-15.2.0-x86_64-unknown-linux-musl.tar.gz', '33e15bcf1624b25cdd2a55813a47a2f95dbe126268203e76aa6a585d1e7b149c'],
  'win32-arm64': ['ripgrep-15.2.0-aarch64-pc-windows-msvc.zip', 'e4abca10c3a64ebea742667dd7009449d49403db5460dd6873e389fa2945360f'],
  'win32-x64': ['ripgrep-15.2.0-x86_64-pc-windows-msvc.zip', '71b2fef860abe467217a538ff31de02f5258807c0129f771846f87bd029aafc5'],
};

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  const out = Buffer.alloc(2);
  out.writeUInt16LE(value >>> 0);
  return out;
}

function u32(value) {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(value >>> 0);
  return out;
}

function zipFixture(entries, options = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = Buffer.from(entry.data);
    const method = entry.method ?? 0;
    const compressed = method === 8 ? deflateRawSync(data) : data;
    const flags = entry.flags ?? 0;
    const crc = entry.crc ?? crc32(data);
    const compressedSize = entry.compressedSize ?? compressed.length;
    const uncompressedSize = entry.uncompressedSize ?? data.length;
    const localName = Buffer.from(entry.localName ?? entry.name);
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(entry.localFlags ?? flags), u16(entry.localMethod ?? method), u16(0), u16(0),
      u32(entry.localCrc ?? crc), u32(entry.localCompressedSize ?? compressedSize), u32(entry.localUncompressedSize ?? uncompressedSize), u16(localName.length), u16(0), localName, compressed,
    ]);
    locals.push(local);
    centrals.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(flags), u16(method), u16(0), u16(0),
      u32(crc), u32(compressedSize), u32(uncompressedSize), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(entry.localOffset ?? offset), name,
    ]));
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(options.centralSize ?? central.length), u32(options.centralOffset ?? offset), u16(0),
  ]);
  return new Uint8Array(Buffer.concat([Buffer.concat(locals), central, eocd]));
}

const unixModule = unixTemplate();
const windowsModule = powerShellTemplate();
const normalize = source => source.replace(/\r\n/g, '\n').trim();
assert.equal(normalize(windowsModule), normalize(unixModule), 'Unix and Windows install-ripgrep.mjs bodies must be identical');

const fixtureDir = mkdtempSync(join(tmpdir(), 'clawgod-ripgrep-'));
try {
  const modulePath = join(fixtureDir, 'install-ripgrep.mjs');
  await Bun.write(modulePath, unixModule);
  chmodSync(modulePath, 0o700);
  const ripgrep = await import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
  const {
    RIPGREP_ASSETS,
    RIPGREP_VERSION,
    ensureRipgrep,
    extractRipgrep,
    fetchWithProxy,
    proxyFor,
    replaceManagedBinary,
    selectRipgrepAsset,
    validateRipgrepVersion,
  } = ripgrep;

  assert.equal(RIPGREP_VERSION, '15.2.0', 'managed ripgrep must remain pinned to 15.2.0');
  assert.deepEqual(RIPGREP_ASSETS, expectedAssets, 'managed ripgrep must expose exactly the verified six-asset matrix');
  for (const [key, [name, sha256]] of Object.entries(expectedAssets)) {
    const [platform, arch] = key.split('-');
    const selected = selectRipgrepAsset(platform, arch);
    assert.equal(selected.name, name, `${key} must select the pinned release asset`);
    assert.equal(selected.sha256, sha256, `${key} must select the pinned release hash`);
    const releaseDirectory = name.replace(/\.(?:tar\.gz|zip)$/, '');
    assert.equal(selected.entry, `${releaseDirectory}/${platform === 'win32' ? 'rg.exe' : 'rg'}`, `${key} must select the exact executable entry`);
  }
  assert.throws(() => selectRipgrepAsset('freebsd', 'x64'), /unsupported.*freebsd.*x64/i, 'unsupported platforms must fail explicitly');

  const unixAsset = selectRipgrepAsset('darwin', 'arm64');
  const tarExecutable = Buffer.from('#!/bin/sh\necho ripgrep 15.2.0\n');
  const tarBytes = await new Bun.Archive({
    [`other-release/rg`]: Buffer.from('wrong executable'),
    [unixAsset.entry]: tarExecutable,
  }, { compress: 'gzip' }).bytes();
  assert.deepEqual(Buffer.from(await extractRipgrep(tarBytes, unixAsset)), tarExecutable, 'tar extraction must select only the exact release-directory executable');

  const wrongTar = await new Bun.Archive({
    [`${unixAsset.entry}.bak`]: tarExecutable,
    [`${unixAsset.entry.replace(/\/rg$/, '')}/not-rg`]: tarExecutable,
  }, { compress: 'gzip' }).bytes();
  await assert.rejects(extractRipgrep(wrongTar, unixAsset), /missing.*exact.*entry|missing.*rg/i, 'tar archives with only similarly named entries must fail');

  const windowsAsset = selectRipgrepAsset('win32', 'x64');
  const zipExecutable = Buffer.from('MZ ripgrep 15.2.0 fixture');
  for (const method of [0, 8]) {
    const archive = zipFixture([
      { name: 'other-release/rg.exe', data: Buffer.from('wrong'), method },
      { name: windowsAsset.entry, data: zipExecutable, method },
    ]);
    assert.deepEqual(Buffer.from(await extractRipgrep(archive, windowsAsset)), zipExecutable, `ZIP method ${method} must extract the exact rg.exe entry`);
  }

  const zipFailures = [
    ['missing EOCD', zipFixture([{ name: windowsAsset.entry, data: zipExecutable }]).slice(0, -22), /end of central directory|eocd/i],
    ['central directory bounds', zipFixture([{ name: windowsAsset.entry, data: zipExecutable }], { centralOffset: 0xfffffff0 }), /central directory|bounds/i],
    ['bad local offset', zipFixture([{ name: windowsAsset.entry, data: zipExecutable, localOffset: 0xfffffff0 }]), /local header|bounds/i],
    ['encrypted entry', zipFixture([{ name: windowsAsset.entry, data: zipExecutable, flags: 1 }]), /encrypted/i],
    ['strongly encrypted entry', zipFixture([{ name: windowsAsset.entry, data: zipExecutable, flags: 0x40 }]), /encrypted/i],
    ['unsupported method', zipFixture([{ name: windowsAsset.entry, data: zipExecutable, method: 12 }]), /compression method/i],
    ['traversal path', zipFixture([{ name: '../rg.exe', data: zipExecutable }]), /unsafe.*path/i],
    ['absolute path', zipFixture([{ name: 'C:\\rg.exe', data: zipExecutable }]), /unsafe.*path/i],
    ['wrong executable name', zipFixture([{ name: windowsAsset.entry.replace(/rg\.exe$/, 'ripgrep.exe'), data: zipExecutable }]), /missing.*exact.*entry|missing.*rg\.exe/i],
    ['CRC mismatch', zipFixture([{ name: windowsAsset.entry, data: zipExecutable, crc: 0 }]), /crc/i],
    ['uncompressed size mismatch', zipFixture([{ name: windowsAsset.entry, data: zipExecutable, uncompressedSize: zipExecutable.length + 1 }]), /size/i],
    ['local CRC mismatch', zipFixture([{ name: windowsAsset.entry, data: zipExecutable, localCrc: 0 }]), /local header.*central directory/i],
    ['local compressed size mismatch', zipFixture([{ name: windowsAsset.entry, data: zipExecutable, localCompressedSize: zipExecutable.length + 1 }]), /local header.*central directory/i],
    ['local uncompressed size mismatch', zipFixture([{ name: windowsAsset.entry, data: zipExecutable, localUncompressedSize: zipExecutable.length + 1 }]), /local header.*central directory/i],
    ['compressed size out of bounds', zipFixture([{ name: windowsAsset.entry, data: zipExecutable, compressedSize: 0xfffffff0 }]), /compressed data|bounds/i],
  ];
  for (const [label, archive, expected] of zipFailures) {
    await assert.rejects(extractRipgrep(archive, windowsAsset), expected, `${label} must be rejected`);
  }

  assert.doesNotThrow(
    () => validateRipgrepVersion('/staged/rg', () => ({ exitCode: 0, stdout: Buffer.from('ripgrep 15.2.0\n-SIMD -AVX') })),
    'the pinned version smoke output must pass',
  );
  for (const result of [
    { exitCode: 1, stdout: Buffer.from('ripgrep 15.2.0') },
    { exitCode: 0, stdout: Buffer.from('ripgrep 15.1.0') },
    { exitCode: 0, stdout: Buffer.from('not ripgrep 15.2.0') },
  ]) {
    assert.throws(() => validateRipgrepVersion('/staged/rg', () => result), /ripgrep 15\.2\.0|version smoke/i, 'failed or wrong-version smoke output must fail');
  }

  const replacementDir = join(fixtureDir, 'replacement');
  mkdirSync(replacementDir);
  const target = join(replacementDir, 'rg');
  const staged = join(replacementDir, 'rg.staged');
  writeFileSync(target, 'known-good');
  writeFileSync(staged, 'new-binary');
  assert.throws(
    () => replaceManagedBinary(staged, target, {
      existsSync,
      renameSync(from, to) {
        if (from === staged && to === target) throw new Error('injected replace failure');
        renameSync(from, to);
      },
      rmSync,
    }, args => args[0] === target
      ? { exitCode: 0, stdout: Buffer.from('ripgrep 15.2.0\n') }
      : { exitCode: 1, stdout: Buffer.from('not managed ripgrep\n') }),
    /injected replace failure/,
    'replacement errors must escape after rollback',
  );
  assert.equal(readFileSync(target, 'utf8'), 'known-good', 'rollback must restore the prior managed binary');
  assert.equal(existsSync(`${target}.previous`), false, 'rollback must not leave the backup path behind');

  for (const [label, currentContent] of [
    ['missing current target', null],
    ['invalid current target', 'invalid-current'],
  ]) {
    const interruptedDir = join(fixtureDir, label.replaceAll(' ', '-'));
    mkdirSync(interruptedDir);
    const interruptedTarget = join(interruptedDir, 'rg');
    const interruptedBackup = `${interruptedTarget}.previous`;
    const interruptedStaged = `${interruptedTarget}.staged`;
    if (currentContent !== null) writeFileSync(interruptedTarget, currentContent);
    writeFileSync(interruptedBackup, 'known-good-backup');
    writeFileSync(interruptedStaged, 'new-binary');
    const smokeCalls = [];
    assert.throws(
      () => replaceManagedBinary(interruptedStaged, interruptedTarget, {
        existsSync,
        renameSync(from, to) {
          if (from === interruptedStaged && to === interruptedTarget) throw new Error('injected interrupted replacement');
          renameSync(from, to);
        },
        rmSync,
      }, args => {
        smokeCalls.push(args);
        return args[0] === interruptedBackup
          ? { exitCode: 0, stdout: Buffer.from('ripgrep 15.2.0\n') }
          : { exitCode: 1, stdout: Buffer.from('not managed ripgrep\n') };
      }),
      /injected interrupted replacement/,
      `${label} must surface the staged rename failure`,
    );
    assert.equal(readFileSync(interruptedTarget, 'utf8'), 'known-good-backup', `${label} must restore the pre-existing known-good backup`);
    assert.equal(smokeCalls.some(args => args[0] === interruptedBackup && args[1] === '--version'), true, `${label} must smoke-validate the backup before restoration`);
    assert.equal(existsSync(interruptedBackup), false, `${label} restoration must consume the backup path`);
    assert.equal(existsSync(interruptedStaged), false, `${label} failure must clean the staged artifact`);
    assert.equal(readdirSync(interruptedDir).some(name => name.includes('.current')), false, `${label} failure must clean displaced-current artifacts`);
  }

  const invalidBackupDir = join(fixtureDir, 'invalid-backup-valid-current');
  mkdirSync(invalidBackupDir);
  const validCurrentTarget = join(invalidBackupDir, 'rg');
  const invalidBackup = `${validCurrentTarget}.previous`;
  const failedStaged = `${validCurrentTarget}.staged`;
  writeFileSync(validCurrentTarget, 'validated-current');
  writeFileSync(invalidBackup, 'invalid-backup');
  writeFileSync(failedStaged, 'new-binary');
  const invalidBackupSmokeCalls = [];
  assert.throws(
    () => replaceManagedBinary(failedStaged, validCurrentTarget, {
      existsSync,
      renameSync(from, to) {
        if (from === failedStaged && to === validCurrentTarget) throw new Error('injected staged rename failure');
        renameSync(from, to);
      },
      rmSync,
    }, args => {
      invalidBackupSmokeCalls.push(args);
      return args[0] === validCurrentTarget
        ? { exitCode: 0, stdout: Buffer.from('ripgrep 15.2.0\n') }
        : { exitCode: 0, stdout: Buffer.from('ripgrep 15.1.0\n') };
    }),
    /injected staged rename failure/,
    'a staged rename failure must escape after candidate validation',
  );
  assert.equal(readFileSync(validCurrentTarget, 'utf8'), 'validated-current', 'an invalid backup must not replace a smoke-valid current executable');
  assert.equal(invalidBackupSmokeCalls.some(args => args[0] === invalidBackup && args[1] === '--version'), true, 'an existing backup must be smoke-validated before rollback selection');
  assert.equal(invalidBackupSmokeCalls.some(args => args[0] === validCurrentTarget && args[1] === '--version'), true, 'the current executable must be smoke-validated before it is selected for rollback');
  assert.equal(existsSync(invalidBackup), false, 'an invalid backup must not remain as stale transaction state');
  assert.equal(existsSync(failedStaged), false, 'failed replacement must clean staging after restoring the validated current executable');
  assert.equal(readdirSync(invalidBackupDir).some(name => name.includes('.current')), false, 'failed replacement must clean displaced-current state after restoring the validated current executable');

  const successfulDir = join(fixtureDir, 'successful-replacement');
  mkdirSync(successfulDir);
  const successfulTarget = join(successfulDir, 'rg');
  const successfulBackup = `${successfulTarget}.previous`;
  const successfulStaged = `${successfulTarget}.staged`;
  writeFileSync(successfulTarget, 'invalid-current');
  writeFileSync(successfulBackup, 'known-good-backup');
  writeFileSync(successfulStaged, 'new-binary');
  replaceManagedBinary(successfulStaged, successfulTarget);
  assert.equal(readFileSync(successfulTarget, 'utf8'), 'new-binary', 'successful replacement must commit the staged executable');
  assert.equal(existsSync(successfulBackup), false, 'successful replacement must remove the superseded backup');
  assert.equal(existsSync(successfulStaged), false, 'successful replacement must consume the staged artifact');
  assert.equal(readdirSync(successfulDir).some(name => name.includes('.current')), false, 'successful replacement must clean displaced-current artifacts');

  for (const protectedPath of ['target', 'staged', 'backup', 'displaced']) {
    const transactionDir = join(fixtureDir, `symlink-transaction-${protectedPath}`);
    const outsideDir = join(fixtureDir, `outside-transaction-${protectedPath}`);
    mkdirSync(transactionDir);
    mkdirSync(outsideDir);
    const transactionTarget = join(transactionDir, 'rg');
    const transactionStaged = `${transactionTarget}.staged`;
    const transactionBackup = `${transactionTarget}.previous`;
    const transactionDisplaced = `${transactionTarget}.${process.pid}.current`;
    const outsideFile = join(outsideDir, 'sentinel');
    writeFileSync(outsideFile, 'outside-must-not-change');
    writeFileSync(transactionTarget, 'current-must-not-change');
    writeFileSync(transactionStaged, 'staged-must-not-change');
    if (protectedPath === 'target') {
      rmSync(transactionTarget);
      symlinkSync(outsideFile, transactionTarget);
    } else if (protectedPath === 'staged') {
      rmSync(transactionStaged);
      symlinkSync(outsideFile, transactionStaged);
    } else if (protectedPath === 'backup') {
      symlinkSync(outsideFile, transactionBackup);
    } else {
      symlinkSync(outsideFile, transactionDisplaced);
    }
    assert.throws(
      () => replaceManagedBinary(transactionStaged, transactionTarget),
      /symbolic link/i,
      `replacement must reject a symbolic-link ${protectedPath} before changing transaction paths`,
    );
    assert.equal(readFileSync(outsideFile, 'utf8'), 'outside-must-not-change', `symbolic-link ${protectedPath} must not modify its outside referent`);
    assert.equal(existsSync(transactionStaged), true, `symbolic-link ${protectedPath} rejection must preserve the staged path`);
    assert.equal(existsSync(transactionTarget), true, `symbolic-link ${protectedPath} rejection must preserve the target path`);
  }

  const managedLeaf = process.platform === 'win32' ? 'rg.exe' : 'rg';
  for (const component of ['vendor', 'ripgrep', 'bin']) {
    const symlinkRoot = join(fixtureDir, `symlink-component-${component}`);
    const outsideDir = join(fixtureDir, `outside-component-${component}`);
    const linkPath = component === 'vendor'
      ? join(symlinkRoot, 'vendor')
      : component === 'ripgrep'
        ? join(symlinkRoot, 'vendor', 'ripgrep')
        : join(symlinkRoot, 'vendor', 'ripgrep', 'bin');
    mkdirSync(dirname(linkPath), { recursive: true });
    mkdirSync(outsideDir);
    const outsideFile = join(outsideDir, 'sentinel');
    writeFileSync(outsideFile, 'outside-must-not-change');
    symlinkSync(outsideDir, linkPath, 'dir');
    let fetched = false;
    let smoked = false;
    await assert.rejects(
      ensureRipgrep(symlinkRoot, {
        fetchImpl: async () => { fetched = true; throw new Error('fetch must not run for a symlinked managed component'); },
        spawnImpl: () => { smoked = true; throw new Error('smoke must not run for a symlinked managed component'); },
      }),
      /symbolic link/i,
      `ensureRipgrep must reject a symbolic-link ${component} component`,
    );
    assert.equal(fetched, false, `symbolic-link ${component} must be rejected before fetch`);
    assert.equal(smoked, false, `symbolic-link ${component} must be rejected before smoke`);
    assert.equal(readFileSync(outsideFile, 'utf8'), 'outside-must-not-change', `symbolic-link ${component} must not modify outside files`);
  }

  for (const managedPath of ['target', 'staged', 'backup', 'displaced']) {
    const symlinkRoot = join(fixtureDir, `symlink-managed-${managedPath}`);
    const binDir = join(symlinkRoot, 'vendor', 'ripgrep', 'bin');
    const targetPath = join(binDir, managedLeaf);
    const paths = {
      target: targetPath,
      staged: `${targetPath}.${process.pid}.staged`,
      backup: `${targetPath}.previous`,
      displaced: `${targetPath}.${process.pid}.current`,
    };
    const outsideFile = join(fixtureDir, `outside-managed-${managedPath}`);
    mkdirSync(binDir, { recursive: true });
    writeFileSync(outsideFile, 'outside-must-not-change');
    symlinkSync(outsideFile, paths[managedPath]);
    let fetched = false;
    let smoked = false;
    await assert.rejects(
      ensureRipgrep(symlinkRoot, {
        fetchImpl: async () => { fetched = true; throw new Error('fetch must not run for a symlinked managed path'); },
        spawnImpl: () => { smoked = true; return { exitCode: 0, stdout: Buffer.from('ripgrep 15.2.0\n') }; },
      }),
      /symbolic link/i,
      `ensureRipgrep must reject a symbolic-link ${managedPath} path`,
    );
    assert.equal(fetched, false, `symbolic-link ${managedPath} must be rejected before fetch`);
    assert.equal(smoked, false, `symbolic-link ${managedPath} must be rejected before smoke`);
    assert.equal(readFileSync(outsideFile, 'utf8'), 'outside-must-not-change', `symbolic-link ${managedPath} must not modify its outside referent`);
  }

  const existingRoot = join(fixtureDir, 'existing-root');
  const existingTarget = join(existingRoot, 'vendor', 'ripgrep', 'bin', process.platform === 'win32' ? 'rg.exe' : 'rg');
  mkdirSync(join(existingRoot, 'vendor', 'ripgrep', 'bin'), { recursive: true });
  writeFileSync(existingTarget, 'already managed');
  const validated = [];
  const existingResult = await ensureRipgrep(existingRoot, {
    fetchImpl: async () => { throw new Error('existing ripgrep must not download'); },
    spawnImpl(args) {
      validated.push(args);
      return { exitCode: 0, stdout: Buffer.from('ripgrep 15.2.0\n') };
    },
  });
  assert.equal(existingResult, existingTarget, 'a valid existing managed binary must be reused');
  assert.deepEqual(validated, [[existingTarget, '--version']], 'existing managed ripgrep must be version-smoked before reuse');

  const realRoot = join(fixtureDir, 'ordinary-real-root');
  const rootAlias = join(fixtureDir, 'ordinary-root-alias');
  const aliasTarget = join(rootAlias, 'vendor', 'ripgrep', 'bin', managedLeaf);
  mkdirSync(join(realRoot, 'vendor', 'ripgrep', 'bin'), { recursive: true });
  writeFileSync(join(realRoot, 'vendor', 'ripgrep', 'bin', managedLeaf), 'already managed');
  symlinkSync(realRoot, rootAlias, 'dir');
  const aliasResult = await ensureRipgrep(rootAlias, {
    fetchImpl: async () => { throw new Error('valid managed ripgrep under an ordinary root symlink must not download'); },
    spawnImpl: () => ({ exitCode: 0, stdout: Buffer.from('ripgrep 15.2.0\n') }),
  });
  assert.equal(aliasResult, aliasTarget, 'an ordinary symlinked root must remain supported when managed children are not symlinks');

  const mismatchRoot = join(fixtureDir, 'hash-mismatch');
  const mismatchCalls = [];
  await assert.rejects(
    ensureRipgrep(mismatchRoot, {
      platform: 'darwin',
      arch: 'arm64',
      env: {},
      fetchImpl: async (url, init) => {
        mismatchCalls.push({ url: String(url), init });
        return new Response(tarBytes);
      },
      spawnImpl: () => { throw new Error('hash mismatch must fail before smoke'); },
    }),
    /sha-?256.*mismatch|integrity mismatch/i,
    'downloaded bytes must match the pinned SHA-256 before extraction',
  );
  assert.equal(mismatchCalls[0].url, `https://github.com/BurntSushi/ripgrep/releases/download/15.2.0/${unixAsset.name}`, 'ensureRipgrep must fetch the pinned GitHub release URL');
  const mismatchBin = join(mismatchRoot, 'vendor', 'ripgrep', 'bin');
  assert.equal(existsSync(mismatchBin) ? readdirSync(mismatchBin).some(name => name.includes('.staged') || name.includes('.tmp')) : false, false, 'failed installs must clean staging files');

  const proxyCases = [
    ['https://github.com/release', { HTTPS_PROXY: 'http://proxy.test:8443' }, 'http://proxy.test:8443'],
    ['https://github.com/release', { HTTPS_PROXY: 'http://proxy.test:8443', NO_PROXY: 'github.com' }, undefined],
    ['https://objects.githubusercontent.com/release', { HTTPS_PROXY: 'http://proxy.test:8443', NO_PROXY: '.githubusercontent.com' }, undefined],
    ['https://github.com:8443/release', { HTTPS_PROXY: 'http://proxy.test:8443', NO_PROXY: 'github.com:8443' }, undefined],
    ['http://[::1]:8080/release', { HTTP_PROXY: 'http://proxy.test:8443', NO_PROXY: '::1' }, undefined],
  ];
  for (const [url, env, expected] of proxyCases) assert.equal(proxyFor(url, env), expected, `proxyFor must correctly route ${url}`);

  let redirectCalls = 0;
  await assert.rejects(
    fetchWithProxy('https://redirect.example.test/start', {}, {}, async () => {
      redirectCalls++;
      return new Response(null, { status: 302, headers: { location: `/hop-${redirectCalls}` } });
    }),
    /too many redirects/i,
    'more than five redirects must be rejected',
  );
  assert.equal(redirectCalls, 6, 'five redirects may be followed before the sixth redirect is rejected');

  const redirectUrls = [];
  const timeoutDurations = [];
  const originalTimeout = AbortSignal.timeout;
  AbortSignal.timeout = duration => {
    timeoutDurations.push(duration);
    return originalTimeout(duration);
  };
  try {
    const redirected = await fetchWithProxy('https://redirect.example.test/base/start', {}, {}, async url => {
      redirectUrls.push(String(url));
      return redirectUrls.length === 1
        ? new Response(null, { status: 302, headers: { location: '../asset' } })
        : new Response('redirected');
    });
    assert.equal(await redirected.text(), 'redirected', 'a valid redirect chain must return the final response');
  } finally {
    AbortSignal.timeout = originalTimeout;
  }
  assert.deepEqual(redirectUrls, ['https://redirect.example.test/base/start', 'https://redirect.example.test/asset'], 'relative redirects must resolve against the current URL');
  assert.deepEqual(timeoutDurations, [300000, 300000], 'every redirect hop must receive a fresh five-minute timeout');

  let bypassInit;
  await fetchWithProxy('https://github.com/release', { proxy: 'http://user:secret@caller.proxy:8443' }, {
    HTTPS_PROXY: 'http://environment.proxy:8443',
    NO_PROXY: 'github.com',
  }, async (_url, init) => {
    bypassInit = init;
    return new Response('direct');
  });
  assert.equal(Object.hasOwn(bypassInit, 'proxy'), false, 'NO_PROXY bypass must strip a caller-provided proxy option');

  let proxiedInit;
  await fetchWithProxy('https://github.com/release', {}, { HTTPS_PROXY: 'http://user:secret@proxy.test:8443' }, async (_url, init) => {
    proxiedInit = init;
    return new Response('ok');
  });
  assert.equal(proxiedInit.proxy, 'http://user:secret@proxy.test:8443', 'proxy routing must reach Bun fetch');
  await assert.rejects(
    fetchWithProxy('https://github.com/release', {}, { HTTPS_PROXY: 'http://user:secret@proxy.test:8443' }, async () => {
      throw new Error('connect failed via http://user:secret@proxy.test:8443');
    }),
    error => {
      assert.match(error.message, /configured proxy/i);
      assert.doesNotMatch(error.message, /user|secret|proxy\.test/);
      return true;
    },
    'proxy transport errors must redact proxy credentials and addresses',
  );

  const origin = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('direct') });
  const proxyKeys = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'NO_PROXY', 'no_proxy'];
  const savedProxyEnv = new Map(proxyKeys.map(key => [key, Object.hasOwn(process.env, key) ? process.env[key] : undefined]));
  const deadProxy = 'http://user:secret@127.0.0.1:1';
  try {
    process.env.HTTP_PROXY = deadProxy;
    process.env.HTTPS_PROXY = deadProxy;
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    process.env.NO_PROXY = '';
    process.env.no_proxy = '';
    const response = await fetchWithProxy(`http://127.0.0.1:${origin.port}/release`, {}, { HTTP_PROXY: deadProxy, NO_PROXY: '127.0.0.1' });
    assert.equal(await response.text(), 'direct', 'NO_PROXY must force a real direct Bun connection');
    assert.equal(process.env.NO_PROXY, '', 'direct fetch must restore uppercase NO_PROXY');
    assert.equal(process.env.no_proxy, '', 'direct fetch must restore lowercase no_proxy');
  } finally {
    origin.stop(true);
    for (const [key, value] of savedProxyEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
} finally {
  rmSync(fixtureDir, { recursive: true, force: true });
}

for (const [name, source] of [['install.sh', unix], ['install.ps1', windows]]) {
  assert.doesNotMatch(source, name === 'install.sh' ? /command -v rg/ : /Get-Command rg/, `${name} must not require a system ripgrep`);
  assert.match(source, /install-ripgrep\.mjs/, `${name} cleanup and lifecycle must reference the generated module`);
  const modulePosition = source.indexOf('install-ripgrep.mjs');
  const noUpgradePosition = source.indexOf(name === 'install.sh' ? '# ─── Handle --no-upgrade' : '# ─── Handle -NoUpgrade');
  const ensurePosition = source.indexOf(name === 'install.sh' ? '"$BUN_BIN" "$CLAWGOD_DIR/install-ripgrep.mjs"' : '& $BunBin (Join-Path $ClawDir "install-ripgrep.mjs")');
  assert.ok(modulePosition >= 0 && ensurePosition > modulePosition && ensurePosition < noUpgradePosition, `${name} must install managed ripgrep before both normal and no-upgrade branches`);
}
assert.doesNotMatch(unix, /rm -rf "\$CLAWGOD_DIR\/vendor" "\$CLAWGOD_DIR\/cli\.original\.js"/, 'install.sh extraction cleanup must not delete managed ripgrep');
assert.doesNotMatch(windows, /Remove-Item -Recurse -Force \$VendorDir/, 'install.ps1 extraction cleanup must not delete managed ripgrep');
assert.match(unix, /install-ripgrep\.mjs"/, 'install.sh generated-artifact cleanup must include install-ripgrep.mjs');
assert.match(windows, /"install-ripgrep\.mjs"/, 'install.ps1 generated-artifact cleanup must include install-ripgrep.mjs');

const repatchDir = mkdtempSync(join(tmpdir(), 'clawgod-ripgrep-repatch-'));
try {
  for (const [name, repatch] of [['install.sh', unixRepatch()], ['install.ps1', powerShellRepatch()]]) {
    const fixture = join(repatchDir, name.replace('.', '-'));
    const managed = join(fixture, 'vendor', 'ripgrep', 'bin', 'rg');
    const staleVendor = join(fixture, 'vendor', 'stale.node');
    mkdirSync(join(fixture, 'vendor', 'ripgrep', 'bin'), { recursive: true });
    writeFileSync(managed, 'managed ripgrep');
    writeFileSync(staleVendor, 'stale native');
    writeFileSync(join(fixture, 'native'), 'native fixture');
    for (const helper of ['extract-natives.mjs', 'post-process.mjs', 'patch.mjs']) {
      writeFileSync(join(fixture, helper), '#!/usr/bin/env bun\n');
    }
    writeFileSync(join(fixture, 'repatch.mjs'), repatch);
    const child = Bun.spawn([process.execPath, join(fixture, 'repatch.mjs'), join(fixture, 'native')], { stdout: 'pipe', stderr: 'pipe' });
    const [status, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    assert.equal(status, 0, `${name} repatch fixture must execute: ${stderr}`);
    assert.equal(readFileSync(managed, 'utf8'), 'managed ripgrep', `${name} repatch must preserve the private ripgrep binary`);
    assert.equal(existsSync(staleVendor), false, `${name} repatch must still clear stale non-ripgrep vendor assets`);
  }
} finally {
  rmSync(repatchDir, { recursive: true, force: true });
}

const wrapperDir = mkdtempSync(join(tmpdir(), 'clawgod-ripgrep-wrapper-'));
try {
  for (const [name, wrapper] of [['install.sh', unixWrapper()], ['install.ps1', powerShellWrapper()]]) {
    const home = join(wrapperDir, name.replace('.', '-'));
    const clawDir = join(home, '.clawgod');
    const managedBin = join(clawDir, 'vendor', 'ripgrep', 'bin');
    const fakeSystemBin = join(home, 'system-bin');
    mkdirSync(managedBin, { recursive: true });
    mkdirSync(fakeSystemBin, { recursive: true });
    const managedRg = join(managedBin, 'rg');
    const systemRg = join(fakeSystemBin, 'rg');
    writeFileSync(managedRg, '#!/bin/sh\necho managed-ripgrep\n');
    writeFileSync(systemRg, '#!/bin/sh\necho system-ripgrep\n');
    chmodSync(managedRg, 0o755);
    chmodSync(systemRg, 0o755);
    writeFileSync(join(clawDir, 'cli.cjs'), wrapper);
    const loadCounter = join(clawDir, 'upstream-load-count');
    writeFileSync(join(clawDir, 'cli.original.cjs'), `
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const counterFile = ${JSON.stringify(loadCounter)};
let loads = 0;
try { loads = Number(fs.readFileSync(counterFile, 'utf8')); } catch {}
fs.writeFileSync(counterFile, String(loads + 1));
if (process.env.CLAWGOD_FIXTURE_EXIT_CODE) process.exit(Number(process.env.CLAWGOD_FIXTURE_EXIT_CODE));
console.log(JSON.stringify({
  path: process.env.PATH,
  builtin: process.env.USE_BUILTIN_RIPGREP,
  argv: process.argv.slice(2),
  which: Bun.which('rg'),
  bunRg: Buffer.from(Bun.spawnSync(['rg', '--version']).stdout).toString().trim(),
  nodeRg: spawnSync('rg', ['--version'], { encoding: 'utf8' }).stdout.trim(),
}));
`);
    const fixtureArgs = ['value with spaces', 'quote"fixture'];
    const child = Bun.spawn([process.execPath, join(clawDir, 'cli.cjs'), ...fixtureArgs], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HOME: home, PATH: `${fakeSystemBin}${delimiter}${process.env.PATH || ''}` },
    });
    const [status, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    assert.equal(status, 0, `${name} wrapper must execute: ${stderr}`);
    const inherited = JSON.parse(stdout.trim());
    assert.equal(inherited.path.split(delimiter)[0], managedBin, `${name} must prepend the managed ripgrep directory to PATH`);
    assert.equal(inherited.builtin, '1', `${name} must preserve the built-in ripgrep selection flag`);
    assert.deepEqual(inherited.argv, fixtureArgs, `${name} re-exec must preserve argument boundaries`);
    assert.equal(inherited.which, managedRg, `${name} default Bun.which must resolve managed ripgrep`);
    assert.equal(inherited.bunRg, 'managed-ripgrep', `${name} default Bun.spawnSync must resolve managed ripgrep`);
    assert.equal(inherited.nodeRg, 'managed-ripgrep', `${name} default child_process spawn must resolve managed ripgrep`);
    assert.equal(readFileSync(loadCounter, 'utf8'), '1', `${name} must load upstream exactly once`);

    const exitChild = Bun.spawn([process.execPath, join(clawDir, 'cli.cjs')], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        HOME: home,
        PATH: `${fakeSystemBin}${delimiter}${process.env.PATH || ''}`,
        CLAWGOD_FIXTURE_EXIT_CODE: '23',
      },
    });
    const exitStatus = await exitChild.exited;
    assert.equal(exitStatus, 23, `${name} re-exec must propagate the upstream exit code`);
    assert.equal(readFileSync(loadCounter, 'utf8'), '2', `${name} exit-code probe must also load upstream only once`);
  }
} finally {
  rmSync(wrapperDir, { recursive: true, force: true });
}

console.log('installer managed ripgrep checks passed');
