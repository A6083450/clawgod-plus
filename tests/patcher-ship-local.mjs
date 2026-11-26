#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { enhancementManifest, createPatchSelection, runtimeFeatureMetadata } from '../src/generic/patcher/registry.mjs';
import { parsePatchSource } from '../src/generic/patcher/semantic.mjs';

assert.ok(enhancementManifest.some(entry => entry.id === 'ship'), '本地 /ship 必须是可独立选择的增强');
const patch = createPatchSelection(['ship']).customPatches.find(entry => entry.id === 'ship-local');
assert.ok(patch, '必须提供 ship-local 补丁');
assert.deepEqual(runtimeFeatureMetadata['ship-local'], ['ship']);
assert.equal(createPatchSelection([]).customPatches.some(entry => entry.id === 'ship-local'), false);

function harness(source, options = {}) {
  const ast = parsePatchSource(source);
  const imports = ast.body.filter(node => node.type === 'ImportDeclaration');
  const exports = ast.body.find(node => node.type === 'ExportNamedDeclaration');
  const names = exports.specifiers.map(node => node.local.name);
  const env = { ...options.env };
  const forbidden = label => () => { throw Error(`不应依赖云端: ${label}`); };
  let featureReads = 0;
  const context = { globalThis: null };
  context.globalThis = context;
  context.__clawgodPatches = options.enabled === false ? { 'ship-local': false } : {};
  const values = [
    [() => options.nonInteractive === true, () => false, () => false],
    [env],
    [(key, fallback) => { featureReads++; if (options.forbidFeatureRead) return forbidden('feature payload')(); return { value: options.value ?? fallback, source: options.source ?? 'fallback' }; }, () => false, () => false, forbidden('Provider/身份探测')],
    [() => options.supportedHost === true],
    ['ship-local', 'ship:steward'],
    [() => false],
  ];
  imports.forEach((node, index) => node.specifiers.forEach((specifier, at) => { context[specifier.local.name] = values[index][at]; }));
  let executable = source;
  for (const node of [...imports, exports].sort((a, b) => b.start - a.start)) executable = executable.slice(0, node.start) + executable.slice(node.end);
  executable += `\nglobalThis.api={enabled:${names[4]},host:${names[5]},blocked:${names[6]},cloudRollout:${names[3]},steward:${names[1]}};`;
  runInNewContext(executable, context);
  return { api: context.api, env, reads: () => featureReads };
}

for (const platform of ['darwin-arm64', 'linux-x64', 'win32-x64']) {
  const original = readFileSync(new URL(`./fixtures/ship-local-2.1.332-${platform}.js`, import.meta.url), 'utf8');
  for (const source of [original, original.replace(/(?:\/\$bunfs\/root\/|[A-Z]:\/~BUN\/root\/)/g, './')]) {
    const result = await patch.apply(source);
    assert.equal(result.status, 'applied', result.detail);
    const code = result.code;
    const importShape = input => parsePatchSource(input).body.filter(node => node.type === 'ImportDeclaration').map(node => ({ source: node.source.value, specifiers: node.specifiers.map(specifier => [specifier.imported.name, specifier.local.name]) }));
    assert.deepEqual(importShape(code), importShape(source), '本地资格补丁不能改动导入边界');
    const local = harness(code, { forbidFeatureRead: true });
    assert.equal(local.api.enabled(), true, '本地默认应可用且不探测 Claude 账号/云端 flag');
    assert.equal(local.reads(), 0);
    assert.equal(local.api.host(), true);
    assert.equal(local.api.blocked('ship'), undefined);
    for (const options of [{ value: false, source: 'fallback' }, { value: false, source: 'disk' }, { value: false, source: 'payload' }, { value: false, source: 'override' }, { value: false, source: 'disabled' }]) {
      assert.equal(harness(code, { ...options, forbidFeatureRead: true }).api.enabled(), true, '本地准入独立于远端 rollout');
    }
    for (const env of [{ CLAUDE_CODE_DISABLE_SHIP: '1' }, { CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1', CLAUDE_CODE_ENTRYPOINT: 'claude-desktop-3p', CLAUDE_CODE_DISABLE_DESKTOP_SHIP: '1' }]) {
      const disabled = harness(code, { env, forbidFeatureRead: true });
      assert.equal(disabled.api.enabled(), false, '保留显式禁用');
      assert.match(disabled.api.blocked('ship'), /turned off/);
    }
    assert.equal(harness(code, { nonInteractive: true, forbidFeatureRead: true }).api.host(), false, '不放开无人值守入口');
    assert.equal(harness(code, { nonInteractive: true, supportedHost: true, forbidFeatureRead: true }).api.host(), true);
    const off = harness(code, { enabled: false });
    assert.equal(off.api.enabled(), false, '关闭 runtime 开关后恢复官方 rollout');
    assert.equal(off.reads(), 1);
    const remote = harness(code, { env: { CLAUDE_CODE_REMOTE: '1' } });
    assert.equal(remote.api.enabled(), false, '不解放 Claude 云端会话');
    assert.equal(remote.reads(), 0);
    assert.equal(harness(code).api.cloudRollout(), false, '不修改原生云端 feature getter');
    assert.equal(harness(code).api.steward(), false, '不修改独立 steward 发布 gate');
    assert.equal((await patch.apply(code)).status, 'already');
    for (const options of [{ dryRun: true }, { verify: true }]) {
      const readonly = await patch.apply(source, options);
      assert.equal(readonly.status, options.verify ? 'verify' : 'applied');
      assert.equal(readonly.code, undefined, '只读模式不能返回可写源码');
    }
    const renamedPatched = code.replace('tengu_ancient_backus', 'tengu_renamed_ship_rollout');
    for (const drift of [source.replace('2.1.332', '2.1.333'), source.replace('CLAUDE_CODE_DISABLE_SHIP', 'CHANGED_DISABLE_SHIP'), source.replace(/chunk-[a-z0-9]+\.js/, 'chunk-unknown.js'), source.replace('return o()&&r()', 'return o()||r()'), source.replace('source:n', 'value:n'), source + '\n/*__CLAWGOD_MODULE_BOUNDARY__*/\n' + source, code.replace('return!s.CLAUDE_CODE_REMOTE;', 'return!0;'), renamedPatched, source + '\n/*__CLAWGOD_MODULE_BOUNDARY__*/\n' + renamedPatched, renamedPatched.replace('CLAUDE_CODE_DISABLE_SHIP', 'CHANGED_DISABLE_SHIP'), source + '\n/*__CLAWGOD_MODULE_BOUNDARY__*/\n' + code.replace('CLAUDE_CODE_DISABLE_SHIP', 'CHANGED_DISABLE_SHIP')]) {
      assert.notEqual(drift, source);
      const rejected = await patch.apply(drift);
      assert.equal(rejected.status, 'stale', rejected.detail);
      assert.equal(rejected.code, undefined, '漂移不能返回部分补丁');
    }
  }
}
// 执行官方构造器和注册条件；资格实现使用上面真实修补后的模块。
for (const [platform, root, names] of [
  ['darwin-arm64', 'Owd', ['Wo', 'Ai', 'zde', 'Wit', 'Ac', 'Bj', 'Kkt', 'r5e', 'GJt', 'jJt', 'VJt', 'zJt', 'z6o', 'R', 'Zbe']],
  ['linux-x64', 'Syd', ['Do', 'Oi', 'Ide', 'Eit', 'Jc', 'MW', 'Tkt', 'G5e', 'wJt', 'SJt', 'kJt', 'bJt', 'X2r', 'R', '$be']],
  ['win32-x64', 'Eyd', ['Wo', 'Ai', 'Nde', 'Tit', 'Jc', 'DW', 'Ckt', 'W5e', 'SJt', 'yJt', 'wJt', 'bJt', 'K2r', 'A', 'Bwe']],
]) {
  const fixture = readFileSync(new URL(`./fixtures/ship-command-2.1.332-${platform}.js`, import.meta.url), 'utf8');
  const [main, registrar] = fixture.split('\n/*__CLAWGOD_MODULE_BOUNDARY__*/\n');
  const original = readFileSync(new URL(`./fixtures/ship-local-2.1.332-${platform}.js`, import.meta.url), 'utf8');
  const patched = (await patch.apply(original)).code;
  const eligibility = harness(patched, { forbidFeatureRead: true });
  const descriptors = [];
  const context = { s: eligibility.env, U: 'steward', px: 'code-review', lx: 'code-review' };
  const values = ['ship-local', () => false, 3, ({ mayReview }) => mayReview ? '/ship stop' : '/steward stop', descriptor => descriptors.push(descriptor), () => false, [], value => value, [], [], [], [], [], value => value, '-c safe'];
  names.forEach((name, index) => { context[name] = values[index]; });
  const mainImport = parsePatchSource(main).body.find(node => node.type === 'ImportDeclaration');
  const eligibilityExport = { 'darwin-arm64': 'V8e', 'linux-x64': 'P8e', 'win32-x64': 'I8e' }[platform];
  const eligibilityImport = mainImport.specifiers.find(specifier => specifier.imported.name === eligibilityExport);
  assert.ok(eligibilityImport, '真实构造器必须导入对应平台的 ship 资格函数');
  context[eligibilityImport.local.name] = eligibility.api.enabled;
  runInNewContext(main.slice(mainImport.end) + `\n${root}();`, context);
  assert.equal(descriptors.length, 2);
  assert.equal(descriptors[0].name, 'ship-local');
  assert.equal(descriptors[0].aliases[0], 'ship');
  for (const descriptor of descriptors) {
    assert.equal(descriptor.requires.workspace, true);
    assert.equal(descriptor.disableBridgeInvocation, true);
    assert.ok(descriptor.disallowedTools.includes('gh pr merge*'));
    assert.equal(descriptor.availability, undefined, '官方本地技能没有 claude-ai 可用性限制');
    assert.equal(descriptor.isEnabled(), true);
    eligibility.env.CLAUDE_CODE_REMOTE = '1';
    assert.equal(descriptor.isEnabled(), false);
    delete eligibility.env.CLAUDE_CODE_REMOTE;
  }
  // 只执行 ship 的注册分支，避免桩化或运行其它 bundled skills。
  const registrarAst = parsePatchSource(registrar);
  const fn = registrarAst.body.find(node => node.type === 'FunctionDeclaration');
  const branch = fn.body.body.find(node => node.type === 'IfStatement' && registrar.slice(node.start, node.end).includes('registerShipLocalSkill'));
  const test = branch.test.type === 'SequenceExpression' ? branch.test.expressions.at(-1) : branch.test;
  const registrationImports = registrarAst.body.find(node => node.type === 'ImportDeclaration').specifiers;
  let registrations = 0;
  const registrationContext = {
    s: eligibility.env,
    [registrationImports[0].local.name]: eligibility.api.enabled,
    [registrationImports[1].local.name]: eligibility.api.host,
    __require: () => ({ registerShipLocalSkill: () => registrations++ }),
  };
  const registration = `if(${registrar.slice(test.start, test.end)})${registrar.slice(branch.consequent.start, branch.consequent.end).replace('import.meta.require', '__require')}`;
  runInNewContext(registration, registrationContext);
  assert.equal(registrations, 1);
  eligibility.env.CLAUDE_CODE_REMOTE = '1';
  runInNewContext(registration, registrationContext);
  assert.equal(registrations, 1, '远程入口不注册本地 ship');
  delete eligibility.env.CLAUDE_CODE_REMOTE;

  if (platform !== 'darwin-arm64') continue;
  let mode = 'default', child = false, cloudCalls = 0, repo = null;
  const forbidden = () => { cloudCalls++; throw Error('本地入口不应调用 Claude 云端'); };
  Object.assign(context, {
    SD: line => ({ name: line.slice(1).split(/\s/)[0], args: line.split(/\s+/).slice(1).join(' ') }),
    Vo: 'watch', X: () => ({ mode }), Po: () => undefined, Jq: () => 'model', St: value => value,
    mi: () => undefined, or: () => ({ namesKeptFromOtherCommands: new Set() }),
    _i: /^\+\w+$/, oE: value => ['low', 'medium', 'high', 'xhigh', 'max'].includes(value),
    ae: text => [{ type: 'text', text }], Yc: () => child, Gh: () => false,
    hDn: () => {}, ge: () => false, ad: 'EnterPlanMode', Xo: 'ExitPlanMode',
    $i: () => repo, ue: () => '/fake/repo', fetch: forbidden, xn: forbidden, G1: forbidden, Vee: forbidden,
  });
  const ingress = readFileSync(new URL('./fixtures/ship-ingress-2.1.332-darwin-arm64.js', import.meta.url), 'utf8');
  const token = runInNewContext(ingress + '\nkzi();', context);
  const input = extra => ({ promptSource: 'typed', submittedLineAsShown: '/ship', submittedOnLocalStdin: true, submissionOrigin: { kind: 'human' }, toolState: { get: () => ({ on: undefined }) }, options: { commands: [] }, ...extra });
  const invoke = async extra => (await descriptors[0].getPromptForCommand('', input(extra))).map(block => block.text).join('\n');
  assert.match(await invoke(), /This folder isn't in a git repository/, '无官方登录仍进入本地 workspace 检查');
  assert.match(await invoke({ submittedOnLocalStdin: false, submittedFromComposer: token }), /This folder isn't in a git repository/);
  assert.match(await invoke({ submittedOnLocalStdin: false, submittedFromComposer: {} }), /starts only from a line that you type/);
  assert.match(await invoke({ submittedOnLocalStdin: false, submittedFromComposer: token, promptSource: 'queued' }), /queued message/);
  assert.match(await invoke({ dispatchedOverBridge: true }), /starts only from a line that you type/);
  child = true;
  assert.match(await invoke(), /started by another session/);
  child = false; mode = 'plan';
  assert.match(await invoke(), /Write no plan.*call neither EnterPlanMode nor ExitPlanMode/);
  mode = 'default'; eligibility.env.CLAUDE_CODE_DISABLE_SHIP = '1';
  assert.match(await invoke(), /turned off right now/);
  delete eligibility.env.CLAUDE_CODE_DISABLE_SHIP;
  // 用受控 sentinel 证明进入本地准备分支；不运行 git/gh、模型或网络。
  repo = {};
  const sentinel = Error('local preparation reached');
  Object.assign(context, { fns: () => undefined, bot: () => false, pns: () => undefined, yi: () => false, Ho: () => false, Her: () => { throw sentinel; } });
  await assert.rejects(invoke(), error => error === sentinel);
  assert.equal(cloudCalls, 0);
}
assert.equal((await patch.apply('const unrelated = 1;')).status, 'skipped');
console.log('/ship 三平台本地准入、禁用/远端限制、独立云端 gate、幂等与漂移拒绝检查通过');
