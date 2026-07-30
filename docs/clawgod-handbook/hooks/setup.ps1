#Requires -Version 5.1
<#
.SYNOPSIS
    ClawGod Plus Handbook Hook 安装器 (Windows)
.DESCRIPTION
    安装 scene-router 和 tool-guard hook 到 ~/.claude/hooks/
    并注册到 settings.json
.EXAMPLE
    .\setup.ps1
    .\setup.ps1 -Uninstall
#>
param(
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$HooksSrc  = Split-Path -Parent $MyInvocation.MyCommand.Path
$HooksDst  = Join-Path $env:USERPROFILE ".claude\hooks"
$Settings  = Join-Path $env:USERPROFILE ".claude\settings.json"
$RulesDir  = Join-Path $env:USERPROFILE ".claude\rules"
$AuditDir  = Join-Path $env:USERPROFILE ".claude\audit"

function Write-OK($msg)   { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Err($msg)  { Write-Host "  ✗ $msg" -ForegroundColor Red }
function Write-Dim($msg)  { Write-Host "  $msg" -ForegroundColor DarkGray }

Write-Host ""
Write-Host "  ClawGod Plus Handbook — Hook 安装器" -ForegroundColor White
Write-Host ""

# ── Uninstall ──────────────────────────────────────────

if ($Uninstall) {
    # 移除 hook 脚本
    foreach ($f in @("scene-router.py", "tool-guard.py")) {
        $p = Join-Path $HooksDst $f
        if (Test-Path $p) { Remove-Item $p -Force; Write-OK "已移除 $f" }
    }
    # 清理 settings.json
    if (Test-Path $Settings) {
        $s = Get-Content $Settings -Raw | ConvertFrom-Json
        $changed = $false
        foreach ($evt in @("UserPromptSubmit", "PreToolUse")) {
            if ($s.hooks.PSObject.Properties.Name -contains $evt) {
                $arr = @($s.hooks.$evt | Where-Object {
                    $_.command -notmatch "scene-router" -and $_.command -notmatch "tool-guard"
                })
                if ($arr.Count -eq 0) {
                    $s.hooks.PSObject.Properties.Remove($evt)
                } else {
                    $s.hooks.$evt = $arr
                }
                $changed = $true
            }
        }
        if ($changed) {
            $s | ConvertTo-Json -Depth 10 | Set-Content $Settings -Encoding UTF8
            Write-OK "Hook 配置已从 settings.json 移除"
        }
    }
    Write-Host ""; Write-OK "卸载完成"; Write-Host ""
    exit 0
}

# ── Install ─────────────────────────────────────────────

# 前置检查
try { $null = Get-Command python -ErrorAction Stop }
catch { Write-Err "需要 Python 3"; exit 1 }

# 复制 hook 脚本
New-Item -ItemType Directory -Force -Path $HooksDst | Out-Null

foreach ($f in @("scene-router.py", "tool-guard.py")) {
    $src = Join-Path $HooksSrc $f
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $HooksDst $f) -Force
        Write-OK "$f → $HooksDst\"
    } else {
        Write-Dim "$f 不存在，跳过"
    }
}

# 配置 settings.json
New-Item -ItemType Directory -Force -Path (Split-Path $Settings) | Out-Null

if (Test-Path $Settings) {
    $s = Get-Content $Settings -Raw | ConvertFrom-Json
} else {
    $s = [PSCustomObject]@{}
}

if (-not ($s.PSObject.Properties.Name -contains "hooks")) {
    $s | Add-Member -NotePropertyName "hooks" -NotePropertyValue ([PSCustomObject]@{}) -Force
}

$sceneCmd = "python `"$HooksDst\scene-router.py`""
$guardCmd = "python `"$HooksDst\tool-guard.py`""

# 添加 Scene Router
if (-not ($s.hooks.PSObject.Properties.Name -contains "UserPromptSubmit")) {
    $s.hooks | Add-Member -NotePropertyName "UserPromptSubmit" -NotePropertyValue @() -Force
}
$existing = @($s.hooks.UserPromptSubmit | Where-Object { $_.command -match "scene-router" })
if ($existing.Count -eq 0) {
    $s.hooks.UserPromptSubmit += @([PSCustomObject]@{command=$sceneCmd; timeout=3000})
    Write-OK "Scene Router hook 已注册"
} else {
    Write-Dim "Scene Router hook 已存在"
}

# 添加 Tool Guard
if (-not ($s.hooks.PSObject.Properties.Name -contains "PreToolUse")) {
    $s.hooks | Add-Member -NotePropertyName "PreToolUse" -NotePropertyValue @() -Force
}
$existing = @($s.hooks.PreToolUse | Where-Object { $_.command -match "tool-guard" })
if ($existing.Count -eq 0) {
    $s.hooks.PreToolUse += @([PSCustomObject]@{command=$guardCmd; timeout=3000})
    Write-OK "Tool Guard hook 已注册"
} else {
    Write-Dim "Tool Guard hook 已存在"
}

$s | ConvertTo-Json -Depth 10 | Set-Content $Settings -Encoding UTF8

# 安装 Rules
$rulesSrc = Join-Path (Split-Path $HooksSrc) "01-session-rules\security-research-context.md"
if (Test-Path $rulesSrc) {
    New-Item -ItemType Directory -Force -Path $RulesDir | Out-Null
    $ruleDst = Join-Path $RulesDir "security-research-context.md"
    if (-not (Test-Path $ruleDst)) {
        Copy-Item $rulesSrc $ruleDst -Force
        Write-OK "security-research-context.md → ~/.claude/rules/"
    } else {
        Write-Dim "security-research-context.md 已存在"
    }
}

# 审计目录
New-Item -ItemType Directory -Force -Path $AuditDir | Out-Null

Write-Host ""
Write-OK "安装完成！"
Write-Host ""
Write-Dim "  已安装的组件："
Write-Dim "    ~/.claude/hooks/scene-router.py  — 场景识别"
Write-Dim "    ~/.claude/hooks/tool-guard.py    — 工具守卫"
Write-Dim "    ~/.claude/rules/security-research-context.md — 身份声明"
Write-Host ""
Write-Dim "  审计日志：~/.claude/audit/"
Write-Host ""
Write-Dim "  重启 Claude Code 后生效。"
Write-Host ""
