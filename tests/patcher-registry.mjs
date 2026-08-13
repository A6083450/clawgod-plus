#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const expectedManifest = [
  { id: 'chrome', kind: 'patch' },
  { id: 'computer-use', kind: 'patch' },
  { id: 'agents', kind: 'patch' },
  { id: 'planning', kind: 'patch' },
  { id: 'voice', kind: 'patch' },
  { id: 'auto-mode', kind: 'patch' },
  { id: 'unrestricted-tools', kind: 'patch' },
  { id: 'paste-images', kind: 'patch' },
  { id: 'privacy', kind: 'patch' },
  { id: 'branding', kind: 'patch' },
  { id: 'claude-hud', kind: 'plugin' },
  { id: 'claude-mem', kind: 'plugin' },
  { id: 'superpowers', kind: 'plugin' },
];

const expectedTask5Source = {
  commit: 'MERGE-COMMIT-PLACEHOLDER',
  path: 'src/generic/patcher/registry.mjs',
  fileSha256: 'e624b24032aa99624231a10cc56bb7b9d5f44c1ecaa9815d9466fc9bae44d856',
  descriptorBlockLines: '45-60',
  descriptorBlockSha256: '2754fdecbeb01066e37bd038bea71004e1ac6e43a29bb5a24dd3ae0d2b6003fa',
};

const task5Snapshot = JSON.parse(readFileSync(
  new URL('./fixtures/patcher-task-5-metadata.json', import.meta.url),
  'utf8',
));
assert.deepEqual(task5Snapshot.source, expectedTask5Source, 'Task 5 metadata must retain its independent source provenance');

const expectedRegexOrder = [
  'USER_TYPE → ant',
  'Worker resolver for plain Bun cli.cjs (target shape)',
  'Worker resolver for plain Bun cli.cjs (legacy shape)',
  'GrowthBook env overrides',
  'GrowthBook config overrides',
  'Agent Teams always enabled',
  'Agents view session metadata',
  'Default Agents view with auto Chrome',
  'Chat Agent list fits terminal height',
  'Chat Agent list keeps overflow indicator',
  'Agents directories default collapsed state',
  'Agents directories default collapsed rows',
  'Claude in Chrome OAuth scope bypass',
  'Claude in Chrome agents config state',
  'Claude in Chrome agents flag parser',
  'Claude in Chrome agents config resolver',
  'Claude in Chrome agents dispatch args',
  'Computer Use subscription bypass',
  'Computer Use default enabled',
  'Ultraplan enable',
  'Ultrareview enable (rQt gate)',
  'Ultrareview enable (direct literal, <=2.1.213)',
  'Ultrareview enable (v2.1.215+ gate)',
  'Computer Use gate bypass',
  'Computer Use in noninteractive sessions',
  'Voice Mode enable (bypass GrowthBook kill)',
  'Auto-mode unlock for third-party API (provider helper gate)',
  'Auto-mode unlock for third-party API (inline gate)',
  'Auto-mode unlock for third-party API (provider opt-in helper)',
  'Redirect `claude update` to clawgod self-update',
  'Logo + brand color → green (RGB dark)',
  'Logo + brand color → green (ANSI)',
  'Theme claude color → green (dark)',
  'Theme claude color → green (light)',
  'Shimmer → green',
  'Shimmer light → green',
  'Hex brand color → green',
  'Theme claude color → green (ANSI)',
  'Shimmer → green (ANSI)',
  'Brief label claude color → green (RGB dark)',
  'Brief label claude color → green (RGB light)',
  'Brief label claude color → green (ANSI)',
  'macOS Cmd+V image paste fallback to clipboard read',
  'Image paste: try native image processor regardless of standalone gate',
  'Image paste: recognize TIFF paths for macOS clipboard fallback',
  'Image paste: keep HTTP image URLs as text',
  'Restore Glob/Grep tools (un-inline EMBEDDED_SEARCH_TOOLS)',
  'Neutralize geo-steganography in date string (qla)',
  'Neutralize geo-detection probe (rdp)',
  'Neutralize apostrophe steganography (odp)',
  'Remove CYBER_RISK_INSTRUCTION',
  'Remove URL generation restriction',
  'Remove cautious actions section',
  'Remove "Not logged in" notice',
  'Attachment filter bypass',
  'Message list filter bypass (legacy ternary)',
  'Message list filter bypass (s_8 form)',
  'Shell integration → claude.orig (multitool dispatch fix)',
  'Fast mode model label reflects provider model',
];

const manifest = JSON.parse(readFileSync(new URL('../src/generic/enhancements.json', import.meta.url), 'utf8'));
assert.deepEqual(manifest, expectedManifest, 'enhancement manifest shape and order are a stable installer contract');

const {
  customPatches,
  enhancementRegistries,
  patches,
  patchRegistries,
} = await import('../src/generic/patcher/registry.mjs');
const { createAgentsRegistry } = await import('../src/generic/patcher/enhancements/agents.mjs');
const { inspectPatcherSource } = await import('../src/generic/patcher/core.mjs');

assert.deepEqual(
  enhancementRegistries.map(registry => registry.id),
  expectedManifest.filter(entry => entry.kind === 'patch').map(entry => entry.id),
  'default-all enhancement registries must follow manifest order',
);
assert.deepEqual(
  manifest.filter(entry => entry.kind === 'plugin').map(entry => entry.id),
  ['claude-hud', 'claude-mem', 'superpowers'],
  'plugin-only enhancements remain manifest entries without patch registries',
);
assert.equal(patchRegistries[0].id, 'core', 'core registry must remain independent of enhancement selection');

const ownedDescriptors = patchRegistries.flatMap(registry => [
  ...registry.patches.map(descriptor => ({ descriptor, owner: registry.id })),
  ...registry.customPatches.map(descriptor => ({ descriptor, owner: registry.id })),
]);
assert.equal(ownedDescriptors.length, 64, 'every regex and custom patch descriptor must retain exactly one owner');
assert.equal(
  new Set(ownedDescriptors.map(({ descriptor }) => descriptor)).size,
  ownedDescriptors.length,
  'the same descriptor object must not be registered under multiple owners',
);
assert.equal(
  new Set(ownedDescriptors.map(({ descriptor }) => descriptor.name)).size,
  ownedDescriptors.length,
  'descriptor names must identify exactly one registry owner',
);

const canonicalDescriptors = ownedDescriptors
  .map(({ descriptor, owner }) => ({
    descriptor,
    owner,
    type: typeof descriptor.apply === 'function' ? 'custom' : 'regex',
  }))
  .sort((left, right) => left.descriptor.order - right.descriptor.order);
assert.deepEqual(
  canonicalDescriptors.map(({ descriptor, type }) => ({ name: descriptor.name, type, order: descriptor.order })),
  task5Snapshot.descriptors.map(({ name, type, order }) => ({ name, type, order })),
  'all 64 descriptor names, types, and exact global order values must remain at the merged baseline',
);

function normalizeMetadataValue(value) {
  if (value === undefined) return { $type: 'undefined' };
  if (value instanceof RegExp) return { $type: 'regexp', source: value.source, flags: value.flags };
  return value;
}

function assertTask5RegexMetadata(descriptor, expected) {
  const actual = {
    patternSource: descriptor.pattern.source,
    patternFlags: descriptor.pattern.flags,
    sentinel: normalizeMetadataValue(descriptor.sentinel),
    appliedMarker: normalizeMetadataValue(descriptor.appliedMarker),
    knownShape: normalizeMetadataValue(descriptor.knownShape),
    optional: normalizeMetadataValue(descriptor.optional),
    unique: normalizeMetadataValue(descriptor.unique),
    selectIndex: normalizeMetadataValue(descriptor.selectIndex),
  };
  for (const field of Object.keys(expected.metadata)) {
    assert.deepEqual(actual[field], expected.metadata[field], `${expected.name} ${field} must match Task 5`);
  }
}

for (const expected of task5Snapshot.descriptors.filter(descriptor => descriptor.type === 'regex')) {
  const actual = canonicalDescriptors.find(({ descriptor }) => descriptor.name === expected.name)?.descriptor;
  assert.ok(actual, `missing Task 5 descriptor: ${expected.name}`);
  assertTask5RegexMetadata(actual, expected);
}

const firstExpected = task5Snapshot.descriptors[0];
const firstActual = canonicalDescriptors[0].descriptor;
assert.throws(
  () => assertTask5RegexMetadata(
    { ...firstActual, pattern: /function ([\w$]+)\(\)\{return"(?:external|outside)"\}/g },
    firstExpected,
  ),
  /USER_TYPE.*patternSource.*Task 5/,
  'the metadata gate must reject a controlled regex mutation that the former name/order gate accepted',
);

assert.deepEqual(patches.map(descriptor => descriptor.name), expectedRegexOrder, 'default-all regex order must remain canonical');
assert.deepEqual(
  customPatches.map(descriptor => descriptor.name),
  ['Claude in Chrome local socket fallback', 'Context limit configurable', 'Fast Messages protocol', 'Fast mode org check bypass', 'Claude API skill lazy docs'],
  'custom patches must retain their canonical post-regex order',
);

const expectedCore = [
  'USER_TYPE → ant',
  'Worker resolver for plain Bun cli.cjs (target shape)',
  'Worker resolver for plain Bun cli.cjs (legacy shape)',
  'GrowthBook env overrides',
  'GrowthBook config overrides',
  'Redirect `claude update` to clawgod self-update',
  'Shell integration → claude.orig (multitool dispatch fix)',
  'Fast mode model label reflects provider model',
  'Context limit configurable',
  'Fast Messages protocol',
  'Fast mode org check bypass',
  'Claude API skill lazy docs',
];
const core = patchRegistries.find(registry => registry.id === 'core');
assert.deepEqual(
  [...core.patches, ...core.customPatches].map(descriptor => descriptor.name),
  expectedCore,
  'core must own identity, worker, GrowthBook, update, shell, and context patches',
);
assert.deepEqual(
  inspectPatcherSource('/* Version: 2.1.226 */\nsource'),
  { size: 29, version: '2.1.226' },
  'core must retain source sizing and version inspection for the patch execution flow',
);

const agentsWithoutChrome = createAgentsRegistry({ chromeEnabled: false });
assert.doesNotMatch(
  agentsWithoutChrome.patches.map(descriptor => descriptor.name).join('\n'),
  /Default Agents view with auto Chrome/,
  'agents must not expose its default Agents view when Chrome is disabled',
);
const agentsWithChrome = createAgentsRegistry({ chromeEnabled: true });
assert.match(
  agentsWithChrome.patches.map(descriptor => descriptor.name).join('\n'),
  /Default Agents view with auto Chrome/,
  'default-all must expose the default Agents view because Chrome is enabled',
);

const duplicateOrderRoot = mkdtempSync(join(tmpdir(), 'clawgod-registry-duplicate-order-'));
try {
  const genericSource = fileURLToPath(new URL('../src/generic', import.meta.url));
  const genericFixture = join(duplicateOrderRoot, 'src', 'generic');
  cpSync(genericSource, genericFixture, { recursive: true });
  const corePath = join(genericFixture, 'patcher', 'core.mjs');
  const coreSource = readFileSync(corePath, 'utf8');
  const mutatedCore = coreSource.replace(
    "const customPatches = [{\n  order: 61,\n  name: 'Context limit configurable',",
    "const customPatches = [{\n  order: 0,\n  name: 'Context limit configurable',",
  );
  assert.notEqual(mutatedCore, coreSource, 'cross-type duplicate-order fixture must mutate the custom descriptor');
  writeFileSync(corePath, mutatedCore, 'utf8');
  await assert.rejects(
    import(`${pathToFileURL(join(genericFixture, 'patcher', 'registry.mjs')).href}?duplicate-order`),
    /Duplicate patch descriptor order: 0/,
    'a custom descriptor must not reuse a regex descriptor order',
  );
} finally {
  rmSync(duplicateOrderRoot, { recursive: true, force: true });
}

console.log('patcher registry checks passed');
