import { findNodes, loadAcorn } from '../core.mjs';

function isChromeClientFactory(node) {
  let bodyStatements;
  if (node.body?.type === 'BlockStatement') bodyStatements = node.body.body;
  else return false;
  if (!node.params || node.params.length !== 1) return false;
  if (bodyStatements.length !== 1 || bodyStatements[0].type !== 'ReturnStatement') return false;
  const returned = bodyStatements[0].argument;
  if (!returned || returned.type !== 'ConditionalExpression') return false;
  if (returned.test?.type !== 'MemberExpression' || returned.test.property?.name !== 'bridgeConfig') return false;
  const alternate = returned.alternate;
  if (!alternate || alternate.type !== 'ConditionalExpression') return false;
  if (alternate.test?.type !== 'MemberExpression' || alternate.test.property?.name !== 'getSocketPaths') return false;
  return true;
}

async function applyClaudeChromeSocketPatch(source, { dryRun, verify, rootDir }) {
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
      `function ${legacyClientFactory[1]}(${legacyClientFactory[2]}){return ${legacyClientFactory[2]}.getSocketPaths?${legacyClientFactory[3]}:${legacyClientFactory[2]}.bridgeConfig?${legacyClientFactory[4]}:${legacyClientFactory[5]}}/*__ccpp_bridge_fallback_v2*/`,
    );
  }

  let parseSource = source;
  let offset = 0;
  if (parseSource.startsWith('#!')) {
    const index = parseSource.indexOf('\n');
    if (index >= 0) {
      offset = index + 1;
      parseSource = parseSource.slice(offset);
    }
  }

  const acorn = Object.values(needs).some(Boolean) ? await loadAcorn(rootDir) : null;
  if (acorn) {
    try {
      const ast = acorn.parse(parseSource, { ecmaVersion: 'latest', sourceType: 'module' });
      const nodeSource = (node) => parseSource.slice(node.start, node.end);
      const absolute = (position) => position + offset;

      if (needs.clientFactory) {
        const functions = [
          ...findNodes(ast, (node) => node.type === 'FunctionDeclaration'),
          ...findNodes(ast, (node) =>
            node.type === 'VariableDeclarator' &&
            node.init &&
            (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')
          ),
        ];
        for (const node of functions) {
          const functionNode = node.type === 'VariableDeclarator' ? node.init : node;
          if (!isChromeClientFactory(functionNode)) continue;
          const parameter = functionNode.params[0].name;
          const conditional = functionNode.body.body[0].argument;
          const bridgeCall = nodeSource(conditional.consequent);
          const socketCall = nodeSource(conditional.alternate.consequent);
          const nativeCall = nodeSource(conditional.alternate.alternate);
          add(
            'clientFactory',
            absolute(functionNode.body.start),
            absolute(functionNode.body.end),
            `{return ${parameter}.getSocketPaths?${socketCall}:${parameter}.bridgeConfig?${bridgeCall}:${nativeCall}}/*__ccpp_bridge_fallback_v2*/`,
          );
          break;
        }
      }

      if (needs.subscriptionGate) {
        for (const declaration of findNodes(ast, (node) => node.type === 'VariableDeclarator')) {
          if (!declaration.init || declaration.init.type !== 'LogicalExpression' || declaration.init.operator !== '&&') continue;
          const left = declaration.init.left;
          const right = declaration.init.right;
          if (left.type !== 'CallExpression' || !left.arguments?.length) continue;
          const argument = left.arguments[0];
          if (!argument || argument.type !== 'MemberExpression' || argument.property?.name !== 'chrome') continue;
          if (right.type !== 'CallExpression' || right.arguments?.length !== 0) continue;
          const calleeName = left.callee?.name || left.callee?.property?.name;
          if (!calleeName) continue;
          const definitions = findNodes(ast, (node) =>
            (node.type === 'FunctionDeclaration' && node.id?.name === calleeName) ||
            (node.type === 'VariableDeclarator' && node.id?.name === calleeName)
          );
          if (!definitions.some((definition) => nodeSource(definition).includes('claudeInChromeDefaultEnabled'))) continue;
          add('subscriptionGate', absolute(declaration.init.start), absolute(declaration.init.end), `${nodeSource(left)}/*__ccpp_sub_bypass*/`);
          break;
        }
      }

      if (needs.subscriptionMsg) {
        const messageAnchor = 'Claude in Chrome requires a claude.ai subscription.';
        const messagePosition = parseSource.indexOf(messageAnchor);
        if (messagePosition >= 0) {
          const before = parseSource.slice(Math.max(0, messagePosition - 200), messagePosition);
          if (!before.includes('false&&')) {
            const logicals = findNodes(ast, (node) =>
              node.type === 'LogicalExpression' &&
              node.operator === '&&' &&
              node.start <= messagePosition &&
              node.end >= messagePosition &&
              node.left?.type === 'UnaryExpression' &&
              node.left.operator === '!'
            );
            if (logicals.length > 0) {
              const target = logicals.reduce((left, right) => (right.end - right.start) < (left.end - left.start) ? right : left);
              add('subscriptionMsg', absolute(target.left.start), absolute(target.left.end), 'false/*__ccpp_sub_msg_bypass*/');
            }
          }
        }
      }

      if (needs.selectBrowserHide) {
        const selectBrowserNodes = findNodes(ast, (node) => {
          if (node.type !== 'ObjectExpression') return false;
          return node.properties?.some((property) => property.key?.name === 'value' && property.value?.value === 'select-browser');
        });
        if (selectBrowserNodes.length > 0) {
          const selectBrowserNode = selectBrowserNodes[0];
          const pushCalls = findNodes(ast, (node) =>
            node.type === 'CallExpression' &&
            node.callee?.property?.name === 'push' &&
            node.start >= selectBrowserNode.start &&
            node.start - selectBrowserNode.end <= 200
          );
          if (pushCalls.length > 0) {
            add('selectBrowserHide', absolute(pushCalls[0].start), absolute(pushCalls[0].end), 'void 0/*__ccpp_no_select_browser*/');
          }
        }
      }
    } catch {}
  }

  if (needs.clientFactory && !seen.has('clientFactory')) {
    const pattern = /function ([\w$]+)\(([\w$]+)\)\{return \2\.bridgeConfig\?([\w$]+\(\2\)):\2\.getSocketPaths\?([\w$]+\(\2\)):([\w$]+\(\2\))\}/g;
    const match = pattern.exec(source);
    if (match) add('clientFactory', match.index, match.index + match[0].length, `function ${match[1]}(${match[2]}){return ${match[2]}.getSocketPaths?${match[4]}:${match[2]}.bridgeConfig?${match[3]}:${match[5]}}/*__ccpp_bridge_fallback_v2*/`);
  }

  if (needs.subscriptionGate && !seen.has('subscriptionGate')) {
    const pattern = /(\b[\w$]+\(([\w$]+)\.chrome\);let [\w$]+=)([\w$]+\(\2\.chrome\))&&[\w$]+\(\)(?=,[\s\S]{0,1600}?tengu_claude_in_chrome_setup)/g;
    const match = pattern.exec(source);
    if (match) add('subscriptionGate', match.index, match.index + match[0].length, `${match[1]}${match[3]}/*__ccpp_sub_bypass*/`);
  }

  if (needs.subscriptionMsg && !seen.has('subscriptionMsg')) {
    const pattern = /(\b[\w$]+=)(![\w$]+)(&&[\s\S]{0,500}?"Claude in Chrome requires a claude\.ai subscription\.")/g;
    const match = pattern.exec(source);
    if (match) add('subscriptionMsg', match.index, match.index + match[0].length, `${match[1]}false/*__ccpp_sub_msg_bypass*/${match[3]}`);
  }

  if (needs.selectBrowserHide && !seen.has('selectBrowserHide')) {
    const pattern = /(\{label:"Select browser(?:\\u2026|…)",value:"select-browser"\}[\s\S]{0,240}?)([\w$]+)\.push\(([\w$]+)\)/g;
    const match = pattern.exec(source);
    if (match) add('selectBrowserHide', match.index, match.index + match[0].length, `${match[1]}void 0/*__ccpp_no_select_browser*/`);
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
    replacements.sort((left, right) => right.start - left.start);
    for (const replacement of replacements) {
      next = next.slice(0, replacement.start) + replacement.replacement + next.slice(replacement.end);
    }
  }
  return { status: 'applied', count: replacements.length, code: next };
}

const patches = [
  {
    order: 12,
    name: 'Claude in Chrome OAuth scope bypass',
    pattern: /function ([\w$]+)\(([\w$]+)\)\{if\(![\w$]+\(\)\)return [\w$]+\("\[Claude in Chrome\] Disabled: OAuth token has no scope accepted by \/api\/oauth\/validate[^"]*"\),!1;if\(\2===!0\)return!0;/g,
    replacer: (match, fn, argument) => `function ${fn}(${argument}){/*__ccpp_chrome_oauth_scope_bypass*/if(${argument}===!0)return!0;`,
    appliedMarker: '/*__ccpp_chrome_oauth_scope_bypass*/',
    optional: true,
  },
  {
    order: 13,
    name: 'Claude in Chrome agents config state',
    pattern: /([\w$]+)=\{addDir:\[\],pluginDir:\[\],pluginDirNoMcp:\[\],settings:void 0,mcpConfig:\[\],strictMcpConfig:!1\}/g,
    replacer: (match, config) => `${config}={addDir:[],pluginDir:[],pluginDirNoMcp:[],settings:void 0,mcpConfig:[],strictMcpConfig:!1,chrome:!1,noChrome:!1}`,
    appliedMarker: /[\w$]+=\{addDir:\[\],pluginDir:\[\],pluginDirNoMcp:\[\],settings:void 0,mcpConfig:\[\],strictMcpConfig:!1,chrome:!1,noChrome:!1\}/,
    validate: (match, code) => !code.includes('strictMcpConfig:!1,chrome:!1,noChrome:!1'),
  },
  {
    order: 14,
    name: 'Claude in Chrome agents flag parser',
    pattern: /if\(([\w$]+)==="--strict-mcp-config"\)\{([\w$]+)\.strictMcpConfig=!0;continue\}/g,
    replacer: (match, argument, config) => `if(${argument}==="--chrome"){${config}.chrome=!0;continue}if(${argument}==="--no-chrome"){${config}.noChrome=!0;continue}` + match,
    appliedMarker: /if\([\w$]+==="--chrome"\)\{[\w$]+\.chrome=!0;continue\}if\([\w$]+==="--no-chrome"\)\{[\w$]+\.noChrome=!0;continue\}/,
    validate: (match, code) => !/if\([\w$]+==="--chrome"\)\{[\w$]+\.chrome=!0;continue\}/.test(code),
  },
  {
    order: 15,
    name: 'Claude in Chrome agents config resolver',
    pattern: /strictMcpConfig:([\w$]+)\.strictMcpConfig\}\}function ([\w$]+)/g,
    replacer: (match, config, fn) => `strictMcpConfig:${config}.strictMcpConfig,chrome:${config}.chrome&&!${config}.noChrome,noChrome:${config}.noChrome}}function ${fn}`,
    appliedMarker: /chrome:[\w$]+\.chrome&&![\w$]+\.noChrome,noChrome:[\w$]+\.noChrome/,
    validate: (match, code) => !/chrome:[\w$]+\.chrome&&![\w$]+\.noChrome/.test(code),
  },
  {
    order: 16,
    name: 'Claude in Chrome agents dispatch args',
    pattern: /\.\.\.([\w$]+)\.strictMcpConfig\?\["--strict-mcp-config"\]:\[\]\]\}/g,
    replacer: (match, config) => `...${config}.chrome?["--chrome"/*__ccpp_agents_chrome_dispatch*/]:[],...${config}.noChrome?["--no-chrome"]:[],...${config}.strictMcpConfig?["--strict-mcp-config"]:[]]}`,
    appliedMarker: '__ccpp_agents_chrome_dispatch',
    validate: (match, code) => !code.includes('__ccpp_agents_chrome_dispatch'),
  },
];

const customPatches = [{
  order: 59,
  name: 'Claude in Chrome local socket fallback',
  apply: applyClaudeChromeSocketPatch,
}];

export const chromeRegistry = Object.freeze({
  id: 'chrome',
  patches: Object.freeze(patches),
  customPatches: Object.freeze(customPatches),
});
