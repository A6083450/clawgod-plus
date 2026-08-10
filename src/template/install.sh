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

install_claude_mem_compat_helper() {
  cat > "$CLAWGOD_DIR/claude-mem-compat.cjs" << 'CLAUDE_MEM_COMPAT_EOF'
@@CLAWGOD_CLAUDE_MEM_COMPAT_CJS@@
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
  rm -rf "$CLAWGOD_DIR/node_modules" "$CLAWGOD_DIR/vendor" "$CLAWGOD_DIR/bun-runtime" "$CLAWGOD_DIR/cli.original.js" "$CLAWGOD_DIR/cli.original.js.bak" "$CLAWGOD_DIR/cli.original.cjs" "$CLAWGOD_DIR/cli.original.cjs.bak" "$CLAWGOD_DIR/cli.js" "$CLAWGOD_DIR/cli.cjs" "$CLAWGOD_DIR/patch.mjs" "$CLAWGOD_DIR/patch.js" "$CLAWGOD_DIR/extract-natives.mjs" "$CLAWGOD_DIR/post-process.mjs" "$CLAWGOD_DIR/repatch.mjs" "$CLAWGOD_DIR/openai-proxy.cjs" "$CLAWGOD_DIR/fetch-file.mjs" "$CLAWGOD_DIR/install-ripgrep.mjs" "$CLAWGOD_DIR/clawgod-import" "$CLAWGOD_DIR/apply-claude-code-chrome-fix.sh" "$CLAWGOD_DIR/claude-mem-compat.cjs" "$CLAWGOD_DIR/claude-mem" "$CLAWGOD_DIR/plugin-dependencies.mjs" "$CLAWGOD_DIR/claude-hud-statusline.mjs" "$CLAWGOD_DIR/plugin-dependencies-state.json" "$CLAWGOD_DIR/cache/claude-plugins" "$CLAWGOD_DIR/staging/claude-plugins" "$CLAWGOD_DIR/.source-version" "$CLAWGOD_DIR/.clawgod-version" "$CLAWGOD_DIR/.update-check" "$CLAWGOD_DIR/install.sh"
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
@@CLAWGOD_FETCH_FILE_MJS@@
FETCH_FILE_EOF
chmod 700 "$CLAWGOD_DIR/fetch-file.mjs"

# --- Optional Claude plugin dependencies -----------------------------

cat > "$CLAWGOD_DIR/plugin-dependencies.mjs" << 'PLUGIN_DEPENDENCIES_EOF'
@@CLAWGOD_PLUGIN_DEPENDENCIES_MJS@@
PLUGIN_DEPENDENCIES_EOF
chmod 700 "$CLAWGOD_DIR/plugin-dependencies.mjs"

# --- Managed ripgrep -------------------------------------------------

cat > "$CLAWGOD_DIR/install-ripgrep.mjs" << 'INSTALL_RIPGREP_EOF'
@@CLAWGOD_INSTALL_RIPGREP_MJS@@
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
@@CLAWGOD_FETCH_PACKAGE_MJS@@
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
@@CLAWGOD_EXTRACTOR_MJS@@
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
@@CLAWGOD_POST_PROCESSOR_MJS@@
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
@@CLAWGOD_REPATCHER_MJS@@
REPATCH_EOF
chmod +x "$CLAWGOD_DIR/repatch.mjs"
info "Re-patch helper installed (repatch.mjs)"

# ─── Write OpenAI-compatible proxy ────────────────────────────

cat > "$CLAWGOD_DIR/openai-proxy.cjs" << 'PROXY_EOF'
@@CLAWGOD_OPENAI_PROXY_CJS@@
PROXY_EOF
info "OpenAI-compatible proxy created (openai-proxy.cjs)"

# ─── Write wrapper (cli.cjs, runs under Bun) ──────────────────

cat > "$CLAWGOD_DIR/cli.cjs" << 'WRAPPER_EOF'
@@CLAWGOD_WRAPPER_CJS@@
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

// ─── Regex-based patches (version-agnostic) ──────────────

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
@@CLAWGOD_FEATURES_JSON@@
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
