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

function Read-EnhancementChoice {
    $selected = @($EnhancementIds | ForEach-Object { $true })
    while ($true) {
        Write-Host ''
        Write-Host '  Enhancements'
        for ($i = 0; $i -lt $EnhancementIds.Count; $i++) {
            $marker = if ($selected[$i]) { 'x' } else { ' ' }
            Write-Host ('  {0,2}) [{1}] {2,-20} {3}' -f ($i + 1), $marker, $EnhancementIds[$i], $EnhancementLabels[$i])
        }
        $answer = Read-Host '  Choice'
        if ([string]::IsNullOrEmpty($answer)) {
            $enabled = @()
            for ($i = 0; $i -lt $EnhancementIds.Count; $i++) {
                if ($selected[$i]) { $enabled += $EnhancementIds[$i] }
            }
            if ($enabled.Count -eq 0) { return 'none' }
            return $enabled -join ','
        }

        $candidate = @($selected)
        $invalid = $false
        foreach ($token in $answer.Split(',')) {
            if ($token -eq 'a') {
                for ($i = 0; $i -lt $candidate.Count; $i++) { $candidate[$i] = $true }
            } elseif ($token -eq 'n') {
                for ($i = 0; $i -lt $candidate.Count; $i++) { $candidate[$i] = $false }
            } else {
                $number = 0
                if ([int]::TryParse($token, [ref]$number)) {
                    $index = $number - 1
                    if ($index -lt 0 -or $index -ge $candidate.Count) { $invalid = $true }
                    else { $candidate[$index] = -not $candidate[$index] }
                } else {
                    $invalid = $true
                }
            }
        }
        if ($invalid) {
            Write-Warn "Invalid enhancement choice: $answer"
            continue
        }
        $selected = $candidate
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
            Write-EnhancementSelection -Explicit (Read-EnhancementChoice)
            return
        }
        Write-Warn 'Interactive enhancement selection unavailable; using saved selection or all enhancements.'
    }
    Write-EnhancementSelection -Explicit '__CLAWGOD_SAVED__'
}
