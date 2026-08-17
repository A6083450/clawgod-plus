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

@@CLAWGOD_UNIX_LIFECYCLE@@

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
  rm -rf "$CLAWGOD_DIR/node_modules" "$CLAWGOD_DIR/vendor" "$CLAWGOD_DIR/bun-runtime" "$CLAWGOD_DIR/cli.original.js" "$CLAWGOD_DIR/cli.original.js.bak" "$CLAWGOD_DIR/cli.original.cjs" "$CLAWGOD_DIR/cli.original.cjs.bak" "$CLAWGOD_DIR/cli.js" "$CLAWGOD_DIR/cli.cjs" "$CLAWGOD_DIR/patch.mjs" "$CLAWGOD_DIR/patch.js" "$CLAWGOD_DIR/extract-natives.mjs" "$CLAWGOD_DIR/post-process.mjs" "$CLAWGOD_DIR/repatch.mjs" "$CLAWGOD_DIR/vendor-transaction.mjs" "$CLAWGOD_DIR/openai-proxy.cjs" "$CLAWGOD_DIR/fetch-file.mjs" "$CLAWGOD_DIR/enhancement-config.mjs" "$CLAWGOD_DIR/enhancement-manifest.json" "$CLAWGOD_DIR/install-ripgrep.mjs" "$CLAWGOD_DIR/clawgod-import" "$CLAWGOD_DIR/apply-claude-code-chrome-fix.sh" "$CLAWGOD_DIR/claude-mem-compat.cjs" "$CLAWGOD_DIR/claude-mem" "$CLAWGOD_DIR/plugin-dependencies.mjs" "$CLAWGOD_DIR/claude-hud-statusline.mjs" "$CLAWGOD_DIR/plugin-dependencies-state.json" "$CLAWGOD_DIR/cache" "$CLAWGOD_DIR/staging" "$CLAWGOD_DIR/.source-version" "$CLAWGOD_DIR/.clawgod-version" "$CLAWGOD_DIR/.update-check" "$CLAWGOD_DIR/install.sh" "$CLAWGOD_DIR"/cli.original.js.backup-* "$CLAWGOD_DIR"/cli.original.cjs.backup-*
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
@@CLAWGOD_ENHANCEMENT_CONFIG_MJS@@
ENHANCEMENT_CONFIG_EOF
chmod 700 "$CLAWGOD_DIR/enhancement-config.mjs"
cat > "$CLAWGOD_DIR/enhancement-manifest.json" << 'ENHANCEMENT_MANIFEST_EOF'
@@CLAWGOD_ENHANCEMENTS_JSON@@
ENHANCEMENT_MANIFEST_EOF
chmod 600 "$CLAWGOD_DIR/enhancement-manifest.json"
configure_enhancement_selection

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

cat > "$CLAWGOD_DIR/vendor-transaction.mjs" << 'VENDOR_TRANSACTION_EOF'
@@CLAWGOD_VENDOR_TRANSACTION_MJS@@
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
  RUNTIME_TRANSACTION_ACTIVE=0
  if [ "$RUNTIME_TRANSACTION_CLEANUP_SAFE" = "1" ]; then
    rm -rf "$RUNTIME_TRANSACTION_DIR" 2>/dev/null || true
  else
    printf '%s\n' "clawgod: prior CLI restored; untrusted transaction data retained at $RUNTIME_TRANSACTION_DIR" >&2
  fi
}

commit_runtime_transaction() {
  if [ "$RUNTIME_HAS_CANDIDATE_VENDOR" = "1" ]; then
    RUNTIME_VENDOR_PUBLISH_STARTED=1
    vendor_status=0
    "$BUN_BIN" "$CLAWGOD_DIR/vendor-transaction.mjs" publish "$CLAWGOD_DIR/vendor" "$RUNTIME_TRANSACTION_DIR/candidate/vendor" "$RUNTIME_TRANSACTION_DIR" || vendor_status=$?
    if [ "$vendor_status" -ne 0 ]; then
      if [ "$vendor_status" -eq 20 ] || [ "$vendor_status" -eq 22 ]; then
        RUNTIME_VENDOR_ROLLBACK_COMPLETE=1
        [ "$vendor_status" -eq 22 ] && RUNTIME_TRANSACTION_CLEANUP_SAFE=0
      fi
      return "$vendor_status"
    fi
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
RUNTIME_TRANSACTION_ACTIVE=1
trap 'rollback_runtime_transaction' EXIT

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
cp "$CLAWGOD_DIR/post-process.mjs" "$RUNTIME_CANDIDATE_DIR/post-process.mjs"
"$BUN_BIN" "$RUNTIME_CANDIDATE_DIR/post-process.mjs" 2>&1 | while IFS= read -r line; do echo "  $line"; done
[ -f "$RUNTIME_CANDIDATE_DIR/cli.original.cjs" ] || { err "Post-process failed"; exit 1; }
mv "$RUNTIME_CANDIDATE_DIR/cli.original.cjs" "$CLAWGOD_DIR/cli.original.cjs"
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
@@CLAWGOD_PATCHER_MJS@@
PATCHER_EOF
info "Patcher created (patch.mjs)"

# ─── Apply patches ─────────────────────────────────────

dim "Applying patches ..."
patch_status=0
patch_output=$("$BUN_BIN" "$CLAWGOD_DIR/patch.mjs" --enhancements-file "$CLAWGOD_DIR/enhancements.json" 2>&1) || patch_status=$?
while IFS= read -r line; do echo "  $line"; done <<< "$patch_output"
if [ "$patch_status" -ne 0 ]; then
  err "Mandatory patching failed; installation stopped before launcher replacement."
  exit "$patch_status"
fi
commit_runtime_transaction
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

@@CLAWGOD_UNIX_LAUNCHER@@


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
