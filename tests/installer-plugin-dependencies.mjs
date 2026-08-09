#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
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

const fixtureDir = mkdtempSync(join(tmpdir(), 'clawgod-plugin-deps-'));
try {
  const modulePath = join(fixtureDir, 'plugin-dependencies.mjs');
  await Bun.write(modulePath, unixModule);
  chmodSync(modulePath, 0o700);
  const pluginDependencies = await import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
  const {
    PLUGIN_BASELINES,
    classifyPlugin,
    compareSemver,
    parseSemver,
    selectInstalledRecord,
  } = pluginDependencies;

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
} finally {
  rmSync(fixtureDir, { recursive: true, force: true });
}

console.log('installer plugin dependency tests passed');
