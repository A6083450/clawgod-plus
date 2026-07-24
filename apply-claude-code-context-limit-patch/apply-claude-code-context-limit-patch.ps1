<#
.SYNOPSIS
    Claude Code / ClawGod — Configurable Context Limit Patch (Windows)

.DESCRIPTION
    Makes the hardcoded 200000 (200K) default context window configurable via:
      CLAUDE_CODE_CONTEXT_LIMIT
    (falls back to CLAUDE_CODE_MAX_CONTEXT_TOKENS, then 200000)

    Targets Claude Code 2.1.x bundles (including ClawGod's
    %USERPROFILE%\.clawgod\cli.original.cjs).

    Patches:
      1) Dual default constants (minified names vary), e.g.
           var dJt=200000,UAe=200000,xag=32000,kag=128000,Dag=1e6
      2) Re-assign those vars inside settings env-loader functions so
         ~/.claude/settings.json "env" is applied after load
      3) Large-message comparison thresholds using >200000

    Does NOT bypass Anthropic first-party Extra Usage / long-context credits.
    Re-run after claude update / ClawGod reinstall.

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

function Invoke-ClaudeCodeContextLimitPatch {
    param(
        [switch]$Check,
        [switch]$Restore,
        [switch]$Help,
        [string]$CliPath
    )

    if ($Help) {
        Write-Host @"
Claude Code / ClawGod — $FIX_DESCRIPTION

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
    - Prefer patching %USERPROFILE%\.clawgod\cli.original.cjs when using ClawGod.
    - Do not patch the thin wrapper cli.cjs.
    - First-party Extra Usage billing is separate from this local default.
    - Re-run after claude update / ClawGod reinstall.
"@
        return 0
    }

    function Find-CliPath {
        $locations = @(
            (Join-Path $env:USERPROFILE ".clawgod\cli.original.cjs"),
            (Join-Path $env:USERPROFILE ".claude\local\node_modules\@anthropic-ai\claude-code\cli.js"),
            (Join-Path $env:USERPROFILE ".claude\local\node_modules\@cometix\claude-code\cli.js"),
            (Join-Path $env:APPDATA "npm\node_modules\@anthropic-ai\claude-code\cli.js"),
            (Join-Path $env:APPDATA "npm\node_modules\@cometix\claude-code\cli.js"),
            (Join-Path $env:ProgramFiles "nodejs\node_modules\@anthropic-ai\claude-code\cli.js"),
            (Join-Path $env:ProgramFiles "nodejs\node_modules\@cometix\claude-code\cli.js")
        )

        try {
            $npmRoot = & npm root -g 2>$null
            if ($npmRoot) {
                $locations += Join-Path $npmRoot "@anthropic-ai\claude-code\cli.js"
                $locations += Join-Path $npmRoot "@cometix\claude-code\cli.js"
            }
        } catch {}

        # Prefer a real bundle (>1MB). Skip thin ClawGod wrappers.
        foreach ($path in $locations) {
            if (Test-Path -LiteralPath $path) {
                $item = Get-Item -LiteralPath $path
                if ($item.Length -gt 1000000) {
                    return $item.FullName
                }
            }
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
            Write-FixError "Claude Code / ClawGod bundle not found"
            Write-Host ""
            Write-Host "Searched:"
            Write-Host "  %USERPROFILE%\.clawgod\cli.original.cjs"
            Write-Host "  %USERPROFILE%\.claude\local\node_modules\@anthropic-ai\claude-code\cli.js"
            Write-Host "  %APPDATA%\npm\node_modules\@anthropic-ai\claude-code\cli.js"
            Write-Host "  `$(npm root -g)\@anthropic-ai\claude-code\cli.js"
            Write-Host ""
            Write-Host "Tip: .\$($MyInvocation.MyCommand.Name) -CliPath 'C:\path\to\cli.original.cjs'"
            return 1
        }
        Write-Info "Found bundle: $cliPathResolved"
    }

    $cliPath = $cliPathResolved

    # Guard: refuse to patch the thin ClawGod launcher wrapper
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

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-FixError "Node.js is required"
        return 1
    }

    Write-Host ""

    # Download acorn once (optional for env-loader injection; core replace works without it)
    $acornPath = Join-Path $env:TEMP "acorn-claude-ctxlimit.js"
    if (-not (Test-Path -LiteralPath $acornPath)) {
        Write-Info "Downloading acorn parser..."
        try {
            Invoke-WebRequest -Uri "https://unpkg.com/acorn@8.16.0/dist/acorn.js" -OutFile $acornPath -UseBasicParsing
        } catch {
            Write-WarnMsg "Failed to download acorn — env-loader reassignment may be skipped"
            $acornPath = ""
        }
    }

    $patchScript = @'
const fs = require('fs');

// argv: node patch.js <acornPath|-- > <cliPath> [--check]
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
if (acornPath && fs.existsSync(acornPath)) {
  try {
    acorn = require(acornPath);
  } catch (e) {
    console.log('WARN:acorn load failed: ' + e.message);
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
    # UTF-8 without BOM (Node is happier; BOM can break shebang-less scripts on some hosts)
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($tempPatchScript, $patchScript, $utf8NoBom)

    $env:BACKUP_SUFFIX = $BACKUP_SUFFIX
    $checkArg = @()
    if ($Check) { $checkArg = @('--check') }

    $nodeArgs = @('--max-old-space-size=8192', $tempPatchScript)
    if ($acornPath -and (Test-Path -LiteralPath $acornPath)) {
        $nodeArgs += @($acornPath, $cliPath) + $checkArg
    } else {
        $nodeArgs += @('--', $cliPath) + $checkArg
    }

    try {
        $output = & node @nodeArgs 2>&1
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

    # Surface unexpected node failures that did not match known markers
    if ($null -ne $scriptExitCode -and $scriptExitCode -ne 0 -and $scriptExitCode -ne 1) {
        Write-FixError "Patch script failed (exit $scriptExitCode)"
        Write-Host ($output | Out-String)
    }

    if ($null -eq $scriptExitCode) { return 1 }
    return $scriptExitCode
}

$exitCode = Invoke-ClaudeCodeContextLimitPatch -Check:$Check -Restore:$Restore -Help:$Help -CliPath $CliPath
exit $exitCode
