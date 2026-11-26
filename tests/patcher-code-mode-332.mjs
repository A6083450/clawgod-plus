#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parsePatchSource } from '../src/generic/patcher/semantic.mjs';
import { codeModeRegistry } from '../src/generic/patcher/enhancements/code-mode.mjs';

const patch = codeModeRegistry.customPatches[0];
const boundary = '\n/*__CLAWGOD_MODULE_BOUNDARY__*/\n';
const platforms = [
  ['darwin-arm64', 'eld,cGa,bdo,HSd,DSd,LSd,NSd,FSd,$Sd,USd,CZr,BSd,WSd'],
  ['linux-x64', 'Ksd,_Wa,Olr,v_d,T_d,A_d,C_d,R_d,x_d,P_d,yQo,O_d,I_d'],
  ['win32-x64', 'Xsd,PWa,Nlr,x_d,P_d,O_d,I_d,M_d,D_d,N_d,EQo,L_d,F_d'],
];
const fixtures = new Map(platforms.map(([platform]) => [platform, readFileSync(new URL(`./fixtures/code-mode-2.1.332-${platform}.js`, import.meta.url), 'utf8')]));
const darwinImports = parsePatchSource(fixtures.get(platforms[0][0])).body.filter(node => node.type === 'ImportDeclaration');
const interfaceShape = source => parsePatchSource(source).body.filter(node => node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration').map(node => source.slice(node.start, node.end));

function harness(source, expectedExports, options = {}, storage = { settings: {}, env: {} }) {
  let state = { state: 'not_asked' }, asking = false;
  const env = { ...(options.enabled === false ? {} : { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: '1' }), ...storage.env, ...options.env };
  const userEnv = { ...(options.enabled === false ? {} : { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: '1' }), ...options.userEnv };
  const forbidden = name => () => { throw Error(`不得调用云端或身份服务: ${name}`); };
  const dependencies = {
    He: value => ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase()),
    mi: value => ['0', 'false', 'no', 'off'].includes(String(value).toLowerCase()),
    le: initial => ({ ...initial }), PR: 'CLAUDE_CODE_EXPERIMENTAL_CODE_MODE', nn: () => true,
    he: source => source === 'userSettings' ? { env: userEnv } : source === 'flagSettings' ? { env: options.flagEnv ?? {} } : options.denyTools ? { permissions: { deny: ['Read'] } } : {},
    xp: () => options.managed === undefined ? [] : [{ env: { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: options.managed } }],
    iB: () => options.admin === true, o7: () => options.managedEnv ?? {}, Sm: () => ({ ...env, ...options.shellEnv }),
    H0e: new Proxy({ set: (key, value) => { storage.env[key] = value; env[key] = value; }, unset: key => { delete storage.env[key]; delete env[key]; } }, { get: (target, key) => key in target ? target[key] : env[key] }),
    s: { ...options.entryEnv }, ge: () => options.headless === true, cs: () => options.entrypoint ?? 'cli',
    yc: () => options.bash !== false, DYi: () => false, oPt: () => options.engine ?? 'passed', Yt: () => options.background === true,
    ks: options.denyTools ? ['projectSettings'] : [], Zf: tools => tools,
    rr: name => ({ toolName: name }), gs: name => name === 'Read', $T: () => false, oSt: () => false, wr: {},
    Nmo: () => null, Ysr: tools => ({ kept: tools, excluded: [] }),
    Hy: () => options.policyUnread === true,
    i8n: forbidden('不得为资格解锁主动请求 policy 网络加载'),
    Bo: type => options.compliance === type, Cg: () => options.otel ? {} : undefined, pw: () => false, Lpe: () => false, WL: () => options.otel === true,
    ct: () => 'third-party-model', St: value => value, OCe: () => 'third-party-default', ic: () => 'third-party-default', Jt: value => value,
    ye: () => storage.settings, JPr: next => { state = next; }, B6: () => state,
    ZFl: () => { asking = true; }, XMs: () => asking, Lle: () => {},
    Py: async (update, scope) => { assert.equal(scope, 'userSettings'); if (options.saveFailed) return false; storage.settings = update(storage.settings); return true; },
    f: value => value, fe: value => value, Ae: value => value, l: () => {}, c: () => {}, a: () => {},
    B: () => 'local-session', rn: async promise => promise, DD: async () => {}, U9i: callback => { options.recheck = callback; },
  };
  const ast = parsePatchSource(source), imports = ast.body.filter(node => node.type === 'ImportDeclaration');
  const exported = ast.body.find(node => node.type === 'ExportNamedDeclaration');
  assert.equal(exported.specifiers.map(node => node.local.name).join(','), expectedExports, '每平台导出角色必须明确冻结，不能沿用325位置');
  assert.equal(imports.length, darwinImports.length);
  const context = { process: { env }, Bun: {} };
  imports.forEach((node, index) => {
    assert.equal(node.specifiers.length, darwinImports[index].specifiers.length);
    node.specifiers.forEach((specifier, at) => {
      const role = darwinImports[index].specifiers[at].local.name;
      context[specifier.local.name] = Object.hasOwn(dependencies, role) ? dependencies[role] : forbidden(role);
    });
  });
  if (options.noBun) delete context.Bun;
  let executable = source;
  for (const node of [...imports, exported].sort((a, b) => b.start - a.start)) executable = executable.slice(0, node.start) + executable.slice(node.end);
  const names = expectedExports.split(',');
  const roles = ['feature', 'modelFamily', 'model', 'tools', 'start', 'foreseen', 'review', 'headlessFinalize', 'headlessModel', 'fromFlag', 'answer', 'finalize', 'stable'];
  executable += `\nglobalThis.api={${roles.map((role, index) => `${role}:${names[index]}`).join(',')}};`;
  runInNewContext(executable, context);
  return { api: context.api, state: () => state, asking: () => asking, storage, options };
}
const accepted = () => ({ settings: { codeModeCaveatsAcceptedV1: true, codeModeAutoModeCaveatAcceptedV1: true }, env: {} });

for (const [platform, names] of platforms) {
  const original = fixtures.get(platform);
  for (const source of [original, original.replace(/(?:\/\$bunfs\/root\/|[A-Z]:\/~BUN\/root\/)/g, './')]) {
    const result = await patch.apply(source);
    assert.equal(result.status, 'applied', `332必须本地解锁而非保留上游: ${result.warning ?? result.detail}`);
    const code = result.code;
    assert.notEqual(code, source);
    assert.deepEqual(interfaceShape(code), interfaceShape(source), '不得修改真实导入导出边界');
    const first = harness(code, names);
    await first.api.start({});
    assert.equal(first.asking(), true, '无官方账号、第三方模型/Provider进入首次风险确认');
    assert.equal(await first.api.answer(true, 'userSettings'), 'none', '未经review不得自动同意');
    assert.equal(await first.api.review(), 'ask');
    assert.equal(await first.api.answer(true, 'userSettings'), 'restart_into_mode');
    assert.deepEqual(JSON.parse(JSON.stringify(first.storage.settings)), accepted().settings);
    const restarted = harness(code, names, {}, first.storage);
    await restarted.api.start({});
    assert.equal(restarted.state().state, 'on');
    assert.equal(restarted.api.stable(), false);
    assert.equal(await restarted.api.review(), 'none');
    assert.equal(await restarted.api.finalize(), 'none');
    assert.equal(restarted.api.stable(), true, '不依赖官方账号稳定性');
    assert.equal(restarted.api.modelFamily('any-local-model'), true);
    assert.equal(restarted.api.model('any-local-model'), true);
    assert.equal((await patch.apply(code)).status, 'already');
    for (const options of [{ dryRun: true }, { verify: true }]) {
      const checked = await patch.apply(source, options);
      assert.equal(checked.status, options.verify ? 'verify' : 'applied');
      assert.equal(checked.code, undefined);
    }
    for (const drift of [source.replace('2.1.332', '2.1.333'), source.replace('toolsLeaveReplOut', 'changedGuard'), source.replace(/chunk-[a-z0-9]+\.js/, 'chunk-drift.js'), source.replace(/export\{([^,}]+)/, 'export{$1 as changedExport'), source + boundary + source, code.replace('tengu_rustling_blossom', 'renamed_code_mode'), source + boundary + code.replace('tengu_rustling_blossom', 'renamed_code_mode'), code.replace('return typeof Bun!=="undefined";', 'return!0;')]) {
      assert.notEqual(drift, source);
      const rejected = await patch.apply(drift);
      assert.equal(rejected.status, 'stale', rejected.detail);
      assert.equal(rejected.code, undefined);
    }
    for (const [label, options, args, reason] of [
      ['非Bun', { noBun: true }, {}, 'runtime'],
      ['管理员', { admin: true }, {}, 'admin'],
      ['托管禁用', { managed: '0' }, {}, 'admin'],
      ['无Bash', { bash: false }, {}, 'no_bash'],
      ['引擎失败', { engine: 'failed' }, {}, 'engine'],
      ['远控', { entryEnv: { CLAUDE_CODE_REMOTE: '1' } }, {}, 'entrypoint'],
      ['SDK', { headless: true, entrypoint: 'sdk-ts', flagEnv: { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: '1' } }, {}, 'entrypoint'],
      ['非CLI', { entrypoint: 'sdk' }, {}, 'entrypoint'],
      ['worker', {}, { workerOrSpare: true }, 'entrypoint'],
      ['thin', {}, { thinClient: true }, 'entrypoint'],
      ['teammate', {}, { teammate: true }, 'unattended'],
      ['remoteControl', {}, { remoteControl: true }, 'unattended'],
      ['后台', { background: true }, {}, 'unattended'],
      ['桥接', { entryEnv: { CLAUDE_BRIDGE_REATTACH_SESSION: 'x' } }, {}, 'unattended'],
      ['工具', { denyTools: true }, {}, 'tools'],
      ['HIPAA', { compliance: 'hipaa' }, {}, 'compliance'],
      ['OTel', { otel: true }, {}, 'otel'],
      ['无效值', { env: { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: 'wat' } }, {}, 'bad_value'],
    ]) {
      const current = harness(code, names, options, accepted());
      await current.api.start({ toolsLeaveReplOut: current.api.tools({ restricted: false, disallowedTools: [], baseTools: [] }), ...args });
      assert.equal(current.state().state, 'refused', label);
      assert.equal(current.state().why, reason, label);
    }
    for (const options of [{ enabled: false }, { env: { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: '0' } }, { userEnv: { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: '0' } }, { shellEnv: { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: '0' } }]) {
      const current = harness(code, names, options);
      await current.api.start({});
      assert.equal(current.state().state, 'not_asked', '默认不切换模式，显式关闭生效');
      assert.equal(current.asking(), false);
    }
    for (const [answer, options, why] of [[false, {}, 'declined'], [true, { saveFailed: true }, 'unsaved']]) {
      const current = harness(code, names, options);
      await current.api.start({});
      assert.equal(await current.api.review(), 'ask');
      assert.equal(await current.api.answer(answer, 'userSettings'), 'none');
      assert.equal(current.state().why, why);
      assert.equal(current.storage.settings.codeModeCaveatsAcceptedV1, undefined);
    }
    const unread = harness(code, names, { policyUnread: true }, accepted());
    await unread.api.start({});
    assert.equal(await unread.api.review(), 'restart_without_mode', '缺失或 fail-open 的托管 policy verdict 必须拒绝');
    assert.equal(unread.storage.env.CLAUDE_CODE_EXPERIMENTAL_CODE_MODE_RESTART, 'admin_unread');
    for (const [key, value, why] of [['policyUnread', true, 'admin_unread'], ['admin', true, 'admin'], ['compliance', 'hipaa', 'compliance'], ['otel', true, 'otel']]) {
      const current = harness(code, names, {}, accepted());
      await current.api.start({});
      await current.api.review();
      current.options[key] = value;
      assert.equal(await current.api.finalize(), 'restart_without_mode');
      assert.equal(current.storage.env.CLAUDE_CODE_EXPERIMENTAL_CODE_MODE_RESTART, why);
      assert.equal(current.api.stable(), false, '策略拒绝时不得创建稳定身份快照');
    }
    const dynamic = harness(code, names, {}, accepted());
    await dynamic.api.start({});
    await dynamic.api.review();
    await dynamic.api.finalize();
    dynamic.options.policyUnread = true;
    assert.equal(dynamic.options.recheck(), 'admin_unread', '持续 veto 也必须保留同步策略 fail-closed');
    const noSetup = harness(code, names, {}, accepted());
    await noSetup.api.start({});
    assert.equal(await noSetup.api.finalize(), 'restart_without_mode');
    assert.equal(noSetup.storage.env.CLAUDE_CODE_EXPERIMENTAL_CODE_MODE_RESTART, 'no_setup');
  }
}
console.log('Code Mode 332 三平台本地资格、首次同意、显式关闭、安全边界、幂等和漂移拒绝通过');
