import { gate } from '../runtime-features.mjs';

const patches = [
  {
    order: 19,
    name: 'Ultraplan enable',
    // Undefined availability follows the upstream command-list's unrestricted
    // branch; false preserves the original availability value.
    pattern: /(name:"ultraplan",[\s\S]{1,500}?)(?:availability:(\[[^\]]*\]),)?(isEnabled:\(\)=>)(!1|[\w$]+\(\))/g,
    replacer: (match, prefix, availability, enabled, original) => availability
      ? `${prefix}availability:${gate('ultraplan')}?undefined:${availability},${enabled}${gate('ultraplan')}?!0:${original}`
      : `${prefix}${enabled}${gate('ultraplan')}?!0:${original}`,
    sentinel: 'name:"ultraplan"',
    appliedMarker: /name:"ultraplan",[\s\S]{1,500}?globalThis\.__clawgodPatches\?\.\["ultraplan"\]/,
  },
  {
    order: 20,
    name: 'Ultrareview enable (rQt gate)',
    pattern: /function ([\w$]+)\(\)\{return ([\w$]+)\(\)\?\.enabled===!0&&[\w$]+\(\)&&![\w$]+\(\)\}/g,
    replacer: (match, fn) => `function ${fn}(){return ${gate('ultrareview-gate')}?!0:(${match.slice(`function ${fn}(){return `.length, -1)})}`,
    optional: true,
    appliedMarker: '/*__clawgod_ultrareview_enabled__*/',
  },
  {
    order: 21,
    name: 'Ultrareview enable (direct literal, <=2.1.213)',
    pattern: /function ([\w$]+)\(\)\{return ([\w$]+)\("tengu_review_bughunter_config",null\)(\?\.enabled===!0)?\}/g,
    replacer: (match, fn, getter, hasGate) => hasGate
      ? `function ${fn}(){if(${gate('ultrareview-direct')})return!0;${match.slice(`function ${fn}(){`.length, -1)}}`
      : `function ${fn}(){let _r=${getter}("tengu_review_bughunter_config",null);return ${gate('ultrareview-direct')}?_r?{..._r,enabled:!0}:{enabled:!0}:_r}`,
    optional: true,
    sentinel: '("tengu_review_bughunter_config",null)',
    appliedMarker: /function [\w$]+\(\)\{(?:if\(globalThis\.__clawgodPatches\?\.\["ultrareview-direct"\]|let _r=[\w$]+\("tengu_review_bughunter_config",null\);return globalThis\.__clawgodPatches\?\.\["ultrareview-direct"\])/,
  },
  {
    order: 22,
    name: 'Ultrareview enable (v2.1.215+ gate)',
    pattern: /(function ([\w$]+)\(\)\{return [\w$]+\(ulu,null\)\})([\s\S]{0,1500}?)(function ([\w$]+)\(\)\{return \2\(\)\?\.enabled===!0&&[\w$]+\(\)&&![\w$]+\(\)\})/g,
    replacer: (match, getterDefinition, getter, between, gateDefinition, gateFn) =>
      `${getterDefinition}${between}function ${gateFn}(){return ${gate('ultrareview-gate')}?!0:(${gateDefinition.slice(`function ${gateFn}(){return `.length, -1)})}`,
    sentinel: 'var ulu="tengu_review_bughunter_config"',
    appliedMarker: /function [\w$]+\(\)\{return globalThis\.__clawgodPatches\?\.\["ultrareview-gate"\]/,
  },
];

export const planningRegistry = Object.freeze({
  id: 'planning',
  patches: Object.freeze(patches),
  customPatches: Object.freeze([]),
});
