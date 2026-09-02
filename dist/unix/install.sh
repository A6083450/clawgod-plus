#!/bin/bash
# GENERATED FILE - edit src/ and run: bun build.mjs
set -e

# ─────────────────────────────────────────────────────────
#  ClawGod Plus Installer
#
#  Downloads Claude Code from npm, applies patches, replaces claude command
#
#  用法:
#    curl -fsSL https://github.com/A6083450/clawgod-plus/releases/latest/download/install.sh | bash
#    # 或
#    bash install.sh [--version 2.1.89] [--no-upgrade]
# ─────────────────────────────────────────────────────────

CLAWGOD_DIR="$HOME/.clawgod"
BIN_DIR="$HOME/.local/bin"
VERSION="${CLAWGOD_VERSION:-}"
NO_UPGRADE="${CLAWGOD_NO_UPGRADE:-}"
LEAN_OFF="${CLAWGOD_LEAN_OFF:-}"
LEAN_ON="${CLAWGOD_LEAN_ON:-}"
LEAN_MAX="${CLAWGOD_LEAN_MAX:-}"
ENHANCEMENTS=""
CHOOSE_ENHANCEMENTS=""
CLAWGOD_SELF_VERSION="0.0.0-dev"  # injected by release workflow from git tag

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --version) VERSION="$2"; shift 2 ;;
    --no-upgrade) NO_UPGRADE=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    --lean-off) LEAN_OFF=1; shift ;;
    --lean-on) LEAN_ON=1; shift ;;
    --lean-max) LEAN_MAX=1; shift ;;
    --enhancements)
      if [[ $# -lt 2 || -z "$2" ]]; then
        printf '%s\n' 'clawgod: --enhancements requires a non-empty CSV value' >&2
        exit 2
      fi
      ENHANCEMENTS="$2"
      shift 2
      ;;
    --choose-enhancements) CHOOSE_ENHANCEMENTS=1; shift ;;
    *) shift ;;
  esac
done

# 未显式指定版本时，保持当前已安装的 Claude Code 版本（读 .source-version），
# 避免重跑 install 把 Claude Code 意外升级到最新；全新安装才回退 latest。
# `claude update` 路径会显式注入 CLAWGOD_VERSION（含 latest），不受此影响。
if [ -z "$VERSION" ]; then
  if [ -r "$CLAWGOD_DIR/.source-version" ]; then
    _pinned="$(tr -d '[:space:]' < "$CLAWGOD_DIR/.source-version" 2>/dev/null || true)"
    # 仅接受形如 X.Y 的版本号，防御残留的非版本内容（如历史 repatch 写下的 basename）
    case "$_pinned" in
      [0-9]*.[0-9]*) VERSION="$_pinned" ;;
    esac
  fi
  [ -z "$VERSION" ] && VERSION="latest"
fi

CLAWGOD_ENHANCEMENT_IDS=(
  chrome
  computer-use
  design-canvas
  agents
  planning
  voice
  auto-mode
  unrestricted-tools
  paste-images
  privacy
  branding
  claude-hud
  claude-mem
  superpowers
)

CLAWGOD_ENHANCEMENT_LABELS=(
  'Chrome'
  'Computer Use'
  'Design Canvas'
  'Agents'
  'Planning'
  'Voice'
  'Auto Mode'
  'Tools'
  'Paste Images'
  'Privacy'
  'Branding'
  'Claude HUD'
  'claude-mem'
  'Superpowers'
)

enhancement_warn() {
  if declare -F warn >/dev/null 2>&1; then
    warn "$1"
  else
    printf '%s\n' "$1" >&2
  fi
}

prepare_enhancement_config_directory() {
  "$BUN_BIN" -e '
import { constants } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";

const [directoryPath] = process.argv.slice(1);
try {
  await mkdir(directoryPath, { mode: 0o700 });
} catch (error) {
  if (error?.code !== "EEXIST") throw error;
}

let handle;
try {
  handle = await open(directoryPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
} catch (error) {
  throw new Error(`Unsafe ClawGod directory: expected a real directory (${error?.code || "open failed"})`);
}

try {
  const before = await handle.stat();
  if (!before.isDirectory()) throw new Error("Unsafe ClawGod directory: expected a directory");
  if (typeof process.getuid === "function" && before.uid !== process.getuid()) {
    throw new Error("Unsafe ClawGod directory: owner does not match the current user");
  }

  const beforeMode = before.mode & 0o7777;
  if (beforeMode === 0o755) {
    await handle.chmod(0o700);
  } else if (beforeMode !== 0o700) {
    throw new Error(`Unsafe ClawGod directory mode: expected 0700 or legacy 0755, got ${beforeMode.toString(8).padStart(4, "0")}`);
  }

  const after = await handle.stat();
  const pathStatus = await lstat(directoryPath);
  if (!pathStatus.isDirectory()
    || pathStatus.isSymbolicLink()
    || after.dev !== before.dev
    || after.ino !== before.ino
    || pathStatus.dev !== after.dev
    || pathStatus.ino !== after.ino
    || (after.mode & 0o7777) !== 0o700
    || (pathStatus.mode & 0o7777) !== 0o700) {
    throw new Error("Unsafe ClawGod directory: identity or mode changed during validation");
  }
} finally {
  await handle.close();
}
' "$CLAWGOD_DIR"
}

enhancement_interaction_available() {
  [ -z "${CI:-}" ] || return 1
  [ -n "${BASH_SOURCE[0]:-}" ] || return 1
  [ -f "${BASH_SOURCE[0]}" ] || return 1
  ( : < /dev/tty ) 2>/dev/null || return 1
  ( : > /dev/tty ) 2>/dev/null || return 1
}

auto_prompt_available() {
  [ "${CLAWGOD_NONINTERACTIVE:-}" = "1" ] && return 1
  [ -t 0 ] || return 1
  enhancement_interaction_available
}

# --- raw-mode 菜单原语 ---
CLAWGOD_MENU_RENDERED_LINES=0
CLAWGOD_MENU_SAVED_STTY=""
CLAWGOD_MENU_PUSHED=""

clawgod_menu_raw_on() {
  CLAWGOD_MENU_SAVED_STTY="$(stty -g < /dev/tty 2>/dev/null)" || return 1
  stty -icanon -echo min 1 time 0 < /dev/tty 2>/dev/null || {
    CLAWGOD_MENU_SAVED_STTY=""
    return 1
  }
  # 菜单期间 Ctrl-C / TERM：恢复终端并取消安装（130 与 Esc 取消一致）。
  # 不注册 EXIT trap——bash 只保留一个 EXIT trap，会覆盖 installer 的 rollback EXIT trap。
  trap 'clawgod_menu_raw_off; printf "\n  已取消安装\n" > /dev/tty 2>/dev/null; exit 130' INT TERM
}

clawgod_menu_raw_off() {
  trap - INT TERM 2>/dev/null
  if [ -n "$CLAWGOD_MENU_SAVED_STTY" ]; then
    stty "$CLAWGOD_MENU_SAVED_STTY" < /dev/tty 2>/dev/null
  fi
  CLAWGOD_MENU_SAVED_STTY=""
}

# 读取一个按键；置全局 CLAWGOD_MENU_KEY 为 UP / DOWN / SPACE / ENTER / ESC / EOF / CHAR:<单字节>
# 常态 min 1 time 0 下 dd 返回空即 EOF；ESC 判定窗口（min 0 time 1）下 dd 返回空即超时。
# dd bs=1 保证内核每次只交付 1 字节，多余字节留在队列，快速连按不吞键。
# ESC 判定窗口读到的非 '[' 字节（快速连按 Esc+数字等）缓存到 CLAWGOD_MENU_PUSHED，
# 下次 read_key 先消费缓存字节并按同一 case 分类，保证快速连按不吞键。
# 超时读的 dd 返回非零是正常路径，必须 `|| :` 兜住——脚本带 set -e，命令替换失败会终止安装器。
clawgod_menu_read_key() {
  local first second third
  if [ -n "$CLAWGOD_MENU_PUSHED" ]; then
    first="$CLAWGOD_MENU_PUSHED"
    CLAWGOD_MENU_PUSHED=""
  else
    first="$(dd bs=1 count=1 2>/dev/null < /dev/tty)" || { CLAWGOD_MENU_KEY=EOF; return 0; }
  fi
  case "$first" in
    $'\e')
      stty min 0 time 1 < /dev/tty 2>/dev/null
      second="$(dd bs=1 count=1 2>/dev/null < /dev/tty)" || :
      if [ -z "$second" ]; then
        CLAWGOD_MENU_KEY=ESC
      elif [ "$second" = "[" ]; then
        third="$(dd bs=1 count=1 2>/dev/null < /dev/tty)" || :
        case "$third" in
          A) CLAWGOD_MENU_KEY=UP ;;
          B) CLAWGOD_MENU_KEY=DOWN ;;
          *) CLAWGOD_MENU_KEY=ESC; CLAWGOD_MENU_PUSHED="$third" ;;
        esac
      else
        CLAWGOD_MENU_KEY=ESC; CLAWGOD_MENU_PUSHED="$second"
      fi
      stty min 1 time 0 < /dev/tty 2>/dev/null
      ;;
    $'\r'|$'\n') CLAWGOD_MENU_KEY=ENTER ;;
    ' ') CLAWGOD_MENU_KEY=SPACE ;;
    # ^D（EOT）是终端标准 EOF 约定；macOS script 在 stdin 关闭时向 pty 注入该字节而非关闭 master
    $'\x04'|'') CLAWGOD_MENU_KEY=EOF ;;
    *) CLAWGOD_MENU_KEY="CHAR:$first" ;;
  esac
}

clawgod_menu_cancel_exit() {
  clawgod_menu_raw_off
  printf '\n  已取消安装\n' > /dev/tty
  exit 130
}

choose_enhancements() {
  # 返回 0=已确认（ENHANCEMENT_CHOICE 就绪）；返回 2=Esc 取消
  local count=${#CLAWGOD_ENHANCEMENT_IDS[@]}
  local -a selected
  local cursor=0 i marker prefix
  for ((i = 0; i < count; i++)); do selected[$i]=1; done
  CLAWGOD_MENU_RENDERED_LINES=0

  while true; do
    if [ "$CLAWGOD_MENU_RENDERED_LINES" -gt 0 ]; then
      printf '\033[%dA' "$CLAWGOD_MENU_RENDERED_LINES" > /dev/tty
    fi
    printf '\n  Enhancements\n' > /dev/tty
    for ((i = 0; i < count; i++)); do
      marker=' '
      [ "${selected[$i]}" = "1" ] && marker='x'
      prefix='  '
      [ "$i" = "$cursor" ] && prefix='> '
      printf '%s%2d) [%s] %-20s %s\n' "$prefix" "$((i + 1))" "$marker" "${CLAWGOD_ENHANCEMENT_IDS[$i]}" "${CLAWGOD_ENHANCEMENT_LABELS[$i]}" > /dev/tty
    done
    printf '  ↑/↓ 移动 · 空格 勾选 · 回车 确认 · Esc 返回\n' > /dev/tty
    printf '\033[J' > /dev/tty
    CLAWGOD_MENU_RENDERED_LINES=$((count + 3))

    clawgod_menu_read_key
    case "$CLAWGOD_MENU_KEY" in
      UP) cursor=$(( (cursor + count - 1) % count )) ;;
      DOWN) cursor=$(( (cursor + 1) % count )) ;;
      SPACE)
        if [ "${selected[$cursor]}" = "1" ]; then
          selected[$cursor]=0
        else
          selected[$cursor]=1
        fi
        ;;
      ESC) return 2 ;;
      ENTER|EOF)
        local -a enabled=()
        for ((i = 0; i < count; i++)); do
          [ "${selected[$i]}" = "1" ] && enabled+=("${CLAWGOD_ENHANCEMENT_IDS[$i]}")
        done
        if [ ${#enabled[@]} -eq 0 ]; then
          ENHANCEMENT_CHOICE=none
        else
          local IFS=,
          ENHANCEMENT_CHOICE="${enabled[*]}"
        fi
        return 0
        ;;
    esac
  done
}

choose_enhancement_mode() {
  local count=${#CLAWGOD_ENHANCEMENT_IDS[@]}
  CLAWGOD_MENU_RENDERED_LINES=0
  while true; do
    if [ "$CLAWGOD_MENU_RENDERED_LINES" -gt 0 ]; then
      printf '\033[%dA' "$CLAWGOD_MENU_RENDERED_LINES" > /dev/tty
    fi
    printf '\n  ClawGod Plus 增强选择\n' > /dev/tty
    printf '   1) 全部 %d 项增强（默认，回车即选）\n' "$count" > /dev/tty
    printf '   2) 仅核心（不装任何增强）\n' > /dev/tty
    printf '   3) 自定义菜单（逐项勾选）\n' > /dev/tty
    printf '  回车 全部增强 · Esc 退出\n' > /dev/tty
    printf '\033[J' > /dev/tty
    CLAWGOD_MENU_RENDERED_LINES=5

    clawgod_menu_read_key
    case "$CLAWGOD_MENU_KEY" in
      CHAR:1|ENTER|EOF)
        local IFS=,
        ENHANCEMENT_CHOICE="${CLAWGOD_ENHANCEMENT_IDS[*]}"
        return 0
        ;;
      CHAR:2) ENHANCEMENT_CHOICE=none; return 0 ;;
      CHAR:3)
        if choose_enhancements; then
          return 0
        fi
        CLAWGOD_MENU_RENDERED_LINES=0
        ;;
      ESC) clawgod_menu_cancel_exit ;;
      *) enhancement_warn "Invalid enhancement choice: ${CLAWGOD_MENU_KEY#CHAR:}" ;;
    esac
  done
}

persist_enhancement_selection() {
  local explicit="$1"
  local config_module="${CLAWGOD_ENHANCEMENT_CONFIG_MODULE:-$CLAWGOD_DIR/enhancement-config.mjs}"
  local manifest_file="${CLAWGOD_ENHANCEMENT_MANIFEST_FILE:-$CLAWGOD_DIR/enhancement-manifest.json}"
  "$BUN_BIN" -e '
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const [modulePath, manifestPath, homeDir, explicit] = process.argv.slice(1);
const engine = await import(pathToFileURL(modulePath).href);
const manifest = engine.loadEnhancementManifest(await readFile(manifestPath), { filename: "enhancements.json" });
const stored = await engine.readEnhancementConfig({ homeDir, manifest });
if (explicit === "__CLAWGOD_SAVED__" && stored !== null) {
  engine.resolveEnhancementSelection({ stored }, manifest);
  process.exit(0);
}
const selection = explicit === "__CLAWGOD_SAVED__"
  ? engine.resolveEnhancementSelection({ stored }, manifest)
  : engine.resolveEnhancementSelection({ explicit }, manifest);
await engine.writeEnhancementConfig({ homeDir, manifest, selection });
' "$config_module" "$manifest_file" "$HOME" "$explicit"
}

configure_enhancement_selection() {
  if [ -n "$ENHANCEMENTS" ]; then
    persist_enhancement_selection "$ENHANCEMENTS"
    return
  fi
  if [ "$CHOOSE_ENHANCEMENTS" = "1" ]; then
    if enhancement_interaction_available && clawgod_menu_raw_on; then
      if choose_enhancements; then
        clawgod_menu_raw_off
        persist_enhancement_selection "$ENHANCEMENT_CHOICE"
        return
      fi
      clawgod_menu_cancel_exit
    fi
    enhancement_warn 'Interactive enhancement selection unavailable; using saved selection or all enhancements.'
    persist_enhancement_selection '__CLAWGOD_SAVED__'
    return
  fi
  if auto_prompt_available && clawgod_menu_raw_on; then
    if choose_enhancement_mode; then
      clawgod_menu_raw_off
      persist_enhancement_selection "$ENHANCEMENT_CHOICE"
      return
    fi
    clawgod_menu_cancel_exit
  fi
  persist_enhancement_selection '__CLAWGOD_SAVED__'
}

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "  ${GREEN}✓${NC} $1"; }
warn()  { echo -e "  ${RED}✗${NC} $1"; }
err()   { echo -e "  ${RED}✗${NC} $1" >&2; }
dim()   { echo -e "  ${DIM}$1${NC}"; }

install_claude_mem_compat_helper() {
  cat > "$CLAWGOD_DIR/claude-mem-compat.cjs" << 'CLAUDE_MEM_COMPAT_EOF'
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
CLAUDE_MEM_COMPAT_EOF
  chmod 700 "$CLAWGOD_DIR/claude-mem-compat.cjs"
}

install_update_runtime_helpers() {
  cat > "$CLAWGOD_DIR/self-update.cjs" << 'SELF_UPDATE_EOF'
const {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} = require('node:fs');
const { spawnSync } = require('node:child_process');
const { homedir, tmpdir } = require('node:os');
const { join } = require('node:path');

const STABLE_SELF_VERSION = /^[0-9]+[.][0-9]+[.][0-9]+(?:-claude[.][0-9]+[.][0-9]+[.][0-9]+(?:[.][0-9]+)?)?$/;
const UPDATE_FLAGS = [
  ['CLAWGOD_NO_UPGRADE', 'noUpgrade'],
  ['CLAWGOD_LEAN_OFF', 'leanOff'],
  ['CLAWGOD_LEAN_ON', 'leanOn'],
  ['CLAWGOD_LEAN_MAX', 'leanMax'],
];

function parseUpdateArgs(argv) {
  const [command, ...args] = argv;
  if (command !== 'update' && command !== 'upgrade') {
    throw new Error('self-update requires update or upgrade as the first argument');
  }
  const versionIndex = args.indexOf('--version');
  if (versionIndex >= 0 && (typeof args[versionIndex + 1] !== 'string' || args[versionIndex + 1] === '')) {
    throw new Error('self-update --version requires a non-empty value');
  }
  const explicitVersion = versionIndex >= 0;
  return {
    command,
    explicitVersion,
    version: explicitVersion ? args[versionIndex + 1] : 'latest',
    noUpgrade: args.includes('--no-upgrade'),
    leanOff: args.includes('--lean-off'),
    leanOn: args.includes('--lean-on'),
    leanMax: args.includes('--lean-max'),
  };
}

function installerVersionDeclarations(source, platform) {
  const pattern = platform === 'win32'
    ? /^[$]ClawSelfVersion = "([^"\r\n]+)"/gm
    : /^CLAWGOD_SELF_VERSION="([^"\r\n]+)"/gm;
  return [...source.matchAll(pattern)].map(match => match[1]);
}

function isTrustedLocalInstaller({ clawgodDir, installer, platform, explicitVersion }) {
  if (!explicitVersion) return false;
  try {
    const localVersion = readFileSync(join(clawgodDir, '.clawgod-version'), 'utf8').trim();
    const declarations = installerVersionDeclarations(readFileSync(installer, 'utf8'), platform);
    return STABLE_SELF_VERSION.test(localVersion)
      && declarations.length === 1
      && declarations[0] === localVersion;
  } catch {
    return false;
  }
}

function childEnvironment(env, parsed) {
  const childEnv = {
    ...env,
    CLAWGOD_NONINTERACTIVE: '1',
    CLAWGOD_UPDATE_PATCH_FAIL_OPEN: '1',
    CLAWGOD_VERSION: parsed.version,
  };
  for (const [environmentKey, argumentKey] of UPDATE_FLAGS) {
    if (parsed[argumentKey]) childEnv[environmentKey] = '1';
    else delete childEnv[environmentKey];
  }
  return childEnv;
}

function outcomeFromResult(result, missingStatusMessage) {
  if (result.error) throw result.error;
  const signal = typeof result.signal === 'string' ? result.signal : null;
  if (signal) return { status: 1, signal };
  if (typeof result.status !== 'number') throw new Error(missingStatusMessage);
  return { status: result.status, signal: null };
}

function runSelfUpdate(argv, options = {}) {
  const {
    platform = process.platform,
    homeDir = homedir(),
    temporaryRoot = tmpdir(),
    execPath = process.execPath,
    env = process.env,
    stderr = process.stderr,
    spawn = spawnSync,
  } = options;
  let temporaryDirectory = '';

  try {
    const parsed = parseUpdateArgs(argv);
    const windows = platform === 'win32';
    const clawgodDir = join(homeDir, '.clawgod');
    const fetchFile = join(clawgodDir, 'fetch-file.mjs');
    const proxyFetch = join(clawgodDir, 'proxy-fetch.mjs');
    let installer = join(clawgodDir, windows ? 'install.ps1' : 'install.sh');
    const childEnv = childEnvironment(env, parsed);

    if (!isTrustedLocalInstaller({ clawgodDir, installer, platform, explicitVersion: parsed.explicitVersion })) {
      if (!existsSync(fetchFile)) throw new Error('managed fetch-file.mjs is missing; reinstall ClawGod Plus');
      if (!existsSync(proxyFetch)) throw new Error('managed proxy-fetch.mjs is missing; reinstall ClawGod Plus');
      temporaryDirectory = mkdtempSync(join(temporaryRoot, 'clawgod-update-'));
      if (!windows) chmodSync(temporaryDirectory, 0o700);
      installer = join(temporaryDirectory, windows ? 'install.ps1' : 'install.sh');
      const remoteUrl = windows
        ? 'https://github.com/A6083450/clawgod-plus/releases/latest/download/install.ps1'
        : 'https://github.com/A6083450/clawgod-plus/releases/latest/download/install.sh';
      const download = outcomeFromResult(
        spawn(execPath, [fetchFile, remoteUrl, installer], { stdio: 'inherit', env: childEnv }),
        'managed installer download did not return an exit status',
      );
      if (download.status !== 0 || download.signal) return download;
    } else {
      stderr.write(`[clawgod] using local installer (remote skipped): ${installer}\n`);
    }

    const command = windows
      ? ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installer]
      : ['bash', installer];
    return outcomeFromResult(
      spawn(command[0], command.slice(1), { stdio: 'inherit', env: childEnv }),
      'installer process did not return an exit status',
    );
  } catch (error) {
    stderr.write(`[clawgod] update failed: ${error && error.message ? error.message : String(error)}\n`);
    return { status: 1, signal: null };
  } finally {
    if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function exitWithOutcome(outcome, processObject = process) {
  if (outcome.signal) {
    try {
      processObject.kill(processObject.pid, outcome.signal);
      return;
    } catch {
      processObject.exit(1);
      return;
    }
  }
  processObject.exit(outcome.status);
}

module.exports = {
  parseUpdateArgs,
  runSelfUpdate,
  exitWithOutcome,
};

if (require.main === module) {
  exitWithOutcome(runSelfUpdate(process.argv.slice(2)));
}
SELF_UPDATE_EOF
  chmod 700 "$CLAWGOD_DIR/self-update.cjs"
  cat > "$CLAWGOD_DIR/patch-fallback.cjs" << 'PATCH_FALLBACK_EOF'
const {
  chmodSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} = require('node:fs');
const { join } = require('node:path');

const PATCH_FALLBACK_FILENAME = 'patch-fallback.json';
const SOURCE_VERSION = /^\d+\.\d+\.\d+(?:\.\d+)?$/;
const CLAWGOD_VERSION = /^\d+\.\d+\.\d+(?:-claude\.\d+\.\d+\.\d+(?:\.\d+)?)?$/;
const REASON = 'bundle-patch-compatibility';

function validatePatchFallback(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  if (keys.length !== 4 || keys.join(',') !== 'clawgodVersion,reason,schemaVersion,sourceVersion') return false;
  return value.schemaVersion === 1
    && typeof value.sourceVersion === 'string'
    && SOURCE_VERSION.test(value.sourceVersion)
    && typeof value.clawgodVersion === 'string'
    && CLAWGOD_VERSION.test(value.clawgodVersion)
    && value.reason === REASON;
}

function statePath(clawgodDir) {
  return join(clawgodDir, PATCH_FALLBACK_FILENAME);
}

function readPatchFallback(clawgodDir) {
  try {
    const value = JSON.parse(readFileSync(statePath(clawgodDir), 'utf8'));
    return validatePatchFallback(value) ? value : null;
  } catch {
    return null;
  }
}

function writePatchFallback(clawgodDir, { sourceVersion, clawgodVersion }) {
  const value = {
    schemaVersion: 1,
    sourceVersion,
    clawgodVersion,
    reason: REASON,
  };
  if (!validatePatchFallback(value)) throw new Error('invalid patch fallback state');

  mkdirSync(clawgodDir, { recursive: true });
  const temporaryPath = join(clawgodDir, `.patch-fallback.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  let temporaryCreated = false;
  try {
    const descriptor = openSync(temporaryPath, 'wx', 0o600);
    temporaryCreated = true;
    try {
      writeFileSync(descriptor, JSON.stringify(value, null, 2) + '\n', 'utf8');
    } finally {
      try { closeSync(descriptor); } catch {}
    }
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, statePath(clawgodDir));
    temporaryCreated = false;
    return value;
  } finally {
    if (temporaryCreated) {
      try { unlinkSync(temporaryPath); } catch {}
    }
  }
}

function clearPatchFallback(clawgodDir) {
  try {
    unlinkSync(statePath(clawgodDir));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

module.exports = {
  PATCH_FALLBACK_FILENAME,
  validatePatchFallback,
  readPatchFallback,
  writePatchFallback,
  clearPatchFallback,
};

if (require.main === module) {
  const [action, clawgodDir, sourceVersion, clawgodVersion, ...extra] = process.argv.slice(2);
  if ((!action || !clawgodDir)
    || (action === 'write' && (!sourceVersion || !clawgodVersion || extra.length))
    || (action === 'clear' && (sourceVersion || clawgodVersion || extra.length))
    || (action !== 'write' && action !== 'clear')) {
    process.exit(2);
  }
  try {
    if (action === 'write') writePatchFallback(clawgodDir, { sourceVersion, clawgodVersion });
    else clearPatchFallback(clawgodDir);
  } catch (error) {
    process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
PATCH_FALLBACK_EOF
  chmod 700 "$CLAWGOD_DIR/patch-fallback.cjs"
}

resolve_bun() {
  if command -v bun >/dev/null 2>&1; then
    BUN_BIN=$(command -v bun)
  elif [ -x "$HOME/.bun/bin/bun" ]; then
    BUN_BIN="$HOME/.bun/bin/bun"
  else
    warn "Bun is required. Install Bun first: https://bun.sh/install"
    return 1
  fi
}

has_clawgod_launcher_content() {
  local launcher="$1"
  [ -f "$launcher" ] || return 1
  # The marker identifies newer launchers, but never grants ownership alone.
  # Every launcher, including pre-marker versions, must match this structure.
  [ "$(sed -n '1p' "$launcher" 2>/dev/null)" = '#!/bin/bash' ] \
    && [ "$(sed -n '2p' "$launcher" 2>/dev/null)" = '# clawgod launcher' ] \
    && grep -Eq '^CLAWGOD_CLI=".*\/\.clawgod\/cli\.cjs"$' "$launcher" 2>/dev/null \
    && grep -Eq '^export CLAUDE_CODE_EXECPATH=".*\/claude\.orig"$' "$launcher" 2>/dev/null
}

is_clawgod_launcher() {
  local launcher="$1"
  [ -L "$launcher" ] && return 1
  has_clawgod_launcher_content "$launcher"
}

is_valid_claude_original() {
  local original="$1"
  [ -e "$original" ] || return 1
  [ -f "$original" ] || return 1
  ! has_clawgod_launcher_content "$original"
}

is_unstable_claude_path() {
  local candidate="$1"
  local candidate_dir candidate_path link_target temp_root
  local link_depth=0
  [ -n "$candidate" ] || return 1
  case "$candidate" in
    */cmux-cli-shims|*/cmux-cli-shims/*) return 0 ;;
  esac
  candidate_dir=$(dirname "$candidate")
  candidate_dir=$(cd "$candidate_dir" 2>/dev/null && pwd -P) || return 0
  candidate_path="$candidate_dir/$(basename "$candidate")"
  while [ -L "$candidate_path" ]; do
    link_depth=$((link_depth + 1))
    [ "$link_depth" -le 40 ] || return 0
    link_target=$(readlink "$candidate_path") || return 0
    case "$link_target" in
      /*) candidate_path="$link_target" ;;
      *) candidate_path="$(dirname "$candidate_path")/$link_target" ;;
    esac
    candidate_dir=$(dirname "$candidate_path")
    candidate_dir=$(cd "$candidate_dir" 2>/dev/null && pwd -P) || return 0
    candidate_path="$candidate_dir/$(basename "$candidate_path")"
  done
  [ -e "$candidate_path" ] || return 0
  case "$candidate_path" in
    */cmux-cli-shims|*/cmux-cli-shims/*) return 0 ;;
  esac
  temp_root=$(cd "${TMPDIR:-/tmp}" 2>/dev/null && pwd -P) || return 0
  case "$candidate_path" in
    "$temp_root"|"$temp_root"/*) return 0 ;;
  esac
  return 1
}

echo ""
echo -e "${BOLD}  ClawGod Plus Installer${NC}"
echo ""

# ─── Uninstall ─────────────────────────────────────────

if [ "$UNINSTALL" = "1" ]; then
  if ! resolve_bun; then
    exit 1
  fi
  CLAUDE_BIN=$(command -v claude 2>/dev/null || true)
  if [ -n "$CLAUDE_BIN" ] && is_unstable_claude_path "$CLAUDE_BIN"; then
    CLAUDE_BIN=""
  fi
  for DIR in "${CLAUDE_BIN:+$(dirname "$CLAUDE_BIN")}" "$BIN_DIR"; do
    [ -z "$DIR" ] && continue
    if { [ -e "$DIR/claude.orig" ] || [ -L "$DIR/claude.orig" ]; } \
      && { [ -e "$DIR/claude" ] || [ -L "$DIR/claude" ]; } \
      && ! is_clawgod_launcher "$DIR/claude"; then
      err "Claude launcher conflict at $DIR/claude; current command and claude.orig were preserved."
      err "Move or remove the third-party current command, then rerun --uninstall."
      exit 1
    fi
    if { [ -e "$DIR/claude.orig" ] || [ -L "$DIR/claude.orig" ]; } \
      && ! is_valid_claude_original "$DIR/claude.orig" \
      && ! has_clawgod_launcher_content "$DIR/claude.orig"; then
      err "Invalid claude.orig at $DIR/claude.orig; uninstall stopped without cleanup."
      exit 1
    fi
  done
  # Restore optional Claude plugin integrations before any managed cleanup.
  if [ -f "$CLAWGOD_DIR/plugin-dependencies-state.json" ] && [ ! -f "$CLAWGOD_DIR/plugin-dependencies.mjs" ]; then
    warn "Could not restore optional Claude plugin integrations; ClawGod Plus was not uninstalled"
    exit 1
  fi
  if [ -f "$CLAWGOD_DIR/plugin-dependencies.mjs" ]; then
    if ! CLAWGOD_BUN_BIN="$BUN_BIN" CLAWGOD_DIR="$CLAWGOD_DIR" \
      "$BUN_BIN" "$CLAWGOD_DIR/plugin-dependencies.mjs" uninstall; then
      warn "Could not restore optional Claude plugin integrations; ClawGod Plus was not uninstalled"
      exit 1
    fi
  fi
  if [ -f "$CLAWGOD_DIR/claude-mem-compat.cjs" ]; then
    if ! CLAWGOD_BUN_BIN="$BUN_BIN" "$BUN_BIN" "$CLAWGOD_DIR/claude-mem-compat.cjs" uninstall; then
      warn "Could not restore claude-mem compatibility settings; ClawGod Plus was not uninstalled"
      exit 1
    fi
  fi
  for DIR in "${CLAUDE_BIN:+$(dirname "$CLAUDE_BIN")}" "$BIN_DIR"; do
    [ -z "$DIR" ] && continue
    if is_valid_claude_original "$DIR/claude.orig"; then
      if is_clawgod_launcher "$DIR/claude"; then rm -f "$DIR/claude"; fi
      mv "$DIR/claude.orig" "$DIR/claude"
      info "Original claude restored ($DIR/claude)"
    elif has_clawgod_launcher_content "$DIR/claude.orig"; then
      if is_clawgod_launcher "$DIR/claude"; then rm -f "$DIR/claude"; fi
      rm -f "$DIR/claude.orig"
      warn "Removed installer-owned polluted backup ($DIR/claude.orig)"
    elif is_clawgod_launcher "$DIR/claude"; then
      # Our launcher, no backup — remove it (otherwise it points to deleted cli.js)
      rm -f "$DIR/claude"
      info "Removed ClawGod Plus launcher ($DIR/claude)"
    fi
    # Always remove the explicit clawgod alias if it's ours
    if is_clawgod_launcher "$DIR/clawgod"; then
      rm -f "$DIR/clawgod"
      info "Removed ClawGod Plus alias ($DIR/clawgod)"
    fi
  done
  rm -rf "$CLAWGOD_DIR/node_modules" "$CLAWGOD_DIR/vendor" "$CLAWGOD_DIR/bun-runtime" "$CLAWGOD_DIR/assets" "$CLAWGOD_DIR/chunks" "$CLAWGOD_DIR/chunks.bak" "$CLAWGOD_DIR/cli.original.js" "$CLAWGOD_DIR/cli.original.js.bak" "$CLAWGOD_DIR/cli.original.cjs" "$CLAWGOD_DIR/cli.original.cjs.bak" "$CLAWGOD_DIR/cli.js" "$CLAWGOD_DIR/cli.cjs" "$CLAWGOD_DIR/patch.mjs" "$CLAWGOD_DIR/patch.js" "$CLAWGOD_DIR/extract-natives.mjs" "$CLAWGOD_DIR/post-process.mjs" "$CLAWGOD_DIR/repatch.mjs" "$CLAWGOD_DIR/vendor-transaction.mjs" "$CLAWGOD_DIR/self-update.cjs" "$CLAWGOD_DIR/patch-fallback.cjs" "$CLAWGOD_DIR/patch-fallback.json" "$CLAWGOD_DIR/openai-proxy.cjs" "$CLAWGOD_DIR/proxy-fetch.mjs" "$CLAWGOD_DIR/fetch-file.mjs" "$CLAWGOD_DIR/enhancement-config.mjs" "$CLAWGOD_DIR/enhancement-manifest.json" "$CLAWGOD_DIR/install-ripgrep.mjs" "$CLAWGOD_DIR/clawgod-import" "$CLAWGOD_DIR/apply-claude-code-chrome-fix.sh" "$CLAWGOD_DIR/claude-mem-compat.cjs" "$CLAWGOD_DIR/claude-mem" "$CLAWGOD_DIR/plugin-dependencies.mjs" "$CLAWGOD_DIR/claude-hud-statusline.mjs" "$CLAWGOD_DIR/plugin-dependencies-state.json" "$CLAWGOD_DIR/cache" "$CLAWGOD_DIR/staging" "$CLAWGOD_DIR/.source-version" "$CLAWGOD_DIR/.clawgod-version" "$CLAWGOD_DIR/.update-check" "$CLAWGOD_DIR/install.sh" "$CLAWGOD_DIR"/.patch-fallback.*.tmp "$CLAWGOD_DIR"/cli.original.js.backup-* "$CLAWGOD_DIR"/cli.original.cjs.backup-*
  hash -r 2>/dev/null
  info "ClawGod Plus uninstalled"
  echo ""
  warn "  Restart your terminal or run: hash -r"
  echo ""
  exit 0
fi

# ─── Bun prerequisite ──────────────────────────────────

if ! resolve_bun; then
  exit 1
fi
info "Bun: $("$BUN_BIN" --version)"

# ─── Bun version pre-flight ───────────────────────────────────────────
# Anthropic builds the native binary with Bun's canary channel; stable
# bun.sh trails by one version. Bun < 1.3.14 panics on cli.original.cjs
# with "Expected CommonJS module to have a function wrapper". Refuse
# early — no npm download / no patch / no late sanity surprise.
# Bump MIN_BUN_VERSION when Anthropic moves the embedded Bun forward
# again (track via 'bun upgrade --canary' on a runner + smoke test).

MIN_BUN_VERSION="1.3.14"
BUN_VERSION_RAW=$("$BUN_BIN" --version 2>/dev/null | head -1)
BUN_VERSION_NUM=$(echo "$BUN_VERSION_RAW" | sed 's/-.*//')
if [ -z "$BUN_VERSION_NUM" ] \
   || [ "$(printf '%s\n%s\n' "$BUN_VERSION_NUM" "$MIN_BUN_VERSION" | sort -V | head -1)" != "$MIN_BUN_VERSION" ]; then
  warn ""
  warn "Bun ${BUN_VERSION_RAW:-<unknown>} is below the required minimum ($MIN_BUN_VERSION)."
  warn ""
  warn "  Anthropic builds claude-code with Bun's canary channel. Older Bun"
  warn "  panics on cli.original.cjs with 'Expected CommonJS module to have"
  warn "  a function wrapper'. This is a hard requirement, not a warning."
  warn ""
  warn "  Upgrade with one of:"
  warn "    bun upgrade --canary               (if installed via curl/install.sh)"
  warn "    brew upgrade bun                   (homebrew)"
  warn "    scoop uninstall bun && \\           (scoop — shim blocks self-replace)"
  warn "      irm https://bun.sh/install.ps1 | iex && bun upgrade --canary"
  warn ""
  warn "  Then re-run this installer."
  exit 1
fi

prepare_enhancement_config_directory
cat > "$CLAWGOD_DIR/enhancement-config.mjs" << 'ENHANCEMENT_CONFIG_EOF'
import { randomUUID } from 'node:crypto';
import * as defaultFileSystem from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';

export const ENHANCEMENT_CONFIG_DIRECTORY = '.clawgod';
export const ENHANCEMENT_CONFIG_FILENAME = 'enhancements.json';
export const ENHANCEMENT_CONFIG_DIRECTORY_MODE = 0o700;
export const ENHANCEMENT_CONFIG_FILE_MODE = 0o600;
export const ENHANCEMENT_CONFIG_SCHEMA_VERSION = 1;

const SAFE_JSON_FILENAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.json$/;
const SAFE_ENHANCEMENT_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MAX_CONFIG_BYTES = 64 * 1024;
const DEFAULT_LOCK_WAIT_MS = 5_000;
const LOCK_POLL_MS = 10;
const LOCK_OWNER_PATTERN = /^([1-9][0-9]*):([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\n$/;
const textDecoder = new TextDecoder('utf-8', { fatal: true });

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function canonicalManifestJson(entries) {
  return `[\n${entries.map(entry => `  { "id": ${JSON.stringify(entry.id)}, "kind": ${JSON.stringify(entry.kind)} }`).join(',\n')}\n]\n`;
}

function decodeSource(source, label) {
  if (typeof source === 'string') return source;
  if (source instanceof Uint8Array) {
    try {
      return textDecoder.decode(source);
    } catch {
      throw new Error(`Invalid ${label} UTF-8`);
    }
  }
  throw new TypeError(`${label} source must be a string or Uint8Array`);
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, expected, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value);
  const unknown = actual.filter(key => !expected.includes(key));
  if (unknown.length > 0) throw new Error(`${label} has unknown key: ${unknown[0]}`);
  const missing = expected.filter(key => !actual.includes(key));
  if (missing.length > 0) throw new Error(`${label} is missing required key: ${missing[0]}`);
}

function assertSafeFilename(filename, label) {
  if (typeof filename !== 'string' || !SAFE_JSON_FILENAME.test(filename)) {
    throw new Error(`Unsafe ${label} filename`);
  }
}

function assertSafeEnhancementId(id) {
  if (typeof id !== 'string') throw new TypeError('Enhancement ID must be a string');
  if (!SAFE_ENHANCEMENT_ID.test(id)) throw new Error(`Unsafe enhancement ID: ${id}`);
}

function manifestIds(manifest) {
  if (!Array.isArray(manifest) || manifest.length === 0) throw new TypeError('Enhancement manifest must be a non-empty array');
  const ids = [];
  const seen = new Set();
  for (const entry of manifest) {
    if (!isPlainRecord(entry)) throw new TypeError('Enhancement manifest entry must be an object');
    assertSafeEnhancementId(entry.id);
    if (seen.has(entry.id)) throw new Error(`Duplicate enhancement ID: ${entry.id}`);
    seen.add(entry.id);
    ids.push(entry.id);
  }
  return ids;
}

export function loadEnhancementManifest(source, { filename = ENHANCEMENT_CONFIG_FILENAME } = {}) {
  assertSafeFilename(filename, 'manifest');
  const text = decodeSource(source, 'enhancement manifest');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`Invalid enhancement manifest JSON: ${filename}`);
  }
  if (!Array.isArray(value)) throw new TypeError('Enhancement manifest must be an array');
  if (value.length === 0) throw new Error('Enhancement manifest must not be empty');

  const normalized = [];
  const seen = new Set();
  for (const entry of value) {
    assertExactKeys(entry, ['id', 'kind'], 'Enhancement manifest entry');
    assertSafeEnhancementId(entry.id);
    if (seen.has(entry.id)) throw new Error(`Duplicate enhancement ID: ${entry.id}`);
    seen.add(entry.id);
    if (entry.kind !== 'patch' && entry.kind !== 'plugin') {
      throw new Error(`Invalid enhancement kind for ${entry.id}`);
    }
    normalized.push({ id: entry.id, kind: entry.kind });
  }
  if (text !== canonicalManifestJson(normalized)) throw new Error(`Non-canonical enhancement manifest JSON: ${filename}`);
  return Object.freeze(normalized.map(entry => Object.freeze(entry)));
}

export function normalizeEnhancementSelection(enabled, manifest) {
  const ids = manifestIds(manifest);
  if (!Array.isArray(enabled)) throw new TypeError('Enhancement selection must be an array');
  const selected = new Set();
  for (const id of enabled) {
    assertSafeEnhancementId(id);
    if (selected.has(id)) throw new Error(`Duplicate enhancement ID: ${id}`);
    if (!ids.includes(id)) throw new Error(`Unknown enhancement ID: ${id}`);
    selected.add(id);
  }
  return ids.filter(id => selected.has(id));
}

export function validateStoredEnhancementConfig(value, manifest) {
  assertExactKeys(value, ['schemaVersion', 'mode', 'enabled'], 'Enhancement config');
  if (value.schemaVersion !== ENHANCEMENT_CONFIG_SCHEMA_VERSION) {
    throw new Error(`Unsupported enhancement config schemaVersion: ${String(value.schemaVersion)}`);
  }
  if (value.mode !== 'all' && value.mode !== 'custom') {
    throw new Error(`Invalid enhancement config mode: ${String(value.mode)}`);
  }
  const enabled = normalizeEnhancementSelection(value.enabled, manifest);
  if (value.mode === 'all' && enabled.length !== 0) {
    throw new Error('Enhancement config mode all requires an empty enabled array');
  }
  if (value.mode === 'custom' && enabled.length === manifest.length) {
    throw new Error('A complete enhancement selection must use mode all');
  }
  return {
    schemaVersion: ENHANCEMENT_CONFIG_SCHEMA_VERSION,
    mode: value.mode,
    enabled,
  };
}

export function serializeEnhancementConfig(value, manifest) {
  return canonicalJson(validateStoredEnhancementConfig(value, manifest));
}

export function parseStoredEnhancementConfig(source, manifest) {
  const text = decodeSource(source, 'enhancement config');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Invalid enhancement config JSON');
  }
  const config = validateStoredEnhancementConfig(value, manifest);
  if (text !== canonicalJson(config)) throw new Error('Non-canonical enhancement config JSON');
  return config;
}

export function selectionToStoredEnhancementConfig(selection, manifest) {
  if (!isPlainRecord(selection)) throw new TypeError('Enhancement selection must be an object');
  const unknown = Object.keys(selection).filter(key => !['schemaVersion', 'mode', 'enabled'].includes(key));
  if (unknown.length > 0) throw new Error(`Enhancement selection has unknown key: ${unknown[0]}`);
  if (Object.hasOwn(selection, 'schemaVersion')
    && selection.schemaVersion !== ENHANCEMENT_CONFIG_SCHEMA_VERSION) {
    throw new Error(`Unsupported enhancement selection schemaVersion: ${String(selection.schemaVersion)}`);
  }
  if (selection.mode !== 'all' && selection.mode !== 'custom') {
    throw new Error(`Invalid enhancement selection mode: ${String(selection.mode)}`);
  }
  const enabled = normalizeEnhancementSelection(selection.enabled, manifest);
  if (selection.mode === 'all' && enabled.length !== 0 && enabled.length !== manifest.length) {
    throw new Error('Enhancement selection mode all must contain none or every manifest ID');
  }
  if (selection.mode === 'all' || enabled.length === manifest.length) {
    return { schemaVersion: ENHANCEMENT_CONFIG_SCHEMA_VERSION, mode: 'all', enabled: [] };
  }
  return { schemaVersion: ENHANCEMENT_CONFIG_SCHEMA_VERSION, mode: 'custom', enabled };
}

export function parseExplicitEnhancementSelection(explicit, manifest) {
  if (typeof explicit !== 'string') throw new TypeError('Explicit enhancement selection must be a string');
  if (explicit.length === 0) throw new Error('Explicit enhancement selection must not be empty');
  if (explicit === 'none') {
    return { schemaVersion: ENHANCEMENT_CONFIG_SCHEMA_VERSION, mode: 'custom', enabled: [] };
  }
  const requested = explicit.split(',');
  if (requested.some(id => id.length === 0)) throw new Error('Invalid explicit CSV: empty enhancement ID');
  const enabled = normalizeEnhancementSelection(requested, manifest);
  return selectionToStoredEnhancementConfig({ mode: 'custom', enabled }, manifest);
}

export function resolveEnhancementSelection(input = {}, manifest) {
  if (!isPlainRecord(input)) throw new TypeError('Enhancement resolution input must be an object');
  const unknown = Object.keys(input).filter(key => key !== 'explicit' && key !== 'stored');
  if (unknown.length > 0) throw new Error(`Enhancement resolution has unknown key: ${unknown[0]}`);

  let config;
  if (Object.hasOwn(input, 'explicit') && input.explicit !== undefined) {
    config = parseExplicitEnhancementSelection(input.explicit, manifest);
  } else if (Object.hasOwn(input, 'stored') && input.stored !== undefined && input.stored !== null) {
    config = validateStoredEnhancementConfig(input.stored, manifest);
  } else {
    config = { schemaVersion: ENHANCEMENT_CONFIG_SCHEMA_VERSION, mode: 'all', enabled: [] };
  }
  return {
    mode: config.mode,
    enabled: config.mode === 'all' ? manifestIds(manifest) : [...config.enabled],
  };
}

export function enhancementConfigPath(homeDir, { filename = ENHANCEMENT_CONFIG_FILENAME } = {}) {
  if (typeof homeDir !== 'string' || !isAbsolute(homeDir)) throw new Error('Enhancement config requires an absolute HOME path');
  if (filename !== ENHANCEMENT_CONFIG_FILENAME) throw new Error('Unsafe enhancement config filename');
  return join(homeDir, ENHANCEMENT_CONFIG_DIRECTORY, filename);
}

function fileMode(status) {
  return status.mode & 0o777;
}

function permissionMode(status) {
  return status.mode & 0o7777;
}

function fileIdentity(status) {
  return { dev: status.dev, ino: status.ino };
}

function sameIdentity(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino;
}

async function lstatIfPresent(fileSystem, path) {
  try {
    return await fileSystem.lstat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function homeDirectoryStatusIsSafe(status, platform) {
  if (status.isSymbolicLink() || !status.isDirectory()) return false;
  if (platform === 'win32') return (fileMode(status) & 0o200) !== 0;
  return (fileMode(status) & 0o022) === 0;
}

function configDirectoryStatusIsSafe(status, platform) {
  if (status.isSymbolicLink() || !status.isDirectory()) return false;
  if (platform === 'win32') return (fileMode(status) & 0o200) !== 0;
  return permissionMode(status) === ENHANCEMENT_CONFIG_DIRECTORY_MODE;
}

function assertSafeHomeDirectoryStatus(status, platform) {
  if (!homeDirectoryStatusIsSafe(status, platform)) {
    throw new Error('Unsafe enhancement config HOME ancestor');
  }
}

function assertSafeConfigDirectoryStatus(status, label, platform) {
  if (!configDirectoryStatusIsSafe(status, platform)) {
    throw new Error(`Unsafe enhancement config ${label} ancestor`);
  }
}

function configModeMatches(mode, platform) {
  return platform === 'win32'
    ? (mode & 0o200) === (ENHANCEMENT_CONFIG_FILE_MODE & 0o200)
    : mode === ENHANCEMENT_CONFIG_FILE_MODE;
}

function assertSafeConfigStatus(status, label = 'leaf', platform = process.platform, expectedNlink = 1) {
  if (status.isSymbolicLink() || !status.isFile()) {
    throw new Error(`Unsafe enhancement config ${label}`);
  }
  if (status.nlink !== expectedNlink) {
    if (expectedNlink === 1) throw new Error('Enhancement config leaf must be a regular single-link file; hardlinks are unsafe');
    throw new Error(`Unexpected enhancement config ${label} link count`);
  }
  if (!configModeMatches(fileMode(status), platform)) {
    throw new Error('Unsafe enhancement config mode; expected 0600');
  }
}

async function inspectHome(fileSystem, homeDir, platform) {
  const status = await lstatIfPresent(fileSystem, homeDir);
  if (!status) throw new Error('Unsafe enhancement config HOME ancestor: directory is missing');
  assertSafeHomeDirectoryStatus(status, platform);
  return status;
}

async function inspectConfigDirectory(fileSystem, homeDir, { missing = 'allow', platform = process.platform } = {}) {
  const homeStatus = await inspectHome(fileSystem, homeDir, platform);
  const path = join(homeDir, ENHANCEMENT_CONFIG_DIRECTORY);
  const status = await lstatIfPresent(fileSystem, path);
  if (!status) {
    if (missing === 'reject') throw new Error('Enhancement config directory is missing');
    return { path, status: null, homeStatus };
  }
  assertSafeConfigDirectoryStatus(status, 'directory', platform);
  return { path, status, homeStatus };
}

async function assertReadDirectoryCurrent(fileSystem, homeDir, expected, platform) {
  let current;
  try {
    current = await inspectConfigDirectory(fileSystem, homeDir, { platform });
  } catch (error) {
    throw markRestorationIncomplete(error, [homeDir, expected.path]);
  }
  const homeChanged = !sameIdentity(fileIdentity(current.homeStatus), fileIdentity(expected.homeStatus));
  const directoryChanged = Boolean(current.status) !== Boolean(expected.status)
    || (current.status && !sameIdentity(fileIdentity(current.status), fileIdentity(expected.status)));
  if (homeChanged || directoryChanged) {
    throw markRestorationIncomplete(
      new Error('Enhancement config ancestor changed during read'),
      homeChanged ? [homeDir, expected.path] : [expected.path],
    );
  }
  return current;
}

async function readFileSnapshot(fileSystem, path, parentStatus, platform, expectedNlink = 1) {
  const before = await lstatIfPresent(fileSystem, path);
  if (!before) {
    return {
      path,
      present: false,
      parentIdentity: fileIdentity(parentStatus),
      identity: null,
      bytes: null,
      mode: null,
      nlink: null,
    };
  }
  assertSafeConfigStatus(before, 'leaf', platform, expectedNlink);
  if (before.size > MAX_CONFIG_BYTES) throw new Error('Enhancement config exceeds the maximum safe size');

  let handle;
  try {
    handle = await fileSystem.open(path, 'r');
    const opened = await handle.stat();
    assertSafeConfigStatus(opened, 'descriptor', platform, expectedNlink);
    if (!sameIdentity(fileIdentity(before), fileIdentity(opened))) {
      throw new Error('Enhancement config changed during update');
    }
    if (opened.size > MAX_CONFIG_BYTES) throw new Error('Enhancement config exceeds the maximum safe size');
    const bytes = await handle.readFile();
    const after = await fileSystem.lstat(path);
    assertSafeConfigStatus(after, 'leaf', platform, expectedNlink);
    if (!sameIdentity(fileIdentity(opened), fileIdentity(after))
      || fileMode(opened) !== fileMode(after)
      || opened.nlink !== after.nlink
      || opened.size !== after.size) {
      throw new Error('Enhancement config changed during update');
    }
    return {
      path,
      present: true,
      parentIdentity: fileIdentity(parentStatus),
      identity: fileIdentity(after),
      bytes,
      mode: fileMode(after),
      nlink: after.nlink,
    };
  } finally {
    if (handle) await handle.close();
  }
}

function snapshotsEqual(left, right) {
  if (left.present !== right.present || !sameIdentity(left.parentIdentity, right.parentIdentity)) return false;
  if (!left.present) return true;
  return sameIdentity(left.identity, right.identity)
    && left.mode === right.mode
    && left.nlink === right.nlink
    && Buffer.from(left.bytes).equals(Buffer.from(right.bytes));
}

function snapshotMatchesWithLinkCount(saved, current, expectedNlink) {
  return saved?.present === true
    && current?.present === true
    && sameIdentity(saved.parentIdentity, current.parentIdentity)
    && sameIdentity(saved.identity, current.identity)
    && saved.mode === current.mode
    && current.nlink === expectedNlink
    && Buffer.from(saved.bytes).equals(Buffer.from(current.bytes));
}

function snapshotMatchesIgnoringParent(saved, current, expectedNlink = saved?.nlink) {
  return saved?.present === true
    && current?.present === true
    && sameIdentity(saved.identity, current.identity)
    && saved.mode === current.mode
    && current.nlink === expectedNlink
    && Buffer.from(saved.bytes).equals(Buffer.from(current.bytes));
}

async function assertSnapshotCurrent(fileSystem, homeDir, snapshot, platform) {
  const directory = await inspectConfigDirectory(fileSystem, homeDir, { missing: 'reject', platform });
  if (!sameIdentity(fileIdentity(directory.status), snapshot.parentIdentity)) {
    throw new Error('Enhancement config ancestor changed during update');
  }
  const current = await readFileSnapshot(fileSystem, snapshot.path, directory.status, platform);
  if (!snapshotsEqual(snapshot, current)) throw new Error('Enhancement config changed during update');
  return current;
}

async function stagePrivateFile(fileSystem, path, bytes, platform) {
  let handle;
  let identity = null;
  try {
    handle = await fileSystem.open(path, 'wx', ENHANCEMENT_CONFIG_FILE_MODE);
    const created = await handle.stat();
    assertSafeConfigStatus(created, 'temporary file', platform);
    identity = fileIdentity(created);
    await handle.writeFile(bytes);
    await handle.sync();
    const opened = await handle.stat();
    assertSafeConfigStatus(opened, 'temporary file', platform);
    if (!sameIdentity(identity, fileIdentity(opened))) {
      throw new Error('Enhancement config temporary descriptor changed during write');
    }
    if (opened.size !== bytes.byteLength) throw new Error('Enhancement config temporary write was incomplete');
    await handle.close();
    handle = null;
    const status = await fileSystem.lstat(path);
    assertSafeConfigStatus(status, 'temporary file', platform);
    if (!sameIdentity(fileIdentity(opened), fileIdentity(status))) {
      throw new Error('Enhancement config temporary file changed during write');
    }
    return { path, identity: fileIdentity(status), mode: fileMode(status), nlink: status.nlink };
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
      handle = null;
    }
    if (!identity) throw markRestorationIncomplete(error, [path]);
    try {
      if (!await unlinkIfOwned(fileSystem, path, identity)) {
        throw markRestorationIncomplete(error, [path]);
      }
    } catch (cleanupError) {
      if (cleanupError?.restorationIncomplete) throw cleanupError;
      throw markRestorationIncomplete(error, [path]);
    }
    throw error;
  } finally {
    if (handle) await handle.close();
  }
}

async function syncDirectory(fileSystem, path, platform) {
  if (platform === 'win32') return;
  const handle = await fileSystem.open(path, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function createPrivateDirectory(fileSystem, path, platform, label) {
  try {
    await fileSystem.mkdir(path, { mode: ENHANCEMENT_CONFIG_DIRECTORY_MODE });
  } catch (error) {
    throw markRestorationIncomplete(error, [path]);
  }
  const status = await fileSystem.lstat(path);
  if (!configDirectoryStatusIsSafe(status, platform)) {
    throw markRestorationIncomplete(new Error(`Unsafe ${label} directory`), [path]);
  }
  return { path, status, identity: fileIdentity(status) };
}

async function moveKnownFileToPrivateDirectory(fileSystem, snapshot, directoryPath, platform, label) {
  const ownedDirectory = await createPrivateDirectory(fileSystem, directoryPath, platform, label);
  const destination = join(directoryPath, basename(directoryPath));
  try {
    const sourceParent = await fileSystem.lstat(dirname(snapshot.path));
    const current = await readFileSnapshot(fileSystem, snapshot.path, sourceParent, platform, snapshot.nlink);
    if (!snapshotsEqual(snapshot, current)) {
      throw new Error(`${label} source changed before quarantine`);
    }
    await fileSystem.rename(snapshot.path, destination);
    const directoryAfter = await fileSystem.lstat(directoryPath);
    if (!sameIdentity(ownedDirectory.identity, fileIdentity(directoryAfter))) {
      throw new Error(`${label} directory changed during quarantine`);
    }
    const moved = await readFileSnapshot(fileSystem, destination, directoryAfter, platform, snapshot.nlink);
    if (!snapshotMatchesIgnoringParent(snapshot, moved)) {
      let replacementRestored = false;
      try {
        replacementRestored = await restoreSnapshotExclusively(fileSystem, moved, snapshot.path, platform);
        if (replacementRestored) {
          await removeOwnedPrivateDirectory(fileSystem, ownedDirectory, platform, label);
        }
      } catch (restoreError) {
        throw markRestorationIncomplete(restoreError, [snapshot.path, destination, directoryPath]);
      }
      if (!replacementRestored) {
        throw markRestorationIncomplete(
          new Error(`${label} concurrent replacement could not be restored`),
          [snapshot.path, destination, directoryPath],
        );
      }
      throw markRestorationIncomplete(
        new Error(`${label} concurrent replacement detected during quarantine`),
        [snapshot.path],
      );
    }
    if (await lstatIfPresent(fileSystem, snapshot.path)) {
      throw new Error(`${label} source was replaced during quarantine`);
    }
    return { moved, ownedDirectory };
  } catch (error) {
    throw markRestorationIncomplete(error, [snapshot.path, destination, directoryPath]);
  }
}

async function removeKnownRegularFile(fileSystem, snapshot, platform, label) {
  const directoryPath = `${snapshot.path}.${process.pid}.${randomUUID()}.stale`;
  const { moved, ownedDirectory } = await moveKnownFileToPrivateDirectory(
    fileSystem,
    snapshot,
    directoryPath,
    platform,
    label,
  );
  try {
    await fileSystem.unlink(moved.path);
    await fileSystem.rmdir(ownedDirectory.path);
    await syncDirectory(fileSystem, dirname(snapshot.path), platform);
  } catch (error) {
    throw markRestorationIncomplete(error, [snapshot.path, moved.path, ownedDirectory.path]);
  }
  return true;
}

async function removeOwnedPrivateDirectory(fileSystem, ownedDirectory, platform, label) {
  if (!ownedDirectory) return;
  const status = await lstatIfPresent(fileSystem, ownedDirectory.path);
  if (!status) return;
  if (!configDirectoryStatusIsSafe(status, platform)
    || !sameIdentity(fileIdentity(status), ownedDirectory.identity)) {
    throw markRestorationIncomplete(new Error(`${label} directory changed during cleanup`), [ownedDirectory.path]);
  }
  try {
    await fileSystem.rmdir(ownedDirectory.path);
    await syncDirectory(fileSystem, dirname(ownedDirectory.path), platform);
  } catch (error) {
    throw markRestorationIncomplete(error, [ownedDirectory.path]);
  }
}

async function unlinkIfOwned(fileSystem, path, identity) {
  const status = await lstatIfPresent(fileSystem, path);
  if (!status) return true;
  if (!sameIdentity(fileIdentity(status), identity)) return false;
  await fileSystem.unlink(path);
  return true;
}

async function existingEvidencePaths(fileSystem, paths) {
  const evidence = [];
  for (const path of paths) {
    if (!path || evidence.includes(path)) continue;
    try {
      await fileSystem.lstat(path);
      evidence.push(path);
    } catch (error) {
      if (error?.code !== 'ENOENT') evidence.push(path);
    }
  }
  return evidence;
}

function markRestorationIncomplete(error, evidencePaths) {
  const failure = error instanceof Error ? error : new Error(String(error));
  const combinedEvidence = [...new Set([...(failure.evidencePaths || []), ...evidencePaths].filter(Boolean))];
  failure.restorationIncomplete = true;
  failure.evidencePaths = combinedEvidence;
  failure.evidencePath = combinedEvidence.at(-1);
  return failure;
}

async function createConfigDirectory(fileSystem, homeDir, observation, platform) {
  const currentHome = await inspectHome(fileSystem, homeDir, platform);
  if (!sameIdentity(fileIdentity(currentHome), fileIdentity(observation.homeStatus))) {
    throw new Error('Enhancement config HOME ancestor changed during update');
  }
  await fileSystem.mkdir(observation.path, { mode: ENHANCEMENT_CONFIG_DIRECTORY_MODE });
  const created = await fileSystem.lstat(observation.path);
  if (!configDirectoryStatusIsSafe(created, platform)) {
    throw new Error('Unsafe created enhancement config directory');
  }
  const homeAfter = await inspectHome(fileSystem, homeDir, platform);
  if (!sameIdentity(fileIdentity(homeAfter), fileIdentity(observation.homeStatus))) {
    throw new Error('Enhancement config HOME ancestor changed during update');
  }
  return { path: observation.path, identity: fileIdentity(created) };
}

async function removeCreatedConfigDirectory(fileSystem, created) {
  if (!created) return true;
  const status = await lstatIfPresent(fileSystem, created.path);
  if (!status) return true;
  if (status.isSymbolicLink() || !status.isDirectory() || !sameIdentity(fileIdentity(status), created.identity)) return false;
  try {
    await fileSystem.rmdir(created.path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    if (error?.code === 'ENOTEMPTY' || error?.code === 'EEXIST') return false;
    throw error;
  }
}

function configLockPath(configPath) {
  return join(dirname(configPath), `.${basename(configPath)}.lock`);
}

function configTransactionPaths(lock) {
  const lockName = basename(lock.path);
  const configPath = join(dirname(lock.path), lockName.slice(1, -'.lock'.length));
  const prefix = join(dirname(configPath), `.${basename(configPath)}.${lock.ownerPid}.${lock.token}`);
  const backupDirectory = `${prefix}.backup`;
  const failedDirectory = `${prefix}.failed`;
  const lockStaleDirectory = `${prefix}.lock.stale`;
  return {
    temporary: `${prefix}.tmp`,
    backupDirectory,
    backup: join(backupDirectory, basename(backupDirectory)),
    failedDirectory,
    failed: join(failedDirectory, basename(failedDirectory)),
    lockStaleDirectory,
    lockStale: join(lockStaleDirectory, basename(lockStaleDirectory)),
  };
}

function transactionOwnerFromStaleName(name, configName) {
  const prefix = `.${configName}.`;
  const suffix = '.lock.stale';
  if (!name.startsWith(prefix) || !name.endsWith(suffix)) return null;
  const owner = name.slice(prefix.length, -suffix.length);
  const separator = owner.indexOf('.');
  if (separator <= 0) return null;
  const ownerPid = owner.slice(0, separator);
  const token = owner.slice(separator + 1);
  return LOCK_OWNER_PATTERN.test(`${ownerPid}:${token}\n`) ? { ownerPid: Number(ownerPid), token } : null;
}

async function observeOrphanLockStaleEvidence(fileSystem, directoryPath, platform) {
  const observations = [];
  for (const name of await fileSystem.readdir(directoryPath)) {
    const owner = transactionOwnerFromStaleName(name, ENHANCEMENT_CONFIG_FILENAME);
    if (!owner) continue;
    const root = join(directoryPath, name);
    const evidencePaths = [root];
    const status = await lstatIfPresent(fileSystem, root);
    if (status && configDirectoryStatusIsSafe(status, platform)) {
      let entries;
      try {
        entries = await fileSystem.readdir(root);
      } catch (error) {
        if (error?.code === 'ENOENT') continue;
        throw error;
      }
      const current = await lstatIfPresent(fileSystem, root);
      if (!current) continue;
      // dev+ino alone is not enough: tmpfs recycles inode numbers immediately,
      // so a rm+mkdir replacement can keep the same identity. ctime/mtime
      // (nanosecond precision surfaced through the millisecond floats) change
      // on any replacement; reading the directory updates neither field.
      if (!sameIdentity(fileIdentity(current), fileIdentity(status))
        || current.ctimeMs !== status.ctimeMs
        || current.mtimeMs !== status.mtimeMs
        || !configDirectoryStatusIsSafe(current, platform)) {
        throw new Error('Enhancement config stale lock evidence changed during observation');
      }
      for (const entry of entries) {
        evidencePaths.push(join(root, entry));
      }
    }
    observations.push({ ...owner, evidencePaths });
  }
  return observations;
}

async function waitForOrphanLockStaleEvidence(
  fileSystem,
  homeDir,
  expectedDirectory,
  deadline,
  platform,
  isProcessAlive,
) {
  while (true) {
    await assertReadDirectoryCurrent(fileSystem, homeDir, expectedDirectory, platform);
    const observations = await observeOrphanLockStaleEvidence(fileSystem, expectedDirectory.path, platform);
    await assertReadDirectoryCurrent(fileSystem, homeDir, expectedDirectory, platform);
    if (observations.length === 0) return;
    const states = await Promise.all(observations.map(async observation => ({
      observation,
      alive: await isProcessAlive(observation.ownerPid),
    })));
    const evidencePaths = observations.flatMap(observation => observation.evidencePaths);
    if (states.some(state => !state.alive)) {
      throw markRestorationIncomplete(
        new Error('Enhancement config transaction has orphan stale lock evidence'),
        evidencePaths,
      );
    }
    if (Date.now() >= deadline) {
      throw markRestorationIncomplete(
        new Error('Timed out waiting for live enhancement config stale lock cleanup'),
        evidencePaths,
      );
    }
    await new Promise(resolve => setTimeout(resolve, LOCK_POLL_MS));
  }
}

async function observeConfigLock(fileSystem, path, platform) {
  const parentStatus = await fileSystem.lstat(dirname(path));
  assertSafeConfigDirectoryStatus(parentStatus, 'lock directory', platform);
  const snapshot = await readFileSnapshot(fileSystem, path, parentStatus, platform);
  if (!snapshot.present) return null;
  const text = decodeSource(snapshot.bytes, 'enhancement config lock');
  const match = LOCK_OWNER_PATTERN.exec(text);
  if (!match) throw new Error('Invalid enhancement config transaction lock');
  const ownerPid = Number(match[1]);
  if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0) throw new Error('Invalid enhancement config transaction lock owner');
  return { ...snapshot, ownerPid, token: match[2] };
}

function defaultIsProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

async function removeObservedFile(fileSystem, snapshot, platform, label) {
  const transactionPaths = snapshot.ownerPid && snapshot.token ? configTransactionPaths(snapshot) : null;
  const quarantine = transactionPaths?.lockStaleDirectory
    || join(dirname(snapshot.path), `.${basename(snapshot.path)}.${process.pid}.${randomUUID()}.stale`);
  let moved;
  try {
    moved = await moveKnownFileToPrivateDirectory(fileSystem, snapshot, quarantine, platform, label);
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
  try {
    await fileSystem.unlink(moved.moved.path);
    await fileSystem.rmdir(moved.ownedDirectory.path);
    await syncDirectory(fileSystem, dirname(snapshot.path), platform);
  } catch (error) {
    try {
      await stagePrivateFile(fileSystem, snapshot.path, Buffer.from(snapshot.bytes), platform);
    } catch (restoreError) {
      if (restoreError?.code !== 'EEXIST') {
        throw markRestorationIncomplete(restoreError, [moved.moved.path, quarantine, snapshot.path]);
      }
    }
    throw markRestorationIncomplete(error, [moved.moved.path, quarantine, snapshot.path]);
  }
  return true;
}

async function reclaimDeadConfigLock(fileSystem, lock, platform, isProcessAlive) {
  if (await isProcessAlive(lock.ownerPid)) return false;
  const residuePaths = [];
  const transactionPaths = configTransactionPaths(lock);
  for (const path of [
    transactionPaths.temporary,
    transactionPaths.backupDirectory,
    transactionPaths.failedDirectory,
    transactionPaths.lockStaleDirectory,
  ]) {
    const status = await lstatIfPresent(fileSystem, path);
    if (!status) continue;
    residuePaths.push(path);
    if (!status.isDirectory()) continue;
    for (const name of await fileSystem.readdir(path)) {
      residuePaths.push(join(path, name));
    }
  }
  const legacyBackupName = basename(transactionPaths.backupDirectory);
  const rejectedPrefix = `${legacyBackupName}.rejected-`;
  for (const name of await fileSystem.readdir(dirname(lock.path))) {
    if (name.startsWith(rejectedPrefix)) residuePaths.push(join(dirname(lock.path), name));
  }
  if (residuePaths.length > 0) {
    throw markRestorationIncomplete(
      new Error('Dead enhancement config transaction has unresolved filesystem evidence'),
      [lock.path, ...residuePaths],
    );
  }
  if (!await removeObservedFile(fileSystem, lock, platform, 'Enhancement config transaction lock')) {
    throw new Error('Enhancement config transaction lock changed during reclamation');
  }
  return true;
}

async function acquireConfigLock(fileSystem, path, platform, isProcessAlive) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await stagePrivateFile(fileSystem, path, Buffer.from(`${process.pid}:${randomUUID()}\n`, 'utf8'), platform);
      const lock = await observeConfigLock(fileSystem, path, platform);
      if (!lock) throw new Error('Enhancement config ancestor changed during update');
      await syncDirectory(fileSystem, dirname(path), platform);
      return lock;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const lock = await observeConfigLock(fileSystem, path, platform);
      if (!await reclaimDeadConfigLock(fileSystem, lock, platform, isProcessAlive)) {
        throw new Error('Enhancement config update is already in progress');
      }
    }
  }
  throw new Error('Enhancement config transaction lock could not be acquired');
}

async function assertConfigLockCurrent(fileSystem, lock, platform) {
  const parentStatus = await fileSystem.lstat(dirname(lock.path));
  assertSafeConfigDirectoryStatus(parentStatus, 'lock directory', platform);
  if (!sameIdentity(fileIdentity(parentStatus), lock.parentIdentity)) {
    throw new Error('Enhancement config ancestor changed during update');
  }
  const current = await observeConfigLock(fileSystem, lock.path, platform);
  if (!current || !snapshotsEqual(current, lock)) {
    throw new Error('Enhancement config transaction lock changed during update');
  }
}

async function releaseConfigLock(fileSystem, lock, platform) {
  if (!lock) return true;
  return removeObservedFile(fileSystem, lock, platform, 'Enhancement config transaction lock');
}

async function waitForConfigUnlock(
  fileSystem,
  lockPath,
  deadline,
  platform,
  isProcessAlive,
  homeDir = null,
  expectedDirectory = null,
) {
  if (expectedDirectory) {
    await waitForOrphanLockStaleEvidence(
      fileSystem,
      homeDir,
      expectedDirectory,
      deadline,
      platform,
      isProcessAlive,
    );
  }
  const lock = await observeConfigLock(fileSystem, lockPath, platform);
  if (expectedDirectory) {
    await assertReadDirectoryCurrent(fileSystem, homeDir, expectedDirectory, platform);
  }
  if (!lock) {
    if (expectedDirectory) {
      await waitForOrphanLockStaleEvidence(
        fileSystem,
        homeDir,
        expectedDirectory,
        deadline,
        platform,
        isProcessAlive,
      );
    }
    return false;
  }
  if (await reclaimDeadConfigLock(fileSystem, lock, platform, isProcessAlive)) return false;
  if (Date.now() >= deadline) throw new Error('Timed out waiting for enhancement config update');
  await new Promise(resolve => setTimeout(resolve, LOCK_POLL_MS));
  return true;
}

async function rejectRollbackLink(fileSystem, source, target, platform, cause, expectedTarget = null) {
  const before = await lstatIfPresent(fileSystem, target);
  if (!before) throw markRestorationIncomplete(cause, [source.path, target]);
  const rejected = `${source.path}.rejected-${randomUUID()}`;
  try {
    await fileSystem.rename(target, rejected);
  } catch (error) {
    throw markRestorationIncomplete(error, [source.path, target, rejected]);
  }
  try {
    const movedStatus = await fileSystem.lstat(rejected);
    if (!sameIdentity(fileIdentity(before), fileIdentity(movedStatus))) {
      throw new Error('Rejected enhancement config rollback link changed during quarantine');
    }
    if (expectedTarget) {
      const parentStatus = await fileSystem.lstat(dirname(rejected));
      const moved = await readFileSnapshot(fileSystem, rejected, parentStatus, platform, expectedTarget.nlink);
      if (!snapshotMatchesIgnoringParent(expectedTarget, moved, expectedTarget.nlink)) {
        throw new Error('Rejected enhancement config rollback link changed during quarantine');
      }
    }
  } catch (error) {
    throw markRestorationIncomplete(error, [source.path, target, rejected]);
  }
  throw markRestorationIncomplete(cause, [source.path, rejected]);
}

async function restoreSnapshotExclusively(fileSystem, source, target, platform) {
  try {
    await fileSystem.link(source.path, target);
  } catch (error) {
    if (error?.code === 'EEXIST') return false;
    throw error;
  }
  const targetParentStatus = await fileSystem.lstat(dirname(target));
  let linkedTarget;
  try {
    linkedTarget = await readFileSnapshot(fileSystem, target, targetParentStatus, platform, 2);
  } catch (error) {
    return rejectRollbackLink(fileSystem, source, target, platform, error);
  }
  let linkedSource;
  try {
    const sourceParentStatus = await fileSystem.lstat(dirname(source.path));
    linkedSource = await readFileSnapshot(fileSystem, source.path, sourceParentStatus, platform, 2);
  } catch (error) {
    return rejectRollbackLink(fileSystem, source, target, platform, error, linkedTarget);
  }
  if (!snapshotMatchesIgnoringParent(source, linkedSource, 2)
    || !snapshotMatchesIgnoringParent(source, linkedTarget, 2)) {
    return rejectRollbackLink(
      fileSystem,
      source,
      target,
      platform,
      new Error('Enhancement config rollback source changed before restoration'),
      linkedTarget,
    );
  }
  if (!await unlinkIfOwned(fileSystem, source.path, source.identity)) {
    return rejectRollbackLink(
      fileSystem,
      source,
      target,
      platform,
      new Error('Enhancement config rollback source changed during restoration'),
    );
  }
  let restored;
  try {
    restored = await readFileSnapshot(fileSystem, target, targetParentStatus, platform);
  } catch (error) {
    return rejectRollbackLink(fileSystem, source, target, platform, error);
  }
  if (!snapshotMatchesIgnoringParent(source, restored, 1)) {
    return rejectRollbackLink(
      fileSystem,
      source,
      target,
      platform,
      new Error('Enhancement config rollback changed after restoration'),
      restored,
    );
  }
  return true;
}

function snapshotsMatch(left, right) {
  return left && right && snapshotsEqual(left, right);
}

export async function readEnhancementConfig({
  homeDir,
  manifest,
  filename = ENHANCEMENT_CONFIG_FILENAME,
  fileSystem = defaultFileSystem,
  platform = process.platform,
  waitForUnlockMs = DEFAULT_LOCK_WAIT_MS,
  isProcessAlive = defaultIsProcessAlive,
} = {}) {
  const path = enhancementConfigPath(homeDir, { filename });
  if (!Number.isSafeInteger(waitForUnlockMs) || waitForUnlockMs < 0) {
    throw new TypeError('Enhancement config lock wait must be a non-negative safe integer');
  }
  if (typeof isProcessAlive !== 'function') throw new TypeError('Enhancement config process probe must be a function');
  const lockPath = configLockPath(path);
  const deadline = Date.now() + waitForUnlockMs;
  while (true) {
    const directory = await inspectConfigDirectory(fileSystem, homeDir, { platform });
    if (!directory.status) {
      await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
      return null;
    }
    if (await waitForConfigUnlock(fileSystem, lockPath, deadline, platform, isProcessAlive, homeDir, directory)) {
      await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
      continue;
    }
    await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
    let snapshot;
    try {
      snapshot = await readFileSnapshot(fileSystem, path, directory.status, platform);
      await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
    } catch (error) {
      if (await waitForConfigUnlock(fileSystem, lockPath, deadline, platform, isProcessAlive, homeDir, directory)) {
        await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
        continue;
      }
      await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
      throw error;
    }
    if (await waitForConfigUnlock(fileSystem, lockPath, deadline, platform, isProcessAlive, homeDir, directory)) {
      await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
      continue;
    }
    await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
    if (!snapshot.present) {
      await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
      return null;
    }
    const config = parseStoredEnhancementConfig(snapshot.bytes, manifest);
    await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
    return config;
  }
}

export async function writeEnhancementConfig({
  homeDir,
  manifest,
  selection,
  filename = ENHANCEMENT_CONFIG_FILENAME,
  fileSystem = defaultFileSystem,
  platform = process.platform,
  isProcessAlive = defaultIsProcessAlive,
} = {}) {
  if (typeof isProcessAlive !== 'function') throw new TypeError('Enhancement config process probe must be a function');
  const path = enhancementConfigPath(homeDir, { filename });
  const config = selectionToStoredEnhancementConfig(selection, manifest);
  const bytes = serializeEnhancementConfig(config, manifest);
  let directory = await inspectConfigDirectory(fileSystem, homeDir, { platform });
  let createdDirectory = null;
  let original;
  let temporary = null;
  let lock = null;
  let backupPath = null;
  let backup = null;
  let backupDirectory = null;
  let publicationIdentity = null;
  let targetMutationStarted = false;
  let publicationCommitted = false;

  try {
    if (!directory.status) {
      createdDirectory = await createConfigDirectory(fileSystem, homeDir, directory, platform);
      directory = await inspectConfigDirectory(fileSystem, homeDir, { missing: 'reject', platform });
      if (!sameIdentity(fileIdentity(directory.status), createdDirectory.identity)) {
        throw new Error('Enhancement config directory changed during creation');
      }
    }

    lock = await acquireConfigLock(fileSystem, configLockPath(path), platform, isProcessAlive);

    original = await readFileSnapshot(fileSystem, path, directory.status, platform);
    if (original.present) parseStoredEnhancementConfig(original.bytes, manifest);

    const transactionPaths = configTransactionPaths(lock);
    const temporaryPath = transactionPaths.temporary;
    temporary = await stagePrivateFile(fileSystem, temporaryPath, Buffer.from(bytes, 'utf8'), platform);

    await assertConfigLockCurrent(fileSystem, lock, platform);
    await assertSnapshotCurrent(fileSystem, homeDir, original, platform);
    targetMutationStarted = true;
    if (original.present) {
      backupPath = transactionPaths.backup;
      const moved = await moveKnownFileToPrivateDirectory(
        fileSystem,
        original,
        transactionPaths.backupDirectory,
        platform,
        'Enhancement config backup publication',
      );
      backup = moved.moved;
      backupDirectory = moved.ownedDirectory;
    }

    try {
      await fileSystem.link(temporary.path, path);
    } catch (error) {
      if (error?.code === 'EEXIST') {
        throw new Error('Concurrent enhancement config replacement prevented publication');
      }
      throw error;
    }
    publicationIdentity = temporary.identity;
    if (!await unlinkIfOwned(fileSystem, temporary.path, temporary.identity)) {
      throw new Error('Enhancement config temporary publication changed during commit');
    }

    const publishedDirectory = await inspectConfigDirectory(fileSystem, homeDir, { missing: 'reject', platform });
    if (!sameIdentity(fileIdentity(publishedDirectory.status), original.parentIdentity)) {
      throw new Error('Enhancement config ancestor changed after publication');
    }
    const published = await readFileSnapshot(fileSystem, path, publishedDirectory.status, platform);
    if (!published.present
      || !sameIdentity(published.identity, temporary.identity)
      || !configModeMatches(published.mode, platform)
      || !Buffer.from(published.bytes).equals(Buffer.from(bytes))) {
      throw new Error('Enhancement config changed after publication by a concurrent replacement');
    }
    await syncDirectory(fileSystem, directory.path, platform);

    if (backup) {
      await removeKnownRegularFile(fileSystem, backup, platform, 'Enhancement config backup');
      await removeOwnedPrivateDirectory(fileSystem, backupDirectory, platform, 'Enhancement config backup');
    }
    backup = null;
    backupPath = null;
    backupDirectory = null;
    publicationCommitted = true;
    if (!await releaseConfigLock(fileSystem, lock, platform)) {
      throw markRestorationIncomplete(
        new Error('Enhancement config transaction lock changed during release'),
        [lock.path, path],
      );
    }
    lock = null;
    return { path, config, bytes };
  } catch (error) {
    const evidenceCandidates = [...(error?.evidencePaths || [])];
    let restorationIncomplete = error?.restorationIncomplete === true;
    const recordRestorationFailure = restoreError => {
      restorationIncomplete = true;
      evidenceCandidates.push(...(restoreError?.evidencePaths || []));
    };
    const currentDirectoryStatus = await lstatIfPresent(fileSystem, directory.path).catch(() => null);
    const directoryChanged = !directory.status
      || !currentDirectoryStatus
      || !configDirectoryStatusIsSafe(currentDirectoryStatus, platform)
      || !sameIdentity(fileIdentity(currentDirectoryStatus), fileIdentity(directory.status));
    if (directoryChanged) {
      restorationIncomplete = true;
      evidenceCandidates.push(directory.path);
    }

    if (!directoryChanged && backupPath && !backup) {
      try {
        const candidate = await readFileSnapshot(fileSystem, backupPath, currentDirectoryStatus, platform);
        if (candidate.present && snapshotsMatch(original, candidate)) backup = candidate;
        else {
          restorationIncomplete = true;
          evidenceCandidates.push(backupPath);
        }
      } catch {
        restorationIncomplete = true;
        evidenceCandidates.push(backupPath);
      }
    }

    if (temporary) {
      try {
        if (!await unlinkIfOwned(fileSystem, temporary.path, temporary.identity)) {
          restorationIncomplete = true;
          evidenceCandidates.push(temporary.path);
        }
      } catch {
        restorationIncomplete = true;
        evidenceCandidates.push(temporary.path);
      }
    }

    let currentTarget = null;
    if (!directoryChanged) {
      try {
        currentTarget = await readFileSnapshot(fileSystem, path, currentDirectoryStatus, platform);
      } catch {}
    }
    const targetIsPublication = currentTarget?.present
      && temporary
      && sameIdentity(currentTarget.identity, temporary.identity)
      && configModeMatches(currentTarget.mode, platform)
      && currentTarget.nlink === 1
      && Buffer.from(currentTarget.bytes).equals(Buffer.from(bytes));
    const targetIsOriginal = original && currentTarget && snapshotsEqual(original, currentTarget);

    if (targetMutationStarted && !publicationCommitted && !directoryChanged && !targetIsOriginal) {
      if (targetIsPublication) {
        const transactionPaths = configTransactionPaths(lock);
        let failedPath = transactionPaths.failed;
        let failedDirectory = null;
        let movedPublication = null;
        try {
          const moved = await moveKnownFileToPrivateDirectory(
            fileSystem,
            currentTarget,
            transactionPaths.failedDirectory,
            platform,
            'Enhancement config failed publication',
          );
          movedPublication = moved.moved;
          failedDirectory = moved.ownedDirectory;
          failedPath = movedPublication.path;
        } catch (moveError) {
          restorationIncomplete = true;
          evidenceCandidates.push(...(moveError?.evidencePaths || []), failedPath, path);
        }
        if (movedPublication && sameIdentity(movedPublication.identity, publicationIdentity)
          && configModeMatches(movedPublication.mode, platform)
          && movedPublication.nlink === 1
          && Buffer.from(movedPublication.bytes).equals(Buffer.from(bytes))) {
          let restored = !original?.present;
          if (original?.present && backup) {
            try {
              restored = await restoreSnapshotExclusively(fileSystem, backup, path, platform);
              if (restored) {
                backup = null;
                backupPath = null;
                await removeOwnedPrivateDirectory(fileSystem, backupDirectory, platform, 'Enhancement config backup');
                backupDirectory = null;
              }
            } catch (restoreError) {
              recordRestorationFailure(restoreError);
              restored = false;
            }
          }
          if (restored) {
            try {
              await removeKnownRegularFile(fileSystem, movedPublication, platform, 'Enhancement config failed publication');
              await removeOwnedPrivateDirectory(fileSystem, failedDirectory, platform, 'Enhancement config failed publication');
            } catch (cleanupError) {
              recordRestorationFailure(cleanupError);
              restored = false;
            }
          }
          if (!restored) {
            restorationIncomplete = true;
            evidenceCandidates.push(failedPath, path);
          }
        } else if (movedPublication) {
          restorationIncomplete = true;
          evidenceCandidates.push(failedPath);
          try {
            await restoreSnapshotExclusively(fileSystem, movedPublication, path, platform);
          } catch (restoreError) {
            recordRestorationFailure(restoreError);
          }
        }
      } else if (!currentTarget?.present && backup) {
        try {
          if (await restoreSnapshotExclusively(fileSystem, backup, path, platform)) {
            backup = null;
            backupPath = null;
            await removeOwnedPrivateDirectory(fileSystem, backupDirectory, platform, 'Enhancement config backup');
            backupDirectory = null;
          } else restorationIncomplete = true;
        } catch (restoreError) {
          recordRestorationFailure(restoreError);
        }
      } else {
        restorationIncomplete = true;
        evidenceCandidates.push(path);
      }
    }

    if (backup) {
      restorationIncomplete = true;
      evidenceCandidates.push(backup.path);
    }

    if (lock) {
      if (publicationCommitted || restorationIncomplete) {
        restorationIncomplete = true;
        evidenceCandidates.push(lock.path, path);
      } else {
        try {
          if (!await releaseConfigLock(fileSystem, lock, platform)) {
            restorationIncomplete = true;
            evidenceCandidates.push(lock.path);
          }
        } catch {
          restorationIncomplete = true;
          evidenceCandidates.push(lock.path);
        }
      }
      lock = null;
    }

    try {
      if (!await removeCreatedConfigDirectory(fileSystem, createdDirectory)) {
        restorationIncomplete = true;
        evidenceCandidates.push(createdDirectory.path);
      }
    } catch {
      restorationIncomplete = true;
      if (createdDirectory) evidenceCandidates.push(createdDirectory.path);
    }

    if (restorationIncomplete) {
      const evidencePaths = await existingEvidencePaths(fileSystem, evidenceCandidates);
      throw markRestorationIncomplete(error, evidencePaths.length > 0 ? evidencePaths : evidenceCandidates);
    }
    throw error;
  }
}
ENHANCEMENT_CONFIG_EOF
chmod 700 "$CLAWGOD_DIR/enhancement-config.mjs"
cat > "$CLAWGOD_DIR/enhancement-manifest.json" << 'ENHANCEMENT_MANIFEST_EOF'
[
  { "id": "chrome", "kind": "patch" },
  { "id": "computer-use", "kind": "patch" },
  { "id": "design-canvas", "kind": "patch" },
  { "id": "agents", "kind": "patch" },
  { "id": "planning", "kind": "patch" },
  { "id": "voice", "kind": "patch" },
  { "id": "auto-mode", "kind": "patch" },
  { "id": "unrestricted-tools", "kind": "patch" },
  { "id": "paste-images", "kind": "patch" },
  { "id": "privacy", "kind": "patch" },
  { "id": "branding", "kind": "patch" },
  { "id": "claude-hud", "kind": "plugin" },
  { "id": "claude-mem", "kind": "plugin" },
  { "id": "superpowers", "kind": "plugin" }
]
ENHANCEMENT_MANIFEST_EOF
chmod 600 "$CLAWGOD_DIR/enhancement-manifest.json"
configure_enhancement_selection

cat > "$CLAWGOD_DIR/proxy-fetch.mjs" << 'PROXY_FETCH_EOF'
#!/usr/bin/env bun
import { BlockList, isIP } from 'node:net';
import { fileURLToPath } from 'node:url';

function emptyProxySettings() {
  return {
    httpProxy: undefined,
    httpsProxy: undefined,
    exceptions: [],
    excludeSimpleHostnames: false,
  };
}

function settingValue(source, name) {
  const match = new RegExp(`^\\s*${name}\\s*:\\s*(.*?)\\s*$`, 'm').exec(source);
  return match?.[1];
}

function proxyUrl(source, prefix) {
  if (settingValue(source, `${prefix}Enable`) !== '1') return undefined;
  const host = settingValue(source, `${prefix}Proxy`)?.trim().replace(/^\[|\]$/g, '');
  const port = Number(settingValue(source, `${prefix}Port`));
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return undefined;
  try {
    const url = new URL(`http://${isIP(host) === 6 ? `[${host}]` : host}:${port}`);
    return url.href.replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

function validMacOSProxyOutput(source) {
  return typeof source === 'string' && /^\s*<dictionary>\s*\{[\s\S]*\}\s*$/.test(source);
}

export function parseMacOSProxySettings(source) {
  if (!validMacOSProxyOutput(source)) return emptyProxySettings();
  const array = /ExceptionsList\s*:\s*<array>\s*\{([\s\S]*?)^\s*\}/m.exec(source)?.[1] || '';
  const exceptions = [...array.matchAll(/^\s*\d+\s*:\s*(.*?)\s*$/gm)]
    .flatMap(match => match[1].split(','))
    .map(value => value.trim())
    .filter(Boolean);
  return {
    httpProxy: proxyUrl(source, 'HTTP'),
    httpsProxy: proxyUrl(source, 'HTTPS'),
    exceptions,
    excludeSimpleHostnames: settingValue(source, 'ExcludeSimpleHostnames') === '1',
  };
}

function noProxyRule(value) {
  let entry = value.trim().toLowerCase();
  if (entry === '*') return { all: true };

  let host = entry;
  let port = '';
  if (entry.startsWith('[')) {
    const close = entry.indexOf(']');
    if (close === -1) return { host: entry, port };
    host = entry.slice(1, close);
    const suffix = entry.slice(close + 1);
    if (/^:\d+$/.test(suffix)) port = suffix.slice(1);
    else if (suffix) return { host: entry, port };
  } else {
    const colon = entry.lastIndexOf(':');
    if (colon > 0 && colon === entry.indexOf(':') && /^\d+$/.test(entry.slice(colon + 1))) {
      host = entry.slice(0, colon);
      port = entry.slice(colon + 1);
    }
  }
  return { host: host.replace(/^\*\.?/, '.'), port };
}

function cidrMatches(host, rule) {
  const slash = rule.lastIndexOf('/');
  if (slash <= 0) return false;
  let network = rule.slice(0, slash).replace(/^\[|\]$/g, '');
  if (/^(?:\d{1,3}\.){0,2}\d{1,3}$/.test(network)) network = `${network}${'.0'.repeat(4 - network.split('.').length)}`;
  const family = isIP(network);
  const prefix = Number(rule.slice(slash + 1));
  const width = family === 4 ? 32 : family === 6 ? 128 : 0;
  if (!width || isIP(host) !== family || !Number.isInteger(prefix) || prefix < 0 || prefix > width) return false;
  try {
    const blockList = new BlockList();
    const type = family === 4 ? 'ipv4' : 'ipv6';
    blockList.addSubnet(network, prefix, type);
    return blockList.check(host, type);
  } catch {
    return false;
  }
}

function matchesRule(parsed, value) {
  const rule = noProxyRule(value);
  if (rule.all) return true;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const baseHost = rule.host.replace(/^\./, '');
  const matchesHost = cidrMatches(host, rule.host) || host === baseHost || host.endsWith(`.${baseHost}`);
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : parsed.protocol === 'http:' ? '80' : '');
  return matchesHost && (!rule.port || rule.port === port);
}

function environmentProxy(parsed, env) {
  return parsed.protocol === 'https:'
    ? env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy
    : env.HTTP_PROXY || env.http_proxy;
}

function bypassesEnvironment(parsed, env) {
  const entries = (env.NO_PROXY || env.no_proxy || '').split(',').filter(value => value.trim());
  return entries.some(entry => matchesRule(parsed, entry));
}

function bypassesSystem(parsed, settings) {
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (settings.excludeSimpleHostnames && !host.includes('.') && !isIP(host)) return true;
  return settings.exceptions.some(entry => matchesRule(parsed, entry));
}

let cachedSystemProxy;

export function readMacOSSystemProxy({
  platform = process.platform,
  spawnSync = (command, options) => Bun.spawnSync(command, options),
  warn = message => console.error(`[clawgod] ${message}`),
} = {}) {
  if (platform !== 'darwin') return emptyProxySettings();
  try {
    const result = spawnSync(['/usr/sbin/scutil', '--proxy'], { stdout: 'pipe', stderr: 'pipe' });
    if (result.exitCode !== 0) throw new Error('scutil failed');
    const source = Buffer.from(result.stdout || []).toString('utf8');
    if (!validMacOSProxyOutput(source)) throw new Error('malformed scutil output');
    const settings = parseMacOSProxySettings(source);
    const automatic = ['ProxyAutoConfigEnable', 'ProxyAutoDiscoveryEnable']
      .some(name => settingValue(source, name) === '1');
    if (automatic) {
      warn('macOS PAC and auto-discovery proxy settings are not supported; continuing without a proxy.');
      return emptyProxySettings();
    }
    if (!settings.httpProxy && !settings.httpsProxy && settingValue(source, 'SOCKSEnable') === '1') {
      warn('macOS SOCKS-only proxy settings are not supported; continuing without a proxy.');
    }
    return settings;
  } catch {
    warn('Unable to read macOS system proxy settings; continuing without a proxy.');
    return emptyProxySettings();
  }
}

function defaultSystemProxy(env) {
  if (env !== process.env) return emptyProxySettings();
  cachedSystemProxy ||= readMacOSSystemProxy();
  return cachedSystemProxy;
}

function proxyRoute(urlValue, env, systemProxy) {
  const parsed = typeof urlValue === 'string' ? new URL(urlValue) : urlValue;
  if (bypassesEnvironment(parsed, env)) return { bypass: true, proxy: undefined };
  const explicit = environmentProxy(parsed, env);
  if (explicit) return { bypass: false, proxy: explicit };
  const settings = systemProxy || defaultSystemProxy(env);
  if (bypassesSystem(parsed, settings)) return { bypass: true, proxy: undefined };
  const proxy = parsed.protocol === 'https:' ? settings.httpsProxy : settings.httpProxy;
  return { bypass: !proxy, proxy };
}

export function proxyFor(urlValue, env = process.env, systemProxy) {
  return proxyRoute(urlValue, env, systemProxy).proxy;
}

const DIRECT_WORKER_FLAG = '--clawgod-direct-fetch-worker';

function directWorkerEnv() {
  const env = { ...process.env, NO_PROXY: '*', no_proxy: '*' };
  for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete env[name];
  return env;
}

function directWorkerBody(child, reader, initialChunk) {
  let pending = initialChunk?.length ? initialChunk : undefined;
  return new ReadableStream({
    async pull(controller) {
      try {
        if (pending) {
          const value = pending;
          pending = undefined;
          controller.enqueue(value);
          return;
        }
        const { done, value } = await reader.read();
        if (!done) {
          controller.enqueue(value);
          return;
        }
        const status = await child.exited;
        if (status === 0) controller.close();
        else {
          const stderr = await new Response(child.stderr).text();
          controller.error(new Error(stderr.trim() || `Direct fetch worker exited with status ${status}`));
        }
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      reader.cancel(reason);
      child.kill();
    },
  });
}

async function directWorkerResponse(child) {
  const reader = child.stdout.getReader();
  let prefix = new Uint8Array();
  const maxMetadataBytes = 1048576;
  while (prefix.length <= maxMetadataBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const newline = value.indexOf(10);
    const metadataLength = prefix.length + (newline === -1 ? value.length : newline);
    if (metadataLength > maxMetadataBytes) break;
    const metadataBytes = new Uint8Array(metadataLength);
    metadataBytes.set(prefix);
    metadataBytes.set(newline === -1 ? value : value.subarray(0, newline), prefix.length);
    if (newline === -1) {
      prefix = metadataBytes;
      continue;
    }
    const metadata = JSON.parse(new TextDecoder().decode(metadataBytes));
    if (!metadata?.ok || !Number.isInteger(metadata.status) || !Array.isArray(metadata.headers)) {
      throw new Error('Direct fetch worker returned invalid metadata');
    }
    return new Response(directWorkerBody(child, reader, value.subarray(newline + 1)), {
      status: metadata.status,
      statusText: metadata.statusText,
      headers: metadata.headers,
    });
  }
  child.kill();
  const status = await child.exited;
  const stderr = await new Response(child.stderr).text();
  throw new Error(stderr.trim() || `Direct fetch worker exited with status ${status} before returning metadata`);
}

async function fetchDirect(url, init, fetchImpl) {
  const method = String(init.method || 'GET').toUpperCase();
  if ((method !== 'GET' && method !== 'HEAD') || init.body != null) {
    throw new Error('Direct downloads support only GET or HEAD requests without a body');
  }
  if (fetchImpl !== fetch) return fetchImpl(url, init);
  const child = Bun.spawn([process.execPath, fileURLToPath(import.meta.url), DIRECT_WORKER_FLAG], {
    stdin: Buffer.from(JSON.stringify({
      url: String(url),
      method: init.method || 'GET',
      headers: [...new Headers(init.headers).entries()],
    })),
    stdout: 'pipe',
    stderr: 'pipe',
    env: directWorkerEnv(),
  });
  if (init.signal) {
    const abort = () => child.kill();
    if (init.signal.aborted) abort();
    else init.signal.addEventListener('abort', abort, { once: true });
  }
  return directWorkerResponse(child);
}

async function runDirectFetchWorker() {
  try {
    const { url, method, headers } = await Bun.stdin.json();
    const response = await fetch(url, {
      method,
      headers,
      redirect: 'manual',
    });
    console.log(JSON.stringify({
      ok: true,
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
    }));
    if (response.body) {
      for await (const chunk of response.body) {
        await new Promise((resolve, reject) => {
          process.stdout.write(chunk, error => error ? reject(error) : resolve());
        });
      }
    }
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (import.meta.main && process.argv[2] === DIRECT_WORKER_FLAG) await runDirectFetchWorker();

export async function fetchWithProxy(initialUrl, init = {}, env = process.env, fetchImpl = fetch, systemProxy) {
  let nextUrl = initialUrl;
  const { proxy: _callerProxy, ...baseInit } = init;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const route = proxyRoute(nextUrl, env, systemProxy);
    const timeoutSignal = AbortSignal.timeout(300000);
    const signal = baseInit.signal ? AbortSignal.any([baseInit.signal, timeoutSignal]) : timeoutSignal;
    let response;
    try {
      const requestInit = {
        ...baseInit,
        redirect: 'manual',
        signal,
        ...(route.proxy ? { proxy: route.proxy } : {}),
      };
      signal.throwIfAborted();
      response = route.bypass
        ? await fetchDirect(nextUrl, requestInit, fetchImpl)
        : await fetchImpl(nextUrl, requestInit);
    } catch (error) {
      if (signal.aborted) throw signal.reason || error;
      if (route.proxy) throw new Error('Request failed through configured proxy');
      throw error;
    }
    if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
      if (response.body) await response.body.cancel();
      if (redirects === 5) throw new Error('Too many redirects');
      nextUrl = new URL(response.headers.get('location'), nextUrl).href;
      continue;
    }
    if (response.status !== 200) {
      if (response.body) await response.body.cancel();
      throw new Error(`Request failed with HTTP ${response.status}`);
    }
    return response;
  }
  throw new Error('Too many redirects');
}
PROXY_FETCH_EOF
chmod 700 "$CLAWGOD_DIR/proxy-fetch.mjs"

cat > "$CLAWGOD_DIR/fetch-file.mjs" << 'FETCH_FILE_EOF'
#!/usr/bin/env bun
import { existsSync, renameSync, rmSync } from 'node:fs';

import { fetchWithProxy } from './proxy-fetch.mjs';

const [url, destination] = process.argv.slice(2);
if (!url || !destination) throw new Error('usage: fetch-file.mjs <url> <destination>');

const temporary = `${destination}.${process.pid}.tmp`;
try {
  const response = await fetchWithProxy(url);
  const writer = Bun.file(temporary).writer();
  try {
    if (response.body) {
      for await (const chunk of response.body) await writer.write(chunk);
    }
  } finally {
    await writer.end();
  }
  renameSync(temporary, destination);
} finally {
  if (existsSync(temporary)) rmSync(temporary, { force: true });
}
FETCH_FILE_EOF
chmod 700 "$CLAWGOD_DIR/fetch-file.mjs"

# --- Optional Claude plugin dependencies -----------------------------

cat > "$CLAWGOD_DIR/plugin-dependencies.mjs" << 'PLUGIN_DEPENDENCIES_EOF'
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
import { pathToFileURL } from 'node:url';

export const PLUGIN_BASELINES = Object.freeze({
  hud: Object.freeze({
    key: 'hud', id: 'claude-hud@claude-hud', marketplace: 'claude-hud', plugin: 'claude-hud',
    version: '0.7.0', bytes: 754443,
    sha256: '59bd3ec17e7b9181d8069c93cc7c5e1db8b1d33e6a94e4041f6589dd8b87c912',
    url: 'https://github.com/jarrodwatts/claude-hud/archive/refs/tags/v0.7.0.tar.gz',
  }),
  memory: Object.freeze({
    key: 'memory', id: 'claude-mem@thedotmack', marketplace: 'thedotmack', plugin: 'claude-mem',
    version: '13.14.0', bytes: 11817347,
    sha256: 'a64f7dd038308da0db52f10d8f4fc2b3b3acfec5d9ddfdcfea9f6e473e54bed0',
    url: 'https://github.com/thedotmack/claude-mem/archive/refs/tags/v13.14.0.tar.gz',
  }),
  superpowers: Object.freeze({
    key: 'superpowers', id: 'superpowers@superpowers-marketplace', marketplace: 'superpowers-marketplace', plugin: 'superpowers',
    archiveMarketplace: 'superpowers-dev',
    version: '6.2.0', bytes: 516401,
    sha256: '468246a7b4981d4c014c2b58d9ee538700ffded075279d5810059cdc1abeb5f3',
    url: 'https://github.com/obra/superpowers/archive/refs/tags/v6.2.0.tar.gz',
  }),
});

export const PLUGIN_ENHANCEMENT_IDS = Object.freeze({
  hud: 'claude-hud',
  memory: 'claude-mem',
  superpowers: 'superpowers',
});

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 512 * 1024 * 1024;
const MAX_ENTRIES = 50_000;
const TAR_BLOCK_BYTES = 512;
const NON_BUN_LOCKFILES = new Set(['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml']);
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
    if (status.isSymbolicLink() || !status.isDirectory() || (process.platform !== 'win32' && (status.mode & 0o022) !== 0)) {
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
  if (status.isSymbolicLink() || !status.isFile() || (process.platform !== 'win32' && (status.mode & 0o022) !== 0)) {
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
  const configUserOwned = hasExactKeys(config, ['userOwned']) && config.userOwned === true;
  if (!hasExactKeys(value.hud, ['config', 'statusLine'])
    || !isPlainRecord(config)
    || (!configUserOwned && (!hasExactKeys(config, ['originalPresent', 'originalBase64', 'managedSha256'])
      || typeof config.originalPresent !== 'boolean'
      || !isCanonicalBase64(config.originalBase64)
      || (!config.originalPresent && config.originalBase64 !== '')
      || !hashPattern.test(config.managedSha256)
      || config.managedSha256 !== fileFingerprint(HUD_CONFIG_TEXT)))
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

const HUD_STATUSLINE_SOURCE_JSON = "\"#!/usr/bin/env bun\\nimport { lstatSync, readFileSync, realpathSync } from 'node:fs';\\nimport { isAbsolute, join, relative, sep } from 'node:path';\\n\\nconst claudeConfigDir = \\\"/__CLAWGOD_HUD_CLAUDE_CONFIG_DIR__\\\";\\nconst pluginId = 'claude-hud@claude-hud';\\nconst semverPattern = /^(0|[1-9]\\\\d*)\\\\.(0|[1-9]\\\\d*)\\\\.(0|[1-9]\\\\d*)(?:-([0-9A-Za-z-]+(?:\\\\.[0-9A-Za-z-]+)*))?$/;\\nfunction parseVersion(value) {\\n  const match = typeof value === 'string' ? semverPattern.exec(value) : null;\\n  if (!match) return null;\\n  const core = match.slice(1, 4).map(Number);\\n  if (!core.every(Number.isSafeInteger)) return null;\\n  const prerelease = match[4] ? match[4].split('.').map(identifier => {\\n    if (!/^\\\\d+$/.test(identifier)) return identifier;\\n    if (!/^(0|[1-9]\\\\d*)$/.test(identifier)) return null;\\n    const numeric = Number(identifier);\\n    return Number.isSafeInteger(numeric) ? numeric : null;\\n  }) : [];\\n  return prerelease.includes(null) ? null : { core, prerelease };\\n}\\nfunction compare(left, right) {\\n  const a = parseVersion(left); const b = parseVersion(right);\\n  if (!a || !b) return 0;\\n  for (let index = 0; index < 3; index++) if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index];\\n  if (!a.prerelease.length || !b.prerelease.length) return a.prerelease.length ? -1 : b.prerelease.length ? 1 : 0;\\n  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {\\n    if (a.prerelease[index] === undefined) return -1;\\n    if (b.prerelease[index] === undefined) return 1;\\n    if (a.prerelease[index] === b.prerelease[index]) continue;\\n    if (typeof a.prerelease[index] === 'number' && typeof b.prerelease[index] !== 'number') return -1;\\n    if (typeof a.prerelease[index] !== 'number' && typeof b.prerelease[index] === 'number') return 1;\\n    return a.prerelease[index] < b.prerelease[index] ? -1 : 1;\\n  }\\n  return 0;\\n}\\nfunction contained(root, path) {\\n  const child = relative(root, path);\\n  return child === '' || (!child.startsWith('..' + sep) && child !== '..' && !isAbsolute(child));\\n}\\nfunction captureDirectoryChain(root, target) {\\n  if (!contained(root, target)) return null;\\n  const identities = [];\\n  let current = root;\\n  for (const part of ['', ...relative(root, target).split(sep).filter(Boolean)]) {\\n    if (part) current = join(current, part);\\n    try {\\n      const status = lstatSync(current);\\n      if (status.isSymbolicLink() || !status.isDirectory()) return null;\\n      identities.push({ path: current, dev: status.dev, ino: status.ino, mode: status.mode, nlink: status.nlink });\\n    } catch { return null; }\\n  }\\n  return identities;\\n}\\nfunction validEntry(record, cacheRoot) {\\n  if (record?.scope !== 'user' || !parseVersion(record.version) || typeof record.installPath !== 'string' || !isAbsolute(record.installPath)) return null;\\n  try {\\n    if (!contained(cacheRoot, record.installPath)) return null;\\n    const cacheStatus = lstatSync(cacheRoot); const installStatus = lstatSync(record.installPath);\\n    if (cacheStatus.isSymbolicLink() || !cacheStatus.isDirectory() || installStatus.isSymbolicLink() || !installStatus.isDirectory()) return null;\\n    const realCache = realpathSync(cacheRoot); const realInstall = realpathSync(record.installPath);\\n    if (realCache === realInstall || !contained(realCache, realInstall)) return null;\\n    const source = join(record.installPath, 'src'); const candidate = join(source, 'index.ts');\\n    const directories = captureDirectoryChain(claudeConfigDir, source);\\n    if (!directories) return null;\\n    const sourceStatus = lstatSync(source); const entryStatus = lstatSync(candidate);\\n    if (sourceStatus.isSymbolicLink() || !sourceStatus.isDirectory() || entryStatus.isSymbolicLink() || !entryStatus.isFile() || entryStatus.nlink !== 1) return null;\\n    const entry = realpathSync(candidate);\\n    return contained(realInstall, entry) ? {\\n      record, entry, directories,\\n      entryIdentity: {\\n        dev: entryStatus.dev, ino: entryStatus.ino, mode: entryStatus.mode, nlink: entryStatus.nlink,\\n        size: entryStatus.size, mtimeMs: entryStatus.mtimeMs,\\n        sha256: new Bun.CryptoHasher('sha256').update(readFileSync(entry)).digest('hex'),\\n      },\\n    } : null;\\n  } catch { return null; }\\n}\\nfunction revalidate(selected) {\\n  for (const expected of selected.directories) {\\n    const status = lstatSync(expected.path);\\n    if (status.isSymbolicLink() || !status.isDirectory() || status.dev !== expected.dev || status.ino !== expected.ino\\n      || status.mode !== expected.mode || status.nlink !== expected.nlink) throw new Error('HUD directory changed before execution');\\n  }\\n  const status = lstatSync(selected.entry);\\n  const expected = selected.entryIdentity;\\n  if (status.isSymbolicLink() || !status.isFile() || status.nlink !== 1 || status.dev !== expected.dev || status.ino !== expected.ino\\n    || status.mode !== expected.mode || status.nlink !== expected.nlink || status.size !== expected.size || status.mtimeMs !== expected.mtimeMs\\n    || realpathSync(selected.entry) !== selected.entry\\n    || new Bun.CryptoHasher('sha256').update(readFileSync(selected.entry)).digest('hex') !== expected.sha256) {\\n    throw new Error('HUD entry changed before execution');\\n  }\\n}\\nlet selected;\\ntry {\\n  const installedPath = join(claudeConfigDir, 'plugins', 'installed_plugins.json');\\n  const installedStatus = lstatSync(installedPath);\\n  if (installedStatus.isSymbolicLink() || !installedStatus.isFile()) throw new Error('installed plugin state is unsafe');\\n  const installed = JSON.parse(readFileSync(installedPath, 'utf8'));\\n  if (installed?.version !== 2 || !installed.plugins || typeof installed.plugins !== 'object' || Array.isArray(installed.plugins)) {\\n    throw new Error('unsupported installed plugin schema');\\n  }\\n  const records = Array.isArray(installed?.plugins?.[pluginId]) ? installed.plugins[pluginId] : [];\\n  const cacheRoot = join(claudeConfigDir, 'plugins', 'cache', 'claude-hud', 'claude-hud');\\n  selected = records.map(record => validEntry(record, cacheRoot)).filter(Boolean).sort((a, b) => compare(b.record.version, a.record.version))[0];\\n  if (!selected) throw new Error('no valid user HUD installation in the canonical cache');\\n  revalidate(selected);\\n} catch (error) {\\n  console.error('claude-hud: ' + (error instanceof Error ? error.message : 'no valid user HUD installation'));\\n  process.exit(1);\\n}\\nconst child = Bun.spawn({\\n  cmd: [process.execPath, selected.entry],\\n  stdin: 'inherit',\\n  stdout: 'inherit',\\n  stderr: 'inherit',\\n  env: process.env,\\n});\\nprocess.exit(await child.exited);\\n\"";
const HUD_STATUSLINE_SOURCE_TOKEN = '@@' + 'CLAWGOD_HUD_STATUSLINE_SOURCE_JSON' + '@@';

function hudStatusLineSource() {
  if (HUD_STATUSLINE_SOURCE_JSON === HUD_STATUSLINE_SOURCE_TOKEN) {
    return readFileSync(new URL('./claude-hud-statusline.mjs', import.meta.url), 'utf8');
  }
  return JSON.parse(HUD_STATUSLINE_SOURCE_JSON);
}

export function renderHudStatusLineModule(context) {
  if (!isAbsolute(context.claudeConfigDir)) throw new Error('hud: Claude config path must be absolute');
  return hudStatusLineSource().replace("\"/__CLAWGOD_HUD_CLAUDE_CONFIG_DIR__\"", JSON.stringify(context.claudeConfigDir));
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
    const priorConfig = nextState.hud.config;
    const priorManagedSha256 = priorConfig?.userOwned === true ? null : priorConfig?.managedSha256;
    const configUserOwned = configPlan.snapshot?.present === true
      && (priorConfig?.userOwned === true || fileFingerprint(configPlan.snapshot.bytes) !== priorManagedSha256);
    let configSnapshot = configPlan.snapshot;
    if (!configUserOwned) {
      const preparedConfig = createHudConfigParent(context.claudeConfigDir, configPlan);
      configSnapshot = preparedConfig.snapshot;
      createdParent = preparedConfig.createdParent;
    }
    const settings = settingsSnapshot.present ? settingsSnapshot.value : {};
    if (configUserOwned) {
      nextState.hud.config = { userOwned: true };
    } else if (!priorManagedSha256 || !configSnapshot.present || fileFingerprint(configSnapshot.bytes) !== priorManagedSha256) {
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
      ...(configUserOwned ? [] : [{ root: context.claudeConfigDir, snapshot: configSnapshot, bytes: Buffer.from(HUD_CONFIG_TEXT), mode: configSnapshot.present ? configSnapshot.mode : 0o600, label: 'HUD config' }]),
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
    return pluginResult(spec, 'configured', true, selected.record.version,
      configUserOwned ? `configured ${selected.record.version}; kept existing user config` : `configured ${selected.record.version}`);
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
    const configUserOwned = ownership.config?.userOwned === true;
    const ownsConfig = !configUserOwned && configSnapshot.present && fileFingerprint(configSnapshot.bytes) === ownership.config.managedSha256;
    if (!ownsConfig && !configUserOwned) conflicts.push('hud config');
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
      bytes: Buffer.from(JSON.stringify({ ...ownershipState, hud: {} }, null, 2) + '\n'),
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

export async function restoreClaudeMemIntegrations(context) {
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

function resolveSymlinkTarget(parentParts, rootName, target, spec) {
  if (typeof target !== 'string' || target.includes('\0')) throw new Error(`${spec.key}: unsafe symlink target`);
  const portable = target.replace(/\\/g, '/');
  if (!portable || portable.startsWith('/') || /^[A-Za-z]:/.test(portable)) {
    throw new Error(`${spec.key}: unsafe symlink target`);
  }
  const parts = parentParts.slice();
  for (const part of portable.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length <= 1) throw new Error(`${spec.key}: symlink escapes the archive root`);
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  if (parts.length <= 1) throw new Error(`${spec.key}: unsafe symlink target`);
  if (parts[0] !== rootName) throw new Error(`${spec.key}: symlink escapes the archive root`);
  return parts.join('/');
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
    if (!['0', '5', 'x', 'g', 'L', '1', '2'].includes(type)) {
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
    let linkTarget = null;
    if (type === '1' || type === '2') {
      const linkname = decodeTarText(header.subarray(157, 257), 'tar link', spec);
      if (!linkname) throw new Error(`${spec.key}: malformed tar link entry`);
      if (type === '1') {
        const targetPath = normalizeArchivePath(linkname, spec);
        if (!seenPaths.has(targetPath)) throw new Error(`${spec.key}: hardlink references an unseen archive path`);
        linkTarget = targetPath;
      } else {
        const parentParts = path.split('/');
        parentParts.pop();
        linkTarget = resolveSymlinkTarget(parentParts, path.split('/')[0], linkname, spec);
      }
    }
    entries.push({ path, type, data, executable: (mode & 0o111) !== 0, linkTarget });
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

function materializeArchiveLink(stagingRoot, entry, spec) {
  const sourcePath = join(stagingRoot, ...entry.linkTarget.split('/'));
  let sourceBytes;
  try {
    const status = lstatSync(sourcePath);
    if (status.isSymbolicLink() || !status.isFile() || status.nlink !== 1) return;
    sourceBytes = readSingleLinkFile(sourcePath);
  } catch {
    return;
  }
  if (!sourceBytes) return;
  writeExclusive(entry.target, sourceBytes.bytes, entry.executable, spec);
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
    const linkEntries = [];
    for (const entry of archive.entries) {
      const parent = ensureDirectory(stagingRoot, dirname(entry.path).replace(/\\/g, '/'), spec);
      const target = join(parent, entry.path.split('/').at(-1));
      if (entry.type === '5') ensureDirectory(stagingRoot, entry.path, spec);
      else if (entry.type === '1' || entry.type === '2') linkEntries.push({ ...entry, target });
      else writeExclusive(target, entry.data, entry.executable, spec);
    }
    for (const entry of linkEntries) materializeArchiveLink(stagingRoot, entry, spec);
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

function fetchStderrSummary(result) {
  if (!result?.stderr) return '';
  const text = Buffer.from(result.stderr).toString('utf8').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (/\b(?:secret|token|proxy|stack)\b/i.test(text)) return '';
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
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
      } catch (error) {
        throw new Error(`${spec.key}: download failed from ${spec.url}: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (result.exitCode !== 0) {
        const summary = fetchStderrSummary(result);
        throw new Error(`${spec.key}: download failed from ${spec.url} (exit code ${result.exitCode})${summary ? `: ${summary}` : ''} — check your network connection or configure HTTPS_PROXY`);
      }
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
    if (NON_BUN_LOCKFILES.has(name)) continue;
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
      const sourceManifest = readJson(join(sourceRoot, '.claude-plugin', 'marketplace.json'), spec);
      const wrapperManifest = {
        name: 'superpowers-marketplace',
        plugins: [{ name: 'superpowers', version: '6.2.0', source: './plugin' }],
      };
      if (sourceManifest.owner) wrapperManifest.owner = sourceManifest.owner;
      writeExclusive(
        join(manifestDirectory, 'marketplace.json'),
        new TextEncoder().encode(JSON.stringify(wrapperManifest)),
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
  } catch (error) {
    throw new Error(`${spec.key}: plugin command failed: ${error?.message || String(error)}`);
  }
  if (result.exitCode !== 0) {
    const stderr = String(result.stderr || '').trim();
    const stdout = String(result.stdout || '').trim();
    const detail = [stderr, stdout].filter(Boolean).join(' | ');
    throw new Error(`${spec.key}: plugin command failed (exit ${result.exitCode})${detail ? `: ${detail}` : ''}`);
  }
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

export function enabledPluginKeys(selection) {
  if (!selection || !Array.isArray(selection.enabled)) {
    return new Set(Object.keys(PLUGIN_ENHANCEMENT_IDS));
  }
  const enabled = new Set(selection.enabled);
  const keys = new Set();
  for (const [key, enhancementId] of Object.entries(PLUGIN_ENHANCEMENT_IDS)) {
    if (enabled.has(enhancementId)) keys.add(key);
  }
  return keys;
}

function disabledPluginSelection(summary, error) {
  const detail = error instanceof Error ? error.message : String(error);
  return { enabled: [], warning: `${summary}: ${detail}` };
}

async function resolvePluginSelection(context) {
  const clawgodDir = resolve(context.clawgodDir);
  const manifestPath = process.env.CLAWGOD_ENHANCEMENT_MANIFEST_FILE || join(clawgodDir, 'enhancement-manifest.json');
  const configModulePath = process.env.CLAWGOD_ENHANCEMENT_CONFIG_MODULE || join(clawgodDir, 'enhancement-config.mjs');
  const configPath = join(clawgodDir, 'enhancements.json');
  let engine;
  try {
    engine = await import(pathToFileURL(configModulePath).href);
  } catch {
    return null;
  }
  let manifest;
  try {
    manifest = engine.loadEnhancementManifest(readFileSync(manifestPath, 'utf8'), { filename: 'enhancements.json' });
  } catch {
    return null;
  }
  let raw;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { ...engine.resolveEnhancementSelection({}, manifest), warning: null };
    }
    return disabledPluginSelection('enhancement config is unreadable; optional plugins disabled', error);
  }
  let stored;
  try {
    stored = engine.parseStoredEnhancementConfig(raw, manifest);
  } catch (error) {
    return disabledPluginSelection('enhancement config is invalid; optional plugins disabled', error);
  }
  return { ...engine.resolveEnhancementSelection({ stored }, manifest), warning: null };
}

async function deselectedPluginResult(spec, context) {
  if (spec.key === 'superpowers') {
    return pluginResult(spec, 'disabled', false, null, 'management disabled; user installation retained');
  }
  let restoration;
  try {
    restoration = spec.key === 'hud'
      ? await restoreHud(context)
      : await restoreClaudeMemIntegrations(context);
  } catch (error) {
    return warningResult(spec, error);
  }
  if (restoration.failures.length > 0) {
    return warningResult(spec, new Error(`deselection restoration failed: ${restoration.failures[0]}`));
  }
  return pluginResult(
    spec,
    'disabled',
    false,
    null,
    `management disabled; restored ${restoration.restored.length} owned field(s)`,
  );
}

export async function ensurePluginDependencies(context, selection) {
  const specs = [PLUGIN_BASELINES.hud, PLUGIN_BASELINES.memory, PLUGIN_BASELINES.superpowers];
  const enabled = enabledPluginKeys(selection);
  const state = { schemaVersion: 1, hud: {}, claudeMem: { files: {} } };
  const results = [];
  if (selection?.warning) {
    results.push(pluginResult({ key: 'selection', id: 'plugin-selection' }, 'warning', false, null, selection.warning));
  }
  for (const spec of specs) {
    if (!enabled.has(spec.key)) {
      results.push(await deselectedPluginResult(spec, context));
      continue;
    }
    let marketplace;
    try {
      marketplace = await ensureMarketplacePlugin(spec, context);
    } catch (error) {
      marketplace = warningResult(spec, error);
    }
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
  let ready = 0;
  let disabled = 0;
  let warnings = 0;
  for (const result of results) {
    const label = result.status === 'disabled'
      ? 'disabled'
      : (result.status === 'warning' || !result.ready) ? 'warning' : 'ready';
    if (label === 'disabled') disabled += 1;
    else if (label === 'warning') warnings += 1;
    else ready += 1;
    const detail = String(result.detail || '').replace(/\s+/g, ' ').trim();
    console.log(`${result.id}: ${label}${detail ? ` - ${detail}` : ''}`);
  }
  console.log(`Optional plugins: ${ready} ready, ${disabled} disabled, ${warnings} warnings`);
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
    const selection = await resolvePluginSelection(context);
    printPluginResults(await ensurePluginDependencies(context, selection));
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
PLUGIN_DEPENDENCIES_EOF
chmod 700 "$CLAWGOD_DIR/plugin-dependencies.mjs"

# --- Managed ripgrep -------------------------------------------------

cat > "$CLAWGOD_DIR/install-ripgrep.mjs" << 'INSTALL_RIPGREP_EOF'
#!/usr/bin/env bun
import { chmodSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export { fetchWithProxy, parseMacOSProxySettings, proxyFor } from './proxy-fetch.mjs';
import { fetchWithProxy } from './proxy-fetch.mjs';

export const RIPGREP_VERSION = '15.2.0';
export const RIPGREP_ASSETS = {
  'darwin-arm64': ['ripgrep-15.2.0-aarch64-apple-darwin.tar.gz', '3750b2e93f37e0c692657da574d7019a101c0084da05a790c83fd335bad973e4'],
  'darwin-x64': ['ripgrep-15.2.0-x86_64-apple-darwin.tar.gz', 'af7825fcc69a2afc7a7aea55fc9af90e26421d8f20fe59df32e233c0b8a231c1'],
  'linux-arm64': ['ripgrep-15.2.0-aarch64-unknown-linux-musl.tar.gz', '800b1e7206afe799dfb5a6901f23147cfaabe0e52210538100f61e86e1740915'],
  'linux-x64': ['ripgrep-15.2.0-x86_64-unknown-linux-musl.tar.gz', '33e15bcf1624b25cdd2a55813a47a2f95dbe126268203e76aa6a585d1e7b149c'],
  'win32-arm64': ['ripgrep-15.2.0-aarch64-pc-windows-msvc.zip', 'e4abca10c3a64ebea742667dd7009449d49403db5460dd6873e389fa2945360f'],
  'win32-x64': ['ripgrep-15.2.0-x86_64-pc-windows-msvc.zip', '71b2fef860abe467217a538ff31de02f5258807c0129f771846f87bd029aafc5'],
};

const MAX_BINARY_BYTES = 100 * 1024 * 1024;

function safeArchivePath(name) {
  if (!name || name.startsWith('/') || name.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(name)) return false;
  return !name.split(/[\\/]/).includes('..');
}

export function selectRipgrepAsset(platform, arch) {
  const selected = RIPGREP_ASSETS[`${platform}-${arch}`];
  if (!selected) throw new Error(`Unsupported ripgrep platform: ${platform}-${arch}`);
  const [name, sha256] = selected;
  const directory = name.replace(/\.(?:tar\.gz|zip)$/, '');
  return { name, sha256, entry: `${directory}/${platform === 'win32' ? 'rg.exe' : 'rg'}` };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function checkedRange(start, size, limit, label) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(size) || start < 0 || size < 0 || start > limit || size > limit - start) {
    throw new Error(`ZIP ${label} is out of bounds`);
  }
  return start + size;
}

async function extractZip(bytes, expectedEntry) {
  if (bytes.length < 22) throw new Error('ZIP end of central directory is missing');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const searchStart = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= searchStart; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      const commentLength = view.getUint16(offset + 20, true);
      if (offset + 22 + commentLength === bytes.length) { eocd = offset; break; }
    }
  }
  if (eocd < 0) throw new Error('ZIP end of central directory is missing or malformed');
  if (view.getUint16(eocd + 4, true) !== 0 || view.getUint16(eocd + 6, true) !== 0) throw new Error('Multi-disk ZIP archives are unsupported');
  const entries = view.getUint16(eocd + 10, true);
  if (entries !== view.getUint16(eocd + 8, true) || entries === 0xffff) throw new Error('ZIP central directory entry count is invalid');
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  const centralEnd = checkedRange(centralOffset, centralSize, eocd, 'central directory');
  let cursor = centralOffset;
  let selected = null;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let index = 0; index < entries; index++) {
    checkedRange(cursor, 46, centralEnd, 'central entry header');
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('ZIP central directory signature is invalid');
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const expectedCrc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    if (flags & 0x41) throw new Error('Encrypted ZIP entries are unsupported');
    if (method !== 0 && method !== 8) throw new Error(`Unsupported ZIP compression method: ${method}`);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) throw new Error('ZIP64 entries are unsupported');
    if (uncompressedSize > MAX_BINARY_BYTES) throw new Error('ZIP executable size exceeds the safety limit');
    const recordEnd = checkedRange(cursor + 46, nameLength + extraLength + commentLength, centralEnd, 'central entry');
    let name;
    try { name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)); }
    catch { throw new Error('ZIP entry name is not valid UTF-8'); }
    if (!safeArchivePath(name)) throw new Error(`Unsafe ZIP path: ${name}`);
    if (name === expectedEntry) {
      if (selected) throw new Error(`ZIP contains duplicate exact entry: ${expectedEntry}`);
      selected = { flags, method, expectedCrc, compressedSize, uncompressedSize, localOffset, name };
    }
    cursor = recordEnd;
  }
  if (cursor !== centralEnd) throw new Error('ZIP central directory size does not match its entries');
  if (!selected) throw new Error(`ZIP is missing exact entry: ${expectedEntry}`);

  checkedRange(selected.localOffset, 30, centralOffset, 'local header');
  if (view.getUint32(selected.localOffset, true) !== 0x04034b50) throw new Error('ZIP local header signature is invalid');
  const localFlags = view.getUint16(selected.localOffset + 6, true);
  const localMethod = view.getUint16(selected.localOffset + 8, true);
  const localCrc = view.getUint32(selected.localOffset + 14, true);
  const localCompressedSize = view.getUint32(selected.localOffset + 18, true);
  const localUncompressedSize = view.getUint32(selected.localOffset + 22, true);
  const localNameLength = view.getUint16(selected.localOffset + 26, true);
  const localExtraLength = view.getUint16(selected.localOffset + 28, true);
  if (localFlags !== selected.flags || localMethod !== selected.method) throw new Error('ZIP local header disagrees with central directory');
  if (!(selected.flags & 8) && (localCrc !== selected.expectedCrc || localCompressedSize !== selected.compressedSize || localUncompressedSize !== selected.uncompressedSize)) {
    throw new Error('ZIP local header disagrees with central directory');
  }
  const dataStart = checkedRange(selected.localOffset + 30, localNameLength + localExtraLength, centralOffset, 'local name and extra data');
  const dataEnd = checkedRange(dataStart, selected.compressedSize, centralOffset, 'compressed data');
  let localName;
  try { localName = decoder.decode(bytes.subarray(selected.localOffset + 30, selected.localOffset + 30 + localNameLength)); }
  catch { throw new Error('ZIP local entry name is not valid UTF-8'); }
  if (localName !== selected.name) throw new Error('ZIP local entry name disagrees with central directory');
  const compressed = bytes.subarray(dataStart, dataEnd);
  let output;
  try {
    output = selected.method === 0 ? new Uint8Array(compressed) : new Uint8Array(Bun.inflateSync(compressed));
  } catch {
    throw new Error('ZIP deflate stream is malformed');
  }
  if (output.length !== selected.uncompressedSize) throw new Error('ZIP uncompressed size mismatch');
  if (crc32(output) !== selected.expectedCrc) throw new Error('ZIP CRC-32 mismatch');
  return output;
}

export async function extractRipgrep(bytes, asset) {
  if (!(bytes instanceof Uint8Array)) throw new Error('ripgrep archive must be bytes');
  if (!asset || typeof asset.entry !== 'string' || !safeArchivePath(asset.entry)) throw new Error('ripgrep asset entry is invalid');
  if (asset.name.endsWith('.zip')) return extractZip(bytes, asset.entry);
  if (!asset.name.endsWith('.tar.gz')) throw new Error(`Unsupported ripgrep archive: ${asset.name}`);
  let files;
  try { files = await new Bun.Archive(bytes).files(); }
  catch { throw new Error('ripgrep tar.gz archive is malformed'); }
  for (const name of files.keys()) {
    if (!safeArchivePath(name)) throw new Error(`Unsafe archive path: ${name}`);
  }
  const file = files.get(asset.entry);
  if (!file) throw new Error(`tar.gz is missing exact entry: ${asset.entry}`);
  if (file.size > MAX_BINARY_BYTES) throw new Error('ripgrep executable size exceeds the safety limit');
  return new Uint8Array(await file.arrayBuffer());
}

export function validateRipgrepVersion(path, spawnImpl = Bun.spawnSync) {
  const result = spawnImpl([path, '--version'], { stdout: 'pipe', stderr: 'pipe' });
  const output = typeof result.stdout === 'string' ? result.stdout : Buffer.from(result.stdout || []).toString();
  if (result.exitCode !== 0 || !/^ripgrep 15\.2\.0(?: \(rev [0-9A-Fa-f]+\))?(?:\r?\n|$)/.test(output)) {
    throw new Error(`ripgrep ${RIPGREP_VERSION} version smoke failed`);
  }
}

function assertContainedManagedPath(root, path) {
  const child = relative(resolve(root), resolve(path));
  if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error(`Managed ripgrep path escaped its root: ${path}`);
  }
}

function assertNotSymbolicLink(path, fsOps = {}) {
  const inspect = fsOps.lstatSync || lstatSync;
  try {
    if (inspect(path).isSymbolicLink()) throw new Error(`Managed ripgrep path must not be a symbolic link: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function isValidRipgrepCandidate(path, fsOps, spawnImpl) {
  if (!fsOps.existsSync(path)) return false;
  try {
    validateRipgrepVersion(path, spawnImpl);
    return true;
  } catch {
    return false;
  }
}

export function replaceManagedBinary(staged, target, fsOps = { existsSync, lstatSync, renameSync, rmSync }, spawnImpl = Bun.spawnSync) {
  const backup = `${target}.previous`;
  const displaced = `${target}.${process.pid}.current`;
  for (const path of [staged, target, backup, displaced]) assertNotSymbolicLink(path, fsOps);
  if (fsOps.existsSync(displaced)) throw new Error(`Managed ripgrep transaction path already exists: ${displaced}`);
  const currentValid = isValidRipgrepCandidate(target, fsOps, spawnImpl);
  const backupValid = isValidRipgrepCandidate(backup, fsOps, spawnImpl);
  let movedCurrent = false;
  try {
    if (fsOps.existsSync(target)) {
      fsOps.renameSync(target, displaced);
      movedCurrent = true;
    }
    try {
      fsOps.renameSync(staged, target);
    } catch (error) {
      if (fsOps.existsSync(target)) fsOps.rmSync(target, { force: true });
      if (currentValid && movedCurrent && fsOps.existsSync(displaced)) fsOps.renameSync(displaced, target);
      else if (backupValid && fsOps.existsSync(backup)) fsOps.renameSync(backup, target);
      if (fsOps.existsSync(backup)) fsOps.rmSync(backup, { force: true });
      if (fsOps.existsSync(displaced)) fsOps.rmSync(displaced, { force: true });
      throw error;
    }
    fsOps.rmSync(backup, { force: true });
    if (fsOps.existsSync(displaced)) fsOps.rmSync(displaced, { force: true });
  } finally {
    if (fsOps.existsSync(staged)) fsOps.rmSync(staged, { force: true });
  }
}

export async function ensureRipgrep(root, options = {}) {
  if (typeof root !== 'string' || !root.trim()) throw new Error('managed ripgrep root is required');
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const asset = selectRipgrepAsset(platform, arch);
  const vendorDir = join(root, 'vendor');
  const ripgrepDir = join(vendorDir, 'ripgrep');
  const binDir = join(ripgrepDir, 'bin');
  const target = join(binDir, platform === 'win32' ? 'rg.exe' : 'rg');
  const staged = platform === 'win32' ? `${target}.${process.pid}.staged.exe` : `${target}.${process.pid}.staged`;
  const backup = `${target}.previous`;
  const displaced = `${target}.${process.pid}.current`;
  const rootPath = resolve(root);
  const managedPaths = [vendorDir, ripgrepDir, binDir, target, staged, backup, displaced];
  for (const path of managedPaths) {
    assertContainedManagedPath(rootPath, path);
    assertNotSymbolicLink(path, options.fsOps);
  }
  const spawnImpl = options.spawnImpl || Bun.spawnSync;
  if (existsSync(target)) {
    try { validateRipgrepVersion(target, spawnImpl); return target; }
    catch {}
  }

  const fetchImpl = options.fetchImpl || fetch;
  const env = options.env || process.env;
  const url = `https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/${asset.name}`;
  const response = await fetchWithProxy(url, {}, env, fetchImpl);
  const archive = new Uint8Array(await response.arrayBuffer());
  const actual = new Bun.CryptoHasher('sha256').update(archive).digest('hex');
  if (actual !== asset.sha256) throw new Error(`SHA-256 mismatch for ${asset.name}`);
  const executable = await extractRipgrep(archive, asset);

  mkdirSync(binDir, { recursive: true });
  for (const path of managedPaths) assertNotSymbolicLink(path, options.fsOps);
  rmSync(staged, { force: true });
  try {
    await Bun.write(staged, executable);
    if (platform !== 'win32') chmodSync(staged, 0o755);
    validateRipgrepVersion(staged, spawnImpl);
    replaceManagedBinary(staged, target, options.fsOps, spawnImpl);
    return target;
  } finally {
    assertNotSymbolicLink(staged, options.fsOps);
    if (existsSync(staged)) rmSync(staged, { force: true });
  }
}

if (import.meta.main) {
  const root = process.argv[2];
  const target = await ensureRipgrep(root);
  console.log(`ripgrep ${RIPGREP_VERSION}: ${target}`);
}
INSTALL_RIPGREP_EOF
chmod 700 "$CLAWGOD_DIR/install-ripgrep.mjs"

cat > "$CLAWGOD_DIR/vendor-transaction.mjs" << 'VENDOR_TRANSACTION_EOF'
#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const VENDOR_PUBLISH_ROLLED_BACK = 20;
export const VENDOR_PUBLISH_CONFLICT = 21;
export const VENDOR_PUBLISH_ROLLED_BACK_RETAINED = 22;
const CONFLICT_EVIDENCE = 'vendor-rollback-conflict.json';
const ROOT_CONFLICT = Symbol('vendor-root-conflict');

function status(path) {
  try {
    const value = lstatSync(path);
    return {
      dev: value.dev,
      ino: value.ino,
      type: value.isDirectory() ? 'directory' : value.isSymbolicLink() ? 'symlink' : value.isFile() ? 'file' : 'other',
      mode: value.mode,
      nlink: value.nlink,
      ctimeMs: value.ctimeMs,
      mtimeMs: value.mtimeMs,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function sameIdentity(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino && left?.type === right?.type;
}

function rootConflictError(message, conflict) {
  const error = new Error(message);
  error.rootConflict = conflict;
  error[ROOT_CONFLICT] = true;
  return error;
}

function internalRootConflict(error) {
  return error?.[ROOT_CONFLICT] === true ? error.rootConflict : null;
}

function bindDirectory(path, label) {
  const identity = status(path);
  if (identity?.type !== 'directory') throw new Error(`vendor transaction: ${label} must be a real directory`);
  return { path, label, identity };
}

function verifyBinding(binding) {
  const actual = status(binding.path);
  if (!sameIdentity(actual, binding.identity)) {
    throw rootConflictError(
      `vendor transaction: ${binding.label} identity changed`,
      { root: binding.label, reason: 'root-identity-changed', expected: binding.identity, actual },
    );
  }
}

function strictDescendant(root, path, label) {
  const rootPath = resolve(root);
  const childPath = resolve(path);
  const child = relative(rootPath, childPath);
  if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error(`vendor transaction: ${label} must be inside transaction directory`);
  }
  return { rootPath, childPath, parts: child.split(sep) };
}

function bindDescendant(rootBinding, path, label, bindings = []) {
  verifyBinding(rootBinding);
  const { rootPath, parts } = strictDescendant(rootBinding.path, path, label);
  let current = rootPath;
  for (const part of parts) {
    current = join(current, part);
    bindings.push(bindDirectory(current, `${label} component ${part}`));
  }
  return bindings;
}

function verifyBoundRoots(roots, includeCandidate = true) {
  for (const binding of [roots.transaction, roots.liveParent, roots.live, roots.old]) {
    if (binding) verifyBinding(binding);
  }
  if (includeCandidate) for (const binding of roots.candidate) verifyBinding(binding);
  if (roots.ripgrepBound) {
    const ripgrep = status(join(roots.live.path, 'ripgrep'));
    if (!sameIdentity(ripgrep, roots.ripgrep)) {
      throw rootConflictError(
        'vendor transaction: managed ripgrep identity changed',
        { root: 'ripgrep', reason: 'managed-ripgrep-identity-changed', expected: roots.ripgrep, actual: ripgrep },
      );
    }
  }
}

function verifyRoots(roots, includeCandidate = true) {
  if (!roots.transaction || !roots.liveParent || !roots.live || !roots.old || !roots.ripgrepBound || roots.candidate.length === 0) {
    throw new Error('vendor transaction: root binding set is incomplete');
  }
  verifyBoundRoots(roots, includeCandidate);
}

function collectRootConflicts(roots, includeCandidate = true) {
  const conflicts = [];
  try {
    verifyRoots(roots, includeCandidate);
  } catch (error) {
    conflicts.push(internalRootConflict(error) || { root: 'unknown', reason: 'root-validation-failed', error: String(error) });
  }
  return conflicts;
}

function candidateOwnedRoot(root) {
  return root?.startsWith('candidate vendor component ');
}

function transactionOwnedRoot(root) {
  return root === 'old vendor' || candidateOwnedRoot(root);
}

function assessPreMutationRollback(roots, cause) {
  const conflicts = [];
  let rollbackComplete = true;
  let cleanupAllowed = true;

  const record = (error, fallbackRoot, owned) => {
    const conflict = internalRootConflict(error) || { root: fallbackRoot, reason: 'root-validation-failed', error: String(error) };
    if (!conflicts.some(existing => existing.root === conflict.root && existing.reason === conflict.reason)) conflicts.push(conflict);
    cleanupAllowed = false;
    if (!owned) rollbackComplete = false;
  };
  const verify = (binding, owned = false) => {
    if (!binding) return true;
    try {
      verifyBinding(binding);
      return true;
    } catch (error) {
      record(error, binding.label, owned);
      return false;
    }
  };

  const verifyPass = () => {
    if (!verify(roots.transaction)) return;
    let candidateParentTrusted = true;
    for (const binding of roots.candidate) {
      if (!candidateParentTrusted) break;
      candidateParentTrusted = verify(binding, true);
    }
    verify(roots.old, true);

    const liveParentTrusted = verify(roots.liveParent);
    const liveTrusted = liveParentTrusted && verify(roots.live);
    if (liveTrusted && roots.ripgrepBound) {
      try {
        const actual = status(join(roots.live.path, 'ripgrep'));
        if (!sameIdentity(actual, roots.ripgrep)) {
          throw rootConflictError(
            'vendor transaction: managed ripgrep identity changed',
            { root: 'ripgrep', reason: 'managed-ripgrep-identity-changed', expected: roots.ripgrep, actual },
          );
        }
      } catch (error) {
        record(error, 'ripgrep', false);
      }
    }

    const finalLiveParentTrusted = verify(roots.liveParent);
    if (finalLiveParentTrusted) verify(roots.live);
    verify(roots.transaction);
  };

  if (!roots.transaction) {
    record(new Error('transaction root was not trusted'), 'transaction', false);
  } else {
    verifyPass();
    verifyPass();
  }

  const causeConflict = internalRootConflict(cause);
  if (causeConflict && !conflicts.some(conflict =>
    conflict.root === causeConflict.root && conflict.reason === causeConflict.reason)) {
    conflicts.push(causeConflict);
    cleanupAllowed = false;
    if (!transactionOwnedRoot(causeConflict.root)) rollbackComplete = false;
  }
  if (conflicts.length > 0) writeEvidence(roots, cause, conflicts);
  return { rollbackComplete, cleanupAllowed };
}

function boundEntries(binding, roots, skipRipgrep = false, includeCandidate = true) {
  verifyRoots(roots, includeCandidate);
  if (binding.identity === null) return [];
  const names = readdirSync(binding.path).filter(name => !skipRipgrep || name !== 'ripgrep').sort();
  verifyRoots(roots, includeCandidate);
  return names;
}

function moveAndRecord(source, destination, name) {
  const identity = status(join(source, name));
  renameSync(join(source, name), join(destination, name));
  return { name, identity };
}

function writeEvidence(roots, cause, conflicts) {
  try {
    verifyBinding(roots.transaction);
    writeFileSync(join(roots.transaction.path, CONFLICT_EVIDENCE), JSON.stringify({
      cause: cause instanceof Error ? cause.message : String(cause),
      conflicts,
    }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    verifyBinding(roots.transaction);
  } catch {
    // A replaced transaction root is not a safe evidence destination.
  }
}

function transactionCleanupSafe(roots, candidateVendor, oldVendor) {
  let pathShapeSafe = true;
  let cleanupCause;
  try {
    const transaction = roots.transaction;
    verifyBinding(transaction);
    const { rootPath, parts } = strictDescendant(transaction.path, candidateVendor, 'candidate vendor');
    let current = rootPath;
    for (const part of parts) {
      current = join(current, part);
      if (status(current)?.type === 'symlink') {
        pathShapeSafe = false;
        break;
      }
    }
    if (status(oldVendor)?.type === 'symlink') pathShapeSafe = false;
  } catch (error) {
    pathShapeSafe = false;
    cleanupCause = error;
  }
  const assessment = assessPreMutationRollback(
    roots,
    cleanupCause || new Error('vendor transaction: cleanup root validation failed'),
  );
  return {
    rollbackComplete: assessment.rollbackComplete,
    cleanupSafe: pathShapeSafe && assessment.cleanupAllowed,
  };
}

function rollback({ roots, published, oldEntries, cause }) {
  const conflicts = collectRootConflicts(roots);
  const criticalRoots = new Set(['transaction', 'live vendor parent', 'live vendor', 'old vendor']);
  let canMutate = !conflicts.some(conflict => criticalRoots.has(conflict.root));
  let failed;

  if (canMutate) {
    const failedPath = join(roots.transaction.path, 'failed-vendor');
    try {
      if (status(failedPath) !== null) throw new Error('failed vendor path already exists');
      mkdirSync(failedPath);
      failed = bindDirectory(failedPath, 'failed vendor');
    } catch (error) {
      conflicts.push({ root: 'failed vendor', reason: 'failed-vendor-setup-failed', error: String(error) });
      canMutate = false;
    }
  }

  const verifyRollbackRoots = () => {
    verifyRoots(roots, false);
    verifyBinding(failed);
  };

  if (canMutate) {
    for (const entry of published.toReversed()) {
      try {
        verifyRollbackRoots();
        const livePath = join(roots.live.path, entry.name);
        const liveIdentity = status(livePath);
        if (liveIdentity === null) continue;
        // dev+ino 在 inode 回收复用（tmpfs/ext4 均可能）下会把替换对象误判为
        // 原对象；mtime 跨平台 rename 不变、对象替换后必然变化，作为身份佐证
        // （ctime 不可用：APFS 的 rename 会更新 ctime，ext4 不会，语义不一致）。
        if (!sameIdentity(liveIdentity, entry.identity)
          || liveIdentity.mtimeMs !== entry.identity.mtimeMs) {
          conflicts.push({ entry: entry.name, reason: 'published-entry-identity-changed', expected: entry.identity, actual: liveIdentity });
          continue;
        }
        renameSync(livePath, join(failed.path, entry.name));
        verifyRollbackRoots();
      } catch (error) {
        conflicts.push(internalRootConflict(error) || { entry: entry.name, reason: 'could-not-isolate-published-entry', error: String(error) });
        canMutate = false;
        break;
      }
    }
  }

  if (canMutate) {
    for (const entry of oldEntries) {
      try {
        verifyRollbackRoots();
        const source = join(roots.old.path, entry.name);
        const destination = join(roots.live.path, entry.name);
        if (status(source) === null) {
          if (!sameIdentity(status(destination), entry.identity)) conflicts.push({ entry: entry.name, reason: 'old-entry-not-restored' });
          continue;
        }
        if (status(destination) !== null) {
          conflicts.push({ entry: entry.name, reason: 'old-entry-destination-occupied', actual: status(destination) });
          continue;
        }
        renameSync(source, destination);
        verifyRollbackRoots();
        if (!sameIdentity(status(destination), entry.identity)) conflicts.push({ entry: entry.name, reason: 'old-entry-identity-changed' });
      } catch (error) {
        conflicts.push(internalRootConflict(error) || { entry: entry.name, reason: 'could-not-restore-old-entry', error: String(error) });
        canMutate = false;
        break;
      }
    }
  }

  conflicts.push(...collectRootConflicts(roots));
  if (conflicts.every(conflict => candidateOwnedRoot(conflict.root))) {
    try {
      const expectedNames = [
        ...oldEntries.map(entry => entry.name),
        ...(roots.ripgrep === null ? [] : ['ripgrep']),
      ].toSorted();
      const actualNames = boundEntries(roots.live, roots, false, false).toSorted();
      if (!actualNames.every((name, index) => name === expectedNames[index]) || actualNames.length !== expectedNames.length) {
        conflicts.push({ root: 'live vendor entries', reason: 'live-entry-set-changed', expected: expectedNames, actual: actualNames });
      }
    } catch (error) {
      conflicts.push(internalRootConflict(error) || { root: 'live vendor entries', reason: 'live-entry-validation-failed', error: String(error) });
    }
  }
  const rollbackComplete = conflicts.every(conflict => candidateOwnedRoot(conflict.root));
  if (conflicts.length > 0) writeEvidence(roots, cause, conflicts);
  return rollbackComplete;
}

export function publishVendorTransaction({ liveVendor, candidateVendor, transactionDir, afterPublish, validatePublished }) {
  const oldVendor = join(transactionDir, 'old-vendor');
  const oldEntries = [];
  const published = [];
  let mutationStarted = false;
  const roots = {
    transaction: null,
    liveParent: null,
    live: null,
    candidate: [],
    old: null,
    ripgrep: undefined,
    ripgrepBound: false,
  };

  try {
    roots.transaction = bindDirectory(transactionDir, 'transaction');
    roots.liveParent = bindDirectory(dirname(liveVendor), 'live vendor parent');
    roots.live = bindDirectory(liveVendor, 'live vendor');
    roots.ripgrep = status(join(liveVendor, 'ripgrep'));
    roots.ripgrepBound = true;
    bindDescendant(roots.transaction, candidateVendor, 'candidate vendor', roots.candidate);
    if (status(oldVendor) !== null) throw new Error('vendor transaction: old vendor path must not already exist');
    mkdirSync(oldVendor);
    roots.old = bindDirectory(oldVendor, 'old vendor');

    const candidateRoot = roots.candidate.at(-1);
    if (boundEntries(candidateRoot, roots).includes('ripgrep')) {
      throw new Error('vendor transaction: candidate must not contain managed ripgrep');
    }
    for (const name of boundEntries(roots.live, roots, true)) {
      verifyRoots(roots);
      const entry = moveAndRecord(roots.live.path, roots.old.path, name);
      mutationStarted = true;
      oldEntries.push(entry);
      verifyRoots(roots);
    }
    for (const name of boundEntries(candidateRoot, roots)) {
      verifyRoots(roots);
      const entry = moveAndRecord(candidateRoot.path, roots.live.path, name);
      mutationStarted = true;
      published.push(entry);
      verifyRoots(roots);
      afterPublish?.({ ...entry, path: join(roots.live.path, name), publishedCount: published.length });
      verifyRoots(roots);
    }
    verifyRoots(roots);
    validatePublished?.();
    verifyRoots(roots);
  } catch (cause) {
    let rollbackComplete = false;
    let cleanupAllowed = true;
    if (!mutationStarted) {
      const assessment = assessPreMutationRollback(roots, cause);
      rollbackComplete = assessment.rollbackComplete;
      cleanupAllowed = assessment.cleanupAllowed;
    } else {
      rollbackComplete = rollback({ roots, published, oldEntries, cause });
    }
    let cleanupSafe = false;
    if (rollbackComplete && cleanupAllowed) {
      const cleanup = transactionCleanupSafe(roots, candidateVendor, oldVendor);
      rollbackComplete = cleanup.rollbackComplete;
      cleanupSafe = cleanup.cleanupSafe;
    }
    const error = new Error(`vendor transaction: publish failed; rollback ${rollbackComplete ? 'complete' : 'conflicted'}: ${cause instanceof Error ? cause.message : String(cause)}`);
    error.cause = cause;
    error.rollbackComplete = rollbackComplete;
    error.cleanupSafe = cleanupSafe;
    throw error;
  }
}

function boundedDiagnostic(stdout, stderr) {
  const output = `${stdout || ''}${stderr || ''}`;
  let bytes = 0;
  let chars = 0;
  for (const char of output) {
    const next = bytes + Buffer.byteLength(char);
    if (next > 64 * 1024) break;
    bytes = next;
    chars += char.length;
  }
  return output.slice(0, chars);
}

function validateRuntime(bun, cli) {
  const result = spawnSync(bun, [cli, '--version'], { encoding: 'utf8', env: process.env });
  const diagnostic = boundedDiagnostic(result.stdout, result.stderr);
  let reason;
  if (result.error) reason = result.error.message;
  else if (result.signal) reason = `terminated by signal ${result.signal}`;
  else if (result.status === null) reason = 'returned no exit status';
  else if (result.status !== 0) reason = `exited ${result.status}`;
  if (!reason) return;
  throw new Error(`vendor transaction: runtime sanity check failed (${reason})${diagnostic ? `:
${diagnostic}` : ''}`);
}

if (import.meta.main) {
  const [command, liveVendor, candidateVendor, transactionDir, bun, cli] = process.argv.slice(2);
  const checked = command === 'publish-checked';
  if ((command !== 'publish' && !checked)
    || !liveVendor || !candidateVendor || !transactionDir || (checked && (!bun || !cli))) {
    process.stderr.write(`usage: ${basename(process.argv[1])} publish <live-vendor> <candidate-vendor> <transaction-dir>
       ${basename(process.argv[1])} publish-checked <live-vendor> <candidate-vendor> <transaction-dir> <bun> <cli>` + '\n');
    process.exit(2);
  }
  try {
    publishVendorTransaction({
      liveVendor,
      candidateVendor,
      transactionDir,
      validatePublished: checked ? () => validateRuntime(bun, cli) : undefined,
    });
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
    process.exit(error?.rollbackComplete
      ? error.cleanupSafe ? VENDOR_PUBLISH_ROLLED_BACK : VENDOR_PUBLISH_ROLLED_BACK_RETAINED
      : VENDOR_PUBLISH_CONFLICT);
  }
}
VENDOR_TRANSACTION_EOF
chmod 700 "$CLAWGOD_DIR/vendor-transaction.mjs"

if RIPGREP_OUTPUT=$("$BUN_BIN" "$CLAWGOD_DIR/install-ripgrep.mjs" "$CLAWGOD_DIR" 2>&1); then
  info "$RIPGREP_OUTPUT"
else
  warn "Failed to install ClawGod-managed ripgrep."
  [ -n "${RIPGREP_OUTPUT:-}" ] && warn "$RIPGREP_OUTPUT"
  exit 1
fi

install_chrome_fix_script() {
  local dst="$CLAWGOD_DIR/apply-claude-code-chrome-fix.sh"
  local local_src=""
  if [ -f "./apply-claude-code-chrome-fix.sh" ]; then
    local_src="./apply-claude-code-chrome-fix.sh"
  else
    case "${BASH_SOURCE[0]:-}" in
      */*) local_src="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)/apply-claude-code-chrome-fix.sh" ;;
    esac
  fi

  if [ -n "$local_src" ] && [ -f "$local_src" ]; then
    cp "$local_src" "$dst"
  elif "$BUN_BIN" "$CLAWGOD_DIR/fetch-file.mjs" "https://raw.githubusercontent.com/A6083450/clawgod-plus/main/dist/unix/apply-claude-code-chrome-fix.sh" "$dst"; then
    :
  else
    return 1
  fi
  chmod +x "$dst"
}

run_claude_code_chrome_fix() {
  # v2.1.245+ ships a code-split ESM bundle (entry + chunks/). The Chrome
  # socket/subscription patches are already applied by the universal patcher
  # against the concatenated bundle, so this legacy single-file helper would
  # only report NOT_FOUND. Skip it to avoid the misleading error.
  if [ -d "$CLAWGOD_DIR/chunks" ]; then
    info "Chrome fix already covered by patcher (code-split bundle); skipping"
    return 0
  fi

  local script="$CLAWGOD_DIR/apply-claude-code-chrome-fix.sh"
  if [ ! -x "$script" ]; then
    if ! install_chrome_fix_script; then
      warn "Claude in Chrome post-install fix script not available; skipping"
      return 0
    fi
  fi

  dim "Applying Claude Code Chrome post-install fix ..."
  local output rc
  rc=0
  output=$("$script" "$CLAWGOD_DIR/cli.original.cjs" 2>&1) || rc=$?
  while IFS= read -r line; do
    echo "  $line"
  done <<< "$output"
  if [ "$rc" -eq 0 ]; then
    info "Claude Code Chrome post-install fix applied"
  else
    warn "Claude Code Chrome post-install fix did not apply; ClawGod Plus core install will continue"
  fi
}

# ─── Handle --no-upgrade (skip download, re-patch only) ──────────────
mkdir -p "$CLAWGOD_DIR" "$BIN_DIR"

RUNTIME_TRANSACTION_DIR=""
RUNTIME_TRANSACTION_ACTIVE=0
RUNTIME_HAD_TARGET=0
RUNTIME_HAD_SOURCE_VERSION=0
RUNTIME_HAD_CHUNKS=0
RUNTIME_HAD_PATCH_FALLBACK=0
RUNTIME_HAS_CANDIDATE_VENDOR=0
RUNTIME_VENDOR_PUBLISH_STARTED=0
RUNTIME_VENDOR_ROLLBACK_COMPLETE=0
RUNTIME_TRANSACTION_CLEANUP_SAFE=1

rollback_runtime_transaction() {
  [ "$RUNTIME_TRANSACTION_ACTIVE" = "1" ] || return 0
  if [ "$RUNTIME_VENDOR_PUBLISH_STARTED" = "1" ] && [ "$RUNTIME_VENDOR_ROLLBACK_COMPLETE" != "1" ]; then
    RUNTIME_TRANSACTION_ACTIVE=0
    printf '%s\n' "clawgod: vendor rollback conflict; prior CLI was not restored; recovery data retained at $RUNTIME_TRANSACTION_DIR" >&2
    return 0
  fi
  if [ "$RUNTIME_HAD_TARGET" = "1" ]; then
    cp -p "$RUNTIME_TRANSACTION_DIR/cli.original.cjs" "$CLAWGOD_DIR/cli.original.cjs" 2>/dev/null || true
  else
    rm -f "$CLAWGOD_DIR/cli.original.cjs" 2>/dev/null || true
  fi
  if [ "$RUNTIME_HAD_SOURCE_VERSION" = "1" ]; then
    cp -p "$RUNTIME_TRANSACTION_DIR/.source-version" "$CLAWGOD_DIR/.source-version" 2>/dev/null || true
  else
    rm -f "$CLAWGOD_DIR/.source-version" 2>/dev/null || true
  fi
  if [ "$RUNTIME_HAD_CHUNKS" = "1" ]; then
    rm -rf "$CLAWGOD_DIR/chunks" 2>/dev/null || true
    mv "$RUNTIME_TRANSACTION_DIR/chunks" "$CLAWGOD_DIR/chunks" 2>/dev/null || true
  else
    rm -rf "$CLAWGOD_DIR/chunks" 2>/dev/null || true
  fi
  if [ "$RUNTIME_HAD_PATCH_FALLBACK" = "1" ]; then
    cp -p "$RUNTIME_TRANSACTION_DIR/patch-fallback.json" "$CLAWGOD_DIR/patch-fallback.json" 2>/dev/null || true
  else
    rm -f "$CLAWGOD_DIR/patch-fallback.json" 2>/dev/null || true
  fi
  RUNTIME_TRANSACTION_ACTIVE=0
  if [ "$RUNTIME_TRANSACTION_CLEANUP_SAFE" = "1" ]; then
    rm -rf "$RUNTIME_TRANSACTION_DIR" 2>/dev/null || true
  else
    printf '%s\n' "clawgod: prior CLI restored; untrusted transaction data retained at $RUNTIME_TRANSACTION_DIR" >&2
  fi
}

warn_bun_canary_guidance() {
  echo ""
  warn "Bun $("$BUN_BIN" --version) cannot load Anthropic's cli.original.cjs."
  warn ""
  warn "  Anthropic builds with Bun's canary channel (currently ~1.3.14), while"
  warn "  bun.sh's main download is on stable (currently 1.3.13). The canary build"
  warn "  is NOT visible on bun.sh's download page — it lives on GitHub Releases"
  warn "  and is reachable only via 'bun upgrade --canary'."
  warn ""
  warn "  If your bun is from bun.sh:"
  warn "    bun upgrade --canary"
  warn ""
  warn "  If your bun is from a package manager (brew/apt/scoop) where the binary"
  warn "  is behind a shim and refuses to self-replace ('bun upgrade' silently"
  warn "  hangs or no-ops):"
  warn "    <pkg-manager> uninstall bun"
  warn "    curl -fsSL https://bun.sh/install | bash"
  warn "    bun upgrade --canary"
  warn ""
  warn "  Then re-run install.sh — this sanity check will pass."
}

verify_runtime() {
  dim "Verifying Bun can load patched cli.original.cjs ..."
  sanity_status=0
  set +e
  sanity_out=$("$BUN_BIN" "$CLAWGOD_DIR/cli.cjs" --version 2>&1)
  sanity_status=$?
  set -e
  if echo "$sanity_out" | grep -q "Expected CommonJS module to have a function wrapper"; then
    warn_bun_canary_guidance
    if [ "$sanity_status" -eq 0 ]; then sanity_status=1; fi
    return "$sanity_status"
  fi
  if [ "$sanity_status" -ne 0 ]; then
    [ -n "$sanity_out" ] && printf '%s\n' "$sanity_out" >&2
    err "Bun failed to load patched cli.original.cjs (exit $sanity_status)."
    return "$sanity_status"
  fi
  info "Bun loads cli.original.cjs"
}

commit_runtime_transaction() {
  if [ "$RUNTIME_HAS_CANDIDATE_VENDOR" = "1" ]; then
    RUNTIME_VENDOR_PUBLISH_STARTED=1
    vendor_status=0
    vendor_output=$("$BUN_BIN" "$CLAWGOD_DIR/vendor-transaction.mjs" publish-checked "$CLAWGOD_DIR/vendor" "$RUNTIME_TRANSACTION_DIR/candidate/vendor" "$RUNTIME_TRANSACTION_DIR" "$BUN_BIN" "$CLAWGOD_DIR/cli.cjs" 2>&1) || vendor_status=$?
    [ -n "$vendor_output" ] && printf '%s\n' "$vendor_output" >&2
    if [ "$vendor_status" -ne 0 ]; then
      if echo "$vendor_output" | grep -q "Expected CommonJS module to have a function wrapper"; then
        warn_bun_canary_guidance
      fi
      if [ "$vendor_status" -eq 20 ] || [ "$vendor_status" -eq 22 ]; then
        RUNTIME_VENDOR_ROLLBACK_COMPLETE=1
        [ "$vendor_status" -eq 22 ] && RUNTIME_TRANSACTION_CLEANUP_SAFE=0
      fi
      return "$vendor_status"
    fi
  else
    verify_runtime || return $?
  fi
  RUNTIME_TRANSACTION_ACTIVE=0
  rm -rf "$RUNTIME_TRANSACTION_DIR"
  trap - EXIT
}

RUNTIME_TRANSACTION_DIR=$(mktemp -d "$CLAWGOD_DIR/.runtime-rollback.XXXXXX")
chmod 700 "$RUNTIME_TRANSACTION_DIR"
if [ -f "$CLAWGOD_DIR/cli.original.cjs" ]; then
  cp -p "$CLAWGOD_DIR/cli.original.cjs" "$RUNTIME_TRANSACTION_DIR/cli.original.cjs"
  RUNTIME_HAD_TARGET=1
fi
if [ -f "$CLAWGOD_DIR/.source-version" ]; then
  cp -p "$CLAWGOD_DIR/.source-version" "$RUNTIME_TRANSACTION_DIR/.source-version"
  RUNTIME_HAD_SOURCE_VERSION=1
fi
if [ -f "$CLAWGOD_DIR/patch-fallback.json" ]; then
  cp -p "$CLAWGOD_DIR/patch-fallback.json" "$RUNTIME_TRANSACTION_DIR/patch-fallback.json"
  RUNTIME_HAD_PATCH_FALLBACK=1
fi
RUNTIME_TRANSACTION_ACTIVE=1
trap 'rollback_runtime_transaction' EXIT
if [ -d "$CLAWGOD_DIR/chunks" ]; then
  mv "$CLAWGOD_DIR/chunks" "$RUNTIME_TRANSACTION_DIR/chunks"
  RUNTIME_HAD_CHUNKS=1
fi

if [ "$NO_UPGRADE" = "1" ]; then
  if [ ! -f "$CLAWGOD_DIR/cli.original.cjs" ]; then
    warn "--no-upgrade requires an existing installation."
    warn "Run a full install first (without --no-upgrade)."
    exit 1
  fi
  if [ -f "$CLAWGOD_DIR/cli.original.cjs.bak" ]; then
    cp "$CLAWGOD_DIR/cli.original.cjs.bak" "$CLAWGOD_DIR/cli.original.cjs"
    info "Restored clean cli.original.cjs from backup"
  fi
  if [ -d "$CLAWGOD_DIR/chunks.bak" ]; then
    rm -rf "$CLAWGOD_DIR/chunks"
    cp -R "$CLAWGOD_DIR/chunks.bak" "$CLAWGOD_DIR/chunks"
    info "Restored clean chunks from backup"
  fi
  info "Skipping download (--no-upgrade)"
else

# A full reinstall replaces cli.original.cjs + chunks with a freshly-extracted
# bundle. Drop any .bak left over from a previous Claude Code version so the
# patcher backs up this version's clean bundle instead of a stale one
# (--no-upgrade restores from .bak and would otherwise mix versions).
rm -f "$CLAWGOD_DIR/cli.original.cjs.bak"
rm -rf "$CLAWGOD_DIR/chunks.bak"

# ─── Locate native Bun binary (cli.js source) ──────────────────────────
# v2.1.113+ ships a Bun standalone executable as the only canonical form.
# We extract cli.js text from this binary, patch it, then run via Bun
# runtime. Source: npm registry (@anthropic-ai/claude-code-<platform>).
# Local binary detection is intentionally skipped — see policy note below.

mkdir -p "$CLAWGOD_DIR" "$BIN_DIR"

if install_chrome_fix_script; then
  info "Chrome fix helper installed (apply-claude-code-chrome-fix.sh)"
else
  warn "Could not install Chrome fix helper; will try again after patching"
fi

NATIVE_BIN=""
NATIVE_BIN_LABEL=""
NATIVE_BIN_TMPDIR=""

# Detection policy: ALWAYS pull from the npm registry @latest.
#
# Earlier versions of this script also probed local `node_modules` roots
# (npm-global, bun-global) before falling back to the registry. That was
# a stale-source trap: once clawgod is installed it patches out
# `claude update`, so users never re-run `npm install -g` / `bun add -g`.
# Both directories freeze at whatever version was on disk the day clawgod
# was first installed, and `claude update` (which is now redirected here)
# would re-detect that frozen binary forever — never reaching the
# registry. See INCIDENT_LOG 2026-04-29 entry. The fix is to skip local
# detection entirely; the registry tarball is fetched once per upgrade.

# Detect platform suffix (used by the npm fetch below)
case "$(uname -s)" in
  Darwin) os="darwin" ;;
  Linux)  os="linux" ;;
  *)      os="" ;;
esac
case "$(uname -m)" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64)  arch="x64" ;;
  *)             arch="" ;;
esac
if [ "$os" = "linux" ] && (ldd /bin/ls 2>/dev/null | grep -q musl); then
  PLATFORM="${os}-${arch}-musl"
else
  PLATFORM="${os}-${arch}"
fi

# Pull the Bun standalone binary from the npm registry. Anthropic publishes
# per-platform packages (e.g. claude-code-darwin-arm64); their tarball ships
# the binary directly under package/.
if [ -z "$NATIVE_BIN" ]; then
  if [ -z "$os" ] || [ -z "$arch" ]; then
    warn "Unsupported platform: $(uname -s) $(uname -m)"
    exit 1
  fi
  NPM_PKG="@anthropic-ai/claude-code-${PLATFORM}"
  dim "Fetching $NPM_PKG@$VERSION from npm registry ..."
  NATIVE_BIN_TMPDIR=$(mktemp -d)
  FETCH_SCRIPT="$NATIVE_BIN_TMPDIR/fetch-package.mjs"
  cat > "$FETCH_SCRIPT" << 'FETCH_PACKAGE_EOF'
#!/usr/bin/env bun
import { chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export { fetchWithProxy, parseMacOSProxySettings, proxyFor, readMacOSSystemProxy } from './proxy-fetch.mjs';
import { fetchWithProxy } from './proxy-fetch.mjs';

const MIN_BINARY_BYTES = 10 * 1024 * 1024;

async function checkedJson(response) {
  try {
    return await response.json();
  } catch {
    throw new Error('Registry returned invalid JSON');
  }
}

function objectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function supportedIntegrity(value) {
  return typeof value === 'string' && /^sha512-[A-Za-z0-9+/]{86}==$/.test(value);
}

function httpTarball(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function resolvePackage(pkg, requested, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const env = options.env || process.env;
  const metadataUrl = `https://registry.npmjs.org/${encodeURIComponent(pkg)}`;
  const metadata = await checkedJson(await fetchWithProxy(metadataUrl, {}, env, fetchImpl));
  if (!objectRecord(metadata)) throw new Error('Registry metadata must be an object');
  if (!objectRecord(metadata.versions)) throw new Error('Registry versions must be an object');
  const version = requested === 'latest' ? metadata['dist-tags']?.latest : requested;
  if (typeof version !== 'string' || !version.trim()) throw new Error('Resolved version must be a non-empty string');
  if (!Object.hasOwn(metadata.versions, version)) throw new Error(`Package version not found: ${pkg}@${version}`);
  const manifest = metadata.versions[version];
  if (!objectRecord(manifest)) throw new Error('Registry manifest must be an object');
  if (manifest.name !== pkg) throw new Error('Registry manifest name must match the requested package');
  if (manifest.version !== version) throw new Error('Registry manifest version must match the resolved version');
  const dist = manifest.dist;
  if (!objectRecord(dist)) throw new Error('Registry dist must be an object');
  if (!supportedIntegrity(dist.integrity)) throw new Error('Registry integrity must be a supported SHA-512 string');
  if (!httpTarball(dist.tarball)) throw new Error('Registry tarball must be an HTTP(S) URL');
  return { version, dist };
}

function parseSpec(spec) {
  const separator = spec.lastIndexOf('@');
  if (separator > 0) {
    return { pkg: spec.slice(0, separator), requested: spec.slice(separator + 1) || 'latest' };
  }
  return { pkg: spec, requested: 'latest' };
}

function safeArchivePath(name) {
  if (!name || name.startsWith('/') || name.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(name)) return false;
  return !name.split(/[\\/]/).includes('..');
}

export async function installPackage(spec, outDir, options = {}) {
  const { pkg, requested } = parseSpec(spec);
  const fetchImpl = options.fetchImpl || fetch;
  const env = options.env || process.env;
  const { version, dist } = await resolvePackage(pkg, requested, { fetchImpl, env });
  if (!dist.tarball || typeof dist.integrity !== 'string') throw new Error(`Missing distribution metadata for ${pkg}@${version}`);

  const archiveResponse = await fetchWithProxy(dist.tarball, {}, env, fetchImpl);
  const bytes = new Uint8Array(await archiveResponse.arrayBuffer());
  const integrityMatch = /^sha512-([A-Za-z0-9+/]+={0,2})$/.exec(dist.integrity);
  if (!integrityMatch) throw new Error(`Unsupported integrity for ${pkg}@${version}`);
  const actual = new Bun.CryptoHasher('sha512').update(bytes).digest('base64');
  if (actual !== integrityMatch[1]) throw new Error(`Integrity mismatch for ${pkg}@${version}`);

  const files = await new Bun.Archive(bytes).files();
  for (const name of files.keys()) {
    if (!safeArchivePath(name)) throw new Error(`Unsafe archive path: ${name}`);
  }

  const packagePath = 'package/package.json';
  const binaryName = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const binaryEntryPath = `package/${binaryName}`;
  const packageFile = files.get(packagePath);
  const binaryFile = files.get(binaryEntryPath);
  if (!packageFile) throw new Error(`Archive is missing ${packagePath}`);
  if (!binaryFile) throw new Error(`Archive is missing ${binaryEntryPath}`);
  if (binaryFile.size <= MIN_BINARY_BYTES) throw new Error(`Archive binary is too small: ${binaryEntryPath}`);

  const packageDir = join(outDir, 'package');
  const binaryPath = join(packageDir, binaryName);
  mkdirSync(packageDir, { recursive: true });
  await Bun.write(join(packageDir, 'package.json'), packageFile);
  await Bun.write(binaryPath, binaryFile);
  if (process.platform !== 'win32') chmodSync(binaryPath, 0o755);
  return { version, binaryPath };
}

if (import.meta.main) {
  const [spec, outDir] = process.argv.slice(2);
  if (!spec || !outDir) throw new Error('usage: fetch-package.mjs <package@version> <output-directory>');
  const result = await installPackage(spec, outDir);
  console.log(`VERSION=${result.version}`);
}
FETCH_PACKAGE_EOF
  cp "$CLAWGOD_DIR/proxy-fetch.mjs" "$NATIVE_BIN_TMPDIR/proxy-fetch.mjs"
  chmod 700 "$FETCH_SCRIPT" "$NATIVE_BIN_TMPDIR/proxy-fetch.mjs"

  if FETCH_OUTPUT=$("$BUN_BIN" "$FETCH_SCRIPT" "$NPM_PKG@$VERSION" "$NATIVE_BIN_TMPDIR" 2>&1); then
    printf '%s\n' "$FETCH_OUTPUT" | while IFS= read -r line; do dim "$line"; done
    cand="$NATIVE_BIN_TMPDIR/package/claude"
    if [ -f "$cand" ]; then
      sz=$(stat -f%z "$cand" 2>/dev/null || stat -c%s "$cand" 2>/dev/null || echo 0)
      if [ "$sz" -gt 10000000 ]; then
        NATIVE_BIN="$cand"
        NATIVE_BIN_LABEL=$(printf '%s\n' "$FETCH_OUTPUT" | sed -n 's/^VERSION=//p' | head -1)
      fi
    fi
  fi
  if [ -z "$NATIVE_BIN" ]; then
    rm -rf "$NATIVE_BIN_TMPDIR"
    warn "Failed to download $NPM_PKG from the npm registry."
    [ -n "${FETCH_OUTPUT:-}" ] && warn "$FETCH_OUTPUT"
    warn "  Install the official Claude Code binary manually:"
    warn "    curl -fsSL https://claude.ai/install.sh | bash"
    exit 1
  fi
  info "Downloaded $NPM_PKG@$NATIVE_BIN_LABEL"
fi

if [ -z "$NATIVE_BIN" ]; then
  warn "Native Claude Code binary not found"
  warn "Install the official binary first:"
  warn "  curl -fsSL https://claude.ai/install.sh | bash"
  warn "Then re-run this script."
  exit 1
fi

# Write extractor to a temp file (used both for cli.js and .node modules)
cat > "$CLAWGOD_DIR/extract-natives.mjs" << 'EXTRACTOR_EOF'
#!/usr/bin/env bun
/**
 * ClawGod Plus Bun section extractor
 *
 * Parses the .bun (PE/ELF) or __BUN,__bun (Mach-O) section embedded in a
 * Bun standalone executable, walks the module graph, and extracts:
 *   - the entry-point module      → <out>/cli.original.js
 *   - every loader=napi module    → <out>/vendor/<name>/<arch>-<os>/<name>.node
 *
 * Everything else is dropped (e.g. auto-generated *.js napi shims aren't
 * needed because cli.js already inlines the require('/$bunfs/root/X.node')
 * calls that post-process.mjs rewrites to the vendor lookup).
 *
 * Adapted from /home/kaiju/code/python/parse-bun/main.js (which itself
 * implements the format documented in docs/bun-section-format.md). Lazy
 * Bun.file reads were replaced with readFileSync so the script runs under
 * the existing Bun invocation in install.sh / install.ps1.
 *
 * Usage:
 *   bun extract-natives.mjs <binary-path> <output-dir>
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

// ─── Format constants ────────────────────────────────────────────────

const TRAILER             = Buffer.from('\n---- Bun! ----\n');
const BUN_SECTION_NAME    = '.bun';
const OFFSET_STRUCT_SIZE  = 32;
const MODULE_RECORD_SIZE  = 52;

// loader id → name (subset; only `napi` is acted on, rest informational)
const LOADERS = {
  0:'jsx', 1:'js', 2:'ts', 3:'tsx', 4:'css', 5:'file', 6:'json', 7:'jsonc',
  8:'toml', 9:'wasm', 10:'napi', 11:'base64', 12:'dataurl', 13:'text',
  14:'bunsh', 15:'sqlite', 16:'sqlite_embedded', 17:'html', 18:'yaml',
  19:'json5', 20:'md',
};

// ELF
const ELF_MAGIC_LE          = 0x464c457f; // "\x7fELF" LE u32
const ELF_EI_CLASS          = 0x04;
const ELF_EI_DATA           = 0x05;
const ELF_CLASS_64          = 0x02;
const ELF_DATA_LE           = 0x01;
const ELF_E_MACHINE         = 0x12;       // u16
const ELF_EHDR_SIZE         = 0x40;
const ELF64_E_SHOFF         = 0x28;
const ELF64_E_SHENTSIZE     = 0x3a;
const ELF64_E_SHNUM         = 0x3c;
const ELF64_E_SHSTRNDX      = 0x3e;
const ELF64_SH_NAME         = 0x00;
const ELF64_SH_OFFSET       = 0x18;
const ELF64_SH_SIZE         = 0x20;
const EM_X86_64             = 0x3e;
const EM_AARCH64            = 0xb7;

// Mach-O (thin LE 64-bit; fat / 32-bit / BE rejected with clear message)
const MH_MAGIC_64           = 0xfeedfacf;
const MH_CIGAM_64           = 0xcffaedfe;
const MH_MAGIC              = 0xfeedface;
const MH_CIGAM              = 0xcefaedfe;
const MACH_CPUTYPE_OFF      = 0x04;        // u32
const MACH_NCMDS_OFF        = 0x10;
const MACH_SIZEOFCMDS_OFF   = 0x14;
const MACH_HDR_SIZE_64      = 0x20;
const LC_SEGMENT_64         = 0x19;
const LC_CMDSIZE_OFF        = 0x04;
const LC_SEGNAME_OFF        = 0x08;
const LC_SEGNAME_LEN        = 0x10;
const SEG64_NSECTS_OFF      = 0x40;
const SEG64_SECTS_OFF       = 0x48;
const SECT64_ENTRY_SIZE     = 0x50;
const SECT64_SIZE_OFF       = 0x28;
const SECT64_OFFSET_OFF     = 0x30;
const CPU_TYPE_X86_64       = 0x01000007;
const CPU_TYPE_ARM64        = 0x0100000c;

// PE
const PE_OFFSET_PTR         = 0x3c;
const PE_MACHINE_OFF        = 0x04;       // relative to PE sig
const PE_NUM_SECTIONS_OFF   = 0x06;
const PE_OPT_HDR_SIZE_OFF   = 0x14;
const PE_COFF_HDR_SIZE      = 0x18;
const PE_OPT_MAGIC_OFF      = 0x18;
const PE_OPT_MAGIC_PE32P    = 0x20b;
const PE_SECTION_ENTRY_SIZE = 0x28;
const PE_SECT_RAW_SIZE_OFF  = 0x10;
const PE_SECT_RAW_OFF_OFF   = 0x14;
const PE_SECT_NAME_LEN      = 0x08;
const IMAGE_MACHINE_AMD64   = 0x8664;
const IMAGE_MACHINE_ARM64   = 0xaa64;

// ─── Helpers ─────────────────────────────────────────────────────────

function die(msg) { throw new Error(`error: ${msg}`); }

function readU64LE(buf, off, what) {
  const v = buf.readBigUInt64LE(off);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) die(`${what} exceeds JS safe integer: ${v}`);
  return Number(v);
}

function checkedSlice(buf, off, size, what) {
  if (off < 0 || size < 0 || off + size > buf.length) {
    die(`${what} out of bounds: offset=${off} size=${size} buf=${buf.length}`);
  }
  return buf.subarray(off, off + size);
}

function decodeName(buf) {
  return buf.toString('utf8').replace(/\u0000+$/u, '');
}

// ─── Section locators (per format) ───────────────────────────────────

function findSectionElf(buf) {
  if (buf.length < ELF_EHDR_SIZE) die('ELF too small');
  if (buf[ELF_EI_CLASS] !== ELF_CLASS_64) die('ELF: only 64-bit supported');
  if (buf[ELF_EI_DATA]  !== ELF_DATA_LE) die('ELF: only little-endian supported');

  const eMachine = buf.readUInt16LE(ELF_E_MACHINE);
  const arch = eMachine === EM_X86_64  ? 'x64'
             : eMachine === EM_AARCH64 ? 'arm64'
             : die(`ELF: unsupported e_machine 0x${eMachine.toString(16)}`);

  const shoff     = readU64LE(buf, ELF64_E_SHOFF, 'ELF e_shoff');
  const shentsize = buf.readUInt16LE(ELF64_E_SHENTSIZE);
  const shnum     = buf.readUInt16LE(ELF64_E_SHNUM);
  const shstrndx  = buf.readUInt16LE(ELF64_E_SHSTRNDX);
  if (shstrndx >= shnum) die('ELF e_shstrndx out of range');

  const shstrEntry  = buf.subarray(shoff + shstrndx * shentsize, shoff + (shstrndx + 1) * shentsize);
  const shstrOffset = readU64LE(shstrEntry, ELF64_SH_OFFSET, 'shstrtab offset');
  const shstrSize   = readU64LE(shstrEntry, ELF64_SH_SIZE,   'shstrtab size');
  const shstr       = checkedSlice(buf, shstrOffset, shstrSize, 'shstrtab');

  let match = null;
  for (let i = 0; i < shnum; i++) {
    const entry   = buf.subarray(shoff + i * shentsize, shoff + (i + 1) * shentsize);
    const nameIdx = entry.readUInt32LE(ELF64_SH_NAME);
    if (nameIdx >= shstr.length) continue;
    let nameEnd = nameIdx;
    while (nameEnd < shstr.length && shstr[nameEnd] !== 0) nameEnd++;
    if (shstr.toString('ascii', nameIdx, nameEnd) !== BUN_SECTION_NAME) continue;
    if (match) die('ELF has multiple .bun sections');
    const rawOffset = readU64LE(entry, ELF64_SH_OFFSET, '.bun sh_offset');
    const rawSize   = readU64LE(entry, ELF64_SH_SIZE,   '.bun sh_size');
    if (rawOffset + rawSize > buf.length) die('.bun out of file bounds');
    match = { format: 'ELF', os: 'linux', arch, rawOffset, rawSize };
  }
  if (!match) die('ELF has no .bun section');
  return match;
}

function findSectionMacho(buf) {
  if (buf.length < MACH_HDR_SIZE_64) die('Mach-O too small');
  const cputype = buf.readUInt32LE(MACH_CPUTYPE_OFF);
  const arch = cputype === CPU_TYPE_X86_64 ? 'x64'
             : cputype === CPU_TYPE_ARM64  ? 'arm64'
             : die(`Mach-O: unsupported cputype 0x${cputype.toString(16)}`);

  const ncmds      = buf.readUInt32LE(MACH_NCMDS_OFF);
  const sizeofcmds = buf.readUInt32LE(MACH_SIZEOFCMDS_OFF);
  if (sizeofcmds === 0 || MACH_HDR_SIZE_64 + sizeofcmds > buf.length) die('Mach-O sizeofcmds invalid');
  const cmds = buf.subarray(MACH_HDR_SIZE_64, MACH_HDR_SIZE_64 + sizeofcmds);

  let match = null;
  let off = 0;
  for (let i = 0; i < ncmds; i++) {
    if (off + 8 > sizeofcmds) die(`Mach-O LC ${i} truncated`);
    const cmd     = cmds.readUInt32LE(off);
    const cmdsize = cmds.readUInt32LE(off + LC_CMDSIZE_OFF);
    if (cmdsize < 8 || off + cmdsize > sizeofcmds) die(`Mach-O LC ${i} cmdsize invalid: ${cmdsize}`);
    if (cmd === LC_SEGMENT_64) {
      const segname = cmds.toString('ascii', off + LC_SEGNAME_OFF, off + LC_SEGNAME_OFF + LC_SEGNAME_LEN).replace(/\0+$/, '');
      if (segname === '__BUN') {
        const nsects = cmds.readUInt32LE(off + SEG64_NSECTS_OFF);
        if (SEG64_SECTS_OFF + nsects * SECT64_ENTRY_SIZE > cmdsize) die(`Mach-O LC_SEGMENT_64(__BUN) sections exceed cmdsize`);
        for (let j = 0; j < nsects; j++) {
          const s = off + SEG64_SECTS_OFF + j * SECT64_ENTRY_SIZE;
          const sectname = cmds.toString('ascii', s, s + LC_SEGNAME_LEN).replace(/\0+$/, '');
          if (sectname === '__bun') {
            const rawSize   = readU64LE(cmds, s + SECT64_SIZE_OFF, '__bun size');
            const rawOffset = cmds.readUInt32LE(s + SECT64_OFFSET_OFF);
            if (rawOffset + rawSize > buf.length) die('__bun out of file bounds');
            if (match) die('Mach-O has multiple __BUN,__bun sections');
            match = { format: 'Mach-O', os: 'darwin', arch, rawOffset, rawSize };
          }
        }
      }
    }
    off += cmdsize;
  }
  if (!match) die('Mach-O has no __BUN,__bun section');
  return match;
}

function findSectionPe(buf) {
  if (buf.length < 0x40) die('PE too small');
  if (buf.toString('ascii', 0, 2) !== 'MZ') die('PE missing MZ header');
  const peOff = buf.readUInt32LE(PE_OFFSET_PTR);
  if (buf.toString('ascii', peOff, peOff + 4) !== 'PE\0\0') die('PE missing PE signature');

  const machine = buf.readUInt16LE(peOff + PE_MACHINE_OFF);
  const arch = machine === IMAGE_MACHINE_AMD64 ? 'x64'
             : machine === IMAGE_MACHINE_ARM64 ? 'arm64'
             : die(`PE: unsupported machine 0x${machine.toString(16)}`);

  const optMagic = buf.readUInt16LE(peOff + PE_OPT_MAGIC_OFF);
  if (optMagic !== PE_OPT_MAGIC_PE32P) die(`PE: only 64-bit (PE32+) supported, got 0x${optMagic.toString(16)}`);

  const numSect    = buf.readUInt16LE(peOff + PE_NUM_SECTIONS_OFF);
  const optHdrSize = buf.readUInt16LE(peOff + PE_OPT_HDR_SIZE_OFF);
  const sectTable  = peOff + PE_COFF_HDR_SIZE + optHdrSize;

  let match = null;
  for (let i = 0; i < numSect; i++) {
    const entry  = sectTable + i * PE_SECTION_ENTRY_SIZE;
    const rawNm  = buf.subarray(entry, entry + PE_SECT_NAME_LEN);
    const nul    = rawNm.indexOf(0);
    const name   = rawNm.subarray(0, nul === -1 ? rawNm.length : nul).toString('ascii');
    if (name !== BUN_SECTION_NAME) continue;
    if (match) die('PE has multiple .bun sections');
    const rawSize   = buf.readUInt32LE(entry + PE_SECT_RAW_SIZE_OFF);
    const rawOffset = buf.readUInt32LE(entry + PE_SECT_RAW_OFF_OFF);
    if (rawOffset + rawSize > buf.length) die('.bun out of file bounds');
    match = { format: 'PE', os: 'win32', arch, rawOffset, rawSize };
  }
  if (!match) die('PE has no .bun section');
  return match;
}

function findBunSection(buf) {
  if (buf.length < 4) die('file too small');
  const magic = buf.readUInt32LE(0);
  if (magic === ELF_MAGIC_LE)                       return findSectionElf(buf);
  if (magic === MH_MAGIC_64)                        return findSectionMacho(buf);
  if (magic === MH_CIGAM_64 || magic === MH_CIGAM)  die('Mach-O: only little-endian supported');
  if (magic === MH_MAGIC)                           die('Mach-O: only 64-bit supported');
  return findSectionPe(buf);
}

// ─── Payload + module records ────────────────────────────────────────

function parsePayload(sectionData) {
  if (sectionData.length < 8) die('.bun too small for length prefix');
  const payloadSize = readU64LE(sectionData, 0, '.bun payload length');
  if (payloadSize + 8 > sectionData.length) die('.bun payload exceeds raw section');
  const payload = sectionData.subarray(8, 8 + payloadSize);
  if (payload.length < OFFSET_STRUCT_SIZE + TRAILER.length) die('.bun payload too small');
  if (!payload.subarray(payload.length - TRAILER.length).equals(TRAILER)) die('.bun trailer mismatch');
  return payload;
}

function parseOffsets(payload) {
  const start = payload.length - TRAILER.length - OFFSET_STRUCT_SIZE;
  return {
    modules_offset: payload.readUInt32LE(start + 8),
    modules_size:   payload.readUInt32LE(start + 12),
    entry_point_id: payload.readUInt32LE(start + 16),
  };
}

function parseModules(payload, offsets) {
  if (offsets.modules_size % MODULE_RECORD_SIZE !== 0) {
    die(`modules table size not a multiple of ${MODULE_RECORD_SIZE}: ${offsets.modules_size}`);
  }
  const count = offsets.modules_size / MODULE_RECORD_SIZE;
  if (offsets.entry_point_id >= count) die(`entry_point_id ${offsets.entry_point_id} >= ${count}`);
  const table = checkedSlice(payload, offsets.modules_offset, offsets.modules_size, 'modules table');
  const out = [];
  for (let i = 0; i < count; i++) {
    const rec        = table.subarray(i * MODULE_RECORD_SIZE, (i + 1) * MODULE_RECORD_SIZE);
    const nameOff    = rec.readUInt32LE(0);
    const nameSize   = rec.readUInt32LE(4);
    const contentOff = rec.readUInt32LE(8);
    const contentSize= rec.readUInt32LE(12);
    const loaderId   = rec.readUInt8(49);
    const name = decodeName(checkedSlice(payload, nameOff, nameSize, `module[${i}].name`));
    const content = checkedSlice(payload, contentOff, contentSize, `module[${i}].content`);
    out.push({
      index: i,
      entry: i === offsets.entry_point_id,
      name,
      content,
      loader: LOADERS[loaderId] ?? `unknown(${loaderId})`,
    });
  }
  return out;
}

// ─── Output dispatch ─────────────────────────────────────────────────

function napiBasename(name) {
  // Bun records may use either '/' (POSIX builds) or '\\' (PE) as separator;
  // always normalize so basename grabs the right tail.
  const flat = name.replaceAll('\\', '/');
  const tail = flat.split('/').pop() ?? '';
  return tail.replace(/\.node$/i, '');
}

// ─── Main ────────────────────────────────────────────────────────────

function main() {
  const verbose = process.argv.includes('--verbose');
  const [binaryPath, outputDir] = process.argv.slice(2).filter((arg) => arg !== '--verbose');
  const logVerbose = (...args) => { if (verbose) console.log(...args); };
  if (!binaryPath || !outputDir) {
    console.error('Usage: extract-natives.mjs <binary-path> <output-dir>');
    process.exit(1);
  }
  if (!existsSync(binaryPath)) {
    console.error(`Binary not found: ${binaryPath}`);
    process.exit(1);
  }

  const buf = readFileSync(binaryPath);
  console.log(`Size:    ${(buf.length / 1024 / 1024).toFixed(1)} MB`);

  const section = findBunSection(buf);
  console.log(`Format:  ${section.format} (${section.arch}-${section.os})`);

  const sectionData = checkedSlice(buf, section.rawOffset, section.rawSize, '.bun section');
  const payload     = parsePayload(sectionData);
  const offsets     = parseOffsets(payload);
  const modules     = parseModules(payload, offsets);
  console.log(`Modules: ${modules.length} (entry id=${offsets.entry_point_id})`);

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(join(outputDir, 'vendor'));

  let cliCount = 0, napiCount = 0, assetCount = 0, chunkCount = 0, dropped = 0;
  for (const m of modules) {
    if (m.entry) {
      const out = join(outputDir, 'cli.original.js');
      writeFileSync(out, m.content);
      logVerbose(`  cli.js   ${(m.content.length / 1024 / 1024).toFixed(2)} MB → ${out} (${m.name})`);
      cliCount++;
    } else if (m.loader === 'js') {
      // v2.1.245+ ships the CLI as an ESM entry point plus a code-split
      // graph of /$bunfs/root/chunk-*.js modules. Every js module except the
      // entry is extracted into chunks/ (flat basename) so post-process.mjs
      // can rewrite their /$bunfs/root/... import specifiers to local files.
      const flat = m.name.replaceAll('\\', '/');
      const base = basename(flat);
      if (!base) { console.warn(`  skip js ${m.name}: empty basename`); dropped++; continue; }
      const dir = join(outputDir, 'chunks');
      mkdirSync(dir, { recursive: true });
      const out = join(dir, base);
      writeFileSync(out, m.content);
      logVerbose(`  chunk    ${(m.content.length / 1024).toFixed(0).padStart(5)} KB → ${out}`);
      chunkCount++;
    } else if (m.loader === 'file' || m.loader === 'text' || m.name.endsWith('.asset')) {
      // Bun embedded file assets (e.g. the design-canvas editor payload
      // /$bunfs/root/payload.template.html.asset). cli.original.js keeps
      // referencing them through /$bunfs/root/..., which does not exist
      // under the plain Bun runtime — the wrapper redirects them to
      // <clawgod-dir>/assets/<basename> via CLAWGOD_DESIGN_PAYLOAD.
      const base = basename(m.name.replaceAll('\\', '/'));
      if (!base || base === '.asset') {
        console.warn(`  skip asset ${m.name}: empty basename`);
        dropped++;
        continue;
      }
      const dir = join(outputDir, 'assets');
      mkdirSync(dir, { recursive: true });
      const out = join(dir, base);
      writeFileSync(out, m.content);
      logVerbose(`  asset    ${(m.content.length / 1024).toFixed(0).padStart(5)} KB → ${out}`);
      assetCount++;
    } else if (m.loader === 'napi') {
      const base = napiBasename(m.name);
      if (!base) { console.warn(`  skip napi ${m.name}: empty basename`); dropped++; continue; }
      const dir = join(outputDir, 'vendor', base, `${section.arch}-${section.os}`);
      mkdirSync(dir, { recursive: true });
      const out = join(dir, `${base}.node`);
      writeFileSync(out, m.content);
      logVerbose(`  napi     ${(m.content.length / 1024).toFixed(0).padStart(5)} KB → ${out}`);
      napiCount++;
    } else {
      dropped++;
    }
  }
  console.log(`Extracted: ${cliCount} cli.js + ${napiCount} napi + ${assetCount} asset + ${chunkCount} chunk (${dropped} dropped)`);
  if (cliCount !== 1) {
    console.error(`error: expected exactly 1 entry-point, got ${cliCount}`);
    process.exit(2);
  }
}

main();
EXTRACTOR_EOF

# ─── Extract cli.js + native modules from Bun binary ──────────
# Note: extract-natives.mjs and post-process.mjs are kept around (NOT deleted)
# so the wrapper's drift detector can re-run them when the user upgrades
# their native Claude binary.

# Single extractor pass: stages cli.original.js and native modules in the
# same-filesystem runtime transaction until mandatory patches pass.
# vendor/<name>/<arch>-<os>/<name>.node for every napi module in one go.
rm -f "$CLAWGOD_DIR/cli.original.js" 2>/dev/null
RUNTIME_CANDIDATE_DIR="$RUNTIME_TRANSACTION_DIR/candidate"
mkdir -p "$RUNTIME_CANDIDATE_DIR"

dim "Extracting cli.js + napi modules from $(echo "$NATIVE_BIN_LABEL") ..."
if ! "$BUN_BIN" "$CLAWGOD_DIR/extract-natives.mjs" "$NATIVE_BIN" "$RUNTIME_CANDIDATE_DIR" 2>&1 | while IFS= read -r line; do echo "  $line"; done; then
  err "Failed to extract from native binary"
  exit 1
fi
[ -f "$RUNTIME_CANDIDATE_DIR/cli.original.js" ] || { err "cli.js missing after extraction"; exit 1; }

# ─── Post-process cli.js for Bun runtime ──────────────────────
# Legacy monolithic CJS bundle:
# 0. Strip leading @bun pragma comments so Bun recognises the CJS wrapper
# 1. Rewrite /$bunfs/root/X.node paths to point at extracted vendor modules
# 2. Rewrite build-time /home/runner/.../*.ts URLs (used by ripgrep,
#    sandbox, computer-use, etc. for asset resolution) to __filename so
#    relative resolutions land near our cli.original.cjs
# 3. Wrap the Bun-cjs IIFE with an actual invocation so `require()` runs it
# 4. Save as .cjs (Bun + CJS module wrapper)
#
# v2.1.245+ code-split ESM bundle (chunks/ present): rewrite chunk import
# specifiers to local relative paths and .node/.asset/worker paths to
# absolute ~/.clawgod locations (passed as argv[2]).

dim "Rewriting bunfs paths and IIFE invocation ..."
cat > "$CLAWGOD_DIR/post-process.mjs" << 'POSTPROC_EOF'
#!/usr/bin/env bun
import { readFileSync, writeFileSync, unlinkSync, readdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const src = `${here}/cli.original.js`;
const dst = `${here}/cli.original.cjs`;

// Final runtime directory (~/.clawgod) — passed in by install.sh so that
// native-module / asset / worker paths can be baked as absolute paths.
// Normalise backslashes (Windows argv) to forward slashes: the baked paths
// are spliced into JS string literals, where a raw `\` would be parsed as an
// escape sequence, and Windows filesystem APIs accept forward slashes.
const clawgodDir = (process.argv[2] || here).replace(/\\/g, '/');

const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const os = process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : 'win32';
const archOs = `${arch}-${os}`;

// Bun standalone embeds are referenced as /$bunfs/root/... (POSIX) or
// B:/~BUN/root/... (Windows). Match both prefixes so every reference is
// rewritten regardless of which build produced the binary.
const BUNFS = String.raw`(?:[A-Za-z]:)?\/(?:\$bunfs|~BUN)\/root\/`;

function rewrite(code, { chunkPrefix }) {
  // (1) code-split chunk import specifiers → local relative path.
  // v2.1.246 renamed many chunks from `chunk-<hash>.js` to `_<n>.js`; both
  // are flat files under chunks/ and must be rewritten to local paths.
  code = code.replace(
    new RegExp(`${BUNFS}(chunk-[a-z0-9]+|_[0-9]+)\\.js`, 'g'),
    (match, name) => `${chunkPrefix}${name}.js`,
  );
  // (2) native .node module path (string arg to import.meta.require) → vendor.
  code = code.replace(
    new RegExp(`${BUNFS}([\\w-]+)\\.node`, 'g'),
    (m, name) => `${clawgodDir}/vendor/${name}/${archOs}/${name}.node`,
  );
  // (3) loader=file assets (design-canvas payload, chart/hljs/mermaid) → assets/.
  code = code.replace(
    new RegExp(`${BUNFS}([A-Za-z0-9_.-]+\\.(?:asset|min\\.js|md|txt))`, 'g'),
    (m, name) => `${clawgodDir}/assets/${name}`,
  );
  // (4) plugin function-hooks worker URL → local worker file.
  code = code.replace(
    new RegExp(`${BUNFS}src/plugins/functionHooks/hooks-worker/hooks-worker\\.js`, 'g'),
    `${clawgodDir}/chunks/hooks-worker.js`,
  );
  return code;
}

const chunksDir = join(here, 'chunks');

if (existsSync(chunksDir)) {
  // ── v2.1.245+ code-split format: ESM entry + chunk graph ──────────
  // The entry point is a thin dispatcher of `import ... from "/$bunfs/root/
  // chunk-*.js"` statements. Rewrite its specifiers (chunks live one level
  // down) and rewrite every chunk (sibling specifiers) in place.
  let entry = readFileSync(src, 'utf8');
  entry = rewrite(entry, { chunkPrefix: './chunks/' });
  writeFileSync(dst, entry);
  unlinkSync(src);

  for (const name of readdirSync(chunksDir)) {
    if (!name.endsWith('.js')) continue;
    const path = join(chunksDir, name);
    let code = readFileSync(path, 'utf8');
    code = rewrite(code, { chunkPrefix: './' });
    writeFileSync(path, code);
  }
  console.log(`cli.original.cjs: ${entry.length} bytes (code-split, chunks rewritten)`);
} else {
  // ── legacy monolithic CJS bundle ──────────────────────────────────
  let code = readFileSync(src, 'utf8');

  // Strip leading @bun pragma comments (e.g. "// @bun @bytecode @bun-cjs\n")
  // Bun requires the file to start directly with "(function" to recognize
  // the CommonJS wrapper; any preceding comment breaks that detection.
  code = code.replace(/^(?:\/\/[^\n]*\n)+/, '');

  // (1) bunfs .node module paths → runtime vendor lookup
  code = code.replace(
    /require\(['"](\/\$bunfs\/root\/([\w-]+)\.node)['"]\)/g,
    (m, _full, name) =>
      `require(require('path').join(__dirname,'vendor',${JSON.stringify(name)},\`\${process.arch==='arm64'?'arm64':'x64'}-\${process.platform==='darwin'?'darwin':process.platform==='linux'?'linux':'win32'}\`,${JSON.stringify(name + '.node')}))`,
  );

  // (2) build-time fileURLToPath() leaks → use cli.cjs's own __filename
  code = code.replace(
    /[\w$]+\.fileURLToPath\("file:\/\/\/home\/runner\/work\/claude-cli-internal\/claude-cli-internal\/[^"]*"\)/g,
    () => '__filename',
  );

  // (3) make the outer (function(...){...}) actually run
  code = code.replace(/\}\)\s*$/, '})(exports, require, module, __filename, __dirname)');

  writeFileSync(dst, code);
  unlinkSync(src);
  console.log(`cli.original.cjs: ${code.length} bytes (monolithic)`);
}
POSTPROC_EOF
cp "$CLAWGOD_DIR/post-process.mjs" "$RUNTIME_CANDIDATE_DIR/post-process.mjs"
"$BUN_BIN" "$RUNTIME_CANDIDATE_DIR/post-process.mjs" "$CLAWGOD_DIR" 2>&1 | while IFS= read -r line; do echo "  $line"; done
[ -f "$RUNTIME_CANDIDATE_DIR/cli.original.cjs" ] || { err "Post-process failed"; exit 1; }
mv "$RUNTIME_CANDIDATE_DIR/cli.original.cjs" "$CLAWGOD_DIR/cli.original.cjs"
# Code-split chunk graph (v2.1.245+): every non-entry js module extracted by
# extract-natives.mjs into candidate/chunks/. Move it into place alongside
# cli.original.cjs so the patcher and runtime can resolve the rewritten
# relative import specifiers.
if [ -d "$RUNTIME_CANDIDATE_DIR/chunks" ]; then
  rm -rf "$CLAWGOD_DIR/chunks"
  mv "$RUNTIME_CANDIDATE_DIR/chunks" "$CLAWGOD_DIR/chunks"
fi
# Design canvas editor payload (loader=file asset from the binary) — see
# wrapper.cjs CLAWGOD_DESIGN_PAYLOAD export.
if [ -d "$RUNTIME_CANDIDATE_DIR/assets" ]; then
  rm -rf "$CLAWGOD_DIR/assets"
  mv "$RUNTIME_CANDIDATE_DIR/assets" "$CLAWGOD_DIR/assets"
fi
RUNTIME_HAS_CANDIDATE_VENDOR=1

# Stamp the source version so the wrapper can detect drift on next launch
echo "$NATIVE_BIN_LABEL" > "$CLAWGOD_DIR/.source-version"

# If we pulled the binary from npm into a tmpdir, clean it up now —
# extraction is done, drift detection only consults ~/.local/share/claude/versions/.
if [ -n "$NATIVE_BIN_TMPDIR" ]; then
  rm -rf "$NATIVE_BIN_TMPDIR"
fi

info "cli.original.cjs ready ($NATIVE_BIN_LABEL)"

fi  # end --no-upgrade skip

# ─── Write re-patch helper (used by wrapper on version drift) ─────────

cat > "$CLAWGOD_DIR/repatch.mjs" << 'REPATCH_EOF'
#!/usr/bin/env bun
// Re-extract + post-process + patch the user's currently-installed
// native Claude binary. Invoked by cli.cjs when it detects that
// .source-version no longer matches the latest binary in versions/.
import { spawnSync } from 'child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { publishVendorTransaction } from './vendor-transaction.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const nativeBin = process.argv[2];

if (!nativeBin || !existsSync(nativeBin)) {
  console.error('repatch: native binary path required and must exist');
  process.exit(1);
}

const runtime = process.execPath;

function run(label, args) {
  const r = spawnSync(runtime, args, { cwd: here, stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(`repatch: ${label} failed (exit ${r.status})`);
  }
}

function snapshotFile(path) {
  if (!existsSync(path)) return null;
  const status = statSync(path);
  return { bytes: readFileSync(path), mode: status.mode & 0o7777 };
}

function restoreFile(path, snapshot) {
  if (snapshot === null) {
    rmSync(path, { force: true });
    return;
  }
  writeFileSync(path, snapshot.bytes);
  chmodSync(path, snapshot.mode);
}

const extractor = join(here, 'extract-natives.mjs');
const postProc = join(here, 'post-process.mjs');
const patcher = join(here, 'patch.mjs');
const target = join(here, 'cli.original.cjs');
const sourceVersion = join(here, '.source-version');
const chunksDir = join(here, 'chunks');
const enhancementsFile = join(here, 'enhancements.json');
const targetSnapshot = snapshotFile(target);
const sourceVersionSnapshot = snapshotFile(sourceVersion);
const chunksSnapshot = existsSync(chunksDir)
  ? Object.fromEntries(readdirSync(chunksDir).map((name) => [name, snapshotFile(join(chunksDir, name))]))
  : null;
const transactionDir = mkdtempSync(join(here, '.runtime-rollback.'));
const candidateDir = join(transactionDir, 'candidate');
const candidateVendor = join(candidateDir, 'vendor');
const vendorDir = join(here, 'vendor');
let vendorPublishAttempted = false;

try {
  mkdirSync(candidateDir);
  rmSync(join(here, 'cli.original.js'), { force: true });

  run('extract', [extractor, nativeBin, candidateDir]);
  const candidatePostProc = join(candidateDir, 'post-process.mjs');
  copyFileSync(postProc, candidatePostProc);
  run('post-process', [candidatePostProc, here]);
  rmSync(target, { force: true });
  renameSync(join(candidateDir, 'cli.original.cjs'), target);
  const candidateChunks = join(candidateDir, 'chunks');
  if (existsSync(candidateChunks)) {
    rmSync(chunksDir, { recursive: true, force: true });
    renameSync(candidateChunks, chunksDir);
  }
  const candidateAssets = join(candidateDir, 'assets');
  const assetsDir = join(here, 'assets');
  if (existsSync(candidateAssets)) {
    rmSync(assetsDir, { recursive: true, force: true });
    renameSync(candidateAssets, assetsDir);
  }
  run('patcher', [patcher, '--enhancements-file', enhancementsFile]);

  writeFileSync(sourceVersion, basename(nativeBin) + '\n');
  vendorPublishAttempted = true;
  publishVendorTransaction({ liveVendor: vendorDir, candidateVendor, transactionDir });
  rmSync(transactionDir, { recursive: true, force: true });
  console.log(`[clawgod] re-patched to ${basename(nativeBin)}`);
} catch (error) {
  const vendorRestored = !vendorPublishAttempted || error?.rollbackComplete === true;
  if (vendorRestored) {
    restoreFile(target, targetSnapshot);
    restoreFile(sourceVersion, sourceVersionSnapshot);
    rmSync(chunksDir, { recursive: true, force: true });
    if (chunksSnapshot) {
      mkdirSync(chunksDir, { recursive: true });
      for (const [name, file] of Object.entries(chunksSnapshot)) restoreFile(join(chunksDir, name), file);
    }
    if (!vendorPublishAttempted || error?.cleanupSafe !== false) rmSync(transactionDir, { recursive: true, force: true });
    else console.error(`repatch: prior CLI restored; untrusted transaction data retained at ${transactionDir}`);
  } else {
    console.error(`repatch: vendor rollback conflict; prior CLI was not restored; recovery data retained at ${transactionDir}`);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
REPATCH_EOF
chmod +x "$CLAWGOD_DIR/repatch.mjs"
info "Re-patch helper installed (repatch.mjs)"

# ─── Write OpenAI-compatible proxy ────────────────────────────

cat > "$CLAWGOD_DIR/openai-proxy.cjs" << 'PROXY_EOF'
'use strict';
// Anthropic Messages API <-> OpenAI Chat Completions API translation proxy
// Allows Claude Code to use xAI/Grok and other OpenAI-compatible APIs

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
PROXY_EOF
info "OpenAI-compatible proxy created (openai-proxy.cjs)"

# ─── Write wrapper (cli.cjs, runs under Bun) ──────────────────

install_update_runtime_helpers

cat > "$CLAWGOD_DIR/cli.cjs" << 'WRAPPER_EOF'
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

const topLevelCommand = process.argv[2];
if (topLevelCommand === 'update' || topLevelCommand === 'upgrade') {
  const { exitWithOutcome, runSelfUpdate } = require('./self-update.cjs');
  exitWithOutcome(runSelfUpdate(process.argv.slice(2)));
}

let readPatchFallback = () => null;
try { ({ readPatchFallback } = require('./patch-fallback.cjs')); } catch {}
const patchFallback = readPatchFallback(clawgodDir);
if (patchFallback) {
  process.stderr.write(`[clawgod] Running Claude Code ${patchFallback.sourceVersion} without bundle enhancements because patch compatibility failed.\n`);
  process.stderr.write("[clawgod] Run 'claude update' to retry after a ClawGod update.\n");
}

// Note: there used to be a "drift detection" block here that scanned
// ~/.local/share/claude/versions/ for a newer binary and silently re-patched.
// Removed because:
//   1. Windows users don't have a `versions/` directory at all (Anthropic's
//      Windows install doesn't follow that convention).
//   2. We patch out `claude update` (it would otherwise overwrite the bun
//      runtime under our launcher), so `versions/` no longer auto-grows
//      on a healthy clawgod install.
// In practice the block was reading a directory that never changes, but
// could *retract* a fresher version that install.sh just pulled from npm
// registry — putting users into a re-patch loop. Upgrades now go through
// the patched `claude update` → install.sh redirect, which always pulls
// the latest from npm.

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
    config = { ...defaultConfig };  // prevent fallthrough to apiKey/baseURL injection below
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
  // Third-party proxies (headroom, etc.) often require remote control.
  // Lean mode sets disableRemoteControl:true in settings.json — undo it
  // when the user is routing through a non-Anthropic endpoint.
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

// Design canvas editor payload: cli.original.cjs resolves it through the
// Bun standalone embed path /$bunfs/root/payload.template.html.asset,
// which does not exist when the bundle runs as a plain file under Bun.
// extract-natives.mjs extracts the asset (loader=file) into
// <clawgod-dir>/assets/ and the design-canvas patch reads this env.
const designPayload = join(providerDir, 'assets', 'payload.template.html.asset');
if (!process.env.CLAWGOD_DESIGN_PAYLOAD && existsSync(designPayload)) {
  process.env.CLAWGOD_DESIGN_PAYLOAD = designPayload;
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
      // If downgrading from max to on, remove max-only keys
      if (!_isMax) { for (const _k of _maxFlags) { if (_k in _s) { delete _s[_k]; _ch = true; } } }
      if (!_s.permissions) _s.permissions = {};
      if (!Array.isArray(_s.permissions.deny)) _s.permissions.deny = [];
      const _ex = new Set(_s.permissions.deny);
      for (const _t of _deny) { if (!_ex.has(_t)) { _s.permissions.deny.push(_t); _ch = true; } }
      // If downgrading from max to on, remove max-only deny entries
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
WRAPPER_EOF
chmod +x "$CLAWGOD_DIR/cli.cjs"
echo "$CLAWGOD_SELF_VERSION" > "$CLAWGOD_DIR/.clawgod-version"
info "Wrapper created (cli.cjs)"

# Drop a copy of this installer at ~/.clawgod/install.sh so that:
#  1) the patched `claude update` redirect can re-run it locally instead of
#     curling the release (see 'Redirect claude update' patch), and
#  2) the documented `bash ~/.clawgod/install.sh --uninstall` hint actually works.
# Only when run from a real file (repo checkout), never from `curl | bash`;
# skip when the source already IS the destination (a local-mode re-run).
_self_src="${BASH_SOURCE[0]:-$0}"
if [ -n "$_self_src" ] && [ -f "$_self_src" ]; then
  _self_abs="$(cd "$(dirname "$_self_src")" 2>/dev/null && pwd)/$(basename "$_self_src")"
  if [ -n "$_self_abs" ] && [ -f "$_self_abs" ] && [ "$_self_abs" != "$CLAWGOD_DIR/install.sh" ]; then
    cp "$_self_abs" "$CLAWGOD_DIR/install.sh" && chmod +x "$CLAWGOD_DIR/install.sh"
    info "Local installer copied → ~/.clawgod/install.sh ('claude update' will use it)"
  fi
fi

# ─── Write universal patcher ───────────────────────────

cat > "$CLAWGOD_DIR/patch.mjs" << 'PATCHER_EOF'
#!/usr/bin/env bun
// @bun

// src/generic/patcher/entry.mjs
import { copyFileSync, cpSync, existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync, readdirSync, renameSync as renameSync2, rmSync, writeFileSync as writeFileSync2 } from "fs";
import { dirname as dirname3, isAbsolute as isAbsolute2, join as join3 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";

// src/generic/enhancement-config.mjs
import { randomUUID } from "crypto";
import * as defaultFileSystem from "fs/promises";
import { basename, dirname, isAbsolute, join } from "path";
var ENHANCEMENT_CONFIG_DIRECTORY = ".clawgod";
var ENHANCEMENT_CONFIG_FILENAME = "enhancements.json";
var ENHANCEMENT_CONFIG_DIRECTORY_MODE = 448;
var ENHANCEMENT_CONFIG_FILE_MODE = 384;
var ENHANCEMENT_CONFIG_SCHEMA_VERSION = 1;
var SAFE_JSON_FILENAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.json$/;
var SAFE_ENHANCEMENT_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
var MAX_CONFIG_BYTES = 64 * 1024;
var DEFAULT_LOCK_WAIT_MS = 5000;
var LOCK_POLL_MS = 10;
var LOCK_OWNER_PATTERN = /^([1-9][0-9]*):([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\n$/;
var textDecoder = new TextDecoder("utf-8", { fatal: true });
function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}
`;
}
function canonicalManifestJson(entries) {
  return `[
${entries.map((entry) => `  { "id": ${JSON.stringify(entry.id)}, "kind": ${JSON.stringify(entry.kind)} }`).join(`,
`)}
]
`;
}
function decodeSource(source, label) {
  if (typeof source === "string")
    return source;
  if (source instanceof Uint8Array) {
    try {
      return textDecoder.decode(source);
    } catch {
      throw new Error(`Invalid ${label} UTF-8`);
    }
  }
  throw new TypeError(`${label} source must be a string or Uint8Array`);
}
function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function assertExactKeys(value, expected, label) {
  if (!isPlainRecord(value))
    throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value);
  const unknown = actual.filter((key) => !expected.includes(key));
  if (unknown.length > 0)
    throw new Error(`${label} has unknown key: ${unknown[0]}`);
  const missing = expected.filter((key) => !actual.includes(key));
  if (missing.length > 0)
    throw new Error(`${label} is missing required key: ${missing[0]}`);
}
function assertSafeFilename(filename, label) {
  if (typeof filename !== "string" || !SAFE_JSON_FILENAME.test(filename)) {
    throw new Error(`Unsafe ${label} filename`);
  }
}
function assertSafeEnhancementId(id) {
  if (typeof id !== "string")
    throw new TypeError("Enhancement ID must be a string");
  if (!SAFE_ENHANCEMENT_ID.test(id))
    throw new Error(`Unsafe enhancement ID: ${id}`);
}
function manifestIds(manifest) {
  if (!Array.isArray(manifest) || manifest.length === 0)
    throw new TypeError("Enhancement manifest must be a non-empty array");
  const ids = [];
  const seen = new Set;
  for (const entry of manifest) {
    if (!isPlainRecord(entry))
      throw new TypeError("Enhancement manifest entry must be an object");
    assertSafeEnhancementId(entry.id);
    if (seen.has(entry.id))
      throw new Error(`Duplicate enhancement ID: ${entry.id}`);
    seen.add(entry.id);
    ids.push(entry.id);
  }
  return ids;
}
function loadEnhancementManifest(source, { filename = ENHANCEMENT_CONFIG_FILENAME } = {}) {
  assertSafeFilename(filename, "manifest");
  const text = decodeSource(source, "enhancement manifest");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`Invalid enhancement manifest JSON: ${filename}`);
  }
  if (!Array.isArray(value))
    throw new TypeError("Enhancement manifest must be an array");
  if (value.length === 0)
    throw new Error("Enhancement manifest must not be empty");
  const normalized = [];
  const seen = new Set;
  for (const entry of value) {
    assertExactKeys(entry, ["id", "kind"], "Enhancement manifest entry");
    assertSafeEnhancementId(entry.id);
    if (seen.has(entry.id))
      throw new Error(`Duplicate enhancement ID: ${entry.id}`);
    seen.add(entry.id);
    if (entry.kind !== "patch" && entry.kind !== "plugin") {
      throw new Error(`Invalid enhancement kind for ${entry.id}`);
    }
    normalized.push({ id: entry.id, kind: entry.kind });
  }
  if (text !== canonicalManifestJson(normalized))
    throw new Error(`Non-canonical enhancement manifest JSON: ${filename}`);
  return Object.freeze(normalized.map((entry) => Object.freeze(entry)));
}
function normalizeEnhancementSelection(enabled, manifest) {
  const ids = manifestIds(manifest);
  if (!Array.isArray(enabled))
    throw new TypeError("Enhancement selection must be an array");
  const selected = new Set;
  for (const id of enabled) {
    assertSafeEnhancementId(id);
    if (selected.has(id))
      throw new Error(`Duplicate enhancement ID: ${id}`);
    if (!ids.includes(id))
      throw new Error(`Unknown enhancement ID: ${id}`);
    selected.add(id);
  }
  return ids.filter((id) => selected.has(id));
}
function validateStoredEnhancementConfig(value, manifest) {
  assertExactKeys(value, ["schemaVersion", "mode", "enabled"], "Enhancement config");
  if (value.schemaVersion !== ENHANCEMENT_CONFIG_SCHEMA_VERSION) {
    throw new Error(`Unsupported enhancement config schemaVersion: ${String(value.schemaVersion)}`);
  }
  if (value.mode !== "all" && value.mode !== "custom") {
    throw new Error(`Invalid enhancement config mode: ${String(value.mode)}`);
  }
  const enabled = normalizeEnhancementSelection(value.enabled, manifest);
  if (value.mode === "all" && enabled.length !== 0) {
    throw new Error("Enhancement config mode all requires an empty enabled array");
  }
  if (value.mode === "custom" && enabled.length === manifest.length) {
    throw new Error("A complete enhancement selection must use mode all");
  }
  return {
    schemaVersion: ENHANCEMENT_CONFIG_SCHEMA_VERSION,
    mode: value.mode,
    enabled
  };
}
function parseStoredEnhancementConfig(source, manifest) {
  const text = decodeSource(source, "enhancement config");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Invalid enhancement config JSON");
  }
  const config = validateStoredEnhancementConfig(value, manifest);
  if (text !== canonicalJson(config))
    throw new Error("Non-canonical enhancement config JSON");
  return config;
}
function selectionToStoredEnhancementConfig(selection, manifest) {
  if (!isPlainRecord(selection))
    throw new TypeError("Enhancement selection must be an object");
  const unknown = Object.keys(selection).filter((key) => !["schemaVersion", "mode", "enabled"].includes(key));
  if (unknown.length > 0)
    throw new Error(`Enhancement selection has unknown key: ${unknown[0]}`);
  if (Object.hasOwn(selection, "schemaVersion") && selection.schemaVersion !== ENHANCEMENT_CONFIG_SCHEMA_VERSION) {
    throw new Error(`Unsupported enhancement selection schemaVersion: ${String(selection.schemaVersion)}`);
  }
  if (selection.mode !== "all" && selection.mode !== "custom") {
    throw new Error(`Invalid enhancement selection mode: ${String(selection.mode)}`);
  }
  const enabled = normalizeEnhancementSelection(selection.enabled, manifest);
  if (selection.mode === "all" && enabled.length !== 0 && enabled.length !== manifest.length) {
    throw new Error("Enhancement selection mode all must contain none or every manifest ID");
  }
  if (selection.mode === "all" || enabled.length === manifest.length) {
    return { schemaVersion: ENHANCEMENT_CONFIG_SCHEMA_VERSION, mode: "all", enabled: [] };
  }
  return { schemaVersion: ENHANCEMENT_CONFIG_SCHEMA_VERSION, mode: "custom", enabled };
}
function parseExplicitEnhancementSelection(explicit, manifest) {
  if (typeof explicit !== "string")
    throw new TypeError("Explicit enhancement selection must be a string");
  if (explicit.length === 0)
    throw new Error("Explicit enhancement selection must not be empty");
  if (explicit === "none") {
    return { schemaVersion: ENHANCEMENT_CONFIG_SCHEMA_VERSION, mode: "custom", enabled: [] };
  }
  const requested = explicit.split(",");
  if (requested.some((id) => id.length === 0))
    throw new Error("Invalid explicit CSV: empty enhancement ID");
  const enabled = normalizeEnhancementSelection(requested, manifest);
  return selectionToStoredEnhancementConfig({ mode: "custom", enabled }, manifest);
}
function resolveEnhancementSelection(input = {}, manifest) {
  if (!isPlainRecord(input))
    throw new TypeError("Enhancement resolution input must be an object");
  const unknown = Object.keys(input).filter((key) => key !== "explicit" && key !== "stored");
  if (unknown.length > 0)
    throw new Error(`Enhancement resolution has unknown key: ${unknown[0]}`);
  let config;
  if (Object.hasOwn(input, "explicit") && input.explicit !== undefined) {
    config = parseExplicitEnhancementSelection(input.explicit, manifest);
  } else if (Object.hasOwn(input, "stored") && input.stored !== undefined && input.stored !== null) {
    config = validateStoredEnhancementConfig(input.stored, manifest);
  } else {
    config = { schemaVersion: ENHANCEMENT_CONFIG_SCHEMA_VERSION, mode: "all", enabled: [] };
  }
  return {
    mode: config.mode,
    enabled: config.mode === "all" ? manifestIds(manifest) : [...config.enabled]
  };
}
function enhancementConfigPath(homeDir, { filename = ENHANCEMENT_CONFIG_FILENAME } = {}) {
  if (typeof homeDir !== "string" || !isAbsolute(homeDir))
    throw new Error("Enhancement config requires an absolute HOME path");
  if (filename !== ENHANCEMENT_CONFIG_FILENAME)
    throw new Error("Unsafe enhancement config filename");
  return join(homeDir, ENHANCEMENT_CONFIG_DIRECTORY, filename);
}
function fileMode(status) {
  return status.mode & 511;
}
function permissionMode(status) {
  return status.mode & 4095;
}
function fileIdentity(status) {
  return { dev: status.dev, ino: status.ino };
}
function sameIdentity(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino;
}
async function lstatIfPresent(fileSystem, path) {
  try {
    return await fileSystem.lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT")
      return null;
    throw error;
  }
}
function homeDirectoryStatusIsSafe(status, platform) {
  if (status.isSymbolicLink() || !status.isDirectory())
    return false;
  if (platform === "win32")
    return (fileMode(status) & 128) !== 0;
  return (fileMode(status) & 18) === 0;
}
function configDirectoryStatusIsSafe(status, platform) {
  if (status.isSymbolicLink() || !status.isDirectory())
    return false;
  if (platform === "win32")
    return (fileMode(status) & 128) !== 0;
  return permissionMode(status) === ENHANCEMENT_CONFIG_DIRECTORY_MODE;
}
function assertSafeHomeDirectoryStatus(status, platform) {
  if (!homeDirectoryStatusIsSafe(status, platform)) {
    throw new Error("Unsafe enhancement config HOME ancestor");
  }
}
function assertSafeConfigDirectoryStatus(status, label, platform) {
  if (!configDirectoryStatusIsSafe(status, platform)) {
    throw new Error(`Unsafe enhancement config ${label} ancestor`);
  }
}
function configModeMatches(mode, platform) {
  return platform === "win32" ? (mode & 128) === (ENHANCEMENT_CONFIG_FILE_MODE & 128) : mode === ENHANCEMENT_CONFIG_FILE_MODE;
}
function assertSafeConfigStatus(status, label = "leaf", platform = process.platform, expectedNlink = 1) {
  if (status.isSymbolicLink() || !status.isFile()) {
    throw new Error(`Unsafe enhancement config ${label}`);
  }
  if (status.nlink !== expectedNlink) {
    if (expectedNlink === 1)
      throw new Error("Enhancement config leaf must be a regular single-link file; hardlinks are unsafe");
    throw new Error(`Unexpected enhancement config ${label} link count`);
  }
  if (!configModeMatches(fileMode(status), platform)) {
    throw new Error("Unsafe enhancement config mode; expected 0600");
  }
}
async function inspectHome(fileSystem, homeDir, platform) {
  const status = await lstatIfPresent(fileSystem, homeDir);
  if (!status)
    throw new Error("Unsafe enhancement config HOME ancestor: directory is missing");
  assertSafeHomeDirectoryStatus(status, platform);
  return status;
}
async function inspectConfigDirectory(fileSystem, homeDir, { missing = "allow", platform = process.platform } = {}) {
  const homeStatus = await inspectHome(fileSystem, homeDir, platform);
  const path = join(homeDir, ENHANCEMENT_CONFIG_DIRECTORY);
  const status = await lstatIfPresent(fileSystem, path);
  if (!status) {
    if (missing === "reject")
      throw new Error("Enhancement config directory is missing");
    return { path, status: null, homeStatus };
  }
  assertSafeConfigDirectoryStatus(status, "directory", platform);
  return { path, status, homeStatus };
}
async function assertReadDirectoryCurrent(fileSystem, homeDir, expected, platform) {
  let current;
  try {
    current = await inspectConfigDirectory(fileSystem, homeDir, { platform });
  } catch (error) {
    throw markRestorationIncomplete(error, [homeDir, expected.path]);
  }
  const homeChanged = !sameIdentity(fileIdentity(current.homeStatus), fileIdentity(expected.homeStatus));
  const directoryChanged = Boolean(current.status) !== Boolean(expected.status) || current.status && !sameIdentity(fileIdentity(current.status), fileIdentity(expected.status));
  if (homeChanged || directoryChanged) {
    throw markRestorationIncomplete(new Error("Enhancement config ancestor changed during read"), homeChanged ? [homeDir, expected.path] : [expected.path]);
  }
  return current;
}
async function readFileSnapshot(fileSystem, path, parentStatus, platform, expectedNlink = 1) {
  const before = await lstatIfPresent(fileSystem, path);
  if (!before) {
    return {
      path,
      present: false,
      parentIdentity: fileIdentity(parentStatus),
      identity: null,
      bytes: null,
      mode: null,
      nlink: null
    };
  }
  assertSafeConfigStatus(before, "leaf", platform, expectedNlink);
  if (before.size > MAX_CONFIG_BYTES)
    throw new Error("Enhancement config exceeds the maximum safe size");
  let handle;
  try {
    handle = await fileSystem.open(path, "r");
    const opened = await handle.stat();
    assertSafeConfigStatus(opened, "descriptor", platform, expectedNlink);
    if (!sameIdentity(fileIdentity(before), fileIdentity(opened))) {
      throw new Error("Enhancement config changed during update");
    }
    if (opened.size > MAX_CONFIG_BYTES)
      throw new Error("Enhancement config exceeds the maximum safe size");
    const bytes = await handle.readFile();
    const after = await fileSystem.lstat(path);
    assertSafeConfigStatus(after, "leaf", platform, expectedNlink);
    if (!sameIdentity(fileIdentity(opened), fileIdentity(after)) || fileMode(opened) !== fileMode(after) || opened.nlink !== after.nlink || opened.size !== after.size) {
      throw new Error("Enhancement config changed during update");
    }
    return {
      path,
      present: true,
      parentIdentity: fileIdentity(parentStatus),
      identity: fileIdentity(after),
      bytes,
      mode: fileMode(after),
      nlink: after.nlink
    };
  } finally {
    if (handle)
      await handle.close();
  }
}
function snapshotsEqual(left, right) {
  if (left.present !== right.present || !sameIdentity(left.parentIdentity, right.parentIdentity))
    return false;
  if (!left.present)
    return true;
  return sameIdentity(left.identity, right.identity) && left.mode === right.mode && left.nlink === right.nlink && Buffer.from(left.bytes).equals(Buffer.from(right.bytes));
}
function snapshotMatchesIgnoringParent(saved, current, expectedNlink = saved?.nlink) {
  return saved?.present === true && current?.present === true && sameIdentity(saved.identity, current.identity) && saved.mode === current.mode && current.nlink === expectedNlink && Buffer.from(saved.bytes).equals(Buffer.from(current.bytes));
}
async function stagePrivateFile(fileSystem, path, bytes, platform) {
  let handle;
  let identity = null;
  try {
    handle = await fileSystem.open(path, "wx", ENHANCEMENT_CONFIG_FILE_MODE);
    const created = await handle.stat();
    assertSafeConfigStatus(created, "temporary file", platform);
    identity = fileIdentity(created);
    await handle.writeFile(bytes);
    await handle.sync();
    const opened = await handle.stat();
    assertSafeConfigStatus(opened, "temporary file", platform);
    if (!sameIdentity(identity, fileIdentity(opened))) {
      throw new Error("Enhancement config temporary descriptor changed during write");
    }
    if (opened.size !== bytes.byteLength)
      throw new Error("Enhancement config temporary write was incomplete");
    await handle.close();
    handle = null;
    const status = await fileSystem.lstat(path);
    assertSafeConfigStatus(status, "temporary file", platform);
    if (!sameIdentity(fileIdentity(opened), fileIdentity(status))) {
      throw new Error("Enhancement config temporary file changed during write");
    }
    return { path, identity: fileIdentity(status), mode: fileMode(status), nlink: status.nlink };
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
      handle = null;
    }
    if (!identity)
      throw markRestorationIncomplete(error, [path]);
    try {
      if (!await unlinkIfOwned(fileSystem, path, identity)) {
        throw markRestorationIncomplete(error, [path]);
      }
    } catch (cleanupError) {
      if (cleanupError?.restorationIncomplete)
        throw cleanupError;
      throw markRestorationIncomplete(error, [path]);
    }
    throw error;
  } finally {
    if (handle)
      await handle.close();
  }
}
async function syncDirectory(fileSystem, path, platform) {
  if (platform === "win32")
    return;
  const handle = await fileSystem.open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function createPrivateDirectory(fileSystem, path, platform, label) {
  try {
    await fileSystem.mkdir(path, { mode: ENHANCEMENT_CONFIG_DIRECTORY_MODE });
  } catch (error) {
    throw markRestorationIncomplete(error, [path]);
  }
  const status = await fileSystem.lstat(path);
  if (!configDirectoryStatusIsSafe(status, platform)) {
    throw markRestorationIncomplete(new Error(`Unsafe ${label} directory`), [path]);
  }
  return { path, status, identity: fileIdentity(status) };
}
async function moveKnownFileToPrivateDirectory(fileSystem, snapshot, directoryPath, platform, label) {
  const ownedDirectory = await createPrivateDirectory(fileSystem, directoryPath, platform, label);
  const destination = join(directoryPath, basename(directoryPath));
  try {
    const sourceParent = await fileSystem.lstat(dirname(snapshot.path));
    const current = await readFileSnapshot(fileSystem, snapshot.path, sourceParent, platform, snapshot.nlink);
    if (!snapshotsEqual(snapshot, current)) {
      throw new Error(`${label} source changed before quarantine`);
    }
    await fileSystem.rename(snapshot.path, destination);
    const directoryAfter = await fileSystem.lstat(directoryPath);
    if (!sameIdentity(ownedDirectory.identity, fileIdentity(directoryAfter))) {
      throw new Error(`${label} directory changed during quarantine`);
    }
    const moved = await readFileSnapshot(fileSystem, destination, directoryAfter, platform, snapshot.nlink);
    if (!snapshotMatchesIgnoringParent(snapshot, moved)) {
      let replacementRestored = false;
      try {
        replacementRestored = await restoreSnapshotExclusively(fileSystem, moved, snapshot.path, platform);
        if (replacementRestored) {
          await removeOwnedPrivateDirectory(fileSystem, ownedDirectory, platform, label);
        }
      } catch (restoreError) {
        throw markRestorationIncomplete(restoreError, [snapshot.path, destination, directoryPath]);
      }
      if (!replacementRestored) {
        throw markRestorationIncomplete(new Error(`${label} concurrent replacement could not be restored`), [snapshot.path, destination, directoryPath]);
      }
      throw markRestorationIncomplete(new Error(`${label} concurrent replacement detected during quarantine`), [snapshot.path]);
    }
    if (await lstatIfPresent(fileSystem, snapshot.path)) {
      throw new Error(`${label} source was replaced during quarantine`);
    }
    return { moved, ownedDirectory };
  } catch (error) {
    throw markRestorationIncomplete(error, [snapshot.path, destination, directoryPath]);
  }
}
async function removeOwnedPrivateDirectory(fileSystem, ownedDirectory, platform, label) {
  if (!ownedDirectory)
    return;
  const status = await lstatIfPresent(fileSystem, ownedDirectory.path);
  if (!status)
    return;
  if (!configDirectoryStatusIsSafe(status, platform) || !sameIdentity(fileIdentity(status), ownedDirectory.identity)) {
    throw markRestorationIncomplete(new Error(`${label} directory changed during cleanup`), [ownedDirectory.path]);
  }
  try {
    await fileSystem.rmdir(ownedDirectory.path);
    await syncDirectory(fileSystem, dirname(ownedDirectory.path), platform);
  } catch (error) {
    throw markRestorationIncomplete(error, [ownedDirectory.path]);
  }
}
async function unlinkIfOwned(fileSystem, path, identity) {
  const status = await lstatIfPresent(fileSystem, path);
  if (!status)
    return true;
  if (!sameIdentity(fileIdentity(status), identity))
    return false;
  await fileSystem.unlink(path);
  return true;
}
function markRestorationIncomplete(error, evidencePaths) {
  const failure = error instanceof Error ? error : new Error(String(error));
  const combinedEvidence = [...new Set([...failure.evidencePaths || [], ...evidencePaths].filter(Boolean))];
  failure.restorationIncomplete = true;
  failure.evidencePaths = combinedEvidence;
  failure.evidencePath = combinedEvidence.at(-1);
  return failure;
}
function configLockPath(configPath) {
  return join(dirname(configPath), `.${basename(configPath)}.lock`);
}
function configTransactionPaths(lock) {
  const lockName = basename(lock.path);
  const configPath = join(dirname(lock.path), lockName.slice(1, -".lock".length));
  const prefix = join(dirname(configPath), `.${basename(configPath)}.${lock.ownerPid}.${lock.token}`);
  const backupDirectory = `${prefix}.backup`;
  const failedDirectory = `${prefix}.failed`;
  const lockStaleDirectory = `${prefix}.lock.stale`;
  return {
    temporary: `${prefix}.tmp`,
    backupDirectory,
    backup: join(backupDirectory, basename(backupDirectory)),
    failedDirectory,
    failed: join(failedDirectory, basename(failedDirectory)),
    lockStaleDirectory,
    lockStale: join(lockStaleDirectory, basename(lockStaleDirectory))
  };
}
function transactionOwnerFromStaleName(name, configName) {
  const prefix = `.${configName}.`;
  const suffix = ".lock.stale";
  if (!name.startsWith(prefix) || !name.endsWith(suffix))
    return null;
  const owner = name.slice(prefix.length, -suffix.length);
  const separator = owner.indexOf(".");
  if (separator <= 0)
    return null;
  const ownerPid = owner.slice(0, separator);
  const token = owner.slice(separator + 1);
  return LOCK_OWNER_PATTERN.test(`${ownerPid}:${token}
`) ? { ownerPid: Number(ownerPid), token } : null;
}
async function observeOrphanLockStaleEvidence(fileSystem, directoryPath, platform) {
  const observations = [];
  for (const name of await fileSystem.readdir(directoryPath)) {
    const owner = transactionOwnerFromStaleName(name, ENHANCEMENT_CONFIG_FILENAME);
    if (!owner)
      continue;
    const root = join(directoryPath, name);
    const evidencePaths = [root];
    const status = await lstatIfPresent(fileSystem, root);
    if (status && configDirectoryStatusIsSafe(status, platform)) {
      let entries;
      try {
        entries = await fileSystem.readdir(root);
      } catch (error) {
        if (error?.code === "ENOENT")
          continue;
        throw error;
      }
      const current = await lstatIfPresent(fileSystem, root);
      if (!current)
        continue;
      if (!sameIdentity(fileIdentity(current), fileIdentity(status)) || current.ctimeMs !== status.ctimeMs || current.mtimeMs !== status.mtimeMs || !configDirectoryStatusIsSafe(current, platform)) {
        throw new Error("Enhancement config stale lock evidence changed during observation");
      }
      for (const entry of entries) {
        evidencePaths.push(join(root, entry));
      }
    }
    observations.push({ ...owner, evidencePaths });
  }
  return observations;
}
async function waitForOrphanLockStaleEvidence(fileSystem, homeDir, expectedDirectory, deadline, platform, isProcessAlive) {
  while (true) {
    await assertReadDirectoryCurrent(fileSystem, homeDir, expectedDirectory, platform);
    const observations = await observeOrphanLockStaleEvidence(fileSystem, expectedDirectory.path, platform);
    await assertReadDirectoryCurrent(fileSystem, homeDir, expectedDirectory, platform);
    if (observations.length === 0)
      return;
    const states = await Promise.all(observations.map(async (observation) => ({
      observation,
      alive: await isProcessAlive(observation.ownerPid)
    })));
    const evidencePaths = observations.flatMap((observation) => observation.evidencePaths);
    if (states.some((state) => !state.alive)) {
      throw markRestorationIncomplete(new Error("Enhancement config transaction has orphan stale lock evidence"), evidencePaths);
    }
    if (Date.now() >= deadline) {
      throw markRestorationIncomplete(new Error("Timed out waiting for live enhancement config stale lock cleanup"), evidencePaths);
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
  }
}
async function observeConfigLock(fileSystem, path, platform) {
  const parentStatus = await fileSystem.lstat(dirname(path));
  assertSafeConfigDirectoryStatus(parentStatus, "lock directory", platform);
  const snapshot = await readFileSnapshot(fileSystem, path, parentStatus, platform);
  if (!snapshot.present)
    return null;
  const text = decodeSource(snapshot.bytes, "enhancement config lock");
  const match = LOCK_OWNER_PATTERN.exec(text);
  if (!match)
    throw new Error("Invalid enhancement config transaction lock");
  const ownerPid = Number(match[1]);
  if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0)
    throw new Error("Invalid enhancement config transaction lock owner");
  return { ...snapshot, ownerPid, token: match[2] };
}
function defaultIsProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}
async function removeObservedFile(fileSystem, snapshot, platform, label) {
  const transactionPaths = snapshot.ownerPid && snapshot.token ? configTransactionPaths(snapshot) : null;
  const quarantine = transactionPaths?.lockStaleDirectory || join(dirname(snapshot.path), `.${basename(snapshot.path)}.${process.pid}.${randomUUID()}.stale`);
  let moved;
  try {
    moved = await moveKnownFileToPrivateDirectory(fileSystem, snapshot, quarantine, platform, label);
  } catch (error) {
    if (error?.code === "ENOENT")
      return false;
    throw error;
  }
  try {
    await fileSystem.unlink(moved.moved.path);
    await fileSystem.rmdir(moved.ownedDirectory.path);
    await syncDirectory(fileSystem, dirname(snapshot.path), platform);
  } catch (error) {
    try {
      await stagePrivateFile(fileSystem, snapshot.path, Buffer.from(snapshot.bytes), platform);
    } catch (restoreError) {
      if (restoreError?.code !== "EEXIST") {
        throw markRestorationIncomplete(restoreError, [moved.moved.path, quarantine, snapshot.path]);
      }
    }
    throw markRestorationIncomplete(error, [moved.moved.path, quarantine, snapshot.path]);
  }
  return true;
}
async function reclaimDeadConfigLock(fileSystem, lock, platform, isProcessAlive) {
  if (await isProcessAlive(lock.ownerPid))
    return false;
  const residuePaths = [];
  const transactionPaths = configTransactionPaths(lock);
  for (const path of [
    transactionPaths.temporary,
    transactionPaths.backupDirectory,
    transactionPaths.failedDirectory,
    transactionPaths.lockStaleDirectory
  ]) {
    const status = await lstatIfPresent(fileSystem, path);
    if (!status)
      continue;
    residuePaths.push(path);
    if (!status.isDirectory())
      continue;
    for (const name of await fileSystem.readdir(path)) {
      residuePaths.push(join(path, name));
    }
  }
  const legacyBackupName = basename(transactionPaths.backupDirectory);
  const rejectedPrefix = `${legacyBackupName}.rejected-`;
  for (const name of await fileSystem.readdir(dirname(lock.path))) {
    if (name.startsWith(rejectedPrefix))
      residuePaths.push(join(dirname(lock.path), name));
  }
  if (residuePaths.length > 0) {
    throw markRestorationIncomplete(new Error("Dead enhancement config transaction has unresolved filesystem evidence"), [lock.path, ...residuePaths]);
  }
  if (!await removeObservedFile(fileSystem, lock, platform, "Enhancement config transaction lock")) {
    throw new Error("Enhancement config transaction lock changed during reclamation");
  }
  return true;
}
async function waitForConfigUnlock(fileSystem, lockPath, deadline, platform, isProcessAlive, homeDir = null, expectedDirectory = null) {
  if (expectedDirectory) {
    await waitForOrphanLockStaleEvidence(fileSystem, homeDir, expectedDirectory, deadline, platform, isProcessAlive);
  }
  const lock = await observeConfigLock(fileSystem, lockPath, platform);
  if (expectedDirectory) {
    await assertReadDirectoryCurrent(fileSystem, homeDir, expectedDirectory, platform);
  }
  if (!lock) {
    if (expectedDirectory) {
      await waitForOrphanLockStaleEvidence(fileSystem, homeDir, expectedDirectory, deadline, platform, isProcessAlive);
    }
    return false;
  }
  if (await reclaimDeadConfigLock(fileSystem, lock, platform, isProcessAlive))
    return false;
  if (Date.now() >= deadline)
    throw new Error("Timed out waiting for enhancement config update");
  await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
  return true;
}
async function rejectRollbackLink(fileSystem, source, target, platform, cause, expectedTarget = null) {
  const before = await lstatIfPresent(fileSystem, target);
  if (!before)
    throw markRestorationIncomplete(cause, [source.path, target]);
  const rejected = `${source.path}.rejected-${randomUUID()}`;
  try {
    await fileSystem.rename(target, rejected);
  } catch (error) {
    throw markRestorationIncomplete(error, [source.path, target, rejected]);
  }
  try {
    const movedStatus = await fileSystem.lstat(rejected);
    if (!sameIdentity(fileIdentity(before), fileIdentity(movedStatus))) {
      throw new Error("Rejected enhancement config rollback link changed during quarantine");
    }
    if (expectedTarget) {
      const parentStatus = await fileSystem.lstat(dirname(rejected));
      const moved = await readFileSnapshot(fileSystem, rejected, parentStatus, platform, expectedTarget.nlink);
      if (!snapshotMatchesIgnoringParent(expectedTarget, moved, expectedTarget.nlink)) {
        throw new Error("Rejected enhancement config rollback link changed during quarantine");
      }
    }
  } catch (error) {
    throw markRestorationIncomplete(error, [source.path, target, rejected]);
  }
  throw markRestorationIncomplete(cause, [source.path, rejected]);
}
async function restoreSnapshotExclusively(fileSystem, source, target, platform) {
  try {
    await fileSystem.link(source.path, target);
  } catch (error) {
    if (error?.code === "EEXIST")
      return false;
    throw error;
  }
  const targetParentStatus = await fileSystem.lstat(dirname(target));
  let linkedTarget;
  try {
    linkedTarget = await readFileSnapshot(fileSystem, target, targetParentStatus, platform, 2);
  } catch (error) {
    return rejectRollbackLink(fileSystem, source, target, platform, error);
  }
  let linkedSource;
  try {
    const sourceParentStatus = await fileSystem.lstat(dirname(source.path));
    linkedSource = await readFileSnapshot(fileSystem, source.path, sourceParentStatus, platform, 2);
  } catch (error) {
    return rejectRollbackLink(fileSystem, source, target, platform, error, linkedTarget);
  }
  if (!snapshotMatchesIgnoringParent(source, linkedSource, 2) || !snapshotMatchesIgnoringParent(source, linkedTarget, 2)) {
    return rejectRollbackLink(fileSystem, source, target, platform, new Error("Enhancement config rollback source changed before restoration"), linkedTarget);
  }
  if (!await unlinkIfOwned(fileSystem, source.path, source.identity)) {
    return rejectRollbackLink(fileSystem, source, target, platform, new Error("Enhancement config rollback source changed during restoration"));
  }
  let restored;
  try {
    restored = await readFileSnapshot(fileSystem, target, targetParentStatus, platform);
  } catch (error) {
    return rejectRollbackLink(fileSystem, source, target, platform, error);
  }
  if (!snapshotMatchesIgnoringParent(source, restored, 1)) {
    return rejectRollbackLink(fileSystem, source, target, platform, new Error("Enhancement config rollback changed after restoration"), restored);
  }
  return true;
}
async function readEnhancementConfig({
  homeDir,
  manifest,
  filename = ENHANCEMENT_CONFIG_FILENAME,
  fileSystem = defaultFileSystem,
  platform = process.platform,
  waitForUnlockMs = DEFAULT_LOCK_WAIT_MS,
  isProcessAlive = defaultIsProcessAlive
} = {}) {
  const path = enhancementConfigPath(homeDir, { filename });
  if (!Number.isSafeInteger(waitForUnlockMs) || waitForUnlockMs < 0) {
    throw new TypeError("Enhancement config lock wait must be a non-negative safe integer");
  }
  if (typeof isProcessAlive !== "function")
    throw new TypeError("Enhancement config process probe must be a function");
  const lockPath = configLockPath(path);
  const deadline = Date.now() + waitForUnlockMs;
  while (true) {
    const directory = await inspectConfigDirectory(fileSystem, homeDir, { platform });
    if (!directory.status) {
      await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
      return null;
    }
    if (await waitForConfigUnlock(fileSystem, lockPath, deadline, platform, isProcessAlive, homeDir, directory)) {
      await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
      continue;
    }
    await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
    let snapshot;
    try {
      snapshot = await readFileSnapshot(fileSystem, path, directory.status, platform);
      await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
    } catch (error) {
      if (await waitForConfigUnlock(fileSystem, lockPath, deadline, platform, isProcessAlive, homeDir, directory)) {
        await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
        continue;
      }
      await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
      throw error;
    }
    if (await waitForConfigUnlock(fileSystem, lockPath, deadline, platform, isProcessAlive, homeDir, directory)) {
      await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
      continue;
    }
    await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
    if (!snapshot.present) {
      await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
      return null;
    }
    const config = parseStoredEnhancementConfig(snapshot.bytes, manifest);
    await assertReadDirectoryCurrent(fileSystem, homeDir, directory, platform);
    return config;
  }
}

// src/generic/patcher/core.mjs
import { existsSync, mkdirSync, renameSync, writeFileSync } from "fs";
import { dirname as dirname2, join as join2 } from "path";
import { fileURLToPath, pathToFileURL } from "url";
var PATCHER_DIR = dirname2(fileURLToPath(import.meta.url));
var ACORN_URL = "https://unpkg.com/acorn@8.16.0/dist/acorn.js";
async function loadAcorn(rootDir = PATCHER_DIR) {
  const acornCache = join2(rootDir, "vendor", "acorn.cjs");
  try {
    if (!existsSync(acornCache)) {
      mkdirSync(dirname2(acornCache), { recursive: true });
      const response = await fetch(ACORN_URL);
      if (!response.ok)
        return null;
      const temp = `${acornCache}.${process.pid}.tmp`;
      writeFileSync(temp, await response.text(), "utf8");
      renameSync(temp, acornCache);
    }
    const module = await import(pathToFileURL(acornCache).href);
    const acorn = typeof module.parse === "function" ? module : module.default;
    return acorn && typeof acorn.parse === "function" ? acorn : null;
  } catch {
    return null;
  }
}
function findNodes(node, predicate, results = []) {
  if (!node || typeof node !== "object")
    return results;
  if (predicate(node))
    results.push(node);
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (!child || typeof child !== "object")
      continue;
    if (Array.isArray(child)) {
      for (const item of child)
        findNodes(item, predicate, results);
    } else {
      findNodes(child, predicate, results);
    }
  }
  return results;
}
function inspectPatcherSource(source) {
  const versionMatch = source.match(/Version:\s*([\d.]+)/);
  return {
    size: source.length,
    version: versionMatch ? versionMatch[1] : "unknown"
  };
}
async function applyContextLimitPatch(source, { dryRun, verify, rootDir }) {
  const ENV_EXPR = "(+process.env.CLAUDE_CODE_CONTEXT_LIMIT||+process.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS||200000)";
  const dualRe = /var\s+([\w$]+)\s*=\s*200000\s*,\s*([\w$]+)\s*=\s*200000\s*,\s*([\w$]+)\s*=\s*32000\s*,\s*([\w$]+)\s*=\s*128000(?:\s*,\s*([\w$]+)\s*=\s*1e6)?(?=\s*;)/;
  const alreadyRe = new RegExp("var\\s+([\\w$]+)\\s*=\\s*\\(\\+process\\.env\\.CLAUDE_CODE_CONTEXT_LIMIT\\|\\|\\+process\\.env\\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\\|\\|200000\\)\\s*,\\s*([\\w$]+)\\s*=\\s*\\(\\+process\\.env\\.CLAUDE_CODE_CONTEXT_LIMIT\\|\\|\\+process\\.env\\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\\|\\|200000\\)\\s*,\\s*[\\w$]+\\s*=\\s*32000\\s*,\\s*[\\w$]+\\s*=\\s*128000(?:\\s*,\\s*[\\w$]+\\s*=\\s*1e6)?(?=\\s*;)");
  const dualMatch = dualRe.exec(source);
  const alreadyMatch = alreadyRe.exec(source);
  if (!dualMatch && !alreadyMatch) {
    if (!source.includes("200000"))
      return { status: "skipped", detail: "not present in this version" };
    return { status: "failed", detail: "context default constants not found" };
  }
  const match = dualMatch || alreadyMatch;
  const [, varA, varB, varC, varD, varE] = match;
  const replacements = [];
  const moduleSeparator = `
/*__CLAWGOD_MODULE_BOUNDARY__*/
`;
  const codeSplit = source.includes(moduleSeparator);
  const refreshMarker = "globalThis.__clawgod_context_limit_refresh_v1__=";
  const refreshCall = ",globalThis.__clawgod_context_limit_refresh_v1__?.()";
  const refreshRegistration = `;${refreshMarker}()=>{${varA}=${ENV_EXPR};${varB}=${ENV_EXPR}}`;
  if (dualMatch) {
    replacements.push({
      start: dualMatch.index,
      end: dualMatch.index + dualMatch[0].length,
      replacement: `var ${varA}=${ENV_EXPR},${varB}=${ENV_EXPR},${varC}=32000,${varD}=128000${varE ? `,${varE}=1e6` : ""}${codeSplit && !source.includes(refreshMarker) ? refreshRegistration : ""}`
    });
    const cmpRe = /\breturn ([\w$]+)\?([\w$]+)\(\1\)>200000:!1/g;
    let cm;
    while ((cm = cmpRe.exec(source)) !== null) {
      const comparison = `${cm[2]}(${cm[1]})>200000`;
      const start = cm.index + cm[0].indexOf(comparison);
      replacements.push({
        start,
        end: start + comparison.length,
        replacement: `${cm[2]}(${cm[1]})>${ENV_EXPR}`
      });
    }
  }
  if (codeSplit && alreadyMatch && !source.includes(refreshMarker)) {
    replacements.push({ start: match.index + match[0].length, end: match.index + match[0].length, replacement: refreshRegistration });
  }
  const envReassign = `;${varA}=${ENV_EXPR};${varB}=${ENV_EXPR};`;
  const isEnvAssign = (node) => node?.type === "CallExpression" && node.callee?.type === "MemberExpression" && node.callee.object?.name === "Object" && node.callee.property?.name === "assign" && node.arguments?.length >= 2 && node.arguments[0]?.type === "MemberExpression" && node.arguments[0].object?.name === "process" && node.arguments[0].property?.name === "env";
  const acorn = await loadAcorn(rootDir);
  if (acorn) {
    const modules = codeSplit ? source.split(moduleSeparator) : [source];
    let moduleOffset = 0;
    let envAssignCount = 0;
    for (const moduleSource of modules) {
      if (envAssignCount >= 6)
        break;
      if (!moduleSource.includes("Object.assign(process.env")) {
        moduleOffset += moduleSource.length + (codeSplit ? moduleSeparator.length : 0);
        continue;
      }
      try {
        const ast = acorn.parse(moduleSource, {
          ecmaVersion: "latest",
          sourceType: codeSplit ? "module" : "script",
          allowReturnOutsideFunction: !codeSplit
        });
        const statements = findNodes(ast, (node) => node.type === "ExpressionStatement");
        for (const statement of statements) {
          const directCalls = statement.expression?.type === "SequenceExpression" ? statement.expression.expressions.filter(isEnvAssign) : isEnvAssign(statement.expression) ? [statement.expression] : [];
          for (const call of directCalls) {
            if (envAssignCount >= 6)
              break;
            const insertion = codeSplit ? refreshCall : envReassign;
            const localEnd = codeSplit ? call.end : statement.end;
            const end = moduleOffset + localEnd;
            if (!source.startsWith(insertion, end)) {
              replacements.push({ start: end, end, replacement: insertion });
            }
            envAssignCount++;
          }
        }
      } catch {}
      moduleOffset += moduleSource.length + (codeSplit ? moduleSeparator.length : 0);
    }
  }
  if (replacements.length === 0)
    return { status: "already", detail: "already applied" };
  if (verify)
    return { status: "verify", count: replacements.length };
  let next = source;
  if (!dryRun) {
    replacements.sort((left, right) => right.start - left.start);
    for (const replacement of replacements) {
      next = next.slice(0, replacement.start) + replacement.replacement + next.slice(replacement.end);
    }
  }
  return { status: "applied", count: replacements.length, code: next };
}
var patches = [
  {
    order: 0,
    name: "USER_TYPE \u2192 ant",
    pattern: /function ([\w$]+)\(\)\{return"external"\}/g,
    replacer: (match, fn) => `function ${fn}(){return"ant"}`,
    sentinel: 'return"external"'
  },
  {
    order: 1,
    name: "Worker resolver for plain Bun cli.cjs (target shape)",
    pattern: /if\(([\w$]+)\(\)\)return\{cmd:process\.execPath,prefixArgs:\[\],target:process\.execPath\};let ([\w$]+)=process\.argv\[1\];if\(!\2\)return\{cmd:process\.execPath,prefixArgs:\[\],target:process\.execPath\};return\{cmd:process\.execPath,prefixArgs:\[\2\],target:\2\}/g,
    replacer: (match, standalone, entry) => `let ${entry}=process.argv[1];if(${entry}&&/(?:^|[\\/])cli\\.cjs$/.test(${entry}))return{cmd:process.execPath,prefixArgs:[${entry}],target:${entry}}/*__clawgod_plain_bun_worker__*/;if(${standalone}())return{cmd:process.execPath,prefixArgs:[],target:process.execPath};if(!${entry})return{cmd:process.execPath,prefixArgs:[],target:process.execPath};return{cmd:process.execPath,prefixArgs:[${entry}],target:${entry}}`,
    appliedMarker: "/*__clawgod_plain_bun_worker__*/",
    knownShape: /if\([\w$]+\(\)\)return\{cmd:process\.execPath,prefixArgs:\[\],target:process\.execPath\};let [\w$]+=process\.argv\[1\];if\(![\w$]+\)return\{cmd:process\.execPath,prefixArgs:\[\],target:process\.execPath\};return\{cmd:process\.execPath,prefixArgs:/,
    optional: true
  },
  {
    order: 2,
    name: "Worker resolver for plain Bun cli.cjs (legacy shape)",
    pattern: /if\(([\w$]+)\(\)\)return\{cmd:process\.execPath,prefixArgs:\[\]\};let ([\w$]+)=process\.argv\[1\];if\(!\2\)return\{cmd:process\.execPath,prefixArgs:\[\]\};return\{cmd:process\.execPath,prefixArgs:\[\2\]\}/g,
    replacer: (match, standalone, entry) => `let ${entry}=process.argv[1];if(${entry}&&/(?:^|[\\/])cli\\.cjs$/.test(${entry}))return{cmd:process.execPath,prefixArgs:[${entry}]}/*__clawgod_plain_bun_worker__*/;if(${standalone}())return{cmd:process.execPath,prefixArgs:[]};if(!${entry})return{cmd:process.execPath,prefixArgs:[]};return{cmd:process.execPath,prefixArgs:[${entry}]}`,
    appliedMarker: "/*__clawgod_plain_bun_worker__*/",
    knownShape: /if\([\w$]+\(\)\)return\{cmd:process\.execPath,prefixArgs:\[\]\};let [\w$]+=process\.argv\[1\];if\(![\w$]+\)return\{cmd:process\.execPath,prefixArgs:\[\]\};return\{cmd:process\.execPath,prefixArgs:/,
    optional: true
  },
  {
    order: 3,
    name: "GrowthBook env overrides",
    pattern: /function ([\w$]+)\(\)\{if\(!([\w$]+)\)\2=!0;return ([\w$]+)\}/g,
    replacer: (match, fn, flag, value) => `function ${fn}(){if(!${flag}){${flag}=!0;try{let e=process.env.CLAUDE_INTERNAL_FC_OVERRIDES;if(e)${value}=JSON.parse(e)}catch(e){}}return ${value}}`,
    unique: true,
    optional: true
  },
  {
    order: 4,
    name: "GrowthBook config overrides",
    pattern: /function ([\w$]+)\(\)\{return\}(function)/g,
    replacer: (match, fn, next) => `function ${fn}(){return null}${next}`,
    selectIndex: 0,
    optional: true,
    validate: (match, code) => {
      const position = code.indexOf(match);
      const nearby = code.substring(Math.max(0, position - 500), position + 500);
      return nearby.includes("growthBook") || nearby.includes("GrowthBook") || nearby.includes("FeatureValue");
    }
  },
  {
    order: 57,
    name: "Shell integration \u2192 claude.orig (multitool dispatch fix)",
    pattern: /if\(([\w$]+)\(\)==="bun"\)return\[([\w$]+)\(([\w$]+),"claude"\)\];if\([\w$]+\(\)==="windows"\)return\[\2\(\3,"claude\.cmd"\),\2\(\3,"claude\.exe"\)\];return\[\2\(\3,"bin","claude"\)\]/g,
    replacer: (match) => match.replace(/claude/g, "claude.orig"),
    appliedMarker: '"claude.orig.cmd"',
    optional: true
  }
];
async function applyClaudeApiSkillLazyDocsPatch(source, { dryRun, verify }) {
  const appliedMarker = "Only the essential reference is included to preserve context.";
  if (source.includes(appliedMarker))
    return { status: "already", detail: "already applied" };
  const guide = source.indexOf('n.indexOf("## Reading Guide")');
  if (guide === -1)
    return { status: "skipped", detail: "not present in this version" };
  const beforeGuide = source.slice(Math.max(0, guide - 300), guide);
  const startMatch = [...beforeGuide.matchAll(/function ([\w$]+)\(e,t,r\)\{let n=([\w$]+)\(r\.SKILL_PROMPT,r\),o=$/g)].at(-1);
  if (!startMatch)
    return { status: "failed", detail: "prompt builder start marker not found" };
  const start = guide - beforeGuide.length + startMatch.index;
  const body = source.slice(start, start + 5000);
  const referenceMatch = body.match(/,a=([\w$]+)\.replace\(\/\\\{lang\\\}\/g,e\?\?"unknown"\)/);
  const subcommandMatch = body.match(/,([\w$]+)\(t\)!=="prompt-audit"/);
  const docsMatch = body.match(/\+([\w$]+)\([^,]+,r\.SKILL_FILES,r\)\)/);
  const endMatch = body.match(/;return s\.join\(`(?:\\n\\n|\n\n)`\)\}/);
  if (!referenceMatch || !subcommandMatch || !docsMatch || !endMatch) {
    return { status: "failed", detail: "prompt builder structure not recognized" };
  }
  const functionName = startMatch[1];
  const promptFormatter = startMatch[2];
  const referencePrompt = referenceMatch[1];
  const parseSubcommand = subcommandMatch[1];
  const formatDocs = docsMatch[1];
  const replacement = `function ${functionName}(e,t,r){let n=${promptFormatter}(r.SKILL_PROMPT,r),o=n.indexOf("## Reading Guide"),s=[o!==-1?n.slice(0,o).trimEnd():n],a=${referencePrompt}.replace(/\\{lang\\}/g,e??"unknown"),p=${parseSubcommand}(t),d=[];if(p==="migrate")d.push("shared/model-migration.md");else if(p==="prompt-audit")d.push("shared/prompt-audit.md");else if(e)d.push(\`\${e}/claude-api/README.md\`);s.push(a);if(d.length)s.push(\`---\\n\\n## Included Documentation\\n\\n\`+${formatDocs}(d,r.SKILL_FILES,r));s.push("---\\n\\n## Additional Documentation\\n\\n${appliedMarker} When the task needs streaming, tools, files, batches, caching, token counting, managed agents, or another language-specific guide, use Read on the corresponding path in the skill files.");let l=n.indexOf("## When to Use WebFetch");if(l!==-1)s.push(n.slice(l).trimEnd());if(t)s.push(\`## User Request\\n\\n\${t}\`);return s.join(\`\\n\\n\`)}`;
  if (verify)
    return { status: "verify", count: 1 };
  if (dryRun)
    return { status: "applied", count: 1, code: source };
  const end = start + endMatch.index + endMatch[0].length;
  return { status: "applied", count: 1, code: source.slice(0, start) + replacement + source.slice(end) };
}
var customPatches = [{
  order: 61,
  name: "Context limit configurable",
  apply: applyContextLimitPatch
}, {
  order: 64,
  name: "Claude API skill lazy docs",
  apply: applyClaudeApiSkillLazyDocsPatch
}];
var coreRegistry = Object.freeze({
  id: "core",
  patches: Object.freeze(patches),
  customPatches: Object.freeze(customPatches)
});

// src/generic/enhancements.json
var enhancements_default = `[
  { "id": "chrome", "kind": "patch" },
  { "id": "computer-use", "kind": "patch" },
  { "id": "design-canvas", "kind": "patch" },
  { "id": "agents", "kind": "patch" },
  { "id": "planning", "kind": "patch" },
  { "id": "voice", "kind": "patch" },
  { "id": "auto-mode", "kind": "patch" },
  { "id": "unrestricted-tools", "kind": "patch" },
  { "id": "paste-images", "kind": "patch" },
  { "id": "privacy", "kind": "patch" },
  { "id": "branding", "kind": "patch" },
  { "id": "claude-hud", "kind": "plugin" },
  { "id": "claude-mem", "kind": "plugin" },
  { "id": "superpowers", "kind": "plugin" }
]
`;

// src/generic/patcher/enhancements/agents.mjs
var agentTeamsPatch = {
  order: 5,
  name: "Agent Teams always enabled",
  pattern: /function ([\w$]+)\(\)\{if\(![\w$]+\(process\.env\.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS\)&&![\w$]+\(\)\)return!1;if\(![\w$]+\("tengu_amber_flint",!0\)\)return!1;return!0\}|function ([\w$]+)\(\)\{if\(![\w$]+\.[\w$]+&&![\w$]+\(\)\)return!1;if\(![\w$]+\("tengu_amber_flint",!0\)\)return!1;return!0\}/g,
  replacer: (match, firstFn, secondFn) => `function ${firstFn || secondFn}(){return!0}`,
  sentinel: "tengu_amber_flint"
};
var sessionMetadataPatch = {
  order: 6,
  name: "Agents view session metadata",
  pattern: /function ([\w$]+)\(([\w$]+)\)\{for\(let ([\w$]+)=0;\3<\2\.length;\3\+\+\)\{let ([\w$]+)=\2\[\3\];if\((\4==="--debug"\|\|\4==="-d"\|\|\4==="--debug-to-stderr"\|\|\4==="-d2e"\|\|\4\.startsWith\("--debug="\)\|\|\4\.startsWith\("--debug-file="\))\)continue;if\(\4==="--debug-file"&&\3\+1<\2\.length\)\{\3\+\+;continue\}return!1\}return!0\}/g,
  replacer: (match, fn, args, index, argument, debugFlags) => `function ${fn}(${args}){for(let ${index}=0;${index}<${args}.length;${index}++){let ${argument}=${args}[${index}];if(${debugFlags})continue;if(${argument}==="--debug-file"&&${index}+1<${args}.length){${index}++;continue}if(${argument}==="--session-id"/*__clawgod_agents_session_id__*/&&${index}+1<${args}.length){${index}++;continue}return!1}return!0}`,
  appliedMarker: "/*__clawgod_agents_session_id__*/",
  unique: true
};
var defaultAgentsViewPatch = {
  order: 7,
  name: "Default Agents view with auto Chrome",
  pattern: /,([\w$]+)=([\w$]+)\.hasAgentsPositional&&([\w$]+)\(([\w$]+)\);if\(\(\1\|\|\3\(([\w$]+)\)&&process\.stdin\.isTTY\)&&process\.stdout\.isTTY\)\{/g,
  replacer: (match, explicit, parsed, validator, rest) => `,${explicit}=${parsed}.hasAgentsPositional&&${validator}(${rest});if((${explicit}||${validator}(${parsed}.rest/*__clawgod_default_agents_view__*/)&&process.stdin.isTTY)&&process.stdout.isTTY){`,
  appliedMarker: "/*__clawgod_default_agents_view__*/",
  knownShape: /hasAgentsPositional&&[\w$]+\([\w$]+\);if\(\([\w$]+\|\|[\w$]+\([\w$]+\)&&process\.stdin\.isTTY\)&&process\.stdout\.isTTY\)/,
  unique: true
};
var terminalHeightPatch = {
  order: 8,
  name: "Chat Agent list fits terminal height",
  pattern: /\{columns:([\w$]+)\}=([\w$]+)\(\)([\s\S]{0,8000}?)\{windowStart:([\w$]+),windowEnd:([\w$]+),moreAbove:([\w$]+),moreBelow:([\w$]+)\}=([\w$]+)\(([\w$]+),([\w$]+)\.length,([\w$]+)\)/g,
  replacer: (match, columns, dimensions, middle, windowStart, windowEnd, moreAbove, moreBelow, windowFn, selected, tasks, limit) => `{columns:${columns},rows:__clawgodTerminalRows}=${dimensions}(),__clawgodMaxChatAgentRows=Math.max(1,Math.min(${limit},__clawgodTerminalRows-6))${middle}{windowStart:${windowStart},windowEnd:${windowEnd},moreAbove:${moreAbove},moreBelow:${moreBelow}}=${windowFn}(${selected},${tasks}.length,__clawgodMaxChatAgentRows/*__clawgod_chat_agent_rows__*/)`,
  appliedMarker: "/*__clawgod_chat_agent_rows__*/",
  validate: (match, code) => code.substring(Math.max(0, code.indexOf(match) - 300), code.indexOf(match)).includes("showWorkflows"),
  optional: true,
  unique: true
};
var overflowPatch = {
  order: 9,
  name: "Chat Agent list keeps overflow indicator",
  pattern: /([\w$]+)\.length>([\w$]+)&&([\w$]+)\.jsx\(([\w$]+),\{justifyContent:"flex-end",children:/g,
  replacer: (match, tasks, limit, react, box) => `${tasks}.length>__clawgodMaxChatAgentRows/*__clawgod_chat_agent_more__*/&&${react}.jsx(${box},{justifyContent:"flex-end",children:`,
  appliedMarker: "/*__clawgod_chat_agent_more__*/",
  validate: (match, code) => {
    const marker = code.indexOf("/*__clawgod_chat_agent_rows__*/");
    const position = code.indexOf(match);
    return marker >= 0 && position > marker && position - marker < 4000;
  },
  optional: true,
  unique: true
};
var collapsedStatePatch = {
  order: 10,
  name: "Agents directories default collapsed state",
  pattern: /,\[([\w$]+),([\w$]+)\]=([\w$]+)\.useState\(\(\)=>\{let [\w$]+=[\w$]+;return new Set\([\s\S]{0,500}?\)\}\),([\w$]+)=\3\.useRef\(\1\);\4\.current=\1;let\[[\w$]+,[\w$]+\]=\3\.useState\(\(\)=>new Set\)/g,
  replacer: (match, collapsed, setCollapsed, react, collapsedRef) => {
    const anchor = `${collapsedRef}=${react}.useRef(${collapsed});${collapsedRef}.current=${collapsed};`;
    return match.replace(anchor, `${anchor}let __clawgodShouldDefaultCollapseDirectories=${react}.useRef(${collapsed}.size===0),__clawgodCollapsedDirectoryKeys=${react}.useRef(new Set),__clawgodSetCollapsedGroups=${setCollapsed},__clawgodReact=${react};/*__clawgod_collapsed_directory_state__*/`);
  },
  appliedMarker: "/*__clawgod_collapsed_directory_state__*/",
  optional: true,
  unique: true
};
var collapsedRowsPatch = {
  order: 11,
  name: "Agents directories default collapsed rows",
  pattern: /if\(([\w$]+)\.size>0\)([\w$]+)=\2\.filter\(\(([\w$]+)\)=>\3\.kind==="header"\|\|!\1\.has\(([\w$]+)\(\3\.group\)\)\);function /g,
  replacer: (match, collapsed, rows, row, groupKey) => `__clawgodReact.useLayoutEffect(()=>{let keys=[];if(__clawgodShouldDefaultCollapseDirectories.current)for(let row of ${rows})if(row.kind==="header"){let key=${groupKey}(row.group);if(key.startsWith("directory:")&&!__clawgodCollapsedDirectoryKeys.current.has(key))__clawgodCollapsedDirectoryKeys.current.add(key),keys.push(key)}__clawgodSetCollapsedGroups((current)=>{let next=new Set(current),changed=!1,marker="group:__clawgod_expanded_directories__";if(!next.has(marker))next.add(marker),changed=!0;for(let key of keys)if(!next.has(key))next.add(key),changed=!0;return changed?next:current})},[${rows}]);${match.replace(`${collapsed}.size>0`, `${collapsed}.size/*__clawgod_default_collapsed_directories__*/>0`)}`,
  appliedMarker: "/*__clawgod_default_collapsed_directories__*/",
  validate: (match, code) => code.includes("/*__clawgod_collapsed_directory_state__*/"),
  optional: true,
  unique: true
};
var independentPatches = [
  agentTeamsPatch,
  sessionMetadataPatch,
  terminalHeightPatch,
  overflowPatch,
  collapsedStatePatch,
  collapsedRowsPatch
];
function createAgentsRegistry({ chromeEnabled }) {
  const patches2 = chromeEnabled ? [...independentPatches, defaultAgentsViewPatch].sort((left, right) => left.order - right.order) : [...independentPatches];
  return Object.freeze({
    id: "agents",
    patches: Object.freeze(patches2),
    customPatches: Object.freeze([])
  });
}

// src/generic/patcher/enhancements/auto-mode.mjs
var patches2 = [
  {
    order: 26,
    name: "Auto-mode unlock for third-party API (provider helper gate)",
    pattern: /if\(!([\w$]+)\(([\w$]+)\)\)return!1;(?=(?:(?!function\s).){0,300}!=="firstParty")/g,
    replacer: () => "",
    optional: true
  },
  {
    order: 27,
    name: "Auto-mode unlock for third-party API (inline gate)",
    pattern: /if\(([\w$]+)!=="firstParty"&&(?:\1!=="anthropicAws"|![\w$]+\(\1\))[^;]*\)return!1;/g,
    replacer: () => "",
    optional: true
  },
  {
    order: 28,
    name: "Auto-mode unlock for third-party API (provider opt-in helper)",
    pattern: /function ([\w$]+)\(([\w$]+)\)\{if\(\2==="firstParty"\|\|\2==="anthropicAws"\)return!0;return [\w$]+\(process\.env\.CLAUDE_CODE_ENABLE_AUTO_MODE\)\}/g,
    replacer: (match, fn) => `function ${fn}(){return!0}`,
    sentinel: "process.env.CLAUDE_CODE_ENABLE_AUTO_MODE)}"
  }
];
var autoModeRegistry = Object.freeze({
  id: "auto-mode",
  patches: Object.freeze(patches2),
  customPatches: Object.freeze([])
});

// src/generic/patcher/enhancements/branding.mjs
var patches3 = [
  {
    order: 30,
    name: "Logo + brand color \u2192 green (RGB dark)",
    pattern: /clawd_body:"rgb\(215,119,87\)"/g,
    replacer: () => 'clawd_body:"rgb(34,197,94)"',
    sentinel: 'clawd_body:"rgb(215,119,87)"'
  },
  {
    order: 31,
    name: "Logo + brand color \u2192 green (ANSI)",
    pattern: /clawd_body:"ansi:redBright"/g,
    replacer: () => 'clawd_body:"ansi:greenBright"',
    sentinel: 'clawd_body:"ansi:redBright"'
  },
  {
    order: 32,
    name: "Theme claude color \u2192 green (dark)",
    pattern: /claude:"rgb\(215,119,87\)"/g,
    replacer: () => 'claude:"rgb(34,197,94)"',
    sentinel: 'claude:"rgb(215,119,87)"'
  },
  {
    order: 33,
    name: "Theme claude color \u2192 green (light)",
    pattern: /claude:"rgb\(255,153,51\)"/g,
    replacer: () => 'claude:"rgb(22,163,74)"',
    sentinel: 'claude:"rgb(255,153,51)"'
  },
  {
    order: 34,
    name: "Shimmer \u2192 green",
    pattern: /claudeShimmer:"rgb\(2[34]5,1[45]9,1[12]7\)"/g,
    replacer: () => 'claudeShimmer:"rgb(74,222,128)"',
    appliedMarker: 'claudeShimmer:"rgb(74,222,128)"'
  },
  {
    order: 35,
    name: "Shimmer light \u2192 green",
    pattern: /claudeShimmer:"rgb\(255,183,101\)"/g,
    replacer: () => 'claudeShimmer:"rgb(34,197,94)"',
    sentinel: 'claudeShimmer:"rgb(255,183,101)"'
  },
  {
    order: 36,
    name: "Hex brand color \u2192 green",
    pattern: /#da7756/g,
    replacer: () => "#22c55e",
    sentinel: "#da7756"
  },
  {
    order: 37,
    name: "Theme claude color \u2192 green (ANSI)",
    pattern: /claude:"ansi:redBright"/g,
    replacer: () => 'claude:"ansi:greenBright"'
  },
  {
    order: 38,
    name: "Shimmer \u2192 green (ANSI)",
    pattern: /claudeShimmer:"ansi:yellowBright"/g,
    replacer: () => 'claudeShimmer:"ansi:greenBright"'
  },
  {
    order: 39,
    name: "Brief label claude color \u2192 green (RGB dark)",
    pattern: /briefLabelClaude:"rgb\(215,119,87\)"/g,
    replacer: () => 'briefLabelClaude:"rgb(34,197,94)"'
  },
  {
    order: 40,
    name: "Brief label claude color \u2192 green (RGB light)",
    pattern: /briefLabelClaude:"rgb\(255,153,51\)"/g,
    replacer: () => 'briefLabelClaude:"rgb(22,163,74)"'
  },
  {
    order: 41,
    name: "Brief label claude color \u2192 green (ANSI)",
    pattern: /briefLabelClaude:"ansi:redBright"/g,
    replacer: () => 'briefLabelClaude:"ansi:greenBright"'
  }
];
var brandingRegistry = Object.freeze({
  id: "branding",
  patches: Object.freeze(patches3),
  customPatches: Object.freeze([])
});

// src/generic/patcher/enhancements/chrome.mjs
function isChromeClientFactory(node) {
  let bodyStatements;
  if (node.body?.type === "BlockStatement")
    bodyStatements = node.body.body;
  else
    return false;
  if (!node.params || node.params.length !== 1)
    return false;
  if (bodyStatements.length !== 1 || bodyStatements[0].type !== "ReturnStatement")
    return false;
  const returned = bodyStatements[0].argument;
  if (!returned || returned.type !== "ConditionalExpression")
    return false;
  if (returned.test?.type !== "MemberExpression" || returned.test.property?.name !== "bridgeConfig")
    return false;
  const alternate = returned.alternate;
  if (!alternate || alternate.type !== "ConditionalExpression")
    return false;
  if (alternate.test?.type !== "MemberExpression" || alternate.test.property?.name !== "getSocketPaths")
    return false;
  return true;
}
async function applyClaudeChromeSocketPatch(source, { dryRun, verify, rootDir }) {
  const replacements = [];
  const seen = new Set;
  const needs = {
    clientFactory: !source.includes("__ccpp_bridge_fallback_v2"),
    subscriptionGate: !source.includes("__ccpp_sub_bypass"),
    subscriptionMsg: !source.includes("__ccpp_sub_msg_bypass"),
    selectBrowserHide: !source.includes("__ccpp_no_select_browser")
  };
  function add(name, start, end, replacement) {
    if (!needs[name] || seen.has(name))
      return;
    replacements.push({ name, start, end, replacement });
    seen.add(name);
  }
  const legacyClientFactoryRe = /function ([\w$]+)\(([\w$]+)\)\{if\(\2\.getSocketPaths\)\{var __paths=\2\.getSocketPaths\(\);if\(__paths&&__paths\.length>0\)return ([\w$]+\(\2\))\}return \2\.bridgeConfig\?([\w$]+\(\2\)):([\w$]+\(\2\))\}\/\*__ccpp_bridge_fallback\*\//g;
  const legacyClientFactory = legacyClientFactoryRe.exec(source);
  if (legacyClientFactory) {
    add("clientFactory", legacyClientFactory.index, legacyClientFactory.index + legacyClientFactory[0].length, `function ${legacyClientFactory[1]}(${legacyClientFactory[2]}){return ${legacyClientFactory[2]}.getSocketPaths?${legacyClientFactory[3]}:${legacyClientFactory[2]}.bridgeConfig?${legacyClientFactory[4]}:${legacyClientFactory[5]}}/*__ccpp_bridge_fallback_v2*/`);
  }
  let parseSource = source;
  let offset = 0;
  if (parseSource.startsWith("#!")) {
    const index = parseSource.indexOf(`
`);
    if (index >= 0) {
      offset = index + 1;
      parseSource = parseSource.slice(offset);
    }
  }
  const acorn = Object.values(needs).some(Boolean) ? await loadAcorn(rootDir) : null;
  if (acorn) {
    try {
      const ast = acorn.parse(parseSource, { ecmaVersion: "latest", sourceType: "module" });
      const nodeSource = (node) => parseSource.slice(node.start, node.end);
      const absolute = (position) => position + offset;
      if (needs.clientFactory) {
        const functions = [
          ...findNodes(ast, (node) => node.type === "FunctionDeclaration"),
          ...findNodes(ast, (node) => node.type === "VariableDeclarator" && node.init && (node.init.type === "ArrowFunctionExpression" || node.init.type === "FunctionExpression"))
        ];
        for (const node of functions) {
          const functionNode = node.type === "VariableDeclarator" ? node.init : node;
          if (!isChromeClientFactory(functionNode))
            continue;
          const parameter = functionNode.params[0].name;
          const conditional = functionNode.body.body[0].argument;
          const bridgeCall = nodeSource(conditional.consequent);
          const socketCall = nodeSource(conditional.alternate.consequent);
          const nativeCall = nodeSource(conditional.alternate.alternate);
          add("clientFactory", absolute(functionNode.body.start), absolute(functionNode.body.end), `{return ${parameter}.getSocketPaths?${socketCall}:${parameter}.bridgeConfig?${bridgeCall}:${nativeCall}}/*__ccpp_bridge_fallback_v2*/`);
          break;
        }
      }
      if (needs.subscriptionGate) {
        for (const declaration of findNodes(ast, (node) => node.type === "VariableDeclarator")) {
          if (!declaration.init || declaration.init.type !== "LogicalExpression" || declaration.init.operator !== "&&")
            continue;
          const left = declaration.init.left;
          const right = declaration.init.right;
          if (left.type !== "CallExpression" || !left.arguments?.length)
            continue;
          const argument = left.arguments[0];
          if (!argument || argument.type !== "MemberExpression" || argument.property?.name !== "chrome")
            continue;
          if (right.type !== "CallExpression" || right.arguments?.length !== 0)
            continue;
          const calleeName = left.callee?.name || left.callee?.property?.name;
          if (!calleeName)
            continue;
          const definitions = findNodes(ast, (node) => node.type === "FunctionDeclaration" && node.id?.name === calleeName || node.type === "VariableDeclarator" && node.id?.name === calleeName);
          if (!definitions.some((definition) => nodeSource(definition).includes("claudeInChromeDefaultEnabled")))
            continue;
          add("subscriptionGate", absolute(declaration.init.start), absolute(declaration.init.end), `${nodeSource(left)}/*__ccpp_sub_bypass*/`);
          break;
        }
      }
      if (needs.subscriptionMsg) {
        const messageAnchor = "Claude in Chrome requires a claude.ai subscription.";
        const messagePosition = parseSource.indexOf(messageAnchor);
        if (messagePosition >= 0) {
          const before = parseSource.slice(Math.max(0, messagePosition - 200), messagePosition);
          if (!before.includes("false&&")) {
            const logicals = findNodes(ast, (node) => node.type === "LogicalExpression" && node.operator === "&&" && node.start <= messagePosition && node.end >= messagePosition && node.left?.type === "UnaryExpression" && node.left.operator === "!");
            if (logicals.length > 0) {
              const target = logicals.reduce((left, right) => right.end - right.start < left.end - left.start ? right : left);
              add("subscriptionMsg", absolute(target.left.start), absolute(target.left.end), "false/*__ccpp_sub_msg_bypass*/");
            }
          }
        }
      }
      if (needs.selectBrowserHide) {
        const selectBrowserNodes = findNodes(ast, (node) => {
          if (node.type !== "ObjectExpression")
            return false;
          return node.properties?.some((property) => property.key?.name === "value" && property.value?.value === "select-browser");
        });
        if (selectBrowserNodes.length > 0) {
          const selectBrowserNode = selectBrowserNodes[0];
          const pushCalls = findNodes(ast, (node) => node.type === "CallExpression" && node.callee?.property?.name === "push" && node.start >= selectBrowserNode.start && node.start - selectBrowserNode.end <= 200);
          if (pushCalls.length > 0) {
            add("selectBrowserHide", absolute(pushCalls[0].start), absolute(pushCalls[0].end), "void 0/*__ccpp_no_select_browser*/");
          }
        }
      }
    } catch {}
  }
  if (needs.clientFactory && !seen.has("clientFactory")) {
    const pattern = /function ([\w$]+)\(([\w$]+)\)\{return \2\.bridgeConfig\?([\w$]+\(\2\)):\2\.getSocketPaths\?([\w$]+\(\2\)):([\w$]+\(\2\))\}/g;
    const match = pattern.exec(source);
    if (match)
      add("clientFactory", match.index, match.index + match[0].length, `function ${match[1]}(${match[2]}){return ${match[2]}.getSocketPaths?${match[4]}:${match[2]}.bridgeConfig?${match[3]}:${match[5]}}/*__ccpp_bridge_fallback_v2*/`);
  }
  if (needs.subscriptionGate && !seen.has("subscriptionGate")) {
    const pattern = /(\b[\w$]+\(([\w$]+)\.chrome\);let [\w$]+=)([\w$]+\(\2\.chrome\))&&[\w$]+\(\)(?=,[\s\S]{0,1600}?tengu_claude_in_chrome_setup)/g;
    const match = pattern.exec(source);
    if (match)
      add("subscriptionGate", match.index, match.index + match[0].length, `${match[1]}${match[3]}/*__ccpp_sub_bypass*/`);
  }
  if (needs.subscriptionMsg && !seen.has("subscriptionMsg")) {
    const pattern = /(\b[\w$]+=)(![\w$]+)(&&[\s\S]{0,500}?"Claude in Chrome requires a claude\.ai subscription\.")/g;
    const match = pattern.exec(source);
    if (match)
      add("subscriptionMsg", match.index, match.index + match[0].length, `${match[1]}false/*__ccpp_sub_msg_bypass*/${match[3]}`);
  }
  if (needs.selectBrowserHide && !seen.has("selectBrowserHide")) {
    const pattern = /(\{label:"Select browser(?:\\u2026|\u2026)",value:"select-browser"\}[\s\S]{0,240}?)([\w$]+)\.push\(([\w$]+)\)/g;
    const match = pattern.exec(source);
    if (match)
      add("selectBrowserHide", match.index, match.index + match[0].length, `${match[1]}void 0/*__ccpp_no_select_browser*/`);
  }
  if (replacements.length === 0) {
    const hasChrome = source.includes("tengu_claude_in_chrome_setup") || source.includes("Claude in Chrome requires a claude.ai subscription.") || source.includes("select-browser");
    const allApplied = source.includes("__ccpp_bridge_fallback_v2") && (source.includes("__ccpp_sub_bypass") || !source.includes("tengu_claude_in_chrome_setup")) && (source.includes("__ccpp_sub_msg_bypass") || !source.includes("Claude in Chrome requires a claude.ai subscription.")) && (source.includes("__ccpp_no_select_browser") || !source.includes("select-browser"));
    if (allApplied)
      return { status: "already", detail: "already applied" };
    if (!hasChrome)
      return { status: "skipped", detail: "not present in this version" };
    return { status: "failed", detail: "Chrome socket patterns not found" };
  }
  if (verify)
    return { status: "verify", count: replacements.length };
  let next = source;
  if (!dryRun) {
    replacements.sort((left, right) => right.start - left.start);
    for (const replacement of replacements) {
      next = next.slice(0, replacement.start) + replacement.replacement + next.slice(replacement.end);
    }
  }
  return { status: "applied", count: replacements.length, code: next };
}
var patches4 = [
  {
    order: 12,
    name: "Claude in Chrome OAuth scope bypass",
    pattern: /function ([\w$]+)\(([\w$]+)\)\{if\(![\w$]+\(\)\)return [\w$]+\("\[Claude in Chrome\] Disabled: OAuth token has no scope accepted by \/api\/oauth\/validate[^"]*"\),!1;if\(\2===!0\)return!0;/g,
    replacer: (match, fn, argument) => `function ${fn}(${argument}){/*__ccpp_chrome_oauth_scope_bypass*/if(${argument}===!0)return!0;`,
    appliedMarker: "/*__ccpp_chrome_oauth_scope_bypass*/",
    optional: true
  },
  {
    order: 13,
    name: "Claude in Chrome agents config state",
    pattern: /([\w$]+)=\{addDir:\[\],pluginDir:\[\],pluginDirNoMcp:\[\],settings:void 0,mcpConfig:\[\],strictMcpConfig:!1/g,
    replacer: (match, config) => `${config}={addDir:[],pluginDir:[],pluginDirNoMcp:[],settings:void 0,mcpConfig:[],strictMcpConfig:!1,chrome:!1,noChrome:!1`,
    appliedMarker: /strictMcpConfig:!1,chrome:!1,noChrome:!1/,
    validate: (match, code) => !code.includes("strictMcpConfig:!1,chrome:!1,noChrome:!1")
  },
  {
    order: 14,
    name: "Claude in Chrome agents flag parser",
    pattern: /if\(([\w$]+)==="--strict-mcp-config"\)\{([\w$]+)\.strictMcpConfig=!0;continue\}/g,
    replacer: (match, argument, config) => `if(${argument}==="--chrome"){${config}.chrome=!0;continue}if(${argument}==="--no-chrome"){${config}.noChrome=!0;continue}` + match,
    appliedMarker: /if\([\w$]+==="--chrome"\)\{[\w$]+\.chrome=!0;continue\}if\([\w$]+==="--no-chrome"\)\{[\w$]+\.noChrome=!0;continue\}/,
    validate: (match, code) => !/if\([\w$]+==="--chrome"\)\{[\w$]+\.chrome=!0;continue\}/.test(code)
  },
  {
    order: 15,
    name: "Claude in Chrome agents config resolver",
    pattern: /strictMcpConfig:([\w$]+)\.strictMcpConfig/g,
    replacer: (match, config) => `strictMcpConfig:${config}.strictMcpConfig,chrome:${config}.chrome&&!${config}.noChrome,noChrome:${config}.noChrome`,
    appliedMarker: /chrome:[\w$]+\.chrome&&![\w$]+\.noChrome,noChrome:[\w$]+\.noChrome/,
    validate: (match, code) => !/chrome:[\w$]+\.chrome&&![\w$]+\.noChrome/.test(code)
  },
  {
    order: 16,
    name: "Claude in Chrome agents dispatch args",
    pattern: /\.\.\.([\w$]+)\.strictMcpConfig\?\["--strict-mcp-config"\]:\[\]/g,
    replacer: (match, config) => `...${config}.chrome?["--chrome"/*__ccpp_agents_chrome_dispatch*/]:[],...${config}.noChrome?["--no-chrome"]:[],...${config}.strictMcpConfig?["--strict-mcp-config"]:[]`,
    appliedMarker: "__ccpp_agents_chrome_dispatch",
    validate: (match, code) => !code.includes("__ccpp_agents_chrome_dispatch")
  }
];
var customPatches2 = [{
  order: 59,
  name: "Claude in Chrome local socket fallback",
  apply: applyClaudeChromeSocketPatch
}];
var chromeRegistry = Object.freeze({
  id: "chrome",
  patches: Object.freeze(patches4),
  customPatches: Object.freeze(customPatches2)
});

// src/generic/patcher/enhancements/computer-use.mjs
var patches5 = [
  {
    order: 17,
    name: "Computer Use subscription bypass",
    pattern: /function ([\w$]+)\(\)\{let [\w$]+=[\w$]+\(\);return [\w$]+==="max"\|\|[\w$]+==="pro"\}/g,
    replacer: (match, fn) => `function ${fn}(){/*__clawgod_computer_use_subscription__*/return!0}`,
    appliedMarker: "/*__clawgod_computer_use_subscription__*/"
  },
  {
    order: 18,
    name: "Computer Use default enabled",
    pattern: /([\w$]+=)\{enabled:!1,pixelValidation/g,
    replacer: (match, prefix) => `${prefix}{enabled:!0,pixelValidation`,
    sentinel: "{enabled:!1,pixelValidation"
  },
  {
    order: 23,
    name: "Computer Use gate bypass",
    pattern: /function ([\w$]+)\(\)\{if\([\w$]+\("hipaa"\)\)return\s*!1;return [\w$]+\(\)&&[\w$]+\(\)\.enabled\}/g,
    replacer: (match, fn) => `function ${fn}(){/*__clawgod_computer_use_gate__*/return!0}`,
    sentinel: '"hipaa"',
    appliedMarker: "/*__clawgod_computer_use_gate__*/"
  },
  {
    order: 24,
    name: "Computer Use in noninteractive sessions",
    pattern: /if\((?:([\w$]+)\(\)==="macos"&&)?!([\w$]+)\(\)((?:&&![\w$]+)?)&&([\w$]+)\(\)\)try\{let\{setupComputerUseMCP:/g,
    replacer: (match, platform, isNonInteractive, safetyCondition, gate) => {
      const retainedConditions = [
        platform ? `${platform}()==="macos"` : "",
        safetyCondition.replace(/^&&/, ""),
        `${gate}()`
      ].filter(Boolean).join("&&");
      return `if(${retainedConditions})/*__clawgod_computer_use_noninteractive__*/try{let{setupComputerUseMCP:`;
    },
    sentinel: "setupComputerUseMCP",
    appliedMarker: "/*__clawgod_computer_use_noninteractive__*/"
  }
];
var computerUseRegistry = Object.freeze({
  id: "computer-use",
  patches: Object.freeze(patches5),
  customPatches: Object.freeze([])
});

// src/generic/patcher/enhancements/design-canvas.mjs
var patches6 = [
  {
    order: 65,
    name: "Design canvas enable (skip claude.ai login/subscription gate)",
    pattern: /var ([\w$]+)="design";function ([\w$]+)\(\)\{return [\w$]+\(\)&&[\w$]+\(\)\}/g,
    replacer: (match, commandName, fn) => `var ${commandName}="design";function ${fn}(){return!0/*__clawgod_design_canvas__*/}`,
    sentinel: "isDesignCanvasSkillEnabled",
    appliedMarker: "/*__clawgod_design_canvas__*/",
    optional: true
  },
  {
    order: 66,
    name: "Design canvas payload path \u2192 CLAWGOD_DESIGN_PAYLOAD",
    pattern: /var ([\w$]+)=("(?:[A-Z]:)?\/(?:\$bunfs|~BUN)\/root\/payload\.template\.html\.asset")/g,
    replacer: (match, v, originalPath) => `var ${v}=process.env.CLAWGOD_DESIGN_PAYLOAD||${originalPath}/*__clawgod_design_payload__*/`,
    sentinel: "payload.template.html.asset",
    appliedMarker: "/*__clawgod_design_payload__*/",
    optional: true
  }
];
var designCanvasRegistry = Object.freeze({
  id: "design-canvas",
  patches: Object.freeze(patches6),
  customPatches: Object.freeze([])
});

// src/generic/patcher/enhancements/paste-images.mjs
var patches7 = [
  {
    order: 42,
    name: "macOS Cmd+V image paste fallback to clipboard read",
    pattern: /\}else if\(([\w$]+)&&([\w$]+)\)([\w$]+)\(\);else ([\w$]+)\("input_image_drag","read_failed"\),([\w$]+)\(([\w$]+)\),([\w$]+)\(\)/g,
    replacer: (match, temporaryItem, isMacOs, clipboardRead, track, insert, value, finish) => `}else if(${isMacOs})${clipboardRead}();else ${track}("input_image_drag","read_failed"),${insert}(${value}),${finish}()`,
    sentinel: '"input_image_drag","read_failed"',
    optional: true
  },
  {
    order: 43,
    name: "Image paste: try native image processor regardless of standalone gate",
    pattern: /if\(([\w$]+)\(\)\)try\{let ([\w$]+)=await import\("\.\/chunk-[a-z0-9]+\.js"\),([\w$]+)=\2\.sharp\|\|\2\.default;return ([\w$]+)=\{default:\3\},\3\}catch\{console\.warn\("Native image processor not available, falling back to sharp"\)\}/g,
    replacer: (match, gate) => match.replace(`if(${gate}())`, ""),
    appliedMarker: /try\{let [\w$]+=await import\("\.\/chunk-[a-z0-9]+\.js"\),[\w$]+=[\w$]+\.sharp\|\|[\w$]+\.default;return [\w$]+=\{default:[\w$]+\},[\w$]+\}catch\{console\.warn\("Native image processor not available/
  },
  {
    order: 44,
    name: "Image paste: recognize TIFF paths for macOS clipboard fallback",
    pattern: /([\w$]+)=\/\\\.\(png\|jpe\?g\|gif\|webp\)\$\/i(?=;(?:[\w$]+=\/\^\(\?:\[A-Za-z\]:\\\\\|\\\\\\\\\)\/|function [\w$]+\([\w$]+\)\{if\([\w$]+\.startsWith\('"'\)&&[\w$]+\.endsWith\('"'\)\|\|[\w$]+\.startsWith\("'"\)&&[\w$]+\.endsWith\("'"\)\)return [\w$]+\.slice\(1,-1\);return [\w$]+\}var [\w$]+=\/\^\(\?:\[A-Za-z\]:\\\\\|\\\\\\\\\)\/))/g,
    replacer: (match, imagePathPattern) => `${imagePathPattern}=/\\.(png|jpe?g|gif|webp|tiff?)$/i`,
    sentinel: "/\\.(png|jpe?g|gif|webp)$/i;",
    appliedMarker: "/\\.(png|jpe?g|gif|webp|tiff?)$/i;",
    unique: true
  },
  {
    order: 45,
    name: "Image paste: keep HTTP image URLs as text",
    pattern: /function ([\w$]+)\(([\w$]+)\)\{let ([\w$]+)=([\w$]+)\(\2\.trim\(\)\),([\w$]+)=([\w$]+)\(\3\);return ([\w$]+)\.test\(\5\)\}/g,
    replacer: (match, fn, value, quoted, unquote, path, unescape, imagePathPattern) => `function ${fn}(${value}){let ${quoted}=${unquote}(${value}.trim()),${path}=${unescape}(${quoted});return!/^https?:\\/\\//i.test(${path})&&${imagePathPattern}.test(${path})}`,
    appliedMarker: "/^https?:\\/\\//i.test(",
    unique: true
  }
];
var pasteImagesRegistry = Object.freeze({
  id: "paste-images",
  patches: Object.freeze(patches7),
  customPatches: Object.freeze([])
});

// src/generic/patcher/enhancements/planning.mjs
var patches8 = [
  {
    order: 19,
    name: "Ultraplan enable",
    pattern: /(name:"ultraplan",[\s\S]{1,500}?argumentHint:"<prompt>",isEnabled:\(\)=>)(?:!1|[\w$]+\(\))/g,
    replacer: (match, prefix) => `${prefix}!0`,
    sentinel: 'name:"ultraplan"',
    appliedMarker: 'argumentHint:"<prompt>",isEnabled:()=>!0'
  },
  {
    order: 20,
    name: "Ultrareview enable (rQt gate)",
    pattern: /function ([\w$]+)\(\)\{return ([\w$]+)\(\)\?\.enabled===!0&&[\w$]+\(\)&&![\w$]+\(\)\}/g,
    replacer: (match, fn) => `function ${fn}(){/*__clawgod_ultrareview_enabled__*/return!0}`,
    optional: true,
    appliedMarker: "/*__clawgod_ultrareview_enabled__*/"
  },
  {
    order: 21,
    name: "Ultrareview enable (direct literal, <=2.1.213)",
    pattern: /function ([\w$]+)\(\)\{return ([\w$]+)\("tengu_review_bughunter_config",null\)(\?\.enabled===!0)?\}/g,
    replacer: (match, fn, getter, gate) => gate ? `function ${fn}(){return!0}` : `function ${fn}(){let _r=${getter}("tengu_review_bughunter_config",null);return _r?{..._r,enabled:!0}:{enabled:!0}}`,
    optional: true,
    sentinel: '("tengu_review_bughunter_config",null)',
    appliedMarker: ",enabled:!0}:{enabled:!0}}"
  },
  {
    order: 22,
    name: "Ultrareview enable (v2.1.215+ gate)",
    pattern: /(function ([\w$]+)\(\)\{return [\w$]+\(ulu,null\)\})([\s\S]{0,1500}?)(function ([\w$]+)\(\)\{return \2\(\)\?\.enabled===!0&&[\w$]+\(\)&&![\w$]+\(\)\})/g,
    replacer: (match, getterDefinition, getter, between, gateDefinition, gate) => `${getterDefinition}${between}function ${gate}(){/*__clawgod_ultrareview_enabled__*/return!0}`,
    sentinel: 'var ulu="tengu_review_bughunter_config"',
    appliedMarker: "/*__clawgod_ultrareview_enabled__*/"
  }
];
var planningRegistry = Object.freeze({
  id: "planning",
  patches: Object.freeze(patches8),
  customPatches: Object.freeze([])
});

// src/generic/patcher/enhancements/privacy.mjs
var patches9 = [
  {
    order: 47,
    name: "Neutralize geo-steganography in date string (qla)",
    pattern: /function ([\w$]+)\([\w$]+\)\{let [\w$]+=[\w$]+\(\),[\w$]+=[\w$]+\([\w$]+\?\.[\w$]+\?\?!1,[\w$]+\?\.[\w$]+\?\?!1\),[\w$]+=[\w$]+\?\.[\w$]+\?[\w$]+\.replaceAll\("-","\/"\):[\w$]+;return`Today\$\{[\w$]+\}s date is \$\{[\w$]+\}\.`\}/g,
    replacer: (match) => {
      const functionMatch = match.match(/^function ([\w$]+)\(([\w$]+)\)/);
      if (!functionMatch)
        return match;
      const [, fn, parameter] = functionMatch;
      return `function ${fn}(${parameter}){return\`Today's date is \${${parameter}}.\`}`;
    },
    sentinel: 'replaceAll("-","/")'
  },
  {
    order: 48,
    name: "Neutralize geo-detection probe (rdp)",
    pattern: /function ([\w$]+)\(\)\{if\([\w$]+\(\)\)return null;let [\w$]+=[\w$]+\(\),[\w$]+=[\w$]+\(\),[\w$]+=[\w$]+==="Asia\/Shanghai"\|\|[\w$]+==="Asia\/Urumqi"[\s\S]*?\}\}/g,
    replacer: (match) => {
      const fn = match.match(/^function ([\w$]+)/)[1];
      return `function ${fn}(){return null}`;
    },
    sentinel: "Asia/Shanghai"
  },
  {
    order: 49,
    name: "Neutralize apostrophe steganography (odp)",
    pattern: new RegExp("function ([\\w$]+)\\(([\\w$]+),([\\w$]+)\\)\\{" + `if\\(!\\2&&!\\3\\)return"'";` + 'if\\(\\2&&!\\3\\)return"(?:\\\\u2019|\\u2019)";' + 'if\\(!\\2&&\\3\\)return"(?:\\\\u02[Bb][Cc]|\\u02BC)";' + 'return"(?:\\\\u02[Bb]9|\\u02B9)"\\}', "g"),
    replacer: (match) => {
      const fn = match.match(/^function ([\w$]+)/)[1];
      return `function ${fn}(e,t){return"'"}`;
    },
    optional: true
  }
];
var privacyRegistry = Object.freeze({
  id: "privacy",
  patches: Object.freeze(patches9),
  customPatches: Object.freeze([])
});

// src/generic/patcher/enhancements/unrestricted-tools.mjs
var patches10 = [
  {
    order: 46,
    name: "Restore Glob/Grep tools (un-inline EMBEDDED_SEARCH_TOOLS)",
    pattern: /function ([\w$]+)\(\)\{if\(!([\w$]+)\("true"\)\)return!1;if\([\w$]+\(\)\)return!1;return (?:process\.env|[\w$]+)\.CLAUDE_CODE_ENTRYPOINT!=="local-agent"\}/g,
    replacer: (match, fn, envCheck) => `function ${fn}(){if(!${envCheck}(process.env.EMBEDDED_SEARCH_TOOLS))return!1;if(typeof globalThis.__dpBinOk>"u"){try{var _w=process.platform==="win32"?"where":"which";require("child_process").execFileSync(_w,["bfs"],{timeout:2e3});require("child_process").execFileSync(_w,["ugrep"],{timeout:2e3});globalThis.__dpBinOk=!0}catch{globalThis.__dpBinOk=!1}}if(!globalThis.__dpBinOk)return!1;return process.env.CLAUDE_CODE_ENTRYPOINT!=="local-agent"}`,
    sentinel: 'ct("true")',
    optional: true
  },
  {
    order: 50,
    name: "Remove CYBER_RISK_INSTRUCTION",
    pattern: /([\w$]+)="IMPORTANT: Assist with authorized security testing[^"]*"/g,
    replacer: (match, variable) => `${variable}=""`,
    sentinel: "Assist with authorized security testing"
  },
  {
    order: 51,
    name: "Remove URL generation restriction",
    pattern: /\n\$\{[\w$]+\}\nIMPORTANT: You must NEVER generate or guess URLs[^.]*\. You may use URLs provided by the user in their messages or local files\./g,
    replacer: () => "",
    sentinel: "IMPORTANT: You must NEVER generate or guess URLs"
  },
  {
    order: 52,
    name: "Remove cautious actions section",
    pattern: /function ([\w$]+)\(([\w$]*)\)\{(?:if\([\s\S]{1,200}?\)return`# Executing actions with care\n\n[\s\S]*?`;)?return`# Executing actions with care\n\n[\s\S]*?`\}/g,
    replacer: (match, fn, argument) => `function ${fn}(${argument}){return\`\`}`,
    sentinel: "# Executing actions with care"
  },
  {
    order: 53,
    name: 'Remove "Not logged in" notice',
    pattern: /Not logged in\. Run [\w ]+ to authenticate\./g,
    replacer: () => "",
    optional: true
  },
  {
    order: 54,
    name: "Attachment filter bypass",
    pattern: /([\w$]+)\(\)!=="ant"(&&[\w$]+\.has\([\w$]+\.attachment\.type\)|\)\{if\([\w$]+\.attachment\.type==="hook_additional_context")/g,
    replacer: (match) => match.replace(/([\w$]+)\(\)!=="ant"/, "false"),
    optional: true
  },
  {
    order: 55,
    name: "Message list filter bypass (legacy ternary)",
    pattern: /([\w$]+)\(\)!=="ant"\?([\w$]+)\(([\w$]+),([\w$]+)\(([\w$]+)\)\):([\w$]+)/g,
    replacer: (match, fn, filter, underscore, nestedFilter, value, fallback) => fallback,
    optional: true
  },
  {
    order: 56,
    name: "Message list filter bypass (s_8 form)",
    pattern: /if\(([\w$]+)\(\)==="ant"\)return ([\w$]+);let ([\w$]+)=([\w$]+) instanceof Set\?\4:([\w$]+)\(\4\);return ([\w$]+)\(\2,\3\)/g,
    replacer: (match, fn, returned) => `return ${returned}`,
    optional: true
  }
];
var unrestrictedToolsRegistry = Object.freeze({
  id: "unrestricted-tools",
  patches: Object.freeze(patches10),
  customPatches: Object.freeze([])
});

// src/generic/patcher/enhancements/voice.mjs
var patches11 = [{
  order: 25,
  name: "Voice Mode enable (bypass GrowthBook kill)",
  pattern: /function ([\w$]+)\(\)\{return![\w$]+\("tengu_amber_quartz_disabled",!1\)\}/g,
  replacer: (match, fn) => `function ${fn}(){return!0}`,
  optional: true
}];
var voiceRegistry = Object.freeze({
  id: "voice",
  patches: Object.freeze(patches11),
  customPatches: Object.freeze([])
});

// src/generic/patcher/registry.mjs
var enhancementManifest = loadEnhancementManifest(enhancements_default, { filename: "enhancements.json" });
var patchIds = enhancementManifest.filter((entry) => entry.kind === "patch").map((entry) => entry.id);
var registryById = new Map([
  [chromeRegistry.id, chromeRegistry],
  [computerUseRegistry.id, computerUseRegistry],
  [designCanvasRegistry.id, designCanvasRegistry],
  [planningRegistry.id, planningRegistry],
  [voiceRegistry.id, voiceRegistry],
  [autoModeRegistry.id, autoModeRegistry],
  [unrestrictedToolsRegistry.id, unrestrictedToolsRegistry],
  [pasteImagesRegistry.id, pasteImagesRegistry],
  [privacyRegistry.id, privacyRegistry],
  [brandingRegistry.id, brandingRegistry]
]);
function enhancementRegistry(id, enabledIds) {
  if (id === "agents")
    return createAgentsRegistry({ chromeEnabled: enabledIds.has("chrome") });
  const registry = registryById.get(id);
  if (!registry)
    throw new Error(`Missing patch registry for enhancement: ${id}`);
  return registry;
}
var enhancementRegistries = Object.freeze(patchIds.map((id) => enhancementRegistry(id, new Set(patchIds))));
var patchRegistries = Object.freeze([coreRegistry, ...enhancementRegistries]);
var ownedDescriptors = patchRegistries.flatMap((registry) => [
  ...registry.patches.map((descriptor) => ({ descriptor, type: "regex" })),
  ...registry.customPatches.map((descriptor) => ({ descriptor, type: "custom" }))
]);
var descriptorObjects = new Set;
var names = new Set;
var orders = new Set;
for (const { descriptor } of ownedDescriptors) {
  if (descriptorObjects.has(descriptor))
    throw new Error(`Duplicate patch descriptor object: ${descriptor.name}`);
  if (names.has(descriptor.name))
    throw new Error(`Duplicate patch descriptor name: ${descriptor.name}`);
  if (orders.has(descriptor.order))
    throw new Error(`Duplicate patch descriptor order: ${descriptor.order}`);
  descriptorObjects.add(descriptor);
  names.add(descriptor.name);
  orders.add(descriptor.order);
}
function orderedDescriptors(type) {
  return Object.freeze(ownedDescriptors.filter((entry) => entry.type === type).map((entry) => entry.descriptor).sort((left, right) => left.order - right.order));
}
var patches12 = orderedDescriptors("regex");
var customPatches3 = orderedDescriptors("custom");
function orderedRegistryDescriptors(registry, type) {
  const descriptors = type === "regex" ? registry.patches : registry.customPatches;
  return [...descriptors].sort((left, right) => left.order - right.order);
}
function createPatchSelection(enabled) {
  if (!Array.isArray(enabled))
    throw new TypeError("Enabled enhancements must be an array");
  const enabledIds = new Set(enabled);
  if (enabledIds.size !== enabled.length)
    throw new Error("Enabled enhancements must not contain duplicates");
  for (const id of enabledIds) {
    if (!enhancementManifest.some((entry) => entry.id === id))
      throw new Error(`Unknown enabled enhancement: ${id}`);
  }
  const selectedRegistries = patchIds.filter((id) => enabledIds.has(id)).map((id) => enhancementRegistry(id, enabledIds));
  const registries = [coreRegistry, ...selectedRegistries];
  return Object.freeze({
    patches: Object.freeze(registries.flatMap((registry) => orderedRegistryDescriptors(registry, "regex"))),
    customPatches: Object.freeze(registries.flatMap((registry) => orderedRegistryDescriptors(registry, "custom")))
  });
}

// src/generic/patcher/entry.mjs
var PATCH_COMPATIBILITY_EXIT_CODE = 42;
var DEFAULT_ROOT = dirname3(fileURLToPath2(import.meta.url));
var CHUNKS_DIRNAME = "chunks";
var MODULE_SEPARATOR = `
/*__CLAWGOD_MODULE_BOUNDARY__*/
`;
function readBundle(rootDir) {
  const modules = [{ relPath: "cli.original.cjs", code: readFileSync(join3(rootDir, "cli.original.cjs"), "utf8") }];
  const chunksDir = join3(rootDir, CHUNKS_DIRNAME);
  if (existsSync2(chunksDir)) {
    for (const name of readdirSync(chunksDir).filter((n) => n.endsWith(".js")).sort()) {
      modules.push({ relPath: join3(CHUNKS_DIRNAME, name), code: readFileSync(join3(chunksDir, name), "utf8") });
    }
  }
  return modules;
}
function concatModules(modules) {
  return modules.map((module) => module.code).join(MODULE_SEPARATOR);
}
function splitModules(combined) {
  return combined.split(MODULE_SEPARATOR);
}
function writeBundle(rootDir, modules) {
  for (const module of modules) {
    const target = join3(rootDir, module.relPath);
    mkdirSync2(dirname3(target), { recursive: true });
    writeFileSync2(target, module.code, "utf8");
  }
}
function backupBundle(rootDir, modules) {
  const target = join3(rootDir, "cli.original.cjs");
  const backup = target + ".bak";
  if (!existsSync2(backup))
    copyFileSync(target, backup);
  const chunksDir = join3(rootDir, CHUNKS_DIRNAME);
  const chunksBackup = join3(rootDir, `${CHUNKS_DIRNAME}.bak`);
  if (existsSync2(chunksDir) && !existsSync2(chunksBackup)) {
    cpSync(chunksDir, chunksBackup, { recursive: true });
  }
  return { backup, chunksBackup, chunksDir };
}
function restoreBundle(rootDir) {
  const target = join3(rootDir, "cli.original.cjs");
  const backup = target + ".bak";
  if (!existsSync2(backup))
    return false;
  copyFileSync(backup, target);
  const chunksDir = join3(rootDir, CHUNKS_DIRNAME);
  const chunksBackup = join3(rootDir, `${CHUNKS_DIRNAME}.bak`);
  if (existsSync2(chunksBackup)) {
    rmSync(chunksDir, { recursive: true, force: true });
    renameSync2(chunksBackup, chunksDir);
  }
  return true;
}
async function runPatcher({ rootDir = DEFAULT_ROOT, args = process.argv.slice(2) } = {}) {
  const target = join3(rootDir, "cli.original.cjs");
  const dryRun = args.includes("--dry-run");
  const verify = args.includes("--verify");
  const revert = args.includes("--revert");
  const allowCompatibilityFallback = args.includes("--allow-compatibility-fallback") && !dryRun && !verify && !revert;
  const enhancementFlagIndexes = args.map((argument, index) => argument === "--enhancements-file" ? index : -1).filter((index) => index >= 0);
  if (enhancementFlagIndexes.length > 1)
    throw new Error("--enhancements-file may only be provided once");
  const enhancementFlagIndex = enhancementFlagIndexes[0];
  let stored = null;
  if (enhancementFlagIndex !== undefined) {
    const configFile = args[enhancementFlagIndex + 1];
    if (!configFile || configFile.startsWith("--"))
      throw new Error("--enhancements-file requires a path");
    if (!isAbsolute2(configFile))
      throw new Error("--enhancements-file must be an absolute path");
    const configDirectory = dirname3(configFile);
    const homeDir = dirname3(configDirectory);
    if (configFile !== enhancementConfigPath(homeDir) || configFile !== join3(homeDir, ".clawgod", ENHANCEMENT_CONFIG_FILENAME)) {
      throw new Error("--enhancements-file must name the canonical enhancements.json path");
    }
    stored = await readEnhancementConfig({ homeDir, manifest: enhancementManifest });
  }
  const selection = resolveEnhancementSelection({ stored }, enhancementManifest);
  const { patches: patches13, customPatches: customPatches4 } = createPatchSelection(selection.enabled);
  if (revert) {
    if (!restoreBundle(rootDir)) {
      console.error("\u274C No backup found");
      process.exit(1);
    }
    console.log("\u2705 Reverted from backup");
    return;
  }
  if (!existsSync2(target)) {
    console.error("\u274C Target not found:", target);
    process.exit(1);
  }
  const modules = readBundle(rootDir);
  const hasChunks = modules.length > 1;
  let code = concatModules(modules);
  const originalSize = modules.reduce((sum, module) => sum + module.code.length, 0);
  const { version } = inspectPatcherSource(code);
  console.log(`
${"\u2550".repeat(55)}`);
  console.log("  ClawGod Plus (universal)");
  console.log(`  Target: cli.original.cjs (v${version})${hasChunks ? ` + ${modules.length - 1} chunks` : ""}`);
  console.log(`  Mode: ${dryRun ? "DRY RUN" : verify ? "VERIFY" : "APPLY"}`);
  console.log(`  Enhancements: ${selection.enabled.length} enabled, ${enhancementManifest.length - selection.enabled.length} disabled`);
  console.log(`${"\u2550".repeat(55)}
`);
  let applied = 0;
  let skipped = 0;
  let failed = 0;
  for (const patch of patches13) {
    const matches = [...code.matchAll(patch.pattern)];
    let relevant = matches;
    if (patch.validate) {
      relevant = matches.filter((match) => patch.validate(match[0], code));
    }
    if (patch.selectIndex !== undefined) {
      relevant = relevant.length > patch.selectIndex ? [relevant[patch.selectIndex]] : [];
    }
    if (patch.unique && relevant.length > 1) {
      console.log(`  \u26A0\uFE0F  ${patch.name} \u2014 ${relevant.length} matches, skipping (need 1)`);
      failed++;
      continue;
    }
    if (relevant.length === 0) {
      if (patch.knownShape?.test(code)) {
        console.log(`  \u274C ${patch.name} \u2014 known resolver shape did not match exactly`);
        failed++;
        continue;
      }
      if (patch.appliedMarker !== undefined && (patch.appliedMarker instanceof RegExp ? patch.appliedMarker.test(code) : code.includes(patch.appliedMarker))) {
        console.log(`  \u2705 ${patch.name} (already applied, marker present)`);
        applied++;
        continue;
      }
      if (patch.optional) {
        console.log(`  \u23ED  ${patch.name} (not present in this version)`);
        skipped++;
        continue;
      }
      if (patch.sentinel !== undefined) {
        const sentinels = Array.isArray(patch.sentinel) ? patch.sentinel : [patch.sentinel];
        const stillPresent = sentinels.filter((sentinel) => code.includes(sentinel));
        if (stillPresent.length > 0) {
          console.log(`  \u274C ${patch.name} \u2014 regex stale, sentinel still in source: ${stillPresent.map((sentinel) => JSON.stringify(sentinel)).join(", ")}`);
          failed++;
          continue;
        }
        console.log(`  \u2705 ${patch.name} (already applied, sentinel absent)`);
        applied++;
        continue;
      }
      console.log(`  \u26A0\uFE0F  ${patch.name} (0 matches, no sentinel \u2014 cannot verify)`);
      skipped++;
      continue;
    }
    if (verify) {
      console.log(`  \u2B1A  ${patch.name} \u2014 ${relevant.length} match(es), not yet applied`);
      skipped++;
      continue;
    }
    let count = 0;
    for (const match of relevant) {
      const replacement = patch.replacer(match[0], ...match.slice(1));
      if (replacement !== match[0]) {
        if (!dryRun)
          code = code.replace(match[0], () => replacement);
        count++;
      }
    }
    if (count > 0) {
      console.log(`  \u2705 ${patch.name} (${count} replacement${count > 1 ? "s" : ""})`);
      applied++;
    } else {
      console.log(`  \u23ED  ${patch.name} (no change needed)`);
      skipped++;
    }
  }
  for (const descriptor of customPatches4) {
    const result = await descriptor.apply(code, { dryRun, verify, rootDir });
    if (result.status === "applied") {
      if (!dryRun)
        code = result.code;
      console.log(`  \u2705 ${descriptor.name} (${result.count} replacement${result.count > 1 ? "s" : ""})`);
      applied++;
    } else if (result.status === "verify") {
      console.log(`  \u2B1A  ${descriptor.name} \u2014 ${result.count} match(es), not yet applied`);
      skipped++;
    } else if (result.status === "already") {
      console.log(`  \u2705 ${descriptor.name} (${result.detail})`);
      applied++;
    } else if (result.status === "skipped") {
      console.log(`  \u23ED  ${descriptor.name} (${result.detail})`);
      skipped++;
    } else {
      console.log(`  \u274C ${descriptor.name} \u2014 ${result.detail}`);
      failed++;
    }
  }
  console.log(`
${"\u2500".repeat(55)}`);
  console.log(`  Result: ${applied} applied, ${skipped} skipped, ${failed} failed`);
  if (failed === 0 && !dryRun && !verify && applied > 0) {
    backupBundle(rootDir, modules);
    const resultModules = splitModules(code);
    if (resultModules.length !== modules.length) {
      console.error(`  \u274C Bundle split mismatch: ${resultModules.length} vs ${modules.length} modules`);
      process.exit(1);
    }
    for (let i = 0;i < modules.length; i++)
      modules[i].code = resultModules[i];
    writeBundle(rootDir, modules);
    const difference = code.length - originalSize;
    console.log(`  \uD83D\uDCDD Written: cli.original.cjs${hasChunks ? ` + ${modules.length - 1} chunks` : ""} (${difference >= 0 ? "+" : ""}${difference} bytes)`);
  }
  console.log(`${"\u2550".repeat(55)}
`);
  if (failed > 0)
    process.exit(allowCompatibilityFallback ? PATCH_COMPATIBILITY_EXIT_CODE : 1);
}
await runPatcher({
  rootDir: import.meta.main ? DEFAULT_ROOT : dirname3(process.argv[1] || fileURLToPath2(import.meta.url))
});
export {
  PATCH_COMPATIBILITY_EXIT_CODE,
  runPatcher
};
PATCHER_EOF
info "Patcher created (patch.mjs)"

# ─── Apply patches ─────────────────────────────────────

dim "Applying patches ..."
patch_args=(--enhancements-file "$CLAWGOD_DIR/enhancements.json")
patch_fallback_authorized=0
if [ "${CLAWGOD_UPDATE_PATCH_FAIL_OPEN:-}" = "1" ] \
  && [ "$NO_UPGRADE" != "1" ] \
  && [ "$RUNTIME_HAD_TARGET" = "1" ]; then
  patch_args+=(--allow-compatibility-fallback)
  patch_fallback_authorized=1
fi
patch_status=0
patch_output=$("$BUN_BIN" "$CLAWGOD_DIR/patch.mjs" "${patch_args[@]}" 2>&1) || patch_status=$?
while IFS= read -r line; do echo "  $line"; done <<< "$patch_output"
patch_fallback_active=0
if [ "$patch_status" -eq 0 ]; then
  "$BUN_BIN" "$CLAWGOD_DIR/patch-fallback.cjs" clear "$CLAWGOD_DIR"
elif [ "$patch_status" -eq 42 ] && [ "$patch_fallback_authorized" = "1" ]; then
  "$BUN_BIN" "$CLAWGOD_DIR/patch-fallback.cjs" write "$CLAWGOD_DIR" "$NATIVE_BIN_LABEL" "$CLAWGOD_SELF_VERSION"
  warn "PATCH COMPATIBILITY FALLBACK: Claude Code will run without bundle enhancements."
  warn "Run 'claude update' after ClawGod supports this Claude Code release."
  patch_fallback_active=1
else
  err "Mandatory patching failed; installation stopped before launcher replacement."
  exit "$patch_status"
fi
if [ "$patch_fallback_active" != "1" ]; then
  run_claude_code_chrome_fix
fi
commit_runtime_transaction

# ─── Create default configs ───────────────────────────

if [ ! -f "$CLAWGOD_DIR/features.json" ]; then
  cat > "$CLAWGOD_DIR/features.json" << 'FEATURES_EOF'
{
  "tengu_harbor": true,
  "tengu_session_memory": true,
  "tengu_amber_flint": true,
  "tengu_auto_background_agents": true,
  "tengu_destructive_command_warning": true,
  "tengu_immediate_model_command": true,
  "tengu_desktop_upsell": false,
  "tengu_ethereal_nova": true,
  "tengu_omelette_fouet": true,
  "tengu_slate_quill": true,
  "tengu_malort_pedway": {"enabled": true},
  "tengu_amber_quartz_disabled": false,
  "tengu_prompt_cache_1h_config": {"allowlist": ["*"]},
  "tengu_amber_redwood3": "enabled"
}
FEATURES_EOF
  info "Default features.json created"
fi

# ─── Lean mode: optimize ~/.claude/settings.json ─────
# Three levels: off (default) / on / max
# State persisted via .lean-disabled and .lean-max flag files.
# Installer respects existing state on updates — never overwrites user choice.

LEAN_OFF_FLAG="$CLAWGOD_DIR/.lean-disabled"
LEAN_MAX_FLAG="$CLAWGOD_DIR/.lean-max"

# Default to lean-off: if no lean flag files exist and user didn't explicitly
# request lean-on or lean-max, create the .lean-disabled flag so lean stays off.
if [ ! -f "$LEAN_OFF_FLAG" ] && [ ! -f "$LEAN_MAX_FLAG" ] && [ "$LEAN_ON" != "1" ] && [ "$LEAN_MAX" != "1" ]; then
  touch "$LEAN_OFF_FLAG"
fi

# Handle explicit toggle from CLI (--lean-off / --lean-on / --lean-max)
if [ "$LEAN_OFF" = "1" ]; then
  touch "$LEAN_OFF_FLAG"; rm -f "$LEAN_MAX_FLAG"
  CLAUDE_SETTINGS="$HOME/.claude/settings.json"
  if [ -f "$CLAUDE_SETTINGS" ]; then
    "$BUN_BIN" -e '
const fs=require("fs"),p=process.argv[1];
const allDeny=new Set(["DesignSync","NotebookEdit","PushNotification","RemoteTrigger","CronCreate","CronDelete","CronList","EnterPlanMode","ExitPlanMode","SendMessage","ScheduleWakeup","AskUserQuestion","ReportFindings"]);
const allFlags=["disableWorkflows","disableRemoteControl","disableClaudeAiConnectors","disableArtifact","disableBundledSkills"];
let s={};try{s=JSON.parse(fs.readFileSync(p,"utf8"))}catch{process.exit(0)}
for(const k of allFlags)delete s[k];
if(Array.isArray(s.permissions?.deny))s.permissions.deny=s.permissions.deny.filter(t=>!allDeny.has(t));
fs.writeFileSync(p,JSON.stringify(s,null,2)+"\n");
' "$CLAUDE_SETTINGS" 2>/dev/null
  fi
  info "Lean mode disabled (all tools restored)"
elif [ "$LEAN_ON" = "1" ]; then
  rm -f "$LEAN_OFF_FLAG" "$LEAN_MAX_FLAG"
elif [ "$LEAN_MAX" = "1" ]; then
  rm -f "$LEAN_OFF_FLAG"; touch "$LEAN_MAX_FLAG"
fi

if [ ! -f "$LEAN_OFF_FLAG" ]; then
  CLAUDE_SETTINGS_DIR="$HOME/.claude"
  CLAUDE_SETTINGS="$CLAUDE_SETTINGS_DIR/settings.json"
  mkdir -p "$CLAUDE_SETTINGS_DIR"
  LEAN_IS_MAX="false"
  [ -f "$LEAN_MAX_FLAG" ] && LEAN_IS_MAX="true"

  "$BUN_BIN" -e '
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
' "$CLAUDE_SETTINGS" "$LEAN_IS_MAX" 2>/dev/null

  if [ -f "$LEAN_MAX_FLAG" ]; then
    info "Lean settings applied: max (~/.claude/settings.json)"
  else
    info "Lean settings applied: on (~/.claude/settings.json)"
  fi
else
  dim "Lean mode disabled (claude --lean-on to re-enable)"
fi

# ─── Replace claude command ───────────────────────────

# Detect where claude is actually installed (supports native, npm, pnpm, yarn).
# `command -v` is a POSIX builtin (works even on minimal images that no
# longer ship `which`); `|| true` keeps a clean miss from tripping
# `set -e` via the assignment's exit status under bash 5+.
CLAUDE_BIN=$(command -v claude 2>/dev/null || true)
if [ -n "$CLAUDE_BIN" ] && is_unstable_claude_path "$CLAUDE_BIN"; then
  dim "Ignoring temporary Claude shim at $CLAUDE_BIN"
  CLAUDE_BIN="$BIN_DIR/claude"
elif [ -z "$CLAUDE_BIN" ]; then
  # No claude in PATH — use default location
  CLAUDE_BIN="$BIN_DIR/claude"
  dim "No existing claude found, installing to $BIN_DIR"
fi
CLAUDE_DIR=$(dirname "$CLAUDE_BIN")

# ─── Download clawgod-import binary ─────────────────────
IMPORT_BIN="$CLAWGOD_DIR/clawgod-import"
if [ ! -x "$IMPORT_BIN" ]; then
  IMPORT_ARCH="$(uname -m)"
  IMPORT_OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$IMPORT_ARCH" in
    x86_64|amd64) IMPORT_ARCH="x64" ;;
    aarch64|arm64) IMPORT_ARCH="arm64" ;;
  esac
  case "$IMPORT_OS" in
    darwin) IMPORT_SUFFIX="darwin-$IMPORT_ARCH" ;;
    linux)  IMPORT_SUFFIX="linux-$IMPORT_ARCH" ;;
    *)      IMPORT_SUFFIX="" ;;
  esac
  if [ -n "$IMPORT_SUFFIX" ]; then
    IMPORT_URL="https://github.com/0Chencc/clawgod/releases/latest/download/clawgod-import-$IMPORT_SUFFIX"
    if "$BUN_BIN" "$CLAWGOD_DIR/fetch-file.mjs" "$IMPORT_URL" "$IMPORT_BIN" 2>/dev/null; then
      chmod +x "$IMPORT_BIN"
      info "Provider import tool installed (clawgod-import)"
    else
      dim "Provider import tool not yet available (build pending)"
    fi
  fi
fi

LAUNCHER_CONTENT="#!/bin/bash
# clawgod launcher
# CLAWGOD_LAUNCHER_V1
CLAWGOD_CLI=\"$CLAWGOD_DIR/cli.cjs\"
CLAWGOD_IMPORT=\"$CLAWGOD_DIR/clawgod-import\"
BUN_BIN=\"$BUN_BIN\"
# Route 'import' subcommand to clawgod-import binary
if [ \"\$1\" = \"import\" ]; then
  shift
  if [ -x \"\$CLAWGOD_IMPORT\" ]; then
    exec \"\$CLAWGOD_IMPORT\" \"\$@\"
  else
    echo \"clawgod: import tool not installed. Reinstall clawgod to get it.\" >&2
    exit 127
  fi
fi
if [ ! -f \"\$CLAWGOD_CLI\" ]; then
  echo \"clawgod: installation at $CLAWGOD_DIR is missing (cli.cjs not found)\" >&2
  echo \"clawgod: reinstall via  curl -fsSL https://github.com/A6083450/clawgod-plus/releases/latest/download/install.sh | bash\" >&2
  echo \"clawgod: or remove this launcher:  rm \\\"\$0\\\"\" >&2
  exit 127
fi
if [ ! -x \"\$BUN_BIN\" ]; then
  if command -v bun >/dev/null 2>&1; then BUN_BIN=\"\$(command -v bun)\"; fi
fi
if [ ! -x \"\$BUN_BIN\" ]; then
  echo \"clawgod: bun runtime not found at \$BUN_BIN\" >&2
  echo \"clawgod: install bun  curl -fsSL https://bun.sh/install | bash\" >&2
  exit 127
fi
export CLAUDE_CODE_EXECPATH=\"$CLAUDE_BIN.orig\"
export HERDR_AGENT=\"\${HERDR_AGENT-claude}\"
if [ \"\${1:-}\" = \"agents\" ] && [ \"\${CLAWGOD_NO_AUTO_CHROME:-}\" != \"1\" ]; then
  exec \"\$BUN_BIN\" \"\$CLAWGOD_CLI\" --chrome \"\$@\"
fi
CLAWGOD_AUTO_CHROME=1
if [ \"\${CLAWGOD_NO_AUTO_CHROME:-}\" = \"1\" ]; then
  CLAWGOD_AUTO_CHROME=0
fi
for arg in \"\$@\"; do
  case \"\$arg\" in
    --chrome)
      CLAWGOD_AUTO_CHROME=0
      break
      ;;
    -p|--print|--permission-mode|--input-format|--output-format)
      CLAWGOD_AUTO_CHROME=0
      ;;
  esac
done
case \"\${1:-}\" in
  -h|--help|-v|--version|version|update|upgrade|auth|login|logout|config|mcp|daemon|logs|attach|stop|kill|respawn|rm|doctor|install|uninstall|completion|migrate-installer|setup-token)
    CLAWGOD_AUTO_CHROME=0
    ;;
esac
if [ \"\$CLAWGOD_AUTO_CHROME\" = \"1\" ]; then
  exec \"\$BUN_BIN\" \"\$CLAWGOD_CLI\" --chrome \"\$@\"
fi
exec \"\$BUN_BIN\" \"\$CLAWGOD_CLI\" \"\$@\""


# Back up original claude (only once)
CLAUDE_ORIG="$CLAUDE_BIN.orig"
if { [ -e "$CLAUDE_ORIG" ] || [ -L "$CLAUDE_ORIG" ]; } \
  && { [ -e "$CLAUDE_BIN" ] || [ -L "$CLAUDE_BIN" ]; } \
  && ! is_clawgod_launcher "$CLAUDE_BIN"; then
  err "Claude launcher conflict at $CLAUDE_BIN; current command and $CLAUDE_ORIG were preserved."
  err "Move or remove the third-party current command, then rerun the installer."
  exit 1
fi
if [ -e "$CLAUDE_ORIG" ] || [ -L "$CLAUDE_ORIG" ]; then
  if has_clawgod_launcher_content "$CLAUDE_ORIG"; then
    rm -f "$CLAUDE_ORIG"
    warn "Removed installer-owned polluted backup ($CLAUDE_ORIG)"
  elif ! is_valid_claude_original "$CLAUDE_ORIG"; then
    err "Invalid original backup at $CLAUDE_ORIG; installation stopped without launcher changes."
    exit 1
  fi
fi
if [ ! -e "$CLAUDE_ORIG" ] && [ ! -L "$CLAUDE_ORIG" ] && ! is_clawgod_launcher "$CLAUDE_BIN"; then
  if [ -L "$CLAUDE_BIN" ]; then
    # Symlink (native install) — preserve target
    NATIVE_BIN="$(readlink "$CLAUDE_BIN")"
    ln -sf "$NATIVE_BIN" "$CLAUDE_ORIG"
    info "Original claude backed up → claude.orig (→ $NATIVE_BIN)"
  elif [ -f "$CLAUDE_BIN" ] && file "$CLAUDE_BIN" 2>/dev/null | grep -q "Mach-O\|ELF\|script"; then
    # Binary or script (pnpm/npm global install)
    cp "$CLAUDE_BIN" "$CLAUDE_ORIG"
    info "Original claude backed up → claude.orig"
  else
    # Try versions dir as fallback
    VERSIONS_DIR="$HOME/.local/share/claude/versions"
    if [ -d "$VERSIONS_DIR" ]; then
      NATIVE_BIN="$(ls -t "$VERSIONS_DIR"/* 2>/dev/null | while read f; do
        file "$f" 2>/dev/null | grep -q "Mach-O\|ELF" && echo "$f" && break
      done)" || true
      if [ -n "$NATIVE_BIN" ]; then
        ln -sf "$NATIVE_BIN" "$CLAUDE_ORIG"
        info "Original claude backed up → claude.orig (→ $NATIVE_BIN)"
      fi
    fi
  fi
fi

# Write launcher to the SAME directory where claude was found.
# CRITICAL: `echo > $f` follows symlinks — if $CLAUDE_BIN is a symlink
# (e.g. official ~/.local/bin/claude → ~/.local/share/claude/versions/X)
# we'd write our launcher into the real binary and destroy it. Always
# remove the existing entry first so we write a fresh regular file.
write_launcher() {
  local target="$1"
  local dir
  dir=$(dirname "$target")
  mkdir -p "$dir"
  rm -f "$target"
  printf '%s\n' "$LAUNCHER_CONTENT" > "$target"
  chmod +x "$target"
}

write_launcher "$CLAUDE_BIN"
info "Command 'claude' → patched ($CLAUDE_BIN)"

# Also install to ~/.local/bin if claude was elsewhere (ensures PATH consistency)
if [ "$CLAUDE_DIR" != "$BIN_DIR" ]; then
  write_launcher "$BIN_DIR/claude"
  dim "Also installed to $BIN_DIR/claude"
fi

# Always expose an unambiguous `clawgod` alias alongside the `claude` override.
# Useful when:
#  - Windows .exe overshadows our .cmd (clawgod has no .exe competitor)
#  - User wants explicit "patched" intent
#  - User restored claude.orig via uninstall but still wants the patched one
write_launcher "$BIN_DIR/clawgod"
info "Command 'clawgod' → patched ($BIN_DIR/clawgod)"

# --- Ensure optional Claude plugins ---------------------------------

if ! CLAWGOD_BUN_BIN="$BUN_BIN" CLAWGOD_DIR="$CLAWGOD_DIR" \
  "$BUN_BIN" "$CLAWGOD_DIR/plugin-dependencies.mjs" ensure; then
  warn "Optional Claude plugin setup could not complete; ClawGod Plus core install will continue"
fi

install_claude_mem_compat_helper
if CLAWGOD_BUN_BIN="$BUN_BIN" CLAWGOD_CLAUDE_BIN="$CLAUDE_BIN" "$BUN_BIN" "$CLAWGOD_DIR/claude-mem-compat.cjs" install; then
  [ -f "$HOME/.claude-mem/clawgod-settings-backup.json" ] && info "claude-mem compatibility configured"
else
  warn "claude-mem compatibility setup failed; ClawGod Plus core install will continue"
fi

# ─── Check PATH ───────────────────────────────────────

if ! echo "$PATH" | grep -q "$CLAUDE_DIR" && ! echo "$PATH" | grep -q "$BIN_DIR"; then
  # Detect shell config file
  case "$(basename "$SHELL")" in
    zsh)  SHELL_RC="$HOME/.zshrc" ;;
    bash) SHELL_RC="$HOME/.bashrc" ;;
    fish) SHELL_RC="$HOME/.config/fish/config.fish" ;;
    *)    SHELL_RC="$HOME/.profile" ;;
  esac
  echo ""
  warn "$BIN_DIR is not in PATH. Run:"
  dim "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> $SHELL_RC && source $SHELL_RC"
fi

# ─── Flush shell cache ────────────────────────────────

hash -r 2>/dev/null

# ─── Done ─────────────────────────────────────────────

echo ""
echo -e "  ${BOLD}${GREEN}ClawGod Plus installed!${NC}"
echo ""
dim "  claude            — Start patched Claude Code (green logo)"
dim "  claude.orig       — Run original unpatched Claude Code"
echo ""
dim "  Updates: 'claude update' is patched to route through this installer."
dim "  Just run it as usual — pulls latest Anthropic release + re-patches"
dim "  in one step. Extra options:"
dim "    claude update --version 2.1.180   (install a specific version)"
dim "    claude update --no-upgrade        (re-patch without downloading)"
dim "  To leave clawgod and use vanilla update:"
dim "    bash ~/.clawgod/install.sh --uninstall"
echo ""
dim "  If 'claude' still runs the old version, restart your terminal or run: hash -r"
echo ""
dim "  Config: ~/.clawgod/provider.json"
dim "  Flags:  ~/.clawgod/features.json"
echo ""
dim "  If 'claude' panics with 'Expected CommonJS module to have a function wrapper',"
dim "  your Bun lags Anthropic's embedded Bun. Upgrade with one of:"
dim "    bun upgrade --canary           (if installed via curl/install.sh)"
dim "    scoop update bun               (scoop — may lag stable)"
dim "    brew upgrade bun               (homebrew)"
echo ""
