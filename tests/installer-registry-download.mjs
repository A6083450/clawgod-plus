#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const unix = readFileSync(new URL('../src/template/install.sh', import.meta.url), 'utf8');
const windows = readFileSync(new URL('../src/template/install.ps1', import.meta.url), 'utf8');
const canonicalModuleUrl = new URL('../src/generic/runtime/fetch-package.mjs', import.meta.url);

const fixtureDir = mkdtempSync(join(tmpdir(), 'clawgod-registry-'));
try {
  const { fetchWithProxy, installPackage, parseMacOSProxySettings, proxyFor, readMacOSSystemProxy, resolvePackage } = await import(`${canonicalModuleUrl.href}?test=${Date.now()}`);

  assert.equal(typeof readMacOSSystemProxy, 'function', 'fetch-package.mjs must export macOS system proxy discovery');
  assert.equal(typeof parseMacOSProxySettings, 'function', 'fetch-package.mjs must export macOS system proxy parsing');
  assert.equal(typeof proxyFor, 'function', 'fetch-package.mjs must export proxyFor');
  assert.equal(typeof fetchWithProxy, 'function', 'fetch-package.mjs must export fetchWithProxy');
  assert.equal(typeof resolvePackage, 'function', 'fetch-package.mjs must export resolvePackage');
  assert.equal(typeof installPackage, 'function', 'fetch-package.mjs must export installPackage');
  const proxyFetchSource = readFileSync(new URL('../src/generic/runtime/proxy-fetch.mjs', import.meta.url), 'utf8');
  assert.match(proxyFetchSource, /stdin:\s*Buffer\.from\(/, 'direct workers must use one-shot stdin bytes on Windows');
  assert.doesNotMatch(proxyFetchSource, /child\.stdin\.(?:write|end)\(/, 'direct workers must not use the Windows Bun 1.3.14 FileSink path');

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

  let redirectBodyCancelled = false;
  let redirectBodyCall = 0;
  const redirectAfterBody = await fetchWithProxy('https://redirect.example.test/body', {}, {}, async () => {
    redirectBodyCall++;
    if (redirectBodyCall > 1) return new Response('after redirect body');
    return new Response(new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(1024)); },
      cancel() { redirectBodyCancelled = true; },
    }), { status: 302, headers: { location: '/after-body' } });
  });
  assert.equal(await redirectAfterBody.text(), 'after redirect body');
  assert.equal(redirectBodyCancelled, true, 'a discarded redirect body must be cancelled before following the next location');

  let failureBodyCancelled = false;
  await assert.rejects(
    fetchWithProxy('https://failure.example.test/body', {}, {}, async () => new Response(new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(1024)); },
      cancel() { failureBodyCancelled = true; },
    }), { status: 500 })),
    /HTTP 500/,
  );
  assert.equal(failureBodyCancelled, true, 'a rejected non-200 response body must be cancelled before throwing');

  let unsupportedDirectCalled = false;
  await assert.rejects(
    fetchWithProxy('https://direct.example.test/post', { method: 'POST', body: 'payload' }, {}, async () => {
      unsupportedDirectCalled = true;
      return new Response('unexpected');
    }, { httpProxy: undefined, httpsProxy: undefined, exceptions: [], excludeSimpleHostnames: false }),
    /direct downloads support only GET or HEAD requests without a body/i,
    'unsupported direct request bodies must fail explicitly instead of being dropped',
  );
  assert.equal(unsupportedDirectCalled, false, 'an unsupported direct request must fail before invoking its transport');

  const preAborted = new AbortController();
  preAborted.abort(new Error('pre-abort sentinel'));
  let preAbortedFetchCalled = false;
  await assert.rejects(
    fetchWithProxy('https://abort.example.test/pre', { signal: preAborted.signal }, {}, async () => {
      preAbortedFetchCalled = true;
      return new Response('unexpected');
    }),
    /pre-abort sentinel|abort/i,
    'a pre-aborted caller signal must reject before dispatch',
  );
  assert.equal(preAbortedFetchCalled, false, 'a pre-aborted request must not call its transport');

  const runningAbort = new AbortController();
  let runningAbortEntered;
  const runningAbortReady = new Promise(resolve => { runningAbortEntered = resolve; });
  await assert.rejects(
    async () => {
      const pending = fetchWithProxy('https://abort.example.test/running', { signal: runningAbort.signal }, {
        HTTPS_PROXY: 'http://proxy.test',
      }, async (_url, init) => {
        runningAbortEntered();
        await new Promise((resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
        });
        return new Response('unexpected');
      });
      await runningAbortReady;
      runningAbort.abort(new Error('running abort sentinel'));
      await pending;
    },
    /running abort sentinel|abort/i,
    'a running proxied request must observe the caller abort signal',
  );

  const macOSProxyOutput = `<dictionary> {
  ExceptionsList : <array> {
    0 : localhost
    1 : 127.0.0.0/8
    2 : 169.254/16
    3 : fd00::/8
    4 : *.internal.example
    5 : *.comma.local, 192.168/16
    6 : *star.example
  }
  ExcludeSimpleHostnames : 1
  HTTPEnable : 1
  HTTPPort : 8080
  HTTPProxy : proxy.example
  HTTPSEnable : 1
  HTTPSPort : 8443
  HTTPSProxy : secure-proxy.example
  SOCKSEnable : 1
  SOCKSPort : 1080
  SOCKSProxy : socks.example
}`;
  const systemProxy = parseMacOSProxySettings(macOSProxyOutput);
  assert.deepEqual(systemProxy, {
    httpProxy: 'http://proxy.example:8080',
    httpsProxy: 'http://secure-proxy.example:8443',
    exceptions: ['localhost', '127.0.0.0/8', '169.254/16', 'fd00::/8', '*.internal.example', '*.comma.local', '192.168/16', '*star.example'],
    excludeSimpleHostnames: true,
  }, 'macOS manual HTTP(S) proxy settings must parse without treating SOCKS as an HTTP proxy');
  assert.deepEqual(parseMacOSProxySettings(`<dictionary> {
  HTTPEnable : 0
  HTTPPort : 8080
  HTTPProxy : disabled.example
  HTTPSEnable : 0
  HTTPSPort : 8443
  HTTPSProxy : disabled-secure.example
}`), {
    httpProxy: undefined,
    httpsProxy: undefined,
    exceptions: [],
    excludeSimpleHostnames: false,
  }, 'disabled macOS proxy entries must not select stale host and port values');
  assert.deepEqual(parseMacOSProxySettings('malformed output'), {
    httpProxy: undefined,
    httpsProxy: undefined,
    exceptions: [],
    excludeSimpleHostnames: false,
  }, 'malformed macOS proxy output must fail open to direct access');

  const scutilCalls = [];
  assert.deepEqual(readMacOSSystemProxy({
    platform: 'darwin',
    spawnSync(command, options) {
      scutilCalls.push({ command, options });
      return { exitCode: 0, stdout: Buffer.from(macOSProxyOutput), stderr: Buffer.alloc(0) };
    },
    warn: () => { throw new Error('valid manual system proxy settings must not warn'); },
  }), systemProxy, 'macOS system proxy discovery must return parsed manual settings');
  assert.deepEqual(scutilCalls, [{
    command: ['/usr/sbin/scutil', '--proxy'],
    options: { stdout: 'pipe', stderr: 'pipe' },
  }], 'macOS system proxy discovery must invoke the absolute scutil binary without a shell');

  const discoveryWarnings = [];
  const directSettings = {
    httpProxy: undefined,
    httpsProxy: undefined,
    exceptions: [],
    excludeSimpleHostnames: false,
  };
  assert.deepEqual(readMacOSSystemProxy({
    platform: 'linux',
    spawnSync: () => { throw new Error('non-macOS discovery must not spawn scutil'); },
    warn: message => discoveryWarnings.push(message),
  }), directSettings, 'non-macOS platforms must remain direct when no environment proxy is configured');
  assert.deepEqual(readMacOSSystemProxy({
    platform: 'darwin',
    spawnSync: () => { throw new Error('scutil unavailable'); },
    warn: message => discoveryWarnings.push(message),
  }), directSettings, 'scutil failures must fail open to direct access');
  assert.deepEqual(readMacOSSystemProxy({
    platform: 'darwin',
    spawnSync: () => ({ exitCode: 0, stdout: Buffer.from('malformed scutil output'), stderr: Buffer.alloc(0) }),
    warn: message => discoveryWarnings.push(message),
  }), directSettings, 'malformed scutil output must fail open with a diagnostic');
  assert.deepEqual(readMacOSSystemProxy({
    platform: 'darwin',
    spawnSync: () => ({ exitCode: 0, stdout: Buffer.from(`<dictionary> {
  ProxyAutoConfigEnable : 1
  ProxyAutoConfigURLString : https://proxy.example/proxy.pac
  SOCKSEnable : 1
  SOCKSProxy : socks.example
  SOCKSPort : 1080
}`), stderr: Buffer.alloc(0) }),
    warn: message => discoveryWarnings.push(message),
  }), directSettings, 'PAC and SOCKS-only settings must not be misused as Bun HTTP proxy URLs');
  assert.deepEqual(readMacOSSystemProxy({
    platform: 'darwin',
    spawnSync: () => ({ exitCode: 0, stdout: Buffer.from(`<dictionary> {
  ProxyAutoConfigEnable : 1
  ProxyAutoConfigURLString : https://proxy.example/proxy.pac
  HTTPEnable : 1
  HTTPProxy : stale-manual.example
  HTTPPort : 8080
  HTTPSEnable : 1
  HTTPSProxy : stale-secure.example
  HTTPSPort : 8443
}`), stderr: Buffer.alloc(0) }),
    warn: message => discoveryWarnings.push(message),
  }), directSettings, 'PAC-enabled settings must not fall back to stale manual proxy fields');
  assert.equal(discoveryWarnings.length, 4, 'scutil failure, malformed output, and unsupported configurations must each emit one concise warning');
  assert.match(discoveryWarnings[0], /unable.*system proxy.*without a proxy/i);
  assert.match(discoveryWarnings[1], /unable.*system proxy.*without a proxy/i);
  assert.match(discoveryWarnings[2], /PAC.*not supported.*without a proxy/i);
  assert.match(discoveryWarnings[3], /PAC.*not supported.*without a proxy/i);

  const httpOnlySystemProxy = parseMacOSProxySettings(`<dictionary> {
  HTTPEnable : 1
  HTTPPort : 8080
  HTTPProxy : http-only.example
  HTTPSEnable : 0
}`);
  const proxyCases = [
    ['https://registry.npmjs.org/pkg', { HTTPS_PROXY: 'http://upper.proxy:8443', HTTP_PROXY: 'http://fallback.proxy:8080' }, undefined, 'http://upper.proxy:8443'],
    ['https://registry.npmjs.org/pkg', { https_proxy: 'http://lower.proxy:8443' }, undefined, 'http://lower.proxy:8443'],
    ['http://registry.npmjs.org/pkg', { http_proxy: 'http://lower.proxy:8080' }, undefined, 'http://lower.proxy:8080'],
    ['https://registry.npmjs.org/pkg', { HTTPS_PROXY: 'http://proxy.test', NO_PROXY: 'registry.npmjs.org' }, systemProxy, undefined],
    ['https://registry.npmjs.org/pkg', { HTTPS_PROXY: 'http://proxy.test', NO_PROXY: '*' }, systemProxy, undefined],
    ['https://example.com/pkg', { HTTPS_PROXY: 'http://proxy.test', NO_PROXY: '.example.com' }, systemProxy, undefined],
    ['https://api.example.com/pkg', { HTTPS_PROXY: 'http://proxy.test', NO_PROXY: '.example.com' }, systemProxy, undefined],
    ['https://example.com:8443/pkg', { HTTPS_PROXY: 'http://proxy.test', NO_PROXY: 'example.com:8443' }, systemProxy, undefined],
    ['https://example.com/pkg', { HTTPS_PROXY: 'http://proxy.test', NO_PROXY: 'example.com:8443' }, systemProxy, 'http://proxy.test'],
    ['http://[::1]:8080/pkg', { HTTP_PROXY: 'http://proxy.test', NO_PROXY: '::1' }, systemProxy, undefined],
    ['http://[::1]:8080/pkg', { HTTP_PROXY: 'http://proxy.test', no_proxy: '[::1]:8081' }, systemProxy, 'http://proxy.test'],
    ['https://public.example/pkg', {}, systemProxy, 'http://secure-proxy.example:8443'],
    ['http://public.example/pkg', {}, systemProxy, 'http://proxy.example:8080'],
    ['https://public.example/pkg', {}, httpOnlySystemProxy, undefined],
    ['http://public.example/pkg', {}, httpOnlySystemProxy, 'http://http-only.example:8080'],
    ['https://api.internal.example/pkg', {}, systemProxy, undefined],
    ['http://127.1.2.3/pkg', {}, systemProxy, undefined],
    ['http://169.254.20.30/pkg', {}, systemProxy, undefined],
    ['https://[fd12::1]/pkg', {}, systemProxy, undefined],
    ['https://printer/status', {}, systemProxy, undefined],
    ['https://printer.comma.local/status', {}, systemProxy, undefined],
    ['https://192.168.1.20/status', {}, systemProxy, undefined],
    ['https://star.example/status', {}, systemProxy, undefined],
    ['https://api.star.example/status', {}, systemProxy, undefined],
    ['https://notstar.example/status', {}, systemProxy, 'http://secure-proxy.example:8443'],
    ['https://star.example.evil/status', {}, systemProxy, 'http://secure-proxy.example:8443'],
    ['http://10.1.2.3:80/status', { HTTP_PROXY: 'http://proxy.test', NO_PROXY: '10.0.0.0/8:8080' }, undefined, 'http://proxy.test'],
    ['http://10.1.2.3:8080/status', { HTTP_PROXY: 'http://proxy.test', NO_PROXY: '10.0.0.0/8:8080' }, undefined, undefined],
    ['http://[fd00::1]:80/status', { HTTP_PROXY: 'http://proxy.test', NO_PROXY: '[fd00::/8]:8080' }, undefined, 'http://proxy.test'],
    ['http://[fd00::1]:8080/status', { HTTP_PROXY: 'http://proxy.test', NO_PROXY: '[fd00::/8]:8080' }, undefined, undefined],
  ];
  for (const [url, env, macOSProxy, expected] of proxyCases) {
    assert.equal(proxyFor(url, env, macOSProxy), expected, `proxyFor must select the expected proxy for ${url}`);
  }

  const origin = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const pathname = new URL(request.url).pathname;
      if (pathname === '/large-redirect') {
        return new Response(new Uint8Array(4 * 1024 * 1024), {
          status: 302,
          headers: { location: '/payload' },
        });
      }
      if (pathname === '/large-error') return new Response(new Uint8Array(4 * 1024 * 1024), { status: 500 });
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
    const directResponse = await fetchWithProxy(originUrl, {}, {
      HTTP_PROXY: deadProxy,
      HTTPS_PROXY: deadProxy,
      NO_PROXY: '127.0.0.1',
    });
    assert.equal(await directResponse.text(), 'direct origin', 'NO_PROXY must force a real direct native connection despite Bun process proxy variables');
    const headResponse = await fetchWithProxy(originUrl, { method: 'HEAD' }, {}, fetch, directSettings);
    assert.equal(headResponse.status, 200, 'a direct HEAD download must preserve the response status');
    assert.equal(await headResponse.text(), '', 'a direct HEAD download must expose an empty response body');
    const largeRedirectResponse = await fetchWithProxy(`http://127.0.0.1:${origin.port}/large-redirect`, {}, {}, fetch, directSettings);
    assert.equal(await largeRedirectResponse.text(), 'direct origin', 'a direct worker must cancel a large discarded redirect body before following the next location');
    await assert.rejects(
      fetchWithProxy(`http://127.0.0.1:${origin.port}/large-error`, {}, {}, fetch, directSettings),
      /HTTP 500/,
      'a direct worker must cancel a large rejected response body before throwing',
    );
    const truncatedOrigin = createServer((request, response) => {
      response.writeHead(200, { 'content-length': '100' });
      response.write('partial');
      response.socket.destroy();
    });
    await new Promise((resolve, reject) => {
      truncatedOrigin.once('error', reject);
      truncatedOrigin.listen(0, '127.0.0.1', resolve);
    });
    try {
      const address = truncatedOrigin.address();
      await assert.rejects(
        async () => {
          const streamErrorResponse = await fetchWithProxy(`http://127.0.0.1:${address.port}/stream-error`, {}, {}, fetch, directSettings);
          await streamErrorResponse.text();
        },
        /direct fetch worker|terminated|closed|reset|fetch failed|socket connection/i,
        'a direct worker transport failure must reject instead of returning a truncated successful response',
      );
    } finally {
      await new Promise(resolve => truncatedOrigin.close(resolve));
    }

    let directOverride;
    const noConfiguredProxyResponse = await fetchWithProxy(originUrl, {}, {}, async (_url, init) => {
      directOverride = { upper: process.env.NO_PROXY, lower: process.env.no_proxy, hasProxy: Object.hasOwn(init, 'proxy') };
      return new Response('direct override');
    }, directSettings);
    assert.equal(await noConfiguredProxyResponse.text(), 'direct override');
    assert.deepEqual(directOverride, { upper: '', lower: '', hasProxy: false }, 'injected direct transports must not mutate process-wide proxy bypass variables');
    assert.equal(process.env.NO_PROXY, '', 'direct fetch must preserve the original uppercase NO_PROXY value');
    assert.equal(process.env.no_proxy, '', 'direct fetch must preserve the original lowercase no_proxy value');

    let enterMixedDirect;
    let releaseMixedDirect;
    let enterDirectAbort;
    let releaseDirectAbort;
    const mixedDirectEntered = new Promise(resolve => { enterMixedDirect = resolve; });
    const mixedDirectRelease = new Promise(resolve => { releaseMixedDirect = resolve; });
    const directAbortEntered = new Promise(resolve => { enterDirectAbort = resolve; });
    const directAbortRelease = new Promise(resolve => { releaseDirectAbort = resolve; });
    const mixedOrigin = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        const pathname = new URL(request.url).pathname;
        if (pathname === '/direct') {
          enterMixedDirect();
          await mixedDirectRelease;
        } else if (pathname === '/direct-abort') {
          enterDirectAbort();
          await directAbortRelease;
        }
        return new Response(`mixed origin:${pathname}`);
      },
    });
    const raceProxy = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch() { return new Response('race proxy'); },
    });
    try {
      const mixedDirect = fetchWithProxy(`http://127.0.0.1:${mixedOrigin.port}/direct`, {}, {}, fetch, directSettings);
      await mixedDirectEntered;
      const mixedProxied = await fetchWithProxy(`http://127.0.0.1:${mixedOrigin.port}/proxied`, {}, {
        HTTP_PROXY: `http://127.0.0.1:${raceProxy.port}`,
      }, fetch, directSettings);
      assert.equal(await mixedProxied.text(), 'race proxy', 'a proxied request must traverse its explicit Bun proxy while a direct worker is pending');
      releaseMixedDirect();
      assert.equal(await (await mixedDirect).text(), 'mixed origin:/direct', 'a direct worker must complete independently after the proxied request');

      const directAbort = new AbortController();
      const directAbortPending = fetchWithProxy(`http://127.0.0.1:${mixedOrigin.port}/direct-abort`, {
        signal: directAbort.signal,
      }, {}, fetch, directSettings);
      await directAbortEntered;
      directAbort.abort(new Error('direct abort sentinel'));
      await assert.rejects(directAbortPending, /direct abort sentinel|abort/i, 'a running direct worker must observe the caller abort signal');
      assert.equal(process.env.NO_PROXY, '', 'mixed direct and proxied requests must preserve uppercase NO_PROXY');
      assert.equal(process.env.no_proxy, '', 'mixed direct and proxied requests must preserve lowercase no_proxy');
    } finally {
      releaseMixedDirect();
      releaseDirectAbort();
      mixedOrigin.stop(true);
      raceProxy.stop(true);
    }
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

  let systemProxiedInit;
  await fetchWithProxy('https://registry.npmjs.org/pkg', {}, {}, async (_url, init) => {
    systemProxiedInit = init;
    return new Response('system proxied');
  }, systemProxy);
  assert.equal(systemProxiedInit.proxy, 'http://secure-proxy.example:8443', 'fetchWithProxy must pass the selected macOS system proxy to Bun');

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
