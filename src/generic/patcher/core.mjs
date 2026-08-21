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
    pattern: /(\.command\("update"\)\.alias\("upgrade"\)\.description\("[^"]+"\))(\.action\((?:[\w$]+\()?async\([^)]*\)=>\{)/g,
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
      `const __clawgodUpdateStatus=(()=>{const __fs=require('fs'),__path=require('path'),__os=require('os'),__cp=require('child_process');const __root=__path.join(__os.homedir(),'.clawgod'),__fetch=__path.join(__root,'fetch-file.mjs'),__bun=process.env.CLAWGOD_BUN_BIN||process.execPath;let __temporary='';try{let __installer=__path.join(__root,_w?'install.ps1':'install.sh'),__localVersion='',__installerVersions=[];try{__localVersion=__fs.readFileSync(__path.join(__root,'.clawgod-version'),'utf8').trim();const __installerSource=__fs.readFileSync(__installer,'utf8'),__versionPattern=_w?/^[$]ClawSelfVersion = "([^"\\r\\n]+)"/gm:/^CLAWGOD_SELF_VERSION="([^"\\r\\n]+)"/gm;__installerVersions=[...__installerSource.matchAll(__versionPattern)].map((__match)=>__match[1])}catch{}const __trustedLocal=/^[0-9]+[.][0-9]+[.][0-9]+(?:-claude[.][0-9]+[.][0-9]+[.][0-9]+(?:[.][0-9]+)?)?$/.test(__localVersion)&&__installerVersions.length===1&&__installerVersions[0]===__localVersion;if(!__trustedLocal){if(!__fs.existsSync(__fetch))throw new Error('managed fetch-file.mjs is missing; reinstall ClawGod Plus');__temporary=__fs.mkdtempSync(__path.join(__os.tmpdir(),'clawgod-update-'));if(!_w)__fs.chmodSync(__temporary,0o700);__installer=__path.join(__temporary,_w?'install.ps1':'install.sh');const __url='https://github.com/A6083450/clawgod-plus/releases/latest/download/'+(_w?'install.ps1':'install.sh');const __download=__cp.spawnSync(__bun,[__fetch,__url,__installer],{stdio:'inherit',env:process.env});if(__download.error)throw __download.error;if(__download.status===null)throw new Error('managed installer download did not return an exit status');if(__download.status!==0)return __download.status;}else process.stderr.write('[clawgod] using local installer (remote skipped): '+__installer+'\\n');const __command=_w?['powershell','-NoProfile','-ExecutionPolicy','Bypass','-File',__installer]:['bash',__installer];const __result=__cp.spawnSync(__command[0],__command.slice(1),{stdio:'inherit',env:{...process.env,CLAWGOD_NONINTERACTIVE:'1'}});if(__result.error)throw __result.error;if(__result.status===null)throw new Error('installer process did not return an exit status');return __result.status;}catch(__error){process.stderr.write('[clawgod] update failed: '+(__error&&__error.message?__error.message:String(__error))+'\\n');return 1;}finally{if(__temporary)__fs.rmSync(__temporary,{recursive:true,force:true});}})();` +
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
];

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
  order: 64,
  name: 'Claude API skill lazy docs',
  apply: applyClaudeApiSkillLazyDocsPatch,
}];

export const coreRegistry = Object.freeze({
  id: 'core',
  patches: Object.freeze(patches),
  customPatches: Object.freeze(customPatches),
});
