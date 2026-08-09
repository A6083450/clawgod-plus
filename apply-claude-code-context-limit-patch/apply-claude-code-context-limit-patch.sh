#!/usr/bin/env bash
# =============================================================================
# Claude Code / ClawGod Plus — Configurable Context Limit Patch
#
# Makes the hardcoded 200000 (200K) default context window configurable via:
#   CLAUDE_CODE_CONTEXT_LIMIT
# (falls back to CLAUDE_CODE_MAX_CONTEXT_TOKENS, then 200000)
#
# Targets Claude Code 2.1.x bundles (including ClawGod Plus ~/.clawgod/cli.original.cjs).
#
# What this patches
#   1) Default dual constants (minified names vary), e.g.:
#        var dJt=200000,UAe=200000,xag=32000,kag=128000,Dag=1e6
#      -> both 200000 become env-driven expressions
#   2) Re-assign those vars at the end of settings env-loader functions so
#      values from ~/.claude/settings.json "env" take effect after load
#   3) (optional) large-message comparison Rxe(n)>200000 → same limit
#
# What this does NOT do
#   - Bypass Anthropic first-party Extra Usage / long-context credits gating
#   - Change model catalog metadata (context:{window:200000, supports_1m_...})
#   - Survive `claude update` / ClawGod Plus reinstall — re-run after upgrades
#
# Usage after patch
#   CLAUDE_CODE_CONTEXT_LIMIT=1000000 claude
#   # or in ~/.claude/settings.json:
#   # { "env": { "CLAUDE_CODE_CONTEXT_LIMIT": "1000000" } }
#
# Options
#   --check              Check only (exit 1 if patch needed, 0 if already ok)
#   --restore            Restore latest backup
#   --cli-path <path>    Explicit path to cli.original.cjs / cli.js
#   -h, --help           Help
# =============================================================================

set -euo pipefail

BACKUP_SUFFIX="backup-ctxlimit"
FIX_DESCRIPTION="Make context window limit configurable via CLAUDE_CODE_CONTEXT_LIMIT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[X]${NC} $1"; }
info() { echo -e "${BLUE}[>]${NC} $1"; }

CHECK_ONLY=false
RESTORE=false
CLI_PATH=""

usage() {
  cat <<EOF
Claude Code / ClawGod Plus — $FIX_DESCRIPTION

Usage:
  $(basename "$0") [options] [cli-path]

Options:
  --check              Check if patch is needed (no writes)
  --restore            Restore original from latest backup
  --cli-path <path>    Path to cli.original.cjs / cli.js
  -h, --help           Show this help

Examples:
  $(basename "$0")
  $(basename "$0") --check
  $(basename "$0") --cli-path ~/.clawgod/cli.original.cjs
  CLAUDE_CODE_CONTEXT_LIMIT=1000000 claude

Notes:
  - Prefer patching ~/.clawgod/cli.original.cjs when using ClawGod Plus.
  - Do not patch the thin wrapper ~/.clawgod/cli.cjs.
  - First-party "Extra usage is required for longer context" is a billing
    gate; this patch only raises the local 200k default / fallback constants.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) CHECK_ONLY=true; shift ;;
    --restore) RESTORE=true; shift ;;
    --cli-path)
      CLI_PATH="${2:-}"
      if [[ -z "$CLI_PATH" ]]; then err "--cli-path requires a value"; exit 1; fi
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    -*)
      err "Unknown option: $1"
      usage
      exit 1
      ;;
    *)
      CLI_PATH="$1"
      shift
      ;;
  esac
done

find_cli_path() {
  local path="${HOME}/.clawgod/cli.original.cjs"
  if [[ -f "$path" ]]; then
    echo "$path"
    return 0
  fi
  return 1
}

resolve_bun() {
  if command -v bun >/dev/null 2>&1; then
    command -v bun
    return 0
  fi
  if [[ -x "$HOME/.bun/bin/bun" ]]; then
    echo "$HOME/.bun/bin/bun"
    return 0
  fi
  return 1
}

if [[ -n "$CLI_PATH" ]]; then
  if [[ ! -f "$CLI_PATH" ]]; then
    err "Specified file not found: $CLI_PATH"
    exit 1
  fi
  info "Using specified file: $CLI_PATH"
else
  if ! CLI_PATH="$(find_cli_path)"; then
    err "Claude Code / ClawGod Plus bundle not found"
    echo ""
    echo "Searched:"
    echo "  ~/.clawgod/cli.original.cjs"
    echo ""
    echo "Tip: pass the path explicitly:"
    echo "  $(basename "$0") --cli-path /path/to/cli.original.cjs"
    exit 1
  fi
  info "Found bundle: $CLI_PATH"
fi

# Guard: refuse to patch the thin ClawGod Plus launcher wrapper
if [[ "$(basename "$CLI_PATH")" == "cli.cjs" ]] && [[ -f "$(dirname "$CLI_PATH")/cli.original.cjs" ]]; then
  size="$(wc -c <"$CLI_PATH" | tr -d ' ')"
  if [[ "$size" -lt 1000000 ]]; then
    err "Refusing to patch thin wrapper: $CLI_PATH"
    info "Use: $(basename "$0") --cli-path $(dirname "$CLI_PATH")/cli.original.cjs"
    exit 1
  fi
fi

if $RESTORE; then
  dir="$(dirname "$CLI_PATH")"
  base="$(basename "$CLI_PATH")"
  latest="$(ls -1t "${dir}/${base}.${BACKUP_SUFFIX}-"* 2>/dev/null | head -1 || true)"
  if [[ -z "$latest" ]]; then
    err "No backup found (${base}.${BACKUP_SUFFIX}-*)"
    exit 1
  fi
  cp "$latest" "$CLI_PATH"
  ok "Restored from backup: $latest"
  exit 0
fi

BUN_BIN="$(resolve_bun)" || {
  err "Bun is required. Install Bun: https://bun.sh/docs/installation"
  exit 1
}

ACORN_CACHE_BASE="$HOME/.cache"
ACORN_PATH="$ACORN_CACHE_BASE/clawgod-plus/acorn/acorn-8.16.0.cjs"
ACORN_CACHE_SCRIPT="$(mktemp "${TMPDIR:-/tmp}/clawgod-acorn-cache-XXXXXX.mjs")"
cat > "$ACORN_CACHE_SCRIPT" <<'ACORN_CACHE_EOF'
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const cacheBase = process.argv[2];
if (!cacheBase) throw new Error('usage: acorn cache manager <cache-base>');
const ACORN_URL = 'https://unpkg.com/acorn@8.16.0/dist/acorn.js';
const ACORN_SHA512 = 'd883627a2de353f34bc25ffb7bbe277c84186720619fe3cbecc3c5885b379635e67019c8d8db7a24e21e8f82e1486e8038b4d13d642b40a684995d0867ed55b3';

function lstatIfPresent(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function assertDirectory(path, create = false) {
  let stat = lstatIfPresent(path);
  if (!stat) {
    if (!create) throw new Error(`Acorn cache parent is missing: ${path}`);
    mkdirSync(path, { mode: 0o700 });
    stat = lstatSync(path);
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Unsafe Acorn cache directory: ${path}`);
  if (process.platform !== 'win32') chmodSync(path, 0o700);
}

function sha512(bytes) {
  return new Bun.CryptoHasher('sha512').update(bytes).digest('hex');
}

function verifiedRegularFile(path) {
  const stat = lstatIfPresent(path);
  if (!stat) return false;
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Unsafe Acorn cache file: ${path}`);
  return sha512(readFileSync(path)) === ACORN_SHA512;
}

const base = resolve(cacheBase);
assertDirectory(dirname(base));
assertDirectory(base, true);
const managed = join(base, 'clawgod-plus');
const acornDir = join(managed, 'acorn');
assertDirectory(managed, true);
assertDirectory(acornDir, true);
const destination = join(acornDir, 'acorn-8.16.0.cjs');

if (verifiedRegularFile(destination)) {
  if (process.platform !== 'win32') chmodSync(destination, 0o600);
  process.exit(0);
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
    return (host === baseHost || host.endsWith(`.${baseHost}`)) && (!rule.port || rule.port === port);
  });
}

function proxyFor(urlValue) {
  const parsed = new URL(urlValue);
  if (bypassesProxy(parsed)) return undefined;
  return parsed.protocol === 'https:'
    ? process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy
    : process.env.HTTP_PROXY || process.env.http_proxy;
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

async function fetchWithProxy(initialUrl) {
  let nextUrl = initialUrl;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const bypass = bypassesProxy(nextUrl);
    const proxy = proxyFor(nextUrl);
    let response;
    try {
      const init = { redirect: 'manual', signal: AbortSignal.timeout(300000), ...(proxy ? { proxy } : {}) };
      response = bypass ? await fetchDirect(nextUrl, init, fetch) : await fetch(nextUrl, init);
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

const response = await fetchWithProxy(ACORN_URL);
const bytes = new Uint8Array(await response.arrayBuffer());
if (sha512(bytes) !== ACORN_SHA512) throw new Error('Acorn 8.16.0 SHA-512 mismatch');

const transaction = randomUUID();
const temporary = join(acornDir, `.acorn-${transaction}.tmp`);
const displaced = join(acornDir, `.acorn-${transaction}.previous`);
let movedExisting = false;
try {
  await Bun.write(temporary, bytes);
  const temporaryStat = lstatSync(temporary);
  if (temporaryStat.isSymbolicLink() || !temporaryStat.isFile()) throw new Error('Unsafe staged Acorn cache file');
  if (process.platform !== 'win32') chmodSync(temporary, 0o600);
  const destinationStat = lstatIfPresent(destination);
  if (destinationStat) {
    if (destinationStat.isSymbolicLink() || !destinationStat.isFile()) throw new Error(`Unsafe Acorn cache file: ${destination}`);
    renameSync(destination, displaced);
    movedExisting = true;
  }
  renameSync(temporary, destination);
  if (!verifiedRegularFile(destination)) throw new Error('Installed Acorn cache failed verification');
  if (movedExisting) rmSync(displaced, { force: true });
  movedExisting = false;
} catch (error) {
  if (movedExisting) {
    if (lstatIfPresent(destination)) rmSync(destination, { force: true });
    if (lstatIfPresent(displaced)) renameSync(displaced, destination);
  }
  throw error;
} finally {
  if (existsSync(temporary)) rmSync(temporary, { force: true });
  if (existsSync(displaced)) rmSync(displaced, { force: true });
}
ACORN_CACHE_EOF
set +e
"$BUN_BIN" "$ACORN_CACHE_SCRIPT" "$ACORN_CACHE_BASE"
ACORN_CACHE_EXIT=$?
set -e
rm -f "$ACORN_CACHE_SCRIPT"
if [[ $ACORN_CACHE_EXIT -ne 0 ]]; then
  err "Failed to prepare verified Acorn cache"
  exit 1
fi
PATCH_JS="$(mktemp "${TMPDIR:-/tmp}/claude-ctxlimit-XXXXXX.js")"
cleanup() { rm -f "$PATCH_JS"; }
trap cleanup EXIT

cat >"$PATCH_JS" <<'NODE'
const fs = require('fs');
const path = require('path');
const ACORN_SHA512 = 'd883627a2de353f34bc25ffb7bbe277c84186720619fe3cbecc3c5885b379635e67019c8d8db7a24e21e8f82e1486e8038b4d13d642b40a684995d0867ed55b3';

// argv: bun patch.js <acornPath> <cliPath> [--check]
const acornPath = process.argv[2] === '--' ? null : process.argv[2];
const cliPath = process.argv[3];
const checkOnly = process.argv.includes('--check');
const backupSuffix = process.env.BACKUP_SUFFIX || 'backup-ctxlimit';
if (!cliPath) {
  console.error('NOT_FOUND:cli path argument missing');
  process.exit(1);
}

let code = fs.readFileSync(cliPath, 'utf-8');

let shebang = '';
if (code.startsWith('#!')) {
  const idx = code.indexOf('\n');
  shebang = code.slice(0, idx + 1);
  code = code.slice(idx + 1);
}

const versionMatch =
  code.slice(0, 2000).match(/VERSION:\s*"([\d.]+)"/) ||
  code.slice(0, 2000).match(/Version:\s*([\d.]+)/) ||
  code.match(/"version"\s*:\s*"([\d.]+)"/);
console.log('VERSION:' + (versionMatch ? versionMatch[1] : 'unknown'));

// Already patched?
if (code.includes('CLAUDE_CODE_CONTEXT_LIMIT')) {
  console.log('ALREADY_PATCHED');
  process.exit(0);
}

// Env expression used for both init and reassignment
// Prefer CLAUDE_CODE_CONTEXT_LIMIT, then official CLAUDE_CODE_MAX_CONTEXT_TOKENS
const ENV_EXPR =
  '(+process.env.CLAUDE_CODE_CONTEXT_LIMIT||+process.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS||200000)';

// ---------------------------------------------------------------------------
// Phase 1: dual default constants
//   var dJt=200000,UAe=200000,xag=32000,kag=128000,Dag=1e6
// Names are minified and change across versions; values are stable.
// ---------------------------------------------------------------------------
console.log('STEP:1 - dual default context constants (200000,200000,32000,128000,1e6)');

const dualRe =
  /var\s+(\w+)\s*=\s*200000\s*,\s*(\w+)\s*=\s*200000\s*,\s*(\w+)\s*=\s*32000\s*,\s*(\w+)\s*=\s*128000\s*,\s*(\w+)\s*=\s*1e6\b/;

const dualMatch = dualRe.exec(code);
if (!dualMatch) {
  console.error(
    'NOT_FOUND:dual default constants (var X=200000,Y=200000,...,1e6). Bundle layout may have changed.'
  );
  process.exit(1);
}

const varA = dualMatch[1]; // default context (was dJt)
const varB = dualMatch[2]; // credits-fallback / compact default (was UAe)
console.log('FOUND:dual-vars = ' + varA + ',' + varB + ' at offset ' + dualMatch.index);
console.log('VAR_NAMES_FOR_REASSIGN:' + JSON.stringify([varA, varB]));

const dualReplacement =
  'var ' +
  varA +
  '=' +
  ENV_EXPR +
  ',' +
  varB +
  '=' +
  ENV_EXPR +
  ',' +
  dualMatch[3] +
  '=32000,' +
  dualMatch[4] +
  '=128000,' +
  dualMatch[5] +
  '=1e6';

// ---------------------------------------------------------------------------
// Phase 2: large-message comparison that hardcodes 200000
//   e.g. return n?Rxe(n)>200000:!1
// Only replace when it is a ">" comparison (not model catalog etc.)
// ---------------------------------------------------------------------------
console.log('STEP:2 - comparison operands with 200000');

const comparisonSites = [];
const cmpRe = /([<>]=?|===?|!==?)\s*200000\b/g;
let cm;
while ((cm = cmpRe.exec(code)) !== null) {
  // skip the dual-var declaration we already handle
  if (cm.index >= dualMatch.index && cm.index < dualMatch.index + dualMatch[0].length) continue;
  // only patch ">" style thresholds (message-size style)
  if (cm[1] === '>' || cm[1] === '>=') {
    comparisonSites.push({
      start: cm.index,
      end: cm.index + cm[0].length,
      replacement: cm[1] + ENV_EXPR,
      label: 'comparison(' + cm[1] + ')',
    });
    console.log('  [PATCH] comparison ' + cm[1] + '200000 at offset ' + cm.index);
  } else {
    console.log('  [SKIP] comparison ' + cm[0] + ' at offset ' + cm.index);
  }
}

// ---------------------------------------------------------------------------
// Phase 3: env-loader functions — re-assign after settings.env is applied
// ---------------------------------------------------------------------------
console.log('STEP:3 - env-loader reassignment inject');

let envLoaderFuncs = [];
let acorn = null;
if (acornPath) {
  try {
    const stat = fs.lstatSync(acornPath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Acorn cache is not a regular file');
    const actual = new Bun.CryptoHasher('sha512').update(fs.readFileSync(acornPath)).digest('hex');
    if (actual !== ACORN_SHA512) throw new Error('Acorn cache SHA-512 mismatch');
    acorn = require(acornPath);
  } catch (e) {
    console.error('PARSE_ERROR:' + e.message);
    process.exit(1);
  }
}

function findNodes(node, predicate, results = []) {
  if (!node || typeof node !== 'object') return results;
  if (predicate(node)) results.push(node);
  for (const key in node) {
    if (key === 'start' || key === 'end' || key === 'type') continue;
    const v = node[key];
    if (v && typeof v === 'object') {
      if (Array.isArray(v)) v.forEach((c) => findNodes(c, predicate, results));
      else findNodes(v, predicate, results);
    }
  }
  return results;
}

if (acorn) {
  let ast;
  try {
    ast = acorn.parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      allowReturnOutsideFunction: true,
    });
  } catch (e) {
    try {
      ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
    } catch (e2) {
      console.log('WARN:AST parse failed, skipping env-loader inject: ' + e2.message);
      ast = null;
    }
  }

  if (ast) {
    function hasProcessEnvAssign(funcNode) {
      return (
        findNodes(
          funcNode,
          (n) =>
            n.type === 'CallExpression' &&
            n.callee?.type === 'MemberExpression' &&
            n.callee.object?.name === 'Object' &&
            n.callee.property?.name === 'assign' &&
            n.arguments?.length >= 2 &&
            n.arguments[0]?.type === 'MemberExpression' &&
            n.arguments[0].object?.name === 'process' &&
            n.arguments[0].property?.name === 'env'
        ).length > 0
      );
    }

    const allFuncDecls = findNodes(ast, (n) => n.type === 'FunctionDeclaration' && n.id && n.body);
    envLoaderFuncs = allFuncDecls.filter(hasProcessEnvAssign);

    // Prefer the settings loaders (usually 2+). Cap inject count to avoid over-injection.
    if (envLoaderFuncs.length > 6) {
      envLoaderFuncs = envLoaderFuncs.slice(0, 6);
    }

    for (const fn of envLoaderFuncs) {
      console.log(
        'FOUND:env-loader = ' + fn.id.name + ' at offset ' + fn.start + ' [' + (fn.end - fn.start) + ' bytes]'
      );
    }

    if (envLoaderFuncs.length === 0) {
      console.log('WARN:no env-loader FunctionDeclarations found; settings.json env re-assign skipped');
    }
  }
} else {
  console.log('WARN:acorn unavailable; settings.json env re-assign skipped (process-start env still works)');
}

const patchCount =
  1 /* dual block */ + comparisonSites.length + envLoaderFuncs.length;
console.log(
  'SUMMARY: dual=1 comparisons=' +
    comparisonSites.length +
    ' env-inject=' +
    envLoaderFuncs.length +
    ' total=' +
    patchCount
);

if (checkOnly) {
  console.log('NEEDS_PATCH');
  console.log('PATCH_COUNT:' + patchCount);
  console.log('ENV_LOADERS:' + envLoaderFuncs.map((fn) => fn.id.name).join(','));
  console.log('VAR_NAMES:' + JSON.stringify([varA, varB]));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Apply replacements (reverse offset order)
// ---------------------------------------------------------------------------
const replacements = [];

// dual block
replacements.push({
  start: dualMatch.index,
  end: dualMatch.index + dualMatch[0].length,
  replacement: dualReplacement,
  context: 'dual-defaults(' + varA + ',' + varB + ')',
});

// comparisons
for (const site of comparisonSites) {
  replacements.push({
    start: site.start,
    end: site.end,
    replacement: site.replacement,
    context: site.label,
  });
}

// env-loader inject: before closing brace of function body
const reassignStmts =
  varA +
  '=' +
  ENV_EXPR +
  ';' +
  varB +
  '=' +
  ENV_EXPR;
for (const fn of envLoaderFuncs) {
  const insertAt = fn.body.end - 1; // the '}'
  replacements.push({
    start: insertAt,
    end: insertAt,
    replacement: ';' + reassignStmts + ';',
    context: 'env-inject(' + fn.id.name + ')',
  });
}

replacements.sort((a, b) => b.start - a.start);

let newCode = code;
function replaceAt(str, start, end, rep) {
  return str.slice(0, start) + rep + str.slice(end);
}
for (const r of replacements) {
  newCode = replaceAt(newCode, r.start, r.end, r.replacement);
  console.log('PATCH:' + r.context + ' at offset ' + r.start);
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------
if (!newCode.includes('CLAUDE_CODE_CONTEXT_LIMIT')) {
  console.error('VERIFY_FAILED:CLAUDE_CODE_CONTEXT_LIMIT not present after patch');
  process.exit(1);
}
if (newCode.includes('var ' + varA + '=200000,' + varB + '=200000')) {
  console.error('VERIFY_FAILED:dual 200000 defaults still present');
  process.exit(1);
}

// dual pattern should now contain env expr: var dJt=(+process.env.CLAUDE_CODE_CONTEXT_LIMIT||...
const dualAfter = new RegExp(
  'var\\s+' +
    varA +
    '\\s*=\\s*\\(\\+process\\.env\\.CLAUDE_CODE_CONTEXT_LIMIT'
);
if (!dualAfter.test(newCode)) {
  console.error('VERIFY_FAILED:dual defaults not rewritten to env expression');
  process.exit(1);
}
console.log('VERIFY:dual defaults rewritten');

if (acorn) {
  try {
    acorn.parse(newCode, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      allowReturnOutsideFunction: true,
    });
    console.log('VERIFY:AST re-parse ok (script)');
  } catch (e) {
    try {
      acorn.parse(newCode, { ecmaVersion: 'latest', sourceType: 'module' });
      console.log('VERIFY:AST re-parse ok (module)');
    } catch (e2) {
      console.error('VERIFY_FAILED:patched code fails to parse: ' + e2.message);
      process.exit(1);
    }
  }

  // ensure env refs exist
  const envRefCount = (newCode.match(/process\.env\.CLAUDE_CODE_CONTEXT_LIMIT/g) || []).length;
  console.log('VERIFY:CLAUDE_CODE_CONTEXT_LIMIT refs: ' + envRefCount);
  if (envRefCount < 2) {
    console.error('VERIFY_FAILED:expected >=2 env refs, found ' + envRefCount);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Backup + write
// ---------------------------------------------------------------------------
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = cliPath + '.' + backupSuffix + '-' + timestamp;
fs.copyFileSync(cliPath, backupPath);
console.log('BACKUP:' + backupPath);

fs.writeFileSync(cliPath, shebang + newCode);
console.log('SUCCESS:' + patchCount);
NODE

export BACKUP_SUFFIX
CHECK_ARG=()
if $CHECK_ONLY; then CHECK_ARG=(--check); fi

set +e
OUTPUT="$("$BUN_BIN" "$PATCH_JS" "$ACORN_PATH" "$CLI_PATH" ${CHECK_ARG[@]+"${CHECK_ARG[@]}"} 2>&1)"
EXIT_CODE=$?
set -e

while IFS= read -r line; do
  case "$line" in
    ALREADY_PATCHED)
      ok "Already patched (CLAUDE_CODE_CONTEXT_LIMIT present)"
      exit 0
      ;;
    PARSE_ERROR:*)
      err "Parse error: ${line#PARSE_ERROR:}"
      exit 1
      ;;
    NOT_FOUND:*)
      err "Target not found: ${line#NOT_FOUND:}"
      exit 1
      ;;
    VERIFY_FAILED:*)
      err "Verification failed: ${line#VERIFY_FAILED:}"
      exit 1
      ;;
    VERSION:*)
      info "Claude Code version: ${line#VERSION:}"
      ;;
    STEP:*)
      info "Step ${line#STEP:}"
      ;;
    FOUND:*)
      info "Found: ${line#FOUND:}"
      ;;
    SUMMARY:*)
      info "Summary: ${line#SUMMARY:}"
      ;;
    VERIFY:*)
      info "Verify: ${line#VERIFY:}"
      ;;
    PATCH:*)
      info "Patch: ${line#PATCH:}"
      ;;
    VAR_NAMES_FOR_REASSIGN:*)
      info "Context vars: ${line#VAR_NAMES_FOR_REASSIGN:}"
      ;;
    NEEDS_PATCH)
      echo ""
      warn "Patch needed — re-run without --check to apply"
      ;;
    ENV_LOADERS:*)
      info "Env-loaders: ${line#ENV_LOADERS:}"
      ;;
    VAR_NAMES:*)
      info "Variables: ${line#VAR_NAMES:}"
      ;;
    PATCH_COUNT:*)
      info "Would patch ${line#PATCH_COUNT:} site(s)"
      ;;
    BACKUP:*)
      echo ""
      echo "Backup: ${line#BACKUP:}"
      ;;
    SUCCESS:*)
      echo ""
      ok "Patch applied — ${line#SUCCESS:} site(s)"
      echo ""
      warn "Restart Claude Code for changes to take effect"
      echo "Usage:"
      echo "  CLAUDE_CODE_CONTEXT_LIMIT=1000000 claude"
      echo "  # or in ~/.claude/settings.json:"
      echo '  # { "env": { "CLAUDE_CODE_CONTEXT_LIMIT": "1000000" } }'
      echo ""
      warn "First-party Extra Usage billing gate is separate from this local default."
      ;;
    WARN:*)
      warn "${line#WARN:}"
      ;;
    \ \ \[*)
      echo "    $line"
      ;;
  esac
done <<<"$OUTPUT"

# If the patcher printed something we didn't map, still surface raw failures
if [[ $EXIT_CODE -ne 0 && $EXIT_CODE -ne 1 ]]; then
  err "Patch script failed (exit $EXIT_CODE)"
  echo "$OUTPUT" >&2
fi

exit "$EXIT_CODE"
