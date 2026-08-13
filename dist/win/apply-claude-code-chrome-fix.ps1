<#
.SYNOPSIS
    Claude Code Chrome Extension Fix Script (Windows Version)

.DESCRIPTION
    Enables Chrome browser tools in Claude Code without OAuth subscription.

    THE ISSUE:
    Claude Code's browser MCP client always uses WebSocket bridge (requires OAuth),
    even when local socket/named pipe is available. Also requires subscription check.

    FIX POINTS:
    1) Socket/pipe priority over WebSocket bridge
    2) Remove subscription gate for Chrome features
    3) Hide subscription requirement message
    4) Remove Select browser menu item (not supported in socket mode)
    5) Preserve --chrome/--no-chrome through claude agents dispatches

.PARAMETER Check
    Check if fix is needed without making changes

.PARAMETER Restore
    Restore original file from backup

.PARAMETER Help
    Show help information

.PARAMETER CliPath
    Path to cli.js file (optional, auto-detect if not provided)

.EXAMPLE
    .\apply-claude-code-chrome-fix.ps1
    Apply the fix (auto-detect cli.js location)

.EXAMPLE
    .\apply-claude-code-chrome-fix.ps1 -Check
    Check if fix is needed

.EXAMPLE
    .\apply-claude-code-chrome-fix.ps1 -Restore
    Restore from backup
#>

param(
    [switch]$Check,
    [switch]$Restore,
    [switch]$Help,
    [string]$CliPath
)

$BACKUP_SUFFIX = "backup-bridge-fallback"
$FIX_DESCRIPTION = "Enable Chrome browser tools via local socket (no OAuth required)"

function Write-Success { param($Message) Write-Host "[OK] " -ForegroundColor Green -NoNewline; Write-Host $Message }
function Write-Warning { param($Message) Write-Host "[!] " -ForegroundColor Yellow -NoNewline; Write-Host $Message }
function Write-FixError { param($Message) Write-Host "[X] " -ForegroundColor Red -NoNewline; Write-Host $Message }
function Write-Info { param($Message) Write-Host "[>] " -ForegroundColor Blue -NoNewline; Write-Host $Message }

function Resolve-Bun {
    $command = Get-Command bun -CommandType Application -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $fallback = Join-Path $env:USERPROFILE ".bun\bin\bun.exe"
    if (Test-Path -LiteralPath $fallback) { return $fallback }
    return $null
}

function Invoke-ClaudeCodeFix {
    param(
        [switch]$Check,
        [switch]$Restore,
        [switch]$Help,
        [string]$CliPath
    )

    if ($Help) {
        Write-Host @"
Claude Code $FIX_DESCRIPTION

Usage:
    .\$($MyInvocation.MyCommand.Name) [options]

Options:
    -Check      Check if fix is needed without making changes
    -Restore    Restore original file from backup
    -CliPath    Path to cli.js file (optional, auto-detect if not provided)
    -Help       Show this help message
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
            Write-Info "Using specified cli.js: $cliPathResolved"
        } else {
            Write-FixError "Specified file not found: $CliPath"
            return 1
        }
    } else {
        $cliPathResolved = Find-CliPath
        if (-not $cliPathResolved) {
            Write-FixError "Claude Code cli.js not found"
            Write-Host ""
            Write-Host "Tip: You can specify the path directly:"
            Write-Host "  .\$($MyInvocation.MyCommand.Name) -CliPath 'C:\path\to\cli.js'"
            return 1
        }
        Write-Info "Found Claude Code: $cliPathResolved"
    }

    $cliPath = $cliPathResolved

    if ($Restore) {
        $base = Split-Path $cliPath -Leaf
        $backups = Get-ChildItem -LiteralPath (Split-Path $cliPath) -Filter "$base.$BACKUP_SUFFIX-*" -ErrorAction SilentlyContinue |
                   Sort-Object LastWriteTime -Descending
        if ($backups.Count -gt 0) {
            $latestBackup = $backups[0].FullName
            try {
                Copy-Item -LiteralPath $latestBackup -Destination $cliPath -Force -ErrorAction Stop
                Write-Success "Restored from backup: $latestBackup"
                return 0
            } catch {
                Write-FixError "Failed to restore backup: $($_.Exception.Message)"
                return 1
            }
        } else {
            Write-FixError "No backup file found ($base.$BACKUP_SUFFIX-*)"
            return 1
        }
    }

    Write-Host ""

    $bunBin = Resolve-Bun
    if (-not $bunBin) {
        Write-FixError "Bun is required. Install Bun: https://bun.sh/docs/installation"
        return 1
    }

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
const acornPath = process.argv[2];
let acorn;
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
const cliPath = process.argv[3];
const checkOnly = process.argv[4] === '--check';
const backupSuffix = process.env.BACKUP_SUFFIX || 'backup';

let code = fs.readFileSync(cliPath, 'utf-8');

let shebang = '';
if (code.startsWith('#!')) {
    const idx = code.indexOf('\n');
    shebang = code.slice(0, idx + 1);
    code = code.slice(idx + 1);
}

let fixes = {
    clientFactory: { found: false, patched: false, node: null },
    subscriptionGate: { found: false, patched: false, node: null },
    subscriptionMsg: { found: false, patched: false, node: null },
    selectBrowserHide: { found: false, patched: false, node: null },
    oauthScopeGate: { found: false, patched: false, node: null },
    agentsConfigState: { found: false, patched: false, node: null },
    agentsFlagParser: { found: false, patched: false, node: null },
    agentsConfigResolver: { found: false, patched: false, node: null },
    agentsDispatchArgs: { found: false, patched: false, node: null }
};

let ast;
try {
    ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: 'module' });
} catch (e) {
    console.error('PARSE_ERROR:' + e.message);
    process.exit(1);
}

function findNodes(node, predicate, results = []) {
    if (!node || typeof node !== 'object') return results;
    if (predicate(node)) results.push(node);
    for (const key in node) {
        if (node[key] && typeof node[key] === 'object') {
            if (Array.isArray(node[key])) {
                node[key].forEach(child => findNodes(child, predicate, results));
            } else {
                findNodes(node[key], predicate, results);
            }
        }
    }
    return results;
}

const src = (node) => code.slice(node.start, node.end);

const legacyClientFactoryRe = /function ([\w$]+)\(([\w$]+)\)\{if\(\2\.getSocketPaths\)\{var __paths=\2\.getSocketPaths\(\);if\(__paths&&__paths\.length>0\)return ([\w$]+\(\2\))\}return \2\.bridgeConfig\?([\w$]+\(\2\)):([\w$]+\(\2\))\}\/\*__ccpp_bridge_fallback\*\//;
const legacyClientFactory = legacyClientFactoryRe.exec(code);
if (legacyClientFactory) {
    fixes.clientFactory.found = true;
    fixes.clientFactory.node = {
        type: 'LegacyClientFactory',
        start: legacyClientFactory.index,
        end: legacyClientFactory.index + legacyClientFactory[0].length,
        match: legacyClientFactory
    };
}

// === 1. Client factory: bridgeConfig ? bridge : getSocketPaths ? socket : native ===
function isClientFactory(node) {
    let bodyStmts;
    if (node.body && node.body.type === 'BlockStatement') bodyStmts = node.body.body;
    else return false;
    if (!node.params || node.params.length !== 1) return false;
    if (bodyStmts.length !== 1 || bodyStmts[0].type !== 'ReturnStatement') return false;
    const ret = bodyStmts[0].argument;
    if (!ret || ret.type !== 'ConditionalExpression') return false;
    if (ret.test.type !== 'MemberExpression' || ret.test.property.name !== 'bridgeConfig') return false;
    const alt = ret.alternate;
    if (!alt || alt.type !== 'ConditionalExpression') return false;
    if (alt.test.type !== 'MemberExpression' || alt.test.property.name !== 'getSocketPaths') return false;
    return true;
}

const funcDecls = findNodes(ast, n => n.type === 'FunctionDeclaration');
for (const fn of fixes.clientFactory.found ? [] : funcDecls) {
    if (isClientFactory(fn)) {
        fixes.clientFactory.found = true;
        fixes.clientFactory.node = fn;
        console.log('FOUND:clientFactory function ' + fn.id.name + ' -> ' + src(fn).slice(0, 80));
        break;
    }
}
if (!fixes.clientFactory.found) {
    const varDecls = findNodes(ast, n => n.type === 'VariableDeclarator');
    for (const decl of varDecls) {
        if (decl.init && (decl.init.type === 'ArrowFunctionExpression' || decl.init.type === 'FunctionExpression')) {
            if (isClientFactory(decl.init)) {
                fixes.clientFactory.found = true;
                fixes.clientFactory.node = decl;
                console.log('FOUND:clientFactory var ' + (decl.id?.name || '?') + ' -> ' + src(decl).slice(0, 80));
                break;
            }
        }
    }
}

// === 2. Subscription gate: FBH(.chrome) && vA() ===
if (!code.includes('__ccpp_sub_bypass')) {
    const varDeclarators = findNodes(ast, n => n.type === 'VariableDeclarator');
    for (const decl of varDeclarators) {
        if (!decl.init || decl.init.type !== 'LogicalExpression' || decl.init.operator !== '&&') continue;
        const left = decl.init.left, right = decl.init.right;
        if (left.type !== 'CallExpression' || !left.arguments?.length) continue;
        const arg = left.arguments[0];
        if (!arg || arg.type !== 'MemberExpression' || arg.property?.name !== 'chrome') continue;
        if (right.type !== 'CallExpression' || right.arguments?.length !== 0) continue;
        const calleeName = left.callee?.name || left.callee?.property?.name;
        if (!calleeName) continue;
        const calleeDefs = findNodes(ast, n =>
            (n.type === 'FunctionDeclaration' && n.id?.name === calleeName) ||
            (n.type === 'VariableDeclarator' && n.id?.name === calleeName)
        );
        let verified = false;
        for (const def of calleeDefs) {
            if (src(def).includes('claudeInChromeDefaultEnabled')) { verified = true; break; }
        }
        if (!verified) continue;
        fixes.subscriptionGate.found = true;
        fixes.subscriptionGate.node = decl;
        console.log('FOUND:subscriptionGate ' + decl.id.name + ' -> ' + src(decl).slice(0, 60));
        break;
    }
}

// === 3. Subscription message ===
if (!code.includes('__ccpp_sub_msg_bypass')) {
    const msgAnchor = 'Claude in Chrome requires a claude.ai subscription.';
    const msgPos = code.indexOf(msgAnchor);
    if (msgPos >= 0) {
        const before = code.slice(Math.max(0, msgPos - 200), msgPos);
        if (!before.includes('false&&')) {
            const logicals = findNodes(ast, n => {
                if (n.type !== 'LogicalExpression' || n.operator !== '&&') return false;
                if (n.start > msgPos || n.end < msgPos) return false;
                if (n.left?.type !== 'UnaryExpression' || n.left.operator !== '!') return false;
                return true;
            });
            if (logicals.length > 0) {
                const target = logicals.reduce((a, b) => (b.end - b.start) < (a.end - a.start) ? b : a);
                fixes.subscriptionMsg.found = true;
                fixes.subscriptionMsg.node = target.left;
                console.log('FOUND:subscriptionMsg -> ' + src(target.left));
            }
        }
    }
}

// Explicit --chrome uses the local socket client and does not require the
// Claude.ai OAuth scopes checked by the bridge path.
if (!code.includes('__ccpp_chrome_oauth_scope_bypass')) {
    const match = /function ([\w$]+)\(([\w$]+)\)\{if\(![\w$]+\(\)\)return [\w$]+\("\[Claude in Chrome\] Disabled: OAuth token has no scope accepted by \/api\/oauth\/validate[^"]*"\),!1;if\(\2===!0\)return!0;/.exec(code);
    if (match) {
        fixes.oauthScopeGate.found = true;
        fixes.oauthScopeGate.node = {
            start: match.index,
            end: match.index + match[0].length,
            replacement: `function ${match[1]}(${match[2]}){/*__ccpp_chrome_oauth_scope_bypass*/if(${match[2]}===!0)return!0;`
        };
        console.log('FOUND:oauthScopeGate -> ' + match[0].slice(0, 80));
    }
}

// === 4. Select browser menu item ===
if (!code.includes('__ccpp_no_select_browser')) {
    const selectBrowserNodes = findNodes(ast, n => {
        if (n.type !== 'ObjectExpression') return false;
        const props = n.properties;
        if (!props || props.length < 2) return false;
        return props.some(p => p.key?.name === 'value' && p.value?.value === 'select-browser');
    });
    if (selectBrowserNodes.length > 0) {
        fixes.selectBrowserHide.found = true;
        fixes.selectBrowserHide.node = selectBrowserNodes[0];
        console.log('FOUND:selectBrowserHide -> ' + src(selectBrowserNodes[0]).slice(0, 60));
    }
}

// === 5. Preserve Chrome flags through claude agents dispatches ===
function findRegexFix(name, pattern, replacement) {
    const m = pattern.exec(code);
    if (!m) return;
    const value = typeof replacement === 'function' ? replacement(m) : replacement;
    fixes[name].found = true;
    fixes[name].node = { start: m.index, end: m.index + m[0].length, replacement: value };
    console.log('FOUND:' + name + ' -> ' + m[0].slice(0, 80));
}

if (!code.includes('strictMcpConfig:!1,chrome:!1,noChrome:!1')) {
    findRegexFix(
        'agentsConfigState',
        /r=\{addDir:\[\],pluginDir:\[\],pluginDirNoMcp:\[\],settings:void 0,mcpConfig:\[\],strictMcpConfig:!1\}/g,
        'r={addDir:[],pluginDir:[],pluginDirNoMcp:[],settings:void 0,mcpConfig:[],strictMcpConfig:!1,chrome:!1,noChrome:!1}'
    );
}

if (!code.includes('if(a==="--chrome"){r.chrome=!0;continue}')) {
    findRegexFix(
        'agentsFlagParser',
        /if\(a==="--strict-mcp-config"\)\{r\.strictMcpConfig=!0;continue\}/g,
        (m) => 'if(a==="--chrome"){r.chrome=!0;continue}if(a==="--no-chrome"){r.noChrome=!0;continue}' + m[0]
    );
}

if (!code.includes('chrome:e.chrome&&!e.noChrome,noChrome:e.noChrome')) {
    findRegexFix(
        'agentsConfigResolver',
        /strictMcpConfig:e\.strictMcpConfig\}\}function ([\w$]+)/g,
        (m) => `strictMcpConfig:e.strictMcpConfig,chrome:e.chrome&&!e.noChrome,noChrome:e.noChrome}}function ${m[1]}`
    );
}

if (!code.includes('__ccpp_agents_chrome_dispatch')) {
    findRegexFix(
        'agentsDispatchArgs',
        /\.\.\.e\.strictMcpConfig\?\["--strict-mcp-config"\]:\[\]\]\}/g,
        '...e.chrome?["--chrome"/*__ccpp_agents_chrome_dispatch*/]:[],...e.noChrome?["--no-chrome"]:[],...e.strictMcpConfig?["--strict-mcp-config"]:[]]}'
    );
}

// === Check if already patched ===
const allAlreadyPatched = code.includes('__ccpp_bridge_fallback_v2') &&
    (code.includes('__ccpp_chrome_oauth_scope_bypass') || !code.includes('OAuth token has no scope accepted by /api/oauth/validate')) &&
    (code.includes('__ccpp_sub_bypass') || !code.includes('tengu_claude_in_chrome_setup')) &&
    (code.includes('__ccpp_sub_msg_bypass') || !code.includes('Claude in Chrome requires a claude.ai subscription.')) &&
    (code.includes('__ccpp_no_select_browser') || !code.includes('select-browser')) &&
    code.includes('strictMcpConfig:!1,chrome:!1,noChrome:!1') &&
    code.includes('if(a==="--chrome"){r.chrome=!0;continue}') &&
    code.includes('chrome:e.chrome&&!e.noChrome,noChrome:e.noChrome') &&
    code.includes('__ccpp_agents_chrome_dispatch');
if (allAlreadyPatched && !Object.values(fixes).some(f => f.found)) {
    console.log('ALREADY_PATCHED');
    process.exit(2);
}
if (!Object.values(fixes).some(f => f.found)) {
    console.error('NOT_FOUND:No patchable patterns found');
    process.exit(1);
}

if (checkOnly) {
    console.log('NEEDS_PATCH');
    const count = Object.values(fixes).filter(f => f.found).length;
    console.log('PATCH_COUNT:' + count);
    process.exit(1);
}

// === Apply fixes ===
let newCode = code;
let replacements = [];

if (fixes.clientFactory.found && fixes.clientFactory.node) {
    const node = fixes.clientFactory.node;
    if (node.type === 'LegacyClientFactory') {
        const m = node.match;
        replacements.push({
            start: node.start,
            end: node.end,
            replacement: `function ${m[1]}(${m[2]}){return ${m[2]}.getSocketPaths?${m[3]}:${m[2]}.bridgeConfig?${m[4]}:${m[5]}}/*__ccpp_bridge_fallback_v2*/`,
            name: 'clientFactory'
        });
        fixes.clientFactory.patched = true;
        console.log('PATCH:clientFactory - Upgraded legacy synchronous socket probe');
    } else {
    let fnNode, paramName;
    if (node.type === 'FunctionDeclaration') { fnNode = node; paramName = node.params[0].name; }
    else { fnNode = node.init; paramName = fnNode.params[0].name; }
    const retStmt = fnNode.body.body[0];
    const cond = retStmt.argument;
    const bridgeCall = src(cond.consequent);
    const socketCall = src(cond.alternate.consequent);
    const nativeCall = src(cond.alternate.alternate);
    // Socket discovery may be asynchronous; the socket pool client owns
    // discovery and refresh, so the factory must not inspect paths itself.
    const newReturn = `{return ${paramName}.getSocketPaths?${socketCall}:${paramName}.bridgeConfig?${bridgeCall}:${nativeCall}}/*__ccpp_bridge_fallback_v2*/`;
    replacements.push({ start: fnNode.body.start, end: fnNode.body.end, replacement: newReturn, name: 'clientFactory' });
    fixes.clientFactory.patched = true;
    console.log('PATCH:clientFactory - Socket priority over bridge when local socket available');
    }
}

if (fixes.oauthScopeGate.found && fixes.oauthScopeGate.node) {
    const node = fixes.oauthScopeGate.node;
    replacements.push({ start: node.start, end: node.end, replacement: node.replacement, name: 'oauthScopeGate' });
    fixes.oauthScopeGate.patched = true;
    console.log('PATCH:oauthScopeGate - Allowed explicit --chrome for local socket mode');
}

if (fixes.subscriptionGate.found && fixes.subscriptionGate.node) {
    const decl = fixes.subscriptionGate.node;
    const left = decl.init.left;
    replacements.push({ start: decl.init.start, end: decl.init.end, replacement: src(left) + '/*__ccpp_sub_bypass*/', name: 'subscriptionGate' });
    fixes.subscriptionGate.patched = true;
    console.log('PATCH:subscriptionGate - Removed subscription check for Chrome features');
}

if (fixes.subscriptionMsg.found && fixes.subscriptionMsg.node) {
    const node = fixes.subscriptionMsg.node;
    replacements.push({ start: node.start, end: node.end, replacement: 'false/*__ccpp_sub_msg_bypass*/', name: 'subscriptionMsg' });
    fixes.subscriptionMsg.patched = true;
    console.log('PATCH:subscriptionMsg - Hidden subscription requirement message in /chrome');
}

if (fixes.selectBrowserHide.found && fixes.selectBrowserHide.node) {
    const sbNode = fixes.selectBrowserHide.node;
    const pushCalls = findNodes(ast, n => {
        if (n.type !== 'CallExpression') return false;
        if (n.callee?.property?.name !== 'push') return false;
        if (n.start < sbNode.start || n.start - sbNode.end > 200) return false;
        return true;
    });
    if (pushCalls.length > 0) {
        const pushCall = pushCalls[0];
        replacements.push({ start: pushCall.start, end: pushCall.end, replacement: 'void 0/*__ccpp_no_select_browser*/', name: 'selectBrowserHide' });
        fixes.selectBrowserHide.patched = true;
        console.log('PATCH:selectBrowserHide - Disabled Select browser push');
    }
}

for (const name of ['agentsConfigState', 'agentsFlagParser', 'agentsConfigResolver', 'agentsDispatchArgs']) {
    if (fixes[name].found && fixes[name].node) {
        const node = fixes[name].node;
        replacements.push({ start: node.start, end: node.end, replacement: node.replacement, name });
        fixes[name].patched = true;
        console.log('PATCH:' + name + ' - Preserved Chrome flags for claude agents sessions');
    }
}

replacements.sort((a, b) => b.start - a.start);
for (const r of replacements) {
    newCode = newCode.slice(0, r.start) + r.replacement + newCode.slice(r.end);
}

const patchedCount = Object.values(fixes).filter(f => f.patched).length;
if (patchedCount === 0) {
    console.error('VERIFY_FAILED:No fixes applied');
    process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = cliPath + '.' + backupSuffix + '-' + timestamp;
fs.copyFileSync(cliPath, backupPath);
console.log('BACKUP:' + backupPath);

fs.writeFileSync(cliPath, shebang + newCode);
console.log('SUCCESS:' + patchedCount);
'@

    $tempPatchScript = Join-Path $env:TEMP "claude-fix-patch-$PID.js"
    $patchScript | Out-File -FilePath $tempPatchScript -Encoding UTF8

    $env:BACKUP_SUFFIX = $BACKUP_SUFFIX

    $checkArg = if ($Check) { "--check" } else { "" }
    $output = & $bunBin $tempPatchScript $acornPath $cliPath $checkArg 2>&1
    $scriptExitCode = $LASTEXITCODE

    Remove-Item $tempPatchScript -ErrorAction SilentlyContinue

    foreach ($line in $output) {
        switch -Regex ($line) {
            "^ALREADY_PATCHED" { Write-Success "Already patched"; return 0 }
            "^PARSE_ERROR:(.+)" { Write-FixError "Failed to parse cli.js: $($Matches[1])"; return 1 }
            "^NOT_FOUND:(.+)" { Write-FixError "Target code not found: $($Matches[1])"; return 1 }
            "^FOUND:(.+)" { Write-Info "Found: $($Matches[1])" }
            "^PATCH:(.+)" { Write-Info "Patch: $($Matches[1])" }
            "^NEEDS_PATCH" {
                Write-Host ""
                Write-Warning "Patch needed - run without -Check to apply"
            }
            "^PATCH_COUNT:(.+)" {
                Write-Info "Need to patch $($Matches[1]) location(s)"
                return 1
            }
            "^BACKUP:(.+)" { Write-Host ""; Write-Host "Backup: $($Matches[1])" }
            "^SUCCESS:(.+)" {
                Write-Host ""
                Write-Success "Fix applied successfully! Patched $($Matches[1]) location(s)"
                Write-Host ""
                Write-Warning "Restart Claude Code for changes to take effect"
            }
            "^VERIFY_FAILED:(.+)" { Write-FixError "Verification failed: $($Matches[1])"; return 1 }
        }
    }

    return $scriptExitCode
}

$exitCode = Invoke-ClaudeCodeFix -Check:$Check -Restore:$Restore -Help:$Help -CliPath $CliPath
exit $exitCode
