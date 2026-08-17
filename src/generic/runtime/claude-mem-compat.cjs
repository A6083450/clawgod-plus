#!/usr/bin/env bun
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
const clawgodDir = path.join(home, '.clawgod');
const memDir = process.env.CLAUDE_MEM_DATA_DIR || path.join(home, '.claude-mem');
const settingsPath = path.join(memDir, 'settings.json');
const backupPath = path.join(memDir, 'clawgod-settings-backup.json');
const statePath = path.join(memDir, 'clawgod-settings-state.json');
const isWindows = process.platform === 'win32';
const launcherPath = path.join(clawgodDir, isWindows ? 'claude-mem.cmd' : 'claude-mem');
const managedKeys = ['CLAUDE_MEM_MODEL', 'CLAUDE_MEM_CLAUDE_AUTH_METHOD', 'CLAUDE_CODE_PATH'];

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, value) {
  const content = JSON.stringify(value, null, 2) + '\n';
  try { if (fs.readFileSync(file, 'utf8') === content) return false; } catch {}
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, content, { mode: 0o600 });
  fs.renameSync(temp, file);
  return true;
}

function configuredGateway() {
  const provider = readJson(path.join(clawgodDir, 'provider.json'), {});
  const claudeSettings = readJson(path.join(process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'settings.json'), {});
  const env = claudeSettings && typeof claudeSettings.env === 'object' ? claudeSettings.env : {};
  if (provider.apiKey) {
    return { credential: provider.apiKey, baseURL: provider.baseURL || '' };
  }
  return {
    credential: env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || '',
    baseURL: env.ANTHROPIC_BASE_URL || '',
  };
}

function findWorker() {
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  const cache = path.join(configDir, 'plugins', 'cache', 'thedotmack', 'claude-mem');
  const candidates = [];
  try {
    for (const version of fs.readdirSync(cache)) {
      candidates.push(path.join(cache, version, 'scripts', 'worker-service.cjs'));
    }
  } catch {}
  candidates.push(path.join(configDir, 'plugins', 'marketplaces', 'thedotmack', 'plugin', 'scripts', 'worker-service.cjs'));
  return candidates.filter(file => fs.existsSync(file)).sort((a, b) => {
    try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; } catch { return 0; }
  })[0] || null;
}

function restartWorker() {
  if (process.env.CLAWGOD_SKIP_CLAUDE_MEM_RESTART === '1') return;
  const worker = findWorker();
  if (!worker) return;
  const bun = process.env.CLAWGOD_BUN_BIN || path.join(home, '.bun', 'bin', isWindows ? 'bun.exe' : 'bun');
  const command = fs.existsSync(bun) ? bun : 'bun';
  const run = cp.spawnSync(command, [worker, 'restart'], { stdio: 'inherit', windowsHide: true, timeout: 90000 });
  if (run.error || run.status !== 0) throw run.error || new Error(`claude-mem restart exited ${run.status}`);
}

function processRows() {
  if (process.env.CLAWGOD_CLAUDE_MEM_PS_FIXTURE) return process.env.CLAWGOD_CLAUDE_MEM_PS_FIXTURE.split(/\r?\n/);
  if (isWindows) {
    const script = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress';
    const raw = cp.execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: true });
    const values = JSON.parse(raw || '[]');
    return (Array.isArray(values) ? values : [values]).map(item => `${item.ProcessId} ${item.ParentProcessId} ${item.CommandLine || ''}`);
  }
  return cp.execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).split(/\r?\n/);
}

function cleanupStaleChroma() {
  if (process.env.CLAWGOD_CLAUDE_MEM_SKIP_CLEANUP === '1') return { stalePids: [], keptPid: null };
  const supervisor = readJson(path.join(memDir, 'supervisor.json'), {});
  const recordedPid = Number(supervisor?.processes?.['chroma-mcp']?.pid) || null;
  const normalizePath = value => {
    const normalized = path.resolve(value).replace(/\\/g, '/');
    return isWindows ? normalized.toLowerCase() : normalized;
  };
  const dataDir = normalizePath(path.join(memDir, 'chroma'));
  const processes = new Map();
  for (const row of processRows()) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(row);
    if (match) processes.set(Number(match[1]), { ppid: Number(match[2]), command: match[3] });
  }
  const candidates = new Set();
  for (const [pid, item] of processes) {
    const command = isWindows ? item.command.toLowerCase() : item.command;
    const args = command.match(/"[^"]*"|'[^']*'|\S+/g)?.map(value => value.replace(/^["']|["']$/g, '')) || [];
    const dataDirIndex = args.indexOf('--data-dir');
    if (command.includes('chroma-mcp') && command.includes('--client-type persistent') && dataDirIndex >= 0 && normalizePath(args[dataDirIndex + 1]) === dataDir) candidates.add(pid);
  }
  const rootOf = pid => {
    let current = pid;
    const seen = new Set();
    while (candidates.has(processes.get(current)?.ppid) && !seen.has(current)) {
      seen.add(current);
      current = processes.get(current).ppid;
    }
    return current;
  };
  const keptPid = recordedPid && candidates.has(recordedPid) ? rootOf(recordedPid) : null;
  if (!keptPid) return { stalePids: [], keptPid: null };
  const roots = [...candidates].filter(pid => rootOf(pid) === pid);
  const stalePids = roots.filter(pid => pid !== keptPid).sort((a, b) => a - b);
  if (process.env.CLAWGOD_CLAUDE_MEM_DRY_RUN !== '1') {
    for (const pid of stalePids) {
      if (isWindows) {
        cp.spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      } else {
        const descendants = [...processes].filter(([child]) => rootOf(child) === pid).map(([child]) => child).sort((a, b) => b - a);
        for (const target of descendants) { try { process.kill(target, 'SIGTERM'); } catch {} }
      }
    }
  }
  return { stalePids, keptPid };
}

function writeLauncher(mainBin) {
  let content;
  if (isWindows) {
    content = `@echo off\r\nset "CLAWGOD_CLAUDE_MEM=1"\r\ncall "${mainBin}" %*\r\nexit /b %ERRORLEVEL%\r\n`;
  } else {
    const quoted = `'${mainBin.replace(/'/g, `'\\''`)}'`;
    content = `#!/bin/sh\nexport CLAWGOD_CLAUDE_MEM=1\nexec ${quoted} "$@"\n`;
  }
  try { if (fs.readFileSync(launcherPath, 'utf8') === content) return; } catch {}
  fs.mkdirSync(path.dirname(launcherPath), { recursive: true });
  fs.writeFileSync(launcherPath, content, { mode: 0o700 });
  if (!isWindows) fs.chmodSync(launcherPath, 0o700);
}

function install() {
  const worker = findWorker();
  const settingsExists = fs.existsSync(settingsPath);
  if (!settingsExists && !worker) return false;
  const settings = readJson(settingsPath, null);
  if (!settings && settingsExists) throw new Error(`Cannot read claude-mem settings: ${settingsPath}`);
  // 全新安装时插件已落地（worker 存在于插件缓存）但 claude-mem 尚未首次
  // 运行、settings.json 还不存在——用空配置初始化而非报错。
  const current = settings || {};
  if (current.CLAUDE_MEM_PROVIDER && current.CLAUDE_MEM_PROVIDER !== 'claude') return false;
  const gateway = configuredGateway();
  if (!gateway.credential) return false;
  const state = readJson(statePath, null);
  if (state && managedKeys.some(key => current[key] !== state[key])) return false;
  if (!fs.existsSync(backupPath)) {
    const backup = {};
    for (const key of managedKeys) if (Object.hasOwn(current, key)) backup[key] = current[key];
    writeJson(backupPath, backup);
  }
  const authMethod = gateway.baseURL && !/anthropic\.com/i.test(gateway.baseURL) ? 'gateway' : 'api-key';
  const defaultBin = path.join(home, '.local', 'bin', isWindows ? 'claude.cmd' : 'claude');
  const requestedBin = process.env.CLAWGOD_CLAUDE_BIN || defaultBin;
  const mainBin = /(?:^|[\\/])cmux-cli-shims(?:[\\/]|$)/i.test(requestedBin) && fs.existsSync(defaultBin) ? defaultBin : requestedBin;
  const next = { ...current, CLAUDE_MEM_PROVIDER: 'claude', CLAUDE_MEM_MODEL: 'haiku', CLAUDE_MEM_CLAUDE_AUTH_METHOD: authMethod, CLAUDE_CODE_PATH: launcherPath };
  writeJson(settingsPath, next);
  writeJson(statePath, Object.fromEntries(managedKeys.map(key => [key, next[key]])));
  writeLauncher(mainBin);
  cleanupStaleChroma();
  restartWorker();
  return true;
}

function uninstall() {
  const hasBackup = fs.existsSync(backupPath);
  const settings = readJson(settingsPath, null);
  const backup = readJson(backupPath, null);
  const state = readJson(statePath, null);
  if (hasBackup && (!settings || !backup || !state)) throw new Error(`Cannot restore claude-mem settings: ${settingsPath}`);
  if (settings && backup && state) {
    const restored = { ...settings };
    for (const key of managedKeys) {
      if (settings[key] !== state[key]) continue;
      if (Object.hasOwn(backup, key)) restored[key] = backup[key]; else delete restored[key];
    }
    writeJson(settingsPath, restored);
  }
  try { fs.unlinkSync(backupPath); } catch {}
  try { fs.unlinkSync(statePath); } catch {}
  try { fs.unlinkSync(launcherPath); } catch {}
  if (settings && backup) restartWorker();
}

const command = process.argv[2] || 'install';
if (command === 'install') install();
else if (command === 'uninstall') uninstall();
else if (command === 'cleanup') console.log(JSON.stringify(cleanupStaleChroma()));
else throw new Error(`Unknown command: ${command}`);
