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

choose_enhancements() {
  local count=${#CLAWGOD_ENHANCEMENT_IDS[@]}
  local -a selected
  local -a tokens
  local answer token index invalid marker normalized
  local i
  for ((i = 0; i < count; i++)); do selected[$i]=1; done

  while true; do
    printf '\n  Enhancements\n' > /dev/tty
    for ((i = 0; i < count; i++)); do
      marker=' '
      [ "${selected[$i]}" = "1" ] && marker='x'
      printf '  %2d) [%s] %-20s %s\n' "$((i + 1))" "$marker" "${CLAWGOD_ENHANCEMENT_IDS[$i]}" "${CLAWGOD_ENHANCEMENT_LABELS[$i]}" > /dev/tty
    done
    printf '  Choice: ' > /dev/tty
    IFS= read -r answer < /dev/tty

    if [ -z "$answer" ]; then
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
    fi

    local -a candidate=("${selected[@]}")
    invalid=""
    local IFS=,
    read -r -a tokens <<< "$answer"
    case "$answer" in
      ,*|*,|*,,*) invalid=1 ;;
    esac
    for token in "${tokens[@]}"; do
      case "$token" in
        a)
          for ((i = 0; i < count; i++)); do candidate[$i]=1; done
          ;;
        n)
          for ((i = 0; i < count; i++)); do candidate[$i]=0; done
          ;;
        *[!0-9]*|'') invalid=1 ;;
        *)
          normalized="${token#"${token%%[!0]*}"}"
          [ -n "$normalized" ] || normalized=0
          index=""
          for ((i = 1; i <= count; i++)); do
            if [ "$normalized" = "$i" ]; then
              index=$((i - 1))
              break
            fi
          done
          if [ -z "$index" ]; then
            invalid=1
          elif [ "${candidate[$index]}" = "1" ]; then
            candidate[$index]=0
          else
            candidate[$index]=1
          fi
          ;;
      esac
    done
    if [ -n "$invalid" ]; then
      enhancement_warn "Invalid enhancement choice: $answer"
      continue
    fi
    selected=("${candidate[@]}")
  done
}

choose_enhancement_mode() {
  local count=${#CLAWGOD_ENHANCEMENT_IDS[@]}
  local answer
  while true; do
    printf '\n  ClawGod Plus 增强选择\n' > /dev/tty
    printf '   1) 全部 %d 项增强（默认，回车即选）\n' "$count" > /dev/tty
    printf '   2) 仅核心（不装任何增强）\n' > /dev/tty
    printf '   3) 自定义菜单（逐项勾选）\n' > /dev/tty
    printf '  选择 [1]: ' > /dev/tty
    IFS= read -r answer < /dev/tty
    case "$answer" in
      ''|1)
        local IFS=,
        ENHANCEMENT_CHOICE="${CLAWGOD_ENHANCEMENT_IDS[*]}"
        return 0
        ;;
      2) ENHANCEMENT_CHOICE=none; return 0 ;;
      3) choose_enhancements; return 0 ;;
      *) enhancement_warn "Invalid enhancement choice: $answer" ;;
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
    if enhancement_interaction_available; then
      choose_enhancements
      persist_enhancement_selection "$ENHANCEMENT_CHOICE"
      return
    fi
    enhancement_warn 'Interactive enhancement selection unavailable; using saved selection or all enhancements.'
  elif auto_prompt_available; then
    choose_enhancement_mode
    persist_enhancement_selection "$ENHANCEMENT_CHOICE"
    return
  fi
  persist_enhancement_selection '__CLAWGOD_SAVED__'
}
