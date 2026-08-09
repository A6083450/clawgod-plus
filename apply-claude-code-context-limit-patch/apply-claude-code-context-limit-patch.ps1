<#
.SYNOPSIS
    Claude Code / ClawGod Plus — Configurable Context Limit Patch (Windows)

.DESCRIPTION
    Makes the hardcoded 200000 (200K) default context window configurable via:
      CLAUDE_CODE_CONTEXT_LIMIT
    (falls back to CLAUDE_CODE_MAX_CONTEXT_TOKENS, then 200000)

    Targets Claude Code 2.1.x bundles (including ClawGod Plus
    %USERPROFILE%\.clawgod\cli.original.cjs).

    Patches:
      1) Dual default constants (minified names vary), e.g.
           var dJt=200000,UAe=200000,xag=32000,kag=128000,Dag=1e6
      2) Re-assign those vars inside settings env-loader functions so
         ~/.claude/settings.json "env" is applied after load
      3) Large-message comparison thresholds using >200000

    Does NOT bypass Anthropic first-party Extra Usage / long-context credits.
    Re-run after claude update / ClawGod Plus reinstall.

.PARAMETER Check
    Check only (no writes)

.PARAMETER Restore
    Restore latest backup

.PARAMETER Help
    Show help

.PARAMETER CliPath
    Path to cli.original.cjs / cli.js

.EXAMPLE
    .\apply-claude-code-context-limit-patch.ps1

.EXAMPLE
    .\apply-claude-code-context-limit-patch.ps1 -Check

.EXAMPLE
    .\apply-claude-code-context-limit-patch.ps1 -CliPath "$env:USERPROFILE\.clawgod\cli.original.cjs"

.EXAMPLE
    $env:CLAUDE_CODE_CONTEXT_LIMIT = "1000000"; claude
#>

param(
    [switch]$Check,
    [switch]$Restore,
    [switch]$Help,
    [string]$CliPath
)

$ErrorActionPreference = 'Stop'
$BACKUP_SUFFIX = "backup-ctxlimit"
$FIX_DESCRIPTION = "Make context window limit configurable via CLAUDE_CODE_CONTEXT_LIMIT"

function Write-Success { param($Message) Write-Host "[OK] " -ForegroundColor Green -NoNewline; Write-Host $Message }
function Write-WarnMsg { param($Message) Write-Host "[!] " -ForegroundColor Yellow -NoNewline; Write-Host $Message }
function Write-FixError { param($Message) Write-Host "[X] " -ForegroundColor Red -NoNewline; Write-Host $Message }
function Write-Info { param($Message) Write-Host "[>] " -ForegroundColor Blue -NoNewline; Write-Host $Message }

function Resolve-Bun {
    $command = Get-Command bun -CommandType Application -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $fallback = Join-Path $env:USERPROFILE ".bun\bin\bun.exe"
    if (Test-Path -LiteralPath $fallback) { return $fallback }
    return $null
}

function Invoke-ClaudeCodeContextLimitPatch {
    param(
        [switch]$Check,
        [switch]$Restore,
        [switch]$Help,
        [string]$CliPath
    )

    if ($Help) {
        Write-Host @"
Claude Code / ClawGod Plus — $FIX_DESCRIPTION

Usage:
    .\$($MyInvocation.MyCommand.Name) [options]

Options:
    -Check      Check if patch is needed (no writes)
    -Restore    Restore original from latest backup
    -CliPath    Path to cli.original.cjs / cli.js
    -Help       Show this help

After patch:
    `$env:CLAUDE_CODE_CONTEXT_LIMIT = "1000000"; claude
    # or in ~/.claude/settings.json:
    # { "env": { "CLAUDE_CODE_CONTEXT_LIMIT": "1000000" } }

Notes:
    - Prefer patching %USERPROFILE%\.clawgod\cli.original.cjs when using ClawGod Plus.
    - Do not patch the thin wrapper cli.cjs.
    - First-party Extra Usage billing is separate from this local default.
    - Re-run after claude update / ClawGod Plus reinstall.
"@
        return 0
    }

    function Find-CliPath {
        $path = Join-Path $env:USERPROFILE ".clawgod\cli.original.cjs"
        if (Test-Path -LiteralPath $path) {
            return (Get-Item -LiteralPath $path).FullName
        }
        return $null
    }

    if ($CliPath) {
        if (Test-Path -LiteralPath $CliPath) {
            $cliPathResolved = (Get-Item -LiteralPath $CliPath).FullName
            Write-Info "Using specified file: $cliPathResolved"
        } else {
            Write-FixError "Specified file not found: $CliPath"
            return 1
        }
    } else {
        $cliPathResolved = Find-CliPath
        if (-not $cliPathResolved) {
            Write-FixError "Claude Code / ClawGod Plus bundle not found"
            Write-Host ""
            Write-Host "Searched:"
            Write-Host "  %USERPROFILE%\.clawgod\cli.original.cjs"
            Write-Host ""
            Write-Host "Tip: .\$($MyInvocation.MyCommand.Name) -CliPath 'C:\path\to\cli.original.cjs'"
            return 1
        }
        Write-Info "Found bundle: $cliPathResolved"
    }

    $cliPath = $cliPathResolved

    # Guard: refuse to patch the thin ClawGod Plus launcher wrapper
    if ((Split-Path $cliPath -Leaf) -eq "cli.cjs") {
        $original = Join-Path (Split-Path $cliPath) "cli.original.cjs"
        if ((Test-Path -LiteralPath $original) -and ((Get-Item -LiteralPath $cliPath).Length -lt 1000000)) {
            Write-FixError "Refusing to patch thin wrapper: $cliPath"
            Write-Info "Use: -CliPath '$original'"
            return 1
        }
    }

    if ($Restore) {
        $dir = Split-Path $cliPath
        $base = Split-Path $cliPath -Leaf
        $backups = Get-ChildItem -LiteralPath $dir -Filter "$base.$BACKUP_SUFFIX-*" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending
        if ($backups -and $backups.Count -gt 0) {
            Copy-Item -LiteralPath $backups[0].FullName -Destination $cliPath -Force
            Write-Success "Restored from backup: $($backups[0].FullName)"
            return 0
        }
        Write-FixError "No backup found ($base.$BACKUP_SUFFIX-*)"
        return 1
    }

    $bunBin = Resolve-Bun
    if (-not $bunBin) {
        Write-FixError "Bun is required. Install Bun: https://bun.sh/docs/installation"
        return 1
    }

    Write-Host ""

$acornCacheBase = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE "AppData\Local" }
    $acornPath = Join-Path $acornCacheBase "clawgod-plus\acorn\acorn-8.16.0.cjs"
    $acornCacheScript = Join-Path ([IO.Path]::GetTempPath()) "clawgod-acorn-cache-$PID-$([guid]::NewGuid().ToString('N')).mjs"
    $acornCacheCode = @'
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
'@
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($acornCacheScript, $acornCacheCode, $utf8NoBom)
    try {
        $cacheOutput = & $bunBin $acornCacheScript $acornCacheBase 2>&1
        $cacheExitCode = $LASTEXITCODE
    } finally {
        Remove-Item -LiteralPath $acornCacheScript -ErrorAction SilentlyContinue
    }
    if ($cacheExitCode -ne 0) {
        Write-FixError "Failed to prepare verified Acorn cache"
        if ($cacheOutput) { Write-Host ($cacheOutput | Out-String) }
        return 1
    }
    $patchScript = @'
const fs = require('fs');
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
'@

    $tempPatchScript = Join-Path $env:TEMP "claude-fix-context-limit-$PID.js"
    # UTF-8 without BOM keeps the temporary script portable across Bun hosts.
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($tempPatchScript, $patchScript, $utf8NoBom)

    $env:BACKUP_SUFFIX = $BACKUP_SUFFIX
    $checkArg = @()
    if ($Check) { $checkArg = @('--check') }

    $bunArgs = @($tempPatchScript, $acornPath, $cliPath) + $checkArg

    try {
        $output = & $bunBin @bunArgs 2>&1
        $scriptExitCode = $LASTEXITCODE
    } finally {
        Remove-Item -LiteralPath $tempPatchScript -ErrorAction SilentlyContinue
    }

    foreach ($line in $output) {
        $text = "$line"
        switch -Regex ($text) {
            "^ALREADY_PATCHED" {
                Write-Success "Already patched (CLAUDE_CODE_CONTEXT_LIMIT present)"
                return 0
            }
            "^PARSE_ERROR:(.+)" {
                Write-FixError "Parse error: $($Matches[1])"
                return 1
            }
            "^NOT_FOUND:(.+)" {
                Write-FixError "Target not found: $($Matches[1])"
                return 1
            }
            "^VERIFY_FAILED:(.+)" {
                Write-FixError "Verification failed: $($Matches[1])"
                return 1
            }
            "^VERSION:(.+)" { Write-Info "Claude Code version: $($Matches[1])" }
            "^STEP:(.+)" { Write-Info "Step $($Matches[1])" }
            "^FOUND:(.+)" { Write-Info "Found: $($Matches[1])" }
            "^SUMMARY:(.+)" { Write-Info "Summary: $($Matches[1])" }
            "^VERIFY:(.+)" { Write-Info "Verify: $($Matches[1])" }
            "^PATCH:(.+)" { Write-Info "Patch: $($Matches[1])" }
            "^VAR_NAMES_FOR_REASSIGN:(.+)" { Write-Info "Context vars: $($Matches[1])" }
            "^NEEDS_PATCH" {
                Write-Host ""
                Write-WarnMsg "Patch needed — re-run without -Check to apply"
            }
            "^ENV_LOADERS:(.+)" { Write-Info "Env-loaders: $($Matches[1])" }
            "^VAR_NAMES:(.+)" { Write-Info "Variables: $($Matches[1])" }
            "^PATCH_COUNT:(.+)" { Write-Info "Would patch $($Matches[1]) site(s)" }
            "^BACKUP:(.+)" {
                Write-Host ""
                Write-Host "Backup: $($Matches[1])"
            }
            "^SUCCESS:(.+)" {
                Write-Host ""
                Write-Success "Patch applied — $($Matches[1]) site(s)"
                Write-Host ""
                Write-WarnMsg "Restart Claude Code for changes to take effect"
                Write-Host "Usage:"
                Write-Host "  `$env:CLAUDE_CODE_CONTEXT_LIMIT = '1000000'; claude"
                Write-Host "  # or in ~/.claude/settings.json:"
                Write-Host '  # { "env": { "CLAUDE_CODE_CONTEXT_LIMIT": "1000000" } }'
                Write-Host ""
                Write-WarnMsg "First-party Extra Usage billing gate is separate from this local default."
            }
            "^WARN:(.+)" { Write-WarnMsg $Matches[1] }
            "^\s+\[.*" { Write-Host "    $text" }
        }
    }

    # Surface unexpected patcher failures that did not match known markers
    if ($null -ne $scriptExitCode -and $scriptExitCode -ne 0 -and $scriptExitCode -ne 1) {
        Write-FixError "Patch script failed (exit $scriptExitCode)"
        Write-Host ($output | Out-String)
    }

    if ($null -eq $scriptExitCode) { return 1 }
    return $scriptExitCode
}

$exitCode = Invoke-ClaudeCodeContextLimitPatch -Check:$Check -Restore:$Restore -Help:$Help -CliPath $CliPath
exit $exitCode
