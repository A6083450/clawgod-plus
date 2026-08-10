# GENERATED FILE - edit src/ and run: bun build.mjs
#Requires -Version 5.1
<#
.SYNOPSIS
    ClawGod Plus Installer for Windows
.DESCRIPTION
    Downloads Claude Code from npm, applies feature unlock patches,
    and replaces the 'claude' command with the patched version.
.EXAMPLE
    irm https://github.com/A6083450/clawgod-plus/releases/latest/download/install.ps1 | iex
    # or
    .\install.ps1
    .\install.ps1 -Version 2.1.89
    .\install.ps1 -NoUpgrade
    .\install.ps1 -Uninstall
#>
param(
    [string]$Version = "latest",
    [switch]$NoUpgrade,
    [switch]$Uninstall,
    [switch]$LeanOff,
    [switch]$LeanOn,
    [switch]$LeanMax
)

$ErrorActionPreference = "Stop"

if ($env:CLAWGOD_VERSION -and $Version -eq "latest") { $Version = $env:CLAWGOD_VERSION }
if ($env:CLAWGOD_NO_UPGRADE -eq "1") { $NoUpgrade = [switch]$true }
if ($env:CLAWGOD_LEAN_OFF -eq "1") { $LeanOff = [switch]$true }
if ($env:CLAWGOD_LEAN_ON -eq "1") { $LeanOn = [switch]$true }
if ($env:CLAWGOD_LEAN_MAX -eq "1") { $LeanMax = [switch]$true }

$ClawDir = Join-Path $env:USERPROFILE ".clawgod"
$BinDir  = Join-Path $env:USERPROFILE ".local\bin"
$ClawSelfVersion = "0.0.0-dev"  # injected by release workflow from git tag

$ClaudeMemCompatSource = @'
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
  if (!fs.existsSync(settingsPath) && !worker) return false;
  const settings = readJson(settingsPath, null);
  if (!settings) throw new Error(`Cannot read claude-mem settings: ${settingsPath}`);
  if (settings.CLAUDE_MEM_PROVIDER && settings.CLAUDE_MEM_PROVIDER !== 'claude') return false;
  const gateway = configuredGateway();
  if (!gateway.credential) return false;
  const state = readJson(statePath, null);
  if (state && managedKeys.some(key => settings[key] !== state[key])) return false;
  if (!fs.existsSync(backupPath)) {
    const backup = {};
    for (const key of managedKeys) if (Object.hasOwn(settings, key)) backup[key] = settings[key];
    writeJson(backupPath, backup);
  }
  const authMethod = gateway.baseURL && !/anthropic\.com/i.test(gateway.baseURL) ? 'gateway' : 'api-key';
  const defaultBin = path.join(home, '.local', 'bin', isWindows ? 'claude.cmd' : 'claude');
  const requestedBin = process.env.CLAWGOD_CLAUDE_BIN || defaultBin;
  const mainBin = /(?:^|[\\/])cmux-cli-shims(?:[\\/]|$)/i.test(requestedBin) && fs.existsSync(defaultBin) ? defaultBin : requestedBin;
  const next = { ...settings, CLAUDE_MEM_PROVIDER: 'claude', CLAUDE_MEM_MODEL: 'haiku', CLAUDE_MEM_CLAUDE_AUTH_METHOD: authMethod, CLAUDE_CODE_PATH: launcherPath };
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
'@

function Install-ClaudeMemCompatHelper {
    New-Item -ItemType Directory -Force -Path $ClawDir | Out-Null
    $helper = Join-Path $ClawDir "claude-mem-compat.cjs"
    [System.IO.File]::WriteAllText($helper, $ClaudeMemCompatSource + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding $false))
}

$FetchFileBytes = [Convert]::FromBase64String('IyEvdXNyL2Jpbi9lbnYgYnVuCmltcG9ydCB7IGV4aXN0c1N5bmMsIHJlbmFtZVN5bmMsIHJtU3luYyB9IGZyb20gJ25vZGU6ZnMnOwoKY29uc3QgW3VybCwgZGVzdGluYXRpb25dID0gcHJvY2Vzcy5hcmd2LnNsaWNlKDIpOwppZiAoIXVybCB8fCAhZGVzdGluYXRpb24pIHRocm93IG5ldyBFcnJvcigndXNhZ2U6IGZldGNoLWZpbGUubWpzIDx1cmw+IDxkZXN0aW5hdGlvbj4nKTsKCmZ1bmN0aW9uIG5vUHJveHlSdWxlKHZhbHVlKSB7CiAgbGV0IGVudHJ5ID0gdmFsdWUudHJpbSgpLnRvTG93ZXJDYXNlKCk7CiAgaWYgKGVudHJ5ID09PSAnKicpIHJldHVybiB7IGFsbDogdHJ1ZSB9OwoKICBsZXQgaG9zdCA9IGVudHJ5OwogIGxldCBwb3J0ID0gJyc7CiAgaWYgKGVudHJ5LnN0YXJ0c1dpdGgoJ1snKSkgewogICAgY29uc3QgY2xvc2UgPSBlbnRyeS5pbmRleE9mKCddJyk7CiAgICBpZiAoY2xvc2UgPT09IC0xKSByZXR1cm4geyBob3N0OiBlbnRyeSwgcG9ydCB9OwogICAgaG9zdCA9IGVudHJ5LnNsaWNlKDEsIGNsb3NlKTsKICAgIGNvbnN0IHN1ZmZpeCA9IGVudHJ5LnNsaWNlKGNsb3NlICsgMSk7CiAgICBpZiAoL146XGQrJC8udGVzdChzdWZmaXgpKSBwb3J0ID0gc3VmZml4LnNsaWNlKDEpOwogICAgZWxzZSBpZiAoc3VmZml4KSByZXR1cm4geyBob3N0OiBlbnRyeSwgcG9ydCB9OwogIH0gZWxzZSB7CiAgICBjb25zdCBjb2xvbiA9IGVudHJ5Lmxhc3RJbmRleE9mKCc6Jyk7CiAgICBpZiAoY29sb24gPiAwICYmIGNvbG9uID09PSBlbnRyeS5pbmRleE9mKCc6JykgJiYgL15cZCskLy50ZXN0KGVudHJ5LnNsaWNlKGNvbG9uICsgMSkpKSB7CiAgICAgIGhvc3QgPSBlbnRyeS5zbGljZSgwLCBjb2xvbik7CiAgICAgIHBvcnQgPSBlbnRyeS5zbGljZShjb2xvbiArIDEpOwogICAgfQogIH0KICByZXR1cm4geyBob3N0OiBob3N0LnJlcGxhY2UoL15cKlwuLywgJy4nKSwgcG9ydCB9Owp9CgpmdW5jdGlvbiBieXBhc3Nlc1Byb3h5KHVybFZhbHVlKSB7CiAgY29uc3QgcGFyc2VkID0gdHlwZW9mIHVybFZhbHVlID09PSAnc3RyaW5nJyA/IG5ldyBVUkwodXJsVmFsdWUpIDogdXJsVmFsdWU7CiAgY29uc3QgZW50cmllcyA9IChwcm9jZXNzLmVudi5OT19QUk9YWSB8fCBwcm9jZXNzLmVudi5ub19wcm94eSB8fCAnJykuc3BsaXQoJywnKS5maWx0ZXIodmFsdWUgPT4gdmFsdWUudHJpbSgpKTsKICBjb25zdCBob3N0ID0gcGFyc2VkLmhvc3RuYW1lLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvXlxbfFxdJC9nLCAnJyk7CiAgY29uc3QgcG9ydCA9IHBhcnNlZC5wb3J0IHx8IChwYXJzZWQucHJvdG9jb2wgPT09ICdodHRwczonID8gJzQ0MycgOiBwYXJzZWQucHJvdG9jb2wgPT09ICdodHRwOicgPyAnODAnIDogJycpOwogIHJldHVybiBlbnRyaWVzLnNvbWUoZW50cnkgPT4gewogICAgY29uc3QgcnVsZSA9IG5vUHJveHlSdWxlKGVudHJ5KTsKICAgIGlmIChydWxlLmFsbCkgcmV0dXJuIHRydWU7CiAgICBjb25zdCBiYXNlSG9zdCA9IHJ1bGUuaG9zdC5yZXBsYWNlKC9eXC4vLCAnJyk7CiAgICBjb25zdCBtYXRjaGVzSG9zdCA9IGhvc3QgPT09IGJhc2VIb3N0IHx8IGhvc3QuZW5kc1dpdGgoYC4ke2Jhc2VIb3N0fWApOwogICAgcmV0dXJuIG1hdGNoZXNIb3N0ICYmICghcnVsZS5wb3J0IHx8IHJ1bGUucG9ydCA9PT0gcG9ydCk7CiAgfSk7Cn0KCmZ1bmN0aW9uIHByb3h5Rm9yKHVybFZhbHVlKSB7CiAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmxWYWx1ZSk7CiAgaWYgKGJ5cGFzc2VzUHJveHkocGFyc2VkKSkgcmV0dXJuIHVuZGVmaW5lZDsKICByZXR1cm4gcGFyc2VkLnByb3RvY29sID09PSAnaHR0cHM6JwogICAgPyBwcm9jZXNzLmVudi5IVFRQU19QUk9YWSB8fCBwcm9jZXNzLmVudi5odHRwc19wcm94eSB8fCBwcm9jZXNzLmVudi5IVFRQX1BST1hZIHx8IHByb2Nlc3MuZW52Lmh0dHBfcHJveHkKICAgIDogcHJvY2Vzcy5lbnYuSFRUUF9QUk9YWSB8fCBwcm9jZXNzLmVudi5odHRwX3Byb3h5Owp9Cgphc3luYyBmdW5jdGlvbiBmZXRjaFdpdGhQcm94eShpbml0aWFsVXJsKSB7CiAgbGV0IG5leHRVcmwgPSBpbml0aWFsVXJsOwogIGZvciAobGV0IHJlZGlyZWN0cyA9IDA7IHJlZGlyZWN0cyA8PSA1OyByZWRpcmVjdHMrKykgewogICAgY29uc3QgcHJveHkgPSBwcm94eUZvcihuZXh0VXJsKTsKICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2gobmV4dFVybCwgeyByZWRpcmVjdDogJ21hbnVhbCcsIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCgzMDAwMDApLCAuLi4ocHJveHkgPyB7IHByb3h5IH0gOiB7fSkgfSk7CiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzID49IDMwMCAmJiByZXNwb25zZS5zdGF0dXMgPCA0MDAgJiYgcmVzcG9uc2UuaGVhZGVycy5oYXMoJ2xvY2F0aW9uJykpIHsKICAgICAgaWYgKHJlZGlyZWN0cyA9PT0gNSkgdGhyb3cgbmV3IEVycm9yKCd0b28gbWFueSByZWRpcmVjdHMnKTsKICAgICAgbmV4dFVybCA9IG5ldyBVUkwocmVzcG9uc2UuaGVhZGVycy5nZXQoJ2xvY2F0aW9uJyksIG5leHRVcmwpLmhyZWY7CiAgICAgIGNvbnRpbnVlOwogICAgfQogICAgaWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gMjAwKSB0aHJvdyBuZXcgRXJyb3IoYGRvd25sb2FkIGZhaWxlZCB3aXRoIEhUVFAgJHtyZXNwb25zZS5zdGF0dXN9YCk7CiAgICByZXR1cm4gcmVzcG9uc2U7CiAgfQogIHRocm93IG5ldyBFcnJvcigndG9vIG1hbnkgcmVkaXJlY3RzJyk7Cn0KCmNvbnN0IHRlbXBvcmFyeSA9IGAke2Rlc3RpbmF0aW9ufS4ke3Byb2Nlc3MucGlkfS50bXBgOwp0cnkgewogIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2hXaXRoUHJveHkodXJsKTsKICBhd2FpdCBCdW4ud3JpdGUodGVtcG9yYXJ5LCByZXNwb25zZSk7CiAgcmVuYW1lU3luYyh0ZW1wb3JhcnksIGRlc3RpbmF0aW9uKTsKfSBmaW5hbGx5IHsKICBpZiAoZXhpc3RzU3luYyh0ZW1wb3JhcnkpKSBybVN5bmModGVtcG9yYXJ5LCB7IGZvcmNlOiB0cnVlIH0pOwp9Cg==')

function Install-FetchFileHelper {
    New-Item -ItemType Directory -Force -Path $ClawDir | Out-Null
    $helper = Join-Path $ClawDir "fetch-file.mjs"
    [System.IO.File]::WriteAllBytes($helper, $FetchFileBytes)
}

function Install-ChromeFixScript {
    New-Item -ItemType Directory -Force -Path $ClawDir | Out-Null
    $dst = Join-Path $ClawDir "apply-claude-code-chrome-fix.ps1"
    $localCandidates = @()
    if ($PSScriptRoot) { $localCandidates += Join-Path $PSScriptRoot "apply-claude-code-chrome-fix.ps1" }
    $localCandidates += Join-Path (Get-Location) "apply-claude-code-chrome-fix.ps1"

    foreach ($src in $localCandidates) {
        if ($src -and (Test-Path $src)) {
            Copy-Item $src $dst -Force
            return $true
        }
    }

    try {
        & $BunBin (Join-Path $ClawDir "fetch-file.mjs") "https://raw.githubusercontent.com/A6083450/clawgod-plus/main/apply-claude-code-chrome-fix.ps1" $dst
        if ($LASTEXITCODE -ne 0) { return $false }
        return $true
    } catch {
        return $false
    }
}

function Invoke-ChromePostInstallFix {
    $script = Join-Path $ClawDir "apply-claude-code-chrome-fix.ps1"
    if (-not (Test-Path $script)) {
        if (-not (Install-ChromeFixScript)) {
            Write-Warn "Claude in Chrome post-install fix script not available; skipping"
            return
        }
    }

    $target = Join-Path $ClawDir "cli.original.cjs"
    Write-Dim "Applying Claude Code Chrome post-install fix ..."
    try {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $script -CliPath $target
        if ($LASTEXITCODE -eq 0) {
            Write-OK "Claude Code Chrome post-install fix applied"
        } else {
            Write-Warn "Claude Code Chrome post-install fix did not apply; ClawGod Plus core install will continue"
        }
    } catch {
        Write-Warn "Claude Code Chrome post-install fix failed; ClawGod Plus core install will continue"
    }
}

# ─── Colors ───────────────────────────────────────────

function Write-OK($msg)   { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Err($msg)  { Write-Host "  ✗ $msg" -ForegroundColor Red }
function Write-Warn($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Write-Dim($msg)  { Write-Host "  $msg" -ForegroundColor DarkGray }

function Resolve-Bun {
    $candidates = @()
    try {
        $command = Get-Command bun -ErrorAction Stop
        if ($command.Source) { $candidates += $command.Source }
    } catch {}
    $candidates += @(
        (Join-Path $env:USERPROFILE ".bun\bin\bun.exe"),
        (Join-Path $env:APPDATA "npm\node_modules\bun\bin\bun.exe"),
        (Join-Path $env:USERPROFILE "scoop\shims\bun.exe"),
        (Join-Path $env:ProgramData "chocolatey\bin\bun.exe")
    )
    foreach ($candidate in $candidates | Select-Object -Unique) {
        if (-not $candidate) { continue }
        if ($candidate -match '\.(?:cmd|bat|ps1)$') {
            $native = Join-Path (Split-Path $candidate) "node_modules\bun\bin\bun.exe"
            if (Test-Path -Path $native -PathType Leaf) { return $native }
            continue
        }
        if ($candidate -notmatch '\.exe$') { continue }
        if (Test-Path -Path $candidate -PathType Leaf) { return $candidate }
    }
    Write-Err "Bun is required. Install Bun first: https://bun.sh/install"
    return $null
}

function Test-ClaudePathPresent {
    param([string]$Path)

    try {
        $null = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Test-ClawGodLauncherContent {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    try {
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        if ($item.Length -gt 1048576) { return $false }
        $content = [System.IO.File]::ReadAllText($Path)
    } catch {
        return $false
    }

    # The marker identifies newer launchers, but never grants ownership alone.
    $hasExplicitMarker = $content -match '(?m)^rem CLAWGOD_LAUNCHER_V1\r?$'
    $hasStableStructure = (
        ($content -match '(?m)^@echo off\r?$') -and
        ($content -match '(?m)^setlocal\r?$') -and
        ($content -match '(?m)^if not exist ".*[\\/]\.clawgod[\\/]cli\.cjs" \(\r?$') -and
        ($content -match '(?m)^set "CLAUDE_CODE_EXECPATH=%~dp0claude\.orig\.exe"\r?$') -and
        ($content -match '(?m)^set "CLAWGOD_AUTO_CHROME=1"\r?$') -and
        ($content -match '(?m)^exit /b %ERRORLEVEL%\r?$')
    )
    if ($hasExplicitMarker -and -not $hasStableStructure) { return $false }
    return $hasStableStructure
}

function Test-ClawGodLauncher {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    try {
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { return $false }
    } catch {
        return $false
    }
    return (Test-ClawGodLauncherContent $Path)
}

function Test-ValidClaudeOriginal {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    return (-not (Test-ClawGodLauncherContent $Path))
}

function Test-ClaudeLauncherConflict {
    param(
        [string]$Current,
        [string]$Original
    )

    if (-not (Test-ClaudePathPresent $Original)) { return $false }
    if ((Test-ClaudePathPresent $Current) -and -not (Test-ClawGodLauncher $Current)) {
        Write-Err "Claude launcher conflict at $Current; current command and $Original were preserved."
        Write-Err "Move or remove the third-party current command, then rerun the installer."
        return $true
    }
    if (-not (Test-ValidClaudeOriginal $Original) -and -not (Test-ClawGodLauncherContent $Original)) {
        Write-Err "Invalid original backup at $Original; operation stopped without launcher changes."
        return $true
    }
    return $false
}

function Test-ClaudeUninstallConflict {
    param(
        [string]$CurrentCmd,
        [string]$CurrentExe,
        [string]$OriginalCmd,
        [string]$OriginalExe
    )

    $hasValidOriginal = ((Test-ValidClaudeOriginal $OriginalCmd) -or
        (Test-ValidClaudeOriginal $OriginalExe))
    if (-not $hasValidOriginal) { return $false }

    $hasThirdPartyCurrent = (
        ((Test-ClaudePathPresent $CurrentCmd) -and -not (Test-ClawGodLauncher $CurrentCmd)) -or
        ((Test-ClaudePathPresent $CurrentExe) -and -not (Test-ClawGodLauncher $CurrentExe))
    )
    if ($hasThirdPartyCurrent) {
        Write-Err "Claude launcher conflict across cmd/exe slots; current commands and original backups were preserved."
        Write-Err "Move or remove the third-party current command, then rerun the uninstaller."
        return $true
    }
    return $false
}

Write-Host ""
Write-Host "  ClawGod Plus Installer" -ForegroundColor White -NoNewline
Write-Host " (Windows)" -ForegroundColor DarkGray
Write-Host ""

# ─── Uninstall ────────────────────────────────────────

if ($Uninstall) {
    $BunBin = Resolve-Bun
    if (-not $BunBin) { exit 1 }
    $claudeOrig = Join-Path $BinDir "claude.orig.cmd"
    $claudeCmd  = Join-Path $BinDir "claude.cmd"
    $claudeExeOrig = Join-Path $BinDir "claude.orig.exe"
    $claudeExe = Join-Path $BinDir "claude.exe"
    if (Test-ClaudeUninstallConflict -CurrentCmd $claudeCmd -CurrentExe $claudeExe -OriginalCmd $claudeOrig -OriginalExe $claudeExeOrig) {
        exit 1
    }
    if ((Test-ClaudeLauncherConflict -Current $claudeCmd -Original $claudeOrig) -or
        (Test-ClaudeLauncherConflict -Current $claudeExe -Original $claudeExeOrig)) {
        exit 1
    }
    # Restore optional Claude plugin integrations before any managed cleanup.
    $pluginDependencies = Join-Path $ClawDir "plugin-dependencies.mjs"
    $pluginState = Join-Path $ClawDir "plugin-dependencies-state.json"
    if ((Test-Path $pluginState) -and -not (Test-Path $pluginDependencies)) {
        Write-Warn "Could not restore optional Claude plugin integrations; ClawGod Plus was not uninstalled"
        exit 1
    }
    if (Test-Path $pluginDependencies) {
        $hadPluginBun = Test-Path Env:CLAWGOD_BUN_BIN
        $previousPluginBun = $env:CLAWGOD_BUN_BIN
        $hadPluginDir = Test-Path Env:CLAWGOD_DIR
        $previousPluginDir = $env:CLAWGOD_DIR
        $pluginRestoreFailed = $false
        try {
            $env:CLAWGOD_BUN_BIN = $BunBin
            $env:CLAWGOD_DIR = $ClawDir
            & $BunBin $pluginDependencies uninstall
            if ($LASTEXITCODE -ne 0) { throw "optional plugin restore exited $LASTEXITCODE" }
        } catch {
            Write-Warn "Could not restore optional Claude plugin integrations; ClawGod Plus was not uninstalled"
            $pluginRestoreFailed = $true
        } finally {
            if ($hadPluginBun) { $env:CLAWGOD_BUN_BIN = $previousPluginBun }
            else { Remove-Item Env:CLAWGOD_BUN_BIN -ErrorAction SilentlyContinue }
            if ($hadPluginDir) { $env:CLAWGOD_DIR = $previousPluginDir }
            else { Remove-Item Env:CLAWGOD_DIR -ErrorAction SilentlyContinue }
        }
        if ($pluginRestoreFailed) { exit 1 }
    }
    $claudeMemCompat = Join-Path $ClawDir "claude-mem-compat.cjs"
    if (Test-Path $claudeMemCompat) {
        try {
            $env:CLAWGOD_BUN_BIN = $BunBin
            & $BunBin "$ClawDir\claude-mem-compat.cjs" uninstall
            if ($LASTEXITCODE -ne 0) { throw "claude-mem compatibility helper exited $LASTEXITCODE" }
        } catch {
            Write-Warn "Could not restore claude-mem compatibility settings; ClawGod Plus was not uninstalled"
            exit 1
        }
    }
    # Restore original claude
    if (Test-ValidClaudeOriginal $claudeOrig) {
        if (Test-ClawGodLauncher $claudeCmd) { Remove-Item -LiteralPath $claudeCmd -Force }
        Move-Item -Force $claudeOrig $claudeCmd
        Write-OK "Original claude restored"
    } elseif (Test-ClawGodLauncherContent $claudeOrig) {
        if (Test-ClawGodLauncher $claudeCmd) { Remove-Item -LiteralPath $claudeCmd -Force }
        Remove-Item -LiteralPath $claudeOrig -Force
        Write-Warn "Removed installer-owned polluted backup ($claudeOrig)"
    } elseif ((Test-ClaudePathPresent $claudeCmd) -and (Test-ClawGodLauncher $claudeCmd)) {
        Remove-Item -Force $claudeCmd
        Write-OK "Removed ClawGod Plus launcher ($claudeCmd)"
    }
    # Also check for .exe backup
    if (Test-ValidClaudeOriginal $claudeExeOrig) {
        if (Test-ClawGodLauncher $claudeExe) { Remove-Item -LiteralPath $claudeExe -Force }
        Move-Item -Force $claudeExeOrig $claudeExe
        Write-OK "Original claude.exe restored"
    } elseif (Test-ClawGodLauncherContent $claudeExeOrig) {
        if (Test-ClawGodLauncher $claudeExe) { Remove-Item -LiteralPath $claudeExe -Force }
        Remove-Item -LiteralPath $claudeExeOrig -Force
        Write-Warn "Removed installer-owned polluted backup ($claudeExeOrig)"
    } elseif ((Test-ClaudePathPresent $claudeExe) -and (Test-ClawGodLauncher $claudeExe)) {
        Remove-Item -LiteralPath $claudeExe -Force
        Write-OK "Removed ClawGod Plus launcher ($claudeExe)"
    }
    # Remove explicit clawgod alias
    $clawgodCmd = Join-Path $BinDir "clawgod.cmd"
    if ((Test-Path $clawgodCmd) -and (Test-ClawGodLauncher $clawgodCmd)) {
        Remove-Item -Force $clawgodCmd
        Write-OK "Removed clawgod alias"
    }

    foreach ($f in @("cli.js","cli.cjs","cli.original.js","cli.original.cjs","cli.original.js.bak","cli.original.cjs.bak","patch.js","patch.mjs","extract-natives.mjs","post-process.mjs","repatch.mjs","openai-proxy.cjs","fetch-file.mjs","install-ripgrep.mjs","clawgod-import.exe","apply-claude-code-chrome-fix.ps1","claude-mem-compat.cjs","claude-mem.cmd","plugin-dependencies.mjs","claude-hud-statusline.mjs","plugin-dependencies-state.json","cache\claude-plugins","staging\claude-plugins",".source-version",".clawgod-version",".update-check","node_modules","bun-runtime","vendor")) {
        $p = Join-Path $ClawDir $f
        if (Test-Path $p) { Remove-Item -Recurse -Force $p }
    }
    Write-OK "ClawGod Plus uninstalled"
    Write-Host ""
    Write-Dim "Restart your terminal for changes to take effect."
    Write-Host ""
    exit 0
}

# ─── Bun prerequisite ──────────────────────────────────

$BunBin = Resolve-Bun
if (-not $BunBin) { exit 1 }
Write-OK "Bun: $(& $BunBin --version)"

# ─── Bun version pre-flight ───────────────────────────────────────────
# Anthropic builds the native binary with Bun's canary channel; stable
# bun.sh trails by one version. Bun < 1.3.14 panics on cli.original.cjs
# with "Expected CommonJS module to have a function wrapper". Refuse
# early — no npm download / no patch / no late sanity surprise where
# PowerShell's NativeCommandError display buries the friendly message.
# Bump $MinBunVersion when Anthropic moves the embedded Bun forward
# again.

$MinBunVersion = '1.3.14'
$BunVersionRaw = ''
try {
    $bunOut = & $BunBin --version 2>$null | Select-Object -First 1
    if ($bunOut) { $BunVersionRaw = "$bunOut".Trim() }
} catch {}
$BunVersionNum = ($BunVersionRaw -split '-')[0]
$BunVersionOk = $false
try {
    if ($BunVersionNum) {
        $BunVersionOk = ([version]$BunVersionNum) -ge ([version]$MinBunVersion)
    }
} catch {}
if (-not $BunVersionOk) {
    Write-Host ""
    Write-Err "Bun $BunVersionRaw is below the required minimum ($MinBunVersion)."
    Write-Err ""
    Write-Err "  Anthropic builds claude-code with Bun's canary channel. Older Bun"
    Write-Err "  panics on cli.original.cjs with 'Expected CommonJS module to have"
    Write-Err "  a function wrapper'. This is a hard requirement, not a warning."
    Write-Err ""
    Write-Err "  Upgrade with one of:"
    Write-Err "    bun upgrade --canary"
    Write-Err "    powershell -c ""iex & {`$(irm https://bun.sh/install.ps1)} -Version canary"""
    Write-Err ""
    Write-Err "  If your bun is from scoop (the binary is behind a shim and refuses"
    Write-Err "  to self-replace, so 'bun upgrade' silently hangs):"
    Write-Err "    scoop uninstall bun"
    Write-Err "    irm https://bun.sh/install.ps1 | iex"
    Write-Err "    bun upgrade --canary"
    Write-Err ""
    Write-Err "  Then re-run this installer."
    exit 1
}

Install-FetchFileHelper

# --- Optional Claude plugin dependencies -----------------------------

@'
#!/usr/bin/env bun
/**
 * @typedef {{
 *   home: string,
 *   claudeConfigDir: string,
 *   clawgodDir: string,
 *   bunPath: string,
 *   claudeCliPath: string,
 *   fetchFilePath: string,
 *   env: Record<string, string | undefined>,
 *   spawnSyncImpl: typeof Bun.spawnSync,
 *   onManagedDirectoryPublishing?: (transaction: object) => void,
 *   onManagedDirectoryInstalled?: (transaction: object) => void,
 *   onPersistentTransactionPrepared?: (transaction: object) => void,
 *   onCacheQuarantined?: (transaction: object) => void,
 *   onCacheFailedInspected?: (transaction: object) => void,
 *   onCacheCleanupInventoried?: (transaction: object) => void,
 *   onHudWriting?: (write: { label: string }) => void,
 *   onHudWritten?: (write: { label: string }) => void,
 *   onHudRestoring?: (write: { label: string }) => void,
 *   onHudRestored?: (write: { label: string }) => void,
 *   onClaudeMemWriting?: (write: { relativePath: string }) => void,
 *   onClaudeMemWritten?: (write: { relativePath: string }) => void,
 * }} PluginContext
 */

import { chmodSync, closeSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, unlinkSync, writeSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const PLUGIN_BASELINES = Object.freeze({
  hud: Object.freeze({
    key: 'hud', id: 'claude-hud@claude-hud', marketplace: 'claude-hud', plugin: 'claude-hud',
    version: '0.7.0', bytes: 754443,
    sha256: '59bd3ec17e7b9181d8069c93cc7c5e1db8b1d33e6a94e4041f6589dd8b87c912',
    url: 'https://hub.211107.xyz/https://github.com/jarrodwatts/claude-hud/archive/refs/tags/v0.7.0.tar.gz',
  }),
  memory: Object.freeze({
    key: 'memory', id: 'claude-mem@thedotmack', marketplace: 'thedotmack', plugin: 'claude-mem',
    version: '13.14.0', bytes: 11817347,
    sha256: 'a64f7dd038308da0db52f10d8f4fc2b3b3acfec5d9ddfdcfea9f6e473e54bed0',
    url: 'https://hub.211107.xyz/https://github.com/thedotmack/claude-mem/archive/refs/tags/v13.14.0.tar.gz',
  }),
  superpowers: Object.freeze({
    key: 'superpowers', id: 'superpowers@superpowers-marketplace', marketplace: 'superpowers-marketplace', plugin: 'superpowers',
    archiveMarketplace: 'superpowers-dev',
    version: '6.2.0', bytes: 516401,
    sha256: '468246a7b4981d4c014c2b58d9ee538700ffded075279d5810059cdc1abeb5f3',
    url: 'https://hub.211107.xyz/https://github.com/obra/superpowers/archive/refs/tags/v6.2.0.tar.gz',
  }),
});

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 512 * 1024 * 1024;
const MAX_ENTRIES = 50_000;
const TAR_BLOCK_BYTES = 512;
const textDecoder = new TextDecoder('utf-8', { fatal: true });

export const HUD_CONFIG_TEXT = `{
  "language": "zh",
  "lineLayout": "compact",
  "pathLevels": 1,
  "elementOrder": ["project", "tools", "context", "usage", "memory", "environment", "agents", "todos", "sessionTime"],
  "gitStatus": {
    "enabled": true,
    "showDirty": true,
    "showAheadBehind": true,
    "showFileStats": true
  },
  "display": {
    "showModel": true,
    "showAddedDirs": true,
    "addedDirsLayout": "line",
    "showContextBar": true,
    "contextValue": "tokens",
    "showConfigCounts": true,
    "showCost": true,
    "showDuration": true,
    "showSpeed": true,
    "showUsage": true,
    "showTools": true,
    "showAgents": true,
    "showTodos": true,
    "showTokenBreakdown": true,
    "usageBarEnabled": true
  },
  "colors": {
    "context": "green",
    "usage": "brightBlue",
    "warning": "yellow",
    "usageWarning": "brightMagenta",
    "critical": "red",
    "model": "cyan",
    "project": "yellow",
    "git": "magenta",
    "gitBranch": "cyan",
    "label": "#ff4fc2",
    "custom": "#FF6600"
  }
}
`;

function pathIsContained(root, path) {
  const child = relative(root, path);
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child));
}

function hudDirectoryChainIsSafe(root, target) {
  if (!pathIsContained(root, target)) return false;
  let current = root;
  for (const part of ['', ...relative(root, target).split(sep).filter(Boolean)]) {
    if (part) current = join(current, part);
    try {
      const status = lstatSync(current);
      if (status.isSymbolicLink() || !status.isDirectory()) return false;
    } catch { return false; }
  }
  return true;
}

function hudFileSnapshot(root, path, label, parseJson = false) {
  if (!isAbsolute(root) || !isAbsolute(path) || !pathIsContained(root, path)) {
    throw new Error(`hud: unsafe ${label} path`);
  }
  const pathParts = relative(root, dirname(path)).split(sep).filter(Boolean);
  let current = root;
  for (const part of ['', ...pathParts]) {
    if (part) current = join(current, part);
    let status;
    try { status = lstatSync(current); } catch { throw new Error(`hud: unsafe ${label} ancestor`); }
    if (status.isSymbolicLink() || !status.isDirectory() || (status.mode & 0o022) !== 0) {
      throw new Error(`hud: unsafe ${label} ancestor`);
    }
  }
  const parentStatus = lstatSync(dirname(path));
  let status;
  try { status = lstatSync(path); } catch (error) {
    if (error?.code === 'ENOENT') {
      return { path, present: false, bytes: null, mode: null, nlink: null, identity: null, parentIdentity: { dev: parentStatus.dev, ino: parentStatus.ino } };
    }
    throw new Error(`hud: unsafe ${label}`);
  }
  if (status.isSymbolicLink() || !status.isFile() || (status.mode & 0o022) !== 0) {
    throw new Error(`hud: unsafe ${label}`);
  }
  const bytes = readFileSync(path);
  let value;
  if (parseJson) {
    try { value = JSON.parse(textDecoder.decode(bytes)); } catch { throw new Error(`hud: invalid ${label} JSON`); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`hud: invalid ${label} JSON`);
  }
  return {
    path, present: true, bytes, value, mode: status.mode & 0o777, nlink: status.nlink,
    identity: { dev: status.dev, ino: status.ino },
    parentIdentity: { dev: parentStatus.dev, ino: parentStatus.ino },
  };
}

function assertHudSnapshotCurrent(snapshot, root, label) {
  const current = hudFileSnapshot(root, snapshot.path, label, false);
  if (current.present !== snapshot.present
    || (current.present && (current.identity.dev !== snapshot.identity.dev || current.identity.ino !== snapshot.identity.ino))
    || (current.present && (current.mode !== snapshot.mode || current.nlink !== snapshot.nlink || !Buffer.from(current.bytes).equals(Buffer.from(snapshot.bytes))))
    || current.parentIdentity.dev !== snapshot.parentIdentity.dev
    || current.parentIdentity.ino !== snapshot.parentIdentity.ino) {
    throw new Error(`hud: ${label} changed during update`);
  }
}

function atomicHudWrite(root, snapshot, bytes, targetMode, label) {
  const temporary = join(dirname(snapshot.path), `.${basename(snapshot.path)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  let descriptor = null;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    let offset = 0;
    while (offset < bytes.byteLength) offset += writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    chmodSync(temporary, targetMode);
    assertHudSnapshotCurrent(snapshot, root, label);
    const temporaryStatus = lstatSync(temporary);
    if (temporaryStatus.isSymbolicLink() || !temporaryStatus.isFile()) throw new Error(`hud: unsafe temporary ${label}`);
    renameSync(temporary, snapshot.path);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    try { unlinkSync(temporary); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
}

function planHudConfigSnapshot(root, path) {
  const parent = dirname(path);
  try {
    return { snapshot: hudFileSnapshot(root, path, 'HUD config'), missingParent: null };
  } catch (error) {
    try { lstatSync(parent); throw error; } catch (parentError) {
      if (parentError?.code !== 'ENOENT') throw error;
    }
    const grandparent = dirname(parent);
    if (!hudDirectoryChainIsSafe(root, grandparent)) throw new Error('hud: unsafe HUD config ancestor');
    const status = lstatSync(grandparent);
    return { snapshot: null, missingParent: { path: parent, parentIdentity: { dev: status.dev, ino: status.ino } } };
  }
}

function createHudConfigParent(root, plan) {
  if (!plan.missingParent) return { snapshot: plan.snapshot, createdParent: null };
  const parent = plan.missingParent.path;
  const grandparent = dirname(parent);
  if (!hudDirectoryChainIsSafe(root, grandparent)) throw new Error('hud: unsafe HUD config ancestor');
  const status = lstatSync(grandparent);
  if (status.dev !== plan.missingParent.parentIdentity.dev || status.ino !== plan.missingParent.parentIdentity.ino) {
    throw new Error('hud: HUD config ancestor changed during update');
  }
  try { lstatSync(parent); throw new Error('hud: HUD config parent changed during update'); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  mkdirSync(parent, 0o700);
  const created = lstatSync(parent);
  if (created.isSymbolicLink() || !created.isDirectory()) throw new Error('hud: unsafe created HUD config parent');
  return { snapshot: hudFileSnapshot(root, join(parent, 'config.json'), 'HUD config'), createdParent: { path: parent, dev: created.dev, ino: created.ino } };
}

function removeCreatedHudConfigParent(createdParent) {
  if (!createdParent) return;
  const status = lstatSync(createdParent.path);
  if (status.isSymbolicLink() || !status.isDirectory() || status.dev !== createdParent.dev || status.ino !== createdParent.ino) {
    throw new Error('hud: created HUD config parent changed during rollback');
  }
  rmdirSync(createdParent.path);
}

function rollbackHudWrite(write) {
  const current = hudFileSnapshot(write.root, write.snapshot.path, write.label);
  try { assertHudSnapshotCurrent(write.postWrite, write.root, write.label); }
  catch {
    throw new Error(`hud: ${write.label} changed before rollback`);
  }
  if (write.snapshot.present) {
    atomicHudWrite(write.root, current, write.snapshot.bytes, write.snapshot.mode, write.label);
  } else {
    atomicHudRemove(write.root, current, write.label);
  }
}

function rollbackClaudeMemWrites(writes) {
  const transferred = [];
  const errors = [];
  for (const write of [...writes].reverse()) {
    try { assertHudSnapshotCurrent(write.postWrite, write.root, write.label); }
    catch {
      transferred.push(write.label);
      continue;
    }
    try { rollbackHudWrite(write); }
    catch (error) { errors.push(error); }
  }
  return { transferred, errors };
}

function atomicHudRemove(root, snapshot, label) {
  assertHudSnapshotCurrent(snapshot, root, label);
  if (snapshot.present) unlinkSync(snapshot.path);
}

function jsonFingerprint(value) {
  return sha256(new TextEncoder().encode(JSON.stringify(value)));
}

function fileFingerprint(bytes) {
  return sha256(bytes instanceof Uint8Array ? bytes : new TextEncoder().encode(bytes));
}

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isPlainRecord(value) && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function isCanonicalBase64(value) {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false;
  return Buffer.from(value, 'base64').toString('base64') === value;
}

function validateClaudeMemOwnership(files) {
  if (!isPlainRecord(files)) throw new Error('claude-mem: unsupported or malformed ownership state');
  const hashPattern = /^[0-9a-f]{64}$/;
  const seen = new Set();
  for (const [targetPath, record] of Object.entries(files)) {
    if (!isAbsolute(targetPath) || resolve(targetPath) !== targetPath || seen.has(targetPath)
      || !hasExactKeys(record, ['relativePath', 'pluginVersion', 'originalBase64', 'originalSha256', 'managedSha256'])
      || (record.relativePath !== 'hooks/hooks.json' && record.relativePath !== '.mcp.json')
      || !parseSemver(record.pluginVersion)
      || !isCanonicalBase64(record.originalBase64)
      || !hashPattern.test(record.originalSha256)
      || record.originalSha256 !== fileFingerprint(Buffer.from(record.originalBase64, 'base64'))
      || !hashPattern.test(record.managedSha256)) {
      throw new Error('claude-mem: unsupported or malformed ownership state');
    }
    const suffix = record.relativePath === 'hooks/hooks.json'
      ? join('hooks', 'hooks.json') : '.mcp.json';
    if ((record.relativePath === 'hooks/hooks.json' && !targetPath.endsWith(`${sep}${suffix}`))
      || (record.relativePath === '.mcp.json' && basename(targetPath) !== suffix)) {
      throw new Error('claude-mem: unsupported or malformed ownership state');
    }
    seen.add(targetPath);
  }
}

function validateClaudeMemOwnershipContext(files, context) {
  const cacheRoot = resolve(context.claudeConfigDir, 'plugins', 'cache', 'thedotmack', 'claude-mem');
  for (const [targetPath, record] of Object.entries(files)) {
    if (compareSemver(record.pluginVersion, PLUGIN_BASELINES.memory.version) < 0) {
      throw new Error('claude-mem: ambiguous ownership state');
    }
    const expected = record.relativePath === 'hooks/hooks.json'
      ? resolve(cacheRoot, record.pluginVersion, 'hooks', 'hooks.json')
      : resolve(cacheRoot, record.pluginVersion, '.mcp.json');
    if (targetPath !== expected || !pathIsContained(cacheRoot, targetPath)) {
      throw new Error('claude-mem: ambiguous ownership state');
    }
  }
}

function managedStatusLineCommandIsValid(command, modulePath, platform = process.platform) {
  if (typeof command !== 'string' || typeof modulePath !== 'string') return false;
  let moduleArgument;
  try { moduleArgument = quoteStatusLineArg(modulePath, platform); } catch { return false; }
  const suffix = ` ${moduleArgument}`;
  if (!command.endsWith(suffix)) return false;
  const bunArgument = command.slice(0, -suffix.length);
  let bunPath;
  if (platform === 'win32') {
    if (bunArgument.length < 2 || bunArgument[0] !== '"' || bunArgument.at(-1) !== '"') return false;
    bunPath = bunArgument.slice(1, -1);
  } else {
    if (bunArgument.length < 2 || bunArgument[0] !== "'" || bunArgument.at(-1) !== "'") return false;
    bunPath = bunArgument.slice(1, -1).replaceAll(`'"'"'`, "'");
  }
  try {
    if (quoteStatusLineArg(bunPath, platform) !== bunArgument) return false;
  } catch { return false; }
  const executable = bunPath.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase();
  return executable === 'bun' || executable === 'bun.exe';
}

function validateManagedHudState(value, allowInitial = false, managedContext = null) {
  if (!hasExactKeys(value, ['schemaVersion', 'hud', 'claudeMem']) || value.schemaVersion !== 1
    || !isPlainRecord(value.claudeMem) || !isPlainRecord(value.claudeMem.files) || !isPlainRecord(value.hud)) {
    throw new Error('hud: unsupported or malformed ownership state');
  }
  validateClaudeMemOwnership(value.claudeMem.files);
  if (Object.keys(value.hud).length === 0) return structuredClone(value);
  const config = value.hud.config;
  const statusLine = value.hud.statusLine;
  const hashPattern = /^[0-9a-f]{64}$/;
  if (!hasExactKeys(value.hud, ['config', 'statusLine'])
    || !hasExactKeys(config, ['originalPresent', 'originalBase64', 'managedSha256'])
    || typeof config.originalPresent !== 'boolean'
    || !isCanonicalBase64(config.originalBase64)
    || (!config.originalPresent && config.originalBase64 !== '')
    || !hashPattern.test(config.managedSha256)
    || config.managedSha256 !== fileFingerprint(HUD_CONFIG_TEXT)
    || !hasExactKeys(statusLine, ['originalPresent', 'originalValue', 'managedValue', 'managedSha256'])
    || typeof statusLine.originalPresent !== 'boolean'
    || (!statusLine.originalPresent && statusLine.originalValue !== null)
    || !hasExactKeys(statusLine.managedValue, ['type', 'command'])
    || statusLine.managedValue.type !== 'command'
    || typeof statusLine.managedValue.command !== 'string'
    || !managedStatusLineCommandIsValid(statusLine.managedValue.command, managedContext?.modulePath, managedContext?.platform)
    || !hashPattern.test(statusLine.managedSha256)
    || statusLine.managedSha256 !== jsonFingerprint(statusLine.managedValue)) {
    throw new Error('hud: unsupported or malformed ownership state');
  }
  return structuredClone(value);
}

function currentHudState(state, persisted, context, modulePath) {
  return validateManagedHudState(state, !persisted, { modulePath, platform: context.platform || process.platform });
}

function validateHudInstallPath(record, cacheRoot, claudeConfigDir) {
  if (record?.scope !== 'user' || !parseSemver(record.version) || typeof record.installPath !== 'string' || !isAbsolute(record.installPath)) return null;
  try {
    if (!pathIsContained(cacheRoot, record.installPath)
      || !hudDirectoryChainIsSafe(claudeConfigDir, cacheRoot)
      || !hudDirectoryChainIsSafe(cacheRoot, record.installPath)) return null;
    const cacheStatus = lstatSync(cacheRoot);
    const installStatus = lstatSync(record.installPath);
    if (cacheStatus.isSymbolicLink() || !cacheStatus.isDirectory() || installStatus.isSymbolicLink() || !installStatus.isDirectory()) return null;
    const realCache = realpathSync(cacheRoot);
    const realInstall = realpathSync(record.installPath);
    if (!pathIsContained(realCache, realInstall) || realInstall === realCache) return null;
    const source = join(record.installPath, 'src');
    const entry = join(source, 'index.ts');
    const sourceStatus = lstatSync(source);
    const entryStatus = lstatSync(entry);
    if (sourceStatus.isSymbolicLink() || !sourceStatus.isDirectory() || entryStatus.isSymbolicLink() || !entryStatus.isFile() || entryStatus.nlink !== 1) return null;
    const realEntry = realpathSync(entry);
    if (!pathIsContained(realInstall, realEntry)) return null;
    return { record, entry: realEntry };
  } catch {
    return null;
  }
}

function selectedHudInstall(installed, claudeConfigDir) {
  const records = Array.isArray(installed?.plugins?.['claude-hud@claude-hud'])
    ? installed.plugins['claude-hud@claude-hud'] : [];
  const cacheRoot = join(claudeConfigDir, 'plugins', 'cache', 'claude-hud', 'claude-hud');
  const valid = records.map(record => validateHudInstallPath(record, cacheRoot, claudeConfigDir)).filter(Boolean);
  valid.sort((left, right) => compareSemver(right.record.version, left.record.version));
  return valid[0] || null;
}

function validateClaudeMemInstallPath(record, cacheRoot, claudeConfigDir) {
  if (record?.scope !== 'user' || !parseSemver(record.version) || typeof record.installPath !== 'string' || !isAbsolute(record.installPath)) return null;
  const expectedPath = resolve(cacheRoot, record.version);
  if (resolve(record.installPath) !== expectedPath) return null;
  try {
    if (!pathIsContained(cacheRoot, expectedPath)
      || !hudDirectoryChainIsSafe(claudeConfigDir, cacheRoot)
      || !hudDirectoryChainIsSafe(cacheRoot, expectedPath)) return null;
    const cacheStatus = lstatSync(cacheRoot);
    const installStatus = lstatSync(expectedPath);
    if (cacheStatus.isSymbolicLink() || !cacheStatus.isDirectory() || installStatus.isSymbolicLink() || !installStatus.isDirectory()) return null;
    const realCache = realpathSync(cacheRoot);
    const realInstall = realpathSync(expectedPath);
    if (!pathIsContained(realCache, realInstall) || realInstall === realCache || realInstall !== expectedPath) return null;
    return { record, installPath: expectedPath };
  } catch {
    return null;
  }
}

function selectedClaudeMemInstall(installed, claudeConfigDir) {
  const records = Array.isArray(installed?.plugins?.['claude-mem@thedotmack'])
    ? installed.plugins['claude-mem@thedotmack'] : [];
  const cacheRoot = join(claudeConfigDir, 'plugins', 'cache', 'thedotmack', 'claude-mem');
  const valid = records.map(record => validateClaudeMemInstallPath(record, cacheRoot, claudeConfigDir)).filter(Boolean);
  valid.sort((left, right) => compareSemver(right.record.version, left.record.version));
  return valid[0] || null;
}

function captureClaudeMemSelection(installedSnapshot, selected, context) {
  const directories = [];
  let current = context.claudeConfigDir;
  for (const part of ['', ...relative(context.claudeConfigDir, selected.installPath).split(sep).filter(Boolean)]) {
    if (part) current = join(current, part);
    const status = lstatSync(current);
    if (status.isSymbolicLink() || !status.isDirectory()) throw new Error('claude-mem: unsafe selected cache identity');
    directories.push({ path: current, dev: status.dev, ino: status.ino, mode: status.mode, nlink: status.nlink });
  }
  return { installedSnapshot, directories };
}

function assertClaudeMemSelectionCurrent(selection, context) {
  assertHudSnapshotCurrent(selection.installedSnapshot, context.claudeConfigDir, 'installed plugin state');
  for (const expected of selection.directories) {
    const status = lstatSync(expected.path);
    if (status.isSymbolicLink() || !status.isDirectory() || status.dev !== expected.dev || status.ino !== expected.ino
      || status.mode !== expected.mode || status.nlink !== expected.nlink) {
      throw new Error('claude-mem: selected cache identity changed during update');
    }
  }
}

export function quoteStatusLineArg(path, platform = process.platform) {
  if (typeof path !== 'string' || path.includes('\0') || path.includes('*') || path.includes('$(') || path.includes('`')) {
    throw new Error('hud: unsafe status-line path');
  }
  if (platform === 'win32') {
    if (!/^(?:[A-Za-z]:[\\/]|\\\\)/.test(path) || /["%!&|<>()^\r\n]/.test(path)) {
      throw new Error('hud: unsafe Windows status-line path');
    }
    return `"${path}"`;
  }
  if (!isAbsolute(path)) throw new Error('hud: status-line path must be absolute');
  return `'${path.replaceAll("'", `'"'"'`)}'`;
}

function claudeMemBunPath(path) {
  if (typeof path !== 'string' || path.includes('\0') || path.includes('\r') || path.includes('\n')
    || (!isAbsolute(path) && !/^[A-Za-z]:[\\/]/.test(path))) {
    throw new Error('claude-mem: Bun path must be absolute');
  }
  const executable = path.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase();
  if (executable !== 'bun' && executable !== 'bun.exe') throw new Error('claude-mem: executable is not Bun');
  return path;
}

function quoteClaudeMemHookBun(path) {
  return `'${claudeMemBunPath(path).replaceAll("'", `'"'"'`)}'`;
}

function parseClaudeMemJson(relativePath, raw) {
  if (typeof raw !== 'string') throw new Error(`claude-mem: invalid ${relativePath} JSON`);
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error(`claude-mem: invalid ${relativePath} JSON`); }
  if (!isPlainRecord(value)) throw new Error(`claude-mem: invalid ${relativePath} schema`);
  return value;
}

function claudeMemPluginNodePositions(command) {
  const positions = [];
  let quote = null;
  let atCommandStart = true;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (quote === "'") {
      if (character === "'") quote = null;
      continue;
    }
    if (quote === '"') {
      if (character === '\\') index += 1;
      else if (character === '"') quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      if (atCommandStart) atCommandStart = false;
      quote = character;
      continue;
    }
    if (character === '\\') {
      if (atCommandStart) atCommandStart = false;
      index += 1;
      continue;
    }
    if (character === ';' || character === '&' || character === '|' || character === '\n') {
      atCommandStart = true;
      continue;
    }
    if (atCommandStart && /\s/.test(character)) continue;
    if (!atCommandStart) continue;
    const candidate = command.slice(index);
    if (/^node\s+(?=["']?\$_P\/scripts\/)/.test(candidate)) positions.push(index);
    atCommandStart = false;
  }
  if (quote !== null) throw new Error('claude-mem: unterminated shell quote');
  return positions;
}

export function rewriteClaudeMemFile(relativePath, raw, bunPath) {
  if (relativePath !== 'hooks/hooks.json' && relativePath !== '.mcp.json') {
    throw new Error('claude-mem: unsupported integration path');
  }
  const value = parseClaudeMemJson(relativePath, raw);
  claudeMemBunPath(bunPath);
  if (relativePath === '.mcp.json') {
    const server = isPlainRecord(value.mcpServers) ? value.mcpServers['mcp-search'] : null;
    if (!isPlainRecord(server) || server.type !== 'stdio' || server.command !== 'node'
      || !Array.isArray(server.args) || server.args.length < 2 || server.args[0] !== '-e' || typeof server.args[1] !== 'string') {
      throw new Error('claude-mem: invalid mcp-search schema');
    }
    server.command = bunPath;
    return { text: JSON.stringify(value, null, 2) + '\n', replacements: 1 };
  }

  if (!isPlainRecord(value.hooks)) throw new Error('claude-mem: invalid hooks schema');
  const known = [
    { token: 'node "$_P/scripts/version-check.js"', label: 'version-check' },
    { token: 'node "$_P/scripts/bun-runner.js"', label: 'bun-runner' },
  ];
  const counts = { 'version-check': 0, 'bun-runner': 0 };
  const quotedBun = quoteClaudeMemHookBun(bunPath);
  for (const groups of Object.values(value.hooks)) {
    if (!Array.isArray(groups)) throw new Error('claude-mem: invalid hooks schema');
    for (const group of groups) {
      if (!isPlainRecord(group) || !Array.isArray(group.hooks)) throw new Error('claude-mem: invalid hooks schema');
      for (const hook of group.hooks) {
        if (!isPlainRecord(hook) || typeof hook.command !== 'string') throw new Error('claude-mem: invalid hook command schema');
        const replacements = [];
        const commandCounts = { 'version-check': 0, 'bun-runner': 0 };
        for (const position of claudeMemPluginNodePositions(hook.command)) {
          const entry = known.find(candidate => hook.command.startsWith(candidate.token, position)
            && (hook.command[position + candidate.token.length] === undefined
              || /[\s;&|]/.test(hook.command[position + candidate.token.length])));
          if (!entry) throw new Error('claude-mem: remaining unknown Node executable');
          commandCounts[entry.label] += 1;
          if (commandCounts[entry.label] > 1) throw new Error(`claude-mem: duplicate ${entry.label} executable`);
          replacements.push({ position, entry });
        }
        for (const replacement of replacements.reverse()) {
          const before = hook.command.slice(0, replacement.position);
          const after = hook.command.slice(replacement.position + replacement.entry.token.length);
          hook.command = `${before}${quotedBun}${replacement.entry.token.slice(4)}${after}`;
          counts[replacement.entry.label] += 1;
        }
      }
    }
  }
  if (counts['version-check'] < 1 || counts['bun-runner'] < 1) {
    throw new Error('claude-mem: missing required hook replacement');
  }
  return { text: JSON.stringify(value, null, 2) + '\n', replacements: counts['version-check'] + counts['bun-runner'] };
}

export async function configureClaudeMemBun(context, state) {
  const spec = PLUGIN_BASELINES.memory;
  const completedWrites = [];
  let ownershipWrite = null;
  try {
    claudeMemBunPath(context.bunPath);
    const installedPath = join(context.claudeConfigDir, 'plugins', 'installed_plugins.json');
    const installedSnapshot = hudFileSnapshot(context.claudeConfigDir, installedPath, 'installed plugin state', true);
    if (!installedSnapshot.present || installedSnapshot.value.version !== 2 || !isPlainRecord(installedSnapshot.value.plugins)) {
      throw new Error('claude-mem: unsupported installed plugin schema');
    }
    const selected = selectedClaudeMemInstall(installedSnapshot.value, context.claudeConfigDir);
    if (!selected || compareSemver(selected.record.version, spec.version) < 0) {
      throw new Error('claude-mem: no valid baseline user installation');
    }
    const selection = captureClaudeMemSelection(installedSnapshot, selected, context);
    const statePath = join(context.clawgodDir, 'plugin-dependencies-state.json');
    const stateSnapshot = hudFileSnapshot(context.clawgodDir, statePath, 'ownership state', true);
    const nextState = validateManagedHudState(
      stateSnapshot.present ? stateSnapshot.value : state,
      !stateSnapshot.present,
      { modulePath: join(context.clawgodDir, 'claude-hud-statusline.mjs'), platform: context.platform || process.platform },
    );
    validateClaudeMemOwnershipContext(nextState.claudeMem.files, context);
    const definitions = [
      { relativePath: 'hooks/hooks.json', targetPath: resolve(selected.installPath, 'hooks', 'hooks.json') },
      { relativePath: '.mcp.json', targetPath: resolve(selected.installPath, '.mcp.json') },
    ];
    const plans = [];
    for (const definition of definitions) {
      const snapshot = hudFileSnapshot(selected.installPath, definition.targetPath, definition.relativePath);
      if (!snapshot.present) throw new Error(`claude-mem: missing ${definition.relativePath}`);
      const currentHash = fileFingerprint(snapshot.bytes);
      const prior = nextState.claudeMem.files[definition.targetPath];
      if (prior && currentHash === prior.managedSha256) {
        plans.push({ ...definition, snapshot, bytes: snapshot.bytes, write: false });
        continue;
      }
      const rewritten = rewriteClaudeMemFile(definition.relativePath, textDecoder.decode(snapshot.bytes), context.bunPath);
      const managedBytes = Buffer.from(rewritten.text);
      nextState.claudeMem.files[definition.targetPath] = {
        relativePath: definition.relativePath,
        pluginVersion: selected.record.version,
        originalBase64: snapshot.bytes.toString('base64'),
        originalSha256: currentHash,
        managedSha256: fileFingerprint(managedBytes),
      };
      plans.push({ ...definition, snapshot, bytes: managedBytes, write: true });
    }
    if (plans.every(plan => !plan.write)) {
      const callerStateUpdate = state && typeof state === 'object'
        ? { keys: Object.keys(state), value: structuredClone(nextState) }
        : null;
      assertHudSnapshotCurrent(stateSnapshot, context.clawgodDir, 'ownership state');
      for (const plan of plans) {
        assertHudSnapshotCurrent(plan.snapshot, selected.installPath, `claude-mem ${plan.relativePath}`);
      }
      assertClaudeMemSelectionCurrent(selection, context);
      if (callerStateUpdate) {
        for (const key of callerStateUpdate.keys) delete state[key];
        Object.assign(state, callerStateUpdate.value);
      }
      return pluginResult(spec, 'configured', true, selected.record.version, `configured ${selected.record.version}`);
    }

    const writes = [{
      root: context.clawgodDir,
      snapshot: stateSnapshot,
      bytes: Buffer.from(JSON.stringify(nextState, null, 2) + '\n'),
      mode: stateSnapshot.present ? stateSnapshot.mode : 0o600,
      label: 'ownership state',
      relativePath: null,
    }, ...plans.filter(plan => plan.write).map(plan => ({
      root: selected.installPath,
      snapshot: plan.snapshot,
      bytes: plan.bytes,
      mode: plan.snapshot.mode,
      label: `claude-mem ${plan.relativePath}`,
      relativePath: plan.relativePath,
    }))];
    for (const write of writes) {
      if (write.relativePath) context.onClaudeMemWriting?.({ relativePath: write.relativePath });
      assertClaudeMemSelectionCurrent(selection, context);
      if (write.relativePath && ownershipWrite) {
        assertHudSnapshotCurrent(ownershipWrite.postWrite, ownershipWrite.root, ownershipWrite.label);
      }
      atomicHudWrite(write.root, write.snapshot, write.bytes, write.mode, write.label);
      const completedWrite = { ...write, postWrite: hudFileSnapshot(write.root, write.snapshot.path, write.label) };
      completedWrites.push(completedWrite);
      if (!write.relativePath) ownershipWrite = completedWrite;
      if (write.relativePath) context.onClaudeMemWritten?.({ relativePath: write.relativePath });
    }
    assertClaudeMemSelectionCurrent(selection, context);
    assertHudSnapshotCurrent(ownershipWrite.postWrite, ownershipWrite.root, ownershipWrite.label);
    if (state && typeof state === 'object') {
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, structuredClone(nextState));
    }
    return pluginResult(spec, 'configured', true, selected.record.version, `configured ${selected.record.version}`);
  } catch (error) {
    const rollback = rollbackClaudeMemWrites(completedWrites);
    const primary = error instanceof Error ? error.message : 'claude-mem configuration failed';
    const message = rollback.errors.length > 0
      ? `rollback incomplete: ${rollback.errors[0].message}`
      : rollback.transferred.length > 0
        ? `${primary}; ownership transferred: ${rollback.transferred.join(', ')}`
        : primary;
    return pluginResult(spec, 'warning', false, null, `preserved but not Bun-verified: ${message}`);
  }
}

function hudStatusLineCommand(context, modulePath) {
  const executable = context.bunPath.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase();
  if (executable !== 'bun' && executable !== 'bun.exe') throw new Error('hud: statusLine executable is not Bun');
  const command = `${quoteStatusLineArg(context.bunPath, context.platform)} ${quoteStatusLineArg(modulePath, context.platform)}`;
  const lowered = command.toLowerCase();
  if (lowered.includes('bash -c') || lowered.includes(' ls ') || lowered.includes(' head ')
    || command.includes('$(') || command.includes('`') || command.includes('*')) {
    throw new Error('hud: unsafe statusLine command');
  }
  return command;
}

export function renderHudStatusLineModule(context) {
  if (!isAbsolute(context.claudeConfigDir)) throw new Error('hud: Claude config path must be absolute');
  return `#!/usr/bin/env bun
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

const claudeConfigDir = ${JSON.stringify(context.claudeConfigDir)};
const pluginId = 'claude-hud@claude-hud';
const semverPattern = /^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?$/;
function parseVersion(value) {
  const match = typeof value === 'string' ? semverPattern.exec(value) : null;
  if (!match) return null;
  const core = match.slice(1, 4).map(Number);
  if (!core.every(Number.isSafeInteger)) return null;
  const prerelease = match[4] ? match[4].split('.').map(identifier => {
    if (!/^\\d+$/.test(identifier)) return identifier;
    if (!/^(0|[1-9]\\d*)$/.test(identifier)) return null;
    const numeric = Number(identifier);
    return Number.isSafeInteger(numeric) ? numeric : null;
  }) : [];
  return prerelease.includes(null) ? null : { core, prerelease };
}
function compare(left, right) {
  const a = parseVersion(left); const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index++) if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index];
  if (!a.prerelease.length || !b.prerelease.length) return a.prerelease.length ? -1 : b.prerelease.length ? 1 : 0;
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
    if (a.prerelease[index] === undefined) return -1;
    if (b.prerelease[index] === undefined) return 1;
    if (a.prerelease[index] === b.prerelease[index]) continue;
    if (typeof a.prerelease[index] === 'number' && typeof b.prerelease[index] !== 'number') return -1;
    if (typeof a.prerelease[index] !== 'number' && typeof b.prerelease[index] === 'number') return 1;
    return a.prerelease[index] < b.prerelease[index] ? -1 : 1;
  }
  return 0;
}
function contained(root, path) {
  const child = relative(root, path);
  return child === '' || (!child.startsWith('..' + sep) && child !== '..' && !isAbsolute(child));
}
function captureDirectoryChain(root, target) {
  if (!contained(root, target)) return null;
  const identities = [];
  let current = root;
  for (const part of ['', ...relative(root, target).split(sep).filter(Boolean)]) {
    if (part) current = join(current, part);
    try {
      const status = lstatSync(current);
      if (status.isSymbolicLink() || !status.isDirectory()) return null;
      identities.push({ path: current, dev: status.dev, ino: status.ino, mode: status.mode, nlink: status.nlink });
    } catch { return null; }
  }
  return identities;
}
function validEntry(record, cacheRoot) {
  if (record?.scope !== 'user' || !parseVersion(record.version) || typeof record.installPath !== 'string' || !isAbsolute(record.installPath)) return null;
  try {
    if (!contained(cacheRoot, record.installPath)) return null;
    const cacheStatus = lstatSync(cacheRoot); const installStatus = lstatSync(record.installPath);
    if (cacheStatus.isSymbolicLink() || !cacheStatus.isDirectory() || installStatus.isSymbolicLink() || !installStatus.isDirectory()) return null;
    const realCache = realpathSync(cacheRoot); const realInstall = realpathSync(record.installPath);
    if (realCache === realInstall || !contained(realCache, realInstall)) return null;
    const source = join(record.installPath, 'src'); const candidate = join(source, 'index.ts');
    const directories = captureDirectoryChain(claudeConfigDir, source);
    if (!directories) return null;
    const sourceStatus = lstatSync(source); const entryStatus = lstatSync(candidate);
    if (sourceStatus.isSymbolicLink() || !sourceStatus.isDirectory() || entryStatus.isSymbolicLink() || !entryStatus.isFile() || entryStatus.nlink !== 1) return null;
    const entry = realpathSync(candidate);
    return contained(realInstall, entry) ? {
      record, entry, directories,
      entryIdentity: {
        dev: entryStatus.dev, ino: entryStatus.ino, mode: entryStatus.mode, nlink: entryStatus.nlink,
        size: entryStatus.size, mtimeMs: entryStatus.mtimeMs,
        sha256: new Bun.CryptoHasher('sha256').update(readFileSync(entry)).digest('hex'),
      },
    } : null;
  } catch { return null; }
}
function revalidate(selected) {
  for (const expected of selected.directories) {
    const status = lstatSync(expected.path);
    if (status.isSymbolicLink() || !status.isDirectory() || status.dev !== expected.dev || status.ino !== expected.ino
      || status.mode !== expected.mode || status.nlink !== expected.nlink) throw new Error('HUD directory changed before execution');
  }
  const status = lstatSync(selected.entry);
  const expected = selected.entryIdentity;
  if (status.isSymbolicLink() || !status.isFile() || status.nlink !== 1 || status.dev !== expected.dev || status.ino !== expected.ino
    || status.mode !== expected.mode || status.nlink !== expected.nlink || status.size !== expected.size || status.mtimeMs !== expected.mtimeMs
    || realpathSync(selected.entry) !== selected.entry
    || new Bun.CryptoHasher('sha256').update(readFileSync(selected.entry)).digest('hex') !== expected.sha256) {
    throw new Error('HUD entry changed before execution');
  }
}
let selected;
try {
  const installedPath = join(claudeConfigDir, 'plugins', 'installed_plugins.json');
  const installedStatus = lstatSync(installedPath);
  if (installedStatus.isSymbolicLink() || !installedStatus.isFile()) throw new Error('installed plugin state is unsafe');
  const installed = JSON.parse(readFileSync(installedPath, 'utf8'));
  if (installed?.version !== 2 || !installed.plugins || typeof installed.plugins !== 'object' || Array.isArray(installed.plugins)) {
    throw new Error('unsupported installed plugin schema');
  }
  const records = Array.isArray(installed?.plugins?.[pluginId]) ? installed.plugins[pluginId] : [];
  const cacheRoot = join(claudeConfigDir, 'plugins', 'cache', 'claude-hud', 'claude-hud');
  selected = records.map(record => validEntry(record, cacheRoot)).filter(Boolean).sort((a, b) => compare(b.record.version, a.record.version))[0];
  if (!selected) throw new Error('no valid user HUD installation in the canonical cache');
  revalidate(selected);
} catch (error) {
  console.error('claude-hud: ' + (error instanceof Error ? error.message : 'no valid user HUD installation'));
  process.exit(1);
}
const child = Bun.spawn({
  cmd: [process.execPath, selected.entry],
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
  env: process.env,
});
process.exit(await child.exited);
`;
}

export async function configureHud(context, state) {
  const spec = PLUGIN_BASELINES.hud;
  let createdParent = null;
  const completedWrites = [];
  try {
    const installedPath = join(context.claudeConfigDir, 'plugins', 'installed_plugins.json');
    const installedSnapshot = hudFileSnapshot(context.claudeConfigDir, installedPath, 'installed plugin state', true);
    if (!installedSnapshot.present) throw new Error('hud: installed plugin state is missing');
    if (installedSnapshot.value.version !== 2 || !isPlainRecord(installedSnapshot.value.plugins)) {
      throw new Error('hud: unsupported installed plugin schema');
    }
    const selected = selectedHudInstall(installedSnapshot.value, context.claudeConfigDir);
    if (!selected || compareSemver(selected.record.version, spec.version) < 0) throw new Error('hud: no valid baseline user HUD installation');

    const configPath = join(context.claudeConfigDir, 'plugins', 'claude-hud', 'config.json');
    const settingsPath = join(context.claudeConfigDir, 'settings.json');
    const modulePath = join(context.clawgodDir, 'claude-hud-statusline.mjs');
    const statePath = join(context.clawgodDir, 'plugin-dependencies-state.json');
    const settingsSnapshot = hudFileSnapshot(context.claudeConfigDir, settingsPath, 'settings', true);
    const moduleSnapshot = hudFileSnapshot(context.clawgodDir, modulePath, 'status-line module');
    const stateSnapshot = hudFileSnapshot(context.clawgodDir, statePath, 'ownership state', true);
    const nextState = currentHudState(stateSnapshot.present ? stateSnapshot.value : state, stateSnapshot.present, context, modulePath);
    const configPlan = planHudConfigSnapshot(context.claudeConfigDir, configPath);
    const preparedConfig = createHudConfigParent(context.claudeConfigDir, configPlan);
    const configSnapshot = preparedConfig.snapshot;
    createdParent = preparedConfig.createdParent;
    const settings = settingsSnapshot.present ? settingsSnapshot.value : {};
    const priorConfig = nextState.hud.config;
    if (!priorConfig?.managedSha256 || !configSnapshot.present || fileFingerprint(configSnapshot.bytes) !== priorConfig.managedSha256) {
      nextState.hud.config = {
        originalPresent: configSnapshot.present,
        originalBase64: configSnapshot.present ? configSnapshot.bytes.toString('base64') : '',
        managedSha256: fileFingerprint(HUD_CONFIG_TEXT),
      };
    } else {
      nextState.hud.config.managedSha256 = fileFingerprint(HUD_CONFIG_TEXT);
    }

    const moduleText = renderHudStatusLineModule(context);
    const command = hudStatusLineCommand(context, modulePath);
    const managedValue = { type: 'command', command };
    const currentPresent = Object.hasOwn(settings, 'statusLine');
    const currentValue = settings.statusLine;
    const priorStatus = nextState.hud.statusLine;
    if (!priorStatus?.managedSha256 || !currentPresent || jsonFingerprint(currentValue) !== priorStatus.managedSha256) {
      nextState.hud.statusLine = {
        originalPresent: currentPresent,
        originalValue: currentPresent ? structuredClone(currentValue) : null,
        managedValue,
        managedSha256: jsonFingerprint(managedValue),
      };
    } else {
      nextState.hud.statusLine.managedValue = managedValue;
      nextState.hud.statusLine.managedSha256 = jsonFingerprint(managedValue);
    }
    const nextSettings = { ...settings, statusLine: managedValue };
    const stateText = JSON.stringify(nextState, null, 2) + '\n';

    const writes = [
      { root: context.clawgodDir, snapshot: stateSnapshot, bytes: Buffer.from(stateText), mode: stateSnapshot.present ? stateSnapshot.mode : 0o600, label: 'ownership state' },
      { root: context.clawgodDir, snapshot: moduleSnapshot, bytes: Buffer.from(moduleText), mode: moduleSnapshot.present ? moduleSnapshot.mode : 0o700, label: 'status-line module' },
      { root: context.claudeConfigDir, snapshot: configSnapshot, bytes: Buffer.from(HUD_CONFIG_TEXT), mode: configSnapshot.present ? configSnapshot.mode : 0o600, label: 'HUD config' },
      { root: context.claudeConfigDir, snapshot: settingsSnapshot, bytes: Buffer.from(JSON.stringify(nextSettings, null, 2) + '\n'), mode: settingsSnapshot.present ? settingsSnapshot.mode : 0o600, label: 'settings' },
    ];
    for (const write of writes) {
      context.onHudWriting?.({ label: write.label });
      atomicHudWrite(write.root, write.snapshot, write.bytes, write.mode, write.label);
      completedWrites.push({ ...write, postWrite: hudFileSnapshot(write.root, write.snapshot.path, write.label) });
      context.onHudWritten?.({ label: write.label });
    }
    if (state && typeof state === 'object') {
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, structuredClone(nextState));
    }
    return pluginResult(spec, 'configured', true, selected.record.version, `configured ${selected.record.version}`);
  } catch (error) {
    const rollbackErrors = [];
    for (const write of completedWrites.reverse()) {
      try { rollbackHudWrite(write); }
      catch (rollbackError) { rollbackErrors.push(rollbackError); break; }
    }
    if (rollbackErrors.length === 0) {
      try { removeCreatedHudConfigParent(createdParent); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (rollbackErrors.length > 0) return pluginResult(spec, 'warning', false, null, `hud: rollback incomplete: ${rollbackErrors[0].message}`);
    return pluginResult(spec, 'warning', false, null, error.message);
  }
}

export async function restoreHud(context, state) {
  const completedWrites = [];
  try {
    const statePath = join(context.clawgodDir, 'plugin-dependencies-state.json');
    const modulePath = join(context.clawgodDir, 'claude-hud-statusline.mjs');
    const configPath = join(context.claudeConfigDir, 'plugins', 'claude-hud', 'config.json');
    const settingsPath = join(context.claudeConfigDir, 'settings.json');
    const stateSnapshot = hudFileSnapshot(context.clawgodDir, statePath, 'ownership state', true);
    if (!stateSnapshot.present) return { restored: [], conflicts: [], failures: [] };
    const ownershipState = currentHudState(stateSnapshot.value, true, context, modulePath);
    if (Object.keys(ownershipState.hud).length === 0) return { restored: [], conflicts: [], failures: [] };
    const ownership = ownershipState.hud;
    const configSnapshot = hudFileSnapshot(context.claudeConfigDir, configPath, 'HUD config');
    const settingsSnapshot = hudFileSnapshot(context.claudeConfigDir, settingsPath, 'settings', true);
    const restored = [];
    const conflicts = [];
    const ownsConfig = configSnapshot.present && fileFingerprint(configSnapshot.bytes) === ownership.config.managedSha256;
    if (!ownsConfig) conflicts.push('hud config');
    const settings = settingsSnapshot.present ? settingsSnapshot.value : {};
    const ownsStatusLine = Object.hasOwn(settings, 'statusLine')
      && jsonFingerprint(settings.statusLine) === ownership.statusLine.managedSha256;
    if (!ownsStatusLine) conflicts.push('statusLine');
    if (!ownsConfig && !ownsStatusLine) return { restored, conflicts, failures: [] };

    const operations = [];
    if (ownsStatusLine) {
      const nextSettings = { ...settings };
      if (ownership.statusLine.originalPresent) nextSettings.statusLine = structuredClone(ownership.statusLine.originalValue);
      else delete nextSettings.statusLine;
      operations.push({
        root: context.claudeConfigDir,
        snapshot: settingsSnapshot,
        bytes: Buffer.from(JSON.stringify(nextSettings, null, 2) + '\n'),
        mode: settingsSnapshot.mode || 0o600,
        remove: !ownership.statusLine.originalPresent && Object.keys(nextSettings).length === 0,
        label: 'settings',
        restoredLabel: 'statusLine',
      });
    }
    if (ownsConfig) {
      operations.push({
        root: context.claudeConfigDir,
        snapshot: configSnapshot,
        bytes: Buffer.from(ownership.config.originalBase64, 'base64'),
        mode: configSnapshot.mode,
        remove: !ownership.config.originalPresent,
        label: 'HUD config',
        restoredLabel: 'hud config',
      });
    }
    operations.push({
      root: context.clawgodDir,
      snapshot: stateSnapshot,
      bytes: stateSnapshot.bytes,
      mode: stateSnapshot.mode,
      remove: false,
      label: 'ownership state',
      restoredLabel: null,
    });

    for (const operation of operations) {
      context.onHudRestoring?.({ label: operation.label });
      if (operation.remove) atomicHudRemove(operation.root, operation.snapshot, operation.label);
      else atomicHudWrite(operation.root, operation.snapshot, operation.bytes, operation.mode, operation.label);
      completedWrites.push({
        ...operation,
        postWrite: hudFileSnapshot(operation.root, operation.snapshot.path, operation.label),
      });
      if (operation.restoredLabel) restored.push(operation.restoredLabel);
      context.onHudRestored?.({ label: operation.label });
    }
    return { restored, conflicts, failures: [] };
  } catch (error) {
    const rollbackErrors = [];
    for (const write of completedWrites.reverse()) {
      try { rollbackHudWrite(write); }
      catch (rollbackError) { rollbackErrors.push(rollbackError); break; }
    }
    const message = rollbackErrors.length > 0
      ? `hud: rollback incomplete: ${rollbackErrors[0].message}`
      : (error instanceof Error ? error.message : 'hud: restore failed');
    return { restored: [], conflicts: [], failures: [message] };
  }
}

async function restoreClaudeMemIntegrations(context) {
  const completedWrites = [];
  try {
    const statePath = join(context.clawgodDir, 'plugin-dependencies-state.json');
    const stateSnapshot = hudFileSnapshot(context.clawgodDir, statePath, 'ownership state', true);
    if (!stateSnapshot.present) return { restored: [], conflicts: [], failures: [] };
    const modulePath = join(context.clawgodDir, 'claude-hud-statusline.mjs');
    const ownershipState = currentHudState(stateSnapshot.value, true, context, modulePath);
    const entries = Object.entries(ownershipState.claudeMem.files);
    if (entries.length === 0) return { restored: [], conflicts: [], failures: [] };
    const nextState = structuredClone(ownershipState);
    const cacheRoot = resolve(context.claudeConfigDir, 'plugins', 'cache', 'thedotmack', 'claude-mem');
    const restored = [];
    const conflicts = [];
    const operations = [];
    for (const [targetPath, record] of entries) {
      const expected = record.relativePath === 'hooks/hooks.json'
        ? resolve(cacheRoot, record.pluginVersion, 'hooks', 'hooks.json')
        : resolve(cacheRoot, record.pluginVersion, '.mcp.json');
      if (targetPath !== expected || !pathIsContained(cacheRoot, targetPath)) {
        throw new Error('claude-mem: ownership target escaped the canonical cache');
      }
      let status;
      try { status = lstatSync(targetPath); }
      catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        conflicts.push(targetPath);
        delete nextState.claudeMem.files[targetPath];
        continue;
      }
      if (status.isSymbolicLink() || !status.isFile() || !hudDirectoryChainIsSafe(context.claudeConfigDir, dirname(targetPath))) {
        conflicts.push(targetPath);
        delete nextState.claudeMem.files[targetPath];
        continue;
      }
      let snapshot;
      try { snapshot = hudFileSnapshot(context.claudeConfigDir, targetPath, record.relativePath); }
      catch {
        conflicts.push(targetPath);
        delete nextState.claudeMem.files[targetPath];
        continue;
      }
      if (fileFingerprint(snapshot.bytes) !== record.managedSha256) {
        conflicts.push(targetPath);
        delete nextState.claudeMem.files[targetPath];
        continue;
      }
      operations.push({
        root: context.claudeConfigDir,
        snapshot,
        bytes: Buffer.from(record.originalBase64, 'base64'),
        mode: snapshot.mode,
        label: `claude-mem ${record.relativePath}`,
        restoredLabel: targetPath,
      });
      delete nextState.claudeMem.files[targetPath];
    }
    for (const operation of operations) {
      atomicHudWrite(operation.root, operation.snapshot, operation.bytes, operation.mode, operation.label);
      completedWrites.push({ ...operation, postWrite: hudFileSnapshot(operation.root, operation.snapshot.path, operation.label) });
      restored.push(operation.restoredLabel);
    }
    const stateBytes = Buffer.from(JSON.stringify(nextState, null, 2) + '\n');
    if (!Buffer.from(stateSnapshot.bytes).equals(stateBytes)) {
      const stateWrite = {
        root: context.clawgodDir,
        snapshot: stateSnapshot,
        bytes: stateBytes,
        mode: stateSnapshot.mode,
        label: 'ownership state',
      };
      atomicHudWrite(stateWrite.root, stateWrite.snapshot, stateWrite.bytes, stateWrite.mode, stateWrite.label);
      completedWrites.push({ ...stateWrite, postWrite: hudFileSnapshot(stateWrite.root, stateWrite.snapshot.path, stateWrite.label) });
    }
    return { restored, conflicts, failures: [] };
  } catch (error) {
    const rollbackErrors = [];
    for (const write of completedWrites.reverse()) {
      try { rollbackHudWrite(write); }
      catch (rollbackError) { rollbackErrors.push(rollbackError); break; }
    }
    const message = rollbackErrors.length > 0
      ? `claude-mem: rollback incomplete: ${rollbackErrors[0].message}`
      : (error instanceof Error ? error.message : 'claude-mem: restore failed');
    return { restored: [], conflicts: [], failures: [message] };
  }
}

export async function restoreManagedIntegrations(context) {
  const hud = await restoreHud(context);
  if (hud.failures.length > 0) return { restored: [], conflicts: hud.failures.map(message => `hud: ${message}`) };
  const memory = await restoreClaudeMemIntegrations(context);
  return {
    restored: [...hud.restored, ...memory.restored],
    conflicts: [...hud.conflicts, ...memory.conflicts, ...memory.failures],
  };
}

export function sha256(bytes) {
  return new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
}

export function validateArchive(bytes, spec) {
  if (!(bytes instanceof Uint8Array)) throw new Error(`${spec.key}: archive bytes are invalid`);
  if (bytes.byteLength !== spec.bytes) throw new Error(`${spec.key}: archive size mismatch`);
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error(`${spec.key}: archive exceeds safety limit`);
  if (sha256(bytes) !== spec.sha256) throw new Error(`${spec.key}: archive SHA-256 mismatch`);
}

function decodeTarText(bytes, label, spec) {
  const nul = bytes.indexOf(0);
  const value = nul === -1 ? bytes : bytes.subarray(0, nul);
  try {
    return textDecoder.decode(value);
  } catch {
    throw new Error(`${spec.key}: malformed ${label} metadata`);
  }
}

function parseTarNumber(bytes, label, spec) {
  if (bytes.some(byte => byte > 0x7f)) throw new Error(`${spec.key}: malformed tar ${label}`);
  const field = String.fromCharCode(...bytes);
  const nul = field.indexOf('\0');
  let value;
  if (nul === -1) {
    if (!/^ *[0-7]+ *$/.test(field)) throw new Error(`${spec.key}: malformed tar ${label}`);
    value = field.trim();
  } else {
    if (!/^ *[0-7]+ *\0 *$/.test(field)) throw new Error(`${spec.key}: malformed tar ${label}`);
    value = field.slice(0, nul).trim();
  }
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${spec.key}: malformed tar ${label}`);
  return parsed;
}

function verifyTarChecksum(header, spec) {
  const expected = parseTarNumber(header.subarray(148, 156), 'checksum', spec);
  let actual = 0;
  for (let index = 0; index < header.length; index++) {
    actual += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  if (actual !== expected) throw new Error(`${spec.key}: tar header checksum mismatch`);
}

function parsePax(bytes, spec) {
  const values = {};
  let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(0x20, offset);
    if (space <= offset) throw new Error(`${spec.key}: malformed PAX metadata`);
    let lengthText;
    try {
      lengthText = textDecoder.decode(bytes.subarray(offset, space));
    } catch {
      throw new Error(`${spec.key}: malformed PAX metadata`);
    }
    if (!/^[1-9]\d*$/.test(lengthText)) throw new Error(`${spec.key}: malformed PAX metadata`);
    const length = Number(lengthText);
    const end = offset + length;
    if (!Number.isSafeInteger(length) || end > bytes.length || bytes[end - 1] !== 0x0a) {
      throw new Error(`${spec.key}: malformed PAX metadata`);
    }
    const bodyStart = space + 1;
    const bodyEnd = end - 1;
    const equals = bytes.indexOf(0x3d, bodyStart);
    if (equals <= bodyStart || equals >= bodyEnd) throw new Error(`${spec.key}: malformed PAX metadata`);
    let key;
    let value;
    try {
      key = textDecoder.decode(bytes.subarray(bodyStart, equals));
      value = textDecoder.decode(bytes.subarray(equals + 1, bodyEnd));
    } catch {
      throw new Error(`${spec.key}: malformed PAX metadata`);
    }
    if (Object.hasOwn(values, key)) throw new Error(`${spec.key}: malformed PAX metadata`);
    values[key] = value;
    offset = end;
  }
  return values;
}

function paxSize(value, fallback, spec) {
  if (value === undefined) return fallback;
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error(`${spec.key}: malformed PAX metadata`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${spec.key}: malformed PAX metadata`);
  return parsed;
}

function normalizeArchivePath(value, spec) {
  if (typeof value !== 'string' || value.includes('\0')) throw new Error(`${spec.key}: unsafe archive path`);
  const portable = value.replace(/\\/g, '/');
  if (!portable || portable.startsWith('/') || /^[A-Za-z]:/.test(portable)) {
    throw new Error(`${spec.key}: unsafe archive path`);
  }
  const parts = portable.split('/');
  if (parts.includes('..')) throw new Error(`${spec.key}: unsafe archive path`);
  const normalized = parts.filter(part => part && part !== '.').join('/');
  if (!normalized) throw new Error(`${spec.key}: unsafe archive path`);
  return normalized;
}

async function gunzipBounded(bytes, spec) {
  const chunks = [];
  let total = 0;
  let reader;
  try {
    reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += chunk.byteLength;
      if (total > MAX_EXPANDED_BYTES) {
        try { await reader.cancel(); } catch {}
        throw new Error(`${spec.key}: decompressed archive exceeds safety limit`);
      }
      chunks.push(chunk);
    }
  } catch (error) {
    if (error?.message === `${spec.key}: decompressed archive exceeds safety limit`) throw error;
    throw new Error(`${spec.key}: archive gzip is invalid`);
  }
  const tar = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    tar.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return tar;
}

async function parseTar(bytes, spec) {
  const tar = await gunzipBounded(bytes, spec);
  const entries = [];
  const seenPaths = new Set();
  const roots = new Set();
  let entryCount = 0;
  let expandedBytes = 0;
  let offset = 0;
  let globalPax = {};
  let localPax = null;
  let longName = null;
  let terminated = false;

  while (offset + TAR_BLOCK_BYTES <= tar.byteLength) {
    const header = tar.subarray(offset, offset + TAR_BLOCK_BYTES);
    if (header.every(byte => byte === 0)) {
      const terminatorEnd = offset + 2 * TAR_BLOCK_BYTES;
      if (terminatorEnd > tar.byteLength
        || !tar.subarray(offset + TAR_BLOCK_BYTES, terminatorEnd).every(byte => byte === 0)
        || tar.byteLength % TAR_BLOCK_BYTES !== 0
        || tar.subarray(terminatorEnd).some(byte => byte !== 0)) {
        throw new Error(`${spec.key}: malformed tar terminator or padding`);
      }
      terminated = true;
      break;
    }
    verifyTarChecksum(header, spec);
    offset += TAR_BLOCK_BYTES;
    entryCount += 1;
    if (entryCount > MAX_ENTRIES) throw new Error(`${spec.key}: archive has too many entries`);

    const typeByte = header[156];
    const type = typeByte === 0 ? '0' : String.fromCharCode(typeByte);
    if (!['0', '5', 'x', 'g', 'L'].includes(type)) {
      throw new Error(`${spec.key}: unsupported tar link or device entry`);
    }
    const metadata = type === 'x' || type === 'g' || type === 'L';
    if (metadata && (localPax !== null || longName !== null)) {
      throw new Error(`${spec.key}: malformed archive metadata`);
    }
    const headerSize = parseTarNumber(header.subarray(124, 136), 'size', spec);
    const mode = parseTarNumber(header.subarray(100, 108), 'mode', spec);
    const effectivePax = { ...globalPax, ...(localPax || {}) };
    const size = metadata ? headerSize : paxSize(effectivePax.size, headerSize, spec);
    if (size > MAX_ENTRY_BYTES) throw new Error(`${spec.key}: archive entry exceeds safety limit`);
    expandedBytes += size;
    if (!Number.isSafeInteger(expandedBytes) || expandedBytes > MAX_EXPANDED_BYTES) {
      throw new Error(`${spec.key}: archive expanded data exceeds safety limit`);
    }
    const dataEnd = offset + size;
    const paddedEnd = offset + Math.ceil(size / TAR_BLOCK_BYTES) * TAR_BLOCK_BYTES;
    if (dataEnd > tar.byteLength || paddedEnd > tar.byteLength) throw new Error(`${spec.key}: truncated tar entry`);
    const data = tar.subarray(offset, dataEnd);
    offset = paddedEnd;

    if (type === 'x' || type === 'g') {
      const pax = parsePax(data, spec);
      if (type === 'g') globalPax = { ...globalPax, ...pax };
      else localPax = pax;
      continue;
    }
    if (type === 'L') {
      if (data.length === 0 || data[data.length - 1] !== 0 || data.subarray(0, -1).includes(0)) {
        throw new Error(`${spec.key}: malformed GNU long-name metadata`);
      }
      longName = decodeTarText(data.subarray(0, -1), 'GNU long-name', spec);
      continue;
    }

    const rawName = decodeTarText(header.subarray(0, 100), 'tar path', spec);
    const prefix = decodeTarText(header.subarray(345, 500), 'tar prefix', spec);
    const headerName = prefix ? `${prefix}/${rawName}` : rawName;
    const paxPath = effectivePax.path;
    if (longName !== null && paxPath !== undefined) throw new Error(`${spec.key}: malformed archive path metadata`);
    const path = normalizeArchivePath(longName ?? paxPath ?? headerName, spec);
    longName = null;
    localPax = null;
    if (seenPaths.has(path)) throw new Error(`${spec.key}: duplicate archive path`);
    seenPaths.add(path);
    roots.add(path.split('/')[0]);
    entries.push({ path, type, data, executable: (mode & 0o111) !== 0 });
  }

  if (!terminated) throw new Error(`${spec.key}: malformed tar terminator`);
  if (localPax !== null || longName !== null) throw new Error(`${spec.key}: malformed archive metadata`);
  if (roots.size !== 1) throw new Error(`${spec.key}: archive must contain a single top-level repository directory`);
  return { entries, root: roots.values().next().value };
}

function ensureDirectory(root, relativePath, spec) {
  let current = root;
  for (const part of relativePath.split('/').filter(Boolean)) {
    current = join(current, part);
    if (existsSync(current)) {
      const status = lstatSync(current);
      if (status.isSymbolicLink() || !status.isDirectory()) {
        throw new Error(`${spec.key}: unsafe extraction parent`);
      }
    } else {
      mkdirSync(current);
    }
  }
  return current;
}

function safeDirectoryStatus(path, spec) {
  let status;
  try {
    status = lstatSync(path);
  } catch {
    throw new Error(`${spec.key}: unsafe managed directory`);
  }
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(`${spec.key}: unsafe managed directory`);
  }
  return status;
}

function ensureDestinationDirectory(destination, spec) {
  const ancestors = [];
  let current = destination;
  while (true) {
    ancestors.unshift(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  for (const path of ancestors) {
    let status;
    try {
      status = lstatSync(path);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw new Error(`${spec.key}: unsafe extraction destination`);
      try {
        mkdirSync(path, 0o700);
        status = lstatSync(path);
      } catch {
        throw new Error(`${spec.key}: unsafe extraction destination`);
      }
    }
    if (status.isSymbolicLink() || !status.isDirectory()) {
      throw new Error(`${spec.key}: unsafe extraction destination`);
    }
  }
  return destination;
}

function ensureTrustedDirectory(root, parts, spec) {
  safeDirectoryStatus(root, spec);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    if (existsSync(current)) safeDirectoryStatus(current, spec);
    else {
      mkdirSync(current, 0o700);
      safeDirectoryStatus(current, spec);
    }
  }
  return current;
}

function managedDirectoryFailure(spec, message, cause, evidencePaths = []) {
  const failure = new Error(`${spec.key}: ${message}`);
  failure.restorationIncomplete = true;
  failure.cause = cause;
  failure.evidencePaths = evidencePaths;
  failure.evidencePath = evidencePaths.at(-1);
  return failure;
}

function createTrackedDirectory(target, spec, context, label) {
  const parent = dirname(target);
  const parentTrust = captureDirectoryTrust(parent, spec);
  const parentIdentity = directoryIdentity(parent, spec);
  try {
    assertDirectoryTrust(parentTrust, spec, label);
    assertDirectoryIdentity(parent, parentIdentity, spec, label);
    context.onManagedDirectoryPublishing?.({ path: target, label });
    mkdirSync(target, 0o700);
    const identity = directoryIdentity(target, spec);
    const trust = captureDirectoryTrust(target, spec);
    assertDirectoryTrust(parentTrust, spec, label);
    assertDirectoryIdentity(parent, parentIdentity, spec, label);
    assertDirectoryTrust(trust, spec, label);
    assertDirectoryIdentity(target, identity, spec, label);
    context.onManagedDirectoryInstalled?.({ path: target, identity, label });
    assertDirectoryTrust(parentTrust, spec, label);
    assertDirectoryIdentity(parent, parentIdentity, spec, label);
    assertDirectoryTrust(trust, spec, label);
    assertDirectoryIdentity(target, identity, spec, label);
    return { path: target, identity, parentTrust, trust };
  } catch (error) {
    if (error?.restorationIncomplete) throw error;
    const evidencePaths = [];
    let evidenceCause = null;
    try { lstatSync(target); evidencePaths.push(target); } catch (evidenceError) {
      if (evidenceError?.code !== 'ENOENT') evidenceCause = evidenceError;
    }
    const failure = managedDirectoryFailure(spec, `${label} creation restoration incomplete`, error, evidencePaths);
    if (evidenceCause) failure.evidenceCause = evidenceCause;
    throw failure;
  }
}

function trackedDirectoryGuard(path, createdParents, spec, label) {
  const created = createdParents.find(entry => entry.path === path);
  const identity = created?.identity || directoryIdentity(path, spec);
  const trust = created?.trust || captureDirectoryTrust(path, spec);
  try {
    assertDirectoryTrust(trust, spec, label);
    assertDirectoryIdentity(path, identity, spec, label);
  } catch (error) {
    if (created) {
      throw managedDirectoryFailure(spec, `${label} creation identity changed`, error, [path].filter(candidate => existsSync(candidate)));
    }
    throw error;
  }
  return { identity, trust };
}

function ensureTrackedDirectory(root, parts, spec, context, label) {
  safeDirectoryStatus(root, spec);
  let current = root;
  const createdParents = [];
  try {
    for (const part of parts) {
      const target = join(current, part);
      if (existsSync(target)) safeDirectoryStatus(target, spec);
      else createdParents.push(createTrackedDirectory(target, spec, context, label));
      current = target;
    }
    for (const created of createdParents) trackedDirectoryGuard(created.path, [created], spec, label);
    return { path: current, createdParents };
  } catch (error) {
    try {
      cleanupCreatedParents(createdParents, spec);
    } catch (cleanupError) {
      if (!error?.restorationIncomplete) {
        throw managedDirectoryFailure(spec, `${label} creation restoration incomplete`, cleanupError, createdParents.map(entry => entry.path));
      }
      error.cleanupCause = cleanupError;
    }
    throw error;
  }
}

function validateFilenameComponent(value, label) {
  if (typeof value !== 'string' || value.length > 128
    || value === '.' || value === '..'
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw new Error(`plugin: invalid ${label} filename component`);
  }
}

function validateSpecFilenameComponents(spec) {
  validateFilenameComponent(spec?.key, 'key');
  validateFilenameComponent(spec?.version, 'version');
}

function directoryIdentity(path, spec) {
  const status = safeDirectoryStatus(path, spec);
  return { dev: status.dev, ino: status.ino };
}

function assertTrustedDirectoryIdentity(root, parts, expected, spec) {
  const path = ensureTrustedDirectory(root, parts, spec);
  const actual = directoryIdentity(path, spec);
  if (actual.dev !== expected.dev || actual.ino !== expected.ino) {
    throw new Error(`${spec.key}: cache directory changed`);
  }
  return path;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeMs === right.mtimeMs;
}

function readSingleLinkFile(path) {
  let pathBefore;
  try {
    pathBefore = lstatSync(path);
  } catch {
    return null;
  }
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink() || pathBefore.nlink !== 1) return null;
  let descriptor;
  try {
    descriptor = openSync(path, 'r');
    const descriptorBefore = fstatSync(descriptor);
    if (!descriptorBefore.isFile() || descriptorBefore.nlink !== 1 || !sameFileIdentity(pathBefore, descriptorBefore)) return null;
    const bytes = new Uint8Array(readFileSync(descriptor));
    const descriptorAfter = fstatSync(descriptor);
    const pathAfter = lstatSync(path);
    if (descriptorAfter.nlink !== 1 || pathAfter.nlink !== 1
      || !sameFileIdentity(descriptorBefore, descriptorAfter)
      || !sameFileIdentity(descriptorAfter, pathAfter)) return null;
    return { bytes, identity: pathAfter };
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writeExclusive(path, bytes, executable, spec) {
  let descriptor;
  try {
    descriptor = openSync(path, 'wx', executable ? 0o700 : 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset);
  } catch {
    throw new Error(`${spec.key}: archive file could not be created safely`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readJson(path, spec) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`${spec.key}: plugin metadata is invalid`);
  }
}

function containedRelativeSource(sourceRoot, source, spec) {
  if (typeof source !== 'string' || source.includes('\0')) throw new Error(`${spec.key}: plugin source is invalid`);
  const portable = source.replace(/\\/g, '/');
  if (portable.startsWith('/') || /^[A-Za-z]:/.test(portable)) throw new Error(`${spec.key}: plugin source is invalid`);
  const parts = portable.split('/');
  if (parts.includes('..')) throw new Error(`${spec.key}: plugin source is invalid`);
  const normalized = parts.filter(part => part && part !== '.').join('/');
  if (spec.key === 'memory' && normalized !== 'plugin') throw new Error(`${spec.key}: declared plugin source must be plugin/`);
  if (spec.key === 'superpowers' && source !== './') throw new Error(`${spec.key}: declared plugin source must be ./`);
  const pluginRoot = normalized ? join(sourceRoot, ...normalized.split('/')) : sourceRoot;
  let status;
  try {
    status = lstatSync(pluginRoot);
  } catch {
    throw new Error(`${spec.key}: plugin source is missing`);
  }
  if (status.isSymbolicLink() || !status.isDirectory()) throw new Error(`${spec.key}: plugin source is invalid`);
  return pluginRoot;
}

export async function extractPluginArchive(bytes, spec, destination) {
  validateSpecFilenameComponents(spec);
  validateArchive(bytes, spec);
  const archive = await parseTar(bytes, spec);
  ensureDestinationDirectory(destination, spec);
  const destinationStatus = lstatSync(destination);
  if (destinationStatus.isSymbolicLink() || !destinationStatus.isDirectory()) {
    throw new Error(`${spec.key}: unsafe extraction destination`);
  }
  const stagingRoot = mkdtempSync(join(destination, `.${spec.key}-${spec.version}-`));
  try {
    for (const entry of archive.entries) {
      const parent = ensureDirectory(stagingRoot, dirname(entry.path).replace(/\\/g, '/'), spec);
      const target = join(parent, entry.path.split('/').at(-1));
      if (entry.type === '5') ensureDirectory(stagingRoot, entry.path, spec);
      else writeExclusive(target, entry.data, entry.executable, spec);
    }
    const sourceRoot = join(stagingRoot, archive.root);
    const manifest = readJson(join(sourceRoot, '.claude-plugin', 'marketplace.json'), spec);
    const expectedArchiveMarketplace = spec.archiveMarketplace || spec.marketplace;
    if (manifest.name !== expectedArchiveMarketplace) throw new Error(`${spec.key}: marketplace name mismatch`);
    const entry = manifest.plugins?.find(plugin => plugin.name === spec.plugin);
    if (!entry) throw new Error(`${spec.key}: plugin entry is missing`);
    const pluginRoot = containedRelativeSource(sourceRoot, entry.source, spec);
    const pluginManifest = readJson(join(pluginRoot, '.claude-plugin', 'plugin.json'), spec);
    if (pluginManifest.name !== spec.plugin || pluginManifest.version !== spec.version) {
      throw new Error(`${spec.key}: plugin manifest mismatch`);
    }
    return sourceRoot;
  } catch (error) {
    rmSync(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function downloadAndStage(spec, context) {
  validateSpecFilenameComponents(spec);
  const cacheDirectory = ensureTrustedDirectory(context.clawgodDir, ['cache', 'claude-plugins'], spec);
  const cacheDirectoryIdentity = directoryIdentity(cacheDirectory, spec);
  const archivePath = join(cacheDirectory, `${spec.key}-${spec.version}.tar.gz`);
  const stagingDirectory = ensureTrustedDirectory(context.clawgodDir, ['staging', 'claude-plugins'], spec);
  let archiveBytes = null;
  let cacheIdentity = null;
  assertTrustedDirectoryIdentity(context.clawgodDir, ['cache', 'claude-plugins'], cacheDirectoryIdentity, spec);
  const cachedFile = readSingleLinkFile(archivePath);
  assertTrustedDirectoryIdentity(context.clawgodDir, ['cache', 'claude-plugins'], cacheDirectoryIdentity, spec);
  if (cachedFile) {
    try {
      archiveBytes = cachedFile.bytes;
      validateArchive(archiveBytes, spec);
      cacheIdentity = cachedFile.identity;
    } catch {
      archiveBytes = null;
      cacheIdentity = null;
    }
  }
  let cached = archiveBytes !== null;
  if (!cached) {
    const temporaryDirectory = mkdtempSync(join(cacheDirectory, `.${spec.key}-${spec.version}-`));
    const temporaryArchive = join(temporaryDirectory, 'download.tar.gz');
    try {
      let result;
      try {
        result = Bun.spawnSync({
          cmd: [context.bunPath, context.fetchFilePath, spec.url, temporaryArchive],
          env: context.env,
          stdout: 'pipe',
          stderr: 'pipe',
        });
      } catch {
        throw new Error(`${spec.key}: download failed`);
      }
      if (result.exitCode !== 0) throw new Error(`${spec.key}: download failed`);
      assertTrustedDirectoryIdentity(context.clawgodDir, ['cache', 'claude-plugins'], cacheDirectoryIdentity, spec);
      const temporaryFile = readSingleLinkFile(temporaryArchive);
      if (!temporaryFile) throw new Error(`${spec.key}: download failed`);
      archiveBytes = temporaryFile.bytes;
      validateArchive(archiveBytes, spec);
      assertTrustedDirectoryIdentity(context.clawgodDir, ['cache', 'claude-plugins'], cacheDirectoryIdentity, spec);
      renameSync(temporaryArchive, archivePath);
      assertTrustedDirectoryIdentity(context.clawgodDir, ['cache', 'claude-plugins'], cacheDirectoryIdentity, spec);
      const installedFile = readSingleLinkFile(archivePath);
      if (!installedFile) throw new Error(`${spec.key}: cache replacement is unsafe`);
      validateArchive(installedFile.bytes, spec);
      archiveBytes = installedFile.bytes;
      cacheIdentity = installedFile.identity;
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
  const sourceRoot = await extractPluginArchive(archiveBytes, spec, stagingDirectory);
  assertTrustedDirectoryIdentity(context.clawgodDir, ['cache', 'claude-plugins'], cacheDirectoryIdentity, spec);
  const finalCacheFile = readSingleLinkFile(archivePath);
  assertTrustedDirectoryIdentity(context.clawgodDir, ['cache', 'claude-plugins'], cacheDirectoryIdentity, spec);
  if (!finalCacheFile || !sameFileIdentity(cacheIdentity, finalCacheFile.identity)) {
    throw new Error(`${spec.key}: cache changed during use`);
  }
  validateArchive(finalCacheFile.bytes, spec);
  return { sourceRoot, archivePath, cached };
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseSemver(value) {
  if (typeof value !== 'string') return null;
  const match = SEMVER.exec(value);
  if (!match) return null;
  const [major, minor, patch, prereleaseText] = match.slice(1);
  const prerelease = prereleaseText ? prereleaseText.split('.').map(identifier => {
    if (!/^\d+$/.test(identifier)) return identifier;
    if (!/^(0|[1-9]\d*)$/.test(identifier)) return null;
    const numeric = Number(identifier);
    return Number.isSafeInteger(numeric) ? numeric : null;
  }) : [];
  if (prerelease.includes(null)) return null;
  const core = [major, minor, patch].map(Number);
  if (!core.every(Number.isSafeInteger)) return null;
  return { major: core[0], minor: core[1], patch: core[2], prerelease };
}

export function compareSemver(left, right) {
  const leftVersion = parseSemver(left);
  const rightVersion = parseSemver(right);
  if (!leftVersion || !rightVersion) return null;
  for (const key of ['major', 'minor', 'patch']) {
    if (leftVersion[key] !== rightVersion[key]) return leftVersion[key] < rightVersion[key] ? -1 : 1;
  }
  if (leftVersion.prerelease.length === 0 || rightVersion.prerelease.length === 0) {
    if (leftVersion.prerelease.length === rightVersion.prerelease.length) return 0;
    return leftVersion.prerelease.length === 0 ? 1 : -1;
  }
  const length = Math.min(leftVersion.prerelease.length, rightVersion.prerelease.length);
  for (let index = 0; index < length; index++) {
    const leftIdentifier = leftVersion.prerelease[index];
    const rightIdentifier = rightVersion.prerelease[index];
    if (leftIdentifier === rightIdentifier) continue;
    if (typeof leftIdentifier === 'number' && typeof rightIdentifier === 'number') return leftIdentifier < rightIdentifier ? -1 : 1;
    if (typeof leftIdentifier === 'number') return -1;
    if (typeof rightIdentifier === 'number') return 1;
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }
  if (leftVersion.prerelease.length === rightVersion.prerelease.length) return 0;
  return leftVersion.prerelease.length < rightVersion.prerelease.length ? -1 : 1;
}

export function selectInstalledRecord(installed, id) {
  const records = Array.isArray(installed?.plugins?.[id]) ? installed.plugins[id] : [];
  let selected = null;
  for (const record of records) {
    if (record?.scope !== 'user' || !parseSemver(record.version)) continue;
    if (!selected || compareSemver(record.version, selected.version) > 0) selected = record;
  }
  return selected;
}

export function classifyPlugin(installed, spec) {
  const records = Array.isArray(installed?.plugins?.[spec.id]) ? installed.plugins[spec.id] : [];
  const userRecords = records.filter(record => record?.scope === 'user');
  if (userRecords.length === 0) return 'missing';
  const selected = selectInstalledRecord(installed, spec.id);
  if (!selected || !parseSemver(selected.version)) return 'invalid';
  const comparison = compareSemver(selected.version, spec.version);
  if (comparison === null) return 'invalid';
  return comparison < 0 ? 'older' : 'satisfied';
}

function snapshotFile(path, spec) {
  const parentTrust = captureDirectoryTrust(dirname(path), spec);
  let status;
  try {
    status = lstatSync(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return { present: false, parentTrust };
    throw new Error(`${spec.key}: plugin state could not be read`);
  }
  if (!status.isFile() || status.isSymbolicLink() || status.nlink !== 1) {
    throw new Error(`${spec.key}: plugin state file is unsafe`);
  }
  const file = readSingleLinkFile(path);
  if (!file) throw new Error(`${spec.key}: plugin state file changed while reading`);
  return { present: true, bytes: file.bytes, mode: status.mode & 0o777, parentTrust };
}

function parseStateSnapshot(snapshot, fallback, spec, label) {
  if (!snapshot.present) return fallback;
  try {
    const value = JSON.parse(textDecoder.decode(snapshot.bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    return value;
  } catch {
    throw new Error(`${spec.key}: ${label} is malformed`);
  }
}

function assertDirectoryIdentity(path, expected, spec, label) {
  const actual = directoryIdentity(path, spec);
  if (actual.dev !== expected.dev || actual.ino !== expected.ino) {
    throw new Error(`${spec.key}: ${label} directory changed`);
  }
}

function captureDirectoryTrust(path, spec) {
  const requested = resolve(path);
  const suffix = [];
  let existing = requested;
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) throw new Error(`${spec.key}: unsafe managed directory`);
    suffix.unshift(basename(existing));
    existing = parent;
  }
  const paths = [];
  let current = existing;
  while (true) {
    paths.unshift(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const chain = paths.map(chainPath => ({ path: chainPath, identity: directoryIdentity(chainPath, spec) }));
  return { requested, suffix, chain };
}

function directoryTrustPresent(trust, spec, label) {
  if (!trust || !Array.isArray(trust.chain) || trust.chain.length === 0) {
    throw new Error(`${spec.key}: ${label} directory trust is missing`);
  }
  for (const entry of trust.chain) assertDirectoryIdentity(entry.path, entry.identity, spec, label);
  let current = trust.chain[trust.chain.length - 1].path;
  for (const part of trust.suffix) {
    current = join(current, part);
    let status;
    try {
      status = lstatSync(current);
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
    if (status.isSymbolicLink() || !status.isDirectory()) throw new Error(`${spec.key}: unsafe managed directory`);
  }
  if (resolve(current) !== trust.requested) throw new Error(`${spec.key}: ${label} directory changed`);
  return true;
}

function assertDirectoryTrust(trust, spec, label) {
  if (!directoryTrustPresent(trust, spec, label)) {
    throw new Error(`${spec.key}: ${label} directory is absent`);
  }
}

function safeRemoveExact(target, parent, name, recursive, spec, parentTrust) {
  if (dirname(target) !== parent || basename(target) !== name) {
    throw new Error(`${spec.key}: unsafe transaction cleanup target`);
  }
  assertDirectoryTrust(parentTrust, spec, 'transaction cleanup parent');
  let status;
  try {
    status = lstatSync(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  assertDirectoryTrust(parentTrust, spec, 'transaction cleanup parent');
  if (status.isSymbolicLink()) rmSync(target, { force: true });
  else if (status.isDirectory()) {
    if (!recursive) throw new Error(`${spec.key}: unsafe transaction cleanup type`);
    rmSync(target, { recursive: true, force: true });
  } else if (status.isFile()) rmSync(target, { force: true });
  else throw new Error(`${spec.key}: unsafe transaction cleanup type`);
}

function restoreFile(path, snapshot, spec) {
  const parent = dirname(path);
  if (!snapshot.present) {
    if (!directoryTrustPresent(snapshot.parentTrust, spec, 'plugin state parent')) return;
    safeRemoveExact(path, parent, basename(path), false, spec, snapshot.parentTrust);
    return;
  }
  assertDirectoryTrust(snapshot.parentTrust, spec, 'plugin state parent');
  const staged = `${path}.${process.pid}.restore`;
  if (existsSync(staged)) throw new Error(`${spec.key}: restoration staging path already exists`);
  try {
    writeExclusive(staged, snapshot.bytes, false, spec);
    chmodSync(staged, snapshot.mode);
    const current = existsSync(path) ? lstatSync(path) : null;
    if (current?.isDirectory()) throw new Error(`${spec.key}: plugin state path became a directory`);
    renameSync(staged, path);
  } finally {
    if (existsSync(staged)) safeRemoveExact(staged, parent, basename(staged), false, spec, snapshot.parentTrust);
  }
}

function copyValidatedDirectory(source, destination, spec) {
  const sourceIdentity = directoryIdentity(source, spec);
  mkdirSync(destination, 0o700);
  const destinationStatus = lstatSync(destination);
  if (destinationStatus.isSymbolicLink() || !destinationStatus.isDirectory()) {
    throw new Error(`${spec.key}: persistent source staging is unsafe`);
  }
  for (const name of readdirSync(source).sort()) {
    if (!name || name === '.' || name === '..' || name.length > 255 || name.includes('/') || name.includes('\\') || name.includes('\0')) {
      throw new Error(`${spec.key}: invalid staged source entry`);
    }
    const sourcePath = join(source, name);
    const destinationPath = join(destination, name);
    const status = lstatSync(sourcePath);
    if (status.isSymbolicLink()) throw new Error(`${spec.key}: staged source contains a link`);
    if (status.isDirectory()) copyValidatedDirectory(sourcePath, destinationPath, spec);
    else if (status.isFile() && status.nlink === 1) {
      const file = readSingleLinkFile(sourcePath);
      if (!file) throw new Error(`${spec.key}: staged source file changed while copying`);
      writeExclusive(destinationPath, file.bytes, (status.mode & 0o111) !== 0, spec);
    } else throw new Error(`${spec.key}: staged source contains an unsafe entry`);
  }
  assertDirectoryIdentity(source, sourceIdentity, spec, 'staged source');
}

function prepareDirectoryReplacement(target, spec, label, parentGuard = null) {
  const parent = dirname(target);
  const parentTrust = parentGuard?.trust || captureDirectoryTrust(parent, spec);
  const parentIdentity = parentGuard?.identity || directoryIdentity(parent, spec);
  assertDirectoryTrust(parentTrust, spec, label);
  assertDirectoryIdentity(parent, parentIdentity, spec, label);
  const backup = `${target}.${process.pid}.backup`;
  if (existsSync(backup)) throw new Error(`${spec.key}: ${label} backup already exists`);
  const transaction = { target, parent, parentTrust, parentIdentity, backup, hadExisting: false, label };
  if (existsSync(target)) {
    const status = lstatSync(target);
    if (status.isSymbolicLink() || !status.isDirectory()) throw new Error(`${spec.key}: unsafe ${label} directory`);
    renameSync(target, backup);
    transaction.hadExisting = true;
    try {
      assertDirectoryTrust(parentTrust, spec, label);
      assertDirectoryIdentity(parent, parentIdentity, spec, label);
    } catch (error) {
      const failure = new Error(`${spec.key}: ${label} restoration incomplete`);
      failure.restorationIncomplete = true;
      failure.cause = error;
      failure.transaction = transaction;
      throw failure;
    }
  }
  return transaction;
}

function restoreDirectoryReplacement(transaction, spec) {
  assertDirectoryTrust(transaction.parentTrust, spec, transaction.label);
  assertDirectoryIdentity(transaction.parent, transaction.parentIdentity, spec, transaction.label);
  safeRemoveExact(transaction.target, transaction.parent, basename(transaction.target), true, spec, transaction.parentTrust);
  if (transaction.hadExisting) {
    const backupStatus = lstatSync(transaction.backup);
    if (backupStatus.isSymbolicLink() || !backupStatus.isDirectory()) {
      throw new Error(`${spec.key}: unsafe ${transaction.label} backup`);
    }
    renameSync(transaction.backup, transaction.target);
  }
}

function cleanupDirectoryReplacement(transaction, spec) {
  if (!transaction.hadExisting) return;
  assertDirectoryTrust(transaction.parentTrust, spec, transaction.label);
  assertDirectoryIdentity(transaction.parent, transaction.parentIdentity, spec, transaction.label);
  safeRemoveExact(transaction.backup, transaction.parent, basename(transaction.backup), true, spec, transaction.parentTrust);
}

function materializePersistentSource(sourceRoot, spec, context) {
  const trackedParents = ensureTrackedDirectory(
    context.claudeConfigDir,
    ['plugins', 'clawgod-marketplaces', spec.marketplace],
    spec,
    context,
    'persistent marketplace parent',
  );
  const sourceParent = trackedParents.path;
  const createdParents = trackedParents.createdParents;
  const sourceParentGuard = trackedDirectoryGuard(sourceParent, createdParents, spec, 'persistent marketplace parent');
  const persistentSource = join(sourceParent, spec.version);
  const staged = `${persistentSource}.${process.pid}.staged`;
  if (existsSync(staged)) throw new Error(`${spec.key}: persistent source staging path already exists`);
  const parentIdentity = sourceParentGuard.identity;
  const parentTrust = sourceParentGuard.trust;
  let completed = false;
  let transaction = null;
  let result = null;
  let failure = null;
  try {
    if (spec.key === 'superpowers') {
      mkdirSync(staged, 0o700);
      safeDirectoryStatus(staged, spec);
      const manifestDirectory = join(staged, '.claude-plugin');
      mkdirSync(manifestDirectory, 0o700);
      writeExclusive(
        join(manifestDirectory, 'marketplace.json'),
        new TextEncoder().encode(JSON.stringify({
          name: 'superpowers-marketplace',
          plugins: [{ name: 'superpowers', version: '6.2.0', source: './plugin' }],
        })),
        false,
        spec,
      );
      copyValidatedDirectory(sourceRoot, join(staged, 'plugin'), spec);
    } else copyValidatedDirectory(sourceRoot, staged, spec);
    assertDirectoryIdentity(sourceParent, parentIdentity, spec, 'persistent source');
    transaction = prepareDirectoryReplacement(persistentSource, spec, 'persistent source', sourceParentGuard);
    try {
      context.onPersistentTransactionPrepared?.(transaction);
      renameSync(staged, persistentSource);
      assertDirectoryIdentity(sourceParent, parentIdentity, spec, 'persistent source');
      safeDirectoryStatus(persistentSource, spec);
      transaction.createdParents = createdParents;
      const manifest = readJson(join(persistentSource, '.claude-plugin', 'marketplace.json'), spec);
      const entry = manifest.plugins?.find(candidate => candidate.name === spec.plugin);
      if (!entry) throw new Error(`${spec.key}: persistent plugin entry is missing`);
      const pluginSource = spec.key === 'superpowers'
        ? join(persistentSource, 'plugin')
        : containedRelativeSource(persistentSource, entry.source, spec);
      result = { persistentSource, pluginSource, transaction };
      completed = true;
    } catch (error) {
      try { restoreDirectoryReplacement(transaction, spec); } catch (restoreError) {
        const restorationFailure = new Error(`${spec.key}: persistent source restoration incomplete`);
        restorationFailure.restorationIncomplete = true;
        restorationFailure.cause = restoreError;
        restorationFailure.transaction = transaction;
        throw restorationFailure;
      }
      throw error;
    }
  } catch (error) {
    failure = error;
    if (!transaction && error?.transaction) transaction = error.transaction;
  }

  const cleanupErrors = [];
  try {
    if (existsSync(staged)) {
      assertDirectoryIdentity(sourceParent, parentIdentity, spec, 'persistent source');
      safeRemoveExact(staged, sourceParent, basename(staged), true, spec, parentTrust);
    }
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (!completed) {
    try { cleanupCreatedParents(createdParents, spec); } catch (error) { cleanupErrors.push(error); }
  }
  if (failure || cleanupErrors.length > 0) {
    const primary = failure?.restorationIncomplete ? failure : cleanupErrors.find(error => error?.restorationIncomplete) || failure || cleanupErrors[0];
    if (primary?.restorationIncomplete) {
      primary.transaction = primary.transaction || transaction;
      throw primary;
    }
    throw primary;
  }
  return result;
}

function copyDirectorySnapshot(source, destination, spec) {
  const sourceStatus = safeDirectoryStatus(source, spec);
  const sourceIdentity = { dev: sourceStatus.dev, ino: sourceStatus.ino };
  mkdirSync(destination, sourceStatus.mode & 0o777);
  chmodSync(destination, sourceStatus.mode & 0o777);
  for (const name of readdirSync(source).sort()) {
    const sourcePath = join(source, name);
    const destinationPath = join(destination, name);
    const status = lstatSync(sourcePath);
    if (status.isSymbolicLink()) throw new Error(`${spec.key}: plugin cache contains a link`);
    if (status.isDirectory()) copyDirectorySnapshot(sourcePath, destinationPath, spec);
    else if (status.isFile() && status.nlink === 1) {
      const file = readSingleLinkFile(sourcePath);
      if (!file) throw new Error(`${spec.key}: plugin cache changed while snapshotting`);
      writeExclusive(destinationPath, file.bytes, (status.mode & 0o111) !== 0, spec);
      chmodSync(destinationPath, status.mode & 0o777);
    } else throw new Error(`${spec.key}: plugin cache contains an unsafe entry`);
  }
  assertDirectoryIdentity(source, sourceIdentity, spec, 'plugin cache');
}

function recordCacheEntries(directory, entries, spec, prefix = '') {
  for (const name of readdirSync(directory)) {
    const relativePath = prefix ? `${prefix}/${name}` : name;
    const path = join(directory, name);
    const status = lstatSync(path);
    if (status.isSymbolicLink()) throw new Error(`${spec.key}: plugin cache contains a link`);
    if (status.isDirectory()) {
      entries.set(relativePath, `directory:${status.mode & 0o777}`);
      recordCacheEntries(path, entries, spec, relativePath);
    } else if (status.isFile() && status.nlink === 1) {
      const file = readSingleLinkFile(path);
      if (!file) throw new Error(`${spec.key}: plugin cache changed while inventorying`);
      entries.set(relativePath, `file:${status.mode & 0o777}:${sha256(file.bytes)}`);
    } else throw new Error(`${spec.key}: plugin cache contains an unsafe entry`);
  }
}

function cacheEntrySignature(path, status, spec) {
  if (status.isSymbolicLink()) return 'unsafe';
  if (status.isDirectory()) return `directory:${status.mode & 0o777}`;
  if (!status.isFile() || status.nlink !== 1) return 'unsafe';
  const file = readSingleLinkFile(path);
  if (!file) throw new Error(`${spec.key}: plugin cache changed while inventorying`);
  return `file:${status.mode & 0o777}:${sha256(file.bytes)}`;
}

function cacheTreeMatches(directory, expected, expectedRootSignature, spec) {
  if (!existsSync(directory)) return false;
  const rootStatus = lstatSync(directory);
  if (cacheEntrySignature(directory, rootStatus, spec) !== expectedRootSignature) return false;
  const actual = new Map();
  recordCacheEntries(directory, actual, spec);
  if (actual.size !== expected.size) return false;
  for (const [path, signature] of expected) if (actual.get(path) !== signature) return false;
  return true;
}

function captureCacheCleanupNode(path, spec) {
  const before = lstatSync(path);
  const signature = cacheEntrySignature(path, before, spec);
  if (signature === 'unsafe') throw new Error(`${spec.key}: plugin cache cleanup contains an unsafe entry`);
  const node = {
    type: before.isDirectory() ? 'directory' : 'file',
    identity: { dev: before.dev, ino: before.ino },
    signature,
    children: [],
  };
  const names = node.type === 'directory' ? readdirSync(path).sort() : [];
  for (const name of names) {
    node.children.push({ name, node: captureCacheCleanupNode(join(path, name), spec) });
  }
  const after = lstatSync(path);
  const afterSignature = cacheEntrySignature(path, after, spec);
  const afterNames = node.type === 'directory' ? readdirSync(path).sort() : [];
  if (after.dev !== node.identity.dev || after.ino !== node.identity.ino
    || afterSignature !== signature || afterNames.length !== names.length
    || afterNames.some((name, index) => name !== names[index])) {
    throw new Error(`${spec.key}: plugin cache changed while capturing cleanup inventory`);
  }
  return node;
}

function cacheCleanupNodeMatches(path, node, spec) {
  if (!existsSync(path)) return false;
  const status = lstatSync(path);
  return status.dev === node.identity.dev && status.ino === node.identity.ino
    && cacheEntrySignature(path, status, spec) === node.signature;
}

function removeCapturedCacheNode(path, node, spec) {
  if (!cacheCleanupNodeMatches(path, node, spec)) {
    throw managedDirectoryFailure(spec, 'plugin cache restoration incomplete; cleanup entry changed', null, [path]);
  }
  if (node.type === 'directory') {
    for (const child of node.children) removeCapturedCacheNode(join(path, child.name), child.node, spec);
    if (!cacheCleanupNodeMatches(path, node, spec)) {
      throw managedDirectoryFailure(spec, 'plugin cache restoration incomplete; cleanup directory changed', null, [path]);
    }
  }

  const parent = dirname(path);
  const parentTrust = captureDirectoryTrust(parent, spec);
  const parentIdentity = directoryIdentity(parent, spec);
  const quarantine = mkdtempSync(join(parent, `.clawgod-remove-${process.pid}-`));
  chmodSync(quarantine, 0o700);
  const quarantineIdentity = directoryIdentity(quarantine, spec);
  const moved = join(quarantine, 'entry');
  try {
    assertDirectoryTrust(parentTrust, spec, 'plugin cache cleanup parent');
    assertDirectoryIdentity(parent, parentIdentity, spec, 'plugin cache cleanup parent');
    renameSync(path, moved);
    assertDirectoryIdentity(parent, parentIdentity, spec, 'plugin cache cleanup parent');
    assertDirectoryIdentity(quarantine, quarantineIdentity, spec, 'plugin cache cleanup quarantine');
    if (existsSync(path) || !cacheCleanupNodeMatches(moved, node, spec)) {
      throw managedDirectoryFailure(
        spec,
        'plugin cache restoration incomplete; cleanup entry was replaced',
        null,
        [quarantine, moved, path].filter(candidate => existsSync(candidate)),
      );
    }
    if (node.type === 'directory') rmdirSync(moved);
    else unlinkSync(moved);
    assertDirectoryIdentity(quarantine, quarantineIdentity, spec, 'plugin cache cleanup quarantine');
    rmdirSync(quarantine);
  } catch (error) {
    if (error?.restorationIncomplete) throw error;
    throw managedDirectoryFailure(
      spec,
      'plugin cache restoration incomplete; cleanup race preserved',
      error,
      [quarantine, moved, path].filter(candidate => existsSync(candidate)),
    );
  }
}

function unexpectedCachePaths(directory, transaction, spec, prefix = '', unexpected = []) {
  for (const name of readdirSync(directory)) {
    const relativePath = prefix ? `${prefix}/${name}` : name;
    const path = join(directory, name);
    const status = lstatSync(path);
    const baselinePrefix = `${transaction.version}/`;
    const expectedPath = relativePath === transaction.version ? ''
      : relativePath.startsWith(baselinePrefix) ? relativePath.slice(baselinePrefix.length) : null;
    const expectedSignature = expectedPath === '' ? transaction.expectedVersionRootSignature
      : expectedPath === null ? null : transaction.expectedVersionEntries.get(expectedPath);
    if (!transaction.preExistingEntries.has(relativePath)
      && (expectedSignature === null || expectedSignature === undefined || cacheEntrySignature(path, status, spec) !== expectedSignature)) {
      unexpected.push(relativePath);
      continue;
    }
    if (status.isDirectory() && !status.isSymbolicLink()) {
      unexpectedCachePaths(path, transaction, spec, relativePath, unexpected);
    }
  }
  return unexpected;
}

function prepareCacheTransaction(pluginRoot, spec, installed, pluginSource, context) {
  const cacheRoot = join(pluginRoot, 'cache');
  const marketplaceCache = join(cacheRoot, spec.marketplace);
  const pluginCache = join(marketplaceCache, spec.plugin);
  const backup = `${pluginCache}.${process.pid}.backup`;
  const backupPreExisting = existsSync(backup);
  let marketplaceCacheTrust = null;
  let createdParents = [];
  try {
    const trackedCache = ensureTrackedDirectory(
      pluginRoot,
      ['cache', spec.marketplace, spec.plugin],
      spec,
      context,
      'plugin cache parent',
    );
    createdParents = trackedCache.createdParents;
    const hadExisting = !createdParents.some(entry => entry.path === pluginCache);
    const pluginCacheGuard = trackedDirectoryGuard(pluginCache, createdParents, spec, 'plugin cache');
    const marketplaceCacheGuard = trackedDirectoryGuard(marketplaceCache, createdParents, spec, 'plugin cache parent');
    const pluginCacheIdentity = pluginCacheGuard.identity;
    const pluginCacheTrust = pluginCacheGuard.trust;
    marketplaceCacheTrust = marketplaceCacheGuard.trust;
    const preExistingEntries = new Map();
    recordCacheEntries(pluginCache, preExistingEntries, spec);
    const preExistingRootSignature = cacheEntrySignature(pluginCache, lstatSync(pluginCache), spec);
    const expectedVersionEntries = new Map();
    recordCacheEntries(pluginSource, expectedVersionEntries, spec);
    const expectedVersionRootSignature = cacheEntrySignature(pluginSource, lstatSync(pluginSource), spec);
    if (backupPreExisting) throw new Error(`${spec.key}: plugin cache backup already exists`);
    if (hadExisting) copyDirectorySnapshot(pluginCache, backup, spec);
    assertDirectoryTrust(pluginCacheTrust, spec, 'plugin cache');
    assertDirectoryIdentity(pluginCache, pluginCacheIdentity, spec, 'plugin cache');
    assertDirectoryTrust(marketplaceCacheTrust, spec, 'plugin cache parent');
    return {
      pluginCache, pluginCacheIdentity, pluginCacheTrust, marketplaceCache, marketplaceCacheTrust,
      backup, hadExisting, createdParents, preExistingEntries, preExistingRootSignature,
      expectedVersionEntries, expectedVersionRootSignature,
      version: spec.version,
    };
  } catch (error) {
    const restorationErrors = [];
    try {
      if (!backupPreExisting && marketplaceCacheTrust && existsSync(backup)) {
        safeRemoveExact(backup, marketplaceCache, basename(backup), true, spec, marketplaceCacheTrust);
      }
    } catch (restoreError) { restorationErrors.push(restoreError); }
    try { cleanupCreatedParents(createdParents, spec); } catch (restoreError) { restorationErrors.push(restoreError); }
    if (restorationErrors.length > 0) {
      const failure = new Error(`${spec.key}: plugin cache preparation restoration incomplete`);
      failure.restorationIncomplete = true;
      failure.cause = restorationErrors[0];
      throw failure;
    }
    throw error;
  }
}

function restoreCacheTransaction(transaction, spec, context) {
  assertDirectoryTrust(transaction.pluginCacheTrust, spec, 'plugin cache');
  assertDirectoryIdentity(transaction.pluginCache, transaction.pluginCacheIdentity, spec, 'plugin cache');
  const failedPath = `${transaction.pluginCache}.${process.pid}.failed`;
  const cleanupPath = `${transaction.pluginCache}.${process.pid}.cleanup`;
  const concurrentPath = `${transaction.pluginCache}.${process.pid}.concurrent`;
  if (existsSync(failedPath) || existsSync(cleanupPath) || existsSync(concurrentPath)) {
    const failure = new Error(`${spec.key}: plugin cache restoration incomplete; evidence path exists`);
    failure.restorationIncomplete = true;
    failure.evidencePath = transaction.pluginCache;
    throw failure;
  }
  assertDirectoryTrust(transaction.marketplaceCacheTrust, spec, 'plugin cache parent');
  renameSync(transaction.pluginCache, failedPath);
  if (transaction.hadExisting) copyDirectorySnapshot(transaction.backup, transaction.pluginCache, spec);
  context.onCacheQuarantined?.({ pluginCache: transaction.pluginCache, failedPath });

  const canonicalChanged = transaction.hadExisting
    ? !cacheTreeMatches(transaction.pluginCache, transaction.preExistingEntries, transaction.preExistingRootSignature, spec)
    : existsSync(transaction.pluginCache);
  if (canonicalChanged) {
    const evidencePaths = [failedPath];
    if (existsSync(transaction.pluginCache)) {
      renameSync(transaction.pluginCache, concurrentPath);
      evidencePaths.push(concurrentPath);
    }
    if (transaction.hadExisting) renameSync(transaction.backup, transaction.pluginCache);
    const failure = new Error(`${spec.key}: plugin cache restoration incomplete; concurrent data preserved`);
    failure.restorationIncomplete = true;
    failure.evidencePath = evidencePaths.at(-1);
    failure.evidencePaths = evidencePaths;
    throw failure;
  }

  const unexpected = unexpectedCachePaths(failedPath, transaction, spec);
  context.onCacheFailedInspected?.({ pluginCache: transaction.pluginCache, failedPath, unexpectedPaths: unexpected });

  assertDirectoryTrust(transaction.marketplaceCacheTrust, spec, 'plugin cache parent');
  renameSync(failedPath, cleanupPath);
  const lateUnexpected = unexpectedCachePaths(cleanupPath, transaction, spec);
  const canonicalChangedAfterInspection = transaction.hadExisting
    ? !cacheTreeMatches(transaction.pluginCache, transaction.preExistingEntries, transaction.preExistingRootSignature, spec)
    : existsSync(transaction.pluginCache);
  if (canonicalChangedAfterInspection) {
    const evidencePaths = [cleanupPath];
    if (existsSync(transaction.pluginCache)) {
      renameSync(transaction.pluginCache, concurrentPath);
      evidencePaths.push(concurrentPath);
    }
    if (transaction.hadExisting) renameSync(transaction.backup, transaction.pluginCache);
    const failure = new Error(`${spec.key}: plugin cache restoration incomplete; late concurrent data preserved`);
    failure.restorationIncomplete = true;
    failure.evidencePath = evidencePaths.at(-1);
    failure.evidencePaths = evidencePaths;
    throw failure;
  }
  if (unexpected.length > 0 || lateUnexpected.length > 0 || existsSync(failedPath)) {
    const evidencePaths = [cleanupPath, transaction.pluginCache];
    if (existsSync(failedPath)) evidencePaths.push(failedPath);
    if (transaction.hadExisting) evidencePaths.push(transaction.backup);
    const failure = new Error(`${spec.key}: plugin cache restoration incomplete; unknown paths preserved`);
    failure.restorationIncomplete = true;
    failure.evidencePath = cleanupPath;
    failure.evidencePaths = evidencePaths;
    failure.unexpectedPaths = [...new Set([...unexpected, ...lateUnexpected])];
    throw failure;
  }

  let cleanupInventory;
  try {
    cleanupInventory = captureCacheCleanupNode(cleanupPath, spec);
    context.onCacheCleanupInventoried?.({ cleanupPath });
    removeCapturedCacheNode(cleanupPath, cleanupInventory, spec);
  } catch (error) {
    if (error?.restorationIncomplete) throw error;
    throw managedDirectoryFailure(
      spec,
      'plugin cache restoration incomplete; cleanup inventory changed',
      error,
      [cleanupPath].filter(path => existsSync(path)),
    );
  }
  const canonicalChangedAfterCleanup = transaction.hadExisting
    ? !cacheTreeMatches(transaction.pluginCache, transaction.preExistingEntries, transaction.preExistingRootSignature, spec)
    : existsSync(transaction.pluginCache);
  if (canonicalChangedAfterCleanup || existsSync(failedPath) || existsSync(cleanupPath)) {
    const evidencePaths = [failedPath, cleanupPath].filter(path => existsSync(path));
    if (canonicalChangedAfterCleanup && existsSync(transaction.pluginCache)) {
      renameSync(transaction.pluginCache, concurrentPath);
      evidencePaths.push(concurrentPath);
    }
    if (transaction.hadExisting) renameSync(transaction.backup, transaction.pluginCache);
    const failure = new Error(`${spec.key}: plugin cache restoration incomplete; cleanup race preserved`);
    failure.restorationIncomplete = true;
    failure.evidencePath = evidencePaths.at(-1) || transaction.pluginCache;
    failure.evidencePaths = evidencePaths;
    throw failure;
  }
  if (transaction.hadExisting) cleanupCacheTransaction(transaction, spec);
}

function cleanupCacheTransaction(transaction, spec) {
  if (!transaction.hadExisting) return;
  safeRemoveExact(
    transaction.backup,
    transaction.marketplaceCache,
    basename(transaction.backup),
    true,
    spec,
    transaction.marketplaceCacheTrust,
  );
}

function cleanupCreatedParents(createdParents, spec) {
  for (let index = createdParents.length - 1; index >= 0; index--) {
    const { path, identity, parentTrust } = createdParents[index];
    try {
      const status = lstatSync(path);
      if (status.isSymbolicLink() || !status.isDirectory()) throw new Error(`${spec.key}: unsafe created parent`);
      assertDirectoryTrust(parentTrust, spec, 'created parent');
      assertDirectoryIdentity(path, identity, spec, 'created parent');
      rmdirSync(path);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      const failure = new Error(`${spec.key}: created parent restoration incomplete`);
      failure.restorationIncomplete = true;
      failure.cause = error;
      throw failure;
    }
  }
}

function cleanupCreatedCacheParents(cacheTransaction, spec) {
  cleanupCreatedParents(cacheTransaction.createdParents, spec);
}

function runPluginCli(args, spec, context) {
  let result;
  try {
    result = context.spawnSyncImpl({
      cmd: [context.bunPath, context.claudeCliPath, ...args],
      env: { ...context.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch {
    throw new Error(`${spec.key}: plugin command failed`);
  }
  if (result.exitCode !== 0) throw new Error(`${spec.key}: plugin command failed`);
}

function verifyPluginInstallation(spec, context, pluginRoot, cacheTransaction) {
  assertDirectoryTrust(cacheTransaction.pluginCacheTrust, spec, 'plugin cache');
  assertDirectoryIdentity(cacheTransaction.pluginCache, cacheTransaction.pluginCacheIdentity, spec, 'plugin cache');
  const installed = parseStateSnapshot(snapshotFile(join(pluginRoot, 'installed_plugins.json'), spec), {}, spec, 'installed plugin state');
  const records = Array.isArray(installed?.plugins?.[spec.id]) ? installed.plugins[spec.id] : [];
  const record = records.find(candidate => candidate?.scope === 'user' && candidate.version === spec.version);
  if (!record || typeof record.installPath !== 'string') throw new Error(`${spec.key}: installed version was not verified`);
  const cacheRoot = realpathSync(join(pluginRoot, 'cache'));
  const installPath = realpathSync(record.installPath);
  if (!installPath.startsWith(`${cacheRoot}${sep}`)) {
    throw new Error(`${spec.key}: installed plugin escaped the canonical cache`);
  }
  const settings = parseStateSnapshot(snapshotFile(join(context.claudeConfigDir, 'settings.json'), spec), {}, spec, 'plugin settings');
  if (settings?.enabledPlugins?.[spec.id] !== true) throw new Error(`${spec.key}: installed plugin is not enabled`);
}

function pluginResult(spec, status, ready, version, detail) {
  return { key: spec.key, id: spec.id, version, status, ready, detail };
}

export async function ensureMarketplacePlugin(spec, context) {
  try {
    validateSpecFilenameComponents(spec);
    validateFilenameComponent(spec?.marketplace, 'marketplace');
    validateFilenameComponent(spec?.plugin, 'plugin');
  } catch (error) {
    return pluginResult(spec || {}, 'warning', false, null, error.message);
  }
  const baseline = PLUGIN_BASELINES[spec.key];
  if (!baseline || ['key', 'id', 'marketplace', 'plugin', 'version'].some(field => spec[field] !== baseline[field])) {
    return pluginResult(spec, 'warning', false, null, 'plugin spec is not canonical');
  }
  const pluginRoot = join(context.claudeConfigDir, 'plugins');
  const installedPlugins = join(pluginRoot, 'installed_plugins.json');
  let installedSnapshot;
  let installed;
  try {
    installedSnapshot = snapshotFile(installedPlugins, spec);
    installed = parseStateSnapshot(installedSnapshot, { version: 2, plugins: {} }, spec, 'installed plugin state');
  } catch (error) {
    return pluginResult(spec, 'warning', false, null, error.message);
  }
  const classification = classifyPlugin(installed, spec);
  const selected = selectInstalledRecord(installed, spec.id);
  if (classification === 'satisfied') {
    return pluginResult(spec, 'preserved', true, selected.version, `preserved ${selected.version}`);
  }
  if (classification === 'invalid') {
    return pluginResult(spec, 'warning', false, null, 'installed version is invalid; preserved existing state');
  }

  const knownMarketplaces = join(pluginRoot, 'known_marketplaces.json');
  const settingsPath = join(context.claudeConfigDir, 'settings.json');
  let knownSnapshot;
  let settingsSnapshot;
  let known;
  try {
    knownSnapshot = snapshotFile(knownMarketplaces, spec);
    settingsSnapshot = snapshotFile(settingsPath, spec);
    known = parseStateSnapshot(knownSnapshot, {}, spec, 'known marketplace state');
    parseStateSnapshot(settingsSnapshot, {}, spec, 'plugin settings');
  } catch (error) {
    return pluginResult(spec, 'warning', false, selected?.version || null, error.message);
  }

  let persistentTransaction = null;
  let marketplaceTransaction = null;
  let cacheTransaction = null;
  try {
    const stagedSource = await downloadAndStage(spec, context);
    const materialized = materializePersistentSource(stagedSource.sourceRoot, spec, context);
    persistentTransaction = materialized.transaction;
    const trackedMarketplace = ensureTrackedDirectory(
      pluginRoot,
      ['marketplaces'],
      spec,
      context,
      'marketplace parent',
    );
    const marketplaceParent = trackedMarketplace.path;
    const marketplaceCreatedParents = trackedMarketplace.createdParents;
    const marketplaceParentGuard = trackedDirectoryGuard(marketplaceParent, marketplaceCreatedParents, spec, 'marketplace parent');
    marketplaceTransaction = prepareDirectoryReplacement(
      join(marketplaceParent, spec.marketplace),
      spec,
      'marketplace',
      marketplaceParentGuard,
    );
    marketplaceTransaction.createdParents = marketplaceCreatedParents;
    cacheTransaction = prepareCacheTransaction(pluginRoot, spec, installed, materialized.pluginSource, context);

    if (Object.hasOwn(known, spec.marketplace)) {
      runPluginCli(['plugin', 'marketplace', 'remove', spec.marketplace], spec, context);
    }
    runPluginCli(['plugin', 'marketplace', 'add', materialized.persistentSource, '--scope', 'user'], spec, context);
    runPluginCli(
      classification === 'missing'
        ? ['plugin', 'install', spec.id, '--scope', 'user']
        : ['plugin', 'update', spec.id, '--scope', 'user'],
      spec,
      context,
    );
    verifyPluginInstallation(spec, context, pluginRoot, cacheTransaction);
  } catch (error) {
    if (!persistentTransaction && error?.transaction) persistentTransaction = error.transaction;
    const restorationErrors = [];
    for (const restore of [
      () => restoreFile(knownMarketplaces, knownSnapshot, spec),
      () => restoreFile(installedPlugins, installedSnapshot, spec),
      () => restoreFile(settingsPath, settingsSnapshot, spec),
      () => marketplaceTransaction && restoreDirectoryReplacement(marketplaceTransaction, spec),
      () => cacheTransaction && restoreCacheTransaction(cacheTransaction, spec, context),
      () => marketplaceTransaction && cleanupCreatedParents(marketplaceTransaction.createdParents, spec),
      () => cacheTransaction && cleanupCreatedCacheParents(cacheTransaction, spec),
      () => persistentTransaction && restoreDirectoryReplacement(persistentTransaction, spec),
      () => persistentTransaction && cleanupCreatedParents(persistentTransaction.createdParents || [], spec),
    ]) {
      try { restore(); } catch (restoreError) { restorationErrors.push(restoreError); }
    }
    if (restorationErrors.length > 0 || error?.restorationIncomplete) {
      const failure = new Error(`${spec.key}: plugin transaction restoration incomplete`);
      failure.restorationIncomplete = true;
      const primary = error?.restorationIncomplete ? error : restorationErrors.find(candidate => candidate?.restorationIncomplete) || restorationErrors[0] || error;
      failure.cause = primary;
      failure.transaction = primary?.transaction || persistentTransaction || null;
      if (primary?.evidencePath) failure.evidencePath = primary.evidencePath;
      if (primary?.evidencePaths) failure.evidencePaths = primary.evidencePaths;
      if (primary?.unexpectedPaths) failure.unexpectedPaths = primary.unexpectedPaths;
      throw failure;
    }
    return pluginResult(spec, 'warning', false, selected?.version || null, error.message);
  }

  const cleanupErrors = [];
  for (const cleanup of [
    () => cleanupDirectoryReplacement(marketplaceTransaction, spec),
    () => cleanupCacheTransaction(cacheTransaction, spec),
    () => cleanupDirectoryReplacement(persistentTransaction, spec),
  ]) {
    try { cleanup(); } catch (error) { cleanupErrors.push(error); }
  }
  if (cleanupErrors.length > 0) {
    return pluginResult(spec, 'warning', true, spec.version, 'installed plugin verified; transaction backup cleanup failed');
  }
  return pluginResult(
    spec,
    classification === 'missing' ? 'installed' : 'upgraded',
    true,
    spec.version,
    `${classification === 'missing' ? 'installed' : 'upgraded'} ${spec.version}`,
  );
}

function warningResult(spec, error) {
  const detail = error instanceof Error ? error.message : 'plugin setup failed';
  return pluginResult(spec, 'warning', false, null, detail);
}

export function shouldConfigurePluginDependency(result) {
  return result?.ready === true && result.status !== 'warning';
}

export async function ensurePluginDependencies(context) {
  const specs = [PLUGIN_BASELINES.hud, PLUGIN_BASELINES.memory, PLUGIN_BASELINES.superpowers];
  const marketplaceResults = new Map();
  for (const spec of specs) {
    try {
      marketplaceResults.set(spec.key, await ensureMarketplacePlugin(spec, context));
    } catch (error) {
      marketplaceResults.set(spec.key, warningResult(spec, error));
    }
  }

  const state = { schemaVersion: 1, hud: {}, claudeMem: { files: {} } };
  const results = [];
  for (const spec of specs) {
    const marketplace = marketplaceResults.get(spec.key);
    if (!shouldConfigurePluginDependency(marketplace) || spec.key === 'superpowers') {
      results.push(marketplace);
      continue;
    }
    try {
      results.push(spec.key === 'hud'
        ? await configureHud(context, state)
        : await configureClaudeMemBun(context, state));
    } catch (error) {
      results.push(warningResult(spec, error));
    }
  }
  return results;
}

function pluginContext() {
  const home = process.env.HOME || homedir();
  const clawgodDir = process.env.CLAWGOD_DIR || join(home, '.clawgod');
  return {
    home,
    claudeConfigDir: process.env.CLAUDE_CONFIG_DIR || join(home, '.claude'),
    clawgodDir,
    bunPath: process.env.CLAWGOD_BUN_BIN || process.execPath,
    claudeCliPath: join(clawgodDir, 'cli.original.cjs'),
    fetchFilePath: join(clawgodDir, 'fetch-file.mjs'),
    env: process.env,
    spawnSyncImpl: Bun.spawnSync,
  };
}

function printPluginResults(results) {
  let warnings = 0;
  for (const result of results) {
    const warning = result.status === 'warning' || !result.ready;
    if (warning) warnings += 1;
    const detail = String(result.detail || '').replace(/\s+/g, ' ').trim();
    console.log(`${result.id}: ${warning ? 'warning' : 'ready'}${detail ? ` - ${detail}` : ''}`);
  }
  console.log(`Optional plugins: ${results.length - warnings} ready, ${warnings} warning${warnings === 1 ? '' : 's'}`);
}

const MANAGED_ATOMIC_RESIDUE = /^\.(?:plugin-dependencies-state\.json|claude-hud-statusline\.mjs)\.\d+\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/;

function cleanupManagedAtomicResidue(context) {
  const root = resolve(context.clawgodDir);
  let rootIdentity;
  try {
    const status = lstatSync(root);
    if (status.isSymbolicLink() || !status.isDirectory()) return;
    rootIdentity = { dev: status.dev, ino: status.ino };
  } catch { return; }
  let entries;
  try { entries = readdirSync(root); } catch { return; }
  for (const name of entries) {
    if (!MANAGED_ATOMIC_RESIDUE.test(name)) continue;
    const path = join(root, name);
    let status;
    try { status = lstatSync(path); } catch { continue; }
    if (status.isSymbolicLink() || !status.isFile() || status.nlink !== 1) continue;
    let currentRoot;
    let current;
    try {
      currentRoot = lstatSync(root);
      current = lstatSync(path);
    } catch { continue; }
    if (currentRoot.isSymbolicLink() || !currentRoot.isDirectory()
      || currentRoot.dev !== rootIdentity.dev || currentRoot.ino !== rootIdentity.ino
      || current.isSymbolicLink() || !current.isFile() || current.nlink !== 1
      || current.dev !== status.dev || current.ino !== status.ino) continue;
    try { unlinkSync(path); } catch {}
  }
}

async function runPluginDependenciesCli(command) {
  const context = pluginContext();
  if (command === 'ensure') {
    printPluginResults(await ensurePluginDependencies(context));
    return;
  }
  if (command === 'uninstall') {
    const restoration = await restoreManagedIntegrations(context);
    if (restoration.conflicts.length > 0) {
      throw new Error(`optional plugin restoration conflicts: ${restoration.conflicts.join(', ')}`);
    }
    cleanupManagedAtomicResidue(context);
    return;
  }
  throw new Error('usage: plugin-dependencies.mjs <ensure|uninstall>');
}

if (import.meta.main) {
  try {
    await runPluginDependenciesCli(process.argv[2]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'optional plugin lifecycle failed');
    process.exitCode = 1;
  }
}
'@ | Set-Content (Join-Path $ClawDir "plugin-dependencies.mjs") -Encoding UTF8

# --- Managed ripgrep -------------------------------------------------

$InstallRipgrepBytes = [Convert]::FromBase64String('IyEvdXNyL2Jpbi9lbnYgYnVuCmltcG9ydCB7IGNobW9kU3luYywgZXhpc3RzU3luYywgbHN0YXRTeW5jLCBta2RpclN5bmMsIHJlbmFtZVN5bmMsIHJtU3luYyB9IGZyb20gJ25vZGU6ZnMnOwppbXBvcnQgeyBpc0Fic29sdXRlLCBqb2luLCByZWxhdGl2ZSwgcmVzb2x2ZSwgc2VwIH0gZnJvbSAnbm9kZTpwYXRoJzsKCmV4cG9ydCBjb25zdCBSSVBHUkVQX1ZFUlNJT04gPSAnMTUuMi4wJzsKZXhwb3J0IGNvbnN0IFJJUEdSRVBfQVNTRVRTID0gewogICdkYXJ3aW4tYXJtNjQnOiBbJ3JpcGdyZXAtMTUuMi4wLWFhcmNoNjQtYXBwbGUtZGFyd2luLnRhci5neicsICczNzUwYjJlOTNmMzdlMGM2OTI2NTdkYTU3NGQ3MDE5YTEwMWMwMDg0ZGEwNWE3OTBjODNmZDMzNWJhZDk3M2U0J10sCiAgJ2Rhcndpbi14NjQnOiBbJ3JpcGdyZXAtMTUuMi4wLXg4Nl82NC1hcHBsZS1kYXJ3aW4udGFyLmd6JywgJ2FmNzgyNWZjYzY5YTJhZmM3YTdhZWE1NWZjOWFmOTBlMjY0MjFkOGYyMGZlNTlkZjMyZTIzM2MwYjhhMjMxYzEnXSwKICAnbGludXgtYXJtNjQnOiBbJ3JpcGdyZXAtMTUuMi4wLWFhcmNoNjQtdW5rbm93bi1saW51eC1tdXNsLnRhci5neicsICc4MDBiMWU3MjA2YWZlNzk5ZGZiNWE2OTAxZjIzMTQ3Y2ZhYWJlMGU1MjIxMDUzODEwMGY2MWU4NmUxNzQwOTE1J10sCiAgJ2xpbnV4LXg2NCc6IFsncmlwZ3JlcC0xNS4yLjAteDg2XzY0LXVua25vd24tbGludXgtbXVzbC50YXIuZ3onLCAnMzNlMTViY2YxNjI0YjI1Y2RkMmE1NTgxM2E0N2EyZjk1ZGJlMTI2MjY4MjAzZTc2YWE2YTU4NWQxZTdiMTQ5YyddLAogICd3aW4zMi1hcm02NCc6IFsncmlwZ3JlcC0xNS4yLjAtYWFyY2g2NC1wYy13aW5kb3dzLW1zdmMuemlwJywgJ2U0YWJjYTEwYzNhNjRlYmVhNzQyNjY3ZGQ3MDA5NDQ5ZDQ5NDAzZGI1NDYwZGQ2ODczZTM4OWZhMjk0NTM2MGYnXSwKICAnd2luMzIteDY0JzogWydyaXBncmVwLTE1LjIuMC14ODZfNjQtcGMtd2luZG93cy1tc3ZjLnppcCcsICc3MWIyZmVmODYwYWJlNDY3MjE3YTUzOGZmMzFkZTAyZjUyNTg4MDdjMDEyOWY3NzE4NDZmODdiZDAyOWFhZmM1J10sCn07Cgpjb25zdCBNQVhfQklOQVJZX0JZVEVTID0gMTAwICogMTAyNCAqIDEwMjQ7CgpmdW5jdGlvbiBub1Byb3h5UnVsZSh2YWx1ZSkgewogIGxldCBlbnRyeSA9IHZhbHVlLnRyaW0oKS50b0xvd2VyQ2FzZSgpOwogIGlmIChlbnRyeSA9PT0gJyonKSByZXR1cm4geyBhbGw6IHRydWUgfTsKICBsZXQgaG9zdCA9IGVudHJ5OwogIGxldCBwb3J0ID0gJyc7CiAgaWYgKGVudHJ5LnN0YXJ0c1dpdGgoJ1snKSkgewogICAgY29uc3QgY2xvc2UgPSBlbnRyeS5pbmRleE9mKCddJyk7CiAgICBpZiAoY2xvc2UgPT09IC0xKSByZXR1cm4geyBob3N0OiBlbnRyeSwgcG9ydCB9OwogICAgaG9zdCA9IGVudHJ5LnNsaWNlKDEsIGNsb3NlKTsKICAgIGNvbnN0IHN1ZmZpeCA9IGVudHJ5LnNsaWNlKGNsb3NlICsgMSk7CiAgICBpZiAoL146XGQrJC8udGVzdChzdWZmaXgpKSBwb3J0ID0gc3VmZml4LnNsaWNlKDEpOwogICAgZWxzZSBpZiAoc3VmZml4KSByZXR1cm4geyBob3N0OiBlbnRyeSwgcG9ydCB9OwogIH0gZWxzZSB7CiAgICBjb25zdCBjb2xvbiA9IGVudHJ5Lmxhc3RJbmRleE9mKCc6Jyk7CiAgICBpZiAoY29sb24gPiAwICYmIGNvbG9uID09PSBlbnRyeS5pbmRleE9mKCc6JykgJiYgL15cZCskLy50ZXN0KGVudHJ5LnNsaWNlKGNvbG9uICsgMSkpKSB7CiAgICAgIGhvc3QgPSBlbnRyeS5zbGljZSgwLCBjb2xvbik7CiAgICAgIHBvcnQgPSBlbnRyeS5zbGljZShjb2xvbiArIDEpOwogICAgfQogIH0KICByZXR1cm4geyBob3N0OiBob3N0LnJlcGxhY2UoL15cKlwuLywgJy4nKSwgcG9ydCB9Owp9CgpmdW5jdGlvbiBieXBhc3Nlc1Byb3h5KHVybFZhbHVlLCBlbnYpIHsKICBjb25zdCBwYXJzZWQgPSB0eXBlb2YgdXJsVmFsdWUgPT09ICdzdHJpbmcnID8gbmV3IFVSTCh1cmxWYWx1ZSkgOiB1cmxWYWx1ZTsKICBjb25zdCBlbnRyaWVzID0gKGVudi5OT19QUk9YWSB8fCBlbnYubm9fcHJveHkgfHwgJycpLnNwbGl0KCcsJykuZmlsdGVyKHZhbHVlID0+IHZhbHVlLnRyaW0oKSk7CiAgY29uc3QgaG9zdCA9IHBhcnNlZC5ob3N0bmFtZS50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL15cW3xcXSQvZywgJycpOwogIGNvbnN0IHBvcnQgPSBwYXJzZWQucG9ydCB8fCAocGFyc2VkLnByb3RvY29sID09PSAnaHR0cHM6JyA/ICc0NDMnIDogcGFyc2VkLnByb3RvY29sID09PSAnaHR0cDonID8gJzgwJyA6ICcnKTsKICByZXR1cm4gZW50cmllcy5zb21lKGVudHJ5ID0+IHsKICAgIGNvbnN0IHJ1bGUgPSBub1Byb3h5UnVsZShlbnRyeSk7CiAgICBpZiAocnVsZS5hbGwpIHJldHVybiB0cnVlOwogICAgY29uc3QgYmFzZUhvc3QgPSBydWxlLmhvc3QucmVwbGFjZSgvXlwuLywgJycpOwogICAgcmV0dXJuIChob3N0ID09PSBiYXNlSG9zdCB8fCBob3N0LmVuZHNXaXRoKGAuJHtiYXNlSG9zdH1gKSkgJiYgKCFydWxlLnBvcnQgfHwgcnVsZS5wb3J0ID09PSBwb3J0KTsKICB9KTsKfQoKZXhwb3J0IGZ1bmN0aW9uIHByb3h5Rm9yKHVybFZhbHVlLCBlbnYgPSBwcm9jZXNzLmVudikgewogIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsVmFsdWUpOwogIGlmIChieXBhc3Nlc1Byb3h5KHBhcnNlZCwgZW52KSkgcmV0dXJuIHVuZGVmaW5lZDsKICByZXR1cm4gcGFyc2VkLnByb3RvY29sID09PSAnaHR0cHM6JwogICAgPyBlbnYuSFRUUFNfUFJPWFkgfHwgZW52Lmh0dHBzX3Byb3h5IHx8IGVudi5IVFRQX1BST1hZIHx8IGVudi5odHRwX3Byb3h5CiAgICA6IGVudi5IVFRQX1BST1hZIHx8IGVudi5odHRwX3Byb3h5Owp9Cgphc3luYyBmdW5jdGlvbiBmZXRjaERpcmVjdCh1cmwsIGluaXQsIGZldGNoSW1wbCkgewogIGNvbnN0IHVwcGVyID0gT2JqZWN0Lmhhc093bihwcm9jZXNzLmVudiwgJ05PX1BST1hZJykgPyBwcm9jZXNzLmVudi5OT19QUk9YWSA6IHVuZGVmaW5lZDsKICBjb25zdCBsb3dlciA9IE9iamVjdC5oYXNPd24ocHJvY2Vzcy5lbnYsICdub19wcm94eScpID8gcHJvY2Vzcy5lbnYubm9fcHJveHkgOiB1bmRlZmluZWQ7CiAgdHJ5IHsKICAgIHByb2Nlc3MuZW52Lk5PX1BST1hZID0gJyonOwogICAgcHJvY2Vzcy5lbnYubm9fcHJveHkgPSAnKic7CiAgICByZXR1cm4gYXdhaXQgZmV0Y2hJbXBsKHVybCwgaW5pdCk7CiAgfSBmaW5hbGx5IHsKICAgIGlmICh1cHBlciA9PT0gdW5kZWZpbmVkKSBkZWxldGUgcHJvY2Vzcy5lbnYuTk9fUFJPWFk7CiAgICBlbHNlIHByb2Nlc3MuZW52Lk5PX1BST1hZID0gdXBwZXI7CiAgICBpZiAobG93ZXIgPT09IHVuZGVmaW5lZCkgZGVsZXRlIHByb2Nlc3MuZW52Lm5vX3Byb3h5OwogICAgZWxzZSBwcm9jZXNzLmVudi5ub19wcm94eSA9IGxvd2VyOwogIH0KfQoKZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZldGNoV2l0aFByb3h5KGluaXRpYWxVcmwsIGluaXQgPSB7fSwgZW52ID0gcHJvY2Vzcy5lbnYsIGZldGNoSW1wbCA9IGZldGNoKSB7CiAgbGV0IG5leHRVcmwgPSBpbml0aWFsVXJsOwogIGNvbnN0IHsgcHJveHk6IF9jYWxsZXJQcm94eSwgLi4uYmFzZUluaXQgfSA9IGluaXQ7CiAgZm9yIChsZXQgcmVkaXJlY3RzID0gMDsgcmVkaXJlY3RzIDw9IDU7IHJlZGlyZWN0cysrKSB7CiAgICBjb25zdCBieXBhc3MgPSBieXBhc3Nlc1Byb3h5KG5leHRVcmwsIGVudik7CiAgICBjb25zdCBwcm94eSA9IHByb3h5Rm9yKG5leHRVcmwsIGVudik7CiAgICBsZXQgcmVzcG9uc2U7CiAgICB0cnkgewogICAgICBjb25zdCByZXF1ZXN0SW5pdCA9IHsKICAgICAgICAuLi5iYXNlSW5pdCwKICAgICAgICByZWRpcmVjdDogJ21hbnVhbCcsCiAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDMwMDAwMCksCiAgICAgICAgLi4uKHByb3h5ID8geyBwcm94eSB9IDoge30pLAogICAgICB9OwogICAgICByZXNwb25zZSA9IGJ5cGFzcwogICAgICAgID8gYXdhaXQgZmV0Y2hEaXJlY3QobmV4dFVybCwgcmVxdWVzdEluaXQsIGZldGNoSW1wbCkKICAgICAgICA6IGF3YWl0IGZldGNoSW1wbChuZXh0VXJsLCByZXF1ZXN0SW5pdCk7CiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBpZiAocHJveHkpIHRocm93IG5ldyBFcnJvcignUmVxdWVzdCBmYWlsZWQgdGhyb3VnaCBjb25maWd1cmVkIHByb3h5Jyk7CiAgICAgIHRocm93IGVycm9yOwogICAgfQogICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA+PSAzMDAgJiYgcmVzcG9uc2Uuc3RhdHVzIDwgNDAwICYmIHJlc3BvbnNlLmhlYWRlcnMuaGFzKCdsb2NhdGlvbicpKSB7CiAgICAgIGlmIChyZWRpcmVjdHMgPT09IDUpIHRocm93IG5ldyBFcnJvcignVG9vIG1hbnkgcmVkaXJlY3RzJyk7CiAgICAgIG5leHRVcmwgPSBuZXcgVVJMKHJlc3BvbnNlLmhlYWRlcnMuZ2V0KCdsb2NhdGlvbicpLCBuZXh0VXJsKS5ocmVmOwogICAgICBjb250aW51ZTsKICAgIH0KICAgIGlmIChyZXNwb25zZS5zdGF0dXMgIT09IDIwMCkgdGhyb3cgbmV3IEVycm9yKGBSZXF1ZXN0IGZhaWxlZCB3aXRoIEhUVFAgJHtyZXNwb25zZS5zdGF0dXN9YCk7CiAgICByZXR1cm4gcmVzcG9uc2U7CiAgfQogIHRocm93IG5ldyBFcnJvcignVG9vIG1hbnkgcmVkaXJlY3RzJyk7Cn0KCmZ1bmN0aW9uIHNhZmVBcmNoaXZlUGF0aChuYW1lKSB7CiAgaWYgKCFuYW1lIHx8IG5hbWUuc3RhcnRzV2l0aCgnLycpIHx8IG5hbWUuc3RhcnRzV2l0aCgnXFwnKSB8fCAvXltBLVphLXpdOltcXC9dLy50ZXN0KG5hbWUpKSByZXR1cm4gZmFsc2U7CiAgcmV0dXJuICFuYW1lLnNwbGl0KC9bXFwvXS8pLmluY2x1ZGVzKCcuLicpOwp9CgpleHBvcnQgZnVuY3Rpb24gc2VsZWN0UmlwZ3JlcEFzc2V0KHBsYXRmb3JtLCBhcmNoKSB7CiAgY29uc3Qgc2VsZWN0ZWQgPSBSSVBHUkVQX0FTU0VUU1tgJHtwbGF0Zm9ybX0tJHthcmNofWBdOwogIGlmICghc2VsZWN0ZWQpIHRocm93IG5ldyBFcnJvcihgVW5zdXBwb3J0ZWQgcmlwZ3JlcCBwbGF0Zm9ybTogJHtwbGF0Zm9ybX0tJHthcmNofWApOwogIGNvbnN0IFtuYW1lLCBzaGEyNTZdID0gc2VsZWN0ZWQ7CiAgY29uc3QgZGlyZWN0b3J5ID0gbmFtZS5yZXBsYWNlKC9cLig/OnRhclwuZ3p8emlwKSQvLCAnJyk7CiAgcmV0dXJuIHsgbmFtZSwgc2hhMjU2LCBlbnRyeTogYCR7ZGlyZWN0b3J5fS8ke3BsYXRmb3JtID09PSAnd2luMzInID8gJ3JnLmV4ZScgOiAncmcnfWAgfTsKfQoKZnVuY3Rpb24gY3JjMzIoYnl0ZXMpIHsKICBsZXQgY3JjID0gMHhmZmZmZmZmZjsKICBmb3IgKGNvbnN0IGJ5dGUgb2YgYnl0ZXMpIHsKICAgIGNyYyBePSBieXRlOwogICAgZm9yIChsZXQgYml0ID0gMDsgYml0IDwgODsgYml0KyspIGNyYyA9IChjcmMgPj4+IDEpIF4gKDB4ZWRiODgzMjAgJiAtKGNyYyAmIDEpKTsKICB9CiAgcmV0dXJuIChjcmMgXiAweGZmZmZmZmZmKSA+Pj4gMDsKfQoKZnVuY3Rpb24gY2hlY2tlZFJhbmdlKHN0YXJ0LCBzaXplLCBsaW1pdCwgbGFiZWwpIHsKICBpZiAoIU51bWJlci5pc1NhZmVJbnRlZ2VyKHN0YXJ0KSB8fCAhTnVtYmVyLmlzU2FmZUludGVnZXIoc2l6ZSkgfHwgc3RhcnQgPCAwIHx8IHNpemUgPCAwIHx8IHN0YXJ0ID4gbGltaXQgfHwgc2l6ZSA+IGxpbWl0IC0gc3RhcnQpIHsKICAgIHRocm93IG5ldyBFcnJvcihgWklQICR7bGFiZWx9IGlzIG91dCBvZiBib3VuZHNgKTsKICB9CiAgcmV0dXJuIHN0YXJ0ICsgc2l6ZTsKfQoKYXN5bmMgZnVuY3Rpb24gZXh0cmFjdFppcChieXRlcywgZXhwZWN0ZWRFbnRyeSkgewogIGlmIChieXRlcy5sZW5ndGggPCAyMikgdGhyb3cgbmV3IEVycm9yKCdaSVAgZW5kIG9mIGNlbnRyYWwgZGlyZWN0b3J5IGlzIG1pc3NpbmcnKTsKICBjb25zdCB2aWV3ID0gbmV3IERhdGFWaWV3KGJ5dGVzLmJ1ZmZlciwgYnl0ZXMuYnl0ZU9mZnNldCwgYnl0ZXMuYnl0ZUxlbmd0aCk7CiAgbGV0IGVvY2QgPSAtMTsKICBjb25zdCBzZWFyY2hTdGFydCA9IE1hdGgubWF4KDAsIGJ5dGVzLmxlbmd0aCAtIDIyIC0gMHhmZmZmKTsKICBmb3IgKGxldCBvZmZzZXQgPSBieXRlcy5sZW5ndGggLSAyMjsgb2Zmc2V0ID49IHNlYXJjaFN0YXJ0OyBvZmZzZXQtLSkgewogICAgaWYgKHZpZXcuZ2V0VWludDMyKG9mZnNldCwgdHJ1ZSkgPT09IDB4MDYwNTRiNTApIHsKICAgICAgY29uc3QgY29tbWVudExlbmd0aCA9IHZpZXcuZ2V0VWludDE2KG9mZnNldCArIDIwLCB0cnVlKTsKICAgICAgaWYgKG9mZnNldCArIDIyICsgY29tbWVudExlbmd0aCA9PT0gYnl0ZXMubGVuZ3RoKSB7IGVvY2QgPSBvZmZzZXQ7IGJyZWFrOyB9CiAgICB9CiAgfQogIGlmIChlb2NkIDwgMCkgdGhyb3cgbmV3IEVycm9yKCdaSVAgZW5kIG9mIGNlbnRyYWwgZGlyZWN0b3J5IGlzIG1pc3Npbmcgb3IgbWFsZm9ybWVkJyk7CiAgaWYgKHZpZXcuZ2V0VWludDE2KGVvY2QgKyA0LCB0cnVlKSAhPT0gMCB8fCB2aWV3LmdldFVpbnQxNihlb2NkICsgNiwgdHJ1ZSkgIT09IDApIHRocm93IG5ldyBFcnJvcignTXVsdGktZGlzayBaSVAgYXJjaGl2ZXMgYXJlIHVuc3VwcG9ydGVkJyk7CiAgY29uc3QgZW50cmllcyA9IHZpZXcuZ2V0VWludDE2KGVvY2QgKyAxMCwgdHJ1ZSk7CiAgaWYgKGVudHJpZXMgIT09IHZpZXcuZ2V0VWludDE2KGVvY2QgKyA4LCB0cnVlKSB8fCBlbnRyaWVzID09PSAweGZmZmYpIHRocm93IG5ldyBFcnJvcignWklQIGNlbnRyYWwgZGlyZWN0b3J5IGVudHJ5IGNvdW50IGlzIGludmFsaWQnKTsKICBjb25zdCBjZW50cmFsU2l6ZSA9IHZpZXcuZ2V0VWludDMyKGVvY2QgKyAxMiwgdHJ1ZSk7CiAgY29uc3QgY2VudHJhbE9mZnNldCA9IHZpZXcuZ2V0VWludDMyKGVvY2QgKyAxNiwgdHJ1ZSk7CiAgY29uc3QgY2VudHJhbEVuZCA9IGNoZWNrZWRSYW5nZShjZW50cmFsT2Zmc2V0LCBjZW50cmFsU2l6ZSwgZW9jZCwgJ2NlbnRyYWwgZGlyZWN0b3J5Jyk7CiAgbGV0IGN1cnNvciA9IGNlbnRyYWxPZmZzZXQ7CiAgbGV0IHNlbGVjdGVkID0gbnVsbDsKICBjb25zdCBkZWNvZGVyID0gbmV3IFRleHREZWNvZGVyKCd1dGYtOCcsIHsgZmF0YWw6IHRydWUgfSk7CiAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGVudHJpZXM7IGluZGV4KyspIHsKICAgIGNoZWNrZWRSYW5nZShjdXJzb3IsIDQ2LCBjZW50cmFsRW5kLCAnY2VudHJhbCBlbnRyeSBoZWFkZXInKTsKICAgIGlmICh2aWV3LmdldFVpbnQzMihjdXJzb3IsIHRydWUpICE9PSAweDAyMDE0YjUwKSB0aHJvdyBuZXcgRXJyb3IoJ1pJUCBjZW50cmFsIGRpcmVjdG9yeSBzaWduYXR1cmUgaXMgaW52YWxpZCcpOwogICAgY29uc3QgZmxhZ3MgPSB2aWV3LmdldFVpbnQxNihjdXJzb3IgKyA4LCB0cnVlKTsKICAgIGNvbnN0IG1ldGhvZCA9IHZpZXcuZ2V0VWludDE2KGN1cnNvciArIDEwLCB0cnVlKTsKICAgIGNvbnN0IGV4cGVjdGVkQ3JjID0gdmlldy5nZXRVaW50MzIoY3Vyc29yICsgMTYsIHRydWUpOwogICAgY29uc3QgY29tcHJlc3NlZFNpemUgPSB2aWV3LmdldFVpbnQzMihjdXJzb3IgKyAyMCwgdHJ1ZSk7CiAgICBjb25zdCB1bmNvbXByZXNzZWRTaXplID0gdmlldy5nZXRVaW50MzIoY3Vyc29yICsgMjQsIHRydWUpOwogICAgY29uc3QgbmFtZUxlbmd0aCA9IHZpZXcuZ2V0VWludDE2KGN1cnNvciArIDI4LCB0cnVlKTsKICAgIGNvbnN0IGV4dHJhTGVuZ3RoID0gdmlldy5nZXRVaW50MTYoY3Vyc29yICsgMzAsIHRydWUpOwogICAgY29uc3QgY29tbWVudExlbmd0aCA9IHZpZXcuZ2V0VWludDE2KGN1cnNvciArIDMyLCB0cnVlKTsKICAgIGNvbnN0IGxvY2FsT2Zmc2V0ID0gdmlldy5nZXRVaW50MzIoY3Vyc29yICsgNDIsIHRydWUpOwogICAgaWYgKGZsYWdzICYgMHg0MSkgdGhyb3cgbmV3IEVycm9yKCdFbmNyeXB0ZWQgWklQIGVudHJpZXMgYXJlIHVuc3VwcG9ydGVkJyk7CiAgICBpZiAobWV0aG9kICE9PSAwICYmIG1ldGhvZCAhPT0gOCkgdGhyb3cgbmV3IEVycm9yKGBVbnN1cHBvcnRlZCBaSVAgY29tcHJlc3Npb24gbWV0aG9kOiAke21ldGhvZH1gKTsKICAgIGlmIChjb21wcmVzc2VkU2l6ZSA9PT0gMHhmZmZmZmZmZiB8fCB1bmNvbXByZXNzZWRTaXplID09PSAweGZmZmZmZmZmIHx8IGxvY2FsT2Zmc2V0ID09PSAweGZmZmZmZmZmKSB0aHJvdyBuZXcgRXJyb3IoJ1pJUDY0IGVudHJpZXMgYXJlIHVuc3VwcG9ydGVkJyk7CiAgICBpZiAodW5jb21wcmVzc2VkU2l6ZSA+IE1BWF9CSU5BUllfQllURVMpIHRocm93IG5ldyBFcnJvcignWklQIGV4ZWN1dGFibGUgc2l6ZSBleGNlZWRzIHRoZSBzYWZldHkgbGltaXQnKTsKICAgIGNvbnN0IHJlY29yZEVuZCA9IGNoZWNrZWRSYW5nZShjdXJzb3IgKyA0NiwgbmFtZUxlbmd0aCArIGV4dHJhTGVuZ3RoICsgY29tbWVudExlbmd0aCwgY2VudHJhbEVuZCwgJ2NlbnRyYWwgZW50cnknKTsKICAgIGxldCBuYW1lOwogICAgdHJ5IHsgbmFtZSA9IGRlY29kZXIuZGVjb2RlKGJ5dGVzLnN1YmFycmF5KGN1cnNvciArIDQ2LCBjdXJzb3IgKyA0NiArIG5hbWVMZW5ndGgpKTsgfQogICAgY2F0Y2ggeyB0aHJvdyBuZXcgRXJyb3IoJ1pJUCBlbnRyeSBuYW1lIGlzIG5vdCB2YWxpZCBVVEYtOCcpOyB9CiAgICBpZiAoIXNhZmVBcmNoaXZlUGF0aChuYW1lKSkgdGhyb3cgbmV3IEVycm9yKGBVbnNhZmUgWklQIHBhdGg6ICR7bmFtZX1gKTsKICAgIGlmIChuYW1lID09PSBleHBlY3RlZEVudHJ5KSB7CiAgICAgIGlmIChzZWxlY3RlZCkgdGhyb3cgbmV3IEVycm9yKGBaSVAgY29udGFpbnMgZHVwbGljYXRlIGV4YWN0IGVudHJ5OiAke2V4cGVjdGVkRW50cnl9YCk7CiAgICAgIHNlbGVjdGVkID0geyBmbGFncywgbWV0aG9kLCBleHBlY3RlZENyYywgY29tcHJlc3NlZFNpemUsIHVuY29tcHJlc3NlZFNpemUsIGxvY2FsT2Zmc2V0LCBuYW1lIH07CiAgICB9CiAgICBjdXJzb3IgPSByZWNvcmRFbmQ7CiAgfQogIGlmIChjdXJzb3IgIT09IGNlbnRyYWxFbmQpIHRocm93IG5ldyBFcnJvcignWklQIGNlbnRyYWwgZGlyZWN0b3J5IHNpemUgZG9lcyBub3QgbWF0Y2ggaXRzIGVudHJpZXMnKTsKICBpZiAoIXNlbGVjdGVkKSB0aHJvdyBuZXcgRXJyb3IoYFpJUCBpcyBtaXNzaW5nIGV4YWN0IGVudHJ5OiAke2V4cGVjdGVkRW50cnl9YCk7CgogIGNoZWNrZWRSYW5nZShzZWxlY3RlZC5sb2NhbE9mZnNldCwgMzAsIGNlbnRyYWxPZmZzZXQsICdsb2NhbCBoZWFkZXInKTsKICBpZiAodmlldy5nZXRVaW50MzIoc2VsZWN0ZWQubG9jYWxPZmZzZXQsIHRydWUpICE9PSAweDA0MDM0YjUwKSB0aHJvdyBuZXcgRXJyb3IoJ1pJUCBsb2NhbCBoZWFkZXIgc2lnbmF0dXJlIGlzIGludmFsaWQnKTsKICBjb25zdCBsb2NhbEZsYWdzID0gdmlldy5nZXRVaW50MTYoc2VsZWN0ZWQubG9jYWxPZmZzZXQgKyA2LCB0cnVlKTsKICBjb25zdCBsb2NhbE1ldGhvZCA9IHZpZXcuZ2V0VWludDE2KHNlbGVjdGVkLmxvY2FsT2Zmc2V0ICsgOCwgdHJ1ZSk7CiAgY29uc3QgbG9jYWxDcmMgPSB2aWV3LmdldFVpbnQzMihzZWxlY3RlZC5sb2NhbE9mZnNldCArIDE0LCB0cnVlKTsKICBjb25zdCBsb2NhbENvbXByZXNzZWRTaXplID0gdmlldy5nZXRVaW50MzIoc2VsZWN0ZWQubG9jYWxPZmZzZXQgKyAxOCwgdHJ1ZSk7CiAgY29uc3QgbG9jYWxVbmNvbXByZXNzZWRTaXplID0gdmlldy5nZXRVaW50MzIoc2VsZWN0ZWQubG9jYWxPZmZzZXQgKyAyMiwgdHJ1ZSk7CiAgY29uc3QgbG9jYWxOYW1lTGVuZ3RoID0gdmlldy5nZXRVaW50MTYoc2VsZWN0ZWQubG9jYWxPZmZzZXQgKyAyNiwgdHJ1ZSk7CiAgY29uc3QgbG9jYWxFeHRyYUxlbmd0aCA9IHZpZXcuZ2V0VWludDE2KHNlbGVjdGVkLmxvY2FsT2Zmc2V0ICsgMjgsIHRydWUpOwogIGlmIChsb2NhbEZsYWdzICE9PSBzZWxlY3RlZC5mbGFncyB8fCBsb2NhbE1ldGhvZCAhPT0gc2VsZWN0ZWQubWV0aG9kKSB0aHJvdyBuZXcgRXJyb3IoJ1pJUCBsb2NhbCBoZWFkZXIgZGlzYWdyZWVzIHdpdGggY2VudHJhbCBkaXJlY3RvcnknKTsKICBpZiAoIShzZWxlY3RlZC5mbGFncyAmIDgpICYmIChsb2NhbENyYyAhPT0gc2VsZWN0ZWQuZXhwZWN0ZWRDcmMgfHwgbG9jYWxDb21wcmVzc2VkU2l6ZSAhPT0gc2VsZWN0ZWQuY29tcHJlc3NlZFNpemUgfHwgbG9jYWxVbmNvbXByZXNzZWRTaXplICE9PSBzZWxlY3RlZC51bmNvbXByZXNzZWRTaXplKSkgewogICAgdGhyb3cgbmV3IEVycm9yKCdaSVAgbG9jYWwgaGVhZGVyIGRpc2FncmVlcyB3aXRoIGNlbnRyYWwgZGlyZWN0b3J5Jyk7CiAgfQogIGNvbnN0IGRhdGFTdGFydCA9IGNoZWNrZWRSYW5nZShzZWxlY3RlZC5sb2NhbE9mZnNldCArIDMwLCBsb2NhbE5hbWVMZW5ndGggKyBsb2NhbEV4dHJhTGVuZ3RoLCBjZW50cmFsT2Zmc2V0LCAnbG9jYWwgbmFtZSBhbmQgZXh0cmEgZGF0YScpOwogIGNvbnN0IGRhdGFFbmQgPSBjaGVja2VkUmFuZ2UoZGF0YVN0YXJ0LCBzZWxlY3RlZC5jb21wcmVzc2VkU2l6ZSwgY2VudHJhbE9mZnNldCwgJ2NvbXByZXNzZWQgZGF0YScpOwogIGxldCBsb2NhbE5hbWU7CiAgdHJ5IHsgbG9jYWxOYW1lID0gZGVjb2Rlci5kZWNvZGUoYnl0ZXMuc3ViYXJyYXkoc2VsZWN0ZWQubG9jYWxPZmZzZXQgKyAzMCwgc2VsZWN0ZWQubG9jYWxPZmZzZXQgKyAzMCArIGxvY2FsTmFtZUxlbmd0aCkpOyB9CiAgY2F0Y2ggeyB0aHJvdyBuZXcgRXJyb3IoJ1pJUCBsb2NhbCBlbnRyeSBuYW1lIGlzIG5vdCB2YWxpZCBVVEYtOCcpOyB9CiAgaWYgKGxvY2FsTmFtZSAhPT0gc2VsZWN0ZWQubmFtZSkgdGhyb3cgbmV3IEVycm9yKCdaSVAgbG9jYWwgZW50cnkgbmFtZSBkaXNhZ3JlZXMgd2l0aCBjZW50cmFsIGRpcmVjdG9yeScpOwogIGNvbnN0IGNvbXByZXNzZWQgPSBieXRlcy5zdWJhcnJheShkYXRhU3RhcnQsIGRhdGFFbmQpOwogIGxldCBvdXRwdXQ7CiAgdHJ5IHsKICAgIG91dHB1dCA9IHNlbGVjdGVkLm1ldGhvZCA9PT0gMCA/IG5ldyBVaW50OEFycmF5KGNvbXByZXNzZWQpIDogbmV3IFVpbnQ4QXJyYXkoQnVuLmluZmxhdGVTeW5jKGNvbXByZXNzZWQpKTsKICB9IGNhdGNoIHsKICAgIHRocm93IG5ldyBFcnJvcignWklQIGRlZmxhdGUgc3RyZWFtIGlzIG1hbGZvcm1lZCcpOwogIH0KICBpZiAob3V0cHV0Lmxlbmd0aCAhPT0gc2VsZWN0ZWQudW5jb21wcmVzc2VkU2l6ZSkgdGhyb3cgbmV3IEVycm9yKCdaSVAgdW5jb21wcmVzc2VkIHNpemUgbWlzbWF0Y2gnKTsKICBpZiAoY3JjMzIob3V0cHV0KSAhPT0gc2VsZWN0ZWQuZXhwZWN0ZWRDcmMpIHRocm93IG5ldyBFcnJvcignWklQIENSQy0zMiBtaXNtYXRjaCcpOwogIHJldHVybiBvdXRwdXQ7Cn0KCmV4cG9ydCBhc3luYyBmdW5jdGlvbiBleHRyYWN0UmlwZ3JlcChieXRlcywgYXNzZXQpIHsKICBpZiAoIShieXRlcyBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkpKSB0aHJvdyBuZXcgRXJyb3IoJ3JpcGdyZXAgYXJjaGl2ZSBtdXN0IGJlIGJ5dGVzJyk7CiAgaWYgKCFhc3NldCB8fCB0eXBlb2YgYXNzZXQuZW50cnkgIT09ICdzdHJpbmcnIHx8ICFzYWZlQXJjaGl2ZVBhdGgoYXNzZXQuZW50cnkpKSB0aHJvdyBuZXcgRXJyb3IoJ3JpcGdyZXAgYXNzZXQgZW50cnkgaXMgaW52YWxpZCcpOwogIGlmIChhc3NldC5uYW1lLmVuZHNXaXRoKCcuemlwJykpIHJldHVybiBleHRyYWN0WmlwKGJ5dGVzLCBhc3NldC5lbnRyeSk7CiAgaWYgKCFhc3NldC5uYW1lLmVuZHNXaXRoKCcudGFyLmd6JykpIHRocm93IG5ldyBFcnJvcihgVW5zdXBwb3J0ZWQgcmlwZ3JlcCBhcmNoaXZlOiAke2Fzc2V0Lm5hbWV9YCk7CiAgbGV0IGZpbGVzOwogIHRyeSB7IGZpbGVzID0gYXdhaXQgbmV3IEJ1bi5BcmNoaXZlKGJ5dGVzKS5maWxlcygpOyB9CiAgY2F0Y2ggeyB0aHJvdyBuZXcgRXJyb3IoJ3JpcGdyZXAgdGFyLmd6IGFyY2hpdmUgaXMgbWFsZm9ybWVkJyk7IH0KICBmb3IgKGNvbnN0IG5hbWUgb2YgZmlsZXMua2V5cygpKSB7CiAgICBpZiAoIXNhZmVBcmNoaXZlUGF0aChuYW1lKSkgdGhyb3cgbmV3IEVycm9yKGBVbnNhZmUgYXJjaGl2ZSBwYXRoOiAke25hbWV9YCk7CiAgfQogIGNvbnN0IGZpbGUgPSBmaWxlcy5nZXQoYXNzZXQuZW50cnkpOwogIGlmICghZmlsZSkgdGhyb3cgbmV3IEVycm9yKGB0YXIuZ3ogaXMgbWlzc2luZyBleGFjdCBlbnRyeTogJHthc3NldC5lbnRyeX1gKTsKICBpZiAoZmlsZS5zaXplID4gTUFYX0JJTkFSWV9CWVRFUykgdGhyb3cgbmV3IEVycm9yKCdyaXBncmVwIGV4ZWN1dGFibGUgc2l6ZSBleGNlZWRzIHRoZSBzYWZldHkgbGltaXQnKTsKICByZXR1cm4gbmV3IFVpbnQ4QXJyYXkoYXdhaXQgZmlsZS5hcnJheUJ1ZmZlcigpKTsKfQoKZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlUmlwZ3JlcFZlcnNpb24ocGF0aCwgc3Bhd25JbXBsID0gQnVuLnNwYXduU3luYykgewogIGNvbnN0IHJlc3VsdCA9IHNwYXduSW1wbChbcGF0aCwgJy0tdmVyc2lvbiddLCB7IHN0ZG91dDogJ3BpcGUnLCBzdGRlcnI6ICdwaXBlJyB9KTsKICBjb25zdCBvdXRwdXQgPSB0eXBlb2YgcmVzdWx0LnN0ZG91dCA9PT0gJ3N0cmluZycgPyByZXN1bHQuc3Rkb3V0IDogQnVmZmVyLmZyb20ocmVzdWx0LnN0ZG91dCB8fCBbXSkudG9TdHJpbmcoKTsKICBpZiAocmVzdWx0LmV4aXRDb2RlICE9PSAwIHx8ICEvXnJpcGdyZXAgMTVcLjJcLjAoPzogXChyZXYgWzAtOUEtRmEtZl0rXCkpPyg/OlxyP1xufCQpLy50ZXN0KG91dHB1dCkpIHsKICAgIHRocm93IG5ldyBFcnJvcihgcmlwZ3JlcCAke1JJUEdSRVBfVkVSU0lPTn0gdmVyc2lvbiBzbW9rZSBmYWlsZWRgKTsKICB9Cn0KCmZ1bmN0aW9uIGFzc2VydENvbnRhaW5lZE1hbmFnZWRQYXRoKHJvb3QsIHBhdGgpIHsKICBjb25zdCBjaGlsZCA9IHJlbGF0aXZlKHJlc29sdmUocm9vdCksIHJlc29sdmUocGF0aCkpOwogIGlmICghY2hpbGQgfHwgY2hpbGQgPT09ICcuLicgfHwgY2hpbGQuc3RhcnRzV2l0aChgLi4ke3NlcH1gKSB8fCBpc0Fic29sdXRlKGNoaWxkKSkgewogICAgdGhyb3cgbmV3IEVycm9yKGBNYW5hZ2VkIHJpcGdyZXAgcGF0aCBlc2NhcGVkIGl0cyByb290OiAke3BhdGh9YCk7CiAgfQp9CgpmdW5jdGlvbiBhc3NlcnROb3RTeW1ib2xpY0xpbmsocGF0aCwgZnNPcHMgPSB7fSkgewogIGNvbnN0IGluc3BlY3QgPSBmc09wcy5sc3RhdFN5bmMgfHwgbHN0YXRTeW5jOwogIHRyeSB7CiAgICBpZiAoaW5zcGVjdChwYXRoKS5pc1N5bWJvbGljTGluaygpKSB0aHJvdyBuZXcgRXJyb3IoYE1hbmFnZWQgcmlwZ3JlcCBwYXRoIG11c3Qgbm90IGJlIGEgc3ltYm9saWMgbGluazogJHtwYXRofWApOwogIH0gY2F0Y2ggKGVycm9yKSB7CiAgICBpZiAoZXJyb3I/LmNvZGUgIT09ICdFTk9FTlQnKSB0aHJvdyBlcnJvcjsKICB9Cn0KCmZ1bmN0aW9uIGlzVmFsaWRSaXBncmVwQ2FuZGlkYXRlKHBhdGgsIGZzT3BzLCBzcGF3bkltcGwpIHsKICBpZiAoIWZzT3BzLmV4aXN0c1N5bmMocGF0aCkpIHJldHVybiBmYWxzZTsKICB0cnkgewogICAgdmFsaWRhdGVSaXBncmVwVmVyc2lvbihwYXRoLCBzcGF3bkltcGwpOwogICAgcmV0dXJuIHRydWU7CiAgfSBjYXRjaCB7CiAgICByZXR1cm4gZmFsc2U7CiAgfQp9CgpleHBvcnQgZnVuY3Rpb24gcmVwbGFjZU1hbmFnZWRCaW5hcnkoc3RhZ2VkLCB0YXJnZXQsIGZzT3BzID0geyBleGlzdHNTeW5jLCBsc3RhdFN5bmMsIHJlbmFtZVN5bmMsIHJtU3luYyB9LCBzcGF3bkltcGwgPSBCdW4uc3Bhd25TeW5jKSB7CiAgY29uc3QgYmFja3VwID0gYCR7dGFyZ2V0fS5wcmV2aW91c2A7CiAgY29uc3QgZGlzcGxhY2VkID0gYCR7dGFyZ2V0fS4ke3Byb2Nlc3MucGlkfS5jdXJyZW50YDsKICBmb3IgKGNvbnN0IHBhdGggb2YgW3N0YWdlZCwgdGFyZ2V0LCBiYWNrdXAsIGRpc3BsYWNlZF0pIGFzc2VydE5vdFN5bWJvbGljTGluayhwYXRoLCBmc09wcyk7CiAgaWYgKGZzT3BzLmV4aXN0c1N5bmMoZGlzcGxhY2VkKSkgdGhyb3cgbmV3IEVycm9yKGBNYW5hZ2VkIHJpcGdyZXAgdHJhbnNhY3Rpb24gcGF0aCBhbHJlYWR5IGV4aXN0czogJHtkaXNwbGFjZWR9YCk7CiAgY29uc3QgY3VycmVudFZhbGlkID0gaXNWYWxpZFJpcGdyZXBDYW5kaWRhdGUodGFyZ2V0LCBmc09wcywgc3Bhd25JbXBsKTsKICBjb25zdCBiYWNrdXBWYWxpZCA9IGlzVmFsaWRSaXBncmVwQ2FuZGlkYXRlKGJhY2t1cCwgZnNPcHMsIHNwYXduSW1wbCk7CiAgbGV0IG1vdmVkQ3VycmVudCA9IGZhbHNlOwogIHRyeSB7CiAgICBpZiAoZnNPcHMuZXhpc3RzU3luYyh0YXJnZXQpKSB7CiAgICAgIGZzT3BzLnJlbmFtZVN5bmModGFyZ2V0LCBkaXNwbGFjZWQpOwogICAgICBtb3ZlZEN1cnJlbnQgPSB0cnVlOwogICAgfQogICAgdHJ5IHsKICAgICAgZnNPcHMucmVuYW1lU3luYyhzdGFnZWQsIHRhcmdldCk7CiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBpZiAoZnNPcHMuZXhpc3RzU3luYyh0YXJnZXQpKSBmc09wcy5ybVN5bmModGFyZ2V0LCB7IGZvcmNlOiB0cnVlIH0pOwogICAgICBpZiAoY3VycmVudFZhbGlkICYmIG1vdmVkQ3VycmVudCAmJiBmc09wcy5leGlzdHNTeW5jKGRpc3BsYWNlZCkpIGZzT3BzLnJlbmFtZVN5bmMoZGlzcGxhY2VkLCB0YXJnZXQpOwogICAgICBlbHNlIGlmIChiYWNrdXBWYWxpZCAmJiBmc09wcy5leGlzdHNTeW5jKGJhY2t1cCkpIGZzT3BzLnJlbmFtZVN5bmMoYmFja3VwLCB0YXJnZXQpOwogICAgICBpZiAoZnNPcHMuZXhpc3RzU3luYyhiYWNrdXApKSBmc09wcy5ybVN5bmMoYmFja3VwLCB7IGZvcmNlOiB0cnVlIH0pOwogICAgICBpZiAoZnNPcHMuZXhpc3RzU3luYyhkaXNwbGFjZWQpKSBmc09wcy5ybVN5bmMoZGlzcGxhY2VkLCB7IGZvcmNlOiB0cnVlIH0pOwogICAgICB0aHJvdyBlcnJvcjsKICAgIH0KICAgIGZzT3BzLnJtU3luYyhiYWNrdXAsIHsgZm9yY2U6IHRydWUgfSk7CiAgICBpZiAoZnNPcHMuZXhpc3RzU3luYyhkaXNwbGFjZWQpKSBmc09wcy5ybVN5bmMoZGlzcGxhY2VkLCB7IGZvcmNlOiB0cnVlIH0pOwogIH0gZmluYWxseSB7CiAgICBpZiAoZnNPcHMuZXhpc3RzU3luYyhzdGFnZWQpKSBmc09wcy5ybVN5bmMoc3RhZ2VkLCB7IGZvcmNlOiB0cnVlIH0pOwogIH0KfQoKZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGVuc3VyZVJpcGdyZXAocm9vdCwgb3B0aW9ucyA9IHt9KSB7CiAgaWYgKHR5cGVvZiByb290ICE9PSAnc3RyaW5nJyB8fCAhcm9vdC50cmltKCkpIHRocm93IG5ldyBFcnJvcignbWFuYWdlZCByaXBncmVwIHJvb3QgaXMgcmVxdWlyZWQnKTsKICBjb25zdCBwbGF0Zm9ybSA9IG9wdGlvbnMucGxhdGZvcm0gfHwgcHJvY2Vzcy5wbGF0Zm9ybTsKICBjb25zdCBhcmNoID0gb3B0aW9ucy5hcmNoIHx8IHByb2Nlc3MuYXJjaDsKICBjb25zdCBhc3NldCA9IHNlbGVjdFJpcGdyZXBBc3NldChwbGF0Zm9ybSwgYXJjaCk7CiAgY29uc3QgdmVuZG9yRGlyID0gam9pbihyb290LCAndmVuZG9yJyk7CiAgY29uc3QgcmlwZ3JlcERpciA9IGpvaW4odmVuZG9yRGlyLCAncmlwZ3JlcCcpOwogIGNvbnN0IGJpbkRpciA9IGpvaW4ocmlwZ3JlcERpciwgJ2JpbicpOwogIGNvbnN0IHRhcmdldCA9IGpvaW4oYmluRGlyLCBwbGF0Zm9ybSA9PT0gJ3dpbjMyJyA/ICdyZy5leGUnIDogJ3JnJyk7CiAgY29uc3Qgc3RhZ2VkID0gYCR7dGFyZ2V0fS4ke3Byb2Nlc3MucGlkfS5zdGFnZWRgOwogIGNvbnN0IGJhY2t1cCA9IGAke3RhcmdldH0ucHJldmlvdXNgOwogIGNvbnN0IGRpc3BsYWNlZCA9IGAke3RhcmdldH0uJHtwcm9jZXNzLnBpZH0uY3VycmVudGA7CiAgY29uc3Qgcm9vdFBhdGggPSByZXNvbHZlKHJvb3QpOwogIGNvbnN0IG1hbmFnZWRQYXRocyA9IFt2ZW5kb3JEaXIsIHJpcGdyZXBEaXIsIGJpbkRpciwgdGFyZ2V0LCBzdGFnZWQsIGJhY2t1cCwgZGlzcGxhY2VkXTsKICBmb3IgKGNvbnN0IHBhdGggb2YgbWFuYWdlZFBhdGhzKSB7CiAgICBhc3NlcnRDb250YWluZWRNYW5hZ2VkUGF0aChyb290UGF0aCwgcGF0aCk7CiAgICBhc3NlcnROb3RTeW1ib2xpY0xpbmsocGF0aCwgb3B0aW9ucy5mc09wcyk7CiAgfQogIGNvbnN0IHNwYXduSW1wbCA9IG9wdGlvbnMuc3Bhd25JbXBsIHx8IEJ1bi5zcGF3blN5bmM7CiAgaWYgKGV4aXN0c1N5bmModGFyZ2V0KSkgewogICAgdHJ5IHsgdmFsaWRhdGVSaXBncmVwVmVyc2lvbih0YXJnZXQsIHNwYXduSW1wbCk7IHJldHVybiB0YXJnZXQ7IH0KICAgIGNhdGNoIHt9CiAgfQoKICBjb25zdCBmZXRjaEltcGwgPSBvcHRpb25zLmZldGNoSW1wbCB8fCBmZXRjaDsKICBjb25zdCBlbnYgPSBvcHRpb25zLmVudiB8fCBwcm9jZXNzLmVudjsKICBjb25zdCB1cmwgPSBgaHR0cHM6Ly9naXRodWIuY29tL0J1cm50U3VzaGkvcmlwZ3JlcC9yZWxlYXNlcy9kb3dubG9hZC8ke1JJUEdSRVBfVkVSU0lPTn0vJHthc3NldC5uYW1lfWA7CiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaFdpdGhQcm94eSh1cmwsIHt9LCBlbnYsIGZldGNoSW1wbCk7CiAgY29uc3QgYXJjaGl2ZSA9IG5ldyBVaW50OEFycmF5KGF3YWl0IHJlc3BvbnNlLmFycmF5QnVmZmVyKCkpOwogIGNvbnN0IGFjdHVhbCA9IG5ldyBCdW4uQ3J5cHRvSGFzaGVyKCdzaGEyNTYnKS51cGRhdGUoYXJjaGl2ZSkuZGlnZXN0KCdoZXgnKTsKICBpZiAoYWN0dWFsICE9PSBhc3NldC5zaGEyNTYpIHRocm93IG5ldyBFcnJvcihgU0hBLTI1NiBtaXNtYXRjaCBmb3IgJHthc3NldC5uYW1lfWApOwogIGNvbnN0IGV4ZWN1dGFibGUgPSBhd2FpdCBleHRyYWN0UmlwZ3JlcChhcmNoaXZlLCBhc3NldCk7CgogIG1rZGlyU3luYyhiaW5EaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pOwogIGZvciAoY29uc3QgcGF0aCBvZiBtYW5hZ2VkUGF0aHMpIGFzc2VydE5vdFN5bWJvbGljTGluayhwYXRoLCBvcHRpb25zLmZzT3BzKTsKICBybVN5bmMoc3RhZ2VkLCB7IGZvcmNlOiB0cnVlIH0pOwogIHRyeSB7CiAgICBhd2FpdCBCdW4ud3JpdGUoc3RhZ2VkLCBleGVjdXRhYmxlKTsKICAgIGlmIChwbGF0Zm9ybSAhPT0gJ3dpbjMyJykgY2htb2RTeW5jKHN0YWdlZCwgMG83NTUpOwogICAgdmFsaWRhdGVSaXBncmVwVmVyc2lvbihzdGFnZWQsIHNwYXduSW1wbCk7CiAgICByZXBsYWNlTWFuYWdlZEJpbmFyeShzdGFnZWQsIHRhcmdldCwgb3B0aW9ucy5mc09wcywgc3Bhd25JbXBsKTsKICAgIHJldHVybiB0YXJnZXQ7CiAgfSBmaW5hbGx5IHsKICAgIGFzc2VydE5vdFN5bWJvbGljTGluayhzdGFnZWQsIG9wdGlvbnMuZnNPcHMpOwogICAgaWYgKGV4aXN0c1N5bmMoc3RhZ2VkKSkgcm1TeW5jKHN0YWdlZCwgeyBmb3JjZTogdHJ1ZSB9KTsKICB9Cn0KCmlmIChpbXBvcnQubWV0YS5tYWluKSB7CiAgY29uc3Qgcm9vdCA9IHByb2Nlc3MuYXJndlsyXTsKICBjb25zdCB0YXJnZXQgPSBhd2FpdCBlbnN1cmVSaXBncmVwKHJvb3QpOwogIGNvbnNvbGUubG9nKGByaXBncmVwICR7UklQR1JFUF9WRVJTSU9OfTogJHt0YXJnZXR9YCk7Cn0K')
[System.IO.File]::WriteAllBytes((Join-Path $ClawDir "install-ripgrep.mjs"), $InstallRipgrepBytes)

$ripgrepOutput = & $BunBin (Join-Path $ClawDir "install-ripgrep.mjs") $ClawDir 2>&1
if ($LASTEXITCODE -ne 0) {
    $ripgrepOutput | ForEach-Object { Write-Err "$_" }
    Write-Err "Failed to install ClawGod-managed ripgrep."
    exit 1
}
$ripgrepOutput | ForEach-Object { Write-OK "$_" }

# ─── Handle -NoUpgrade (skip download, re-patch only) ────────────────
if ($NoUpgrade) {
    New-Item -ItemType Directory -Force -Path $ClawDir | Out-Null
    New-Item -ItemType Directory -Force -Path $BinDir  | Out-Null
    $existingCjs = Join-Path $ClawDir "cli.original.cjs"
    $existingBak = "$existingCjs.bak"
    if (-not (Test-Path $existingCjs)) {
        Write-Err "-NoUpgrade requires an existing installation."
        Write-Err "Run a full install first (without -NoUpgrade)."
        exit 1
    }
    if (Test-Path $existingBak) {
        Copy-Item $existingBak $existingCjs -Force
        Write-OK "Restored clean cli.original.cjs from backup"
    }
    Write-OK "Skipping download (-NoUpgrade)"
} else {

# ─── Locate native Bun binary (cli.js source) ──────────────────────────
# Source: npm registry (@anthropic-ai/claude-code-win32-<arch>).
# Local binary detection is intentionally skipped — see policy note below.

New-Item -ItemType Directory -Force -Path $ClawDir | Out-Null
New-Item -ItemType Directory -Force -Path $BinDir  | Out-Null
if (Install-ChromeFixScript) {
    Write-OK "Chrome fix helper installed (apply-claude-code-chrome-fix.ps1)"
} else {
    Write-Warn "Could not install Chrome fix helper; will try again after patching"
}

$NativeBin = $null
$NativeBinLabel = $null
$NativeBinTmpDir = $null

# Detect platform suffix
if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64" -or $env:PROCESSOR_ARCHITEW6432 -eq "ARM64") {
    $arch = "arm64"
} else {
    $arch = "x64"
}
$platformSuffix = "win32-$arch"

# Detection policy: ALWAYS pull from the npm registry @latest.
#
# Earlier versions of this script also probed local install directories
# (versions/, claude.orig, npm-global, bun-global) before falling back to
# the registry. Every one of those is a stale-source trap: clawgod patches
# out `claude update`, so users never re-run the underlying installers,
# and those directories freeze at whatever version was on disk the day
# clawgod was first installed. `claude update` (which is now redirected
# here) would re-detect the frozen binary forever — never reaching the
# registry. See INCIDENT_LOG 2026-04-29 entry. The fix is to skip local
# detection entirely; the npm tarball is ~60-90 MB compressed, fetched
# once per upgrade.

# npm registry — pull the platform tarball directly via Bun.
if (-not $NativeBin) {
    $npmPkg = "@anthropic-ai/claude-code-$platformSuffix"
    Write-Dim "Fetching $npmPkg@$Version from npm registry ..."
    $NativeBinTmpDir = Join-Path $env:TEMP "clawgod-binary-$([Guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Force -Path $NativeBinTmpDir | Out-Null
    $fetchScript = Join-Path $NativeBinTmpDir "fetch-package.mjs"
    $FetchPackageBytes = [Convert]::FromBase64String('IyEvdXNyL2Jpbi9lbnYgYnVuCmltcG9ydCB7IGNobW9kU3luYywgbWtkaXJTeW5jIH0gZnJvbSAnbm9kZTpmcyc7CmltcG9ydCB7IGpvaW4gfSBmcm9tICdub2RlOnBhdGgnOwoKY29uc3QgTUlOX0JJTkFSWV9CWVRFUyA9IDEwICogMTAyNCAqIDEwMjQ7CgpmdW5jdGlvbiBub1Byb3h5UnVsZSh2YWx1ZSkgewogIGxldCBlbnRyeSA9IHZhbHVlLnRyaW0oKS50b0xvd2VyQ2FzZSgpOwogIGlmIChlbnRyeSA9PT0gJyonKSByZXR1cm4geyBhbGw6IHRydWUgfTsKCiAgbGV0IGhvc3QgPSBlbnRyeTsKICBsZXQgcG9ydCA9ICcnOwogIGlmIChlbnRyeS5zdGFydHNXaXRoKCdbJykpIHsKICAgIGNvbnN0IGNsb3NlID0gZW50cnkuaW5kZXhPZignXScpOwogICAgaWYgKGNsb3NlID09PSAtMSkgcmV0dXJuIHsgaG9zdDogZW50cnksIHBvcnQgfTsKICAgIGhvc3QgPSBlbnRyeS5zbGljZSgxLCBjbG9zZSk7CiAgICBjb25zdCBzdWZmaXggPSBlbnRyeS5zbGljZShjbG9zZSArIDEpOwogICAgaWYgKC9eOlxkKyQvLnRlc3Qoc3VmZml4KSkgcG9ydCA9IHN1ZmZpeC5zbGljZSgxKTsKICAgIGVsc2UgaWYgKHN1ZmZpeCkgcmV0dXJuIHsgaG9zdDogZW50cnksIHBvcnQgfTsKICB9IGVsc2UgewogICAgY29uc3QgY29sb24gPSBlbnRyeS5sYXN0SW5kZXhPZignOicpOwogICAgaWYgKGNvbG9uID4gMCAmJiBjb2xvbiA9PT0gZW50cnkuaW5kZXhPZignOicpICYmIC9eXGQrJC8udGVzdChlbnRyeS5zbGljZShjb2xvbiArIDEpKSkgewogICAgICBob3N0ID0gZW50cnkuc2xpY2UoMCwgY29sb24pOwogICAgICBwb3J0ID0gZW50cnkuc2xpY2UoY29sb24gKyAxKTsKICAgIH0KICB9CiAgcmV0dXJuIHsgaG9zdDogaG9zdC5yZXBsYWNlKC9eXCpcLi8sICcuJyksIHBvcnQgfTsKfQoKZnVuY3Rpb24gYnlwYXNzZXNQcm94eSh1cmxWYWx1ZSwgZW52KSB7CiAgY29uc3QgcGFyc2VkID0gdHlwZW9mIHVybFZhbHVlID09PSAnc3RyaW5nJyA/IG5ldyBVUkwodXJsVmFsdWUpIDogdXJsVmFsdWU7CiAgY29uc3QgZW50cmllcyA9IChlbnYuTk9fUFJPWFkgfHwgZW52Lm5vX3Byb3h5IHx8ICcnKS5zcGxpdCgnLCcpLmZpbHRlcih2YWx1ZSA9PiB2YWx1ZS50cmltKCkpOwogIGNvbnN0IGhvc3QgPSBwYXJzZWQuaG9zdG5hbWUudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9eXFt8XF0kL2csICcnKTsKICBjb25zdCBwb3J0ID0gcGFyc2VkLnBvcnQgfHwgKHBhcnNlZC5wcm90b2NvbCA9PT0gJ2h0dHBzOicgPyAnNDQzJyA6IHBhcnNlZC5wcm90b2NvbCA9PT0gJ2h0dHA6JyA/ICc4MCcgOiAnJyk7CiAgcmV0dXJuIGVudHJpZXMuc29tZShlbnRyeSA9PiB7CiAgICBjb25zdCBydWxlID0gbm9Qcm94eVJ1bGUoZW50cnkpOwogICAgaWYgKHJ1bGUuYWxsKSByZXR1cm4gdHJ1ZTsKICAgIGNvbnN0IGJhc2VIb3N0ID0gcnVsZS5ob3N0LnJlcGxhY2UoL15cLi8sICcnKTsKICAgIGNvbnN0IG1hdGNoZXNIb3N0ID0gaG9zdCA9PT0gYmFzZUhvc3QgfHwgaG9zdC5lbmRzV2l0aChgLiR7YmFzZUhvc3R9YCk7CiAgICByZXR1cm4gbWF0Y2hlc0hvc3QgJiYgKCFydWxlLnBvcnQgfHwgcnVsZS5wb3J0ID09PSBwb3J0KTsKICB9KTsKfQoKZXhwb3J0IGZ1bmN0aW9uIHByb3h5Rm9yKHVybFZhbHVlLCBlbnYgPSBwcm9jZXNzLmVudikgewogIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsVmFsdWUpOwogIGlmIChieXBhc3Nlc1Byb3h5KHBhcnNlZCwgZW52KSkgcmV0dXJuIHVuZGVmaW5lZDsKICByZXR1cm4gcGFyc2VkLnByb3RvY29sID09PSAnaHR0cHM6JwogICAgPyBlbnYuSFRUUFNfUFJPWFkgfHwgZW52Lmh0dHBzX3Byb3h5IHx8IGVudi5IVFRQX1BST1hZIHx8IGVudi5odHRwX3Byb3h5CiAgICA6IGVudi5IVFRQX1BST1hZIHx8IGVudi5odHRwX3Byb3h5Owp9Cgphc3luYyBmdW5jdGlvbiBmZXRjaERpcmVjdCh1cmwsIGluaXQsIGZldGNoSW1wbCkgewogIGNvbnN0IHVwcGVyID0gT2JqZWN0Lmhhc093bihwcm9jZXNzLmVudiwgJ05PX1BST1hZJykgPyBwcm9jZXNzLmVudi5OT19QUk9YWSA6IHVuZGVmaW5lZDsKICBjb25zdCBsb3dlciA9IE9iamVjdC5oYXNPd24ocHJvY2Vzcy5lbnYsICdub19wcm94eScpID8gcHJvY2Vzcy5lbnYubm9fcHJveHkgOiB1bmRlZmluZWQ7CiAgdHJ5IHsKICAgIHByb2Nlc3MuZW52Lk5PX1BST1hZID0gJyonOwogICAgcHJvY2Vzcy5lbnYubm9fcHJveHkgPSAnKic7CiAgICByZXR1cm4gYXdhaXQgZmV0Y2hJbXBsKHVybCwgaW5pdCk7CiAgfSBmaW5hbGx5IHsKICAgIGlmICh1cHBlciA9PT0gdW5kZWZpbmVkKSBkZWxldGUgcHJvY2Vzcy5lbnYuTk9fUFJPWFk7CiAgICBlbHNlIHByb2Nlc3MuZW52Lk5PX1BST1hZID0gdXBwZXI7CiAgICBpZiAobG93ZXIgPT09IHVuZGVmaW5lZCkgZGVsZXRlIHByb2Nlc3MuZW52Lm5vX3Byb3h5OwogICAgZWxzZSBwcm9jZXNzLmVudi5ub19wcm94eSA9IGxvd2VyOwogIH0KfQoKZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZldGNoV2l0aFByb3h5KGluaXRpYWxVcmwsIGluaXQgPSB7fSwgZW52ID0gcHJvY2Vzcy5lbnYsIGZldGNoSW1wbCA9IGZldGNoKSB7CiAgbGV0IG5leHRVcmwgPSBpbml0aWFsVXJsOwogIGNvbnN0IHsgcHJveHk6IF9jYWxsZXJQcm94eSwgLi4uYmFzZUluaXQgfSA9IGluaXQ7CiAgZm9yIChsZXQgcmVkaXJlY3RzID0gMDsgcmVkaXJlY3RzIDw9IDU7IHJlZGlyZWN0cysrKSB7CiAgICBjb25zdCBieXBhc3MgPSBieXBhc3Nlc1Byb3h5KG5leHRVcmwsIGVudik7CiAgICBjb25zdCBwcm94eSA9IHByb3h5Rm9yKG5leHRVcmwsIGVudik7CiAgICBsZXQgcmVzcG9uc2U7CiAgICB0cnkgewogICAgICBjb25zdCByZXF1ZXN0SW5pdCA9IHsKICAgICAgICAuLi5iYXNlSW5pdCwKICAgICAgICByZWRpcmVjdDogJ21hbnVhbCcsCiAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDMwMDAwMCksCiAgICAgICAgLi4uKHByb3h5ID8geyBwcm94eSB9IDoge30pLAogICAgICB9OwogICAgICByZXNwb25zZSA9IGJ5cGFzcwogICAgICAgID8gYXdhaXQgZmV0Y2hEaXJlY3QobmV4dFVybCwgcmVxdWVzdEluaXQsIGZldGNoSW1wbCkKICAgICAgICA6IGF3YWl0IGZldGNoSW1wbChuZXh0VXJsLCByZXF1ZXN0SW5pdCk7CiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBpZiAocHJveHkpIHRocm93IG5ldyBFcnJvcignUmVxdWVzdCBmYWlsZWQgdGhyb3VnaCBjb25maWd1cmVkIHByb3h5Jyk7CiAgICAgIHRocm93IGVycm9yOwogICAgfQogICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA+PSAzMDAgJiYgcmVzcG9uc2Uuc3RhdHVzIDwgNDAwICYmIHJlc3BvbnNlLmhlYWRlcnMuaGFzKCdsb2NhdGlvbicpKSB7CiAgICAgIGlmIChyZWRpcmVjdHMgPT09IDUpIHRocm93IG5ldyBFcnJvcignVG9vIG1hbnkgcmVkaXJlY3RzJyk7CiAgICAgIG5leHRVcmwgPSBuZXcgVVJMKHJlc3BvbnNlLmhlYWRlcnMuZ2V0KCdsb2NhdGlvbicpLCBuZXh0VXJsKS5ocmVmOwogICAgICBjb250aW51ZTsKICAgIH0KICAgIGlmIChyZXNwb25zZS5zdGF0dXMgIT09IDIwMCkgdGhyb3cgbmV3IEVycm9yKGBSZXF1ZXN0IGZhaWxlZCB3aXRoIEhUVFAgJHtyZXNwb25zZS5zdGF0dXN9YCk7CiAgICByZXR1cm4gcmVzcG9uc2U7CiAgfQogIHRocm93IG5ldyBFcnJvcignVG9vIG1hbnkgcmVkaXJlY3RzJyk7Cn0KCmFzeW5jIGZ1bmN0aW9uIGNoZWNrZWRKc29uKHJlc3BvbnNlKSB7CiAgdHJ5IHsKICAgIHJldHVybiBhd2FpdCByZXNwb25zZS5qc29uKCk7CiAgfSBjYXRjaCB7CiAgICB0aHJvdyBuZXcgRXJyb3IoJ1JlZ2lzdHJ5IHJldHVybmVkIGludmFsaWQgSlNPTicpOwogIH0KfQoKZnVuY3Rpb24gb2JqZWN0UmVjb3JkKHZhbHVlKSB7CiAgcmV0dXJuIHZhbHVlICE9PSBudWxsICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkodmFsdWUpOwp9CgpmdW5jdGlvbiBzdXBwb3J0ZWRJbnRlZ3JpdHkodmFsdWUpIHsKICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiAvXnNoYTUxMi1bQS1aYS16MC05Ky9dezg2fT09JC8udGVzdCh2YWx1ZSk7Cn0KCmZ1bmN0aW9uIGh0dHBUYXJiYWxsKHZhbHVlKSB7CiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHJldHVybiBmYWxzZTsKICB0cnkgewogICAgY29uc3QgdXJsID0gbmV3IFVSTCh2YWx1ZSk7CiAgICByZXR1cm4gdXJsLnByb3RvY29sID09PSAnaHR0cDonIHx8IHVybC5wcm90b2NvbCA9PT0gJ2h0dHBzOic7CiAgfSBjYXRjaCB7CiAgICByZXR1cm4gZmFsc2U7CiAgfQp9CgpleHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZVBhY2thZ2UocGtnLCByZXF1ZXN0ZWQsIG9wdGlvbnMgPSB7fSkgewogIGNvbnN0IGZldGNoSW1wbCA9IG9wdGlvbnMuZmV0Y2hJbXBsIHx8IGZldGNoOwogIGNvbnN0IGVudiA9IG9wdGlvbnMuZW52IHx8IHByb2Nlc3MuZW52OwogIGNvbnN0IG1ldGFkYXRhVXJsID0gYGh0dHBzOi8vcmVnaXN0cnkubnBtanMub3JnLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHBrZyl9YDsKICBjb25zdCBtZXRhZGF0YSA9IGF3YWl0IGNoZWNrZWRKc29uKGF3YWl0IGZldGNoV2l0aFByb3h5KG1ldGFkYXRhVXJsLCB7fSwgZW52LCBmZXRjaEltcGwpKTsKICBpZiAoIW9iamVjdFJlY29yZChtZXRhZGF0YSkpIHRocm93IG5ldyBFcnJvcignUmVnaXN0cnkgbWV0YWRhdGEgbXVzdCBiZSBhbiBvYmplY3QnKTsKICBpZiAoIW9iamVjdFJlY29yZChtZXRhZGF0YS52ZXJzaW9ucykpIHRocm93IG5ldyBFcnJvcignUmVnaXN0cnkgdmVyc2lvbnMgbXVzdCBiZSBhbiBvYmplY3QnKTsKICBjb25zdCB2ZXJzaW9uID0gcmVxdWVzdGVkID09PSAnbGF0ZXN0JyA/IG1ldGFkYXRhWydkaXN0LXRhZ3MnXT8ubGF0ZXN0IDogcmVxdWVzdGVkOwogIGlmICh0eXBlb2YgdmVyc2lvbiAhPT0gJ3N0cmluZycgfHwgIXZlcnNpb24udHJpbSgpKSB0aHJvdyBuZXcgRXJyb3IoJ1Jlc29sdmVkIHZlcnNpb24gbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcnKTsKICBpZiAoIU9iamVjdC5oYXNPd24obWV0YWRhdGEudmVyc2lvbnMsIHZlcnNpb24pKSB0aHJvdyBuZXcgRXJyb3IoYFBhY2thZ2UgdmVyc2lvbiBub3QgZm91bmQ6ICR7cGtnfUAke3ZlcnNpb259YCk7CiAgY29uc3QgbWFuaWZlc3QgPSBtZXRhZGF0YS52ZXJzaW9uc1t2ZXJzaW9uXTsKICBpZiAoIW9iamVjdFJlY29yZChtYW5pZmVzdCkpIHRocm93IG5ldyBFcnJvcignUmVnaXN0cnkgbWFuaWZlc3QgbXVzdCBiZSBhbiBvYmplY3QnKTsKICBpZiAobWFuaWZlc3QubmFtZSAhPT0gcGtnKSB0aHJvdyBuZXcgRXJyb3IoJ1JlZ2lzdHJ5IG1hbmlmZXN0IG5hbWUgbXVzdCBtYXRjaCB0aGUgcmVxdWVzdGVkIHBhY2thZ2UnKTsKICBpZiAobWFuaWZlc3QudmVyc2lvbiAhPT0gdmVyc2lvbikgdGhyb3cgbmV3IEVycm9yKCdSZWdpc3RyeSBtYW5pZmVzdCB2ZXJzaW9uIG11c3QgbWF0Y2ggdGhlIHJlc29sdmVkIHZlcnNpb24nKTsKICBjb25zdCBkaXN0ID0gbWFuaWZlc3QuZGlzdDsKICBpZiAoIW9iamVjdFJlY29yZChkaXN0KSkgdGhyb3cgbmV3IEVycm9yKCdSZWdpc3RyeSBkaXN0IG11c3QgYmUgYW4gb2JqZWN0Jyk7CiAgaWYgKCFzdXBwb3J0ZWRJbnRlZ3JpdHkoZGlzdC5pbnRlZ3JpdHkpKSB0aHJvdyBuZXcgRXJyb3IoJ1JlZ2lzdHJ5IGludGVncml0eSBtdXN0IGJlIGEgc3VwcG9ydGVkIFNIQS01MTIgc3RyaW5nJyk7CiAgaWYgKCFodHRwVGFyYmFsbChkaXN0LnRhcmJhbGwpKSB0aHJvdyBuZXcgRXJyb3IoJ1JlZ2lzdHJ5IHRhcmJhbGwgbXVzdCBiZSBhbiBIVFRQKFMpIFVSTCcpOwogIHJldHVybiB7IHZlcnNpb24sIGRpc3QgfTsKfQoKZnVuY3Rpb24gcGFyc2VTcGVjKHNwZWMpIHsKICBjb25zdCBzZXBhcmF0b3IgPSBzcGVjLmxhc3RJbmRleE9mKCdAJyk7CiAgaWYgKHNlcGFyYXRvciA+IDApIHsKICAgIHJldHVybiB7IHBrZzogc3BlYy5zbGljZSgwLCBzZXBhcmF0b3IpLCByZXF1ZXN0ZWQ6IHNwZWMuc2xpY2Uoc2VwYXJhdG9yICsgMSkgfHwgJ2xhdGVzdCcgfTsKICB9CiAgcmV0dXJuIHsgcGtnOiBzcGVjLCByZXF1ZXN0ZWQ6ICdsYXRlc3QnIH07Cn0KCmZ1bmN0aW9uIHNhZmVBcmNoaXZlUGF0aChuYW1lKSB7CiAgaWYgKCFuYW1lIHx8IG5hbWUuc3RhcnRzV2l0aCgnLycpIHx8IG5hbWUuc3RhcnRzV2l0aCgnXFwnKSB8fCAvXltBLVphLXpdOltcXC9dLy50ZXN0KG5hbWUpKSByZXR1cm4gZmFsc2U7CiAgcmV0dXJuICFuYW1lLnNwbGl0KC9bXFwvXS8pLmluY2x1ZGVzKCcuLicpOwp9CgpleHBvcnQgYXN5bmMgZnVuY3Rpb24gaW5zdGFsbFBhY2thZ2Uoc3BlYywgb3V0RGlyLCBvcHRpb25zID0ge30pIHsKICBjb25zdCB7IHBrZywgcmVxdWVzdGVkIH0gPSBwYXJzZVNwZWMoc3BlYyk7CiAgY29uc3QgZmV0Y2hJbXBsID0gb3B0aW9ucy5mZXRjaEltcGwgfHwgZmV0Y2g7CiAgY29uc3QgZW52ID0gb3B0aW9ucy5lbnYgfHwgcHJvY2Vzcy5lbnY7CiAgY29uc3QgeyB2ZXJzaW9uLCBkaXN0IH0gPSBhd2FpdCByZXNvbHZlUGFja2FnZShwa2csIHJlcXVlc3RlZCwgeyBmZXRjaEltcGwsIGVudiB9KTsKICBpZiAoIWRpc3QudGFyYmFsbCB8fCB0eXBlb2YgZGlzdC5pbnRlZ3JpdHkgIT09ICdzdHJpbmcnKSB0aHJvdyBuZXcgRXJyb3IoYE1pc3NpbmcgZGlzdHJpYnV0aW9uIG1ldGFkYXRhIGZvciAke3BrZ31AJHt2ZXJzaW9ufWApOwoKICBjb25zdCBhcmNoaXZlUmVzcG9uc2UgPSBhd2FpdCBmZXRjaFdpdGhQcm94eShkaXN0LnRhcmJhbGwsIHt9LCBlbnYsIGZldGNoSW1wbCk7CiAgY29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShhd2FpdCBhcmNoaXZlUmVzcG9uc2UuYXJyYXlCdWZmZXIoKSk7CiAgY29uc3QgaW50ZWdyaXR5TWF0Y2ggPSAvXnNoYTUxMi0oW0EtWmEtejAtOSsvXSs9ezAsMn0pJC8uZXhlYyhkaXN0LmludGVncml0eSk7CiAgaWYgKCFpbnRlZ3JpdHlNYXRjaCkgdGhyb3cgbmV3IEVycm9yKGBVbnN1cHBvcnRlZCBpbnRlZ3JpdHkgZm9yICR7cGtnfUAke3ZlcnNpb259YCk7CiAgY29uc3QgYWN0dWFsID0gbmV3IEJ1bi5DcnlwdG9IYXNoZXIoJ3NoYTUxMicpLnVwZGF0ZShieXRlcykuZGlnZXN0KCdiYXNlNjQnKTsKICBpZiAoYWN0dWFsICE9PSBpbnRlZ3JpdHlNYXRjaFsxXSkgdGhyb3cgbmV3IEVycm9yKGBJbnRlZ3JpdHkgbWlzbWF0Y2ggZm9yICR7cGtnfUAke3ZlcnNpb259YCk7CgogIGNvbnN0IGZpbGVzID0gYXdhaXQgbmV3IEJ1bi5BcmNoaXZlKGJ5dGVzKS5maWxlcygpOwogIGZvciAoY29uc3QgbmFtZSBvZiBmaWxlcy5rZXlzKCkpIHsKICAgIGlmICghc2FmZUFyY2hpdmVQYXRoKG5hbWUpKSB0aHJvdyBuZXcgRXJyb3IoYFVuc2FmZSBhcmNoaXZlIHBhdGg6ICR7bmFtZX1gKTsKICB9CgogIGNvbnN0IHBhY2thZ2VQYXRoID0gJ3BhY2thZ2UvcGFja2FnZS5qc29uJzsKICBjb25zdCBiaW5hcnlOYW1lID0gcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJyA/ICdjbGF1ZGUuZXhlJyA6ICdjbGF1ZGUnOwogIGNvbnN0IGJpbmFyeUVudHJ5UGF0aCA9IGBwYWNrYWdlLyR7YmluYXJ5TmFtZX1gOwogIGNvbnN0IHBhY2thZ2VGaWxlID0gZmlsZXMuZ2V0KHBhY2thZ2VQYXRoKTsKICBjb25zdCBiaW5hcnlGaWxlID0gZmlsZXMuZ2V0KGJpbmFyeUVudHJ5UGF0aCk7CiAgaWYgKCFwYWNrYWdlRmlsZSkgdGhyb3cgbmV3IEVycm9yKGBBcmNoaXZlIGlzIG1pc3NpbmcgJHtwYWNrYWdlUGF0aH1gKTsKICBpZiAoIWJpbmFyeUZpbGUpIHRocm93IG5ldyBFcnJvcihgQXJjaGl2ZSBpcyBtaXNzaW5nICR7YmluYXJ5RW50cnlQYXRofWApOwogIGlmIChiaW5hcnlGaWxlLnNpemUgPD0gTUlOX0JJTkFSWV9CWVRFUykgdGhyb3cgbmV3IEVycm9yKGBBcmNoaXZlIGJpbmFyeSBpcyB0b28gc21hbGw6ICR7YmluYXJ5RW50cnlQYXRofWApOwoKICBjb25zdCBwYWNrYWdlRGlyID0gam9pbihvdXREaXIsICdwYWNrYWdlJyk7CiAgY29uc3QgYmluYXJ5UGF0aCA9IGpvaW4ocGFja2FnZURpciwgYmluYXJ5TmFtZSk7CiAgbWtkaXJTeW5jKHBhY2thZ2VEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pOwogIGF3YWl0IEJ1bi53cml0ZShqb2luKHBhY2thZ2VEaXIsICdwYWNrYWdlLmpzb24nKSwgcGFja2FnZUZpbGUpOwogIGF3YWl0IEJ1bi53cml0ZShiaW5hcnlQYXRoLCBiaW5hcnlGaWxlKTsKICBpZiAocHJvY2Vzcy5wbGF0Zm9ybSAhPT0gJ3dpbjMyJykgY2htb2RTeW5jKGJpbmFyeVBhdGgsIDBvNzU1KTsKICByZXR1cm4geyB2ZXJzaW9uLCBiaW5hcnlQYXRoIH07Cn0KCmlmIChpbXBvcnQubWV0YS5tYWluKSB7CiAgY29uc3QgW3NwZWMsIG91dERpcl0gPSBwcm9jZXNzLmFyZ3Yuc2xpY2UoMik7CiAgaWYgKCFzcGVjIHx8ICFvdXREaXIpIHRocm93IG5ldyBFcnJvcigndXNhZ2U6IGZldGNoLXBhY2thZ2UubWpzIDxwYWNrYWdlQHZlcnNpb24+IDxvdXRwdXQtZGlyZWN0b3J5PicpOwogIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGluc3RhbGxQYWNrYWdlKHNwZWMsIG91dERpcik7CiAgY29uc29sZS5sb2coYFZFUlNJT049JHtyZXN1bHQudmVyc2lvbn1gKTsKfQo=')
    [System.IO.File]::WriteAllBytes($fetchScript, $FetchPackageBytes)

    $output = & $BunBin $fetchScript "$npmPkg@$Version" $NativeBinTmpDir 2>&1
    $exitCode = $LASTEXITCODE
    $output | ForEach-Object { Write-Host "  $_" }
    Remove-Item -Force $fetchScript -ErrorAction SilentlyContinue

    if ($exitCode -ne 0) {
        Remove-Item -Recurse -Force $NativeBinTmpDir -ErrorAction SilentlyContinue
        Write-Err "Fetch failed (Bun exit $exitCode). Install the official binary manually:"
        Write-Err "    irm https://claude.ai/install.ps1 | iex"
        exit 1
    }

    $cand = Join-Path $NativeBinTmpDir "package\claude.exe"
    if ((Test-Path $cand) -and (Get-Item $cand).Length -gt 10MB) {
        $NativeBin = $cand
        $verLine = $output | Where-Object { $_ -match '^VERSION=' } | Select-Object -First 1
        if ($verLine) { $NativeBinLabel = ($verLine -replace '^VERSION=', '').Trim() }
        else { $NativeBinLabel = "npm-latest" }
    } else {
        Remove-Item -Recurse -Force $NativeBinTmpDir -ErrorAction SilentlyContinue
        Write-Err "Tarball downloaded but expected package\claude.exe was missing or too small."
        exit 1
    }
    Write-OK "Downloaded $npmPkg@$NativeBinLabel"
}

if (-not $NativeBin) {
    Write-Err "Native Claude Code binary not found"
    Write-Err "Install the official binary first:"
    Write-Err "  irm https://claude.ai/install.ps1 | iex"
    Write-Err "Then re-run this script."
    exit 1
}

# Always write the extractor (used for cli.js and/or .node modules)
$extractorPath = Join-Path $ClawDir "extract-natives.mjs"
$ExtractorBytes = [Convert]::FromBase64String('IyEvdXNyL2Jpbi9lbnYgYnVuCi8qKgogKiBDbGF3R29kIFBsdXMgQnVuIHNlY3Rpb24gZXh0cmFjdG9yCiAqCiAqIFBhcnNlcyB0aGUgLmJ1biAoUEUvRUxGKSBvciBfX0JVTixfX2J1biAoTWFjaC1PKSBzZWN0aW9uIGVtYmVkZGVkIGluIGEKICogQnVuIHN0YW5kYWxvbmUgZXhlY3V0YWJsZSwgd2Fsa3MgdGhlIG1vZHVsZSBncmFwaCwgYW5kIGV4dHJhY3RzOgogKiAgIC0gdGhlIGVudHJ5LXBvaW50IG1vZHVsZSAgICAgIOKGkiA8b3V0Pi9jbGkub3JpZ2luYWwuanMKICogICAtIGV2ZXJ5IGxvYWRlcj1uYXBpIG1vZHVsZSAgICDihpIgPG91dD4vdmVuZG9yLzxuYW1lPi88YXJjaD4tPG9zPi88bmFtZT4ubm9kZQogKgogKiBFdmVyeXRoaW5nIGVsc2UgaXMgZHJvcHBlZCAoZS5nLiBhdXRvLWdlbmVyYXRlZCAqLmpzIG5hcGkgc2hpbXMgYXJlbid0CiAqIG5lZWRlZCBiZWNhdXNlIGNsaS5qcyBhbHJlYWR5IGlubGluZXMgdGhlIHJlcXVpcmUoJy8kYnVuZnMvcm9vdC9YLm5vZGUnKQogKiBjYWxscyB0aGF0IHBvc3QtcHJvY2Vzcy5tanMgcmV3cml0ZXMgdG8gdGhlIHZlbmRvciBsb29rdXApLgogKgogKiBBZGFwdGVkIGZyb20gL2hvbWUva2FpanUvY29kZS9weXRob24vcGFyc2UtYnVuL21haW4uanMgKHdoaWNoIGl0c2VsZgogKiBpbXBsZW1lbnRzIHRoZSBmb3JtYXQgZG9jdW1lbnRlZCBpbiBkb2NzL2J1bi1zZWN0aW9uLWZvcm1hdC5tZCkuIExhenkKICogQnVuLmZpbGUgcmVhZHMgd2VyZSByZXBsYWNlZCB3aXRoIHJlYWRGaWxlU3luYyBzbyB0aGUgc2NyaXB0IHJ1bnMgdW5kZXIKICogdGhlIGV4aXN0aW5nIEJ1biBpbnZvY2F0aW9uIGluIGluc3RhbGwuc2ggLyBpbnN0YWxsLnBzMS4KICoKICogVXNhZ2U6CiAqICAgYnVuIGV4dHJhY3QtbmF0aXZlcy5tanMgPGJpbmFyeS1wYXRoPiA8b3V0cHV0LWRpcj4KICovCgppbXBvcnQgeyByZWFkRmlsZVN5bmMsIHdyaXRlRmlsZVN5bmMsIG1rZGlyU3luYywgZXhpc3RzU3luYyB9IGZyb20gJ25vZGU6ZnMnOwppbXBvcnQgeyBqb2luLCBiYXNlbmFtZSB9IGZyb20gJ25vZGU6cGF0aCc7CgovLyDilIDilIDilIAgRm9ybWF0IGNvbnN0YW50cyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAKCmNvbnN0IFRSQUlMRVIgICAgICAgICAgICAgPSBCdWZmZXIuZnJvbSgnXG4tLS0tIEJ1biEgLS0tLVxuJyk7CmNvbnN0IEJVTl9TRUNUSU9OX05BTUUgICAgPSAnLmJ1bic7CmNvbnN0IE9GRlNFVF9TVFJVQ1RfU0laRSAgPSAzMjsKY29uc3QgTU9EVUxFX1JFQ09SRF9TSVpFICA9IDUyOwoKLy8gbG9hZGVyIGlkIOKGkiBuYW1lIChzdWJzZXQ7IG9ubHkgYG5hcGlgIGlzIGFjdGVkIG9uLCByZXN0IGluZm9ybWF0aW9uYWwpCmNvbnN0IExPQURFUlMgPSB7CiAgMDonanN4JywgMTonanMnLCAyOid0cycsIDM6J3RzeCcsIDQ6J2NzcycsIDU6J2ZpbGUnLCA2Oidqc29uJywgNzonanNvbmMnLAogIDg6J3RvbWwnLCA5Oid3YXNtJywgMTA6J25hcGknLCAxMTonYmFzZTY0JywgMTI6J2RhdGF1cmwnLCAxMzondGV4dCcsCiAgMTQ6J2J1bnNoJywgMTU6J3NxbGl0ZScsIDE2OidzcWxpdGVfZW1iZWRkZWQnLCAxNzonaHRtbCcsIDE4Oid5YW1sJywKICAxOTonanNvbjUnLCAyMDonbWQnLAp9OwoKLy8gRUxGCmNvbnN0IEVMRl9NQUdJQ19MRSAgICAgICAgICA9IDB4NDY0YzQ1N2Y7IC8vICJceDdmRUxGIiBMRSB1MzIKY29uc3QgRUxGX0VJX0NMQVNTICAgICAgICAgID0gMHgwNDsKY29uc3QgRUxGX0VJX0RBVEEgICAgICAgICAgID0gMHgwNTsKY29uc3QgRUxGX0NMQVNTXzY0ICAgICAgICAgID0gMHgwMjsKY29uc3QgRUxGX0RBVEFfTEUgICAgICAgICAgID0gMHgwMTsKY29uc3QgRUxGX0VfTUFDSElORSAgICAgICAgID0gMHgxMjsgICAgICAgLy8gdTE2CmNvbnN0IEVMRl9FSERSX1NJWkUgICAgICAgICA9IDB4NDA7CmNvbnN0IEVMRjY0X0VfU0hPRkYgICAgICAgICA9IDB4Mjg7CmNvbnN0IEVMRjY0X0VfU0hFTlRTSVpFICAgICA9IDB4M2E7CmNvbnN0IEVMRjY0X0VfU0hOVU0gICAgICAgICA9IDB4M2M7CmNvbnN0IEVMRjY0X0VfU0hTVFJORFggICAgICA9IDB4M2U7CmNvbnN0IEVMRjY0X1NIX05BTUUgICAgICAgICA9IDB4MDA7CmNvbnN0IEVMRjY0X1NIX09GRlNFVCAgICAgICA9IDB4MTg7CmNvbnN0IEVMRjY0X1NIX1NJWkUgICAgICAgICA9IDB4MjA7CmNvbnN0IEVNX1g4Nl82NCAgICAgICAgICAgICA9IDB4M2U7CmNvbnN0IEVNX0FBUkNINjQgICAgICAgICAgICA9IDB4Yjc7CgovLyBNYWNoLU8gKHRoaW4gTEUgNjQtYml0OyBmYXQgLyAzMi1iaXQgLyBCRSByZWplY3RlZCB3aXRoIGNsZWFyIG1lc3NhZ2UpCmNvbnN0IE1IX01BR0lDXzY0ICAgICAgICAgICA9IDB4ZmVlZGZhY2Y7CmNvbnN0IE1IX0NJR0FNXzY0ICAgICAgICAgICA9IDB4Y2ZmYWVkZmU7CmNvbnN0IE1IX01BR0lDICAgICAgICAgICAgICA9IDB4ZmVlZGZhY2U7CmNvbnN0IE1IX0NJR0FNICAgICAgICAgICAgICA9IDB4Y2VmYWVkZmU7CmNvbnN0IE1BQ0hfQ1BVVFlQRV9PRkYgICAgICA9IDB4MDQ7ICAgICAgICAvLyB1MzIKY29uc3QgTUFDSF9OQ01EU19PRkYgICAgICAgID0gMHgxMDsKY29uc3QgTUFDSF9TSVpFT0ZDTURTX09GRiAgID0gMHgxNDsKY29uc3QgTUFDSF9IRFJfU0laRV82NCAgICAgID0gMHgyMDsKY29uc3QgTENfU0VHTUVOVF82NCAgICAgICAgID0gMHgxOTsKY29uc3QgTENfQ01EU0laRV9PRkYgICAgICAgID0gMHgwNDsKY29uc3QgTENfU0VHTkFNRV9PRkYgICAgICAgID0gMHgwODsKY29uc3QgTENfU0VHTkFNRV9MRU4gICAgICAgID0gMHgxMDsKY29uc3QgU0VHNjRfTlNFQ1RTX09GRiAgICAgID0gMHg0MDsKY29uc3QgU0VHNjRfU0VDVFNfT0ZGICAgICAgID0gMHg0ODsKY29uc3QgU0VDVDY0X0VOVFJZX1NJWkUgICAgID0gMHg1MDsKY29uc3QgU0VDVDY0X1NJWkVfT0ZGICAgICAgID0gMHgyODsKY29uc3QgU0VDVDY0X09GRlNFVF9PRkYgICAgID0gMHgzMDsKY29uc3QgQ1BVX1RZUEVfWDg2XzY0ICAgICAgID0gMHgwMTAwMDAwNzsKY29uc3QgQ1BVX1RZUEVfQVJNNjQgICAgICAgID0gMHgwMTAwMDAwYzsKCi8vIFBFCmNvbnN0IFBFX09GRlNFVF9QVFIgICAgICAgICA9IDB4M2M7CmNvbnN0IFBFX01BQ0hJTkVfT0ZGICAgICAgICA9IDB4MDQ7ICAgICAgIC8vIHJlbGF0aXZlIHRvIFBFIHNpZwpjb25zdCBQRV9OVU1fU0VDVElPTlNfT0ZGICAgPSAweDA2Owpjb25zdCBQRV9PUFRfSERSX1NJWkVfT0ZGICAgPSAweDE0Owpjb25zdCBQRV9DT0ZGX0hEUl9TSVpFICAgICAgPSAweDE4Owpjb25zdCBQRV9PUFRfTUFHSUNfT0ZGICAgICAgPSAweDE4Owpjb25zdCBQRV9PUFRfTUFHSUNfUEUzMlAgICAgPSAweDIwYjsKY29uc3QgUEVfU0VDVElPTl9FTlRSWV9TSVpFID0gMHgyODsKY29uc3QgUEVfU0VDVF9SQVdfU0laRV9PRkYgID0gMHgxMDsKY29uc3QgUEVfU0VDVF9SQVdfT0ZGX09GRiAgID0gMHgxNDsKY29uc3QgUEVfU0VDVF9OQU1FX0xFTiAgICAgID0gMHgwODsKY29uc3QgSU1BR0VfTUFDSElORV9BTUQ2NCAgID0gMHg4NjY0Owpjb25zdCBJTUFHRV9NQUNISU5FX0FSTTY0ICAgPSAweGFhNjQ7CgovLyDilIDilIDilIAgSGVscGVycyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAKCmZ1bmN0aW9uIGRpZShtc2cpIHsgdGhyb3cgbmV3IEVycm9yKGBlcnJvcjogJHttc2d9YCk7IH0KCmZ1bmN0aW9uIHJlYWRVNjRMRShidWYsIG9mZiwgd2hhdCkgewogIGNvbnN0IHYgPSBidWYucmVhZEJpZ1VJbnQ2NExFKG9mZik7CiAgaWYgKHYgPiBCaWdJbnQoTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpKSBkaWUoYCR7d2hhdH0gZXhjZWVkcyBKUyBzYWZlIGludGVnZXI6ICR7dn1gKTsKICByZXR1cm4gTnVtYmVyKHYpOwp9CgpmdW5jdGlvbiBjaGVja2VkU2xpY2UoYnVmLCBvZmYsIHNpemUsIHdoYXQpIHsKICBpZiAob2ZmIDwgMCB8fCBzaXplIDwgMCB8fCBvZmYgKyBzaXplID4gYnVmLmxlbmd0aCkgewogICAgZGllKGAke3doYXR9IG91dCBvZiBib3VuZHM6IG9mZnNldD0ke29mZn0gc2l6ZT0ke3NpemV9IGJ1Zj0ke2J1Zi5sZW5ndGh9YCk7CiAgfQogIHJldHVybiBidWYuc3ViYXJyYXkob2ZmLCBvZmYgKyBzaXplKTsKfQoKZnVuY3Rpb24gZGVjb2RlTmFtZShidWYpIHsKICByZXR1cm4gYnVmLnRvU3RyaW5nKCd1dGY4JykucmVwbGFjZSgvXHUwMDAwKyQvdSwgJycpOwp9CgovLyDilIDilIDilIAgU2VjdGlvbiBsb2NhdG9ycyAocGVyIGZvcm1hdCkg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACgpmdW5jdGlvbiBmaW5kU2VjdGlvbkVsZihidWYpIHsKICBpZiAoYnVmLmxlbmd0aCA8IEVMRl9FSERSX1NJWkUpIGRpZSgnRUxGIHRvbyBzbWFsbCcpOwogIGlmIChidWZbRUxGX0VJX0NMQVNTXSAhPT0gRUxGX0NMQVNTXzY0KSBkaWUoJ0VMRjogb25seSA2NC1iaXQgc3VwcG9ydGVkJyk7CiAgaWYgKGJ1ZltFTEZfRUlfREFUQV0gICE9PSBFTEZfREFUQV9MRSkgZGllKCdFTEY6IG9ubHkgbGl0dGxlLWVuZGlhbiBzdXBwb3J0ZWQnKTsKCiAgY29uc3QgZU1hY2hpbmUgPSBidWYucmVhZFVJbnQxNkxFKEVMRl9FX01BQ0hJTkUpOwogIGNvbnN0IGFyY2ggPSBlTWFjaGluZSA9PT0gRU1fWDg2XzY0ICA/ICd4NjQnCiAgICAgICAgICAgICA6IGVNYWNoaW5lID09PSBFTV9BQVJDSDY0ID8gJ2FybTY0JwogICAgICAgICAgICAgOiBkaWUoYEVMRjogdW5zdXBwb3J0ZWQgZV9tYWNoaW5lIDB4JHtlTWFjaGluZS50b1N0cmluZygxNil9YCk7CgogIGNvbnN0IHNob2ZmICAgICA9IHJlYWRVNjRMRShidWYsIEVMRjY0X0VfU0hPRkYsICdFTEYgZV9zaG9mZicpOwogIGNvbnN0IHNoZW50c2l6ZSA9IGJ1Zi5yZWFkVUludDE2TEUoRUxGNjRfRV9TSEVOVFNJWkUpOwogIGNvbnN0IHNobnVtICAgICA9IGJ1Zi5yZWFkVUludDE2TEUoRUxGNjRfRV9TSE5VTSk7CiAgY29uc3Qgc2hzdHJuZHggID0gYnVmLnJlYWRVSW50MTZMRShFTEY2NF9FX1NIU1RSTkRYKTsKICBpZiAoc2hzdHJuZHggPj0gc2hudW0pIGRpZSgnRUxGIGVfc2hzdHJuZHggb3V0IG9mIHJhbmdlJyk7CgogIGNvbnN0IHNoc3RyRW50cnkgID0gYnVmLnN1YmFycmF5KHNob2ZmICsgc2hzdHJuZHggKiBzaGVudHNpemUsIHNob2ZmICsgKHNoc3RybmR4ICsgMSkgKiBzaGVudHNpemUpOwogIGNvbnN0IHNoc3RyT2Zmc2V0ID0gcmVhZFU2NExFKHNoc3RyRW50cnksIEVMRjY0X1NIX09GRlNFVCwgJ3Noc3RydGFiIG9mZnNldCcpOwogIGNvbnN0IHNoc3RyU2l6ZSAgID0gcmVhZFU2NExFKHNoc3RyRW50cnksIEVMRjY0X1NIX1NJWkUsICAgJ3Noc3RydGFiIHNpemUnKTsKICBjb25zdCBzaHN0ciAgICAgICA9IGNoZWNrZWRTbGljZShidWYsIHNoc3RyT2Zmc2V0LCBzaHN0clNpemUsICdzaHN0cnRhYicpOwoKICBsZXQgbWF0Y2ggPSBudWxsOwogIGZvciAobGV0IGkgPSAwOyBpIDwgc2hudW07IGkrKykgewogICAgY29uc3QgZW50cnkgICA9IGJ1Zi5zdWJhcnJheShzaG9mZiArIGkgKiBzaGVudHNpemUsIHNob2ZmICsgKGkgKyAxKSAqIHNoZW50c2l6ZSk7CiAgICBjb25zdCBuYW1lSWR4ID0gZW50cnkucmVhZFVJbnQzMkxFKEVMRjY0X1NIX05BTUUpOwogICAgaWYgKG5hbWVJZHggPj0gc2hzdHIubGVuZ3RoKSBjb250aW51ZTsKICAgIGxldCBuYW1lRW5kID0gbmFtZUlkeDsKICAgIHdoaWxlIChuYW1lRW5kIDwgc2hzdHIubGVuZ3RoICYmIHNoc3RyW25hbWVFbmRdICE9PSAwKSBuYW1lRW5kKys7CiAgICBpZiAoc2hzdHIudG9TdHJpbmcoJ2FzY2lpJywgbmFtZUlkeCwgbmFtZUVuZCkgIT09IEJVTl9TRUNUSU9OX05BTUUpIGNvbnRpbnVlOwogICAgaWYgKG1hdGNoKSBkaWUoJ0VMRiBoYXMgbXVsdGlwbGUgLmJ1biBzZWN0aW9ucycpOwogICAgY29uc3QgcmF3T2Zmc2V0ID0gcmVhZFU2NExFKGVudHJ5LCBFTEY2NF9TSF9PRkZTRVQsICcuYnVuIHNoX29mZnNldCcpOwogICAgY29uc3QgcmF3U2l6ZSAgID0gcmVhZFU2NExFKGVudHJ5LCBFTEY2NF9TSF9TSVpFLCAgICcuYnVuIHNoX3NpemUnKTsKICAgIGlmIChyYXdPZmZzZXQgKyByYXdTaXplID4gYnVmLmxlbmd0aCkgZGllKCcuYnVuIG91dCBvZiBmaWxlIGJvdW5kcycpOwogICAgbWF0Y2ggPSB7IGZvcm1hdDogJ0VMRicsIG9zOiAnbGludXgnLCBhcmNoLCByYXdPZmZzZXQsIHJhd1NpemUgfTsKICB9CiAgaWYgKCFtYXRjaCkgZGllKCdFTEYgaGFzIG5vIC5idW4gc2VjdGlvbicpOwogIHJldHVybiBtYXRjaDsKfQoKZnVuY3Rpb24gZmluZFNlY3Rpb25NYWNobyhidWYpIHsKICBpZiAoYnVmLmxlbmd0aCA8IE1BQ0hfSERSX1NJWkVfNjQpIGRpZSgnTWFjaC1PIHRvbyBzbWFsbCcpOwogIGNvbnN0IGNwdXR5cGUgPSBidWYucmVhZFVJbnQzMkxFKE1BQ0hfQ1BVVFlQRV9PRkYpOwogIGNvbnN0IGFyY2ggPSBjcHV0eXBlID09PSBDUFVfVFlQRV9YODZfNjQgPyAneDY0JwogICAgICAgICAgICAgOiBjcHV0eXBlID09PSBDUFVfVFlQRV9BUk02NCAgPyAnYXJtNjQnCiAgICAgICAgICAgICA6IGRpZShgTWFjaC1POiB1bnN1cHBvcnRlZCBjcHV0eXBlIDB4JHtjcHV0eXBlLnRvU3RyaW5nKDE2KX1gKTsKCiAgY29uc3QgbmNtZHMgICAgICA9IGJ1Zi5yZWFkVUludDMyTEUoTUFDSF9OQ01EU19PRkYpOwogIGNvbnN0IHNpemVvZmNtZHMgPSBidWYucmVhZFVJbnQzMkxFKE1BQ0hfU0laRU9GQ01EU19PRkYpOwogIGlmIChzaXplb2ZjbWRzID09PSAwIHx8IE1BQ0hfSERSX1NJWkVfNjQgKyBzaXplb2ZjbWRzID4gYnVmLmxlbmd0aCkgZGllKCdNYWNoLU8gc2l6ZW9mY21kcyBpbnZhbGlkJyk7CiAgY29uc3QgY21kcyA9IGJ1Zi5zdWJhcnJheShNQUNIX0hEUl9TSVpFXzY0LCBNQUNIX0hEUl9TSVpFXzY0ICsgc2l6ZW9mY21kcyk7CgogIGxldCBtYXRjaCA9IG51bGw7CiAgbGV0IG9mZiA9IDA7CiAgZm9yIChsZXQgaSA9IDA7IGkgPCBuY21kczsgaSsrKSB7CiAgICBpZiAob2ZmICsgOCA+IHNpemVvZmNtZHMpIGRpZShgTWFjaC1PIExDICR7aX0gdHJ1bmNhdGVkYCk7CiAgICBjb25zdCBjbWQgICAgID0gY21kcy5yZWFkVUludDMyTEUob2ZmKTsKICAgIGNvbnN0IGNtZHNpemUgPSBjbWRzLnJlYWRVSW50MzJMRShvZmYgKyBMQ19DTURTSVpFX09GRik7CiAgICBpZiAoY21kc2l6ZSA8IDggfHwgb2ZmICsgY21kc2l6ZSA+IHNpemVvZmNtZHMpIGRpZShgTWFjaC1PIExDICR7aX0gY21kc2l6ZSBpbnZhbGlkOiAke2NtZHNpemV9YCk7CiAgICBpZiAoY21kID09PSBMQ19TRUdNRU5UXzY0KSB7CiAgICAgIGNvbnN0IHNlZ25hbWUgPSBjbWRzLnRvU3RyaW5nKCdhc2NpaScsIG9mZiArIExDX1NFR05BTUVfT0ZGLCBvZmYgKyBMQ19TRUdOQU1FX09GRiArIExDX1NFR05BTUVfTEVOKS5yZXBsYWNlKC9cMCskLywgJycpOwogICAgICBpZiAoc2VnbmFtZSA9PT0gJ19fQlVOJykgewogICAgICAgIGNvbnN0IG5zZWN0cyA9IGNtZHMucmVhZFVJbnQzMkxFKG9mZiArIFNFRzY0X05TRUNUU19PRkYpOwogICAgICAgIGlmIChTRUc2NF9TRUNUU19PRkYgKyBuc2VjdHMgKiBTRUNUNjRfRU5UUllfU0laRSA+IGNtZHNpemUpIGRpZShgTWFjaC1PIExDX1NFR01FTlRfNjQoX19CVU4pIHNlY3Rpb25zIGV4Y2VlZCBjbWRzaXplYCk7CiAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBuc2VjdHM7IGorKykgewogICAgICAgICAgY29uc3QgcyA9IG9mZiArIFNFRzY0X1NFQ1RTX09GRiArIGogKiBTRUNUNjRfRU5UUllfU0laRTsKICAgICAgICAgIGNvbnN0IHNlY3RuYW1lID0gY21kcy50b1N0cmluZygnYXNjaWknLCBzLCBzICsgTENfU0VHTkFNRV9MRU4pLnJlcGxhY2UoL1wwKyQvLCAnJyk7CiAgICAgICAgICBpZiAoc2VjdG5hbWUgPT09ICdfX2J1bicpIHsKICAgICAgICAgICAgY29uc3QgcmF3U2l6ZSAgID0gcmVhZFU2NExFKGNtZHMsIHMgKyBTRUNUNjRfU0laRV9PRkYsICdfX2J1biBzaXplJyk7CiAgICAgICAgICAgIGNvbnN0IHJhd09mZnNldCA9IGNtZHMucmVhZFVJbnQzMkxFKHMgKyBTRUNUNjRfT0ZGU0VUX09GRik7CiAgICAgICAgICAgIGlmIChyYXdPZmZzZXQgKyByYXdTaXplID4gYnVmLmxlbmd0aCkgZGllKCdfX2J1biBvdXQgb2YgZmlsZSBib3VuZHMnKTsKICAgICAgICAgICAgaWYgKG1hdGNoKSBkaWUoJ01hY2gtTyBoYXMgbXVsdGlwbGUgX19CVU4sX19idW4gc2VjdGlvbnMnKTsKICAgICAgICAgICAgbWF0Y2ggPSB7IGZvcm1hdDogJ01hY2gtTycsIG9zOiAnZGFyd2luJywgYXJjaCwgcmF3T2Zmc2V0LCByYXdTaXplIH07CiAgICAgICAgICB9CiAgICAgICAgfQogICAgICB9CiAgICB9CiAgICBvZmYgKz0gY21kc2l6ZTsKICB9CiAgaWYgKCFtYXRjaCkgZGllKCdNYWNoLU8gaGFzIG5vIF9fQlVOLF9fYnVuIHNlY3Rpb24nKTsKICByZXR1cm4gbWF0Y2g7Cn0KCmZ1bmN0aW9uIGZpbmRTZWN0aW9uUGUoYnVmKSB7CiAgaWYgKGJ1Zi5sZW5ndGggPCAweDQwKSBkaWUoJ1BFIHRvbyBzbWFsbCcpOwogIGlmIChidWYudG9TdHJpbmcoJ2FzY2lpJywgMCwgMikgIT09ICdNWicpIGRpZSgnUEUgbWlzc2luZyBNWiBoZWFkZXInKTsKICBjb25zdCBwZU9mZiA9IGJ1Zi5yZWFkVUludDMyTEUoUEVfT0ZGU0VUX1BUUik7CiAgaWYgKGJ1Zi50b1N0cmluZygnYXNjaWknLCBwZU9mZiwgcGVPZmYgKyA0KSAhPT0gJ1BFXDBcMCcpIGRpZSgnUEUgbWlzc2luZyBQRSBzaWduYXR1cmUnKTsKCiAgY29uc3QgbWFjaGluZSA9IGJ1Zi5yZWFkVUludDE2TEUocGVPZmYgKyBQRV9NQUNISU5FX09GRik7CiAgY29uc3QgYXJjaCA9IG1hY2hpbmUgPT09IElNQUdFX01BQ0hJTkVfQU1ENjQgPyAneDY0JwogICAgICAgICAgICAgOiBtYWNoaW5lID09PSBJTUFHRV9NQUNISU5FX0FSTTY0ID8gJ2FybTY0JwogICAgICAgICAgICAgOiBkaWUoYFBFOiB1bnN1cHBvcnRlZCBtYWNoaW5lIDB4JHttYWNoaW5lLnRvU3RyaW5nKDE2KX1gKTsKCiAgY29uc3Qgb3B0TWFnaWMgPSBidWYucmVhZFVJbnQxNkxFKHBlT2ZmICsgUEVfT1BUX01BR0lDX09GRik7CiAgaWYgKG9wdE1hZ2ljICE9PSBQRV9PUFRfTUFHSUNfUEUzMlApIGRpZShgUEU6IG9ubHkgNjQtYml0IChQRTMyKykgc3VwcG9ydGVkLCBnb3QgMHgke29wdE1hZ2ljLnRvU3RyaW5nKDE2KX1gKTsKCiAgY29uc3QgbnVtU2VjdCAgICA9IGJ1Zi5yZWFkVUludDE2TEUocGVPZmYgKyBQRV9OVU1fU0VDVElPTlNfT0ZGKTsKICBjb25zdCBvcHRIZHJTaXplID0gYnVmLnJlYWRVSW50MTZMRShwZU9mZiArIFBFX09QVF9IRFJfU0laRV9PRkYpOwogIGNvbnN0IHNlY3RUYWJsZSAgPSBwZU9mZiArIFBFX0NPRkZfSERSX1NJWkUgKyBvcHRIZHJTaXplOwoKICBsZXQgbWF0Y2ggPSBudWxsOwogIGZvciAobGV0IGkgPSAwOyBpIDwgbnVtU2VjdDsgaSsrKSB7CiAgICBjb25zdCBlbnRyeSAgPSBzZWN0VGFibGUgKyBpICogUEVfU0VDVElPTl9FTlRSWV9TSVpFOwogICAgY29uc3QgcmF3Tm0gID0gYnVmLnN1YmFycmF5KGVudHJ5LCBlbnRyeSArIFBFX1NFQ1RfTkFNRV9MRU4pOwogICAgY29uc3QgbnVsICAgID0gcmF3Tm0uaW5kZXhPZigwKTsKICAgIGNvbnN0IG5hbWUgICA9IHJhd05tLnN1YmFycmF5KDAsIG51bCA9PT0gLTEgPyByYXdObS5sZW5ndGggOiBudWwpLnRvU3RyaW5nKCdhc2NpaScpOwogICAgaWYgKG5hbWUgIT09IEJVTl9TRUNUSU9OX05BTUUpIGNvbnRpbnVlOwogICAgaWYgKG1hdGNoKSBkaWUoJ1BFIGhhcyBtdWx0aXBsZSAuYnVuIHNlY3Rpb25zJyk7CiAgICBjb25zdCByYXdTaXplICAgPSBidWYucmVhZFVJbnQzMkxFKGVudHJ5ICsgUEVfU0VDVF9SQVdfU0laRV9PRkYpOwogICAgY29uc3QgcmF3T2Zmc2V0ID0gYnVmLnJlYWRVSW50MzJMRShlbnRyeSArIFBFX1NFQ1RfUkFXX09GRl9PRkYpOwogICAgaWYgKHJhd09mZnNldCArIHJhd1NpemUgPiBidWYubGVuZ3RoKSBkaWUoJy5idW4gb3V0IG9mIGZpbGUgYm91bmRzJyk7CiAgICBtYXRjaCA9IHsgZm9ybWF0OiAnUEUnLCBvczogJ3dpbjMyJywgYXJjaCwgcmF3T2Zmc2V0LCByYXdTaXplIH07CiAgfQogIGlmICghbWF0Y2gpIGRpZSgnUEUgaGFzIG5vIC5idW4gc2VjdGlvbicpOwogIHJldHVybiBtYXRjaDsKfQoKZnVuY3Rpb24gZmluZEJ1blNlY3Rpb24oYnVmKSB7CiAgaWYgKGJ1Zi5sZW5ndGggPCA0KSBkaWUoJ2ZpbGUgdG9vIHNtYWxsJyk7CiAgY29uc3QgbWFnaWMgPSBidWYucmVhZFVJbnQzMkxFKDApOwogIGlmIChtYWdpYyA9PT0gRUxGX01BR0lDX0xFKSAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZpbmRTZWN0aW9uRWxmKGJ1Zik7CiAgaWYgKG1hZ2ljID09PSBNSF9NQUdJQ182NCkgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmluZFNlY3Rpb25NYWNobyhidWYpOwogIGlmIChtYWdpYyA9PT0gTUhfQ0lHQU1fNjQgfHwgbWFnaWMgPT09IE1IX0NJR0FNKSAgZGllKCdNYWNoLU86IG9ubHkgbGl0dGxlLWVuZGlhbiBzdXBwb3J0ZWQnKTsKICBpZiAobWFnaWMgPT09IE1IX01BR0lDKSAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpZSgnTWFjaC1POiBvbmx5IDY0LWJpdCBzdXBwb3J0ZWQnKTsKICByZXR1cm4gZmluZFNlY3Rpb25QZShidWYpOwp9CgovLyDilIDilIDilIAgUGF5bG9hZCArIG1vZHVsZSByZWNvcmRzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAoKZnVuY3Rpb24gcGFyc2VQYXlsb2FkKHNlY3Rpb25EYXRhKSB7CiAgaWYgKHNlY3Rpb25EYXRhLmxlbmd0aCA8IDgpIGRpZSgnLmJ1biB0b28gc21hbGwgZm9yIGxlbmd0aCBwcmVmaXgnKTsKICBjb25zdCBwYXlsb2FkU2l6ZSA9IHJlYWRVNjRMRShzZWN0aW9uRGF0YSwgMCwgJy5idW4gcGF5bG9hZCBsZW5ndGgnKTsKICBpZiAocGF5bG9hZFNpemUgKyA4ID4gc2VjdGlvbkRhdGEubGVuZ3RoKSBkaWUoJy5idW4gcGF5bG9hZCBleGNlZWRzIHJhdyBzZWN0aW9uJyk7CiAgY29uc3QgcGF5bG9hZCA9IHNlY3Rpb25EYXRhLnN1YmFycmF5KDgsIDggKyBwYXlsb2FkU2l6ZSk7CiAgaWYgKHBheWxvYWQubGVuZ3RoIDwgT0ZGU0VUX1NUUlVDVF9TSVpFICsgVFJBSUxFUi5sZW5ndGgpIGRpZSgnLmJ1biBwYXlsb2FkIHRvbyBzbWFsbCcpOwogIGlmICghcGF5bG9hZC5zdWJhcnJheShwYXlsb2FkLmxlbmd0aCAtIFRSQUlMRVIubGVuZ3RoKS5lcXVhbHMoVFJBSUxFUikpIGRpZSgnLmJ1biB0cmFpbGVyIG1pc21hdGNoJyk7CiAgcmV0dXJuIHBheWxvYWQ7Cn0KCmZ1bmN0aW9uIHBhcnNlT2Zmc2V0cyhwYXlsb2FkKSB7CiAgY29uc3Qgc3RhcnQgPSBwYXlsb2FkLmxlbmd0aCAtIFRSQUlMRVIubGVuZ3RoIC0gT0ZGU0VUX1NUUlVDVF9TSVpFOwogIHJldHVybiB7CiAgICBtb2R1bGVzX29mZnNldDogcGF5bG9hZC5yZWFkVUludDMyTEUoc3RhcnQgKyA4KSwKICAgIG1vZHVsZXNfc2l6ZTogICBwYXlsb2FkLnJlYWRVSW50MzJMRShzdGFydCArIDEyKSwKICAgIGVudHJ5X3BvaW50X2lkOiBwYXlsb2FkLnJlYWRVSW50MzJMRShzdGFydCArIDE2KSwKICB9Owp9CgpmdW5jdGlvbiBwYXJzZU1vZHVsZXMocGF5bG9hZCwgb2Zmc2V0cykgewogIGlmIChvZmZzZXRzLm1vZHVsZXNfc2l6ZSAlIE1PRFVMRV9SRUNPUkRfU0laRSAhPT0gMCkgewogICAgZGllKGBtb2R1bGVzIHRhYmxlIHNpemUgbm90IGEgbXVsdGlwbGUgb2YgJHtNT0RVTEVfUkVDT1JEX1NJWkV9OiAke29mZnNldHMubW9kdWxlc19zaXplfWApOwogIH0KICBjb25zdCBjb3VudCA9IG9mZnNldHMubW9kdWxlc19zaXplIC8gTU9EVUxFX1JFQ09SRF9TSVpFOwogIGlmIChvZmZzZXRzLmVudHJ5X3BvaW50X2lkID49IGNvdW50KSBkaWUoYGVudHJ5X3BvaW50X2lkICR7b2Zmc2V0cy5lbnRyeV9wb2ludF9pZH0gPj0gJHtjb3VudH1gKTsKICBjb25zdCB0YWJsZSA9IGNoZWNrZWRTbGljZShwYXlsb2FkLCBvZmZzZXRzLm1vZHVsZXNfb2Zmc2V0LCBvZmZzZXRzLm1vZHVsZXNfc2l6ZSwgJ21vZHVsZXMgdGFibGUnKTsKICBjb25zdCBvdXQgPSBbXTsKICBmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHsKICAgIGNvbnN0IHJlYyAgICAgICAgPSB0YWJsZS5zdWJhcnJheShpICogTU9EVUxFX1JFQ09SRF9TSVpFLCAoaSArIDEpICogTU9EVUxFX1JFQ09SRF9TSVpFKTsKICAgIGNvbnN0IG5hbWVPZmYgICAgPSByZWMucmVhZFVJbnQzMkxFKDApOwogICAgY29uc3QgbmFtZVNpemUgICA9IHJlYy5yZWFkVUludDMyTEUoNCk7CiAgICBjb25zdCBjb250ZW50T2ZmID0gcmVjLnJlYWRVSW50MzJMRSg4KTsKICAgIGNvbnN0IGNvbnRlbnRTaXplPSByZWMucmVhZFVJbnQzMkxFKDEyKTsKICAgIGNvbnN0IGxvYWRlcklkICAgPSByZWMucmVhZFVJbnQ4KDQ5KTsKICAgIGNvbnN0IG5hbWUgPSBkZWNvZGVOYW1lKGNoZWNrZWRTbGljZShwYXlsb2FkLCBuYW1lT2ZmLCBuYW1lU2l6ZSwgYG1vZHVsZVske2l9XS5uYW1lYCkpOwogICAgY29uc3QgY29udGVudCA9IGNoZWNrZWRTbGljZShwYXlsb2FkLCBjb250ZW50T2ZmLCBjb250ZW50U2l6ZSwgYG1vZHVsZVske2l9XS5jb250ZW50YCk7CiAgICBvdXQucHVzaCh7CiAgICAgIGluZGV4OiBpLAogICAgICBlbnRyeTogaSA9PT0gb2Zmc2V0cy5lbnRyeV9wb2ludF9pZCwKICAgICAgbmFtZSwKICAgICAgY29udGVudCwKICAgICAgbG9hZGVyOiBMT0FERVJTW2xvYWRlcklkXSA/PyBgdW5rbm93bigke2xvYWRlcklkfSlgLAogICAgfSk7CiAgfQogIHJldHVybiBvdXQ7Cn0KCi8vIOKUgOKUgOKUgCBPdXRwdXQgZGlzcGF0Y2gg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACgpmdW5jdGlvbiBuYXBpQmFzZW5hbWUobmFtZSkgewogIC8vIEJ1biByZWNvcmRzIG1heSB1c2UgZWl0aGVyICcvJyAoUE9TSVggYnVpbGRzKSBvciAnXFwnIChQRSkgYXMgc2VwYXJhdG9yOwogIC8vIGFsd2F5cyBub3JtYWxpemUgc28gYmFzZW5hbWUgZ3JhYnMgdGhlIHJpZ2h0IHRhaWwuCiAgY29uc3QgZmxhdCA9IG5hbWUucmVwbGFjZUFsbCgnXFwnLCAnLycpOwogIGNvbnN0IHRhaWwgPSBmbGF0LnNwbGl0KCcvJykucG9wKCkgPz8gJyc7CiAgcmV0dXJuIHRhaWwucmVwbGFjZSgvXC5ub2RlJC9pLCAnJyk7Cn0KCi8vIOKUgOKUgOKUgCBNYWluIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAoKZnVuY3Rpb24gbWFpbigpIHsKICBjb25zdCBbLCwgYmluYXJ5UGF0aCwgb3V0cHV0RGlyXSA9IHByb2Nlc3MuYXJndjsKICBpZiAoIWJpbmFyeVBhdGggfHwgIW91dHB1dERpcikgewogICAgY29uc29sZS5lcnJvcignVXNhZ2U6IGV4dHJhY3QtbmF0aXZlcy5tanMgPGJpbmFyeS1wYXRoPiA8b3V0cHV0LWRpcj4nKTsKICAgIHByb2Nlc3MuZXhpdCgxKTsKICB9CiAgaWYgKCFleGlzdHNTeW5jKGJpbmFyeVBhdGgpKSB7CiAgICBjb25zb2xlLmVycm9yKGBCaW5hcnkgbm90IGZvdW5kOiAke2JpbmFyeVBhdGh9YCk7CiAgICBwcm9jZXNzLmV4aXQoMSk7CiAgfQoKICBjb25zdCBidWYgPSByZWFkRmlsZVN5bmMoYmluYXJ5UGF0aCk7CiAgY29uc29sZS5sb2coYFNpemU6ICAgICR7KGJ1Zi5sZW5ndGggLyAxMDI0IC8gMTAyNCkudG9GaXhlZCgxKX0gTUJgKTsKCiAgY29uc3Qgc2VjdGlvbiA9IGZpbmRCdW5TZWN0aW9uKGJ1Zik7CiAgY29uc29sZS5sb2coYEZvcm1hdDogICR7c2VjdGlvbi5mb3JtYXR9ICgke3NlY3Rpb24uYXJjaH0tJHtzZWN0aW9uLm9zfSlgKTsKCiAgY29uc3Qgc2VjdGlvbkRhdGEgPSBjaGVja2VkU2xpY2UoYnVmLCBzZWN0aW9uLnJhd09mZnNldCwgc2VjdGlvbi5yYXdTaXplLCAnLmJ1biBzZWN0aW9uJyk7CiAgY29uc3QgcGF5bG9hZCAgICAgPSBwYXJzZVBheWxvYWQoc2VjdGlvbkRhdGEpOwogIGNvbnN0IG9mZnNldHMgICAgID0gcGFyc2VPZmZzZXRzKHBheWxvYWQpOwogIGNvbnN0IG1vZHVsZXMgICAgID0gcGFyc2VNb2R1bGVzKHBheWxvYWQsIG9mZnNldHMpOwogIGNvbnNvbGUubG9nKGBNb2R1bGVzOiAke21vZHVsZXMubGVuZ3RofSAoZW50cnkgaWQ9JHtvZmZzZXRzLmVudHJ5X3BvaW50X2lkfSlgKTsKCiAgbWtkaXJTeW5jKG91dHB1dERpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7CgogIGxldCBjbGlDb3VudCA9IDAsIG5hcGlDb3VudCA9IDAsIGRyb3BwZWQgPSAwOwogIGZvciAoY29uc3QgbSBvZiBtb2R1bGVzKSB7CiAgICBpZiAobS5lbnRyeSkgewogICAgICBjb25zdCBvdXQgPSBqb2luKG91dHB1dERpciwgJ2NsaS5vcmlnaW5hbC5qcycpOwogICAgICB3cml0ZUZpbGVTeW5jKG91dCwgbS5jb250ZW50KTsKICAgICAgY29uc29sZS5sb2coYCAgY2xpLmpzICAgJHsobS5jb250ZW50Lmxlbmd0aCAvIDEwMjQgLyAxMDI0KS50b0ZpeGVkKDIpfSBNQiDihpIgJHtvdXR9ICgke20ubmFtZX0pYCk7CiAgICAgIGNsaUNvdW50Kys7CiAgICB9IGVsc2UgaWYgKG0ubG9hZGVyID09PSAnbmFwaScpIHsKICAgICAgY29uc3QgYmFzZSA9IG5hcGlCYXNlbmFtZShtLm5hbWUpOwogICAgICBpZiAoIWJhc2UpIHsgY29uc29sZS53YXJuKGAgIHNraXAgbmFwaSAke20ubmFtZX06IGVtcHR5IGJhc2VuYW1lYCk7IGRyb3BwZWQrKzsgY29udGludWU7IH0KICAgICAgY29uc3QgZGlyID0gam9pbihvdXRwdXREaXIsICd2ZW5kb3InLCBiYXNlLCBgJHtzZWN0aW9uLmFyY2h9LSR7c2VjdGlvbi5vc31gKTsKICAgICAgbWtkaXJTeW5jKGRpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7CiAgICAgIGNvbnN0IG91dCA9IGpvaW4oZGlyLCBgJHtiYXNlfS5ub2RlYCk7CiAgICAgIHdyaXRlRmlsZVN5bmMob3V0LCBtLmNvbnRlbnQpOwogICAgICBjb25zb2xlLmxvZyhgICBuYXBpICAgICAkeyhtLmNvbnRlbnQubGVuZ3RoIC8gMTAyNCkudG9GaXhlZCgwKS5wYWRTdGFydCg1KX0gS0Ig4oaSICR7b3V0fWApOwogICAgICBuYXBpQ291bnQrKzsKICAgIH0gZWxzZSB7CiAgICAgIGRyb3BwZWQrKzsKICAgIH0KICB9CiAgY29uc29sZS5sb2coYEV4dHJhY3RlZDogJHtjbGlDb3VudH0gY2xpLmpzICsgJHtuYXBpQ291bnR9IG5hcGkgKCR7ZHJvcHBlZH0gZHJvcHBlZClgKTsKICBpZiAoY2xpQ291bnQgIT09IDEpIHsKICAgIGNvbnNvbGUuZXJyb3IoYGVycm9yOiBleHBlY3RlZCBleGFjdGx5IDEgZW50cnktcG9pbnQsIGdvdCAke2NsaUNvdW50fWApOwogICAgcHJvY2Vzcy5leGl0KDIpOwogIH0KfQoKbWFpbigpOwo=')
[System.IO.File]::WriteAllBytes($extractorPath, $ExtractorBytes)

# ─── Extract cli.js + native modules from Bun binary ──────────

# Single extractor pass: writes cli.original.js to $ClawDir and creates
# vendor\<name>\<arch>-<os>\<name>.node for every napi module in one go.
$VendorDir = Join-Path $ClawDir "vendor"
if (Test-Path $VendorDir) {
    Get-ChildItem -Force $VendorDir | Where-Object { $_.Name -ne "ripgrep" } | Remove-Item -Recurse -Force
}

$dstCli = Join-Path $ClawDir "cli.original.js"
if (Test-Path $dstCli) { Remove-Item -Force $dstCli }

Write-Dim "Extracting cli.js + napi modules from $NativeBinLabel ..."
& $BunBin $extractorPath $NativeBin $ClawDir 2>&1 | ForEach-Object { Write-Host "  $_" }
if (-not (Test-Path $dstCli)) {
    Write-Err "Failed to extract cli.js from native binary"
    exit 1
}

# Note: keep extractorPath around — repatch.mjs uses it on version drift

# ─── Post-process cli.js for Bun runtime ──────────────────────

Write-Dim "Rewriting bunfs paths and IIFE invocation ..."
$postProc = Join-Path $ClawDir "post-process.mjs"
$PostProcessorBytes = [Convert]::FromBase64String('IyEvdXNyL2Jpbi9lbnYgYnVuCmltcG9ydCB7IHJlYWRGaWxlU3luYywgd3JpdGVGaWxlU3luYywgdW5saW5rU3luYyB9IGZyb20gJ2ZzJzsKaW1wb3J0IHsgZGlybmFtZSB9IGZyb20gJ3BhdGgnOwppbXBvcnQgeyBmaWxlVVJMVG9QYXRoIH0gZnJvbSAndXJsJzsKCmNvbnN0IGhlcmUgPSBkaXJuYW1lKGZpbGVVUkxUb1BhdGgoaW1wb3J0Lm1ldGEudXJsKSk7CmNvbnN0IHNyYyA9IGAke2hlcmV9L2NsaS5vcmlnaW5hbC5qc2A7CmNvbnN0IGRzdCA9IGAke2hlcmV9L2NsaS5vcmlnaW5hbC5janNgOwoKbGV0IGNvZGUgPSByZWFkRmlsZVN5bmMoc3JjLCAndXRmOCcpOwoKLy8gU3RyaXAgbGVhZGluZyBAYnVuIHByYWdtYSBjb21tZW50cyAoZS5nLiAiLy8gQGJ1biBAYnl0ZWNvZGUgQGJ1bi1janNcbiIpCi8vIEJ1biByZXF1aXJlcyB0aGUgZmlsZSB0byBzdGFydCBkaXJlY3RseSB3aXRoICIoZnVuY3Rpb24iIHRvIHJlY29nbml6ZQovLyB0aGUgQ29tbW9uSlMgd3JhcHBlcjsgYW55IHByZWNlZGluZyBjb21tZW50IGJyZWFrcyB0aGF0IGRldGVjdGlvbi4KY29kZSA9IGNvZGUucmVwbGFjZSgvXig/OlwvXC9bXlxuXSpcbikrLywgJycpOwoKLy8gKDEpIGJ1bmZzIC5ub2RlIG1vZHVsZSBwYXRocyDihpIgcnVudGltZSB2ZW5kb3IgbG9va3VwCmNvZGUgPSBjb2RlLnJlcGxhY2UoCiAgL3JlcXVpcmVcKFsnIl0oXC9cJGJ1bmZzXC9yb290XC8oW1x3LV0rKVwubm9kZSlbJyJdXCkvZywKICAobSwgX2Z1bGwsIG5hbWUpID0+CiAgICBgcmVxdWlyZShyZXF1aXJlKCdwYXRoJykuam9pbihfX2Rpcm5hbWUsJ3ZlbmRvcicsJHtKU09OLnN0cmluZ2lmeShuYW1lKX0sXGBcJHtwcm9jZXNzLmFyY2g9PT0nYXJtNjQnPydhcm02NCc6J3g2NCd9LVwke3Byb2Nlc3MucGxhdGZvcm09PT0nZGFyd2luJz8nZGFyd2luJzpwcm9jZXNzLnBsYXRmb3JtPT09J2xpbnV4Jz8nbGludXgnOid3aW4zMid9XGAsJHtKU09OLnN0cmluZ2lmeShuYW1lICsgJy5ub2RlJyl9KSlgLAopOwoKLy8gKDIpIGJ1aWxkLXRpbWUgZmlsZVVSTFRvUGF0aCgpIGxlYWtzIOKGkiB1c2UgY2xpLmNqcydzIG93biBfX2ZpbGVuYW1lCmNvZGUgPSBjb2RlLnJlcGxhY2UoCiAgL1tcdyRdK1wuZmlsZVVSTFRvUGF0aFwoImZpbGU6XC9cL1wvaG9tZVwvcnVubmVyXC93b3JrXC9jbGF1ZGUtY2xpLWludGVybmFsXC9jbGF1ZGUtY2xpLWludGVybmFsXC9bXiJdKiJcKS9nLAogICgpID0+ICdfX2ZpbGVuYW1lJywKKTsKCi8vICgzKSBtYWtlIHRoZSBvdXRlciAoZnVuY3Rpb24oLi4uKXsuLi59KSBhY3R1YWxseSBydW4KY29kZSA9IGNvZGUucmVwbGFjZSgvXH1cKVxzKiQvLCAnfSkoZXhwb3J0cywgcmVxdWlyZSwgbW9kdWxlLCBfX2ZpbGVuYW1lLCBfX2Rpcm5hbWUpJyk7Cgp3cml0ZUZpbGVTeW5jKGRzdCwgY29kZSk7CnVubGlua1N5bmMoc3JjKTsKY29uc29sZS5sb2coYGNsaS5vcmlnaW5hbC5janM6ICR7Y29kZS5sZW5ndGh9IGJ5dGVzYCk7Cg==')
[System.IO.File]::WriteAllBytes($postProc, $PostProcessorBytes)
& $BunBin $postProc 2>&1 | ForEach-Object { Write-Host "  $_" }
if (-not (Test-Path (Join-Path $ClawDir "cli.original.cjs"))) {
    Write-Err "Post-process failed"
    exit 1
}

# Stamp source version so wrapper can detect drift on next launch
Set-Content -Path (Join-Path $ClawDir ".source-version") -Value $NativeBinLabel -Encoding ASCII

# If we pulled the binary from npm into a tmpdir, clean up — extraction
# is done; drift detection only consults %USERPROFILE%\.local\share\claude\versions\.
if ($NativeBinTmpDir -and (Test-Path $NativeBinTmpDir)) {
    Remove-Item -Recurse -Force $NativeBinTmpDir -ErrorAction SilentlyContinue
}

Write-OK "cli.original.cjs ready ($NativeBinLabel)"

}  # end -NoUpgrade skip

# ─── Write re-patch helper (used by wrapper on version drift) ─────────

$RepatcherBytes = [Convert]::FromBase64String('IyEvdXNyL2Jpbi9lbnYgYnVuCi8vIFJlLWV4dHJhY3QgKyBwb3N0LXByb2Nlc3MgKyBwYXRjaCB0aGUgdXNlcidzIGN1cnJlbnRseS1pbnN0YWxsZWQKLy8gbmF0aXZlIENsYXVkZSBiaW5hcnkuIEludm9rZWQgYnkgY2xpLmNqcyB3aGVuIGl0IGRldGVjdHMgdGhhdAovLyAuc291cmNlLXZlcnNpb24gbm8gbG9uZ2VyIG1hdGNoZXMgdGhlIGxhdGVzdCBiaW5hcnkgaW4gdmVyc2lvbnMvLgppbXBvcnQgeyBzcGF3blN5bmMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJzsKaW1wb3J0IHsgd3JpdGVGaWxlU3luYywgZXhpc3RzU3luYywgbWtkaXJTeW5jLCByZWFkZGlyU3luYywgcm1TeW5jIH0gZnJvbSAnZnMnOwppbXBvcnQgeyBkaXJuYW1lLCBqb2luLCBiYXNlbmFtZSB9IGZyb20gJ3BhdGgnOwppbXBvcnQgeyBmaWxlVVJMVG9QYXRoIH0gZnJvbSAndXJsJzsKCmNvbnN0IGhlcmUgPSBkaXJuYW1lKGZpbGVVUkxUb1BhdGgoaW1wb3J0Lm1ldGEudXJsKSk7CmNvbnN0IG5hdGl2ZUJpbiA9IHByb2Nlc3MuYXJndlsyXTsKCmlmICghbmF0aXZlQmluIHx8ICFleGlzdHNTeW5jKG5hdGl2ZUJpbikpIHsKICBjb25zb2xlLmVycm9yKCdyZXBhdGNoOiBuYXRpdmUgYmluYXJ5IHBhdGggcmVxdWlyZWQgYW5kIG11c3QgZXhpc3QnKTsKICBwcm9jZXNzLmV4aXQoMSk7Cn0KCmNvbnN0IHZlbmRvckRpciA9IGpvaW4oaGVyZSwgJ3ZlbmRvcicpOwppZiAoZXhpc3RzU3luYyh2ZW5kb3JEaXIpKSB7CiAgZm9yIChjb25zdCBlbnRyeSBvZiByZWFkZGlyU3luYyh2ZW5kb3JEaXIpKSB7CiAgICBpZiAoZW50cnkgIT09ICdyaXBncmVwJykgcm1TeW5jKGpvaW4odmVuZG9yRGlyLCBlbnRyeSksIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTsKICB9Cn0Kcm1TeW5jKGpvaW4oaGVyZSwgJ2NsaS5vcmlnaW5hbC5qcycpLCB7IGZvcmNlOiB0cnVlIH0pOwoKY29uc3QgcnVudGltZSA9IHByb2Nlc3MuZXhlY1BhdGg7CgpmdW5jdGlvbiBydW4obGFiZWwsIGFyZ3MpIHsKICBjb25zdCByID0gc3Bhd25TeW5jKHJ1bnRpbWUsIGFyZ3MsIHsgY3dkOiBoZXJlLCBzdGRpbzogJ2luaGVyaXQnIH0pOwogIGlmIChyLnN0YXR1cyAhPT0gMCkgewogICAgY29uc29sZS5lcnJvcihgcmVwYXRjaDogJHtsYWJlbH0gZmFpbGVkIChleGl0ICR7ci5zdGF0dXN9KWApOwogICAgcHJvY2Vzcy5leGl0KDEpOwogIH0KfQoKY29uc3QgZXh0cmFjdG9yID0gam9pbihoZXJlLCAnZXh0cmFjdC1uYXRpdmVzLm1qcycpOwpjb25zdCBwb3N0UHJvYyA9IGpvaW4oaGVyZSwgJ3Bvc3QtcHJvY2Vzcy5tanMnKTsKY29uc3QgcGF0Y2hlciA9IGpvaW4oaGVyZSwgJ3BhdGNoLm1qcycpOwoKcnVuKCdleHRyYWN0JywgW2V4dHJhY3RvciwgbmF0aXZlQmluLCBoZXJlXSk7CnJ1bigncG9zdC1wcm9jZXNzJywgW3Bvc3RQcm9jXSk7CnJ1bigncGF0Y2hlcicsIFtwYXRjaGVyXSk7Cgp3cml0ZUZpbGVTeW5jKGpvaW4oaGVyZSwgJy5zb3VyY2UtdmVyc2lvbicpLCBiYXNlbmFtZShuYXRpdmVCaW4pICsgJ1xuJyk7CmNvbnNvbGUubG9nKGBbY2xhd2dvZF0gcmUtcGF0Y2hlZCB0byAke2Jhc2VuYW1lKG5hdGl2ZUJpbil9YCk7Cg==')
[System.IO.File]::WriteAllBytes((Join-Path $ClawDir "repatch.mjs"), $RepatcherBytes)
Write-OK "Re-patch helper installed (repatch.mjs)"

# ─── Write OpenAI-compatible proxy ────────────────────────────

# NOTE: PowerShell here-string @'...'@ cannot contain a line starting with '@
# The proxy source is identical to the install.sh version.
# $PSScriptRoot is empty when run via iex (e.g. claude update → iex(irm $url)).
# Join-Path "" "file" throws a terminating error that -ErrorAction cannot catch.
try { $ProxySource = Get-Content (Join-Path $PSScriptRoot "openai-proxy.cjs") -Raw -ErrorAction Stop } catch { $ProxySource = $null }
if (-not $ProxySource) {
  # Inline fallback: fetch from release assets
  $ProxySource = @'
'use strict';
function translateSystem(system) {
  if (!system) return [];
  if (typeof system === 'string') return [{ role: 'system', content: system }];
  if (Array.isArray(system)) {
    var text = system.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n');
    return text ? [{ role: 'system', content: text }] : [];
  }
  return [];
}
function translateMessages(msgs) {
  var out = [];
  for (var i = 0; i < msgs.length; i++) {
    var msg = msgs[i];
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') { out.push({ role: 'user', content: msg.content }); continue; }
      if (!Array.isArray(msg.content)) continue;
      var toolResults = [], otherBlocks = [];
      for (var j = 0; j < msg.content.length; j++) {
        if (msg.content[j].type === 'tool_result') toolResults.push(msg.content[j]);
        else otherBlocks.push(msg.content[j]);
      }
      for (var k = 0; k < toolResults.length; k++) {
        var tr = toolResults[k], content = '';
        if (typeof tr.content === 'string') content = tr.content;
        else if (Array.isArray(tr.content)) content = tr.content.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n');
        if (tr.is_error) content = '[ERROR] ' + content;
        out.push({ role: 'tool', tool_call_id: tr.tool_use_id, content: content || '' });
      }
      if (otherBlocks.length > 0) {
        var parts = [];
        for (var l = 0; l < otherBlocks.length; l++) {
          var block = otherBlocks[l];
          if (block.type === 'text') parts.push({ type: 'text', text: block.text });
          else if (block.type === 'image') {
            var url = block.source.type === 'base64' ? 'data:' + block.source.media_type + ';base64,' + block.source.data : block.source.url;
            parts.push({ type: 'image_url', image_url: { url: url } });
          }
        }
        if (parts.length === 1 && parts[0].type === 'text') out.push({ role: 'user', content: parts[0].text });
        else if (parts.length > 0) out.push({ role: 'user', content: parts });
      }
    } else if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') { out.push({ role: 'assistant', content: msg.content }); continue; }
      if (!Array.isArray(msg.content)) continue;
      var textContent = '', toolCalls = [];
      for (var m = 0; m < msg.content.length; m++) {
        var b = msg.content[m];
        if (b.type === 'text') textContent += b.text;
        else if (b.type === 'tool_use') toolCalls.push({ id: b.id, type: 'function', function: { name: b.name, arguments: typeof b.input === 'string' ? b.input : JSON.stringify(b.input) } });
      }
      var assistantMsg = { role: 'assistant', content: textContent || null };
      if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
      out.push(assistantMsg);
    }
  }
  return out;
}
function translateTools(tools) {
  if (!tools || tools.length === 0) return undefined;
  return tools.map(function (t) {
    return { type: 'function', function: { name: t.name, description: t.description || '', parameters: t.input_schema || { type: 'object', properties: {} } } };
  });
}
function stripCacheControl(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripCacheControl);
  var out = {};
  for (var key in obj) { if (key === 'cache_control') continue; out[key] = stripCacheControl(obj[key]); }
  return out;
}
function translateRequest(body) {
  var cleaned = stripCacheControl(body);
  var systemMsgs = translateSystem(cleaned.system);
  var userMsgs = translateMessages(cleaned.messages || []);
  var openaiBody = { model: cleaned.model, messages: systemMsgs.concat(userMsgs), stream: !!cleaned.stream };
  if (cleaned.max_tokens) openaiBody.max_tokens = cleaned.max_tokens;
  if (cleaned.temperature !== undefined) openaiBody.temperature = cleaned.temperature;
  if (cleaned.top_p !== undefined) openaiBody.top_p = cleaned.top_p;
  if (cleaned.stop_sequences) openaiBody.stop = cleaned.stop_sequences;
  var tools = translateTools(cleaned.tools);
  if (tools) openaiBody.tools = tools;
  if (cleaned.stream) openaiBody.stream_options = { include_usage: true };
  return openaiBody;
}
function mapFinishReason(reason) {
  if (reason === 'stop') return 'end_turn';
  if (reason === 'tool_calls') return 'tool_use';
  if (reason === 'length') return 'max_tokens';
  return 'end_turn';
}
function translateResponse(openaiResp, requestModel) {
  var choice = openaiResp.choices && openaiResp.choices[0];
  if (!choice) return { id: 'msg_proxy_error', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'No response from upstream API' }], model: requestModel, stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } };
  var content = [];
  if (choice.message.content) content.push({ type: 'text', text: choice.message.content });
  if (choice.message.tool_calls) {
    for (var i = 0; i < choice.message.tool_calls.length; i++) {
      var tc = choice.message.tool_calls[i], input = {};
      try { input = JSON.parse(tc.function.arguments || '{}'); } catch (e) {}
      content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input: input });
    }
  }
  if (content.length === 0) content.push({ type: 'text', text: '' });
  return { id: openaiResp.id || ('msg_' + Date.now()), type: 'message', role: 'assistant', content: content, model: requestModel || openaiResp.model, stop_reason: mapFinishReason(choice.finish_reason), stop_sequence: null, usage: { input_tokens: (openaiResp.usage && openaiResp.usage.prompt_tokens) || 0, output_tokens: (openaiResp.usage && openaiResp.usage.completion_tokens) || 0 } };
}
function sse(event, data) { return 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'; }
function createStreamTranslator(requestModel) {
  var state = { model: requestModel, blockIndex: 0, sentStart: false, inText: false, tcBufs: {}, inTok: 0, outTok: 0, msgId: 'msg_' + Date.now() };
  return function (chunk) {
    var events = [];
    if (!state.sentStart) {
      state.sentStart = true;
      if (chunk.id) state.msgId = chunk.id;
      events.push(sse('message_start', { type: 'message_start', message: { id: state.msgId, type: 'message', role: 'assistant', content: [], model: state.model || chunk.model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } }));
      events.push(sse('ping', { type: 'ping' }));
    }
    var choice = chunk.choices && chunk.choices[0];
    if (!choice) { if (chunk.usage) { state.inTok = chunk.usage.prompt_tokens || 0; state.outTok = chunk.usage.completion_tokens || 0; } return events; }
    var delta = choice.delta || {};
    if (delta.content) {
      if (!state.inText) { state.inText = true; events.push(sse('content_block_start', { type: 'content_block_start', index: state.blockIndex, content_block: { type: 'text', text: '' } })); }
      events.push(sse('content_block_delta', { type: 'content_block_delta', index: state.blockIndex, delta: { type: 'text_delta', text: delta.content } }));
    }
    if (delta.tool_calls) {
      if (state.inText) { events.push(sse('content_block_stop', { type: 'content_block_stop', index: state.blockIndex })); state.blockIndex++; state.inText = false; }
      for (var i = 0; i < delta.tool_calls.length; i++) {
        var tc = delta.tool_calls[i], idx = tc.index;
        if (!state.tcBufs[idx]) {
          var tcId = tc.id || ('toolu_' + Date.now() + '_' + idx), tcName = (tc.function && tc.function.name) || '';
          state.tcBufs[idx] = { id: tcId, name: tcName, bi: state.blockIndex };
          events.push(sse('content_block_start', { type: 'content_block_start', index: state.blockIndex, content_block: { type: 'tool_use', id: tcId, name: tcName, input: {} } }));
          state.blockIndex++;
        }
        var buf = state.tcBufs[idx];
        if (tc.function && tc.function.name) buf.name = tc.function.name;
        if (tc.function && tc.function.arguments) {
          events.push(sse('content_block_delta', { type: 'content_block_delta', index: buf.bi, delta: { type: 'input_json_delta', partial_json: tc.function.arguments } }));
        }
      }
    }
    if (choice.finish_reason) {
      if (state.inText) { events.push(sse('content_block_stop', { type: 'content_block_stop', index: state.blockIndex })); state.inText = false; }
      for (var key in state.tcBufs) events.push(sse('content_block_stop', { type: 'content_block_stop', index: state.tcBufs[key].bi }));
      events.push(sse('message_delta', { type: 'message_delta', delta: { stop_reason: mapFinishReason(choice.finish_reason), stop_sequence: null }, usage: { output_tokens: state.outTok } }));
      events.push(sse('message_stop', { type: 'message_stop' }));
    }
    return events;
  };
}
function parseSSELines(text) {
  var chunks = [], lines = text.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line.startsWith('data: ')) continue;
    var payload = line.substring(6);
    if (payload === '[DONE]') { chunks.push(null); continue; }
    try { chunks.push(JSON.parse(payload)); } catch (e) {}
  }
  return chunks;
}
function startProxy(config) {
  var upstreamURL = (config.baseURL || 'https://api.x.ai/v1').replace(/\/+$/, '');
  var upstreamKey = config.apiKey;
  var server = Bun.serve({
    port: 0, hostname: '127.0.0.1', idleTimeout: 255,
    fetch: async function (req) {
      var url = new URL(req.url);
      if (req.method === 'GET' && url.pathname === '/health') return new Response('ok');
      if (req.method !== 'POST' || !url.pathname.endsWith('/messages'))
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      var body;
      try { body = await req.json(); } catch (e) {
        return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Invalid JSON' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      var requestModel = body.model || config.model || '';
      var isStream = !!body.stream;
      var openaiBody;
      try { openaiBody = translateRequest(body); } catch (e) {
        return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Translation error: ' + e.message } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      var upstreamResp;
      try {
        upstreamResp = await fetch(upstreamURL + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + upstreamKey },
          body: JSON.stringify(openaiBody),
        });
      } catch (e) {
        return new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Upstream connection failed: ' + e.message } }), { status: 502, headers: { 'Content-Type': 'application/json' } });
      }
      if (!upstreamResp.ok && !isStream) {
        var errText = await upstreamResp.text().catch(function () { return ''; });
        var errBody; try { errBody = JSON.parse(errText); } catch (e) { errBody = null; }
        return new Response(JSON.stringify({ type: 'error', error: { type: upstreamResp.status === 429 ? 'rate_limit_error' : 'api_error', message: (errBody && errBody.error && errBody.error.message) || errText || ('HTTP ' + upstreamResp.status) } }), { status: upstreamResp.status, headers: { 'Content-Type': 'application/json' } });
      }
      if (!isStream) {
        var result; try { result = await upstreamResp.json(); } catch (e) {
          return new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Invalid upstream response' } }), { status: 502, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify(translateResponse(result, requestModel)), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      var translator = createStreamTranslator(requestModel);
      var upstreamBody = upstreamResp.body;
      var readable = new ReadableStream({
        async start(controller) {
          var encoder = new TextEncoder(), decoder = new TextDecoder(), buffer = '';
          try {
            var reader = upstreamBody.getReader();
            while (true) {
              var r = await reader.read();
              if (r.done) break;
              buffer += decoder.decode(r.value, { stream: true });
              var boundary = buffer.lastIndexOf('\n');
              if (boundary === -1) continue;
              var complete = buffer.substring(0, boundary + 1);
              buffer = buffer.substring(boundary + 1);
              var chunks = parseSSELines(complete);
              for (var ci = 0; ci < chunks.length; ci++) {
                if (chunks[ci] === null) continue;
                var evts = translator(chunks[ci]);
                for (var ei = 0; ei < evts.length; ei++) controller.enqueue(encoder.encode(evts[ei]));
              }
            }
            if (buffer.trim()) {
              var rem = parseSSELines(buffer);
              for (var ri = 0; ri < rem.length; ri++) {
                if (rem[ri] === null) continue;
                var revts = translator(rem[ri]);
                for (var rei = 0; rei < revts.length; rei++) controller.enqueue(encoder.encode(revts[rei]));
              }
            }
          } catch (e) { controller.enqueue(encoder.encode(sse('error', { type: 'error', error: { type: 'api_error', message: 'Stream error: ' + e.message } }))); }
          finally { controller.close(); }
        },
      });
      return new Response(readable, { status: 200, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
    },
  });
  return { port: server.port, stop: function () { server.stop(); } };
}
module.exports = { startProxy: startProxy };
'@
}
$ProxySource | Set-Content (Join-Path $ClawDir "openai-proxy.cjs") -Encoding UTF8
Write-OK "OpenAI-compatible proxy created (openai-proxy.cjs)"

# ─── Write wrapper (cli.cjs, runs under Bun) ──────────────────

@'
#!/usr/bin/env bun
const { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync, renameSync } = require('fs');
const { join, basename, delimiter } = require('node:path');
const { homedir } = require('os');
const { spawnSync } = require('child_process');

const clawgodDir = join(homedir(), '.clawgod');
const ripgrepBin = join(clawgodDir, 'vendor', 'ripgrep', 'bin');
const ripgrepPathWasReady = process.env.CLAWGOD_INTERNAL_RIPGREP_PATH_READY === ripgrepBin
  && (process.env.PATH || '').split(delimiter)[0] === ripgrepBin;
if ((process.env.PATH || '').split(delimiter)[0] !== ripgrepBin) {
  process.env.PATH = `${ripgrepBin}${delimiter}${process.env.PATH || ''}`;
}
if (!ripgrepPathWasReady) {
  const reexec = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, CLAWGOD_INTERNAL_RIPGREP_PATH_READY: ripgrepBin },
  });
  if (reexec.error) {
    process.stderr.write('[clawgod] Failed to restart Bun with managed ripgrep PATH.\n');
    process.exit(1);
  }
  if (reexec.signal) {
    try { process.kill(process.pid, reexec.signal); } catch {}
    process.exit(1);
  }
  process.exit(reexec.status ?? 1);
}

// Note: drift detection removed — see install.sh wrapper for full notes.
// `versions/` either doesn't exist (Windows) or doesn't grow on healthy
// clawgod installs (we patch out `claude update`), so the check could only
// retract a fresh install.ps1 / install.sh upgrade. `claude update` →
// install.sh redirect is the single source of truth for version upgrades.

// One-time migration: earlier wrapper versions set CLAUDE_CONFIG_DIR=~/.clawgod,
// which made Claude Code read/write ~/.clawgod/.claude.json instead of the
// native ~/.claude.json (the file holding MCP config, project history, session
// index). Move it back transparently on first run after upgrade.
const nativeClaudeJson = join(homedir(), '.claude.json');
const strayClaudeJson = join(clawgodDir, '.claude.json');
if (existsSync(strayClaudeJson) && !existsSync(nativeClaudeJson)) {
  try { renameSync(strayClaudeJson, nativeClaudeJson); } catch {}
}

const providerDir = clawgodDir;
const configFile = join(providerDir, 'provider.json');

const defaultConfig = {
  apiKey: '',
  baseURL: 'https://api.anthropic.com',
  model: '',
  smallModel: '',
  timeoutMs: 3000000,
};

let config = { ...defaultConfig };
if (existsSync(configFile)) {
  try {
    const raw = JSON.parse(readFileSync(configFile, 'utf8'));
    config = { ...defaultConfig, ...raw };
  } catch {}
} else {
  mkdirSync(providerDir, { recursive: true });
  writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2) + '\n');
}

// OpenAI-compatible provider proxy (grok, openai-compat, etc.)
const _proxyTypes = { grok: 1, 'openai-compat': 1 };
if (_proxyTypes[config.type]) {
  let _proxyKey = config.apiKey || '';
  if (!_proxyKey && config.type === 'grok') {
    try {
      const _gs = JSON.parse(readFileSync(join(homedir(), '.grok', 'user-settings.json'), 'utf8'));
      _proxyKey = _gs.apiKey || '';
    } catch {}
    if (!_proxyKey) _proxyKey = process.env.GROK_API_KEY || '';
  }
  if (_proxyKey) {
    const { startProxy } = require('./openai-proxy.cjs');
    const _proxy = startProxy({
      apiKey: _proxyKey,
      baseURL: config.baseURL || (config.type === 'grok' ? 'https://api.x.ai/v1' : ''),
      model: config.model || '',
    });
    process.env.ANTHROPIC_API_KEY = 'proxy-passthrough';
    process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:' + _proxy.port;
    process.env.ANTHROPIC_AUTH_TOKEN = 'proxy-passthrough';
    if (config.model) process.env.ANTHROPIC_MODEL = config.model;
    if (config.smallModel) process.env.ANTHROPIC_SMALL_FAST_MODEL = config.smallModel;
    process.env.CLAUDE_CODE_ATTRIBUTION_HEADER = '0';
    process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS ??= '1';
    process.on('exit', function () { try { _proxy.stop(); } catch {} });
    process.stderr.write('[clawgod] OpenAI-compat proxy on port ' + _proxy.port + ' (type: ' + config.type + ')\n');
    config = { ...defaultConfig };
  } else {
    process.stderr.write('[clawgod] Warning: type=' + config.type + ' but no API key found\n');
  }
}

const hasProviderApiKey = !!config.apiKey;

if (hasProviderApiKey) {
  process.env.ANTHROPIC_API_KEY = config.apiKey;
  if (config.baseURL) process.env.ANTHROPIC_BASE_URL = config.baseURL;
  if (config.model) process.env.ANTHROPIC_MODEL = config.model;
  if (config.smallModel) process.env.ANTHROPIC_SMALL_FAST_MODEL = config.smallModel;
  if (config.baseURL && !/anthropic\.com/i.test(config.baseURL)) {
    process.env.ANTHROPIC_AUTH_TOKEN ??= config.apiKey;
  }
} else if (config.baseURL && config.baseURL !== defaultConfig.baseURL) {
  process.env.ANTHROPIC_BASE_URL ??= config.baseURL;
}

// claude-mem deliberately starts SDK subprocesses without Claude settings or
// inherited auth. Its ClawGod Plus-specific launcher marks those subprocesses so the
// wrapper can resolve the same provider and Haiku mapping at spawn time without
// copying credentials into ~/.claude-mem/.env.
if (process.env.CLAWGOD_CLAUDE_MEM === '1') {
  let _cmEnv = {};
  try {
    const _cmSettings = JSON.parse(readFileSync(join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'settings.json'), 'utf8'));
    if (_cmSettings && typeof _cmSettings.env === 'object') _cmEnv = _cmSettings.env;
  } catch {}
  const _cmValue = function(v) { return typeof v === 'string' && v && !/[\r\n\0]/.test(v) ? v : ''; };
  const _cmHaiku = _cmValue(_cmEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL) || _cmValue(process.env.ANTHROPIC_SMALL_FAST_MODEL);
  if (_cmHaiku) process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = _cmHaiku;
  const _cmProxyActive = process.env.ANTHROPIC_API_KEY === 'proxy-passthrough';
  if (!_cmProxyActive && hasProviderApiKey) {
    process.env.ANTHROPIC_API_KEY = config.apiKey;
    if (config.baseURL) process.env.ANTHROPIC_BASE_URL = config.baseURL;
    if (config.baseURL && !/anthropic\.com/i.test(config.baseURL)) process.env.ANTHROPIC_AUTH_TOKEN = config.apiKey;
    else delete process.env.ANTHROPIC_AUTH_TOKEN;
  } else if (!_cmProxyActive && !hasProviderApiKey) {
    const _cmApiKey = _cmValue(_cmEnv.ANTHROPIC_API_KEY);
    const _cmAuthToken = _cmValue(_cmEnv.ANTHROPIC_AUTH_TOKEN);
    const _cmBaseURL = _cmValue(_cmEnv.ANTHROPIC_BASE_URL);
    if (_cmApiKey) process.env.ANTHROPIC_API_KEY = _cmApiKey;
    if (_cmAuthToken) process.env.ANTHROPIC_AUTH_TOKEN = _cmAuthToken;
    if (_cmBaseURL) process.env.ANTHROPIC_BASE_URL = _cmBaseURL;
  }
}

// Third-party Anthropic-compatible proxies (DeepSeek / OneAPI / Bedrock /
// vLLM / etc.) don't share Anthropic's server-side handling of
// x-anthropic-billing-header. That header carries a per-request `cch` field
// which Anthropic's own server excludes from prompt-cache key calculation
// (via cacheScope:null), but third-party proxies fold into the prefix hash —
// so the cached prefix changes every request and cache hit rate drops to
// zero. Auto-disable the header whenever baseURL points away from Anthropic.
// Users can force re-enable with CLAUDE_CODE_ATTRIBUTION_HEADER=1 if needed.
if (config.baseURL && !/anthropic\.com/i.test(config.baseURL)) {
  process.env.CLAUDE_CODE_ATTRIBUTION_HEADER ??= '0';
  try {
    const _rcSettings = join(homedir(), '.claude', 'settings.json');
    if (existsSync(_rcSettings)) {
      const _rcS = JSON.parse(readFileSync(_rcSettings, 'utf8'));
      if (_rcS.disableRemoteControl) {
        delete _rcS.disableRemoteControl;
        writeFileSync(_rcSettings, JSON.stringify(_rcS, null, 2) + '\n');
      }
    }
  } catch {}
}

if (config.timeoutMs) {
  process.env.API_TIMEOUT_MS ??= String(config.timeoutMs);
}
process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC ??= '1';
process.env.DISABLE_INSTALLATION_CHECKS ??= '1';
// "Built-in" ripgrep resolves through the ClawGod-managed PATH above.
process.env.USE_BUILTIN_RIPGREP ??= '1';

const featuresFile = join(providerDir, 'features.json');
if (!process.env.CLAUDE_INTERNAL_FC_OVERRIDES && existsSync(featuresFile)) {
  try {
    const raw = readFileSync(featuresFile, 'utf8');
    JSON.parse(raw);
    process.env.CLAUDE_INTERNAL_FC_OVERRIDES = raw;
  } catch {}
}

// Keep process.execPath as the Bun runtime. Claude Code's background daemon
// launch path respawns this patched JS entrypoint as:
//   process.execPath process.argv[1] daemon run ...
// If process.execPath is rewritten to the native Claude binary, the native
// binary receives cli.cjs as an argument and the daemon/control socket never
// comes up, leaving `claude agents` stuck on opening completed sessions.
// CLAUDE_CODE_EXECPATH is still exported by the shell launcher for any code
// paths that need to know the native binary explicitly.

// Lean mode toggle — --lean-off / --lean-on / --lean-max
if (process.argv.includes('--lean-off') || process.argv.includes('--lean-on') || process.argv.includes('--lean-max')) {
  const _leanOff = join(clawgodDir, '.lean-disabled');
  const _leanMax = join(clawgodDir, '.lean-max');
  const _leanSettings = join(homedir(), '.claude', 'settings.json');
  const _baseDeny = ['DesignSync','NotebookEdit','PushNotification','RemoteTrigger','CronCreate','CronDelete','CronList'];
  const _maxDeny = ['EnterPlanMode','ExitPlanMode','SendMessage','ScheduleWakeup','AskUserQuestion','ReportFindings'];
  const _baseFlags = ['disableWorkflows','disableRemoteControl','disableClaudeAiConnectors','disableArtifact'];
  const _maxFlags = ['disableBundledSkills'];
  const _allDeny = new Set([..._baseDeny, ..._maxDeny]);
  const _allFlags = [..._baseFlags, ..._maxFlags];
  const _unlink = function(p) { try { require('fs').unlinkSync(p); } catch {} };
  if (process.argv.includes('--lean-off')) {
    writeFileSync(_leanOff, '');
    _unlink(_leanMax);
    try {
      const _s = JSON.parse(readFileSync(_leanSettings, 'utf8'));
      for (const _k of _allFlags) delete _s[_k];
      if (Array.isArray(_s.permissions?.deny)) _s.permissions.deny = _s.permissions.deny.filter(function(t) { return !_allDeny.has(t); });
      writeFileSync(_leanSettings, JSON.stringify(_s, null, 2) + '\n');
    } catch {}
    process.stderr.write('[clawgod] Lean mode disabled. All tools restored.\n');
  } else {
    const _isMax = process.argv.includes('--lean-max');
    _unlink(_leanOff);
    if (_isMax) writeFileSync(_leanMax, ''); else _unlink(_leanMax);
    const _deny = _isMax ? [..._baseDeny, ..._maxDeny] : _baseDeny;
    const _flags = _isMax ? _allFlags : _baseFlags;
    try {
      let _s = {};
      try { _s = JSON.parse(readFileSync(_leanSettings, 'utf8')); } catch {}
      let _ch = false;
      for (const _k of _flags) { if (!(_k in _s)) { _s[_k] = true; _ch = true; } }
      if (!_isMax) { for (const _k of _maxFlags) { if (_k in _s) { delete _s[_k]; _ch = true; } } }
      if (!_s.permissions) _s.permissions = {};
      if (!Array.isArray(_s.permissions.deny)) _s.permissions.deny = [];
      const _ex = new Set(_s.permissions.deny);
      for (const _t of _deny) { if (!_ex.has(_t)) { _s.permissions.deny.push(_t); _ch = true; } }
      if (!_isMax) {
        const _maxSet = new Set(_maxDeny);
        const _before = _s.permissions.deny.length;
        _s.permissions.deny = _s.permissions.deny.filter(function(t) { return !_maxSet.has(t); });
        if (_s.permissions.deny.length !== _before) _ch = true;
      }
      if (_ch) writeFileSync(_leanSettings, JSON.stringify(_s, null, 2) + '\n');
    } catch {}
    process.stderr.write('[clawgod] Lean mode: ' + (_isMax ? 'max' : 'on') + '. Settings updated.\n');
  }
  process.exit(0);
}

// Update check — cached, non-blocking, 24h interval
try {
  const _ucFile = join(clawgodDir, '.update-check');
  const _verFile = join(clawgodDir, '.clawgod-version');
  if (existsSync(_verFile)) {
    const _localVer = readFileSync(_verFile, 'utf8').trim();
    let _uc = null;
    try { if (existsSync(_ucFile)) _uc = JSON.parse(readFileSync(_ucFile, 'utf8')); } catch {}
    var _semGt = function(a, b) { var x = a.split('.'), y = b.split('.'); for (var i = 0; i < 3; i++) { var d = (parseInt(x[i]||0)) - (parseInt(y[i]||0)); if (d) return d > 0; } return false; };
    if (_uc && _uc.v && _semGt(_uc.v, _localVer)) {
      process.stderr.write('[clawgod] v' + _uc.v + ' available (installed: v' + _localVer + ") — run 'claude update' to upgrade\n");
    }
    if (!_uc || Date.now() - (_uc.t || 0) > 86400000) {
      fetch('https://api.github.com/repos/A6083450/clawgod-plus/releases/latest', {
        headers: { 'User-Agent': 'clawgod' },
        signal: AbortSignal.timeout(5000),
      }).then(function(r) { return r.json(); }).then(function(d) {
        var v = (d.tag_name || '').replace(/^v/, '');
        if (v) writeFileSync(_ucFile, JSON.stringify({ t: Date.now(), v: v }));
      }).catch(function() {});
    }
  }
} catch {}

require('./cli.original.cjs');
'@ | Set-Content (Join-Path $ClawDir "cli.cjs") -Encoding UTF8
Set-Content (Join-Path $ClawDir ".clawgod-version") $ClawSelfVersion
Write-OK "Wrapper created (cli.cjs)"

# ─── Write universal patcher ──────────────────────────
# (Same Bun patcher as bash version — inline to avoid extra download)

$patcherCode = @'
#!/usr/bin/env bun
/**
 * ClawGod Plus Universal Patcher
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET = join(__dirname, 'cli.original.cjs');
const BACKUP = TARGET + '.bak';
const ACORN_CACHE = join(__dirname, 'vendor', 'acorn.cjs');
const ACORN_URL = 'https://unpkg.com/acorn@8.16.0/dist/acorn.js';

async function loadAcorn() {
  try {
    if (!existsSync(ACORN_CACHE)) {
      mkdirSync(dirname(ACORN_CACHE), { recursive: true });
      const response = await fetch(ACORN_URL);
      if (!response.ok) return null;
      const temp = `${ACORN_CACHE}.${process.pid}.tmp`;
      writeFileSync(temp, await response.text(), 'utf8');
      renameSync(temp, ACORN_CACHE);
    }
    const module = await import(pathToFileURL(ACORN_CACHE).href);
    const acorn = typeof module.parse === 'function' ? module : module.default;
    return acorn && typeof acorn.parse === 'function' ? acorn : null;
  } catch {
    return null;
  }
}

function findNodes(node, predicate, results = []) {
  if (!node || typeof node !== 'object') return results;
  if (predicate(node)) results.push(node);
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (!child || typeof child !== 'object') continue;
    if (Array.isArray(child)) {
      for (const item of child) findNodes(item, predicate, results);
    } else {
      findNodes(child, predicate, results);
    }
  }
  return results;
}

function isChromeClientFactory(node) {
  let bodyStmts;
  if (node.body?.type === 'BlockStatement') bodyStmts = node.body.body;
  else return false;
  if (!node.params || node.params.length !== 1) return false;
  if (bodyStmts.length !== 1 || bodyStmts[0].type !== 'ReturnStatement') return false;
  const ret = bodyStmts[0].argument;
  if (!ret || ret.type !== 'ConditionalExpression') return false;
  if (ret.test?.type !== 'MemberExpression' || ret.test.property?.name !== 'bridgeConfig') return false;
  const alt = ret.alternate;
  if (!alt || alt.type !== 'ConditionalExpression') return false;
  if (alt.test?.type !== 'MemberExpression' || alt.test.property?.name !== 'getSocketPaths') return false;
  return true;
}

async function applyClaudeChromeSocketPatch(source, { dryRun, verify }) {
  const replacements = [];
  const seen = new Set();
  const needs = {
    clientFactory: !source.includes('__ccpp_bridge_fallback_v2'),
    subscriptionGate: !source.includes('__ccpp_sub_bypass'),
    subscriptionMsg: !source.includes('__ccpp_sub_msg_bypass'),
    selectBrowserHide: !source.includes('__ccpp_no_select_browser'),
  };

  function add(name, start, end, replacement) {
    if (!needs[name] || seen.has(name)) return;
    replacements.push({ name, start, end, replacement });
    seen.add(name);
  }

  const legacyClientFactoryRe = /function ([\w$]+)\(([\w$]+)\)\{if\(\2\.getSocketPaths\)\{var __paths=\2\.getSocketPaths\(\);if\(__paths&&__paths\.length>0\)return ([\w$]+\(\2\))\}return \2\.bridgeConfig\?([\w$]+\(\2\)):([\w$]+\(\2\))\}\/\*__ccpp_bridge_fallback\*\//g;
  const legacyClientFactory = legacyClientFactoryRe.exec(source);
  if (legacyClientFactory) {
    add(
      'clientFactory',
      legacyClientFactory.index,
      legacyClientFactory.index + legacyClientFactory[0].length,
      `function ${legacyClientFactory[1]}(${legacyClientFactory[2]}){return ${legacyClientFactory[2]}.getSocketPaths?${legacyClientFactory[3]}:${legacyClientFactory[2]}.bridgeConfig?${legacyClientFactory[4]}:${legacyClientFactory[5]}}/*__ccpp_bridge_fallback_v2*/`
    );
  }

  let parseSource = source;
  let offset = 0;
  if (parseSource.startsWith('#!')) {
    const idx = parseSource.indexOf('\n');
    if (idx >= 0) {
      offset = idx + 1;
      parseSource = parseSource.slice(offset);
    }
  }

  const acorn = Object.values(needs).some(Boolean) ? await loadAcorn() : null;
  if (acorn) {
    try {
      const ast = acorn.parse(parseSource, { ecmaVersion: 'latest', sourceType: 'module' });
      const src = (node) => parseSource.slice(node.start, node.end);
      const abs = (pos) => pos + offset;

      if (needs.clientFactory) {
        const funcs = [
          ...findNodes(ast, (n) => n.type === 'FunctionDeclaration'),
          ...findNodes(ast, (n) =>
            n.type === 'VariableDeclarator' &&
            n.init &&
            (n.init.type === 'ArrowFunctionExpression' || n.init.type === 'FunctionExpression')
          ),
        ];
        for (const node of funcs) {
          const fnNode = node.type === 'VariableDeclarator' ? node.init : node;
          if (!isChromeClientFactory(fnNode)) continue;
          const paramName = fnNode.params[0].name;
          const cond = fnNode.body.body[0].argument;
          const bridgeCall = src(cond.consequent);
          const socketCall = src(cond.alternate.consequent);
          const nativeCall = src(cond.alternate.alternate);
          add(
            'clientFactory',
            abs(fnNode.body.start),
            abs(fnNode.body.end),
            `{return ${paramName}.getSocketPaths?${socketCall}:${paramName}.bridgeConfig?${bridgeCall}:${nativeCall}}/*__ccpp_bridge_fallback_v2*/`
          );
          break;
        }
      }

      if (needs.subscriptionGate) {
        for (const decl of findNodes(ast, (n) => n.type === 'VariableDeclarator')) {
          if (!decl.init || decl.init.type !== 'LogicalExpression' || decl.init.operator !== '&&') continue;
          const left = decl.init.left;
          const right = decl.init.right;
          if (left.type !== 'CallExpression' || !left.arguments?.length) continue;
          const arg = left.arguments[0];
          if (!arg || arg.type !== 'MemberExpression' || arg.property?.name !== 'chrome') continue;
          if (right.type !== 'CallExpression' || right.arguments?.length !== 0) continue;
          const calleeName = left.callee?.name || left.callee?.property?.name;
          if (!calleeName) continue;
          const defs = findNodes(ast, (n) =>
            (n.type === 'FunctionDeclaration' && n.id?.name === calleeName) ||
            (n.type === 'VariableDeclarator' && n.id?.name === calleeName)
          );
          if (!defs.some((def) => src(def).includes('claudeInChromeDefaultEnabled'))) continue;
          add('subscriptionGate', abs(decl.init.start), abs(decl.init.end), `${src(left)}/*__ccpp_sub_bypass*/`);
          break;
        }
      }

      if (needs.subscriptionMsg) {
        const msgAnchor = 'Claude in Chrome requires a claude.ai subscription.';
        const msgPos = parseSource.indexOf(msgAnchor);
        if (msgPos >= 0) {
          const before = parseSource.slice(Math.max(0, msgPos - 200), msgPos);
          if (!before.includes('false&&')) {
            const logicals = findNodes(ast, (n) =>
              n.type === 'LogicalExpression' &&
              n.operator === '&&' &&
              n.start <= msgPos &&
              n.end >= msgPos &&
              n.left?.type === 'UnaryExpression' &&
              n.left.operator === '!'
            );
            if (logicals.length > 0) {
              const target = logicals.reduce((a, b) => (b.end - b.start) < (a.end - a.start) ? b : a);
              add('subscriptionMsg', abs(target.left.start), abs(target.left.end), 'false/*__ccpp_sub_msg_bypass*/');
            }
          }
        }
      }

      if (needs.selectBrowserHide) {
        const selectBrowserNodes = findNodes(ast, (n) => {
          if (n.type !== 'ObjectExpression') return false;
          return n.properties?.some((p) => p.key?.name === 'value' && p.value?.value === 'select-browser');
        });
        if (selectBrowserNodes.length > 0) {
          const sbNode = selectBrowserNodes[0];
          const pushCalls = findNodes(ast, (n) =>
            n.type === 'CallExpression' &&
            n.callee?.property?.name === 'push' &&
            n.start >= sbNode.start &&
            n.start - sbNode.end <= 200
          );
          if (pushCalls.length > 0) {
            add('selectBrowserHide', abs(pushCalls[0].start), abs(pushCalls[0].end), 'void 0/*__ccpp_no_select_browser*/');
          }
        }
      }
    } catch {}
  }

  // Regex fallback for the current minified bundle shape. The AST path above
  // handles name drift; this keeps install/repatch useful if acorn is absent.
  if (needs.clientFactory && !seen.has('clientFactory')) {
    const re = /function ([\w$]+)\(([\w$]+)\)\{return \2\.bridgeConfig\?([\w$]+\(\2\)):\2\.getSocketPaths\?([\w$]+\(\2\)):([\w$]+\(\2\))\}/g;
    const m = re.exec(source);
    if (m) add('clientFactory', m.index, m.index + m[0].length, `function ${m[1]}(${m[2]}){return ${m[2]}.getSocketPaths?${m[4]}:${m[2]}.bridgeConfig?${m[3]}:${m[5]}}/*__ccpp_bridge_fallback_v2*/`);
  }

  if (needs.subscriptionGate && !seen.has('subscriptionGate')) {
    const re = /(\b[\w$]+\(([\w$]+)\.chrome\);let [\w$]+=)([\w$]+\(\2\.chrome\))&&[\w$]+\(\)(?=,[\s\S]{0,1600}?tengu_claude_in_chrome_setup)/g;
    const m = re.exec(source);
    if (m) add('subscriptionGate', m.index, m.index + m[0].length, `${m[1]}${m[3]}/*__ccpp_sub_bypass*/`);
  }

  if (needs.subscriptionMsg && !seen.has('subscriptionMsg')) {
    const re = /(\b[\w$]+=)(![\w$]+)(&&[\s\S]{0,500}?"Claude in Chrome requires a claude\.ai subscription\.")/g;
    const m = re.exec(source);
    if (m) add('subscriptionMsg', m.index, m.index + m[0].length, `${m[1]}false/*__ccpp_sub_msg_bypass*/${m[3]}`);
  }

  if (needs.selectBrowserHide && !seen.has('selectBrowserHide')) {
    const re = /(\{label:"Select browser(?:\\u2026|\u2026)",value:"select-browser"\}[\s\S]{0,240}?)([\w$]+)\.push\(([\w$]+)\)/g;
    const m = re.exec(source);
    if (m) add('selectBrowserHide', m.index, m.index + m[0].length, `${m[1]}void 0/*__ccpp_no_select_browser*/`);
  }

  if (replacements.length === 0) {
    const hasChrome = source.includes('tengu_claude_in_chrome_setup') ||
      source.includes('Claude in Chrome requires a claude.ai subscription.') ||
      source.includes('select-browser');
    const allApplied = source.includes('__ccpp_bridge_fallback_v2') &&
      (source.includes('__ccpp_sub_bypass') || !source.includes('tengu_claude_in_chrome_setup')) &&
      (source.includes('__ccpp_sub_msg_bypass') || !source.includes('Claude in Chrome requires a claude.ai subscription.')) &&
      (source.includes('__ccpp_no_select_browser') || !source.includes('select-browser'));
    if (allApplied) return { status: 'already', detail: 'already applied' };
    if (!hasChrome) return { status: 'skipped', detail: 'not present in this version' };
    return { status: 'failed', detail: 'Chrome socket patterns not found' };
  }

  if (verify) return { status: 'verify', count: replacements.length };

  let next = source;
  if (!dryRun) {
    replacements.sort((a, b) => b.start - a.start);
    for (const r of replacements) next = next.slice(0, r.start) + r.replacement + next.slice(r.end);
  }
  return { status: 'applied', count: replacements.length, code: next };
}

async function applyContextLimitPatch(source, { dryRun, verify }) {
  const ENV_EXPR = '(+process.env.CLAUDE_CODE_CONTEXT_LIMIT||+process.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS||200000)';
  const dualRe = /var\s+([\w$]+)\s*=\s*200000\s*,\s*([\w$]+)\s*=\s*200000\s*,\s*([\w$]+)\s*=\s*32000\s*,\s*([\w$]+)\s*=\s*128000\s*,\s*([\w$]+)\s*=\s*1e6\b/;
  const alreadyRe = new RegExp('var\\s+([\\w$]+)\\s*=\\s*\\(\\+process\\.env\\.CLAUDE_CODE_CONTEXT_LIMIT\\|\\|\\+process\\.env\\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\\|\\|200000\\)\\s*,\\s*([\\w$]+)\\s*=\\s*\\(\\+process\\.env\\.CLAUDE_CODE_CONTEXT_LIMIT\\|\\|\\+process\\.env\\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\\|\\|200000\\)\\s*,\\s*[\\w$]+\\s*=\\s*32000\\s*,\\s*[\\w$]+\\s*=\\s*128000\\s*,\\s*[\\w$]+\\s*=\\s*1e6\\b');

  const dualMatch = dualRe.exec(source);
  const alreadyMatch = alreadyRe.exec(source);
  if (!dualMatch && !alreadyMatch) {
    if (!source.includes('200000')) return { status: 'skipped', detail: 'not present in this version' };
    return { status: 'failed', detail: 'context default constants not found' };
  }

  const match = dualMatch || alreadyMatch;
  const [, varA, varB, varC, varD, varE] = match;
  const replacements = [];
  if (dualMatch) {
    replacements.push({
      start: dualMatch.index,
      end: dualMatch.index + dualMatch[0].length,
      replacement: `var ${varA}=${ENV_EXPR},${varB}=${ENV_EXPR},${varC}=32000,${varD}=128000,${varE}=1e6`,
    });

    // The large-message guard has the minified shape
    // `return message?tokenCount(message)>200000:!1`. Patch only that guard;
    // unrelated numeric thresholds and model metadata must stay upstream-owned.
    const cmpRe = /\breturn ([\w$]+)\?([\w$]+)\(\1\)>200000:!1/g;
    let cm;
    while ((cm = cmpRe.exec(source)) !== null) {
      const comparison = `${cm[2]}(${cm[1]})>200000`;
      const start = cm.index + cm[0].indexOf(comparison);
      replacements.push({
        start,
        end: start + comparison.length,
        replacement: `${cm[2]}(${cm[1]})>${ENV_EXPR}`,
      });
    }
  }

  const envReassign = `;${varA}=${ENV_EXPR};${varB}=${ENV_EXPR};`;
  const acorn = await loadAcorn();
  if (acorn) {
    try {
      const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
      const envAssigns = findNodes(ast, (n) =>
        n.type === 'ExpressionStatement' &&
        n.expression?.type === 'CallExpression' &&
        n.expression.callee?.type === 'MemberExpression' &&
        n.expression.callee.object?.name === 'Object' &&
        n.expression.callee.property?.name === 'assign' &&
        n.expression.arguments?.length >= 2 &&
        n.expression.arguments[0]?.type === 'MemberExpression' &&
        n.expression.arguments[0].object?.name === 'process' &&
        n.expression.arguments[0].property?.name === 'env'
      );
      for (const stmt of envAssigns.slice(0, 6)) {
        if (source.startsWith(envReassign, stmt.end)) continue;
        replacements.push({ start: stmt.end, end: stmt.end, replacement: envReassign });
      }
    } catch {}
  }

  if (replacements.length === 0) return { status: 'already', detail: 'already applied' };
  if (verify) return { status: 'verify', count: replacements.length };

  let next = source;
  if (!dryRun) {
    replacements.sort((a, b) => b.start - a.start);
    for (const r of replacements) next = next.slice(0, r.start) + r.replacement + next.slice(r.end);
  }
  return { status: 'applied', count: replacements.length, code: next };
}

const patches = [
  {
    name: 'USER_TYPE → ant',
    pattern: /function ([\w$]+)\(\)\{return"external"\}/g,
    replacer: (m, fn) => `function ${fn}(){return"ant"}`,
    sentinel: 'return"external"',
  },
  {
    // ClawGod Plus runs extracted cli.cjs under Bun even when Bun reports itself as
    // standalone. Special-case only the worker/daemon resolver; the shared
    // standalone predicate also controls Chrome and Computer Use MCP commands.
    name: 'Worker resolver for plain Bun cli.cjs (target shape)',
    pattern: /if\(([\w$]+)\(\)\)return\{cmd:process\.execPath,prefixArgs:\[\],target:process\.execPath\};let ([\w$]+)=process\.argv\[1\];if\(!\2\)return\{cmd:process\.execPath,prefixArgs:\[\],target:process\.execPath\};return\{cmd:process\.execPath,prefixArgs:\[\2\],target:\2\}/g,
    replacer: (m, standalone, entry) => `let ${entry}=process.argv[1];if(${entry}&&/(?:^|[\\/])cli\\.cjs$/.test(${entry}))return{cmd:process.execPath,prefixArgs:[${entry}],target:${entry}}/*__clawgod_plain_bun_worker__*/;if(${standalone}())return{cmd:process.execPath,prefixArgs:[],target:process.execPath};if(!${entry})return{cmd:process.execPath,prefixArgs:[],target:process.execPath};return{cmd:process.execPath,prefixArgs:[${entry}],target:${entry}}`,
    appliedMarker: '/*__clawgod_plain_bun_worker__*/',
    knownShape: /if\([\w$]+\(\)\)return\{cmd:process\.execPath,prefixArgs:\[\],target:process\.execPath\};let [\w$]+=process\.argv\[1\];if\(![\w$]+\)return\{cmd:process\.execPath,prefixArgs:\[\],target:process\.execPath\};return\{cmd:process\.execPath,prefixArgs:/,
    optional: true,
  },
  {
    name: 'Worker resolver for plain Bun cli.cjs (legacy shape)',
    pattern: /if\(([\w$]+)\(\)\)return\{cmd:process\.execPath,prefixArgs:\[\]\};let ([\w$]+)=process\.argv\[1\];if\(!\2\)return\{cmd:process\.execPath,prefixArgs:\[\]\};return\{cmd:process\.execPath,prefixArgs:\[\2\]\}/g,
    replacer: (m, standalone, entry) => `let ${entry}=process.argv[1];if(${entry}&&/(?:^|[\\/])cli\\.cjs$/.test(${entry}))return{cmd:process.execPath,prefixArgs:[${entry}]}/*__clawgod_plain_bun_worker__*/;if(${standalone}())return{cmd:process.execPath,prefixArgs:[]};if(!${entry})return{cmd:process.execPath,prefixArgs:[]};return{cmd:process.execPath,prefixArgs:[${entry}]}`,
    appliedMarker: '/*__clawgod_plain_bun_worker__*/',
    knownShape: /if\([\w$]+\(\)\)return\{cmd:process\.execPath,prefixArgs:\[\]\};let [\w$]+=process\.argv\[1\];if\(![\w$]+\)return\{cmd:process\.execPath,prefixArgs:\[\]\};return\{cmd:process\.execPath,prefixArgs:/,
    optional: true,
  },
  {
    name: 'GrowthBook env overrides',
    pattern: /function ([\w$]+)\(\)\{if\(!([\w$]+)\)\2=!0;return ([\w$]+)\}/g,
    replacer: (m, fn, flag, val) =>
      `function ${fn}(){if(!${flag}){${flag}=!0;try{let e=process.env.CLAUDE_INTERNAL_FC_OVERRIDES;if(e)${val}=JSON.parse(e)}catch(e){}}return ${val}}`,
    unique: true,
  },
  {
    name: 'GrowthBook config overrides',
    pattern: /function ([\w$]+)\(\)\{return\}(function)/g,
    replacer: (m, fn, next) =>
      `function ${fn}(){return null}${next}`,
    selectIndex: 0,
    validate: (match, code) => {
      const pos = code.indexOf(match);
      const nearby = code.substring(Math.max(0, pos - 500), pos + 500);
      return nearby.includes('growthBook') || nearby.includes('GrowthBook') || nearby.includes('FeatureValue');
    },
  },
  {
    name: 'Agent Teams always enabled',
    pattern: /function ([\w$]+)\(\)\{if\(![\w$]+\(process\.env\.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS\)&&![\w$]+\(\)\)return!1;if\(![\w$]+\("tengu_amber_flint",!0\)\)return!1;return!0\}/g,
    replacer: (m, fn) => `function ${fn}(){return!0}`,
    sentinel: 'tengu_amber_flint',
  },
  {
    // Session-aware launchers pass this metadata through the early view gate.
    name: 'Agents view session metadata',
    pattern: /function ([\w$]+)\(([\w$]+)\)\{for\(let ([\w$]+)=0;\3<\2\.length;\3\+\+\)\{let ([\w$]+)=\2\[\3\];if\((\4==="--debug"\|\|\4==="-d"\|\|\4==="--debug-to-stderr"\|\|\4==="-d2e"\|\|\4\.startsWith\("--debug="\)\|\|\4\.startsWith\("--debug-file="\))\)continue;if\(\4==="--debug-file"&&\3\+1<\2\.length\)\{\3\+\+;continue\}return!1\}return!0\}/g,
    replacer: (m, fn, args, index, arg, debugFlags) =>
      `function ${fn}(${args}){for(let ${index}=0;${index}<${args}.length;${index}++){let ${arg}=${args}[${index}];if(${debugFlags})continue;if(${arg}==="--debug-file"&&${index}+1<${args}.length){${index}++;continue}if(${arg}==="--session-id"/*__clawgod_agents_session_id__*/&&${index}+1<${args}.length){${index}++;continue}return!1}return!0}`,
    appliedMarker: '/*__clawgod_agents_session_id__*/',
    unique: true,
  },
  {
    // The launcher prepends --chrome to empty interactive starts. Upstream
    // parses that flag before this gate, so validate the remaining arguments;
    // otherwise defaultToAgentsView is never read.
    name: 'Default Agents view with auto Chrome',
    pattern: /,([\w$]+)=([\w$]+)\.hasAgentsPositional&&([\w$]+)\(([\w$]+)\);if\(\(\1\|\|\3\(([\w$]+)\)&&process\.stdin\.isTTY\)&&process\.stdout\.isTTY\)\{/g,
    replacer: (m, explicit, parsed, validator, rest) =>
      `,${explicit}=${parsed}.hasAgentsPositional&&${validator}(${rest});if((${explicit}||${validator}(${parsed}.rest/*__clawgod_default_agents_view__*/)&&process.stdin.isTTY)&&process.stdout.isTTY){`,
    appliedMarker: '/*__clawgod_default_agents_view__*/',
    knownShape: /hasAgentsPositional&&[\w$]+\([\w$]+\);if\(\([\w$]+\|\|[\w$]+\([\w$]+\)&&process\.stdin\.isTTY\)&&process\.stdout\.isTTY\)/,
    unique: true,
  },
  {
    // Keep the chat Agent list from crowding out the composer in short terminals.
    name: 'Chat Agent list fits terminal height',
    pattern: /\{columns:([\w$]+)\}=([\w$]+)\(\)([\s\S]{0,8000}?)\{windowStart:([\w$]+),windowEnd:([\w$]+),moreAbove:([\w$]+),moreBelow:([\w$]+)\}=([\w$]+)\(([\w$]+),([\w$]+)\.length,([\w$]+)\)/g,
    replacer: (m, columns, dimensions, middle, windowStart, windowEnd, moreAbove, moreBelow, windowFn, selected, tasks, limit) =>
      `{columns:${columns},rows:__clawgodTerminalRows}=${dimensions}(),__clawgodMaxChatAgentRows=Math.max(1,Math.min(${limit},__clawgodTerminalRows-6))${middle}{windowStart:${windowStart},windowEnd:${windowEnd},moreAbove:${moreAbove},moreBelow:${moreBelow}}=${windowFn}(${selected},${tasks}.length,__clawgodMaxChatAgentRows/*__clawgod_chat_agent_rows__*/)`,
    appliedMarker: '/*__clawgod_chat_agent_rows__*/',
    validate: (match, code) => code.substring(Math.max(0, code.indexOf(match) - 300), code.indexOf(match)).includes('showWorkflows'),
    optional: true,
    unique: true,
  },
  {
    name: 'Chat Agent list keeps overflow indicator',
    pattern: /([\w$]+)\.length>([\w$]+)&&([\w$]+)\.jsx\(([\w$]+),\{justifyContent:"flex-end",children:/g,
    replacer: (m, tasks, limit, react, box) =>
      `${tasks}.length>__clawgodMaxChatAgentRows/*__clawgod_chat_agent_more__*/&&${react}.jsx(${box},{justifyContent:"flex-end",children:`,
    appliedMarker: '/*__clawgod_chat_agent_more__*/',
    validate: (match, code) => {
      const marker = code.indexOf('/*__clawgod_chat_agent_rows__*/');
      const pos = code.indexOf(match);
      return marker >= 0 && pos > marker && pos - marker < 4000;
    },
    optional: true,
    unique: true,
  },
  {
    name: 'Agents directories default collapsed state',
    pattern: /,\[([\w$]+),([\w$]+)\]=([\w$]+)\.useState\(\(\)=>\{let [\w$]+=[\w$]+;return new Set\([\s\S]{0,500}?\)\}\),([\w$]+)=\3\.useRef\(\1\);\4\.current=\1;let\[[\w$]+,[\w$]+\]=\3\.useState\(\(\)=>new Set\)/g,
    replacer: (m, collapsed, setCollapsed, react, collapsedRef) => {
      const anchor = `${collapsedRef}=${react}.useRef(${collapsed});${collapsedRef}.current=${collapsed};`;
      return m.replace(anchor, `${anchor}let __clawgodShouldDefaultCollapseDirectories=${react}.useRef(${collapsed}.size===0),__clawgodCollapsedDirectoryKeys=${react}.useRef(new Set),__clawgodSetCollapsedGroups=${setCollapsed},__clawgodReact=${react};/*__clawgod_collapsed_directory_state__*/`);
    },
    appliedMarker: '/*__clawgod_collapsed_directory_state__*/',
    optional: true,
    unique: true,
  },
  {
    name: 'Agents directories default collapsed rows',
    pattern: /if\(([\w$]+)\.size>0\)([\w$]+)=\2\.filter\(\(([\w$]+)\)=>\3\.kind==="header"\|\|!\1\.has\(([\w$]+)\(\3\.group\)\)\);function /g,
    replacer: (m, collapsed, rows, row, groupKey) =>
      `__clawgodReact.useLayoutEffect(()=>{let keys=[];if(__clawgodShouldDefaultCollapseDirectories.current)for(let row of ${rows})if(row.kind==="header"){let key=${groupKey}(row.group);if(key.startsWith("directory:")&&!__clawgodCollapsedDirectoryKeys.current.has(key))__clawgodCollapsedDirectoryKeys.current.add(key),keys.push(key)}__clawgodSetCollapsedGroups((current)=>{let next=new Set(current),changed=!1,marker="group:__clawgod_expanded_directories__";if(!next.has(marker))next.add(marker),changed=!0;for(let key of keys)if(!next.has(key))next.add(key),changed=!0;return changed?next:current})},[${rows}]);${m.replace(`${collapsed}.size>0`, `${collapsed}.size/*__clawgod_default_collapsed_directories__*/>0`)}`,
    appliedMarker: '/*__clawgod_default_collapsed_directories__*/',
    validate: (match, code) => code.includes('/*__clawgod_collapsed_directory_state__*/'),
    optional: true,
    unique: true,
  },
  {
    // API-key and setup-token sessions expose only user:inference, but local
    // socket mode does not require Claude.ai OAuth scopes. Respect --chrome.
    name: 'Claude in Chrome OAuth scope bypass',
    pattern: /function ([\w$]+)\(([\w$]+)\)\{if\(![\w$]+\(\)\)return [\w$]+\("\[Claude in Chrome\] Disabled: OAuth token has no scope accepted by \/api\/oauth\/validate[^"]*"\),!1;if\(\2===!0\)return!0;/g,
    replacer: (m, fn, arg) => `function ${fn}(${arg}){/*__ccpp_chrome_oauth_scope_bypass*/if(${arg}===!0)return!0;`,
    appliedMarker: '/*__ccpp_chrome_oauth_scope_bypass*/',
    optional: true,
  },
  {
    // `claude --chrome agents` enables Chrome tools in the Fleet View host, but
    // upstream only persists a narrow config subset into dispatched background
    // jobs. Preserve the Chrome flag so sessions created from `claude agents`
    // keep `claude-in-chrome` after attach/respawn.
    name: 'Claude in Chrome agents config state',
    pattern: /([\w$]+)=\{addDir:\[\],pluginDir:\[\],pluginDirNoMcp:\[\],settings:void 0,mcpConfig:\[\],strictMcpConfig:!1\}/g,
    replacer: (m, cfg) => `${cfg}={addDir:[],pluginDir:[],pluginDirNoMcp:[],settings:void 0,mcpConfig:[],strictMcpConfig:!1,chrome:!1,noChrome:!1}`,
    appliedMarker: /[\w$]+=\{addDir:\[\],pluginDir:\[\],pluginDirNoMcp:\[\],settings:void 0,mcpConfig:\[\],strictMcpConfig:!1,chrome:!1,noChrome:!1\}/,
    validate: (match, code) => !code.includes('strictMcpConfig:!1,chrome:!1,noChrome:!1'),
  },
  {
    name: 'Claude in Chrome agents flag parser',
    pattern: /if\(([\w$]+)==="--strict-mcp-config"\)\{([\w$]+)\.strictMcpConfig=!0;continue\}/g,
    replacer: (m, arg, cfg) => `if(${arg}==="--chrome"){${cfg}.chrome=!0;continue}if(${arg}==="--no-chrome"){${cfg}.noChrome=!0;continue}` + m,
    appliedMarker: /if\([\w$]+==="--chrome"\)\{[\w$]+\.chrome=!0;continue\}if\([\w$]+==="--no-chrome"\)\{[\w$]+\.noChrome=!0;continue\}/,
    validate: (match, code) => !/if\([\w$]+==="--chrome"\)\{[\w$]+\.chrome=!0;continue\}/.test(code),
  },
  {
    name: 'Claude in Chrome agents config resolver',
    pattern: /strictMcpConfig:([\w$]+)\.strictMcpConfig\}\}function ([\w$]+)/g,
    replacer: (m, cfg, fn) => `strictMcpConfig:${cfg}.strictMcpConfig,chrome:${cfg}.chrome&&!${cfg}.noChrome,noChrome:${cfg}.noChrome}}function ${fn}`,
    appliedMarker: /chrome:[\w$]+\.chrome&&![\w$]+\.noChrome,noChrome:[\w$]+\.noChrome/,
    validate: (match, code) => !/chrome:[\w$]+\.chrome&&![\w$]+\.noChrome/.test(code),
  },
  {
    name: 'Claude in Chrome agents dispatch args',
    pattern: /\.\.\.e\.strictMcpConfig\?\["--strict-mcp-config"\]:\[\]\]\}/g,
    replacer: () => '...e.chrome?["--chrome"/*__ccpp_agents_chrome_dispatch*/]:[],...e.noChrome?["--no-chrome"]:[],...e.strictMcpConfig?["--strict-mcp-config"]:[]]}',
    appliedMarker: '__ccpp_agents_chrome_dispatch',
    validate: (match, code) => !code.includes('__ccpp_agents_chrome_dispatch'),
  },
  {
    name: 'Computer Use subscription bypass',
    pattern: /function ([\w$]+)\(\)\{let [\w$]+=[\w$]+\(\);return [\w$]+==="max"\|\|[\w$]+==="pro"\}/g,
    replacer: (m, fn) => `function ${fn}(){/*__clawgod_computer_use_subscription__*/return!0}`,
    appliedMarker: '/*__clawgod_computer_use_subscription__*/',
  },
  {
    name: 'Computer Use default enabled',
    pattern: /([\w$]+=)\{enabled:!1,pixelValidation/g,
    replacer: (m, prefix) => `${prefix}{enabled:!0,pixelValidation`,
    sentinel: '{enabled:!1,pixelValidation',
  },
  {
    // v2.1.92+: name:"ultraplan",get description(){...},argumentHint:"<prompt>",isEnabled:()=>fnRef()
    // Older  : name:"ultraplan",description:`...`,argumentHint:"<prompt>",isEnabled:()=>!1
    name: 'Ultraplan enable',
    pattern: /(name:"ultraplan",[\s\S]{1,500}?argumentHint:"<prompt>",isEnabled:\(\)=>)(?:!1|[\w$]+\(\))/g,
    replacer: (m, prefix) => `${prefix}!0`,
    sentinel: 'name:"ultraplan"',
    appliedMarker: 'argumentHint:"<prompt>",isEnabled:()=>!0',
  },
  {
    name: 'Ultrareview enable (rQt gate)',
    pattern: /function ([\w$]+)\(\)\{return ([\w$]+)\(\)\?\.enabled===!0&&[\w$]+\(\)&&![\w$]+\(\)\}/g,
    replacer: (m, fn) => `function ${fn}(){/*__clawgod_ultrareview_enabled__*/return!0}`,
    optional: true,
    appliedMarker: '/*__clawgod_ultrareview_enabled__*/',
  },
  {
    name: 'Ultrareview enable (direct literal, <=2.1.213)',
    pattern: /function ([\w$]+)\(\)\{return ([\w$]+)\("tengu_review_bughunter_config",null\)(\?\.enabled===!0)?\}/g,
    replacer: (m, fn, getter, gate) =>
      gate
        ? `function ${fn}(){return!0}`
        : `function ${fn}(){let _r=${getter}("tengu_review_bughunter_config",null);return _r?{..._r,enabled:!0}:{enabled:!0}}`,
    optional: true,
    sentinel: '("tengu_review_bughunter_config",null)',
    appliedMarker: ',enabled:!0}:{enabled:!0}}',
  },
  {
    // v2.1.215+: the config key is stored in ulu and the gate moved away
    // from the getter. Preserve every declaration between them and replace
    // only the gate; deleting that span leaves runtime references undefined.
    name: 'Ultrareview enable (v2.1.215+ gate)',
    pattern: /(function ([\w$]+)\(\)\{return [\w$]+\(ulu,null\)\})([\s\S]{0,1500}?)(function ([\w$]+)\(\)\{return \2\(\)\?\.enabled===!0&&[\w$]+\(\)&&![\w$]+\(\)\})/g,
    replacer: (m, getterDef, getter, between, gateDef, gate) =>
      `${getterDef}${between}function ${gate}(){/*__clawgod_ultrareview_enabled__*/return!0}`,
    sentinel: 'var ulu="tengu_review_bughunter_config"',
    appliedMarker: '/*__clawgod_ultrareview_enabled__*/',
  },
  {
    name: 'Logo + brand color → green (RGB dark)',
    pattern: /clawd_body:"rgb\(215,119,87\)"/g,
    replacer: () => 'clawd_body:"rgb(34,197,94)"',
    sentinel: 'clawd_body:"rgb(215,119,87)"',
  },
  {
    name: 'Logo + brand color → green (ANSI)',
    pattern: /clawd_body:"ansi:redBright"/g,
    replacer: () => 'clawd_body:"ansi:greenBright"',
    sentinel: 'clawd_body:"ansi:redBright"',
  },
  {
    name: 'Theme claude color → green (dark)',
    pattern: /claude:"rgb\(215,119,87\)"/g,
    replacer: () => 'claude:"rgb(34,197,94)"',
    sentinel: 'claude:"rgb(215,119,87)"',
  },
  {
    name: 'Theme claude color → green (light)',
    pattern: /claude:"rgb\(255,153,51\)"/g,
    replacer: () => 'claude:"rgb(22,163,74)"',
    sentinel: 'claude:"rgb(255,153,51)"',
  },
  {
    name: 'Shimmer → green',
    pattern: /claudeShimmer:"rgb\(2[34]5,1[45]9,1[12]7\)"/g,
    replacer: () => 'claudeShimmer:"rgb(74,222,128)"',
    appliedMarker: 'claudeShimmer:"rgb(74,222,128)"',
  },
  {
    name: 'Shimmer light → green',
    pattern: /claudeShimmer:"rgb\(255,183,101\)"/g,
    replacer: () => 'claudeShimmer:"rgb(34,197,94)"',
    sentinel: 'claudeShimmer:"rgb(255,183,101)"',
  },
  {
    name: 'Computer Use gate bypass',
    pattern: /function ([\w$]+)\(\)\{if\([\w$]+\("hipaa"\)\)return\s*!1;return [\w$]+\(\)&&[\w$]+\(\)\.enabled\}/g,
    replacer: (m, fn) => `function ${fn}(){/*__clawgod_computer_use_gate__*/return!0}`,
    sentinel: '"hipaa"',
    appliedMarker: '/*__clawgod_computer_use_gate__*/',
  },
  {
    // Streaming clients such as cmux provide permission prompts over stdio,
    // so Computer Use is safe and expected there too.
    name: 'Computer Use in noninteractive sessions',
    pattern: /if\(([\w$]+)\(\)==="macos"&&!([\w$]+)\(\)&&([\w$]+)\(\)\)try\{let\{setupComputerUseMCP:/g,
    replacer: (m, platform, isNonInteractive, gate) =>
      `if(${platform}()==="macos"&&${gate}())/*__clawgod_computer_use_noninteractive__*/try{let{setupComputerUseMCP:`,
    sentinel: 'setupComputerUseMCP',
    appliedMarker: '/*__clawgod_computer_use_noninteractive__*/',
  },
  {
    // ≤v2.1.18x: voice mode was GrowthBook-killable via
    //   function X(){return!Y("tengu_amber_quartz_disabled",!1)}
    // v2.1.183 removed that flag entirely; voice mode is now gated only by real
    // requirements — a Claude.ai account (hT(): if(!hT())return "...requires a
    // Claude.ai account...") plus microphone permission — neither a bypassable
    // flag. Faking the auth gate would show voice as available then fail at the
    // stream layer (voice_stream_no_auth), so there is nothing to bypass on
    // current builds. optional keeps it working on older bundles that still ship
    // the kill-flag, without a false "0 matches — cannot verify".
    name: 'Voice Mode enable (bypass GrowthBook kill)',
    pattern: /function ([\w$]+)\(\)\{return![\w$]+\("tengu_amber_quartz_disabled",!1\)\}/g,
    replacer: (m, fn) => `function ${fn}(){return!0}`,
    optional: true,
  },
  {
    // v2.1.158+: provider gate refactored into helper function:
    //   function mw$(H){if(H==="firstParty"||H==="anthropicAws")return!0;return CH(process.env.CLAUDE_CODE_ENABLE_AUTO_MODE)}
    //   Called as: if(!mw$(q))return!1;  inside the auto-mode model gate.
    //   Lookahead ensures we only strip the call inside the auto-mode gate
    //   (the next 300 chars must contain !=="firstParty") and not unrelated
    //   if(!fn(x))return!1; patterns elsewhere.
    //   Not present in ≤v2.1.149 (provider gate was inline).
    name: 'Auto-mode unlock for third-party API (provider helper gate)',
    pattern: /if\(!([\w$]+)\(([\w$]+)\)\)return!1;(?=(?:(?!function\s).){0,300}!=="firstParty")/g,
    replacer: () => '',
    optional: true,
  },
  {
    // ≤v2.1.149: if(Y!=="firstParty"&&Y!=="anthropicAws")return!1;
    // v2.1.158+: if(q!=="firstParty"&&q!=="anthropicAws"&&($==="claude-opus-4-6"||…))return!1;
    // v2.1.214+: if(r!=="firstParty"&&!d6(r)&&(t==="claude-opus-4-6"||…))return!1;
    //   "anthropicAws" replaced by helper function !fn(var).
    //   Match both: \1!=="anthropicAws" OR !fn(\1).
    // [^;]* absorbs the optional model-condition tail safely. This patch is
    // optional because newer bundles may use the provider helper below.
    name: 'Auto-mode unlock for third-party API (inline gate)',
    pattern: /if\(([\w$]+)!=="firstParty"&&(?:\1!=="anthropicAws"|![\w$]+\(\1\))[^;]*\)return!1;/g,
    replacer: () => '',
    optional: true,
  },
  {
    // v2.1.158+: the auto-mode provider opt-in helper. Older bundles gated it
    // at the call site (if(!mw$(q))return!1;) — see 'provider helper gate'
    // above. By v2.1.183 the call site became a warning-message branch
    // (else if(!_kt(xr()))p="provider",...) so the call-site strip no longer
    // matches. The helper shape is unchanged, so neutralize it directly —
    // every provider becomes auto-mode eligible without needing the
    // CLAUDE_CODE_ENABLE_AUTO_MODE opt-in:
    //   function _kt(e){if(e==="firstParty"||e==="anthropicAws")return!0;return st(process.env.CLAUDE_CODE_ENABLE_AUTO_MODE)}
    name: 'Auto-mode unlock for third-party API (provider opt-in helper)',
    pattern: /function ([\w$]+)\(([\w$]+)\)\{if\(\2==="firstParty"\|\|\2==="anthropicAws"\)return!0;return [\w$]+\(process\.env\.CLAUDE_CODE_ENABLE_AUTO_MODE\)\}/g,
    replacer: (m, fn) => `function ${fn}(){return!0}`,
    sentinel: 'process.env.CLAUDE_CODE_ENABLE_AUTO_MODE)}',
  },
  {
    // Redirect CLI `claude update` to clawgod self-update. Upstream's
    // detectInstallType() returns "unknown" under our launcher; the
    // unknown-fallback either silently downgrades ~/.bun/bin/bun (macOS) or
    // writes the new binary outside our drift-detection scan path (Windows).
    // Our redirect funnels the upgrade through install.{sh,ps1} so the new
    // version is re-extracted, re-patched, and re-launchered without ever
    // touching the bun runtime. Escape hatch for users who want vanilla
    // update is printed every run.
    name: "Redirect `claude update` to clawgod self-update",
    pattern: /(\.command\("update"\)\.alias\("upgrade"\)\.description\("[^"]+"\))(\.action\(async\(\)=>\{)/g,
    replacer: (m, chain, action) => {
      return (
        chain + '.allowUnknownOption()' + action +
        `const __clawgodUpdateIndex=process.argv.findIndex(a=>a==="update"||a==="upgrade");` +
        `const __clawgodUpdateArgs=__clawgodUpdateIndex>=0?process.argv.slice(__clawgodUpdateIndex+1):[];` +
        `const __clawgodVersionIndex=__clawgodUpdateArgs.indexOf("--version");` +
        `if(__clawgodVersionIndex>=0&&__clawgodUpdateArgs[__clawgodVersionIndex+1])process.env.CLAWGOD_VERSION=__clawgodUpdateArgs[__clawgodVersionIndex+1];` +
        `if(__clawgodUpdateArgs.includes("--no-upgrade"))process.env.CLAWGOD_NO_UPGRADE="1";` +
        `if(__clawgodUpdateArgs.includes("--lean-off"))process.env.CLAWGOD_LEAN_OFF="1";` +
        `if(__clawgodUpdateArgs.includes("--lean-on"))process.env.CLAWGOD_LEAN_ON="1";` +
        `if(__clawgodUpdateArgs.includes("--lean-max"))process.env.CLAWGOD_LEAN_MAX="1";` +
        `process.stderr.write("[clawgod] 'claude update' is handled by clawgod self-update.\\n[clawgod] To leave clawgod and use vanilla update: bash ~/.clawgod/install.sh --uninstall\\n[clawgod] Continuing now\\u2026\\n");` +
        `const _w=process.platform==='win32';` +
        `const __clawgodUpdateStatus=(()=>{const __fs=require('fs'),__path=require('path'),__os=require('os'),__cp=require('child_process');const __root=__path.join(__os.homedir(),'.clawgod'),__fetch=__path.join(__root,'fetch-file.mjs'),__bun=process.env.CLAWGOD_BUN_BIN||process.execPath;let __temporary='';try{let __installer=__path.join(__root,_w?'install.ps1':'install.sh');if(!__fs.existsSync(__installer)){if(!__fs.existsSync(__fetch))throw new Error('managed fetch-file.mjs is missing; reinstall ClawGod Plus');__temporary=__fs.mkdtempSync(__path.join(__os.tmpdir(),'clawgod-update-'));if(!_w)__fs.chmodSync(__temporary,0o700);__installer=__path.join(__temporary,_w?'install.ps1':'install.sh');const __url='https://github.com/A6083450/clawgod-plus/releases/latest/download/'+(_w?'install.ps1':'install.sh');const __download=__cp.spawnSync(__bun,[__fetch,__url,__installer],{stdio:'inherit',env:process.env});if(__download.error)throw __download.error;if(__download.status===null)throw new Error('managed installer download did not return an exit status');if(__download.status!==0)return __download.status;}else process.stderr.write('[clawgod] using local installer (remote skipped): '+__installer+'\\n');const __command=_w?['powershell','-NoProfile','-ExecutionPolicy','Bypass','-File',__installer]:['bash',__installer];const __result=__cp.spawnSync(__command[0],__command.slice(1),{stdio:'inherit',env:process.env});if(__result.error)throw __result.error;if(__result.status===null)throw new Error('installer process did not return an exit status');return __result.status;}catch(__error){process.stderr.write('[clawgod] update failed: '+(__error&&__error.message?__error.message:String(__error))+'\\n');return 1;}finally{if(__temporary)__fs.rmSync(__temporary,{recursive:true,force:true});}})();` +
        `process.exit(__clawgodUpdateStatus);`
      );
    },
    sentinel: '.command("update").alias("upgrade")',
    appliedMarker: "[clawgod] 'claude update' is handled by clawgod self-update.",
  },
  {
    name: 'Hex brand color → green',
    pattern: /#da7756/g,
    replacer: () => '#22c55e',
    sentinel: '#da7756',
  },
  {
    name: 'Theme claude color → green (ANSI)',
    pattern: /claude:"ansi:redBright"/g,
    replacer: () => 'claude:"ansi:greenBright"',
  },
  {
    name: 'Shimmer → green (ANSI)',
    pattern: /claudeShimmer:"ansi:yellowBright"/g,
    replacer: () => 'claudeShimmer:"ansi:greenBright"',
  },
  {
    name: 'Brief label claude color → green (RGB dark)',
    pattern: /briefLabelClaude:"rgb\(215,119,87\)"/g,
    replacer: () => 'briefLabelClaude:"rgb(34,197,94)"',
  },
  {
    name: 'Brief label claude color → green (RGB light)',
    pattern: /briefLabelClaude:"rgb\(255,153,51\)"/g,
    replacer: () => 'briefLabelClaude:"rgb(22,163,74)"',
  },
  {
    name: 'Brief label claude color → green (ANSI)',
    pattern: /briefLabelClaude:"ansi:redBright"/g,
    replacer: () => 'briefLabelClaude:"ansi:greenBright"',
  },
  {
    name: 'macOS Cmd+V image paste fallback to clipboard read',
    pattern: /\}else if\(([\w$]+)&&([\w$]+)\)([\w$]+)\(\);else ([\w$]+)\("input_image_drag","read_failed"\),([\w$]+)\(([\w$]+)\),([\w$]+)\(\)/g,
    replacer: (m, N, d, mFn, We, g, x, y) =>
      `}else if(${d})${mFn}();else ${We}("input_image_drag","read_failed"),${g}(${x}),${y}()`,
    sentinel: '"input_image_drag","read_failed"',
    optional: true,
  },
  {
    // Current bundles restructured the paste handler: the clipboard-read
    // fallback above is now unconditional upstream, but the image processor
    // loader only tries the vendored native image-processor.node behind the
    // standalone-executable predicate:
    //
    //   async function N8e(){
    //     if(tco)return tco.default;
    //     if(WE())try{let r=await Promise.resolve().then(() => (Blo(),Flo)),n=r.sharp||r.default;return tco={default:n},n}
    //     catch{console.warn("Native image processor not available, falling back to sharp")}
    //     let e=await Promise.resolve().then(() => R(vAu(),1)),t=gGg(e);  // import("sharp")
    //     ...
    //
    // ClawGod Plus runs under Bun, whose standalone predicate may not reflect the
    // extracted module layout, so the native branch can be skipped and the npm
    // "sharp" fallback throws
    // (nothing is installed under ~/.clawgod) → the paste image read throws →
    // the paste handler's .catch types the raw temp PNG path as text instead
    // of attaching [Image #N]. Terminals like Ghostty always paste clipboard
    // images as temp file paths, so this breaks Cmd+V image paste entirely.
    //
    // The native branch (vendor/image-processor/<arch>-<platform>/*.node,
    // resolved relative to cli.cjs) works fine under clawgod — the installer
    // vendors it. Drop the gate so the native loader is always tried first;
    // the catch still falls back to the npm sharp import on failure.
    //
    // appliedMarker (not sentinel): the warn string intentionally survives in
    // the patched output, so it cannot distinguish "stale regex" from
    // "already patched".
    name: 'Image paste: try native image processor regardless of standalone gate',
    pattern: /if\(([\w$]+)\(\)\)(try\{let [\w$]+=await Promise\.resolve\(\)\.then\(\(\)\s*=>\s*\([\w$]+\(\),[\w$]+\)\),[\w$]+=[\w$]+\.sharp\|\|[\w$]+\.default;return [\w$]+=\{default:[\w$]+\},[\w$]+\}catch\{console\.warn\("Native image processor not available, falling back to sharp"\)\})/g,
    replacer: (m, gate, body) => body,
    appliedMarker: /return [\w$]+\.default;try\{let [\w$]+=await Promise\.resolve\(\)\.then\(\(\)\s*=>\s*\([\w$]+\(\),[\w$]+\)\)/,
  },
  {
    // macOS clipboard managers can paste copied images as escaped TIFF paths.
    // The native file decoder does not support TIFF, but classifying these as
    // image paths makes the existing macOS failure branch read the clipboard
    // directly, where readClipboardImage converts the image to PNG.
    name: 'Image paste: recognize TIFF paths for macOS clipboard fallback',
    pattern: /([\w$]+)=\/\\\.\(png\|jpe\?g\|gif\|webp\)\$\/i(?=;[\w$]+=\/\^\(\?:\[A-Za-z\]:\\\\\|\\\\\\\\\)\/)/g,
    replacer: (m, imagePathRe) => `${imagePathRe}=/\\.(png|jpe?g|gif|webp|tiff?)$/i`,
    sentinel: '/\\.(png|jpe?g|gif|webp)$/i;',
    appliedMarker: '/\\.(png|jpe?g|gif|webp|tiff?)$/i;',
    unique: true,
  },
  {
    // URLs ending in an image extension are text, not local image paths.
    name: 'Image paste: keep HTTP image URLs as text',
    pattern: /function ([\w$]+)\(([\w$]+)\)\{let ([\w$]+)=([\w$]+)\(\2\.trim\(\)\),([\w$]+)=([\w$]+)\(\3\);return ([\w$]+)\.test\(\5\)\}/g,
    replacer: (m, fn, value, quoted, unquote, path, unescape, imagePathRe) =>
      `function ${fn}(${value}){let ${quoted}=${unquote}(${value}.trim()),${path}=${unescape}(${quoted});return!/^https?:\\/\\//i.test(${path})&&${imagePathRe}.test(${path})}`,
    appliedMarker: '/^https?:\\/\\//i.test(',
    unique: true,
  },
  {
    name: 'Restore Glob/Grep tools (un-inline EMBEDDED_SEARCH_TOOLS)',
    pattern: /function ([\w$]+)\(\)\{if\(!([\w$]+)\("true"\)\)return!1;if\([\w$]+\(\)\)return!1;return process\.env\.CLAUDE_CODE_ENTRYPOINT!=="local-agent"\}/g,
    replacer: (m, fn, envCheck) =>
      `function ${fn}(){if(!${envCheck}(process.env.EMBEDDED_SEARCH_TOOLS))return!1;if(typeof globalThis.__dpBinOk>"u"){try{var _w=process.platform==="win32"?"where":"which";require("child_process").execFileSync(_w,["bfs"],{timeout:2e3});require("child_process").execFileSync(_w,["ugrep"],{timeout:2e3});globalThis.__dpBinOk=!0}catch{globalThis.__dpBinOk=!1}}if(!globalThis.__dpBinOk)return!1;return process.env.CLAUDE_CODE_ENTRYPOINT!=="local-agent"}`,
    sentinel: 'ct("true")',
    optional: true,
  },
  {
    name: 'Neutralize geo-steganography in date string (qla)',
    pattern: /function ([\w$]+)\([\w$]+\)\{let [\w$]+=[\w$]+\(\),[\w$]+=[\w$]+\([\w$]+\?\.[\w$]+\?\?!1,[\w$]+\?\.[\w$]+\?\?!1\),[\w$]+=[\w$]+\?\.[\w$]+\?[\w$]+\.replaceAll\("-","\/"\):[\w$]+;return`Today\$\{[\w$]+\}s date is \$\{[\w$]+\}\.`\}/g,
    replacer: (m) => {
      const fnMatch = m.match(/^function ([\w$]+)\(([\w$]+)\)/);
      if (!fnMatch) return m;
      const [, fn, param] = fnMatch;
      return `function ${fn}(${param}){return\`Today's date is \${${param}}.\`}`;
    },
    sentinel: 'replaceAll("-","/")',
  },
  {
    name: 'Neutralize geo-detection probe (rdp)',
    pattern: /function ([\w$]+)\(\)\{if\([\w$]+\(\)\)return null;let [\w$]+=[\w$]+\(\),[\w$]+=[\w$]+\(\),[\w$]+=[\w$]+==="Asia\/Shanghai"\|\|[\w$]+==="Asia\/Urumqi"[\s\S]*?\}\}/g,
    replacer: (m) => {
      const fn = m.match(/^function ([\w$]+)/)[1];
      return `function ${fn}(){return null}`;
    },
    sentinel: 'Asia/Shanghai',
  },
  {
    name: 'Neutralize apostrophe steganography (odp)',
    pattern: new RegExp(
      'function ([\\w$]+)\\(([\\w$]+),([\\w$]+)\\)\\{' +
      'if\\(!\\2&&!\\3\\)return"\'";' +
      'if\\(\\2&&!\\3\\)return"(?:\\\\u2019|\\u2019)";' +
      'if\\(!\\2&&\\3\\)return"(?:\\\\u02[Bb][Cc]|\\u02BC)";' +
      'return"(?:\\\\u02[Bb]9|\\u02B9)"\\}',
      'g'
    ),
    replacer: (m) => {
      const fn = m.match(/^function ([\w$]+)/)[1];
      return `function ${fn}(e,t){return"'"}`;
    },
    optional: true,
  },
  {
    name: 'Remove CYBER_RISK_INSTRUCTION',
    pattern: /([\w$]+)="IMPORTANT: Assist with authorized security testing[^"]*"/g,
    replacer: (m, varName) => `${varName}=""`,
    sentinel: 'Assist with authorized security testing',
  },
  {
    name: 'Remove URL generation restriction',
    pattern: /\n\$\{[\w$]+\}\nIMPORTANT: You must NEVER generate or guess URLs[^.]*\. You may use URLs provided by the user in their messages or local files\./g,
    replacer: () => '',
    sentinel: 'IMPORTANT: You must NEVER generate or guess URLs',
  },
  {
    name: 'Remove cautious actions section',
    // v2.1.88-~v2.1.122: function GSY(){return`# Executing actions...`}
    // v2.1.123+: function _j3(H){if(LE8(H)==="compact")return`# Executing...short`;return`# Executing...long`}
    pattern: /function ([\w$]+)\(([\w$]*)\)\{(?:if\([\s\S]{1,200}?\)return`# Executing actions with care\n\n[\s\S]*?`;)?return`# Executing actions with care\n\n[\s\S]*?`\}/g,
    replacer: (m, fn, arg) => `function ${fn}(${arg}){return\`\`}`,
    sentinel: '# Executing actions with care',
  },
  {
    name: 'Remove "Not logged in" notice',
    pattern: /Not logged in\. Run [\w ]+ to authenticate\./g,
    replacer: () => '',
    optional: true,
  },
  {
    name: 'Attachment filter bypass',
    pattern: /([\w$]+)\(\)!=="ant"(&&[\w$]+\.has\([\w$]+\.attachment\.type\)|\)\{if\([\w$]+\.attachment\.type==="hook_additional_context")/g,
    replacer: (m) => m.replace(/([\w$]+)\(\)!=="ant"/, 'false'),
    optional: true,
  },
  {
    name: 'Message list filter bypass (legacy ternary)',
    pattern: /([\w$]+)\(\)!=="ant"\?([\w$]+)\(([\w$]+),([\w$]+)\(([\w$]+)\)\):([\w$]+)/g,
    replacer: (m, fn, tRY, underscore, sRY, K, fallback) => fallback,
    optional: true,
  },
  {
    name: 'Message list filter bypass (s_8 form)',
    pattern: /if\(([\w$]+)\(\)==="ant"\)return ([\w$]+);let ([\w$]+)=([\w$]+) instanceof Set\?\4:([\w$]+)\(\4\);return ([\w$]+)\(\2,\3\)/g,
    replacer: (m, fn, ret) => `return ${ret}`,
    optional: true,
  },
  {
    // Shell-integration generator (iT6 in v2.1.140, was Wa1 in older versions)
    // emits a zsh/bash function that calls the native claude binary with
    // ARGV0=ugrep|rg|... for multitool dispatch. After clawgod installs, the
    // baked path points at our shell-script launcher (or .cmd on Windows) —
    // but shell scripts CANNOT preserve argv[0] (kernel shebang re-exec
    // overwrites it, and zsh additionally refuses to export ARGV0 as env).
    // The shell function then fails because bun receives e.g. -G and errors
    // with "Invalid Argument".
    //
    // Fix: redirect the baked path to claude.orig[.exe] (the native binary
    // backup clawgod creates at install time). Then the multitool dispatch
    // reaches a real binary that honors argv[0]. See issue #82.
    //
    // Generator shape across versions:
    //   v2.1.88 (Wa1):  let Y=E4([_]),...  ← _ is the claude binary path, no in-function compute
    //   v2.1.140 (iT6): let ...,z=FJ$.join(Le(),A?"claude.exe":"claude"),Y=A?rL(z):z,...
    //                   ← path computed inside via join(versionsDir, "claude[.exe]")
    // Anchor on the join(...) ternary form unique to the generator — the
    // bare "claude.exe":"claude" string also appears in u18() (basename
    // helper) but never inside a path.join(), so this regex hits exactly the
    // shell-integration generator and nothing else.
    name: 'Shell integration → claude.orig (multitool dispatch fix)',
    pattern: /([\w$]+\.join\([\w$]+\(\),[\w$]+\?)"claude\.exe":"claude"(\))/g,
    replacer: (m, prefix, suffix) => `${prefix}"claude.orig.exe":"claude.orig"${suffix}`,
    sentinel: '?"claude.exe":"claude")',
    optional: true,
  },
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verify = args.includes('--verify');
const revert = args.includes('--revert');

if (revert) {
  if (!existsSync(BACKUP)) { console.error('No backup found'); process.exit(1); }
  copyFileSync(BACKUP, TARGET);
  console.log('Reverted from backup');
  process.exit(0);
}

if (!existsSync(TARGET)) {
  console.error('Target not found:', TARGET);
  process.exit(1);
}

let code = readFileSync(TARGET, 'utf8');
const origSize = code.length;
const verMatch = code.match(/Version:\s*([\d.]+)/);
const version = verMatch ? verMatch[1] : 'unknown';

console.log(`\n${'='.repeat(55)}`);
console.log(`  ClawGod Plus (universal)`);
console.log(`  Target: cli.original.cjs (v${version})`);
console.log(`  Mode: ${dryRun ? 'DRY RUN' : verify ? 'VERIFY' : 'APPLY'}`);
console.log(`${'='.repeat(55)}\n`);

let applied = 0, skipped = 0, failed = 0;

for (const p of patches) {
  const matches = [...code.matchAll(p.pattern)];
  let relevant = matches;
  if (p.validate) relevant = matches.filter(m => p.validate(m[0], code));
  if (p.selectIndex !== undefined) relevant = relevant.length > p.selectIndex ? [relevant[p.selectIndex]] : [];
  if (p.unique && relevant.length > 1) {
    console.log(`  ?? ${p.name} — ${relevant.length} matches (need 1)`);
    failed++; continue;
  }
  if (relevant.length === 0) {
    if (p.knownShape?.test(code)) { console.log(`  XX ${p.name} — known resolver shape did not match exactly`); failed++; continue; }
    if (p.appliedMarker !== undefined && (p.appliedMarker instanceof RegExp ? p.appliedMarker.test(code) : code.includes(p.appliedMarker))) { console.log(`  OK ${p.name} (already applied, marker present)`); applied++; continue; }
    if (p.optional) { console.log(`  >> ${p.name} (not in this version)`); skipped++; continue; }
    if (p.sentinel !== undefined) {
      const sentinels = Array.isArray(p.sentinel) ? p.sentinel : [p.sentinel];
      const stillPresent = sentinels.filter((s) => code.includes(s));
      if (stillPresent.length > 0) {
        console.log(`  XX ${p.name} — regex stale, sentinel still present: ${stillPresent.map((s) => JSON.stringify(s)).join(', ')}`);
        failed++; continue;
      }
      console.log(`  OK ${p.name} (already applied, sentinel absent)`); applied++; continue;
    }
    console.log(`  !! ${p.name} (0 matches, no sentinel)`); skipped++;
    continue;
  }
  if (verify) { console.log(`  -- ${p.name} — not yet applied`); skipped++; continue; }
  let count = 0;
  for (const m of relevant) {
    const replacement = p.replacer(m[0], ...m.slice(1));
    // Function-form replace: a string replacement would interpret $$ as $
    // and break minified identifiers like `a$$`. See install.sh issue #86.
    if (replacement !== m[0]) { if (!dryRun) code = code.replace(m[0], () => replacement); count++; }
  }
  if (count > 0) { console.log(`  OK ${p.name} (${count})`); applied++; }
  else { console.log(`  >> ${p.name} (no change)`); skipped++; }
}

const contextLimitPatch = await applyContextLimitPatch(code, { dryRun, verify });
if (contextLimitPatch.status === 'applied') {
  if (!dryRun) code = contextLimitPatch.code;
  console.log(`  OK Context limit configurable (${contextLimitPatch.count})`);
  applied++;
} else if (contextLimitPatch.status === 'verify') {
  console.log(`  -- Context limit configurable — ${contextLimitPatch.count} match(es), not yet applied`);
  skipped++;
} else if (contextLimitPatch.status === 'already') {
  console.log(`  OK Context limit configurable (${contextLimitPatch.detail})`);
  applied++;
} else if (contextLimitPatch.status === 'skipped') {
  console.log(`  >> Context limit configurable (${contextLimitPatch.detail})`);
  skipped++;
} else {
  console.log(`  XX Context limit configurable — ${contextLimitPatch.detail}`);
  failed++;
}

const chromePatch = await applyClaudeChromeSocketPatch(code, { dryRun, verify });
if (chromePatch.status === 'applied') {
  if (!dryRun) code = chromePatch.code;
  console.log(`  OK Claude in Chrome local socket fallback (${chromePatch.count})`);
  applied++;
} else if (chromePatch.status === 'verify') {
  console.log(`  -- Claude in Chrome local socket fallback — ${chromePatch.count} match(es), not yet applied`);
  skipped++;
} else if (chromePatch.status === 'already') {
  console.log(`  OK Claude in Chrome local socket fallback (${chromePatch.detail})`);
  applied++;
} else if (chromePatch.status === 'skipped') {
  console.log(`  >> Claude in Chrome local socket fallback (${chromePatch.detail})`);
  skipped++;
} else {
  console.log(`  XX Claude in Chrome local socket fallback — ${chromePatch.detail}`);
  failed++;
}

console.log(`\n${'-'.repeat(55)}`);
console.log(`  Result: ${applied} applied, ${skipped} skipped, ${failed} failed`);

if (failed === 0 && !dryRun && !verify && applied > 0) {
  if (!existsSync(BACKUP)) { copyFileSync(TARGET, BACKUP); console.log(`  Backup: ${BACKUP}`); }
  writeFileSync(TARGET, code, 'utf8');
  console.log(`  Written: cli.original.cjs (${code.length - origSize} bytes)`);
}
console.log(`${'='.repeat(55)}\n`);
if (failed > 0) process.exit(1);
'@

Set-Content (Join-Path $ClawDir "patch.mjs") $patcherCode -Encoding UTF8
Write-OK "Patcher created (patch.mjs)"

# ─── Apply patches ────────────────────────────────────

Write-Dim "Applying patches ..."
$patchOutput = & $BunBin (Join-Path $ClawDir "patch.mjs") 2>&1
$patchStatus = $LASTEXITCODE
$patchOutput | ForEach-Object { Write-Host "  $_" }
if ($patchStatus -ne 0) {
    Write-Err "Mandatory patching failed; installation stopped before launcher replacement."
    exit $patchStatus
}
Invoke-ChromePostInstallFix

# ─── Create default configs ───────────────────────────

$featuresFile = Join-Path $ClawDir "features.json"
if (-not (Test-Path $featuresFile)) {
    $featuresJson = @'
{
  "tengu_harbor": true,
  "tengu_session_memory": true,
  "tengu_amber_flint": true,
  "tengu_auto_background_agents": true,
  "tengu_destructive_command_warning": true,
  "tengu_immediate_model_command": true,
  "tengu_desktop_upsell": false,
  "tengu_malort_pedway": {"enabled": true},
  "tengu_amber_quartz_disabled": false,
  "tengu_prompt_cache_1h_config": {"allowlist": ["*"]},
  "tengu_amber_redwood3": "enabled"
}
'@
    [System.IO.File]::WriteAllText($featuresFile, $featuresJson, (New-Object System.Text.UTF8Encoding $false))
    Write-OK "Default features.json created"
}

# ─── Lean mode: optimize ~/.claude/settings.json ─────
$leanOffFlag = Join-Path $ClawDir ".lean-disabled"
$leanMaxFlag = Join-Path $ClawDir ".lean-max"
$claudeSettingsDir = Join-Path $env:USERPROFILE ".claude"
$claudeSettings = Join-Path $claudeSettingsDir "settings.json"
New-Item -ItemType Directory -Force -Path $claudeSettingsDir | Out-Null

# Default to lean-off: if no lean flag files exist and user didn't explicitly
# request lean-on or lean-max, create the .lean-disabled flag so lean stays off.
if (-not (Test-Path $leanOffFlag) -and -not (Test-Path $leanMaxFlag) -and -not $LeanOn -and -not $LeanMax) {
    New-Item -ItemType File -Force -Path $leanOffFlag | Out-Null
}

if ($LeanOff) {
    New-Item -ItemType File -Force -Path $leanOffFlag | Out-Null
    if (Test-Path $leanMaxFlag) { Remove-Item $leanMaxFlag -Force }
    $leanRemoveScript = @'
const fs=require("fs"),p=process.argv[1];
const allDeny=new Set(["DesignSync","NotebookEdit","PushNotification","RemoteTrigger","CronCreate","CronDelete","CronList","EnterPlanMode","ExitPlanMode","SendMessage","ScheduleWakeup","AskUserQuestion","ReportFindings"]);
const allFlags=["disableWorkflows","disableRemoteControl","disableClaudeAiConnectors","disableArtifact","disableBundledSkills"];
let s={};try{s=JSON.parse(fs.readFileSync(p,"utf8"))}catch{process.exit(0)}
for(const k of allFlags)delete s[k];
if(Array.isArray(s.permissions?.deny))s.permissions.deny=s.permissions.deny.filter(t=>!allDeny.has(t));
fs.writeFileSync(p,JSON.stringify(s,null,2)+"\n");
'@
    if (Test-Path $claudeSettings) {
        try { & $BunBin -e $leanRemoveScript "$claudeSettings" 2>$null } catch {}
    }
    Write-OK "Lean mode disabled (all tools restored)"
} elseif ($LeanOn) {
    if (Test-Path $leanOffFlag) { Remove-Item $leanOffFlag -Force }
    if (Test-Path $leanMaxFlag) { Remove-Item $leanMaxFlag -Force }
} elseif ($LeanMax) {
    if (Test-Path $leanOffFlag) { Remove-Item $leanOffFlag -Force }
    New-Item -ItemType File -Force -Path $leanMaxFlag | Out-Null
}

if (-not (Test-Path $leanOffFlag)) {
    $leanIsMax = (Test-Path $leanMaxFlag)
    $leanApplyScript = @'
const fs = require("fs");
const settingsPath = process.argv[1];
const isMax = process.argv[2] === "true";
const baseDeny = ["DesignSync","NotebookEdit","PushNotification","RemoteTrigger","CronCreate","CronDelete","CronList"];
const maxDeny = ["EnterPlanMode","ExitPlanMode","SendMessage","ScheduleWakeup","AskUserQuestion","ReportFindings"];
const baseFlags = ["disableWorkflows","disableRemoteControl","disableClaudeAiConnectors","disableArtifact"];
const maxFlags = ["disableBundledSkills"];
const deny = isMax ? [...baseDeny, ...maxDeny] : baseDeny;
const flags = isMax ? [...baseFlags, ...maxFlags] : baseFlags;
let s = {};
try { s = JSON.parse(fs.readFileSync(settingsPath, "utf8")); } catch {}
let changed = false;
for (const k of flags) { if (!(k in s)) { s[k] = true; changed = true; } }
if (!s.permissions) s.permissions = {};
if (!Array.isArray(s.permissions.deny)) s.permissions.deny = [];
const ex = new Set(s.permissions.deny);
for (const t of deny) { if (!ex.has(t)) { s.permissions.deny.push(t); changed = true; } }
if (changed) fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2) + "\n");
'@
    try {
        & $BunBin -e $leanApplyScript "$claudeSettings" "$leanIsMax" 2>$null
        if ($leanIsMax) { Write-OK "Lean settings applied: max (~/.claude/settings.json)" }
        else { Write-OK "Lean settings applied: on (~/.claude/settings.json)" }
    } catch {}
} else {
    Write-Host "  $([char]0x2022) Lean mode disabled (claude --lean-on to re-enable)" -ForegroundColor DarkGray
}

# ─── Sanity check: ensure user's Bun can actually load cli.original.cjs ──
# Anthropic builds the native binary with a bleeding-edge Bun build (e.g.
# 1.3.14 while stable still ships 1.3.13). Older Bun crashes loading the
# extracted cli.original.cjs with "Expected CommonJS module to have a
# function wrapper". Detect this BEFORE we install the launcher — better
# to fail loudly than to leave the user with a launcher that panics on
# first invocation.

Write-Dim "Verifying Bun can load patched cli.original.cjs ..."
$sanityCli = Join-Path $ClawDir "cli.cjs"
# PowerShell folds native-command stderr into the error stream as
# ErrorRecord objects; with $ErrorActionPreference='Stop' (common when
# this script is piped through `iex`) that terminates BEFORE we even
# read $sanityOut. Localize ErrorActionPreference + try/catch so the
# panic message reliably lands in $sanityOut and our friendly Write-Err
# block runs. Defense-in-depth — pre-flight already blocks Bun < $MinBunVersion;
# this remains for the day Anthropic bumps embedded Bun past our constant.
$sanityOut = $null
$sanityStatus = 1
try {
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $sanityOut = (& $BunBin $sanityCli --version 2>&1 | Out-String)
    $sanityStatus = $LASTEXITCODE
} catch {
    $sanityOut = "$_"
    $sanityStatus = 1
} finally {
    $ErrorActionPreference = $prevEAP
}
if ($sanityOut -match "Expected CommonJS module to have a function wrapper") {
    Write-Host ""
    Write-Err "Bun $(& $BunBin --version) cannot load Anthropic's cli.original.cjs."
    Write-Err ""
    Write-Err "  Anthropic builds with Bun's canary channel (currently ~1.3.14), while"
    Write-Err "  bun.sh's main download is on stable (currently 1.3.13). The canary build"
    Write-Err "  is NOT visible on bun.sh's download page — it lives on GitHub Releases"
    Write-Err "  and is reachable only via 'bun upgrade --canary'."
    Write-Err ""
    Write-Err "  If your bun is from bun.sh:"
    Write-Err "    bun upgrade --canary"
    Write-Err "    or: powershell -c ""iex & {`$(irm https://bun.sh/install.ps1)} -Version canary"""
    Write-Err ""
    Write-Err "  If your bun is from scoop (the binary is behind a shim and refuses to"
    Write-Err "  self-replace, so 'bun upgrade' silently hangs):"
    Write-Err "    scoop uninstall bun"
    Write-Err "    irm https://bun.sh/install.ps1 | iex"
    Write-Err "    bun upgrade --canary"
    Write-Err ""
    Write-Err "  Then re-run .\install.ps1 — this sanity check will pass."
    if ($sanityStatus -eq 0) { $sanityStatus = 1 }
    exit $sanityStatus
}
if ($sanityStatus -ne 0) {
    if ($sanityOut) { Write-Host $sanityOut.TrimEnd() }
    Write-Err "Bun failed to load patched cli.original.cjs (exit $sanityStatus)."
    exit $sanityStatus
}
Write-OK "Bun loads cli.original.cjs"

# ─── Replace claude command ───────────────────────────

# Build launcher content using %USERPROFILE% env var where possible to avoid
# encoding issues when the profile path contains non-ASCII characters (e.g.
# Chinese/Korean/Japanese usernames). cmd.exe resolves %USERPROFILE% at
# runtime so no problematic characters need to be baked into the .cmd file.
$cliPathInCmd = "%USERPROFILE%\.clawgod\cli.cjs"
$normalizedUserProfile = $env:USERPROFILE.TrimEnd('\', '/')
$normalizedBunBin = $BunBin.TrimEnd('\', '/')
$userProfilePrefix = "$normalizedUserProfile\"
if ($normalizedBunBin.Equals($normalizedUserProfile, [StringComparison]::OrdinalIgnoreCase) -or
    $normalizedBunBin.StartsWith($userProfilePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    $bunRelative = $normalizedBunBin.Substring($normalizedUserProfile.Length).TrimStart('\', '/')
    $bunPathInCmd = "%USERPROFILE%\$bunRelative"
} else {
    # Bun outside USERPROFILE (e.g. system-wide install) — fall back to
    # absolute path since %USERPROFILE%-relative expansion doesn't apply.
    $bunPathInCmd = $BunBin
}
# Download clawgod-import binary
$importBin = Join-Path $ClawDir "clawgod-import.exe"
if (-not (Test-Path $importBin)) {
    $importUrl = "https://github.com/0Chencc/clawgod/releases/latest/download/clawgod-import-windows-x64.exe"
    try {
        & $BunBin (Join-Path $ClawDir "fetch-file.mjs") $importUrl $importBin 2>$null
        if ($LASTEXITCODE -ne 0) { throw "fetch-file.mjs exited $LASTEXITCODE" }
        Write-OK "Provider import tool installed (clawgod-import.exe)"
    } catch {
        Write-Dim "Provider import tool not yet available (build pending)"
    }
}

$importPathInCmd = "%USERPROFILE%\.clawgod\clawgod-import.exe"
$launcherContent = @"
@echo off
rem CLAWGOD_LAUNCHER_V1
setlocal
if /I "%~1"=="import" (
  if exist "$importPathInCmd" (
    shift
    "$importPathInCmd" %1 %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
  ) else (
    echo clawgod: import tool not installed. Reinstall clawgod to get it.
    exit /b 127
  )
)
if not exist "$cliPathInCmd" (
  echo clawgod: cli.cjs not found. Reinstall: irm https://github.com/A6083450/clawgod-plus/releases/latest/download/install.ps1 ^| iex
  exit /b 127
)
if not exist "$bunPathInCmd" (
  echo clawgod: bun not found at $bunPathInCmd. Install: https://bun.sh/install
  exit /b 127
)
set "CLAUDE_CODE_EXECPATH=%~dp0claude.orig.exe"
set "CLAWGOD_AUTO_CHROME=1"
if "%CLAWGOD_NO_AUTO_CHROME%"=="1" set "CLAWGOD_AUTO_CHROME=0"
for %%A in (%*) do if /I "%%~A"=="--chrome" set "CLAWGOD_AUTO_CHROME=0"
for %%A in (%*) do if /I "%%~A"=="-p" set "CLAWGOD_AUTO_CHROME=0"
for %%A in (%*) do if /I "%%~A"=="--print" set "CLAWGOD_AUTO_CHROME=0"
for %%A in (%*) do if /I "%%~A"=="--permission-mode" set "CLAWGOD_AUTO_CHROME=0"
for %%A in (%*) do if /I "%%~A"=="--input-format" set "CLAWGOD_AUTO_CHROME=0"
for %%A in (%*) do if /I "%%~A"=="--output-format" set "CLAWGOD_AUTO_CHROME=0"
for %%A in (-h --help -v --version version update upgrade auth login logout config mcp daemon logs attach stop kill respawn rm doctor install uninstall completion migrate-installer setup-token) do if /I "%~1"=="%%~A" set "CLAWGOD_AUTO_CHROME=0"
if "%CLAWGOD_AUTO_CHROME%"=="1" (
  "$bunPathInCmd" "$cliPathInCmd" --chrome %*
) else (
  "$bunPathInCmd" "$cliPathInCmd" %*
)
exit /b %ERRORLEVEL%
"@

# Find and back up original claude
$claudeCmd = Join-Path $BinDir "claude.cmd"
$claudeExe = Join-Path $BinDir "claude.exe"
$claudeOrigCmd = Join-Path $BinDir "claude.orig.cmd"
$claudeOrigExe = Join-Path $BinDir "claude.orig.exe"

# Validate both launcher slots before any backup, removal, or replacement.
if ((Test-ClaudeLauncherConflict -Current $claudeCmd -Original $claudeOrigCmd) -or
    (Test-ClaudeLauncherConflict -Current $claudeExe -Original $claudeOrigExe)) {
    exit 1
}
foreach ($original in @($claudeOrigCmd, $claudeOrigExe)) {
    if (Test-ClawGodLauncherContent $original) {
        Remove-Item -LiteralPath $original -Force
        Write-Warn "Removed installer-owned polluted backup ($original)"
    }
}

# Check multiple locations for original claude
foreach ($loc in @(
    (Join-Path $BinDir "claude.exe"),
    (Join-Path $BinDir "claude.cmd"),
    (Join-Path $env:USERPROFILE ".local\share\claude\versions"),
    (Join-Path $env:LOCALAPPDATA "Programs\claude-code")
)) {
    if (-not (Test-Path $loc)) { continue }
    if ((Test-Path $loc -PathType Leaf) -and (Test-ClawGodLauncher $loc)) { continue }
    # Back up .exe if exists and not already backed up
    if ($loc -like "*.exe" -and -not (Test-ClaudePathPresent $claudeOrigExe)) {
        Copy-Item $loc $claudeOrigExe -Force
        Write-OK "Original claude.exe backed up → claude.orig.exe"
    }
    # Back up .cmd if exists and not already backed up
    if ($loc -like "*.cmd" -and -not (Test-ClaudePathPresent $claudeOrigCmd)) {
        Copy-Item $loc $claudeOrigCmd -Force
        Write-OK "Original claude.cmd backed up → claude.orig.cmd"
    }
    # If it's a versions directory, find the latest exe
    if (Test-Path $loc -PathType Container) {
        $latestExe = Get-ChildItem $loc -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($latestExe -and -not (Test-ClaudePathPresent $claudeOrigExe)) {
            Copy-Item $latestExe.FullName $claudeOrigExe -Force
            Write-OK "Original claude backed up → claude.orig.exe ($($latestExe.Name))"
        }
    }
}

# Remove claude.exe so .cmd takes precedence
# The exact current executable is removed only after it has a valid backup.
if (Test-ClaudePathPresent $claudeExe) {
    if (Test-ClawGodLauncher $claudeExe) {
        Remove-Item -LiteralPath $claudeExe -Force
        Write-OK "Removed owned claude.exe launcher (.cmd now takes priority)"
    } elseif (-not (Test-ClaudePathPresent $claudeOrigExe)) {
        Rename-Item $claudeExe $claudeOrigExe -Force
        Write-OK "Renamed claude.exe → claude.orig.exe"
    } else {
        # Conflict preflight plus backup search proved this exact current path is preserved.
        try {
            Remove-Item -LiteralPath $claudeExe -Force
        } catch {
            Write-Err "Could not remove owned launcher $claudeExe`: $($_.Exception.Message)"
            exit 1
        }
        Write-OK "Removed claude.exe (.cmd now takes priority)"
    }
}


# Write .cmd launcher for both 'claude' and the explicit 'clawgod' alias.
# Why both:
#  - claude.cmd may be shadowed by a claude.exe higher in PATH
#  - clawgod.cmd has no .exe competitor, so it always works
#  - User can invoke patched explicitly via `clawgod` regardless of which
#    binary 'claude' resolves to
foreach ($cmd in @("claude", "clawgod")) {
    $launcherContent | Set-Content (Join-Path $BinDir "$cmd.cmd") -Encoding Default
}
Write-OK "Commands 'claude' + 'clawgod' → patched"

# --- Ensure optional Claude plugins ---------------------------------

$hadPluginBun = Test-Path Env:CLAWGOD_BUN_BIN
$previousPluginBun = $env:CLAWGOD_BUN_BIN
$hadPluginDir = Test-Path Env:CLAWGOD_DIR
$previousPluginDir = $env:CLAWGOD_DIR
try {
    $env:CLAWGOD_BUN_BIN = $BunBin
    $env:CLAWGOD_DIR = $ClawDir
    & $BunBin (Join-Path $ClawDir "plugin-dependencies.mjs") ensure
    if ($LASTEXITCODE -ne 0) { throw "optional plugin ensure exited $LASTEXITCODE" }
} catch {
    Write-Warn "Optional Claude plugin setup could not complete; ClawGod Plus core install will continue"
} finally {
    if ($hadPluginBun) { $env:CLAWGOD_BUN_BIN = $previousPluginBun }
    else { Remove-Item Env:CLAWGOD_BUN_BIN -ErrorAction SilentlyContinue }
    if ($hadPluginDir) { $env:CLAWGOD_DIR = $previousPluginDir }
    else { Remove-Item Env:CLAWGOD_DIR -ErrorAction SilentlyContinue }
}

Install-ClaudeMemCompatHelper
try {
    $env:CLAWGOD_BUN_BIN = $BunBin
    $env:CLAWGOD_CLAUDE_BIN = $claudeCmd
    & $BunBin (Join-Path $ClawDir "claude-mem-compat.cjs") install
    if (Test-Path (Join-Path $env:USERPROFILE ".claude-mem\clawgod-settings-backup.json")) {
        Write-OK "claude-mem compatibility configured"
    }
} catch {
    Write-Warn "claude-mem compatibility setup failed; ClawGod Plus core install will continue"
} finally {
    Remove-Item Env:CLAWGOD_BUN_BIN -ErrorAction SilentlyContinue
    Remove-Item Env:CLAWGOD_CLAUDE_BIN -ErrorAction SilentlyContinue
}

# ─── Ensure BinDir is in PATH ─────────────────────────

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$BinDir;$userPath", "User")
    $env:Path = "$BinDir;$env:Path"
    Write-OK "Added $BinDir to user PATH"
    Write-Dim "(restart terminal for PATH to take effect)"
}

# ─── Done ─────────────────────────────────────────────

Write-Host ""
Write-Host "  ClawGod Plus installed!" -ForegroundColor Green
Write-Host ""
Write-Dim "  claude            — Start patched Claude Code (green logo)"
Write-Dim "  claude.orig       — Run original unpatched Claude Code"
Write-Host ""
Write-Dim "  Updates: 'claude update' is patched to route through this installer."
Write-Dim "  Just run it as usual — pulls latest Anthropic release + re-patches"
Write-Dim "  in one step. Extra options:"
Write-Dim "    claude update --version 2.1.180   (install a specific version)"
Write-Dim "    claude update --no-upgrade        (re-patch without downloading)"
Write-Dim "  To leave clawgod and use vanilla update:"
Write-Dim "    bash ~/.clawgod/install.sh --uninstall"
Write-Host ""
Write-Dim "  If 'claude' still runs the old version, restart your terminal."
Write-Host ""
Write-Dim "  Config: ~/.clawgod/provider.json"
Write-Dim "  Flags:  ~/.clawgod/features.json"
Write-Host ""
Write-Dim "  If 'claude' panics with 'Expected CommonJS module to have a function wrapper',"
Write-Dim "  your Bun lags Anthropic's embedded Bun. Upgrade with one of:"
Write-Dim "    bun upgrade --canary           (if installed from bun.sh)"
Write-Dim "    scoop update bun               (scoop — may lag stable)"
Write-Dim "    irm https://bun.sh/install.ps1 | iex   (re-install latest)"
Write-Host ""
