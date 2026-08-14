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

# 未显式指定版本时，保持当前已安装的 Claude Code 版本（读 .source-version），
# 避免重跑 install 把 Claude Code 意外升级到最新；全新安装才回退 latest。
# `claude update` 路径会显式注入 CLAWGOD_VERSION（含 latest），不受此影响。
if (-not $Version) {
    $srcVer = Join-Path $ClawDir ".source-version"
    if (Test-Path $srcVer) {
        $pinned = ((Get-Content $srcVer -Raw -ErrorAction SilentlyContinue) -replace '\s', '')
        # 仅接受形如 X.Y 的版本号，防御残留的非版本内容（如历史 repatch 写下的 basename）
        if ($pinned -match '^\d+\.\d+') { $Version = $pinned }
    }
    if (-not $Version) { $Version = "latest" }
}

$BinDir  = Join-Path $env:USERPROFILE ".local\bin"
$ClawSelfVersion = "0.0.0-dev"  # injected by release workflow from git tag

$EnhancementIds = @(
    'chrome',
    'computer-use',
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
    Write-Host '  ↑/↓ 移动 · 空格 勾选 · 回车 确认 · Esc 返回'
    $script:ClawGodMenuRendered = $EnhancementIds.Count + 3
}

function Write-EnhancementModeMenu {
    if ($script:ClawGodMenuRendered -gt 0) {
        [Console]::SetCursorPosition(0, $script:ClawGodMenuTop)
    } else {
        $script:ClawGodMenuTop = [Console]::CursorTop
    }
    Write-Host ''
    Write-Host '  ClawGod Plus 增强选择'
    Write-Host ('   1) 全部 {0} 项增强（默认，回车即选）' -f $EnhancementIds.Count)
    Write-Host '   2) 仅核心（不装任何增强）'
    Write-Host '   3) 自定义菜单（逐项勾选）'
    Write-Host '  回车 全部增强 · Esc 退出'
    $script:ClawGodMenuRendered = 5
}

function Read-EnhancementChoice {
    $selected = @($EnhancementIds | ForEach-Object { $true })
    $cursor = 0
    $script:ClawGodMenuRendered = 0
    while ($true) {
        Write-EnhancementChoiceMenu -Cursor $cursor -Selected $selected
        $key = Read-EnhancementKey
        if ($key -eq [ConsoleKey]::ArrowUp) { $cursor = ($cursor + $EnhancementIds.Count - 1) % $EnhancementIds.Count }
        elseif ($key -eq [ConsoleKey]::ArrowDown) { $cursor = ($cursor + 1) % $EnhancementIds.Count }
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

const [modulePath, manifestPath, homeDir, explicit] = process.argv.slice(1);
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
    & $BunBin -e $selectionScript $configModule $manifestFile $env:USERPROFILE $Explicit
    if ($LASTEXITCODE -ne 0) { throw "enhancement selection exited $LASTEXITCODE" }
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
                Write-Host '  已取消安装'
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
            Write-Host '  已取消安装'
            exit 130
        }
        Write-EnhancementSelection -Explicit $choice
        return
    }
    Write-EnhancementSelection -Explicit '__CLAWGOD_SAVED__'
}
