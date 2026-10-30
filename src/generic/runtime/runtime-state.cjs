const fs = require('node:fs');
const { dirname, join } = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const MANAGED = [
  'cli.cjs', 'cli.js', 'cli.original.js', 'cli.original.cjs',
  'cli.original.js.bak', 'cli.original.cjs.bak', 'chunks', 'chunks.bak', 'assets',
  '.source-version', '.clawgod-version', '.clean-source.json', 'patch-fallback.json',
  'patch.mjs', 'patch.js', 'extract-natives.mjs', 'post-process.mjs', 'repatch.mjs',
  'runtime-state.cjs', 'startup-check.cjs', 'vendor-transaction.mjs', 'self-update.cjs',
  'patch-fallback.cjs', 'feature-gates.cjs', 'openai-proxy.cjs', 'proxy-fetch.mjs',
  'fetch-file.mjs', 'enhancement-config.mjs', 'enhancement-manifest.json',
  'install-ripgrep.mjs', 'install-voice-asr.mjs', 'plugin-dependencies.mjs',
  'claude-mem-compat.cjs', 'apply-claude-code-chrome-fix.sh',
  'apply-claude-code-chrome-fix.ps1', 'install.sh', 'install.ps1',
  'restore-claude-3p-cu-browser.sh',
  'desktop-language.mjs', 'desktop-zh-Hans.json',
];
const VERSION = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/;

function present(path) {
  try { return fs.lstatSync(path); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function files(path, prefix = '', allowLinks = false) {
  const status = fs.lstatSync(path);
  if (status.isSymbolicLink()) {
    if (allowLinks) return { [prefix]: `symlink:${fs.readlinkSync(path)}` };
    throw new Error(`runtime-state: symbolic link is not a managed source: ${path}`);
  }
  if (status.isFile()) return { [prefix]: createHash('sha256').update(fs.readFileSync(path)).digest('hex') };
  if (!status.isDirectory()) throw new Error(`runtime-state: unsupported source type: ${path}`);
  const result = {};
  for (const name of fs.readdirSync(path).sort()) {
    Object.assign(result, files(join(path, name), prefix ? `${prefix}/${name}` : name, allowLinks));
  }
  return result;
}

const WRITE_LOCK = '.runtime-write.lock';
const READER_PREFIX = '.runtime-reader.';

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}

function readLock(path) {
  const status = present(path);
  if (!status) return null;
  if (!status.isFile() || status.isSymbolicLink()) throw Error('运行时锁不是普通文件，已停止升级/启动。');
  let record;
  try { record = JSON.parse(fs.readFileSync(path, 'utf8')); } catch { throw Error('运行时锁不完整，已停止升级/启动。'); }
  if (!Number.isSafeInteger(record.pid) || record.pid <= 0 || !/^[a-f0-9-]{36}$/.test(record.token)) {
    throw Error('运行时锁内容无效，已停止升级/启动。');
  }
  return record;
}

function processList() {
  const windows = process.platform === 'win32';
  const result = windows
    ? spawnSync('powershell.exe', ['-NoProfile', '-Command', '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress'], { encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 16 * 1024 * 1024 })
    : spawnSync('/bin/ps', ['-axww', '-o', 'pid=,ppid=,command='], { encoding: 'utf8', timeout: 15000, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw Error('无法检查正在使用运行时的进程，已停止升级。');
  if (windows) {
    const rows = JSON.parse(result.stdout);
    return (Array.isArray(rows) ? rows : [rows]).map(row => ({ pid: row.ProcessId, parent: row.ParentProcessId, command: row.CommandLine || '' }));
  }
  return result.stdout.trim().split(/\r?\n/).map(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!match) throw Error('无法解析运行时进程列表，已停止升级。');
    return { pid: Number(match[1]), parent: Number(match[2]), command: match[3] };
  });
}

function activeRuntimeProcesses(root, processes) {
  const normalize = value => process.platform === 'win32' ? value.replaceAll('\\', '/').toLowerCase() : value;
  const resolved = fs.realpathSync(root);
  const rootIdentity = process.platform === 'win32' ? fs.statSync(root, { bigint: true }) : null;
  const roots = [...new Set([root, resolved,
    ...(process.platform === 'darwin' && /^\/private\/(?:var|tmp|etc)\//.test(resolved) ? [resolved.slice(8)] : []),
  ].map(normalize))];
  return processes.filter(row => {
    const command = normalize(row.command);
    const words = command.match(/"[^"]*"|'[^']*'|[^\s]+/g) || [];
    const executable = (words[0] || '').replace(/^["']|["']$/g, '').split('/').at(-1);
    if (/^(?:-?(?:ba|z|fi|da)?sh|python[\d.]*|powershell(?:\.exe)?|pwsh(?:\.exe)?)$/.test(executable)) return false;
    for (const directory of roots) for (const entry of ['cli.cjs', 'cli.original.cjs', 'cli.js']) {
      const path = join(directory, entry).replaceAll('\\', '/');
      const start = command.indexOf(path);
      if (start < 0 || start > 0 && !/[\s"']/.test(command[start - 1])) continue;
      const rest = command.slice(start + path.length);
      if (rest && !/^[\s"']/.test(rest)) continue;
      // update 包装器不会加载上游分块；其他命令（含后台 host）都占用运行时。
      if (/^["']?\s+(?:update|upgrade)(?:\s|$)/.test(rest) && entry === 'cli.cjs') continue;
      return true;
    }
    if (rootIdentity && rootIdentity.ino !== 0n) for (const [index, word] of words.entries()) {
      const path = word.replace(/^["']|["']$/g, '');
      if (!/^[a-z]:\//i.test(path) || !/\/(?:cli\.cjs|cli\.original\.cjs|cli\.js)$/.test(path)) continue;
      try {
        // Bun 的 realpath 可能保留 Windows 8.3 拼写，用目录文件身份识别同一运行时。
        const identity = fs.statSync(dirname(path), { bigint: true });
        if (identity.ino === rootIdentity.ino && identity.dev === rootIdentity.dev) {
          if (/\/cli\.cjs$/.test(path) && ['update', 'upgrade'].includes(words[index + 1])) continue;
          return true;
        }
      } catch {}
    }
    // shortcut: 旧版相对入口无法可靠跨平台取得 cwd，先保守拒绝；增加进程 cwd 查询后可缩小范围。
    return words.some((word, index) => {
      const path = word.replace(/^["']|["']$/g, '');
      return !/^(?:\/|[a-z]:)/i.test(path) && /(?:^|\/)cli(?:\.original)?\.(?:cjs|js)$/.test(path)
        && !(/(?:^|\/)cli\.cjs$/.test(path) && ['update', 'upgrade'].includes(words[index + 1]));
    });
  });
}

function ancestors(pid, processes) {
  const result = new Set();
  while (pid > 0 && !result.has(pid)) {
    result.add(pid);
    pid = processes.find(row => row.pid === pid)?.parent || 0;
  }
  return result;
}

function acquireRuntime(root, ownerPid = process.pid) {
  if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0 || !alive(ownerPid)) throw Error('升级锁进程无效。');
  const token = randomUUID(), path = join(root, WRITE_LOCK);
  try { fs.writeFileSync(path, JSON.stringify({ pid: ownerPid, token }), { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code === 'EEXIST') throw Error('运行时已有升级/维护锁；请等待完成，异常中断后请先检查恢复数据。');
    throw error;
  }
  try {
    const readers = [], bootstraps = new Set();
    const processes = processList(), parents = ancestors(ownerPid, processes);
    for (const name of fs.readdirSync(root).filter(name => name.startsWith(READER_PREFIX))) {
      const file = join(root, name), record = readLock(file);
      if (!record) continue;
      if (!alive(record.pid)) fs.unlinkSync(file);
      else if (record.bootstrap === true && parents.has(record.pid)) bootstraps.add(record.pid);
      else readers.push(record.pid);
    }
    const active = activeRuntimeProcesses(root, processes).map(row => row.pid).filter(pid => !bootstraps.has(pid));
    const pids = [...new Set([...readers, ...active])];
    if (pids.length) throw Error(`Claude 正在使用运行时（PID: ${pids.join(', ')}）。请先在所有会话中执行 /exit，并关闭仍使用 Claude 的浏览器连接或后台任务，再从普通终端运行 claude update；本次未替换运行时。`);
    return token;
  } catch (error) { releaseRuntime(root, token); throw error; }
}

function releaseRuntime(root, token) {
  const path = join(root, WRITE_LOCK), record = readLock(path);
  if (!record || record.token !== token) throw Error('运行时锁 token 不匹配，拒绝删除。');
  fs.unlinkSync(path);
}

function assertRuntimeAvailable(root) {
  const lock = readLock(join(root, WRITE_LOCK));
  if (!lock) return;
  // 仅持锁安装器的后代可运行候选启动检查，继承字符串本身不授予访问权。
  if (process.env.CLAWGOD_RUNTIME_WRITE_TOKEN === lock.token && alive(lock.pid)) {
    if (ancestors(process.ppid, processList()).has(lock.pid)) return;
  }
  throw Error('ClawGod 正在升级/维护，暂时不能启动 Claude；请等待完成后重试。');
}

function enterRuntime(root, bootstrap = false) {
  assertRuntimeAvailable(root);
  const file = join(root, `${READER_PREFIX}${process.pid}.${randomUUID()}`);
  const record = { pid: process.pid, token: randomUUID(), bootstrap };
  fs.writeFileSync(file, JSON.stringify(record), { flag: 'wx', mode: 0o600 });
  try { assertRuntimeAvailable(root); }
  catch (error) { fs.unlinkSync(file); throw error; }
  process.once('exit', () => { try { fs.unlinkSync(file); } catch {} });
  return () => {
    record.bootstrap = false;
    fs.writeFileSync(file, JSON.stringify(record), { mode: 0o600 });
    assertRuntimeAvailable(root);
  };
}

function snapshot(root, transaction) {
  const backup = join(transaction, 'runtime-state');
  fs.mkdirSync(backup, { mode: 0o700 });
  const names = MANAGED.filter(name => present(join(root, name)));
  for (const name of names) files(join(root, name), '', true);
  for (const name of names) fs.cpSync(join(root, name), join(backup, name), { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
  fs.writeFileSync(join(backup, 'manifest.json'), JSON.stringify(names));
}

function restore(root, transaction) {
  const backup = join(transaction, 'runtime-state');
  const names = JSON.parse(fs.readFileSync(join(backup, 'manifest.json'), 'utf8'));
  if (!Array.isArray(names) || names.some(name => !MANAGED.includes(name))) throw new Error('runtime-state: invalid rollback manifest');
  for (const name of names) files(join(backup, name), '', true);
  for (const name of MANAGED) {
    fs.rmSync(join(root, name), { recursive: true, force: true });
    if (names.includes(name)) fs.cpSync(join(backup, name), join(root, name), { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
  }
}

function cleanManifest(root, version, backup) {
  if (!VERSION.test(version || '')) throw new Error('runtime-state: exact source version is required');
  const entry = join(root, backup ? 'cli.original.cjs.bak' : 'cli.original.cjs');
  const chunks = join(root, backup ? 'chunks.bak' : 'chunks');
  const modules = files(entry, 'cli.original.cjs');
  const hasChunks = Boolean(present(chunks));
  if (hasChunks) Object.assign(modules, files(chunks, 'chunks'));
  return { schemaVersion: 1, version, hasChunks, modules };
}

function saveClean(root, version) {
  const manifest = cleanManifest(root, version, false);
  fs.rmSync(join(root, '.clean-source.json'), { force: true });
  fs.rmSync(join(root, 'cli.original.cjs.bak'), { force: true });
  fs.rmSync(join(root, 'chunks.bak'), { recursive: true, force: true });
  fs.copyFileSync(join(root, 'cli.original.cjs'), join(root, 'cli.original.cjs.bak'));
  if (manifest.hasChunks) fs.cpSync(join(root, 'chunks'), join(root, 'chunks.bak'), { recursive: true });
  fs.writeFileSync(join(root, '.clean-source.json'), JSON.stringify(manifest) + '\n', { mode: 0o600 });
}

function restoreClean(root, version) {
  const expected = JSON.parse(fs.readFileSync(join(root, '.clean-source.json'), 'utf8'));
  const actual = cleanManifest(root, version, true);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('runtime-state: clean source version or complete module set does not match');
  fs.rmSync(join(root, 'cli.original.cjs'), { force: true });
  fs.copyFileSync(join(root, 'cli.original.cjs.bak'), join(root, 'cli.original.cjs'));
  fs.rmSync(join(root, 'chunks'), { recursive: true, force: true });
  if (actual.hasChunks) fs.cpSync(join(root, 'chunks.bak'), join(root, 'chunks'), { recursive: true });
}

module.exports = { snapshot, restore, saveClean, restoreClean, acquireRuntime, releaseRuntime, enterRuntime };
if (require.main === module) {
  try {
    const [command, root, argument] = process.argv.slice(2);
    if (!root || !argument) throw new Error('runtime-state: command, runtime directory and transaction/version required');
    if (command === 'lock') console.log(acquireRuntime(root, Number(argument)));
    else if (command === 'unlock') releaseRuntime(root, argument);
    else if (command === 'snapshot') snapshot(root, argument);
    else if (command === 'restore') restore(root, argument);
    else if (command === 'clean-save') saveClean(root, argument);
    else if (command === 'clean-restore') restoreClean(root, argument);
    else throw new Error(`runtime-state: unknown command ${command}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
