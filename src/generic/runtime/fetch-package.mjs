#!/usr/bin/env bun
import { chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export { fetchWithProxy, parseMacOSProxySettings, proxyFor, readMacOSSystemProxy } from './proxy-fetch.mjs';
import { fetchWithProxy } from './proxy-fetch.mjs';

const MIN_BINARY_BYTES = 10 * 1024 * 1024;

async function checkedJson(response) {
  try {
    return await response.json();
  } catch {
    throw new Error('Registry returned invalid JSON');
  }
}

function objectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function supportedIntegrity(value) {
  return typeof value === 'string' && /^sha512-[A-Za-z0-9+/]{86}==$/.test(value);
}

function httpTarball(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function resolvePackage(pkg, requested, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const env = options.env || process.env;
  const metadataUrl = `https://registry.npmjs.org/${encodeURIComponent(pkg)}`;
  const metadata = await checkedJson(await fetchWithProxy(metadataUrl, {}, env, fetchImpl));
  if (!objectRecord(metadata)) throw new Error('Registry metadata must be an object');
  if (!objectRecord(metadata.versions)) throw new Error('Registry versions must be an object');
  const version = requested === 'latest' ? metadata['dist-tags']?.latest : requested;
  if (typeof version !== 'string' || !version.trim()) throw new Error('Resolved version must be a non-empty string');
  if (!Object.hasOwn(metadata.versions, version)) throw new Error(`Package version not found: ${pkg}@${version}`);
  const manifest = metadata.versions[version];
  if (!objectRecord(manifest)) throw new Error('Registry manifest must be an object');
  if (manifest.name !== pkg) throw new Error('Registry manifest name must match the requested package');
  if (manifest.version !== version) throw new Error('Registry manifest version must match the resolved version');
  const dist = manifest.dist;
  if (!objectRecord(dist)) throw new Error('Registry dist must be an object');
  if (!supportedIntegrity(dist.integrity)) throw new Error('Registry integrity must be a supported SHA-512 string');
  if (!httpTarball(dist.tarball)) throw new Error('Registry tarball must be an HTTP(S) URL');
  return { version, dist };
}

function parseSpec(spec) {
  const separator = spec.lastIndexOf('@');
  if (separator > 0) {
    return { pkg: spec.slice(0, separator), requested: spec.slice(separator + 1) || 'latest' };
  }
  return { pkg: spec, requested: 'latest' };
}

function safeArchivePath(name) {
  if (!name || name.startsWith('/') || name.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(name)) return false;
  return !name.split(/[\\/]/).includes('..');
}

export async function installPackage(spec, outDir, options = {}) {
  const { pkg, requested } = parseSpec(spec);
  const fetchImpl = options.fetchImpl || fetch;
  const env = options.env || process.env;
  const { version, dist } = await resolvePackage(pkg, requested, { fetchImpl, env });
  if (!dist.tarball || typeof dist.integrity !== 'string') throw new Error(`Missing distribution metadata for ${pkg}@${version}`);

  const archiveResponse = await fetchWithProxy(dist.tarball, {}, env, fetchImpl);
  const bytes = new Uint8Array(await archiveResponse.arrayBuffer());
  const integrityMatch = /^sha512-([A-Za-z0-9+/]+={0,2})$/.exec(dist.integrity);
  if (!integrityMatch) throw new Error(`Unsupported integrity for ${pkg}@${version}`);
  const actual = new Bun.CryptoHasher('sha512').update(bytes).digest('base64');
  if (actual !== integrityMatch[1]) throw new Error(`Integrity mismatch for ${pkg}@${version}`);

  const files = await new Bun.Archive(bytes).files();
  for (const name of files.keys()) {
    if (!safeArchivePath(name)) throw new Error(`Unsafe archive path: ${name}`);
  }

  const packagePath = 'package/package.json';
  const binaryName = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const binaryEntryPath = `package/${binaryName}`;
  const packageFile = files.get(packagePath);
  const binaryFile = files.get(binaryEntryPath);
  if (!packageFile) throw new Error(`Archive is missing ${packagePath}`);
  if (!binaryFile) throw new Error(`Archive is missing ${binaryEntryPath}`);
  if (binaryFile.size <= MIN_BINARY_BYTES) throw new Error(`Archive binary is too small: ${binaryEntryPath}`);

  const packageDir = join(outDir, 'package');
  const binaryPath = join(packageDir, binaryName);
  mkdirSync(packageDir, { recursive: true });
  await Bun.write(join(packageDir, 'package.json'), packageFile);
  await Bun.write(binaryPath, binaryFile);
  if (process.platform !== 'win32') chmodSync(binaryPath, 0o755);
  return { version, binaryPath };
}

if (import.meta.main) {
  const [spec, outDir] = process.argv.slice(2);
  if (!spec || !outDir) throw new Error('usage: fetch-package.mjs <package@version> <output-directory>');
  const result = await installPackage(spec, outDir);
  console.log(`VERSION=${result.version}`);
}
