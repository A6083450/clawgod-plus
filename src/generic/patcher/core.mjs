import { existsSync, mkdirSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const PATCHER_DIR = dirname(fileURLToPath(import.meta.url));
const ACORN_URL = 'https://unpkg.com/acorn@8.16.0/dist/acorn.js';

export async function loadAcorn(rootDir = PATCHER_DIR) {
  const acornCache = join(rootDir, 'vendor', 'acorn.cjs');
  try {
    if (!existsSync(acornCache)) {
      mkdirSync(dirname(acornCache), { recursive: true });
      const response = await fetch(ACORN_URL);
      if (!response.ok) return null;
      const temp = `${acornCache}.${process.pid}.tmp`;
      writeFileSync(temp, await response.text(), 'utf8');
      renameSync(temp, acornCache);
    }
    const module = await import(pathToFileURL(acornCache).href);
    const acorn = typeof module.parse === 'function' ? module : module.default;
    return acorn && typeof acorn.parse === 'function' ? acorn : null;
  } catch {
    return null;
  }
}

export function findNodes(node, predicate, results = []) {
  if (!node || typeof node !== 'object') return results;
  if (predicate(node)) results.push(node);
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (!child || typeof child !== 'object') continue;
    if (Array.isArray(child)) {
      for (const item of child) findNodes(item, predicate, results);
    } else {
      findNodes(child, predicate, results);
    }
  }
  return results;
}

export function inspectPatcherSource(source) {
  const versionMatch = source.match(/Version:\s*([\d.]+)/);
  return {
    size: source.length,
    version: versionMatch ? versionMatch[1] : 'unknown',
  };
}

async function applyContextLimitPatch(source, { dryRun, verify, rootDir }) {
  const ENV_EXPR = '(+process.env.CLAUDE_CODE_CONTEXT_LIMIT||+process.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS||200000)';
  const dualRe = /var\s+([\w$]+)\s*=\s*200000\s*,\s*([\w$]+)\s*=\s*200000\s*,\s*([\w$]+)\s*=\s*32000\s*,\s*([\w$]+)\s*=\s*128000\s*,\s*([\w$]+)\s*=\s*1e6\b/;
  const alreadyRe = new RegExp('var\\s+([\\w$]+)\\s*=\\s*\\(\\+process\\.env\\.CLAUDE_CODE_CONTEXT_LIMIT\\|\\|\\+process\\.env\\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\\|\\|200000\\)\\s*,\\s*([\\w$]+)\\s*=\\s*\\(\\+process\\.env\\.CLAUDE_CODE_CONTEXT_LIMIT\\|\\|\\+process\\.env\\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\\|\\|200000\\)\\s*,\\s*[\\w$]+\\s*=\\s*32000\\s*,\\s*[\\w$]+\\s*=\\s*128000\\s*,\\s*[\\w$]+\\s*=\\s*1e6\\b');

  const dualMatch = dualRe.exec(source);
  const alreadyMatch = alreadyRe.exec(source);
  if (!dualMatch && !alreadyMatch) {
    if (!source.includes('200000')) return { status: 'skipped', detail: 'not present in this version' };
    return { status: 'failed', detail: 'context default constants not found' };
  }

  const match = dualMatch || alreadyMatch;
  const [, varA, varB, varC, varD, varE] = match;
  const replacements = [];
  if (dualMatch) {
    replacements.push({
      start: dualMatch.index,
      end: dualMatch.index + dualMatch[0].length,
      replacement: `var ${varA}=${ENV_EXPR},${varB}=${ENV_EXPR},${varC}=32000,${varD}=128000,${varE}=1e6`,
    });

    const cmpRe = /\breturn ([\w$]+)\?([\w$]+)\(\1\)>200000:!1/g;
    let cm;
    while ((cm = cmpRe.exec(source)) !== null) {
      const comparison = `${cm[2]}(${cm[1]})>200000`;
      const start = cm.index + cm[0].indexOf(comparison);
      replacements.push({
        start,
        end: start + comparison.length,
        replacement: `${cm[2]}(${cm[1]})>${ENV_EXPR}`,
      });
    }
  }

  const envReassign = `;${varA}=${ENV_EXPR};${varB}=${ENV_EXPR};`;
  const acorn = await loadAcorn(rootDir);
  if (acorn) {
    try {
      const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
      const envAssigns = findNodes(ast, (node) =>
        node.type === 'ExpressionStatement' &&
        node.expression?.type === 'CallExpression' &&
        node.expression.callee?.type === 'MemberExpression' &&
        node.expression.callee.object?.name === 'Object' &&
        node.expression.callee.property?.name === 'assign' &&
        node.expression.arguments?.length >= 2 &&
        node.expression.arguments[0]?.type === 'MemberExpression' &&
        node.expression.arguments[0].object?.name === 'process' &&
        node.expression.arguments[0].property?.name === 'env'
      );
      for (const statement of envAssigns.slice(0, 6)) {
        if (source.startsWith(envReassign, statement.end)) continue;
        replacements.push({ start: statement.end, end: statement.end, replacement: envReassign });
      }
    } catch {}
  }

  if (replacements.length === 0) return { status: 'already', detail: 'already applied' };
  if (verify) return { status: 'verify', count: replacements.length };

  let next = source;
  if (!dryRun) {
    replacements.sort((left, right) => right.start - left.start);
    for (const replacement of replacements) {
      next = next.slice(0, replacement.start) + replacement.replacement + next.slice(replacement.end);
    }
  }
  return { status: 'applied', count: replacements.length, code: next };
}

const patches = [
  {
    order: 0,
    name: 'USER_TYPE → ant',
    pattern: /function ([\w$]+)\(\)\{return"external"\}/g,
    replacer: (match, fn) => `function ${fn}(){return"ant"}`,
    sentinel: 'return"external"',
  },
  {
    order: 1,
    name: 'Worker resolver for plain Bun cli.cjs (target shape)',
    pattern: /if\(([\w$]+)\(\)\)return\{cmd:process\.execPath,prefixArgs:\[\],target:process\.execPath\};let ([\w$]+)=process\.argv\[1\];if\(!\2\)return\{cmd:process\.execPath,prefixArgs:\[\],target:process\.execPath\};return\{cmd:process\.execPath,prefixArgs:\[\2\],target:\2\}/g,
    replacer: (match, standalone, entry) => `let ${entry}=process.argv[1];if(${entry}&&/(?:^|[\\/])cli\\.cjs$/.test(${entry}))return{cmd:process.execPath,prefixArgs:[${entry}],target:${entry}}/*__clawgod_plain_bun_worker__*/;if(${standalone}())return{cmd:process.execPath,prefixArgs:[],target:process.execPath};if(!${entry})return{cmd:process.execPath,prefixArgs:[],target:process.execPath};return{cmd:process.execPath,prefixArgs:[${entry}],target:${entry}}`,
    appliedMarker: '/*__clawgod_plain_bun_worker__*/',
    knownShape: /if\([\w$]+\(\)\)return\{cmd:process\.execPath,prefixArgs:\[\],target:process\.execPath\};let [\w$]+=process\.argv\[1\];if\(![\w$]+\)return\{cmd:process\.execPath,prefixArgs:\[\],target:process\.execPath\};return\{cmd:process\.execPath,prefixArgs:/,
    optional: true,
  },
  {
    order: 2,
    name: 'Worker resolver for plain Bun cli.cjs (legacy shape)',
    pattern: /if\(([\w$]+)\(\)\)return\{cmd:process\.execPath,prefixArgs:\[\]\};let ([\w$]+)=process\.argv\[1\];if\(!\2\)return\{cmd:process\.execPath,prefixArgs:\[\]\};return\{cmd:process\.execPath,prefixArgs:\[\2\]\}/g,
    replacer: (match, standalone, entry) => `let ${entry}=process.argv[1];if(${entry}&&/(?:^|[\\/])cli\\.cjs$/.test(${entry}))return{cmd:process.execPath,prefixArgs:[${entry}]}/*__clawgod_plain_bun_worker__*/;if(${standalone}())return{cmd:process.execPath,prefixArgs:[]};if(!${entry})return{cmd:process.execPath,prefixArgs:[]};return{cmd:process.execPath,prefixArgs:[${entry}]}`,
    appliedMarker: '/*__clawgod_plain_bun_worker__*/',
    knownShape: /if\([\w$]+\(\)\)return\{cmd:process\.execPath,prefixArgs:\[\]\};let [\w$]+=process\.argv\[1\];if\(![\w$]+\)return\{cmd:process\.execPath,prefixArgs:\[\]\};return\{cmd:process\.execPath,prefixArgs:/,
    optional: true,
  },
  {
    order: 3,
    name: 'GrowthBook env overrides',
    pattern: /function ([\w$]+)\(\)\{if\(!([\w$]+)\)\2=!0;return ([\w$]+)\}/g,
    replacer: (match, fn, flag, value) =>
      `function ${fn}(){if(!${flag}){${flag}=!0;try{let e=process.env.CLAUDE_INTERNAL_FC_OVERRIDES;if(e)${value}=JSON.parse(e)}catch(e){}}return ${value}}`,
    unique: true,
    optional: true,
  },
  {
    order: 4,
    name: 'GrowthBook config overrides',
    pattern: /function ([\w$]+)\(\)\{return\}(function)/g,
    replacer: (match, fn, next) => `function ${fn}(){return null}${next}`,
    selectIndex: 0,
    optional: true,  // v2.1.215+ GrowthBook functions restructured; pattern no longer matches
    validate: (match, code) => {
      const position = code.indexOf(match);
      const nearby = code.substring(Math.max(0, position - 500), position + 500);
      return nearby.includes('growthBook') || nearby.includes('GrowthBook') || nearby.includes('FeatureValue');
    },
  },
  {
    order: 29,
    name: "Redirect `claude update` to clawgod self-update",
    pattern: /(\.command\("update"\)\.alias\("upgrade"\)\.description\("[^"]+"\))(\.action\((?:t\()?async\([^)]*\)=>\{)/g,
    replacer: (match, chain, action) => (
      chain + '.allowUnknownOption()' + action +
      `const __clawgodUpdateIndex=process.argv.findIndex(a=>a==="update"||a==="upgrade");` +
      `const __clawgodUpdateArgs=__clawgodUpdateIndex>=0?process.argv.slice(__clawgodUpdateIndex+1):[];` +
      `const __clawgodVersionIndex=__clawgodUpdateArgs.indexOf("--version");` +
      `if(__clawgodVersionIndex>=0&&__clawgodUpdateArgs[__clawgodVersionIndex+1])process.env.CLAWGOD_VERSION=__clawgodUpdateArgs[__clawgodVersionIndex+1];` +
      `else process.env.CLAWGOD_VERSION="latest";` +
      `if(__clawgodUpdateArgs.includes("--no-upgrade"))process.env.CLAWGOD_NO_UPGRADE="1";` +
      `if(__clawgodUpdateArgs.includes("--lean-off"))process.env.CLAWGOD_LEAN_OFF="1";` +
      `if(__clawgodUpdateArgs.includes("--lean-on"))process.env.CLAWGOD_LEAN_ON="1";` +
      `if(__clawgodUpdateArgs.includes("--lean-max"))process.env.CLAWGOD_LEAN_MAX="1";` +
      `process.stderr.write("[clawgod] 'claude update' is handled by clawgod self-update.\\n[clawgod] To leave clawgod and use vanilla update: bash ~/.clawgod/install.sh --uninstall\\n[clawgod] Continuing now\\u2026\\n");` +
      `const _w=process.platform==='win32';` +
      `const __clawgodUpdateStatus=(()=>{const __fs=require('fs'),__path=require('path'),__os=require('os'),__cp=require('child_process');const __root=__path.join(__os.homedir(),'.clawgod'),__fetch=__path.join(__root,'fetch-file.mjs'),__bun=process.env.CLAWGOD_BUN_BIN||process.execPath;let __temporary='';try{let __installer=__path.join(__root,_w?'install.ps1':'install.sh');if(!__fs.existsSync(__installer)){if(!__fs.existsSync(__fetch))throw new Error('managed fetch-file.mjs is missing; reinstall ClawGod Plus');__temporary=__fs.mkdtempSync(__path.join(__os.tmpdir(),'clawgod-update-'));if(!_w)__fs.chmodSync(__temporary,0o700);__installer=__path.join(__temporary,_w?'install.ps1':'install.sh');const __url='https://github.com/A6083450/clawgod-plus/releases/latest/download/'+(_w?'install.ps1':'install.sh');const __download=__cp.spawnSync(__bun,[__fetch,__url,__installer],{stdio:'inherit',env:process.env});if(__download.error)throw __download.error;if(__download.status===null)throw new Error('managed installer download did not return an exit status');if(__download.status!==0)return __download.status;}else process.stderr.write('[clawgod] using local installer (remote skipped): '+__installer+'\\n');const __command=_w?['powershell','-NoProfile','-ExecutionPolicy','Bypass','-File',__installer]:['bash',__installer];const __result=__cp.spawnSync(__command[0],__command.slice(1),{stdio:'inherit',env:{...process.env,CLAWGOD_NONINTERACTIVE:'1'}});if(__result.error)throw __result.error;if(__result.status===null)throw new Error('installer process did not return an exit status');return __result.status;}catch(__error){process.stderr.write('[clawgod] update failed: '+(__error&&__error.message?__error.message:String(__error))+'\\n');return 1;}finally{if(__temporary)__fs.rmSync(__temporary,{recursive:true,force:true});}})();` +
      `process.exit(__clawgodUpdateStatus);`
    ),
    sentinel: '.command("update").alias("upgrade")',
    appliedMarker: "[clawgod] 'claude update' is handled by clawgod self-update.",
  },
  {
    order: 57,
    name: 'Shell integration → claude.orig (multitool dispatch fix)',
    pattern: /([\w$]+\.join\([\w$]+\(\),[\w$]+\?)"claude\.exe":"claude"(\))/g,
    replacer: (match, prefix, suffix) => `${prefix}"claude.orig.exe":"claude.orig"${suffix}`,
    sentinel: '?"claude.exe":"claude")',
    optional: true,
  },
  {
    order: 58,
    name: 'Fast mode model label reflects provider model',
    pattern: /function ([\w$]+)\(\)\{return"Opus 5"\}/g,
    replacer: (m, fn) => `function ${fn}(){return process.env.ANTHROPIC_MODEL||"Opus 5"/*__clawgod_fast_model_label__*/}`,
    appliedMarker: '/*__clawgod_fast_model_label__*/',
    optional: true,  // cosmetic; upstream may rename/remove the label in future versions
  },
];

async function applyFastMessagesProtocolPatch(source, { dryRun, verify }) {
  const MARKER = '/*__clawgod_fast_messages_protocol__*/';
  if (source.includes(MARKER)) return { status: 'already', detail: 'already applied' };
  const FAST_BETA = 'fast-mode-2026-02-01';
  const hasFastBeta = source.includes(FAST_BETA);

  // Frozen 2.1.215 request closure: the same `&&!!<arg>` Fast condition gates
  // both the beta capability push and the body speed field.
  const legacyRe = /let ([\w$]+)=\[\.\.\.([\w$]+)\],([\w$]+)="([^"]+)",([\w$]+)=([^;]+&&!!([\w$]+));if\(([\w$]+)\)([\w$]+)\.push\(([\w$]+)\);let ([\w$]+)=([\w$]+)\.includes\(([\w$]+)\),([\w$]+);if\(([^;]+&&!!([\w$]+))\)([\w$]+)="fast";let ([\w$]+)=\{([^{}]*),\.\.\.([\w$]+)!==void 0&&\{speed:([\w$]+)\}\},headers=\{"anthropic-beta":([\w$]+)\.map\(\(([\w$]+)\)=>([\w$]+)\.header\)\.toString\(\)\};return\{body:([\w$]+),headers\}/g;
  const legacyMatches = [...source.matchAll(legacyRe)];

  // Real 2.1.229 request closure: the beta capability push is gated by an
  // independent `ae` eligibility while the body speed is gated by `Fo.fastMode`.
  const realRe = /let ([\w$]+)=\[\.\.\.([\w$.]+)\](?:;let ([\w$]+)=([^;]+)|,([\w$]+)=([^;]+))?;if\(([\w$]+)\)([\w$]+)\.push\(([\w$]+)\);let ([\w$]+);if\(([^;]+)\)([\w$]+)="fast";let ([\w$]+)=\{([^{}]*),\.\.\.([\w$]+)!==void 0&&\{speed(?::([\w$]+))?\}\}(?:,|;)headers=\{"anthropic-beta":([\w$]+)\.map\(\(([\w$]+)\)=>([\w$]+)\.header\)\.toString\(\)\};return\{body(?::([\w$]+))?,headers(?::([\w$]+))?\}/g;
  const realMatches = [...source.matchAll(realRe)];

  // Real 2.1.229 Ze request builder: the body carries the betas as
  // `...ee&&(!$u||ma.length>0)&&{betas:i$(l0s(ma))}` and the bundled SDK
  // `messages.create` destructures `{betas:n,...}` and emits the
  // `"anthropic-beta":n?.toString()` header itself. `l0s` filters through
  // the `aku` allowlist (which drops the Fast capability for third-party
  // providers), so the forced passthrough operates on the final betas:
  // `speed==="fast"` is the only switch — while Fast is active the Fast
  // beta capability is forced in and every capability is deduplicated;
  // while the speed field is absent every Fast beta capability is removed.
  // The independent `ae` eligibility no longer limits the beta list.
  const real229ZeRe = /if\(\$c\(\)&&P3\(\)&&!xLe\(\)&&T0\(y\)&&!!([\w$]+)\.fastMode\)([\w$]+)="fast";if\(([\w$]+)&&!([\w$]+)\.includes\(([\w$]+)\)\)\4\.push\(\5\);[\s\S]{0,2000}?let ([\w$]+)=([\w$]+)\(process\.env\.CLAUDE_CODE_SIMULATE_PROXY_USAGE\),([\w$]+)=\6\?([\w$]+)\.filter\(\(([\w$]+)\)=>\10===[\w$]+\):\9;[\s\S]{0,2000}?\.\.\.([\w$]+)&&\(!\6\|\|\8\.length>0\)&&\{betas:([\w$]+)\(([\w$]+)\(\8\)\)\}([\s\S]{0,600}?\.\.\.\2!==void 0&&\{speed:\2\})/g;
  const real229ZeMatches = [...source.matchAll(real229ZeRe)];

  // Real 2.1.232 request builder: same structure as the 2.1.229 Ze builder
  // with renamed gates (`uu()&&j3()&&!aFe()&&TC(y)`), a sticky-betases
  // `le` eligibility, and the `iLs`/`ZUu` allowlist (`iLs` passes through
  // for first-party/foundry, otherwise filters to `ZUu`, which excludes the
  // Fast capability). The forced passthrough operates on the final betas:
  // `os==="fast"` is the only switch — while Fast is active the Fast beta
  // capability is forced in and every capability is deduplicated; while the
  // speed field is absent every Fast beta capability is removed.
  const real232Re = /if\(uu\(\)&&j3\(\)&&!aFe\(\)&&TC\(y\)&&!!([\w$]+)\.fastMode\)([\w$]+)="fast";if\(([\w$]+)&&!([\w$]+)\.includes\(([\w$]+)\)\)\4\.push\(\5\);[\s\S]{0,3000}?let ([\w$]+)=([\w$]+)\(process\.env\.CLAUDE_CODE_SIMULATE_PROXY_USAGE\),([\w$]+)=\6\?([\w$]+)\.filter\(\(([\w$]+)\)=>\10===[\w$]+\):\9;[\s\S]{0,3000}?\.\.\.([\w$]+)&&\(!\6\|\|\8\.length>0\)&&\{betas:([\w$]+)\(([\w$]+)\(\8\)\)\}([\s\S]{0,600}?\.\.\.\2!==void 0&&\{speed:\2\})/g;
  const real232Matches = [...source.matchAll(real232Re)];

  const totalMatches = legacyMatches.length + realMatches.length + real229ZeMatches.length + real232Matches.length;
  if (totalMatches !== 1) {
    if (totalMatches === 0 && !hasFastBeta) return { status: 'skipped', detail: 'not present in this version' };
    return { status: 'failed', detail: totalMatches === 0 ? 'Fast request body/header closure not found; upstream shape changed' : `Fast request body/header closure matched ${totalMatches} times; refusing ambiguous patch` };
  }

  if (legacyMatches.length === 1) {
    const [, capabilities, existingBeta, model, modelName, isFast, fastCondition, fastArg, pushCondition, pushCapabilities, fastCapability, hasFastCapability, includesCapabilities, includesCapability, speed, speedCondition, speedArg, speedName, body, bodyFields, bodySpeed, bodySpeedValue, headerCapabilities, capability, capabilityObject, returnBody] = legacyMatches[0];
    if (isFast !== pushCondition || capabilities !== pushCapabilities || capabilities !== includesCapabilities || fastCapability !== includesCapability || fastCondition !== speedCondition || fastArg !== speedArg || speed !== speedName || speed !== bodySpeed || speed !== bodySpeedValue || capabilities !== headerCapabilities || capability !== capabilityObject || body !== returnBody) return { status: 'failed', detail: 'Fast request body/header closure matched an inconsistent Fast-state shape' };
    if (verify) return { status: 'verify', count: 1 };
    const replacement = `let ${capabilities}=[...${existingBeta}],${model}="${modelName}",${isFast}=!!${fastArg};if(${isFast}&&!${capabilities}.includes(${fastCapability}))${capabilities}.push(${fastCapability});let ${hasFastCapability}=${capabilities}.includes(${fastCapability}),${speed};if(${isFast})${speed}="fast";let ${body}={${bodyFields},...${speed}!==void 0&&{speed:${speed}}},headers={"anthropic-beta":${isFast}?(()=>{const __clawgodFastCapabilities=String(${capabilities}.map((${capability})=>${capability}.header).toString()||'').split(',').map(__clawgodFastCapability=>__clawgodFastCapability.trim()).filter(Boolean);const __clawgodFastUniqueCapabilities=[];for(const __clawgodFastCapability of __clawgodFastCapabilities)if(!__clawgodFastUniqueCapabilities.includes(__clawgodFastCapability))__clawgodFastUniqueCapabilities.push(__clawgodFastCapability);if(!__clawgodFastUniqueCapabilities.includes('${FAST_BETA}'))__clawgodFastUniqueCapabilities.push('${FAST_BETA}');return __clawgodFastUniqueCapabilities.join(',')})():${capabilities}.map((${capability})=>${capability}.header).toString()};${MARKER}return{body:${body},headers}`;
    if (dryRun) return { status: 'applied', count: 1, code: source };
    const match = legacyMatches[0];
    return { status: 'applied', count: 1, code: source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length) };
  }

  if (realMatches.length === 1) {
    // Forced passthrough for the legacy synthetic 2.1.229 closure:
    // `body.speed==="fast"` (driven by `Fo.fastMode`) is the only switch. While
    // Fast is active the Fast beta capability is forced in and every capability
    // is deduplicated; while the speed field is absent every Fast beta
    // capability is removed. The independent `ae` eligibility no longer limits
    // the beta header.
    const [, capabilities, prior, aeSeparate, eligibilitySeparate, aeCombined, eligibilityCombined, pushCondition, pushCapabilities, fastCapability, speed, speedCondition, speedAssignment, body, bodyFields, bodySpeed, bodySpeedValue, headerCapabilities, mapParameter, mapHeader, returnBody, returnHeaders] = realMatches[0];
    const aeName = aeSeparate ?? aeCombined;
    if ((aeName && aeName !== pushCondition) || capabilities !== pushCapabilities || capabilities !== headerCapabilities || speed !== speedAssignment || speed !== bodySpeed || (bodySpeedValue && bodySpeedValue !== speed) || mapParameter !== mapHeader || (returnBody && returnBody !== body) || (returnHeaders && returnHeaders !== 'headers')) return { status: 'failed', detail: 'Fast request body/header closure matched an inconsistent Fast-state shape' };
    if (verify) return { status: 'verify', count: 1 };
    const aeDeclaration = aeSeparate ? `;let ${aeSeparate}=${eligibilitySeparate}` : aeCombined ? `,${aeCombined}=${eligibilityCombined}` : '';
    const replacement = `let ${capabilities}=[...${prior}]${aeDeclaration};let ${speed};if(${speedCondition})${speed}="fast";if(${speed}==="fast"&&!${capabilities}.includes(${fastCapability}))${capabilities}.push(${fastCapability});let ${body}={${bodyFields},...${speed}!==void 0&&{speed:${speed}}},headers={"anthropic-beta":${speed}==="fast"?(()=>{const __clawgodFastCapabilities=String(${capabilities}.map((${mapParameter})=>${mapParameter}.header).toString()||'').split(',').map(__clawgodFastCapability=>__clawgodFastCapability.trim()).filter(Boolean);const __clawgodFastUniqueCapabilities=[];for(const __clawgodFastCapability of __clawgodFastCapabilities)if(!__clawgodFastUniqueCapabilities.includes(__clawgodFastCapability))__clawgodFastUniqueCapabilities.push(__clawgodFastCapability);if(!__clawgodFastUniqueCapabilities.includes('${FAST_BETA}'))__clawgodFastUniqueCapabilities.push('${FAST_BETA}');return __clawgodFastUniqueCapabilities.join(',')})():${capabilities}.map((${mapParameter})=>${mapParameter}.header).filter((__clawgodFastHeader)=>__clawgodFastHeader!=="${FAST_BETA}").toString()};${MARKER}return{body:${body},headers}`;
    if (dryRun) return { status: 'applied', count: 1, code: source };
    const match = realMatches[0];
    return { status: 'applied', count: 1, code: source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length) };
  }

  if (real229ZeMatches.length === 1) {
  // Forced passthrough for the real 2.1.229 Ze request builder: the matched
  // span runs from the Fast speed gate through the `ae`-gated push, the
  // simulated-proxy `$u`/`ma` derivation, the `betas` body field and the
  // `speed` body field of the same request object. Only the `betas` field is
  // rewritten (single minimal replacement); everything else is preserved
  // byte-for-byte. The SDK later joins the betas array into the
  // `anthropic-beta` header (`n?.toString()`).
  const [, fastModeHolder, speed, ae, caps, fastCapability, simulatedProxy, envReader, betasSource, capsElse, filterParam, betaSpread, betaSerializer, betaAllowlist, speedTail] = real229ZeMatches[0];
  if (caps !== capsElse) return { status: 'failed', detail: 'Fast request betas closure matched an inconsistent capability list' };
  if (!source.includes(`${fastCapability}=RA("speed","${FAST_BETA}")`)) return { status: 'failed', detail: 'Fast beta capability registration shape changed' };
  if (verify) return { status: 'verify', count: 1 };
  const betasField = `{betas:${betaSerializer}(${betaAllowlist}(${betasSource}))}`;
  const match = real229ZeMatches[0];
  const betasIndex = match[0].lastIndexOf(betasField);
  if (betasIndex === -1 || match[0].indexOf(betasField) !== betasIndex) return { status: 'failed', detail: 'Fast request betas field is not unique inside the matched Ze closure' };
  const replacement = match[0].slice(0, betasIndex) + `{betas:(()=>{${MARKER}const __clawgodFastHeaders=${betaSerializer}(${betaAllowlist}(${betasSource}));const __clawgodFastFiltered=__clawgodFastHeaders.filter((__clawgodFastHeader)=>__clawgodFastHeader!=="${FAST_BETA}");const __clawgodFastUnique=[];for(const __clawgodFastHeader of __clawgodFastFiltered)if(!__clawgodFastUnique.includes(__clawgodFastHeader))__clawgodFastUnique.push(__clawgodFastHeader);return ${speed}==="fast"?[...__clawgodFastUnique,"${FAST_BETA}"]:__clawgodFastFiltered})()}` + match[0].slice(betasIndex + betasField.length);
  if (dryRun) return { status: 'applied', count: 1, code: source };
  return { status: 'applied', count: 1, code: source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length) };
  }

  if (real232Matches.length === 1) {
    // Forced passthrough for the real 2.1.232 request builder. The matched
    // span runs from the Fast speed gate through the sticky-`le` push, the
    // simulated-proxy `rh`/`Hs` derivation, the `betas` body field and the
    // `speed` body field of the same request object. Only the `betas` field
    // is rewritten (single minimal replacement); everything else is
    // preserved byte-for-byte. The SDK later joins the betas array into the
    // `anthropic-beta` header. The `iLs` allowlist drops the Fast capability
    // for third-party providers, so the forced passthrough operates on the
    // final betas exactly like the 2.1.229 Ze branch.
    const [, , speed, , caps, fastCapability, , , betasSource, capsElse, , , betaSerializer, betaAllowlist] = real232Matches[0];
    if (caps !== capsElse) return { status: 'failed', detail: 'Fast request betas closure matched an inconsistent capability list' };
    if (!source.includes(`${fastCapability}=LA("speed","${FAST_BETA}")`)) return { status: 'failed', detail: 'Fast beta capability registration shape changed' };
    if (verify) return { status: 'verify', count: 1 };
    const betasField = `{betas:${betaSerializer}(${betaAllowlist}(${betasSource}))}`;
    const match = real232Matches[0];
    const betasIndex = match[0].lastIndexOf(betasField);
    if (betasIndex === -1 || match[0].indexOf(betasField) !== betasIndex) return { status: 'failed', detail: 'Fast request betas field is not unique inside the matched 2.1.232 closure' };
    const replacement = match[0].slice(0, betasIndex) + `{betas:(()=>{${MARKER}const __clawgodFastHeaders=${betaSerializer}(${betaAllowlist}(${betasSource}));const __clawgodFastFiltered=__clawgodFastHeaders.filter((__clawgodFastHeader)=>__clawgodFastHeader!=="${FAST_BETA}");const __clawgodFastUnique=[];for(const __clawgodFastHeader of __clawgodFastFiltered)if(!__clawgodFastUnique.includes(__clawgodFastHeader))__clawgodFastUnique.push(__clawgodFastHeader);return ${speed}==="fast"?[...__clawgodFastUnique,"${FAST_BETA}"]:__clawgodFastFiltered})()}` + match[0].slice(betasIndex + betasField.length);
    if (dryRun) return { status: 'applied', count: 1, code: source };
    return { status: 'applied', count: 1, code: source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length) };
  }
}

async function applyFastModeOrgCheckPatch(source, { dryRun, verify }) {
  const MARKER = '/*__clawgod_fast_mode_org_check_bypass__*/';
  if (source.includes(MARKER)) return { status: 'already', detail: 'already applied' };

  // `g0o()` is the fast-mode org-check skip helper (`CLAUDE_CODE_SKIP_FAST_MODE_ORG_CHECK`).
  // `/fast` availability is gated locally by LV(); through third-party routing the
  // "penguin mode" org-status endpoint falls back to `disabled`/`unknown`, surfacing as
  // "Fast mode is currently unavailable". Forcing this helper to `true` makes kEs()/jbr()
  // mark the org status `enabled` and lets LV() skip its pending/disabled branches, so the
  // toggle is no longer blocked by the org check. This is independent of the Fast Messages
  // protocol patch, which only rewrites the outbound request after Fast is already enabled.
  const re = /function ([\w$]+)\(\)\{return [\w$]+\.CLAUDE_CODE_SKIP_FAST_MODE_ORG_CHECK\}/;
  const match = re.exec(source);
  if (!match) {
    if (!source.includes('CLAUDE_CODE_SKIP_FAST_MODE_ORG_CHECK')) return { status: 'skipped', detail: 'not present in this version' };
    return { status: 'failed', detail: 'fast mode org-check skip helper shape changed' };
  }
  if (verify) return { status: 'verify', count: 1 };
  const replacement = `function ${match[1]}(){return!0${MARKER}}`;
  if (dryRun) return { status: 'applied', count: 1, code: source };
  return { status: 'applied', count: 1, code: source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length) };
}

async function applyClaudeApiSkillLazyDocsPatch(source, { dryRun, verify }) {
  const appliedMarker = 'Only the essential reference is included to preserve context.';
  if (source.includes(appliedMarker)) return { status: 'already', detail: 'already applied' };

  const guide = source.indexOf('n.indexOf("## Reading Guide")');
  if (guide === -1) return { status: 'skipped', detail: 'not present in this version' };
  const beforeGuide = source.slice(Math.max(0, guide - 300), guide);
  const startMatch = [...beforeGuide.matchAll(/function ([\w$]+)\(e,t,r\)\{let n=([\w$]+)\(r\.SKILL_PROMPT,r\),o=$/g)].at(-1);
  if (!startMatch) return { status: 'failed', detail: 'prompt builder start marker not found' };
  const start = guide - beforeGuide.length + startMatch.index;

  const body = source.slice(start, start + 5000);
  const referenceMatch = body.match(/,a=([\w$]+)\.replace\(\/\\\{lang\\\}\/g,e\?\?"unknown"\)/);
  const subcommandMatch = body.match(/,([\w$]+)\(t\)!=="prompt-audit"/);
  const docsMatch = body.match(/\+([\w$]+)\([^,]+,r\.SKILL_FILES,r\)\)/);
  const endMatch = body.match(/;return s\.join\(`(?:\\n\\n|\n\n)`\)\}/);
  if (!referenceMatch || !subcommandMatch || !docsMatch || !endMatch) {
    return { status: 'failed', detail: 'prompt builder structure not recognized' };
  }

  const functionName = startMatch[1];
  const promptFormatter = startMatch[2];
  const referencePrompt = referenceMatch[1];
  const parseSubcommand = subcommandMatch[1];
  const formatDocs = docsMatch[1];
  const replacement = `function ${functionName}(e,t,r){let n=${promptFormatter}(r.SKILL_PROMPT,r),o=n.indexOf("## Reading Guide"),s=[o!==-1?n.slice(0,o).trimEnd():n],a=${referencePrompt}.replace(/\\{lang\\}/g,e??"unknown"),p=${parseSubcommand}(t),d=[];if(p==="migrate")d.push("shared/model-migration.md");else if(p==="prompt-audit")d.push("shared/prompt-audit.md");else if(e)d.push(\`\${e}/claude-api/README.md\`);s.push(a);if(d.length)s.push(\`---\\n\\n## Included Documentation\\n\\n\`+${formatDocs}(d,r.SKILL_FILES,r));s.push("---\\n\\n## Additional Documentation\\n\\n${appliedMarker} When the task needs streaming, tools, files, batches, caching, token counting, managed agents, or another language-specific guide, use Read on the corresponding path in the skill files.");let l=n.indexOf("## When to Use WebFetch");if(l!==-1)s.push(n.slice(l).trimEnd());if(t)s.push(\`## User Request\\n\\n\${t}\`);return s.join(\`\\n\\n\`)}`;
  if (verify) return { status: 'verify', count: 1 };
  if (dryRun) return { status: 'applied', count: 1, code: source };
  const end = start + endMatch.index + endMatch[0].length;
  return { status: 'applied', count: 1, code: source.slice(0, start) + replacement + source.slice(end) };
}

const customPatches = [{
  order: 61,
  name: 'Context limit configurable',
  apply: applyContextLimitPatch,
}, {
  order: 62,
  name: 'Fast Messages protocol',
  apply: applyFastMessagesProtocolPatch,
}, {
  order: 63,
  name: 'Fast mode org check bypass',
  apply: applyFastModeOrgCheckPatch,
}, {
  order: 64,
  name: 'Claude API skill lazy docs',
  apply: applyClaudeApiSkillLazyDocsPatch,
}];

export const coreRegistry = Object.freeze({
  id: 'core',
  patches: Object.freeze(patches),
  customPatches: Object.freeze(customPatches),
});
