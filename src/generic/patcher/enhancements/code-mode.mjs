import { createHash } from 'node:crypto';
import { findNodes } from '../core.mjs';
import { parsePatchSource } from '../semantic.mjs';

const separator = '\n/*__CLAWGOD_MODULE_BOUNDARY__*/\n';
const marker = '/*__clawgod_code_mode_local_v1__*/';
const feature = 'tengu_rustling_blossom';
// shortcut: 冻结 2.1.325 的完整 opt-in AST，升级改变结构时先审查并更新契约。
const originalContract = '3f00dbe7afc7f51e22d03551b6990394c8624ebe160060a3da05ac78fd799a85';
const patchedContract = '6f8b4849154cc8dad782c83b9210a8509ff6441a2bcb57ef50ef5820a86df8d1';
// 导入来源及外部导出名按三平台冻结；只允许本地别名与安装器路径前缀变化。
const interfaceContracts = new Set([
  '989a868f9a4de1f7e118de4389bfc11f2b9173a4c2f3fb1feb7c0619942279bc', // darwin-arm64
  '5798f6f581d706317d12706c3c2ffb2eb9488ddd6bd7d059c2f8b2619951a6aa', // linux-x64
  'a9596d763460f38124c284b083074ea7c97dd0000fd0085ed28dcedac5fd833b', // win32-x64
]);
// 2.1.330 重写了 SDK/headless 准入。本地补丁暂未核验这些路径；只对已知契约保留上游实现。
const upstream330Contract = '0d1a517d1056e265da254e773a9afb08ab262e814a486bc3a1a4e0d77b480946';
const upstream330Interfaces = new Set([
  '2dca65a4bb050550cbec6f0fcd199a3b7f87fd29167fd80df65ae36a33d165c4',
  'ff50cc1f86c571ea0f21b2b117648c2bae869f4da4de21ae19644863592ab8d9',
  '0246f6d5c38af4848e6c2d652a550bda0d071306b8555e3123cd7dacdd60db19',
]);
// 2.1.332 使用独立本地交互 profile；SDK/headless 不在解锁范围内。
const upstream332Contract = '25f7b81595d789b3072a6c832a498dcf3518da84cb9972edad8ba307aa7ec871';
const patched332Contract = '5a007c3c7f8e35357b463b5edb9595a230f69146756c62878283d870b76f3afb';
const upstream332Interfaces = new Set([
  '1c6b0a4b5d01f9ab4118f1c5306240021cd4bc1a6c838c20f9f5dfa2f5081e2a',
  '7036249a5a0797dbaf95b1a08850fe45edd125028657aec741028fd0f63c8575',
  '4432e53020b6be21fc05fa3d24fb842d07c9837100df68b9891c05f308a647a3',
]);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function interfaceContract(ast) {
  return digest([
    ast.body.filter(node => node.type === 'ImportDeclaration').map(node => [
      node.source.value.replace(/^(?:\/\$bunfs\/root\/|[A-Z]:\/~BUN\/root\/|\.\/)/, ''),
      node.specifiers.map(specifier => [specifier.type, specifier.imported?.name]),
    ]),
    ast.body.filter(node => node.type === 'ExportNamedDeclaration').map(node => node.specifiers.map(specifier => specifier.exported.name)),
  ]);
}

function contract(ast) {
  const names = new Map();
  const globals = new Set(['process', 'Object', 'String', 'Promise', 'Bun']);
  function normalize(node, parent, key) {
    if (Array.isArray(node)) return node.map(child => normalize(child, parent, key));
    if (!node || typeof node !== 'object') return node;
    if (node.type === 'Identifier') {
      const publicName = (parent?.type === 'MemberExpression' && key === 'property' && !parent.computed)
        || (parent?.type === 'Property' && key === 'key' && !parent.computed) || globals.has(node.name);
      if (!publicName && !names.has(node.name)) names.set(node.name, names.size);
      return { type: node.type, name: publicName ? node.name : names.get(node.name) };
    }
    return Object.fromEntries(Object.entries(node).filter(([field]) => !['start', 'end', 'raw'].includes(field)
      && !(node.type === 'ImportDeclaration' && field === 'source')
      && !(node.type === 'ImportSpecifier' && field === 'imported')
      && !(node.type === 'ExportSpecifier' && field === 'exported'))
      .map(([field, value]) => [field, normalize(value, node, field)]));
  }
  return createHash('sha256').update(JSON.stringify(normalize(ast))).digest('hex');
}

function local332(code, ast) {
  const declarations = ast.body.filter(node => node.type === 'FunctionDeclaration');
  const names = ast.body.find(node => node.type === 'ExportNamedDeclaration').specifiers.map(node => node.local.name);
  const fn = name => declarations.find(node => node.id.name === name);
  const [, modelFamily, model, , , , , , , , answer, finalize, stable] = names;
  const edits = [];
  const body = (name, value) => {
    const node = fn(name);
    if (!node) throw new Error(`Code Mode 332 缺少声明: ${name}`);
    edits.push({ start: node.body.start, end: node.body.end, value: `{${value}}` });
  };
  // 只替换 Code Mode 自身的账号、模型和 rollout 资格；不动共享 Provider 或云端 gate。
  body('se', 'return typeof Bun!=="undefined";');
  for (const name of [modelFamily, model]) body(name, 'return!0;');
  for (const name of ['_', 'L', 'O', 'W', 'C']) body(name, 'return!1;');
  // Hy 同步读取已注册托管 verdict（缺失/失败即拒绝）。不恢复会主动发起官方加载的 i8n/Ks。
  const policyAbsent = fn('X').body.body[0].argument.right.argument.callee.name;
  const localReason = `${policyAbsent}()?"admin_unread":A()?"admin":y()?"compliance":R()?"otel":void 0`;
  body('q', `return ${localReason};`);
  body('N', 'return{read:!0};');
  const eligibility = fn('I');
  // SDK/headless 有独立的认证与确认语义；本次只解锁本地交互，不扩大这些入口。
  edits.push({ start: eligibility.body.start + 1, end: eligibility.body.start + 1, value: 'if(ge())return"entrypoint";' });
  const consent = fn(answer);
  const consentGuards = consent.body.body.filter(node => node.type === 'IfStatement').slice(0, 3);
  if (consentGuards.length !== 3) throw new Error('Code Mode 332 风险确认结构漂移');
  body(answer, consentGuards.map(node => code.slice(node.start, node.end)).join('') + code.slice(consent.body.body.at(-1).start, consent.body.body.at(-1).end));
  const finishing = fn(finalize), precondition = finishing.body.body[0];
  const recheck = findNodes(finishing, node => node.type === 'CallExpression' && node.arguments[0]?.type === 'ArrowFunctionExpression')[0].callee.name;
  body(finalize, `${code.slice(precondition.start, precondition.end)}let __clawgodReason=!r.reviewed?"no_setup":${localReason};if(__clawgodReason===void 0){r.signedInAs={};${recheck}(()=>${localReason});return"none"}return T(__clawgodReason,"restart_without_mode");`);
  body(stable, 'return r.signedInAs!==void 0;');
  let next = code;
  for (const edit of edits.sort((a, b) => b.start - a.start)) next = next.slice(0, edit.start) + edit.value + next.slice(edit.end);
  const signature = contract(parsePatchSource(next));
  if (signature !== patched332Contract) throw new Error(`patched Code Mode 332 contract drift: ${signature}`);
  return { code: `${next}\n${marker}`, count: edits.length };
}

async function apply(source, { dryRun = false, verify = false } = {}) {
  const modules = source.split(separator);
  if (!source.includes(feature) && !source.includes(marker)) return { status: 'skipped', detail: 'Code Mode not present in this version' };
  try {
    const candidates = modules.map((code, index) => ({ code, index })).filter(({ code }) => code.includes(feature) || code.includes(marker)).map(candidate => ({ ...candidate, ast: parsePatchSource(candidate.code) })).filter(({ code, ast }) => {
      if (code.includes(marker)) return true;
      const keys = findNodes(ast, node => node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init?.value === feature).map(node => node.id.name);
      return ast.body.some(node => node.type === 'ExportNamedDeclaration' && node.specifiers.some(specifier => keys.includes(specifier.local.name)));
    });
    if (candidates.length !== 1) throw new Error(`Code Mode opt-in module: expected one exported feature declaration, found ${candidates.length}`);
    const { code, index, ast } = candidates[0];
    const header = code.match(/^(?:[ \t]*\/\/[^\r\n]*(?:\r?\n|$)|\s)*/)[0];
    const versions = [...header.matchAll(/^[ \t]*\/\/[ \t]*Version:([^\r\n]*)/gm)].map(match => match[1].trim());
    if (!versions.length || versions.some(version => !/^\d+\.\d+\.\d+$/.test(version)) || new Set(versions).size !== 1) throw new Error('Code Mode source version is missing, invalid or conflicting');
    const version = versions[0].split('.').map(Number), minimum = [2, 1, 323];
    if (version.some(part => !Number.isSafeInteger(part))) throw new Error('Code Mode source version is invalid');
    const different = version.findIndex((part, index) => part !== minimum[index]);
    if (different !== -1 && version[different] < minimum[different]) return { status: 'skipped', detail: 'local Code Mode requires Claude Code >= 2.1.323' };
    const edges = interfaceContract(ast);
    if (versions[0] === '2.1.330' && upstream330Interfaces.has(edges)) {
      if (code.includes(marker) || contract(ast) !== upstream330Contract) throw new Error('Code Mode 2.1.330 upstream contract drift');
      return { status: 'skipped', warning: '2.1.330 local eligibility not supported; upstream Code Mode preserved' };
    }
    if (versions[0] === '2.1.332' && upstream332Interfaces.has(edges)) {
      const signature = contract(ast);
      if (code.includes(marker)) {
        if (signature !== patched332Contract) throw new Error(`patched Code Mode 332 contract drift: ${signature}`);
        return { status: 'already', detail: 'local Code Mode 332 eligibility already applied' };
      }
      if (signature !== upstream332Contract) throw new Error(`Code Mode 332 opt-in contract drift: ${signature}`);
      const next = local332(code, ast);
      if (dryRun || verify) return { status: verify ? 'verify' : 'applied', count: next.count };
      modules[index] = next.code;
      return { status: 'applied', count: next.count, code: modules.join(separator) };
    }
    if (!interfaceContracts.has(edges)) throw new Error(`Code Mode interface contract drift: ${edges}`);
    const signature = contract(ast);
    if (code.includes(marker)) {
      if (signature !== patchedContract) throw new Error(`patched Code Mode contract drift: ${signature}`);
      return { status: 'already', detail: 'local Code Mode eligibility already applied' };
    }
    if (signature !== originalContract) throw new Error(`Code Mode opt-in contract drift: ${signature}`);
    const declarations = ast.body.filter(node => node.type === 'FunctionDeclaration');
    const exported = ast.body.find(node => node.type === 'ExportNamedDeclaration').specifiers.map(node => node.local.name);
    const fn = name => declarations.find(node => node.id.name === name);
    const model = fn(exported[1]), start = fn(exported[3]), finalize = fn(exported[7]), stable = fn(exported[8]);
    const eligibility = fn(findNodes(start, node => node.type === 'CallExpression' && node.arguments.length === 2 && node.arguments[1]?.operator === '!')[0].callee.name);
    const calledBefore = reason => {
      const branch = eligibility.body.body.find(node => node.type === 'IfStatement' && node.consequent.argument?.value === reason);
      return fn(findNodes(branch.test, node => node.type === 'CallExpression')[0].callee.name);
    };
    const runtime = calledBefore('runtime'), provider = calledBefore('provider'), credentials = calledBefore('credentials');
    const gate = fn(fn(exported[4]).body.body.filter(node => node.type === 'VariableDeclaration').at(-1).declarations[0].init.callee.name);
    const setup = declarations.find(node => node.async && findNodes(node, child => child.type === 'Literal' && child.value === 'opt-in wait').length);
    const setupReturn = setup.body.body.at(-1);
    const compliance = calledBefore('compliance');
    const otel = calledBefore('otel');
    const setupAdmin = setup.body.body.find(node => node.type === 'IfStatement' && node.consequent.argument?.value === 'admin');
    const adminName = findNodes(setupAdmin.test, node => node.type === 'CallExpression')[0].callee.name;
    const policyCall = findNodes(fn(exported[5]), node => node.type === 'AssignmentExpression' && node.left.property?.name === 'policyPrincipal')[0].right;
    const principal = fn(policyCall.callee.name);
    const edits = [];
    const replaceBody = (node, value) => edits.push({ start: node.body.start, end: node.body.end, value: `{${value}}` });
    replaceBody(runtime, 'return typeof Bun!=="undefined";');
    for (const node of [model, provider, gate]) replaceBody(node, 'return!0;');
    replaceBody(credentials, 'return!1;');
    // 仅移除 Code Mode 的远端初始化，保留本地管理员、合规、遥测和 mods 检查。
    replaceBody(setup, `if(${adminName}())return"admin";if(${compliance.id.name}())return"compliance";if(${otel.id.name}())return"otel";${code.slice(setupReturn.start, setupReturn.end)}`);
    replaceBody(principal, 'return{read:!0};');
    const restart = findNodes(finalize, node => node.type === 'ReturnStatement' && node.argument?.type === 'CallExpression' && node.argument.arguments[1]?.value === 'restart_without_mode')[0];
    const reviewed = findNodes(finalize, node => node.type === 'MemberExpression' && node.property.name === 'reviewed')[0];
    const state = code.slice(reviewed.object.start, reviewed.object.end);
    const precondition = finalize.body.body[0];
    replaceBody(finalize, `${code.slice(precondition.start, precondition.end)}let __clawgodReason=!${state}.reviewed?"no_setup":${adminName}()?"admin":${compliance.id.name}()?"compliance":${otel.id.name}()?"otel":void 0;if(__clawgodReason===void 0){${state}.signedInAs={};return"none"}return ${restart.argument.callee.name}(__clawgodReason,"restart_without_mode");`);
    replaceBody(stable, `return ${state}.signedInAs!==void 0;`);
    let next = code;
    for (const edit of edits.sort((a, b) => b.start - a.start)) next = next.slice(0, edit.start) + edit.value + next.slice(edit.end);
    const outputSignature = contract(parsePatchSource(next));
    if (outputSignature !== patchedContract) throw new Error(`patched Code Mode contract drift: ${outputSignature}`);
    modules[index] = `${next}\n${marker}`;
    return { status: verify ? 'verify' : 'applied', count: edits.length, code: dryRun || verify ? source : modules.join(separator) };
  } catch (error) {
    return { status: 'stale', detail: `${error.message}; no writes` };
  }
}

export const codeModeRegistry = Object.freeze({
  id: 'code-mode',
  patches: Object.freeze([]),
  customPatches: Object.freeze([{ order: 95, name: 'Code Mode local eligibility', apply }]),
});
