#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('../src/generic/runtime/startup-check.cjs', import.meta.url));
assert.ok(existsSync(helper), '安装与 vendor 发布必须共用有界启动检查');
const { checkStartup } = await import(helper);
const root = mkdtempSync(join(tmpdir(), 'clawgod-startup-check-'));
let sequence = 0;
async function probe(source, options = {}) {
  const dir = join(root, String(sequence++));
  mkdirSync(dir);
  const cli = join(dir, 'cli.cjs');
  writeFileSync(cli, source);
  return { ...(await checkStartup({ execPath: process.execPath, cli, timeoutMs: 1000, ...options })), cli, dir };
}
try {
  for (const source of [
    'console.log("2.1.300 (Claude Code)")',
    'process.stdout.write("2.1.");setTimeout(()=>process.stdout.write("300 (Claude Code)"),10)',
    'console.log("2.1.300 (Claude Code)");process.stderr.write("warning\\n".repeat(200000))',
  ]) {
    const result = await probe(source);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /2\.1\.300 \(Claude Code\)/);
    assert.ok(Buffer.byteLength(result.stderr) <= 1024 * 1024 + 100, '诊断内存有界');
  }
  for (const source of [
    '',
    'console.error("2.1.300 (Claude Code)")',
    'console.log("not-a-version")',
    'console.log("2.1.300 (Claude Code)");process.exit(7)',
  ]) {
    const result = await probe(source);
    assert.notEqual(result.status, 0, '空输出、stderr版本或非零退出不能通过');
  }
  const timeout = await probe('setInterval(()=>{},1000)', { timeoutMs: 100 });
  assert.equal(timeout.status, 124);
  assert.match(timeout.stderr, /timed out/);
  const invalid = await probe('', { timeoutMs: NaN });
  assert.notEqual(invalid.status, 0, '非法 deadline 不能变成无界等待');
  const missing = await checkStartup({ execPath: join(root, 'missing-bun'), cli: join(root, 'missing-cli'), timeoutMs: 100 });
  assert.notEqual(missing.status, 0, 'spawn 失败不能假成功');

  const dir = join(root, 'cli-mode'); mkdirSync(dir);
  const cli = join(dir, 'cli.cjs');
  writeFileSync(cli, 'setInterval(()=>{},1000)');
  const result = spawnSync(process.execPath, [helper, process.execPath, cli], {
    encoding: 'utf8', timeout: 5000, env: { ...process.env, CLAWGOD_STARTUP_TIMEOUT_MS: '100' },
  });
  assert.equal(result.status, 124, result.stderr);
  assert.match(readFileSync(join(dir, 'startup-check.log'), 'utf8'), /timed out/);
  assert.match(result.stderr, /startup-check\.log/);

  for (const mode of ['directory', 'hardlink', ...(process.platform === 'win32' ? [] : ['symlink'])]) {
    const logDir = join(root, `log-${mode}`); mkdirSync(logDir);
    const logCli = join(logDir, 'cli.cjs'), log = join(logDir, 'startup-check.log');
    const config = join(logDir, 'user-config.json'), sentinel = '{"preserve":true}\n';
    writeFileSync(logCli, 'console.log("2.1.300 (Claude Code)")');
    writeFileSync(config, sentinel);
    if (mode === 'directory') mkdirSync(log);
    else if (mode === 'hardlink') linkSync(config, log);
    else symlinkSync(config, log);
    const logged = spawnSync(process.execPath, [helper, process.execPath, logCli], { encoding: 'utf8', timeout: 5000 });
    assert.equal(logged.status, 0, '诊断日志问题不能改变健康运行时的退出状态：' + logged.stderr);
    assert.equal(readFileSync(config, 'utf8'), sentinel, `${mode} 日志路径不得覆写用户配置`);
    if (mode === 'directory') {
      assert.match(logged.stderr, /Cannot write startup log/);
      writeFileSync(logCli, 'process.exit(7)');
      const failedLog = spawnSync(process.execPath, [helper, process.execPath, logCli], { encoding: 'utf8', timeout: 5000 });
      assert.equal(failedLog.status, 7, '日志失败也不能抹掉真实启动失败');
    } else assert.match(readFileSync(log, 'utf8'), /2\.1\.300 \(Claude Code\)/, '安全替换后仍保留诊断');
    assert.deepEqual(readdirSync(logDir).sort(), ['cli.cjs', 'startup-check.log', 'user-config.json'], '原子日志临时文件必须清理');
  }

  if (process.platform !== 'win32') {
    const childFile = join(root, 'descendant.pid');
    const tree = await probe(`const {spawn}=require('child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});require('fs').writeFileSync(${JSON.stringify(childFile)},String(c.pid));setInterval(()=>{},1000)`, { timeoutMs: 500 });
    assert.equal(tree.status, 124);
    const pid = Number(readFileSync(childFile, 'utf8'));
    const deadline = Date.now() + 2000;
    let alive = true;
    while (alive && Date.now() < deadline) {
      try { process.kill(pid, 0); } catch { alive = false; }
      if (alive) await Bun.sleep(20);
    }
    assert.equal(alive, false, '超时必须清理探测子进程组');
  }
} finally { rmSync(root, { recursive: true, force: true }); }
console.log('Bounded startup probe checks passed.');
