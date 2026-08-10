#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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

function snapshotTree(path) {
  if (!existsSync(path)) return { present: false };
  const status = lstatSync(path);
  if (status.isSymbolicLink()) return { present: true, type: 'link', target: readlinkSync(path), mode: status.mode & 0o777 };
  if (status.isFile()) return { present: true, type: 'file', bytes: readFileSync(path).toString('base64'), mode: status.mode & 0o777 };
  assert.equal(status.isDirectory(), true, `${path} must be a regular filesystem entry`);
  return {
    present: true,
    type: 'directory',
    mode: status.mode & 0o777,
    entries: Object.fromEntries(readdirSync(path).sort().map(name => [name, snapshotTree(join(path, name))])),
  };
}

function snapshotContentTree(path) {
  const status = lstatSync(path);
  if (status.isSymbolicLink()) return { type: 'link', target: readlinkSync(path) };
  if (status.isFile()) return { type: 'file', bytes: readFileSync(path).toString('base64'), mode: status.mode & 0o777 };
  assert.equal(status.isDirectory(), true, `${path} must be a regular filesystem entry`);
  return {
    type: 'directory',
    entries: Object.fromEntries(readdirSync(path).sort().map(name => [name, snapshotContentTree(join(path, name))])),
  };
}

function walkTextFiles(path, values = []) {
  const status = lstatSync(path);
  if (status.isDirectory()) {
    for (const name of readdirSync(path)) walkTextFiles(join(path, name), values);
  } else if (status.isFile()) {
    values.push(readFileSync(path, 'utf8'));
  }
  return values;
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
    ensureMarketplacePlugin,
    extractPluginArchive,
    parseSemver,
    selectInstalledRecord,
    sha256,
    validateArchive,
  } = pluginDependencies;

  assert.equal(typeof extractPluginArchive, 'function', 'plugin-dependencies.mjs must export extractPluginArchive');
  assert.equal(typeof downloadAndStage, 'function', 'plugin-dependencies.mjs must export downloadAndStage');
  assert.equal(typeof ensureMarketplacePlugin, 'function', 'plugin-dependencies.mjs must export ensureMarketplacePlugin');

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
  const verifiedSourceTrees = {};
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
    verifiedSourceTrees[key] = snapshotContentTree(sourceRoot);
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

  const fakeCliPath = join(fixtureRoot, 'fake-cli.original.cjs');
  writeFileSync(fakeCliPath, `#!/usr/bin/env bun
import { appendFileSync, cpSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const config = process.env.CLAUDE_CONFIG_DIR;
const pluginRoot = join(config, 'plugins');
const knownPath = join(pluginRoot, 'known_marketplaces.json');
const installedPath = join(pluginRoot, 'installed_plugins.json');
const settingsPath = join(config, 'settings.json');
const args = process.argv.slice(2);
appendFileSync(process.env.FIXTURE_CLI_LOG, JSON.stringify({ args, disabled: process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, execPath: process.execPath, script: process.argv[1] }) + '\\n');

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\\n');
}
function failAfter(step) {
  if (process.env.FIXTURE_CLI_FAIL === step) process.exit(41);
}

if (args[0] !== 'plugin') process.exit(64);
if (args[1] === 'marketplace' && args[2] === 'remove') {
  const marketplace = args[3];
  const known = readJson(knownPath, {});
  delete known[marketplace];
  writeJson(knownPath, known);
  rmSync(join(pluginRoot, 'marketplaces', marketplace), { recursive: true, force: true });
  failAfter('marketplace-remove');
  process.exit(0);
}
  if (args[1] === 'marketplace' && args[2] === 'add' && args[4] === '--scope' && args[5] === 'user') {
  const source = args[3];
  const manifest = readJson(join(source, '.claude-plugin', 'marketplace.json'), null);
  if (!manifest?.name) process.exit(65);
  const install = join(pluginRoot, 'marketplaces', manifest.name);
  rmSync(install, { recursive: true, force: true });
  mkdirSync(dirname(install), { recursive: true });
  cpSync(source, install, { recursive: true, errorOnExist: true, force: false });
  const known = readJson(knownPath, {});
  known[manifest.name] = { source: { source: 'directory', path: source }, installLocation: install };
  writeJson(knownPath, known);
  if (process.env.FIXTURE_ATTACK_MARKETPLACE_PARENT) {
    const parent = dirname(install);
    renameSync(parent, process.env.FIXTURE_ATTACK_MARKETPLACE_BACKUP);
    symlinkSync(process.env.FIXTURE_ATTACK_MARKETPLACE_OUTSIDE, parent, process.platform === 'win32' ? 'junction' : 'dir');
  }
  if (process.env.FIXTURE_REPLACE_MARKETPLACE_PARENT_REGULAR === '1') {
    const parent = dirname(install);
    renameSync(parent, process.env.FIXTURE_REPLACE_MARKETPLACE_PARENT_BACKUP);
    mkdirSync(parent);
  }
  if (process.env.FIXTURE_CREATE_MARKETPLACE_SIBLING === '1') {
    writeFileSync(join(dirname(install), 'concurrent-sibling.txt'), 'preserve concurrent data\\n');
  }
  if (process.env.FIXTURE_ATTACK_PLUGIN_ROOT === '1') {
    renameSync(pluginRoot, process.env.FIXTURE_ATTACK_PLUGIN_ROOT_BACKUP);
    symlinkSync(process.env.FIXTURE_ATTACK_PLUGIN_ROOT_BACKUP, pluginRoot, process.platform === 'win32' ? 'junction' : 'dir');
    writeFileSync(
      join(process.env.FIXTURE_ATTACK_PLUGIN_ROOT_BACKUP, 'marketplaces', manifest.name, 'outside-sentinel.txt'),
      'do not delete through plugin-root replacement\\n',
    );
  }
  failAfter('marketplace-add');
  process.exit(0);
}
if ((args[1] === 'install' || args[1] === 'update') && args[3] === '--scope' && args[4] === 'user') {
  const id = args[2];
  const separator = id.lastIndexOf('@');
  const plugin = id.slice(0, separator);
  const marketplace = id.slice(separator + 1);
  const known = readJson(knownPath, {});
  const source = known[marketplace]?.source?.path;
  const manifest = source ? readJson(join(source, '.claude-plugin', 'marketplace.json'), null) : null;
  const entry = manifest?.plugins?.find(candidate => candidate.name === plugin);
  if (!entry || !source) process.exit(66);
  const pluginSource = join(source, entry.source.replace(/^\\.\\//, ''));
  const pluginManifest = readJson(join(pluginSource, '.claude-plugin', 'plugin.json'), null);
  const version = entry.version || pluginManifest?.version;
  if (!version) process.exit(66);
  const installPath = join(pluginRoot, 'cache', marketplace, plugin, version);
  rmSync(installPath, { recursive: true, force: true });
  mkdirSync(dirname(installPath), { recursive: true });
  cpSync(pluginSource, installPath, { recursive: true, errorOnExist: true, force: false });
  const installed = readJson(installedPath, { version: 2, plugins: {} });
  installed.version ??= 2;
  installed.plugins ??= {};
  const previousRecord = (installed.plugins[id] || []).find(record => record.scope === 'user');
  if (process.env.FIXTURE_MUTATE_OLD_CACHE === '1' && previousRecord?.installPath) {
    writeFileSync(join(previousRecord.installPath, 'old-cache.txt'), 'mutated old cache must be rolled back\\n');
  }
  installed.plugins[id] = (installed.plugins[id] || []).filter(record => record.scope !== 'user');
  const recordedInstallPath = process.env.FIXTURE_RECORD_CACHE_ROOT === '1'
    ? join(pluginRoot, 'cache')
    : installPath;
  installed.plugins[id].push({ scope: 'user', version, installPath: recordedInstallPath });
  writeJson(installedPath, installed);
  if (process.env.FIXTURE_SKIP_ENABLE !== '1') {
    const settings = readJson(settingsPath, {});
    settings.enabledPlugins ??= {};
    settings.enabledPlugins[id] = true;
    writeJson(settingsPath, settings);
  }
  if (process.env.FIXTURE_MALFORMED_AFTER === 'installed') writeFileSync(installedPath, '{malformed installed state\\n');
  if (process.env.FIXTURE_MALFORMED_AFTER === 'settings') writeFileSync(settingsPath, '{malformed settings state\\n');
  if (process.env.FIXTURE_CREATE_UNKNOWN_CACHE === '1') {
    const unknownParent = process.env.FIXTURE_UNKNOWN_CACHE_LOCATION === 'version' ? installPath : dirname(installPath);
    writeFileSync(join(unknownParent, 'concurrent-unknown.txt'), 'preserve unknown concurrent cache data\\n');
  }
  if (process.env.FIXTURE_ATTACK_CACHE_ROOT === '1') {
    const cacheRoot = join(pluginRoot, 'cache');
    renameSync(cacheRoot, process.env.FIXTURE_ATTACK_CACHE_ROOT_BACKUP);
    symlinkSync(process.env.FIXTURE_ATTACK_CACHE_ROOT_BACKUP, cacheRoot, process.platform === 'win32' ? 'junction' : 'dir');
    writeFileSync(join(process.env.FIXTURE_ATTACK_CACHE_ROOT_BACKUP, 'outside-sentinel.txt'), 'do not trust relocated cache\\n');
  }
  failAfter(args[1]);
  process.exit(0);
}
process.exit(67);
`);
  chmodSync(fakeCliPath, 0o700);

  function olderVersion(spec) {
    return spec.key === 'memory' ? '13.13.0' : spec.key === 'superpowers' ? '6.1.0' : '0.6.0';
  }

  function transactionSnapshot(fixture) {
    return Object.fromEntries(Object.entries(fixture.paths).map(([key, path]) => [key, snapshotTree(path)]));
  }

  function assertTransactionSnapshot(fixture, expectedSnapshot, message) {
    assert.deepEqual(transactionSnapshot(fixture), expectedSnapshot, message);
  }

  function makeTransactionFixture(label, spec, classification, options = {}) {
    const root = join(fixtureRoot, `transaction-${label}`);
    const home = join(root, 'home');
    const claudeConfigDir = join(root, 'claude-config');
    const pluginRoot = join(claudeConfigDir, 'plugins');
    const clawgodDir = join(root, 'clawgod');
    const cacheDirectory = join(clawgodDir, 'cache', 'claude-plugins');
    const persistentSource = join(pluginRoot, 'clawgod-marketplaces', spec.marketplace, spec.version);
    const marketplaceInstall = join(pluginRoot, 'marketplaces', spec.marketplace);
    const knownPath = join(pluginRoot, 'known_marketplaces.json');
    const installedPath = join(pluginRoot, 'installed_plugins.json');
    const settingsPath = join(claudeConfigDir, 'settings.json');
    const pluginCache = join(pluginRoot, 'cache', spec.marketplace, spec.plugin);
    const cliLog = join(root, 'cli-log.jsonl');
    const fetchLogPath = join(root, 'fetch-used');
    const fetchPath = join(root, 'unreachable-fetch.mjs');
    mkdirSync(home, { recursive: true });
    mkdirSync(pluginRoot, { recursive: true });
    mkdirSync(cacheDirectory, { recursive: true });
    mkdirSync(join(root, 'bin'), { recursive: true });
    const bytes = validArchives[spec.key];
    const archivePath = join(cacheDirectory, `${spec.key}-${spec.version}.tar.gz`);
    if (options.archive !== false) writeFileSync(archivePath, bytes);
    writeFileSync(fetchPath, `await Bun.write(${JSON.stringify(fetchLogPath)}, 'called'); process.exit(79);\n`);

    const plugins = {
      'unrelated@fixture': [{ scope: 'user', version: '1.0.0', metadata: { preserve: true } }],
      ...(spec.key === 'superpowers' ? {
        'superpowers@claude-plugins-official': [{ scope: 'user', version: '99.0.0', metadata: { exact: 'official-record' } }],
      } : {}),
    };
    if (classification !== 'missing') {
      const version = classification === 'older' ? olderVersion(spec)
        : classification === 'satisfied' ? spec.version
          : classification === 'newer' ? '99.0.0' : 'latest';
      plugins[spec.id] = [{ scope: 'user', version, installPath: join(pluginCache, version), metadata: { preserve: classification } }];
      mkdirSync(join(pluginCache, version), { recursive: true });
      writeFileSync(join(pluginCache, version, 'old-cache.txt'), `old cache ${classification}\n`);
    } else {
      mkdirSync(join(pluginCache, 'legacy'), { recursive: true });
      writeFileSync(join(pluginCache, 'legacy', 'keep.txt'), 'unrelated legacy cache\n');
    }
    if (options.staleBaselineCache) {
      mkdirSync(join(pluginCache, spec.version), { recursive: true });
      writeFileSync(join(pluginCache, spec.version, 'stale.txt'), 'restore stale baseline cache\n');
    }
    writeFileSync(installedPath, `{\n  "version": 2,\n  "plugins": ${JSON.stringify(plugins, null, 4)}\n}\n`);
    chmodSync(installedPath, 0o640);
    writeFileSync(settingsPath, JSON.stringify({ enabledPlugins: { 'unrelated@fixture': true, [spec.id]: false } }, null, 4) + '\n');
    chmodSync(settingsPath, 0o600);
    const known = { 'unrelated-marketplace': { source: { source: 'github', repo: 'fixture/keep' } } };
    if (options.known !== false) {
      known[spec.marketplace] = { source: { source: 'directory', path: '/old/stale/source' }, installLocation: marketplaceInstall, marker: 'old-known-entry' };
      mkdirSync(marketplaceInstall, { recursive: true });
      writeFileSync(join(marketplaceInstall, 'old-marketplace.txt'), 'restore old marketplace\n');
    }
    writeFileSync(knownPath, JSON.stringify(known, null, 3) + '\n');
    chmodSync(knownPath, 0o644);
    if (options.oldPersistent) {
      mkdirSync(persistentSource, { recursive: true });
      writeFileSync(join(persistentSource, 'old-source.txt'), 'restore old persistent source\n');
    }
    if (spec.key === 'superpowers') {
      const officialCache = join(pluginRoot, 'cache', 'claude-plugins-official', 'superpowers', '99.0.0');
      mkdirSync(officialCache, { recursive: true });
      writeFileSync(join(officialCache, 'official.txt'), 'official bytes must remain exact\n');
    }
    const fixtureContext = {
      home,
      claudeConfigDir,
      clawgodDir,
      bunPath: process.execPath,
      claudeCliPath: fakeCliPath,
      fetchFilePath: fetchPath,
      env: {
        HOME: home,
        CLAUDE_CONFIG_DIR: claudeConfigDir,
        PATH: join(root, 'bin'),
        FIXTURE_CLI_LOG: cliLog,
        ...(options.failStep ? { FIXTURE_CLI_FAIL: options.failStep } : {}),
        ...(options.unknownCacheOnFailure ? { FIXTURE_CREATE_UNKNOWN_CACHE: '1' } : {}),
        ...(options.unknownCacheLocation ? { FIXTURE_UNKNOWN_CACHE_LOCATION: options.unknownCacheLocation } : {}),
        ...(options.recordCacheRoot ? { FIXTURE_RECORD_CACHE_ROOT: '1' } : {}),
        ...(options.skipEnable ? { FIXTURE_SKIP_ENABLE: '1' } : {}),
        ...(options.malformedAfter ? { FIXTURE_MALFORMED_AFTER: options.malformedAfter } : {}),
        ...(options.createMarketplaceSibling ? { FIXTURE_CREATE_MARKETPLACE_SIBLING: '1' } : {}),
        ...(options.mutateOldCache ? { FIXTURE_MUTATE_OLD_CACHE: '1' } : {}),
        ...(options.attackMarketplaceParent ? {
          FIXTURE_ATTACK_MARKETPLACE_PARENT: '1',
          FIXTURE_ATTACK_MARKETPLACE_BACKUP: join(root, 'marketplaces-displaced'),
          FIXTURE_ATTACK_MARKETPLACE_OUTSIDE: join(root, 'marketplaces-outside'),
        } : {}),
        ...(options.replaceMarketplaceParentRegular ? {
          FIXTURE_REPLACE_MARKETPLACE_PARENT_REGULAR: '1',
          FIXTURE_REPLACE_MARKETPLACE_PARENT_BACKUP: join(root, 'marketplaces-regular-displaced'),
        } : {}),
        ...(options.attackPluginRoot ? {
          FIXTURE_ATTACK_PLUGIN_ROOT: '1',
          FIXTURE_ATTACK_PLUGIN_ROOT_BACKUP: join(root, 'plugins-displaced'),
        } : {}),
        ...(options.attackCacheRoot ? {
          FIXTURE_ATTACK_CACHE_ROOT: '1',
          FIXTURE_ATTACK_CACHE_ROOT_BACKUP: join(root, 'cache-displaced'),
        } : {}),
      },
      spawnSyncImpl: Bun.spawnSync,
    };
    return {
      root, home, claudeConfigDir, pluginRoot, clawgodDir, persistentSource, marketplaceInstall,
      knownPath, installedPath, settingsPath, pluginCache, cliLog, fetchLogPath,
      context: fixtureContext,
      paths: {
        pluginRoot,
        known: knownPath,
        installed: installedPath,
        settings: settingsPath,
        marketplace: marketplaceInstall,
        cache: pluginCache,
        persistent: persistentSource,
      },
    };
  }

  function readCliLog(fixture) {
    if (!existsSync(fixture.cliLog)) return [];
    return readFileSync(fixture.cliLog, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  }

  const installFixture = makeTransactionFixture('missing-install', hudSpec, 'missing', { known: false });
  const installResult = await ensureMarketplacePlugin(hudSpec, installFixture.context);
  assert.deepEqual(installResult, {
    key: 'hud', id: hudSpec.id, version: hudSpec.version, status: 'installed', ready: true,
    detail: 'installed 0.7.0',
  }, 'a missing plugin must install the exact baseline');
  assert.deepEqual(readCliLog(installFixture), [
    { args: ['plugin', 'marketplace', 'add', installFixture.persistentSource, '--scope', 'user'], disabled: '1', execPath: process.execPath, script: fakeCliPath },
    { args: ['plugin', 'install', hudSpec.id, '--scope', 'user'], disabled: '1', execPath: process.execPath, script: fakeCliPath },
  ], 'a missing plugin must add its persistent marketplace and install only the canonical id');
  const installedHud = JSON.parse(readFileSync(installFixture.installedPath, 'utf8'));
  assert.equal(installedHud.plugins[hudSpec.id].find(record => record.scope === 'user').version, hudSpec.version);
  assert.deepEqual(JSON.parse(readFileSync(installFixture.settingsPath, 'utf8')).enabledPlugins, {
    'unrelated@fixture': true,
    [hudSpec.id]: true,
  }, 'installation must enable only the canonical dependency while preserving unrelated settings');
  assert.equal(existsSync(installFixture.persistentSource), true, 'the persistent marketplace source must remain after success');
  assert.equal(walkTextFiles(installFixture.persistentSource).some(value => value.includes('.staged') || value.includes('/staging/')), false, 'persistent source bytes must not reference temporary staging paths');
  const installedHudPath = installedHud.plugins[hudSpec.id].find(record => record.scope === 'user').installPath;
  assert.equal(realpathSync(installedHudPath).startsWith(`${realpathSync(join(installFixture.pluginRoot, 'cache'))}/`), true, 'the installed plugin must remain under the canonical cache root');
  rmSync(installFixture.clawgodDir, { recursive: true, force: true });
  assert.equal(existsSync(installFixture.persistentSource), true, 'the marketplace source must survive removal of ClawGod state');

  const updateFixture = makeTransactionFixture('older-update', hudSpec, 'older', { oldPersistent: true });
  const updateResult = await ensureMarketplacePlugin(hudSpec, updateFixture.context);
  assert.equal(updateResult.status, 'upgraded', 'an older user plugin must be upgraded to the baseline');
  assert.deepEqual(readCliLog(updateFixture).map(entry => entry.args), [
    ['plugin', 'marketplace', 'remove', hudSpec.marketplace],
    ['plugin', 'marketplace', 'add', updateFixture.persistentSource, '--scope', 'user'],
    ['plugin', 'update', hudSpec.id, '--scope', 'user'],
  ], 'an older plugin must replace the stale canonical marketplace before update');
  assert.equal(existsSync(join(updateFixture.marketplaceInstall, 'old-marketplace.txt')), false, 'a stale canonical marketplace install must not survive success');

  const superSpec = archiveSpec(PLUGIN_BASELINES.superpowers, validArchives.superpowers);
  const superFixture = makeTransactionFixture('superpowers-wrapper', superSpec, 'missing', { known: false });
  const officialRecordBefore = JSON.stringify(JSON.parse(readFileSync(superFixture.installedPath, 'utf8')).plugins['superpowers@claude-plugins-official']);
  const officialCacheBefore = snapshotTree(join(superFixture.pluginRoot, 'cache', 'claude-plugins-official', 'superpowers'));
  const superResult = await ensureMarketplacePlugin(superSpec, superFixture.context);
  assert.equal(superResult.status, 'installed');
  assert.deepEqual(JSON.parse(readFileSync(join(superFixture.persistentSource, '.claude-plugin', 'marketplace.json'), 'utf8')), {
    name: 'superpowers-marketplace',
    plugins: [{ name: 'superpowers', version: '6.2.0', source: './plugin' }],
  }, 'Superpowers must use the exact canonical wrapper manifest');
  assert.deepEqual(snapshotContentTree(join(superFixture.persistentSource, 'plugin')), verifiedSourceTrees.superpowers, 'the complete verified Superpowers repository must remain nested byte-for-byte with exact file modes');
  const installedSuperpowers = JSON.parse(readFileSync(superFixture.installedPath, 'utf8'));
  assert.equal(JSON.stringify(installedSuperpowers.plugins['superpowers@claude-plugins-official']), officialRecordBefore, 'the official Superpowers record must remain byte-identical');
  assert.deepEqual(snapshotTree(join(superFixture.pluginRoot, 'cache', 'claude-plugins-official', 'superpowers')), officialCacheBefore, 'the official Superpowers cache must remain byte-identical');
  assert.equal(readCliLog(superFixture).some(entry => entry.args.join(' ').includes('superpowers@claude-plugins-official')), false, 'no command may target official Superpowers');

  for (const [classification, expectedStatus, expectedReady] of [
    ['satisfied', 'preserved', true],
    ['newer', 'preserved', true],
    ['invalid', 'warning', false],
  ]) {
    const preserveFixture = makeTransactionFixture(`preserve-${classification}`, hudSpec, classification, { archive: false, oldPersistent: true });
    const before = transactionSnapshot(preserveFixture);
    const result = await ensureMarketplacePlugin(hudSpec, preserveFixture.context);
    assert.equal(result.status, expectedStatus, `${classification} versions must return ${expectedStatus}`);
    assert.equal(result.ready, expectedReady, `${classification} readiness must be explicit`);
    assertTransactionSnapshot(preserveFixture, before, `${classification} versions must preserve marketplace, cache, settings, source, and installation record bytes`);
    assert.equal(existsSync(preserveFixture.cliLog), false, `${classification} versions must spawn no CLI command`);
    assert.equal(existsSync(preserveFixture.fetchLogPath), false, `${classification} versions must not fetch archives`);
  }

  const noncanonicalSpec = { ...hudSpec, id: 'claude-hud@wrong-marketplace' };
  const noncanonicalFixture = makeTransactionFixture('noncanonical-id', noncanonicalSpec, 'missing', { archive: false });
  const noncanonicalBefore = transactionSnapshot(noncanonicalFixture);
  const noncanonicalResult = await ensureMarketplacePlugin(noncanonicalSpec, noncanonicalFixture.context);
  assert.equal(noncanonicalResult.status, 'warning', 'a noncanonical plugin id must be rejected');
  assert.equal(noncanonicalResult.ready, false, 'a noncanonical plugin id must not report readiness');
  assertTransactionSnapshot(noncanonicalFixture, noncanonicalBefore, 'a noncanonical plugin id must preserve every byte and mode');
  assert.equal(existsSync(noncanonicalFixture.cliLog), false, 'a noncanonical plugin id must spawn no CLI command');
  assert.equal(existsSync(noncanonicalFixture.fetchLogPath), false, 'a noncanonical plugin id must not fetch archives');

  const protectedOfficialSpec = {
    ...superSpec,
    id: 'superpowers@claude-plugins-official',
    marketplace: 'claude-plugins-official',
  };
  const protectedOfficialFixture = makeTransactionFixture('protected-official-tuple', superSpec, 'missing', { known: false });
  const protectedOfficialInstalled = JSON.parse(readFileSync(protectedOfficialFixture.installedPath, 'utf8'));
  delete protectedOfficialInstalled.plugins['superpowers@claude-plugins-official'];
  writeFileSync(protectedOfficialFixture.installedPath, `${JSON.stringify(protectedOfficialInstalled, null, 2)}\n`);
  chmodSync(protectedOfficialFixture.installedPath, 0o640);
  const protectedOfficialBefore = transactionSnapshot(protectedOfficialFixture);
  const protectedOfficialResult = await ensureMarketplacePlugin(protectedOfficialSpec, protectedOfficialFixture.context);
  assert.equal(protectedOfficialResult.status, 'warning', 'a self-consistent protected official Superpowers tuple must be rejected');
  assert.equal(protectedOfficialResult.ready, false, 'a protected official Superpowers tuple must not report readiness');
  assertTransactionSnapshot(protectedOfficialFixture, protectedOfficialBefore, 'a protected official Superpowers tuple must preserve every byte and mode');
  assert.equal(existsSync(protectedOfficialFixture.cliLog), false, 'a protected official Superpowers tuple must spawn no CLI command');
  assert.equal(existsSync(protectedOfficialFixture.fetchLogPath), false, 'a protected official Superpowers tuple must not fetch archives');

  for (const [field, value] of [
    ['key', 'hud-copy'],
    ['id', 'claude-hud-copy@claude-hud'],
    ['marketplace', 'claude-hud-copy'],
    ['plugin', 'claude-hud-copy'],
    ['version', '0.7.1'],
  ]) {
    const tupleFixture = makeTransactionFixture(`noncanonical-tuple-${field}`, hudSpec, 'missing', { known: false });
    const tupleBefore = transactionSnapshot(tupleFixture);
    const tupleResult = await ensureMarketplacePlugin({ ...hudSpec, [field]: value }, tupleFixture.context);
    assert.equal(tupleResult.status, 'warning', `a noncanonical ${field} must be rejected`);
    assert.equal(tupleResult.ready, false, `a noncanonical ${field} must not report readiness`);
    assertTransactionSnapshot(tupleFixture, tupleBefore, `a noncanonical ${field} must preserve every byte and mode`);
    assert.equal(existsSync(tupleFixture.cliLog), false, `a noncanonical ${field} must spawn no CLI command`);
    assert.equal(existsSync(tupleFixture.fetchLogPath), false, `a noncanonical ${field} must not fetch archives`);
  }

  const freshConfigFixture = makeTransactionFixture('fresh-config-fetch-failure', hudSpec, 'missing', { archive: false, known: false });
  rmSync(freshConfigFixture.pluginRoot, { recursive: true, force: true });
  const freshConfigBefore = transactionSnapshot(freshConfigFixture);
  const freshConfigResult = await ensureMarketplacePlugin(hudSpec, freshConfigFixture.context);
  assert.equal(freshConfigResult.status, 'warning', 'a pre-mutation failure in a fresh config must return an ordinary warning');
  assert.equal(freshConfigResult.ready, false, 'a pre-mutation failure in a fresh config must not report readiness');
  assertTransactionSnapshot(freshConfigFixture, freshConfigBefore, 'a pre-mutation failure must preserve an absent plugins tree');
  assert.equal(existsSync(freshConfigFixture.pluginRoot), false, 'a pre-mutation failure must not create the absent plugins tree');
  assert.equal(existsSync(freshConfigFixture.cliLog), false, 'a pre-mutation failure must spawn no CLI command');
  assert.equal(existsSync(freshConfigFixture.fetchLogPath), true, 'the fresh-config fixture must reach its failing fetch helper');

  const malformedSpecFixture = makeTransactionFixture('malformed-spec', hudSpec, 'missing', { archive: false });
  const malformedSpecBefore = transactionSnapshot(malformedSpecFixture);
  const malformedSpecResult = await ensureMarketplacePlugin({ ...hudSpec, key: '../hud' }, malformedSpecFixture.context);
  assert.equal(malformedSpecResult.status, 'warning', 'a malformed plugin spec must warn without throwing');
  assert.equal(malformedSpecResult.ready, false, 'a malformed plugin spec must not report readiness');
  assertTransactionSnapshot(malformedSpecFixture, malformedSpecBefore, 'a malformed plugin spec must preserve every byte and mode');
  assert.equal(existsSync(malformedSpecFixture.cliLog), false, 'a malformed plugin spec must spawn no CLI command');
  assert.equal(existsSync(malformedSpecFixture.fetchLogPath), false, 'a malformed plugin spec must not fetch archives');

  for (const malformedTarget of ['installed', 'known', 'settings']) {
    const malformedFixture = makeTransactionFixture(`malformed-${malformedTarget}`, hudSpec, 'missing', { archive: false });
    writeFileSync(malformedFixture.paths[malformedTarget], '{not valid json\n');
    const before = transactionSnapshot(malformedFixture);
    const result = await ensureMarketplacePlugin(hudSpec, malformedFixture.context);
    assert.equal(result.status, 'warning', `malformed ${malformedTarget} state must warn without throwing`);
    assertTransactionSnapshot(malformedFixture, before, `malformed ${malformedTarget} state must preserve every byte and mode`);
    assert.equal(existsSync(malformedFixture.cliLog), false, `malformed ${malformedTarget} state must spawn no CLI command`);
    assert.equal(existsSync(malformedFixture.fetchLogPath), false, `malformed ${malformedTarget} state must not fetch archives`);
  }

  const unsafeCacheFixture = makeTransactionFixture('unsafe-cache-snapshot', hudSpec, 'older', { oldPersistent: true });
  const unsafeCacheOutside = join(unsafeCacheFixture.root, 'unsafe-cache-outside');
  mkdirSync(unsafeCacheOutside);
  writeFileSync(join(unsafeCacheOutside, 'outside-sentinel.txt'), 'cache snapshot must not alter this target\n');
  symlinkSync(unsafeCacheOutside, join(unsafeCacheFixture.pluginCache, 'unsafe-link'), process.platform === 'win32' ? 'junction' : 'dir');
  const unsafeCacheBefore = transactionSnapshot(unsafeCacheFixture);
  const unsafeCacheOutsideBefore = snapshotTree(unsafeCacheOutside);
  const unsafeCacheResult = await ensureMarketplacePlugin(hudSpec, unsafeCacheFixture.context);
  assert.equal(unsafeCacheResult.status, 'warning', 'an unsafe cache snapshot must warn without throwing');
  assert.equal(unsafeCacheResult.ready, false, 'an unsafe cache snapshot must not report readiness');
  assertTransactionSnapshot(unsafeCacheFixture, unsafeCacheBefore, 'failed cache snapshot preparation must restore exact directory trees');
  assert.deepEqual(snapshotTree(unsafeCacheOutside), unsafeCacheOutsideBefore, 'cache snapshot preparation must not write through a link');
  assert.equal(existsSync(unsafeCacheFixture.cliLog), false, 'an unsafe cache snapshot must spawn no plugin CLI');

  const cacheBackupCollisionFixture = makeTransactionFixture('cache-backup-collision', hudSpec, 'missing', { oldPersistent: true });
  rmSync(cacheBackupCollisionFixture.pluginCache, { recursive: true, force: true });
  const cacheBackupCollision = `${cacheBackupCollisionFixture.pluginCache}.${process.pid}.backup`;
  mkdirSync(cacheBackupCollision);
  writeFileSync(join(cacheBackupCollision, 'collision-sentinel.txt'), 'preserve pre-existing backup collision\n');
  const cacheBackupCollisionBefore = transactionSnapshot(cacheBackupCollisionFixture);
  const cacheBackupCollisionResult = await ensureMarketplacePlugin(hudSpec, cacheBackupCollisionFixture.context);
  assert.equal(cacheBackupCollisionResult.status, 'warning', 'a cache backup collision must warn without throwing');
  assert.equal(cacheBackupCollisionResult.ready, false, 'a cache backup collision must not report readiness');
  assertTransactionSnapshot(cacheBackupCollisionFixture, cacheBackupCollisionBefore, 'cache backup collision must not leave a transaction-created cache directory');
  assert.equal(existsSync(cacheBackupCollisionFixture.cliLog), false, 'a cache backup collision must spawn no plugin CLI');

  for (const [failStep, classification, staleBaselineCache, oldPersistent, knownMarketplace] of [
    ['marketplace-remove', 'older', false, true, true],
    ['marketplace-add', 'older', false, true, true],
    ['install', 'missing', true, false, false],
    ['update', 'older', false, true, true],
  ]) {
    const rollbackFixture = makeTransactionFixture(`rollback-${failStep}`, hudSpec, classification, {
      failStep,
      oldPersistent,
      known: knownMarketplace,
      staleBaselineCache,
      mutateOldCache: failStep === 'update',
    });
    const before = transactionSnapshot(rollbackFixture);
    const result = await ensureMarketplacePlugin(hudSpec, rollbackFixture.context);
    assert.equal(result.status, 'warning', `${failStep} failure must be reported as a warning`);
    assert.equal(result.ready, false, `${failStep} failure must not report readiness`);
    assertTransactionSnapshot(rollbackFixture, before, `${failStep} failure must restore exact JSON modes/bytes and directory trees`);
  }

  const cacheRootRecordFixture = makeTransactionFixture('rollback-cache-root-record', hudSpec, 'missing', {
    known: false,
    recordCacheRoot: true,
    staleBaselineCache: true,
  });
  const cacheRootRecordBefore = transactionSnapshot(cacheRootRecordFixture);
  const cacheRootRecordResult = await ensureMarketplacePlugin(hudSpec, cacheRootRecordFixture.context);
  assert.equal(cacheRootRecordResult.status, 'warning', 'an install record at the cache root must fail verification');
  assert.equal(cacheRootRecordResult.ready, false, 'an install record at the cache root must not report readiness');
  assertTransactionSnapshot(cacheRootRecordFixture, cacheRootRecordBefore, 'cache-root verification failure must restore exact JSON modes/bytes and directory trees');

  const unknownCacheFixture = makeTransactionFixture('rollback-unknown-cache', hudSpec, 'missing', {
    failStep: 'install',
    known: false,
    unknownCacheOnFailure: true,
  });
  await assert.rejects(
    ensureMarketplacePlugin(hudSpec, unknownCacheFixture.context),
    error => {
      assert.equal(error?.restorationIncomplete, true, 'unknown cache insertion must mark restoration incomplete');
      assert.equal(typeof error?.evidencePath, 'string', 'unknown cache insertion must retain an evidence path');
      assert.equal(
        readFileSync(join(error.evidencePath, 'concurrent-unknown.txt'), 'utf8'),
        'preserve unknown concurrent cache data\n',
        'unknown concurrent cache data must survive in the failed live tree',
      );
      return true;
    },
    'an unknown concurrent cache insertion must preserve evidence and reject ordinary rollback',
  );

  const nestedUnknownCacheFixture = makeTransactionFixture('rollback-nested-unknown-cache', hudSpec, 'missing', {
    failStep: 'install',
    known: false,
    unknownCacheOnFailure: true,
    unknownCacheLocation: 'version',
  });
  await assert.rejects(
    ensureMarketplacePlugin(hudSpec, nestedUnknownCacheFixture.context),
    error => {
      assert.equal(error?.restorationIncomplete, true, 'nested unknown cache insertion must mark restoration incomplete');
      assert.equal(
        readFileSync(join(error.evidencePath, hudSpec.version, 'concurrent-unknown.txt'), 'utf8'),
        'preserve unknown concurrent cache data\n',
        'nested unknown cache data must survive in the failed live tree',
      );
      return true;
    },
    'an unknown insertion within the baseline version must preserve evidence and reject ordinary rollback',
  );

  const postQuarantineFixture = makeTransactionFixture('rollback-post-quarantine-insertion', hudSpec, 'missing', {
    failStep: 'install',
    known: false,
  });
  postQuarantineFixture.context.onCacheQuarantined = ({ pluginCache }) => {
    mkdirSync(pluginCache, { recursive: true });
    writeFileSync(join(pluginCache, 'post-quarantine.txt'), 'preserve insertion after quarantine\n');
  };
  await assert.rejects(
    ensureMarketplacePlugin(hudSpec, postQuarantineFixture.context),
    error => {
      assert.equal(error?.restorationIncomplete, true, 'post-quarantine insertion must mark restoration incomplete');
      const evidencePaths = Array.isArray(error?.evidencePaths) ? error.evidencePaths : [];
      const concurrentEvidence = evidencePaths.find(path => existsSync(join(path, 'post-quarantine.txt')));
      assert.equal(typeof concurrentEvidence, 'string', 'post-quarantine insertion must retain an evidence path');
      return true;
    },
    'an insertion after cache quarantine must survive and reject ordinary rollback',
  );

  const postQuarantineModeFixture = makeTransactionFixture('rollback-post-quarantine-mode-change', hudSpec, 'missing', {
    failStep: 'install',
    known: false,
  });
  postQuarantineModeFixture.context.onCacheQuarantined = ({ pluginCache }) => {
    chmodSync(join(pluginCache, 'legacy', 'keep.txt'), 0o600);
  };
  await assert.rejects(
    ensureMarketplacePlugin(hudSpec, postQuarantineModeFixture.context),
    error => {
      assert.equal(error?.restorationIncomplete, true, 'a mode change after cache quarantine must mark restoration incomplete');
      const evidencePaths = Array.isArray(error?.evidencePaths) ? error.evidencePaths : [];
      const changedEvidence = evidencePaths.find(path => {
        const changedPath = join(path, 'legacy', 'keep.txt');
        return existsSync(changedPath) && (lstatSync(changedPath).mode & 0o777) === 0o600;
      });
      assert.equal(typeof changedEvidence, 'string', 'a mode-changed cache tree must remain available as evidence');
      return true;
    },
    'a mode change after cache quarantine must preserve evidence and reject ordinary rollback',
  );

  const lateCanonicalInsertionFixture = makeTransactionFixture('rollback-late-canonical-insertion', hudSpec, 'missing', {
    failStep: 'install',
    known: false,
  });
  let lateCanonicalHookRan = false;
  lateCanonicalInsertionFixture.context.onCacheFailedInspected = ({ pluginCache }) => {
    lateCanonicalHookRan = true;
    writeFileSync(join(pluginCache, 'late-concurrent.txt'), 'preserve late canonical insertion\n');
  };
  let lateCanonicalError;
  try {
    await ensureMarketplacePlugin(hudSpec, lateCanonicalInsertionFixture.context);
    assert.fail('a late canonical insertion must reject ordinary rollback');
  } catch (error) {
    lateCanonicalError = error;
  }
  assert.equal(lateCanonicalError?.restorationIncomplete, true, 'a late canonical insertion must mark restoration incomplete');
  assert.equal(lateCanonicalHookRan, true, 'the late canonical insertion fixture must run after failed-tree inspection');
  const lateEvidencePaths = [lateCanonicalInsertionFixture.pluginCache, ...(lateCanonicalError?.evidencePaths || [])];
  assert.equal(
    lateEvidencePaths.some(path => path && existsSync(join(path, 'late-concurrent.txt'))),
    true,
    'a late canonical insertion must survive incomplete rollback',
  );

  const lateFrozenInsertionFixture = makeTransactionFixture('rollback-late-frozen-insertion', hudSpec, 'missing', {
    failStep: 'install',
    known: false,
  });
  let lateFrozenHookRan = false;
  lateFrozenInsertionFixture.context.onCacheFailedInspected = ({ failedPath }) => {
    lateFrozenHookRan = true;
    writeFileSync(join(failedPath, 'late-frozen.txt'), 'preserve late frozen insertion\n');
  };
  let lateFrozenError;
  try {
    await ensureMarketplacePlugin(hudSpec, lateFrozenInsertionFixture.context);
    assert.fail('a late frozen-tree insertion must reject ordinary rollback');
  } catch (error) {
    lateFrozenError = error;
  }
  assert.equal(lateFrozenError?.restorationIncomplete, true, 'a late frozen-tree insertion must mark restoration incomplete');
  assert.equal(lateFrozenHookRan, true, 'the late frozen-tree insertion fixture must run after inspection');
  assert.equal(
    (lateFrozenError?.evidencePaths || []).some(path => existsSync(join(path, 'late-frozen.txt'))),
    true,
    'a late frozen-tree insertion must survive incomplete rollback',
  );

  const enableFailureFixture = makeTransactionFixture('rollback-enable-verification', hudSpec, 'missing', {
    known: false,
    skipEnable: true,
    staleBaselineCache: true,
  });
  const enableFailureBefore = transactionSnapshot(enableFailureFixture);
  const enableFailureResult = await ensureMarketplacePlugin(hudSpec, enableFailureFixture.context);
  assert.equal(enableFailureResult.status, 'warning', 'a plugin left disabled by the CLI must fail verification');
  assert.equal(enableFailureResult.ready, false, 'a plugin left disabled by the CLI must not report readiness');
  assertTransactionSnapshot(enableFailureFixture, enableFailureBefore, 'enable verification failure must restore exact JSON modes/bytes and directory trees');

  for (const malformedAfter of ['installed', 'settings']) {
    const malformedAfterFixture = makeTransactionFixture(`rollback-malformed-after-${malformedAfter}`, hudSpec, 'missing', {
      known: false,
      malformedAfter,
      staleBaselineCache: true,
    });
    const malformedAfterBefore = transactionSnapshot(malformedAfterFixture);
    const malformedAfterResult = await ensureMarketplacePlugin(hudSpec, malformedAfterFixture.context);
    assert.equal(malformedAfterResult.status, 'warning', `malformed post-command ${malformedAfter} state must fail verification`);
    assert.equal(malformedAfterResult.ready, false, `malformed post-command ${malformedAfter} state must not report readiness`);
    assertTransactionSnapshot(malformedAfterFixture, malformedAfterBefore, `malformed post-command ${malformedAfter} state must roll back exact bytes, modes, and directory trees`);
  }

  const forbiddenCommands = ['git', 'node', 'npm', 'npx', 'curl', 'wget'];
  for (const fixture of [installFixture, updateFixture, superFixture]) {
    for (const entry of readCliLog(fixture)) {
      assert.equal(forbiddenCommands.some(command => entry.args.includes(command)), false, 'the transaction CLI must not invoke PATH tools or network commands');
    }
  }

  const linkedSourceFixture = makeTransactionFixture('linked-persistent-ancestor', hudSpec, 'missing', { known: false });
  const linkedOutside = join(linkedSourceFixture.root, 'outside-source');
  const linkedSourceParent = join(linkedSourceFixture.pluginRoot, 'clawgod-marketplaces');
  mkdirSync(linkedOutside);
  symlinkSync(linkedOutside, linkedSourceParent, process.platform === 'win32' ? 'junction' : 'dir');
  const linkedOutsideBefore = snapshotTree(linkedOutside);
  const linkedResult = await ensureMarketplacePlugin(hudSpec, linkedSourceFixture.context);
  assert.equal(linkedResult.status, 'warning', 'a linked persistent-source ancestor must fail closed');
  assert.deepEqual(snapshotTree(linkedOutside), linkedOutsideBefore, 'a linked persistent-source ancestor must receive no writes');
  assert.equal(existsSync(linkedSourceFixture.cliLog), false, 'a linked persistent-source ancestor must spawn no plugin CLI');

  const linkedSourceLeafFixture = makeTransactionFixture('linked-persistent-leaf', hudSpec, 'missing', { known: false });
  const linkedSourceLeafOutside = join(linkedSourceLeafFixture.root, 'outside-source-leaf');
  mkdirSync(dirname(linkedSourceLeafFixture.persistentSource), { recursive: true });
  mkdirSync(linkedSourceLeafOutside);
  writeFileSync(join(linkedSourceLeafOutside, 'outside-sentinel.txt'), 'do not replace or write through this link\n');
  symlinkSync(linkedSourceLeafOutside, linkedSourceLeafFixture.persistentSource, process.platform === 'win32' ? 'junction' : 'dir');
  const linkedSourceLeafBefore = transactionSnapshot(linkedSourceLeafFixture);
  const linkedSourceLeafOutsideBefore = snapshotTree(linkedSourceLeafOutside);
  const linkedSourceLeafResult = await ensureMarketplacePlugin(hudSpec, linkedSourceLeafFixture.context);
  assert.equal(linkedSourceLeafResult.status, 'warning', 'a linked persistent-source leaf must fail closed');
  assertTransactionSnapshot(linkedSourceLeafFixture, linkedSourceLeafBefore, 'a linked persistent-source leaf must remain byte-identical');
  assert.deepEqual(snapshotTree(linkedSourceLeafOutside), linkedSourceLeafOutsideBefore, 'a linked persistent-source leaf target must receive no writes');
  assert.equal(existsSync(linkedSourceLeafFixture.cliLog), false, 'a linked persistent-source leaf must spawn no plugin CLI');

  const stagedLeafFixture = makeTransactionFixture('linked-staged-leaf', hudSpec, 'missing', { known: false });
  const stagedParent = join(stagedLeafFixture.pluginRoot, 'clawgod-marketplaces', hudSpec.marketplace);
  const stagedOutside = join(stagedLeafFixture.root, 'outside-staged-leaf');
  mkdirSync(stagedParent, { recursive: true });
  mkdirSync(stagedOutside);
  const stagedLeaf = `${stagedLeafFixture.persistentSource}.${process.pid}.staged`;
  symlinkSync(stagedOutside, stagedLeaf, process.platform === 'win32' ? 'junction' : 'dir');
  const stagedOutsideBefore = snapshotTree(stagedOutside);
  const stagedLeafResult = await ensureMarketplacePlugin(hudSpec, stagedLeafFixture.context);
  assert.equal(stagedLeafResult.status, 'warning', 'a pre-existing staged source leaf must fail closed');
  assert.equal(lstatSync(stagedLeaf).isSymbolicLink(), true, 'the transaction must not unlink an unowned staged source leaf');
  assert.deepEqual(snapshotTree(stagedOutside), stagedOutsideBefore, 'a staged source link target must receive no writes');

  const persistentParentSwapFixture = makeTransactionFixture('persistent-parent-regular-swap', hudSpec, 'missing', {
    known: false,
    oldPersistent: true,
  });
  const persistentParent = dirname(persistentParentSwapFixture.persistentSource);
  const displacedPersistentParent = join(persistentParentSwapFixture.root, 'persistent-parent-displaced');
  persistentParentSwapFixture.context.onPersistentTransactionPrepared = transaction => {
    renameSync(transaction.parent, displacedPersistentParent);
    mkdirSync(transaction.parent, { recursive: true });
    writeFileSync(join(transaction.parent, 'replacement-sentinel.txt'), 'preserve replacement parent\n');
    mkdirSync(transaction.target);
    writeFileSync(join(transaction.target, 'replacement-target.txt'), 'force the staged rename to fail\n');
    symlinkSync(
      join(displacedPersistentParent, `${hudSpec.version}.${process.pid}.staged`),
      `${transaction.target}.${process.pid}.staged`,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  };
  await assert.rejects(
    ensureMarketplacePlugin(hudSpec, persistentParentSwapFixture.context),
    error => {
      assert.equal(error?.restorationIncomplete, true, 'a persistent parent replacement must retain the incomplete-restoration marker');
      assert.equal(error?.transaction?.hadExisting, true, 'a persistent parent replacement must retain its acquired rollback handle');
      assert.equal(error?.cause?.restorationIncomplete, true, 'cleanup must not replace the marked persistent restoration error');
      return true;
    },
    'a persistent parent replacement after backup acquisition must preserve the transaction handle and fail explicitly',
  );
  assert.equal(
    readFileSync(join(persistentParent, 'replacement-sentinel.txt'), 'utf8'),
    'preserve replacement parent\n',
    'rollback must preserve a regular replacement persistent parent',
  );
  assert.equal(existsSync(join(displacedPersistentParent, `${hudSpec.version}.${process.pid}.backup`)), true, 'the displaced persistent backup must remain as evidence');
  assert.equal(existsSync(join(displacedPersistentParent, `${hudSpec.version}.${process.pid}.staged`)), true, 'the displaced staged source must remain as evidence');

  const concurrentFixture = makeTransactionFixture('concurrent-marketplace-parent', hudSpec, 'older', {
    failStep: 'marketplace-add',
    oldPersistent: true,
    attackMarketplaceParent: true,
  });
  mkdirSync(concurrentFixture.context.env.FIXTURE_ATTACK_MARKETPLACE_OUTSIDE);
  writeFileSync(join(concurrentFixture.context.env.FIXTURE_ATTACK_MARKETPLACE_OUTSIDE, 'outside-sentinel.txt'), 'do not delete through replacement link\n');
  await assert.rejects(
    ensureMarketplacePlugin(hudSpec, concurrentFixture.context),
    error => error?.restorationIncomplete === true,
    'a concurrent marketplace-parent replacement must retain incomplete-restoration evidence',
  );
  assert.equal(readFileSync(join(concurrentFixture.context.env.FIXTURE_ATTACK_MARKETPLACE_OUTSIDE, 'outside-sentinel.txt'), 'utf8'), 'do not delete through replacement link\n', 'rollback must not recurse through a concurrently replaced parent');

  const regularMarketplaceParentFixture = makeTransactionFixture('regular-marketplace-parent-replacement', hudSpec, 'missing', {
    failStep: 'marketplace-add',
    known: false,
    replaceMarketplaceParentRegular: true,
  });
  const regularMarketplaceParent = join(regularMarketplaceParentFixture.pluginRoot, 'marketplaces');
  await assert.rejects(
    ensureMarketplacePlugin(hudSpec, regularMarketplaceParentFixture.context),
    error => error?.restorationIncomplete === true,
    'a regular replacement of a transaction-created marketplace parent must fail explicitly',
  );
  assert.equal(existsSync(regularMarketplaceParent), true, 'cleanup must not remove a regular replacement parent');
  assert.equal(
    existsSync(join(regularMarketplaceParentFixture.context.env.FIXTURE_REPLACE_MARKETPLACE_PARENT_BACKUP, hudSpec.marketplace)),
    true,
    'the displaced marketplace tree must remain as evidence',
  );

  const pluginRootSwapFixture = makeTransactionFixture('concurrent-plugin-root', hudSpec, 'older', {
    failStep: 'marketplace-add',
    oldPersistent: true,
    attackPluginRoot: true,
  });
  await assert.rejects(
    ensureMarketplacePlugin(hudSpec, pluginRootSwapFixture.context),
    error => error?.restorationIncomplete === true,
    'a concurrent plugin-root replacement must retain incomplete-restoration evidence',
  );
  assert.equal(
    readFileSync(join(pluginRootSwapFixture.context.env.FIXTURE_ATTACK_PLUGIN_ROOT_BACKUP, 'marketplaces', hudSpec.marketplace, 'outside-sentinel.txt'), 'utf8'),
    'do not delete through plugin-root replacement\n',
    'rollback must not recurse through a replaced plugin-root ancestor',
  );

  const concurrentSiblingFixture = makeTransactionFixture('concurrent-marketplace-sibling', hudSpec, 'missing', {
    failStep: 'marketplace-add',
    known: false,
    createMarketplaceSibling: true,
  });
  await assert.rejects(
    ensureMarketplacePlugin(hudSpec, concurrentSiblingFixture.context),
    error => error?.restorationIncomplete === true,
    'a concurrent entry in a transaction-created parent must retain incomplete-restoration evidence',
  );
  assert.equal(readFileSync(join(concurrentSiblingFixture.pluginRoot, 'marketplaces', 'concurrent-sibling.txt'), 'utf8'), 'preserve concurrent data\n', 'rollback must preserve an unrelated concurrent sibling');

  const cacheRootSwapFixture = makeTransactionFixture('concurrent-cache-root', hudSpec, 'missing', {
    known: false,
    attackCacheRoot: true,
  });
  await assert.rejects(
    ensureMarketplacePlugin(hudSpec, cacheRootSwapFixture.context),
    error => error?.restorationIncomplete === true,
    'a relocated cache root must not be accepted as a ready installation',
  );
  assert.equal(
    readFileSync(join(cacheRootSwapFixture.context.env.FIXTURE_ATTACK_CACHE_ROOT_BACKUP, 'outside-sentinel.txt'), 'utf8'),
    'do not trust relocated cache\n',
    'verification and rollback must not delete through a relocated cache root',
  );

  const cleanupWarningFixture = makeTransactionFixture('concurrent-cleanup-warning', hudSpec, 'older', {
    oldPersistent: true,
    attackMarketplaceParent: true,
  });
  mkdirSync(cleanupWarningFixture.context.env.FIXTURE_ATTACK_MARKETPLACE_OUTSIDE);
  writeFileSync(join(cleanupWarningFixture.context.env.FIXTURE_ATTACK_MARKETPLACE_OUTSIDE, 'outside-sentinel.txt'), 'do not delete through cleanup replacement link\n');
  const cleanupWarningResult = await ensureMarketplacePlugin(hudSpec, cleanupWarningFixture.context);
  assert.equal(cleanupWarningResult.status, 'warning', 'backup cleanup failure must be reported as a warning');
  assert.equal(cleanupWarningResult.ready, true, 'backup cleanup failure must not roll back a verified plugin');
  assert.equal(cleanupWarningResult.version, hudSpec.version, 'backup cleanup warning must retain the verified baseline version');
  assert.equal(readFileSync(join(cleanupWarningFixture.context.env.FIXTURE_ATTACK_MARKETPLACE_OUTSIDE, 'outside-sentinel.txt'), 'utf8'), 'do not delete through cleanup replacement link\n', 'cleanup must not recurse through a concurrently replaced parent');
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
