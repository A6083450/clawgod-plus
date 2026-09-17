import { gate } from '../runtime-features.mjs';

const patches = [
  {
    order: 30,
    name: 'Logo + brand color → green (RGB dark)',
    pattern: /(clawd_body:)"rgb\(215,119,87\)"/g,
    replacer: (match, key) => `${key}${gate('theme-logo-rgb')}?"rgb(34,197,94)":"rgb(215,119,87)"`,
    sentinel: 'clawd_body:"rgb(215,119,87)"',
  },
  {
    order: 31,
    name: 'Logo + brand color → green (ANSI)',
    pattern: /(clawd_body:)"ansi:redBright"/g,
    replacer: (match, key) => `${key}${gate('theme-logo-ansi')}?"ansi:greenBright":"ansi:redBright"`,
    sentinel: 'clawd_body:"ansi:redBright"',
  },
  {
    order: 32,
    name: 'Theme claude color → green (dark)',
    pattern: /(claude:)"rgb\(215,119,87\)"/g,
    replacer: (match, key) => `${key}${gate('theme-claude-rgb-dark')}?"rgb(34,197,94)":"rgb(215,119,87)"`,
    sentinel: 'claude:"rgb(215,119,87)"',
  },
  {
    order: 33,
    name: 'Theme claude color → green (light)',
    pattern: /(claude:)"rgb\(255,153,51\)"/g,
    replacer: (match, key) => `${key}${gate('theme-claude-rgb-light')}?"rgb(22,163,74)":"rgb(255,153,51)"`,
    sentinel: 'claude:"rgb(255,153,51)"',
  },
  {
    order: 34,
    name: 'Shimmer → green',
    pattern: /(claudeShimmer:)"rgb\(2[34]5,1[45]9,1[12]7\)"/g,
    replacer: (match, key) => `${key}${gate('theme-shimmer-rgb')}?"rgb(74,222,128)":${match.slice(key.length)}`,
    appliedMarker: 'claudeShimmer:"rgb(74,222,128)"',
  },
  {
    order: 35,
    name: 'Shimmer light → green',
    pattern: /(claudeShimmer:)"rgb\(255,183,101\)"/g,
    replacer: (match, key) => `${key}${gate('theme-shimmer-rgb-light')}?"rgb(34,197,94)":"rgb(255,183,101)"`,
    sentinel: 'claudeShimmer:"rgb(255,183,101)"',
  },
  {
    order: 36,
    name: 'Hex brand color → green',
    pattern: /"#da7756"/g,
    replacer: () => `${gate('theme-hex')}?"#22c55e":'#da7756'`,
    sentinel: '#da7756',
    appliedMarker: /globalThis\.__clawgodPatches\?\.\["theme-hex"\]/,
  },
  {
    order: 37,
    name: 'Theme claude color → green (ANSI)',
    pattern: /(claude:)"ansi:redBright"/g,
    replacer: (match, key) => `${key}${gate('theme-claude-ansi')}?"ansi:greenBright":"ansi:redBright"`,
  },
  {
    order: 38,
    name: 'Shimmer → green (ANSI)',
    pattern: /(claudeShimmer:)"ansi:yellowBright"/g,
    replacer: (match, key) => `${key}${gate('theme-shimmer-ansi')}?"ansi:greenBright":"ansi:yellowBright"`,
  },
  {
    order: 39,
    name: 'Brief label claude color → green (RGB dark)',
    pattern: /(briefLabelClaude:)"rgb\(215,119,87\)"/g,
    replacer: (match, key) => `${key}${gate('theme-brief-rgb-dark')}?"rgb(34,197,94)":"rgb(215,119,87)"`,
  },
  {
    order: 40,
    name: 'Brief label claude color → green (RGB light)',
    pattern: /(briefLabelClaude:)"rgb\(255,153,51\)"/g,
    replacer: (match, key) => `${key}${gate('theme-brief-rgb-light')}?"rgb(22,163,74)":"rgb(255,153,51)"`,
  },
  {
    order: 41,
    name: 'Brief label claude color → green (ANSI)',
    pattern: /(briefLabelClaude:)"ansi:redBright"/g,
    replacer: (match, key) => `${key}${gate('theme-brief-ansi')}?"ansi:greenBright":"ansi:redBright"`,
  },
];

export const brandingRegistry = Object.freeze({
  id: 'branding',
  patches: Object.freeze(patches),
  customPatches: Object.freeze([]),
});
