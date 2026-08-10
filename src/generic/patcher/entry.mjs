#!/usr/bin/env bun
/**
 * ClawGod Plus Universal Patcher — 正则模式匹配, 跨版本兼容
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET = join(__dirname, 'cli.original.cjs');
const BACKUP = TARGET + '.bak';
const ACORN_CACHE = join(__dirname, 'vendor', 'acorn.cjs');
const ACORN_URL = 'https://unpkg.com/acorn@8.16.0/dist/acorn.js';

async function loadAcorn() {
  try {
    if (!existsSync(ACORN_CACHE)) {
      mkdirSync(dirname(ACORN_CACHE), { recursive: true });
      const response = await fetch(ACORN_URL);
      if (!response.ok) return null;
      const temp = `${ACORN_CACHE}.${process.pid}.tmp`;
      writeFileSync(temp, await response.text(), 'utf8');
      renameSync(temp, ACORN_CACHE);
    }
    const module = await import(pathToFileURL(ACORN_CACHE).href);
    const acorn = typeof module.parse === 'function' ? module : module.default;
    return acorn && typeof acorn.parse === 'function' ? acorn : null;
  } catch {
    return null;
  }
}

function findNodes(node, predicate, results = []) {
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

function isChromeClientFactory(node) {
  let bodyStmts;
  if (node.body?.type === 'BlockStatement') bodyStmts = node.body.body;
  else return false;
  if (!node.params || node.params.length !== 1) return false;
  if (bodyStmts.length !== 1 || bodyStmts[0].type !== 'ReturnStatement') return false;
  const ret = bodyStmts[0].argument;
  if (!ret || ret.type !== 'ConditionalExpression') return false;
  if (ret.test?.type !== 'MemberExpression' || ret.test.property?.name !== 'bridgeConfig') return false;
  const alt = ret.alternate;
  if (!alt || alt.type !== 'ConditionalExpression') return false;
  if (alt.test?.type !== 'MemberExpression' || alt.test.property?.name !== 'getSocketPaths') return false;
  return true;
}

async function applyClaudeChromeSocketPatch(source, { dryRun, verify }) {
  const replacements = [];
  const seen = new Set();
  const needs = {
    clientFactory: !source.includes('__ccpp_bridge_fallback_v2'),
    subscriptionGate: !source.includes('__ccpp_sub_bypass'),
    subscriptionMsg: !source.includes('__ccpp_sub_msg_bypass'),
    selectBrowserHide: !source.includes('__ccpp_no_select_browser'),
  };

  function add(name, start, end, replacement) {
    if (!needs[name] || seen.has(name)) return;
    replacements.push({ name, start, end, replacement });
    seen.add(name);
  }

  const legacyClientFactoryRe = /function ([\w$]+)\(([\w$]+)\)\{if\(\2\.getSocketPaths\)\{var __paths=\2\.getSocketPaths\(\);if\(__paths&&__paths\.length>0\)return ([\w$]+\(\2\))\}return \2\.bridgeConfig\?([\w$]+\(\2\)):([\w$]+\(\2\))\}\/\*__ccpp_bridge_fallback\*\//g;
  const legacyClientFactory = legacyClientFactoryRe.exec(source);
  if (legacyClientFactory) {
    add(
      'clientFactory',
      legacyClientFactory.index,
      legacyClientFactory.index + legacyClientFactory[0].length,
      `function ${legacyClientFactory[1]}(${legacyClientFactory[2]}){return ${legacyClientFactory[2]}.getSocketPaths?${legacyClientFactory[3]}:${legacyClientFactory[2]}.bridgeConfig?${legacyClientFactory[4]}:${legacyClientFactory[5]}}/*__ccpp_bridge_fallback_v2*/`
    );
  }

  let parseSource = source;
  let offset = 0;
  if (parseSource.startsWith('#!')) {
    const idx = parseSource.indexOf('\n');
    if (idx >= 0) {
      offset = idx + 1;
      parseSource = parseSource.slice(offset);
    }
  }

  const acorn = Object.values(needs).some(Boolean) ? await loadAcorn() : null;
  if (acorn) {
    try {
      const ast = acorn.parse(parseSource, { ecmaVersion: 'latest', sourceType: 'module' });
      const src = (node) => parseSource.slice(node.start, node.end);
      const abs = (pos) => pos + offset;

      if (needs.clientFactory) {
        const funcs = [
          ...findNodes(ast, (n) => n.type === 'FunctionDeclaration'),
          ...findNodes(ast, (n) =>
            n.type === 'VariableDeclarator' &&
            n.init &&
            (n.init.type === 'ArrowFunctionExpression' || n.init.type === 'FunctionExpression')
          ),
        ];
        for (const node of funcs) {
          const fnNode = node.type === 'VariableDeclarator' ? node.init : node;
          if (!isChromeClientFactory(fnNode)) continue;
          const paramName = fnNode.params[0].name;
          const cond = fnNode.body.body[0].argument;
          const bridgeCall = src(cond.consequent);
          const socketCall = src(cond.alternate.consequent);
          const nativeCall = src(cond.alternate.alternate);
          add(
            'clientFactory',
            abs(fnNode.body.start),
            abs(fnNode.body.end),
            `{return ${paramName}.getSocketPaths?${socketCall}:${paramName}.bridgeConfig?${bridgeCall}:${nativeCall}}/*__ccpp_bridge_fallback_v2*/`
          );
          break;
        }
      }

      if (needs.subscriptionGate) {
        for (const decl of findNodes(ast, (n) => n.type === 'VariableDeclarator')) {
          if (!decl.init || decl.init.type !== 'LogicalExpression' || decl.init.operator !== '&&') continue;
          const left = decl.init.left;
          const right = decl.init.right;
          if (left.type !== 'CallExpression' || !left.arguments?.length) continue;
          const arg = left.arguments[0];
          if (!arg || arg.type !== 'MemberExpression' || arg.property?.name !== 'chrome') continue;
          if (right.type !== 'CallExpression' || right.arguments?.length !== 0) continue;
          const calleeName = left.callee?.name || left.callee?.property?.name;
          if (!calleeName) continue;
          const defs = findNodes(ast, (n) =>
            (n.type === 'FunctionDeclaration' && n.id?.name === calleeName) ||
            (n.type === 'VariableDeclarator' && n.id?.name === calleeName)
          );
          if (!defs.some((def) => src(def).includes('claudeInChromeDefaultEnabled'))) continue;
          add('subscriptionGate', abs(decl.init.start), abs(decl.init.end), `${src(left)}/*__ccpp_sub_bypass*/`);
          break;
        }
      }

      if (needs.subscriptionMsg) {
        const msgAnchor = 'Claude in Chrome requires a claude.ai subscription.';
        const msgPos = parseSource.indexOf(msgAnchor);
        if (msgPos >= 0) {
          const before = parseSource.slice(Math.max(0, msgPos - 200), msgPos);
          if (!before.includes('false&&')) {
            const logicals = findNodes(ast, (n) =>
              n.type === 'LogicalExpression' &&
              n.operator === '&&' &&
              n.start <= msgPos &&
              n.end >= msgPos &&
              n.left?.type === 'UnaryExpression' &&
              n.left.operator === '!'
            );
            if (logicals.length > 0) {
              const target = logicals.reduce((a, b) => (b.end - b.start) < (a.end - a.start) ? b : a);
              add('subscriptionMsg', abs(target.left.start), abs(target.left.end), 'false/*__ccpp_sub_msg_bypass*/');
            }
          }
        }
      }

      if (needs.selectBrowserHide) {
        const selectBrowserNodes = findNodes(ast, (n) => {
          if (n.type !== 'ObjectExpression') return false;
          return n.properties?.some((p) => p.key?.name === 'value' && p.value?.value === 'select-browser');
        });
        if (selectBrowserNodes.length > 0) {
          const sbNode = selectBrowserNodes[0];
          const pushCalls = findNodes(ast, (n) =>
            n.type === 'CallExpression' &&
            n.callee?.property?.name === 'push' &&
            n.start >= sbNode.start &&
            n.start - sbNode.end <= 200
          );
          if (pushCalls.length > 0) {
            add('selectBrowserHide', abs(pushCalls[0].start), abs(pushCalls[0].end), 'void 0/*__ccpp_no_select_browser*/');
          }
        }
      }
    } catch {}
  }

  // Regex fallback for the current minified bundle shape. The AST path above
  // handles name drift; this keeps install/repatch useful if acorn is absent.
  if (needs.clientFactory && !seen.has('clientFactory')) {
    const re = /function ([\w$]+)\(([\w$]+)\)\{return \2\.bridgeConfig\?([\w$]+\(\2\)):\2\.getSocketPaths\?([\w$]+\(\2\)):([\w$]+\(\2\))\}/g;
    const m = re.exec(source);
    if (m) add('clientFactory', m.index, m.index + m[0].length, `function ${m[1]}(${m[2]}){return ${m[2]}.getSocketPaths?${m[4]}:${m[2]}.bridgeConfig?${m[3]}:${m[5]}}/*__ccpp_bridge_fallback_v2*/`);
  }

  if (needs.subscriptionGate && !seen.has('subscriptionGate')) {
    const re = /(\b[\w$]+\(([\w$]+)\.chrome\);let [\w$]+=)([\w$]+\(\2\.chrome\))&&[\w$]+\(\)(?=,[\s\S]{0,1600}?tengu_claude_in_chrome_setup)/g;
    const m = re.exec(source);
    if (m) add('subscriptionGate', m.index, m.index + m[0].length, `${m[1]}${m[3]}/*__ccpp_sub_bypass*/`);
  }

  if (needs.subscriptionMsg && !seen.has('subscriptionMsg')) {
    const re = /(\b[\w$]+=)(![\w$]+)(&&[\s\S]{0,500}?"Claude in Chrome requires a claude\.ai subscription\.")/g;
    const m = re.exec(source);
    if (m) add('subscriptionMsg', m.index, m.index + m[0].length, `${m[1]}false/*__ccpp_sub_msg_bypass*/${m[3]}`);
  }

  if (needs.selectBrowserHide && !seen.has('selectBrowserHide')) {
    const re = /(\{label:"Select browser(?:\\u2026|\u2026)",value:"select-browser"\}[\s\S]{0,240}?)([\w$]+)\.push\(([\w$]+)\)/g;
    const m = re.exec(source);
    if (m) add('selectBrowserHide', m.index, m.index + m[0].length, `${m[1]}void 0/*__ccpp_no_select_browser*/`);
  }

  if (replacements.length === 0) {
    const hasChrome = source.includes('tengu_claude_in_chrome_setup') ||
      source.includes('Claude in Chrome requires a claude.ai subscription.') ||
      source.includes('select-browser');
    const allApplied = source.includes('__ccpp_bridge_fallback_v2') &&
      (source.includes('__ccpp_sub_bypass') || !source.includes('tengu_claude_in_chrome_setup')) &&
      (source.includes('__ccpp_sub_msg_bypass') || !source.includes('Claude in Chrome requires a claude.ai subscription.')) &&
      (source.includes('__ccpp_no_select_browser') || !source.includes('select-browser'));
    if (allApplied) return { status: 'already', detail: 'already applied' };
    if (!hasChrome) return { status: 'skipped', detail: 'not present in this version' };
    return { status: 'failed', detail: 'Chrome socket patterns not found' };
  }

  if (verify) return { status: 'verify', count: replacements.length };

  let next = source;
  if (!dryRun) {
    replacements.sort((a, b) => b.start - a.start);
    for (const r of replacements) next = next.slice(0, r.start) + r.replacement + next.slice(r.end);
  }
  return { status: 'applied', count: replacements.length, code: next };
}

async function applyContextLimitPatch(source, { dryRun, verify }) {
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

    // The large-message guard has the minified shape
    // `return message?tokenCount(message)>200000:!1`. Patch only that guard;
    // unrelated numeric thresholds and model metadata must stay upstream-owned.
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
  const acorn = await loadAcorn();
  if (acorn) {
    try {
      const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
      const envAssigns = findNodes(ast, (n) =>
        n.type === 'ExpressionStatement' &&
        n.expression?.type === 'CallExpression' &&
        n.expression.callee?.type === 'MemberExpression' &&
        n.expression.callee.object?.name === 'Object' &&
        n.expression.callee.property?.name === 'assign' &&
        n.expression.arguments?.length >= 2 &&
        n.expression.arguments[0]?.type === 'MemberExpression' &&
        n.expression.arguments[0].object?.name === 'process' &&
        n.expression.arguments[0].property?.name === 'env'
      );
      for (const stmt of envAssigns.slice(0, 6)) {
        if (source.startsWith(envReassign, stmt.end)) continue;
        replacements.push({ start: stmt.end, end: stmt.end, replacement: envReassign });
      }
    } catch {}
  }

  if (replacements.length === 0) return { status: 'already', detail: 'already applied' };
  if (verify) return { status: 'verify', count: replacements.length };

  let next = source;
  if (!dryRun) {
    replacements.sort((a, b) => b.start - a.start);
    for (const r of replacements) next = next.slice(0, r.start) + r.replacement + next.slice(r.end);
  }
  return { status: 'applied', count: replacements.length, code: next };
}

// ─── Regex-based patches (version-agnostic) ──────────────

const patches = [
  {
    name: 'USER_TYPE → ant',
    pattern: /function ([\w$]+)\(\)\{return"external"\}/g,
    replacer: (m, fn) => `function ${fn}(){return"ant"}`,
    sentinel: 'return"external"',
  },
  {
    // ClawGod Plus runs extracted cli.cjs under Bun even when Bun reports itself as
    // standalone. Special-case only the worker/daemon resolver; the shared
    // standalone predicate also controls Chrome and Computer Use MCP commands.
    name: 'Worker resolver for plain Bun cli.cjs (target shape)',
    pattern: /if\(([\w$]+)\(\)\)return\{cmd:process\.execPath,prefixArgs:\[\],target:process\.execPath\};let ([\w$]+)=process\.argv\[1\];if\(!\2\)return\{cmd:process\.execPath,prefixArgs:\[\],target:process\.execPath\};return\{cmd:process\.execPath,prefixArgs:\[\2\],target:\2\}/g,
    replacer: (m, standalone, entry) => `let ${entry}=process.argv[1];if(${entry}&&/(?:^|[\\/])cli\\.cjs$/.test(${entry}))return{cmd:process.execPath,prefixArgs:[${entry}],target:${entry}}/*__clawgod_plain_bun_worker__*/;if(${standalone}())return{cmd:process.execPath,prefixArgs:[],target:process.execPath};if(!${entry})return{cmd:process.execPath,prefixArgs:[],target:process.execPath};return{cmd:process.execPath,prefixArgs:[${entry}],target:${entry}}`,
    appliedMarker: '/*__clawgod_plain_bun_worker__*/',
    knownShape: /if\([\w$]+\(\)\)return\{cmd:process\.execPath,prefixArgs:\[\],target:process\.execPath\};let [\w$]+=process\.argv\[1\];if\(![\w$]+\)return\{cmd:process\.execPath,prefixArgs:\[\],target:process\.execPath\};return\{cmd:process\.execPath,prefixArgs:/,
    optional: true,
  },
  {
    name: 'Worker resolver for plain Bun cli.cjs (legacy shape)',
    pattern: /if\(([\w$]+)\(\)\)return\{cmd:process\.execPath,prefixArgs:\[\]\};let ([\w$]+)=process\.argv\[1\];if\(!\2\)return\{cmd:process\.execPath,prefixArgs:\[\]\};return\{cmd:process\.execPath,prefixArgs:\[\2\]\}/g,
    replacer: (m, standalone, entry) => `let ${entry}=process.argv[1];if(${entry}&&/(?:^|[\\/])cli\\.cjs$/.test(${entry}))return{cmd:process.execPath,prefixArgs:[${entry}]}/*__clawgod_plain_bun_worker__*/;if(${standalone}())return{cmd:process.execPath,prefixArgs:[]};if(!${entry})return{cmd:process.execPath,prefixArgs:[]};return{cmd:process.execPath,prefixArgs:[${entry}]}`,
    appliedMarker: '/*__clawgod_plain_bun_worker__*/',
    knownShape: /if\([\w$]+\(\)\)return\{cmd:process\.execPath,prefixArgs:\[\]\};let [\w$]+=process\.argv\[1\];if\(![\w$]+\)return\{cmd:process\.execPath,prefixArgs:\[\]\};return\{cmd:process\.execPath,prefixArgs:/,
    optional: true,
  },
  {
    name: 'GrowthBook env overrides',
    pattern: /function ([\w$]+)\(\)\{if\(!([\w$]+)\)\2=!0;return ([\w$]+)\}/g,
    replacer: (m, fn, flag, val) =>
      `function ${fn}(){if(!${flag}){${flag}=!0;try{let e=process.env.CLAUDE_INTERNAL_FC_OVERRIDES;if(e)${val}=JSON.parse(e)}catch(e){}}return ${val}}`,
    unique: true,  // must match exactly 1
    optional: true,  // v2.1.197+ refactored to schema-based env export; pattern no longer exists
  },
  {
    name: 'GrowthBook config overrides',
    pattern: /function ([\w$]+)\(\)\{return\}(function)/g,
    replacer: (m, fn, next) =>
      `function ${fn}(){return null}${next}`,
    selectIndex: 0,
    validate: (match, code) => {
      const pos = code.indexOf(match);
      const nearby = code.substring(Math.max(0, pos - 500), pos + 500);
      return nearby.includes('growthBook') || nearby.includes('GrowthBook') || nearby.includes('FeatureValue');
    },
  },
  {
    name: 'Agent Teams always enabled',
    pattern: /function ([\w$]+)\(\)\{if\(![\w$]+\(process\.env\.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS\)&&![\w$]+\(\)\)return!1;if\(![\w$]+\("tengu_amber_flint",!0\)\)return!1;return!0\}|function ([\w$]+)\(\)\{if\(![\w$]+\.[\w$]+&&![\w$]+\(\)\)return!1;if\(![\w$]+\("tengu_amber_flint",!0\)\)return!1;return!0\}/g,
    replacer: (m, fn1, fn2) => `function ${fn1||fn2}(){return!0}`,
    sentinel: 'tengu_amber_flint',
  },
  {
    // Session-aware launchers pass this metadata through the early view gate.
    name: 'Agents view session metadata',
    pattern: /function ([\w$]+)\(([\w$]+)\)\{for\(let ([\w$]+)=0;\3<\2\.length;\3\+\+\)\{let ([\w$]+)=\2\[\3\];if\((\4==="--debug"\|\|\4==="-d"\|\|\4==="--debug-to-stderr"\|\|\4==="-d2e"\|\|\4\.startsWith\("--debug="\)\|\|\4\.startsWith\("--debug-file="\))\)continue;if\(\4==="--debug-file"&&\3\+1<\2\.length\)\{\3\+\+;continue\}return!1\}return!0\}/g,
    replacer: (m, fn, args, index, arg, debugFlags) =>
      `function ${fn}(${args}){for(let ${index}=0;${index}<${args}.length;${index}++){let ${arg}=${args}[${index}];if(${debugFlags})continue;if(${arg}==="--debug-file"&&${index}+1<${args}.length){${index}++;continue}if(${arg}==="--session-id"/*__clawgod_agents_session_id__*/&&${index}+1<${args}.length){${index}++;continue}return!1}return!0}`,
    appliedMarker: '/*__clawgod_agents_session_id__*/',
    unique: true,
  },
  {
    // The launcher prepends --chrome to empty interactive starts. Upstream
    // parses that flag before this gate, so validate the remaining arguments;
    // otherwise defaultToAgentsView is never read.
    name: 'Default Agents view with auto Chrome',
    pattern: /,([\w$]+)=([\w$]+)\.hasAgentsPositional&&([\w$]+)\(([\w$]+)\);if\(\(\1\|\|\3\(([\w$]+)\)&&process\.stdin\.isTTY\)&&process\.stdout\.isTTY\)\{/g,
    replacer: (m, explicit, parsed, validator, rest) =>
      `,${explicit}=${parsed}.hasAgentsPositional&&${validator}(${rest});if((${explicit}||${validator}(${parsed}.rest/*__clawgod_default_agents_view__*/)&&process.stdin.isTTY)&&process.stdout.isTTY){`,
    appliedMarker: '/*__clawgod_default_agents_view__*/',
    knownShape: /hasAgentsPositional&&[\w$]+\([\w$]+\);if\(\([\w$]+\|\|[\w$]+\([\w$]+\)&&process\.stdin\.isTTY\)&&process\.stdout\.isTTY\)/,
    unique: true,
  },
  {
    // Keep the chat Agent list from crowding out the composer in short terminals.
    name: 'Chat Agent list fits terminal height',
    pattern: /\{columns:([\w$]+)\}=([\w$]+)\(\)([\s\S]{0,8000}?)\{windowStart:([\w$]+),windowEnd:([\w$]+),moreAbove:([\w$]+),moreBelow:([\w$]+)\}=([\w$]+)\(([\w$]+),([\w$]+)\.length,([\w$]+)\)/g,
    replacer: (m, columns, dimensions, middle, windowStart, windowEnd, moreAbove, moreBelow, windowFn, selected, tasks, limit) =>
      `{columns:${columns},rows:__clawgodTerminalRows}=${dimensions}(),__clawgodMaxChatAgentRows=Math.max(1,Math.min(${limit},__clawgodTerminalRows-6))${middle}{windowStart:${windowStart},windowEnd:${windowEnd},moreAbove:${moreAbove},moreBelow:${moreBelow}}=${windowFn}(${selected},${tasks}.length,__clawgodMaxChatAgentRows/*__clawgod_chat_agent_rows__*/)`,
    appliedMarker: '/*__clawgod_chat_agent_rows__*/',
    validate: (match, code) => code.substring(Math.max(0, code.indexOf(match) - 300), code.indexOf(match)).includes('showWorkflows'),
    optional: true,
    unique: true,
  },
  {
    name: 'Chat Agent list keeps overflow indicator',
    pattern: /([\w$]+)\.length>([\w$]+)&&([\w$]+)\.jsx\(([\w$]+),\{justifyContent:"flex-end",children:/g,
    replacer: (m, tasks, limit, react, box) =>
      `${tasks}.length>__clawgodMaxChatAgentRows/*__clawgod_chat_agent_more__*/&&${react}.jsx(${box},{justifyContent:"flex-end",children:`,
    appliedMarker: '/*__clawgod_chat_agent_more__*/',
    validate: (match, code) => {
      const marker = code.indexOf('/*__clawgod_chat_agent_rows__*/');
      const pos = code.indexOf(match);
      return marker >= 0 && pos > marker && pos - marker < 4000;
    },
    optional: true,
    unique: true,
  },
  {
    name: 'Agents directories default collapsed state',
    pattern: /,\[([\w$]+),([\w$]+)\]=([\w$]+)\.useState\(\(\)=>\{let [\w$]+=[\w$]+;return new Set\([\s\S]{0,500}?\)\}\),([\w$]+)=\3\.useRef\(\1\);\4\.current=\1;let\[[\w$]+,[\w$]+\]=\3\.useState\(\(\)=>new Set\)/g,
    replacer: (m, collapsed, setCollapsed, react, collapsedRef) => {
      const anchor = `${collapsedRef}=${react}.useRef(${collapsed});${collapsedRef}.current=${collapsed};`;
      return m.replace(anchor, `${anchor}let __clawgodShouldDefaultCollapseDirectories=${react}.useRef(${collapsed}.size===0),__clawgodCollapsedDirectoryKeys=${react}.useRef(new Set),__clawgodSetCollapsedGroups=${setCollapsed},__clawgodReact=${react};/*__clawgod_collapsed_directory_state__*/`);
    },
    appliedMarker: '/*__clawgod_collapsed_directory_state__*/',
    optional: true,
    unique: true,
  },
  {
    name: 'Agents directories default collapsed rows',
    pattern: /if\(([\w$]+)\.size>0\)([\w$]+)=\2\.filter\(\(([\w$]+)\)=>\3\.kind==="header"\|\|!\1\.has\(([\w$]+)\(\3\.group\)\)\);function /g,
    replacer: (m, collapsed, rows, row, groupKey) =>
      `__clawgodReact.useLayoutEffect(()=>{let keys=[];if(__clawgodShouldDefaultCollapseDirectories.current)for(let row of ${rows})if(row.kind==="header"){let key=${groupKey}(row.group);if(key.startsWith("directory:")&&!__clawgodCollapsedDirectoryKeys.current.has(key))__clawgodCollapsedDirectoryKeys.current.add(key),keys.push(key)}__clawgodSetCollapsedGroups((current)=>{let next=new Set(current),changed=!1,marker="group:__clawgod_expanded_directories__";if(!next.has(marker))next.add(marker),changed=!0;for(let key of keys)if(!next.has(key))next.add(key),changed=!0;return changed?next:current})},[${rows}]);${m.replace(`${collapsed}.size>0`, `${collapsed}.size/*__clawgod_default_collapsed_directories__*/>0`)}`,
    appliedMarker: '/*__clawgod_default_collapsed_directories__*/',
    validate: (match, code) => code.includes('/*__clawgod_collapsed_directory_state__*/'),
    optional: true,
    unique: true,
  },
  {
    // API-key and setup-token sessions expose only user:inference, but local
    // socket mode does not require Claude.ai OAuth scopes. Respect --chrome.
    name: 'Claude in Chrome OAuth scope bypass',
    pattern: /function ([\w$]+)\(([\w$]+)\)\{if\(![\w$]+\(\)\)return [\w$]+\("\[Claude in Chrome\] Disabled: OAuth token has no scope accepted by \/api\/oauth\/validate[^"]*"\),!1;if\(\2===!0\)return!0;/g,
    replacer: (m, fn, arg) => `function ${fn}(${arg}){/*__ccpp_chrome_oauth_scope_bypass*/if(${arg}===!0)return!0;`,
    appliedMarker: '/*__ccpp_chrome_oauth_scope_bypass*/',
    optional: true,
  },
  {
    // `claude --chrome agents` enables Chrome tools in the Fleet View host, but
    // upstream only persists a narrow config subset into dispatched background
    // jobs. Preserve the Chrome flag so sessions created from `claude agents`
    // keep `claude-in-chrome` after attach/respawn.
    name: 'Claude in Chrome agents config state',
    pattern: /([\w$]+)=\{addDir:\[\],pluginDir:\[\],pluginDirNoMcp:\[\],settings:void 0,mcpConfig:\[\],strictMcpConfig:!1\}/g,
    replacer: (m, cfg) => `${cfg}={addDir:[],pluginDir:[],pluginDirNoMcp:[],settings:void 0,mcpConfig:[],strictMcpConfig:!1,chrome:!1,noChrome:!1}`,
    appliedMarker: /[\w$]+=\{addDir:\[\],pluginDir:\[\],pluginDirNoMcp:\[\],settings:void 0,mcpConfig:\[\],strictMcpConfig:!1,chrome:!1,noChrome:!1\}/,
    validate: (match, code) => !code.includes('strictMcpConfig:!1,chrome:!1,noChrome:!1'),
  },
  {
    name: 'Claude in Chrome agents flag parser',
    pattern: /if\(([\w$]+)==="--strict-mcp-config"\)\{([\w$]+)\.strictMcpConfig=!0;continue\}/g,
    replacer: (m, arg, cfg) => `if(${arg}==="--chrome"){${cfg}.chrome=!0;continue}if(${arg}==="--no-chrome"){${cfg}.noChrome=!0;continue}` + m,
    appliedMarker: /if\([\w$]+==="--chrome"\)\{[\w$]+\.chrome=!0;continue\}if\([\w$]+==="--no-chrome"\)\{[\w$]+\.noChrome=!0;continue\}/,
    validate: (match, code) => !/if\([\w$]+==="--chrome"\)\{[\w$]+\.chrome=!0;continue\}/.test(code),
  },
  {
    name: 'Claude in Chrome agents config resolver',
    pattern: /strictMcpConfig:([\w$]+)\.strictMcpConfig\}\}function ([\w$]+)/g,
    replacer: (m, cfg, fn) => `strictMcpConfig:${cfg}.strictMcpConfig,chrome:${cfg}.chrome&&!${cfg}.noChrome,noChrome:${cfg}.noChrome}}function ${fn}`,
    appliedMarker: /chrome:[\w$]+\.chrome&&![\w$]+\.noChrome,noChrome:[\w$]+\.noChrome/,
    validate: (match, code) => !/chrome:[\w$]+\.chrome&&![\w$]+\.noChrome/.test(code),
  },
  {
    name: 'Claude in Chrome agents dispatch args',
    pattern: /\.\.\.e\.strictMcpConfig\?\["--strict-mcp-config"\]:\[\]\]\}/g,
    replacer: () => '...e.chrome?["--chrome"/*__ccpp_agents_chrome_dispatch*/]:[],...e.noChrome?["--no-chrome"]:[],...e.strictMcpConfig?["--strict-mcp-config"]:[]]}',
    appliedMarker: '__ccpp_agents_chrome_dispatch',
    validate: (match, code) => !code.includes('__ccpp_agents_chrome_dispatch'),
  },
  {
    name: 'Computer Use subscription bypass',
    pattern: /function ([\w$]+)\(\)\{let [\w$]+=[\w$]+\(\);return [\w$]+==="max"\|\|[\w$]+==="pro"\}/g,
    replacer: (m, fn) => `function ${fn}(){/*__clawgod_computer_use_subscription__*/return!0}`,
    appliedMarker: '/*__clawgod_computer_use_subscription__*/',
  },
  {
    name: 'Computer Use default enabled',
    pattern: /([\w$]+=)\{enabled:!1,pixelValidation/g,
    replacer: (m, prefix) => `${prefix}{enabled:!0,pixelValidation`,
    sentinel: '{enabled:!1,pixelValidation',
  },
  {
    // v2.1.92+ shape: name:"ultraplan",get description(){...},argumentHint:"<prompt>",isEnabled:()=>fnRef()
    // Older shape  : name:"ultraplan",description:`...`,argumentHint:"<prompt>",isEnabled:()=>!1
    // The middle metadata block changed from a literal description to a getter,
    // and the gate switched from a literal !1 to a GrowthBook-flag-check function call.
    // Match both.
    name: 'Ultraplan enable',
    pattern: /(name:"ultraplan",[\s\S]{1,500}?argumentHint:"<prompt>",isEnabled:\(\)=>)(?:!1|[\w$]+\(\))/g,
    replacer: (m, prefix) => `${prefix}!0`,
    sentinel: 'name:"ultraplan"',
    appliedMarker: 'argumentHint:"<prompt>",isEnabled:()=>!0',
  },
  {
    // ≤v2.1.110: function X(){return Y("tengu_review_bughunter_config",null)?.enabled===!0}
    // v2.1.119+: function X(){return Y("tengu_review_bughunter_config",null)} — bare getter
    // v2.1.152+: same bare-getter shape, config also feeds cost_note/duration_note/model
    // v2.1.214+: config key moved to a variable:
    //   var Yau="tengu_review_bughunter_config";
    //   function Fot(){return et(Yau,null)}
    //   function rQt(){return Fot()?.enabled===!0&&ru()&&!J6()}
    //   Patch rQt to always return true so ultrareview is unlocked.
    //   Also match the old direct-literal form for <=2.1.213 compat.
    name: 'Ultrareview enable (rQt gate)',
    pattern: /function ([\w$]+)\(\)\{return ([\w$]+)\(\)\?\.enabled===!0&&[\w$]+\(\)&&![\w$]+\(\)\}/g,
    replacer: (m, fn) => `function ${fn}(){/*__clawgod_ultrareview_enabled__*/return!0}`,
    optional: true,
    appliedMarker: '/*__clawgod_ultrareview_enabled__*/',
  },
  {
    name: 'Ultrareview enable (direct literal, <=2.1.213)',
    pattern: /function ([\w$]+)\(\)\{return ([\w$]+)\("tengu_review_bughunter_config",null\)(\?\.enabled===!0)?\}/g,
    replacer: (m, fn, getter, gate) =>
      gate
        ? `function ${fn}(){return!0}`
        : `function ${fn}(){let _r=${getter}("tengu_review_bughunter_config",null);return _r?{..._r,enabled:!0}:{enabled:!0}}`,
    optional: true,
    sentinel: '("tengu_review_bughunter_config",null)',
    appliedMarker: ',enabled:!0}:{enabled:!0}}',
  },
  {
    // v2.1.215+: the getter now uses a variable indirection — e.g.
    //   function Bot(){return et(ulu,null)}   (ulu = "tengu_review_bughunter_config")
    //   function oQt(){return Bot()?.enabled===!0&&ru()&&!X6()}
    // The old pattern can't match because et() receives a variable, not the
    // literal string. Match the getter (which uses ulu) and gate function
    // together. The ulu variable reference is unique to this feature.
    name: 'Ultrareview enable (v2.1.215+ gate)',
    pattern: /(function ([\w$]+)\(\)\{return [\w$]+\(ulu,null\)\})([\s\S]{0,1500}?)(function ([\w$]+)\(\)\{return \2\(\)\?\.enabled===!0&&[\w$]+\(\)&&![\w$]+\(\)\})/g,
    replacer: (m, getterDef, getter, between, gateDef, gate) =>
      `${getterDef}${between}function ${gate}(){/*__clawgod_ultrareview_enabled__*/return!0}`,
    sentinel: 'var ulu="tengu_review_bughunter_config"',
    appliedMarker: '/*__clawgod_ultrareview_enabled__*/',
  },
  {
    name: 'Computer Use gate bypass',
    pattern: /function ([\w$]+)\(\)\{if\([\w$]+\("hipaa"\)\)return\s*!1;return [\w$]+\(\)&&[\w$]+\(\)\.enabled\}/g,
    replacer: (m, fn) => `function ${fn}(){/*__clawgod_computer_use_gate__*/return!0}`,
    sentinel: '"hipaa"',
    appliedMarker: '/*__clawgod_computer_use_gate__*/',
  },
  {
    // Streaming clients such as cmux provide permission prompts over stdio,
    // so Computer Use is safe and expected there too.
    name: 'Computer Use in noninteractive sessions',
    pattern: /if\(([\w$]+)\(\)==="macos"&&!([\w$]+)\(\)&&([\w$]+)\(\)\)try\{let\{setupComputerUseMCP:/g,
    replacer: (m, platform, isNonInteractive, gate) =>
      `if(${platform}()==="macos"&&${gate}())/*__clawgod_computer_use_noninteractive__*/try{let{setupComputerUseMCP:`,
    sentinel: 'setupComputerUseMCP',
    appliedMarker: '/*__clawgod_computer_use_noninteractive__*/',
  },
  {
    // ≤v2.1.18x: voice mode was GrowthBook-killable via
    //   function X(){return!Y("tengu_amber_quartz_disabled",!1)}
    // v2.1.183 removed that flag entirely; voice mode is now gated only by real
    // requirements — a Claude.ai account (hT(): if(!hT())return "...requires a
    // Claude.ai account...") plus microphone permission — neither a bypassable
    // flag. Faking the auth gate would show voice as available then fail at the
    // stream layer (voice_stream_no_auth), so there is nothing to bypass on
    // current builds. optional keeps it working on older bundles that still ship
    // the kill-flag, without a false "0 matches — cannot verify".
    name: 'Voice Mode enable (bypass GrowthBook kill)',
    pattern: /function ([\w$]+)\(\)\{return![\w$]+\("tengu_amber_quartz_disabled",!1\)\}/g,
    replacer: (m, fn) => `function ${fn}(){return!0}`,
    optional: true,
  },
  {
    // v2.1.158+: provider gate refactored into helper function:
    //   function mw$(H){if(H==="firstParty"||H==="anthropicAws")return!0;return CH(process.env.CLAUDE_CODE_ENABLE_AUTO_MODE)}
    //   Called as: if(!mw$(q))return!1;  inside the auto-mode model gate.
    //   Lookahead ensures we only strip the call inside the auto-mode gate
    //   (the next 300 chars must contain !=="firstParty") and not unrelated
    //   if(!fn(x))return!1; patterns elsewhere.
    //   Not present in ≤v2.1.149 (provider gate was inline).
    name: 'Auto-mode unlock for third-party API (provider helper gate)',
    pattern: /if\(!([\w$]+)\(([\w$]+)\)\)return!1;(?=(?:(?!function\s).){0,300}!=="firstParty")/g,
    replacer: () => '',
    optional: true,
  },
  {
    // ≤v2.1.149: if(Y!=="firstParty"&&Y!=="anthropicAws")return!1;
    // v2.1.158+: if(q!=="firstParty"&&q!=="anthropicAws"&&($==="claude-opus-4-6"||…))return!1;
    // v2.1.214+: if(r!=="firstParty"&&!d6(r)&&(t==="claude-opus-4-6"||…))return!1;
    //   "anthropicAws" replaced by helper function !fn(var).
    //   Match both: \1!=="anthropicAws" OR !fn(\1).
    // [^;]* absorbs the optional model-condition tail safely. This patch is
    // optional because newer bundles may use the provider helper below.
    name: 'Auto-mode unlock for third-party API (inline gate)',
    pattern: /if\(([\w$]+)!=="firstParty"&&(?:\1!=="anthropicAws"|![\w$]+\(\1\))[^;]*\)return!1;/g,
    replacer: () => '',
    optional: true,
  },
  {
    // v2.1.158+: the auto-mode provider opt-in helper. Older bundles gated it
    // at the call site (if(!mw$(q))return!1;) — see 'provider helper gate'
    // above. By v2.1.183 the call site became a warning-message branch
    // (else if(!_kt(xr()))p="provider",...) so the call-site strip no longer
    // matches. The helper shape is unchanged, so neutralize it directly —
    // every provider becomes auto-mode eligible without needing the
    // CLAUDE_CODE_ENABLE_AUTO_MODE opt-in:
    //   function _kt(e){if(e==="firstParty"||e==="anthropicAws")return!0;return st(process.env.CLAUDE_CODE_ENABLE_AUTO_MODE)}
    name: 'Auto-mode unlock for third-party API (provider opt-in helper)',
    pattern: /function ([\w$]+)\(([\w$]+)\)\{if\(\2==="firstParty"\|\|\2==="anthropicAws"\)return!0;return [\w$]+\(process\.env\.CLAUDE_CODE_ENABLE_AUTO_MODE\)\}/g,
    replacer: (m, fn) => `function ${fn}(){return!0}`,
    sentinel: 'process.env.CLAUDE_CODE_ENABLE_AUTO_MODE)}',
  },
  {
    // CLI subcommand registered via commander chain:
    //   .command("update").alias("upgrade").description("…").action(async()=>{…})
    // The original action's update path is broken under clawgod: detectInstallType()
    // returns "unknown" because the launcher hides our cli.cjs from upstream's
    // path heuristics, and the unknown-fallback branch on macOS overwrites
    // ~/.bun/bin/bun by extracting the bun runtime out of the new native binary
    // (preserving Apr-19-build mtime). That **silently downgrades** clawgod's
    // required Bun and crashes cli.original.cjs the next launch with
    // "Expected CommonJS module to have a function wrapper". On Windows the
    // same fallback writes the new binary somewhere our drift detection
    // doesn't scan, so the user sees "Successfully updated" but never gets
    // the new version.
    //
    // Redirect to clawgod's own self-update so the upgrade goes through
    // install.sh (re-extract + re-patch + re-launcher). Always pull the
    // latest install.sh from the release so users get patcher fixes too.
    // Escape hatch printed on every run: `install.sh --uninstall` restores
    // claude.orig and lets vanilla `claude update` work again.
    name: "Redirect `claude update` to clawgod self-update",
    pattern: /(\.command\("update"\)\.alias\("upgrade"\)\.description\("[^"]+"\))(\.action\(async\(\)=>\{)/g,
    replacer: (m, chain, action) => {
      return (
        chain + '.allowUnknownOption()' + action +
        `const __clawgodUpdateIndex=process.argv.findIndex(a=>a==="update"||a==="upgrade");` +
        `const __clawgodUpdateArgs=__clawgodUpdateIndex>=0?process.argv.slice(__clawgodUpdateIndex+1):[];` +
        `const __clawgodVersionIndex=__clawgodUpdateArgs.indexOf("--version");` +
        `if(__clawgodVersionIndex>=0&&__clawgodUpdateArgs[__clawgodVersionIndex+1])process.env.CLAWGOD_VERSION=__clawgodUpdateArgs[__clawgodVersionIndex+1];` +
        `if(__clawgodUpdateArgs.includes("--no-upgrade"))process.env.CLAWGOD_NO_UPGRADE="1";` +
        `if(__clawgodUpdateArgs.includes("--lean-off"))process.env.CLAWGOD_LEAN_OFF="1";` +
        `if(__clawgodUpdateArgs.includes("--lean-on"))process.env.CLAWGOD_LEAN_ON="1";` +
        `if(__clawgodUpdateArgs.includes("--lean-max"))process.env.CLAWGOD_LEAN_MAX="1";` +
        `process.stderr.write("[clawgod] 'claude update' is handled by clawgod self-update.\\n[clawgod] To leave clawgod and use vanilla update: bash ~/.clawgod/install.sh --uninstall\\n[clawgod] Continuing now\\u2026\\n");` +
        `const _w=process.platform==='win32';` +
        `const __clawgodUpdateStatus=(()=>{const __fs=require('fs'),__path=require('path'),__os=require('os'),__cp=require('child_process');const __root=__path.join(__os.homedir(),'.clawgod'),__fetch=__path.join(__root,'fetch-file.mjs'),__bun=process.env.CLAWGOD_BUN_BIN||process.execPath;let __temporary='';try{let __installer=__path.join(__root,_w?'install.ps1':'install.sh');if(!__fs.existsSync(__installer)){if(!__fs.existsSync(__fetch))throw new Error('managed fetch-file.mjs is missing; reinstall ClawGod Plus');__temporary=__fs.mkdtempSync(__path.join(__os.tmpdir(),'clawgod-update-'));if(!_w)__fs.chmodSync(__temporary,0o700);__installer=__path.join(__temporary,_w?'install.ps1':'install.sh');const __url='https://github.com/A6083450/clawgod-plus/releases/latest/download/'+(_w?'install.ps1':'install.sh');const __download=__cp.spawnSync(__bun,[__fetch,__url,__installer],{stdio:'inherit',env:process.env});if(__download.error)throw __download.error;if(__download.status===null)throw new Error('managed installer download did not return an exit status');if(__download.status!==0)return __download.status;}else process.stderr.write('[clawgod] using local installer (remote skipped): '+__installer+'\\n');const __command=_w?['powershell','-NoProfile','-ExecutionPolicy','Bypass','-File',__installer]:['bash',__installer];const __result=__cp.spawnSync(__command[0],__command.slice(1),{stdio:'inherit',env:process.env});if(__result.error)throw __result.error;if(__result.status===null)throw new Error('installer process did not return an exit status');return __result.status;}catch(__error){process.stderr.write('[clawgod] update failed: '+(__error&&__error.message?__error.message:String(__error))+'\\n');return 1;}finally{if(__temporary)__fs.rmSync(__temporary,{recursive:true,force:true});}})();` +
        `process.exit(__clawgodUpdateStatus);`
      );
    },
    sentinel: '.command("update").alias("upgrade")',
    appliedMarker: "[clawgod] 'claude update' is handled by clawgod self-update.",
  },
  // ── 绿色主题 (patch 标识) ──

  {
    name: 'Logo + brand color → green (RGB dark)',
    pattern: /clawd_body:"rgb\(215,119,87\)"/g,
    replacer: () => 'clawd_body:"rgb(34,197,94)"',
    sentinel: 'clawd_body:"rgb(215,119,87)"',
  },
  {
    name: 'Logo + brand color → green (ANSI)',
    pattern: /clawd_body:"ansi:redBright"/g,
    replacer: () => 'clawd_body:"ansi:greenBright"',
    sentinel: 'clawd_body:"ansi:redBright"',
  },
  {
    name: 'Theme claude color → green (dark)',
    pattern: /claude:"rgb\(215,119,87\)"/g,
    replacer: () => 'claude:"rgb(34,197,94)"',
    sentinel: 'claude:"rgb(215,119,87)"',
  },
  {
    name: 'Theme claude color → green (light)',
    pattern: /claude:"rgb\(255,153,51\)"/g,
    replacer: () => 'claude:"rgb(22,163,74)"',
    sentinel: 'claude:"rgb(255,153,51)"',
  },
  {
    name: 'Shimmer → green',
    pattern: /claudeShimmer:"rgb\(2[34]5,1[45]9,1[12]7\)"/g,
    replacer: () => 'claudeShimmer:"rgb(74,222,128)"',
    appliedMarker: 'claudeShimmer:"rgb(74,222,128)"',
  },
  {
    name: 'Shimmer light → green',
    pattern: /claudeShimmer:"rgb\(255,183,101\)"/g,
    replacer: () => 'claudeShimmer:"rgb(34,197,94)"',
    sentinel: 'claudeShimmer:"rgb(255,183,101)"',
  },
  {
    name: 'Hex brand color → green',
    pattern: /#da7756/g,
    replacer: () => '#22c55e',
    sentinel: '#da7756',
  },
  {
    name: 'Theme claude color → green (ANSI)',
    pattern: /claude:"ansi:redBright"/g,
    replacer: () => 'claude:"ansi:greenBright"',
  },
  {
    name: 'Shimmer → green (ANSI)',
    pattern: /claudeShimmer:"ansi:yellowBright"/g,
    replacer: () => 'claudeShimmer:"ansi:greenBright"',
  },
  {
    name: 'Brief label claude color → green (RGB dark)',
    pattern: /briefLabelClaude:"rgb\(215,119,87\)"/g,
    replacer: () => 'briefLabelClaude:"rgb(34,197,94)"',
  },
  {
    name: 'Brief label claude color → green (RGB light)',
    pattern: /briefLabelClaude:"rgb\(255,153,51\)"/g,
    replacer: () => 'briefLabelClaude:"rgb(22,163,74)"',
  },
  {
    name: 'Brief label claude color → green (ANSI)',
    pattern: /briefLabelClaude:"ansi:redBright"/g,
    replacer: () => 'briefLabelClaude:"ansi:greenBright"',
  },

  // ── macOS Cmd+V 图片粘贴修复 ──

  {
    // Under Bun runtime (clawgod), macOS Cmd+V pastes the image file path
    // as text instead of triggering the clipboard image read. The paste
    // handler detects the path as an image file (rju), tries to read it
    // via nju, fails, and falls through to display the raw path as text.
    //
    // The paste handler flow:
    //   1. Empty text + macOS → clipboard reader (m()) — works ✓
    //   2. Text with paths → rju() detects image paths → nju() reads files
    //   3. If reads succeed → display images ✓
    //   4. If ALL reads fail → else branch:
    //      else if(N&&d) m()   ← N = TemporaryItems/screenshot check
    //      else We("input_image_drag","read_failed"), g(x), y()
    //
    // Bug: the else-if only calls clipboard reader (m) for macOS screenshot
    // temp paths (N = /TemporaryItems/...screencaptureui/.../Screenshot/).
    // For other image paths (Preview, Finder, web copies), the final else
    // types the raw path as text.
    //
    // Note: there's also a fallback inside the if(W.length>0) block:
    //   if(W.length===0&&k.length>0){...if(d&&O.length===0){m();return}...}
    // But that's dead code — when all reads fail (W.length===0 && P.length===0),
    // the outer if(W.length>0||P.length>0) is false, so we skip straight to
    // the else branch.
    //
    // Shape:
    //   }else if(N&&d)m();else We("input_image_drag","read_failed"),g(x),y()
    //
    // Patched:
    //   }else if(d)m();else We("input_image_drag","read_failed"),g(x),y()
    //
    // Always try clipboard reader on macOS when image path reads failed,
    // not just for TemporaryItems screenshot paths.
    name: 'macOS Cmd+V image paste fallback to clipboard read',
    pattern: /\}else if\(([\w$]+)&&([\w$]+)\)([\w$]+)\(\);else ([\w$]+)\("input_image_drag","read_failed"\),([\w$]+)\(([\w$]+)\),([\w$]+)\(\)/g,
    replacer: (m, N, d, mFn, We, g, x, y) =>
      `}else if(${d})${mFn}();else ${We}("input_image_drag","read_failed"),${g}(${x}),${y}()`,
    sentinel: '"input_image_drag","read_failed"',
    optional: true,
  },
  {
    // Current bundles restructured the paste handler: the clipboard-read
    // fallback above is now unconditional upstream, but the image processor
    // loader only tries the vendored native image-processor.node behind the
    // standalone-executable predicate:
    //
    //   async function N8e(){
    //     if(tco)return tco.default;
    //     if(WE())try{let r=await Promise.resolve().then(() => (Blo(),Flo)),n=r.sharp||r.default;return tco={default:n},n}
    //     catch{console.warn("Native image processor not available, falling back to sharp")}
    //     let e=await Promise.resolve().then(() => R(vAu(),1)),t=gGg(e);  // import("sharp")
    //     ...
    //
    // ClawGod Plus runs under Bun, whose standalone predicate may not reflect the
    // extracted module layout, so the native branch can be skipped and the npm
    // "sharp" fallback throws
    // (nothing is installed under ~/.clawgod) → the paste image read throws →
    // the paste handler's .catch types the raw temp PNG path as text instead
    // of attaching [Image #N]. Terminals like Ghostty always paste clipboard
    // images as temp file paths, so this breaks Cmd+V image paste entirely.
    //
    // The native branch (vendor/image-processor/<arch>-<platform>/*.node,
    // resolved relative to cli.cjs) works fine under clawgod — the installer
    // vendors it. Drop the gate so the native loader is always tried first;
    // the catch still falls back to the npm sharp import on failure.
    //
    // appliedMarker (not sentinel): the warn string intentionally survives in
    // the patched output, so it cannot distinguish "stale regex" from
    // "already patched".
    name: 'Image paste: try native image processor regardless of standalone gate',
    pattern: /if\(([\w$]+)\(\)\)(try\{let [\w$]+=await Promise\.resolve\(\)\.then\(\(\)\s*=>\s*\([\w$]+\(\),[\w$]+\)\),[\w$]+=[\w$]+\.sharp\|\|[\w$]+\.default;return [\w$]+=\{default:[\w$]+\},[\w$]+\}catch\{console\.warn\("Native image processor not available, falling back to sharp"\)\})/g,
    replacer: (m, gate, body) => body,
    appliedMarker: /return [\w$]+\.default;try\{let [\w$]+=await Promise\.resolve\(\)\.then\(\(\)\s*=>\s*\([\w$]+\(\),[\w$]+\)\)/,
  },
  {
    // macOS clipboard managers can paste copied images as escaped TIFF paths.
    // The native file decoder does not support TIFF, but classifying these as
    // image paths makes the existing macOS failure branch read the clipboard
    // directly, where readClipboardImage converts the image to PNG.
    name: 'Image paste: recognize TIFF paths for macOS clipboard fallback',
    pattern: /([\w$]+)=\/\\\.\(png\|jpe\?g\|gif\|webp\)\$\/i(?=;[\w$]+=\/\^\(\?:\[A-Za-z\]:\\\\\|\\\\\\\\\)\/)/g,
    replacer: (m, imagePathRe) => `${imagePathRe}=/\\.(png|jpe?g|gif|webp|tiff?)$/i`,
    sentinel: '/\\.(png|jpe?g|gif|webp)$/i;',
    appliedMarker: '/\\.(png|jpe?g|gif|webp|tiff?)$/i;',
    unique: true,
  },
  {
    // URLs ending in an image extension are text, not local image paths.
    name: 'Image paste: keep HTTP image URLs as text',
    pattern: /function ([\w$]+)\(([\w$]+)\)\{let ([\w$]+)=([\w$]+)\(\2\.trim\(\)\),([\w$]+)=([\w$]+)\(\3\);return ([\w$]+)\.test\(\5\)\}/g,
    replacer: (m, fn, value, quoted, unquote, path, unescape, imagePathRe) =>
      `function ${fn}(${value}){let ${quoted}=${unquote}(${value}.trim()),${path}=${unescape}(${quoted});return!/^https?:\\/\\//i.test(${path})&&${imagePathRe}.test(${path})}`,
    appliedMarker: '/^https?:\\/\\//i.test(',
    unique: true,
  },

  // ── Glob/Grep 工具恢复 ──

  {
    // Bun inlines EMBEDDED_SEARCH_TOOLS env as literal "true" at compile time.
    // This makes bC() always return true → Wft() returns the shadow set
    // containing "Glob" and "Grep" → those tools are hidden from the user.
    // Under clawgod (Bun runtime, not native binary) the env is unset, but
    // the code still says ct("true") instead of ct(process.env.EMBEDDED_SEARCH_TOOLS).
    //
    // Shape:
    //   function bC(){if(!ct("true"))return!1;if(mEr())return!1;
    //     return process.env.CLAUDE_CODE_ENTRYPOINT!=="local-agent"}
    //
    // Patch: replace ct("true") with ct(process.env.EMBEDDED_SEARCH_TOOLS)
    // so the guard reads the actual env var (unset → falsy → return false →
    // Glob/Grep tools available).
    name: 'Restore Glob/Grep tools (un-inline EMBEDDED_SEARCH_TOOLS)',
    pattern: /function ([\w$]+)\(\)\{if\(!([\w$]+)\("true"\)\)return!1;if\([\w$]+\(\)\)return!1;return process\.env\.CLAUDE_CODE_ENTRYPOINT!=="local-agent"\}/g,
    replacer: (m, fn, envCheck) =>
      `function ${fn}(){if(!${envCheck}(process.env.EMBEDDED_SEARCH_TOOLS))return!1;if(typeof globalThis.__dpBinOk>"u"){try{var _w=process.platform==="win32"?"where":"which";require("child_process").execFileSync(_w,["bfs"],{timeout:2e3});require("child_process").execFileSync(_w,["ugrep"],{timeout:2e3});globalThis.__dpBinOk=!0}catch{globalThis.__dpBinOk=!1}}if(!globalThis.__dpBinOk)return!1;return process.env.CLAUDE_CODE_ENTRYPOINT!=="local-agent"}`,
    sentinel: 'ct("true")',
    optional: true,
  },

  // ── 地区隐写中和 (v2.1.197+) ──

  {
    // v2.1.197+: geo-steganography in system prompt date string.
    // qla(e) builds "Today{apostrophe}s date is {date}." where:
    //   - the apostrophe encodes proxy-detection state (U+0027/U+2019/U+02BC/U+02B9)
    //   - the date separator encodes timezone (- for non-CN, / for CN)
    //
    // Shape:
    //   function qla(e){let t=rdp(),n=odp(t?.known??!1,t?.labKw??!1),
    //     r=t?.cnTZ?e.replaceAll("-","/"):e;return`Today${n}s date is ${r}.`}
    //
    // Patch: replace entire function body to always use ASCII apostrophe
    // and pass through the date string unmodified.
    name: 'Neutralize geo-steganography in date string (qla)',
    pattern: /function ([\w$]+)\([\w$]+\)\{let [\w$]+=[\w$]+\(\),[\w$]+=[\w$]+\([\w$]+\?\.[\w$]+\?\?!1,[\w$]+\?\.[\w$]+\?\?!1\),[\w$]+=[\w$]+\?\.[\w$]+\?[\w$]+\.replaceAll\("-","\/"\):[\w$]+;return`Today\$\{[\w$]+\}s date is \$\{[\w$]+\}\.`\}/g,
    replacer: (m) => {
      // Extract function name and parameter name from the match
      const fnMatch = m.match(/^function ([\w$]+)\(([\w$]+)\)/);
      if (!fnMatch) return m;
      const [, fn, param] = fnMatch;
      return `function ${fn}(${param}){return\`Today's date is \${${param}}.\`}`;
    },
    sentinel: 'replaceAll("-","/")',
  },
  {
    // v2.1.197+: rdp() performs three-axis geo detection:
    //   1. timezone === "Asia/Shanghai" || "Asia/Urumqi"  → cnTZ
    //   2. ANTHROPIC_BASE_URL hostname in XOR-obfuscated domain blocklist → known
    //   3. ANTHROPIC_BASE_URL contains CN-LLM vendor keywords → labKw
    //
    // Shape:
    //   function rdp(){if(vrt())return null;let e=ndp(),t=ekt(),
    //     n=t==="Asia/Shanghai"||t==="Asia/Urumqi";if(!e)return{known:!1,labKw:!1,cnTZ:n,host:null};
    //     return{known:edp().some(...),labKw:tdp().some(...),cnTZ:n,host:e}}
    //
    // Patch: always return null (same as firstParty path), disabling all detection.
    name: 'Neutralize geo-detection probe (rdp)',
    pattern: /function ([\w$]+)\(\)\{if\([\w$]+\(\)\)return null;let [\w$]+=[\w$]+\(\),[\w$]+=[\w$]+\(\),[\w$]+=[\w$]+==="Asia\/Shanghai"\|\|[\w$]+==="Asia\/Urumqi"[\s\S]*?\}\}/g,
    replacer: (m) => {
      const fn = m.match(/^function ([\w$]+)/)[1];
      return `function ${fn}(){return null}`;
    },
    sentinel: 'Asia/Shanghai',
  },
  {
    // v2.1.197+: odp(known, labKw) selects a Unicode apostrophe to encode
    // proxy detection state into the system prompt:
    //   !known && !labKw → U+0027 (ASCII)
    //   known  && !labKw → U+2019 (RIGHT SINGLE QUOTATION MARK)
    //   !known && labKw  → U+02BC (MODIFIER LETTER APOSTROPHE)
    //   known  && labKw  → U+02B9 (MODIFIER LETTER PRIME)
    //
    // Shape:
    //   function odp(e,t){if(!e&&!t)return"'";if(e&&!t)return"'";
    //     if(!e&&t)return"ʼ";return"ʹ"}
    //
    // Patch: always return ASCII apostrophe regardless of detection state.
    // The return values may appear as \uXXXX escapes or literal UTF-8 in
    // the bundle depending on bundler version. Match both forms.
    // Defense-in-depth — qla patch above already bypasses the call to odp,
    // but if qla's shape changes this keeps odp harmless.
    name: 'Neutralize apostrophe steganography (odp)',
    pattern: new RegExp(
      'function ([\\w$]+)\\(([\\w$]+),([\\w$]+)\\)\\{' +
      'if\\(!\\2&&!\\3\\)return"\'";' +
      'if\\(\\2&&!\\3\\)return"(?:\\\\u2019|\\u2019)";' +
      'if\\(!\\2&&\\3\\)return"(?:\\\\u02[Bb][Cc]|\\u02BC)";' +
      'return"(?:\\\\u02[Bb]9|\\u02B9)"\\}',
      'g'
    ),
    replacer: (m) => {
      const fn = m.match(/^function ([\w$]+)/)[1];
      return `function ${fn}(e,t){return"'"}`;
    },
    optional: true,  // defense-in-depth; rdp→null already neutralizes the stego channel
  },

  // ── 限制移除 ──

  {
    name: 'Remove CYBER_RISK_INSTRUCTION',
    pattern: /([\w$]+)="IMPORTANT: Assist with authorized security testing[^"]*"/g,
    replacer: (m, varName) => `${varName}=""`,
    sentinel: 'Assist with authorized security testing',
  },
  {
    name: 'Remove URL generation restriction',
    pattern: /\n\$\{[\w$]+\}\nIMPORTANT: You must NEVER generate or guess URLs[^.]*\. You may use URLs provided by the user in their messages or local files\./g,
    replacer: () => '',
    sentinel: 'IMPORTANT: You must NEVER generate or guess URLs',
  },
  {
    name: 'Remove cautious actions section',
    // v2.1.88-~v2.1.122: function GSY(){return`# Executing actions...`}
    // v2.1.123+: function _j3(H){if(LE8(H)==="compact")return`# Executing...short`;return`# Executing...long`}
    pattern: /function ([\w$]+)\(([\w$]*)\)\{(?:if\([\s\S]{1,200}?\)return`# Executing actions with care\n\n[\s\S]*?`;)?return`# Executing actions with care\n\n[\s\S]*?`\}/g,
    replacer: (m, fn, arg) => `function ${fn}(${arg}){return\`\`}`,
    sentinel: '# Executing actions with care',
  },
  {
    name: 'Remove "Not logged in" notice',
    pattern: /Not logged in\. Run [\w ]+ to authenticate\./g,
    replacer: () => '',
    optional: true,
  },

  // ── 消息过滤 ──

  {
    // v2.1.88-~v2.1.91: fn()!=="ant"){if(q.attachment.type==="hook_additional_context"...
    // v2.1.92+        : fn()!=="ant"&&paY.has(q.attachment.type) — paY is an empty Set
    //                    in v2.1.110, so this filter is effectively a no-op; patch anyway
    //                    to guard against paY being populated in future versions.
    name: 'Attachment filter bypass',
    pattern: /([\w$]+)\(\)!=="ant"(&&[\w$]+\.has\([\w$]+\.attachment\.type\)|\)\{if\([\w$]+\.attachment\.type==="hook_additional_context")/g,
    replacer: (m) => m.replace(/([\w$]+)\(\)!=="ant"/, 'false'),
    optional: true,  // filter may be removed entirely in future versions
  },
  {
    // Legacy (≤v2.1.91) ternary form: fn()!=="ant"?tRY(_,sRY(K)):K
    name: 'Message list filter bypass (legacy ternary)',
    pattern: /([\w$]+)\(\)!=="ant"\?([\w$]+)\(([\w$]+),([\w$]+)\(([\w$]+)\)\):([\w$]+)/g,
    replacer: (m, fn, tRY, underscore, sRY, K, fallback) => fallback,
    optional: true,  // removed in v2.1.92+
  },
  {
    // v2.1.92+ (s_8): if(fn()==="ant")return _;let z=...;return FaY(_,z)
    // Flip the guard so non-ant users also return the pre-filtered list.
    name: 'Message list filter bypass (s_8 form)',
    pattern: /if\(([\w$]+)\(\)==="ant"\)return ([\w$]+);let ([\w$]+)=([\w$]+) instanceof Set\?\4:([\w$]+)\(\4\);return ([\w$]+)\(\2,\3\)/g,
    replacer: (m, fn, ret) => `return ${ret}`,
    optional: true,  // legacy versions had a ternary instead
  },
  {
    // Shell-integration generator (iT6 in v2.1.140, was Wa1 in older versions)
    // emits a zsh/bash function that calls the native claude binary with
    // ARGV0=ugrep|rg|... for multitool dispatch. After clawgod installs, the
    // baked path points at our shell-script launcher — but shell scripts
    // CANNOT preserve argv[0] (kernel shebang re-exec overwrites it, and zsh
    // additionally refuses to export ARGV0 as env). The shell function then
    // fails because bun receives e.g. -G and errors with "Invalid Argument".
    //
    // Fix: redirect the baked path to claude.orig (the native binary backup
    // clawgod creates at install time). Then the multitool dispatch reaches
    // a real binary that honors argv[0]. See issue #82.
    //
    // Generator shape across versions:
    //   v2.1.88 (Wa1):  let Y=E4([_]),...  ← _ is the claude binary path, no in-function compute
    //   v2.1.140 (iT6): let ...,z=FJ$.join(Le(),A?"claude.exe":"claude"),Y=A?rL(z):z,...
    //                   ← path computed inside via join(versionsDir, "claude[.exe]")
    // Anchor on the join(...) ternary form unique to the generator — the
    // bare "claude.exe":"claude" string also appears in u18() (basename
    // helper) but never inside a path.join(), so this regex hits exactly the
    // shell-integration generator and nothing else.
    name: 'Shell integration → claude.orig (multitool dispatch fix)',
    pattern: /([\w$]+\.join\([\w$]+\(\),[\w$]+\?)"claude\.exe":"claude"(\))/g,
    replacer: (m, prefix, suffix) => `${prefix}"claude.orig.exe":"claude.orig"${suffix}`,
    sentinel: '?"claude.exe":"claude")',
    optional: true,  // v2.1.88-era bundles compute the path differently
  },
];

// ─── Main ─────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verify = args.includes('--verify');
const revert = args.includes('--revert');

if (revert) {
  if (!existsSync(BACKUP)) { console.error('❌ No backup found'); process.exit(1); }
  copyFileSync(BACKUP, TARGET);
  console.log('✅ Reverted from backup');
  process.exit(0);
}

if (!existsSync(TARGET)) {
  console.error('❌ Target not found:', TARGET);
  process.exit(1);
}

let code = readFileSync(TARGET, 'utf8');
const origSize = code.length;

// Extract version
const verMatch = code.match(/Version:\s*([\d.]+)/);
const version = verMatch ? verMatch[1] : 'unknown';

console.log(`\n${'═'.repeat(55)}`);
console.log(`  ClawGod Plus (universal)`);
console.log(`  Target: cli.original.cjs (v${version})`);
console.log(`  Mode: ${dryRun ? 'DRY RUN' : verify ? 'VERIFY' : 'APPLY'}`);
console.log(`${'═'.repeat(55)}\n`);

let applied = 0, skipped = 0, failed = 0;

for (const p of patches) {
  const matches = [...code.matchAll(p.pattern)];
  let relevant = matches;

  // Filter by validation if provided
  if (p.validate) {
    relevant = matches.filter(m => p.validate(m[0], code));
  }

  // Select specific match index
  if (p.selectIndex !== undefined) {
    relevant = relevant.length > p.selectIndex ? [relevant[p.selectIndex]] : [];
  }

  // Uniqueness check — skip when 0 so the sentinel / already-applied
  // fallthrough can handle it; only fail on >1 (ambiguous).
  if (p.unique && relevant.length > 1) {
    console.log(`  ⚠️  ${p.name} — ${relevant.length} matches, skipping (need 1)`);
    failed++;
    continue;
  }

  if (relevant.length === 0) {
    if (p.knownShape?.test(code)) {
      console.log(`  ❌ ${p.name} — known resolver shape did not match exactly`);
      failed++;
      continue;
    }
    // appliedMarker: a substring that exists ONLY in this patch's output. Some
    // replacements retain their own sentinel (Ultraplan keeps name:"ultraplan";
    // Ultrareview keeps "tengu_review_bughunter_config"), which made the sentinel
    // check below misfire as "regex stale" on a file that was in fact patched.
    // A present marker means the patch is applied.
    if (p.appliedMarker !== undefined && (p.appliedMarker instanceof RegExp ? p.appliedMarker.test(code) : code.includes(p.appliedMarker))) {
      console.log(`  ✅ ${p.name} (already applied, marker present)`);
      applied++;
      continue;
    }
    if (p.optional) {
      console.log(`  ⏭  ${p.name} (not present in this version)`);
      skipped++;
      continue;
    }
    // If the patch declares a sentinel (a string that must NOT exist in a
    // fully-patched file), use it to tell "already applied" apart from
    // "regex is stale and silently missed the target".
    if (p.sentinel !== undefined) {
      const sentinels = Array.isArray(p.sentinel) ? p.sentinel : [p.sentinel];
      const stillPresent = sentinels.filter((s) => code.includes(s));
      if (stillPresent.length > 0) {
        console.log(`  ❌ ${p.name} — regex stale, sentinel still in source: ${stillPresent.map((s) => JSON.stringify(s)).join(', ')}`);
        failed++;
        continue;
      }
      console.log(`  ✅ ${p.name} (already applied, sentinel absent)`);
      applied++;
      continue;
    }
    console.log(`  ⚠️  ${p.name} (0 matches, no sentinel — cannot verify)`);
    skipped++;
    continue;
  }

  if (verify) {
    console.log(`  ⬚  ${p.name} — ${relevant.length} match(es), not yet applied`);
    skipped++;
    continue;
  }

  // Apply patch
  let count = 0;
  for (const m of relevant) {
    const replacement = p.replacer(m[0], ...m.slice(1));
    if (replacement !== m[0]) {
      if (!dryRun) {
        // Use function-form replace: String.prototype.replace with a string
        // replacement interprets $$ as literal $, $1/$& as backreferences.
        // Minified upstream identifiers like `a$$` would silently become `a$`
        // and break every caller referencing the original name. Function form
        // is opaque to the parser. (issue #86)
        code = code.replace(m[0], () => replacement);
      }
      count++;
    }
  }

  if (count > 0) {
    console.log(`  ✅ ${p.name} (${count} replacement${count > 1 ? 's' : ''})`);
    applied++;
  } else {
    console.log(`  ⏭  ${p.name} (no change needed)`);
    skipped++;
  }
}

const contextLimitPatch = await applyContextLimitPatch(code, { dryRun, verify });
if (contextLimitPatch.status === 'applied') {
  if (!dryRun) code = contextLimitPatch.code;
  console.log(`  ✅ Context limit configurable (${contextLimitPatch.count} replacement${contextLimitPatch.count > 1 ? 's' : ''})`);
  applied++;
} else if (contextLimitPatch.status === 'verify') {
  console.log(`  ⬚  Context limit configurable — ${contextLimitPatch.count} match(es), not yet applied`);
  skipped++;
} else if (contextLimitPatch.status === 'already') {
  console.log(`  ✅ Context limit configurable (${contextLimitPatch.detail})`);
  applied++;
} else if (contextLimitPatch.status === 'skipped') {
  console.log(`  ⏭  Context limit configurable (${contextLimitPatch.detail})`);
  skipped++;
} else {
  console.log(`  ❌ Context limit configurable — ${contextLimitPatch.detail}`);
  failed++;
}

const chromePatch = await applyClaudeChromeSocketPatch(code, { dryRun, verify });
if (chromePatch.status === 'applied') {
  if (!dryRun) code = chromePatch.code;
  console.log(`  ✅ Claude in Chrome local socket fallback (${chromePatch.count} replacement${chromePatch.count > 1 ? 's' : ''})`);
  applied++;
} else if (chromePatch.status === 'verify') {
  console.log(`  ⬚  Claude in Chrome local socket fallback — ${chromePatch.count} match(es), not yet applied`);
  skipped++;
} else if (chromePatch.status === 'already') {
  console.log(`  ✅ Claude in Chrome local socket fallback (${chromePatch.detail})`);
  applied++;
} else if (chromePatch.status === 'skipped') {
  console.log(`  ⏭  Claude in Chrome local socket fallback (${chromePatch.detail})`);
  skipped++;
} else {
  console.log(`  ❌ Claude in Chrome local socket fallback — ${chromePatch.detail}`);
  failed++;
}

console.log(`\n${'─'.repeat(55)}`);
console.log(`  Result: ${applied} applied, ${skipped} skipped, ${failed} failed`);

if (failed === 0 && !dryRun && !verify && applied > 0) {
  if (!existsSync(BACKUP)) {
    copyFileSync(TARGET, BACKUP);
    console.log(`  📦 Backup: ${BACKUP}`);
  }
  writeFileSync(TARGET, code, 'utf8');
  const diff = code.length - origSize;
  console.log(`  📝 Written: cli.original.cjs (${diff >= 0 ? '+' : ''}${diff} bytes)`);
}

console.log(`${'═'.repeat(55)}\n`);
if (failed > 0) process.exit(1);
