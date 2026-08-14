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
}

clawgod_menu_raw_off() {
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
