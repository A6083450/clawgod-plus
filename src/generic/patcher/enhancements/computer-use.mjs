import { gate } from '../runtime-features.mjs';

const patches = [
  {
    order: 17,
    name: 'Computer Use subscription bypass',
    pattern: /function ([\w$]+)\(\)\{let [\w$]+=[\w$]+\(\);return [\w$]+==="max"\|\|[\w$]+==="pro"\}/g,
    replacer: (match, fn) => `function ${fn}(){if(${gate('computer-use-sub')})return!0;${match.slice(`function ${fn}(){`.length, -1)}}`,
    appliedMarker: '/*__clawgod_computer_use_subscription__*/',
  },
  {
    order: 18,
    name: 'Computer Use default enabled',
    pattern: /([\w$]+=)\{enabled:!1,pixelValidation/g,
    replacer: (match, prefix) => `${prefix}{enabled:${gate('computer-use-default')}?!0:!1,pixelValidation`,
    sentinel: '{enabled:!1,pixelValidation',
  },
  {
    order: 23,
    name: 'Computer Use gate bypass',
    pattern: /function ([\w$]+)\(\)\{if\([\w$]+\("hipaa"\)\)return\s*!1;[^{}]*\}/g,
    replacer: (match, fn) => `function ${fn}(){if(${gate('computer-use-gate')})return!0;${match.slice(`function ${fn}(){`.length, -1)}}`,
    sentinel: '"hipaa"',
    appliedMarker: /function [\w$]+\(\)\{if\(globalThis\.__clawgodPatches\?\.\["computer-use-gate"\]/,
  },
  {
    order: 24,
    name: 'Computer Use in noninteractive sessions',
    pattern: /if\((?:([\w$]+)\(\)==="macos"&&)?!([\w$]+)\(\)((?:&&![\w$]+)?)&&([\w$]+)\(\)\)try\{let\{setupComputerUseMCP:/g,
    replacer: (match, platform, isNonInteractive, safetyCondition, gateFn) => {
      const retainedConditions = [
        platform ? `${platform}()==="macos"` : '',
        safetyCondition.replace(/^&&/, ''),
        `${gateFn}()`,
      ].filter(Boolean).join('&&');
      return `if(${retainedConditions})/*__clawgod_computer_use_noninteractive__*/try{let{setupComputerUseMCP:`;
    },
    sentinel: 'setupComputerUseMCP',
    appliedMarker: '/*__clawgod_computer_use_noninteractive__*/',
  },
];

export const computerUseRegistry = Object.freeze({
  id: 'computer-use',
  patches: Object.freeze(patches),
  customPatches: Object.freeze([]),
});
