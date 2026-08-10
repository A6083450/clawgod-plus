const patches = [{
  order: 25,
  name: 'Voice Mode enable (bypass GrowthBook kill)',
  pattern: /function ([\w$]+)\(\)\{return![\w$]+\("tengu_amber_quartz_disabled",!1\)\}/g,
  replacer: (match, fn) => `function ${fn}(){return!0}`,
  optional: true,
}];

export const voiceRegistry = Object.freeze({
  id: 'voice',
  patches: Object.freeze(patches),
  customPatches: Object.freeze([]),
});
