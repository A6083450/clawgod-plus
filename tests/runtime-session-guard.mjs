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
assert.equal(typeof state.enterRuntime, 'function', '会话必须登记并检查正在进行的升级');
const dir = mkdtempSync(join(tmpdir(), 'clawgod-session-guard-'));
const root = join(dir, 'home with spaces', '.clawgod');
mkdirSync(root, { recursive: true });
const helper = join(root, 'runtime-state.cjs');
copyFileSync(new URL('../src/generic/runtime/runtime-state.cjs', import.meta.url), helper);
const children = [];
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
  assert.equal(existsSync(join(root, '.runtime-write.lock')), false, '拒绝升级必须释放自己的锁');
  const output = [];
  reader.stdout.on('data', data => output.push(data.toString()));
  await stop(reader);
  assert.match(output.join(''), /old exit works/, '升级被拒后旧会话仍可延迟加载退出模块');
  assert.equal(readdirSync(root).some(name => name.startsWith('.runtime-reader.')), false);

  const token = state.acquireRuntime(root, process.pid);
  assert.throws(() => state.enterRuntime(root), /升级|维护/);
  assert.throws(() => state.acquireRuntime(root, process.pid), /升级|维护/);
  assert.throws(() => state.releaseRuntime(root, 'wrong-token'), /锁|token/);
  const probe = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(helper)}).enterRuntime(${JSON.stringify(root)});console.log('probe')`], {
    encoding: 'utf8', env: { ...process.env, CLAWGOD_RUNTIME_WRITE_TOKEN: token },
  });
  assert.equal(probe.status, 0, probe.stderr);
  assert.equal(probe.stdout.trim(), 'probe', '安装器直属子进程可做启动检查');
  state.releaseRuntime(root, token);
  assert.equal(existsSync(join(root, '.runtime-write.lock')), false);

  copyFileSync(new URL('../src/generic/runtime/wrapper.cjs', import.meta.url), join(root, 'cli.cjs'));
  writeFileSync(join(root, 'cli.original.cjs'), 'console.log("upstream loaded")');
  const maintenance = state.acquireRuntime(root, process.pid);
  const blocked = spawnSync(process.execPath, [join(root, 'cli.cjs'), '--help'], {
    encoding: 'utf8', env: { HOME: join(dir, 'home with spaces'), USERPROFILE: join(dir, 'home with spaces'), PATH: process.env.PATH },
  });
  assert.notEqual(blocked.status, 0, '真实 wrapper 在维护期间必须拒绝启动');
  assert.doesNotMatch(blocked.stdout, /upstream loaded/);
  assert.equal(existsSync(join(root, 'provider.json')), false, '必须在 provider 副作用之前拒绝');
  state.releaseRuntime(root, maintenance);

  const legacy = await start(idle, 'cli.cjs');
  assert.throws(() => state.acquireRuntime(root, process.pid), /先.*\/exit|正在使用/, '未登记的旧版会话也必须被发现');
  copyFileSync(new URL('../src/generic/runtime/repatcher.mjs', import.meta.url), join(root, 'repatch.mjs'));
  copyFileSync(new URL('../src/generic/runtime/vendor-transaction.mjs', import.meta.url), join(root, 'vendor-transaction.mjs'));
  const native = join(dir, '2.1.314'); writeFileSync(native, 'fixture');
  const repatch = spawnSync(process.execPath, [join(root, 'repatch.mjs'), native], { encoding: 'utf8' });
  assert.notEqual(repatch.status, 0);
  assert.match(repatch.stderr, /先.*\/exit|正在使用/, '重补丁也必须在改写前拒绝活跃会话');
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
  const forgedScript = join(root, 'foreign-token.cjs');
  writeFileSync(forgedScript, `try { require('./runtime-state.cjs').enterRuntime(__dirname); process.exit(0); } catch (error) { require('node:fs').writeSync(2, error.message); process.exit(17); }`);
  const forged = spawnSync(process.execPath, [forgedScript], {
    encoding: 'utf8', env: { ...process.env, CLAWGOD_RUNTIME_WRITE_TOKEN: foreignToken },
  });
  assert.equal(forged.status, 17, '不是安装器后代的进程即使知道 token 也不能启动');
  assert.match(forged.stderr, /升级|维护/, '必须确认为维护锁拒绝，而不是脚本加载失败');
  await stop(foreignWriter);
  state.releaseRuntime(root, foreignToken);

  const orphanWriter = await start(`const s=require('./runtime-state.cjs');s.acquireRuntime(__dirname);${idle}`);
  const writerExit = once(orphanWriter, 'exit'); orphanWriter.kill('SIGKILL'); await writerExit;
  assert.throws(() => state.enterRuntime(root), /升级|维护/, '安装器异常终止后不得加载可能半写的运行时');
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
  assert.throws(() => state.enterRuntime(root), /锁|升级|维护/);
  assert.throws(() => state.acquireRuntime(root, process.pid), /锁|升级|维护/);
  rmSync(join(root, '.runtime-write.lock'));
  if (process.platform !== 'win32') {
    const outside = join(dir, 'outside'); writeFileSync(outside, 'keep');
    symlinkSync(outside, join(root, '.runtime-write.lock'));
    assert.throws(() => state.enterRuntime(root), /锁|升级|维护/);
    assert.equal(readFileSync(outside, 'utf8'), 'keep');
    rmSync(join(root, '.runtime-write.lock'));
  }
} finally {
  for (const child of children) if (child.exitCode === null && child.signalCode === null) {
    const exit = once(child, 'exit'); child.kill(); await exit;
  }
  rmSync(dir, { recursive: true, force: true });
}
console.log('运行会话/升级互斥：旧版进程、延迟退出、维护期启动、并发升级、崩溃登记与锁校验通过');
