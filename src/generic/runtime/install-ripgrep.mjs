#!/usr/bin/env bun
import { chmodSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export { fetchWithProxy, parseMacOSProxySettings, proxyFor } from './proxy-fetch.mjs';
import { fetchWithProxy } from './proxy-fetch.mjs';

export const RIPGREP_VERSION = '15.2.0';
export const RIPGREP_ASSETS = {
  'darwin-arm64': ['ripgrep-15.2.0-aarch64-apple-darwin.tar.gz', '3750b2e93f37e0c692657da574d7019a101c0084da05a790c83fd335bad973e4'],
  'darwin-x64': ['ripgrep-15.2.0-x86_64-apple-darwin.tar.gz', 'af7825fcc69a2afc7a7aea55fc9af90e26421d8f20fe59df32e233c0b8a231c1'],
  'linux-arm64': ['ripgrep-15.2.0-aarch64-unknown-linux-musl.tar.gz', '800b1e7206afe799dfb5a6901f23147cfaabe0e52210538100f61e86e1740915'],
  'linux-x64': ['ripgrep-15.2.0-x86_64-unknown-linux-musl.tar.gz', '33e15bcf1624b25cdd2a55813a47a2f95dbe126268203e76aa6a585d1e7b149c'],
  'win32-arm64': ['ripgrep-15.2.0-aarch64-pc-windows-msvc.zip', 'e4abca10c3a64ebea742667dd7009449d49403db5460dd6873e389fa2945360f'],
  'win32-x64': ['ripgrep-15.2.0-x86_64-pc-windows-msvc.zip', '71b2fef860abe467217a538ff31de02f5258807c0129f771846f87bd029aafc5'],
};

const MAX_BINARY_BYTES = 100 * 1024 * 1024;

function safeArchivePath(name) {
  if (!name || name.startsWith('/') || name.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(name)) return false;
  return !name.split(/[\\/]/).includes('..');
}

export function selectRipgrepAsset(platform, arch) {
  const selected = RIPGREP_ASSETS[`${platform}-${arch}`];
  if (!selected) throw new Error(`Unsupported ripgrep platform: ${platform}-${arch}`);
  const [name, sha256] = selected;
  const directory = name.replace(/\.(?:tar\.gz|zip)$/, '');
  return { name, sha256, entry: `${directory}/${platform === 'win32' ? 'rg.exe' : 'rg'}` };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function checkedRange(start, size, limit, label) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(size) || start < 0 || size < 0 || start > limit || size > limit - start) {
    throw new Error(`ZIP ${label} is out of bounds`);
  }
  return start + size;
}

async function extractZip(bytes, expectedEntry) {
  if (bytes.length < 22) throw new Error('ZIP end of central directory is missing');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const searchStart = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= searchStart; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      const commentLength = view.getUint16(offset + 20, true);
      if (offset + 22 + commentLength === bytes.length) { eocd = offset; break; }
    }
  }
  if (eocd < 0) throw new Error('ZIP end of central directory is missing or malformed');
  if (view.getUint16(eocd + 4, true) !== 0 || view.getUint16(eocd + 6, true) !== 0) throw new Error('Multi-disk ZIP archives are unsupported');
  const entries = view.getUint16(eocd + 10, true);
  if (entries !== view.getUint16(eocd + 8, true) || entries === 0xffff) throw new Error('ZIP central directory entry count is invalid');
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  const centralEnd = checkedRange(centralOffset, centralSize, eocd, 'central directory');
  let cursor = centralOffset;
  let selected = null;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let index = 0; index < entries; index++) {
    checkedRange(cursor, 46, centralEnd, 'central entry header');
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('ZIP central directory signature is invalid');
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const expectedCrc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    if (flags & 0x41) throw new Error('Encrypted ZIP entries are unsupported');
    if (method !== 0 && method !== 8) throw new Error(`Unsupported ZIP compression method: ${method}`);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) throw new Error('ZIP64 entries are unsupported');
    if (uncompressedSize > MAX_BINARY_BYTES) throw new Error('ZIP executable size exceeds the safety limit');
    const recordEnd = checkedRange(cursor + 46, nameLength + extraLength + commentLength, centralEnd, 'central entry');
    let name;
    try { name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)); }
    catch { throw new Error('ZIP entry name is not valid UTF-8'); }
    if (!safeArchivePath(name)) throw new Error(`Unsafe ZIP path: ${name}`);
    if (name === expectedEntry) {
      if (selected) throw new Error(`ZIP contains duplicate exact entry: ${expectedEntry}`);
      selected = { flags, method, expectedCrc, compressedSize, uncompressedSize, localOffset, name };
    }
    cursor = recordEnd;
  }
  if (cursor !== centralEnd) throw new Error('ZIP central directory size does not match its entries');
  if (!selected) throw new Error(`ZIP is missing exact entry: ${expectedEntry}`);

  checkedRange(selected.localOffset, 30, centralOffset, 'local header');
  if (view.getUint32(selected.localOffset, true) !== 0x04034b50) throw new Error('ZIP local header signature is invalid');
  const localFlags = view.getUint16(selected.localOffset + 6, true);
  const localMethod = view.getUint16(selected.localOffset + 8, true);
  const localCrc = view.getUint32(selected.localOffset + 14, true);
  const localCompressedSize = view.getUint32(selected.localOffset + 18, true);
  const localUncompressedSize = view.getUint32(selected.localOffset + 22, true);
  const localNameLength = view.getUint16(selected.localOffset + 26, true);
  const localExtraLength = view.getUint16(selected.localOffset + 28, true);
  if (localFlags !== selected.flags || localMethod !== selected.method) throw new Error('ZIP local header disagrees with central directory');
  if (!(selected.flags & 8) && (localCrc !== selected.expectedCrc || localCompressedSize !== selected.compressedSize || localUncompressedSize !== selected.uncompressedSize)) {
    throw new Error('ZIP local header disagrees with central directory');
  }
  const dataStart = checkedRange(selected.localOffset + 30, localNameLength + localExtraLength, centralOffset, 'local name and extra data');
  const dataEnd = checkedRange(dataStart, selected.compressedSize, centralOffset, 'compressed data');
  let localName;
  try { localName = decoder.decode(bytes.subarray(selected.localOffset + 30, selected.localOffset + 30 + localNameLength)); }
  catch { throw new Error('ZIP local entry name is not valid UTF-8'); }
  if (localName !== selected.name) throw new Error('ZIP local entry name disagrees with central directory');
  const compressed = bytes.subarray(dataStart, dataEnd);
  let output;
  try {
    output = selected.method === 0 ? new Uint8Array(compressed) : new Uint8Array(Bun.inflateSync(compressed));
  } catch {
    throw new Error('ZIP deflate stream is malformed');
  }
  if (output.length !== selected.uncompressedSize) throw new Error('ZIP uncompressed size mismatch');
  if (crc32(output) !== selected.expectedCrc) throw new Error('ZIP CRC-32 mismatch');
  return output;
}

export async function extractRipgrep(bytes, asset) {
  if (!(bytes instanceof Uint8Array)) throw new Error('ripgrep archive must be bytes');
  if (!asset || typeof asset.entry !== 'string' || !safeArchivePath(asset.entry)) throw new Error('ripgrep asset entry is invalid');
  if (asset.name.endsWith('.zip')) return extractZip(bytes, asset.entry);
  if (!asset.name.endsWith('.tar.gz')) throw new Error(`Unsupported ripgrep archive: ${asset.name}`);
  let files;
  try { files = await new Bun.Archive(bytes).files(); }
  catch { throw new Error('ripgrep tar.gz archive is malformed'); }
  for (const name of files.keys()) {
    if (!safeArchivePath(name)) throw new Error(`Unsafe archive path: ${name}`);
  }
  const file = files.get(asset.entry);
  if (!file) throw new Error(`tar.gz is missing exact entry: ${asset.entry}`);
  if (file.size > MAX_BINARY_BYTES) throw new Error('ripgrep executable size exceeds the safety limit');
  return new Uint8Array(await file.arrayBuffer());
}

export function validateRipgrepVersion(path, spawnImpl = Bun.spawnSync) {
  const result = spawnImpl([path, '--version'], { stdout: 'pipe', stderr: 'pipe' });
  const output = typeof result.stdout === 'string' ? result.stdout : Buffer.from(result.stdout || []).toString();
  if (result.exitCode !== 0 || !/^ripgrep 15\.2\.0(?: \(rev [0-9A-Fa-f]+\))?(?:\r?\n|$)/.test(output)) {
    throw new Error(`ripgrep ${RIPGREP_VERSION} version smoke failed`);
  }
}

function assertContainedManagedPath(root, path) {
  const child = relative(resolve(root), resolve(path));
  if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error(`Managed ripgrep path escaped its root: ${path}`);
  }
}

function assertNotSymbolicLink(path, fsOps = {}) {
  const inspect = fsOps.lstatSync || lstatSync;
  try {
    if (inspect(path).isSymbolicLink()) throw new Error(`Managed ripgrep path must not be a symbolic link: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function isValidRipgrepCandidate(path, fsOps, spawnImpl) {
  if (!fsOps.existsSync(path)) return false;
  try {
    validateRipgrepVersion(path, spawnImpl);
    return true;
  } catch {
    return false;
  }
}

export function replaceManagedBinary(staged, target, fsOps = { existsSync, lstatSync, renameSync, rmSync }, spawnImpl = Bun.spawnSync) {
  const backup = `${target}.previous`;
  const displaced = `${target}.${process.pid}.current`;
  for (const path of [staged, target, backup, displaced]) assertNotSymbolicLink(path, fsOps);
  if (fsOps.existsSync(displaced)) throw new Error(`Managed ripgrep transaction path already exists: ${displaced}`);
  const currentValid = isValidRipgrepCandidate(target, fsOps, spawnImpl);
  const backupValid = isValidRipgrepCandidate(backup, fsOps, spawnImpl);
  let movedCurrent = false;
  try {
    if (fsOps.existsSync(target)) {
      fsOps.renameSync(target, displaced);
      movedCurrent = true;
    }
    try {
      fsOps.renameSync(staged, target);
    } catch (error) {
      if (fsOps.existsSync(target)) fsOps.rmSync(target, { force: true });
      if (currentValid && movedCurrent && fsOps.existsSync(displaced)) fsOps.renameSync(displaced, target);
      else if (backupValid && fsOps.existsSync(backup)) fsOps.renameSync(backup, target);
      if (fsOps.existsSync(backup)) fsOps.rmSync(backup, { force: true });
      if (fsOps.existsSync(displaced)) fsOps.rmSync(displaced, { force: true });
      throw error;
    }
    fsOps.rmSync(backup, { force: true });
    if (fsOps.existsSync(displaced)) fsOps.rmSync(displaced, { force: true });
  } finally {
    if (fsOps.existsSync(staged)) fsOps.rmSync(staged, { force: true });
  }
}

export async function ensureRipgrep(root, options = {}) {
  if (typeof root !== 'string' || !root.trim()) throw new Error('managed ripgrep root is required');
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const asset = selectRipgrepAsset(platform, arch);
  const vendorDir = join(root, 'vendor');
  const ripgrepDir = join(vendorDir, 'ripgrep');
  const binDir = join(ripgrepDir, 'bin');
  const target = join(binDir, platform === 'win32' ? 'rg.exe' : 'rg');
  const staged = platform === 'win32' ? `${target}.${process.pid}.staged.exe` : `${target}.${process.pid}.staged`;
  const backup = `${target}.previous`;
  const displaced = `${target}.${process.pid}.current`;
  const rootPath = resolve(root);
  const managedPaths = [vendorDir, ripgrepDir, binDir, target, staged, backup, displaced];
  for (const path of managedPaths) {
    assertContainedManagedPath(rootPath, path);
    assertNotSymbolicLink(path, options.fsOps);
  }
  const spawnImpl = options.spawnImpl || Bun.spawnSync;
  if (existsSync(target)) {
    try { validateRipgrepVersion(target, spawnImpl); return target; }
    catch {}
  }

  const fetchImpl = options.fetchImpl || fetch;
  const env = options.env || process.env;
  const url = `https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/${asset.name}`;
  const response = await fetchWithProxy(url, {}, env, fetchImpl);
  const archive = new Uint8Array(await response.arrayBuffer());
  const actual = new Bun.CryptoHasher('sha256').update(archive).digest('hex');
  if (actual !== asset.sha256) throw new Error(`SHA-256 mismatch for ${asset.name}`);
  const executable = await extractRipgrep(archive, asset);

  mkdirSync(binDir, { recursive: true });
  for (const path of managedPaths) assertNotSymbolicLink(path, options.fsOps);
  rmSync(staged, { force: true });
  try {
    await Bun.write(staged, executable);
    if (platform !== 'win32') chmodSync(staged, 0o755);
    validateRipgrepVersion(staged, spawnImpl);
    replaceManagedBinary(staged, target, options.fsOps, spawnImpl);
    return target;
  } finally {
    assertNotSymbolicLink(staged, options.fsOps);
    if (existsSync(staged)) rmSync(staged, { force: true });
  }
}

if (import.meta.main) {
  const root = process.argv[2];
  const target = await ensureRipgrep(root);
  console.log(`ripgrep ${RIPGREP_VERSION}: ${target}`);
}
