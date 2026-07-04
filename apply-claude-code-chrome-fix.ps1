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
        $locations = @(
            (Join-Path $env:USERPROFILE ".clawgod\cli.original.cjs"),
            (Join-Path $env:USERPROFILE ".claude\local\node_modules\@cometix\claude-code\cli.js"),
            (Join-Path $env:APPDATA "npm\node_modules\@cometix\claude-code\cli.js"),
            (Join-Path $env:ProgramFiles "nodejs\node_modules\@cometix\claude-code\cli.js"),
            (Join-Path ${env:ProgramFiles(x86)} "nodejs\node_modules\@cometix\claude-code\cli.js")
        )
        try {
            $npmRoot = & npm root -g 2>$null
            if ($npmRoot) {
                $locations += Join-Path $npmRoot "@cometix\claude-code\cli.js"
            }
        } catch {}
        foreach ($path in $locations) {
            if (Test-Path $path) {
                return $path
            }
        }
        return $null
    }

    if ($CliPath) {
        if (Test-Path $CliPath) {
            $cliPathResolved = $CliPath
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
        $backups = Get-ChildItem -Path (Split-Path $cliPath) -Filter "cli.js.$BACKUP_SUFFIX-*" -ErrorAction SilentlyContinue |
                   Sort-Object LastWriteTime -Descending
        if ($backups.Count -gt 0) {
            $latestBackup = $backups[0].FullName
            Copy-Item $latestBackup $cliPath -Force
            Write-Success "Restored from backup: $latestBackup"
            return 0
        } else {
            Write-FixError "No backup file found (cli.js.$BACKUP_SUFFIX-*)"
            return 1
        }
    }

    Write-Host ""

    $acornPath = Join-Path $env:TEMP "acorn-claude-fix.js"
    if (-not (Test-Path $acornPath)) {
        Write-Info "Downloading acorn parser..."
        try {
            Invoke-WebRequest -Uri "https://unpkg.com/acorn@8.16.0/dist/acorn.js" -OutFile $acornPath -UseBasicParsing
        } catch {
            Write-FixError "Failed to download acorn parser"
            return 1
        }
    }

    $patchScript = @'
const fs = require('fs');
const acorn = require(process.argv[2]);
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
for (const fn of funcDecls) {
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
const allAlreadyPatched = code.includes('__ccpp_bridge_fallback') &&
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
    let fnNode, paramName;
    if (node.type === 'FunctionDeclaration') { fnNode = node; paramName = node.params[0].name; }
    else { fnNode = node.init; paramName = fnNode.params[0].name; }
    const retStmt = fnNode.body.body[0];
    const cond = retStmt.argument;
    const bridgeCall = src(cond.consequent);
    const socketCall = src(cond.alternate.consequent);
    const nativeCall = src(cond.alternate.alternate);
    const newReturn = `{` +
        `if(${paramName}.getSocketPaths){` +
            `var __paths=${paramName}.getSocketPaths();` +
            `if(__paths&&__paths.length>0)return ${socketCall}` +
        `}` +
        `return ${paramName}.bridgeConfig?${bridgeCall}:${nativeCall}` +
    `}/*__ccpp_bridge_fallback*/`;
    replacements.push({ start: fnNode.body.start, end: fnNode.body.end, replacement: newReturn, name: 'clientFactory' });
    fixes.clientFactory.patched = true;
    console.log('PATCH:clientFactory - Socket priority over bridge when local socket available');
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
    $output = & node $tempPatchScript $acornPath $cliPath $checkArg 2>&1
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

Invoke-ClaudeCodeFix -Check:$Check -Restore:$Restore -Help:$Help -CliPath $CliPath
