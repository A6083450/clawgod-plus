#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import state from '../src/generic/runtime/runtime-state.cjs';

assert.equal(typeof state.acquireRuntime, 'function', '升级必须先取得独占运行时锁');
assert.equal(typeof state.enterRuntime, 'function', '会话必须登记以供维护检查');
const dir = mkdtempSync(join(tmpdir(), 'clawgod-session-guard-'));
const root = join(dir, 'home with spaces', '.clawgod');
mkdirSync(root, { recursive: true });
const helper = join(root, 'runtime-state.cjs');
copyFileSync(new URL('../src/generic/runtime/runtime-state.cjs', import.meta.url), helper);
const children = [];
function startSession() {
  return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(helper)}).enterRuntime(${JSON.stringify(root)}, true)();`], {
    encoding: 'utf8', env: { ...process.env, CLAWGOD_RUNTIME_WRITE_TOKEN: '' },
  });
}
async function start(source, name = 'reader.cjs', args = [], relative = false) {
  const script = join(root, name);
  writeFileSync(script, source);
  const child = spawn(process.execPath, [relative ? `./${name}` : script, ...args], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  children.push(child);
  const ready = await Promise.race([
    once(child.stdout, 'data').then(([chunk]) => chunk.toString()),
    once(child, 'exit').then(([code]) => { throw Error(`测试进程提前退出：${code}`); }),
    new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('等待测试进程超时')), 10000); timer.unref(); }),
  ]);
  assert.match(ready, /ready/);
  child.ready = ready;
  return child;
}
async function stop(child) {
  const exit = once(child, 'exit');
  child.stdin.end('exit\n');
  const [code] = await exit;
  assert.equal(code, 0);
}
const idle = 'console.log("ready");process.stdin.once("data",()=>process.exit(0));';
try {
  writeFileSync(join(root, 'lazy.cjs'), 'module.exports="old exit works";');
  const reader = await start(`require('./runtime-state.cjs').enterRuntime(__dirname);console.log('ready');process.stdin.once('data',()=>{console.log(require('./lazy.cjs'));process.exit(0)});`);
  assert.throws(() => state.acquireRuntime(root, process.pid), /先.*\/exit|正在使用/);
  assert.equal(readFileSync(join(root, 'lazy.cjs'), 'utf8'), 'module.exports="old exit works";');
  assert.equal(existsSync(join(root, '.runtime-write.lock')), false, '拒绝维护必须释放自己的锁');
  const updating = spawnSync(process.execPath, [helper, 'lock-update', root, String(process.pid)], { encoding: 'utf8' });
  assert.equal(updating.status, 0, `活跃会话不应阻止升级：${updating.stderr}`);
  assert.match(updating.stdout.trim(), /^[a-f0-9-]{36}$/, '警告不能污染 stdout 中的锁 token');
  assert.match(updating.stderr, /PID:.*继续升级/);
  assert.match(updating.stderr, /旧会话.*失败.*重新启动/);
  assert.ok(updating.stderr.includes(String(reader.pid)), '警告必须列出占用进程');
  assert.equal(reader.exitCode, null, '升级不能主动终止已有会话');
  assert.throws(() => state.acquireRuntime(root, process.pid, true), /升级|维护/, '允许活跃会话仍不能并发升级');
  const updatingSession = startSession();
  assert.equal(updatingSession.status, 0, `升级期间新会话也应能完成启动：${updatingSession.stderr}`);
  state.releaseRuntime(root, updating.stdout.trim());
  const output = [];
  reader.stdout.on('data', data => output.push(data.toString()));
  await stop(reader);
  assert.match(output.join(''), /old exit works/, '升级被拒后旧会话仍可延迟加载退出模块');
  assert.equal(readdirSync(root).some(name => name.startsWith('.runtime-reader.')), false);

  const token = state.acquireRuntime(root, process.pid);
  assert.equal(startSession().status, 0, '维护锁不应阻止新会话启动');
  assert.throws(() => state.acquireRuntime(root, process.pid), /升级|维护/);
  assert.throws(() => state.releaseRuntime(root, 'wrong-token'), /锁|token/);
  const probe = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(helper)}).enterRuntime(${JSON.stringify(root)});console.log('probe')`], {
    encoding: 'utf8', env: { ...process.env, CLAWGOD_RUNTIME_WRITE_TOKEN: '' },
  });
  assert.equal(probe.status, 0, probe.stderr);
  assert.equal(probe.stdout.trim(), 'probe', '不继承维护 token 也能做启动检查');
  state.releaseRuntime(root, token);
  assert.equal(existsSync(join(root, '.runtime-write.lock')), false);

  copyFileSync(new URL('../src/generic/runtime/wrapper.cjs', import.meta.url), join(root, 'cli.cjs'));
  writeFileSync(join(root, 'cli.original.cjs'), 'console.log("upstream loaded")');
  const maintenance = state.acquireRuntime(root, process.pid);
  const duringMaintenance = spawnSync(process.execPath, [join(root, 'cli.cjs'), '--help'], {
    encoding: 'utf8', env: { HOME: join(dir, 'home with spaces'), USERPROFILE: join(dir, 'home with spaces'), PATH: process.env.PATH },
  });
  assert.equal(duringMaintenance.status, 0, `真实 wrapper 在维护期间仍须启动：${duringMaintenance.stderr}`);
  assert.match(duringMaintenance.stdout, /upstream loaded/);
  state.releaseRuntime(root, maintenance);

  const legacy = await start(idle, 'cli.cjs');
  assert.throws(() => state.acquireRuntime(root, process.pid), /先.*\/exit|正在使用/, '未登记的旧版会话也必须被发现');
  copyFileSync(new URL('../src/generic/runtime/repatcher.mjs', import.meta.url), join(root, 'repatch.mjs'));
  copyFileSync(new URL('../src/generic/runtime/vendor-transaction.mjs', import.meta.url), join(root, 'vendor-transaction.mjs'));
  const native = join(dir, '2.1.314'); writeFileSync(native, 'fixture');
  writeFileSync(join(root, 'extract-natives.mjs'), `require('node:fs').writeFileSync(${JSON.stringify(join(root, 'extract-reached'))}, 'reached');process.exit(61);`);
  const repatch = spawnSync(process.execPath, [join(root, 'repatch.mjs'), native], { encoding: 'utf8' });
  assert.notEqual(repatch.status, 0);
  assert.match(repatch.stderr, /继续升级/, '重补丁必须警告而非拒绝活跃会话');
  assert.equal(existsSync(join(root, 'extract-reached')), true, '活跃会话下仍须进入重补丁流程');
  assert.equal(legacy.exitCode, null, '失败回滚不得终止活跃会话');
  assert.equal(readdirSync(root).some(name => name.startsWith('.runtime-rollback.')), false);
  await stop(legacy);
  const relativeLegacy = await start(idle, 'cli.cjs', [], true);
  assert.throws(() => state.acquireRuntime(root), /先.*\/exit|正在使用/, '无法确认归属的旧版相对路径入口也必须保护');
  await stop(relativeLegacy);
  if (process.platform === 'win32') {
    const longRoot = fileURLToPath(pathToFileURL(root));
    const identity = (await import('node:fs')).statSync(longRoot, { bigint: true });
    assert.notEqual(identity.ino, 0n, 'Windows 目录身份必须可用，不能用零 inode 识别别名');
    const aliasLegacy = await start(idle, 'cli.cjs');
    assert.throws(() => state.acquireRuntime(longRoot), /先.*\/exit|正在使用/, '长路径根必须识别以 8.3 临时路径启动的会话');
    const otherRoot = join(dir, 'other runtime'); mkdirSync(otherRoot);
    const otherToken = state.acquireRuntime(otherRoot); state.releaseRuntime(otherRoot, otherToken);
    await stop(aliasLegacy);
    const savedPath = process.env.PATH, savedSystemRoot = process.env.SystemRoot;
    try {
      process.env.PATH = '';
      const narrowToken = state.acquireRuntime(otherRoot); state.releaseRuntime(otherRoot, narrowToken);
      process.env.SystemRoot = join(dir, 'missing Windows');
      assert.throws(() => state.acquireRuntime(otherRoot), /无法检查/, '缺少系统 PowerShell 时必须拒绝维护');
    } finally {
      process.env.PATH = savedPath;
      process.env.SystemRoot = savedSystemRoot;
    }
    const aliasUpdater = await start(idle, 'cli.cjs', ['update']);
    const aliasToken = state.acquireRuntime(longRoot); state.releaseRuntime(longRoot, aliasToken);
    await stop(aliasUpdater);
  }
  const updater = await start(idle, 'cli.cjs', ['update']);
  const updateToken = state.acquireRuntime(root, process.pid);
  state.releaseRuntime(root, updateToken);
  await stop(updater);

  const bootstrap = await start(`const s=require('./runtime-state.cjs');const activate=s.enterRuntime(__dirname,true);const t=s.acquireRuntime(__dirname);s.releaseRuntime(__dirname,t);activate();try{s.acquireRuntime(__dirname);process.exit(9)}catch{};${idle}`, 'cli.cjs');
  assert.throws(() => state.acquireRuntime(root), /先.*\/exit|正在使用/, '其他会话不能借启动阶段标记获得升级权限');
  await stop(bootstrap);

  const foreignWriter = await start(`const s=require('./runtime-state.cjs');console.log('ready '+s.acquireRuntime(__dirname));process.stdin.once('data',()=>process.exit(0));`);
  const foreignToken = foreignWriter.ready.trim().split(' ').at(-1);
  const foreignSession = startSession();
  assert.equal(foreignSession.status, 0, `其他进程持有维护锁时仍须启动：${foreignSession.stderr}`);
  await stop(foreignWriter);
  state.releaseRuntime(root, foreignToken);

  const orphanWriter = await start(`const s=require('./runtime-state.cjs');s.acquireRuntime(__dirname);${idle}`);
  const writerExit = once(orphanWriter, 'exit'); orphanWriter.kill('SIGKILL'); await writerExit;
  assert.equal(startSession().status, 0, '安装器异常终止留下的锁不得永久阻止启动');
  assert.throws(() => state.acquireRuntime(root), /升级|维护/, '不自动回收未验证恢复的写锁');
  rmSync(join(root, '.runtime-write.lock'));

  if (process.platform !== 'win32') {
    const shell = spawn('/bin/sh', ['-c', 'printf ready; read answer', 'fixture', join(root, 'cli.cjs')], { stdio: ['pipe', 'pipe', 'pipe'] });
    children.push(shell);
    await once(shell.stdout, 'data');
    const shellToken = state.acquireRuntime(root);
    state.releaseRuntime(root, shellToken);
    await stop(shell);
  }

  const stale = await start(`require('./runtime-state.cjs').enterRuntime(__dirname);${idle}`);
  const exited = once(stale, 'exit'); stale.kill('SIGKILL'); await exited;
  const afterCrash = state.acquireRuntime(root, process.pid);
  state.releaseRuntime(root, afterCrash);
  assert.equal(readdirSync(root).some(name => name.startsWith('.runtime-reader.')), false, '已退出会话的登记可清理');

  writeFileSync(join(root, '.runtime-write.lock'), 'incomplete');
  assert.equal(startSession().status, 0, '锁文件内容不完整也不得阻止启动');
  assert.throws(() => state.acquireRuntime(root, process.pid), /锁|升级|维护/);
  rmSync(join(root, '.runtime-write.lock'));
  if (process.platform !== 'win32') {
    const outside = join(dir, 'outside'); writeFileSync(outside, 'keep');
    symlinkSync(outside, join(root, '.runtime-write.lock'));
    assert.equal(startSession().status, 0, '启动无需读取维护锁或其链接目标');
    assert.equal(readFileSync(outside, 'utf8'), 'keep');
    rmSync(join(root, '.runtime-write.lock'));
  }
} finally {
  for (const child of children) if (child.exitCode === null && child.signalCode === null) {
    const exit = once(child, 'exit'); child.kill(); await exit;
  }
  rmSync(dir, { recursive: true, force: true });
}
console.log('运行会话登记与升级互斥：维护和残留锁不阻止启动，并发升级、卸载保护与锁校验通过');
