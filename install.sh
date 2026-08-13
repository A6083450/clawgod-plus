#!/bin/bash
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
VERSION="${CLAWGOD_VERSION:-latest}"
NO_UPGRADE="${CLAWGOD_NO_UPGRADE:-}"
LEAN_OFF="${CLAWGOD_LEAN_OFF:-}"
LEAN_ON="${CLAWGOD_LEAN_ON:-}"
LEAN_MAX="${CLAWGOD_LEAN_MAX:-}"
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
    *) shift ;;
  esac
done

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "  ${GREEN}✓${NC} $1"; }
warn()  { echo -e "  ${RED}✗${NC} $1"; }
dim()   { echo -e "  ${DIM}$1${NC}"; }
err()   { echo -e "  ${RED}✗${NC} $1"; }

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
CLAUDE_MEM_COMPAT_EOF
  chmod 700 "$CLAWGOD_DIR/claude-mem-compat.cjs"
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
  rm -rf "$CLAWGOD_DIR/node_modules" "$CLAWGOD_DIR/vendor" "$CLAWGOD_DIR/bun-runtime" "$CLAWGOD_DIR/cli.original.js" "$CLAWGOD_DIR/cli.original.js.bak" "$CLAWGOD_DIR/cli.original.cjs" "$CLAWGOD_DIR/cli.original.cjs.bak" "$CLAWGOD_DIR/cli.js" "$CLAWGOD_DIR/cli.cjs" "$CLAWGOD_DIR/patch.mjs" "$CLAWGOD_DIR/patch.js" "$CLAWGOD_DIR/extract-natives.mjs" "$CLAWGOD_DIR/post-process.mjs" "$CLAWGOD_DIR/repatch.mjs" "$CLAWGOD_DIR/openai-proxy.cjs" "$CLAWGOD_DIR/fetch-file.mjs" "$CLAWGOD_DIR/install-ripgrep.mjs" "$CLAWGOD_DIR/clawgod-import" "$CLAWGOD_DIR/apply-claude-code-chrome-fix.sh" "$CLAWGOD_DIR/claude-mem-compat.cjs" "$CLAWGOD_DIR/claude-mem" "$CLAWGOD_DIR/.source-version" "$CLAWGOD_DIR/.clawgod-version" "$CLAWGOD_DIR/.update-check" "$CLAWGOD_DIR/install.sh"
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

mkdir -p "$CLAWGOD_DIR"
cat > "$CLAWGOD_DIR/fetch-file.mjs" << 'FETCH_FILE_EOF'
#!/usr/bin/env bun
import { existsSync, renameSync, rmSync } from 'node:fs';

const [url, destination] = process.argv.slice(2);
if (!url || !destination) throw new Error('usage: fetch-file.mjs <url> <destination>');

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
  return { host: host.replace(/^\*\./, '.'), port };
}

function bypassesProxy(urlValue) {
  const parsed = typeof urlValue === 'string' ? new URL(urlValue) : urlValue;
  const entries = (process.env.NO_PROXY || process.env.no_proxy || '').split(',').filter(value => value.trim());
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : parsed.protocol === 'http:' ? '80' : '');
  return entries.some(entry => {
    const rule = noProxyRule(entry);
    if (rule.all) return true;
    const baseHost = rule.host.replace(/^\./, '');
    const matchesHost = host === baseHost || host.endsWith(`.${baseHost}`);
    return matchesHost && (!rule.port || rule.port === port);
  });
}

function proxyFor(urlValue) {
  const parsed = new URL(urlValue);
  if (bypassesProxy(parsed)) return undefined;
  return parsed.protocol === 'https:'
    ? process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy
    : process.env.HTTP_PROXY || process.env.http_proxy;
}

async function fetchWithProxy(initialUrl) {
  let nextUrl = initialUrl;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const proxy = proxyFor(nextUrl);
    const response = await fetch(nextUrl, { redirect: 'manual', signal: AbortSignal.timeout(300000), ...(proxy ? { proxy } : {}) });
    if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
      if (redirects === 5) throw new Error('too many redirects');
      nextUrl = new URL(response.headers.get('location'), nextUrl).href;
      continue;
    }
    if (response.status !== 200) throw new Error(`download failed with HTTP ${response.status}`);
    return response;
  }
  throw new Error('too many redirects');
}

const temporary = `${destination}.${process.pid}.tmp`;
try {
  const response = await fetchWithProxy(url);
  await Bun.write(temporary, response);
  renameSync(temporary, destination);
} finally {
  if (existsSync(temporary)) rmSync(temporary, { force: true });
}
FETCH_FILE_EOF
chmod 700 "$CLAWGOD_DIR/fetch-file.mjs"

# --- Managed ripgrep -------------------------------------------------

cat > "$CLAWGOD_DIR/install-ripgrep.mjs" << 'INSTALL_RIPGREP_EOF'
#!/usr/bin/env bun
import { chmodSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

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
  return { host: host.replace(/^\*\./, '.'), port };
}

function bypassesProxy(urlValue, env) {
  const parsed = typeof urlValue === 'string' ? new URL(urlValue) : urlValue;
  const entries = (env.NO_PROXY || env.no_proxy || '').split(',').filter(value => value.trim());
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : parsed.protocol === 'http:' ? '80' : '');
  return entries.some(entry => {
    const rule = noProxyRule(entry);
    if (rule.all) return true;
    const baseHost = rule.host.replace(/^\./, '');
    return (host === baseHost || host.endsWith(`.${baseHost}`)) && (!rule.port || rule.port === port);
  });
}

export function proxyFor(urlValue, env = process.env) {
  const parsed = new URL(urlValue);
  if (bypassesProxy(parsed, env)) return undefined;
  return parsed.protocol === 'https:'
    ? env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy
    : env.HTTP_PROXY || env.http_proxy;
}

async function fetchDirect(url, init, fetchImpl) {
  const upper = Object.hasOwn(process.env, 'NO_PROXY') ? process.env.NO_PROXY : undefined;
  const lower = Object.hasOwn(process.env, 'no_proxy') ? process.env.no_proxy : undefined;
  try {
    process.env.NO_PROXY = '*';
    process.env.no_proxy = '*';
    return await fetchImpl(url, init);
  } finally {
    if (upper === undefined) delete process.env.NO_PROXY;
    else process.env.NO_PROXY = upper;
    if (lower === undefined) delete process.env.no_proxy;
    else process.env.no_proxy = lower;
  }
}

export async function fetchWithProxy(initialUrl, init = {}, env = process.env, fetchImpl = fetch) {
  let nextUrl = initialUrl;
  const { proxy: _callerProxy, ...baseInit } = init;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const bypass = bypassesProxy(nextUrl, env);
    const proxy = proxyFor(nextUrl, env);
    let response;
    try {
      const requestInit = {
        ...baseInit,
        redirect: 'manual',
        signal: AbortSignal.timeout(300000),
        ...(proxy ? { proxy } : {}),
      };
      response = bypass
        ? await fetchDirect(nextUrl, requestInit, fetchImpl)
        : await fetchImpl(nextUrl, requestInit);
    } catch (error) {
      if (proxy) throw new Error('Request failed through configured proxy');
      throw error;
    }
    if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
      if (redirects === 5) throw new Error('Too many redirects');
      nextUrl = new URL(response.headers.get('location'), nextUrl).href;
      continue;
    }
    if (response.status !== 200) throw new Error(`Request failed with HTTP ${response.status}`);
    return response;
  }
  throw new Error('Too many redirects');
}

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
  elif "$BUN_BIN" "$CLAWGOD_DIR/fetch-file.mjs" "https://raw.githubusercontent.com/A6083450/clawgod-plus/main/apply-claude-code-chrome-fix.sh" "$dst"; then
    :
  else
    return 1
  fi
  chmod +x "$dst"
}

run_claude_code_chrome_fix() {
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
  info "Skipping download (--no-upgrade)"
else

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

const MIN_BINARY_BYTES = 10 * 1024 * 1024;

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
  return { host: host.replace(/^\*\./, '.'), port };
}

function bypassesProxy(urlValue, env) {
  const parsed = typeof urlValue === 'string' ? new URL(urlValue) : urlValue;
  const entries = (env.NO_PROXY || env.no_proxy || '').split(',').filter(value => value.trim());
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : parsed.protocol === 'http:' ? '80' : '');
  return entries.some(entry => {
    const rule = noProxyRule(entry);
    if (rule.all) return true;
    const baseHost = rule.host.replace(/^\./, '');
    const matchesHost = host === baseHost || host.endsWith(`.${baseHost}`);
    return matchesHost && (!rule.port || rule.port === port);
  });
}

export function proxyFor(urlValue, env = process.env) {
  const parsed = new URL(urlValue);
  if (bypassesProxy(parsed, env)) return undefined;
  return parsed.protocol === 'https:'
    ? env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy
    : env.HTTP_PROXY || env.http_proxy;
}

async function fetchDirect(url, init, fetchImpl) {
  const upper = Object.hasOwn(process.env, 'NO_PROXY') ? process.env.NO_PROXY : undefined;
  const lower = Object.hasOwn(process.env, 'no_proxy') ? process.env.no_proxy : undefined;
  try {
    process.env.NO_PROXY = '*';
    process.env.no_proxy = '*';
    return await fetchImpl(url, init);
  } finally {
    if (upper === undefined) delete process.env.NO_PROXY;
    else process.env.NO_PROXY = upper;
    if (lower === undefined) delete process.env.no_proxy;
    else process.env.no_proxy = lower;
  }
}

export async function fetchWithProxy(initialUrl, init = {}, env = process.env, fetchImpl = fetch) {
  let nextUrl = initialUrl;
  const { proxy: _callerProxy, ...baseInit } = init;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const bypass = bypassesProxy(nextUrl, env);
    const proxy = proxyFor(nextUrl, env);
    let response;
    try {
      const requestInit = {
        ...baseInit,
        redirect: 'manual',
        signal: AbortSignal.timeout(300000),
        ...(proxy ? { proxy } : {}),
      };
      response = bypass
        ? await fetchDirect(nextUrl, requestInit, fetchImpl)
        : await fetchImpl(nextUrl, requestInit);
    } catch (error) {
      if (proxy) throw new Error('Request failed through configured proxy');
      throw error;
    }
    if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
      if (redirects === 5) throw new Error('Too many redirects');
      nextUrl = new URL(response.headers.get('location'), nextUrl).href;
      continue;
    }
    if (response.status !== 200) throw new Error(`Request failed with HTTP ${response.status}`);
    return response;
  }
  throw new Error('Too many redirects');
}

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
  chmod 700 "$FETCH_SCRIPT"

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
  const [,, binaryPath, outputDir] = process.argv;
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

  let cliCount = 0, napiCount = 0, dropped = 0;
  for (const m of modules) {
    if (m.entry) {
      const out = join(outputDir, 'cli.original.js');
      writeFileSync(out, m.content);
      console.log(`  cli.js   ${(m.content.length / 1024 / 1024).toFixed(2)} MB → ${out} (${m.name})`);
      cliCount++;
    } else if (m.loader === 'napi') {
      const base = napiBasename(m.name);
      if (!base) { console.warn(`  skip napi ${m.name}: empty basename`); dropped++; continue; }
      const dir = join(outputDir, 'vendor', base, `${section.arch}-${section.os}`);
      mkdirSync(dir, { recursive: true });
      const out = join(dir, `${base}.node`);
      writeFileSync(out, m.content);
      console.log(`  napi     ${(m.content.length / 1024).toFixed(0).padStart(5)} KB → ${out}`);
      napiCount++;
    } else {
      dropped++;
    }
  }
  console.log(`Extracted: ${cliCount} cli.js + ${napiCount} napi (${dropped} dropped)`);
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

# Single extractor pass: writes cli.original.js to $CLAWGOD_DIR and creates
# vendor/<name>/<arch>-<os>/<name>.node for every napi module in one go.
if [ -d "$CLAWGOD_DIR/vendor" ]; then
  for vendor_entry in "$CLAWGOD_DIR/vendor"/* "$CLAWGOD_DIR/vendor"/.[!.]* "$CLAWGOD_DIR/vendor"/..?*; do
    [ -e "$vendor_entry" ] || continue
    [ "${vendor_entry##*/}" = "ripgrep" ] && continue
    rm -rf -- "$vendor_entry"
  done
fi
rm -f "$CLAWGOD_DIR/cli.original.js" 2>/dev/null

dim "Extracting cli.js + napi modules from $(echo "$NATIVE_BIN_LABEL") ..."
if ! "$BUN_BIN" "$CLAWGOD_DIR/extract-natives.mjs" "$NATIVE_BIN" "$CLAWGOD_DIR" 2>&1 | while IFS= read -r line; do echo "  $line"; done; then
  err "Failed to extract from native binary"
  exit 1
fi
[ -f "$CLAWGOD_DIR/cli.original.js" ] || { err "cli.js missing after extraction"; exit 1; }

# ─── Post-process cli.js for Bun runtime ──────────────────────
# 0. Strip leading @bun pragma comments so Bun recognises the CJS wrapper
# 1. Rewrite /$bunfs/root/X.node paths to point at extracted vendor modules
# 2. Rewrite build-time /home/runner/.../*.ts URLs (used by ripgrep,
#    sandbox, computer-use, etc. for asset resolution) to __filename so
#    relative resolutions land near our cli.original.cjs
# 3. Wrap the Bun-cjs IIFE with an actual invocation so `require()` runs it
# 4. Save as .cjs (Bun + CJS module wrapper)

dim "Rewriting bunfs paths and IIFE invocation ..."
cat > "$CLAWGOD_DIR/post-process.mjs" << 'POSTPROC_EOF'
#!/usr/bin/env bun
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const src = `${here}/cli.original.js`;
const dst = `${here}/cli.original.cjs`;

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
console.log(`cli.original.cjs: ${code.length} bytes`);
POSTPROC_EOF
"$BUN_BIN" "$CLAWGOD_DIR/post-process.mjs" 2>&1 | while IFS= read -r line; do echo "  $line"; done
[ -f "$CLAWGOD_DIR/cli.original.cjs" ] || { err "Post-process failed"; exit 1; }

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
import { writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const nativeBin = process.argv[2];

if (!nativeBin || !existsSync(nativeBin)) {
  console.error('repatch: native binary path required and must exist');
  process.exit(1);
}

const vendorDir = join(here, 'vendor');
if (existsSync(vendorDir)) {
  for (const entry of readdirSync(vendorDir)) {
    if (entry !== 'ripgrep') rmSync(join(vendorDir, entry), { recursive: true, force: true });
  }
}
rmSync(join(here, 'cli.original.js'), { force: true });

const runtime = process.execPath;

function run(label, args) {
  const r = spawnSync(runtime, args, { cwd: here, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`repatch: ${label} failed (exit ${r.status})`);
    process.exit(1);
  }
}

const extractor = join(here, 'extract-natives.mjs');
const postProc = join(here, 'post-process.mjs');
const patcher = join(here, 'patch.mjs');

run('extract', [extractor, nativeBin, here]);
run('post-process', [postProc]);
run('patcher', [patcher]);

writeFileSync(join(here, '.source-version'), basename(nativeBin) + '\n');
console.log(`[clawgod] re-patched to ${basename(nativeBin)}`);
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
/**
 * ClawGod Plus Universal Patcher — 正则模式匹配, 跨版本兼容
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

async function applyClaudeApiSkillLazyDocsPatch(source, { dryRun, verify }) {
  const appliedMarker = 'Only the essential reference is included to preserve context.';
  if (source.includes(appliedMarker)) return { status: 'already', detail: 'already applied' };

  const guide = source.indexOf('n.indexOf("## Reading Guide")');
  if (guide === -1) return { status: 'skipped', detail: 'not present in this version' };
  const beforeGuide = source.slice(Math.max(0, guide - 300), guide);
  const startMatch = [...beforeGuide.matchAll(/function ([\w$]+)\(e,t,r\)\{let n=([\w$]+)\(r\.SKILL_PROMPT,r\),o=$/g)].at(-1);
  if (!startMatch) return { status: 'failed', detail: 'prompt builder start marker not found' };
  const start = guide - beforeGuide.length + startMatch.index;

  const body = source.slice(start, start + 5000);
  const referenceMatch = body.match(/,a=([\w$]+)\.replace\(\/\\\{lang\\\}\/g,e\?\?"unknown"\)/);
  const subcommandMatch = body.match(/,([\w$]+)\(t\)!=="prompt-audit"/);
  const docsMatch = body.match(/\+([\w$]+)\([^,]+,r\.SKILL_FILES,r\)\)/);
  const endMatch = body.match(/;return s\.join\(`(?:\\n\\n|\n\n)`\)\}/);
  if (!referenceMatch || !subcommandMatch || !docsMatch || !endMatch) {
    return { status: 'failed', detail: 'prompt builder structure not recognized' };
  }

  const functionName = startMatch[1];
  const promptFormatter = startMatch[2];
  const referencePrompt = referenceMatch[1];
  const parseSubcommand = subcommandMatch[1];
  const formatDocs = docsMatch[1];
  const replacement = `function ${functionName}(e,t,r){let n=${promptFormatter}(r.SKILL_PROMPT,r),o=n.indexOf("## Reading Guide"),s=[o!==-1?n.slice(0,o).trimEnd():n],a=${referencePrompt}.replace(/\\{lang\\}/g,e??"unknown"),p=${parseSubcommand}(t),d=[];if(p==="migrate")d.push("shared/model-migration.md");else if(p==="prompt-audit")d.push("shared/prompt-audit.md");else if(e)d.push(\`\${e}/claude-api/README.md\`);s.push(a);if(d.length)s.push(\`---\\n\\n## Included Documentation\\n\\n\`+${formatDocs}(d,r.SKILL_FILES,r));s.push("---\\n\\n## Additional Documentation\\n\\n${appliedMarker} When the task needs streaming, tools, files, batches, caching, token counting, managed agents, or another language-specific guide, use Read on the corresponding path in the skill files.");let l=n.indexOf("## When to Use WebFetch");if(l!==-1)s.push(n.slice(l).trimEnd());if(t)s.push(\`## User Request\\n\\n\${t}\`);return s.join(\`\\n\\n\`)}`;
  if (verify) return { status: 'verify', count: 1 };
  if (dryRun) return { status: 'applied', count: 1, code: source };
  const end = start + endMatch.index + endMatch[0].length;
  return { status: 'applied', count: 1, code: source.slice(0, start) + replacement + source.slice(end) };
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

async function applyFastMessagesProtocolPatch(source, { dryRun, verify }) {
  const MARKER = '/*__clawgod_fast_messages_protocol__*/';
  if (source.includes(MARKER)) return { status: 'already', detail: 'already applied' };
  const targetRe = /let ([\w$]+)=\[\.\.\.([\w$]+)\],([\w$]+)="([^"]+)",([\w$]+)=([^;]+&&!!([\w$]+));if\(([\w$]+)\)([\w$]+)\.push\(([\w$]+)\);let ([\w$]+)=([\w$]+)\.includes\(([\w$]+)\),([\w$]+);if\([^;]+\)([\w$]+)="fast";let ([\w$]+)=\{([^{}]*),\.\.\.([\w$]+)!==void 0&&\{speed:([\w$]+)\}\},headers=\{"anthropic-beta":([\w$]+)\.map\(\(([\w$]+)\)=>([\w$]+)\.header\)\.toString\(\)\};return\{body:([\w$]+),headers\}/g;
  const matches = [...source.matchAll(targetRe)];
  if (matches.length !== 1) return matches.length === 0 && !source.includes('fast-mode-2026-02-01') ? { status: 'skipped', detail: 'not present in this version' } : { status: 'failed', detail: matches.length === 0 ? 'Fast request body/header closure not found; upstream shape changed' : `Fast request body/header closure matched ${matches.length} times; refusing ambiguous patch` };
  const [, capabilities, existingBeta, model, modelName, isFast, fastCondition, fastArg, pushCondition, pushCapabilities, fastCapability, hasFastCapability, includesCapabilities, includesCapability, speed, speedName, body, bodyFields, bodySpeed, bodySpeedValue, headerCapabilities, capability, capabilityObject, returnBody] = matches[0];
  if (isFast !== pushCondition || capabilities !== pushCapabilities || capabilities !== includesCapabilities || fastCapability !== includesCapability || speed !== bodySpeed || speed !== bodySpeedValue || capabilities !== headerCapabilities || capability !== capabilityObject || body !== returnBody || !fastCondition.includes('&&!!')) return { status: 'failed', detail: 'Fast request body/header closure matched an inconsistent Fast-state shape' };
  if (verify) return { status: 'verify', count: 1 };
  const replacement = `let ${capabilities}=[...${existingBeta}],${model}="${modelName}",${isFast}=!!${fastArg};if(${isFast}&&!${capabilities}.includes(${fastCapability}))${capabilities}.push(${fastCapability});let ${hasFastCapability}=${capabilities}.includes(${fastCapability}),${speed};if(${isFast})${speed}="fast";let ${body}={${bodyFields},...${speed}!==void 0&&{speed:${speed}}},headers={"anthropic-beta":${isFast}?(()=>{const __clawgodFastCapabilities=String(${capabilities}.map((${capability})=>${capability}.header).toString()||'').split(',').map(__clawgodFastCapability=>__clawgodFastCapability.trim()).filter(Boolean);if(!__clawgodFastCapabilities.includes('fast-mode-2026-02-01'))__clawgodFastCapabilities.push('fast-mode-2026-02-01');return __clawgodFastCapabilities.join(',')})():${capabilities}.map((${capability})=>${capability}.header).toString()};${MARKER}return{body:${body},headers}`;
  if (dryRun) return { status: 'applied', count: 1, code: source };
  const match = matches[0];
  return { status: 'applied', count: 1, code: source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length) };
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
    unique: true,  // must match exactly 1
    optional: true,  // v2.1.197+ refactored to schema-based env export; pattern no longer exists
  },
  {
    name: 'GrowthBook config overrides',
    pattern: /function ([\w$]+)\(\)\{return\}(function)/g,
    replacer: (m, fn, next) =>
      `function ${fn}(){return null}${next}`,
    selectIndex: 0,
    optional: true,  // v2.1.215+ GrowthBook functions restructured; pattern no longer matches
    validate: (match, code) => {
      const pos = code.indexOf(match);
      const nearby = code.substring(Math.max(0, pos - 500), pos + 500);
      return nearby.includes('growthBook') || nearby.includes('GrowthBook') || nearby.includes('FeatureValue');
    },
  },
  {
    name: 'Agent Teams always enabled',
    pattern: /function ([\w$]+)\(\)\{if\(![\w$]+\(process\.env\.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS\)&&![\w$]+\(\)\)return!1;if\(![\w$]+\("tengu_amber_flint",!0\)\)return!1;return!0\}|function ([\w$]+)\(\)\{if\(![\w$]+\.[\w$]+&&![\w$]+\(\)\)return!1;if\(![\w$]+\("tengu_amber_flint",!0\)\)return!1;return!0\}/g,
    replacer: (m, fn1, fn2) => `function ${fn1||fn2}(){return!0}`,
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
    // v2.1.92+ shape: name:"ultraplan",get description(){...},argumentHint:"<prompt>",isEnabled:()=>fnRef()
    // Older shape  : name:"ultraplan",description:`...`,argumentHint:"<prompt>",isEnabled:()=>!1
    // The middle metadata block changed from a literal description to a getter,
    // and the gate switched from a literal !1 to a GrowthBook-flag-check function call.
    // Match both.
    name: 'Ultraplan enable',
    pattern: /(name:"ultraplan",[\s\S]{1,500}?argumentHint:"<prompt>",isEnabled:\(\)=>)(?:!1|[\w$]+\(\))/g,
    replacer: (m, prefix) => `${prefix}!0`,
    sentinel: 'name:"ultraplan"',
    appliedMarker: 'argumentHint:"<prompt>",isEnabled:()=>!0',
  },
  {
    // ≤v2.1.110: function X(){return Y("tengu_review_bughunter_config",null)?.enabled===!0}
    // v2.1.119+: function X(){return Y("tengu_review_bughunter_config",null)} — bare getter
    // v2.1.152+: same bare-getter shape, config also feeds cost_note/duration_note/model
    // v2.1.214+: config key moved to a variable:
    //   var Yau="tengu_review_bughunter_config";
    //   function Fot(){return et(Yau,null)}
    //   function rQt(){return Fot()?.enabled===!0&&ru()&&!J6()}
    //   Patch rQt to always return true so ultrareview is unlocked.
    //   Also match the old direct-literal form for <=2.1.213 compat.
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
    // v2.1.215+: the getter now uses a variable indirection — e.g.
    //   function Bot(){return et(ulu,null)}   (ulu = "tengu_review_bughunter_config")
    //   function oQt(){return Bot()?.enabled===!0&&ru()&&!X6()}
    // The old pattern can't match because et() receives a variable, not the
    // literal string. Match the getter (which uses ulu) and gate function
    // together. The ulu variable reference is unique to this feature.
    name: 'Ultrareview enable (v2.1.215+ gate)',
    pattern: /(function ([\w$]+)\(\)\{return [\w$]+\(ulu,null\)\})([\s\S]{0,1500}?)(function ([\w$]+)\(\)\{return \2\(\)\?\.enabled===!0&&[\w$]+\(\)&&![\w$]+\(\)\})/g,
    replacer: (m, getterDef, getter, between, gateDef, gate) =>
      `${getterDef}${between}function ${gate}(){/*__clawgod_ultrareview_enabled__*/return!0}`,
    sentinel: 'var ulu="tengu_review_bughunter_config"',
    appliedMarker: '/*__clawgod_ultrareview_enabled__*/',
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
    // CLI subcommand registered via commander chain:
    //   .command("update").alias("upgrade").description("…").action(async()=>{…})
    // The original action's update path is broken under clawgod: detectInstallType()
    // returns "unknown" because the launcher hides our cli.cjs from upstream's
    // path heuristics, and the unknown-fallback branch on macOS overwrites
    // ~/.bun/bin/bun by extracting the bun runtime out of the new native binary
    // (preserving Apr-19-build mtime). That **silently downgrades** clawgod's
    // required Bun and crashes cli.original.cjs the next launch with
    // "Expected CommonJS module to have a function wrapper". On Windows the
    // same fallback writes the new binary somewhere our drift detection
    // doesn't scan, so the user sees "Successfully updated" but never gets
    // the new version.
    //
    // Redirect to clawgod's own self-update so the upgrade goes through
    // install.sh (re-extract + re-patch + re-launcher). Always pull the
    // latest install.sh from the release so users get patcher fixes too.
    // Escape hatch printed on every run: `install.sh --uninstall` restores
    // claude.orig and lets vanilla `claude update` work again.
    name: "Redirect `claude update` to clawgod self-update",
    pattern: /(\.command\("update"\)\.alias\("upgrade"\)\.description\("[^"]+"\))(\.action\((?:[a-z]\()?async\([^)]*\)=>\{)/g,
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
  // ── 绿色主题 (patch 标识) ──

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

  // ── macOS Cmd+V 图片粘贴修复 ──

  {
    // Under Bun runtime (clawgod), macOS Cmd+V pastes the image file path
    // as text instead of triggering the clipboard image read. The paste
    // handler detects the path as an image file (rju), tries to read it
    // via nju, fails, and falls through to display the raw path as text.
    //
    // The paste handler flow:
    //   1. Empty text + macOS → clipboard reader (m()) — works ✓
    //   2. Text with paths → rju() detects image paths → nju() reads files
    //   3. If reads succeed → display images ✓
    //   4. If ALL reads fail → else branch:
    //      else if(N&&d) m()   ← N = TemporaryItems/screenshot check
    //      else We("input_image_drag","read_failed"), g(x), y()
    //
    // Bug: the else-if only calls clipboard reader (m) for macOS screenshot
    // temp paths (N = /TemporaryItems/...screencaptureui/.../Screenshot/).
    // For other image paths (Preview, Finder, web copies), the final else
    // types the raw path as text.
    //
    // Note: there's also a fallback inside the if(W.length>0) block:
    //   if(W.length===0&&k.length>0){...if(d&&O.length===0){m();return}...}
    // But that's dead code — when all reads fail (W.length===0 && P.length===0),
    // the outer if(W.length>0||P.length>0) is false, so we skip straight to
    // the else branch.
    //
    // Shape:
    //   }else if(N&&d)m();else We("input_image_drag","read_failed"),g(x),y()
    //
    // Patched:
    //   }else if(d)m();else We("input_image_drag","read_failed"),g(x),y()
    //
    // Always try clipboard reader on macOS when image path reads failed,
    // not just for TemporaryItems screenshot paths.
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

  // ── Glob/Grep 工具恢复 ──

  {
    // Bun inlines EMBEDDED_SEARCH_TOOLS env as literal "true" at compile time.
    // This makes bC() always return true → Wft() returns the shadow set
    // containing "Glob" and "Grep" → those tools are hidden from the user.
    // Under clawgod (Bun runtime, not native binary) the env is unset, but
    // the code still says ct("true") instead of ct(process.env.EMBEDDED_SEARCH_TOOLS).
    //
    // Shape:
    //   function bC(){if(!ct("true"))return!1;if(mEr())return!1;
    //     return process.env.CLAUDE_CODE_ENTRYPOINT!=="local-agent"}
    //
    // Patch: replace ct("true") with ct(process.env.EMBEDDED_SEARCH_TOOLS)
    // so the guard reads the actual env var (unset → falsy → return false →
    // Glob/Grep tools available).
    name: 'Restore Glob/Grep tools (un-inline EMBEDDED_SEARCH_TOOLS)',
    pattern: /function ([\w$]+)\(\)\{if\(!([\w$]+)\("true"\)\)return!1;if\([\w$]+\(\)\)return!1;return process\.env\.CLAUDE_CODE_ENTRYPOINT!=="local-agent"\}/g,
    replacer: (m, fn, envCheck) =>
      `function ${fn}(){if(!${envCheck}(process.env.EMBEDDED_SEARCH_TOOLS))return!1;if(typeof globalThis.__dpBinOk>"u"){try{var _w=process.platform==="win32"?"where":"which";require("child_process").execFileSync(_w,["bfs"],{timeout:2e3});require("child_process").execFileSync(_w,["ugrep"],{timeout:2e3});globalThis.__dpBinOk=!0}catch{globalThis.__dpBinOk=!1}}if(!globalThis.__dpBinOk)return!1;return process.env.CLAUDE_CODE_ENTRYPOINT!=="local-agent"}`,
    sentinel: 'ct("true")',
    optional: true,
  },

  // ── 地区隐写中和 (v2.1.197+) ──

  {
    // v2.1.197+: geo-steganography in system prompt date string.
    // qla(e) builds "Today{apostrophe}s date is {date}." where:
    //   - the apostrophe encodes proxy-detection state (U+0027/U+2019/U+02BC/U+02B9)
    //   - the date separator encodes timezone (- for non-CN, / for CN)
    //
    // Shape:
    //   function qla(e){let t=rdp(),n=odp(t?.known??!1,t?.labKw??!1),
    //     r=t?.cnTZ?e.replaceAll("-","/"):e;return`Today${n}s date is ${r}.`}
    //
    // Patch: replace entire function body to always use ASCII apostrophe
    // and pass through the date string unmodified.
    name: 'Neutralize geo-steganography in date string (qla)',
    pattern: /function ([\w$]+)\([\w$]+\)\{let [\w$]+=[\w$]+\(\),[\w$]+=[\w$]+\([\w$]+\?\.[\w$]+\?\?!1,[\w$]+\?\.[\w$]+\?\?!1\),[\w$]+=[\w$]+\?\.[\w$]+\?[\w$]+\.replaceAll\("-","\/"\):[\w$]+;return`Today\$\{[\w$]+\}s date is \$\{[\w$]+\}\.`\}/g,
    replacer: (m) => {
      // Extract function name and parameter name from the match
      const fnMatch = m.match(/^function ([\w$]+)\(([\w$]+)\)/);
      if (!fnMatch) return m;
      const [, fn, param] = fnMatch;
      return `function ${fn}(${param}){return\`Today's date is \${${param}}.\`}`;
    },
    sentinel: 'replaceAll("-","/")',
  },
  {
    // v2.1.197+: rdp() performs three-axis geo detection:
    //   1. timezone === "Asia/Shanghai" || "Asia/Urumqi"  → cnTZ
    //   2. ANTHROPIC_BASE_URL hostname in XOR-obfuscated domain blocklist → known
    //   3. ANTHROPIC_BASE_URL contains CN-LLM vendor keywords → labKw
    //
    // Shape:
    //   function rdp(){if(vrt())return null;let e=ndp(),t=ekt(),
    //     n=t==="Asia/Shanghai"||t==="Asia/Urumqi";if(!e)return{known:!1,labKw:!1,cnTZ:n,host:null};
    //     return{known:edp().some(...),labKw:tdp().some(...),cnTZ:n,host:e}}
    //
    // Patch: always return null (same as firstParty path), disabling all detection.
    name: 'Neutralize geo-detection probe (rdp)',
    pattern: /function ([\w$]+)\(\)\{if\([\w$]+\(\)\)return null;let [\w$]+=[\w$]+\(\),[\w$]+=[\w$]+\(\),[\w$]+=[\w$]+==="Asia\/Shanghai"\|\|[\w$]+==="Asia\/Urumqi"[\s\S]*?\}\}/g,
    replacer: (m) => {
      const fn = m.match(/^function ([\w$]+)/)[1];
      return `function ${fn}(){return null}`;
    },
    sentinel: 'Asia/Shanghai',
  },
  {
    // v2.1.197+: odp(known, labKw) selects a Unicode apostrophe to encode
    // proxy detection state into the system prompt:
    //   !known && !labKw → U+0027 (ASCII)
    //   known  && !labKw → U+2019 (RIGHT SINGLE QUOTATION MARK)
    //   !known && labKw  → U+02BC (MODIFIER LETTER APOSTROPHE)
    //   known  && labKw  → U+02B9 (MODIFIER LETTER PRIME)
    //
    // Shape:
    //   function odp(e,t){if(!e&&!t)return"'";if(e&&!t)return"'";
    //     if(!e&&t)return"ʼ";return"ʹ"}
    //
    // Patch: always return ASCII apostrophe regardless of detection state.
    // The return values may appear as \uXXXX escapes or literal UTF-8 in
    // the bundle depending on bundler version. Match both forms.
    // Defense-in-depth — qla patch above already bypasses the call to odp,
    // but if qla's shape changes this keeps odp harmless.
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
    optional: true,  // defense-in-depth; rdp→null already neutralizes the stego channel
  },

  // ── 限制移除 ──

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

  // ── 消息过滤 ──

  {
    // v2.1.88-~v2.1.91: fn()!=="ant"){if(q.attachment.type==="hook_additional_context"...
    // v2.1.92+        : fn()!=="ant"&&paY.has(q.attachment.type) — paY is an empty Set
    //                    in v2.1.110, so this filter is effectively a no-op; patch anyway
    //                    to guard against paY being populated in future versions.
    name: 'Attachment filter bypass',
    pattern: /([\w$]+)\(\)!=="ant"(&&[\w$]+\.has\([\w$]+\.attachment\.type\)|\)\{if\([\w$]+\.attachment\.type==="hook_additional_context")/g,
    replacer: (m) => m.replace(/([\w$]+)\(\)!=="ant"/, 'false'),
    optional: true,  // filter may be removed entirely in future versions
  },
  {
    // Legacy (≤v2.1.91) ternary form: fn()!=="ant"?tRY(_,sRY(K)):K
    name: 'Message list filter bypass (legacy ternary)',
    pattern: /([\w$]+)\(\)!=="ant"\?([\w$]+)\(([\w$]+),([\w$]+)\(([\w$]+)\)\):([\w$]+)/g,
    replacer: (m, fn, tRY, underscore, sRY, K, fallback) => fallback,
    optional: true,  // removed in v2.1.92+
  },
  {
    // v2.1.92+ (s_8): if(fn()==="ant")return _;let z=...;return FaY(_,z)
    // Flip the guard so non-ant users also return the pre-filtered list.
    name: 'Message list filter bypass (s_8 form)',
    pattern: /if\(([\w$]+)\(\)==="ant"\)return ([\w$]+);let ([\w$]+)=([\w$]+) instanceof Set\?\4:([\w$]+)\(\4\);return ([\w$]+)\(\2,\3\)/g,
    replacer: (m, fn, ret) => `return ${ret}`,
    optional: true,  // legacy versions had a ternary instead
  },
  {
    // Shell-integration generator (iT6 in v2.1.140, was Wa1 in older versions)
    // emits a zsh/bash function that calls the native claude binary with
    // ARGV0=ugrep|rg|... for multitool dispatch. After clawgod installs, the
    // baked path points at our shell-script launcher — but shell scripts
    // CANNOT preserve argv[0] (kernel shebang re-exec overwrites it, and zsh
    // additionally refuses to export ARGV0 as env). The shell function then
    // fails because bun receives e.g. -G and errors with "Invalid Argument".
    //
    // Fix: redirect the baked path to claude.orig (the native binary backup
    // clawgod creates at install time). Then the multitool dispatch reaches
    // a real binary that honors argv[0]. See issue #82.
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
    optional: true,  // v2.1.88-era bundles compute the path differently
  },
];

// ─── Main ─────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verify = args.includes('--verify');
const revert = args.includes('--revert');

if (revert) {
  if (!existsSync(BACKUP)) { console.error('❌ No backup found'); process.exit(1); }
  copyFileSync(BACKUP, TARGET);
  console.log('✅ Reverted from backup');
  process.exit(0);
}

if (!existsSync(TARGET)) {
  console.error('❌ Target not found:', TARGET);
  process.exit(1);
}

let code = readFileSync(TARGET, 'utf8');
const origSize = code.length;

// Extract version
const verMatch = code.match(/Version:\s*([\d.]+)/);
const version = verMatch ? verMatch[1] : 'unknown';

console.log(`\n${'═'.repeat(55)}`);
console.log(`  ClawGod Plus (universal)`);
console.log(`  Target: cli.original.cjs (v${version})`);
console.log(`  Mode: ${dryRun ? 'DRY RUN' : verify ? 'VERIFY' : 'APPLY'}`);
console.log(`${'═'.repeat(55)}\n`);

let applied = 0, skipped = 0, failed = 0;

for (const p of patches) {
  const matches = [...code.matchAll(p.pattern)];
  let relevant = matches;

  // Filter by validation if provided
  if (p.validate) {
    relevant = matches.filter(m => p.validate(m[0], code));
  }

  // Select specific match index
  if (p.selectIndex !== undefined) {
    relevant = relevant.length > p.selectIndex ? [relevant[p.selectIndex]] : [];
  }

  // Uniqueness check — skip when 0 so the sentinel / already-applied
  // fallthrough can handle it; only fail on >1 (ambiguous).
  if (p.unique && relevant.length > 1) {
    console.log(`  ⚠️  ${p.name} — ${relevant.length} matches, skipping (need 1)`);
    failed++;
    continue;
  }

  if (relevant.length === 0) {
    if (p.knownShape?.test(code)) {
      console.log(`  ❌ ${p.name} — known resolver shape did not match exactly`);
      failed++;
      continue;
    }
    // appliedMarker: a substring that exists ONLY in this patch's output. Some
    // replacements retain their own sentinel (Ultraplan keeps name:"ultraplan";
    // Ultrareview keeps "tengu_review_bughunter_config"), which made the sentinel
    // check below misfire as "regex stale" on a file that was in fact patched.
    // A present marker means the patch is applied.
    if (p.appliedMarker !== undefined && (p.appliedMarker instanceof RegExp ? p.appliedMarker.test(code) : code.includes(p.appliedMarker))) {
      console.log(`  ✅ ${p.name} (already applied, marker present)`);
      applied++;
      continue;
    }
    if (p.optional) {
      console.log(`  ⏭  ${p.name} (not present in this version)`);
      skipped++;
      continue;
    }
    // If the patch declares a sentinel (a string that must NOT exist in a
    // fully-patched file), use it to tell "already applied" apart from
    // "regex is stale and silently missed the target".
    if (p.sentinel !== undefined) {
      const sentinels = Array.isArray(p.sentinel) ? p.sentinel : [p.sentinel];
      const stillPresent = sentinels.filter((s) => code.includes(s));
      if (stillPresent.length > 0) {
        console.log(`  ❌ ${p.name} — regex stale, sentinel still in source: ${stillPresent.map((s) => JSON.stringify(s)).join(', ')}`);
        failed++;
        continue;
      }
      console.log(`  ✅ ${p.name} (already applied, sentinel absent)`);
      applied++;
      continue;
    }
    console.log(`  ⚠️  ${p.name} (0 matches, no sentinel — cannot verify)`);
    skipped++;
    continue;
  }

  if (verify) {
    console.log(`  ⬚  ${p.name} — ${relevant.length} match(es), not yet applied`);
    skipped++;
    continue;
  }

  // Apply patch
  let count = 0;
  for (const m of relevant) {
    const replacement = p.replacer(m[0], ...m.slice(1));
    if (replacement !== m[0]) {
      if (!dryRun) {
        // Use function-form replace: String.prototype.replace with a string
        // replacement interprets $$ as literal $, $1/$& as backreferences.
        // Minified upstream identifiers like `a$$` would silently become `a$`
        // and break every caller referencing the original name. Function form
        // is opaque to the parser. (issue #86)
        code = code.replace(m[0], () => replacement);
      }
      count++;
    }
  }

  if (count > 0) {
    console.log(`  ✅ ${p.name} (${count} replacement${count > 1 ? 's' : ''})`);
    applied++;
  } else {
    console.log(`  ⏭  ${p.name} (no change needed)`);
    skipped++;
  }
}

const claudeApiSkillPatch = await applyClaudeApiSkillLazyDocsPatch(code, { dryRun, verify });
if (claudeApiSkillPatch.status === 'applied') {
  if (!dryRun) code = claudeApiSkillPatch.code;
  console.log(`  ✅ Claude API skill lazy docs (${claudeApiSkillPatch.count} replacement${claudeApiSkillPatch.count > 1 ? 's' : ''})`);
  applied++;
} else if (claudeApiSkillPatch.status === 'verify') {
  console.log(`  ⬚  Claude API skill lazy docs — ${claudeApiSkillPatch.count} match(es), not yet applied`);
  skipped++;
} else if (claudeApiSkillPatch.status === 'already') {
  console.log(`  ✅ Claude API skill lazy docs (${claudeApiSkillPatch.detail})`);
  applied++;
} else if (claudeApiSkillPatch.status === 'skipped') {
  console.log(`  ⏭  Claude API skill lazy docs (${claudeApiSkillPatch.detail})`);
  skipped++;
} else {
  console.log(`  ❌ Claude API skill lazy docs — ${claudeApiSkillPatch.detail}`);
  failed++;
}

const contextLimitPatch = await applyContextLimitPatch(code, { dryRun, verify });
if (contextLimitPatch.status === 'applied') {
  if (!dryRun) code = contextLimitPatch.code;
  console.log(`  ✅ Context limit configurable (${contextLimitPatch.count} replacement${contextLimitPatch.count > 1 ? 's' : ''})`);
  applied++;
} else if (contextLimitPatch.status === 'verify') {
  console.log(`  ⬚  Context limit configurable — ${contextLimitPatch.count} match(es), not yet applied`);
  skipped++;
} else if (contextLimitPatch.status === 'already') {
  console.log(`  ✅ Context limit configurable (${contextLimitPatch.detail})`);
  applied++;
} else if (contextLimitPatch.status === 'skipped') {
  console.log(`  ⏭  Context limit configurable (${contextLimitPatch.detail})`);
  skipped++;
} else {
  console.log(`  ❌ Context limit configurable — ${contextLimitPatch.detail}`);
  failed++;
}

const fastMessagesProtocolPatch = await applyFastMessagesProtocolPatch(code, { dryRun, verify });
if (fastMessagesProtocolPatch.status === 'applied') {
  if (!dryRun) code = fastMessagesProtocolPatch.code;
  console.log(`  ✅ Fast Messages protocol (${fastMessagesProtocolPatch.count} replacement${fastMessagesProtocolPatch.count > 1 ? 's' : ''})`);
  applied++;
} else if (fastMessagesProtocolPatch.status === 'verify') {
  console.log(`  ⬚  Fast Messages protocol — ${fastMessagesProtocolPatch.count} match(es), not yet applied`);
  skipped++;
} else if (fastMessagesProtocolPatch.status === 'already') {
  console.log(`  ✅ Fast Messages protocol (${fastMessagesProtocolPatch.detail})`);
  applied++;
} else if (fastMessagesProtocolPatch.status === 'skipped') {
  console.log(`  ⏭  Fast Messages protocol (${fastMessagesProtocolPatch.detail})`);
  skipped++;
} else {
  console.log(`  ❌ Fast Messages protocol — ${fastMessagesProtocolPatch.detail}`);
  failed++;
}

const chromePatch = await applyClaudeChromeSocketPatch(code, { dryRun, verify });
if (chromePatch.status === 'applied') {
  if (!dryRun) code = chromePatch.code;
  console.log(`  ✅ Claude in Chrome local socket fallback (${chromePatch.count} replacement${chromePatch.count > 1 ? 's' : ''})`);
  applied++;
} else if (chromePatch.status === 'verify') {
  console.log(`  ⬚  Claude in Chrome local socket fallback — ${chromePatch.count} match(es), not yet applied`);
  skipped++;
} else if (chromePatch.status === 'already') {
  console.log(`  ✅ Claude in Chrome local socket fallback (${chromePatch.detail})`);
  applied++;
} else if (chromePatch.status === 'skipped') {
  console.log(`  ⏭  Claude in Chrome local socket fallback (${chromePatch.detail})`);
  skipped++;
} else {
  console.log(`  ❌ Claude in Chrome local socket fallback — ${chromePatch.detail}`);
  failed++;
}

console.log(`\n${'─'.repeat(55)}`);
console.log(`  Result: ${applied} applied, ${skipped} skipped, ${failed} failed`);

if (failed === 0 && !dryRun && !verify && applied > 0) {
  if (!existsSync(BACKUP)) {
    copyFileSync(TARGET, BACKUP);
    console.log(`  📦 Backup: ${BACKUP}`);
  }
  writeFileSync(TARGET, code, 'utf8');
  const diff = code.length - origSize;
  console.log(`  📝 Written: cli.original.cjs (${diff >= 0 ? '+' : ''}${diff} bytes)`);
}

console.log(`${'═'.repeat(55)}\n`);
if (failed > 0) process.exit(1);
PATCHER_EOF
info "Patcher created (patch.mjs)"

# ─── Apply patches ─────────────────────────────────────

dim "Applying patches ..."
patch_status=0
patch_output=$("$BUN_BIN" "$CLAWGOD_DIR/patch.mjs" 2>&1) || patch_status=$?
while IFS= read -r line; do echo "  $line"; done <<< "$patch_output"
if [ "$patch_status" -ne 0 ]; then
  err "Mandatory patching failed; installation stopped before launcher replacement."
  exit "$patch_status"
fi
run_claude_code_chrome_fix

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

# ─── Sanity check: ensure user's Bun can actually load cli.original.cjs ──
# Anthropic builds the native binary with a bleeding-edge Bun build (e.g.
# 1.3.14 while stable still ships 1.3.13). Older Bun crashes loading the
# extracted cli.original.cjs with "Expected CommonJS module to have a
# function wrapper". Detect this BEFORE we install the launcher — better
# to fail loudly than to leave the user with a launcher that panics on
# first invocation.

dim "Verifying Bun can load patched cli.original.cjs ..."
sanity_status=0
set +e
sanity_out=$("$BUN_BIN" "$CLAWGOD_DIR/cli.cjs" --version 2>&1)
sanity_status=$?
set -e
if echo "$sanity_out" | grep -q "Expected CommonJS module to have a function wrapper"; then
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
  if [ "$sanity_status" -eq 0 ]; then sanity_status=1; fi
  exit "$sanity_status"
fi
if [ "$sanity_status" -ne 0 ]; then
  [ -n "$sanity_out" ] && printf '%s\n' "$sanity_out" >&2
  err "Bun failed to load patched cli.original.cjs (exit $sanity_status)."
  exit "$sanity_status"
fi
info "Bun loads cli.original.cjs"

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
