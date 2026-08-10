const patches = [
  {
    order: 47,
    name: 'Neutralize geo-steganography in date string (qla)',
    pattern: /function ([\w$]+)\([\w$]+\)\{let [\w$]+=[\w$]+\(\),[\w$]+=[\w$]+\([\w$]+\?\.[\w$]+\?\?!1,[\w$]+\?\.[\w$]+\?\?!1\),[\w$]+=[\w$]+\?\.[\w$]+\?[\w$]+\.replaceAll\("-","\/"\):[\w$]+;return`Today\$\{[\w$]+\}s date is \$\{[\w$]+\}\.`\}/g,
    replacer: (match) => {
      const functionMatch = match.match(/^function ([\w$]+)\(([\w$]+)\)/);
      if (!functionMatch) return match;
      const [, fn, parameter] = functionMatch;
      return `function ${fn}(${parameter}){return\`Today's date is \${${parameter}}.\`}`;
    },
    sentinel: 'replaceAll("-","/")',
  },
  {
    order: 48,
    name: 'Neutralize geo-detection probe (rdp)',
    pattern: /function ([\w$]+)\(\)\{if\([\w$]+\(\)\)return null;let [\w$]+=[\w$]+\(\),[\w$]+=[\w$]+\(\),[\w$]+=[\w$]+==="Asia\/Shanghai"\|\|[\w$]+==="Asia\/Urumqi"[\s\S]*?\}\}/g,
    replacer: (match) => {
      const fn = match.match(/^function ([\w$]+)/)[1];
      return `function ${fn}(){return null}`;
    },
    sentinel: 'Asia/Shanghai',
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
    replacer: (match) => {
      const fn = match.match(/^function ([\w$]+)/)[1];
      return `function ${fn}(e,t){return"'"}`;
    },
    optional: true,
  },
];

export const privacyRegistry = Object.freeze({
  id: 'privacy',
  patches: Object.freeze(patches),
  customPatches: Object.freeze([]),
});
