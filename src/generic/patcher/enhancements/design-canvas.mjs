import skill from './design-canvas-assets/SKILL.md' with { type: 'text' };
import seed from './design-canvas-assets/seed-canvas.mjs' with { type: 'text' };
import payload from './design-canvas-assets/payload.html.gz.b64' with { type: 'text' };
import license from './design-canvas-assets/LICENSE.md' with { type: 'text' };

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
  {
    order: 94,
    name: 'Design canvas local fallback (replace cloud hub)',
    // 新入口不再包含旧画布；只替换该注册函数，不放开任何云端能力门控。
    pattern: /function ([\w$]+)\(([\w$]+)\)\{let ([\w$]+)=\(\)=>([\w$]+)\(\2\),([\w$]+)=\(\)=>([\w$]+)\[\3\(\)\?\?"consent"\];([\w$]+)\(\{name:([\w$]+),description:\(\)=>\5\(\)\.description\(\),menuDescription:\(\)=>\5\(\)\.menu\(\),argumentHint:\(\)=>\5\(\)\.hint,subcommands:[\w$]+,subcommandsBareOnly:!0,isEnabled:\(\)=>\3\(\)!==null,survivesBundledKillSwitch:!0,policyGate:\(\)=>\3\(\)\s*==="types"\?void 0:[\w$]+,userInvocable:!0,disableModelInvocation:!0,async getArgumentCompletions\([\w$]+,[\w$]+\)\{[^{}]{0,400}\},getPromptForCommand:\([\w$]+\)=>[\w$]+\([\w$]+,\2\)\}\)\}/g,
    replacer: (match, fn, options, mode, select, info, modes, register, command) =>
      `function ${fn}(${options}){${register}({name:${command},description:"Create a local design canvas without cloud services",menuDescription:"Create a local design canvas",argumentHint:"[what to design]",isEnabled:()=>!0,survivesBundledKillSwitch:!0,userInvocable:!0,disableModelInvocation:!0,files:async()=>({"payload.template.html":(await import("node:zlib")).gunzipSync(Buffer.from(${JSON.stringify(payload.trim())},"base64")).toString("utf8")+${JSON.stringify(`\n<!-- CLAWGOD_THIRD_PARTY_NOTICES\n${license.trim()}\n-->\n`)},"seed-canvas.mjs":${JSON.stringify(seed)},"LICENSE.md":${JSON.stringify(license)}}),getPromptForCommand:async(args)=>[{type:"text",text:${JSON.stringify(skill)}+(args?.trim()?"\\n\\n## User Request\\n\\n"+args:"")}]})/*__clawgod_design_local__*/}`,
    appliedMarker: '/*__clawgod_design_local__*/',
    knownShape: /^(?![\s\S]*(?:isDesignCanvasSkillEnabled|\/\*__clawgod_design_local__\*\/))[\s\S]*Hub for Claude Design \(claude\.ai\/design\)/,
    unique: true,
    optional: true,
  },
];

export const designCanvasRegistry = Object.freeze({
  id: 'design-canvas',
  patches: Object.freeze(patches),
  customPatches: Object.freeze([]),
});
