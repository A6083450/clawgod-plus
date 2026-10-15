'use strict';
const { spawn, spawnSync } = require('node:child_process');
const { renameSync, rmSync, writeFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { dirname, join } = require('node:path');

async function checkStartup({ execPath, cli, timeoutMs = Number(process.env.CLAWGOD_STARTUP_TIMEOUT_MS || 30000), env = process.env, cwd } = {}) {
  if (!execPath || !cli || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) {
    return { status: 1, stdout: '', stderr: '[clawgod] Startup timeout must be a positive integer <= 2147483647.\n' };
  }
  return new Promise(resolve => {
    const limit = 1024 * 1024;
    const version = /^\d+\.\d+\.\d+[^\r\n]*\(Claude Code\)\s*$/;
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), line = '', sawVersion = false, finished = false;
    const tail = (previous, chunk) => {
      const combined = Buffer.concat([previous, chunk]);
      return combined.length > limit ? combined.subarray(combined.length - limit) : combined;
    };
    const child = spawn(execPath, [cli, '--version'], {
      env, cwd, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
    });
    function finish(status, message = '') {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ status, stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8') + (message ? `\n[clawgod] ${message}\n` : '') });
    }
    child.stdout.on('data', chunk => {
      stdout = tail(stdout, chunk);
      const lines = (line + chunk.toString('utf8')).split('\n');
      line = lines.pop().slice(-4096);
      if (lines.some(text => version.test(text))) sawVersion = true;
    });
    child.stderr.on('data', chunk => { stderr = tail(stderr, chunk); });
    const timer = setTimeout(() => {
      // 只终止独立探测进程组，不能波及发起 update 的 Claude 会话。
      if (child.pid) {
        if (process.platform === 'win32') {
          spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 2000 });
        } else {
          try { process.kill(-child.pid, 'SIGKILL'); } catch {}
        }
        try { child.kill('SIGKILL'); } catch {}
      }
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
      finish(124, `Startup verification timed out after ${timeoutMs} ms; launcher installation was aborted.`);
    }, timeoutMs);
    child.on('error', error => finish(1, `Could not start Bun: ${error.message}`));
    child.on('close', (code, signal) => {
      if (code !== 0) finish(code || 1, `Patched Claude startup failed (${signal ? `terminated by signal ${signal}` : `exit ${code}`}).`);
      else if (!sawVersion && !version.test(line)) finish(1, 'Bun exited successfully but did not print a Claude Code version.');
      else finish(0);
    });
  });
}

module.exports = { checkStartup };

if (require.main === module) {
  const [execPath, cli, timeout] = process.argv.slice(2);
  checkStartup({ execPath, cli, ...(timeout === undefined ? {} : { timeoutMs: Number(timeout) }) }).then(result => {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (cli) {
      const log = join(dirname(cli), 'startup-check.log');
      const temporaryLog = `${log}.${randomUUID()}.tmp`;
      let created = false;
      try {
        // 原子替换日志，不能沿旧符号链接或硬链接覆写用户文件。
        writeFileSync(temporaryLog, result.stdout + result.stderr, { flag: 'wx', mode: 0o600 });
        created = true;
        renameSync(temporaryLog, log);
        if (result.status) process.stderr.write(`[clawgod] Startup log: ${log}\n`);
      } catch (error) {
        process.stderr.write(`[clawgod] Cannot write startup log: ${error.message}\n`);
      } finally {
        if (created) {
          try { rmSync(temporaryLog, { force: true }); } catch {}
        }
      }
    }
    process.exitCode = result.status;
  });
}
