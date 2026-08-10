import enhancementManifest from '../enhancements.json' with { type: 'json' };
import { coreRegistry } from './core.mjs';
import { createAgentsRegistry } from './enhancements/agents.mjs';
import { autoModeRegistry } from './enhancements/auto-mode.mjs';
import { brandingRegistry } from './enhancements/branding.mjs';
import { chromeRegistry } from './enhancements/chrome.mjs';
import { computerUseRegistry } from './enhancements/computer-use.mjs';
import { pasteImagesRegistry } from './enhancements/paste-images.mjs';
import { planningRegistry } from './enhancements/planning.mjs';
import { privacyRegistry } from './enhancements/privacy.mjs';
import { unrestrictedToolsRegistry } from './enhancements/unrestricted-tools.mjs';
import { voiceRegistry } from './enhancements/voice.mjs';

const patchIds = enhancementManifest
  .filter(entry => entry.kind === 'patch')
  .map(entry => entry.id);

const registryById = new Map([
  [chromeRegistry.id, chromeRegistry],
  [computerUseRegistry.id, computerUseRegistry],
  ['agents', createAgentsRegistry({ chromeEnabled: patchIds.includes('chrome') })],
  [planningRegistry.id, planningRegistry],
  [voiceRegistry.id, voiceRegistry],
  [autoModeRegistry.id, autoModeRegistry],
  [unrestrictedToolsRegistry.id, unrestrictedToolsRegistry],
  [pasteImagesRegistry.id, pasteImagesRegistry],
  [privacyRegistry.id, privacyRegistry],
  [brandingRegistry.id, brandingRegistry],
]);

export const enhancementRegistries = Object.freeze(patchIds.map((id) => {
  const registry = registryById.get(id);
  if (!registry) throw new Error(`Missing patch registry for enhancement: ${id}`);
  return registry;
}));

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
