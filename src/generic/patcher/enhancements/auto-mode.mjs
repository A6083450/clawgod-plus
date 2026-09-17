import { gate } from '../runtime-features.mjs';

const patches = [
  {
    order: 26,
    name: 'Auto-mode unlock for third-party API (provider helper gate)',
    pattern: /if\(!([\w$]+)\(([\w$]+)\)\)return!1;(?=(?:(?!function\s).){0,300}!=="firstParty")/g,
    replacer: (match) => `if(${gate('auto-mode-helper-gate')}===!1&&` + match.slice(3, -10) + ')return!1;',
    optional: true,
  },
  {
    order: 27,
    name: 'Auto-mode unlock for third-party API (inline gate)',
    pattern: /if\(([\w$]+)!=="firstParty"&&(?:\1!=="anthropicAws"|![\w$]+\(\1\))[^;]*\)return!1;/g,
    replacer: (match) => `if(${gate('auto-mode-inline-gate')}===!1&&` + match.slice(3, -10) + ')return!1;',
    optional: true,
  },
  {
    order: 28,
    name: 'Auto-mode unlock for third-party API (provider opt-in helper)',
    pattern: /function ([\w$]+)\(([\w$]+)\)\{if\(\2==="firstParty"\|\|\2==="anthropicAws"\)return!0;return [\w$]+\(process\.env\.CLAUDE_CODE_ENABLE_AUTO_MODE\)\}/g,
    replacer: (match, fn, arg) => `function ${fn}(${arg}){if(${gate('auto-mode-provider-opt-in')})return!0;${match.slice(match.indexOf('{') + 1, -1)}}`,
    sentinel: 'process.env.CLAUDE_CODE_ENABLE_AUTO_MODE)}',
    appliedMarker: /function [\w$]+\([^)]*\)\{if\(globalThis\.__clawgodPatches\?\.\["auto-mode-provider-opt-in"\]/,
  },
  {
    order: 68,
    name: 'Auto-mode classifier timeout override (CLAWGOD_CLASSIFIER_TIMEOUT_MS)',
    pattern: /function ([\w$]+)\(([\w$]+)\)\{let ([\w$]+)=Math\.max\(0,Math\.ceil\(\(\2-50000\)\/50000\)\);return Math\.min\(([\w$]+),([\w$]+)\+\3\*1e4\)\}/g,
    replacer: (match, fn, arg, step, cap, base) => `function ${fn}(${arg}){let ${step}=Math.max(0,Math.ceil((${arg}-50000)/50000)),_r=Math.min(${cap},${base}+${step}*1e4),_ct=+process.env.CLAWGOD_CLASSIFIER_TIMEOUT_MS;return ${gate('classifier-timeout')}&&Number.isFinite(_ct)&&process.env.CLAWGOD_CLASSIFIER_TIMEOUT_MS.trim()!==""?Math.max(_r,_ct):_r}`,
    unique: true,
    optional: true,
  },
  {
    order: 69,
    name: 'Auto-mode classifier model override (CLAWGOD_CLASSIFIER_MODEL)',
    pattern: /function ([\w$]+)\(\)\{let [\w$]+=[\w$]+\(\),[\w$]+=[\w$]+\(.*?\),[\w$]+=[\w$]+\([\w$]+\?\.modelByMainModel,\{vet:/g,
    replacer: (match, fn) => `function ${fn}(){let _cm=process.env.CLAWGOD_CLASSIFIER_MODEL?.trim();if(_cm&&${gate('classifier-model')})return{value:_cm,src:"default"};` + match.slice(match.indexOf('{') + 1),
    unique: true,
    optional: true,
  },
  {
    order: 70,
    name: 'Auto-mode classifier retries override (CLAWGOD_CLASSIFIER_RETRIES)',
    pattern: /function ([\w$]+)\(\)\{let [\w$]+=[\w$]+\([^)]*\)\?\.maxRetries;return typeof [\w$]+==="number"&&Number\.isInteger\([\w$]+\)&&[\w$]+>=0\?\{value:[\w$]+,src:"gb"\}:\{value:([\w$]+),src:"default"\}\}/g,
    replacer: (match, fn) => `function ${fn}(){let _cr=process.env.CLAWGOD_CLASSIFIER_RETRIES?.trim();if(${gate('classifier-retries')}&&_cr!==undefined&&_cr!==""&&Number.isInteger(+_cr)&&+_cr>=0)return{value:+_cr,src:"default"};` + match.slice(match.indexOf('{') + 1),
    unique: true,
    optional: true,
  },
];

export const autoModeRegistry = Object.freeze({
  id: 'auto-mode',
  patches: Object.freeze(patches),
  customPatches: Object.freeze([]),
});
