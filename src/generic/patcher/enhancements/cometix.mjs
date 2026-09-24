// Behavioral parity with CometixSpace/claude-code 44ae56d8f1a6367091bdd8681961b2463edab7ec.
// Uses the existing Acorn/registry pipeline; no second patch DSL or installer.
import { findNodes, loadAcorn } from '../core.mjs';
import { gate } from '../runtime-features.mjs';
import voiceAsrAdapter from './voice-asr-cometix.js' with { type: 'text' };

const separator = '\n/*__CLAWGOD_MODULE_BOUNDARY__*/\n';
const prop = (node, name) => node?.properties?.find(p => (p.key?.name ?? p.key?.value) === name);
const member = (node, name) => node?.type === 'MemberExpression' && node.property?.name === name;
const literal = (node, value) => node?.type === 'Literal' && node.value === value;
function one(nodes, label) {
  if (nodes.length !== 1) throw new Error(`${label}: expected one site, found ${nodes.length}`);
  return nodes[0];
}

function transform(id, source, ast) {
  const edits = [];
  const text = n => source.slice(n.start, n.end);
  const nodes = (type, predicate = () => true, root = ast) => findNodes(root, n => n.type === type && predicate(n));
  const functions = (parts, params) => nodes('FunctionDeclaration', n =>
    (params === undefined || n.params.length === params) && parts.every(part => text(n).includes(part)));
  const replace = (node, value) => edits.push({ start: node.start, end: node.end, value });
  const insert = (at, value) => edits.push({ start: at, end: at, value });
  const prepend = (fn, value) => insert(fn.body.start + 1, value);
  const enabled = gate(id);
  const choose = (yes, original) => `(${enabled}?${yes}:${text(original)})`;

  if (id === 'voice-asr-backend') {
    const asrEnabled = `(${enabled}&&(${gate('enable-voice-mode')})&&(${gate('voice-mode')})&&process.env.CLAUDE_CODE_ASR!=="0")`;
    const previousTransport = source.includes('/*__clawgod_cometix_voice-asr-backend__*/');
    const connectors = previousTransport ? [] : functions(['No OAuth token available', 'VOICE_STREAM_BASE_URL'], 3);
    if (connectors.length) {
      const fn = one(connectors, 'voice connector');
      if (!fn.params.every(p => p.type === 'Identifier')) throw new Error('unexpected voice connector parameters');
      // Shared availability predicate gates both /voice and the recording UI.
      const available = functions(['.accessToken'], 0).filter(f => nodes('ReturnStatement', n =>
        n.argument?.type === 'LogicalExpression' && n.argument.operator === '&&' &&
        n.argument.right?.type === 'BinaryExpression' && n.argument.right.operator === '!==' &&
        member(n.argument.right.left, 'accessToken') && literal(n.argument.right.right, null), f).length);
      if (available.length) prepend(one(available, 'voice transport availability'), `if(${asrEnabled})return!0;`);
      insert(fn.start, voiceAsrAdapter + '\n');
      prepend(fn, `if(${asrEnabled})return __ccppAsrConnect(${fn.params[0].name},${fn.params[1].name});`);
    }
    // Newer Claude builds also filter commands before consulting isHidden.
    // Only waive this voice-specific account requirement when using the alternate transport.
    for (const command of previousTransport ? [] : nodes('ObjectExpression', n => literal(prop(n, 'name')?.value, 'voice'))) {
      const availability = prop(command, 'availability')?.value;
      if (availability?.type === 'ArrayExpression' && availability.elements.length === 1 && literal(availability.elements[0], 'claude-ai')) {
        replace(availability, `(${asrEnabled}?undefined:${text(availability)})`);
      }
    }
    // The recording hook calls these two helpers directly, not just the /voice gate.
    // Resolve the auth probe through the voice gate, never through a global auth search.
    const flags = functions(['"allow_voice_mode"'], 0).filter(fn => fn.body.body.length === 1 &&
      fn.body.body[0].type === 'ReturnStatement' && fn.body.body[0].argument?.type === 'CallExpression' &&
      literal(fn.body.body[0].argument.arguments[0], 'allow_voice_mode'));
    if (flags.length) {
      const flag = one(flags, 'voice flag reader');
      const combined = nodes('ReturnStatement', n => n.argument?.operator === '&&' &&
        n.argument.right?.type === 'CallExpression' && n.argument.right.callee.name === flag.id.name &&
        n.argument.left?.type === 'CallExpression' && n.argument.left.callee.type === 'Identifier');
      if (combined.length) {
        const authName = one(combined, 'voice combined gate').argument.left.callee.name;
        const auth = one(nodes('FunctionDeclaration', fn => fn.id?.name === authName && fn.params.length === 0), 'voice auth probe');
        if (auth.body.body.length !== 1 || auth.body.body[0].type !== 'TryStatement') throw new Error('unexpected voice auth probe');
        prepend(auth, `if(${asrEnabled})return!0;`);
        prepend(flag, `if(${asrEnabled})return!0;`);
      }
    }
  } else if (id === 'cleanup-period'  || id === 'file-read-limit') {
    const bindings = id === 'cleanup-period'
      ? nodes('LogicalExpression', n => n.operator === '??' && member(n.left, 'cleanupPeriodDays') && n.right.type === 'Identifier').map(n => n.right.name)
      : nodes('Property', n => n.key?.name === 'maxTokens' && n.value.operator === '??' && n.value.right.type === 'Identifier').map(n => n.value.right.name);
    if (!bindings.length) return edits;
    const name = one([...new Set(bindings)], 'default binding');
    const declaration = one(nodes('VariableDeclarator', n => n.id.name === name && n.init?.type === 'Literal' && typeof n.init.value === 'number'), 'default declaration');
    if (declaration.init.value <= 0 || (id === 'cleanup-period' && declaration.init.value > 365)) throw new Error('unexpected default value');
    replace(declaration.init, choose(id === 'cleanup-period' ? '9999' : '100000', declaration.init));
  } else if (id === 'context-limit') {
    const targets = functions(['CLAUDE_CODE_MAX_CONTEXT_TOKENS'], 2).filter(fn => nodes('ReturnStatement', n => literal(n.argument, 1000000), fn).length);
    if (!targets.length) return edits;
    prepend(one(targets, 'context resolver'), `if(${enabled}){let __clawgodLimit=Number(process.env.CLAUDE_CODE_CONTEXT_LIMIT);if(Number.isFinite(__clawgodLimit)&&__clawgodLimit>0)return __clawgodLimit;}`);
  } else if (id === 'classifier-model') {
    const targets = functions(['classifierStage:"xml_s1"', 'classifierStage:"xml_s2"']);
    if (!targets.length) return edits;
    const fn = one(targets, 'classifier entry');
    const names = nodes('Property', n => n.key?.name === 'classifierModel' && n.value.type === 'Identifier', fn).map(n => n.value.name);
    const name = one([...new Set(names)], 'classifier model');
    // Never assign an imported/module binding or a local before its declaration.
    const parameters = fn.params.filter(n => n.type === 'Identifier').map(n => n.name);
    if (!parameters.includes(name)) throw new Error('classifier model is not a parameter');
    prepend(fn, `if(${enabled}){let __clawgodModel=(process.env.CLAWGOD_CLASSIFIER_MODEL||process.env.CLAUDE_CLASSIFIER_MODEL||"").trim();if(__clawgodModel)${name}=__clawgodModel;}`);
  } else if (id === 'classifier-fail-open') {
    const targets = nodes('ObjectExpression', n => literal(prop(n, 'behavior')?.value, 'deny') &&
      nodes('Property', p => p.key?.name === 'classifier' && literal(p.value, 'auto-mode'), n).length > 0 && text(n).includes('httpStatus') && text(n).includes('errorKind') && !text(n).includes('noVerdict'));
    if (!targets.length) return edits;
    replace(prop(one(targets, 'classifier unavailable result'), 'behavior').value, `(${enabled}?"ask":"deny")`);
  } else if (id === 'enable-keybindings') {
    for (const call of nodes('CallExpression', n => n.arguments.length === 2 && literal(n.arguments[0], 'tengu_keybinding_customization_release'))) {
      replace(call.arguments[1], choose('!0', call.arguments[1]));
    }
    for (const p of nodes('Property', n => literal(n.key, 'ctrl+c') && literal(n.value, 'app:interrupt'))) replace(p.value, choose('"app:exit"', p.value));
  } else if (id === 'unlock-ultracode') {
    const targets = functions(['"xhigh_effort"', 'claude-3-'], 1);
    if (targets.length) prepend(one(targets, 'xhigh capability'), `if(${enabled})return!0;`);
  } else if (id === 'chrome-local-socket') {
    // Accept both upstream dispatch and ClawGod's existing async-safe socket-first dispatch.
    const targets = functions(['.bridgeConfig', '.getSocketPaths'], 1).filter(fn => fn.body.body.length === 1 && fn.body.body[0].type === 'ReturnStatement');
    if (!targets.length) return edits;
    const fn = one(targets, 'Chrome factory'), arg = fn.params[0].name;
    const returned = fn.body.body[0].argument;
    if (returned.type !== 'ConditionalExpression') throw new Error('unexpected Chrome dispatch');
    let socket, native;
    if (member(returned.test, 'bridgeConfig') && member(returned.alternate?.test, 'getSocketPaths')) {
      socket = returned.alternate.consequent; native = returned.alternate.alternate;
    } else if (member(returned.test, 'getSocketPaths') && member(returned.alternate?.test, 'bridgeConfig')) {
      socket = returned.consequent; native = returned.alternate.alternate;
    } else throw new Error('unexpected Chrome dispatch arms');
    prepend(fn, `if(${enabled}){${arg}.bridgeConfig=void 0;return ${arg}.getSocketPaths?${text(socket)}:${text(native)}}`);
  } else if (id === 'computer-use') {
    const targets = functions(['"hipaa"'], 0).filter(fn => fn.body.body.some(n => n.type === 'ReturnStatement' && n.argument?.operator === '&&' && member(n.argument.right, 'enabled')));
    if (!targets.length) return edits;
    const fn = one(targets, 'computer-use compliance gate');
    const compliance = fn.body.body.find(n => n.type === 'IfStatement' && text(n).includes('"hipaa"'));
    if (!compliance) throw new Error('missing compliance guard');
    insert(compliance.end, `if(${enabled}&&process.env.CLAUDE_CODE_COMPUTER_USE)return!0;`);
  } else if (id === 'disable-collapse-read-search') {
    const admission = functions(['grouped_tool_use', 'toolUseIds', 'isAbsorbedSilently', 'readPaths'], 2);
    const classifier = functions(['isSearchOrReadCommand', 'isCollapsible', 'isAbsorbedSilently', 'popsOutOnError'], 3);
    const scanners = functions(['.isCollapsible', 'redacted_thinking', 'grouped_tool_use', 'return-1']);
    if (!admission.length && !classifier.length && !scanners.length) return edits;
    if (admission.length) {
      const fn = one(admission, 'fold admission');
      const guard = one(nodes('IfStatement', n => n.test.type === 'UnaryExpression' && n.test.operator === '!' && n.test.argument.type === 'Identifier' && n.consequent.type === 'ReturnStatement' && literal(n.consequent.argument, null), fn), 'fold guard');
      const info = text(guard.test.argument);
      replace(guard.test, `(${text(guard.test)}||(${enabled}&&(${info}.isAbsorbedSilently!==!0||${info}.isREPL===!0)))`);
    }
    if (classifier.length) {
      const classify = one(classifier, 'tool classifier');
      const condition = one(nodes('IfStatement', n => n.test.operator === '||' && n.test.left.operator === '&&' && n.test.left.left.type === 'CallExpression' && n.test.left.right.operator === '===' && text(n.consequent).includes('popsOutOnError'), classify), 'ToolSearch branch');
      replace(condition.test.left, choose(text(condition.test.left.right), condition.test.left));
    }
    // The settle scanner may live in a different chunk from admission/classification.
    // Older bundles have no dedicated scanner; do not invent one.
    for (const scanner of scanners) for (const call of nodes('MemberExpression', n => n.property.name === 'isCollapsible' && n.object.type === 'CallExpression', scanner)) {
      replace(call, choose(`((v)=>v.isAbsorbedSilently===!0&&v.isREPL!==!0)(${text(call.object)})`, call));
    }
  } else if (id === 'enable-voice-mode') {
    const readers = functions(['allow_voice_mode'], 0).filter(n => n.body.body.length === 1 && n.body.body[0].type === 'ReturnStatement');
    if (readers.length) {
      const reader = one(readers, 'voice flag reader');
      const targets = nodes('FunctionDeclaration', n => n.params.length === 0 && n.body.body.length === 1 && n.body.body[0].argument?.operator === '&&' && n.body.body[0].argument.right?.callee?.name === reader.id.name);
      if (targets.length) prepend(one(targets, 'voice availability'), `if(${enabled})return!0;`);
    }
    const builders = functions(['id:"autoCompact"', 'settingsData:', 'setSettingsData:', 'setAppState:', 'changeLog:']);
    if (!builders.length) return edits;
    const fn = one(builders, 'config builder');
    if (nodes('Property', n => n.key?.name === 'id' && literal(n.value, 'voiceMode'), fn).length) return edits;
    const binding = key => one(nodes('Property', n => n.key?.name === key && n.value.type === 'Identifier', fn), key).value.name;
    const sd = binding('settingsData'), set = binding('setSettingsData'), app = binding('setAppState'), log = binding('changeLog');
    const writer = one(nodes('FunctionDeclaration', n => n.params.length === 1 && text(n).includes('"userSettings"'), fn).filter(n => n !== fn), 'settings writer').id.name;
    const row = one(nodes('ObjectExpression', n => literal(prop(n, 'id')?.value, 'autoCompact'), fn), 'autoCompact row');
    const rowSource = `{id:"voiceMode",label:"Voice mode",type:"enum",options:["off","hold","tap"],value:(${sd}?.voice?.enabled??${sd}?.voiceEnabled)?(${sd}?.voice?.mode??"hold"):"off",async onChange(mode){if(!["off","hold","tap"].includes(mode))return{error:"Invalid voice mode"};let on=mode!=="off",voice={...${sd}?.voice,enabled:on,mode:on?mode:(${sd}?.voice?.mode??"hold")},update={voiceEnabled:on,voice},result=await ${writer}(update);if(result?.error)return result;${set}(s=>({...s,...update}));${app}(s=>({...s,settings:{...s.settings,...update}}));${log}.record("Voice mode",mode)}}`;
    insert(row.start, `...(${enabled}?[${rowSource}]:[]),`);
  } else if (id === 'transcript-dialog-replay') {
    const targets = functions(['dialog-', 'subscribe(', 'onFirstReveal'], 0).filter(fn => fn.body.body[0]?.declarations?.[3]?.init?.callee?.name === 'Map');
    if (!targets.length) return edits;
    const fn = one(targets, 'dialog channel');
    const pending = fn.body.body[0].declarations[3].id.name;
    const method = name => one(nodes('Property', n => n.key?.name === name && n.value.type === 'FunctionExpression', fn), `dialog ${name}`).value;
    const subscribe = method('subscribe'); const listener = subscribe.params[0].name;
    const reply = method('reply'); const request = method('request');
    if ([subscribe, reply].some(n => n.params.length !== 1 || n.params[0].type !== 'Identifier')) throw new Error('unexpected dialog parameters');
    const unsubscribe = one(subscribe.body.body.filter(n => n.type === 'ReturnStatement' && ['ArrowFunctionExpression', 'FunctionExpression'].includes(n.argument?.type)), 'dialog unsubscribe').argument;
    if (unsubscribe.body.type === 'BlockStatement') prepend(unsubscribe, '__clawgodListening=!1;');
    else replace(unsubscribe.body, `(__clawgodListening=!1,${text(unsubscribe.body)})`);
    const abort = one(nodes('IfStatement', n => n.test.operator === '||' && n.test.left.type === 'ChainExpression' && n.test.right.operator === '===' && literal(n.test.right.right, 0) && text(n).includes('cancelled:!0'), request), 'dialog cancellation');
    const emit = one(nodes('CallExpression', n => member(n.callee, 'emit') && n.arguments.length === 1 && n.arguments[0].type === 'ObjectExpression' && prop(n.arguments[0], 'onFirstReveal'), request), 'dialog event');
    const event = emit.arguments[0], eventId = text(prop(event, 'id').value);
    prepend(fn, 'let __clawgodDialogs=new Map;');
    replace(abort.test, `(${text(abort.test.left)}||(${enabled}===!1&&${text(abort.test.right)}))`);
    replace(event, `(${enabled}?(__clawgodDialogs.set(${eventId},${text(event)}),__clawgodDialogs.get(${eventId})):${text(event)})`);
    // Check pending state after the microtask too: abort/reply can race subscription.
    prepend(subscribe, `let __clawgodListening=!0;if(${enabled})for(let [id,event]of __clawgodDialogs){if(!${pending}.has(id)){__clawgodDialogs.delete(id);continue}queueMicrotask(()=>{if(__clawgodListening&&${pending}.has(id))${listener}(__clawgodDialogs.get(id)??event)})}`);
    prepend(reply, `__clawgodDialogs.delete(${reply.params[0].name}.id);`);
    for (const update of nodes('CallExpression', n => member(n.callee, 'emit') && n.arguments.length === 1 && n.arguments[0].type === 'ObjectExpression' && prop(n.arguments[0], 'id') && prop(n.arguments[0], 'payload') && !prop(n.arguments[0], 'onFirstReveal'), request)) {
      const value = update.arguments[0];
      replace(value, `((event)=>{let saved=__clawgodDialogs.get(event.id);if(saved)__clawgodDialogs.set(event.id,{...saved,payload:event.payload});return event})(${text(value)})`);
    }
    // Delete on both reply and abort; never retain cancelled payloads indefinitely.
    for (const deletion of nodes('CallExpression', n => member(n.callee, 'delete') && n.callee.object.name === pending && n.arguments.length === 1, fn)) {
      replace(deletion, `(__clawgodDialogs.delete(${text(deletion.arguments[0])}),${text(deletion)})`);
    }

  }
  return edits;
}

const definitions = [
  ['chrome-local-socket', 'chrome', 'bridgeConfig'],
  ['classifier-fail-open', 'classifier-fail-open', 'denying with retry guidance'],
  ['classifier-model', 'auto-mode', 'classifierStage'],
  ['cleanup-period', 'cleanup-period', 'cleanupPeriodDays'],
  ['computer-use', 'computer-use', 'hipaa'],
  ['context-limit', 'core', 'CLAUDE_CODE_MAX_CONTEXT_TOKENS'],
  ['disable-collapse-read-search', 'disable-collapse-read-search', 'isAbsorbedSilently', '.isCollapsible'],
  ['enable-keybindings', 'enable-keybindings', 'ctrl+c', 'tengu_keybinding_customization_release'],
  ['enable-voice-mode', 'voice', 'allow_voice_mode', 'id:"autoCompact"'],
  ['file-read-limit', 'file-read-limit', 'defaultFileReadingLimits'],
  ['transcript-dialog-replay', 'transcript-dialog-replay', 'dialog-'],
  ['unlock-ultracode', 'unlock-ultracode', 'xhigh_effort'],
  ['voice-asr-backend', 'voice', 'VOICE_STREAM_BASE_URL', 'name:"voice"', 'allow_voice_mode'],
];

export const cometixPatches = Object.freeze(definitions.map(([id, enhancement, ...anchors], i) => Object.freeze({
  id, enhancement, order: 100 + i, name: `Cometix parity: ${id}`,
  async apply(source, { rootDir, dryRun = false, verify = false } = {}) {
    const marker = `/*__clawgod_cometix_${id}${id === 'voice-asr-backend' ? '_v2' : ''}__*/`;
    const modules = source.split(separator);
    const candidates = modules.map((code, index) => ({ code, index })).filter(m => !m.code.includes(marker) && anchors.some(a => m.code.includes(a))
      && (id !== 'context-limit' || /\breturn\s+(?:1e6|1000000)\b/.test(m.code)));
    if (!candidates.length) return { status: source.includes(marker) ? 'already' : 'skipped', detail: 'no unpatched sites' };
    const acorn = await loadAcorn(rootDir);
    if (!acorn) return { status: 'failed', detail: 'Acorn unavailable; no writes' };
    let count = 0;
    try {
      for (const { code, index } of candidates) {
        const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true });
        const edits = transform(id, code, ast).sort((a, b) => b.start - a.start || b.end - a.end);
        let next = code, boundary = code.length;
        for (const edit of edits) {
          if (edit.end > boundary) throw new Error('overlapping patch sites');
          next = next.slice(0, edit.start) + edit.value + next.slice(edit.end);
          boundary = edit.start;
        }
        if (!edits.length) continue;
        acorn.parse(next, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true });
        modules[index] = `${next}\n${marker}`;
        count += edits.length;
      }
    } catch (error) { return { status: 'failed', detail: `${error.message}; no writes` }; }
    if (!count) return { status: source.includes(marker) ? 'already' : 'skipped', detail: 'target shape not present' };
    return { status: verify ? 'verify' : 'applied', count, code: dryRun || verify ? source : modules.join(separator) };
  },
})));

export function extendWithCometix(registry) {
  return Object.freeze({ ...registry, customPatches: Object.freeze([...registry.customPatches, ...cometixPatches.filter(p => p.enhancement === registry.id)]) });
}
