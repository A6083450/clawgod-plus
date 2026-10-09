import { findNodes, loadAcorn } from '../core.mjs';
import { gate } from '../runtime-features.mjs';

const patches = [{
  order: 25,
  name: 'Voice Mode enable (bypass GrowthBook kill)',
  pattern: /function ([\w$]+)\(\)\{return![\w$]+\("tengu_amber_quartz_disabled",!1\)\}/g,
  replacer: (match, fn) => `function ${fn}(){return ${gate('voice-mode')}?!0:(${match.slice(`function ${fn}(){return`.length, -1)})}`,
  optional: true,
}];

// These handlers run in capture phase: consumed key events have not been
// inserted by the editor. Deleting for every repeat erases real whitespace.
const voiceHoldInput = Object.freeze({
  id: 'voice-hold-input', order: 99, name: 'Voice hold input: clean warmup once, consume recording repeats',
  async apply(source, { rootDir, dryRun = false, verify = false } = {}) {
    const marker = '/*__clawgod_voice_hold_input_v3__*/';
    if (/\/\*__clawgod_voice_hold_input(?:_v[245])?__\*\//.test(source)) return { status: 'failed', detail: 'old voice input patch; re-extract before patching; no writes' };
    const separator = '\n/*__CLAWGOD_MODULE_BOUNDARY__*/\n';
    const modules = source.split(separator), enabled = `(${gate('voice-hold-input')}&&${gate('voice-mode')})`;
    if (!modules.some(code => code.includes('voice:pushToTalk') && !code.includes(marker))) {
      return { status: source.includes(marker) ? 'already' : 'skipped', detail: 'no unpatched voice input' };
    }
    const acorn = await loadAcorn(rootDir);
    if (!acorn) return { status: 'failed', detail: 'Acorn unavailable; no writes' };
    let count = 0;
    try {
      for (const [index, code] of modules.entries()) {
        if (!code.includes('voice:pushToTalk') || code.includes(marker)) continue;
        const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true });
        const text = n => code.slice(n.start, n.end);
        const nodes = (root, type, test) => findNodes(root, n => n.type === type && test(n));
        const one = (items, label) => { if (items.length !== 1) throw Error(`voice input ${label}: expected one site, found ${items.length}`); return items[0]; };
        const hooks = nodes(ast, 'FunctionDeclaration', n => text(n).includes('voice:pushToTalk') && text(n).includes('stripTrailing'));
        if (!hooks.length) continue;
        const hook = one(hooks, 'hook'), edits = [];
        const replace = (node, value) => edits.push({ start: node.start, end: node.end, value });
        const insert = (at, value) => edits.push({ start: at, end: at, value });
        const binding = one(nodes(hook, 'Property', n => n.key?.name === 'stripTrailing' && n.value.type === 'Identifier'), 'strip binding').value.name;
        const strips = nodes(hook, 'CallExpression', n => n.callee.name === binding && n.arguments.length === 2);
        const holdAnchor = one(strips.filter(n => n.arguments[0].type === 'BinaryExpression' && n.arguments[0].operator === '+'), 'warmup anchor');
        const pending = holdAnchor.arguments[0].left;
        if (pending.type !== 'MemberExpression' || pending.property.name !== 'current') throw Error('voice input pending count changed');
        const warmup = one(nodes(hook, 'IfStatement', n => n.alternate?.type === 'ExpressionStatement' &&
          n.alternate.expression.type === 'AssignmentExpression' && text(n.alternate.expression.left) === text(pending)), 'warmup branch');
        const increment = warmup.alternate.expression.right;
        if (increment.type !== 'BinaryExpression' || increment.operator !== '+' || text(increment.left) !== text(pending) || increment.right.type !== 'Identifier') throw Error('voice input warmup increment changed');
        const stripFunctions = nodes(ast, 'FunctionDeclaration', n => nodes(n, 'Property', p => p.key?.name === 'stripTrailing' && p.value.type === 'Identifier').length > 0 && text(n).includes('setValueWithCursor'));
        const stripFunction = one(stripFunctions, 'composer hook');
        const stripName = one(nodes(stripFunction, 'Property', p => p.key?.name === 'stripTrailing'), 'strip callback').value.name;
        const strip = one(nodes(stripFunction, 'VariableDeclarator', n => n.id.name === stripName && n.init?.type === 'CallExpression'), 'strip closure').init.arguments[0];
        if (strip.type !== 'ArrowFunctionExpression' || strip.params[0]?.type !== 'Identifier' || strip.params[1]?.type !== 'AssignmentPattern') throw Error('voice input strip closure changed');
        const anchorName = one(strip.params[1].left.properties.filter(p => p.key?.name === 'anchor'), 'anchor option').value.left?.name;
        const anchorBlock = one(nodes(strip, 'IfStatement', n => n.test.name === anchorName && n.consequent.type === 'BlockStatement'), 'anchor snapshot').consequent;
        const anchors = nodes(anchorBlock, 'AssignmentExpression', n => n.left.type === 'MemberExpression' && n.left.property.name === 'current');
        if (anchors.length !== 2) throw Error('voice input anchor refs changed');
        const expected = one(nodes(strip, 'IfStatement', n => n.test.name === anchorName && n.consequent.type === 'ExpressionStatement' && n.consequent.expression.type === 'AssignmentExpression'), 'expected snapshot').consequent.expression.left;
        const stripComposer = one(stripFunction.params[0].properties.filter(p => p.key?.name === 'composer'), 'strip composer').value.name;
        // 没有转写内容时只保存锚点，不提前往后缀前插分隔空格。
        insert(strip.body.start + 1, `if(${enabled}&&${strip.params[0].name}===0&&${anchorName}){let {value:__v,cursorOffset:__c}=${stripComposer};${text(anchors[0].left)}=__v.slice(0,__c);${text(anchors[1].left)}=__v.slice(__c);${text(expected)}=__v;return 0;}`);
        const suffixSeparator = one(nodes(anchorBlock, 'IfStatement', n => nodes(n.consequent, 'AssignmentExpression', a => a.right.value === ' ').length > 0), 'suffix separator');
        replace(suffixSeparator.test, `(!${enabled}&&(${text(suffixSeparator.test)}))`);
        // 保留原生 warmup 和定时器：普通空格即时显示，长按只清理已插入的字符。
        for (const call of strips) {
          const options = call.arguments[1];
          if (options.type !== 'ObjectExpression') throw Error('voice input strip options changed');
          if (options.properties.some(p => p.key?.name === 'floor')) {
            replace(call, `(${enabled}?void 0:${text(call)})`);
          } else if (options.properties.some(p => p.key?.name === 'anchor') && call.arguments[0].type !== 'Literal') {
            replace(call.arguments[0], `(${enabled}?${call === holdAnchor ? text(pending) : '0'}:${text(call.arguments[0])})`);
          }
        }
        const owned = one(nodes(hook, 'IfStatement', n => n.test?.type === 'LogicalExpression' && n.test.operator === '&&' &&
          n.test.left.type === 'MemberExpression' && n.test.left.property.name === 'current' &&
          n.test.right.type === 'BinaryExpression' && n.test.right.operator === '!==' && n.test.right.right.value === 'idle'), 'owned hold').test.left;
        const reset = one(nodes(hook, 'IfStatement', n => n.test?.type === 'BinaryExpression' && n.test.operator === '!==' &&
          n.test.right.value === 'recording' && nodes(n.consequent, 'AssignmentExpression', a => text(a.left) === text(owned)).length > 0), 'hold reset');
        const assignment = one(nodes(reset.consequent, 'AssignmentExpression', n => text(n.left) === text(owned)), 'ownership reset');
        // Keep swallowing the tail of the same hold while ASR finalizes. The
        // existing idle reset releases ownership for normal typing afterward.
        replace(assignment.right, `(${enabled}&&${text(reset.test.left)}==="processing"?${text(owned)}:${text(assignment.right)})`);
        for (const call of nodes(hook, 'CallExpression', n => n.callee.type === 'MemberExpression' && n.callee.property.name === 'stopImmediatePropagation')) {
          replace(call, `(${enabled}&&${text(call.callee.object)}.preventDefault(),${text(call)})`);
        }
        let next = code;
        for (const edit of edits.sort((a, b) => b.start - a.start)) next = next.slice(0, edit.start) + edit.value + next.slice(edit.end);
        acorn.parse(next, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true });
        modules[index] = next + '\n' + marker; count += edits.length;
      }
    } catch (error) { return { status: 'failed', detail: `${error.message}; no writes` }; }
    if (!count) return { status: 'skipped', detail: 'voice input shape not present' };
    return { status: verify ? 'verify' : 'applied', count, code: dryRun || verify ? source : modules.join(separator) };
  },
});

export const voiceRegistry = Object.freeze({
  id: 'voice',
  patches: Object.freeze(patches),
  customPatches: Object.freeze([voiceHoldInput]),
});
