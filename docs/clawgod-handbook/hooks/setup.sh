#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# ClawGod Plus Handbook — Hook 一键安装脚本
#
# 用法：
#   bash setup.sh              # 安装 hook 脚本 + 配置 settings.json
#   bash setup.sh --uninstall  # 移除 hook 配置
#
# 前置条件：
#   - Python 3 已安装
#   - Claude Code 已安装
# ═══════════════════════════════════════════════════════════

set -e

HOOKS_SRC="$(cd "$(dirname "$0")" && pwd)"
HOOKS_DST="$HOME/.claude/hooks"
SETTINGS="$HOME/.claude/settings.json"
SETTINGS_LOCAL=""  # 项目级 settings（如果存在）

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
DIM='\033[2m'
NC='\033[0m'
info()  { echo -e "  ${GREEN}✓${NC} $1"; }
warn()  { echo -e "  ${RED}✗${NC} $1"; }
dim()   { echo -e "  ${DIM}$1${NC}"; }

echo ""
echo "  ClawGod Plus Handbook — Hook 安装器"
echo ""

# ─── 卸载 ────────────────────────────────────────────────

if [ "$1" = "--uninstall" ]; then
    # 从 settings.json 移除 hook 配置
    if [ -f "$SETTINGS" ]; then
        python3 -c "
import json, sys
with open('$SETTINGS', 'r') as f:
    s = json.load(f)
changed = False
for evt in ['UserPromptSubmit', 'PreToolUse']:
    if 'hooks' in s and evt in s['hooks']:
        s['hooks'][evt] = [h for h in s['hooks'][evt]
                           if 'scene-router' not in h.get('command','')
                           and 'tool-guard' not in h.get('command','')]
        if not s['hooks'][evt]:
            del s['hooks'][evt]
        changed = True
if 'hooks' in s and not s['hooks']:
    del s['hooks']
if changed:
    with open('$SETTINGS', 'w') as f:
        json.dump(s, f, indent=2, ensure_ascii=False)
    print('cleaned')
else:
    print('no_change')
" 2>/dev/null && info "Hook 配置已从 settings.json 移除" || dim "settings.json 未变更"
    fi

    # 移除 hook 脚本
    for f in scene-router.py tool-guard.py; do
        if [ -f "$HOOKS_DST/$f" ]; then
            rm "$HOOKS_DST/$f"
            info "已移除 $f"
        fi
    done

    echo ""
    info "卸载完成"
    echo ""
    exit 0
fi

# ─── 前置检查 ────────────────────────────────────────────

if ! command -v python3 &>/dev/null; then
    if ! command -v python &>/dev/null; then
        warn "需要 Python 3（未找到 python3 或 python）"
        exit 1
    fi
    PYTHON="python"
else
    PYTHON="python3"
fi

if [ ! -f "$HOOKS_SRC/scene-router.py" ]; then
    warn "找不到 scene-router.py（请从 clawgod-handbook/hooks/ 目录运行此脚本）"
    exit 1
fi

# ─── 安装 Hook 脚本 ─────────────────────────────────────

mkdir -p "$HOOKS_DST"

for f in scene-router.py tool-guard.py; do
    if [ -f "$HOOKS_SRC/$f" ]; then
        cp "$HOOKS_SRC/$f" "$HOOKS_DST/$f"
        chmod +x "$HOOKS_DST/$f"
        info "$f → $HOOKS_DST/"
    else
        dim "$f 不存在，跳过"
    fi
done

# ─── 配置 settings.json ─────────────────────────────────

mkdir -p "$(dirname "$SETTINGS")"

# 用 Python 合并 hook 配置到 settings.json（不破坏已有配置）
$PYTHON -c "
import json, os

settings_path = '$SETTINGS'
hooks_dst = '$HOOKS_DST'

# 读取或创建 settings
if os.path.exists(settings_path):
    with open(settings_path, 'r') as f:
        settings = json.load(f)
else:
    settings = {}

if 'hooks' not in settings:
    settings['hooks'] = {}

# Scene Router hook
scene_cmd = f'python3 {hooks_dst}/scene-router.py'
if 'UserPromptSubmit' not in settings['hooks']:
    settings['hooks']['UserPromptSubmit'] = []

# 检查是否已存在
exists = any('scene-router' in h.get('command', '') for h in settings['hooks']['UserPromptSubmit'])
if not exists:
    settings['hooks']['UserPromptSubmit'].append({
        'command': scene_cmd,
        'timeout': 3000
    })
    print('scene-router added')
else:
    print('scene-router already exists')

# Tool Guard hook
guard_cmd = f'python3 {hooks_dst}/tool-guard.py'
if 'PreToolUse' not in settings['hooks']:
    settings['hooks']['PreToolUse'] = []

exists = any('tool-guard' in h.get('command', '') for h in settings['hooks']['PreToolUse'])
if not exists:
    settings['hooks']['PreToolUse'].append({
        'command': guard_cmd,
        'timeout': 3000
    })
    print('tool-guard added')
else:
    print('tool-guard already exists')

# 写回
with open(settings_path, 'w') as f:
    json.dump(settings, f, indent=2, ensure_ascii=False)
    f.write('\n')
" 2>/dev/null | while read -r line; do
    case "$line" in
        *added*) info "Hook 已注册：${line%%added*}" ;;
        *already*) dim "Hook 已存在：${line%%already*}" ;;
    esac
done

# ─── 安装 Rules 文件（可选）─────────────────────────────

RULES_DIR="$HOME/.claude/rules"
RULES_SRC="$HOOKS_SRC/../01-session-rules"

if [ -f "$RULES_SRC/security-research-context.md" ]; then
    mkdir -p "$RULES_DIR"
    if [ ! -f "$RULES_DIR/security-research-context.md" ]; then
        cp "$RULES_SRC/security-research-context.md" "$RULES_DIR/"
        info "security-research-context.md → ~/.claude/rules/"
    else
        dim "security-research-context.md 已存在，跳过"
    fi
fi

# ─── 创建审计日志目录 ────────────────────────────────────

mkdir -p "$HOME/.claude/audit"

# ─── 完成 ────────────────────────────────────────────────

echo ""
info "安装完成！"
echo ""
dim "  已安装的组件："
dim "    ~/.claude/hooks/scene-router.py  — 场景识别（UserPromptSubmit）"
dim "    ~/.claude/hooks/tool-guard.py    — 工具守卫（PreToolUse）"
dim "    ~/.claude/rules/security-research-context.md — 身份声明"
dim ""
dim "  审计日志：~/.claude/audit/"
dim ""
echo -e "  ${DIM}重启 Claude Code 后生效。${NC}"
echo ""
