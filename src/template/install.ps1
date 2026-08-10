#Requires -Version 5.1
<#
.SYNOPSIS
    ClawGod Plus Installer for Windows
.DESCRIPTION
    Downloads Claude Code from npm, applies feature unlock patches,
    and replaces the 'claude' command with the patched version.
.EXAMPLE
    irm https://github.com/A6083450/clawgod-plus/releases/latest/download/install.ps1 | iex
    # or
    .\install.ps1
    .\install.ps1 -Version 2.1.89
    .\install.ps1 -NoUpgrade
    .\install.ps1 -Uninstall
#>
param(
    [string]$Version = "latest",
    [switch]$NoUpgrade,
    [switch]$Uninstall,
    [switch]$LeanOff,
    [switch]$LeanOn,
    [switch]$LeanMax
)

$ErrorActionPreference = "Stop"

if ($env:CLAWGOD_VERSION -and $Version -eq "latest") { $Version = $env:CLAWGOD_VERSION }
if ($env:CLAWGOD_NO_UPGRADE -eq "1") { $NoUpgrade = [switch]$true }
if ($env:CLAWGOD_LEAN_OFF -eq "1") { $LeanOff = [switch]$true }
if ($env:CLAWGOD_LEAN_ON -eq "1") { $LeanOn = [switch]$true }
if ($env:CLAWGOD_LEAN_MAX -eq "1") { $LeanMax = [switch]$true }

$ClawDir = Join-Path $env:USERPROFILE ".clawgod"
$BinDir  = Join-Path $env:USERPROFILE ".local\bin"
$ClawSelfVersion = "0.0.0-dev"  # injected by release workflow from git tag

$ClaudeMemCompatBytes = [Convert]::FromBase64String('@@CLAWGOD_CLAUDE_MEM_COMPAT_CJS_BASE64@@')

function Install-ClaudeMemCompatHelper {
    New-Item -ItemType Directory -Force -Path $ClawDir | Out-Null
    $helper = Join-Path $ClawDir "claude-mem-compat.cjs"
    [System.IO.File]::WriteAllBytes($helper, $ClaudeMemCompatBytes)
}

$FetchFileBytes = [Convert]::FromBase64String('@@CLAWGOD_FETCH_FILE_MJS_BASE64@@')

function Install-FetchFileHelper {
    New-Item -ItemType Directory -Force -Path $ClawDir | Out-Null
    $helper = Join-Path $ClawDir "fetch-file.mjs"
    [System.IO.File]::WriteAllBytes($helper, $FetchFileBytes)
}

function Install-ChromeFixScript {
    New-Item -ItemType Directory -Force -Path $ClawDir | Out-Null
    $dst = Join-Path $ClawDir "apply-claude-code-chrome-fix.ps1"
    $localCandidates = @()
    if ($PSScriptRoot) { $localCandidates += Join-Path $PSScriptRoot "apply-claude-code-chrome-fix.ps1" }
    $localCandidates += Join-Path (Get-Location) "apply-claude-code-chrome-fix.ps1"

    foreach ($src in $localCandidates) {
        if ($src -and (Test-Path $src)) {
            Copy-Item $src $dst -Force
            return $true
        }
    }

    try {
        & $BunBin (Join-Path $ClawDir "fetch-file.mjs") "https://raw.githubusercontent.com/A6083450/clawgod-plus/main/apply-claude-code-chrome-fix.ps1" $dst
        if ($LASTEXITCODE -ne 0) { return $false }
        return $true
    } catch {
        return $false
    }
}

function Invoke-ChromePostInstallFix {
    $script = Join-Path $ClawDir "apply-claude-code-chrome-fix.ps1"
    if (-not (Test-Path $script)) {
        if (-not (Install-ChromeFixScript)) {
            Write-Warn "Claude in Chrome post-install fix script not available; skipping"
            return
        }
    }

    $target = Join-Path $ClawDir "cli.original.cjs"
    Write-Dim "Applying Claude Code Chrome post-install fix ..."
    try {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $script -CliPath $target
        if ($LASTEXITCODE -eq 0) {
            Write-OK "Claude Code Chrome post-install fix applied"
        } else {
            Write-Warn "Claude Code Chrome post-install fix did not apply; ClawGod Plus core install will continue"
        }
    } catch {
        Write-Warn "Claude Code Chrome post-install fix failed; ClawGod Plus core install will continue"
    }
}

# ─── Colors ───────────────────────────────────────────

function Write-OK($msg)   { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Err($msg)  { Write-Host "  ✗ $msg" -ForegroundColor Red }
function Write-Warn($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Write-Dim($msg)  { Write-Host "  $msg" -ForegroundColor DarkGray }

function Resolve-Bun {
    $candidates = @()
    try {
        $command = Get-Command bun -ErrorAction Stop
        if ($command.Source) { $candidates += $command.Source }
    } catch {}
    $candidates += @(
        (Join-Path $env:USERPROFILE ".bun\bin\bun.exe"),
        (Join-Path $env:APPDATA "npm\node_modules\bun\bin\bun.exe"),
        (Join-Path $env:USERPROFILE "scoop\shims\bun.exe"),
        (Join-Path $env:ProgramData "chocolatey\bin\bun.exe")
    )
    foreach ($candidate in $candidates | Select-Object -Unique) {
        if (-not $candidate) { continue }
        if ($candidate -match '\.(?:cmd|bat|ps1)$') {
            $native = Join-Path (Split-Path $candidate) "node_modules\bun\bin\bun.exe"
            if (Test-Path -Path $native -PathType Leaf) { return $native }
            continue
        }
        if ($candidate -notmatch '\.exe$') { continue }
        if (Test-Path -Path $candidate -PathType Leaf) { return $candidate }
    }
    Write-Err "Bun is required. Install Bun first: https://bun.sh/install"
    return $null
}

function Test-ClaudePathPresent {
    param([string]$Path)

    try {
        $null = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Test-ClawGodLauncherContent {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    try {
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        if ($item.Length -gt 1048576) { return $false }
        $content = [System.IO.File]::ReadAllText($Path)
    } catch {
        return $false
    }

    # The marker identifies newer launchers, but never grants ownership alone.
    $hasExplicitMarker = $content -match '(?m)^rem CLAWGOD_LAUNCHER_V1\r?$'
    $hasStableStructure = (
        ($content -match '(?m)^@echo off\r?$') -and
        ($content -match '(?m)^setlocal\r?$') -and
        ($content -match '(?m)^if not exist ".*[\\/]\.clawgod[\\/]cli\.cjs" \(\r?$') -and
        ($content -match '(?m)^set "CLAUDE_CODE_EXECPATH=%~dp0claude\.orig\.exe"\r?$') -and
        ($content -match '(?m)^set "CLAWGOD_AUTO_CHROME=1"\r?$') -and
        ($content -match '(?m)^exit /b %ERRORLEVEL%\r?$')
    )
    if ($hasExplicitMarker -and -not $hasStableStructure) { return $false }
    return $hasStableStructure
}

function Test-ClawGodLauncher {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    try {
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { return $false }
    } catch {
        return $false
    }
    return (Test-ClawGodLauncherContent $Path)
}

function Test-ValidClaudeOriginal {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    return (-not (Test-ClawGodLauncherContent $Path))
}

function Test-ClaudeLauncherConflict {
    param(
        [string]$Current,
        [string]$Original
    )

    if (-not (Test-ClaudePathPresent $Original)) { return $false }
    if ((Test-ClaudePathPresent $Current) -and -not (Test-ClawGodLauncher $Current)) {
        Write-Err "Claude launcher conflict at $Current; current command and $Original were preserved."
        Write-Err "Move or remove the third-party current command, then rerun the installer."
        return $true
    }
    if (-not (Test-ValidClaudeOriginal $Original) -and -not (Test-ClawGodLauncherContent $Original)) {
        Write-Err "Invalid original backup at $Original; operation stopped without launcher changes."
        return $true
    }
    return $false
}

function Test-ClaudeUninstallConflict {
    param(
        [string]$CurrentCmd,
        [string]$CurrentExe,
        [string]$OriginalCmd,
        [string]$OriginalExe
    )

    $hasValidOriginal = ((Test-ValidClaudeOriginal $OriginalCmd) -or
        (Test-ValidClaudeOriginal $OriginalExe))
    if (-not $hasValidOriginal) { return $false }

    $hasThirdPartyCurrent = (
        ((Test-ClaudePathPresent $CurrentCmd) -and -not (Test-ClawGodLauncher $CurrentCmd)) -or
        ((Test-ClaudePathPresent $CurrentExe) -and -not (Test-ClawGodLauncher $CurrentExe))
    )
    if ($hasThirdPartyCurrent) {
        Write-Err "Claude launcher conflict across cmd/exe slots; current commands and original backups were preserved."
        Write-Err "Move or remove the third-party current command, then rerun the uninstaller."
        return $true
    }
    return $false
}

Write-Host ""
Write-Host "  ClawGod Plus Installer" -ForegroundColor White -NoNewline
Write-Host " (Windows)" -ForegroundColor DarkGray
Write-Host ""

# ─── Uninstall ────────────────────────────────────────

if ($Uninstall) {
    $BunBin = Resolve-Bun
    if (-not $BunBin) { exit 1 }
    $claudeOrig = Join-Path $BinDir "claude.orig.cmd"
    $claudeCmd  = Join-Path $BinDir "claude.cmd"
    $claudeExeOrig = Join-Path $BinDir "claude.orig.exe"
    $claudeExe = Join-Path $BinDir "claude.exe"
    if (Test-ClaudeUninstallConflict -CurrentCmd $claudeCmd -CurrentExe $claudeExe -OriginalCmd $claudeOrig -OriginalExe $claudeExeOrig) {
        exit 1
    }
    if ((Test-ClaudeLauncherConflict -Current $claudeCmd -Original $claudeOrig) -or
        (Test-ClaudeLauncherConflict -Current $claudeExe -Original $claudeExeOrig)) {
        exit 1
    }
    # Restore optional Claude plugin integrations before any managed cleanup.
    $pluginDependencies = Join-Path $ClawDir "plugin-dependencies.mjs"
    $pluginState = Join-Path $ClawDir "plugin-dependencies-state.json"
    if ((Test-Path $pluginState) -and -not (Test-Path $pluginDependencies)) {
        Write-Warn "Could not restore optional Claude plugin integrations; ClawGod Plus was not uninstalled"
        exit 1
    }
    if (Test-Path $pluginDependencies) {
        $hadPluginBun = Test-Path Env:CLAWGOD_BUN_BIN
        $previousPluginBun = $env:CLAWGOD_BUN_BIN
        $hadPluginDir = Test-Path Env:CLAWGOD_DIR
        $previousPluginDir = $env:CLAWGOD_DIR
        $pluginRestoreFailed = $false
        try {
            $env:CLAWGOD_BUN_BIN = $BunBin
            $env:CLAWGOD_DIR = $ClawDir
            & $BunBin $pluginDependencies uninstall
            if ($LASTEXITCODE -ne 0) { throw "optional plugin restore exited $LASTEXITCODE" }
        } catch {
            Write-Warn "Could not restore optional Claude plugin integrations; ClawGod Plus was not uninstalled"
            $pluginRestoreFailed = $true
        } finally {
            if ($hadPluginBun) { $env:CLAWGOD_BUN_BIN = $previousPluginBun }
            else { Remove-Item Env:CLAWGOD_BUN_BIN -ErrorAction SilentlyContinue }
            if ($hadPluginDir) { $env:CLAWGOD_DIR = $previousPluginDir }
            else { Remove-Item Env:CLAWGOD_DIR -ErrorAction SilentlyContinue }
        }
        if ($pluginRestoreFailed) { exit 1 }
    }
    $claudeMemCompat = Join-Path $ClawDir "claude-mem-compat.cjs"
    if (Test-Path $claudeMemCompat) {
        try {
            $env:CLAWGOD_BUN_BIN = $BunBin
            & $BunBin "$ClawDir\claude-mem-compat.cjs" uninstall
            if ($LASTEXITCODE -ne 0) { throw "claude-mem compatibility helper exited $LASTEXITCODE" }
        } catch {
            Write-Warn "Could not restore claude-mem compatibility settings; ClawGod Plus was not uninstalled"
            exit 1
        }
    }
    # Restore original claude
    if (Test-ValidClaudeOriginal $claudeOrig) {
        if (Test-ClawGodLauncher $claudeCmd) { Remove-Item -LiteralPath $claudeCmd -Force }
        Move-Item -Force $claudeOrig $claudeCmd
        Write-OK "Original claude restored"
    } elseif (Test-ClawGodLauncherContent $claudeOrig) {
        if (Test-ClawGodLauncher $claudeCmd) { Remove-Item -LiteralPath $claudeCmd -Force }
        Remove-Item -LiteralPath $claudeOrig -Force
        Write-Warn "Removed installer-owned polluted backup ($claudeOrig)"
    } elseif ((Test-ClaudePathPresent $claudeCmd) -and (Test-ClawGodLauncher $claudeCmd)) {
        Remove-Item -Force $claudeCmd
        Write-OK "Removed ClawGod Plus launcher ($claudeCmd)"
    }
    # Also check for .exe backup
    if (Test-ValidClaudeOriginal $claudeExeOrig) {
        if (Test-ClawGodLauncher $claudeExe) { Remove-Item -LiteralPath $claudeExe -Force }
        Move-Item -Force $claudeExeOrig $claudeExe
        Write-OK "Original claude.exe restored"
    } elseif (Test-ClawGodLauncherContent $claudeExeOrig) {
        if (Test-ClawGodLauncher $claudeExe) { Remove-Item -LiteralPath $claudeExe -Force }
        Remove-Item -LiteralPath $claudeExeOrig -Force
        Write-Warn "Removed installer-owned polluted backup ($claudeExeOrig)"
    } elseif ((Test-ClaudePathPresent $claudeExe) -and (Test-ClawGodLauncher $claudeExe)) {
        Remove-Item -LiteralPath $claudeExe -Force
        Write-OK "Removed ClawGod Plus launcher ($claudeExe)"
    }
    # Remove explicit clawgod alias
    $clawgodCmd = Join-Path $BinDir "clawgod.cmd"
    if ((Test-Path $clawgodCmd) -and (Test-ClawGodLauncher $clawgodCmd)) {
        Remove-Item -Force $clawgodCmd
        Write-OK "Removed clawgod alias"
    }

    foreach ($f in @("cli.js","cli.cjs","cli.original.js","cli.original.cjs","cli.original.js.bak","cli.original.cjs.bak","patch.js","patch.mjs","extract-natives.mjs","post-process.mjs","repatch.mjs","openai-proxy.cjs","fetch-file.mjs","install-ripgrep.mjs","clawgod-import.exe","apply-claude-code-chrome-fix.ps1","claude-mem-compat.cjs","claude-mem.cmd","plugin-dependencies.mjs","claude-hud-statusline.mjs","plugin-dependencies-state.json","cache\claude-plugins","staging\claude-plugins",".source-version",".clawgod-version",".update-check","node_modules","bun-runtime","vendor")) {
        $p = Join-Path $ClawDir $f
        if (Test-Path $p) { Remove-Item -Recurse -Force $p }
    }
    Write-OK "ClawGod Plus uninstalled"
    Write-Host ""
    Write-Dim "Restart your terminal for changes to take effect."
    Write-Host ""
    exit 0
}

# ─── Bun prerequisite ──────────────────────────────────

$BunBin = Resolve-Bun
if (-not $BunBin) { exit 1 }
Write-OK "Bun: $(& $BunBin --version)"

# ─── Bun version pre-flight ───────────────────────────────────────────
# Anthropic builds the native binary with Bun's canary channel; stable
# bun.sh trails by one version. Bun < 1.3.14 panics on cli.original.cjs
# with "Expected CommonJS module to have a function wrapper". Refuse
# early — no npm download / no patch / no late sanity surprise where
# PowerShell's NativeCommandError display buries the friendly message.
# Bump $MinBunVersion when Anthropic moves the embedded Bun forward
# again.

$MinBunVersion = '1.3.14'
$BunVersionRaw = ''
try {
    $bunOut = & $BunBin --version 2>$null | Select-Object -First 1
    if ($bunOut) { $BunVersionRaw = "$bunOut".Trim() }
} catch {}
$BunVersionNum = ($BunVersionRaw -split '-')[0]
$BunVersionOk = $false
try {
    if ($BunVersionNum) {
        $BunVersionOk = ([version]$BunVersionNum) -ge ([version]$MinBunVersion)
    }
} catch {}
if (-not $BunVersionOk) {
    Write-Host ""
    Write-Err "Bun $BunVersionRaw is below the required minimum ($MinBunVersion)."
    Write-Err ""
    Write-Err "  Anthropic builds claude-code with Bun's canary channel. Older Bun"
    Write-Err "  panics on cli.original.cjs with 'Expected CommonJS module to have"
    Write-Err "  a function wrapper'. This is a hard requirement, not a warning."
    Write-Err ""
    Write-Err "  Upgrade with one of:"
    Write-Err "    bun upgrade --canary"
    Write-Err "    powershell -c ""iex & {`$(irm https://bun.sh/install.ps1)} -Version canary"""
    Write-Err ""
    Write-Err "  If your bun is from scoop (the binary is behind a shim and refuses"
    Write-Err "  to self-replace, so 'bun upgrade' silently hangs):"
    Write-Err "    scoop uninstall bun"
    Write-Err "    irm https://bun.sh/install.ps1 | iex"
    Write-Err "    bun upgrade --canary"
    Write-Err ""
    Write-Err "  Then re-run this installer."
    exit 1
}

Install-FetchFileHelper

# --- Optional Claude plugin dependencies -----------------------------

$PluginDependenciesBytes = [Convert]::FromBase64String('@@CLAWGOD_PLUGIN_DEPENDENCIES_MJS_BASE64@@')
[System.IO.File]::WriteAllBytes((Join-Path $ClawDir "plugin-dependencies.mjs"), $PluginDependenciesBytes)

# --- Managed ripgrep -------------------------------------------------

$InstallRipgrepBytes = [Convert]::FromBase64String('@@CLAWGOD_INSTALL_RIPGREP_MJS_BASE64@@')
[System.IO.File]::WriteAllBytes((Join-Path $ClawDir "install-ripgrep.mjs"), $InstallRipgrepBytes)

$ripgrepOutput = & $BunBin (Join-Path $ClawDir "install-ripgrep.mjs") $ClawDir 2>&1
if ($LASTEXITCODE -ne 0) {
    $ripgrepOutput | ForEach-Object { Write-Err "$_" }
    Write-Err "Failed to install ClawGod-managed ripgrep."
    exit 1
}
$ripgrepOutput | ForEach-Object { Write-OK "$_" }

# ─── Handle -NoUpgrade (skip download, re-patch only) ────────────────
if ($NoUpgrade) {
    New-Item -ItemType Directory -Force -Path $ClawDir | Out-Null
    New-Item -ItemType Directory -Force -Path $BinDir  | Out-Null
    $existingCjs = Join-Path $ClawDir "cli.original.cjs"
    $existingBak = "$existingCjs.bak"
    if (-not (Test-Path $existingCjs)) {
        Write-Err "-NoUpgrade requires an existing installation."
        Write-Err "Run a full install first (without -NoUpgrade)."
        exit 1
    }
    if (Test-Path $existingBak) {
        Copy-Item $existingBak $existingCjs -Force
        Write-OK "Restored clean cli.original.cjs from backup"
    }
    Write-OK "Skipping download (-NoUpgrade)"
} else {

# ─── Locate native Bun binary (cli.js source) ──────────────────────────
# Source: npm registry (@anthropic-ai/claude-code-win32-<arch>).
# Local binary detection is intentionally skipped — see policy note below.

New-Item -ItemType Directory -Force -Path $ClawDir | Out-Null
New-Item -ItemType Directory -Force -Path $BinDir  | Out-Null
if (Install-ChromeFixScript) {
    Write-OK "Chrome fix helper installed (apply-claude-code-chrome-fix.ps1)"
} else {
    Write-Warn "Could not install Chrome fix helper; will try again after patching"
}

$NativeBin = $null
$NativeBinLabel = $null
$NativeBinTmpDir = $null

# Detect platform suffix
if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64" -or $env:PROCESSOR_ARCHITEW6432 -eq "ARM64") {
    $arch = "arm64"
} else {
    $arch = "x64"
}
$platformSuffix = "win32-$arch"

# Detection policy: ALWAYS pull from the npm registry @latest.
#
# Earlier versions of this script also probed local install directories
# (versions/, claude.orig, npm-global, bun-global) before falling back to
# the registry. Every one of those is a stale-source trap: clawgod patches
# out `claude update`, so users never re-run the underlying installers,
# and those directories freeze at whatever version was on disk the day
# clawgod was first installed. `claude update` (which is now redirected
# here) would re-detect the frozen binary forever — never reaching the
# registry. See INCIDENT_LOG 2026-04-29 entry. The fix is to skip local
# detection entirely; the npm tarball is ~60-90 MB compressed, fetched
# once per upgrade.

# npm registry — pull the platform tarball directly via Bun.
if (-not $NativeBin) {
    $npmPkg = "@anthropic-ai/claude-code-$platformSuffix"
    Write-Dim "Fetching $npmPkg@$Version from npm registry ..."
    $NativeBinTmpDir = Join-Path $env:TEMP "clawgod-binary-$([Guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Force -Path $NativeBinTmpDir | Out-Null
    $fetchScript = Join-Path $NativeBinTmpDir "fetch-package.mjs"
    $FetchPackageBytes = [Convert]::FromBase64String('@@CLAWGOD_FETCH_PACKAGE_MJS_BASE64@@')
    [System.IO.File]::WriteAllBytes($fetchScript, $FetchPackageBytes)

    $output = & $BunBin $fetchScript "$npmPkg@$Version" $NativeBinTmpDir 2>&1
    $exitCode = $LASTEXITCODE
    $output | ForEach-Object { Write-Host "  $_" }
    Remove-Item -Force $fetchScript -ErrorAction SilentlyContinue

    if ($exitCode -ne 0) {
        Remove-Item -Recurse -Force $NativeBinTmpDir -ErrorAction SilentlyContinue
        Write-Err "Fetch failed (Bun exit $exitCode). Install the official binary manually:"
        Write-Err "    irm https://claude.ai/install.ps1 | iex"
        exit 1
    }

    $cand = Join-Path $NativeBinTmpDir "package\claude.exe"
    if ((Test-Path $cand) -and (Get-Item $cand).Length -gt 10MB) {
        $NativeBin = $cand
        $verLine = $output | Where-Object { $_ -match '^VERSION=' } | Select-Object -First 1
        if ($verLine) { $NativeBinLabel = ($verLine -replace '^VERSION=', '').Trim() }
        else { $NativeBinLabel = "npm-latest" }
    } else {
        Remove-Item -Recurse -Force $NativeBinTmpDir -ErrorAction SilentlyContinue
        Write-Err "Tarball downloaded but expected package\claude.exe was missing or too small."
        exit 1
    }
    Write-OK "Downloaded $npmPkg@$NativeBinLabel"
}

if (-not $NativeBin) {
    Write-Err "Native Claude Code binary not found"
    Write-Err "Install the official binary first:"
    Write-Err "  irm https://claude.ai/install.ps1 | iex"
    Write-Err "Then re-run this script."
    exit 1
}

# Always write the extractor (used for cli.js and/or .node modules)
$extractorPath = Join-Path $ClawDir "extract-natives.mjs"
$ExtractorBytes = [Convert]::FromBase64String('@@CLAWGOD_EXTRACTOR_MJS_BASE64@@')
[System.IO.File]::WriteAllBytes($extractorPath, $ExtractorBytes)

# ─── Extract cli.js + native modules from Bun binary ──────────

# Single extractor pass: writes cli.original.js to $ClawDir and creates
# vendor\<name>\<arch>-<os>\<name>.node for every napi module in one go.
$VendorDir = Join-Path $ClawDir "vendor"
if (Test-Path $VendorDir) {
    Get-ChildItem -Force $VendorDir | Where-Object { $_.Name -ne "ripgrep" } | Remove-Item -Recurse -Force
}

$dstCli = Join-Path $ClawDir "cli.original.js"
if (Test-Path $dstCli) { Remove-Item -Force $dstCli }

Write-Dim "Extracting cli.js + napi modules from $NativeBinLabel ..."
& $BunBin $extractorPath $NativeBin $ClawDir 2>&1 | ForEach-Object { Write-Host "  $_" }
if (-not (Test-Path $dstCli)) {
    Write-Err "Failed to extract cli.js from native binary"
    exit 1
}

# Note: keep extractorPath around — repatch.mjs uses it on version drift

# ─── Post-process cli.js for Bun runtime ──────────────────────

Write-Dim "Rewriting bunfs paths and IIFE invocation ..."
$postProc = Join-Path $ClawDir "post-process.mjs"
$PostProcessorBytes = [Convert]::FromBase64String('@@CLAWGOD_POST_PROCESSOR_MJS_BASE64@@')
[System.IO.File]::WriteAllBytes($postProc, $PostProcessorBytes)
& $BunBin $postProc 2>&1 | ForEach-Object { Write-Host "  $_" }
if (-not (Test-Path (Join-Path $ClawDir "cli.original.cjs"))) {
    Write-Err "Post-process failed"
    exit 1
}

# Stamp source version so wrapper can detect drift on next launch
Set-Content -Path (Join-Path $ClawDir ".source-version") -Value $NativeBinLabel -Encoding ASCII

# If we pulled the binary from npm into a tmpdir, clean up — extraction
# is done; drift detection only consults %USERPROFILE%\.local\share\claude\versions\.
if ($NativeBinTmpDir -and (Test-Path $NativeBinTmpDir)) {
    Remove-Item -Recurse -Force $NativeBinTmpDir -ErrorAction SilentlyContinue
}

Write-OK "cli.original.cjs ready ($NativeBinLabel)"

}  # end -NoUpgrade skip

# ─── Write re-patch helper (used by wrapper on version drift) ─────────

$RepatcherBytes = [Convert]::FromBase64String('@@CLAWGOD_REPATCHER_MJS_BASE64@@')
[System.IO.File]::WriteAllBytes((Join-Path $ClawDir "repatch.mjs"), $RepatcherBytes)
Write-OK "Re-patch helper installed (repatch.mjs)"

# ─── Write OpenAI-compatible proxy ────────────────────────────

$OpenAIProxyBytes = [Convert]::FromBase64String('@@CLAWGOD_OPENAI_PROXY_CJS_BASE64@@')
[System.IO.File]::WriteAllBytes((Join-Path $ClawDir "openai-proxy.cjs"), $OpenAIProxyBytes)
Write-OK "OpenAI-compatible proxy created (openai-proxy.cjs)"

# ─── Write wrapper (cli.cjs, runs under Bun) ──────────────────

$WrapperBytes = [Convert]::FromBase64String('@@CLAWGOD_WRAPPER_CJS_BASE64@@')
[System.IO.File]::WriteAllBytes((Join-Path $ClawDir "cli.cjs"), $WrapperBytes)
Set-Content (Join-Path $ClawDir ".clawgod-version") $ClawSelfVersion
Write-OK "Wrapper created (cli.cjs)"

# ─── Write universal patcher ──────────────────────────
# (Same Bun patcher as bash version — inline to avoid extra download)

$patcherCode = @'
#!/usr/bin/env bun
/**
 * ClawGod Plus Universal Patcher
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
    unique: true,
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
    pattern: /function ([\w$]+)\(\)\{if\(![\w$]+\(process\.env\.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS\)&&![\w$]+\(\)\)return!1;if\(![\w$]+\("tengu_amber_flint",!0\)\)return!1;return!0\}/g,
    replacer: (m, fn) => `function ${fn}(){return!0}`,
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
    // v2.1.92+: name:"ultraplan",get description(){...},argumentHint:"<prompt>",isEnabled:()=>fnRef()
    // Older  : name:"ultraplan",description:`...`,argumentHint:"<prompt>",isEnabled:()=>!1
    name: 'Ultraplan enable',
    pattern: /(name:"ultraplan",[\s\S]{1,500}?argumentHint:"<prompt>",isEnabled:\(\)=>)(?:!1|[\w$]+\(\))/g,
    replacer: (m, prefix) => `${prefix}!0`,
    sentinel: 'name:"ultraplan"',
    appliedMarker: 'argumentHint:"<prompt>",isEnabled:()=>!0',
  },
  {
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
    // v2.1.215+: the config key is stored in ulu and the gate moved away
    // from the getter. Preserve every declaration between them and replace
    // only the gate; deleting that span leaves runtime references undefined.
    name: 'Ultrareview enable (v2.1.215+ gate)',
    pattern: /(function ([\w$]+)\(\)\{return [\w$]+\(ulu,null\)\})([\s\S]{0,1500}?)(function ([\w$]+)\(\)\{return \2\(\)\?\.enabled===!0&&[\w$]+\(\)&&![\w$]+\(\)\})/g,
    replacer: (m, getterDef, getter, between, gateDef, gate) =>
      `${getterDef}${between}function ${gate}(){/*__clawgod_ultrareview_enabled__*/return!0}`,
    sentinel: 'var ulu="tengu_review_bughunter_config"',
    appliedMarker: '/*__clawgod_ultrareview_enabled__*/',
  },
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
    // Redirect CLI `claude update` to clawgod self-update. Upstream's
    // detectInstallType() returns "unknown" under our launcher; the
    // unknown-fallback either silently downgrades ~/.bun/bin/bun (macOS) or
    // writes the new binary outside our drift-detection scan path (Windows).
    // Our redirect funnels the upgrade through install.{sh,ps1} so the new
    // version is re-extracted, re-patched, and re-launchered without ever
    // touching the bun runtime. Escape hatch for users who want vanilla
    // update is printed every run.
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
  {
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
  {
    name: 'Restore Glob/Grep tools (un-inline EMBEDDED_SEARCH_TOOLS)',
    pattern: /function ([\w$]+)\(\)\{if\(!([\w$]+)\("true"\)\)return!1;if\([\w$]+\(\)\)return!1;return process\.env\.CLAUDE_CODE_ENTRYPOINT!=="local-agent"\}/g,
    replacer: (m, fn, envCheck) =>
      `function ${fn}(){if(!${envCheck}(process.env.EMBEDDED_SEARCH_TOOLS))return!1;if(typeof globalThis.__dpBinOk>"u"){try{var _w=process.platform==="win32"?"where":"which";require("child_process").execFileSync(_w,["bfs"],{timeout:2e3});require("child_process").execFileSync(_w,["ugrep"],{timeout:2e3});globalThis.__dpBinOk=!0}catch{globalThis.__dpBinOk=!1}}if(!globalThis.__dpBinOk)return!1;return process.env.CLAUDE_CODE_ENTRYPOINT!=="local-agent"}`,
    sentinel: 'ct("true")',
    optional: true,
  },
  {
    name: 'Neutralize geo-steganography in date string (qla)',
    pattern: /function ([\w$]+)\([\w$]+\)\{let [\w$]+=[\w$]+\(\),[\w$]+=[\w$]+\([\w$]+\?\.[\w$]+\?\?!1,[\w$]+\?\.[\w$]+\?\?!1\),[\w$]+=[\w$]+\?\.[\w$]+\?[\w$]+\.replaceAll\("-","\/"\):[\w$]+;return`Today\$\{[\w$]+\}s date is \$\{[\w$]+\}\.`\}/g,
    replacer: (m) => {
      const fnMatch = m.match(/^function ([\w$]+)\(([\w$]+)\)/);
      if (!fnMatch) return m;
      const [, fn, param] = fnMatch;
      return `function ${fn}(${param}){return\`Today's date is \${${param}}.\`}`;
    },
    sentinel: 'replaceAll("-","/")',
  },
  {
    name: 'Neutralize geo-detection probe (rdp)',
    pattern: /function ([\w$]+)\(\)\{if\([\w$]+\(\)\)return null;let [\w$]+=[\w$]+\(\),[\w$]+=[\w$]+\(\),[\w$]+=[\w$]+==="Asia\/Shanghai"\|\|[\w$]+==="Asia\/Urumqi"[\s\S]*?\}\}/g,
    replacer: (m) => {
      const fn = m.match(/^function ([\w$]+)/)[1];
      return `function ${fn}(){return null}`;
    },
    sentinel: 'Asia/Shanghai',
  },
  {
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
    optional: true,
  },
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
  {
    name: 'Attachment filter bypass',
    pattern: /([\w$]+)\(\)!=="ant"(&&[\w$]+\.has\([\w$]+\.attachment\.type\)|\)\{if\([\w$]+\.attachment\.type==="hook_additional_context")/g,
    replacer: (m) => m.replace(/([\w$]+)\(\)!=="ant"/, 'false'),
    optional: true,
  },
  {
    name: 'Message list filter bypass (legacy ternary)',
    pattern: /([\w$]+)\(\)!=="ant"\?([\w$]+)\(([\w$]+),([\w$]+)\(([\w$]+)\)\):([\w$]+)/g,
    replacer: (m, fn, tRY, underscore, sRY, K, fallback) => fallback,
    optional: true,
  },
  {
    name: 'Message list filter bypass (s_8 form)',
    pattern: /if\(([\w$]+)\(\)==="ant"\)return ([\w$]+);let ([\w$]+)=([\w$]+) instanceof Set\?\4:([\w$]+)\(\4\);return ([\w$]+)\(\2,\3\)/g,
    replacer: (m, fn, ret) => `return ${ret}`,
    optional: true,
  },
  {
    // Shell-integration generator (iT6 in v2.1.140, was Wa1 in older versions)
    // emits a zsh/bash function that calls the native claude binary with
    // ARGV0=ugrep|rg|... for multitool dispatch. After clawgod installs, the
    // baked path points at our shell-script launcher (or .cmd on Windows) —
    // but shell scripts CANNOT preserve argv[0] (kernel shebang re-exec
    // overwrites it, and zsh additionally refuses to export ARGV0 as env).
    // The shell function then fails because bun receives e.g. -G and errors
    // with "Invalid Argument".
    //
    // Fix: redirect the baked path to claude.orig[.exe] (the native binary
    // backup clawgod creates at install time). Then the multitool dispatch
    // reaches a real binary that honors argv[0]. See issue #82.
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
    optional: true,
  },
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verify = args.includes('--verify');
const revert = args.includes('--revert');

if (revert) {
  if (!existsSync(BACKUP)) { console.error('No backup found'); process.exit(1); }
  copyFileSync(BACKUP, TARGET);
  console.log('Reverted from backup');
  process.exit(0);
}

if (!existsSync(TARGET)) {
  console.error('Target not found:', TARGET);
  process.exit(1);
}

let code = readFileSync(TARGET, 'utf8');
const origSize = code.length;
const verMatch = code.match(/Version:\s*([\d.]+)/);
const version = verMatch ? verMatch[1] : 'unknown';

console.log(`\n${'='.repeat(55)}`);
console.log(`  ClawGod Plus (universal)`);
console.log(`  Target: cli.original.cjs (v${version})`);
console.log(`  Mode: ${dryRun ? 'DRY RUN' : verify ? 'VERIFY' : 'APPLY'}`);
console.log(`${'='.repeat(55)}\n`);

let applied = 0, skipped = 0, failed = 0;

for (const p of patches) {
  const matches = [...code.matchAll(p.pattern)];
  let relevant = matches;
  if (p.validate) relevant = matches.filter(m => p.validate(m[0], code));
  if (p.selectIndex !== undefined) relevant = relevant.length > p.selectIndex ? [relevant[p.selectIndex]] : [];
  if (p.unique && relevant.length > 1) {
    console.log(`  ?? ${p.name} — ${relevant.length} matches (need 1)`);
    failed++; continue;
  }
  if (relevant.length === 0) {
    if (p.knownShape?.test(code)) { console.log(`  XX ${p.name} — known resolver shape did not match exactly`); failed++; continue; }
    if (p.appliedMarker !== undefined && (p.appliedMarker instanceof RegExp ? p.appliedMarker.test(code) : code.includes(p.appliedMarker))) { console.log(`  OK ${p.name} (already applied, marker present)`); applied++; continue; }
    if (p.optional) { console.log(`  >> ${p.name} (not in this version)`); skipped++; continue; }
    if (p.sentinel !== undefined) {
      const sentinels = Array.isArray(p.sentinel) ? p.sentinel : [p.sentinel];
      const stillPresent = sentinels.filter((s) => code.includes(s));
      if (stillPresent.length > 0) {
        console.log(`  XX ${p.name} — regex stale, sentinel still present: ${stillPresent.map((s) => JSON.stringify(s)).join(', ')}`);
        failed++; continue;
      }
      console.log(`  OK ${p.name} (already applied, sentinel absent)`); applied++; continue;
    }
    console.log(`  !! ${p.name} (0 matches, no sentinel)`); skipped++;
    continue;
  }
  if (verify) { console.log(`  -- ${p.name} — not yet applied`); skipped++; continue; }
  let count = 0;
  for (const m of relevant) {
    const replacement = p.replacer(m[0], ...m.slice(1));
    // Function-form replace: a string replacement would interpret $$ as $
    // and break minified identifiers like `a$$`. See install.sh issue #86.
    if (replacement !== m[0]) { if (!dryRun) code = code.replace(m[0], () => replacement); count++; }
  }
  if (count > 0) { console.log(`  OK ${p.name} (${count})`); applied++; }
  else { console.log(`  >> ${p.name} (no change)`); skipped++; }
}

const contextLimitPatch = await applyContextLimitPatch(code, { dryRun, verify });
if (contextLimitPatch.status === 'applied') {
  if (!dryRun) code = contextLimitPatch.code;
  console.log(`  OK Context limit configurable (${contextLimitPatch.count})`);
  applied++;
} else if (contextLimitPatch.status === 'verify') {
  console.log(`  -- Context limit configurable — ${contextLimitPatch.count} match(es), not yet applied`);
  skipped++;
} else if (contextLimitPatch.status === 'already') {
  console.log(`  OK Context limit configurable (${contextLimitPatch.detail})`);
  applied++;
} else if (contextLimitPatch.status === 'skipped') {
  console.log(`  >> Context limit configurable (${contextLimitPatch.detail})`);
  skipped++;
} else {
  console.log(`  XX Context limit configurable — ${contextLimitPatch.detail}`);
  failed++;
}

const chromePatch = await applyClaudeChromeSocketPatch(code, { dryRun, verify });
if (chromePatch.status === 'applied') {
  if (!dryRun) code = chromePatch.code;
  console.log(`  OK Claude in Chrome local socket fallback (${chromePatch.count})`);
  applied++;
} else if (chromePatch.status === 'verify') {
  console.log(`  -- Claude in Chrome local socket fallback — ${chromePatch.count} match(es), not yet applied`);
  skipped++;
} else if (chromePatch.status === 'already') {
  console.log(`  OK Claude in Chrome local socket fallback (${chromePatch.detail})`);
  applied++;
} else if (chromePatch.status === 'skipped') {
  console.log(`  >> Claude in Chrome local socket fallback (${chromePatch.detail})`);
  skipped++;
} else {
  console.log(`  XX Claude in Chrome local socket fallback — ${chromePatch.detail}`);
  failed++;
}

console.log(`\n${'-'.repeat(55)}`);
console.log(`  Result: ${applied} applied, ${skipped} skipped, ${failed} failed`);

if (failed === 0 && !dryRun && !verify && applied > 0) {
  if (!existsSync(BACKUP)) { copyFileSync(TARGET, BACKUP); console.log(`  Backup: ${BACKUP}`); }
  writeFileSync(TARGET, code, 'utf8');
  console.log(`  Written: cli.original.cjs (${code.length - origSize} bytes)`);
}
console.log(`${'='.repeat(55)}\n`);
if (failed > 0) process.exit(1);
'@

Set-Content (Join-Path $ClawDir "patch.mjs") $patcherCode -Encoding UTF8
Write-OK "Patcher created (patch.mjs)"

# ─── Apply patches ────────────────────────────────────

Write-Dim "Applying patches ..."
$patchOutput = & $BunBin (Join-Path $ClawDir "patch.mjs") 2>&1
$patchStatus = $LASTEXITCODE
$patchOutput | ForEach-Object { Write-Host "  $_" }
if ($patchStatus -ne 0) {
    Write-Err "Mandatory patching failed; installation stopped before launcher replacement."
    exit $patchStatus
}
Invoke-ChromePostInstallFix

# ─── Create default configs ───────────────────────────

$featuresFile = Join-Path $ClawDir "features.json"
if (-not (Test-Path $featuresFile)) {
    $featuresJson = @'
@@CLAWGOD_FEATURES_JSON@@
'@
    [System.IO.File]::WriteAllText($featuresFile, $featuresJson, (New-Object System.Text.UTF8Encoding $false))
    Write-OK "Default features.json created"
}

# ─── Lean mode: optimize ~/.claude/settings.json ─────
$leanOffFlag = Join-Path $ClawDir ".lean-disabled"
$leanMaxFlag = Join-Path $ClawDir ".lean-max"
$claudeSettingsDir = Join-Path $env:USERPROFILE ".claude"
$claudeSettings = Join-Path $claudeSettingsDir "settings.json"
New-Item -ItemType Directory -Force -Path $claudeSettingsDir | Out-Null

# Default to lean-off: if no lean flag files exist and user didn't explicitly
# request lean-on or lean-max, create the .lean-disabled flag so lean stays off.
if (-not (Test-Path $leanOffFlag) -and -not (Test-Path $leanMaxFlag) -and -not $LeanOn -and -not $LeanMax) {
    New-Item -ItemType File -Force -Path $leanOffFlag | Out-Null
}

if ($LeanOff) {
    New-Item -ItemType File -Force -Path $leanOffFlag | Out-Null
    if (Test-Path $leanMaxFlag) { Remove-Item $leanMaxFlag -Force }
    $leanRemoveScript = @'
const fs=require("fs"),p=process.argv[1];
const allDeny=new Set(["DesignSync","NotebookEdit","PushNotification","RemoteTrigger","CronCreate","CronDelete","CronList","EnterPlanMode","ExitPlanMode","SendMessage","ScheduleWakeup","AskUserQuestion","ReportFindings"]);
const allFlags=["disableWorkflows","disableRemoteControl","disableClaudeAiConnectors","disableArtifact","disableBundledSkills"];
let s={};try{s=JSON.parse(fs.readFileSync(p,"utf8"))}catch{process.exit(0)}
for(const k of allFlags)delete s[k];
if(Array.isArray(s.permissions?.deny))s.permissions.deny=s.permissions.deny.filter(t=>!allDeny.has(t));
fs.writeFileSync(p,JSON.stringify(s,null,2)+"\n");
'@
    if (Test-Path $claudeSettings) {
        try { & $BunBin -e $leanRemoveScript "$claudeSettings" 2>$null } catch {}
    }
    Write-OK "Lean mode disabled (all tools restored)"
} elseif ($LeanOn) {
    if (Test-Path $leanOffFlag) { Remove-Item $leanOffFlag -Force }
    if (Test-Path $leanMaxFlag) { Remove-Item $leanMaxFlag -Force }
} elseif ($LeanMax) {
    if (Test-Path $leanOffFlag) { Remove-Item $leanOffFlag -Force }
    New-Item -ItemType File -Force -Path $leanMaxFlag | Out-Null
}

if (-not (Test-Path $leanOffFlag)) {
    $leanIsMax = (Test-Path $leanMaxFlag)
    $leanApplyScript = @'
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
'@
    try {
        & $BunBin -e $leanApplyScript "$claudeSettings" "$leanIsMax" 2>$null
        if ($leanIsMax) { Write-OK "Lean settings applied: max (~/.claude/settings.json)" }
        else { Write-OK "Lean settings applied: on (~/.claude/settings.json)" }
    } catch {}
} else {
    Write-Host "  $([char]0x2022) Lean mode disabled (claude --lean-on to re-enable)" -ForegroundColor DarkGray
}

# ─── Sanity check: ensure user's Bun can actually load cli.original.cjs ──
# Anthropic builds the native binary with a bleeding-edge Bun build (e.g.
# 1.3.14 while stable still ships 1.3.13). Older Bun crashes loading the
# extracted cli.original.cjs with "Expected CommonJS module to have a
# function wrapper". Detect this BEFORE we install the launcher — better
# to fail loudly than to leave the user with a launcher that panics on
# first invocation.

Write-Dim "Verifying Bun can load patched cli.original.cjs ..."
$sanityCli = Join-Path $ClawDir "cli.cjs"
# PowerShell folds native-command stderr into the error stream as
# ErrorRecord objects; with $ErrorActionPreference='Stop' (common when
# this script is piped through `iex`) that terminates BEFORE we even
# read $sanityOut. Localize ErrorActionPreference + try/catch so the
# panic message reliably lands in $sanityOut and our friendly Write-Err
# block runs. Defense-in-depth — pre-flight already blocks Bun < $MinBunVersion;
# this remains for the day Anthropic bumps embedded Bun past our constant.
$sanityOut = $null
$sanityStatus = 1
try {
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $sanityOut = (& $BunBin $sanityCli --version 2>&1 | Out-String)
    $sanityStatus = $LASTEXITCODE
} catch {
    $sanityOut = "$_"
    $sanityStatus = 1
} finally {
    $ErrorActionPreference = $prevEAP
}
if ($sanityOut -match "Expected CommonJS module to have a function wrapper") {
    Write-Host ""
    Write-Err "Bun $(& $BunBin --version) cannot load Anthropic's cli.original.cjs."
    Write-Err ""
    Write-Err "  Anthropic builds with Bun's canary channel (currently ~1.3.14), while"
    Write-Err "  bun.sh's main download is on stable (currently 1.3.13). The canary build"
    Write-Err "  is NOT visible on bun.sh's download page — it lives on GitHub Releases"
    Write-Err "  and is reachable only via 'bun upgrade --canary'."
    Write-Err ""
    Write-Err "  If your bun is from bun.sh:"
    Write-Err "    bun upgrade --canary"
    Write-Err "    or: powershell -c ""iex & {`$(irm https://bun.sh/install.ps1)} -Version canary"""
    Write-Err ""
    Write-Err "  If your bun is from scoop (the binary is behind a shim and refuses to"
    Write-Err "  self-replace, so 'bun upgrade' silently hangs):"
    Write-Err "    scoop uninstall bun"
    Write-Err "    irm https://bun.sh/install.ps1 | iex"
    Write-Err "    bun upgrade --canary"
    Write-Err ""
    Write-Err "  Then re-run .\install.ps1 — this sanity check will pass."
    if ($sanityStatus -eq 0) { $sanityStatus = 1 }
    exit $sanityStatus
}
if ($sanityStatus -ne 0) {
    if ($sanityOut) { Write-Host $sanityOut.TrimEnd() }
    Write-Err "Bun failed to load patched cli.original.cjs (exit $sanityStatus)."
    exit $sanityStatus
}
Write-OK "Bun loads cli.original.cjs"

# ─── Replace claude command ───────────────────────────

# Build launcher content using %USERPROFILE% env var where possible to avoid
# encoding issues when the profile path contains non-ASCII characters (e.g.
# Chinese/Korean/Japanese usernames). cmd.exe resolves %USERPROFILE% at
# runtime so no problematic characters need to be baked into the .cmd file.
$cliPathInCmd = "%USERPROFILE%\.clawgod\cli.cjs"
$normalizedUserProfile = $env:USERPROFILE.TrimEnd('\', '/')
$normalizedBunBin = $BunBin.TrimEnd('\', '/')
$userProfilePrefix = "$normalizedUserProfile\"
if ($normalizedBunBin.Equals($normalizedUserProfile, [StringComparison]::OrdinalIgnoreCase) -or
    $normalizedBunBin.StartsWith($userProfilePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    $bunRelative = $normalizedBunBin.Substring($normalizedUserProfile.Length).TrimStart('\', '/')
    $bunPathInCmd = "%USERPROFILE%\$bunRelative"
} else {
    # Bun outside USERPROFILE (e.g. system-wide install) — fall back to
    # absolute path since %USERPROFILE%-relative expansion doesn't apply.
    $bunPathInCmd = $BunBin
}
# Download clawgod-import binary
$importBin = Join-Path $ClawDir "clawgod-import.exe"
if (-not (Test-Path $importBin)) {
    $importUrl = "https://github.com/0Chencc/clawgod/releases/latest/download/clawgod-import-windows-x64.exe"
    try {
        & $BunBin (Join-Path $ClawDir "fetch-file.mjs") $importUrl $importBin 2>$null
        if ($LASTEXITCODE -ne 0) { throw "fetch-file.mjs exited $LASTEXITCODE" }
        Write-OK "Provider import tool installed (clawgod-import.exe)"
    } catch {
        Write-Dim "Provider import tool not yet available (build pending)"
    }
}

$importPathInCmd = "%USERPROFILE%\.clawgod\clawgod-import.exe"
$launcherContent = @"
@echo off
rem CLAWGOD_LAUNCHER_V1
setlocal
if /I "%~1"=="import" (
  if exist "$importPathInCmd" (
    shift
    "$importPathInCmd" %1 %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
  ) else (
    echo clawgod: import tool not installed. Reinstall clawgod to get it.
    exit /b 127
  )
)
if not exist "$cliPathInCmd" (
  echo clawgod: cli.cjs not found. Reinstall: irm https://github.com/A6083450/clawgod-plus/releases/latest/download/install.ps1 ^| iex
  exit /b 127
)
if not exist "$bunPathInCmd" (
  echo clawgod: bun not found at $bunPathInCmd. Install: https://bun.sh/install
  exit /b 127
)
set "CLAUDE_CODE_EXECPATH=%~dp0claude.orig.exe"
set "CLAWGOD_AUTO_CHROME=1"
if "%CLAWGOD_NO_AUTO_CHROME%"=="1" set "CLAWGOD_AUTO_CHROME=0"
for %%A in (%*) do if /I "%%~A"=="--chrome" set "CLAWGOD_AUTO_CHROME=0"
for %%A in (%*) do if /I "%%~A"=="-p" set "CLAWGOD_AUTO_CHROME=0"
for %%A in (%*) do if /I "%%~A"=="--print" set "CLAWGOD_AUTO_CHROME=0"
for %%A in (%*) do if /I "%%~A"=="--permission-mode" set "CLAWGOD_AUTO_CHROME=0"
for %%A in (%*) do if /I "%%~A"=="--input-format" set "CLAWGOD_AUTO_CHROME=0"
for %%A in (%*) do if /I "%%~A"=="--output-format" set "CLAWGOD_AUTO_CHROME=0"
for %%A in (-h --help -v --version version update upgrade auth login logout config mcp daemon logs attach stop kill respawn rm doctor install uninstall completion migrate-installer setup-token) do if /I "%~1"=="%%~A" set "CLAWGOD_AUTO_CHROME=0"
if "%CLAWGOD_AUTO_CHROME%"=="1" (
  "$bunPathInCmd" "$cliPathInCmd" --chrome %*
) else (
  "$bunPathInCmd" "$cliPathInCmd" %*
)
exit /b %ERRORLEVEL%
"@

# Find and back up original claude
$claudeCmd = Join-Path $BinDir "claude.cmd"
$claudeExe = Join-Path $BinDir "claude.exe"
$claudeOrigCmd = Join-Path $BinDir "claude.orig.cmd"
$claudeOrigExe = Join-Path $BinDir "claude.orig.exe"

# Validate both launcher slots before any backup, removal, or replacement.
if ((Test-ClaudeLauncherConflict -Current $claudeCmd -Original $claudeOrigCmd) -or
    (Test-ClaudeLauncherConflict -Current $claudeExe -Original $claudeOrigExe)) {
    exit 1
}
foreach ($original in @($claudeOrigCmd, $claudeOrigExe)) {
    if (Test-ClawGodLauncherContent $original) {
        Remove-Item -LiteralPath $original -Force
        Write-Warn "Removed installer-owned polluted backup ($original)"
    }
}

# Check multiple locations for original claude
foreach ($loc in @(
    (Join-Path $BinDir "claude.exe"),
    (Join-Path $BinDir "claude.cmd"),
    (Join-Path $env:USERPROFILE ".local\share\claude\versions"),
    (Join-Path $env:LOCALAPPDATA "Programs\claude-code")
)) {
    if (-not (Test-Path $loc)) { continue }
    if ((Test-Path $loc -PathType Leaf) -and (Test-ClawGodLauncher $loc)) { continue }
    # Back up .exe if exists and not already backed up
    if ($loc -like "*.exe" -and -not (Test-ClaudePathPresent $claudeOrigExe)) {
        Copy-Item $loc $claudeOrigExe -Force
        Write-OK "Original claude.exe backed up → claude.orig.exe"
    }
    # Back up .cmd if exists and not already backed up
    if ($loc -like "*.cmd" -and -not (Test-ClaudePathPresent $claudeOrigCmd)) {
        Copy-Item $loc $claudeOrigCmd -Force
        Write-OK "Original claude.cmd backed up → claude.orig.cmd"
    }
    # If it's a versions directory, find the latest exe
    if (Test-Path $loc -PathType Container) {
        $latestExe = Get-ChildItem $loc -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($latestExe -and -not (Test-ClaudePathPresent $claudeOrigExe)) {
            Copy-Item $latestExe.FullName $claudeOrigExe -Force
            Write-OK "Original claude backed up → claude.orig.exe ($($latestExe.Name))"
        }
    }
}

# Remove claude.exe so .cmd takes precedence
# The exact current executable is removed only after it has a valid backup.
if (Test-ClaudePathPresent $claudeExe) {
    if (Test-ClawGodLauncher $claudeExe) {
        Remove-Item -LiteralPath $claudeExe -Force
        Write-OK "Removed owned claude.exe launcher (.cmd now takes priority)"
    } elseif (-not (Test-ClaudePathPresent $claudeOrigExe)) {
        Rename-Item $claudeExe $claudeOrigExe -Force
        Write-OK "Renamed claude.exe → claude.orig.exe"
    } else {
        # Conflict preflight plus backup search proved this exact current path is preserved.
        try {
            Remove-Item -LiteralPath $claudeExe -Force
        } catch {
            Write-Err "Could not remove owned launcher $claudeExe`: $($_.Exception.Message)"
            exit 1
        }
        Write-OK "Removed claude.exe (.cmd now takes priority)"
    }
}


# Write .cmd launcher for both 'claude' and the explicit 'clawgod' alias.
# Why both:
#  - claude.cmd may be shadowed by a claude.exe higher in PATH
#  - clawgod.cmd has no .exe competitor, so it always works
#  - User can invoke patched explicitly via `clawgod` regardless of which
#    binary 'claude' resolves to
foreach ($cmd in @("claude", "clawgod")) {
    $launcherContent | Set-Content (Join-Path $BinDir "$cmd.cmd") -Encoding Default
}
Write-OK "Commands 'claude' + 'clawgod' → patched"

# --- Ensure optional Claude plugins ---------------------------------

$hadPluginBun = Test-Path Env:CLAWGOD_BUN_BIN
$previousPluginBun = $env:CLAWGOD_BUN_BIN
$hadPluginDir = Test-Path Env:CLAWGOD_DIR
$previousPluginDir = $env:CLAWGOD_DIR
try {
    $env:CLAWGOD_BUN_BIN = $BunBin
    $env:CLAWGOD_DIR = $ClawDir
    & $BunBin (Join-Path $ClawDir "plugin-dependencies.mjs") ensure
    if ($LASTEXITCODE -ne 0) { throw "optional plugin ensure exited $LASTEXITCODE" }
} catch {
    Write-Warn "Optional Claude plugin setup could not complete; ClawGod Plus core install will continue"
} finally {
    if ($hadPluginBun) { $env:CLAWGOD_BUN_BIN = $previousPluginBun }
    else { Remove-Item Env:CLAWGOD_BUN_BIN -ErrorAction SilentlyContinue }
    if ($hadPluginDir) { $env:CLAWGOD_DIR = $previousPluginDir }
    else { Remove-Item Env:CLAWGOD_DIR -ErrorAction SilentlyContinue }
}

Install-ClaudeMemCompatHelper
try {
    $env:CLAWGOD_BUN_BIN = $BunBin
    $env:CLAWGOD_CLAUDE_BIN = $claudeCmd
    & $BunBin (Join-Path $ClawDir "claude-mem-compat.cjs") install
    if (Test-Path (Join-Path $env:USERPROFILE ".claude-mem\clawgod-settings-backup.json")) {
        Write-OK "claude-mem compatibility configured"
    }
} catch {
    Write-Warn "claude-mem compatibility setup failed; ClawGod Plus core install will continue"
} finally {
    Remove-Item Env:CLAWGOD_BUN_BIN -ErrorAction SilentlyContinue
    Remove-Item Env:CLAWGOD_CLAUDE_BIN -ErrorAction SilentlyContinue
}

# ─── Ensure BinDir is in PATH ─────────────────────────

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$BinDir;$userPath", "User")
    $env:Path = "$BinDir;$env:Path"
    Write-OK "Added $BinDir to user PATH"
    Write-Dim "(restart terminal for PATH to take effect)"
}

# ─── Done ─────────────────────────────────────────────

Write-Host ""
Write-Host "  ClawGod Plus installed!" -ForegroundColor Green
Write-Host ""
Write-Dim "  claude            — Start patched Claude Code (green logo)"
Write-Dim "  claude.orig       — Run original unpatched Claude Code"
Write-Host ""
Write-Dim "  Updates: 'claude update' is patched to route through this installer."
Write-Dim "  Just run it as usual — pulls latest Anthropic release + re-patches"
Write-Dim "  in one step. Extra options:"
Write-Dim "    claude update --version 2.1.180   (install a specific version)"
Write-Dim "    claude update --no-upgrade        (re-patch without downloading)"
Write-Dim "  To leave clawgod and use vanilla update:"
Write-Dim "    bash ~/.clawgod/install.sh --uninstall"
Write-Host ""
Write-Dim "  If 'claude' still runs the old version, restart your terminal."
Write-Host ""
Write-Dim "  Config: ~/.clawgod/provider.json"
Write-Dim "  Flags:  ~/.clawgod/features.json"
Write-Host ""
Write-Dim "  If 'claude' panics with 'Expected CommonJS module to have a function wrapper',"
Write-Dim "  your Bun lags Anthropic's embedded Bun. Upgrade with one of:"
Write-Dim "    bun upgrade --canary           (if installed from bun.sh)"
Write-Dim "    scoop update bun               (scoop — may lag stable)"
Write-Dim "    irm https://bun.sh/install.ps1 | iex   (re-install latest)"
Write-Host ""
