#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnhancementManifest, parseExplicitEnhancementSelection, parseStoredEnhancementConfig, readEnhancementConfig, resolveEnhancementSelection, serializeEnhancementConfig, validateStoredEnhancementConfig, writeEnhancementConfig } from '../src/generic/enhancement-config.mjs';
import { PLUGIN_BASELINES, PLUGIN_ENHANCEMENT_IDS } from '../src/generic/runtime/plugin-dependencies.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = loadEnhancementManifest(readFileSync(join(root, 'src/generic/enhancements.json'), 'utf8'));
const ids = manifest.filter(entry => entry.id !== 'superpowers').map(entry => entry.id);
const canonical = value => JSON.stringify(value, null, 2) + '\n';
const custom = enabled => ({ schemaVersion: 1, mode: 'custom', enabled });
const all = { schemaVersion: 1, mode: 'all', enabled: [] };

assert.deepEqual(Object.keys(PLUGIN_BASELINES), ['hud', 'memory'], 'only HUD and memory remain managed baselines');
assert.deepEqual(PLUGIN_ENHANCEMENT_IDS, { hud: 'claude-hud', memory: 'claude-mem' });
assert.equal(manifest.length, 22, 'removing Superpowers must retain Code Mode, local Ship, and the other twenty enhancements');
assert.equal(manifest.some(entry => entry.id === 'superpowers'), false);
assert.equal(ids.includes('code-mode'), true);
assert.doesNotMatch(readFileSync(join(root, 'src/generic/runtime/plugin-dependencies.mjs'), 'utf8'), /superpowers|archiveMarketplace/i, 'the plugin runtime must have no retired baseline, wrapper, source alias or management branch');
for (const document of ['README.md', 'README_EN.md', 'README_JP.md', 'AGENTS.md']) {
  const content = readFileSync(join(root, document), 'utf8');
  assert.doesNotMatch(content, /superpowers/i, document + ' must only advertise supported managed plugins');
  for (const id of ids) assert.ok(content.includes('`' + id + '`'), document + ' must preserve the current manifest ID ' + id);
}
for (const platform of ['src/unix/lifecycle.sh', 'src/windows/lifecycle.ps1']) {
  assert.doesNotMatch(readFileSync(join(root, platform), 'utf8'), /superpowers/i, platform + ' must not advertise Superpowers');
}
assert.deepEqual(resolveEnhancementSelection({}, manifest), { mode: 'all', enabled: ids });

const migrations = [
  ['retired ID only', custom(['superpowers']), custom([])],
  ['mixed selection', custom(['chrome', 'code-mode', 'claude-mem', 'superpowers']), custom(['chrome', 'code-mode', 'claude-mem'])],
  ['all mode', all, all],
  ['legacy custom covers every remaining ID', custom(ids), all],
];
for (const [label, stored, expected] of migrations) {
  assert.deepEqual(parseStoredEnhancementConfig(canonical(stored), manifest), expected, label);
  assert.deepEqual(parseStoredEnhancementConfig(Buffer.from(canonical(stored)), manifest), expected, label + ' UTF-8 bytes');
  const selected = resolveEnhancementSelection({ stored: expected }, manifest);
  assert.equal(selected.enabled.includes('superpowers'), false, label + ' must not resolve the retired ID');
}
for (const enabled of [['superpowers', 'superpowers'], ['chrome', 'superpowers', 'superpowers'], ['superpowers', 'unknown'], ['unknown'], ['../superpowers']]) {
  assert.throws(() => parseStoredEnhancementConfig(canonical(custom(enabled)), manifest), /duplicate|unknown|unsafe/i);
}
for (const value of [
  { ...custom(['superpowers']), schemaVersion: 2 },
  { ...custom(['superpowers']), schemaVersion: '1' },
  { ...custom(['superpowers']), extra: true },
  { schemaVersion: 1, mode: 'custom' },
  { ...all, enabled: ['superpowers'] },
  { ...custom(['superpowers']), mode: 'invalid' },
  custom('superpowers'), custom([1]), custom([...ids, 'superpowers']),
]) assert.throws(() => parseStoredEnhancementConfig(canonical(value), manifest), /schemaVersion|key|enabled|mode|array|string|complete/i);
const retiredOnly = custom(['superpowers']);
for (const bytes of [
  JSON.stringify(retiredOnly), canonical(retiredOnly).trimEnd(), canonical(retiredOnly).replaceAll('\n', '\r\n'),
  canonical({ mode: 'custom', schemaVersion: 1, enabled: ['superpowers'] }),
  canonical(custom(['superpowers', 'chrome'])), canonical(custom(['branding', 'chrome', 'superpowers'])),
  canonical(retiredOnly).replace('"schemaVersion": 1,', '"schemaVersion": 1,\n  "schemaVersion": 1,'),
  canonical(retiredOnly).replace('superpowers', '\\u0073uperpowers'), '{',
]) assert.throws(() => parseStoredEnhancementConfig(bytes, manifest), /non-canonical|invalid.*JSON/i, 'invalid legacy bytes must not be repaired before validation');
for (const csv of ['superpowers', 'chrome,superpowers', 'superpowers,superpowers', 'none,superpowers']) {
  assert.throws(() => parseExplicitEnhancementSelection(csv, manifest), /unknown|duplicate/i, 'new explicit CSV stays strict');
}
assert.throws(() => validateStoredEnhancementConfig(retiredOnly, manifest), /unknown.*superpowers/i, 'object validation is not a migration path');
assert.throws(() => serializeEnhancementConfig(retiredOnly, manifest), /unknown.*superpowers/i);
assert.throws(() => resolveEnhancementSelection({ stored: retiredOnly }, manifest), /unknown.*superpowers/i);
assert.throws(() => validateStoredEnhancementConfig(custom(ids), manifest), /complete.*all/i, 'strict object validation must still reject complete custom selections');
const futureManifest = [...manifest, { id: 'future-tool', kind: 'patch' }];
const historicalFullCustom = canonical(custom(ids));
assert.deepEqual(parseStoredEnhancementConfig(historicalFullCustom, futureManifest), custom(ids), 'the original saved fixed selection stays custom when a future enhancement is added');
const futureSelection = resolveEnhancementSelection({ stored: parseStoredEnhancementConfig(historicalFullCustom, futureManifest) }, futureManifest);
assert.equal(futureSelection.enabled.includes('future-tool'), false, 'a saved fixed selection must never opt into a future enhancement');
const historicalMixed = canonical(custom(['chrome', 'code-mode', 'claude-mem', 'superpowers']));
assert.deepEqual(parseStoredEnhancementConfig(historicalMixed, futureManifest), custom(['chrome', 'code-mode', 'claude-mem']), 'future manifest additions must preserve original canonical ordering for retired mixed selections');
assert.equal(resolveEnhancementSelection({ stored: parseStoredEnhancementConfig(historicalMixed, futureManifest) }, futureManifest).enabled.includes('future-tool'), false);
assert.throws(() => parseStoredEnhancementConfig(canonical(custom(['superpowers', 'chrome'])), futureManifest), /non-canonical/i, 'future manifests must not repair a historical retired-ID order violation');

const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'clawgod-remove-superpowers-')));
function tree(path) {
  const status = lstatSync(path);
  assert.equal(status.isSymbolicLink(), false);
  return status.isDirectory()
    ? { mode: status.mode & 0o777, entries: Object.fromEntries(readdirSync(path).sort().map(name => [name, tree(join(path, name))])) }
    : { mode: status.mode & 0o777, bytes: readFileSync(path).toString('base64') };
}
try {
  const home = join(temporary, 'persisted-home');
  const clawgod = join(home, '.clawgod');
  mkdirSync(clawgod, { recursive: true, mode: 0o700 });
  chmodSync(clawgod, 0o700);
  for (const [label, stored, expected] of migrations) {
    const path = join(clawgod, 'enhancements.json');
    writeFileSync(path, canonical(stored), { mode: 0o600 });
    chmodSync(path, 0o600);
    const beforeRead = lstatSync(path);
    const read = await readEnhancementConfig({ homeDir: home, manifest });
    assert.deepEqual(read, expected, label + ' migrates through the real private file reader');
    assert.equal(readFileSync(path, 'utf8'), canonical(stored), 'reading must not mutate persisted bytes');
    const afterRead = lstatSync(path);
    assert.deepEqual({ dev: afterRead.dev, ino: afterRead.ino, mode: afterRead.mode }, { dev: beforeRead.dev, ino: beforeRead.ino, mode: beforeRead.mode }, 'reading legacy selections must preserve file identity and mode');
    await writeEnhancementConfig({ homeDir: home, manifest, selection: read });
    assert.equal(readFileSync(path, 'utf8'), canonical(expected), 'normal write persists only current canonical IDs');
  }
  for (const [index, stored] of [undefined, custom([]), ...migrations.map(([, value]) => value)].entries()) {
    const fixtureHome = join(temporary, 'ensure-' + index);
    const config = join(fixtureHome, '.claude');
    const managed = join(fixtureHome, '.clawgod');
    const plugins = join(config, 'plugins');
    mkdirSync(managed, { recursive: true, mode: 0o700 });
    const records = {};
    const marketplaces = {};
    const enabledPlugins = {};
    for (const marketplace of ['superpowers-marketplace', 'claude-plugins-official']) {
      const id = 'superpowers@' + marketplace;
      const installPath = join(plugins, 'cache', marketplace, 'superpowers', '99.0.0');
      const source = join(plugins, 'clawgod-marketplaces', marketplace, '6.2.0');
      mkdirSync(installPath, { recursive: true });
      mkdirSync(source, { recursive: true });
      writeFileSync(join(installPath, 'user-data.txt'), 'retain installed ' + id + '\n');
      writeFileSync(join(source, 'user-source.txt'), 'retain marketplace ' + id + '\n');
      records[id] = [{ scope: 'user', version: '99.0.0', installPath, metadata: { keep: true } }];
      marketplaces[marketplace] = { installLocation: source, source: { source: 'directory', path: source } };
      enabledPlugins[id] = marketplace === 'superpowers-marketplace';
    }
    writeFileSync(join(plugins, 'installed_plugins.json'), canonical({ version: 2, plugins: records }));
    writeFileSync(join(plugins, 'known_marketplaces.json'), canonical(marketplaces));
    writeFileSync(join(config, 'settings.json'), canonical({ enabledPlugins, custom: 'preserve user settings' }));
    const before = tree(config);
    copyFileSync(join(root, 'src/generic/enhancement-config.mjs'), join(managed, 'enhancement-config.mjs'));
    copyFileSync(join(root, 'src/generic/enhancements.json'), join(managed, 'enhancement-manifest.json'));
    if (stored) writeFileSync(join(managed, 'enhancements.json'), canonical(stored));
    const fetchLog = join(managed, 'fetch.jsonl');
    writeFileSync(join(managed, 'fetch-file.mjs'), "import { appendFileSync } from 'node:fs'; appendFileSync(process.env.FETCH_LOG, JSON.stringify(process.argv[2]) + '\\n'); process.exit(23);\n");
    writeFileSync(join(managed, 'cli.original.cjs'), "throw new Error('plugin CLI must not run for retained Superpowers');\n");
    const result = Bun.spawnSync({
      cmd: [process.execPath, join(root, 'src/generic/runtime/plugin-dependencies.mjs'), 'ensure'],
      env: { HOME: fixtureHome, USERPROFILE: fixtureHome, CLAUDE_CONFIG_DIR: config, CLAWGOD_DIR: managed, CLAWGOD_BUN_BIN: process.execPath, FETCH_LOG: fetchLog, PATH: '' },
      stdout: 'pipe', stderr: 'pipe',
    });
    const output = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
    assert.equal(result.exitCode, 0, output);
    assert.doesNotMatch(output, /superpowers|plugin-selection: warning/i, 'ensure must not manage retired IDs or reject canonical legacy storage');
    assert.deepEqual(tree(config), before, 'ensure must retain both Superpowers installations, marketplace records and settings byte-for-byte');
    const downloads = existsSync(fetchLog) ? readFileSync(fetchLog, 'utf8') : '';
    assert.doesNotMatch(downloads, /superpowers|obra/i, 'ensure must never download Superpowers');
    if (stored?.mode === 'custom' && stored.enabled.every(id => id === 'superpowers')) {
      assert.equal(downloads, '', 'retired-only and none selections must download no optional plugins');
    } else {
      assert.match(downloads, /thedotmack\/claude-mem/, 'retained plugin selection must still reach the isolated downloader');
    }
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
console.log('remove Superpowers regression tests passed');
