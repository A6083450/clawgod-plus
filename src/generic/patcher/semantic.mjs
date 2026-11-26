import acorn from './vendor/acorn.cjs';
const { parse } = acorn;

export const AST_PATCH_IDS = [
  'user-type-ant', 'growthbook-env-overrides-graph',
  'computer-use-default', 'ultraplan', 'voice-mode',
  'geo-stego-date', 'remote-settings-off', 'wiggly-dove',
  'tool-result-pairing-recovery', 'auto-mode-inline-gate', 'auto-mode-helper-gate',
  'auto-mode-provider-opt-in',
];

const gate = id => `globalThis.__clawgodPatches?.[${JSON.stringify(id)}]!==!1`;
const literal = (node, value) => node?.type === 'Literal' && node.value === value;
const propertyName = node => node.computed
  ? (node.key?.type === 'Literal' ? node.key.value : undefined)
  : (node.key?.name ?? node.key?.value);
const member = (node, name) => node?.type === 'MemberExpression' &&
  (node.computed ? literal(node.property, name) : node.property.name === name);
const thisMember = (node, name) => member(node, name) && node.object.type === 'ThisExpression';
const boolean = (node, value) => literal(node, value) ||
  (node?.type === 'UnaryExpression' && node.operator === '!' && literal(node.argument, value ? 0 : 1));
const isUndefined = node => node?.type === 'UnaryExpression' && node.operator === 'void' &&
  literal(node.argument, 0);

export const parsePatchSource = code => parse(code, {
  ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true,
  allowReturnOutsideFunction: true, allowImportExportEverywhere: true,
});

// 迭代遍历，避免大型 bundle 额外耗尽调用栈。
function walk(root, visit) {
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    visit(node);
    for (const value of Object.values(node)) {
      if (value?.type) pending.push(value);
      else if (Array.isArray(value)) {
        for (const child of value) if (child?.type) pending.push(child);
      }
    }
  }
}

// Iterative traversal bounded to the current function scope.
// Stops descending at nested function boundaries to prevent outer scopes from
// claiming inner statements or creating overlapping edits.
function walkScope(root, visit) {
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    visit(node);
    for (const value of Object.values(node)) {
      if (!value) continue;
      if (value.type) {
        if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(value.type)) {
          visit(value);
        } else {
          pending.push(value);
        }
      } else if (Array.isArray(value)) {
        for (const child of value) {
          if (!child?.type) continue;
          if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(child.type)) {
            visit(child);
          } else {
            pending.push(child);
          }
        }
      }
    }
  }
}

// Resolve names by lexical binding, including writes after declarations. A name
// that is reassigned or shadowed must not inherit another scope's sentinel/helper.
function lexicalBindings(tree) {
  const scopes = new WeakMap(), writes = [];
  const names = pattern => {
    const pending = [pattern], result = [];
    while (pending.length) {
      const node = pending.pop();
      if (!node) continue;
      if (node.type === 'Identifier') result.push(node.name);
      if (node.type === 'RestElement') pending.push(node.argument);
      if (node.type === 'AssignmentPattern') pending.push(node.left);
      if (node.type === 'ArrayPattern') pending.push(...node.elements);
      if (node.type === 'ObjectPattern') pending.push(...node.properties.map(p => p.type === 'RestElement' ? p.argument : p.value));
    }
    return result;
  };
  const declare = (scope, pattern, value) => {
    for (const name of names(pattern)) {
      if (!scope.bindings.has(name)) scope.bindings.set(name, []);
      if (value !== null) scope.bindings.get(name).push(value);
    }
  };
  const resolve = (scope, name) => {
    for (; scope; scope = scope.parent) {
      if (scope.bindings.has(name)) return scope.bindings.get(name);
    }
  };
  const pending = [{ node: tree, scope: null }];
  while (pending.length) {
    let { node, scope } = pending.pop();
    const fn = ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type);
    const cls = node.type === 'ClassDeclaration' || node.type === 'ClassExpression';
    if (node.type === 'FunctionDeclaration') declare(scope, node.id, node);
    if (node.type === 'ClassDeclaration') declare(scope, node.id, undefined);
    if (fn || cls || ['Program', 'BlockStatement', 'StaticBlock', 'CatchClause', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'SwitchStatement'].includes(node.type)) {
      scope = { parent: scope, bindings: new Map(), vars: scope?.vars };
      if (fn || node.type === 'Program' || node.type === 'StaticBlock') scope.vars = scope;
    }
    scopes.set(node, scope);
    if (fn) {
      if (node.id) declare(scope, node.id, node);
      for (const param of node.params) declare(scope, param, undefined);
    }
    if (cls && node.id) declare(scope, node.id, undefined);
    if (node.type === 'CatchClause') declare(scope, node.param, undefined);
    if (node.type === 'ImportDeclaration') for (const specifier of node.specifiers) declare(scope, specifier.local, undefined);
    if (node.type === 'VariableDeclaration') {
      for (const declaration of node.declarations) declare(node.kind === 'var' ? scope.vars : scope,
        declaration.id, declaration.id.type === 'Identifier' ? declaration.init : undefined);
    }
    if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression') writes.push({ scope,
      pattern: node.left ?? node.argument, value: node.operator === '=' && node.left.type === 'Identifier' ? node.right : undefined });
    if (node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
      const patterns = node.left.type === 'VariableDeclaration' ? node.left.declarations.map(d => d.id) : [node.left];
      for (const pattern of patterns) writes.push({ scope, pattern, value: undefined });
    }
    for (const value of Object.values(node)) {
      if (value?.type) pending.push({ node: value, scope });
      else if (Array.isArray(value)) for (const child of value) if (child?.type) pending.push({ node: child, scope });
    }
  }
  for (const { scope, pattern, value } of writes) for (const name of names(pattern)) resolve(scope, name)?.push(value);
  const binding = (node, name) => resolve(scopes.get(node), name);
  return {
    binding,
    values: node => node?.type === 'Identifier' ? binding(node, node.name) : [node],
    outside: (fn, name) => resolve(scopes.get(fn)?.parent, name),
  };
}

function hasScopeGate(node, id) {
  let found = false;
  walkScope(node.body ?? node, child => {
    if (member(child, id) && member(child.object, '__clawgodPatches') &&
        child.object.object.name === 'globalThis') found = true;
  });
  return found;
}

const conjunctions = node => node?.type === 'LogicalExpression' && node.operator === '&&'
  ? [...conjunctions(node.left), ...conjunctions(node.right)] : [node];
const falseReturn = statement => {
  const returned = statement?.type === 'BlockStatement' && statement.body.length === 1 ? statement.body[0] : statement;
  return returned?.type === 'ReturnStatement' && boolean(returned.argument, false);
};
function providerRestriction(parts) {
  const [first, second] = parts;
  if (first?.type !== 'BinaryExpression' || first.operator !== '!==' ||
      first.left.type !== 'Identifier' || !literal(first.right, 'firstParty')) return false;
  if (second?.type === 'BinaryExpression' && second.operator === '!==' &&
      second.left.name === first.left.name && literal(second.right, 'anthropicAws')) return true;
  const call = second?.type === 'UnaryExpression' && second.operator === '!' ? second.argument : null;
  return call?.type === 'CallExpression' && call.callee.type === 'Identifier' &&
    call.arguments.length === 1 && call.arguments[0].name === first.left.name;
}
function autoModeOptIn(fn) {
  if (!['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(fn?.type) ||
      fn.async || fn.generator || fn.params.length !== 1 || fn.params[0].type !== 'Identifier' || fn.body.type !== 'BlockStatement') return false;
  const body = fn.body.body.filter(s => !s.directive && s.type !== 'EmptyStatement');
  const check = body[0], ret = body[1]?.argument;
  const parts = check?.test?.type === 'LogicalExpression' && check.test.operator === '||' ? [check.test.left, check.test.right] : [];
  return body.length === 2 && check.type === 'IfStatement' && !check.alternate && parts.length === 2 &&
    ['firstParty', 'anthropicAws'].every(value => parts.some(p => p.type === 'BinaryExpression' && p.operator === '===' &&
      p.left.name === fn.params[0].name && literal(p.right, value))) &&
    check.consequent.type === 'ReturnStatement' && boolean(check.consequent.argument, true) &&
    body[1].type === 'ReturnStatement' && ret?.type === 'CallExpression' && ret.arguments.length === 1 &&
    member(ret.arguments[0], 'CLAUDE_CODE_ENABLE_AUTO_MODE') && member(ret.arguments[0].object, 'env') &&
    ret.arguments[0].object.object.name === 'process';
}

function autoModeModels(node) {
  if (node?.type !== 'LogicalExpression' || node.operator !== '||') return false;
  const models = new Map();
  walkScope(node, child => {
    if (child.type === 'BinaryExpression' && child.operator === '===' && child.left.type === 'Identifier' &&
        ['claude-opus-4-6', 'claude-sonnet-4-6'].some(model => literal(child.right, model))) models.set(child.right.value, child.left.name);
  });
  return models.size === 2 && models.get('claude-opus-4-6') === models.get('claude-sonnet-4-6');
}

function hasGate(node, id) {
  let found = false;
  walk(node, child => {
    if (member(child, id) && member(child.object, '__clawgodPatches') &&
        child.object.object.name === 'globalThis') found = true;
  });
  return found;
}

function hasRemoteSettingsContext(node) {
  let found = false;
  walk(node, child => {
    const strings = child.type === 'Literal' && typeof child.value === 'string' ? [child.value]
      : child.type === 'TemplateLiteral' ? child.quasis.map(quasi => quasi.value.cooked ?? '') : [];
    if (strings.some(value => value.includes('Remote settings:') || value.includes('remote-settings.json'))) found = true;
  });
  return found;
}

// 每个模块仅解析一次并只保留编辑区间，进入下一 chunk 前可释放大型 AST。
export function scanAstPatches(code) {
  const results = Object.fromEntries(AST_PATCH_IDS.map(id => [id, { matches: [], present: false, patched: false }]));
  const tree = parsePatchSource(code);
  const bindings = lexicalBindings(tree);
  const sentinel = '[Tool result missing due to internal error]';
  const wigglyFlag = 'tengu_wiggly_dove';
  const wigglyLiterals = new Set(), wigglyCovered = new Set(), wigglyCalls = new Set(), wigglyCandidates = [];
  let pairingHandled = false, pairingUnhandled = false;
  const edit = (id, node, replacement) => {
    results[id].matches.push({ start: node.start, end: node.end, replacement });
  };
  const injectReturn = (id, fn, value) => {
    if (!['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(fn?.type) || fn.async || fn.generator) return;
    if (hasGate(fn, id)) return;
    const body = fn.body;
    const original = code.slice(body.start, body.end);
    if (body.type !== 'BlockStatement') {
      edit(id, body, `(${gate(id)}?${value}:(${original}))`);
      return;
    }
    let insertion = body.start + 1;
    for (const statement of body.body) {
      if (!statement.directive) break;
      insertion = statement.end;
    }
    const offset = insertion - body.start;
    edit(id, body, `${original.slice(0, offset)};if(${gate(id)})return ${value};${original.slice(offset)}`);
  };

  // 仅绑定当前模块的诊断 helper，不能把普通 {eligible} 缓存或跨 chunk 同名函数当成 remote settings。
  const functions = new Map();
  for (const node of tree.body) {
    if (node.type === 'FunctionDeclaration' && node.id?.type === 'Identifier') functions.set(node.id.name, node);
  }
  // New upstream features use the same lexical index without changing the
  // fork's stricter, module-local remote-settings recognizer below.
  const providerCall = call => {
    if (call?.type !== 'CallExpression' || call.arguments.length || call.callee.type !== 'Identifier') return false;
    const values = bindings.values(call.callee);
    if (values?.length !== 1) return false;
    const helper = values[0];
    if (helper?.type !== 'FunctionDeclaration' || helper.params.length || helper.async || helper.generator) return false;
    const returned = helper.body.body.filter(s => s.type === 'ReturnStatement');
    return returned.length === 1 && providerRestriction(conjunctions(returned[0].argument));
  };
  walk(tree, node => {
    if (literal(node, wigglyFlag)) wigglyLiterals.add(node);
    if (node.type === 'CallExpression' && node.arguments.length) {
      const values = bindings.values(node.arguments[0]);
      if (values?.some(value => literal(value, wigglyFlag))) wigglyCalls.add(node);
    }
    if (!['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type) || node.async || node.generator) return;
    if (node.body.type === 'BlockStatement') {
      const statements = node.body.body;
      if (!node.params.length) {
        const body = statements.filter(s => !s.directive && s.type !== 'EmptyStatement');
        const checks = body.slice(0, -1);
        const last = body.at(-1);
        const guardedHelper = checks.length && checks.every(s => s.type === 'IfStatement' && !s.alternate &&
          s.consequent.type === 'ReturnStatement' && boolean(s.consequent.argument, false)) &&
          last?.type === 'ReturnStatement' && last.argument?.type === 'CallExpression';
        const firstParty = checks.some(s => s.type === 'IfStatement' && s.test.type === 'UnaryExpression' && s.test.operator === '!' &&
          s.test.argument.type === 'CallExpression' && s.test.argument.arguments.length === 0);
        const flagCheck = guardedHelper && checks.find(s => {
          const call = s.test.type === 'UnaryExpression' && s.test.operator === '!' ? s.test.argument : null;
          const values = call?.type === 'CallExpression' ? bindings.values(call.arguments[0]) : null;
          return call?.type === 'CallExpression' && call.arguments.length === 2 && boolean(call.arguments[1], false) &&
            values?.length && values.every(value => literal(value, wigglyFlag));
        });
        if (firstParty && flagCheck) {
          wigglyCandidates.push(node);
          wigglyCovered.add(flagCheck.test.argument);
          for (const value of bindings.values(flagCheck.test.argument.arguments[0])) wigglyCovered.add(value);
        }
      }
      const inline = [], helperSites = [];
      for (const statement of statements) {
        if (statement.type !== 'IfStatement' || statement.alternate || !falseReturn(statement.consequent)) continue;
        const parts = conjunctions(statement.test);
        if (providerRestriction(parts)) {
          // Relax only the provider prefix, not independent model/safety gates.
          const prefix = parts.length === 2 ? statement.test : { start: parts[0].start, end: parts[1].end };
          inline.push(prefix);
        } else if (parts.length === 2 && autoModeModels(parts[1])) {
          if (providerCall(parts[0])) inline.push(parts[0]);
          else if (parts[0]?.type === 'Identifier') {
            const values = bindings.values(parts[0]);
            const declarations = statements.filter(s => s.type === 'VariableDeclaration').flatMap(s => s.declarations)
              .filter(d => d.id.type === 'Identifier' && bindings.binding(d.id, d.id.name) === bindings.values(parts[0]));
            if (values?.length === 1 && declarations.length === 1 && declarations[0].end < statement.start && providerCall(values[0])) inline.push(values[0]);
            else if (!hasScopeGate(node, 'auto-mode-inline-gate')) results['auto-mode-inline-gate'].present = true;
          } else if (!hasScopeGate(node, 'auto-mode-inline-gate')) results['auto-mode-inline-gate'].present = true;
        }
        const call = statement.test.type === 'UnaryExpression' && statement.test.operator === '!' ? statement.test.argument : null;
        if (call?.type === 'CallExpression' && call.callee.type === 'Identifier' && call.arguments.length === 1 &&
            call.arguments[0].type === 'Identifier') {
          const later = statements.filter(s => s.start >= statement.end);
          let provider = false, providerMention = false;
          for (const s of later) walkScope(s, child => {
            if (child.type === 'BinaryExpression' && child.operator === '!==' && literal(child.right, 'firstParty')) {
              providerMention = true;
              if (child.left.type === 'Identifier' && bindings.values(child.left) === bindings.values(call.arguments[0])) provider = true;
            }
          });
          const values = bindings.values(call.callee);
          if (provider && values?.length === 1 && autoModeOptIn(values[0])) helperSites.push(statement.test);
          else if (providerMention && !hasScopeGate(node, 'auto-mode-helper-gate')) results['auto-mode-helper-gate'].present = true;
        }
      }
      for (const [id, sites] of [['auto-mode-inline-gate', inline], ['auto-mode-helper-gate', helperSites]]) {
        if (sites.length && bindings.binding(node, 'globalThis')) results[id].present = true;
        else if (hasScopeGate(node, id)) results[id].patched = true;
        else for (const site of new Set(sites)) edit(id, site, `(globalThis.__clawgodPatches?.[${JSON.stringify(id)}]===!1&&(${code.slice(site.start, site.end)}))`);
      }
      const optIn = 'auto-mode-provider-opt-in';
      if (autoModeOptIn(node) && bindings.binding(node, 'globalThis')) results[optIn].present = true;
      else if (hasScopeGate(node, optIn)) results[optIn].patched = true;
      else if (autoModeOptIn(node)) injectReturn(optIn, node, '!0');
    }

    const id = 'tool-result-pairing-recovery';
    if (hasScopeGate(node, id)) { results[id].patched = true; pairingHandled = true; return; }
    if (!node.params.length || node.params[0].type !== 'Identifier') return;
    const history = node.params[0].name, historyBinding = bindings.values(node.params[0]);
    let historyArray = false;
    walkScope(node.body, child => {
      if (child.type === 'MemberExpression' && child.object.type === 'Identifier' && child.object.name === history &&
          bindings.values(child.object) === historyBinding && (member(child, 'length') || child.computed)) historyArray = true;
    });
    if (!historyArray) return;
    walkScope(node.body, call => {
      if (call.type !== 'CallExpression' || !member(call.callee, 'map') || call.arguments.length !== 1) return;
      const cb = call.arguments[0];
      if (!['ArrowFunctionExpression', 'FunctionExpression'].includes(cb?.type) || cb.async || cb.generator ||
          cb.params.length !== 1 || cb.params[0].type !== 'Identifier') return;
      const object = cb.body.type === 'ObjectExpression' ? cb.body : cb.body.type === 'BlockStatement' &&
        cb.body.body.length === 1 && cb.body.body[0].type === 'ReturnStatement' ? cb.body.body[0].argument : null;
      if (object?.type !== 'ObjectExpression' || object.properties.length !== 4 ||
          object.properties.some(p => p.type !== 'Property' || p.kind !== 'init' || p.method || (p.computed && p.key.type !== 'Literal')) ||
          new Set(object.properties.map(propertyName)).size !== 4) return;
      const property = name => object.properties.find(p => propertyName(p) === name)?.value;
      const content = property('content'), values = bindings.values(content);
      const pairingObject = literal(property('type'), 'tool_result') && property('tool_use_id')?.name === cb.params[0].name &&
        boolean(property('is_error'), true);
      if (pairingObject && (!values?.length || !values.every(v => literal(v, sentinel)))) pairingUnhandled = true;
      if (!pairingObject || !values?.length || !values.every(v => literal(v, sentinel)) ||
          bindings.outside(cb, history) !== historyBinding || bindings.binding(call, 'globalThis')) return;
      const used = new Set();
      walk(node, child => { if (child.type === 'Identifier') used.add(child.name); });
      const fresh = base => { let name = base, i = 1; while (used.has(name)) name = `${base}${i++}`; used.add(name); return name; };
      const p = fresh('_p'), m = fresh('_m'), b = fresh('_b'), key = fresh('_id');
      const missing = JSON.stringify(sentinel);
      edit(id, call, `${code.slice(call.callee.object.start, call.callee.object.end)}.map((${key})=>{let ${p};` +
        `if(${gate(id)}){for(let ${m} of ${history}){if(globalThis.Array.isArray(${m}?.message?.content)){` +
        `for(let ${b} of ${m}.message.content){if(${b}?.type==="tool_result"&&${b}.tool_use_id===${key}&&${b}.content!==${missing}){${p}=${b};break;}}}` +
        `if(${p})break;}}return ${p}?{...${p}}:{type:"tool_result",tool_use_id:${key},content:${missing},is_error:!0}})`);
      pairingHandled = true;
    });
  });
  const privacy = results['wiggly-dove'];
  if (wigglyCandidates.length === 1 && [...wigglyLiterals, ...wigglyCalls].every(node => wigglyCovered.has(node))) {
    const fn = wigglyCandidates[0];
    if (bindings.binding(fn, 'globalThis')) privacy.present = true;
    else if (hasScopeGate(fn, 'wiggly-dove')) privacy.patched = true;
    else injectReturn('wiggly-dove', fn, '!1');
  } else if (wigglyLiterals.size) {
    privacy.present = true;
    if (wigglyCandidates.length > 1) privacy.ambiguous = true;
  }
  if (!pairingHandled || pairingUnhandled) walk(tree, node => {
    if (literal(node, sentinel)) {
      results['tool-result-pairing-recovery'].present = true;
      results['tool-result-pairing-recovery'].matches = [];
    }
  });

  walk(tree, node => {
    if (node.type === 'ObjectExpression') {
      // 展开、访问器和重复键会改变实际使用的值。
      const props = node.properties;
      const named = name => props.filter(p => p.type === 'Property' && propertyName(p) === name);
      const names = named('name');
      if (names.some(p => literal(p.value, 'ultraplan')) &&
          (named('isEnabled').length || named('argumentHint').length || named('type').some(p => literal(p.value, 'local-jsx')))) {
        const enabled = named('isEnabled');
        const patched = enabled.length === 1 && hasGate(enabled[0].value, 'ultraplan');
        const before = results.ultraplan.matches.length;
        if (patched) results.ultraplan.patched = true;
        if (names.length > 1 || enabled.length > 1) results.ultraplan.ambiguous = true;
        if (names.length === 1 && enabled.length === 1 && enabled[0].kind === 'init' &&
            !props.some(p => p.type === 'SpreadElement' || (p.computed && p.key.type !== 'Literal'))) {
          injectReturn('ultraplan', enabled[0].value, '!0');
          const availability = named('availability');
          if (!patched && results.ultraplan.matches.some(match => match.start === enabled[0].value.body?.start) && availability.length === 1 && availability[0].kind === 'init') {
            const value = availability[0].value;
            edit('ultraplan', value, `(${gate('ultraplan')}?undefined:(${code.slice(value.start, value.end)}))`);
          }
        }
        if (!patched && results.ultraplan.matches.length === before) results.ultraplan.present = true;
      }
      const enabled = named('enabled');
      if (named('pixelValidation').length === 1 && enabled.length === 1 &&
          enabled[0].kind === 'init' && boolean(enabled[0].value, false) &&
          !props.some(p => p.type === 'SpreadElement' || (p.computed && p.key.type !== 'Literal'))) {
        edit('computer-use-default', enabled[0].value,
          `(${gate('computer-use-default')}?!0:(${code.slice(enabled[0].value.start, enabled[0].value.end)}))`);
      }
    }

    if (node.type === 'FunctionDeclaration' && node.params.length === 1 &&
        node.params[0].type === 'Identifier' && !node.async && !node.generator) {
      const date = node.body.body.find(s => s.type === 'ReturnStatement')?.argument;
      const quasis = date?.type === 'TemplateLiteral' ? date.quasis.map(q => q.value.cooked) : [];
      if (quasis.length === 3 && quasis[0] === 'Today' && quasis[1] === 's date is ' && quasis[2] === '.') {
        const id = 'geo-stego-date';
        if (hasGate(node, id)) results[id].patched = true;
        else {
          const before = results[id].matches.length;
          const bindings = new Map(node.body.body.filter(s => s.type === 'VariableDeclaration')
            .flatMap(s => s.declarations).filter(d => d.id.type === 'Identifier').map(d => [d.id.name, d.init]));
          const formatted = bindings.get(date.expressions[1]?.name);
          const call = formatted?.type === 'ConditionalExpression' ? formatted.consequent : null;
          const param = node.params[0].name;
          if (call?.type === 'CallExpression' && member(call.callee, 'replaceAll') &&
              call.callee.object.name === param && call.arguments.length === 2 &&
              literal(call.arguments[0], '-') && literal(call.arguments[1], '/') && formatted.alternate.name === param) {
            injectReturn(id, node, `\`Today's date is \${${param}}.\``);
          }
          if (results[id].matches.length === before) results[id].present = true;
        }
      }
    }

    if (node.type === 'FunctionDeclaration' && node.params.length === 0 &&
        !node.async && !node.generator && node.body.body.length === 1 &&
        node.body.body[0].type === 'ReturnStatement') {
      const value = node.body.body[0].argument;
      if (literal(value, 'external')) edit('user-type-ant', value, '"ant"');
      if (value?.type === 'UnaryExpression' && value.operator === '!' &&
          value.argument.type === 'CallExpression' && value.argument.callee.type === 'Identifier' &&
          value.argument.arguments.length === 2 && literal(value.argument.arguments[0], 'tengu_amber_quartz_disabled') &&
          boolean(value.argument.arguments[1], false)) {
        edit('voice-mode', value, `(${gate('voice-mode')}?!0:(${code.slice(value.start, value.end)}))`);
      }
    }

    if (node.type === 'FunctionDeclaration' && tree.body.includes(node) && node.params.length === 0 &&
        !node.async && !node.generator) {
      const statements = node.body.body;
      const cached = statements.find(statement => statement.type === 'VariableDeclaration' &&
        statement.declarations.length === 1 && statement.declarations[0].id.type === 'Identifier' &&
        statement.declarations[0].init?.type === 'CallExpression');
      const cachedName = cached?.declarations[0].id.name;
      const cachedReturn = cachedName && statements.find(statement =>
        statement.type === 'IfStatement' && statement.test.type === 'BinaryExpression' &&
        statement.test.operator === '!==' && statement.test.left.type === 'Identifier' &&
        statement.test.left.name === cachedName && isUndefined(statement.test.right) &&
        statement.consequent.type === 'ReturnStatement' && statement.consequent.argument?.type === 'Identifier' &&
        statement.consequent.argument.name === cachedName);
      const eligibility = statements.find(statement => statement.type === 'VariableDeclaration' &&
        statement.declarations.length === 1 && statement.declarations[0].id.type === 'ObjectPattern' &&
        statement.declarations[0].init?.type === 'CallExpression' &&
        statement.declarations[0].init.callee.type === 'Identifier' &&
        statement.declarations[0].id.properties.some(property => property.type === 'Property' &&
          propertyName(property) === 'eligible'));
      const helperName = eligibility?.declarations[0].init.callee.name;
      let shadowed = false;
      if (helperName) walk(node.body, child => {
        if ((child.type === 'FunctionDeclaration' && child.id?.name === helperName) ||
            (child.type === 'VariableDeclarator' && child.id?.name === helperName)) shadowed = true;
      });
      const helper = !shadowed && functions.get(helperName);
      if (helper && hasRemoteSettingsContext(helper)) {
        const id = 'remote-settings-off';
        if (!cachedReturn) results[id].present = true;
        else {
          if (hasGate(node, id)) results[id].patched = true;
          else injectReturn(id, node, '!1');
        }
      }
    }

    if ((node.type === 'MethodDefinition' || node.type === 'Property') &&
        propertyName(node) === 'getEnvironmentOverrides' && node.value?.body?.type === 'BlockStatement') {
      const statements = node.value.body.body;
      // 仅修复真正 override reader 前的提前返回。
      for (let i = 0; i < statements.length - 1; i++) {
        const statement = statements[i];
        const values = statement.argument?.expressions;
        const next = statements[i + 1];
        if (statement.type !== 'ReturnStatement' || values?.length !== 2) continue;
        const [assignment, result] = values;
        if (assignment.type !== 'AssignmentExpression' || assignment.operator !== '=' ||
            !thisMember(assignment.left, 'environmentOverridesParsed') || !boolean(assignment.right, true) ||
            !thisMember(result, 'environmentOverrides') || next.type !== 'VariableDeclaration') continue;
        const readsOverrides = next.declarations.some(d => d.init?.type === 'CallExpression' &&
          member(d.init.callee, 'readEnvironmentOverrides') && thisMember(d.init.callee.object, 'deps'));
        if (readsOverrides) edit('growthbook-env-overrides-graph', statement,
          `${code.slice(assignment.start, assignment.end)};`);
      }
    }
  });
  for (const id of ['auto-mode-inline-gate', 'auto-mode-helper-gate', 'auto-mode-provider-opt-in']) {
    if (results[id].present) results[id].matches = [];
  }
  return results;
}

export function applyAstEdits(code, edits) {
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  const parts = [];
  let cursor = 0;
  for (const edit of sorted) {
    if (edit.start < cursor) throw new Error('Overlapping AST patch edits');
    parts.push(code.slice(cursor, edit.start), edit.replacement);
    cursor = edit.end;
  }
  parts.push(code.slice(cursor));
  return parts.join('');
}
