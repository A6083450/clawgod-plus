#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const unix = await Bun.file(new URL('../install.sh', import.meta.url)).text();
const windows = await Bun.file(new URL('../install.ps1', import.meta.url)).text();

function unixTemplate(name, marker) {
  const start = unix.indexOf(`cat > "$CLAWGOD_DIR/${name}" << '${marker}'`);
  assert.notEqual(start, -1, `install.sh must generate ${name}`);
  const bodyStart = unix.indexOf('\n', start) + 1;
  const end = unix.indexOf(`\n${marker}`, bodyStart);
  assert.notEqual(end, -1, `install.sh ${name} template must end`);
  return unix.slice(bodyStart, end);
}

function powerShellTemplate(name, section) {
  const start = windows.indexOf(section);
  assert.notEqual(start, -1, `install.ps1 must generate ${name}`);
  const bodyStart = windows.indexOf('#!/usr/bin/env bun', start);
  assert.notEqual(bodyStart, -1, `install.ps1 ${name} template must start with Bun`);
  const end = windows.indexOf(`\n'@ | Set-Content (Join-Path $ClawDir "${name}")`, bodyStart);
  assert.notEqual(end, -1, `install.ps1 ${name} template must end`);
  return windows.slice(bodyStart, end);
}

function normalize(source) {
  return source.replace(/\r\n/g, '\n').trim();
}

function records(id, version) {
  return { plugins: { [id]: [{ scope: 'user', version }] } };
}

function archiveSpec(base, bytes, overrides = {}) {
  return {
    ...base,
    bytes: bytes.byteLength,
    sha256: new Bun.CryptoHasher('sha256').update(bytes).digest('hex'),
    ...overrides,
  };
}

async function pluginArchive(base, overrides = {}) {
  const root = overrides.root || `fixture-${base.key}`;
  const source = overrides.source ?? (base.key === 'memory' ? './plugin/' : './');
  const pluginRoot = source.replace(/^\.\//, '').replace(/\/$/, '');
  const pluginPrefix = pluginRoot ? `${root}/${pluginRoot}` : root;
  const marketplace = {
    name: overrides.marketplaceName ?? base.archiveMarketplace ?? base.marketplace,
    plugins: [{ name: base.plugin, source }],
  };
  if (overrides.entryVersion !== undefined) marketplace.plugins[0].version = overrides.entryVersion;
  const plugin = {
    name: overrides.pluginName ?? base.plugin,
    version: overrides.pluginVersion ?? base.version,
  };
  return new Bun.Archive({
    [`${root}/.claude-plugin/marketplace.json`]: JSON.stringify(marketplace),
    [`${pluginPrefix}/.claude-plugin/plugin.json`]: JSON.stringify(plugin),
    [`${root}/README.md`]: 'fixture only\n',
    ...(overrides.entries || {}),
  }, { compress: 'gzip' }).bytes();
}

function writeTarString(header, offset, length, value) {
  const bytes = Buffer.from(value);
  assert.ok(bytes.length <= length, `tar fixture field is too long: ${value}`);
  bytes.copy(header, offset);
}

function tarHeader({ name, type = '0', size = 0, mode = 0o755, modeField, sizeField, checksumStyle }) {
  const header = Buffer.alloc(512);
  writeTarString(header, 0, 100, name);
  writeTarString(header, 100, 8, modeField ?? `${mode.toString(8).padStart(7, '0')}\0`);
  writeTarString(header, 108, 8, '0000000\0');
  writeTarString(header, 116, 8, '0000000\0');
  writeTarString(header, 124, 12, sizeField ?? `${size.toString(8).padStart(11, '0')}\0`);
  writeTarString(header, 136, 12, '00000000000\0');
  header.fill(0x20, 148, 156);
  writeTarString(header, 156, 1, type);
  writeTarString(header, 257, 6, 'ustar\0');
  writeTarString(header, 263, 2, '00');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  const checksumField = checksumStyle === 'tab'
    ? `\t${checksum.toString(8).padStart(6, '0')}\0`
    : `${checksum.toString(8).padStart(6, '0')}\0 `;
  writeTarString(header, 148, 8, checksumField);
  return header;
}

function rawTarBytes(entries, options = {}) {
  const chunks = [];
  for (const entry of entries) {
    const data = Buffer.from(entry.data || '');
    chunks.push(tarHeader({ ...entry, size: entry.size ?? data.length }));
    chunks.push(data);
    const padding = (512 - (data.length % 512)) % 512;
    if (padding) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc((options.terminatorBlocks ?? 2) * 512));
  if (options.tail) chunks.push(Buffer.from(options.tail));
  return Buffer.concat(chunks);
}

function rawTar(entries, options) {
  return Bun.gzipSync(rawTarBytes(entries, options));
}

function paxRecord(key, value) {
  const body = `${key}=${value}\n`;
  let length = body.length + 2;
  while (`${length} ${body}`.length !== length) length = `${length} ${body}`.length;
  return `${length} ${body}`;
}

async function rejectsArchive(extractPluginArchive, bytes, base, fixtureRoot, label, expected) {
  const destination = join(fixtureRoot, `reject-${label.replace(/[^a-z0-9]+/gi, '-')}`);
  await assert.rejects(
    extractPluginArchive(bytes, archiveSpec(base, bytes), destination),
    expected,
    `${label} must be rejected`,
  );
}

const unixModule = unixTemplate('plugin-dependencies.mjs', 'PLUGIN_DEPENDENCIES_EOF');
const windowsModule = powerShellTemplate('plugin-dependencies.mjs', '# --- Optional Claude plugin dependencies');
assert.equal(normalize(windowsModule), normalize(unixModule), 'Unix and Windows plugin-dependencies.mjs bodies must be identical');
assert.match(unix, /PLUGIN_DEPENDENCIES_EOF\nchmod 700 "\$CLAWGOD_DIR\/plugin-dependencies\.mjs"/, 'install.sh must write plugin-dependencies.mjs with mode 0700');
assert.match(windows, /Set-Content \(Join-Path \$ClawDir "plugin-dependencies\.mjs"\) -Encoding UTF8/, 'install.ps1 must write plugin-dependencies.mjs as UTF-8');
assert.doesNotMatch(unix, /\$BUN_BIN[^\n]*plugin-dependencies\.mjs/, 'install.sh must not invoke plugin-dependencies.mjs yet');
assert.doesNotMatch(windows, /& \$BunBin[^\n]*plugin-dependencies\.mjs/, 'install.ps1 must not invoke plugin-dependencies.mjs yet');

const expected = {
  hud: {
    key: 'hud', id: 'claude-hud@claude-hud', marketplace: 'claude-hud', plugin: 'claude-hud',
    version: '0.7.0', bytes: 754443,
    sha256: '59bd3ec17e7b9181d8069c93cc7c5e1db8b1d33e6a94e4041f6589dd8b87c912',
    url: 'https://hub.211107.xyz/https://github.com/jarrodwatts/claude-hud/archive/refs/tags/v0.7.0.tar.gz',
  },
  memory: {
    key: 'memory', id: 'claude-mem@thedotmack', marketplace: 'thedotmack', plugin: 'claude-mem',
    version: '13.14.0', bytes: 11817347,
    sha256: 'a64f7dd038308da0db52f10d8f4fc2b3b3acfec5d9ddfdcfea9f6e473e54bed0',
    url: 'https://hub.211107.xyz/https://github.com/thedotmack/claude-mem/archive/refs/tags/v13.14.0.tar.gz',
  },
  superpowers: {
    key: 'superpowers', id: 'superpowers@superpowers-marketplace', marketplace: 'superpowers-marketplace', plugin: 'superpowers',
    archiveMarketplace: 'superpowers-dev',
    version: '6.2.0', bytes: 516401,
    sha256: '468246a7b4981d4c014c2b58d9ee538700ffded075279d5810059cdc1abeb5f3',
    url: 'https://hub.211107.xyz/https://github.com/obra/superpowers/archive/refs/tags/v6.2.0.tar.gz',
  },
};

const fixtureRoot = realpathSync(mkdtempSync(join(tmpdir(), 'clawgod-plugin-deps-')));
const fixtureHome = join(fixtureRoot, 'home');
const fixtureClaudeConfig = join(fixtureRoot, 'claude-config');
const fixtureBin = join(fixtureRoot, 'bin');
const environmentKeys = ['HOME', 'CLAUDE_CONFIG_DIR', 'PATH'];
const savedEnvironment = new Map(environmentKeys.map(key => [key, Object.hasOwn(process.env, key) ? process.env[key] : undefined]));
try {
  mkdirSync(fixtureHome, { recursive: true });
  mkdirSync(fixtureClaudeConfig, { recursive: true });
  mkdirSync(fixtureBin, { recursive: true });
  process.env.HOME = fixtureHome;
  process.env.CLAUDE_CONFIG_DIR = fixtureClaudeConfig;
  process.env.PATH = fixtureBin;

  const modulePath = join(fixtureRoot, 'plugin-dependencies.mjs');
  await Bun.write(modulePath, unixModule);
  chmodSync(modulePath, 0o700);
  const pluginDependencies = await import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
  assert.deepEqual(
    Object.fromEntries(environmentKeys.map(key => [key, process.env[key]])),
    { HOME: fixtureHome, CLAUDE_CONFIG_DIR: fixtureClaudeConfig, PATH: fixtureBin },
    'plugin-dependencies.mjs must be imported with only fixture environment paths',
  );
  const {
    PLUGIN_BASELINES,
    classifyPlugin,
    compareSemver,
    downloadAndStage,
    extractPluginArchive,
    parseSemver,
    selectInstalledRecord,
    sha256,
    validateArchive,
  } = pluginDependencies;

  assert.equal(typeof extractPluginArchive, 'function', 'plugin-dependencies.mjs must export extractPluginArchive');
  assert.equal(typeof downloadAndStage, 'function', 'plugin-dependencies.mjs must export downloadAndStage');

  assert.deepEqual(PLUGIN_BASELINES, expected, 'managed plugin baselines must retain their verified source metadata');

  assert.equal(classifyPlugin({}, PLUGIN_BASELINES.hud), 'missing');
  assert.equal(classifyPlugin(records('claude-hud@claude-hud', '0.6.0'), PLUGIN_BASELINES.hud), 'older');
  assert.equal(classifyPlugin(records('claude-hud@claude-hud', '0.7.0'), PLUGIN_BASELINES.hud), 'satisfied');
  assert.equal(classifyPlugin(records('claude-hud@claude-hud', '0.8.0'), PLUGIN_BASELINES.hud), 'satisfied');
  assert.equal(classifyPlugin(records('claude-hud@claude-hud', '0.7.0-beta.1'), PLUGIN_BASELINES.hud), 'older');
  assert.equal(classifyPlugin(records('claude-hud@claude-hud', 'latest'), PLUGIN_BASELINES.hud), 'invalid');
  assert.equal(classifyPlugin({ plugins: { 'claude-hud@claude-hud': [{ scope: 'project', version: '1.0.0' }] } }, PLUGIN_BASELINES.hud), 'missing', 'project records must not satisfy the user dependency');

  assert.deepEqual(parseSemver('13.14.0-rc.2'), { major: 13, minor: 14, patch: 0, prerelease: ['rc', 2] }, 'strict SemVer must parse prereleases');
  for (const malformed of ['01.2.3', '1.02.3', '1.2.03', '1.2', '1.2.3+build.1', '1.2.3-', '1.2.3-01', 'v1.2.3']) {
    assert.equal(parseSemver(malformed), null, `${malformed} must not be coerced into a version`);
  }
  assert.equal(compareSemver('1.0.0-alpha.2', '1.0.0-alpha.10'), -1, 'numeric prerelease identifiers must compare numerically');
  assert.equal(compareSemver('1.0.0-1', '1.0.0-alpha'), -1, 'numeric prerelease identifiers must sort before strings');
  assert.equal(compareSemver('1.0.0', '1.0.0-rc.1'), 1, 'stable versions must sort after the same core prerelease');
  assert.equal(compareSemver('1.0.0+build.1', '1.0.0'), null, 'build metadata must be rejected rather than coerced');

  const multiVersion = {
    plugins: {
      'claude-hud@claude-hud': [
        { scope: 'user', version: '0.6.0' },
        { scope: 'user', version: '0.8.0-beta.1' },
        { scope: 'user', version: '0.8.0' },
        { scope: 'local', version: '9.9.9' },
      ],
    },
  };
  assert.equal(selectInstalledRecord(multiVersion, 'claude-hud@claude-hud').version, '0.8.0', 'the highest valid user version must be selected');

  const duplicateSuperpowers = {
    plugins: {
      'superpowers@superpowers-marketplace': [{ scope: 'user', version: '6.1.0' }],
      'superpowers@claude-plugins-official': [{ scope: 'user', version: '99.0.0', metadata: { keep: true } }],
    },
  };
  const officialBefore = JSON.stringify(duplicateSuperpowers.plugins['superpowers@claude-plugins-official']);
  assert.equal(classifyPlugin(duplicateSuperpowers, PLUGIN_BASELINES.superpowers), 'older', 'only the configured Superpowers plugin id may satisfy the dependency');
  assert.equal(JSON.stringify(duplicateSuperpowers.plugins['superpowers@claude-plugins-official']), officialBefore, 'the official Superpowers record must remain byte-identical');

  const validArchives = {};
  assert.equal(sha256(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'SHA-256 must match the standard abc vector');
  for (const key of ['hud', 'memory', 'superpowers']) {
    const base = PLUGIN_BASELINES[key];
    const bytes = await pluginArchive(base);
    validArchives[key] = bytes;
    const spec = archiveSpec(base, bytes);
    assert.equal(sha256(bytes), spec.sha256, `${key} fixtures must use the exported SHA-256 implementation`);
    validateArchive(bytes, spec);
    const sourceRoot = await extractPluginArchive(bytes, spec, join(fixtureRoot, `valid-${key}`));
    assert.equal(existsSync(join(sourceRoot, '.claude-plugin', 'marketplace.json')), true, `${key} must return its single repository root`);
  }

  const hudSpec = archiveSpec(PLUGIN_BASELINES.hud, validArchives.hud);
  const roundTwoContainmentFailures = [];
  for (const [label, unsafeSpec] of [
    ['extract key separator', { ...hudSpec, key: '../hud' }],
    ['extract version separator', { ...hudSpec, version: '../0.7.0' }],
  ]) {
    try {
      await extractPluginArchive(validArchives.hud, unsafeSpec, join(fixtureRoot, label.replaceAll(' ', '-')));
      roundTwoContainmentFailures.push(`${label}: accepted`);
    } catch (error) {
      if (!/invalid.*(?:key|version)|filename component/i.test(error.message)) {
        roundTwoContainmentFailures.push(`${label}: ${error.message}`);
      }
    }
  }

  const existingAncestorTarget = join(fixtureRoot, 'existing-ancestor-target');
  const existingAncestorLink = join(fixtureRoot, 'existing-ancestor-link');
  const existingLinkedDestination = join(existingAncestorLink, 'nested', 'destination');
  const actualLinkedDestination = join(existingAncestorTarget, 'nested', 'destination');
  mkdirSync(actualLinkedDestination, { recursive: true });
  symlinkSync(existingAncestorTarget, existingAncestorLink, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    await extractPluginArchive(validArchives.hud, hudSpec, existingLinkedDestination);
    roundTwoContainmentFailures.push('existing destination symlink ancestor: accepted');
  } catch (error) {
    if (!/unsafe.*destination|destination.*(?:link|ancestor)/i.test(error.message)) {
      roundTwoContainmentFailures.push(`existing destination symlink ancestor: ${error.message}`);
    }
  }
  if (readdirSync(actualLinkedDestination).length !== 0) {
    roundTwoContainmentFailures.push('existing destination symlink ancestor: wrote through link');
  }

  const outsideDestination = join(fixtureRoot, 'outside-destination');
  const linkedDestination = join(fixtureRoot, 'linked-destination');
  mkdirSync(outsideDestination);
  symlinkSync(outsideDestination, linkedDestination, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(
    extractPluginArchive(validArchives.hud, hudSpec, linkedDestination),
    /unsafe.*destination|destination.*link/i,
    'an extraction destination symlink must be rejected before staging files',
  );
  assert.throws(() => validateArchive('not bytes', hudSpec), /archive bytes are invalid/i);
  assert.throws(() => validateArchive(validArchives.hud, { ...hudSpec, bytes: hudSpec.bytes + 1 }), /archive size mismatch/i);
  assert.throws(() => validateArchive(validArchives.hud, { ...hudSpec, sha256: '0'.repeat(64) }), /archive SHA-256 mismatch/i);
  const oversizedArchive = new Uint8Array(64 * 1024 * 1024 + 1);
  assert.throws(
    () => validateArchive(oversizedArchive, archiveSpec(PLUGIN_BASELINES.hud, oversizedArchive)),
    /archive exceeds safety limit/i,
    'compressed archives over 64 MiB must be rejected before extraction',
  );

  const metadataMarketplace = JSON.stringify({ name: 'claude-hud', plugins: [{ name: 'claude-hud', source: './' }] });
  const metadataPlugin = JSON.stringify({ name: 'claude-hud', version: '0.7.0' });
  const validMetadataArchive = rawTar([
    { name: 'global-pax', type: 'g', data: paxRecord('comment', 'fixture') },
    { name: 'local-pax', type: 'x', data: paxRecord('path', 'metadata-repo/.claude-plugin/marketplace.json') },
    { name: 'ignored-marketplace-name', data: metadataMarketplace },
    { name: '././@LongLink', type: 'L', data: Buffer.from('metadata-repo/.claude-plugin/plugin.json\0') },
    { name: 'ignored-plugin-name', data: metadataPlugin },
    { name: 'metadata-repo/README.md', data: 'fixture only\n' },
  ]);
  const metadataRoot = await extractPluginArchive(
    validMetadataArchive,
    archiveSpec(PLUGIN_BASELINES.hud, validMetadataArchive),
    join(fixtureRoot, 'valid-metadata'),
  );
  assert.equal(readFileSync(join(metadataRoot, 'README.md'), 'utf8'), 'fixture only\n', 'valid PAX and GNU long-name metadata must extract safely');

  const executableArchive = rawTar([
    { name: 'executable-repo/.claude-plugin/marketplace.json', data: JSON.stringify({ name: 'superpowers-dev', plugins: [{ name: 'superpowers', source: './' }] }), mode: 0o644 },
    { name: 'executable-repo/.claude-plugin/plugin.json', data: JSON.stringify({ name: 'superpowers', version: '6.2.0' }), mode: 0o644 },
    { name: 'executable-repo/hooks/run-hook.cmd', data: '#!/bin/sh\nexit 0\n', mode: 0o755 },
    { name: 'executable-repo/README.md', data: 'not executable\n', mode: 0o644 },
  ]);
  const executableRoot = await extractPluginArchive(
    executableArchive,
    archiveSpec(PLUGIN_BASELINES.superpowers, executableArchive),
    join(fixtureRoot, 'valid-executable'),
  );
  assert.equal(statSync(join(executableRoot, 'hooks', 'run-hook.cmd')).mode & 0o777, 0o700, 'tar executable bits must produce an executable staged hook');
  assert.equal(statSync(join(executableRoot, 'README.md')).mode & 0o777, 0o600, 'non-executable tar files must remain private and non-executable');

  const invalidEntries = [
    ['traversal', '../escape', '0'],
    ['absolute', '/tmp/escape', '0'],
    ['windows absolute', 'C:/escape', '0'],
    ['symbolic link', 'repo/link', '2'],
    ['hard link', 'repo/hard', '1'],
    ['device', 'repo/device', '3'],
  ];
  const outsideSentinel = join(fixtureRoot, 'escape');
  for (const [label, name, type] of invalidEntries) {
    const bytes = rawTar([{ name, type }]);
    await rejectsArchive(extractPluginArchive, bytes, PLUGIN_BASELINES.hud, fixtureRoot, label, /unsafe|unsupported|link|device/i);
    assert.equal(existsSync(outsideSentinel), false, `${label} must not create an outside sentinel`);
  }

  const secondRoot = await pluginArchive(PLUGIN_BASELINES.hud, { entries: { 'other-root/README.md': 'second root' } });
  await rejectsArchive(extractPluginArchive, secondRoot, PLUGIN_BASELINES.hud, fixtureRoot, 'second repository root', /single.*repository|top-level/i);

  const duplicatePath = rawTar([
    { name: 'repo/file.txt', data: 'first' },
    { name: 'repo//file.txt', data: 'second' },
  ]);
  await rejectsArchive(extractPluginArchive, duplicatePath, PLUGIN_BASELINES.hud, fixtureRoot, 'duplicate normalized path', /duplicate.*path/i);

  const tooManyEntries = rawTar(Array.from({ length: 50_001 }, (_, index) => ({ name: `repo/d${index}`, type: '5' })));
  await rejectsArchive(extractPluginArchive, tooManyEntries, PLUGIN_BASELINES.hud, fixtureRoot, 'entry count limit', /too many.*entries|entry.*limit/i);

  const oversizedEntry = rawTar([{ name: 'repo/large.bin', size: 64 * 1024 * 1024 + 1 }]);
  await rejectsArchive(extractPluginArchive, oversizedEntry, PLUGIN_BASELINES.hud, fixtureRoot, 'single entry size limit', /entry.*safety limit|entry.*large/i);

  const decompressionBomb = Bun.gzipSync(new Uint8Array(512 * 1024 * 1024 + 1));
  await rejectsArchive(
    extractPluginArchive,
    decompressionBomb,
    PLUGIN_BASELINES.hud,
    fixtureRoot,
    'bounded gzip output',
    /decompressed.*safety limit|gzip output.*limit/i,
  );

  const malformedMetadata = [
    ['malformed PAX metadata', rawTar([
      { name: 'pax-header', type: 'x', data: 'not-a-pax-record\n' },
      { name: 'repo/file', data: 'content' },
    ])],
    ['malformed GNU long-name metadata', rawTar([
      { name: '././@LongLink', type: 'L', data: 'repo/file-without-nul' },
      { name: 'ignored', data: 'content' },
    ])],
  ];
  for (const [label, bytes] of malformedMetadata) {
    await rejectsArchive(extractPluginArchive, bytes, PLUGIN_BASELINES.hud, fixtureRoot, label, /malformed.*metadata|metadata.*malformed/i);
  }

  const strictMarketplace = JSON.stringify({ name: 'claude-hud', plugins: [{ name: 'claude-hud', source: './' }] });
  const strictPlugin = JSON.stringify({ name: 'claude-hud', version: '0.7.0' });
  const strictTail = [
    { name: 'strict-repo/.claude-plugin/marketplace.json', data: strictMarketplace },
    { name: 'strict-repo/.claude-plugin/plugin.json', data: strictPlugin },
    { name: 'strict-repo/README.md', data: 'strict fixture\n' },
  ];
  const parserDifferentials = [
    ['NUL-tailed mode field', rawTar([
      { ...strictTail[0], modeField: '000755\0x' },
      ...strictTail.slice(1),
    ])],
    ['NUL-tailed size field', rawTar([
      ...strictTail.slice(0, 2),
      { ...strictTail[2], sizeField: '0000000017\0x' },
    ])],
    ['tab-prefixed checksum field', rawTar([
      { ...strictTail[0], checksumStyle: 'tab' },
      ...strictTail.slice(1),
    ])],
    ['embedded NUL GNU long name', rawTar([
      { name: '././@LongLink', type: 'L', data: Buffer.from('strict-repo/.claude-plugin/marketplace.json\0ignored\0') },
      { name: 'ignored-marketplace', data: strictMarketplace },
      ...strictTail.slice(1),
    ])],
    ['stacked local PAX metadata', rawTar([
      { name: 'pax-one', type: 'x', data: paxRecord('comment', 'first') },
      { name: 'pax-two', type: 'x', data: paxRecord('path', 'strict-repo/.claude-plugin/marketplace.json') },
      { name: 'ignored-marketplace', data: strictMarketplace },
      ...strictTail.slice(1),
    ])],
    ['GNU name across global PAX metadata', rawTar([
      { name: '././@LongLink', type: 'L', data: Buffer.from('strict-repo/.claude-plugin/marketplace.json\0') },
      { name: 'global-pax', type: 'g', data: paxRecord('comment', 'intervening') },
      { name: 'ignored-marketplace', data: strictMarketplace },
      ...strictTail.slice(1),
    ])],
  ];
  const acceptedParserDifferentials = [];
  for (const [label, bytes] of parserDifferentials) {
    try {
      await extractPluginArchive(bytes, archiveSpec(PLUGIN_BASELINES.hud, bytes), join(fixtureRoot, `strict-${label.replace(/[^a-z0-9]+/gi, '-')}`));
      acceptedParserDifferentials.push(label);
    } catch (error) {
      if (!/malformed.*(?:tar|metadata)|metadata.*malformed/i.test(error.message)) throw error;
    }
  }
  assert.deepEqual(acceptedParserDifferentials, [], 'strict tar parsing must reject every numeric and metadata differential');

  const strictArchive = rawTar(strictTail);
  const checksumMutation = Buffer.from(Bun.gunzipSync(strictArchive));
  checksumMutation[0] ^= 1;
  await rejectsArchive(
    extractPluginArchive,
    Bun.gzipSync(checksumMutation),
    PLUGIN_BASELINES.hud,
    fixtureRoot,
    'tar checksum mutation',
    /checksum mismatch/i,
  );
  const truncatedTar = rawTarBytes(strictTail);
  await rejectsArchive(
    extractPluginArchive,
    Bun.gzipSync(truncatedTar.subarray(0, truncatedTar.length - 513)),
    PLUGIN_BASELINES.hud,
    fixtureRoot,
    'truncated tar padding',
    /truncated|terminator|checksum|malformed/i,
  );
  const terminatorDifferentials = [
    ['single zero terminator block', rawTar(strictTail, { terminatorBlocks: 1 })],
    ['partial zero tail', rawTar(strictTail, { tail: Buffer.from([0]) })],
  ];
  const acceptedTerminatorDifferentials = [];
  for (const [label, bytes] of terminatorDifferentials) {
    try {
      await extractPluginArchive(bytes, archiveSpec(PLUGIN_BASELINES.hud, bytes), join(fixtureRoot, `terminator-${label.replace(/[^a-z0-9]+/gi, '-')}`));
      acceptedTerminatorDifferentials.push(label);
    } catch (error) {
      if (!/terminator|padding|block-aligned|malformed/i.test(error.message)) throw error;
    }
  }
  assert.deepEqual(acceptedTerminatorDifferentials, [], 'tar parsing must require two complete zero blocks and block-aligned trailing padding');

  for (const [label, overrides, expected] of [
    ['marketplace name mismatch', { marketplaceName: 'wrong-marketplace' }, /marketplace name mismatch/i],
    ['plugin name mismatch', { pluginName: 'wrong-plugin' }, /plugin manifest mismatch/i],
    ['plugin version mismatch', { pluginVersion: '0.0.0' }, /plugin manifest mismatch/i],
    ['claude-mem source mismatch', { source: './' }, /declared.*plugin.*source|plugin.*source/i],
    ['Superpowers source mismatch', { source: './plugin/' }, /declared.*source|plugin.*source/i],
    ['Superpowers empty source alias', { source: '' }, /declared.*source|plugin.*source/i],
  ]) {
    const base = label.startsWith('claude-mem') ? PLUGIN_BASELINES.memory
      : label.startsWith('Superpowers') ? PLUGIN_BASELINES.superpowers
        : PLUGIN_BASELINES.hud;
    const bytes = await pluginArchive(base, overrides);
    await rejectsArchive(extractPluginArchive, bytes, base, fixtureRoot, label, expected);
  }

  const clawgodDir = join(fixtureHome, '.clawgod');
  const cacheDir = join(clawgodDir, 'cache', 'claude-plugins');
  mkdirSync(cacheDir, { recursive: true });
  const fetchFilePath = join(clawgodDir, 'fetch-file.mjs');
  const fetchLog = join(fixtureRoot, 'fetch-log.json');
  writeFileSync(fetchFilePath, `#!/usr/bin/env bun
import { copyFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
if (process.env.FIXTURE_FETCH_FAIL === '1') {
  console.error('fixture downloader failure: https://secret.example.test/proxy?token=do-not-leak');
  process.exit(23);
}
copyFileSync(process.env.FIXTURE_ARCHIVE, process.argv[3]);
if (process.env.FIXTURE_ATTACK_CACHE_DIR) {
  renameSync(process.env.FIXTURE_ATTACK_CACHE_DIR, process.env.FIXTURE_ATTACK_CACHE_BACKUP);
  symlinkSync(process.env.FIXTURE_ATTACK_CACHE_BACKUP, process.env.FIXTURE_ATTACK_CACHE_DIR, process.platform === 'win32' ? 'junction' : 'dir');
}
writeFileSync(process.env.FIXTURE_FETCH_LOG, JSON.stringify(process.env));
`);
  chmodSync(fetchFilePath, 0o700);
  const context = {
    home: fixtureHome,
    claudeConfigDir: fixtureClaudeConfig,
    clawgodDir,
    bunPath: process.execPath,
    claudeCliPath: join(fixtureBin, 'claude'),
    fetchFilePath,
    env: {
      HOME: fixtureHome,
      CLAUDE_CONFIG_DIR: fixtureClaudeConfig,
      PATH: fixtureBin,
      FIXTURE_ARCHIVE: join(fixtureRoot, 'download.tar.gz'),
      FIXTURE_FETCH_LOG: fetchLog,
    },
    spawnSyncImpl: Bun.spawnSync,
  };
  const cachePath = join(cacheDir, `${hudSpec.key}-${hudSpec.version}.tar.gz`);
  writeFileSync(cachePath, validArchives.hud);
  const cached = await downloadAndStage(hudSpec, context);
  assert.equal(cached.cached, true, 'a fully verified archive must be reused from cache');
  assert.equal(cached.archivePath, cachePath, 'cache reuse must report the versioned archive path');
  assert.equal(existsSync(fetchLog), false, 'a valid cached archive must not spawn the downloader');

  writeFileSync(cachePath, 'corrupt cache');
  writeFileSync(context.env.FIXTURE_ARCHIVE, validArchives.hud);
  const replaced = await downloadAndStage(hudSpec, context);
  assert.equal(replaced.cached, false, 'a corrupt cache must be downloaded again');
  assert.deepEqual(readFileSync(cachePath), Buffer.from(validArchives.hud), 'a verified temporary download must atomically replace corrupt cache bytes');
  const fetchedEnvironment = JSON.parse(readFileSync(fetchLog, 'utf8'));
  for (const [key, value] of Object.entries(context.env)) {
    assert.equal(fetchedEnvironment[key], value, `the managed fetcher must receive context.env ${key}`);
  }

  const containmentFailures = [];
  for (const [label, maliciousSpec] of [
    ['key separator', { ...hudSpec, key: '../hud' }],
    ['version separator', { ...hudSpec, version: '../0.7.0' }],
  ]) {
    const componentRoot = join(fixtureRoot, `component-${label.replace(' ', '-')}`);
    mkdirSync(componentRoot);
    try {
      await downloadAndStage(maliciousSpec, { ...context, clawgodDir: componentRoot });
      containmentFailures.push(`${label}: accepted`);
    } catch (error) {
      if (!/invalid.*(?:key|version)|filename component/i.test(error.message)) containmentFailures.push(`${label}: ${error.message}`);
    }
  }

  const symlinkCacheTarget = join(fixtureRoot, 'symlink-cache-target.tar.gz');
  writeFileSync(symlinkCacheTarget, validArchives.hud);
  rmSync(cachePath, { force: true });
  symlinkSync(symlinkCacheTarget, cachePath);
  try {
    const result = await downloadAndStage(hudSpec, context);
    if (result.cached || lstatSync(cachePath).isSymbolicLink() || statSync(cachePath).nlink !== 1) {
      containmentFailures.push('cache symlink leaf: reused or retained');
    }
  } catch (error) {
    containmentFailures.push(`cache symlink leaf: ${error.message}`);
  }

  const hardlinkCacheTarget = join(fixtureRoot, 'hardlink-cache-target.tar.gz');
  writeFileSync(hardlinkCacheTarget, validArchives.hud);
  rmSync(cachePath, { force: true });
  linkSync(hardlinkCacheTarget, cachePath);
  try {
    const result = await downloadAndStage(hudSpec, context);
    if (result.cached || statSync(cachePath).nlink !== 1 || statSync(hardlinkCacheTarget).nlink !== 1) {
      containmentFailures.push('cache hardlink leaf: reused or retained');
    }
  } catch (error) {
    containmentFailures.push(`cache hardlink leaf: ${error.message}`);
  }

  const cacheAncestorRoot = join(fixtureRoot, 'cache-ancestor-root');
  const cacheAncestorOutside = join(fixtureRoot, 'cache-ancestor-outside');
  mkdirSync(cacheAncestorRoot);
  mkdirSync(cacheAncestorOutside);
  symlinkSync(cacheAncestorOutside, join(cacheAncestorRoot, 'cache'), process.platform === 'win32' ? 'junction' : 'dir');
  try {
    await downloadAndStage(hudSpec, { ...context, clawgodDir: cacheAncestorRoot });
    containmentFailures.push('cache symlink ancestor: accepted');
  } catch (error) {
    if (!/unsafe.*directory|symlink.*ancestor/i.test(error.message)) containmentFailures.push(`cache symlink ancestor: ${error.message}`);
  }

  const stagingAncestorRoot = join(fixtureRoot, 'staging-ancestor-root');
  const stagingAncestorOutside = join(fixtureRoot, 'staging-ancestor-outside');
  mkdirSync(join(stagingAncestorRoot, 'cache', 'claude-plugins'), { recursive: true });
  writeFileSync(join(stagingAncestorRoot, 'cache', 'claude-plugins', `${hudSpec.key}-${hudSpec.version}.tar.gz`), validArchives.hud);
  mkdirSync(stagingAncestorOutside);
  symlinkSync(stagingAncestorOutside, join(stagingAncestorRoot, 'staging'), process.platform === 'win32' ? 'junction' : 'dir');
  try {
    await downloadAndStage(hudSpec, { ...context, clawgodDir: stagingAncestorRoot });
    containmentFailures.push('staging symlink ancestor: accepted');
  } catch (error) {
    if (!/unsafe.*directory|symlink.*ancestor/i.test(error.message)) containmentFailures.push(`staging symlink ancestor: ${error.message}`);
  }

  const concurrentRoot = join(fixtureRoot, 'concurrent-root');
  const concurrentCache = join(concurrentRoot, 'cache', 'claude-plugins');
  const concurrentBackup = join(fixtureRoot, 'concurrent-cache-backup');
  mkdirSync(concurrentCache, { recursive: true });
  writeFileSync(join(concurrentCache, `${hudSpec.key}-${hudSpec.version}.tar.gz`), 'corrupt');
  try {
    await downloadAndStage(hudSpec, {
      ...context,
      clawgodDir: concurrentRoot,
      env: {
        ...context.env,
        FIXTURE_ATTACK_CACHE_DIR: concurrentCache,
        FIXTURE_ATTACK_CACHE_BACKUP: concurrentBackup,
      },
    });
    containmentFailures.push('concurrent cache ancestor replacement: accepted');
  } catch (error) {
    if (!/unsafe.*directory|changed during download|cache.*replaced/i.test(error.message)) {
      containmentFailures.push(`concurrent cache ancestor replacement: ${error.message}`);
    }
  }
  assert.deepEqual(containmentFailures, [], 'cache and staging containment must reject every path, leaf, and replacement differential');

  const regularReplacementRoot = join(fixtureRoot, 'regular-replacement-root');
  const regularReplacementCache = join(regularReplacementRoot, 'cache', 'claude-plugins');
  const regularReplacementBackup = join(fixtureRoot, 'regular-replacement-cache-backup');
  mkdirSync(regularReplacementCache, { recursive: true });
  writeFileSync(join(regularReplacementCache, `${hudSpec.key}-${hudSpec.version}.tar.gz`), 'corrupt');
  let regularReplacementTriggered = false;
  const regularReplacementSpec = { ...hudSpec };
  Object.defineProperty(regularReplacementSpec, 'sha256', {
    enumerable: true,
    get() {
      if (!regularReplacementTriggered) {
        regularReplacementTriggered = true;
        renameSync(regularReplacementCache, regularReplacementBackup);
        mkdirSync(regularReplacementCache, { recursive: true });
        const temporaryName = readdirSync(regularReplacementBackup).find(name => name.startsWith(`.${hudSpec.key}-${hudSpec.version}-`));
        assert.ok(temporaryName, 'the real fetch path must create its private temporary directory before hash validation');
        const replacementTemporary = join(regularReplacementCache, temporaryName);
        mkdirSync(replacementTemporary);
        copyFileSync(
          join(regularReplacementBackup, temporaryName, 'download.tar.gz'),
          join(replacementTemporary, 'download.tar.gz'),
        );
      }
      return hudSpec.sha256;
    },
  });
  try {
    await downloadAndStage(regularReplacementSpec, { ...context, clawgodDir: regularReplacementRoot });
    roundTwoContainmentFailures.push('regular cache directory replacement: accepted');
  } catch (error) {
    if (!/cache.*directory.*changed|cache.*replaced|unsafe.*cache/i.test(error.message)) {
      roundTwoContainmentFailures.push(`regular cache directory replacement: ${error.message}`);
    }
  }
  assert.equal(regularReplacementTriggered, true, 'the regular-directory replacement fixture must run during archive validation');
  assert.deepEqual(roundTwoContainmentFailures, [], 'exported extraction and regular-directory replacement must fail closed');

  const previousArchive = await pluginArchive(PLUGIN_BASELINES.hud, { root: 'previous-valid-cache' });
  writeFileSync(cachePath, previousArchive);
  context.env.FIXTURE_FETCH_FAIL = '1';
  await assert.rejects(
    downloadAndStage(hudSpec, context),
    error => {
      assert.match(error.message, /hud: download failed/i);
      assert.doesNotMatch(error.message, /secret|proxy|token|stack/i, 'downloader errors must be credential-free');
      assert.equal(error.message.split('\n').length, 1, 'downloader errors must be one line');
      return true;
    },
    'a failed downloader must report one sanitized line',
  );
  assert.deepEqual(readFileSync(cachePath), Buffer.from(previousArchive), 'a downloader failure must leave the previous cache bytes untouched');
} finally {
  for (const [key, value] of savedEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(fixtureRoot, { recursive: true, force: true });
}

for (const [key, value] of savedEnvironment) {
  const actual = Object.hasOwn(process.env, key) ? process.env[key] : undefined;
  assert.equal(actual, value, `${key} must be restored after the fixture import`);
}

console.log('installer plugin dependency tests passed');
