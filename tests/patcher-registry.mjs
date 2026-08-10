#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
assert.equal(ownedDescriptors.length, 60, 'all 58 regex and two custom Task 5 patches must retain one owner');
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
assert.deepEqual(patches.map(descriptor => descriptor.name), expectedRegexOrder, 'default-all regex order must remain canonical');
assert.deepEqual(
  customPatches.map(descriptor => descriptor.name),
  ['Context limit configurable', 'Claude in Chrome local socket fallback'],
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
  'Context limit configurable',
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

console.log('patcher registry checks passed');
