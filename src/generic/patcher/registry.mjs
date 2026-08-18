import enhancementManifestSource from '../enhancements.json' with { type: 'text' };
import { loadEnhancementManifest } from '../enhancement-config.mjs';
import { coreRegistry } from './core.mjs';
import { createAgentsRegistry } from './enhancements/agents.mjs';
import { autoModeRegistry } from './enhancements/auto-mode.mjs';
import { brandingRegistry } from './enhancements/branding.mjs';
import { chromeRegistry } from './enhancements/chrome.mjs';
import { computerUseRegistry } from './enhancements/computer-use.mjs';
import { designCanvasRegistry } from './enhancements/design-canvas.mjs';
import { pasteImagesRegistry } from './enhancements/paste-images.mjs';
import { planningRegistry } from './enhancements/planning.mjs';
import { privacyRegistry } from './enhancements/privacy.mjs';
import { unrestrictedToolsRegistry } from './enhancements/unrestricted-tools.mjs';
import { voiceRegistry } from './enhancements/voice.mjs';

export const enhancementManifest = loadEnhancementManifest(enhancementManifestSource, { filename: 'enhancements.json' });

const patchIds = enhancementManifest
  .filter(entry => entry.kind === 'patch')
  .map(entry => entry.id);

const registryById = new Map([
  [chromeRegistry.id, chromeRegistry],
  [computerUseRegistry.id, computerUseRegistry],
  [designCanvasRegistry.id, designCanvasRegistry],
  [planningRegistry.id, planningRegistry],
  [voiceRegistry.id, voiceRegistry],
  [autoModeRegistry.id, autoModeRegistry],
  [unrestrictedToolsRegistry.id, unrestrictedToolsRegistry],
  [pasteImagesRegistry.id, pasteImagesRegistry],
  [privacyRegistry.id, privacyRegistry],
  [brandingRegistry.id, brandingRegistry],
]);

function enhancementRegistry(id, enabledIds) {
  if (id === 'agents') return createAgentsRegistry({ chromeEnabled: enabledIds.has('chrome') });
  const registry = registryById.get(id);
  if (!registry) throw new Error(`Missing patch registry for enhancement: ${id}`);
  return registry;
}

export const enhancementRegistries = Object.freeze(patchIds.map(id => enhancementRegistry(id, new Set(patchIds))));

export const patchRegistries = Object.freeze([coreRegistry, ...enhancementRegistries]);

const ownedDescriptors = patchRegistries.flatMap(registry => [
  ...registry.patches.map(descriptor => ({ descriptor, type: 'regex' })),
  ...registry.customPatches.map(descriptor => ({ descriptor, type: 'custom' })),
]);

const descriptorObjects = new Set();
const names = new Set();
const orders = new Set();
for (const { descriptor } of ownedDescriptors) {
  if (descriptorObjects.has(descriptor)) throw new Error(`Duplicate patch descriptor object: ${descriptor.name}`);
  if (names.has(descriptor.name)) throw new Error(`Duplicate patch descriptor name: ${descriptor.name}`);
  if (orders.has(descriptor.order)) throw new Error(`Duplicate patch descriptor order: ${descriptor.order}`);
  descriptorObjects.add(descriptor);
  names.add(descriptor.name);
  orders.add(descriptor.order);
}

function orderedDescriptors(type) {
  return Object.freeze(ownedDescriptors
    .filter(entry => entry.type === type)
    .map(entry => entry.descriptor)
    .sort((left, right) => left.order - right.order));
}

export const patches = orderedDescriptors('regex');
export const customPatches = orderedDescriptors('custom');

function orderedRegistryDescriptors(registry, type) {
  const descriptors = type === 'regex' ? registry.patches : registry.customPatches;
  return [...descriptors].sort((left, right) => left.order - right.order);
}

export function createPatchSelection(enabled) {
  if (!Array.isArray(enabled)) throw new TypeError('Enabled enhancements must be an array');
  const enabledIds = new Set(enabled);
  if (enabledIds.size !== enabled.length) throw new Error('Enabled enhancements must not contain duplicates');
  for (const id of enabledIds) {
    if (!enhancementManifest.some(entry => entry.id === id)) throw new Error(`Unknown enabled enhancement: ${id}`);
  }

  const selectedRegistries = patchIds
    .filter(id => enabledIds.has(id))
    .map(id => enhancementRegistry(id, enabledIds));
  const registries = [coreRegistry, ...selectedRegistries];
  return Object.freeze({
    patches: Object.freeze(registries.flatMap(registry => orderedRegistryDescriptors(registry, 'regex'))),
    customPatches: Object.freeze(registries.flatMap(registry => orderedRegistryDescriptors(registry, 'custom'))),
  });
}
