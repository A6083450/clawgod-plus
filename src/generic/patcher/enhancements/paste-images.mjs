const patches = [
  {
    order: 42,
    name: 'macOS Cmd+V image paste fallback to clipboard read',
    pattern: /\}else if\(([\w$]+)&&([\w$]+)\)([\w$]+)\(\);else ([\w$]+)\("input_image_drag","read_failed"\),([\w$]+)\(([\w$]+)\),([\w$]+)\(\)/g,
    replacer: (match, temporaryItem, isMacOs, clipboardRead, track, insert, value, finish) =>
      `}else if(${isMacOs})${clipboardRead}();else ${track}("input_image_drag","read_failed"),${insert}(${value}),${finish}()`,
    sentinel: '"input_image_drag","read_failed"',
    optional: true,
  },
  {
    order: 43,
    name: 'Image paste: try native image processor regardless of standalone gate',
    pattern: /if\(([\w$]+)\(\)\)try\{let ([\w$]+)=await import\("\.\/chunk-[a-z0-9]+\.js"\),([\w$]+)=\2\.sharp\|\|\2\.default;return ([\w$]+)=\{default:\3\},\3\}catch\{console\.warn\("Native image processor not available, falling back to sharp"\)\}/g,
    replacer: (match, gate) => match.replace(`if(${gate}())`, ''),
    appliedMarker: /try\{let [\w$]+=await import\("\.\/chunk-[a-z0-9]+\.js"\),[\w$]+=[\w$]+\.sharp\|\|[\w$]+\.default;return [\w$]+=\{default:[\w$]+\},[\w$]+\}catch\{console\.warn\("Native image processor not available/,
  },
  {
    order: 44,
    name: 'Image paste: recognize TIFF paths for macOS clipboard fallback',
    pattern: /([\w$]+)=\/\\\.\(png\|jpe\?g\|gif\|webp\)\$\/i(?=;[\w$]+=\/\^\(\?:\[A-Za-z\]:\\\\\|\\\\\\\\\)\/)/g,
    replacer: (match, imagePathPattern) => `${imagePathPattern}=/\\.(png|jpe?g|gif|webp|tiff?)$/i`,
    sentinel: '/\\.(png|jpe?g|gif|webp)$/i;',
    appliedMarker: '/\\.(png|jpe?g|gif|webp|tiff?)$/i;',
    unique: true,
  },
  {
    order: 45,
    name: 'Image paste: keep HTTP image URLs as text',
    pattern: /function ([\w$]+)\(([\w$]+)\)\{let ([\w$]+)=([\w$]+)\(\2\.trim\(\)\),([\w$]+)=([\w$]+)\(\3\);return ([\w$]+)\.test\(\5\)\}/g,
    replacer: (match, fn, value, quoted, unquote, path, unescape, imagePathPattern) =>
      `function ${fn}(${value}){let ${quoted}=${unquote}(${value}.trim()),${path}=${unescape}(${quoted});return!/^https?:\\/\\//i.test(${path})&&${imagePathPattern}.test(${path})}`,
    appliedMarker: '/^https?:\\/\\//i.test(',
    unique: true,
  },
];

export const pasteImagesRegistry = Object.freeze({
  id: 'paste-images',
  patches: Object.freeze(patches),
  customPatches: Object.freeze([]),
});
