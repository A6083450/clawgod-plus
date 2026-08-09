#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const unix = readFileSync(new URL('../install.sh', import.meta.url), 'utf8');
const windows = readFileSync(new URL('../install.ps1', import.meta.url), 'utf8');

function unixTemplate() {
  const marker = 'cat > "$FETCH_SCRIPT" << \'FETCH_PACKAGE_EOF\'';
  const start = unix.indexOf(marker);
  assert.notEqual(start, -1, 'install.sh must generate fetch-package.mjs');
  const bodyStart = unix.indexOf('\n', start) + 1;
  const end = unix.indexOf('\nFETCH_PACKAGE_EOF', bodyStart);
  assert.notEqual(end, -1, 'install.sh fetch-package.mjs template must end');
  return unix.slice(bodyStart, end);
}

function powerShellTemplate() {
  const marker = "$fetchScript = Join-Path $NativeBinTmpDir \"fetch-package.mjs\"\n    @'\n#!/usr/bin/env bun";
  const start = windows.indexOf(marker);
  assert.notEqual(start, -1, 'install.ps1 must generate fetch-package.mjs');
  const bodyStart = windows.indexOf('#!/usr/bin/env bun', start);
  const end = windows.indexOf("\n'@ | Set-Content $fetchScript", bodyStart);
  assert.notEqual(end, -1, 'install.ps1 fetch-package.mjs template must end');
  return windows.slice(bodyStart, end);
}

const unixModule = unixTemplate();
const windowsModule = powerShellTemplate();
const normalize = source => source.replace(/\r\n/g, '\n').trim();
assert.equal(normalize(windowsModule), normalize(unixModule), 'Unix and Windows fetch-package.mjs bodies must be identical');

const fixtureDir = mkdtempSync(join(tmpdir(), 'clawgod-registry-'));
try {
  const modulePath = join(fixtureDir, 'fetch-package.mjs');
  await Bun.write(modulePath, unixModule);
  chmodSync(modulePath, 0o700);
  const { fetchWithProxy, installPackage, proxyFor, resolvePackage } = await import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);

  assert.equal(typeof proxyFor, 'function', 'fetch-package.mjs must export proxyFor');
  assert.equal(typeof fetchWithProxy, 'function', 'fetch-package.mjs must export fetchWithProxy');
  assert.equal(typeof resolvePackage, 'function', 'fetch-package.mjs must export resolvePackage');
  assert.equal(typeof installPackage, 'function', 'fetch-package.mjs must export installPackage');

  const packageName = '@anthropic-ai/claude-code-darwin-arm64';
  const version = '2.1.999';
  const tarballUrl = 'https://cdn.example.test/claude-code.tgz';
  const binaryBytes = new Uint8Array(10 * 1024 * 1024 + 1);
  binaryBytes[0] = 0xca;
  binaryBytes[binaryBytes.length - 1] = 0xfe;

  async function archiveBytes(entries) {
    return new Bun.Archive(entries, { compress: 'gzip' }).bytes();
  }

  function integrity(bytes) {
    return `sha512-${new Bun.CryptoHasher('sha512').update(bytes).digest('base64')}`;
  }

  function metadata(bytes, overrides = {}) {
    return {
      name: packageName,
      'dist-tags': { latest: version },
      versions: {
        [version]: {
          name: packageName,
          version,
          dist: { tarball: tarballUrl, integrity: integrity(bytes) },
        },
      },
      ...overrides,
    };
  }

  function registryFetch(meta, tarball, calls = []) {
    return async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).startsWith('https://registry.npmjs.org/')) {
        return Response.json(meta);
      }
      if (String(url) === tarballUrl) {
        return new Response(tarball);
      }
      return new Response('not found', { status: 404 });
    };
  }

  const goodArchive = await archiveBytes({
    'package/package.json': JSON.stringify({ name: packageName, version }),
    'package/claude': binaryBytes,
    'package/ignored.txt': 'must not be written',
  });

  const exactCalls = [];
  const exactOut = join(fixtureDir, 'exact package output');
  const exactResult = await installPackage(`${packageName}@${version}`, exactOut, {
    fetchImpl: registryFetch(metadata(goodArchive), goodArchive, exactCalls),
    env: {},
  });
  assert.equal(exactResult.version, version, 'exact version installs must return the resolved version');
  assert.equal(exactResult.binaryPath, join(exactOut, 'package', 'claude'), 'installPackage must return the selected platform binary path');
  assert.equal(exactCalls[0].url, 'https://registry.npmjs.org/%40anthropic-ai%2Fclaude-code-darwin-arm64', 'scoped package metadata URL must encode the complete package name');
  assert.equal((await Bun.file(exactResult.binaryPath).bytes()).length, binaryBytes.length, 'installed binary must retain its exact size');
  assert.notEqual(statSync(exactResult.binaryPath).mode & 0o111, 0, 'installed Unix binary must be executable');
  assert.deepEqual(JSON.parse(await Bun.file(join(exactOut, 'package', 'package.json')).text()), { name: packageName, version }, 'package.json must be written unchanged');
  assert.equal(await Bun.file(join(exactOut, 'package', 'ignored.txt')).exists(), false, 'unselected archive entries must not be written');

  const latest = await resolvePackage(packageName, 'latest', {
    fetchImpl: registryFetch(metadata(goodArchive), goodArchive),
    env: {},
  });
  assert.equal(latest.version, version, 'latest must resolve through the Registry dist-tag');
  assert.equal(typeof latest.dist, 'object', 'resolvePackage must preserve the dist object contract');
  assert.equal(Array.isArray(latest.dist), false, 'resolvePackage dist must not be an array');
  assert.equal(latest.dist.tarball, tarballUrl, 'resolvePackage must return the selected manifest dist object');

  await assert.rejects(
    resolvePackage(packageName, version, { fetchImpl: async () => new Response('unavailable', { status: 503 }), env: {} }),
    /HTTP 503/,
    'Registry HTTP failures must be rejected',
  );

  await assert.rejects(
    resolvePackage(packageName, '2.1.404', { fetchImpl: registryFetch(metadata(goodArchive), goodArchive), env: {} }),
    /version.*2\.1\.404/i,
    'missing Registry versions must be rejected',
  );

  const validMetadata = metadata(goodArchive);
  const validManifest = validMetadata.versions[version];
  const malformedRegistryCases = [
    ['null metadata', null, version, /Registry metadata must be an object/],
    ['array metadata', [], version, /Registry metadata must be an object/],
    ['null versions', { ...validMetadata, versions: null }, version, /Registry versions must be an object/],
    ['array versions', { ...validMetadata, versions: [] }, version, /Registry versions must be an object/],
    ['array manifest', { ...validMetadata, versions: { [version]: [] } }, version, /Registry manifest must be an object/],
    ['null dist', { ...validMetadata, versions: { [version]: { ...validManifest, dist: null } } }, version, /Registry dist must be an object/],
    ['array dist', { ...validMetadata, versions: { [version]: { ...validManifest, dist: [] } } }, version, /Registry dist must be an object/],
    ['empty resolved version', { ...validMetadata, 'dist-tags': { latest: '' } }, 'latest', /Resolved version must be a non-empty string/],
    ['numeric resolved version', { ...validMetadata, 'dist-tags': { latest: 42 } }, 'latest', /Resolved version must be a non-empty string/],
    ['wrong manifest name', { ...validMetadata, versions: { [version]: { ...validManifest, name: '@other/package' } } }, version, /Registry manifest name must match/],
    ['missing manifest name', { ...validMetadata, versions: { [version]: { ...validManifest, name: undefined } } }, version, /Registry manifest name must match/],
    ['wrong manifest version', { ...validMetadata, versions: { [version]: { ...validManifest, version: '2.1.998' } } }, version, /Registry manifest version must match/],
    ['numeric manifest version', { ...validMetadata, versions: { [version]: { ...validManifest, version: 42 } } }, version, /Registry manifest version must match/],
    ['missing integrity', { ...validMetadata, versions: { [version]: { ...validManifest, dist: { tarball: tarballUrl } } } }, version, /Registry integrity must be a supported SHA-512 string/],
    ['unsupported integrity', { ...validMetadata, versions: { [version]: { ...validManifest, dist: { ...validManifest.dist, integrity: 'sha1-deadbeef' } } } }, version, /Registry integrity must be a supported SHA-512 string/],
    ['short SHA-512 integrity', { ...validMetadata, versions: { [version]: { ...validManifest, dist: { ...validManifest.dist, integrity: 'sha512-ZGVhZGJlZWY=' } } } }, version, /Registry integrity must be a supported SHA-512 string/],
    ['array integrity', { ...validMetadata, versions: { [version]: { ...validManifest, dist: { ...validManifest.dist, integrity: [] } } } }, version, /Registry integrity must be a supported SHA-512 string/],
    ['missing tarball', { ...validMetadata, versions: { [version]: { ...validManifest, dist: { integrity: validManifest.dist.integrity } } } }, version, /Registry tarball must be an HTTP\(S\) URL/],
    ['numeric tarball', { ...validMetadata, versions: { [version]: { ...validManifest, dist: { ...validManifest.dist, tarball: 42 } } } }, version, /Registry tarball must be an HTTP\(S\) URL/],
    ['non-HTTP tarball', { ...validMetadata, versions: { [version]: { ...validManifest, dist: { ...validManifest.dist, tarball: 'ftp://cdn.example.test/package.tgz' } } } }, version, /Registry tarball must be an HTTP\(S\) URL/],
    ['malformed tarball', { ...validMetadata, versions: { [version]: { ...validManifest, dist: { ...validManifest.dist, tarball: 'not a URL' } } } }, version, /Registry tarball must be an HTTP\(S\) URL/],
  ];
  for (const [label, registryMetadata, requested, expectedError] of malformedRegistryCases) {
    await assert.rejects(
      resolvePackage(packageName, requested, { fetchImpl: registryFetch(registryMetadata, goodArchive), env: {} }),
      expectedError,
      `${label} must fail with a Registry contract error`,
    );
  }

  const badIntegrityMeta = metadata(goodArchive);
  badIntegrityMeta.versions[version].dist.integrity = `sha512-${'A'.repeat(86)}==`;
  await assert.rejects(
    installPackage(`${packageName}@${version}`, join(fixtureDir, 'bad-integrity'), {
      fetchImpl: registryFetch(badIntegrityMeta, goodArchive),
      env: {},
    }),
    /Integrity mismatch/,
    'a bad SHA-512 integrity value must reject the archive',
  );

  const missingBinary = await archiveBytes({
    'package/package.json': JSON.stringify({ name: packageName, version }),
  });
  await assert.rejects(
    installPackage(`${packageName}@${version}`, join(fixtureDir, 'missing-binary'), {
      fetchImpl: registryFetch(metadata(missingBinary), missingBinary),
      env: {},
    }),
    /missing.*package\/claude/i,
    'archives without the platform binary must be rejected',
  );

  const undersized = await archiveBytes({
    'package/package.json': JSON.stringify({ name: packageName, version }),
    'package/claude': new Uint8Array(1024),
  });
  await assert.rejects(
    installPackage(`${packageName}@${version}`, join(fixtureDir, 'undersized'), {
      fetchImpl: registryFetch(metadata(undersized), undersized),
      env: {},
    }),
    /too small/i,
    'undersized platform binaries must be rejected',
  );

  const unsafe = await archiveBytes({
    'package/package.json': JSON.stringify({ name: packageName, version }),
    'package/claude': binaryBytes,
    '../outside': 'unsafe',
  });
  await assert.rejects(
    installPackage(`${packageName}@${version}`, join(fixtureDir, 'unsafe'), {
      fetchImpl: registryFetch(metadata(unsafe), unsafe),
      env: {},
    }),
    /unsafe archive path/i,
    'archives containing traversal paths must be rejected before writing selected files',
  );

  let redirectCalls = 0;
  await assert.rejects(
    fetchWithProxy('https://redirect.example.test/start', {}, {}, async url => {
      redirectCalls++;
      return new Response(null, { status: 302, headers: { location: `/hop-${redirectCalls}` } });
    }),
    /too many redirects/i,
    'more than five redirects must be rejected',
  );
  assert.equal(redirectCalls, 6, 'five redirects may be followed but the sixth redirect must stop');

  const redirectUrls = [];
  const timeoutDurations = [];
  const originalTimeout = AbortSignal.timeout;
  AbortSignal.timeout = duration => {
    timeoutDurations.push(duration);
    return originalTimeout(duration);
  };
  let redirected;
  try {
    redirected = await fetchWithProxy('https://redirect.example.test/base/start', {}, {}, async url => {
      redirectUrls.push(String(url));
      return redirectUrls.length === 1
        ? new Response(null, { status: 302, headers: { location: '../payload' } })
        : new Response('redirected');
    });
  } finally {
    AbortSignal.timeout = originalTimeout;
  }
  assert.equal(await redirected.text(), 'redirected', 'a successful redirect chain must return the final response');
  assert.deepEqual(redirectUrls, ['https://redirect.example.test/base/start', 'https://redirect.example.test/payload'], 'relative redirect locations must resolve against the current URL');
  assert.deepEqual(timeoutDurations, [300000, 300000], 'every redirect request must receive its own five-minute timeout');

  const proxyCases = [
    ['https://registry.npmjs.org/pkg', { HTTPS_PROXY: 'http://upper.proxy:8443', HTTP_PROXY: 'http://fallback.proxy:8080' }, 'http://upper.proxy:8443'],
    ['https://registry.npmjs.org/pkg', { https_proxy: 'http://lower.proxy:8443' }, 'http://lower.proxy:8443'],
    ['http://registry.npmjs.org/pkg', { http_proxy: 'http://lower.proxy:8080' }, 'http://lower.proxy:8080'],
    ['https://registry.npmjs.org/pkg', { HTTPS_PROXY: 'http://proxy.test', NO_PROXY: 'registry.npmjs.org' }, undefined],
    ['https://registry.npmjs.org/pkg', { HTTPS_PROXY: 'http://proxy.test', NO_PROXY: '*' }, undefined],
    ['https://example.com/pkg', { HTTPS_PROXY: 'http://proxy.test', NO_PROXY: '.example.com' }, undefined],
    ['https://api.example.com/pkg', { HTTPS_PROXY: 'http://proxy.test', NO_PROXY: '.example.com' }, undefined],
    ['https://example.com:8443/pkg', { HTTPS_PROXY: 'http://proxy.test', NO_PROXY: 'example.com:8443' }, undefined],
    ['https://example.com/pkg', { HTTPS_PROXY: 'http://proxy.test', NO_PROXY: 'example.com:8443' }, 'http://proxy.test'],
    ['http://[::1]:8080/pkg', { HTTP_PROXY: 'http://proxy.test', NO_PROXY: '::1' }, undefined],
    ['http://[::1]:8080/pkg', { HTTP_PROXY: 'http://proxy.test', no_proxy: '[::1]:8081' }, 'http://proxy.test'],
  ];
  for (const [url, env, expected] of proxyCases) {
    assert.equal(proxyFor(url, env), expected, `proxyFor must select the expected proxy for ${url}`);
  }

  const origin = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      return new Response('direct origin');
    },
  });
  const proxyEnvKeys = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'NO_PROXY', 'no_proxy'];
  const savedProxyEnv = new Map(proxyEnvKeys.map(key => [key, Object.hasOwn(process.env, key) ? process.env[key] : undefined]));
  const deadProxy = 'http://user:secret@127.0.0.1:1';
  try {
    process.env.HTTP_PROXY = deadProxy;
    process.env.HTTPS_PROXY = deadProxy;
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    process.env.NO_PROXY = '';
    process.env.no_proxy = '';

    const originUrl = `http://127.0.0.1:${origin.port}/payload`;
    await assert.rejects(
      fetch(originUrl, { signal: AbortSignal.timeout(1000) }),
      'Bun 1.3.14 native fetch must empirically use the dead process proxy when no direct override is active',
    );

    const directResponse = await fetchWithProxy(originUrl, {}, {
      HTTP_PROXY: deadProxy,
      HTTPS_PROXY: deadProxy,
      NO_PROXY: '127.0.0.1',
    });
    assert.equal(await directResponse.text(), 'direct origin', 'NO_PROXY must force a real direct native connection despite Bun process proxy variables');
    assert.equal(process.env.NO_PROXY, '', 'direct fetch must restore the original uppercase NO_PROXY value');
    assert.equal(process.env.no_proxy, '', 'direct fetch must restore the original lowercase no_proxy value');
  } finally {
    origin.stop(true);
    for (const [key, value] of savedProxyEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  let bypassInit;
  await fetchWithProxy('https://registry.npmjs.org/pkg', { proxy: 'http://user:secret@caller.proxy:8443' }, {
    HTTPS_PROXY: 'http://environment.proxy:8443',
    NO_PROXY: 'registry.npmjs.org',
  }, async (_url, init) => {
    bypassInit = init;
    return new Response('direct');
  });
  assert.equal(Object.hasOwn(bypassInit, 'proxy'), false, 'NO_PROXY bypass must strip a caller-provided init.proxy option');

  let proxiedInit;
  const proxiedResponse = await fetchWithProxy('https://registry.npmjs.org/pkg', { headers: { accept: 'application/json' } }, {
    HTTPS_PROXY: 'http://user:secret@proxy.test:8443',
  }, async (_url, init) => {
    proxiedInit = init;
    return new Response('ok');
  });
  assert.equal(await proxiedResponse.text(), 'ok');
  assert.equal(proxiedInit.proxy, 'http://user:secret@proxy.test:8443', 'fetchWithProxy must pass Bun the selected proxy option');
  assert.equal(proxiedInit.redirect, 'manual', 'fetchWithProxy must handle redirects itself');
  assert.ok(proxiedInit.signal instanceof AbortSignal, 'fetchWithProxy must apply a timeout signal per request');

  await assert.rejects(
    fetchWithProxy('https://registry.npmjs.org/pkg', {}, { HTTPS_PROXY: 'http://user:secret@proxy.test:8443' }, async () => new Response('no', { status: 500 })),
    error => {
      assert.match(error.message, /HTTP 500/);
      assert.doesNotMatch(error.message, /user|secret|proxy\.test/, 'errors must not reveal proxy credentials or addresses');
      return true;
    },
  );

  await assert.rejects(
    fetchWithProxy('https://registry.npmjs.org/pkg', {}, { HTTPS_PROXY: 'http://user:secret@proxy.test:8443' }, async () => {
      throw new Error('connect failed via http://user:secret@proxy.test:8443');
    }),
    error => {
      assert.match(error.message, /configured proxy/i);
      assert.doesNotMatch(error.message, /user|secret|proxy\.test/, 'transport errors must not reveal proxy credentials or addresses');
      return true;
    },
  );
} finally {
  rmSync(fixtureDir, { recursive: true, force: true });
}

for (const [name, source] of [['install.sh', unix], ['install.ps1', windows]]) {
  assert.doesNotMatch(source, /npm pack|Get-Command npm/, `${name} must not use npm CLI package retrieval`);
  assert.doesNotMatch(source, /npm.{0,24}cache|cache.{0,24}npm/i, `${name} must not promise npm cache behavior`);
}
assert.match(unix, /"\$BUN_BIN" "\$FETCH_SCRIPT" "\$NPM_PKG@\$VERSION" "\$NATIVE_BIN_TMPDIR"/, 'install.sh must invoke fetch-package.mjs with the selected Bun binary');
assert.match(windows, /& \$BunBin \$fetchScript "\$npmPkg@\$Version" \$NativeBinTmpDir/, 'install.ps1 must invoke fetch-package.mjs with the selected Bun binary');

console.log('installer Registry download checks passed');
