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
@@CLAWGOD_WINDOWS_LIFECYCLE@@

$ClaudeMemCompatBytes = [Convert]::FromBase64String('@@CLAWGOD_CLAUDE_MEM_COMPAT_CJS_BASE64@@')
$SelfUpdateBytes = [Convert]::FromBase64String('@@CLAWGOD_SELF_UPDATE_CJS_BASE64@@')
$PatchFallbackBytes = [Convert]::FromBase64String('@@CLAWGOD_PATCH_FALLBACK_CJS_BASE64@@')

function Install-ClaudeMemCompatHelper {
    New-Item -ItemType Directory -Force -Path $ClawDir | Out-Null
    $helper = Join-Path $ClawDir "claude-mem-compat.cjs"
    [System.IO.File]::WriteAllBytes($helper, $ClaudeMemCompatBytes)
}

function Install-UpdateRuntimeHelpers {
    New-Item -ItemType Directory -Force -Path $ClawDir | Out-Null
    [System.IO.File]::WriteAllBytes((Join-Path $ClawDir "self-update.cjs"), $SelfUpdateBytes)
    [System.IO.File]::WriteAllBytes((Join-Path $ClawDir "patch-fallback.cjs"), $PatchFallbackBytes)
}

$ProxyFetchBytes = [Convert]::FromBase64String('@@CLAWGOD_PROXY_FETCH_MJS_BASE64@@')
$FetchFileBytes = [Convert]::FromBase64String('@@CLAWGOD_FETCH_FILE_MJS_BASE64@@')

function Install-FetchFileHelper {
    New-Item -ItemType Directory -Force -Path $ClawDir | Out-Null
    [System.IO.File]::WriteAllBytes((Join-Path $ClawDir "proxy-fetch.mjs"), $ProxyFetchBytes)
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
        & $BunBin (Join-Path $ClawDir "fetch-file.mjs") "https://raw.githubusercontent.com/A6083450/clawgod-plus/main/dist/win/apply-claude-code-chrome-fix.ps1" $dst
        if ($LASTEXITCODE -ne 0) { return $false }
        return $true
    } catch {
        return $false
    }
}

function Invoke-ChromePostInstallFix {
    # v2.1.245+ ships a code-split ESM bundle (entry + chunks/). The Chrome
    # socket/subscription patches are already applied by the universal patcher
    # against the concatenated bundle, so this legacy single-file helper would
    # only report NOT_FOUND. Skip it to avoid the misleading error.
    if (Test-Path (Join-Path $ClawDir "chunks")) {
        Write-Dim "Chrome fix already covered by patcher (code-split bundle); skipping"
        return
    }

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

# --- Colors -----------------------------------------------------------

function Write-OK($msg)   { Write-Host "  $([char]0x2713) $msg" -ForegroundColor Green }
function Write-Err($msg)  { Write-Host "  $([char]0x2717) $msg" -ForegroundColor Red }
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

# --- Uninstall ----------------------------------------

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

    foreach ($f in @("cli.js","cli.cjs","cli.original.js","cli.original.cjs","cli.original.js.bak","cli.original.cjs.bak","patch.js","patch.mjs","extract-natives.mjs","post-process.mjs","repatch.mjs","vendor-transaction.mjs","self-update.cjs","patch-fallback.cjs","patch-fallback.json","openai-proxy.cjs","proxy-fetch.mjs","fetch-file.mjs","enhancement-config.mjs","enhancement-manifest.json","install-ripgrep.mjs","enhancement-selection.mjs","lean-remove.mjs","lean-apply.mjs","clawgod-import.exe","apply-claude-code-chrome-fix.ps1","claude-mem-compat.cjs","claude-mem.cmd","plugin-dependencies.mjs","claude-hud-statusline.mjs","plugin-dependencies-state.json","cache","staging","assets","chunks","chunks.bak",".source-version",".clawgod-version",".update-check","node_modules","bun-runtime","vendor")) {
        $p = Join-Path $ClawDir $f
        if (Test-Path $p) { Remove-Item -Recurse -Force $p }
    }
    Get-ChildItem -LiteralPath $ClawDir -Filter ".patch-fallback.*.tmp" -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Path $ClawDir -Filter 'cli.original.js.backup-*' -ErrorAction SilentlyContinue | Remove-Item -Force
    Get-ChildItem -Path $ClawDir -Filter 'cli.original.cjs.backup-*' -ErrorAction SilentlyContinue | Remove-Item -Force
    Write-OK "ClawGod Plus uninstalled"
    Write-Host ""
    Write-Dim "Restart your terminal for changes to take effect."
    Write-Host ""
    exit 0
}

# --- Bun prerequisite ----------------------------------

$BunBin = Resolve-Bun
if (-not $BunBin) { exit 1 }
Write-OK "Bun: $(& $BunBin --version)"

# --- Bun version pre-flight -------------------------------------------
# Anthropic builds the native binary with Bun's canary channel; stable
# bun.sh trails by one version. Bun < 1.3.14 panics on cli.original.cjs
# with "Expected CommonJS module to have a function wrapper". Refuse
# early -- no npm download / no patch / no late sanity surprise where
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

$EnhancementConfigBytes = [Convert]::FromBase64String('@@CLAWGOD_ENHANCEMENT_CONFIG_MJS_BASE64@@')
[System.IO.File]::WriteAllBytes((Join-Path $ClawDir 'enhancement-config.mjs'), $EnhancementConfigBytes)
$EnhancementManifestBytes = [Convert]::FromBase64String('@@CLAWGOD_ENHANCEMENTS_JSON_BASE64@@')
[System.IO.File]::WriteAllBytes((Join-Path $ClawDir 'enhancement-manifest.json'), $EnhancementManifestBytes)
Initialize-EnhancementSelection

# --- Optional Claude plugin dependencies -----------------------------

$PluginDependenciesBytes = [Convert]::FromBase64String('@@CLAWGOD_PLUGIN_DEPENDENCIES_MJS_BASE64@@')
[System.IO.File]::WriteAllBytes((Join-Path $ClawDir "plugin-dependencies.mjs"), $PluginDependenciesBytes)

# --- Managed ripgrep -------------------------------------------------

$InstallRipgrepBytes = [Convert]::FromBase64String('@@CLAWGOD_INSTALL_RIPGREP_MJS_BASE64@@')
[System.IO.File]::WriteAllBytes((Join-Path $ClawDir "install-ripgrep.mjs"), $InstallRipgrepBytes)
$VendorTransactionBytes = [Convert]::FromBase64String('@@CLAWGOD_VENDOR_TRANSACTION_MJS_BASE64@@')
[System.IO.File]::WriteAllBytes((Join-Path $ClawDir "vendor-transaction.mjs"), $VendorTransactionBytes)

$ripgrepOutput = & $BunBin (Join-Path $ClawDir "install-ripgrep.mjs") $ClawDir 2>&1
if ($LASTEXITCODE -ne 0) {
    $ripgrepOutput | ForEach-Object { Write-Err "$_" }
    Write-Err "Failed to install ClawGod-managed ripgrep."
    exit 1
}
$ripgrepOutput | ForEach-Object { Write-OK "$_" }

# --- Handle -NoUpgrade (skip download, re-patch only) ----------------
New-Item -ItemType Directory -Force -Path $ClawDir | Out-Null
$RuntimeTarget = Join-Path $ClawDir "cli.original.cjs"
$RuntimeSourceVersion = Join-Path $ClawDir ".source-version"
$RuntimeRollbackDir = Join-Path $ClawDir (".runtime-rollback." + [Guid]::NewGuid().ToString("N"))
$RuntimeCandidateDir = Join-Path $RuntimeRollbackDir "candidate"
$RuntimeCandidateVendor = Join-Path $RuntimeCandidateDir "vendor"
$RuntimeVendorDir = Join-Path $ClawDir "vendor"
$RuntimeHadTarget = Test-Path -LiteralPath $RuntimeTarget -PathType Leaf
$RuntimeHadSourceVersion = Test-Path -LiteralPath $RuntimeSourceVersion -PathType Leaf
$RuntimeTransactionCommitted = $false
$RuntimeVendorPublishStarted = $false
$VendorRollbackComplete = $false
$RuntimeTransactionCleanupSafe = $true
New-Item -ItemType Directory -Path $RuntimeRollbackDir | Out-Null
if ($RuntimeHadTarget) {
    Copy-Item -LiteralPath $RuntimeTarget -Destination (Join-Path $RuntimeRollbackDir "cli.original.cjs")
}
if ($RuntimeHadSourceVersion) {
    Copy-Item -LiteralPath $RuntimeSourceVersion -Destination (Join-Path $RuntimeRollbackDir ".source-version")
}
$RuntimeChunksTarget = Join-Path $ClawDir "chunks"
$RuntimeHadChunks = Test-Path -LiteralPath $RuntimeChunksTarget -PathType Container
if ($RuntimeHadChunks) {
    Move-Item -LiteralPath $RuntimeChunksTarget -Destination (Join-Path $RuntimeRollbackDir "chunks")
}

try {
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
    $chunksTarget = Join-Path $ClawDir "chunks"
    $chunksBak = Join-Path $ClawDir "chunks.bak"
    if (Test-Path $chunksBak) {
        if (Test-Path $chunksTarget) { Remove-Item -Recurse -Force $chunksTarget }
        Copy-Item -Recurse $chunksBak $chunksTarget
        Write-OK "Restored clean chunks from backup"
    }
    Write-OK "Skipping download (-NoUpgrade)"
} else {

# A full reinstall replaces cli.original.cjs + chunks with a freshly-extracted
# bundle. Drop any .bak left over from a previous Claude Code version so the
# patcher backs up this version's clean bundle instead of a stale one
# (-NoUpgrade restores from .bak and would otherwise mix versions).
$staleCliBak = Join-Path $ClawDir "cli.original.cjs.bak"
if (Test-Path $staleCliBak) { Remove-Item -Force $staleCliBak }
$staleChunksBak = Join-Path $ClawDir "chunks.bak"
if (Test-Path $staleChunksBak) { Remove-Item -Recurse -Force $staleChunksBak }

# --- Locate native Bun binary (cli.js source) --------------------------
# Source: npm registry (@anthropic-ai/claude-code-win32-<arch>).
# Local binary detection is intentionally skipped -- see policy note below.

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
# here) would re-detect the frozen binary forever -- never reaching the
# registry. See INCIDENT_LOG 2026-04-29 entry. The fix is to skip local
# detection entirely; the npm tarball is ~60-90 MB compressed, fetched
# once per upgrade.

# npm registry -- pull the platform tarball directly via Bun.
if (-not $NativeBin) {
    $npmPkg = "@anthropic-ai/claude-code-$platformSuffix"
    Write-Dim "Fetching $npmPkg@$Version from npm registry ..."
    $NativeBinTmpDir = Join-Path $env:TEMP "clawgod-binary-$([Guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Force -Path $NativeBinTmpDir | Out-Null
    $fetchScript = Join-Path $NativeBinTmpDir "fetch-package.mjs"
    $FetchPackageBytes = [Convert]::FromBase64String('@@CLAWGOD_FETCH_PACKAGE_MJS_BASE64@@')
    [System.IO.File]::WriteAllBytes($fetchScript, $FetchPackageBytes)
    [System.IO.File]::WriteAllBytes((Join-Path $NativeBinTmpDir "proxy-fetch.mjs"), $ProxyFetchBytes)

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

# --- Extract cli.js + native modules from Bun binary ----------

# Single extractor pass: stages cli.original.js and native modules in the
# same-filesystem runtime transaction until mandatory patches pass.
New-Item -ItemType Directory -Path $RuntimeCandidateDir | Out-Null

$dstCli = Join-Path $RuntimeCandidateDir "cli.original.js"
if (Test-Path $dstCli) { Remove-Item -Force $dstCli }

Write-Dim "Extracting cli.js + napi modules from $NativeBinLabel ..."
& $BunBin $extractorPath $NativeBin $RuntimeCandidateDir 2>&1 | ForEach-Object { Write-Host "  $_" }
if (-not (Test-Path $dstCli)) {
    Write-Err "Failed to extract cli.js from native binary"
    exit 1
}

# Note: keep extractorPath around -- repatch.mjs uses it on version drift

# --- Post-process cli.js for Bun runtime ----------------------

Write-Dim "Rewriting bunfs paths and IIFE invocation ..."
$postProc = Join-Path $ClawDir "post-process.mjs"
$PostProcessorBytes = [Convert]::FromBase64String('@@CLAWGOD_POST_PROCESSOR_MJS_BASE64@@')
[System.IO.File]::WriteAllBytes($postProc, $PostProcessorBytes)
$candidatePostProc = Join-Path $RuntimeCandidateDir "post-process.mjs"
Copy-Item -LiteralPath $postProc -Destination $candidatePostProc
& $BunBin $candidatePostProc $ClawDir 2>&1 | ForEach-Object { Write-Host "  $_" }
$candidateCli = Join-Path $RuntimeCandidateDir "cli.original.cjs"
if (-not (Test-Path $candidateCli)) {
    Write-Err "Post-process failed"
    exit 1
}
Move-Item -LiteralPath $candidateCli -Destination $RuntimeTarget -Force

# Code-split chunk graph (v2.1.245+): every non-entry js module extracted by
# extract-natives.mjs into candidate/chunks/. Move it into place alongside
# cli.original.cjs so the patcher and runtime can resolve the rewritten
# relative import specifiers.
$candidateChunks = Join-Path $RuntimeCandidateDir "chunks"
if (Test-Path $candidateChunks) {
    $chunksTarget = Join-Path $ClawDir "chunks"
    if (Test-Path $chunksTarget) {
        Remove-Item -Recurse -Force $chunksTarget -ErrorAction SilentlyContinue
    }
    Move-Item -LiteralPath $candidateChunks -Destination $chunksTarget -Force
}

# Design canvas editor payload (loader=file asset from the binary) -- see
# wrapper.cjs CLAWGOD_DESIGN_PAYLOAD export.
$candidateAssets = Join-Path $RuntimeCandidateDir "assets"
if (Test-Path $candidateAssets) {
    $assetsTarget = Join-Path $ClawDir "assets"
    if (Test-Path $assetsTarget) {
        Remove-Item -Recurse -Force $assetsTarget -ErrorAction SilentlyContinue
    }
    Move-Item -LiteralPath $candidateAssets -Destination $assetsTarget -Force
}

# Stamp source version so wrapper can detect drift on next launch
Set-Content -Path (Join-Path $ClawDir ".source-version") -Value $NativeBinLabel -Encoding ASCII

# If we pulled the binary from npm into a tmpdir, clean up -- extraction
# is done; drift detection only consults %USERPROFILE%\.local\share\claude\versions\.
if ($NativeBinTmpDir -and (Test-Path $NativeBinTmpDir)) {
    Remove-Item -Recurse -Force $NativeBinTmpDir -ErrorAction SilentlyContinue
}

Write-OK "cli.original.cjs ready ($NativeBinLabel)"

}  # end -NoUpgrade skip

# --- Write re-patch helper (used by wrapper on version drift) ---------

$RepatcherBytes = [Convert]::FromBase64String('@@CLAWGOD_REPATCHER_MJS_BASE64@@')
[System.IO.File]::WriteAllBytes((Join-Path $ClawDir "repatch.mjs"), $RepatcherBytes)
Write-OK "Re-patch helper installed (repatch.mjs)"

# --- Write OpenAI-compatible proxy ----------------------------

$OpenAIProxyBytes = [Convert]::FromBase64String('@@CLAWGOD_OPENAI_PROXY_CJS_BASE64@@')
[System.IO.File]::WriteAllBytes((Join-Path $ClawDir "openai-proxy.cjs"), $OpenAIProxyBytes)
Write-OK "OpenAI-compatible proxy created (openai-proxy.cjs)"

# --- Write wrapper (cli.cjs, runs under Bun) ------------------

Install-UpdateRuntimeHelpers

$WrapperBytes = [Convert]::FromBase64String('@@CLAWGOD_WRAPPER_CJS_BASE64@@')
[System.IO.File]::WriteAllBytes((Join-Path $ClawDir "cli.cjs"), $WrapperBytes)
Set-Content (Join-Path $ClawDir ".clawgod-version") $ClawSelfVersion
Write-OK "Wrapper created (cli.cjs)"

# --- Write universal patcher --------------------------
# (Same Bun patcher as bash version -- inline to avoid extra download)

$PatcherBytes = [Convert]::FromBase64String('@@CLAWGOD_PATCHER_MJS_BASE64@@')
[System.IO.File]::WriteAllBytes((Join-Path $ClawDir "patch.mjs"), $PatcherBytes)
Write-OK "Patcher created (patch.mjs)"

# --- Apply patches ------------------------------------

Write-Dim "Applying patches ..."
$patchOutput = & $BunBin (Join-Path $ClawDir "patch.mjs") --enhancements-file (Join-Path $ClawDir "enhancements.json") 2>&1
$patchStatus = $LASTEXITCODE
$patchOutput | ForEach-Object { Write-Host "  $_" }
if ($patchStatus -ne 0) {
    Write-Err "Mandatory patching failed; installation stopped before launcher replacement."
    exit $patchStatus
}
if (-not $NoUpgrade) {
    $RuntimeVendorPublishStarted = $true
    $VendorNativePreferenceWasDefined = Test-Path Variable:PSNativeCommandUseErrorActionPreference
    if ($VendorNativePreferenceWasDefined) { $VendorNativePreferenceValue = $PSNativeCommandUseErrorActionPreference }
    try {
        if ($VendorNativePreferenceWasDefined) { $PSNativeCommandUseErrorActionPreference = $false }
        & $BunBin (Join-Path $ClawDir "vendor-transaction.mjs") publish $RuntimeVendorDir $RuntimeCandidateVendor $RuntimeRollbackDir
        $vendorStatus = $LASTEXITCODE
    } finally {
        if ($VendorNativePreferenceWasDefined) { $PSNativeCommandUseErrorActionPreference = $VendorNativePreferenceValue }
        else { Remove-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue }
    }
    if ($vendorStatus -ne 0) {
        $VendorRollbackComplete = $vendorStatus -eq 20 -or $vendorStatus -eq 22
        if ($vendorStatus -eq 22) { $RuntimeTransactionCleanupSafe = $false }
        throw "Native vendor publication failed."
    }
}
$RuntimeTransactionCommitted = $true
} finally {
    if (-not $RuntimeTransactionCommitted) {
        if (-not $RuntimeVendorPublishStarted) { $VendorRollbackComplete = $true }
        if ($VendorRollbackComplete) {
            if ($RuntimeHadTarget) {
                Copy-Item -LiteralPath (Join-Path $RuntimeRollbackDir "cli.original.cjs") -Destination $RuntimeTarget -Force
            } else {
                Remove-Item -LiteralPath $RuntimeTarget -Force -ErrorAction SilentlyContinue
            }
            if ($RuntimeHadSourceVersion) {
                Copy-Item -LiteralPath (Join-Path $RuntimeRollbackDir ".source-version") -Destination $RuntimeSourceVersion -Force
            } else {
                Remove-Item -LiteralPath $RuntimeSourceVersion -Force -ErrorAction SilentlyContinue
            }
            $chunksTarget = Join-Path $ClawDir "chunks"
            if ($RuntimeHadChunks) {
                if (Test-Path $chunksTarget) { Remove-Item -Recurse -Force $chunksTarget -ErrorAction SilentlyContinue }
                Move-Item -LiteralPath (Join-Path $RuntimeRollbackDir "chunks") -Destination $chunksTarget -Force -ErrorAction SilentlyContinue
            } else {
                Remove-Item -Recurse -Force $chunksTarget -ErrorAction SilentlyContinue
            }
        } else {
            Write-Err "Vendor rollback conflict; prior CLI was not restored; recovery data retained at $RuntimeRollbackDir"
        }
    }
    if ($RuntimeTransactionCommitted -or ($VendorRollbackComplete -and $RuntimeTransactionCleanupSafe)) {
        Remove-Item -LiteralPath $RuntimeRollbackDir -Recurse -Force -ErrorAction SilentlyContinue
    } elseif ($VendorRollbackComplete) {
        Write-Err "Prior CLI restored; untrusted transaction data retained at $RuntimeRollbackDir"
    }
}
Invoke-ChromePostInstallFix

# --- Create default configs ---------------------------

$featuresFile = Join-Path $ClawDir "features.json"
if (-not (Test-Path $featuresFile)) {
    $featuresJson = @'
@@CLAWGOD_FEATURES_JSON@@
'@
    [System.IO.File]::WriteAllText($featuresFile, $featuresJson, (New-Object System.Text.UTF8Encoding $false))
    Write-OK "Default features.json created"
}

# --- Lean mode: optimize ~/.claude/settings.json -----
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
const fs=require("fs"),p=process.argv[2];
const allDeny=new Set(["DesignSync","NotebookEdit","PushNotification","RemoteTrigger","CronCreate","CronDelete","CronList","EnterPlanMode","ExitPlanMode","SendMessage","ScheduleWakeup","AskUserQuestion","ReportFindings"]);
const allFlags=["disableWorkflows","disableRemoteControl","disableClaudeAiConnectors","disableArtifact","disableBundledSkills"];
let s={};try{s=JSON.parse(fs.readFileSync(p,"utf8"))}catch{process.exit(0)}
for(const k of allFlags)delete s[k];
if(Array.isArray(s.permissions?.deny))s.permissions.deny=s.permissions.deny.filter(t=>!allDeny.has(t));
fs.writeFileSync(p,JSON.stringify(s,null,2)+"\n");
'@
    if (Test-Path $claudeSettings) {
        try {
            # Windows CreateProcess can strip quotes from multiline bun -e source; execute a file instead.
            $leanRemoveScriptFile = Join-Path $ClawDir 'lean-remove.mjs'
            Set-Content -Path $leanRemoveScriptFile -Value $leanRemoveScript -Encoding ASCII
            & $BunBin $leanRemoveScriptFile "$claudeSettings" 2>$null
        } catch {}
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
const settingsPath = process.argv[2];
const isMax = process.argv[3] === "true";
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
        # Windows CreateProcess can strip quotes from multiline bun -e source; execute a file instead.
        $leanApplyScriptFile = Join-Path $ClawDir 'lean-apply.mjs'
        Set-Content -Path $leanApplyScriptFile -Value $leanApplyScript -Encoding ASCII
        & $BunBin $leanApplyScriptFile "$claudeSettings" "$leanIsMax" 2>$null
        if ($leanIsMax) { Write-OK "Lean settings applied: max (~/.claude/settings.json)" }
        else { Write-OK "Lean settings applied: on (~/.claude/settings.json)" }
    } catch {}
} else {
    Write-Host "  $([char]0x2022) Lean mode disabled (claude --lean-on to re-enable)" -ForegroundColor DarkGray
}

# --- Sanity check: ensure user's Bun can actually load cli.original.cjs --
# Anthropic builds the native binary with a bleeding-edge Bun build (e.g.
# 1.3.14 while stable still ships 1.3.13). Older Bun crashes loading the
# extracted cli.original.cjs with "Expected CommonJS module to have a
# function wrapper". Detect this BEFORE we install the launcher -- better
# to fail loudly than to leave the user with a launcher that panics on
# first invocation.

Write-Dim "Verifying Bun can load patched cli.original.cjs ..."
$sanityCli = Join-Path $ClawDir "cli.cjs"
# PowerShell folds native-command stderr into the error stream as
# ErrorRecord objects; with $ErrorActionPreference='Stop' (common when
# this script is piped through `iex`) that terminates BEFORE we even
# read $sanityOut. Localize ErrorActionPreference + try/catch so the
# panic message reliably lands in $sanityOut and our friendly Write-Err
# block runs. Defense-in-depth -- pre-flight already blocks Bun < $MinBunVersion;
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
    Write-Err "  is NOT visible on bun.sh's download page -- it lives on GitHub Releases"
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
    Write-Err "  Then re-run .\install.ps1 -- this sanity check will pass."
    if ($sanityStatus -eq 0) { $sanityStatus = 1 }
    exit $sanityStatus
}
if ($sanityStatus -ne 0) {
    if ($sanityOut) { Write-Host $sanityOut.TrimEnd() }
    Write-Err "Bun failed to load patched cli.original.cjs (exit $sanityStatus)."
    exit $sanityStatus
}
Write-OK "Bun loads cli.original.cjs"

# --- Replace claude command ---------------------------

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
    # Bun outside USERPROFILE (e.g. system-wide install) -- fall back to
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
@@CLAWGOD_WINDOWS_LAUNCHER@@

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
        Write-OK "Original claude.exe backed up -> claude.orig.exe"
    }
    # Back up .cmd if exists and not already backed up
    if ($loc -like "*.cmd" -and -not (Test-ClaudePathPresent $claudeOrigCmd)) {
        Copy-Item $loc $claudeOrigCmd -Force
        Write-OK "Original claude.cmd backed up -> claude.orig.cmd"
    }
    # If it's a versions directory, find the latest exe
    if (Test-Path $loc -PathType Container) {
        $latestExe = Get-ChildItem $loc -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($latestExe -and -not (Test-ClaudePathPresent $claudeOrigExe)) {
            Copy-Item $latestExe.FullName $claudeOrigExe -Force
            Write-OK "Original claude backed up -> claude.orig.exe ($($latestExe.Name))"
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
        Write-OK "Renamed claude.exe -> claude.orig.exe"
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
Write-OK "Commands 'claude' + 'clawgod' -> patched"

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

# --- Ensure BinDir is in PATH -------------------------

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$BinDir;$userPath", "User")
    $env:Path = "$BinDir;$env:Path"
    Write-OK "Added $BinDir to user PATH"
    Write-Dim "(restart terminal for PATH to take effect)"
}

# --- Done ---------------------------------------------

Write-Host ""
Write-Host "  ClawGod Plus installed!" -ForegroundColor Green
Write-Host ""
Write-Dim "  claude            -- Start patched Claude Code (green logo)"
Write-Dim "  claude.orig       -- Run original unpatched Claude Code"
Write-Host ""
Write-Dim "  Updates: 'claude update' is patched to route through this installer."
Write-Dim "  Just run it as usual -- pulls latest Anthropic release + re-patches"
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
Write-Dim "    scoop update bun               (scoop -- may lag stable)"
Write-Dim "    irm https://bun.sh/install.ps1 | iex   (re-install latest)"
Write-Host ""
