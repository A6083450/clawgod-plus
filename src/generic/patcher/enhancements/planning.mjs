const patches = [
  {
    order: 19,
    name: 'Ultraplan enable',
    pattern: /(name:"ultraplan",[\s\S]{1,500}?argumentHint:"<prompt>",isEnabled:\(\)=>)(?:!1|[\w$]+\(\))/g,
    replacer: (match, prefix) => `${prefix}!0`,
    sentinel: 'name:"ultraplan"',
    appliedMarker: 'argumentHint:"<prompt>",isEnabled:()=>!0',
  },
  {
    order: 20,
    name: 'Ultrareview enable (rQt gate)',
    pattern: /function ([\w$]+)\(\)\{return ([\w$]+)\(\)\?\.enabled===!0&&[\w$]+\(\)&&![\w$]+\(\)\}/g,
    replacer: (match, fn) => `function ${fn}(){/*__clawgod_ultrareview_enabled__*/return!0}`,
    optional: true,
    appliedMarker: '/*__clawgod_ultrareview_enabled__*/',
  },
  {
    order: 21,
    name: 'Ultrareview enable (direct literal, <=2.1.213)',
    pattern: /function ([\w$]+)\(\)\{return ([\w$]+)\("tengu_review_bughunter_config",null\)(\?\.enabled===!0)?\}/g,
    replacer: (match, fn, getter, gate) => gate
      ? `function ${fn}(){return!0}`
      : `function ${fn}(){let _r=${getter}("tengu_review_bughunter_config",null);return _r?{..._r,enabled:!0}:{enabled:!0}}`,
    optional: true,
    sentinel: '("tengu_review_bughunter_config",null)',
    appliedMarker: ',enabled:!0}:{enabled:!0}}',
  },
  {
    order: 22,
    name: 'Ultrareview enable (v2.1.215+ gate)',
    pattern: /(function ([\w$]+)\(\)\{return [\w$]+\(ulu,null\)\})([\s\S]{0,1500}?)(function ([\w$]+)\(\)\{return \2\(\)\?\.enabled===!0&&[\w$]+\(\)&&![\w$]+\(\)\})/g,
    replacer: (match, getterDefinition, getter, between, gateDefinition, gate) =>
      `${getterDefinition}${between}function ${gate}(){/*__clawgod_ultrareview_enabled__*/return!0}`,
    sentinel: 'var ulu="tengu_review_bughunter_config"',
    appliedMarker: '/*__clawgod_ultrareview_enabled__*/',
  },
];

export const planningRegistry = Object.freeze({
  id: 'planning',
  patches: Object.freeze(patches),
  customPatches: Object.freeze([]),
});
