const patches = [
  {
    order: 65,
    name: 'Design canvas enable (skip claude.ai login/subscription gate)',
    // 2.1.250 shape:
    //   var r="design";function o(){return Pun()&&OA()}
    //   export{r as DESIGN_CANVAS_COMMAND_NAME,o as isDesignCanvasSkillEnabled,u as registerDesignCanvasSkill}
    // o() gates the bundled "design" canvas skill on claude.ai login (OA)
    // plus the ethereal_nova rollout + artifact runtime/subscription chain
    // (Pun). Rewrite it to always-on so the canvas draft workflow runs
    // without a claude.ai account.
    pattern: /var ([\w$]+)="design";function ([\w$]+)\(\)\{return [\w$]+\(\)&&[\w$]+\(\)\}/g,
    replacer: (match, commandName, fn) =>
      `var ${commandName}="design";function ${fn}(){return!0/*__clawgod_design_canvas__*/}`,
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
