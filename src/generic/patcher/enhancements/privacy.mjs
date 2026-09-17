import { gate } from '../runtime-features.mjs';

const patches = [
  {
    order: 47,
    name: 'Neutralize geo-steganography in date string (qla)',
    pattern: /function ([\w$]+)\(([\w$]+)\)\{let [\w$]+=[\w$]+\(\),[\w$]+=[\w$]+\([\w$]+\?\.[\w$]+\?\?!1,[\w$]+\?\.[\w$]+\?\?!1\),[\w$]+=[\w$]+\?\.[\w$]+\?[\w$]+\.replaceAll\("-","\/"\):[\w$]+;return`Today\$\{[\w$]+\}s date is \$\{[\w$]+\}\.`\}/g,
    replacer: (match, fn, parameter) => `function ${fn}(${parameter}){if(${gate('geo-stego-date')})return\`Today's date is \${${parameter}}.\`;${match.slice(match.indexOf('{') + 1, -1)}}`,
    sentinel: 'replaceAll("-","/")',
    appliedMarker: /function [\w$]+\([^)]*\)\{if\(globalThis\.__clawgodPatches\?\.\["geo-stego-date"\]/,
  },
  {
    order: 48,
    name: 'Neutralize geo-detection probe (rdp)',
    pattern: /function ([\w$]+)\(\)\{if\([\w$]+\(\)\)return null;let [\w$]+=[\w$]+\(\),[\w$]+=[\w$]+\(\),[\w$]+=[\w$]+==="Asia\/Shanghai"\|\|[\w$]+==="Asia\/Urumqi"[\s\S]*?\}\}/g,
    replacer: (match, fn) => `function ${fn}(){if(${gate('geo-detect-probe')})return null;${match.slice(`function ${fn}(){`.length, -1)}}`,
    sentinel: 'Asia/Shanghai',
    appliedMarker: /function [\w$]+\(\)\{if\(globalThis\.__clawgodPatches\?\.\["geo-detect-probe"\]/,
  },
  {
    order: 49,
    name: 'Neutralize apostrophe steganography (odp)',
    pattern: new RegExp(
      'function ([\\w$]+)\\(([\\w$]+),([\\w$]+)\\)\\{' +
      'if\\(!\\2&&!\\3\\)return"\'";' +
      'if\\(\\2&&!\\3\\)return"(?:\\\\u2019|\\u2019)";' +
      'if\\(!\\2&&\\3\\)return"(?:\\\\u02[Bb][Cc]|\\u02BC)";' +
      'return"(?:\\\\u02[Bb]9|\\u02B9)"\\}',
      'g',
    ),
    replacer: (match, fn, first, second) => `function ${fn}(${first},${second}){if(${gate('geo-apostrophe-stego')})return"'";${match.slice(match.indexOf('{') + 1, -1)}}`,
    optional: true,
  },
];

export const privacyRegistry = Object.freeze({
  id: 'privacy',
  patches: Object.freeze(patches),
  customPatches: Object.freeze([]),
});
