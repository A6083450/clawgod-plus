#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parsePatchSource } from '../src/generic/patcher/semantic.mjs';
import { codeModeRegistry } from '../src/generic/patcher/enhancements/code-mode.mjs';

const fixture = readFileSync(new URL('./fixtures/code-mode-2.1.325.js', import.meta.url), 'utf8');
const patch = codeModeRegistry.customPatches[0];
const patched = await patch.apply(fixture);
assert.equal(patched.status, 'applied', patched.detail);
const patchedSource = patched.code;

function harness(source, options = {}, storage = { settings: {}, env: {} }, rename = name => name) {
  let state = { state: 'not_asked' }, asking = false;
  const forbidden = name => () => { throw new Error(`禁止远端依赖: ${name}`); };
  const denied = options.denyTools ? [{ env: {}, permissions: { deny: ['Read'] } }] : [];
  const env = { ...storage.env, ...(options.enabled === false ? {} : { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: '1' }), ...options.env };
  const locals = { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: '1', ...options.userEnv };
  const managed = options.managed === undefined ? [] : [{ env: { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: options.managed } }];
  const dependencies = {
    Pe: value => ['1', 'true', 'yes'].includes(String(value).toLowerCase()),
    ws: value => ['0', 'false', 'no'].includes(String(value).toLowerCase()),
    fe: initial => ({ ...initial }),
    ND: 'CLAUDE_CODE_EXPERIMENTAL_CODE_MODE',
    Kt: () => true,
    Se: source => source === 'userSettings' ? { env: locals } : source === 'flagSettings' ? { env: {} } : denied[0],
    pm: () => managed,
    P9: () => options.admin === true,
    pY: () => ({}),
    f_: () => ({ ...env, ...options.shellEnv }),
    vbe: new Proxy({ set: (key, value) => { storage.env[key] = value; env[key] = value; }, unset: key => { delete storage.env[key]; delete env[key]; } }, {
      get: (target, key) => key in target ? target[key] : env[key],
    }),
    jl: forbidden('模型资格'), lt: forbidden('模型别名'), vk: forbidden('模型系列'), wDe: forbidden('模型版本'),
    ke: forbidden('通用 Provider 探测'), gc: forbidden('官方登录状态'),
    Wd: () => false, oU: ['CLAUDE_CODE_USE_BEDROCK'], Mp: forbidden('通用 standalone 谓词'),
    un: forbidden('远端 feature payload'),
    j_: forbidden('远端 managed settings settled'), xp: forbidden('远端 settings 状态'),
    Rye: forbidden('远端 compliance settled'), ab: forbidden('远端 policy 状态'),
    ao: type => options.compliance === type,
    ng: forbidden('官方凭据'), pw: forbidden('云凭据'), G9e: forbidden('Bearer 凭据'), tg: forbidden('远端 token'),
    uO: () => options.otel === true,
    pe: () => storage.settings,
    o$r: next => { state = next; },
    f: value => value, de: value => value, be: value => value, l: () => {}, g: () => {}, c: () => {},
    kr: rule => ({ toolName: rule }), ja: name => name === 'Read', Sw: () => false, E7e: () => false, Co: {},
    rDn: () => null, cSr: tools => ({ kept: tools, excluded: [] }), Vc: tools => tools,
    fi: options.denyTools ? ['projectSettings'] : [],
    sd: () => options.bash !== false,
    i: { ...options.entryEnv }, ol: () => options.entrypoint ?? 'cli', ge: () => false, Xt: () => false,
    bjs: () => false, Cun: () => options.engine ?? 'passed', vs: () => options.teams === true,
    at: () => 'arbitrary-local-model', Ud: () => 'default-local-model', Ut: value => value,
    Bfa: () => { asking = true; },
    Yee: () => { asking = false; },
    Wt: async promise => promise,
    nde: forbidden('feature 初始化'), as: forbidden('feature 网络'), wE: forbidden('managed settings 网络'), Vhn: forbidden('policy 网络'),
    s$r: () => asking, aZ: () => state,
    _k: async (update, source) => { assert.equal(source, 'userSettings'); if (options.saveFailed) return false; storage.settings = update(storage.settings); return true; },
    G: () => 'session-fixture', nx: async () => {},
    Xzt: forbidden('远端 policy principal'),
    hn: forbidden('官方账号'), Kn: forbidden('订阅类型'), Ev: forbidden('限额类型'), qu: forbidden('账号比较'),
  };
  const ast = parsePatchSource(source);
  const imports = ast.body.filter(node => node.type === 'ImportDeclaration');
  const exported = ast.body.find(node => node.type === 'ExportNamedDeclaration');
  const named = exported.specifiers.map(spec => spec.local.name);
  let executable = source;
  for (const node of [...imports, exported].sort((a, b) => b.start - a.start)) executable = executable.slice(0, node.start) + executable.slice(node.end);
  executable += `\nglobalThis.api={model:${named[1]},tools:${named[2]},start:${named[3]},foreseen:${named[4]},review:${named[5]},answer:${named[6]},finalize:${named[7]},stable:${named[8]}};`;
  const context = { process: { env }, Bun: {}, ...Object.fromEntries(Object.entries(dependencies).map(([name, value]) => [rename(name), value])) };
  if (options.noBun) delete context.Bun;
  runInNewContext(executable, context);
  return { api: context.api, storage, options, state: () => state, asking: () => asking, startOptions: { lastCheck: async () => options.mods } };
}

const local = harness(patchedSource);
await local.api.start(local.startOptions);
assert.equal(local.asking(), true, `第三方 Provider、无官方账号或 feature payload 也应进入首次 caveat: ${JSON.stringify(local.state())}`);
assert.equal(await local.api.review(), 'ask');
assert.equal(await local.api.answer(true, 'userSettings'), 'restart_into_mode');
assert.equal(local.storage.settings.codeModeCaveatsAcceptedV1, true);
assert.equal(local.storage.settings.codeModeAutoModeCaveatAcceptedV1, true);
const restarted = harness(patchedSource, {}, local.storage);
await restarted.api.start(restarted.startOptions);
assert.equal(restarted.state().state, 'on');
assert.equal(await restarted.api.review(), 'none');
assert.equal(await restarted.api.finalize(), 'none');
assert.equal(restarted.api.stable(), true, '无官方账号不能制造额外重启');
function acceptedStorage() {
  return { settings: { codeModeCaveatsAcceptedV1: true, codeModeAutoModeCaveatAcceptedV1: true }, env: {} };
}

for (const [label, options, reason] of [
  ['非 Bun runtime', { noBun: true }, 'runtime'],
  ['管理员禁用', { admin: true }, 'admin'],
  ['管理员环境禁用', { managed: '0' }, 'admin'],
  ['引擎失败', { engine: 'failed' }, 'engine'],
  ['无 Bash', { bash: false }, 'no_bash'],
  ['远控入口', { entryEnv: { CLAUDE_CODE_REMOTE: '1' } }, 'entrypoint'],
  ['非 CLI 入口', { entrypoint: 'sdk' }, 'entrypoint'],
  ['后台入口', { start: { teammate: true } }, 'unattended'],
  ['thin client', { start: { thinClient: true } }, 'entrypoint'],
  ['工具禁止', { denyTools: true }, 'tools'],
  ['mods 不兼容', { mods: 'mods' }, 'mods'],
  ['HIPAA', { compliance: 'hipaa' }, 'compliance'],
  ['ZDR', { compliance: 'zdr' }, 'compliance'],
  ['OTel', { otel: true }, 'otel'],
  ['agent teams', { teams: true }, 'agent_teams'],
  ['无效启用值', { env: { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: 'wat' } }, 'bad_value'],
]) {
  const runtime = harness(patchedSource, options, acceptedStorage());
  const toolArgs = { restricted: false, disallowedTools: [], baseTools: [] };
  const toolsLeaveReplOut = runtime.api.tools(toolArgs);
  await runtime.api.start({ ...runtime.startOptions, ...options.start, toolsLeaveReplOut });
  assert.equal(runtime.state().state, 'refused', label);
  assert.equal(runtime.state().why, reason, label);
}

for (const options of [
  { env: { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: '0' } },
  { userEnv: { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: '0' } },
  { shellEnv: { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: '0' } },
  { enabled: false, userEnv: { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: undefined } },
]) {
  const runtime = harness(patchedSource, options);
  await runtime.api.start(runtime.startOptions);
  assert.equal(runtime.state().state, 'not_asked', '显式关闭或没有 opt-in 不得自动启用');
  assert.equal(runtime.asking(), false);
}

{
  const runtime = harness(patchedSource, { userEnv: { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: undefined } });
  await runtime.api.start(runtime.startOptions);
  assert.equal(runtime.asking(), true, 'shell 显式 opt-in 仍遵循上游首次确认流程');
}

for (const [answer, options, reason] of [[false, {}, 'declined'], [true, { saveFailed: true }, 'unsaved']]) {
  const runtime = harness(patchedSource, options);
  await runtime.api.start(runtime.startOptions);
  assert.equal(await runtime.api.answer(answer, 'userSettings'), 'none', '未经 review 不接受回答');
  assert.equal(await runtime.api.review(), 'ask');
  assert.equal(await runtime.api.answer(answer, 'userSettings'), 'none');
  assert.equal(runtime.state().why, reason);
  assert.equal(runtime.storage.settings.codeModeCaveatsAcceptedV1, undefined);
  assert.equal(runtime.storage.env.CLAUDE_CODE_EXPERIMENTAL_CODE_MODE_RESTART, undefined);
}

for (const [change, why] of [
  [options => { options.admin = true; }, 'admin'],
  [options => { options.compliance = 'zdr'; }, 'compliance'],
  [options => { options.otel = true; }, 'otel'],
]) {
  const runtime = harness(patchedSource, {}, acceptedStorage());
  await runtime.api.start(runtime.startOptions);
  assert.equal(runtime.state().state, 'on');
  assert.equal(runtime.api.stable(), false, 'finalize 前不声称账户已稳定');
  assert.equal(await runtime.api.review(), 'none');
  change(runtime.options);
  assert.equal(await runtime.api.finalize(), 'restart_without_mode', '最终复核必须保留本地安全检查');
  assert.equal(runtime.storage.env.CLAUDE_CODE_EXPERIMENTAL_CODE_MODE_RESTART, why);
}

{
  const runtime = harness(patchedSource, {}, acceptedStorage());
  await runtime.api.start(runtime.startOptions);
  assert.equal(await runtime.api.finalize(), 'restart_without_mode', '未经 setup review 不得 finalize');
  assert.equal(runtime.storage.env.CLAUDE_CODE_EXPERIMENTAL_CODE_MODE_RESTART, 'no_setup');
}

for (const [args, want] of [
  [{ restricted: true, disallowedTools: [], baseTools: [] }, true],
  [{ restricted: false, disallowedTools: ['Read'], baseTools: [] }, true],
  [{ restricted: false, disallowedTools: [], baseTools: ['Bash'] }, true],
  [{ restricted: false, disallowedTools: [], baseTools: ['Read'] }, false],
]) assert.equal(harness(patchedSource).api.tools(args), want, '工具与 session 限制应保留');

assert.equal(harness(patchedSource, { admin: true }).api.foreseen({}), 'admin');
assert.equal(harness(patchedSource).api.model('any-third-party-model'), true);
assert.equal((await patch.apply(patchedSource)).status, 'already');
const rewrittenImports = fixture.replaceAll('/$bunfs/root/', './');
assert.equal((await patch.apply(rewrittenImports)).status, 'applied', '安装器重写为相对导入不改变依赖身份');
for (const settings of [{ dryRun: true }, { verify: true }]) {
  const result = await patch.apply(fixture, settings);
  assert.equal(result.status, settings.verify ? 'verify' : 'applied');
  assert.equal(result.code, fixture, '检查模式不得改写输入');
}

// 本地绑定改成含 $ 的名字，导入来源、外部导出名及属性保持不变。
const identifiers = [];
function visit(node, parent, key) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'Identifier') {
    const publicName = (parent?.type === 'MemberExpression' && key === 'property' && !parent.computed)
      || (parent?.type === 'Property' && key === 'key' && !parent.computed)
      || (parent?.type === 'ImportSpecifier' && key === 'imported')
      || (parent?.type === 'ExportSpecifier' && key === 'exported')
      || ['process', 'Object', 'String', 'Promise', 'Bun'].includes(node.name);
    if (!publicName) identifiers.push(node);
  }
  for (const [field, child] of Object.entries(node)) {
    if (Array.isArray(child)) for (const entry of child) visit(entry, node, field);
    else if (child && typeof child === 'object') visit(child, node, field);
  }
}
const astForRename = parsePatchSource(fixture);
visit(astForRename);
const names = new Map();
const rename = name => { if (!names.has(name)) names.set(name, `$local$${names.size}`); return names.get(name); };
const publicAliases = new Map();
for (const declaration of astForRename.body.filter(node => node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration')) {
  for (const specifier of declaration.specifiers) {
    if (specifier.type === 'ImportSpecifier' && specifier.local.start === specifier.imported.start) publicAliases.set(specifier.local.start, `${specifier.imported.name} as ${rename(specifier.local.name)}`);
    if (specifier.type === 'ExportSpecifier' && specifier.local.start === specifier.exported.start) publicAliases.set(specifier.local.start, `${rename(specifier.local.name)} as ${specifier.exported.name}`);
  }
}
let renamed = fixture;
for (const node of [...new Map(identifiers.map(node => [node.start, node])).values()].sort((a, b) => b.start - a.start)) renamed = renamed.slice(0, node.start) + (publicAliases.get(node.start) ?? rename(node.name)) + renamed.slice(node.end);
const renamedResult = await patch.apply(renamed);
assert.equal(renamedResult.status, 'applied', renamedResult.detail);
const renamedRuntime = harness(renamedResult.code, {}, undefined, rename);
await renamedRuntime.api.start(renamedRuntime.startOptions);
assert.equal(renamedRuntime.asking(), true, '绑定改名后仍进入首次 caveat');
assert.equal(await renamedRuntime.api.review(), 'ask');
assert.equal(await renamedRuntime.api.answer(true, 'userSettings'), 'restart_into_mode');
const renamedRestarted = harness(renamedResult.code, {}, renamedRuntime.storage, rename);
await renamedRestarted.api.start(renamedRestarted.startOptions);
assert.equal(renamedRestarted.state().state, 'on');
assert.equal(await renamedRestarted.api.review(), 'none');
assert.equal(await renamedRestarted.api.finalize(), 'none');
assert.equal(renamedRestarted.api.stable(), true);
assert.equal((await patch.apply(renamedResult.code)).status, 'already');

for (const source of [
  fixture.replace('import{Cun,bjs}', 'import{bjs as Cun,Cun as bjs}'),
  fixture.replace('qAi,mPn,_Ka,yKa', 'qAi,mPn as _Ka,_Ka as mPn,yKa'),
  fixture.replace('import{Se,pm,P9}', 'import{Se,pm,Se as P9}'),
  fixture.replace('chunk-2hbz1qvr.js', 'chunk-other-engine.js'),
  fixture.replace('chunk-x4r54n7x.js', 'chunk-other-admin.js'),
]) {
  assert.equal((await patch.apply(source)).status, 'stale', '导入或导出身份改变必须拒绝，不得仅核验本地绑定');
}

for (const source of [
  fixture.replace('Cun()!=="passed"', 'Cun()!=="failed"'),
  fixture.replace('if(p())return"admin";', 'if(!p())return"admin";'),
  fixture.replace('qAi,mPn,_Ka', 'qAi,_Ka,mPn'),
  fixture.replace('if(e.toolsLeaveReplOut)return"tools";', ''),
  fixture.replace('return Mp()', 'return Mp()&&otherRuntime()'),
  fixture + '\nfunction unknown(){return true}',
  fixture.replace('function d(e){', 'function d(e){!'),
  patchedSource.replace('return typeof Bun!=="undefined";', 'return!0;'),
]) {
  const result = await patch.apply(source);
  assert.equal(result.status, 'stale', result.detail);
  assert.equal(result.code, undefined, '任何结构漂移都不得输出部分修改');
}
const boundary = '\n/*__CLAWGOD_MODULE_BOUNDARY__*/\n';
assert.equal((await patch.apply(`${fixture}${boundary}${fixture}`)).status, 'stale', '重复 opt-in module 不得任意挑选');
const unrelated = '// Version: 2.1.325\nexport function otherRuntime(){return false}';
const featureReference = `// Version: 2.1.325\nexport function unrelatedFlag(){return "tengu_rustling_blossom"}`;
assert.equal((await patch.apply(`${featureReference}${boundary}${fixture}`)).status, 'applied', '其他模块引用 feature 字串不得冒充 opt-in 声明');
const split = await patch.apply(`${unrelated}${boundary}${fixture}`);
assert.equal(split.status, 'applied');
assert.equal(split.code.split(boundary)[0], unrelated, '不得修改其他模块');
assert.equal((await patch.apply('// Version: 2.1.322\nexport const nothing = true;')).status, 'skipped');
const legacyCodeMode = '// Version: 2.1.322\nvar Mii="tengu_rustling_blossom";function Rbn(e){return hSt(e)||L2n(e)}export{Mii,Rbn};';
assert.equal((await patch.apply(legacyCodeMode)).status, 'skipped', '真实322已有早期opt-in，默认all应跳过不支持的旧实现');
for (const version of ['2.1.322', '2.1.99', '2.0.999', '1.99.999']) {
  const source = fixture.replace('Version: 2.1.325', `Version: ${version}`);
  const result = await patch.apply(source);
  assert.equal(result.status, 'skipped', `版本 ${version} 小于2.1.323不应尝试改写`);
  assert.equal(result.code, undefined);
}
assert.equal((await patch.apply(`${legacyCodeMode}${boundary}${fixture}`)).status, 'stale', '多个feature导出候选仍然歧义拒绝');
assert.equal((await patch.apply(`export const noVersion=true;${boundary}${legacyCodeMode}`)).status, 'skipped', '只依据feature候选自身明确322头部跳过');
assert.equal((await patch.apply(`// Version: 2.1.322\nexport const unrelated=true;${boundary}${fixture}`)).status, 'applied', '无关模块版本不得覆盖真实325候选版本');
for (const source of [
  fixture.replace('// Version: 2.1.325', '// Version: 2.1.325\n// Version:'),
  fixture.replace('// Version: 2.1.325', '// Version: 2.1.325\n// Version: 2.1.325 extra'),
  `// Version: 2.1.322\nexport const unrelated=true;${boundary}${fixture.replace('// Version: 2.1.325', '')}`,
  legacyCodeMode.replace('// Version: 2.1.322', '// Version: 2.1.322\n// Version:'),
  legacyCodeMode.replace('// Version: 2.1.322', '// Version: 2.1.322\n// Version: 2.1.322 extra'),
]) assert.equal((await patch.apply(source)).status, 'stale', '空或额外token的Version行不得漏掉，候选缺版本不得借无关322跳过');
for (const source of [
  legacyCodeMode.replace('// Version: 2.1.322\n', ''),
  legacyCodeMode.replace('2.1.322', 'unknown'),
  fixture.replace('// Version: 2.1.325', '// Version: unknown'),
  fixture.replace('// Version: 2.1.325', ''),
  legacyCodeMode.replace('// Version: 2.1.322', '// Version: 2.1.322\n// Version: 2.1.325'),
  `const decoy = "// Version: 2.1.322";\nvar key="tengu_rustling_blossom";export{key};`,
]) assert.equal((await patch.apply(source)).status, 'stale', 'unknown/无效/冲突版本有feature仍failclosed');
assert.equal((await patch.apply(legacyCodeMode.replace('2.1.322', '2.1.323'))).status, 'stale', '新版本未知形态不能全局忽略drift');
console.log('Code Mode 真实模块行为、拒绝条件、改名、漂移、幂等及只读检查通过');


// 新版 SDK/headless 准入尚未适配，仅允许精确核验过的版本原样保留。
for (const platform of ['darwin-arm64', 'linux-x64', 'win32-x64']) {
  const current = readFileSync(new URL('./fixtures/code-mode-2.1.330-' + platform + '.js', import.meta.url), 'utf8');
  for (const source of [current, current.replace(/(?:\/\$bunfs\/root\/|[A-Z]:\/~BUN\/root\/)/g, './')]) {
    for (const options of [{}, { dryRun: true }, { verify: true }]) {
      const result = await patch.apply(source, options);
      assert.equal(result.status, 'skipped', result.detail);
      assert.match(result.warning, /2\.1\.330.*preserv/i);
      assert.equal(result.code, undefined);
    }
  }
  for (const drift of [current.replace('2.1.330', '2.1.331'), current.replace('toolsLeaveReplOut', 'changedGuard'),
    current.replace(/chunk-[a-z0-9]+\.js/, 'chunk-drift.js')]) {
    assert.equal((await patch.apply(drift)).status, 'stale');
  }
}
