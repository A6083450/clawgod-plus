param(
    [string]$Version = "",
    [switch]$NoUpgrade,
    [switch]$Uninstall,
    [switch]$LeanOff,
    [switch]$LeanOn,
    [switch]$LeanMax,
    [string]$Enhancements,
    [switch]$ChooseEnhancements
)

$ErrorActionPreference = "Stop"
$EnhancementsSpecified = $PSBoundParameters.ContainsKey('Enhancements')

if ($env:CLAWGOD_VERSION -and -not $Version) { $Version = $env:CLAWGOD_VERSION }
if ($env:CLAWGOD_NO_UPGRADE -eq "1") { $NoUpgrade = [switch]$true }
if ($env:CLAWGOD_LEAN_OFF -eq "1") { $LeanOff = [switch]$true }
if ($env:CLAWGOD_LEAN_ON -eq "1") { $LeanOn = [switch]$true }
if ($env:CLAWGOD_LEAN_MAX -eq "1") { $LeanMax = [switch]$true }

$ClawDir = Join-Path $env:USERPROFILE ".clawgod"

# Without an explicit version, preserve the currently installed Claude Code
# version from .source-version. Fresh installs fall back to latest. The
# `claude update` path injects CLAWGOD_VERSION explicitly, including latest.
if (-not $Version) {
    $srcVer = Join-Path $ClawDir ".source-version"
    if (Test-Path $srcVer) {
        $pinned = ((Get-Content $srcVer -Raw -ErrorAction SilentlyContinue) -replace '\s', '')
        # Accept only X.Y-style versions; ignore stale non-version markers.
        if ($pinned -match '^\d+\.\d+') { $Version = $pinned }
    }
    if (-not $Version) { $Version = "latest" }
}

$BinDir  = Join-Path $env:USERPROFILE ".local\bin"
$ClawSelfVersion = "0.0.0-dev"  # injected by release workflow from git tag

$EnhancementIds = @(
    'chrome',
    'computer-use',
    'design-canvas',
    'agents',
    'planning',
    'voice',
    'auto-mode',
    'unrestricted-tools',
    'paste-images',
    'privacy',
    'branding',
    'claude-hud',
    'claude-mem',
    'superpowers'
)

$EnhancementLabels = @(
    'Chrome',
    'Computer Use',
    'Design Canvas',
    'Agents',
    'Planning',
    'Voice',
    'Auto Mode',
    'Tools',
    'Paste Images',
    'Privacy',
    'Branding',
    'Claude HUD',
    'claude-mem',
    'Superpowers'
)

function Test-EnhancementInteractionAvailable {
    if ($env:CI) { return $false }
    if (-not $PSCommandPath -or -not (Test-Path -LiteralPath $PSCommandPath -PathType Leaf)) { return $false }
    try {
        return -not [Console]::IsInputRedirected
    } catch {
        return $false
    }
}

function Test-EnhancementAutoPromptAvailable {
    if ($env:CLAWGOD_NONINTERACTIVE -eq '1') { return $false }
    return Test-EnhancementInteractionAvailable
}

function Read-EnhancementKey {
    return [Console]::ReadKey($true).Key
}

function ConvertFrom-ClawGodUtf8 {
    param([Parameter(Mandatory = $true)][string]$Base64)
    return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Base64))
}

function Write-EnhancementChoiceMenu {
    param([int]$Cursor, [bool[]]$Selected)
    if ($script:ClawGodMenuRendered -gt 0) {
        [Console]::SetCursorPosition(0, $script:ClawGodMenuTop)
    } else {
        $script:ClawGodMenuTop = [Console]::CursorTop
    }
    Write-Host ''
    Write-Host '  Enhancements'
    for ($i = 0; $i -lt $EnhancementIds.Count; $i++) {
        $marker = if ($Selected[$i]) { 'x' } else { ' ' }
        $prefix = if ($i -eq $Cursor) { '> ' } else { '  ' }
        Write-Host ('{0}{1,2}) [{2}] {3,-20} {4}' -f $prefix, ($i + 1), $marker, $EnhancementIds[$i], $EnhancementLabels[$i])
    }
    Write-Host (ConvertFrom-ClawGodUtf8 'ICDihpEv4oaTIOenu+WKqCDCtyDnqbrmoLwg5Yu+6YCJIMK3IOWbnui9piDnoa7orqQgwrcgRXNjIOi/lOWbng==')
    $script:ClawGodMenuRendered = $EnhancementIds.Count + 3
}

function Write-EnhancementModeMenu {
    if ($script:ClawGodMenuRendered -gt 0) {
        [Console]::SetCursorPosition(0, $script:ClawGodMenuTop)
    } else {
        $script:ClawGodMenuTop = [Console]::CursorTop
    }
    Write-Host ''
    Write-Host (ConvertFrom-ClawGodUtf8 'ICBDbGF3R29kIFBsdXMg5aKe5by66YCJ5oup')
    Write-Host ((ConvertFrom-ClawGodUtf8 'ICAgMSkg5YWo6YOoIHswfSDpobnlop7lvLrvvIjpu5jorqTvvIzlm57ovabljbPpgInvvIk=') -f $EnhancementIds.Count)
    Write-Host (ConvertFrom-ClawGodUtf8 'ICAgMikg5LuF5qC45b+D77yI5LiN6KOF5Lu75L2V5aKe5by677yJ')
    Write-Host (ConvertFrom-ClawGodUtf8 'ICAgMykg6Ieq5a6a5LmJ6I+c5Y2V77yI6YCQ6aG55Yu+6YCJ77yJ')
    Write-Host (ConvertFrom-ClawGodUtf8 'ICDlm57ovaYg5YWo6YOo5aKe5by6IMK3IEVzYyDpgIDlh7o=')
    $script:ClawGodMenuRendered = 5
}

function Read-EnhancementChoice {
    $selected = @($EnhancementIds | ForEach-Object { $true })
    $cursor = 0
    $script:ClawGodMenuRendered = 0
    while ($true) {
        Write-EnhancementChoiceMenu -Cursor $cursor -Selected $selected
        $key = Read-EnhancementKey
        if ($key -eq [ConsoleKey]::UpArrow) { $cursor = ($cursor + $EnhancementIds.Count - 1) % $EnhancementIds.Count }
        elseif ($key -eq [ConsoleKey]::DownArrow) { $cursor = ($cursor + 1) % $EnhancementIds.Count }
        elseif ($key -eq [ConsoleKey]::Spacebar) { $selected[$cursor] = -not $selected[$cursor] }
        elseif ($key -eq [ConsoleKey]::Enter) {
            $enabled = @()
            for ($i = 0; $i -lt $EnhancementIds.Count; $i++) {
                if ($selected[$i]) { $enabled += $EnhancementIds[$i] }
            }
            if ($enabled.Count -eq 0) { return 'none' }
            return $enabled -join ','
        }
        elseif ($key -eq [ConsoleKey]::Escape) { return $null }
    }
}

function Read-EnhancementMode {
    $script:ClawGodMenuRendered = 0
    while ($true) {
        Write-EnhancementModeMenu
        $key = Read-EnhancementKey
        if ($key -eq [ConsoleKey]::Enter -or $key -eq [ConsoleKey]::D1) { return ($EnhancementIds -join ',') }
        if ($key -eq [ConsoleKey]::D2) { return 'none' }
        if ($key -eq [ConsoleKey]::D3) {
            $choice = Read-EnhancementChoice
            if ($null -ne $choice) { return $choice }
            $script:ClawGodMenuRendered = 0
            continue
        }
        if ($key -eq [ConsoleKey]::Escape) { return '__CLAWGOD_CANCELLED__' }
        Write-Warn ("Invalid enhancement choice: $key")
    }
}

function Write-EnhancementSelection {
    param([Parameter(Mandatory = $true)][string]$Explicit)
    $configModule = if ($env:CLAWGOD_ENHANCEMENT_CONFIG_MODULE) { $env:CLAWGOD_ENHANCEMENT_CONFIG_MODULE } else { Join-Path $ClawDir 'enhancement-config.mjs' }
    $manifestFile = if ($env:CLAWGOD_ENHANCEMENT_MANIFEST_FILE) { $env:CLAWGOD_ENHANCEMENT_MANIFEST_FILE } else { Join-Path $ClawDir 'enhancement-manifest.json' }
    $selectionScript = @'
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const [modulePath, manifestPath, homeDir, explicit] = process.argv.slice(2);
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
'@
    # Windows CreateProcess can strip quotes from multiline bun -e source, so
    # write the script to disk and execute the file instead.
    New-Item -ItemType Directory -Force -Path $ClawDir | Out-Null
    # On POSIX, pwsh follows umask (usually 0755), while enhancement-config
    # requires 0700. Windows ACL semantics are unaffected; Windows PowerShell
    # 5.1 also has no Platform key and no chmod, so this naturally skips there.
    if ($PSVersionTable.Platform -ne 'Win32NT' -and (Get-Command chmod -ErrorAction SilentlyContinue)) {
      & chmod 0700 $ClawDir 2>$null
    }
    $selectionScriptFile = Join-Path $ClawDir 'enhancement-selection.mjs'
    Set-Content -Path $selectionScriptFile -Value $selectionScript -Encoding ASCII
    & $BunBin $selectionScriptFile $configModule $manifestFile $env:USERPROFILE $Explicit
    $selectionExit = $LASTEXITCODE
    Remove-Item -LiteralPath $selectionScriptFile -Force -ErrorAction SilentlyContinue
    if ($selectionExit -ne 0) { throw "enhancement selection exited $selectionExit" }
}

function Initialize-EnhancementSelection {
    if ($EnhancementsSpecified) {
        if ([string]::IsNullOrEmpty($Enhancements)) { throw '-Enhancements requires a non-empty CSV value' }
        Write-EnhancementSelection -Explicit $Enhancements
        return
    }
    if ($ChooseEnhancements) {
        if (Test-EnhancementInteractionAvailable) {
            $choice = Read-EnhancementChoice
            if ($null -eq $choice) {
                Write-Host (ConvertFrom-ClawGodUtf8 'ICDlt7Llj5bmtojlronoo4U=')
                exit 130
            }
            Write-EnhancementSelection -Explicit $choice
            return
        }
        Write-Warn 'Interactive enhancement selection unavailable; using saved selection or all enhancements.'
    }
    elseif (Test-EnhancementAutoPromptAvailable) {
        $choice = Read-EnhancementMode
        if ($choice -eq '__CLAWGOD_CANCELLED__') {
            Write-Host (ConvertFrom-ClawGodUtf8 'ICDlt7Llj5bmtojlronoo4U=')
            exit 130
        }
        Write-EnhancementSelection -Explicit $choice
        return
    }
    Write-EnhancementSelection -Explicit '__CLAWGOD_SAVED__'
}
