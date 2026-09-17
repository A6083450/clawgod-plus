import { gate } from '../runtime-features.mjs';

const patches = [{
  order: 25,
  name: 'Voice Mode enable (bypass GrowthBook kill)',
  pattern: /function ([\w$]+)\(\)\{return![\w$]+\("tengu_amber_quartz_disabled",!1\)\}/g,
  replacer: (match, fn) => `function ${fn}(){return ${gate('voice-mode')}?!0:(${match.slice(`function ${fn}(){return`.length, -1)})}`,
  optional: true,
}];

export const voiceRegistry = Object.freeze({
  id: 'voice',
  patches: Object.freeze(patches),
  customPatches: Object.freeze([]),
});
