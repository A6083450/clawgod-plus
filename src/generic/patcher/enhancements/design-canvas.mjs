const patches = [
  {
    order: 65,
    name: 'Design canvas enable (skip claude.ai login/subscription gate)',
    // 2.1.250 anchors the gate beside `var r="design"`; 2.1.266 moves it
    // into a module and identifies it only through the export alias.
    pattern: /var ([\w$]+)="design";function ([\w$]+)\(\)\{return [\w$]+\(\)&&[\w$]+\(\)\}|function ([\w$]+)\(\)\{return [\w$]+\(\)&&[\w$]+\(\)\}(?=[\s\S]{0,3000}?export\{[^}]*\b\3 as isDesignCanvasSkillEnabled\b)/g,
    replacer: (match, commandName, legacyFn, currentFn) =>
      `${commandName ? `var ${commandName}="design";` : ''}function ${legacyFn ?? currentFn}(){return!0/*__clawgod_design_canvas__*/}`,
    sentinel: 'isDesignCanvasSkillEnabled',
    appliedMarker: '/*__clawgod_design_canvas__*/',
    optional: true,
  },
  {
    order: 66,
    name: 'Design canvas payload path → CLAWGOD_DESIGN_PAYLOAD',
    // The canvas skill loads its editor payload from the Bun standalone
    // embed path, which does not exist when cli.original.cjs runs as a
    // plain file under Bun. POSIX builds use /$bunfs/root/..., Windows
    // builds use B:/~BUN/root/... — cover both prefixes.
    // extract-natives.mjs extracts the asset (loader=file) into
    // ~/.clawgod/assets/ and the wrapper exports CLAWGOD_DESIGN_PAYLOAD.
    pattern: /var ([\w$]+)=("(?:[A-Z]:)?\/(?:\$bunfs|~BUN)\/root\/payload\.template\.html\.asset")/g,
    replacer: (match, v, originalPath) =>
      `var ${v}=process.env.CLAWGOD_DESIGN_PAYLOAD||${originalPath}/*__clawgod_design_payload__*/`,
    sentinel: 'payload.template.html.asset',
    appliedMarker: '/*__clawgod_design_payload__*/',
    optional: true,
  },
];

export const designCanvasRegistry = Object.freeze({
  id: 'design-canvas',
  patches: Object.freeze(patches),
  customPatches: Object.freeze([]),
});
